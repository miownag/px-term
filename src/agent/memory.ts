import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BaseMessage, ContentBlock } from '@langchain/core/messages';
import {
  AIMessage,
  HumanMessage,
  type SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';

const MEMORY_DIR = join(tmpdir(), 'px-term-memory');

interface HumanEntry {
  role: 'human';
  text: string;
}

interface AiEntry {
  role: 'ai';
  message: AIMessage;
  /** reasoning_content extracted from the raw OpenAI-format response. */
  reasoningContent?: string;
  /** Plain-text fallback used when trimming old history into a summary. */
  summary: string;
}

interface ToolEntry {
  role: 'tool';
  toolCallId: string;
  toolName: string;
  content: string;
  /** Base64 image included only in the current (latest) ToolMessage. */
  imageBase64?: string;
}

type HistoryEntry = HumanEntry | AiEntry | ToolEntry;

export class ConversationMemory {
  private history: HistoryEntry[] = [];
  private maxTurns: number;

  constructor(maxTurns = 10) {
    this.maxTurns = maxTurns;
    if (!existsSync(MEMORY_DIR)) {
      mkdirSync(MEMORY_DIR, { recursive: true });
    }
  }

  addHumanStep(text: string): void {
    this.history.push({ role: 'human', text });
    this.trimHistory();
  }

  /**
   * Store the raw AIMessage so that reasoning_content / thinking blocks
   * are preserved and sent back to the LLM in subsequent turns.
   *
   * For OpenAI Chat Completions format (DeepSeek, QwQ, etc.),
   * reasoning_content is extracted from the raw response and injected
   * back into the message content when building history, because
   * LangChain does not handle this field.
   */
  addAiMessage(msg: AIMessage, summary?: string): void {
    const reasoningContent = extractReasoningContent(msg);
    this.history.push({
      role: 'ai',
      message: msg,
      reasoningContent,
      summary: summary ?? extractTextSummary(msg, reasoningContent),
    });
  }

  /**
   * Record a tool result as a ToolMessage.
   * For screenshot results, pass imageBase64 — it will be included only in the
   * latest message sent to the model and replaced with a placeholder in history.
   */
  addToolResult(
    toolCallId: string,
    toolName: string,
    content: string,
    imageBase64?: string,
  ): void {
    this.history.push({
      role: 'tool',
      toolCallId,
      toolName,
      content,
      imageBase64,
    });
    this.trimHistory();
  }

  buildMessages(systemMsg: SystemMessage): BaseMessage[] {
    const messages: BaseMessage[] = [systemMsg];

    for (let i = 0; i < this.history.length; i++) {
      const entry = this.history[i];
      if (entry.role === 'human') {
        messages.push(new HumanMessage(entry.text));
      } else if (entry.role === 'ai') {
        messages.push(
          buildAiMessageWithReasoning(entry.message, entry.reasoningContent),
        );
      } else if (entry.role === 'tool') {
        const isLast = i === this.history.length - 1;
        // ToolMessage content is always plain text (most APIs don't support multimodal ToolMessage)
        const text =
          !isLast && entry.imageBase64
            ? '[screenshot captured]'
            : entry.content;
        messages.push(
          new ToolMessage({
            content: text,
            tool_call_id: entry.toolCallId,
            name: entry.toolName,
          }),
        );
        // For the latest tool result with an image, append a HumanMessage carrying the image
        if (isLast && entry.imageBase64) {
          messages.push(
            new HumanMessage({
              content: [
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/png;base64,${entry.imageBase64}`,
                  },
                },
              ],
            }),
          );
        }
      }
    }

    return messages;
  }

  private trimHistory(): void {
    const maxEntries = this.maxTurns * 2;
    if (this.history.length > maxEntries) {
      const removed = this.history.splice(0, this.history.length - maxEntries);
      const summary = removed
        .map((e) => {
          if (e.role === 'human') return `[human] ${e.text}`;
          if (e.role === 'tool') return `[tool:${e.toolName}] ${e.content}`;
          return `[ai] ${e.summary}`;
        })
        .join('\n');
      this.history.unshift({
        role: 'human',
        text: `[Previous conversation summary]\n${summary}`,
      });
    }
  }

  clear(): void {
    this.history = [];
    if (existsSync(MEMORY_DIR)) {
      rmSync(MEMORY_DIR, { recursive: true, force: true });
      mkdirSync(MEMORY_DIR, { recursive: true });
    }
  }
}

/**
 * Extract reasoning_content from the raw OpenAI Chat Completions response.
 * Providers like DeepSeek return it as a top-level field on the assistant
 * message, but LangChain ignores it during parsing.
 */
function extractReasoningContent(msg: AIMessage): string | undefined {
  // Path: additional_kwargs.__raw_response.choices[0].message.reasoning_content
  const raw = msg.additional_kwargs?.__raw_response as
    | Record<string, unknown>
    | undefined;
  if (!raw) return undefined;

  const choices = raw.choices as Array<Record<string, unknown>> | undefined;
  if (!choices?.[0]) return undefined;

  const message = choices[0].message as Record<string, unknown> | undefined;
  if (!message) return undefined;

  const rc = message.reasoning_content;
  return typeof rc === 'string' && rc.length > 0 ? rc : undefined;
}

/**
 * Build an AIMessage that includes reasoning_content in the content field
 * so LangChain will serialize it back to the provider.
 *
 * For OpenAI Chat Completions format, LangChain only sends `content` and
 * `tool_calls` back — it has no awareness of `reasoning_content`. We embed
 * the reasoning as a text block prefixed with <reasoning> tags so the model
 * can see its prior chain of thought.
 */
function buildAiMessageWithReasoning(
  original: AIMessage,
  reasoningContent: string | undefined,
): AIMessage {
  if (!reasoningContent) return original;

  // Build content that prepends reasoning to the original content
  const reasoningPrefix = `<reasoning>\n${reasoningContent}\n</reasoning>\n\n`;

  let newContent: string | ContentBlock[];

  if (typeof original.content === 'string') {
    newContent = reasoningPrefix + original.content;
  } else if (Array.isArray(original.content)) {
    // Prepend a text block with reasoning before original content blocks
    newContent = [
      { type: 'text', text: reasoningPrefix },
      ...original.content,
    ];
  } else {
    newContent = reasoningPrefix + JSON.stringify(original.content);
  }

  return new AIMessage({
    content: newContent,
    tool_calls: original.tool_calls,
    invalid_tool_calls: original.invalid_tool_calls,
    additional_kwargs: {
      ...original.additional_kwargs,
      // Drop __raw_response to avoid bloating memory
      __raw_response: undefined,
    },
    response_metadata: original.response_metadata,
    id: original.id,
  });
}

/** Extract a short text summary from an AIMessage for use in trimmed history. */
function extractTextSummary(msg: AIMessage, reasoningContent?: string): string {
  const parts: string[] = [];

  if (reasoningContent) {
    parts.push(`[reasoning] ${reasoningContent.slice(0, 200)}`);
  }

  if (typeof msg.content === 'string') {
    if (msg.content) parts.push(msg.content);
  } else if (Array.isArray(msg.content)) {
    for (const block of msg.content) {
      if (typeof block === 'object' && block !== null && 'type' in block) {
        if (block.type === 'text' && 'text' in block) {
          parts.push(block.text as string);
        } else if (block.type === 'reasoning' && 'reasoning' in block) {
          parts.push(
            `[reasoning] ${(block.reasoning as string).slice(0, 200)}`,
          );
        } else if (block.type === 'thinking' && 'thinking' in block) {
          parts.push(`[thinking] ${(block.thinking as string).slice(0, 200)}`);
        }
      }
    }
  }

  if (msg.tool_calls && msg.tool_calls.length > 0) {
    for (const tc of msg.tool_calls) {
      parts.push(`[tool: ${tc.name}] ${JSON.stringify(tc.args)}`);
    }
  }

  return parts.join(' | ') || '(empty)';
}
