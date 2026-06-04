import { cn } from "@/lib/utils";
import { Folder01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SearchAddon } from "@xterm/addon-search";
import { forwardRef, useImperativeHandle, useRef } from "react";
import { useTerminalSession } from "./lib/useTerminalSession";

export type TerminalPaneHandle = {
  write: (data: string) => void;
  focus: () => void;
  getBuffer: (maxLines?: number) => string | null;
  getSelection: () => string | null;
  clear: () => void;
};

type Props = {
  /** Stable identifier for this leaf (passed back through callbacks). */
  leafId: number;
  /** Tab containing this pane is on screen. */
  visible: boolean;
  /** This leaf is the active pane within its tab — receives auto-focus. */
  focused?: boolean;
  initialCwd?: string;
  /** Live-updated working directory (from OSC 7). */
  cwd?: string;
  onSearchReady?: (leafId: number, addon: SearchAddon) => void;
  onExit?: (leafId: number, code: number) => void;
  onCwd?: (leafId: number, cwd: string) => void;
};

export const TerminalPane = forwardRef<TerminalPaneHandle, Props>(
  function TerminalPane(
    {
      leafId,
      visible,
      focused = true,
      initialCwd,
      cwd,
      onSearchReady,
      onExit,
      onCwd,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const session = useTerminalSession({
      leafId,
      container: containerRef,
      visible,
      focused,
      initialCwd,
      onSearchReady: (a) => onSearchReady?.(leafId, a),
      onExit: (c) => onExit?.(leafId, c),
      onCwd: (c) => onCwd?.(leafId, c),
    });

    useImperativeHandle(
      ref,
      () => ({
        write: (data: string) => session.write(data),
        focus: () => session.focus(),
        getBuffer: (max?: number) => session.getBuffer(max),
        getSelection: () => session.getSelection(),
        clear: () => session.clear(),
      }),
      [session],
    );

    const displayCwd = cwd ?? initialCwd;
    const cwdLabel = formatCwd(displayCwd);

    return (
      <div
        className={cn(
          "zoom-exempt flex h-full w-full flex-col overflow-hidden rounded-lg border bg-background transition-colors",
          focused ? "border-border/50" : "border-border/20",
        )}
        style={{
          visibility: visible ? "visible" : "hidden",
          pointerEvents: visible ? "auto" : "none",
        }}
      >
        <div
          className={cn(
            "flex h-7 shrink-0 items-center gap-1.5 border-b px-3 transition-colors",
            focused
              ? "border-border/30 bg-muted/25"
              : "border-border/15 bg-muted/10",
          )}
        >
          <HugeiconsIcon
            icon={Folder01Icon}
            size={11}
            strokeWidth={1.75}
            className="shrink-0 text-muted-foreground/50"
          />
          <span className="truncate font-mono text-[11px] text-muted-foreground/70">
            {cwdLabel}
          </span>
        </div>
        <div ref={containerRef} className="min-h-0 flex-1 p-2" />
      </div>
    );
  },
);

function formatCwd(cwd?: string): string {
  if (!cwd) return "shell";
  const parts = cwd.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length === 0) return "/";
  if (parts.length <= 2) return (cwd.startsWith("/") ? "/" : "") + parts.join("/");
  return `…/${parts.slice(-2).join("/")}`;
}
