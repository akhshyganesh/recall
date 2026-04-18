export interface SessionSummary {
  id: string;
  tool: string;
  agent_slug: string;
  title: string | null;
  repo_name: string | null;
  repo_path: string | null;
  started_at: string | null;
  ended_at: string | null;
  message_count: number;
  file_count: number;
  model: string | null;
  workspace: string | null;
  is_favorite: boolean;
}

export interface Session {
  id: string;
  tool: string;
  agent_slug: string;
  source_path: string | null;
  repo_name: string | null;
  repo_path: string | null;
  branch: string | null;
  title: string | null;
  started_at: string | null;
  ended_at: string | null;
  model: string | null;
  message_count: number;
  file_count: number;
  workspace: string | null;
  external_id: string | null;
  metadata: string;
  indexed_at: string;
  source_mtime: string | null;
  messages: Message[];
  file_changes: FileChange[];
}

export interface Message {
  id: string;
  session_id: string;
  idx: number;
  role: string;
  author: string | null;
  content: string;
  created_at: string | null;
  extra: string;
}

export interface FileChange {
  id: string;
  session_id: string;
  path: string;
  additions: number;
  deletions: number;
  diff_text: string | null;
}

export interface SearchResult {
  id: string;
  tool: string;
  agent_slug: string;
  title: string | null;
  repo_name: string | null;
  repo_path: string | null;
  started_at: string | null;
  message_count: number;
  model: string | null;
  workspace: string | null;
  snippet: string;
}

export interface DetectedSource {
  name: string;
  agent_slug: string;
  detected: boolean;
  root_paths: string[];
  evidence: string;
}

export interface ExportData {
  format: string;
  content: string;
  filename: string;
}

export interface Stats {
  total_sessions: number;
  total_messages: number;
  total_tools: number;
}

export type View = 'timeline' | 'session' | 'search' | 'favorites' | 'settings';
export type DateFilter = 'today' | 'yesterday' | '7days' | '30days' | 'all';
