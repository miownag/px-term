# PxTerm

A VLM-powered GUI Desktop Agent that runs in the terminal. Type natural language instructions and watch it operate your macOS desktop autonomously — screenshot, reason, execute, verify, repeat.

## How It Works

```
User input → Screenshot → VLM reasoning → Keyboard/Mouse execution → Screenshot verification → Repeat
```

Each step the agent captures your screen, sends it to a vision-language model (GPT-4o, Claude, etc.), receives a tool call (click, type, scroll, etc.), executes it, and loops until the task is done.

## Requirements

- macOS only
- [Bun](https://bun.sh) runtime
- An API key for OpenAI or Anthropic

## Setup

```bash
bun install
```

Copy `.env.example` to `.env` and fill in your API key:

```bash
cp .env.example .env
```

## Usage

```bash
# Build
bun run build

# Run
bun run start
```

Then type a task like "Open Safari and search for the weather" and the agent takes over.

## Configuration

All settings are in `.env`:

| Variable | Description | Default |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI API key | — |
| `OPENAI_BASE_URL` | OpenAI-compatible endpoint | `https://api.openai.com/v1` |
| `OPENAI_MODEL` | OpenAI model name | `gpt-4o` |
| `ANTHROPIC_API_KEY` | Anthropic API key | — |
| `ANTHROPIC_MODEL` | Anthropic model name | `claude-sonnet-4-20250514` |
| `MAX_STEPS` | Max agent loop iterations | `20` |
| `ACTION_DELAY` | Delay (ms) between actions | `1000` |
| `MAX_IMAGE_DIMENSION` | Longest edge cap for screenshots | `1280` |
| `ZOOM_ENABLED` | Enable ZoomClick for precision | `true` |
| `ZOOM_PADDING` | Pixel padding for zoom crop | `150` |
| `MAX_HISTORY_TURNS` | Conversation turns kept in memory | `10` |

Set either OpenAI or Anthropic credentials — the agent picks whichever is configured.

## Architecture

```
src/
├── system/          # OS-level capabilities
│   ├── screenshot.ts   # Screen capture & display info
│   ├── image.ts        # Resize, grid overlay, JPEG compress, ZoomClick crop
│   └── executor.ts     # Keyboard/mouse via robotjs or cliclick
├── agent/           # VLM interaction & control loop
│   ├── vlm.ts          # Model factory (OpenAI / Anthropic)
│   ├── tools.ts        # LangChain tools: click, type, scroll, ask_question, done
│   ├── prompts.ts      # System prompt with coordinate system & rules
│   ├── memory.ts       # Screenshot storage & conversation history
│   └── agent.ts        # Main agent loop
├── components/      # Terminal UI (Ink + React)
│   ├── App.tsx         # Root state machine
│   ├── Header.tsx      # Model & screen info
│   ├── TaskPanel.tsx   # Task display & step counter
│   ├── LogPanel.tsx    # Scrolling action log
│   ├── InputBar.tsx    # Text input
│   └── QuestionPanel.tsx  # Agent ↔ user Q&A
├── config.ts        # Loads .env into typed config
├── types.ts         # Shared type definitions
└── index.tsx        # Entry point
```

## Development

```bash
# Watch mode
bun run dev

# Lint & fix
bun run check

# Format
bun run format
```

## License

MIT
