import { type AIMessage, ToolMessage } from '@langchain/core/messages';
import { createExecutor, relativeToAbsolute } from '../system/executor.js';
import {
  cropAndEnlarge,
  mapZoomToFullScreen,
  processScreenshot,
} from '../system/image.js';
import { captureScreen, detectScreenInfo } from '../system/screenshot.js';
import type {
  AgentAction,
  AgentCallbacks,
  AppConfig,
  ScreenInfo,
} from '../types.js';
import { ConversationMemory } from './memory.js';
import { allTools } from './tools.js';
import { createVlmModel, getSystemMessage } from './vlm.js';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type ParseResult =
  | { ok: true; action: AgentAction }
  | { ok: false; error: string };

function parseToolCall(aiMsg: AIMessage): ParseResult | null {
  const calls = aiMsg.tool_calls;
  if (!calls || calls.length === 0) return null;

  const call = calls[0];
  const args = call.args as Record<string, unknown>;

  switch (call.name) {
    case 'screenshot':
      return { ok: true, action: { type: 'screenshot' } };
    case 'click': {
      const x = Number(args.x);
      const y = Number(args.y);
      if (
        Number.isNaN(x) ||
        Number.isNaN(y) ||
        x < 0 ||
        x > 1 ||
        y < 0 ||
        y > 1
      ) {
        return {
          ok: false,
          error: `Invalid click parameters: x=${JSON.stringify(args.x)}, y=${JSON.stringify(args.y)}. Both "x" and "y" must be separate numbers between 0 and 1. Correct format: click({ "x": 0.5, "y": 0.3 })`,
        };
      }
      return {
        ok: true,
        action: {
          type: 'click',
          x,
          y,
          button: (args.button as 'left' | 'right' | 'double') || 'left',
        },
      };
    }
    case 'type': {
      const text = args.text;
      if (typeof text !== 'string' || text.length === 0) {
        return {
          ok: false,
          error: `Invalid type parameters: text=${JSON.stringify(text)}. "text" must be a non-empty string. Correct format: type({ "text": "hello" })`,
        };
      }
      return { ok: true, action: { type: 'type', text } };
    }
    case 'scroll': {
      const direction = args.direction as string;
      const validDirs = ['up', 'down', 'left', 'right'];
      if (!validDirs.includes(direction)) {
        return {
          ok: false,
          error: `Invalid scroll parameters: direction=${JSON.stringify(direction)}. "direction" must be one of: ${validDirs.join(', ')}. Correct format: scroll({ "direction": "down" })`,
        };
      }
      return {
        ok: true,
        action: {
          type: 'scroll',
          direction: direction as 'up' | 'down' | 'left' | 'right',
          amount: args.amount as number | undefined,
        },
      };
    }
    case 'ask_question':
      return {
        ok: true,
        action: {
          type: 'ask_question',
          question: args.question as string,
          options: args.options as string[] | undefined,
        },
      };
    case 'done':
      return {
        ok: true,
        action: { type: 'done', summary: (args.summary as string) || '' },
      };
    default:
      return {
        ok: false,
        error: `Unknown tool "${call.name}". Available tools: screenshot, click, type, scroll, ask_question, done.`,
      };
  }
}

function getTextContent(aiMsg: AIMessage): string {
  return typeof aiMsg.content === 'string'
    ? aiMsg.content
    : Array.isArray(aiMsg.content)
      ? aiMsg.content
          .filter(
            (block): block is { type: 'text'; text: string } =>
              typeof block === 'object' &&
              block !== null &&
              'type' in block &&
              block.type === 'text',
          )
          .map((block) => block.text)
          .join('')
      : JSON.stringify(aiMsg.content);
}

function getToolCallId(aiMsg: AIMessage): string {
  return aiMsg.tool_calls?.[0]?.id ?? `call_${Date.now()}`;
}

function getToolCallName(aiMsg: AIMessage): string {
  return aiMsg.tool_calls?.[0]?.name ?? 'unknown';
}

export class Agent {
  private config: AppConfig;
  private memory: ConversationMemory;
  private aborted = false;

  constructor(config: AppConfig) {
    this.config = config;
    this.memory = new ConversationMemory(config.maxHistoryTurns);
  }

  abort(): void {
    this.aborted = true;
  }

