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

const MAX_DOTS = 5;
const INTERVAL_MS = 25_000;

export function TipToast() {
  const showTips = usePreferencesStore((s) => s.showTips);
  const startIdx = useRef(Math.floor(Math.random() * TIPS.length));
  const [index, setIndex] = useState(startIdx.current);
  const [dismissed, setDismissed] = useState(false);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    if (!showTips) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % TIPS.length);
      setDismissed(false);
      setAnimKey((k) => k + 1);
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [showTips]);

  if (!showTips || dismissed) return null;

  const total = TIPS.length;
  const showDots = total <= MAX_DOTS;

  return (
    <div
      key={animKey}
      className="fixed top-[52px] right-3 z-40 max-w-[280px] rounded-xl border border-border/50 bg-card px-4 py-3 shadow-lg [animation:ui-fade-in_250ms_ease_both]"
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <HugeiconsIcon icon={Idea01Icon} size={12} strokeWidth={2} className="shrink-0 text-primary" />
        <span className="flex-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Tip
        </span>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="flex size-4 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:text-foreground"
          aria-label="Dismiss tip"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="1" y1="1" x2="7" y2="7" />
            <line x1="7" y1="1" x2="1" y2="7" />
          </svg>
        </button>
      </div>

      <p className="text-[11.5px] leading-relaxed text-foreground/85">
        {TIPS[index]}
      </p>

      <div className="mt-2.5 flex items-center justify-center">
        {showDots ? (
          <div className="flex gap-1">
            {TIPS.map((_, i) => (
              <div
                key={i}
                className={
                  i === index
                    ? "size-1.5 rounded-full bg-primary"
                    : "size-1.5 rounded-full border border-muted-foreground/30"
                }
              />
            ))}
          </div>
        ) : (
          <span className="text-[10px] tabular-nums text-muted-foreground/50">
            {index + 1} / {total}
          </span>
        )}
      </div>
    </div>
  );
}
