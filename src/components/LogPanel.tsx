import { Box, Text } from "ink";
import type { LogEntry } from "../types.js";

interface LogPanelProps {
  logs: LogEntry[];
  maxVisible?: number;
}

export function LogPanel({ logs, maxVisible = 8 }: LogPanelProps) {
  if (logs.length === 0) return null;

  const visible = logs.slice(-maxVisible);

  return (
    <Box flexDirection="column" paddingX={1} marginTop={1}>
      <Text bold dimColor>
        ─── Logs ───
      </Text>
      {visible.map((log, i) => (
        <Box key={`${log.step}-${i}`}>
          <Text color={log.success ? "green" : "red"}>
            {log.success ? "✓" : "✗"}
          </Text>
          <Text dimColor> [{log.step.toString().padStart(2)}] </Text>
          <Text color="cyan">{log.action.padEnd(10)} </Text>
          <Text>{log.detail}</Text>
          {log.zoom && (
            <Text dimColor>
              {" "}
              (zoom: {log.zoom.x.toFixed(2)},{log.zoom.y.toFixed(2)})
            </Text>
          )}
        </Box>
      ))}
    </Box>
  );
}
