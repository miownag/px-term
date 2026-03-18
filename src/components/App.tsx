import { Box, useApp, useInput } from 'ink';
import { useCallback, useRef, useState } from 'react';
import { Agent } from '../agent/agent.js';
import useFullHeight from '../hooks/use-full-height.js';
import useResponsiveWidth from '../hooks/use-width.js';
import type {
  AgentState,
  AppConfig,
  DriverType,
  LogEntry,
  ScreenInfo,
} from '../types.js';
import { Header } from './Header.js';
import { InputBar } from './InputBar.js';
import { LogPanel } from './LogPanel.js';
import { QuestionPanel } from './QuestionPanel.js';
import { TaskPanel } from './TaskPanel.js';

interface AppProps {
  config: AppConfig;
}

export function App({ config }: AppProps) {
  const { exit } = useApp();

  const responsiveWidth = useResponsiveWidth();
  const rows = useFullHeight();

  const [agentState, setAgentState] = useState<AgentState>('idle');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [currentTask, setCurrentTask] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [screenInfo, setScreenInfo] = useState<ScreenInfo | null>(null);
  const [driverType, setDriverType] = useState<DriverType | null>(null);
  const [question, setQuestion] = useState<{
    text: string;
    options?: string[];
  } | null>(null);

  const agentRef = useRef<Agent | null>(null);
  const questionResolverRef = useRef<((answer: string) => void) | null>(null);

  const modelName = config.anthropicModel || config.openaiModel || 'unknown';

  const handleSubmit = useCallback(
    async (input: string) => {
      if (
        agentState !== 'idle' &&
        agentState !== 'done' &&
        agentState !== 'error'
      ) {
        return;
      }

      setCurrentTask(input);
      setLogs([]);
      setCurrentStep(0);
      setAgentState('thinking');

      const agent = new Agent(config);
      agentRef.current = agent;

      try {
        await agent.run(input, {
          onStateChange: setAgentState,
          onLog: (entry) => setLogs((prev) => [...prev, entry]),
          onStepUpdate: setCurrentStep,
          onScreenInfo: setScreenInfo,
          onDriverType: setDriverType,
          onAskQuestion: (q, opts) => {
            return new Promise<string>((resolve) => {
              questionResolverRef.current = resolve;
              setQuestion({ text: q, options: opts });
            });
          },
          onMessage: (_text) => {
            // Message is displayed via onLog with action='message'
          },
          onComplete: (_summary) => {
            setAgentState('done');
          },
          onError: (err) => {
            setAgentState('error');
            setLogs((prev) => [
              ...prev,
              {
                step: 0,
                action: 'error',
                detail: err,
                success: false,
              },
            ]);
          },
        });
      } catch (err) {
        // Don't override state if agent was aborted via Ctrl+C
        if (agentRef.current) {
          setAgentState('error');
          setLogs((prev) => [
            ...prev,
            {
              step: 0,
              action: 'error',
              detail: String(err),
              success: false,
            },
          ]);
        }
      }
    },
    [agentState, config],
  );

  const handleAnswer = useCallback((answer: string) => {
    if (questionResolverRef.current) {
      questionResolverRef.current(answer);
      questionResolverRef.current = null;
      setQuestion(null);
    }
  }, []);

  // Ctrl+C: if running, abort agent and reset UI; otherwise exit process
  useInput((_input, key) => {
    if (key.ctrl && _input === 'c') {
      if (isRunning) {
        if (agentRef.current) {
          agentRef.current.abort();
          agentRef.current = null;
        }
        // Resolve any pending question so the agent loop can exit
        if (questionResolverRef.current) {
          questionResolverRef.current('');
          questionResolverRef.current = null;
          setQuestion(null);
        }
        setAgentState('idle');
        setLogs((prev) => [
          ...prev,
          {
            step: 0,
            action: 'abort',
            detail: 'Aborted by user (Ctrl+C)',
            success: false,
          },
        ]);
      } else {
        exit();
      }
    }
  });

  const isRunning =
    agentState !== 'idle' && agentState !== 'done' && agentState !== 'error';

  return (
    <Box flexDirection="column" minHeight={rows} width={responsiveWidth}>
      <Header
        modelName={modelName}
        screenInfo={screenInfo}
        driverType={driverType}
      />
      <TaskPanel
        task={currentTask}
        step={currentStep}
        maxSteps={config.maxSteps}
        state={agentState}
      />
      <LogPanel logs={logs} />
      {question ? (
        <QuestionPanel
          question={question.text}
          options={question.options}
          onAnswer={handleAnswer}
        />
      ) : (
        <InputBar onSubmit={handleSubmit} disabled={isRunning} />
      )}
    </Box>
  );
}
