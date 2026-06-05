import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import type { RecallExtension } from "../types";

const STORAGE_KEY = "recall.scratch-pad.v1";

function ScratchPadPanel() {
  const [text, setText] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) ?? ""; } catch { return ""; }
  });
  const saveRef = useRef(0);

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    if (saveRef.current) clearTimeout(saveRef.current);
    saveRef.current = window.setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, val); } catch {}
    }, 400);
  };

  useEffect(() => () => { if (saveRef.current) clearTimeout(saveRef.current); }, []);

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const lineCount = text ? text.split("\n").length : 1;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/30 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
          Scratch Pad
        </span>
      </div>
      <textarea
        value={text}
        onChange={onChange}
        placeholder="Start typing…"
        spellCheck={false}
        className={cn(
          "min-h-0 flex-1 resize-none bg-transparent px-3 py-2.5",
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
              try { localStorage.setItem(STORAGE_KEY, ""); } catch {}
            }}
            className="text-[10px] text-muted-foreground/35 transition-colors hover:text-destructive/70"
          >
            Clear
          </button>
        )}
      </div>
    </div>
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
  id: "recall.scratch-pad",
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
