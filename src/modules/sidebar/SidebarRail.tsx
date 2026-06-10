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

export const SIDEBAR_RAIL_HEIGHT = 34;

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
      className="flex shrink-0 items-center gap-0.5 border-t border-border bg-sidebar px-1.5"
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
              "flex cursor-pointer items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold outline-none transition-colors duration-150",
              "focus-visible:ring-2 focus-visible:ring-ring/40",
              isActive
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            {item.kind === "core" ? (
              <HugeiconsIcon
                icon={item.icon}
                size={13}
                strokeWidth={isActive ? 2 : 1.75}
                className="shrink-0 transition-[stroke-width] duration-150"
              />
            ) : (
              <span className="flex h-[13px] w-[13px] shrink-0 items-center justify-center">
                {item.icon}
              </span>
            )}
            <span>{item.label}</span>
          </button>
        );
      })}

      <div className="ml-auto flex items-center gap-0.5">
        {showStatusInfo && (
          <button
            type="button"
            onClick={onOpenSourceControl}
            disabled={!onOpenSourceControl}
            className={cn(
              "flex items-center gap-2 rounded px-2 py-1 text-[11px] text-muted-foreground outline-none transition-colors duration-150",
              "focus-visible:ring-2 focus-visible:ring-ring/40",
              onOpenSourceControl
                ? "cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                : "cursor-default",
            )}
          >
            {hasCwd && (
              <span className="flex max-w-[14rem] items-center gap-1 truncate">
                <HugeiconsIcon
                  icon={Folder01Icon}
                  size={12}
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
                  size={12}
                  strokeWidth={1.75}
                  className="shrink-0"
                />
                <span>{branchLabel}</span>
                {stagedCount > 0 && (
                  <span className="text-[10px] text-amber-500">{stagedCount}+</span>
                )}
                {unstagedCount > 0 && (
                  <span className="text-[10px] text-muted-foreground/60">{unstagedCount}~</span>
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
              "flex cursor-pointer items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium outline-none transition-colors duration-150",
              "focus-visible:ring-2 focus-visible:ring-ring/40",
              settingsOpen
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <HugeiconsIcon
              icon={SlidersHorizontalIcon}
              size={13}
              strokeWidth={settingsOpen ? 2 : 1.75}
              className="shrink-0 transition-[stroke-width] duration-150"
            />
            <span>Settings</span>
          </button>
        )}
      </div>
    </div>
  );
}
