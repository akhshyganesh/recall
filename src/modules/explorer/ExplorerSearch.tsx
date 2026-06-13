import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Cancel01Icon,
  FileSearchIcon,
  Folder01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { invoke } from "@tauri-apps/api/core";
import { currentWorkspaceEnv } from "@/modules/workspace";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { fileIconUrl } from "./lib/iconResolver";
import { copyToClipboard, revealInFinder } from "./lib/contextActions";
import { COMPACT_CONTENT, COMPACT_ITEM } from "./lib/menuItemClass";
import { cn } from "@/lib/utils";

type SearchHit = {
  path: string;
  rel: string;
  name: string;
  is_dir: boolean;
};

type SearchResult = {
  hits: SearchHit[];
  truncated: boolean;
};

type ContentMatch = {
  path: string;
  absolute_path: string;
  line_number: number;
  line_text: string;
  match_start: number;
  match_end: number;
};

type ContentSearchResult = {
  matches: ContentMatch[];
  truncated: boolean;
};

type ContentMatchGroup = {
  path: string;
  absolute_path: string;
  name: string;
  matches: ContentMatch[];
};

const MIN_QUERY_LEN = 2;
const DEBOUNCE_MS = 300;

type Props = {
  rootPath: string;
  onOpenFile: (path: string) => void;
  open: boolean;
  onRequestClose: () => void;
  onActiveChange?: (active: boolean) => void;
  onRevealInTerminal?: (path: string) => void;
};

export type ExplorerSearchHandle = {
  focus: () => void;
  isFocused: () => boolean;
};

function highlightLine(text: string, start: number, end: number) {
  const before = text.slice(0, start);
  const match = text.slice(start, end);
  const after = text.slice(end);
  return (
    <>
      {before}
      <mark className="rounded-[2px] bg-primary/25 text-foreground not-italic px-px">
        {match}
      </mark>
      {after}
    </>
  );
}

