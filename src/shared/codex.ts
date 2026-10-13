import type { PingId } from './pings';

export interface CodexPreferences { enabled: boolean; trigger: PingId; workspace: string; codexPath: string | null }
export interface CodexSubmission { question: string; allowChanges: boolean; attachScreenshot: boolean }
export interface CaptureDisplay { id: number; number: number; primary: boolean; label: string; width: number; height: number; scale: number }
export interface CodexState {
  preferences: CodexPreferences;
  phase: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
  message: string;
  reply: string;
  threadId: string | null;
  screenshot: string | null;
  displays: CaptureDisplay[];
  captureDisplayId: number | null;
}
export interface CodexApi {
  state(): Promise<CodexState>;
  preferences(value: Pick<CodexPreferences, 'enabled' | 'trigger'>): Promise<CodexState>;
  chooseWorkspace(): Promise<CodexState>;
  chooseCodex(): Promise<CodexState>;
  selectDisplay(id: number): Promise<CodexState>;
  capture(): Promise<CodexState>;
  captureRegion(): Promise<CodexState>;
  clearCapture(): Promise<CodexState>;
  submit(value: CodexSubmission): Promise<CodexState>;
  cancel(): Promise<CodexState>;
  openThread(): Promise<void>;
  onState(callback: (state: CodexState) => void): () => void;
}
