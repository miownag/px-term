import { config } from 'dotenv';
import type { AppConfig } from './types.js';

export function loadConfig(): AppConfig {
  config();

  return {
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiBaseUrl: process.env.OPENAI_BASE_URL,
    openaiModel: process.env.OPENAI_MODEL,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    anthropicModel: process.env.ANTHROPIC_MODEL,
    maxSteps: parseInt(process.env.MAX_STEPS || '20', 10),
    actionDelay: parseInt(process.env.ACTION_DELAY || '1000', 10),
    maxImageDimension: parseInt(process.env.MAX_IMAGE_DIMENSION || '1280', 10),
    zoomEnabled: process.env.ZOOM_ENABLED !== 'false',
    zoomPadding: parseInt(process.env.ZOOM_PADDING || '150', 10),
    maxHistoryTurns: parseInt(process.env.MAX_HISTORY_TURNS || '10', 10),
    maxTokens: parseInt(process.env.MAX_TOKENS || '4096', 10),
  };
}
