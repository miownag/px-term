import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import { useState } from 'react';

interface QuestionPanelProps {
  question: string;
  options?: string[];
  onAnswer: (answer: string) => void;
}

export function QuestionPanel({
  question,
  options,
  onAnswer,
}: QuestionPanelProps) {
  const [textValue, setTextValue] = useState('');

  if (options && options.length > 0) {
    const items = options.map((opt) => ({ label: opt, value: opt }));
    return (
      <Box flexDirection="column" paddingX={1} marginTop={1}>
        <Text bold color="yellow">
          ? {question}
        </Text>
        <SelectInput items={items} onSelect={(item) => onAnswer(item.value)} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} marginTop={1}>
      <Text bold color="yellow">
        ? {question}
      </Text>
      <Box>
        <Text color="green">{'>'} </Text>
        <TextInput
          value={textValue}
          onChange={setTextValue}
          onSubmit={(text) => {
            if (text.trim()) onAnswer(text.trim());
          }}
          placeholder="Type your answer..."
        />
      </Box>
    </Box>
  );
}
