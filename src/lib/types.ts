export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children: FileNode[] | null;
}

export interface TerminalDrawerConfig {
  open: boolean;
  heightPercent: number;
}

export interface WindowBounds {
  width: number | null;
  height: number | null;
  x: number | null;
  y: number | null;
}

export interface WorkspaceConfig {
  version: number;
  mainSplit: number[];
  leftSplit: number[];
  terminalDrawer: TerminalDrawerConfig;
  windowBounds: WindowBounds;
}

export interface ChatMessage {
  role: string;
  content: string;
}

export interface ChatStreamChunk {
  model: string;
  message: ChatMessage | null;
  done: boolean;
  eval_count?: number | null;
  eval_duration?: number | null;
}

export type ModelRole = 'coder' | 'reasoning';
export type LoadState = 'unloaded' | 'loading' | 'ready' | 'unloading';

export interface ModelStatus {
  role: ModelRole;
  state: LoadState;
  sizeVramBytes: number | null;
  expiresAt: string | null;
}
