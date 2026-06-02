import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import { useUpdater } from "./useUpdater";

type DistroKey = "arch" | "debian" | "fedora";

function distroCommand(key: DistroKey, version: string): string {
  switch (key) {
    case "arch":
      return "yay -S recall-bin";
    case "debian":
      return `sudo apt install ./Recall_${version}_amd64.deb`;
    case "fedora":
      return `sudo dnf install ./Recall-${version}-1.x86_64.rpm`;
  }
}

const DISTROS: { key: DistroKey; label: string }[] = [
  { key: "arch", label: "Arch" },
  { key: "debian", label: "Debian / Ubuntu" },
  { key: "fedora", label: "Fedora / RHEL" },
];

const LATEST_RELEASE_URL = "https://github.com/akhshyganesh/recall/releases/latest";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function releaseLines(body: string | null | undefined): string[] {
  return (body ?? "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 5);
}

export function UpdaterDialog() {
  const { status, install, dismiss, restart, deferRestart } = useUpdater();
  const [copied, setCopied] = useState(false);
  const [distro, setDistro] = useState<DistroKey>("arch");
  const manualVersion =
    status.kind === "manual-available" ? status.info.version : "";
  const activeCommand = distroCommand(distro, manualVersion);

  const open =
    status.kind === "available" ||
    status.kind === "manual-available" ||
    status.kind === "downloading" ||
    status.kind === "ready";

  if (!open) return null;

  const update = status.kind === "available" ? status.update : null;
  const manual = status.kind === "manual-available" ? status.info : null;
  const notes = releaseLines(manual?.body ?? update?.body);
  const downloading = status.kind === "downloading";
  const ready = status.kind === "ready";

  const copyCommand = async () => {
    if (!navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(activeCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };
  const progress =
    downloading && status.contentLength
      ? Math.min(100, (status.downloaded / status.contentLength) * 100)
      : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (
          !o &&
          (status.kind === "available" || status.kind === "manual-available")
        )
          dismiss();
      }}
    >
      <DialogContent className="gap-4 sm:max-w-140">
        <DialogHeader>
          <DialogTitle>
            {ready
              ? "Update ready"
              : downloading
                ? "Downloading update…"
                : manual
                  ? `Recall v${manual.version} is available`
                  : `Recall v${update?.version} is available`}
          </DialogTitle>
          <DialogDescription className="wrap-break-word leading-5">
            {ready
              ? "Update installed. Restart now or on your next launch — your current sessions won't be lost if you choose later."
              : downloading
                ? progress !== null
                  ? `${progress.toFixed(0)}% — ${formatBytes(status.downloaded)}`
                  : formatBytes(status.downloaded)
                : manual
                  ? `You're on v${manual.currentVersion}. Pick your distro and run the command, or grab the package from GitHub.`
                  : "A new version is ready to install."}
          </DialogDescription>
        </DialogHeader>

        {!downloading && !ready && notes.length > 0 && (
          <div className="max-h-40 overflow-y-auto rounded-sm border border-border/55 bg-background/55 px-3 py-2 text-[12px] leading-5 text-foreground/85 wrap-anywhere">
            <div className="mb-1 text-[11px] font-medium text-muted-foreground">
              Release notes
            </div>
            <ul className="space-y-1">
              {notes.map((line, index) => (
                <li key={`${line}-${index}`}>{line}</li>
              ))}
            </ul>
          </div>
        )}

        {downloading && progress !== null && (
          <Progress value={progress} className="mt-2" />
        )}
        {downloading && progress === null && (
          <Progress value={undefined} className="mt-2 animate-pulse" />
        )}

        {manual && (
          <div className="mt-2 flex flex-col gap-2">
            <div className="flex gap-1 rounded-md bg-muted/40 p-1">
              {DISTROS.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => setDistro(d.key)}
                  className={`flex-1 rounded px-2 py-1 text-[11px] transition-colors ${
                    distro === d.key
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 font-mono text-[12px]">
              <span className="flex-1 select-all">$ {activeCommand}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => void copyCommand()}
              >
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        )}

        <DialogFooter className="flex-wrap sm:justify-between">
          {!downloading && !ready && (
            <Button
              variant="ghost"
              size="sm"
              className="mr-auto"
              onClick={() => void openUrl(manual?.releaseUrl ?? LATEST_RELEASE_URL)}
            >
              View release
            </Button>
          )}
          {status.kind === "available" && (
            <>
              <Button variant="ghost" size="sm" onClick={dismiss}>
                Later
              </Button>
              <Button size="sm" onClick={() => void install()}>
                Install &amp; restart
              </Button>
            </>
          )}
          {ready && (
            <>
              <Button variant="ghost" size="sm" onClick={deferRestart}>
                Restart on next launch
              </Button>
              <Button size="sm" onClick={restart}>
                Restart now
              </Button>
            </>
          )}
          {manual && (
            <>
              <Button variant="ghost" size="sm" onClick={dismiss}>
                Later
              </Button>
              <Button
                size="sm"
                onClick={() => void openUrl(manual.releaseUrl)}
              >
                Download package
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
