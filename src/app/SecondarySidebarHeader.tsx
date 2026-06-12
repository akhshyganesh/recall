import { cn } from "@/lib/utils";
import type { SidebarPanelDef } from "@/modules/extensions/types";
import { GitBranchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import React from "react";

export const SecondarySidebarHeader = React.memo(function SecondarySidebarHeader({
  hasRepo,
  extPanels,
  activeView,
  onSelectTab,
}: {
  hasRepo: boolean;
  extPanels: SidebarPanelDef[];
  activeView: string;
  onSelectTab: (id: string) => void;
}) {
  const tabs = [
    ...(hasRepo
      ? [
          {
            id: "git-context",
            label: "Source Control",
            icon: (
              <HugeiconsIcon icon={GitBranchIcon} size={12} strokeWidth={1.75} className="shrink-0" />
            ),
          },
        ]
      : []),
    ...extPanels.map((p) => ({ id: p.id, label: p.label, icon: p.icon })),
  ];
  if (tabs.length === 0) return null;
  return (
    <div className="flex shrink-0 items-stretch border-b border-border/40">
      {tabs.map((tab) => {
        const isActive = activeView === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelectTab(tab.id)}
            className={cn(
              "relative flex shrink-0 items-center gap-1.5 px-3 py-2 text-[11px] font-medium transition-colors",
              isActive ? "text-foreground" : "text-muted-foreground/60 hover:text-foreground",
            )}
          >
            {isActive && (
              <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary" />
            )}
            <span className="flex shrink-0 items-center">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
});
