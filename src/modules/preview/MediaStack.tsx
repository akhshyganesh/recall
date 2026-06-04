import { cn } from "@/lib/utils";
import type { MediaTab, Tab } from "@/modules/tabs";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useMemo } from "react";

type Props = {
  tabs: Tab[];
  activeId: number;
};

export function MediaStack({ tabs, activeId }: Props) {
  const mediaTabs = tabs.filter((tab): tab is MediaTab => tab.kind === "media");
  if (mediaTabs.length === 0) return null;

  return (
    <div className="relative h-full w-full">
      {mediaTabs.map((tab) => {
        const visible = tab.id === activeId;
        return (
          <div
            key={tab.id}
            className={cn(
              "absolute inset-0",
              !visible && "invisible pointer-events-none",
            )}
            aria-hidden={!visible}
          >
            <MediaPane tab={tab} />
          </div>
        );
      })}
    </div>
  );
}

function MediaPane({ tab }: { tab: MediaTab }) {
  const src = useMemo(() => convertFileSrc(tab.path), [tab.path]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-background">
      <div className="flex min-h-0 flex-1 items-center justify-center bg-foreground/[0.025] p-4">
        {tab.mediaKind === "image" ? (
          <img
            src={src}
            alt={tab.title}
            draggable={false}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <video
            src={src}
            controls
            preload="metadata"
            className="max-h-full max-w-full bg-black"
          />
        )}
      </div>
      <div className="shrink-0 border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
        <span className="font-mono">{tab.path}</span>
      </div>
    </div>
  );
}