import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { AgentState } from '../types.js';

interface TaskPanelProps {
  task: string | null;
  step: number;
  maxSteps: number;
  state: AgentState;
}

const STATE_LABELS: Record<AgentState, { text: string; color: string }> = {
  idle: { text: 'Idle', color: 'gray' },
  capturing: { text: 'Capturing', color: 'blue' },
  thinking: { text: 'Thinking', color: 'magenta' },
  responding: { text: 'Responding', color: 'white' },
  zooming: { text: 'Zooming', color: 'cyan' },
  executing: { text: 'Executing', color: 'yellow' },
  waiting_answer: { text: 'Waiting', color: 'white' },
  done: { text: 'Done', color: 'green' },
  error: { text: 'Error', color: 'red' },
};

export function TaskPanel({ task, step, maxSteps, state }: TaskPanelProps) {
  if (!task) return null;

  const label = STATE_LABELS[state];
  const isActive = state !== 'idle' && state !== 'done' && state !== 'error';

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box>
        <Text bold>Task: </Text>
        <Text>{task}</Text>
      </Box>
      <Box gap={2}>
        <Text>
          Step: <Text color="cyan">{step}</Text>
          <Text dimColor>/{maxSteps}</Text>
        </Text>
        <Box>
          {isActive && (
            <Text color="cyan">
              <Spinner type="dots" />{' '}
            </Text>
          )}
          <Text color={label.color}>[{label.text}]</Text>
        </Box>
      </Box>
    </Box>
  );
}