  async run(task: string, callbacks: AgentCallbacks): Promise<void> {
    this.aborted = false;
    this.memory.clear();

    const executor = createExecutor();
    callbacks.onDriverType(executor.driverType);

    // Detect screen info once (needed for coordinate mapping)
    let screenInfo: ScreenInfo;
    try {
      screenInfo = await detectScreenInfo(() => executor.getScreenSize());
      callbacks.onScreenInfo(screenInfo);
    } catch (err) {
      callbacks.onError(`Failed to detect screen: ${err}`);
      return;
    }

    const model = createVlmModel(this.config);
    const modelWithTools = model.bindTools!(allTools);

    // Seed the conversation with the user's task
    this.memory.addHumanStep(`Task: ${task}`);

    for (let step = 1; step <= this.config.maxSteps; step++) {
      if (this.aborted) {
        callbacks.onError('Aborted by user');
        return;
      }

      callbacks.onStepUpdate(step);
      callbacks.onStateChange('thinking');

      // Build messages from history and call VLM
      const messages = this.memory.buildMessages(getSystemMessage(false));

      let aiMsg: AIMessage;
      try {
        aiMsg = (await modelWithTools.invoke(messages)) as AIMessage;
      } catch (err) {
        callbacks.onLog({
          step,
          action: 'vlm',
          detail: `VLM error: ${err}`,
          success: false,
        });
        await sleep(this.config.actionDelay);
        // Retry with same messages
        continue;
      }

      const result = parseToolCall(aiMsg);

      if (!result) {
        // Model responded with text (no tool call) — surface it to the user
        const textContent = getTextContent(aiMsg);
        this.memory.addAiMessage(aiMsg, textContent);
        callbacks.onStateChange('responding');
        callbacks.onMessage(textContent);
        callbacks.onLog({
          step,
          action: 'message',
          detail: textContent,
          success: true,
        });

        // Prompt model to continue or finish
        this.memory.addHumanStep(
          'If there is nothing more to do, call "done". Otherwise, continue.',
        );
        continue;
      }

      // Record the AI message (with tool call) in memory
      this.memory.addAiMessage(aiMsg);
      const toolCallId = getToolCallId(aiMsg);
      const toolName = getToolCallName(aiMsg);

      // Handle invalid tool call parameters
      if (!result.ok) {
        callbacks.onLog({
          step,
          action: 'error',
          detail: result.error,
          success: false,
        });
        this.memory.addToolResult(toolCallId, toolName, result.error);
        continue;
      }

      const action = result.action;

      // Handle DONE
      if (action.type === 'done') {
        this.memory.addToolResult(toolCallId, toolName, action.summary);
        callbacks.onLog({
          step,
          action: 'done',
          detail: action.summary,
          success: true,
        });
        callbacks.onStateChange('done');
        callbacks.onComplete(action.summary);
        return;
      }

      // Handle SCREENSHOT
      if (action.type === 'screenshot') {
        callbacks.onStateChange('capturing');
        let screenshotBuf: Buffer;
        try {
          screenshotBuf = await captureScreen();
        } catch (err) {
          callbacks.onLog({
            step,
            action: 'capture',
            detail: `Screenshot failed: ${err}`,
            success: false,
          });
          this.memory.addToolResult(
            toolCallId,
            toolName,
            `Screenshot failed: ${err}. Try again or ask the user for help.`,
          );
          await sleep(this.config.actionDelay);
          continue;
        }

        let processed: Awaited<ReturnType<typeof processScreenshot>>;
        try {
          processed = await processScreenshot(
            screenshotBuf,
            screenInfo,
            this.config,
          );
        } catch (err) {
          callbacks.onLog({
            step,
            action: 'process',
            detail: `Image processing failed: ${err}`,
            success: false,
          });
          this.memory.addToolResult(
            toolCallId,
            toolName,
            `Image processing failed: ${err}. Try again or ask the user for help.`,
          );
          continue;
        }

        callbacks.onLog({
          step,
          action: 'screenshot',
          detail: 'Screen captured',
          success: true,
        });

        // Record screenshot result as a ToolMessage with the image
        this.memory.addToolResult(
          toolCallId,
          toolName,
          'Screenshot captured successfully.',
          processed.base64,
        );
        continue;
      }

      // Handle ASK_QUESTION
      if (action.type === 'ask_question') {
        callbacks.onStateChange('waiting_answer');
        callbacks.onLog({
          step,
          action: 'ask_question',
          detail: action.question,
          success: true,
        });
        const answer = await callbacks.onAskQuestion(
          action.question,
          action.options,
        );
        this.memory.addToolResult(
          toolCallId,
          toolName,
          `User answered: ${answer}`,
        );
        continue;
      }

      // Handle GUI actions: click, type, scroll
      let actionDetail = '';
      let actionImageBase64: string | undefined;

      // Execute click with optional zoom
      if (action.type === 'click' && this.config.zoomEnabled) {
        callbacks.onStateChange('zooming');
        // We need a fresh screenshot for zoom cropping
        let screenshotBuf: Buffer;
        try {
          screenshotBuf = await captureScreen();
        } catch {
          // Fall through to non-zoom click
          const abs = relativeToAbsolute(action.x, action.y, screenInfo);
          callbacks.onStateChange('executing');
          executor.click(abs.x, abs.y, action.button);
          actionDetail = `Click (${action.x.toFixed(3)}, ${action.y.toFixed(3)}) → (${abs.x}, ${abs.y}) [no zoom: capture failed]`;
          callbacks.onLog({
            step,
            action: 'click',
            detail: actionDetail,
            success: true,
          });
          this.memory.addToolResult(toolCallId, toolName, actionDetail);
          await sleep(this.config.actionDelay);
          continue;
        }

        try {
          const zoomResult = await cropAndEnlarge(
            screenshotBuf,
            screenInfo,
            this.config,
            action.x,
            action.y,
          );

          // Keep the zoom image to return as part of the click tool result
          actionImageBase64 = zoomResult.image.base64;

          // Second VLM call on zoomed image to get precise coordinates
          const zoomMessages = this.memory.buildMessages(
            getSystemMessage(true),
          );
          // Append text ToolMessage + HumanMessage with the zoom image
          zoomMessages.push(
            new ToolMessage({
              content:
                'This is a zoomed-in view of the area you clicked. Please provide more precise coordinates for your click within this cropped region.',
              tool_call_id: toolCallId,
              name: toolName,
            }),
          );
          const { HumanMessage } = await import('@langchain/core/messages');
          zoomMessages.push(
            new HumanMessage({
              content: [
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/jpeg;base64,${zoomResult.image.base64}`,
                  },
                },
              ],
            }),
          );

          const zoomAiMsg = (await modelWithTools.invoke(
            zoomMessages,
          )) as AIMessage;
          const zoomResult2 = parseToolCall(zoomAiMsg);
          const zoomAction =
            zoomResult2?.ok && zoomResult2.action.type === 'click'
              ? zoomResult2.action
              : null;

          if (zoomAction) {
            const mapped = mapZoomToFullScreen(
              zoomAction.x,
              zoomAction.y,
              zoomResult.cropBounds,
              screenInfo.logicalWidth,
              screenInfo.logicalHeight,
            );
            const abs = relativeToAbsolute(
              mapped.relX,
              mapped.relY,
              screenInfo,
            );
            callbacks.onStateChange('executing');
            executor.click(abs.x, abs.y, zoomAction.button || action.button);
            actionDetail = `Click (${mapped.relX.toFixed(3)}, ${mapped.relY.toFixed(3)}) → (${abs.x}, ${abs.y}) [zoomed]`;
            callbacks.onLog({
              step,
              action: 'click',
              detail: actionDetail,
              success: true,
              zoom: { x: action.x, y: action.y },
            });
          } else {
            const abs = relativeToAbsolute(action.x, action.y, screenInfo);
            callbacks.onStateChange('executing');
            executor.click(abs.x, abs.y, action.button);
            actionDetail = `Click (${action.x.toFixed(3)}, ${action.y.toFixed(3)}) → (${abs.x}, ${abs.y}) [zoom fallback]`;
            callbacks.onLog({
              step,
              action: 'click',
              detail: actionDetail,
              success: true,
            });
          }
        } catch (err) {
          const abs = relativeToAbsolute(action.x, action.y, screenInfo);
          callbacks.onStateChange('executing');
          executor.click(abs.x, abs.y, action.button);
          actionDetail = `Click (${action.x.toFixed(3)}, ${action.y.toFixed(3)}) → (${abs.x}, ${abs.y}) [zoom error: ${err}]`;
          callbacks.onLog({
            step,
            action: 'click',
            detail: actionDetail,
            success: true,
          });
        }
      } else if (action.type === 'click') {
        const abs = relativeToAbsolute(action.x, action.y, screenInfo);
        callbacks.onStateChange('executing');
        executor.click(abs.x, abs.y, action.button);
        actionDetail = `Click (${action.x.toFixed(3)}, ${action.y.toFixed(3)}) → (${abs.x}, ${abs.y})`;
        callbacks.onLog({
          step,
          action: 'click',
          detail: actionDetail,
          success: true,
        });
      } else if (action.type === 'type') {
        callbacks.onStateChange('executing');
        executor.typeText(action.text);
        actionDetail = `Type: "${action.text.slice(0, 50)}${action.text.length > 50 ? '...' : ''}"`;
        callbacks.onLog({
          step,
          action: 'type',
          detail: actionDetail,
          success: true,
        });
      } else if (action.type === 'scroll') {
        callbacks.onStateChange('executing');
        executor.scroll(action.direction, action.amount);
        actionDetail = `Scroll ${action.direction}${action.amount ? ` (${action.amount})` : ''}`;
        callbacks.onLog({
          step,
          action: 'scroll',
          detail: actionDetail,
          success: true,
        });
      }

      // Record GUI action result as a ToolMessage (with zoom image if available)
      this.memory.addToolResult(
        toolCallId,
        toolName,
        `${actionDetail}. Action executed. Call "screenshot" to verify the result, or continue.`,
        actionImageBase64,
      );
      await sleep(this.config.actionDelay);
    }

    callbacks.onStateChange('done');
    callbacks.onComplete(`Reached max steps (${this.config.maxSteps})`);
  }
}
