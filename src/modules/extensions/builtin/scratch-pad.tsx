import { cn } from "@/lib/utils";
import { useState } from "react";
import type { RecallExtension } from "../types";

const EXT_ID = "recall.scratch-pad";
const CATALOG_KEY = "recall.scratch-pad.catalog.v1";
const CANVAS_KIND_PREFIX = `${EXT_ID}:canvas:`;

type CatalogEntry = { id: string; name: string; updatedAt: number };

// ── Catalog helpers ───────────────────────────────────────────────────────────

function loadCatalog(): CatalogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(CATALOG_KEY) ?? "[]") as CatalogEntry[];
  } catch {
    return [];
  }
}

function saveCatalog(catalog: CatalogEntry[]): void {
  try {
    localStorage.setItem(CATALOG_KEY, JSON.stringify(catalog));
  } catch {}
}

function deleteCanvasData(id: string): void {
  try {
    localStorage.removeItem(`recall.scratch-pad.data.${id}`);
  } catch {}
}

function openCanvas(id: string, name: string): void {
  window.dispatchEvent(
    new CustomEvent("recall:open-extension-tab", {
      detail: { kind: `${CANVAS_KIND_PREFIX}${id}`, title: name, data: { id } },
    }),
  );
}

// ── Launcher (sidebar panel) ──────────────────────────────────────────────────

function ScratchPadLauncher() {
  const [catalog, setCatalog] = useState<CatalogEntry[]>(loadCatalog);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const handleCreate = () => {
    const name = newName.trim() || "Untitled Canvas";
    const id = crypto.randomUUID();
    const entry: CatalogEntry = { id, name, updatedAt: Date.now() };
    const next = [entry, ...catalog];
    saveCatalog(next);
    setCatalog(next);
    setCreating(false);
    setNewName("");
    openCanvas(id, name);
  };

  const handleRename = (id: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    const next = catalog.map((e) =>
      e.id === id ? { ...e, name: trimmed, updatedAt: Date.now() } : e,
    );
    saveCatalog(next);
    setCatalog(next);
    setRenaming(null);
  };

  const handleDelete = (id: string) => {
    const next = catalog.filter((e) => e.id !== id);
    saveCatalog(next);
    setCatalog(next);
    deleteCanvasData(id);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/40 px-3 py-2">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          Canvases
        </span>
        <button
          type="button"
          onClick={() => { setCreating(true); setNewName(""); }}
          className="rounded-sm px-1.5 py-0.5 text-[10.5px] font-medium text-primary/80 transition-colors hover:bg-primary/10 hover:text-primary"
        >
          + New
        </button>
      </div>

      {creating && (
        <div className="shrink-0 border-b border-border/40 px-3 py-2">
          <input
            autoFocus
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") setCreating(false);
            }}
            placeholder="Canvas name…"
            className="w-full rounded bg-background/60 border border-border/50 px-2 py-1 text-[11.5px] text-foreground outline-none focus:border-primary/50"
          />
          <div className="mt-1.5 flex gap-1.5">
            <button
              type="button"
              onClick={handleCreate}
              className="flex-1 rounded bg-primary/15 px-2 py-1 text-[10.5px] font-medium text-primary transition-colors hover:bg-primary/25"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded px-2 py-1 text-[10.5px] text-muted-foreground/60 transition-colors hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {catalog.length === 0 && !creating && (
          <div className="px-3 pt-4 text-center text-[11px] text-muted-foreground/50">
            No canvases yet.
            <br />
            Click <span className="text-primary/70">+ New</span> to create one.
          </div>
        )}
        {catalog.map((entry) => (
          <div
            key={entry.id}
            className="group flex items-center gap-1 px-2 py-0.5 hover:bg-accent/50"
          >
            {renaming === entry.id ? (
              <input
                autoFocus
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename(entry.id);
                  if (e.key === "Escape") setRenaming(null);
                }}
                onBlur={() => handleRename(entry.id)}
                className="min-w-0 flex-1 rounded bg-background/60 border border-primary/40 px-1.5 py-0.5 text-[11.5px] text-foreground outline-none"
              />
            ) : (
              <button
                type="button"
                onDoubleClick={() => { setRenaming(entry.id); setRenameValue(entry.name); }}
                onClick={() => openCanvas(entry.id, entry.name)}
                className="min-w-0 flex-1 truncate rounded-sm px-1 py-1 text-left text-[11.5px] text-foreground/80 hover:text-foreground"
                title={`${entry.name}\nDouble-click to rename`}
              >
                <CanvasIcon />
                <span className="ml-1.5">{entry.name}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => handleDelete(entry.id)}
              className={cn(
                "shrink-0 rounded px-1 py-0.5 text-[9.5px] text-muted-foreground/30 transition-colors hover:text-destructive/70",
                renaming !== entry.id ? "opacity-0 group-hover:opacity-100" : "hidden",
              )}
              title="Delete canvas"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Canvas tab ────────────────────────────────────────────────────────────────

import ScratchPadCanvas from "./ScratchPadCanvas";

function ScratchPadTab({ canvasId }: { canvasId: string }) {
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <ScratchPadCanvas storageKey={`recall.scratch-pad.data.${canvasId}`} />
    </div>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const PadIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", verticalAlign: "middle" }}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="m21 15-5-5L5 21" />
  </svg>
);

const CanvasIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", verticalAlign: "middle", opacity: 0.5 }}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="m21 15-5-5L5 21" />
  </svg>
);

// ── Extension manifest ────────────────────────────────────────────────────────

export const scratchPadExtension: RecallExtension = {
  id: EXT_ID,
  name: "Scratch Pad",
  version: "2.0.0",
  description: "Named Excalidraw canvases, each in their own tab.",
  activate(api) {
    const cleanupPanel = api.registerSidebarPanel({
      id: "panel",
      label: "Scratch Pad",
      icon: <PadIcon />,
      render: () => <ScratchPadLauncher />,
    });

    const cleanupTab = api.registerTabRenderer("canvas", {
      canHandle: (kind) => kind.startsWith(CANVAS_KIND_PREFIX),
      render: ({ data }) => {
        const canvasId = (data as { id: string }).id;
        return <ScratchPadTab canvasId={canvasId} />;
      },
    });

    const cleanupCmd = api.registerCommand("open", {
      label: "Open Scratch Pad",
      handler: () => {
        const catalog = loadCatalog();
        if (catalog.length > 0) {
          openCanvas(catalog[0].id, catalog[0].name);
        } else {
          const id = crypto.randomUUID();
          const entry: CatalogEntry = { id, name: "Untitled Canvas", updatedAt: Date.now() };
          saveCatalog([entry]);
          openCanvas(id, entry.name);
        }
      },
    });

    return () => {
      cleanupPanel();
      cleanupTab();
      cleanupCmd();
    };
  },
};
