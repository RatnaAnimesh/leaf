import { invoke } from '@tauri-apps/api/core';
import { FileNode, WorkspaceConfig, ChatMessage } from './types';

export async function readDirectory(path: string): Promise<FileNode[]> {
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

export async function sendChatMessage(model: string, messages: ChatMessage[], streamId: string): Promise<void> {
  return invoke('send_chat_message', { model, messages, streamId });
}

export async function startWatchingWorkspace(path: string): Promise<void> {
  return invoke('start_watching_workspace', { path });
}
