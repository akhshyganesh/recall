import { IS_MAC } from "@/lib/platform";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { Idea01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";

const M = IS_MAC ? "⌘" : "Ctrl+";
const S = IS_MAC ? "⇧" : "Shift+";
const K = IS_MAC ? "⌘K" : "Ctrl+K";

const TIPS = [
  // Tabs
  `Press ${M}T to open a new terminal tab instantly.`,
  `Press ${M}E to open a new code editor tab.`,
  `Press ${M}W to close the current tab or pane.`,
  `Press Ctrl+Tab / Ctrl+${S}Tab to cycle through tabs.`,
  `Press ${M}1–9 to jump directly to a tab by position.`,
  `Right-click a tab to rename it, open in a split, close others, or close to the right.`,
  `Double-click a preview (italic) tab to pin it as a permanent tab.`,

  // Panes / splits
  `Split the active pane right with ${M}D, or down with ${M}${S}D.`,
  `Drag any tab to the right side of the workspace to create a side-by-side split.`,
  `Navigate between split panes with ${M}] (next) and ${M}[ (previous).`,

  // Terminal
  `Clear the terminal quickly with ${K}.`,
  `Use ${M}${S}K to open the AI natural-language command bar in a terminal tab.`,
  `Press Alt+← / Alt+→ to jump a word at a time in the terminal on any platform.`,
  IS_MAC
    ? "Copy selected text in the terminal with ⌘C — no extra shortcut needed."
    : "Copy selected text in the terminal with Ctrl+Shift+C.",
  `Press ${M}F to search inside the active terminal or editor.`,

  // Explorer
  `Press ${M}${S}E to focus the file explorer.`,
  `Right-click a file in the explorer for Copy Path, Copy Relative Path, Reveal in ${IS_MAC ? "Finder" : "Files"}, and more.`,
  `Copy, cut, and paste files in the explorer with ${M}C / ${M}X / ${M}V.`,
  `Press Enter on a selected file to open it; double-click its name to rename it inline.`,
  `Drag files between folders in the explorer to move them.`,
  `Collapse all open folders in the explorer with the collapse button in the panel header.`,

  // Search & palette
  `Press ${M}P to open the quick-open palette and jump to any file.`,
  `Press ${M}${S}P to open the command palette — prefix with > to run commands.`,
  `Type @ in the command palette (${M}${S}P) to jump to a symbol in the current file.`,
  `Press ${M}${S}F to run a content search across all project files.`,

  // Sidebar & views
  `Toggle the sidebar with ${M}B.`,
  `Open source control (git) with ${M}G.`,
  `Enter Zen mode with ${M}${S}Z — hides the header and sidebar for a distraction-free view.`,
  `Zoom the UI in/out with ${M}+ and ${M}−; reset with ${M}0.`,

  // Editor
  `Open Settings with ${M}, to customize fonts, themes, keybindings, and more.`,
  `Enable Vim keybindings for editors in Settings → General.`,
  `Breadcrumbs at the top of the editor show your current file path and symbol chain — toggle them in Settings.`,
  `Sticky scroll pins the enclosing function or class header as you scroll through long files — toggle in Settings.`,

  // Git
  `Stage individual files or hunks in the source control panel (${M}G), then commit with ${M}↩.`,
  `The branch indicator in the status bar shows the current branch and pending changes at a glance.`,

  // Sessions
  `Sessions panel restores your working directories and terminal history on relaunch.`,
  `Export a session as Markdown or JSON from the Sessions panel for sharing or archiving.`,
  `The activity heatmap in Sessions shows your busiest working hours over time.`,

  // Preview & browser
  `Open a Markdown file and click the preview icon to render it side-by-side with the editor.`,
  `The built-in preview tab has a port picker — connect it to your dev server with one click.`,
  `Click "Open in browser" in a preview tab to open the current URL in your default browser.`,

  // Scratch Pad & extensions
  `The Scratch Pad extension lets you create named Excalidraw canvases — great for quick diagrams.`,
  `The Todo extension provides a persistent checklist pinned to your sidebar.`,

  // AI
  `Connect an OpenRouter API key in Settings → AI to enable the AI assistant and NL command features.`,
  `MCP (Session Connect) lets local AI agents access your session context directly.`,

  // Misc
  `The WebGL terminal renderer uses your GPU for smoother, faster text — toggle it in Settings → Terminal.`,
  `Swap the sidebar to the right side of the window from Settings → General.`,
];

interface TipToastProps {
  activeTabId: number | null;
  isTerminalTab: boolean;
}

export function TipToast({ activeTabId, isTerminalTab }: TipToastProps) {
  const showTips = usePreferencesStore((s) => s.showTips);
  // Track which tab IDs have already been shown a tip this session.
  const shownTabs = useRef<Set<number>>(new Set());
  const tipIndexRef = useRef(0);
  const [visible, setVisible] = useState(false);
  const [tip, setTip] = useState("");
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    if (!showTips || !isTerminalTab || activeTabId === null) return;
    if (shownTabs.current.has(activeTabId)) return;

    shownTabs.current.add(activeTabId);
    // Pick the next tip in sequence, cycling through the list.
    const idx = tipIndexRef.current % TIPS.length;
    tipIndexRef.current += 1;
    setTip(TIPS[idx]);
    setVisible(true);
    setAnimKey((k) => k + 1);
  }, [showTips, activeTabId, isTerminalTab]);

  if (!visible) return null;

  return (
    <div
      key={animKey}
      className="fixed top-[52px] right-3 z-40 w-[360px] rounded-lg border border-border/50 bg-card px-4 py-2.5 shadow-lg [animation:ui-fade-in_250ms_ease_both]"
    >
      <div className="flex items-start gap-2">
        <div className="flex items-center gap-1.5 pt-0.5 shrink-0">
          <HugeiconsIcon icon={Idea01Icon} size={11} strokeWidth={2} className="text-primary" />
          <span className="text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground">Tip</span>
        </div>
        <p className="flex-1 text-[11px] leading-snug text-foreground/80 line-clamp-2">
          {tip}
        </p>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="flex shrink-0 size-4 items-center justify-center rounded text-muted-foreground/50 hover:text-foreground pt-0.5"
          aria-label="Dismiss tip"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="1" y1="1" x2="7" y2="7" />
            <line x1="7" y1="1" x2="1" y2="7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
