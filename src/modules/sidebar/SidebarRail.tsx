import { cn } from "@/lib/utils";
import { FolderOpenIcon, Orbit01Icon, SlidersHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SidebarViewId } from "./types";

export const SIDEBAR_RAIL_HEIGHT = 34;

type RailItem = {
  id: SidebarViewId;
  label: string;
  icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
};

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
  const items: RailItem[] = [
    { id: "sessions", label: "Sessions", icon: Orbit01Icon },
    { id: "explorer", label: "Files", icon: FolderOpenIcon },
  ];

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
            <HugeiconsIcon
              icon={item.icon}
              size={13}
              strokeWidth={isActive ? 2 : 1.75}
              className="shrink-0 transition-[stroke-width] duration-150"
            />
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
            "ml-auto flex cursor-pointer items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium outline-none transition-colors duration-150",
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
  );
}
