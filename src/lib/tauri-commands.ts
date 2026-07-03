import { invoke } from '@tauri-apps/api/core';
import { FileNode, WorkspaceConfig, ChatMessage, RepoStatus, ChatSession, MentionResult } from './types';

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

export async function createFile(path: string): Promise<void> {
  return invoke('create_file', { path });
}

export async function createDir(path: string): Promise<void> {
  return invoke('create_dir', { path });
}

export async function renameFile(oldPath: string, newPath: string): Promise<void> {
  return invoke('rename_file', { oldPath, newPath });
}

export async function deleteFile(path: string): Promise<void> {
  return invoke('delete_file', { path });
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
  useReasoning: boolean,
  multiFileIntent: boolean
): Promise<void> {
  return invoke('send_chat_message', { 
    userMessage, 
    history, 
    streamId,
    anchorFile,
    anchorLine,
    activeFileExtension,
    useReasoning,
    multiFileIntent
  });
}

export async function preloadModel(role: 'coder' | 'reasoning'): Promise<void> {
  return invoke('preload_model', { role });
}

export async function startWatchingWorkspace(path: string): Promise<void> {
  return invoke('start_watching_workspace', { path });
}

export async function getRepoStatus(workspaceRoot: string): Promise<RepoStatus> {
  return invoke('get_repo_status', { workspaceRoot });
}

export async function hasUncommittedChanges(workspaceRoot: string): Promise<boolean> {
  return invoke('has_uncommitted_changes', { workspaceRoot });
}

export async function getFileDiff(workspaceRoot: string, path: string): Promise<string> {
  return invoke('get_file_diff', { workspaceRoot, path });
}

export async function getFileHeadContent(workspaceRoot: string, path: string): Promise<string> {
  return invoke('get_file_head_content', { workspaceRoot, path });
}

export async function stageFile(workspaceRoot: string, path: string): Promise<void> {
  return invoke('stage_file', { workspaceRoot, path });
}

export async function unstageFile(workspaceRoot: string, path: string): Promise<void> {
  return invoke('unstage_file', { workspaceRoot, path });
}

export async function commit(workspaceRoot: string, message: string): Promise<void> {
  return invoke('commit', { workspaceRoot, message });
}

export async function listSessions(): Promise<ChatSession[]> {
  return invoke('list_sessions');
}

export async function getSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  return invoke('get_session_messages', { sessionId });
}

export async function createSession(id: string, title: string): Promise<ChatSession> {
  return invoke('create_session', { id, title });
}

export async function addMessage(sessionId: string, role: string, content: string): Promise<number> {
  return invoke('add_message', { sessionId, role, content });
}

export async function updateSessionSummary(sessionId: string, summary: string): Promise<void> {
  return invoke('update_session_summary', { sessionId, summary });
}

export async function searchMentions(query: string): Promise<MentionResult[]> {
  return invoke('search_mentions', { query });
}

export async function gitClone(url: string, parentDir: string): Promise<string> {
  return invoke('git_clone', { url, parentDir });
}

export async function getRecentWorkspaces(): Promise<string[]> {
  return invoke('get_recent_workspaces');
}

export async function addRecentWorkspace(path: string): Promise<void> {
  return invoke('add_recent_workspace', { path });
}
