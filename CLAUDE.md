# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PxTerm — a VLM-powered GUI Desktop Agent that runs in the terminal. Users type natural language instructions, and the system loops: screenshot → VLM reasoning → keyboard/mouse execution → screenshot verification → repeat until done. macOS only.

## Commands

- `bun install` — install dependencies (use bun, never npm)
- `bun run build` — build with rslib (output: `dist/`)
- `bun run start` — run the CLI (`node dist/index.js`)
- `bun run dev` — build in watch mode
- `bun run check` — biome lint + fix
- `bun run format` — biome format

## Rules

- Use **bun**, not npm
- Do not use Web Search tools; use deepwiki MCP or ask the user
- Biome enforces single quotes in JS/TS and space indentation; run `bun run check` after changes

## Architecture

Three layers, each in its own `src/` subdirectory:

### `system/` — OS-level capabilities (macOS)
- **screenshot.ts**: Screen capture via `screenshot-desktop`, screen info detection (captured/logical size, scale factor via sharp metadata + robotjs/cliclick)
- **image.ts**: Image processing pipeline — resize to logical resolution, cap at `maxImageDimension`, overlay red grid (10×8) as SVG composite, JPEG compress. Also handles ZoomClick: crop around a coordinate, enlarge, and map zoom-relative coords back to full screen
- **executor.ts**: Keyboard/mouse driver — tries `robotjs` first, falls back to `cliclick` CLI. Chinese/non-ASCII text always goes through `pbcopy` + Cmd+V

### `agent/` — VLM interaction and control loop
- **vlm.ts**: Factory that creates `ChatOpenAI` or `ChatAnthropic` based on config (env vars). Both bound with tools via `bindTools()`
- **tools.ts**: 5 langchain tools (click, type, scroll, ask_question, done) defined with zod schemas. Tools return JSON descriptions only — execution happens in `agent.ts`
- **prompts.ts**: System prompt defining the 0-1 coordinate system, grid reference, and single-tool-per-turn rule
- **memory.ts**: `ConversationMemory` — stores screenshots to disk (`tmpdir/px-term-memory/`), keeps text-only history in messages, auto-trims old turns into summaries
- **agent.ts**: Main `Agent` class with `run(task, callbacks)` loop. Each step: capture → process → VLM call → parse tool_call → optional ZoomClick (second VLM call on cropped region) → execute via executor → sleep. Errors don't terminate the loop. Communicates state to UI via `AgentCallbacks`

### `components/` — Terminal UI (Ink 6 + React 19)
- **App.tsx**: Root component — manages agent state machine, holds Agent instance in ref, resolves agent questions via Promise + ref pattern
- **Header.tsx**: Model name, screen dimensions, driver type
- **TaskPanel.tsx**: Current task text, step counter, state spinner
- **LogPanel.tsx**: Scrolling action log with success/error indicators
- **InputBar.tsx**: Text input (disabled while agent runs)
- **QuestionPanel.tsx**: Agent can ask user questions — renders select-input for options, text-input for free-form

### Key data flow
User input → `App.handleSubmit` → `Agent.run(task, callbacks)` → step loop calls callbacks → React state updates → UI re-renders. The `ask_question` tool pauses the agent loop via a Promise that resolves when the user answers in `QuestionPanel`.

## Configuration

Loaded from `.env` via dotenv (see `.env.example`). Supports both OpenAI and Anthropic providers. Key env vars: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `MAX_STEPS`, `ACTION_DELAY`, `ZOOM_ENABLED`, `ZOOM_PADDING`.

## Build Setup

rslib bundles `src/index.tsx` → `dist/index.js` (ESM, node 18 target). All heavy dependencies are externalized (sharp, robotjs, screenshot-desktop, ink, react, langchain, etc.) — they're resolved at runtime from `node_modules`. The `@rsbuild/plugin-react` handles JSX transformation.
