import { ChatAnthropic } from '@langchain/anthropic';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import type { AppConfig } from '../types.js';
import { SYSTEM_PROMPT, ZOOM_PROMPT_SUFFIX } from './prompts.js';

export function createVlmModel(config: AppConfig): ChatOpenAI | ChatAnthropic {
  // Determine provider: if anthropic key is set or model starts with "claude", use Anthropic
  if (config.anthropicApiKey || config.anthropicModel?.startsWith('claude')) {
    return new ChatAnthropic({
      anthropicApiKey: config.anthropicApiKey,
      model: config.anthropicModel || 'claude-sonnet-4-20250514',
      maxTokens: 1024,
    });
  }

  // Otherwise use OpenAI (also covers OpenAI-compatible third-party APIs)
  return new ChatOpenAI({
    openAIApiKey: config.openaiApiKey,
    model: config.openaiModel || 'gpt-4o',
    maxTokens: 1024,
    configuration: config.openaiBaseUrl
      ? { baseURL: config.openaiBaseUrl }
      : undefined,
  });
}

export function buildImageMessage(
  text: string,
  imageBase64: string,
): HumanMessage {
  return new HumanMessage({
    content: [
      {
        type: 'text',
        text,
      },
      {
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${imageBase64}`,
        },
      },
    ],
  });
}

export function getSystemMessage(isZoom = false): SystemMessage {
  const content = isZoom ? SYSTEM_PROMPT + ZOOM_PROMPT_SUFFIX : SYSTEM_PROMPT;
  return new SystemMessage(content);
}
