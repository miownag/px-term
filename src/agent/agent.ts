import type { AIMessage } from '@langchain/core/messages';
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

function parseToolCall(aiMsg: AIMessage): AgentAction | null {
  const calls = aiMsg.tool_calls;
  if (!calls || calls.length === 0) return null;

  const call = calls[0];
  const args = call.args as Record<string, unknown>;

  switch (call.name) {
    case 'click':
      return {
        type: 'click',
        x: args.x as number,
        y: args.y as number,
        button: (args.button as 'left' | 'right' | 'double') || 'left',
      };
    case 'type':
      return { type: 'type', text: args.text as string };
    case 'scroll':
      return {
        type: 'scroll',
        direction: args.direction as 'up' | 'down' | 'left' | 'right',
        amount: args.amount as number | undefined,
      };
    case 'ask_question':
      return {
        type: 'ask_question',
        question: args.question as string,
        options: args.options as string[] | undefined,
      };
    case 'done':
      return { type: 'done', summary: args.summary as string };
    default:
      return null;
  }
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

    // Detect screen info
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

    for (let step = 1; step <= this.config.maxSteps; step++) {
      if (this.aborted) {
        callbacks.onError('Aborted by user');
        return;
      }

      callbacks.onStepUpdate(step);

      // STEP_CAPTURE
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
        await sleep(this.config.actionDelay);
        continue;
      }

      let processed: any;
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
        continue;
      }

      // STEP_VLM
      callbacks.onStateChange('thinking');
      const stepText =
        step === 1
          ? `Task: ${task}\n\nThis is the current screenshot. What should I do first?`
          : 'Here is the current screenshot after the last action. What should I do next?';

      const messages = this.memory.buildMessages(
        getSystemMessage(false),
        stepText,
        processed.base64,
      );

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
        continue;
      }

      const action = parseToolCall(aiMsg);
      if (!action) {
        // Model didn't call a tool — log text response and continue
        const textContent =
          typeof aiMsg.content === 'string'
            ? aiMsg.content
            : JSON.stringify(aiMsg.content);
        this.memory.addHumanStep(stepText);
        this.memory.addAiResponse(textContent);
        callbacks.onLog({
          step,
          action: 'vlm',
          detail: `No tool call. Model said: ${textContent.slice(0, 100)}`,
          success: false,
        });
        continue;
      }

      // Record in memory
      this.memory.addHumanStep(stepText);
      this.memory.addAiResponse(
        `Used tool: ${action.type} ${JSON.stringify(action)}`,
      );

      // Handle DONE
      if (action.type === 'done') {
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
        this.memory.addHumanStep(`User answered: ${answer}`);
        continue;
      }

      // Handle CLICK with optional zoom
      if (action.type === 'click' && this.config.zoomEnabled) {
        callbacks.onStateChange('zooming');
        try {
          const zoomResult = await cropAndEnlarge(
            screenshotBuf,
            screenInfo,
            this.config,
            action.x,
            action.y,
          );

          // Second VLM call on zoomed image
          const zoomMessages = this.memory.buildMessages(
            getSystemMessage(true),
            'This is a zoomed-in view of the area you clicked. Please provide more precise coordinates for your click within this cropped region.',
            zoomResult.image.base64,
          );

          const zoomAiMsg = (await modelWithTools.invoke(
            zoomMessages,
          )) as AIMessage;
          const zoomAction = parseToolCall(zoomAiMsg);

          if (zoomAction?.type === 'click') {
            // Map zoom coordinates back to full screen
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
            callbacks.onLog({
              step,
              action: 'click',
              detail: `Click (${mapped.relX.toFixed(3)}, ${mapped.relY.toFixed(3)}) → (${abs.x}, ${abs.y}) [zoomed]`,
              success: true,
              zoom: { x: action.x, y: action.y },
            });
          } else {
            // Fallback: use original coordinates
            const abs = relativeToAbsolute(action.x, action.y, screenInfo);
            callbacks.onStateChange('executing');
            executor.click(abs.x, abs.y, action.button);
            callbacks.onLog({
              step,
              action: 'click',
              detail: `Click (${action.x.toFixed(3)}, ${action.y.toFixed(3)}) → (${abs.x}, ${abs.y}) [zoom fallback]`,
              success: true,
            });
          }
        } catch (err) {
          // Zoom failed, use original coordinates
          const abs = relativeToAbsolute(action.x, action.y, screenInfo);
          callbacks.onStateChange('executing');
          executor.click(abs.x, abs.y, action.button);
          callbacks.onLog({
            step,
            action: 'click',
            detail: `Click (${action.x.toFixed(3)}, ${action.y.toFixed(3)}) → (${abs.x}, ${abs.y}) [zoom error: ${err}]`,
            success: true,
          });
        }
      } else if (action.type === 'click') {
        // No zoom
        const abs = relativeToAbsolute(action.x, action.y, screenInfo);
        callbacks.onStateChange('executing');
        executor.click(abs.x, abs.y, action.button);
        callbacks.onLog({
          step,
          action: 'click',
          detail: `Click (${action.x.toFixed(3)}, ${action.y.toFixed(3)}) → (${abs.x}, ${abs.y})`,
          success: true,
        });
      } else if (action.type === 'type') {
        callbacks.onStateChange('executing');
        executor.typeText(action.text);
        callbacks.onLog({
          step,
          action: 'type',
          detail: `Type: "${action.text.slice(0, 50)}${action.text.length > 50 ? '...' : ''}"`,
          success: true,
        });
      } else if (action.type === 'scroll') {
        callbacks.onStateChange('executing');
        executor.scroll(action.direction, action.amount);
        callbacks.onLog({
          step,
          action: 'scroll',
          detail: `Scroll ${action.direction}${action.amount ? ` (${action.amount})` : ''}`,
          success: true,
        });
      }

      await sleep(this.config.actionDelay);
    }

    callbacks.onStateChange('done');
    callbacks.onComplete(`Reached max steps (${this.config.maxSteps})`);
  }
}
