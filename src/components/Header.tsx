import { Box, Text } from 'ink';
import type { DriverType, ScreenInfo } from '../types.js';

interface HeaderProps {
  modelName: string;
  screenInfo: ScreenInfo | null;
  driverType: DriverType | null;
}

export function Header({ modelName, screenInfo, driverType }: HeaderProps) {
  return (
    <Box
      borderStyle="single"
      paddingX={1}
      flexDirection="row"
      justifyContent="space-between"
    >
      <Text bold color="cyanBright">
        PxTerm
      </Text>
      <Text>
        Model: <Text color="yellow">{modelName}</Text>
      </Text>
      {screenInfo && (
        <Text>
          Screen: {screenInfo.logicalWidth}×{screenInfo.logicalHeight}{' '}
          <Text dimColor>(@{screenInfo.scaleFactor}x)</Text>
        </Text>
      )}
      {driverType && (
        <Text>
          Driver:{' '}
          <Text color={driverType === 'robotjs' ? 'green' : 'yellow'}>
            {driverType}
          </Text>
        </Text>
      )}
    </Box>
  );
}
