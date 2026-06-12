import type { SidebarViewId } from "@/modules/sidebar";

const SIDEBAR_DEFAULT_WIDTH = 260;
export const SIDEBAR_MIN_WIDTH = 220;
export const SIDEBAR_MAX_WIDTH = 480;
export const SIDEBAR_WIDTH_STORAGE_KEY = "recall.sidebar.width";
export const SIDEBAR_VIEW_STORAGE_KEY = "recall.sidebar.view.v2";
// Single right panel used for both Settings and Source Control views.
const RIGHT_PANEL_DEFAULT_WIDTH = 380;
export const RIGHT_PANEL_MIN_WIDTH = 240;
export const RIGHT_PANEL_MAX_WIDTH = 600;
export const RIGHT_PANEL_WIDTH_STORAGE_KEY = "recall.right-panel.width";
export const RIGHT_PANEL_VIEW_STORAGE_KEY = "recall.right-panel.view";
export const SIDEBAR_POSITION_STORAGE_KEY = "recall.sidebar.position";

export type SidebarPosition = "left" | "right";

export function readSidebarPosition(): SidebarPosition {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_POSITION_STORAGE_KEY);
    if (stored === "left" || stored === "right") return stored;
  } catch {
    // ignore
  }
  return "left";
}

function clampSidebarWidth(width: number): number {
  return Math.min(
    SIDEBAR_MAX_WIDTH,
    Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)),
  );
}

export function readSidebarWidth(): number {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    const parsed = stored ? Number.parseInt(stored, 10) : NaN;
    return Number.isFinite(parsed)
      ? clampSidebarWidth(parsed)
      : SIDEBAR_DEFAULT_WIDTH;
  } catch {
    return SIDEBAR_DEFAULT_WIDTH;
  }
}

export function readSidebarView(): SidebarViewId {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_VIEW_STORAGE_KEY);
    if (
      stored === "sessions" ||
      stored === "explorer" ||
      stored === "search" ||
      stored === "extensions" ||
      // Allow any stored extension panel ID (namespaced as "<extId>:<panelId>")
      (stored && stored.includes(":"))
    )
      return stored;
  } catch {
    // ignore
  }
  return "explorer";
}

function clampSecondarySidebarWidth(width: number): number {
  return Math.min(
    RIGHT_PANEL_MAX_WIDTH,
    Math.max(RIGHT_PANEL_MIN_WIDTH, Math.round(width)),
  );
}

export function readSecondarySidebarWidth(): number {
  try {
    const stored = window.localStorage.getItem(RIGHT_PANEL_WIDTH_STORAGE_KEY);
    const parsed = stored ? Number.parseInt(stored, 10) : NaN;
    return Number.isFinite(parsed)
      ? clampSecondarySidebarWidth(parsed)
      : RIGHT_PANEL_DEFAULT_WIDTH;
  } catch {
    return RIGHT_PANEL_DEFAULT_WIDTH;
  }
}

export function readSecondarySidebarView(): string {
  try {
    const stored = window.localStorage.getItem(RIGHT_PANEL_VIEW_STORAGE_KEY);
    if (stored && stored !== "closed") return stored;
  } catch {
    // ignore
  }
  return "closed";
}
