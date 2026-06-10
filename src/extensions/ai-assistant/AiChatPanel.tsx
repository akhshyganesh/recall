import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { getSessions } from "@/modules/sessions/api";
import { cn } from "@/lib/utils";
import { ArrowUp01Icon, Cancel01Icon, Tick01Icon, MultiplicationSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { buildSystemPrompt, streamChat, type ChatMessage } from "./client";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
};

const EXAMPLES = [
  "How do I find all files changed in the last 24 hours?",
  "Explain what my last session was working on",
  "How do I undo the last 3 git commits safely?",
  "What's the fastest way to search for a string in all .ts files?",
];

type Props = {
  workspacePath: string | null;
  repoRoot: string | null;
};

export function AiChatPanel({ workspacePath, repoRoot }: Props) {
  const apiKey = usePreferencesStore((s) => s.openRouterApiKey);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [includeContext, setIncludeContext] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || streaming || !apiKey) return;
      const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text.trim() };
      const assistantMsg: Message = { id: crypto.randomUUID(), role: "assistant", content: "", streaming: true };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setInput("");
      setStreaming(true);

      let sessionContext: string | null = null;
      if (includeContext) {
        try {
          const paths = workspacePath ? [workspacePath] : repoRoot ? [repoRoot] : undefined;
          const sessions = await getSessions({ paths, limit: 8 });
          if (sessions.length > 0) {
            const lines = sessions.map(
              (s) =>
                `- ${s.title ?? "Untitled"} (${s.tool}, ${s.message_count} messages${s.started_at ? ", " + new Date(s.started_at).toLocaleDateString() : ""})`,
            );
            sessionContext = `Recent AI coding sessions in this workspace:\n${lines.join("\n")}`;
          }
        } catch {}
      }

      const history: ChatMessage[] = messages
        .filter((m) => !m.streaming)
        .map((m) => ({ role: m.role, content: m.content }));
      history.push({ role: "user", content: text.trim() });

      const abort = new AbortController();
      abortRef.current = abort;

      await streamChat(
        apiKey,
        history,
        buildSystemPrompt({ workspacePath, sessionContext }),
        {
          onChunk: (chunk) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id ? { ...m, content: m.content + chunk } : m,
              ),
            );
          },
          onDone: () => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id ? { ...m, streaming: false } : m,
              ),
            );
            setStreaming(false);
            abortRef.current = null;
          },
          onError: (err) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id
                  ? { ...m, content: `Error: ${err.message}`, streaming: false }
                  : m,
              ),
            );
            setStreaming(false);
            abortRef.current = null;
          },
        },
        abort.signal,
      );
    },
    [apiKey, messages, streaming, includeContext, workspacePath, repoRoot],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
    );
  };

  const handleReset = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setMessages([]);
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  if (!apiKey) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-5 py-8 text-center">
        <div className="flex flex-col items-center gap-2">
          <div className="text-sm font-semibold text-foreground/80">AI Assistant</div>
          <p className="text-[11.5px] text-muted-foreground leading-relaxed">
            Add your OpenRouter API key to start chatting.
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-[11.5px] font-medium text-primary transition-colors hover:bg-primary/20"
          onClick={() => {
            window.dispatchEvent(new CustomEvent("recall:open-settings-tab", { detail: { tab: "recall.ai-assistant:settings" } }));
          }}
        >
          Configure in Settings → AI Assistant
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/40 px-3 py-2">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
          AI Assistant
        </span>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={handleReset}
            className="rounded-sm p-0.5 text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
            title="New conversation"
          >
            <HugeiconsIcon icon={MultiplicationSignIcon} size={11} strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-3 pt-2">
            <p className="text-[11px] text-muted-foreground">
              Ask anything about your workspace, terminal commands, or code.
            </p>
            <div className="flex flex-col gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => void sendMessage(ex)}
                  className="rounded-md border border-border/50 bg-card/40 px-2.5 py-2 text-left text-[11px] text-muted-foreground transition-colors hover:border-border hover:bg-accent/50 hover:text-foreground"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-border/40 p-2">
        <div className="mb-1.5 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIncludeContext((v) => !v)}
            className={cn(
              "flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] font-medium transition-colors",
              includeContext
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border/50 text-muted-foreground/60 hover:border-border hover:text-muted-foreground",
            )}
            title="Include recent session history as context"
          >
            {includeContext ? (
              <HugeiconsIcon icon={Tick01Icon} size={9} strokeWidth={2.5} />
            ) : null}
            Session context
          </button>
        </div>
        <div className="flex items-end gap-1.5">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question… (⏎ to send, ⇧⏎ for newline)"
            className="min-h-[60px] max-h-32 resize-none rounded-md border-border/50 bg-background/50 text-[11.5px] placeholder:text-muted-foreground/40 focus-visible:ring-1 focus-visible:ring-primary/50"
            disabled={streaming}
          />
          <div className="flex flex-col gap-1">
            {streaming ? (
              <Button
                size="sm"
                variant="outline"
                onClick={handleStop}
                className="h-7 w-7 rounded-md p-0"
                title="Stop"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => void sendMessage(input)}
                disabled={!input.trim()}
                className="h-7 w-7 rounded-md p-0"
                title="Send (Enter)"
              >
                <HugeiconsIcon icon={ArrowUp01Icon} size={11} strokeWidth={2} />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-full rounded-lg px-2.5 py-2 text-[11.5px] leading-relaxed",
          isUser
            ? "bg-primary/15 text-foreground"
            : "bg-card/60 text-foreground",
        )}
      >
        {isUser ? (
          <span className="whitespace-pre-wrap">{message.content}</span>
        ) : (
          <AssistantContent content={message.content} streaming={message.streaming} />
        )}
      </div>
    </div>
  );
}

function AssistantContent({ content, streaming }: { content: string; streaming?: boolean }) {
  if (!content && streaming) {
    return <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-primary/40" />;
  }
  const parts = content.split(/(```[\s\S]*?```)/g);
  return (
    <span>
      {parts.map((part, i) => {
        if (part.startsWith("```")) {
          const lines = part.slice(3).split("\n");
          const lang = lines[0].trim();
          const code = lines.slice(1).join("\n").replace(/```$/, "").trimEnd();
          return (
            <pre
              key={i}
              className="my-1.5 overflow-x-auto rounded bg-background/80 px-2.5 py-2 font-mono text-[10.5px] text-foreground/90"
            >
              {lang && <div className="mb-1 text-[9px] uppercase tracking-wide text-muted-foreground">{lang}</div>}
              <code>{code}</code>
            </pre>
          );
        }
        return <span key={i} className="whitespace-pre-wrap">{part}</span>;
      })}
      {streaming && <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-foreground/60" />}
    </span>
  );
}
