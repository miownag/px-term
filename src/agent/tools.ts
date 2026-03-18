import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export const clickTool = tool(
  (input) => JSON.stringify({ type: 'click', ...input }),
  {
    name: 'click',
    description:
      'Click at a position on the screen. Coordinates are relative (0-1). (0,0) is top-left, (1,1) is bottom-right.',
    schema: z.object({
      x: z.number().min(0).max(1).describe('Relative X coordinate (0-1)'),
      y: z.number().min(0).max(1).describe('Relative Y coordinate (0-1)'),
      button: z
        .enum(['left', 'right', 'double'])
        .optional()
        .describe('Mouse button to click (default: left)'),
    }),
  },
);

export const typeTool = tool(
  (input) => JSON.stringify({ type: 'type', ...input }),
  {
    name: 'type',
    description:
      'Type text using the keyboard. Make sure the target input field is focused first.',
    schema: z.object({
      text: z.string().describe('The text to type'),
    }),
  },
);

export const scrollTool = tool(
  (input) => JSON.stringify({ type: 'scroll', ...input }),
  {
    name: 'scroll',
    description: 'Scroll the screen in a direction.',
    schema: z.object({
      direction: z
        .enum(['up', 'down', 'left', 'right'])
        .describe('Direction to scroll'),
      amount: z.number().optional().describe('Scroll amount (default: 3)'),
    }),
  },
);

export const askQuestionTool = tool(
  (input) => JSON.stringify({ type: 'ask_question', ...input }),
  {
    name: 'ask_question',
    description:
      'Ask the user a question when you need clarification or cannot determine the next step.',
    schema: z.object({
      question: z.string().describe('The question to ask the user'),
      options: z
        .array(z.string())
        .optional()
        .describe('Optional list of choices for the user'),
    }),
  },
);

export const doneTool = tool(
  (input) => JSON.stringify({ type: 'done', ...input }),
  {
    name: 'done',
    description: 'Signal that the task is complete.',
    schema: z.object({
      summary: z.string().describe('A brief summary of what was accomplished'),
    }),
  },
);

export const screenshotTool = tool(
  (_input) => JSON.stringify({ type: 'screenshot' }),
  {
    name: 'screenshot',
    description:
      'Capture the current screen. Call this when you need to see what is on the screen before acting.',
    schema: z.object({}),
  },
);

export const zoominCaptureTool = tool(
  (input) => JSON.stringify({ type: 'zoomin_capture', ...input }),
  {
    name: 'zoomin_capture',
    description:
      'Capture a zoomed-in view of a specific area on the screen. Use this when you need to see fine details (small text, icons, buttons) before acting. The result is an enlarged crop for observation only — all click/type/scroll coordinates still use the full-screen coordinate system.',
    schema: z.object({
      x: z
        .number()
        .min(0)
        .max(1)
        .describe('Relative X coordinate (0-1) of the zoom center'),
      y: z
        .number()
        .min(0)
        .max(1)
        .describe('Relative Y coordinate (0-1) of the zoom center'),
      padding: z
        .number()
        .optional()
        .describe(
          'Crop padding in logical pixels around the center (default: from config)',
        ),
    }),
  },
);

export const allTools = [
  screenshotTool,
  zoominCaptureTool,
  clickTool,
  typeTool,
  scrollTool,
  askQuestionTool,
  doneTool,
];
