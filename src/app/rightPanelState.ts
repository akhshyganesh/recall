export type RightPanelViewId = "closed" | "git-context";

export type RightPanelState = Readonly<{
  view: RightPanelViewId;
}>;

function makeState(
  view: RightPanelViewId,
  previous?: RightPanelState,
): RightPanelState {
  if (previous && previous.view === view) return previous;
  return { view };
}

export function createRightPanelState(view: RightPanelViewId): RightPanelState {
  return { view };
}

export function sanitizeRightPanelState(
  state: RightPanelState,
  hasRepo: boolean,
): RightPanelState {
  if (!hasRepo && state.view === "git-context") return makeState("closed", state);
  return state;
}

export function getVisibleRightPanelView(
  state: RightPanelState,
  hasRepo: boolean,
): RightPanelViewId {
  return sanitizeRightPanelState(state, hasRepo).view;
}

export function toggleGitContextPanel(
  state: RightPanelState,
  hasRepo: boolean,
): RightPanelState {
  if (!hasRepo) return makeState("closed", state);
  return state.view === "git-context"
    ? makeState("closed", state)
    : makeState("git-context", state);
}

export function openGitContextPanel(
  state: RightPanelState,
  hasRepo: boolean,
): RightPanelState {
  if (!hasRepo) return makeState("closed", state);
  return makeState("git-context", state);
}

export function closeRightPanel(state: RightPanelState): RightPanelState {
  return makeState("closed", state);
}
