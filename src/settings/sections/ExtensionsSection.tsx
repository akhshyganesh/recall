import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { ExtensionGuideDialog } from "./ExtensionGuide";
import {
  checkForUpdates,
  hydrateExtensionStore,
  installFromGitHub,
  installFromZipBytes,
  parseGitHubUrl,
  removeExtension,
  setExtensionEnabled,
  updateExtension,
  useExtensionStore,
  type InstalledExtension,
} from "@/modules/extensions/store";
import {
  ArrowUp01Icon,
  Delete02Icon,
  Download01Icon,
  GithubIcon,
  RefreshIcon,
  Search01Icon,
  Upload01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";

// ── Source badge ──────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: InstalledExtension["source"] }) {
  if (source.kind === "builtin")
    return (
      <span className="rounded-full bg-primary/12 px-1.5 py-px text-[9px] font-semibold tracking-wide text-primary/70">
        BUILT-IN
      </span>
    );
  if (source.kind === "github")
    return (
      <span className="flex items-center gap-0.5 rounded-full bg-muted/60 px-1.5 py-px text-[9px] font-medium text-muted-foreground/60">
        <HugeiconsIcon icon={GithubIcon} size={8} strokeWidth={1.5} />
        {source.owner}/{source.repo}
      </span>
    );
  if (source.kind === "zip")
    return (
      <span className="rounded-full bg-muted/60 px-1.5 py-px text-[9px] font-medium text-muted-foreground/60">
        ZIP
      </span>
    );
  return (
    <span className="rounded-full bg-muted/60 px-1.5 py-px text-[9px] font-medium text-muted-foreground/60">
      Local
    </span>
  );
}

// ── Single extension row ──────────────────────────────────────────────────────

