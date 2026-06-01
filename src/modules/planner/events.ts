export type PlannerView = "list" | "board" | "sketch";

export const PLANNER_VIEW_EVENT = "recall:planner-view";
const PENDING_PLANNER_VIEW_KEY = "recall.planner.pendingView";

export function requestPlannerView(view: PlannerView): void {
  try {
    window.sessionStorage.setItem(PENDING_PLANNER_VIEW_KEY, view);
  } catch {
    // Session storage may be unavailable; the event still handles mounted views.
  }
  window.dispatchEvent(new CustomEvent<PlannerView>(PLANNER_VIEW_EVENT, { detail: view }));
}

export function consumePendingPlannerView(): PlannerView | null {
  try {
    const value = window.sessionStorage.getItem(PENDING_PLANNER_VIEW_KEY);
    window.sessionStorage.removeItem(PENDING_PLANNER_VIEW_KEY);
    return isPlannerView(value) ? value : null;
  } catch {
    return null;
  }
}

export function isPlannerView(value: unknown): value is PlannerView {
  return (
    value === "list" ||
    value === "board" ||
    value === "sketch"
  );
}
