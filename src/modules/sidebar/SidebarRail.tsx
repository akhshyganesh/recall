import { cn } from "@/lib/utils";
import { useExtensionSidebarPanels } from "@/modules/extensions/registry";
import { FolderOpenIcon, Orbit01Icon, PackageIcon, SlidersHorizontalIcon } from "@hugeicons/core-free-icons";
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
};

export function SidebarRail({
  activeView,
  onSelectView,
  settingsOpen = false,
  onToggleSettings,
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
      {onToggleSettings && (
        <button
          type="button"
          aria-label="Settings"
          aria-pressed={settingsOpen}
          onClick={onToggleSettings}
          className={cn(
            "relative ml-auto flex cursor-pointer items-center gap-1.5 border-t-2 px-2.5 text-[11px] font-medium outline-none transition-colors duration-100",
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
  );
}
