import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WindowControls } from "@/components/WindowControls";
import { IS_MAC, KEY_SEP, USE_CUSTOM_WINDOW_CONTROLS } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  getBindingTokens,
  SHORTCUTS,
  type ShortcutId,
} from "@/modules/shortcuts/shortcuts";
import { WorkspaceEnvSelector } from "@/modules/statusbar/WorkspaceEnvSelector";
import type { Tab } from "@/modules/tabs";
import { TabBar } from "@/modules/tabs";
import type { WorkspaceEnv } from "@/modules/workspace";
import {
  GitBranchIcon,
  GridViewIcon,
  LayoutTwoColumnIcon,
  LayoutTwoRowIcon,
  Settings01Icon,
  SidebarLeftIcon,
  SidebarRightIcon,
} from "@hugeicons/core-free-icons";
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
  onNewGitGraph: () => void;
  onClose: (id: number) => void;
  onRenameTab: (id: number, title: string) => void;
  /** Promote a preview (transient) tab to persistent. */
  onPin: (id: number) => void;
  onReorderTab: (fromIndex: number, dropPosition: number) => void;
  onOpenInSplit?: (id: number) => void;
  onDragToSplit?: (tabId: number, dir: "row" | "col") => void;
  onSplitZoneChange?: (zone: "row" | "col" | null) => void;
  getWorkspaceRect?: () => DOMRect | null;
  onToggleSidebar: () => void;
  onToggleSourceControl: () => void;
  onSplit: (dir: "row" | "col") => void;
  /** Active tab is a terminal and below the per-tab pane cap. */
  canSplit: boolean;
  onOpenSettings: () => void;
  sourceControlAvailable: boolean;
  sourceControlOpen: boolean;
  branchLabel?: string | null;
  branchTitle?: string;
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
  onNewGitGraph,
  onClose,
  onRenameTab,
  onPin,
  onReorderTab,
  onOpenInSplit,
  onDragToSplit,
  onSplitZoneChange,
  getWorkspaceRect,
  onToggleSidebar,
  onToggleSourceControl,
  onSplit,
  canSplit,
  onOpenSettings,
  sourceControlAvailable,
  sourceControlOpen,
  branchLabel,
  branchTitle,
  searchTarget,
  searchRef,
  onWorkspaceChange,
  unsplitDropActive,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);

  const tokensFor = (id: ShortcutId): string => {
    const s = SHORTCUTS.find((s) => s.id === id);
    if (!s) return "";
    const bindings = userShortcuts[id] || s.defaultBindings;
    if (!bindings || bindings.length === 0) return "";
    return getBindingTokens(bindings[0]).join(KEY_SEP);
  };

  const splitRightTokens = tokensFor("pane.splitRight");
  const splitDownTokens = tokensFor("pane.splitDown");
  const sourceTokens = tokensFor("pane.source");

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

  const settingsButton = (
    <Button
      variant="ghost"
      size="icon"
      className="size-7 shrink-0 rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
      onClick={onOpenSettings}
      title="Settings"
    >
      <HugeiconsIcon icon={Settings01Icon} size={15} strokeWidth={1.75} />
    </Button>
  );

  const splitButton = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          title="Split terminal"
          disabled={!canSplit}
        >
          <HugeiconsIcon icon={GridViewIcon} size={16} strokeWidth={1.75} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-max">
        <DropdownMenuItem onSelect={() => onSplit("row")}>
          <HugeiconsIcon
            icon={LayoutTwoColumnIcon}
            size={14}
            strokeWidth={1.75}
          />
          <span className="flex-1">Split right</span>
          {splitRightTokens && (
            <span className="text-xs text-muted-foreground">
              {splitRightTokens}
            </span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSplit("col")}>
          <HugeiconsIcon icon={LayoutTwoRowIcon} size={14} strokeWidth={1.75} />
          <span className="flex-1">Split down</span>
          {splitDownTokens && (
            <span className="text-xs text-muted-foreground">
              {splitDownTokens}
            </span>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // Branch badge doubles as source control toggle
  const branchOrSourceControl = branchLabel ? (
    <Button
      onClick={sourceControlAvailable ? onToggleSourceControl : undefined}
      title={
        sourceControlAvailable
          ? sourceTokens
            ? `Toggle source control (${sourceTokens})`
            : "Toggle source control"
          : branchTitle ?? branchLabel
      }
      aria-pressed={sourceControlOpen}
      variant="ghost"
      className="hidden h-7 max-w-44 shrink-0 cursor-pointer items-center gap-1.5 rounded-sm border border-border/70 bg-card px-2 text-[11px] font-semibold text-muted-foreground hover:bg-accent hover:text-foreground aria-pressed:bg-accent aria-pressed:text-foreground sm:flex"
    >
      <HugeiconsIcon icon={GitBranchIcon} size={13} strokeWidth={1.75} />
      <span className="truncate">{branchLabel}</span>
    </Button>
  ) : sourceControlAvailable ? (
    <Button
      onClick={onToggleSourceControl}
      title={
        sourceTokens
          ? `Toggle source control (${sourceTokens})`
          : "Toggle source control"
      }
      aria-pressed={sourceControlOpen}
      variant="ghost"
      size="icon-sm"
      className="shrink-0 rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground aria-pressed:bg-accent aria-pressed:text-foreground"
    >
      <HugeiconsIcon icon={SidebarRightIcon} size={18} strokeWidth={1.75} />
    </Button>
  ) : null;

  return (
    <div
      ref={rootRef}
      className={cn(
        "flex shrink-0 select-none flex-col border-b border-border/55 transition-colors",
        unsplitDropActive && "border-b-primary/60 bg-primary/5",
      )}
    >
      {/* Combined header row */}
      <div
        data-tauri-drag-region
        className={`flex h-9 items-center gap-2 bg-card/65 ${
          IS_MAC ? "pr-2 pl-20" : "pr-0 pl-2"
        }`}
      >
        <div className="flex shrink-0 items-center">
          <Button
            onClick={onToggleSidebar}
            title="Toggle sidebar"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <HugeiconsIcon icon={SidebarLeftIcon} size={18} strokeWidth={1.75} />
          </Button>
        </div>

        {!IS_MAC && <span className="mx-1 h-5 w-px shrink-0 bg-border" />}
        {IS_MAC && <span className="mr-1 h-6 w-px shrink-0 bg-border" />}

        <div
          className="flex min-w-0 flex-1 items-center gap-2"
          data-tauri-drag-region
        >
          <TabBar
            tabs={tabs}
            activeId={activeId}
            onSelect={onSelect}
            onNew={onNew}
            onNewPreview={onNewPreview}
            onNewEditor={onNewEditor}
            onNewGitGraph={onNewGitGraph}
            onClose={onClose}
            onRename={onRenameTab}
            onPin={onPin}
            onReorder={onReorderTab}
            onOpenInSplit={onOpenInSplit}
            onDragToSplit={onDragToSplit}
            onSplitZoneChange={onSplitZoneChange}
            getWorkspaceRect={getWorkspaceRect}
            compact={compact}
          />
          <div data-tauri-drag-region className="h-full min-w-2 flex-1" />
          <WorkspaceEnvSelector onSelect={onWorkspaceChange} />
        </div>

        <SearchInline ref={searchRef} target={searchTarget} compact={compact} />

        <div className="flex shrink-0 items-center gap-1">
          {splitButton}
          {branchOrSourceControl && (
            <span className="mx-0.5 h-4 w-px shrink-0 bg-border/60" />
          )}
          {branchOrSourceControl}
          {settingsButton}
        </div>

        {USE_CUSTOM_WINDOW_CONTROLS && (
          <>
            <span className="ml-1 h-5 w-px shrink-0 bg-border" />
            <WindowControls />
          </>
        )}
      </div>
    </div>
  );
}
