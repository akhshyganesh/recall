import { Button } from "@/components/ui/button";
import { WindowControls } from "@/components/WindowControls";
import { IS_MAC, USE_CUSTOM_WINDOW_CONTROLS } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { WorkspaceEnvSelector } from "@/modules/statusbar/WorkspaceEnvSelector";
import type { Tab } from "@/modules/tabs";
import { TabBar } from "@/modules/tabs";
import type { WorkspaceEnv } from "@/modules/workspace";
import { SidebarLeftIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  SearchInline,
  type SearchInlineHandle,
  type SearchTarget,
} from "./SearchInline";

type Props = {
  tabs: Tab[];
  activeId: number;
  onSelect: (id: number) => void;
  onNew: () => void;
  onNewPreview: () => void;
  onNewEditor: () => void;
  onClose: (id: number) => void;
  onRenameTab: (id: number, title: string) => void;
  /** Promote a preview (transient) tab to persistent. */
  onPin: (id: number) => void;
  onReorderTab: (fromIndex: number, dropPosition: number) => void;
  onOpenInSplit?: (id: number) => void;
  onCloseOthers?: (id: number) => void;
  onCloseToRight?: (id: number) => void;
  onDragToSplit?: (tabId: number, dir: "row" | "col") => void;
  onSplitZoneChange?: (zone: "row" | "col" | null) => void;
  getWorkspaceRect?: () => DOMRect | null;
  onToggleSidebar: () => void;
  searchTarget: SearchTarget;
  searchRef: RefObject<SearchInlineHandle | null>;
  onWorkspaceChange: (env: WorkspaceEnv) => void;
  /** True while the user is dragging a split tab back toward the tab bar. */
  unsplitDropActive?: boolean;
};

const COMPACT_WIDTH = 720;

export function Header({
  tabs,
  activeId,
  onSelect,
  onNew,
  onNewPreview,
  onNewEditor,
  onClose,
  onRenameTab,
  onPin,
  onReorderTab,
  onOpenInSplit,
  onCloseOthers,
  onCloseToRight,
  onDragToSplit,
  onSplitZoneChange,
  getWorkspaceRect,
  onToggleSidebar,
  searchTarget,
  searchRef,
  onWorkspaceChange,
  unsplitDropActive,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setCompact(w < COMPACT_WIDTH);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={rootRef}
      className={cn(
        "flex shrink-0 select-none flex-col border-b border-border/70 bg-background transition-colors duration-100",
        unsplitDropActive && "border-b-primary/50 bg-primary/4",
      )}
    >
      {/* Combined header row */}
      <div
        data-tauri-drag-region
        className={cn(
          "flex h-9 items-stretch gap-0 bg-background",
          IS_MAC ? "pr-2 pl-20" : "pr-0 pl-1",
        )}
      >
        <div className="flex shrink-0 items-center px-1">
          <Button
            onClick={onToggleSidebar}
            title="Toggle sidebar"
            variant="ghost"
            size="icon-sm"
            className="size-7 shrink-0 rounded-sm text-muted-foreground/60 hover:bg-sidebar-accent/60 hover:text-foreground"
          >
            <HugeiconsIcon icon={SidebarLeftIcon} size={16} strokeWidth={1.75} />
          </Button>
        </div>

        <span className="mx-1 h-full w-px shrink-0 bg-border/50 self-stretch" />

        <div
          className="flex min-w-0 flex-1 items-stretch"
          data-tauri-drag-region
        >
          <TabBar
            tabs={tabs}
            activeId={activeId}
            onSelect={onSelect}
            onNew={onNew}
            onNewPreview={onNewPreview}
            onNewEditor={onNewEditor}
            onClose={onClose}
            onRename={onRenameTab}
            onPin={onPin}
            onReorder={onReorderTab}
            onOpenInSplit={onOpenInSplit}
            onCloseOthers={onCloseOthers}
            onCloseToRight={onCloseToRight}
            onDragToSplit={onDragToSplit}
            onSplitZoneChange={onSplitZoneChange}
            getWorkspaceRect={getWorkspaceRect}
            compact={compact}
          />
          <div data-tauri-drag-region className="h-full min-w-2 flex-1" />
          <div className="flex items-center pr-1">
            <WorkspaceEnvSelector onSelect={onWorkspaceChange} />
          </div>
        </div>

        <SearchInline ref={searchRef} target={searchTarget} compact={compact} />

        {USE_CUSTOM_WINDOW_CONTROLS && (
          <>
            <span className="ml-1 h-5 w-px shrink-0 self-center bg-border/50" />
            <WindowControls />
          </>
        )}
      </div>
    </div>
  );
}
