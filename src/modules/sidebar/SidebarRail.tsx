import { AppLogoMark } from "@/components/AppLogoMark";
import { cn } from "@/lib/utils";
import { useExtensionSidebarPanels } from "@/modules/extensions/registry";
import {
  Folder01Icon,
  FolderOpenIcon,
  GitBranchIcon,
  Orbit01Icon,
  PackageIcon,
  SlidersHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SidebarViewId } from "./types";

export const SIDEBAR_RAIL_HEIGHT = 28;

const STORAGE_KEY = "recall:sidebar-rail-order";
const DRAG_THRESHOLD = 4;

type CoreRailItem = {
  kind: "core";
  id: SidebarViewId;
  label: string;
  icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
};

type ExtRailItem = {
  kind: "ext";
  id: SidebarViewId;
  label: string;
  icon: ReactNode;
};

type RailItem = CoreRailItem | ExtRailItem;

type DragState = {
  index: number;       // which item is being dragged
  insertIndex: number; // target drop position
  deltaX: number;      // how far the dragged item has moved (follows pointer)
  width: number;       // width of dragged item (to compute neighbour shifts)
};

type Props = {
  activeView: SidebarViewId;
  onSelectView: (view: SidebarViewId) => void;
  settingsOpen?: boolean;
  onToggleSettings?: () => void;
  cwd?: string | null;
  branchLabel?: string | null;
  stagedCount?: number;
  changedCount?: number;
  onOpenSourceControl?: () => void;
};

function formatCwd(cwd: string): string {
  return cwd.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? cwd;
}