function ExtensionRow({ ext }: { ext: InstalledExtension }) {
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [checking, setChecking] = useState(false);
  const hasUpdate =
    !!ext.latestVersion &&
    ext.latestVersion !== ext.version &&
    ext.latestVersion !== `v${ext.version}`;

  const onToggle = (v: boolean) => void setExtensionEnabled(ext.id, v);
  const onRemove = async () => {
    setRemoving(true);
    try { await removeExtension(ext.id); } finally { setRemoving(false); }
  };
  const onUpdate = async () => {
    setUpdating(true);
    try { await updateExtension(ext.id); } finally { setUpdating(false); }
  };
  const onCheck = async () => {
    setChecking(true);
    try { await checkForUpdates(ext.id); } finally { setChecking(false); }
  };

  return (
    <div
      className={cn(
        "group flex items-center gap-3 py-3 transition-opacity",
        !ext.enabled && "opacity-50",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[12.5px] font-semibold leading-tight">{ext.name}</span>
          <span className="font-mono text-[9.5px] text-muted-foreground/40">v{ext.version}</span>
          <SourceBadge source={ext.source} />
          {hasUpdate && (
            <span className="rounded-full bg-primary/15 px-1.5 py-px text-[9px] font-semibold text-primary">
              v{ext.latestVersion} available
            </span>
          )}
        </div>
        {ext.description && (
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground/50">
            {ext.description}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {ext.source.kind === "github" && !confirmRemove && (
          <button
            type="button"
            title="Check for updates"
            onClick={onCheck}
            disabled={checking || updating}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
          >
            <HugeiconsIcon icon={RefreshIcon} size={11} strokeWidth={1.75} className={cn(checking && "animate-spin")} />
          </button>
        )}
        {hasUpdate && !confirmRemove && (
          <button
            type="button"
            title="Update"
            onClick={onUpdate}
            disabled={updating}
            className="flex size-6 items-center justify-center rounded-md text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-30"
          >
            <HugeiconsIcon icon={ArrowUp01Icon} size={11} strokeWidth={2} className={cn(updating && "animate-bounce")} />
          </button>
        )}
        {(
          confirmRemove ? (
            <div className="flex items-center gap-1">
              <span className="text-[10.5px] text-muted-foreground/60">Remove?</span>
              <button
                type="button"
                onClick={() => void onRemove()}
                disabled={removing}
                className="rounded px-1.5 py-0.5 text-[10.5px] font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40"
              >
                {removing ? "…" : "Yes"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmRemove(false)}
                className="rounded px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
              >
                No
              </button>
            </div>
          ) : (
            <button
              type="button"
              title="Remove"
              onClick={() => setConfirmRemove(true)}
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground/30 transition-all hover:bg-destructive/10 hover:text-destructive"
            >
              <HugeiconsIcon icon={Delete02Icon} size={11} strokeWidth={1.75} />
            </button>
          )
        )}
        {!confirmRemove && (
          <Switch checked={ext.enabled} onCheckedChange={onToggle} className="scale-[0.8]" />
        )}
      </div>
    </div>
  );
}

// ── Installers ────────────────────────────────────────────────────────────────

function GitHubInstaller({ onDone }: { onDone: () => void }) {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "done"; name: string }
  >({ kind: "idle" });
  const isValid = !!parseGitHubUrl(url);

  const onInstall = async () => {
    setStatus({ kind: "loading" });
    try {
      const ext = await installFromGitHub(url);
      setStatus({ kind: "done", name: ext.name });
      setUrl("");
      setTimeout(onDone, 1200);
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="flex flex-col gap-2 pt-2">
      <p className="text-[11px] leading-relaxed text-muted-foreground/55">
        Release must include a{" "}
        <code className="rounded bg-muted px-1 font-mono text-[10px]">recall-plugin.js</code> or{" "}
        <code className="rounded bg-muted px-1 font-mono text-[10px]">recall-plugin.zip</code> asset.
      </p>
      <div className="flex gap-1.5">
        <input
          type="url"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setStatus({ kind: "idle" }); }}
          onKeyDown={(e) => { if (e.key === "Enter" && isValid) void onInstall(); }}
          placeholder="https://github.com/owner/repo"
          spellCheck={false}
          className="h-8 min-w-0 flex-1 rounded-lg border border-border/50 bg-muted/30 px-2.5 font-mono text-[11px] outline-none placeholder:text-muted-foreground/35 focus:border-ring focus:ring-1 focus:ring-ring/20"
        />
        <button
          type="button"
          onClick={() => void onInstall()}
          disabled={!isValid || status.kind === "loading"}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[11.5px] font-medium text-primary-foreground disabled:opacity-40"
        >
          <HugeiconsIcon icon={Download01Icon} size={11} strokeWidth={2} />
          {status.kind === "loading" ? "Installing…" : "Install"}
        </button>
      </div>
      {status.kind === "error" && <p className="text-[11px] text-destructive/80">{status.message}</p>}
      {status.kind === "done" && <p className="text-[11px] text-green-500/80">"{status.name}" installed.</p>}
    </div>
  );
}

function ZipInstaller({ onDone }: { onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "loading"; name: string }
    | { kind: "error"; message: string }
    | { kind: "done"; name: string }
  >({ kind: "idle" });

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus({ kind: "loading", name: file.name });
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const ext = await installFromZipBytes(bytes);
      setStatus({ kind: "done", name: ext.name });
      setTimeout(onDone, 1200);
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="flex flex-col gap-2 pt-2">
      <p className="text-[11px] leading-relaxed text-muted-foreground/55">
        ZIP must contain{" "}
        <code className="rounded bg-muted px-1 font-mono text-[10px]">manifest.json</code> and{" "}
        <code className="rounded bg-muted px-1 font-mono text-[10px]">index.js</code>.
      </p>
      <input ref={fileRef} type="file" accept=".zip" className="hidden" onChange={(e) => void onFileChange(e)} />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={status.kind === "loading"}
        className="flex h-8 w-fit items-center gap-1.5 rounded-lg border border-border/50 bg-muted/30 px-3 text-[11.5px] font-medium hover:bg-muted disabled:opacity-40"
      >
        <HugeiconsIcon icon={Upload01Icon} size={11} strokeWidth={1.75} />
        {status.kind === "loading" ? `Reading ${status.name}…` : "Choose ZIP…"}
      </button>
      {status.kind === "error" && <p className="text-[11px] text-destructive/80">{status.message}</p>}
      {status.kind === "done" && <p className="text-[11px] text-green-500/80">"{status.name}" installed.</p>}
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

export function ExtensionsSection() {
  const extensions = useExtensionStore((s) => s.extensions);
  const hydrated = useExtensionStore((s) => s.hydrated);
  const [search, setSearch] = useState("");
  const [installMode, setInstallMode] = useState<"none" | "github" | "zip">("none");
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    if (!hydrated) void hydrateExtensionStore();
  }, [hydrated]);

  const builtins = extensions.filter((e) => e.source.kind === "builtin");
  const installed = extensions.filter((e) => e.source.kind !== "builtin");

  const query = search.trim().toLowerCase();
  const filter = (list: InstalledExtension[]) =>
    query
      ? list.filter(
          (e) =>
            e.name.toLowerCase().includes(query) ||
            e.description.toLowerCase().includes(query),
        )
      : list;

  const filteredBuiltins = filter(builtins);
  const filteredInstalled = filter(installed);
  const hasResults = filteredBuiltins.length > 0 || filteredInstalled.length > 0;

  return (
    <div className="flex h-full flex-col">

      {/* ── Top: search + list (scrollable) ─────────────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col px-4 pt-4">

        {/* Search */}
        <div className="relative mb-3 shrink-0">
          <HugeiconsIcon
            icon={Search01Icon}
            size={13}
            strokeWidth={1.75}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground/45"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search extensions…"
            className="h-9 w-full rounded-xl border border-border/50 bg-muted/30 pl-9 pr-3 text-[12.5px] outline-none placeholder:text-muted-foreground/35 focus:border-ring focus:ring-2 focus:ring-ring/15"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-[10px] text-muted-foreground/40 hover:text-foreground"
            >
              ✕
            </button>
          )}
        </div>

        {/* List — flex-1 + overflow-y-auto makes this the scrolling region */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!hydrated ? (
            <div className="py-6 text-center text-[11px] text-muted-foreground/40">Loading…</div>
          ) : !hasResults ? (
            <div className="py-10 text-center text-[12px] text-muted-foreground/40">
              {query ? "No extensions match" : "No extensions installed"}
            </div>
          ) : (
            <div className="flex flex-col gap-5 pb-2">
              {filteredBuiltins.length > 0 && (
                <div>
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/40">
                    Built-in
                  </span>
                  <div className="divide-y divide-border/30">
                    {filteredBuiltins.map((ext) => (
                      <ExtensionRow key={ext.id} ext={ext} />
                    ))}
                  </div>
                </div>
              )}
              {filteredInstalled.length > 0 && (
                <div>
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/40">
                    Installed
                  </span>
                  <div className="divide-y divide-border/30">
                    {filteredInstalled.map((ext) => (
                      <ExtensionRow key={ext.id} ext={ext} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom: install (pinned) ─────────────────────────────────── */}
      <div className="shrink-0 border-t border-border/30 px-4 py-4">
        <span className="mb-2.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/40">
          Install extension
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setInstallMode(installMode === "github" ? "none" : "github")}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[11.5px] font-medium transition-colors",
              installMode === "github"
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/50 bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <HugeiconsIcon icon={GithubIcon} size={12} strokeWidth={1.75} />
            From GitHub
          </button>
          <button
            type="button"
            onClick={() => setInstallMode(installMode === "zip" ? "none" : "zip")}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[11.5px] font-medium transition-colors",
              installMode === "zip"
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/50 bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <HugeiconsIcon icon={Upload01Icon} size={12} strokeWidth={1.75} />
            From ZIP
          </button>
        </div>
        {installMode === "github" && <GitHubInstaller onDone={() => setInstallMode("none")} />}
        {installMode === "zip" && <ZipInstaller onDone={() => setInstallMode("none")} />}
        <p className="mt-3 text-[10.5px] leading-relaxed text-muted-foreground/35">
          Only install extensions from sources you trust.{" "}
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="underline underline-offset-2 hover:text-muted-foreground/60"
          >
            Extension guide →
          </button>
        </p>
      </div>

      <ExtensionGuideDialog open={guideOpen} onOpenChange={setGuideOpen} />
    </div>
  );
}
