import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { currentWorkspaceEnv } from "@/modules/workspace";
import { File01Icon, Folder01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { fileIconUrl } from "./lib/iconResolver";

function isAbsolutePath(q: string): boolean {
  return q.startsWith("/") || /^[A-Za-z]:[/\\]/.test(q);
}

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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rootPath: string | null;
  onOpenFile: (path: string) => void;
};

const DEBOUNCE_MS = 180;

export function QuickOpen({ open, onOpenChange, rootPath, onOpenFile }: Props) {
  const showHidden = usePreferencesStore((s) => s.showHidden);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [truncated, setTruncated] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setTruncated(false);
    }
  }, [open]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const q = query.trim();
    if (!q || q.length < 1 || !rootPath) {
      setResults([]);
      setTruncated(false);
      return;
    }
    let alive = true;
    timerRef.current = setTimeout(async () => {
      try {
        const res = await invoke<SearchResult>("fs_search", {
          root: rootPath,
          query: q,
          limit: 100,
          showHidden,
          workspace: currentWorkspaceEnv(),
        });
        if (alive) {
          setResults(res.hits.filter((h) => !h.is_dir));
          setTruncated(res.truncated);
        }
      } catch {
        if (alive) setResults([]);
      }
    }, DEBOUNCE_MS);
    return () => {
      alive = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, rootPath, showHidden]);

  const select = (hit: SearchHit) => {
    onOpenFile(hit.path);
    onOpenChange(false);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Quick Open"
      description="Type to search files in this workspace"
    >
      <CommandInput
        placeholder="Search files…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {query.trim().length > 0 && results.length === 0 && !isAbsolutePath(query.trim()) && (
          <CommandEmpty>No files found.</CommandEmpty>
        )}
        {isAbsolutePath(query.trim()) && (
          <>
            <CommandGroup heading="Direct path">
              <CommandItem
                key="__direct_path__"
                value={query.trim()}
                onSelect={() => {
                  onOpenFile(query.trim());
                  onOpenChange(false);
                }}
                className="gap-2"
              >
                <HugeiconsIcon
                  icon={File01Icon}
                  size={14}
                  strokeWidth={1.75}
                  className="shrink-0 text-muted-foreground"
                />
                <span className="truncate font-medium">Open</span>
                <span className="ml-1 min-w-0 truncate text-[11px] text-muted-foreground font-mono">
                  {query.trim()}
                </span>
              </CommandItem>
            </CommandGroup>
            {results.length > 0 && <CommandSeparator />}
          </>
        )}
        {results.length > 0 && (
          <CommandGroup heading={truncated ? "Results (partial)" : "Files"}>
            {results.map((hit) => {
              const iconUrl = fileIconUrl(hit.name);
              return (
                <CommandItem
                  key={hit.path}
                  value={hit.path}
                  onSelect={() => select(hit)}
                  className="gap-2"
                >
                  {iconUrl ? (
                    <img src={iconUrl} alt="" className="size-4 shrink-0" />
                  ) : (
                    <HugeiconsIcon
                      icon={Folder01Icon}
                      size={14}
                      strokeWidth={1.75}
                      className="shrink-0 text-muted-foreground"
                    />
                  )}
                  <span className="truncate font-medium">{hit.name}</span>
                  <span className="ml-auto shrink-0 truncate text-[11px] text-muted-foreground">
                    {hit.rel}
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}
        {!query.trim() && (
          <div className="py-8 text-center text-xs text-muted-foreground">
            Start typing to search files in this workspace
          </div>
        )}
      </CommandList>
    </CommandDialog>
  );
}
