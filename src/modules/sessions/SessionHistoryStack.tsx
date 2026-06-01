import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { SessionTab, Tab } from "@/modules/tabs";
import { useEffect, useState } from "react";
import {
  exportSession,
  getSession,
  type ExportData,
  type ExportFormat,
  type Session,
} from "./api";

type Props = {
  tabs: Tab[];
  activeId: number;
};

type Status =
  | { kind: "loading" }
  | { kind: "ready"; session: Session }
  | { kind: "missing" }
  | { kind: "error"; message: string };

type ExportNotice = {
  kind: "success" | "error";
  message: string;
};

const EXPORT_OPTIONS: Array<{ format: ExportFormat; label: string }> = [
  { format: "markdown", label: "Markdown (.md)" },
  { format: "json", label: "JSON (.json)" },
  { format: "text", label: "Text (.txt)" },
];

function basename(path: string | null): string {
  if (!path) return "Workspace";
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

function formatDate(value: string | null): string {
  if (!value) return "Unknown time";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function contentTypeForExport(filename: string): string {
  if (filename.endsWith(".json")) return "application/json;charset=utf-8";
  if (filename.endsWith(".md")) return "text/markdown;charset=utf-8";
  return "text/plain;charset=utf-8";
}

function triggerExportDownload(data: ExportData): void {
  const blob = new Blob([data.content], {
    type: contentTypeForExport(data.filename),
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = data.filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function SessionHistoryStack({ tabs, activeId }: Props) {
  const sessionTabs = tabs.filter((tab): tab is SessionTab => tab.kind === "session");
  if (sessionTabs.length === 0) return null;

  return (
    <div className="relative h-full w-full">
      {sessionTabs.map((tab) => {
        const visible = tab.id === activeId;
        return (
          <div
            key={tab.id}
            className={cn(
              "absolute inset-0",
              !visible && "invisible pointer-events-none",
            )}
            aria-hidden={!visible}
          >
            <SessionHistoryPane sessionId={tab.sessionId} fallbackTitle={tab.title} />
          </div>
        );
      })}
    </div>
  );
}

function SessionHistoryPane({
  sessionId,
  fallbackTitle,
}: {
  sessionId: string;
  fallbackTitle: string;
}) {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [exportingAction, setExportingAction] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<ExportNotice | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus({ kind: "loading" });
    void getSession(sessionId)
      .then((session) => {
        if (cancelled) return;
        setStatus(session ? { kind: "ready", session } : { kind: "missing" });
      })
      .catch((error) => {
        if (!cancelled) setStatus({ kind: "error", message: String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!exportNotice) return;
    const timeout = window.setTimeout(() => setExportNotice(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [exportNotice]);

  const session = status.kind === "ready" ? status.session : null;
  const files = session?.file_changes ?? [];
  const messages = session?.messages ?? [];
  const title = session?.title || fallbackTitle;
  const repo = session?.repo_name || basename(session?.repo_path ?? session?.workspace ?? null);

  async function runExport(mode: "download" | "copy", format: ExportFormat) {
    setExportingAction(`${mode}:${format}`);
    setExportNotice(null);

    try {
      const payload = await exportSession(sessionId, format);

      if (mode === "download") {
        triggerExportDownload(payload);
        setExportNotice({
          kind: "success",
          message: `Downloaded ${payload.filename}`,
        });
        return;
      }

      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard access is unavailable.");
      }

      await navigator.clipboard.writeText(payload.content);
      setExportNotice({
        kind: "success",
        message: `Copied ${payload.filename} to the clipboard`,
      });
    } catch (error) {
      setExportNotice({
        kind: "error",
        message: `Failed to ${mode} export: ${String(error)}`,
      });
    } finally {
      setExportingAction(null);
    }
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-md border border-border/60 bg-background">
      <header className="shrink-0 border-b border-border/60 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[14px] font-semibold text-foreground">{title}</h2>
            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              {session ? (
                <>
                  <span>{session.tool}</span>
                  <span>/</span>
                  <span>{repo}</span>
                  <span>/</span>
                  <span>{formatDate(session.started_at)}</span>
                </>
              ) : (
                <span>{status.kind === "loading" ? "Loading session history" : sessionId}</span>
              )}
            </div>
          </div>

          {session && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="shrink-0"
                  disabled={Boolean(exportingAction)}
                >
                  {exportingAction ? "Exporting..." : "Export"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
                <DropdownMenuLabel>Download</DropdownMenuLabel>
                {EXPORT_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={`download-${option.format}`}
                    disabled={Boolean(exportingAction)}
                    onSelect={() => void runExport("download", option.format)}
                  >
                    Download {option.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Copy to Clipboard</DropdownMenuLabel>
                {EXPORT_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={`copy-${option.format}`}
                    disabled={Boolean(exportingAction)}
                    onSelect={() => void runExport("copy", option.format)}
                  >
                    Copy {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {exportNotice && (
          <div
            className={cn(
              "mt-2 text-[10.5px]",
              exportNotice.kind === "error" ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {exportNotice.message}
          </div>
        )}
      </header>

      {session && (
        <div className="grid shrink-0 grid-cols-3 gap-2 border-b border-border/60 px-4 py-3 text-[11px]">
          <DetailStat label="Messages" value={session.message_count} />
          <DetailStat label="Files" value={files.length || session.file_count} />
          <DetailStat label="Model" value={session.model || "Unknown"} />
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 px-4 py-4">
          {status.kind === "loading" && (
            <div className="text-[12px] text-muted-foreground">Loading...</div>
          )}
          {status.kind === "missing" && (
            <div className="text-[12px] text-muted-foreground">
              This session is no longer in the index.
            </div>
          )}
          {status.kind === "error" && (
            <div className="text-[12px] text-destructive">
              Failed to load session: {status.message}
            </div>
          )}

          {session && files.length > 0 && (
            <section>
              <div className="mb-2 text-[11px] font-medium text-muted-foreground">
                Files touched
              </div>
              <div className="space-y-1.5">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-2 rounded-md border border-border/40 bg-card px-2.5 py-1.5 text-[11px]"
                  >
                    <span className="min-w-0 flex-1 truncate font-mono text-foreground">
                      {file.path}
                    </span>
                    <span className="shrink-0 tabular-nums text-zinc-700 dark:text-zinc-300">
                      +{file.additions}
                    </span>
                    <span className="shrink-0 tabular-nums text-destructive">
                      -{file.deletions}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {session && (
            <section>
              <div className="mb-2 text-[11px] font-medium text-muted-foreground">
                Messages
              </div>
              <div className="space-y-2">
                {messages.length === 0 ? (
                  <div className="rounded-md border border-border/40 bg-card px-2.5 py-2 text-[12px] text-muted-foreground">
                    No message transcript was indexed for this session.
                  </div>
                ) : (
                  messages.map((message) => (
                    <article
                      key={message.id}
                      className="rounded-md border border-border/40 bg-card px-3 py-2.5"
                    >
                      <div className="mb-1 flex items-center justify-between gap-2 text-[10.5px] text-muted-foreground">
                        <span className="font-medium capitalize text-foreground">
                          {message.author || message.role}
                        </span>
                        <span className="shrink-0">{formatDate(message.created_at)}</span>
                      </div>
                      <div className="whitespace-pre-wrap wrap-anywhere text-[12px] leading-5 text-foreground/90">
                        {message.content}
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border/45 bg-background/55 p-2">
      <div className="truncate text-[12px] font-semibold tabular-nums text-foreground">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}