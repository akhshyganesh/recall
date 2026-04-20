/**
 * Shared type surface for the Recall workspace.
 *
 * Types in `./generated/` are produced from the Rust backend via `ts-rs`
 * (see `apps/desktop/src-tauri/src/models.rs`). Do not edit them by hand —
 * run `pnpm types:generate` from the workspace root to refresh them.
 *
 * Stable UI-only types that have no Rust counterpart (view state, filters,
 * tab model, update status, etc.) live in this file.
 */

export type { Session } from './generated/Session';
export type { SessionSummary } from './generated/SessionSummary';
export type { Message } from './generated/Message';
export type { FileChange } from './generated/FileChange';
export type { SearchResult } from './generated/SearchResult';
export type { ActivityPoint } from './generated/ActivityPoint';
export type { ExportData } from './generated/ExportData';
export type { DetectionResult } from './generated/DetectionResult';

/** Detected connector source reported by `detect_sources`. */
export interface DetectedSource {
  name: string;
  agent_slug: string;
  detected: boolean;
  root_paths: string[];
  evidence: string;
}

/** Aggregate database stats (returned by `get_stats`). */
export interface Stats {
  total_sessions: number;
  total_messages: number;
  total_tools: number;
}

/** Info about the running app instance (returned by `get_app_info`). */
export interface AppInfo {
  current_version: string;
  repository_url: string;
  releases_url: string;
}

/** UI-only: update check state machine. */
export type UpdateState = 'idle' | 'checking' | 'available' | 'up-to-date' | 'error';

export interface UpdateStatus {
  state: UpdateState;
  current_version: string | null;
  latest_version: string | null;
  release_url: string | null;
  release_date: string | null;
  release_notes: string | null;
  checked_at: string | null;
  error: string | null;
}

/** UI-only: tab model for the session pinning bar. */
export interface OpenTab {
  id: string;
  title: string;
  tool: string;
  pinned: boolean;
}

/** UI-only: top-level route. */
export type View = 'timeline' | 'session' | 'search' | 'favorites' | 'settings';

/** UI-only: quick date filter chip value. */
export type DateFilter = 'today' | 'yesterday' | '7days' | '30days' | 'all';
