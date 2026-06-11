export type SecondarySidebarViewId = "closed" | "git-context" | (string & {});

export type SecondarySidebarState = Readonly<{
  view: SecondarySidebarViewId;
}>;

function makeState(
  view: SecondarySidebarViewId,
  previous?: SecondarySidebarState,
): SecondarySidebarState {
  if (previous && previous.view === view) return previous;
  return { view };
}

export function createSecondarySidebarState(view: SecondarySidebarViewId): SecondarySidebarState {
  return { view };
}

export function sanitizeSecondarySidebarState(
  state: SecondarySidebarState,
  hasRepo: boolean,
): SecondarySidebarState {
  // Only close when git-context is shown but there's no repo.
  // Extension panel IDs should remain open.
  if (!hasRepo && state.view === "git-context") return makeState("closed", state);
  return state;
}

export function getVisibleSecondarySidebarView(
  state: SecondarySidebarState,
  hasRepo: boolean,
): SecondarySidebarViewId {
  return sanitizeSecondarySidebarState(state, hasRepo).view;
}

export function toggleGitContextPanel(
  state: SecondarySidebarState,
  hasRepo: boolean,
): SecondarySidebarState {
  if (!hasRepo) return makeState("closed", state);
  return state.view === "git-context"
    ? makeState("closed", state)
    : makeState("git-context", state);
}

export function openGitContextPanel(
  state: SecondarySidebarState,
  hasRepo: boolean,
): SecondarySidebarState {
  if (!hasRepo) return makeState("closed", state);
  return makeState("git-context", state);
}

export function closeSecondarySidebar(state: SecondarySidebarState): SecondarySidebarState {
  return makeState("closed", state);
}

export function toggleSecondarySidebarPanel(
  state: SecondarySidebarState,
  panelId: string,
): SecondarySidebarState {
  if (state.view === panelId) return makeState("closed", state);
  return makeState(panelId, state);
}
