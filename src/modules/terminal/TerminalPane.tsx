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
  branchLabel?: string | null;
  stagedCount?: number;
  changedCount?: number;
  onOpenSourceControl?: () => void;
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
      branchLabel,
      stagedCount = 0,
      changedCount = 0,
      onOpenSourceControl,
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
        className="zoom-exempt flex h-full w-full flex-col overflow-hidden bg-background [animation:terminal-enter_300ms_cubic-bezier(0.22,1,0.36,1)_both]"
        style={{
          visibility: visible ? "visible" : "hidden",
          pointerEvents: visible ? "auto" : "none",
        }}
      >
        <div ref={containerRef} className="min-h-0 flex-1" />
        <button
          type="button"
          onClick={onOpenSourceControl}
          disabled={!onOpenSourceControl}
          className={cn(
            "flex h-7 w-full shrink-0 items-center gap-2 border-t px-3 text-[9.5px] text-muted-foreground/72",
            focused ? "border-border/22 bg-background" : "border-border/12 bg-background",
            onOpenSourceControl &&
              "cursor-pointer transition-colors hover:bg-accent/18 hover:text-foreground/85",
          )}
          title={cwdLabel}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <HugeiconsIcon
              icon={Folder01Icon}
              size={10}
              strokeWidth={1.8}
              className="shrink-0 text-muted-foreground/55"
            />
            <span className="truncate font-mono text-[10px] text-foreground/78">
              {cwdLabel}
            </span>
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {branchLabel ? (
              <span className="font-mono text-[9px] text-muted-foreground/82">
                {branchLabel}
              </span>
            ) : null}
            {changedCount > 0 ? (
              <span className="font-mono text-[9px]">
                {changedCount} changed
              </span>
            ) : null}
            {stagedCount > 0 ? (
              <span className="font-mono text-[9px] text-emerald-400">
                {stagedCount} staged
              </span>
            ) : null}
          </span>
        </button>
      </div>
    );
  },
);

function formatCwd(cwd?: string): string {
  if (!cwd) return "shell";
  return cwd.replace(/\\/g, "/");
}
