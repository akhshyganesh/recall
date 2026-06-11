import { describe, expect, it } from "vitest";
import {
  closeSecondarySidebar,
  createSecondarySidebarState,
  getVisibleSecondarySidebarView,
  sanitizeSecondarySidebarState,
  toggleGitContextPanel,
} from "./secondarySidebarState";

describe("secondarySidebarState", () => {
  it("starts closed", () => {
    const state = createSecondarySidebarState("closed");
    expect(getVisibleSecondarySidebarView(state, true)).toBe("closed");
  });

  it("toggles git-context open and closed", () => {
    const closed = createSecondarySidebarState("closed");
    const opened = toggleGitContextPanel(closed, true);
    expect(getVisibleSecondarySidebarView(opened, true)).toBe("git-context");

    const closedAgain = toggleGitContextPanel(opened, true);
    expect(getVisibleSecondarySidebarView(closedAgain, true)).toBe("closed");
  });

  it("hides git-context when no repo", () => {
    const state = createSecondarySidebarState("git-context");
    expect(getVisibleSecondarySidebarView(state, false)).toBe("closed");
  });

  it("sanitize collapses git-context without a repo", () => {
    const state = createSecondarySidebarState("git-context");
    const sanitized = sanitizeSecondarySidebarState(state, false);
    expect(getVisibleSecondarySidebarView(sanitized, false)).toBe("closed");
  });

  it("closeSecondarySidebar closes from git-context", () => {
    const state = createSecondarySidebarState("git-context");
    expect(getVisibleSecondarySidebarView(closeSecondarySidebar(state), true)).toBe("closed");
  });
});
