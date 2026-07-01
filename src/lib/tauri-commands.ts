import { invoke } from '@tauri-apps/api/core';
import { FileNode, WorkspaceConfig, ChatMessage } from './types';

export interface ReadDirectoryResult {
  nodes: FileNode[];
  warnings: string[];
}

export async function readDirectory(path: string): Promise<ReadDirectoryResult> {
  return invoke('read_directory', { path });
}

export async function readFile(path: string): Promise<string> {
  return invoke('read_file', { path });
}

export async function writeFile(path: string, content: string): Promise<void> {
  return invoke('write_file', { path, content });
}

export async function loadWorkspaceConfig(workspaceRoot: string): Promise<WorkspaceConfig> {
  return invoke('load_workspace_config', { workspaceRoot });
}

export async function saveWorkspaceConfig(workspaceRoot: string, config: WorkspaceConfig): Promise<void> {
  return invoke('save_workspace_config', { workspaceRoot, config });
}

export async function sendChatMessage(
  userMessage: string,
  history: ChatMessage[],
  streamId: string,
  anchorFile: string | null,
  anchorLine: number | null,
  activeFileExtension: string | null,
  useReasoning: boolean
): Promise<void> {
  return invoke('send_chat_message', { 
    userMessage, 
    history, 
    streamId,
    anchorFile,
    anchorLine,
    activeFileExtension,
    useReasoning
  });
}

export async function preloadModel(role: 'coder' | 'reasoning'): Promise<void> {
  return invoke('preload_model', { role });
}

export async function startWatchingWorkspace(path: string): Promise<void> {
  return invoke('start_watching_workspace', { path });
}
