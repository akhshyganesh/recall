import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { KEY_SEP } from "@/lib/platform";
import type { EditorSymbol, SymbolKind } from "@/modules/editor";
import { useExtensionCommands } from "@/modules/extensions";
import { fileIconUrl } from "@/modules/explorer/lib/iconResolver";
import {
  SHORTCUT_GROUPS,
  SHORTCUTS,
  getBindingTokens,
  type Shortcut,
  type ShortcutId,
} from "@/modules/shortcuts";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { currentWorkspaceEnv } from "@/modules/workspace";
import { File01Icon, Folder01Icon, SearchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Command as CommandPrimitive } from "cmdk";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useRef, useState } from "react";

const EXCLUDED_IDS = new Set<ShortcutId>(["command.palette", "tab.selectByIndex"]);
const DEBOUNCE_MS = 180;

type SearchHit = { path: string; rel: string; name: string; is_dir: boolean };
type SearchResult = { hits: SearchHit[]; truncated: boolean };

function isAbsolutePath(q: string): boolean {
  return q.startsWith("/") || /^[A-Za-z]:[/\\]/.test(q);
}

function fuzzyMatch(text: string, query: string): boolean {
  if (!query) return true;
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  if (t.includes(q)) return true;
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

/** Active editor surface for the "@" go-to-symbol mode. */
export type SymbolSource = {
  getSymbols: () => EditorSymbol[];
  revealLine: (line: number) => boolean;
};

const SYMBOL_KIND_LABELS: Record<SymbolKind, string> = {
  function: "fn",
  method: "method",
  class: "class",
  interface: "interface",
  enum: "enum",
  type: "type",
  struct: "struct",
  trait: "trait",
  impl: "impl",
  module: "mod",
  constant: "const",
  property: "key",
  heading: "h",
};

const MAX_SYMBOL_RESULTS = 200;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rootPath: string | null;
  onOpenFile: (path: string) => void;
  onRunCommand: (id: ShortcutId) => void;
  initialQuery?: string;
  /** Symbols provider for the active editor tab, if any. */
  symbolSource?: SymbolSource | null;
};

