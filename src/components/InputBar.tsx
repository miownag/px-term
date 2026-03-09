import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { useState } from 'react';

interface InputBarProps {
  onSubmit: (value: string) => void;
  disabled: boolean;
}

export function InputBar({ onSubmit, disabled }: InputBarProps) {
  const [value, setValue] = useState('');

  const handleSubmit = (text: string) => {
    if (!text.trim()) return;
    onSubmit(text.trim());
    setValue('');
  };

  return (
    <Box paddingX={1} marginTop={1}>
      {disabled ? (
        <Text dimColor>{'>'} (running...)</Text>
      ) : (
        <Box>
          <Text color="green">{'>'} </Text>
          <TextInput
            value={value}
            onChange={setValue}
            onSubmit={handleSubmit}
            placeholder="Enter task..."
          />
        </Box>
      )}
    </Box>
  );
}
