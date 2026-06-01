import { invoke } from "@tauri-apps/api/core";

export type ActivityPoint = {
  date: string;
  tool: string;
  session_count: number;
};

export type Stats = {
  total_sessions: number;
  total_messages: number;
  total_tools: number;
};

export type SessionSummary = {
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
};

export type Message = {
  id: string;
  session_id: string;
  idx: number;
  role: string;
  author: string | null;
  content: string;
  created_at: string | null;
  extra: string;
};

export type FileChange = {
  id: string;
  session_id: string;
  path: string;
  additions: number;
  deletions: number;
  diff_text: string | null;
};

export type Session = Omit<SessionSummary, "is_favorite"> & {
  source_path: string | null;
  branch: string | null;
  ended_at: string | null;
  external_id: string | null;
  metadata: string;
  indexed_at: string;
  source_mtime: string | null;
  messages: Message[];
  file_changes: FileChange[];
};

export type SearchResult = {
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
};

export type ExportFormat = "markdown" | "json" | "text";

export type ExportData = {
  format: string;
  content: string;
  filename: string;
};

export type SessionsMcpStatus = {
  running: boolean;
  endpoint: string;
};

export async function scanAll(): Promise<number> {
  return invoke("scan_all");
}

export async function scanIncremental(sinceTs?: string | null): Promise<number> {
  return invoke("scan_incremental", {
    sinceTs: sinceTs ?? null,
  });
}

export async function getSessions(params: {
  tool?: string;
  paths?: string[];
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<SessionSummary[]> {
  return invoke("get_sessions", {
    tool: params.tool ?? null,
    paths: params.paths && params.paths.length > 0 ? params.paths : null,
    dateFrom: params.dateFrom ?? null,
    dateTo: params.dateTo ?? null,
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
  });
}

export async function getSession(id: string): Promise<Session | null> {
  return invoke("get_session", { id });
}

export async function searchSessions(params: {
  query: string;
  tools?: string[];
  paths?: string[];
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}): Promise<SearchResult[]> {
  return invoke("search_sessions", {
    query: params.query,
    tools: params.tools && params.tools.length > 0 ? params.tools : null,
    paths: params.paths && params.paths.length > 0 ? params.paths : null,
    dateFrom: params.dateFrom ?? null,
    dateTo: params.dateTo ?? null,
    limit: params.limit ?? 50,
  });
}

export async function getStats(paths?: string[]): Promise<Stats> {
  return invoke("get_stats", {
    paths: paths && paths.length > 0 ? paths : null,
  });
}

export async function getActivityHeatmap(days = 84, paths?: string[]): Promise<ActivityPoint[]> {
  return invoke("get_activity_heatmap", {
    days,
    paths: paths && paths.length > 0 ? paths : null,
  });
}

export async function exportSession(
  id: string,
  format: ExportFormat,
): Promise<ExportData> {
  return invoke("export_session", { id, format });
}

export async function getSessionsMcpStatus(): Promise<SessionsMcpStatus> {
  return invoke("get_sessions_mcp_status");
}

export async function setSessionsMcpEnabled(
  enabled: boolean,
): Promise<SessionsMcpStatus> {
  return invoke("set_sessions_mcp_enabled", { enabled });
}