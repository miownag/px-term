import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BaseMessage } from '@langchain/core/messages';
import {
  AIMessage,
  HumanMessage,
  type SystemMessage,
} from '@langchain/core/messages';

const MEMORY_DIR = join(tmpdir(), 'px-term-memory');

interface HistoryEntry {
  role: 'human' | 'ai';
  text: string;
  imagePath?: string;
}

export class ConversationMemory {
  private history: HistoryEntry[] = [];
  private maxTurns: number;

  constructor(maxTurns = 10) {
    this.maxTurns = maxTurns;
    if (!existsSync(MEMORY_DIR)) {
      mkdirSync(MEMORY_DIR, { recursive: true });
    }
  }

  addHumanStep(text: string, imageBuffer?: Buffer): void {
    let imagePath: string | undefined;
    if (imageBuffer) {
      imagePath = join(MEMORY_DIR, `step-${Date.now()}.jpg`);
      writeFileSync(imagePath, imageBuffer);
    }
    this.history.push({ role: 'human', text, imagePath });
    this.trimHistory();
  }

  addAiResponse(text: string): void {
    this.history.push({ role: 'ai', text });
  }

  buildMessages(
    systemMsg: SystemMessage,
    stepText: string,
    currentImageBase64: string,
  ): BaseMessage[] {
    const messages: BaseMessage[] = [systemMsg];

    // Add older history as text-only summaries
    for (const entry of this.history) {
      if (entry.role === 'human') {
        messages.push(new HumanMessage(entry.text));
      } else {
        messages.push(new AIMessage(entry.text));
      }
    }

    // Current step with image
    messages.push(
      new HumanMessage({
        content: [
          { type: 'text', text: stepText },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${currentImageBase64}`,
            },
          },
        ],
      }),
    );

    return messages;
  }

  private trimHistory(): void {
    // Keep only the last maxTurns * 2 entries (human + ai pairs)
    const maxEntries = this.maxTurns * 2;
    if (this.history.length > maxEntries) {
      // Summarize old entries
      const removed = this.history.splice(0, this.history.length - maxEntries);
      const summary = removed.map((e) => `[${e.role}] ${e.text}`).join('\n');
      this.history.unshift({
        role: 'human',
        text: `[Previous conversation summary]\n${summary}`,
      });
    }
  }

  clear(): void {
    this.history = [];
    // Clean up temp files
    if (existsSync(MEMORY_DIR)) {
      rmSync(MEMORY_DIR, { recursive: true, force: true });
      mkdirSync(MEMORY_DIR, { recursive: true });
    }
  }
}
