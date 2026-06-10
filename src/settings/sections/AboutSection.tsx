import { Button } from "@/components/ui/button";
import { useUpdater } from "@/modules/updater";
import { AlertCircleIcon, GithubIcon, Globe02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getName, getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { arch, platform } from "@tauri-apps/plugin-os";
import { useEffect, useState } from "react";

const REPO_URL = "https://github.com/akhshyganesh/recall";
const RELEASES_URL = "https://github.com/akhshyganesh/recall/releases";
const ISSUES_URL = "https://github.com/akhshyganesh/recall/issues/new";

const PLATFORM_LABEL: Record<string, string> = {
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
  ios: "iOS",
  android: "Android",
  freebsd: "FreeBSD",
};

export function AboutSection() {
  const [version, setVersion] = useState("");
  const [name, setName] = useState("Recall");
  const [platformLabel, setPlatformLabel] = useState("");
  const [archLabel, setArchLabel] = useState("");
  const { status, check, install } = useUpdater({ autoCheck: false });
  const checking = status.kind === "checking";
  const downloading = status.kind === "downloading";
  const available = status.kind === "available";
  const manualAvailable = status.kind === "manual-available";
  const ready = status.kind === "ready";
  const uptodate = status.kind === "uptodate";

  const updateLabel =
    uptodate
      ? "Up to date"
      : status.kind === "error"
        ? "Check failed — retry"
        : checking
          ? "Checking…"
          : downloading
            ? "Downloading…"
            : ready
              ? "Restart to install"
              : available
                ? `Install v${status.update.version}`
                : manualAvailable
                  ? `Update to v${status.info.version}`
                  : "Check for updates";

  const onUpdateClick = () => {
    if (available) void install();
    else if (manualAvailable) void openUrl(status.info.releaseUrl);
    else if (!uptodate) void check();
  };

  useEffect(() => {
    void getVersion().then(setVersion);
    void getName().then((n) => setName(n || "Recall"));
    try {
      setPlatformLabel(PLATFORM_LABEL[platform()] ?? platform());
      setArchLabel(arch());
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div className="flex flex-col gap-5 py-2">
      {/* Hero */}
      <div className="flex items-center gap-4 rounded-lg border border-border/40 bg-card p-4">
        <img src="/logo.png" alt="" className="size-11 shrink-0" draggable={false} />
        <div className="min-w-0 flex-1">
          <div className="text-[14.5px] font-semibold tracking-tight">{name}</div>
          <div className="text-[11px] text-muted-foreground">Developer-first terminal workspace</div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="rounded border border-border/50 bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              v{version || "—"}
            </span>
            {platformLabel && (
              <span className="text-[11px] text-muted-foreground/60">
                {platformLabel} · {archLabel}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Update */}
      <div className="flex flex-col gap-2">
        <Button
          size="sm"
          variant={uptodate ? "outline" : "default"}
          onClick={onUpdateClick}
          disabled={checking || downloading || ready}
          className="w-full"
        >
          {updateLabel}
        </Button>
        {status.kind === "error" && (
          <p className="font-mono text-[10.5px] break-all text-destructive/80">
            {status.message}
          </p>
        )}
        {downloading && status.contentLength ? (
          <p className="text-center text-[11px] text-muted-foreground">
            {Math.min(100, Math.round((status.downloaded / status.contentLength) * 100))}%
          </p>
        ) : null}
      </div>

      {/* Build info */}
      <dl className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-2 text-[11.5px]">
        <dt className="text-muted-foreground">Bundle ID</dt>
        <dd className="font-mono text-[11px] text-foreground/80">com.akhshy.recall</dd>

        <dt className="text-muted-foreground">License</dt>
        <dd className="text-foreground/80">Apache 2.0</dd>

        <dt className="text-muted-foreground">Source</dt>
        <dd>
          <button
            type="button"
            onClick={() => void openUrl(REPO_URL)}
            className="flex items-center gap-1 text-primary hover:underline underline-offset-2"
          >
            <HugeiconsIcon icon={GithubIcon} size={11} strokeWidth={1.75} />
            akhshyganesh/recall
          </button>
        </dd>

        <dt className="text-muted-foreground">Releases</dt>
        <dd>
          <button
            type="button"
            onClick={() => void openUrl(RELEASES_URL)}
            className="flex items-center gap-1 text-primary hover:underline underline-offset-2"
          >
            <HugeiconsIcon icon={Globe02Icon} size={11} strokeWidth={1.75} />
            Release notes
          </button>
        </dd>
      </dl>

      {/* Links */}
      <div className="flex gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 gap-1.5 text-[11px]"
          onClick={() => void openUrl(REPO_URL)}
        >
          <HugeiconsIcon icon={GithubIcon} size={12} strokeWidth={1.75} />
          GitHub
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="flex-1 gap-1.5 text-[11px]"
          onClick={() => void openUrl(ISSUES_URL)}
        >
          <HugeiconsIcon icon={AlertCircleIcon} size={12} strokeWidth={1.75} />
          Report issue
        </Button>
      </div>
    </div>
  );
}
