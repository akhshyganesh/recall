import { cn } from "@/lib/utils";
import { useState } from "react";
import type { RecallExtension } from "../types";
import { useScopedStorageKey, useWorkspacePath } from "../WorkspaceContext";
import { PanelShell } from "./PanelShell";

const BASE_KEY = "recall.todo.v1";
const EXT_ID = "recall.todo";

interface TodoItem {
  id: string;
  text: string;
  done: boolean;
}

function loadItems(key: string): TodoItem[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as TodoItem[]) : [];
  } catch {
    return [];
  }
}

function persistItems(key: string, items: TodoItem[]) {
  try { localStorage.setItem(key, JSON.stringify(items)); } catch {}
}

function TodoPanel() {
  const workspacePath = useWorkspacePath();
  const storageKey = useScopedStorageKey(BASE_KEY, EXT_ID, workspacePath);
  const [items, setItems] = useState<TodoItem[]>(() => loadItems(storageKey));
  const [input, setInput] = useState("");

  const update = (next: TodoItem[]) => { setItems(next); persistItems(storageKey, next); };

  const add = () => {
    const text = input.trim();
    if (!text) return;
    update([...items, { id: `${Date.now()}`, text, done: false }]);
    setInput("");
  };

  const toggle = (id: string) =>
    update(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));

  const remove = (id: string) => update(items.filter((i) => i.id !== id));
  const clearDone = () => update(items.filter((i) => !i.done));

  const onScopeChange = (scope: "global" | "workspace") => {
    const newKey = scope === "workspace" && workspacePath
      ? storageKey
      : BASE_KEY;
    setItems(loadItems(newKey));
  };

  const pending = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);

  return (
    <PanelShell extensionId={EXT_ID} title="Todo" onScopeChange={onScopeChange}>
      {/* Input */}
      <div className="border-b border-border/30 px-2.5 py-2">
        <div className="flex gap-1.5">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            placeholder="Add a task…"
            className={cn(
              "h-7 min-w-0 flex-1 rounded-md border border-border/40 bg-muted/30",
              "px-2.5 text-[11.5px] outline-none",
              "placeholder:text-muted-foreground/35",
              "focus:border-ring focus:ring-1 focus:ring-ring/20",
            )}
          />
          <button
            type="button"
            onClick={add}
            disabled={!input.trim()}
            className="h-7 rounded-md bg-primary px-2.5 text-[11px] font-medium text-primary-foreground transition-opacity disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-4 py-10 text-center">
            <TodoIcon className="text-muted-foreground/20" />
            <span className="text-[11px] text-muted-foreground/35">No tasks yet</span>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 p-2">
            {pending.map((item) => (
              <TodoRow key={item.id} item={item} onToggle={toggle} onRemove={remove} />
            ))}
            {done.length > 0 && pending.length > 0 && (
              <div className="my-1 border-t border-border/25" />
            )}
            {done.map((item) => (
              <TodoRow key={item.id} item={item} onToggle={toggle} onRemove={remove} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {items.length > 0 && (
        <div className="flex items-center justify-between border-t border-border/30 px-3 py-1.5">
          <span className="font-mono text-[10px] text-muted-foreground/35">
            {done.length}/{items.length} done
          </span>
          {done.length > 0 && (
            <button
              type="button"
              onClick={clearDone}
              className="text-[10px] text-muted-foreground/35 transition-colors hover:text-foreground"
            >
              Clear done
            </button>
          )}
        </div>
      )}
    </PanelShell>
  );
}

function TodoRow({
  item,
  onToggle,
  onRemove,
}: {
  item: TodoItem;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="group flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/30">
      <input
        type="checkbox"
        checked={item.done}
        onChange={() => onToggle(item.id)}
        className="mt-0.5 shrink-0 accent-primary"
      />
      <span
        className={cn(
          "min-w-0 flex-1 break-words text-[11.5px] leading-snug",
          item.done && "text-muted-foreground/40 line-through",
        )}
      >
        {item.text}
      </span>
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        className="mt-0.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        aria-label="Remove"
      >
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
          <path d="M1 1l10 10M11 1L1 11" />
        </svg>
      </button>
    </div>
  );
}

function TodoIcon({ className }: { className?: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="9" y1="6" x2="20" y2="6"/>
      <line x1="9" y1="12" x2="20" y2="12"/>
      <line x1="9" y1="18" x2="20" y2="18"/>
      <polyline points="4 6 5 7 7 5"/>
      <polyline points="4 12 5 13 7 11"/>
      <polyline points="4 18 5 19 7 17"/>
    </svg>
  );
}

const TodoRailIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <line x1="9" y1="6" x2="20" y2="6"/>
    <line x1="9" y1="12" x2="20" y2="12"/>
    <line x1="9" y1="18" x2="20" y2="18"/>
    <polyline points="4 6 5 7 7 5"/>
    <polyline points="4 12 5 13 7 11"/>
    <polyline points="4 18 5 19 7 17"/>
  </svg>
);

export const todoExtension: RecallExtension = {
  id: EXT_ID,
  name: "Todo",
  version: "1.0.0",
  description: "A persistent task checklist in the sidebar.",
  activate(api) {
    return api.registerSidebarPanel({
      id: "panel",
      label: "Todo",
      icon: <TodoRailIcon />,
      render: () => <TodoPanel />,
    });
  },
};
