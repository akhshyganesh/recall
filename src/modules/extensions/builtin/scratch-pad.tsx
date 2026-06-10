import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import type { RecallExtension } from "../types";
import { useScopedStorageKey, useWorkspacePath } from "../WorkspaceContext";
import { PanelShell } from "./PanelShell";

const BASE_KEY = "recall.scratch-pad.v1";
const EXT_ID = "recall.scratch-pad";

function ScratchPadPanel() {
  const workspacePath = useWorkspacePath();
  const storageKey = useScopedStorageKey(BASE_KEY, EXT_ID, workspacePath);
  const [text, setText] = useState(() => {
    try { return localStorage.getItem(storageKey) ?? ""; } catch { return ""; }
  });
  const saveRef = useRef(0);

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    if (saveRef.current) clearTimeout(saveRef.current);
    saveRef.current = window.setTimeout(() => {
      try { localStorage.setItem(storageKey, val); } catch {}
    }, 400);
  };

  const onScopeChange = (scope: "global" | "workspace") => {
    const newKey = scope === "workspace" && workspacePath ? storageKey : BASE_KEY;
    try { setText(localStorage.getItem(newKey) ?? ""); } catch { setText(""); }
  };

  useEffect(() => () => { if (saveRef.current) clearTimeout(saveRef.current); }, []);

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const lineCount = text ? text.split("\n").length : 1;

  return (
    <PanelShell extensionId={EXT_ID} title="Scratch Pad" onScopeChange={onScopeChange}>
      <textarea
        value={text}
        onChange={onChange}
        placeholder="Start typing…"
        spellCheck={false}
        className={cn(
          "min-h-0 flex-1 resize-none bg-transparent px-3 py-2.5 h-full w-full",
          "font-mono text-[12px] leading-relaxed text-foreground",
          "placeholder:text-muted-foreground/30 outline-none",
        )}
      />
      <div className="flex items-center justify-between border-t border-border/30 px-3 py-1.5">
        <span className="font-mono text-[10px] text-muted-foreground/35">
          {wordCount}w · {lineCount}L
        </span>
        {text && (
          <button
            type="button"
            onClick={() => {
              setText("");
              try { localStorage.setItem(storageKey, ""); } catch {}
            }}
            className="text-[10px] text-muted-foreground/35 transition-colors hover:text-destructive/70"
          >
            Clear
          </button>
        )}
      </div>
    </PanelShell>
  );
}

const ScratchPadIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="8" y1="13" x2="16" y2="13"/>
    <line x1="8" y1="17" x2="16" y2="17"/>
    <line x1="8" y1="9" x2="10" y2="9"/>
  </svg>
);

export const scratchPadExtension: RecallExtension = {
  id: EXT_ID,
  name: "Scratch Pad",
  version: "1.0.0",
  description: "A persistent notepad in the sidebar. Auto-saves locally.",
  activate(api) {
    return api.registerSidebarPanel({
      id: "panel",
      label: "Scratch Pad",
      icon: <ScratchPadIcon />,
      render: () => <ScratchPadPanel />,
    });
  },
};
