import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AiChat01Icon, Cancel01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { buildNlCommandPrompt, streamChat } from "./client";
import { usePreferencesStore } from "@/modules/settings/preferences";

type OverlayState = {
  open: boolean;
  cwd?: string | null;
};

export function NlShellOverlayBackground() {
  const apiKey = usePreferencesStore((s) => s.openRouterApiKey);
  const [state, setState] = useState<OverlayState>({ open: false });

  useEffect(() => {
    const handler = (e: Event) => {
      const { cwd } = (e as CustomEvent<{ cwd?: string | null }>).detail ?? {};
      if (!apiKey) return;
      setState({ open: true, cwd });
    };
    window.addEventListener("recall:nl-command:trigger", handler);
    return () => window.removeEventListener("recall:nl-command:trigger", handler);
  }, [apiKey]);

  const handleAccept = useCallback((command: string) => {
    window.dispatchEvent(
      new CustomEvent("recall:terminal:insert-text", { detail: { text: command } }),
    );
  }, []);

  const handleClose = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
  }, []);

  if (!apiKey || !state.open) return null;

  return createPortal(
    <NlShellOverlayPanel
      apiKey={apiKey}
      cwd={state.cwd}
      onAccept={handleAccept}
      onClose={handleClose}
    />,
    document.body,
  );
}

type PanelProps = {
  apiKey: string;
  cwd?: string | null;
  onAccept: (command: string) => void;
  onClose: () => void;
};

function NlShellOverlayPanel({ apiKey, cwd, onAccept, onClose }: PanelProps) {
  const [query, setQuery] = useState("");
  const [command, setCommand] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuery("");
    setCommand("");
    setError(null);
    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 50);
    return () => { abortRef.current?.abort(); };
  }, []);

  const generate = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return;
      setCommand("");
      setError(null);
      setLoading(true);
      const abort = new AbortController();
      abortRef.current = abort;
      let result = "";
      await streamChat(
        apiKey,
        [{ role: "user", content: text.trim() }],
        buildNlCommandPrompt(cwd),
        {
          onChunk: (chunk) => { result += chunk; setCommand(result); },
          onDone: () => { setLoading(false); abortRef.current = null; },
          onError: (err) => { setError(err.message); setLoading(false); abortRef.current = null; },
        },
        abort.signal,
      );
    },
    [apiKey, cwd, loading],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (command && !loading) {
        onAccept(command.trim());
        onClose();
      } else if (query.trim()) {
        void generate(query);
      }
    }
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    }
  };

  const handleAccept = () => {
    if (!command.trim()) return;
    onAccept(command.trim());
    onClose();
  };

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[9999] flex items-end justify-center pb-8"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-xl mx-4 rounded-xl border border-border/60 bg-background shadow-2xl shadow-black/30"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2.5">
          <HugeiconsIcon icon={AiChat01Icon} size={13} strokeWidth={2} className="text-primary shrink-0" />
          <span className="text-[11.5px] font-semibold text-foreground">Generate Command</span>
          <div className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground/50">
            <kbd className="rounded border border-border/50 px-1 py-0.5 font-mono text-[9px]">⏎</kbd>
            <span>to accept</span>
            <span className="mx-1">·</span>
            <kbd className="rounded border border-border/50 px-1 py-0.5 font-mono text-[9px]">Esc</kbd>
            <span>to close</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-1 rounded-sm p-0.5 text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
          </button>
        </div>

        <div className="px-3 py-2.5">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe what you want to do…"
            className="w-full bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none"
          />
        </div>

        {(command || loading || error) && (
          <div className="border-t border-border/40 px-3 py-2.5">
            {error ? (
              <div className="text-[11.5px] text-destructive">{error}</div>
            ) : loading && !command ? (
              <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary/60" />
                Generating…
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 font-mono text-[11px] text-muted-foreground/60">$</span>
                <code
                  className={cn(
                    "flex-1 font-mono text-[12px] text-foreground/90 break-all leading-relaxed",
                    loading && "after:ml-0.5 after:inline-block after:h-3 after:w-0.5 after:animate-pulse after:bg-foreground/60 after:content-['']",
                  )}
                >
                  {command}
                </code>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border/40 px-3 py-2">
          <div className="text-[10px] text-muted-foreground/50">
            {cwd ? `in ${cwd.split("/").slice(-2).join("/")}` : ""}
          </div>
          <div className="flex items-center gap-2">
            {!command && !loading && (
              <Button
                size="sm"
                className="h-7 gap-1.5 rounded-lg text-[11px]"
                onClick={() => void generate(query)}
                disabled={!query.trim()}
              >
                Generate
              </Button>
            )}
            {command && !loading && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 rounded-lg text-[11px]"
                  onClick={() => { setCommand(""); setQuery(""); }}
                >
                  Clear
                </Button>
                <Button
                  size="sm"
                  className="h-7 gap-1.5 rounded-lg text-[11px]"
                  onClick={handleAccept}
                >
                  <HugeiconsIcon icon={Tick01Icon} size={11} strokeWidth={2.5} />
                  Insert
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