export function UnifiedPalette({
  open,
  onOpenChange,
  rootPath,
  onOpenFile,
  onRunCommand,
  initialQuery = "",
  symbolSource = null,
}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const showHidden = usePreferencesStore((s) => s.showHidden);
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);
  const extensionCommands = useExtensionCommands();

  const isCommandMode = query.trimStart().startsWith(">");
  const isSymbolMode = !isCommandMode && query.trimStart().startsWith("@");
  const effectiveSearch = isCommandMode
    ? query.slice(query.indexOf(">") + 1).trim()
    : isSymbolMode
      ? query.slice(query.indexOf("@") + 1).trim()
      : query.trim();

  useEffect(() => {
    if (open) setQuery(initialQuery);
    else setQuery("");
  }, [open, initialQuery]);

  // File search
  const [fileResults, setFileResults] = useState<SearchHit[]>([]);
  const [fileTruncated, setFileTruncated] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Symbols of the active editor — snapshotted once per palette open.
  const [symbols, setSymbols] = useState<EditorSymbol[]>([]);
  useEffect(() => {
    if (!open || !isSymbolMode) return;
    setSymbols(symbolSource?.getSymbols() ?? []);
    // Intentionally not re-reading on every keystroke; the doc can't change
    // while the palette is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isSymbolMode]);

  const filteredSymbols = useMemo(() => {
    if (!isSymbolMode) return [];
    return symbols
      .filter((s) => fuzzyMatch(s.name, effectiveSearch))
      .slice(0, MAX_SYMBOL_RESULTS);
  }, [isSymbolMode, symbols, effectiveSearch]);

  useEffect(() => {
    if (isCommandMode || isSymbolMode) {
      setFileResults([]);
      setFileTruncated(false);
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!effectiveSearch || !rootPath) {
      setFileResults([]);
      setFileTruncated(false);
      return;
    }
    let alive = true;
    timerRef.current = setTimeout(async () => {
      try {
        const res = await invoke<SearchResult>("fs_search", {
          root: rootPath,
          query: effectiveSearch,
          limit: 100,
          showHidden,
          workspace: currentWorkspaceEnv(),
        });
        if (alive) {
          setFileResults(res.hits.filter((h) => !h.is_dir));
          setFileTruncated(res.truncated);
        }
      } catch {
        if (alive) setFileResults([]);
      }
    }, DEBOUNCE_MS);
    return () => {
      alive = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [effectiveSearch, isCommandMode, isSymbolMode, rootPath, showHidden]);

  // Command filtering
  const commandGroups = useMemo(() => {
    if (!isCommandMode) return [];
    const result: Array<{ group: string; items: Shortcut[] }> = [];
    for (const group of SHORTCUT_GROUPS) {
      const items = SHORTCUTS.filter(
        (s) =>
          s.group === group &&
          !EXCLUDED_IDS.has(s.id) &&
          fuzzyMatch(s.label, effectiveSearch),
      );
      if (items.length > 0) result.push({ group, items });
    }
    return result;
  }, [isCommandMode, effectiveSearch]);

  const filteredExtensions = useMemo(() => {
    if (!isCommandMode) return [];
    return extensionCommands.filter(({ def }) =>
      fuzzyMatch(def.label, effectiveSearch),
    );
  }, [isCommandMode, effectiveSearch, extensionCommands]);

  const hasCommands = commandGroups.length > 0 || filteredExtensions.length > 0;
  const hasDirectPath =
    !isCommandMode && !isSymbolMode && isAbsolutePath(effectiveSearch);
  const hasFiles = fileResults.length > 0;
  const showEmpty = isCommandMode
    ? effectiveSearch.length > 0 && !hasCommands
    : isSymbolMode
      ? filteredSymbols.length === 0
      : effectiveSearch.length > 0 && !hasDirectPath && !hasFiles;

  const revealSymbol = (s: EditorSymbol) => {
    onOpenChange(false);
    setTimeout(() => symbolSource?.revealLine(s.line), 16);
  };

  const runCommand = (id: ShortcutId) => {
    onOpenChange(false);
    setTimeout(() => onRunCommand(id), 16);
  };

  const runExtension = (handler: () => void) => {
    onOpenChange(false);
    setTimeout(handler, 16);
  };

  const openFile = (path: string) => {
    onOpenFile(path);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[28%] translate-y-0 w-[620px] sm:max-w-[620px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg p-0 gap-0"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Palette</DialogTitle>
          <DialogDescription>Search files and commands</DialogDescription>
        </DialogHeader>

        <Command shouldFilter={false} className="rounded-none bg-transparent p-0">
          {/* Input row */}
          <div className="flex items-center gap-2 border-b border-border/40 px-3 py-1.5">
            {isCommandMode || isSymbolMode ? (
              <span className="shrink-0 select-none rounded px-1 py-0.5 font-mono text-[10px] font-bold text-primary bg-primary/10">
                {isCommandMode ? ">" : "@"}
              </span>
            ) : (
              <HugeiconsIcon
                icon={SearchIcon}
                size={13}
                strokeWidth={2}
                className="shrink-0 text-muted-foreground/50"
              />
            )}
            <CommandPrimitive.Input
              placeholder={
                isCommandMode
                  ? "Search commands…"
                  : isSymbolMode
                    ? "Go to symbol…"
                    : "Search files… (> for commands, @ for symbols)"
              }
              value={query}
              onValueChange={setQuery}
              className="h-7 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
            />
          </div>

          <CommandList className="max-h-[340px] pb-0">
            {showEmpty && (
              <CommandEmpty className="py-5 text-xs">
                {isCommandMode
                  ? "No commands found."
                  : isSymbolMode
                    ? "No symbols found."
                    : "No files found."}
              </CommandEmpty>
            )}

            {/* File mode: empty hint */}
            {!isCommandMode && !isSymbolMode && !effectiveSearch && (
              <div className="px-3 py-5 text-center text-xs text-muted-foreground/60">
                Type to search files &nbsp;·&nbsp;{" "}
                <span className="font-mono font-medium text-foreground/40">&gt;</span>{" "}
                for commands &nbsp;·&nbsp;{" "}
                <span className="font-mono font-medium text-foreground/40">@</span>{" "}
                for symbols
              </div>
            )}

            {/* Symbol mode: active editor symbols */}
            {isSymbolMode && filteredSymbols.length > 0 && (
              <CommandGroup
                heading="Symbols"
                className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10px]"
              >
                {filteredSymbols.map((s, i) => (
                  <CommandItem
                    key={`${s.from}-${i}`}
                    value={`${s.name}-${s.from}`}
                    onSelect={() => revealSymbol(s)}
                    className="mx-1 rounded-lg px-2 py-1 text-xs"
                  >
                    <span
                      className="shrink-0"
                      style={{ width: `${Math.min(s.depth, 6) * 10}px` }}
                    />
                    <span className="shrink-0 select-none rounded bg-muted px-1 font-mono text-[9px] uppercase text-muted-foreground">
                      {SYMBOL_KIND_LABELS[s.kind]}
                    </span>
                    <span className="truncate font-medium">{s.name}</span>
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                      :{s.line}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* Direct absolute path */}
            {hasDirectPath && (
              <CommandGroup
                heading="Direct path"
                className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10px]"
              >
                <CommandItem
                  value={effectiveSearch}
                  onSelect={() => openFile(effectiveSearch)}
                  className="mx-1 rounded-lg px-2 py-1 text-xs"
                >
                  <HugeiconsIcon
                    icon={File01Icon}
                    size={13}
                    strokeWidth={1.75}
                    className="shrink-0 text-muted-foreground"
                  />
                  <span className="font-medium">Open</span>
                  <span className="ml-1 min-w-0 truncate font-mono text-[11px] text-muted-foreground">
                    {effectiveSearch}
                  </span>
                </CommandItem>
              </CommandGroup>
            )}

            {/* File results */}
            {hasFiles && (
              <CommandGroup
                heading={fileTruncated ? "Results (partial)" : "Files"}
                className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10px]"
              >
                {fileResults.map((hit) => {
                  const iconUrl = fileIconUrl(hit.name);
                  return (
                    <CommandItem
                      key={hit.path}
                      value={hit.path}
                      onSelect={() => openFile(hit.path)}
                      className="mx-1 rounded-lg px-2 py-1 text-xs"
                    >
                      {iconUrl ? (
                        <img src={iconUrl} alt="" className="size-3.5 shrink-0" />
                      ) : (
                        <HugeiconsIcon
                          icon={Folder01Icon}
                          size={13}
                          strokeWidth={1.75}
                          className="shrink-0 text-muted-foreground"
                        />
                      )}
                      <span className="truncate font-medium">{hit.name}</span>
                      <span className="ml-auto shrink-0 truncate text-[10px] text-muted-foreground">
                        {hit.rel}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {/* Command mode: grouped shortcuts */}
            {commandGroups.map(({ group, items }) => (
              <CommandGroup
                key={group}
                heading={group}
                className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10px]"
              >
                {items.map((s) => {
                  const bindings = userShortcuts[s.id] ?? s.defaultBindings;
                  const tokens = getBindingTokens(bindings[0]);
                  return (
                    <CommandItem
                      key={s.id}
                      value={s.label}
                      onSelect={() => runCommand(s.id)}
                      className="mx-1 rounded-lg px-2 py-1 text-xs"
                    >
                      <span className="flex-1">{s.label}</span>
                      {tokens.length > 0 && (
                        <CommandShortcut className="text-[10px]">
                          {tokens.join(KEY_SEP)}
                        </CommandShortcut>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}

            {/* Extension commands */}
            {filteredExtensions.length > 0 && (
              <>
                {commandGroups.length > 0 && <CommandSeparator />}
                <CommandGroup
                  heading="Extensions"
                  className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[10px]"
                >
                  {filteredExtensions.map(({ id, def }) => (
                    <CommandItem
                      key={id}
                      value={def.label}
                      onSelect={() => runExtension(def.handler)}
                      className="mx-1 rounded-lg px-2 py-1 text-xs"
                    >
                      {def.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
