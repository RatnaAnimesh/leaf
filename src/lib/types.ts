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

export interface GitFile {
  path: string;
  status: string;
}

export interface RepoStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFile[];
  unstaged: GitFile[];
  untracked: GitFile[];
}

export interface ChatSession {
  id: string;
  created_at: number;
  updated_at: number;
  title: string;
  summary: string | null;
}

export interface MentionResult {
  label: string;
  kind: string;
  file_path: string | null;
}

export interface GraphNode {
  id: string;
  label: string;
  group: string;
  kind: string | null;
}

export interface GraphLink {
  source: string;
  target: string;
  label: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}
