export type DriverType = 'robotjs' | 'cliclick';

export type AgentState =
  | 'idle'
  | 'capturing'
  | 'thinking'
  | 'responding'
  | 'zooming'
  | 'executing'
  | 'waiting_answer'
  | 'done'
  | 'error';

export interface ClickAction {
  type: 'click';
  x: number;
  y: number;
  button?: 'left' | 'right' | 'double';
}

export interface TypeAction {
  type: 'type';
  text: string;
}

export interface ScrollAction {
  type: 'scroll';
  direction: 'up' | 'down' | 'left' | 'right';
  amount?: number;
}

export interface AskQuestionAction {
  type: 'ask_question';
  question: string;
  options?: string[];
}

export interface DoneAction {
  type: 'done';
  summary: string;
}

export interface ScreenshotAction {
  type: 'screenshot';
}

export interface ZoomCaptureAction {
  type: 'zoomin_capture';
  x: number;
  y: number;
  padding?: number;
}

export type AgentAction =
  | ClickAction
  | TypeAction
  | ScrollAction
  | AskQuestionAction
  | DoneAction
  | ScreenshotAction
  | ZoomCaptureAction;

export interface ScreenInfo {
  physicalWidth: number;
  physicalHeight: number;
  logicalWidth: number;
  logicalHeight: number;
  scaleFactor: number;
}

export interface ProcessedImage {
  buffer: Buffer;
  base64: string;
  displayWidth: number;
  displayHeight: number;
}

export interface CropBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ZoomResult {
  image: ProcessedImage;
  cropBounds: CropBounds;
}

export interface LogEntry {
  step: number;
  action: string;
  detail: string;
  success: boolean;
  zoom?: { x: number; y: number };
}

export interface AppConfig {
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
  anthropicApiKey?: string;
  anthropicModel?: string;
  maxSteps: number;
  actionDelay: number;
  maxImageDimension: number;
  zoomEnabled: boolean;
  zoomPadding: number;
  maxHistoryTurns: number;
  maxTokens: number;
}

export interface AgentCallbacks {
  onStateChange: (state: AgentState) => void;
  onLog: (entry: LogEntry) => void;
  onStepUpdate: (step: number) => void;
  onAskQuestion: (question: string, options?: string[]) => Promise<string>;
  onMessage: (text: string) => void;
  onComplete: (summary: string) => void;
  onError: (error: string) => void;
  onInterrupt?: () => void;
  onScreenInfo: (info: ScreenInfo) => void;
  onDriverType: (driver: DriverType) => void;
}
