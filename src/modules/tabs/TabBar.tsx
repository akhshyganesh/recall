import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtShortcut, MOD_KEY, SHIFT_KEY } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { fileIconUrl } from "@/modules/explorer/lib/iconResolver";
import {
  ArrowDown01Icon,
  Cancel01Icon,
  Clock01Icon,
  ComputerTerminal02Icon,
  GitCompareIcon,
  Globe02Icon,
  LayoutTwoColumnIcon,
  Orbit01Icon,
  PencilEdit02Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { EditorTab, GitDiffTab, MediaTab, Tab, TerminalTab } from "./lib/useTabs";

type Props = {
  tabs: Tab[];
  activeId: number;
  onSelect: (id: number) => void;
  onNew: () => void;
  onNewPreview: () => void;
  onNewEditor: () => void;
  onClose: (id: number) => void;
  onRename: (id: number, title: string) => void;
  /** Pin (promote) a preview tab to persistent on double-click. */
  onPin: (id: number) => void;
  onReorder?: (fromIndex: number, dropPosition: number) => void;
  onOpenInSplit?: (id: number) => void;
  onCloseOthers?: (id: number) => void;
  onCloseToRight?: (id: number) => void;
  /** Called when a tab is dragged into a split drop zone. */
  onDragToSplit?: (tabId: number, dir: "row" | "col") => void;
  /** Called during drag to notify parent of the hovered split zone (null = none). */
  onSplitZoneChange?: (zone: "row" | "col" | null) => void;
  /** Returns the workspace area bounding rect for split-zone hit testing. */
  getWorkspaceRect?: () => DOMRect | null;
  compact?: boolean;
};

export function TabBar({
  tabs,
  activeId,
  onSelect,
  onNew,
  onNewPreview,
  onNewEditor,
  onClose,
  onRename,
  onPin,
  onReorder,
  onOpenInSplit,
  onCloseOthers,
  onCloseToRight,
  onDragToSplit,
  onSplitZoneChange,
  getWorkspaceRect,
  compact,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const skipRenameBlurRef = useRef(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const [dragDeltaX, setDragDeltaX] = useState(0);
  // Visual state: ghost cursor position and active split zone for cursor + badge rendering.
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [activeSplitZone, setActiveSplitZone] = useState<"row" | "col" | null>(null);
  // Refs hold latest drag state so pointer-event handlers never go stale.
  const dragStartRef = useRef<{ x: number; y: number; idx: number; tabId: number } | null>(null);
  const dragActiveRef = useRef<{ draggingIdx: number; dropIdx: number } | null>(null);
  const splitZoneRef = useRef<"row" | "col" | null>(null);
  // Snapshotted tab midpoints and dragged tab width captured at drag-start.
  const originalMids = useRef<number[]>([]);
  const draggedTabWidth = useRef(0);
  const terminalLabels = useMemo(() => buildTerminalLabels(tabs), [tabs]);

  // Horizontal wheel scroll without holding shift.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Keep the active tab visible after selection / open.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>(`[data-tab-id="${activeId}"]`);
    active?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId, tabs.length]);

  useEffect(() => {
    if (renamingId === null) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [renamingId]);

  const beginRename = (tab: Tab) => {
    skipRenameBlurRef.current = false;
    setRenamingId(tab.id);
    setRenameValue(labelFor(tab, terminalLabels));
  };

  const closeRename = () => {
    setRenamingId(null);
    setRenameValue("");
  };

  const commitRename = () => {
    if (skipRenameBlurRef.current) {
      skipRenameBlurRef.current = false;
      return;
    }
    if (renamingId !== null) {
      const title = renameValue.trim();
      if (title) onRename(renamingId, title);
    }
    skipRenameBlurRef.current = true;
    closeRename();
  };

  const cancelRename = () => {
    skipRenameBlurRef.current = true;
    closeRename();
  };

  // Uses originalMids (snapshotted at drag start) so the insert index calculation
  // stays stable while items are mid-animation.
  const computeDropIdx = (clientX: number, dragIdx: number): number => {
    const without = originalMids.current.filter((_, i) => i !== dragIdx);
    for (let j = 0; j < without.length; j++) {
      if (clientX < without[j]) return j;
    }
    return without.length;
  };

  // Compute translateX for a non-dragged tab — same logic as SidebarRail.
  // Items to the right of dragIndex slide left to fill the gap, items at/after
  // insertIndex slide right to open the drop slot. The effects combine.
  const shiftForTab = (i: number, dragIndex: number, insertIndex: number, w: number): number => {
    const adj = i > dragIndex ? i - 1 : i;
    const fill = i > dragIndex ? -w : 0;
    const open = adj >= insertIndex ? w : 0;
    return fill + open;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (!onReorder && !onDragToSplit) return;
    if ((e.target as Element).closest('[aria-label="Close tab"]')) return;
    const tabEl = (e.target as Element).closest("[data-tab-id]");
    if (!tabEl) return;
    const tabId = Number(tabEl.getAttribute("data-tab-id"));
    const idx = tabs.findIndex((t) => t.id === tabId);
    if (idx < 0) return;
    dragStartRef.current = { x: e.clientX, y: e.clientY, idx, tabId };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current;
    if (!start) return;

    if (draggingIdx === null) {
      if (Math.abs(e.clientX - start.x) <= 5 && Math.abs(e.clientY - start.y) <= 5) return;
      // Snapshot midpoints and dragged tab width at the moment drag begins.
      const tabEls = Array.from(scrollRef.current?.querySelectorAll("[data-tab-id]") ?? []);
      originalMids.current = tabEls.map((el) => {
        const r = el.getBoundingClientRect();
        return r.left + r.width / 2;
      });
      draggedTabWidth.current =
        tabEls[start.idx]?.getBoundingClientRect().width ?? 0;
      setDraggingIdx(start.idx);
      scrollRef.current?.setPointerCapture(e.pointerId);
    }

    setDragDeltaX(e.clientX - start.x);
    setDragPos({ x: e.clientX, y: e.clientY });

    const activeDragIdx = draggingIdx ?? start.idx;
    const tabBarRect = scrollRef.current?.getBoundingClientRect();
    const wsRect = getWorkspaceRect?.();

    let zone: "row" | "col" | null = null;
    if (wsRect) {
      // Right 35% of workspace → side split (reachable by dragging right within the tab bar).
      // Lower 55% of workspace → bottom split (only below the tab bar).
      // Right takes priority so bottom-right corner stays as "row".
      const rightThreshold = wsRect.left + wsRect.width * 0.65;
      const bottomThreshold = wsRect.top + wsRect.height * 0.45;
      const belowTabBar = !tabBarRect || e.clientY > tabBarRect.bottom + 8;
      if (e.clientX >= rightThreshold) {
        zone = "row";
      } else if (belowTabBar && e.clientY >= bottomThreshold) {
        zone = "col";
      }
    }

    if (zone !== splitZoneRef.current) {
      splitZoneRef.current = zone;
      setActiveSplitZone(zone);
      onSplitZoneChange?.(zone);
    }

    if (zone !== null) {
      dragActiveRef.current = { draggingIdx: activeDragIdx, dropIdx: -1 };
      setDropIdx(null);
      return;
    }

    const newDrop = computeDropIdx(e.clientX, activeDragIdx);
    dragActiveRef.current = { draggingIdx: activeDragIdx, dropIdx: newDrop };
    setDropIdx(newDrop);
  };

  const handlePointerUp = () => {
    const active = dragActiveRef.current;
    const start = dragStartRef.current;
    const zone = splitZoneRef.current;

    if (zone !== null && start !== null && onDragToSplit) {
      onDragToSplit(start.tabId, zone);
    } else if (active !== null && active.dropIdx >= 0 && onReorder) {
      onReorder(active.draggingIdx, active.dropIdx);
    } else if (start !== null && active === null) {
      // Pure click (no drag movement) — select the tab.
      // Radix's mousedown activation is blocked so we handle selection here.
      onSelect(start.tabId);
    }

    splitZoneRef.current = null;
    onSplitZoneChange?.(null);
    dragStartRef.current = null;
    dragActiveRef.current = null;
    setDraggingIdx(null);
    setDropIdx(null);
    setDragDeltaX(0);
    setDragPos(null);
    setActiveSplitZone(null);
  };

  const draggedTab = draggingIdx !== null ? tabs[draggingIdx] : null;

  return (
    <>
    <div
      ref={scrollRef}
      className={cn(
        "flex min-w-0 shrink items-stretch overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        draggingIdx !== null && (activeSplitZone ? "cursor-copy select-none" : "cursor-grabbing select-none"),
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div className="flex h-full w-max items-stretch">
        <Tabs
          value={String(activeId)}
          onValueChange={(v) => onSelect(Number(v))}
          className="h-full!"
        >
          <TabsList className="h-full! w-max gap-0 bg-transparent p-0">
            {(() => {
              const items: ReactNode[] = [];
              tabs.forEach((t, i) => {
                const isPreview =
                  (t.kind === "editor" && (t as EditorTab).preview) ||
                  (t.kind === "media" && (t as MediaTab).preview) ||
                  (t.kind === "git-diff" && (t as GitDiffTab).preview);
                const label = labelFor(t, terminalLabels);
                const isDragging = draggingIdx === i;

                const translateX =
                  draggingIdx !== null && dropIdx !== null && !activeSplitZone
                    ? isDragging
                      ? dragDeltaX
                      : shiftForTab(i, draggingIdx, dropIdx, draggedTabWidth.current)
                    : 0;

                const tabIndex = i + 1;
                const indexHint = tabIndex <= 9 ? ` (⌘${tabIndex})` : "";
                items.push(
                  <ContextMenu key={t.id}>
                    <ContextMenuTrigger asChild>
                      <TabsTrigger
                        value={String(t.id)}
                        data-tab-id={t.id}
                        title={`${tooltipFor(t, label)}${indexHint}`}
                        onDoubleClick={() => isPreview && onPin(t.id)}
                        onMouseDown={(e) => e.preventDefault()}
                        style={{
                          transform: `translateX(${translateX}px)`,
                          transition: isDragging ? "none" : draggingIdx !== null ? "transform 160ms ease" : undefined,
                          zIndex: isDragging ? 10 : undefined,
                          position: "relative",
                        }}
                        className={cn(
                          "group h-full! flex-none! shrink-0 justify-between! gap-1.5! rounded-none! border-x-0! border-t-0! border-b-2! text-[11.5px]! font-medium!",
                          t.id === activeId
                            ? "border-b-primary! text-foreground! bg-transparent!"
                            : "border-b-transparent! text-muted-foreground/65 hover:text-muted-foreground! hover:bg-sidebar-accent/40!",
                          compact
                            ? "px-2!"
                            : tabs.length === 1
                              ? "px-2.5!"
                              : "ps-2.5! pe-1.5!",
                          onReorder && "cursor-grab",
                          isDragging && "opacity-50 cursor-grabbing",
                        )}
                      >
                        <span
                          className={cn(
                            "flex min-w-0 items-center gap-1.5 truncate",
                            compact ? "max-w-28" : "max-w-48",
                          )}
                        >
                          <TabIcon tab={t} />
                          {renamingId === t.id ? (
                            <input
                              ref={renameInputRef}
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              onPointerDown={(e) => e.stopPropagation()}
                              onBlur={commitRename}
                              onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === "Enter") commitRename();
                                if (e.key === "Escape") cancelRename();
                              }}
                              className="h-5 min-w-16 rounded border border-border/60 bg-background px-1.5 text-[11px] text-foreground outline-none"
                            />
                          ) : (
                            <span className={cn("truncate", isPreview && "italic opacity-75")}>
                              {label}
                            </span>
                          )}
                          {t.kind === "editor" && t.dirty ? (
                            <span
                              aria-label="Unsaved changes"
                              className={cn(
                                "size-1.5 shrink-0 rounded-full",
                                t.id === activeId ? "bg-primary/70" : "bg-muted-foreground/50",
                              )}
                            />
                          ) : null}
                        </span>
                        {tabIndex <= 9 && !compact && (
                          <span
                            aria-hidden
                            className={cn(
                              "ml-0.5 shrink-0 font-mono text-[9px] leading-none",
                              t.id === activeId ? "text-muted-foreground/35" : "text-muted-foreground/25",
                            )}
                          >
                            {MOD_KEY}{tabIndex}
                          </span>
                        )}
                        {tabs.length > 1 && (
                          <span
                            role="button"
                            aria-label="Close tab"
                            onClick={(e) => {
                              e.stopPropagation();
                              onClose(t.id);
                            }}
                            className="rounded-sm p-0.5 opacity-0 hover:bg-accent hover:text-foreground hover:opacity-100 group-hover:opacity-50"
                          >
                            <HugeiconsIcon
                              icon={Cancel01Icon}
                              size={10}
                              strokeWidth={2}
                            />
                          </span>
                        )}
                      </TabsTrigger>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="min-w-40 rounded-md">
                      <ContextMenuItem onSelect={() => beginRename(t)}>
                        <HugeiconsIcon
                          icon={PencilEdit02Icon}
                          size={14}
                          strokeWidth={1.75}
                        />
                        Rename tab
                      </ContextMenuItem>
                      {onOpenInSplit && t.kind !== "terminal" ? (
                        <ContextMenuItem onSelect={() => onOpenInSplit(t.id)}>
                          <HugeiconsIcon
                            icon={LayoutTwoColumnIcon}
                            size={14}
                            strokeWidth={1.75}
                          />
                          Open in split view
                        </ContextMenuItem>
                      ) : null}
                      {tabs.length > 1 ? (
                        <>
                          <ContextMenuSeparator />
                          <ContextMenuItem onSelect={() => onClose(t.id)}>
                            <HugeiconsIcon
                              icon={Cancel01Icon}
                              size={14}
                              strokeWidth={1.75}
                            />
                            Close tab
                          </ContextMenuItem>
                          {onCloseOthers && (
                            <ContextMenuItem onSelect={() => onCloseOthers(t.id)}>
                              <HugeiconsIcon
                                icon={Cancel01Icon}
                                size={14}
                                strokeWidth={1.75}
                              />
                              Close others
                            </ContextMenuItem>
                          )}
                          {onCloseToRight && i < tabs.length - 1 && (
                            <ContextMenuItem onSelect={() => onCloseToRight(t.id)}>
                              <HugeiconsIcon
                                icon={Cancel01Icon}
                                size={14}
                                strokeWidth={1.75}
                              />
                              Close to right
                            </ContextMenuItem>
                          )}
                        </>
                      ) : null}
                    </ContextMenuContent>
                  </ContextMenu>,
                );
              });

              return items;
            })()}
          </TabsList>
        </Tabs>
        <div className="flex items-center self-center mx-0.5 shrink-0">
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-sm text-muted-foreground/50 hover:bg-sidebar-accent/60 hover:text-muted-foreground"
            title="New terminal (⌘T)"
            onClick={() => onNew()}
          >
            <HugeiconsIcon icon={PlusSignIcon} size={13} strokeWidth={2} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="w-3.5 rounded-sm text-muted-foreground/50 hover:bg-sidebar-accent/60 hover:text-muted-foreground aria-expanded:bg-sidebar-accent aria-expanded:text-foreground"
                title="New tab…"
              >
                <HugeiconsIcon icon={ArrowDown01Icon} size={9} strokeWidth={2} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-max">
              <DropdownMenuItem onSelect={() => onNew()}>
                <HugeiconsIcon
                  icon={ComputerTerminal02Icon}
                  size={14}
                  strokeWidth={1.75}
                />
                <span className="flex-1">Terminal</span>
                <span className="text-xs text-muted-foreground">
                  {fmtShortcut(MOD_KEY, "T")}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onNewEditor()}>
                <HugeiconsIcon
                  icon={PencilEdit02Icon}
                  size={14}
                  strokeWidth={1.75}
                />
                <span className="flex-1">Editor</span>
                <span className="text-xs text-muted-foreground">
                  {fmtShortcut(MOD_KEY, "E")}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onNewPreview()}>
                <HugeiconsIcon icon={Globe02Icon} size={14} strokeWidth={1.75} />
                <span className="flex-1">Preview</span>
                <span className="text-xs text-muted-foreground">
                  {fmtShortcut(MOD_KEY, SHIFT_KEY, "P")}
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
    {draggedTab !== null && dragPos !== null && createPortal(
      <div
        className={cn(
          "pointer-events-none fixed z-[9999] flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-semibold shadow-lg",
          activeSplitZone
            ? "border-2 border-primary bg-primary/15 text-foreground"
            : "border border-border/80 bg-card text-foreground",
        )}
        style={{ left: dragPos.x + 14, top: dragPos.y + 12 }}
      >
        <TabIcon tab={draggedTab} />
        <span className="max-w-[7rem] truncate">
          {labelFor(draggedTab, terminalLabels)}
        </span>
        {activeSplitZone === "row" && (
          <span className="shrink-0 text-primary opacity-80">→ side</span>
        )}
        {activeSplitZone === "col" && (
          <span className="shrink-0 text-primary opacity-80">↓ below</span>
        )}
      </div>,
      document.body,
    )}
    </>
  );
}

