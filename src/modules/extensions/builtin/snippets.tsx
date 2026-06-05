import { cn } from "@/lib/utils";
import { useState } from "react";
import type { RecallExtension } from "../types";

const STORAGE_KEY = "recall.snippets.v1";

interface Snippet {
  id: string;
  label: string;
  command: string;
}

function load(): Snippet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Snippet[]) : [];
  } catch {
    return [];
  }
}

function persist(items: Snippet[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
}

function SnippetsPanel() {
  const [snippets, setSnippets] = useState<Snippet[]>(load);
  const [label, setLabel] = useState("");
  const [command, setCommand] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const update = (next: Snippet[]) => { setSnippets(next); persist(next); };

  const add = () => {
    const l = label.trim();
    const c = command.trim();
    if (!l || !c) return;
    update([{ id: `${Date.now()}`, label: l, command: c }, ...snippets]);
    setLabel("");
    setCommand("");
  };

  const remove = (id: string) => update(snippets.filter((s) => s.id !== id));

  const copy = async (id: string, text: string) => {
    try { await navigator.clipboard.writeText(text); } catch {}
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
  };

  const filtered = search.trim()
    ? snippets.filter(
        (s) =>
          s.label.toLowerCase().includes(search.toLowerCase()) ||
          s.command.toLowerCase().includes(search.toLowerCase()),
      )
    : snippets;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/30 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
          Snippets
        </span>
      </div>

      {/* Add form */}
      <div className="flex flex-col gap-1.5 border-b border-border/30 px-2.5 py-2">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Name (e.g. deploy)"
          className={cn(
            "h-7 rounded-md border border-border/40 bg-muted/30 px-2.5 text-[11.5px]",
            "outline-none placeholder:text-muted-foreground/35",
            "focus:border-ring focus:ring-1 focus:ring-ring/20",
          )}
        />
        <div className="flex gap-1.5">
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            placeholder="Command…"
            spellCheck={false}
            className={cn(
              "h-7 min-w-0 flex-1 rounded-md border border-border/40 bg-muted/30 px-2.5",
              "font-mono text-[11px] outline-none placeholder:text-muted-foreground/35",
              "focus:border-ring focus:ring-1 focus:ring-ring/20",
            )}
          />
          <button
            type="button"
            onClick={add}
            disabled={!label.trim() || !command.trim()}
            className="h-7 rounded-md bg-primary px-2.5 text-[11px] font-medium text-primary-foreground transition-opacity disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>

      {/* Search */}
      {snippets.length > 2 && (
        <div className="border-b border-border/30 px-2.5 py-1.5">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter snippets…"
            className={cn(
              "h-6 w-full rounded-md bg-muted/20 px-2.5 text-[11px]",
              "outline-none placeholder:text-muted-foreground/30",
              "focus:ring-1 focus:ring-ring/20",
            )}
          />
        </div>
      )}

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-4 py-10 text-center">
            <SnippetEmptyIcon className="text-muted-foreground/20" />
            <span className="text-[11px] text-muted-foreground/35">
              {snippets.length === 0 ? "No snippets yet" : "No matches"}
            </span>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border/25">
            {filtered.map((s) => (
              <div
                key={s.id}
                className="group flex items-start gap-2 px-2.5 py-2 transition-colors hover:bg-muted/20"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[11.5px] font-medium leading-tight">{s.label}</div>
                  <div className="mt-0.5 truncate font-mono text-[10.5px] text-muted-foreground/50">
                    {s.command}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void copy(s.id, s.command)}
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-medium transition-all",
                      copied === s.id
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground/40 hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {copied === s.id ? "Copied" : "Copy"}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(s.id)}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="Delete"
                  >
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
                      <path d="M1 1l10 10M11 1L1 11" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SnippetEmptyIcon({ className }: { className?: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}

const SnippetsRailIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
);

export const snippetsExtension: RecallExtension = {
  id: "recall.snippets",
  name: "Snippets",
  version: "1.0.0",
  description: "Save and copy frequently used shell commands.",
  activate(api) {
    return api.registerSidebarPanel({
      id: "panel",
      label: "Snippets",
      icon: <SnippetsRailIcon />,
      render: () => <SnippetsPanel />,
    });
  },
};
