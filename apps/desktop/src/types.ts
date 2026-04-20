/**
 * @deprecated Prefer importing directly from `@recall/shared-types`.
 *
 * Thin re-export shim kept so the pre-monorepo relative imports
 * (`from './types'`) continue to resolve. New code should import from
 * `@recall/shared-types`.
 */

export type {
  ActivityPoint,
  AppInfo,
  DateFilter,
  DetectedSource,
  ExportData,
  FileChange,
  McpStatus,
  Message,
  OpenTab,
  SearchResult,
  Session,
  SessionSummary,
  Stats,
  UpdateState,
  UpdateStatus,
  View,
} from '@recall/shared-types';
