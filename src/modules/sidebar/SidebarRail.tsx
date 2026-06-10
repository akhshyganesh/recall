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
import type { ReactNode } from "react";
import type { SidebarViewId } from "./types";

export const SIDEBAR_RAIL_HEIGHT = 28;

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

  const items: RailItem[] = [...coreItems, ...extItems];

  const unstagedCount = Math.max(0, changedCount - stagedCount);
  const hasGitInfo = !!branchLabel;
  const hasCwd = !!cwd;
  const showStatusInfo = hasCwd || hasGitInfo;

  return (
    <div
      style={{ height: SIDEBAR_RAIL_HEIGHT }}
      className="flex shrink-0 items-stretch border-t border-border/60 bg-sidebar px-1"
    >
      {items.map((item) => {
        const isActive = item.id === activeView;
        return (
          <button
            key={item.id}
            type="button"
            aria-label={item.label}
            aria-pressed={isActive}
            onClick={() => onSelectView(item.id)}
            className={cn(
              "relative flex cursor-pointer items-center gap-1.5 border-t-2 px-2.5 text-[11px] font-medium outline-none transition-colors duration-100",
              "focus-visible:ring-2 focus-visible:ring-ring/40",
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground/70 hover:text-muted-foreground hover:bg-sidebar-accent/60",
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
          </button>
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
