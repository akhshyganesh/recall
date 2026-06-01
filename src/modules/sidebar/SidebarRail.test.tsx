import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SidebarRail } from "./SidebarRail";

describe("SidebarRail", () => {
  it("shows Recall session and file views", () => {
    const html = renderToStaticMarkup(
      <SidebarRail
        activeView="sessions"
        onSelectView={vi.fn()}
      />,
    );
    expect(html).toContain("Sessions");
    expect(html).toContain("Files");
  });

  it("does not render Source Control in the left rail", () => {
    const html = renderToStaticMarkup(
      <SidebarRail
        activeView="explorer"
        onSelectView={vi.fn()}
      />,
    );
    expect(html).not.toContain("Source Control");
  });
});