function TabIcon({ tab }: { tab: Tab }) {
  if (tab.kind === "editor" || tab.kind === "markdown" || tab.kind === "media") {
    const url = fileIconUrl(tab.title);
    return url ? <img src={url} alt="" className="size-3.5 shrink-0" /> : null;
  }
  if (tab.kind === "session") {
    return (
      <HugeiconsIcon
        icon={Orbit01Icon}
        size={14}
        strokeWidth={2}
        className="shrink-0"
      />
    );
  }
  if (tab.kind === "preview") {
    return (
      <HugeiconsIcon
        icon={Globe02Icon}
        size={14}
        strokeWidth={2}
        className="shrink-0"
      />
    );
  }
  if (tab.kind === "git-diff" || tab.kind === "git-commit-file") {
    return (
      <HugeiconsIcon
        icon={GitCompareIcon}
        size={14}
        strokeWidth={2}
        className="shrink-0"
      />
    );
  }
  if (tab.kind === "git-history") {
    return (
      <HugeiconsIcon
        icon={Clock01Icon}
        size={14}
        strokeWidth={2}
        className="shrink-0"
      />
    );
  }
  return (
    <HugeiconsIcon
      icon={ComputerTerminal02Icon}
      size={14}
      strokeWidth={2}
      className="shrink-0"
    />
  );
}