export const ExplorerSearch = forwardRef<ExplorerSearchHandle, Props>(function ExplorerSearch({
  rootPath,
  onOpenFile,
  open,
  onRequestClose,
  onActiveChange,
  onRevealInTerminal,
}: Props,
  ref,
) {
  const showHidden = usePreferencesStore((s) => s.showHidden);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"files" | "content">("files");

  // files mode state
  const [fileResults, setFileResults] = useState<SearchHit[]>([]);
  const [fileTruncated, setFileTruncated] = useState(false);

  // content mode state
  const [contentGroups, setContentGroups] = useState<ContentMatchGroup[]>([]);
  const [contentTruncated, setContentTruncated] = useState(false);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastKeyboardNavAt = useRef(0);

  const active = query.trim().length > 0;

  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    } else {
      setQuery("");
      setFileResults([]);
      setContentGroups([]);
      setSelectedIndex(0);
      setSearching(false);
      setFileTruncated(false);
      setContentTruncated(false);
    }
  }, [open]);

  // Reset results when mode changes
  useEffect(() => {
    setFileResults([]);
    setContentGroups([]);
    setSelectedIndex(0);
  }, [mode]);

  // File name search
  useEffect(() => {
    if (mode !== "files") return;
    const q = query.trim();
    if (q.length < MIN_QUERY_LEN) {
      setFileResults([]);
      setSelectedIndex(0);
      setSearching(false);
      setFileTruncated(false);
      return;
    }
    setSearching(true);
    let alive = true;
    const handle = setTimeout(async () => {
      try {
        const res = await invoke<SearchResult>("fs_search", {
          root: rootPath,
          query: q,
          limit: 200,
          showHidden,
          workspace: currentWorkspaceEnv(),
        });
        if (alive) {
          setFileResults(res.hits);
          setFileTruncated(res.truncated);
          setSelectedIndex(0);
        }
      } catch (e) {
        if (alive) {
          console.error("fs_search failed:", e);
          setFileResults([]);
          setFileTruncated(false);
          setSelectedIndex(0);
        }
      } finally {
        if (alive) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      alive = false;
      clearTimeout(handle);
    };
  }, [query, rootPath, showHidden, mode]);

  // Content search
  useEffect(() => {
    if (mode !== "content") return;
    const q = query.trim();
    if (q.length < MIN_QUERY_LEN) {
      setContentGroups([]);
      setSelectedIndex(0);
      setSearching(false);
      setContentTruncated(false);
      return;
    }
    setSearching(true);
    let alive = true;
    const handle = setTimeout(async () => {
      try {
        const res = await invoke<ContentSearchResult>("fs_content_search", {
          root: rootPath,
          query: q,
          options: { case_sensitive: false, regex: false },
          workspace: currentWorkspaceEnv(),
        });
        if (alive) {
          // Group matches by file
          const groupMap = new Map<string, ContentMatchGroup>();
          for (const m of res.matches) {
            if (!groupMap.has(m.path)) {
              const namePart = m.path.includes("/")
                ? m.path.slice(m.path.lastIndexOf("/") + 1)
                : m.path;
              groupMap.set(m.path, {
                path: m.path,
                absolute_path: m.absolute_path,
                name: namePart,
                matches: [],
              });
            }
            groupMap.get(m.path)!.matches.push(m);
          }
          setContentGroups(Array.from(groupMap.values()));
          setContentTruncated(res.truncated);
          setSelectedIndex(0);
        }
      } catch (e) {
        if (alive) {
          console.error("fs_content_search failed:", e);
          setContentGroups([]);
          setContentTruncated(false);
          setSelectedIndex(0);
        }
      } finally {
        if (alive) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      alive = false;
      clearTimeout(handle);
    };
  }, [query, rootPath, mode]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        requestAnimationFrame(() => {
          inputRef.current?.focus();
        });
      },
      isFocused: () => document.activeElement === inputRef.current,
    }),
    [],
  );

  // Flat navigable items for keyboard nav
  const flatItems: Array<{ path: string; isDir?: boolean }> =
    mode === "files"
      ? fileResults.map((h) => ({ path: h.path, isDir: h.is_dir }))
      : contentGroups.flatMap((g) =>
          g.matches.map(() => ({ path: g.absolute_path })),
        );

  useEffect(() => {
    if (active && flatItems.length > 0) {
      const el = scrollRef.current?.querySelector(`[data-nav-index="${selectedIndex}"]`);
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, flatItems.length, active]);

  return (
    <div className="flex flex-col">
      {open ? (
        <div className="shrink-0 px-2 pt-1.5 pb-1 animate-in fade-in-0 slide-in-from-top-3 duration-150">
          <div className="relative">
            <HugeiconsIcon
              icon={Search01Icon}
              size={13}
              strokeWidth={2}
              className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  onRequestClose();
                  return;
                }
                if (flatItems.length > 0) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    lastKeyboardNavAt.current = Date.now();
                    setSelectedIndex((prev) => (prev + 1) % flatItems.length);
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    lastKeyboardNavAt.current = Date.now();
                    setSelectedIndex(
                      (prev) => (prev - 1 + flatItems.length) % flatItems.length,
                    );
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    const item = flatItems[selectedIndex];
                    if (item && !item.isDir) onOpenFile(item.path);
                  }
                }
              }}
              placeholder={mode === "files" ? "Search files…" : "Search in files…"}
              className="h-7 pr-7 pl-6.5 text-xs"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute top-1/2 right-3 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Clear search"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
              </button>
            ) : null}
          </div>
          {/* Mode toggle */}
          <div className="mt-1 flex gap-0.5">
            <button
              type="button"
              onClick={() => setMode("files")}
              className={cn(
                "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                mode === "files"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
              )}
            >
              <HugeiconsIcon icon={Search01Icon} size={10} strokeWidth={2} />
              Files
            </button>
            <button
              type="button"
              onClick={() => setMode("content")}
              className={cn(
                "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                mode === "content"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
              )}
            >
              <HugeiconsIcon icon={FileSearchIcon} size={10} strokeWidth={2} />
              Contents
            </button>
          </div>
        </div>
      ) : null}

      {active ? (
        <ScrollArea className="min-h-0 flex-1">
          <div className="py-1" ref={scrollRef}>
            {searching && (mode === "files" ? fileResults.length === 0 : contentGroups.length === 0) ? (
              <div className="px-3 py-2 text-[11px] text-muted-foreground">
                Searching…
              </div>
            ) : mode === "files" ? (
              <>
                {fileResults.length === 0 ? (
                  <div className="px-3 py-2 text-[11px] text-muted-foreground">
                    No matches
                  </div>
                ) : (
                  fileResults.map((hit, index) => {
                    const url = hit.is_dir ? null : fileIconUrl(hit.name);
                    const isSelected = index === selectedIndex;
                    return (
                      <ContextMenu key={hit.path}>
                        <ContextMenuTrigger asChild>
                          <button
                            type="button"
                            data-nav-index={index}
                            onClick={() => { if (!hit.is_dir) onOpenFile(hit.path); }}
                            onMouseEnter={() => {
                              if (Date.now() - lastKeyboardNavAt.current > 250) {
                                setSelectedIndex(index);
                              }
                            }}
                            className={cn(
                              "flex w-full items-center gap-1.5 px-2 py-1 text-left text-xs transition-colors",
                              isSelected ? "bg-accent text-foreground" : "hover:bg-accent/50 text-foreground/80"
                            )}
                            title={hit.path}
                          >
                            {url ? (
                              <img src={url} alt="" className="size-3.5 shrink-0" />
                            ) : (
                              <HugeiconsIcon
                                icon={Folder01Icon}
                                size={13}
                                strokeWidth={1.75}
                                className="shrink-0 text-muted-foreground"
                              />
                            )}
                            <span className="truncate">{hit.name}</span>
                            <span className="ml-auto truncate text-[10px] text-muted-foreground">
                              {hit.rel}
                            </span>
                          </button>
                        </ContextMenuTrigger>
                        <ContextMenuContent className={COMPACT_CONTENT}>
                          {!hit.is_dir && (
                            <ContextMenuItem
                              className={COMPACT_ITEM}
                              onSelect={() => onOpenFile(hit.path)}
                            >
                              Open
                            </ContextMenuItem>
                          )}
                          {hit.is_dir && onRevealInTerminal && (
                            <ContextMenuItem
                              className={COMPACT_ITEM}
                              onSelect={() => onRevealInTerminal(hit.path)}
                            >
                              Open in Terminal
                            </ContextMenuItem>
                          )}
                          <ContextMenuItem
                            className={COMPACT_ITEM}
                            onSelect={() => void revealInFinder(hit.path)}
                          >
                            Reveal in Finder
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem
                            className={COMPACT_ITEM}
                            onSelect={() => void copyToClipboard(hit.path)}
                          >
                            Copy Path
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    );
                  })
                )}
                {fileTruncated && fileResults.length > 0 ? (
                  <div className="px-3 py-1.5 text-[10px] text-muted-foreground">
                    Showing partial results — refine your query.
                  </div>
                ) : null}
              </>
            ) : (
              /* Content search results grouped by file */
              <>
                {contentGroups.length === 0 ? (
                  <div className="px-3 py-2 text-[11px] text-muted-foreground">
                    No matches
                  </div>
                ) : (
                  (() => {
                    let navIndex = 0;
                    return contentGroups.map((group) => {
                      const url = fileIconUrl(group.name);
                      return (
                        <div key={group.path}>
                          {/* File header */}
                          <button
                            type="button"
                            onClick={() => onOpenFile(group.absolute_path)}
                            className="flex w-full items-center gap-1.5 px-2 pt-1.5 pb-0.5 text-left hover:bg-accent/40 transition-colors"
                          >
                            {url ? (
                              <img src={url} alt="" className="size-3.5 shrink-0" />
                            ) : null}
                            <span className="truncate text-[11px] font-medium text-foreground/90">
                              {group.name}
                            </span>
                            <span className="ml-auto truncate text-[10px] text-muted-foreground">
                              {group.path.includes("/") ? group.path.slice(0, group.path.lastIndexOf("/")) : ""}
                            </span>
                            <span className="ml-1 shrink-0 rounded bg-muted px-1 py-px text-[9px] text-muted-foreground">
                              {group.matches.length}
                            </span>
                          </button>
                          {/* Match lines */}
                          {group.matches.map((m) => {
                            const idx = navIndex++;
                            const isSelected = idx === selectedIndex;
                            return (
                              <button
                                key={`${m.line_number}-${m.match_start}`}
                                type="button"
                                data-nav-index={idx}
                                onClick={() => onOpenFile(group.absolute_path)}
                                onMouseEnter={() => {
                                  if (Date.now() - lastKeyboardNavAt.current > 250) {
                                    setSelectedIndex(idx);
                                  }
                                }}
                                className={cn(
                                  "flex w-full items-center gap-2 px-2 py-0.5 text-left font-mono text-[11px] transition-colors",
                                  isSelected ? "bg-accent text-foreground" : "hover:bg-accent/50 text-foreground/75",
                                )}
                              >
                                <span className="w-7 shrink-0 text-right text-[10px] text-muted-foreground select-none">
                                  {m.line_number}
                                </span>
                                <span className="min-w-0 flex-1 truncate">
                                  {highlightLine(m.line_text.trimStart(), Math.max(0, m.match_start - (m.line_text.length - m.line_text.trimStart().length)), Math.max(0, m.match_end - (m.line_text.length - m.line_text.trimStart().length)))}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      );
                    });
                  })()
                )}
                {contentTruncated && contentGroups.length > 0 ? (
                  <div className="px-3 py-1.5 text-[10px] text-muted-foreground">
                    Showing partial results — refine your query.
                  </div>
                ) : null}
              </>
            )}
          </div>
        </ScrollArea>
      ) : null}
    </div>
  );
});
