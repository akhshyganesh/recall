export type RightPanelViewId = "closed" | "git-context" | (string & {});

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
  // Only close when git-context is shown but there's no repo.
  // Extension panel IDs should remain open.
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

export function toggleSecondarySidebarPanel(
  state: RightPanelState,
  panelId: string,
): RightPanelState {
  if (state.view === panelId) return makeState("closed", state);
  return makeState(panelId, state);
}
