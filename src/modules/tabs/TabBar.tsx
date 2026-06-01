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
  Cancel01Icon,
  Clock01Icon,
  ComputerTerminal02Icon,
  DatabaseIcon,
  GitBranchIcon,
  GitCompareIcon,
  GridViewIcon,
  Globe02Icon,
  PencilEdit02Icon,
  PlusSignIcon,
  Settings01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { EditorTab, MediaTab, Tab, TerminalTab } from "./lib/useTabs";

type Props = {
  tabs: Tab[];
  activeId: number;
  onSelect: (id: number) => void;
  onNew: () => void;
  onNewPreview: () => void;
  onNewEditor: () => void;
  onNewPlanner: () => void;
  onNewGitGraph: () => void;
  onClose: (id: number) => void;
  onRename: (id: number, title: string) => void;
  /** Pin (promote) a preview tab to persistent on double-click. */
  onPin: (id: number) => void;
  compact?: boolean;
};

export function TabBar({
  tabs,
  activeId,
  onSelect,
  onNew,
  onNewPreview,
  onNewEditor,
  onNewPlanner,
  onNewGitGraph,
  onClose,
  onRename,
  onPin,
  compact,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const skipRenameBlurRef = useRef(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
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

  return (
    <div
      ref={scrollRef}
      data-tauri-drag-region
      className="min-w-0 shrink overflow-x-auto rounded-full bg-background/65 p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex w-max items-center gap-1">
        <Tabs
          value={String(activeId)}
          onValueChange={(v) => onSelect(Number(v))}
        >
          <TabsList className="h-7 w-max gap-1 rounded-full bg-transparent p-0">
            {tabs.map((t) => {
              const isPreview =
                (t.kind === "editor" && (t as EditorTab).preview) ||
                (t.kind === "media" && (t as MediaTab).preview);
              const label = labelFor(t, terminalLabels);
              return (
                <ContextMenu key={t.id}>
                  <ContextMenuTrigger asChild>
                    <TabsTrigger
                      value={String(t.id)}
                      data-tab-id={t.id}
                      title={tooltipFor(t, label)}
                      onDoubleClick={() => isPreview && onPin(t.id)}
                      className={cn(
                        "group h-7 shrink-0 justify-between gap-1.5 rounded-full border-0 text-xs font-semibold text-muted-foreground transition-all data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:shadow-sm hover:bg-muted hover:text-foreground",
                        compact
                          ? "px-1.5!"
                          : tabs.length === 1
                            ? "px-2!"
                            : "ps-2! pe-1!",
                      )}
                    >
                      <span
                        className={cn(
                          "flex items-center gap-1.5 truncate",
                          compact ? "max-w-48" : "max-w-80",
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
                            className="h-5 min-w-18 rounded-md border border-border/70 bg-background px-1.5 text-xs text-foreground outline-none"
                          />
                        ) : (
                          <span className={cn("truncate", isPreview && "italic")}>
                            {label}
                          </span>
                        )}
                        {t.kind === "editor" && t.dirty ? (
                          <span
                            aria-label="Unsaved changes"
                            className="size-1.5 shrink-0 rounded-full bg-foreground/70"
                          />
                        ) : null}
                      </span>
                      {tabs.length > 1 && (
                        <span
                          role="button"
                          aria-label="Close tab"
                          onClick={(e) => {
                            e.stopPropagation();
                            onClose(t.id);
                          }}
                          className="rounded-full p-0.5 opacity-0 transition-opacity hover:bg-accent hover:opacity-100 group-hover:opacity-60"
                        >
                          <HugeiconsIcon
                            icon={Cancel01Icon}
                            size={11}
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
                      </>
                    ) : null}
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </TabsList>
        </Tabs>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground aria-expanded:bg-foreground aria-expanded:text-background"
              title="New tab"
            >
              <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={2} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-44">
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
            <DropdownMenuItem onSelect={() => onNewPlanner()}>
              <HugeiconsIcon icon={GridViewIcon} size={14} strokeWidth={1.75} />
              <span className="flex-1">Planner</span>
              <span className="text-xs text-muted-foreground">
                {fmtShortcut(MOD_KEY, "P")}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onNewGitGraph()}>
              <HugeiconsIcon icon={GitBranchIcon} size={14} strokeWidth={1.75} />
              <span className="flex-1">Git Graph</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
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
        icon={DatabaseIcon}
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
  if (tab.kind === "settings") {
    return (
      <HugeiconsIcon
        icon={Settings01Icon}
        size={14}
        strokeWidth={2}
        className="shrink-0"
      />
    );
  }
  if (tab.kind === "planner") {
    return (
      <HugeiconsIcon
        icon={GridViewIcon}
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
  if (t.kind === "settings") return t.title;
  if (t.kind === "planner") return t.title;
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
