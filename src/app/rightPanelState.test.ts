import { describe, expect, it } from "vitest";
import {
  closeRightPanel,
  createRightPanelState,
  getVisibleRightPanelView,
  sanitizeRightPanelState,
  toggleGitContextPanel,
} from "./rightPanelState";

describe("rightPanelState", () => {
  it("starts closed", () => {
    const state = createRightPanelState("closed");
    expect(getVisibleRightPanelView(state, true)).toBe("closed");
  });

  it("toggles git-context open and closed", () => {
    const closed = createRightPanelState("closed");
    const opened = toggleGitContextPanel(closed, true);
    expect(getVisibleRightPanelView(opened, true)).toBe("git-context");

    const closedAgain = toggleGitContextPanel(opened, true);
    expect(getVisibleRightPanelView(closedAgain, true)).toBe("closed");
  });

  it("hides git-context when no repo", () => {
    const state = createRightPanelState("git-context");
    expect(getVisibleRightPanelView(state, false)).toBe("closed");
  });

  it("sanitize collapses git-context without a repo", () => {
    const state = createRightPanelState("git-context");
    const sanitized = sanitizeRightPanelState(state, false);
    expect(getVisibleRightPanelView(sanitized, false)).toBe("closed");
  });

  it("closeRightPanel closes from git-context", () => {
    const state = createRightPanelState("git-context");
    expect(getVisibleRightPanelView(closeRightPanel(state), true)).toBe("closed");
  });
});
