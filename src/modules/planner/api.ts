import { invoke } from "@tauri-apps/api/core";

export type PlannerStatus = string;
export type PlannerPriority = string;

export type PlannerOption = {
  id: string;
  label: string;
};

export type PlannerStatusOption = PlannerOption & {
  isDone: boolean;
};

export type PlannerSettings = {
  statuses: PlannerStatusOption[];
  priorities: PlannerOption[];
  defaultStatusId: string;
  doneStatusId: string;
  defaultPriorityId: string;
};

export type PlannerTimerSession = {
  startedAt: string;
  endedAt: string | null;
  seconds: number;
};

export type PlannerTimerState = {
  totalSeconds: number;
  runningSince: string | null;
  sessions: PlannerTimerSession[];
};

export type PlannerItem = {
  id: string;
  title: string;
  status: PlannerStatus;
  priority: PlannerPriority;
  notes: string;
  startDate: string | null;
  deadline: string | null;
  tags: string[];
  estimateMinutes: number | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  archivedAt: string | null;
  timer: PlannerTimerState;
};

export type PlannerSketch = {
  id: string;
  title: string;
  folderId: string | null;
  linkedItemId: string | null;
  tags: string[];
  updatedAt: string | null;
  shapeCount: number;
  snapshot: unknown | null;
};

export type PlannerAccessPolicy = {
  exposeItems: boolean;
  exposeNotes: boolean;
  exposeTimers: boolean;
  exposeSketches: boolean;
  includeCompleted: boolean;
};

export type PlannerDocument = {
  schemaVersion: number;
  updatedAt: string;
  items: PlannerItem[];
  sketch: PlannerSketch;
  sketches: PlannerSketch[];
  settings: PlannerSettings;
  accessPolicy: PlannerAccessPolicy;
};

export type PlannerMcpStatus = {
  running: boolean;
  endpoint: string;
};

export async function getPlannerDocument(): Promise<PlannerDocument> {
  return invoke("get_planner_document");
}

export async function savePlannerDocument(
  document: PlannerDocument,
): Promise<PlannerDocument> {
  return invoke("save_planner_document", { document });
}

export async function getPlannerMcpStatus(): Promise<PlannerMcpStatus> {
  return invoke("get_planner_mcp_status");
}

export async function setPlannerMcpEnabled(
  enabled: boolean,
): Promise<PlannerMcpStatus> {
  return invoke("set_planner_mcp_enabled", { enabled });
}