function loadOrder(): string[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

function saveOrder(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {}
}

function applyOrder(items: RailItem[], savedOrder: string[]): RailItem[] {
  const map = new Map(items.map((item) => [item.id, item]));
  const ordered: RailItem[] = [];
  for (const id of savedOrder) {
    const item = map.get(id);
    if (item) {
      ordered.push(item);
      map.delete(id);
    }
  }
  for (const item of map.values()) ordered.push(item);
  return ordered;
}

/**
 * Compute the translateX for a non-dragged item.
 *
 * Imagine the dragged item is "lifted" out of the flow. The remaining items
 * collapse leftward to fill its original slot, then open a gap at insertIndex
 * to make room. The two effects combine:
 *
 *   shift = (fill original gap)  +  (open gap at insert)
 *         = (i > dragIndex ? -w : 0)  +  (adjustedPos >= insertIndex ? +w : 0)
 *
 * where adjustedPos = position of item i in the list after removing dragIndex.
 */
function shiftForItem(i: number, dragIndex: number, insertIndex: number, w: number): number {
  const adj = i > dragIndex ? i - 1 : i;
  const fill = i > dragIndex ? -w : 0;
  const open = adj >= insertIndex ? w : 0;
  return fill + open;
}

export function SidebarRail({
  activeView,
  onSelectView,
  settingsOpen = false,
  onToggleSettings,
  cwd,
  branchLabel,
  stagedCount = 0,
  changedCount = 0,
  onOpenSourceControl,
}: Props) {
  const extPanels = useExtensionSidebarPanels();

  const coreItems: CoreRailItem[] = [
    { kind: "core", id: "sessions", label: "Sessions", icon: Orbit01Icon },
    { kind: "core", id: "explorer", label: "Files", icon: FolderOpenIcon },
    { kind: "core", id: "extensions", label: "Extensions", icon: PackageIcon },
  ];

  const extItems: ExtRailItem[] = extPanels.map((p) => ({
    kind: "ext",
    id: p.id,
    label: p.label,
    icon: p.icon,
  }));

  const allItems: RailItem[] = [...coreItems, ...extItems];

  const [orderedItems, setOrderedItems] = useState<RailItem[]>(() => {
    const saved = loadOrder();
    return saved ? applyOrder(allItems, saved) : allItems;
  });

  useEffect(() => {
    setOrderedItems((prev) => applyOrder(allItems, prev.map((i) => i.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extPanels.length]);

  const [drag, setDrag] = useState<DragState | null>(null);

  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Snapshot of original item midpoints, captured on drag start so insert
  // index calculation stays stable as items animate.
  const originalMids = useRef<number[]>([]);

  const pointerStart = useRef<{
    startX: number;
    index: number;
    didDrag: boolean;
  } | null>(null);

  function computeInsertIndex(clientX: number, dragIdx: number): number {
    const mids = originalMids.current;
    // Rebuild a virtual midpoint list as if the dragged item is removed
    const without = mids.filter((_, i) => i !== dragIdx);
    for (let i = 0; i < without.length; i++) {
      if (clientX < without[i]) return i;
    }
    return without.length;
  }

  function handlePointerDown(index: number, e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    pointerStart.current = { startX: e.clientX, index, didDrag: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(index: number, e: React.PointerEvent<HTMLButtonElement>) {
    const ps = pointerStart.current;
    if (!ps || ps.index !== index) return;

    const dx = e.clientX - ps.startX;

    if (!ps.didDrag) {
      if (Math.abs(dx) <= DRAG_THRESHOLD) return;
      // Snapshot all midpoints at drag start
      originalMids.current = buttonRefs.current.map((el) => {
        if (!el) return 0;
        const r = el.getBoundingClientRect();
        return r.left + r.width / 2;
      });
      ps.didDrag = true;
    }

    const draggedEl = buttonRefs.current[index];
    const width = draggedEl ? draggedEl.getBoundingClientRect().width : 0;
    const insertIndex = computeInsertIndex(e.clientX, index);

    setDrag({ index, insertIndex, deltaX: dx, width });
  }

  function commitDrop() {
    if (!drag) return;
    const { index: fromIndex, insertIndex } = drag;
    setOrderedItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      const target = insertIndex > fromIndex ? insertIndex - 1 : insertIndex;
      next.splice(target, 0, moved);
      saveOrder(next.map((i) => i.id));
      return next;
    });
  }

  function handlePointerUp(index: number, _e: React.PointerEvent<HTMLButtonElement>) {
    const ps = pointerStart.current;
    if (!ps || ps.index !== index) return;

    if (ps.didDrag) {
      commitDrop();
    } else {
      onSelectView(orderedItems[index].id);
    }

    pointerStart.current = null;
    setDrag(null);
  }

  function handlePointerCancel(index: number) {
    const ps = pointerStart.current;
    if (!ps || ps.index !== index) return;
    pointerStart.current = null;
    setDrag(null);
  }

  const firstExtIndex = orderedItems.findIndex((i) => i.kind === "ext");
  const unstagedCount = Math.max(0, changedCount - stagedCount);
  const hasGitInfo = !!branchLabel;
  const hasCwd = !!cwd;
  const showStatusInfo = hasCwd || hasGitInfo;

  return (
    <div
      style={{ height: SIDEBAR_RAIL_HEIGHT }}
      className="flex shrink-0 items-stretch border-t border-border/60 bg-sidebar px-1"
    >
      <div className="flex shrink-0 items-center gap-1.5 px-2 pr-3 border-r border-border/40 mr-1">
        <AppLogoMark className="size-3.5" />
        <span className="text-[10px] font-semibold tracking-wide text-muted-foreground/60 select-none">
          Recall
        </span>
      </div>
      {orderedItems.map((item, index) => {
        const isActive = item.id === activeView;
        const isExt = item.kind === "ext";
        const showSeparator = isExt && index === firstExtIndex && firstExtIndex > 0;
        const isDragging = drag?.index === index;

        // Compute this item's visual translateX
        let translateX = 0;
        if (drag) {
          if (isDragging) {
            translateX = drag.deltaX;
          } else {
            translateX = shiftForItem(index, drag.index, drag.insertIndex, drag.width);
          }
        }

        return (
          <div key={item.id} className="flex items-stretch">
            {showSeparator && !drag && (
              <div className="my-1.5 w-px self-stretch bg-border/50" />
            )}
            <button
              ref={(el) => { buttonRefs.current[index] = el; }}
              type="button"
              aria-label={item.label}
              aria-pressed={isActive}
              onPointerDown={(e) => handlePointerDown(index, e)}
              onPointerMove={(e) => handlePointerMove(index, e)}
              onPointerUp={(e) => handlePointerUp(index, e)}
              onPointerCancel={() => handlePointerCancel(index)}
              style={{
                transform: `translateX(${translateX}px)`,
                transition: isDragging ? "none" : drag ? "transform 160ms ease" : undefined,
                zIndex: isDragging ? 10 : undefined,
              }}
              className={cn(
                "relative flex select-none items-center gap-1.5 border-t-2 px-2.5 text-[11px] font-medium outline-none",
                "focus-visible:ring-2 focus-visible:ring-ring/40",
                drag ? "cursor-grabbing" : "cursor-pointer",
                // colour transitions only when not dragging
                !drag && "transition-colors duration-100",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground/70 hover:text-muted-foreground hover:bg-sidebar-accent/60",
                isExt && !isActive && "text-muted-foreground/50 hover:text-muted-foreground/80",
                isDragging && "opacity-60",
              )}
            >
              {item.kind === "core" ? (
                <HugeiconsIcon
                  icon={item.icon}
                  size={12}
                  strokeWidth={isActive ? 2.25 : 1.75}
                  className="shrink-0 transition-[stroke-width] duration-100"
                />
              ) : (
                <span className="flex h-3 w-3 shrink-0 items-center justify-center">
                  {item.icon}
                </span>
              )}
              <span>{item.label}</span>
              {isExt && (
                <span
                  className={cn(
                    "absolute right-1 top-1 h-1 w-1 rounded-full",
                    isActive ? "bg-primary/60" : "bg-muted-foreground/25",
                  )}
                />
              )}
            </button>
          </div>
        );
      })}

      <div className="ml-auto flex items-stretch">
        {showStatusInfo && (
          <button
            type="button"
            onClick={onOpenSourceControl}
            disabled={!onOpenSourceControl}
            className={cn(
              "flex items-center gap-2 border-t-2 border-transparent px-2.5 text-[10.5px] text-muted-foreground/60 outline-none transition-colors duration-100",
              "font-mono tracking-tight",
              "focus-visible:ring-2 focus-visible:ring-ring/40",
              onOpenSourceControl
                ? "cursor-pointer hover:bg-sidebar-accent/60 hover:text-muted-foreground"
                : "cursor-default",
            )}
          >
            {hasCwd && (
              <span className="flex max-w-[12rem] items-center gap-1 truncate">
                <HugeiconsIcon
                  icon={Folder01Icon}
                  size={11}
                  strokeWidth={1.75}
                  className="shrink-0"
                />
                <span className="truncate">{formatCwd(cwd!)}</span>
              </span>
            )}
            {hasGitInfo && (
              <span className="flex items-center gap-1">
                <HugeiconsIcon
                  icon={GitBranchIcon}
                  size={11}
                  strokeWidth={1.75}
                  className="shrink-0"
                />
                <span>{branchLabel}</span>
                {stagedCount > 0 && (
                  <span className="text-[9.5px] text-primary/80">{stagedCount}+</span>
                )}
                {unstagedCount > 0 && (
                  <span className="text-[9.5px] text-muted-foreground/50">{unstagedCount}~</span>
                )}
              </span>
            )}
          </button>
        )}

        {onToggleSettings && (
          <button
            type="button"
            aria-label="Settings"
            aria-pressed={settingsOpen}
            onClick={onToggleSettings}
            className={cn(
              "relative flex cursor-pointer items-center gap-1.5 border-t-2 px-2.5 text-[11px] font-medium outline-none transition-colors duration-100",
              "focus-visible:ring-2 focus-visible:ring-ring/40",
              settingsOpen
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground/70 hover:text-muted-foreground hover:bg-sidebar-accent/60",
            )}
          >
            <HugeiconsIcon
              icon={SlidersHorizontalIcon}
              size={12}
              strokeWidth={settingsOpen ? 2.25 : 1.75}
              className="shrink-0 transition-[stroke-width] duration-100"
            />
            <span>Settings</span>
          </button>
        )}
      </div>
    </div>
  );
}
