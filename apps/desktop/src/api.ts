import { invoke } from '@tauri-apps/api/core';
import type {
  ActivityPoint,
  AppInfo,
  SessionSummary,
  Session,
  SearchResult,
  DetectedSource,
  ExportData,
  McpStatus,
  Stats,
} from './types';

export async function getAppInfo(): Promise<AppInfo> {
  return invoke('get_app_info');
}

export async function detectSources(): Promise<DetectedSource[]> {
  return invoke('detect_sources');
}

export async function scanAll(): Promise<number> {
  return invoke('scan_all');
}

export async function scanIncremental(sinceTs?: string): Promise<number> {
  return invoke('scan_incremental', { sinceTs });
}

export async function getSessions(params: {
  tool?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}): Promise<SessionSummary[]> {
  return invoke('get_sessions', {
    tool: params.tool ?? null,
    dateFrom: params.dateFrom ?? null,
    dateTo: params.dateTo ?? null,
    limit: params.limit ?? 50,
    offset: params.offset ?? 0,
  });
}

export async function getSession(id: string): Promise<Session | null> {
  return invoke('get_session', { id });
}

export async function searchSessions(params: {
  query: string;
  tools?: string[];
  paths?: string[];
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}): Promise<SearchResult[]> {
  return invoke('search_sessions', {
    query: params.query,
    tools: params.tools && params.tools.length > 0 ? params.tools : null,
    paths: params.paths && params.paths.length > 0 ? params.paths : null,
    dateFrom: params.dateFrom ?? null,
    dateTo: params.dateTo ?? null,
    limit: params.limit ?? 50,
  });
}

export async function toggleFavorite(sessionId: string): Promise<boolean> {
  return invoke('toggle_favorite', { sessionId });
}

export async function getFavorites(limit?: number, offset?: number): Promise<SessionSummary[]> {
  return invoke('get_favorites', { limit: limit ?? 50, offset: offset ?? 0 });
}

export async function getTools(): Promise<string[]> {
  return invoke('get_tools');
}

export async function getSearchPaths(): Promise<string[]> {
  return invoke('get_search_paths');
}

export async function getStats(): Promise<Stats> {
  return invoke('get_stats');
}

export async function getActivityHeatmap(days?: number): Promise<ActivityPoint[]> {
  return invoke('get_activity_heatmap', { days: days ?? 182 });
}

export async function clearDatabase(): Promise<void> {
  return invoke('clear_database');
}

export async function exportSession(id: string, format: string): Promise<ExportData> {
  return invoke('export_session', { id, format });
}

export async function startMcpServer(port?: number): Promise<number> {
  return invoke('start_mcp_server', { port: port ?? null });
}

export async function stopMcpServer(): Promise<void> {
  return invoke('stop_mcp_server');
}

export async function getMcpStatus(): Promise<McpStatus> {
  return invoke('get_mcp_status');
}