function labelFor(t: Tab, terminalLabels: Map<number, string>): string {
  if (t.kind === "editor") return t.title;
  if (t.kind === "preview") return t.title;
  if (t.kind === "markdown") return t.title;
  if (t.kind === "media") return t.title;
  if (t.kind === "session") return t.title;
  if (t.kind === "git-diff") return t.title;
  if (t.kind === "git-history") return t.title;
  if (t.kind === "git-commit-file") return t.title;
  return terminalLabels.get(t.id) ?? t.title;
}

function tooltipFor(t: Tab, label: string): string {
  if (t.kind === "terminal" && t.cwd) return t.cwd;
  if (
    t.kind === "editor" ||
    t.kind === "markdown" ||
    t.kind === "media" ||
    t.kind === "git-diff" ||
    t.kind === "git-commit-file"
  ) {
    return "path" in t ? t.path : label;
  }
  return label;
}

function buildTerminalLabels(tabs: Tab[]): Map<number, string> {
  const labels = new Map<number, string>();
  const terminalTabs = tabs.filter((t): t is TerminalTab => t.kind === "terminal");
  const byBase = new Map<string, TerminalTab[]>();

  for (const tab of terminalTabs) {
    if (!tab.cwd || hasCustomTerminalTitle(tab)) {
      labels.set(tab.id, tab.title);
      continue;
    }
    const base = terminalBaseName(tab.cwd);
    const group = byBase.get(base) ?? [];
    group.push(tab);
    byBase.set(base, group);
  }

  for (const group of byBase.values()) {
    if (group.length === 1) {
      labels.set(group[0].id, terminalBaseName(group[0].cwd ?? group[0].title));
      continue;
    }
    const paths = group.flatMap((tab) => (tab.cwd ? [tab.cwd] : []));
    for (const tab of group) {
      labels.set(tab.id, tab.cwd ? uniquePathSuffix(tab.cwd, paths) : tab.title);
    }
  }

  return labels;
}

function hasCustomTerminalTitle(tab: TerminalTab): boolean {
  return tab.title !== "shell";
}

function terminalBaseName(path: string): string {
  const parts = path.split(/[\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "/";
}

function uniquePathSuffix(path: string, candidates: string[]): string {
  const current = pathSegments(path);
  if (current.length === 0) return path.startsWith("/") ? "/" : path;

  for (let length = 2; length <= current.length; length++) {
    const suffix = current.slice(-length).join("/");
    const matches = candidates.filter(
      (candidate) => pathSegments(candidate).slice(-length).join("/") === suffix,
    );
    if (matches.length === 1) return suffix;
  }

  return path.startsWith("/") ? `/${current.join("/")}` : current.join("/");
}

function pathSegments(path: string): string[] {
  return path.replace(/\\/g, "/").split("/").filter(Boolean);
}
