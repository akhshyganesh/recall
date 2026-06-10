import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useState } from "react";
import { IS_LINUX } from "@/lib/platform";
import { usePreferencesStore } from "@/modules/settings/preferences";

const PENDING_RELAUNCH_KEY = "recall:updater:pending-relaunch";
const GITHUB_LATEST_RELEASE =
  "https://api.github.com/repos/akhshyganesh/recall/releases/latest";

export interface ManualUpdateInfo {
  version: string;
  currentVersion: string;
  body: string;
  releaseUrl: string;
}

export type UpdaterStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "uptodate" }
  | { kind: "available"; update: Update }
  | { kind: "manual-available"; info: ManualUpdateInfo }
  | { kind: "downloading"; downloaded: number; contentLength: number | null }
  | { kind: "ready" }
  | { kind: "error"; message: string };

function parseVersion(v: string): number[] {
  return v
    .replace(/^v/, "")
    .split("-")[0]
    .split(".")
    .map((p) => Number.parseInt(p, 10) || 0);
}

function isNewer(remote: string, current: string): boolean {
  const a = parseVersion(remote);
  const b = parseVersion(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

async function checkLinuxRelease(): Promise<ManualUpdateInfo | null> {
  const [current, res] = await Promise.all([
    getVersion(),
    fetch(GITHUB_LATEST_RELEASE, {
      headers: { Accept: "application/vnd.github+json" },
    }),
  ]);
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}`);
  }
  const data = (await res.json()) as {
    tag_name: string;
    body?: string;
    html_url: string;
  };
  const remote = data.tag_name.replace(/^v/, "");
  if (!isNewer(remote, current)) return null;
  return {
    version: remote,
    currentVersion: current,
    body: data.body ?? "",
    releaseUrl: data.html_url,
  };
}

interface HookOptions {
  /** When false, the hook does not run an automatic check on mount. */
  autoCheck?: boolean;
}

export function useUpdater({ autoCheck = true }: HookOptions = {}) {
  const [status, setStatus] = useState<UpdaterStatus>({ kind: "idle" });
  const prefsHydrated = usePreferencesStore((s) => s.hydrated);
  const checkForUpdates = usePreferencesStore((s) => s.checkForUpdates);

  const installUpdate = useCallback(async (update: Update) => {
    let total: number | null = null;
    let downloaded = 0;
    setStatus({ kind: "downloading", downloaded: 0, contentLength: null });
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? null;
          setStatus({
            kind: "downloading",
            downloaded: 0,
            contentLength: total,
          });
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          setStatus({ kind: "downloading", downloaded, contentLength: total });
        } else if (event.event === "Finished") {
          setStatus({ kind: "ready" });
        }
      });
      // Status is "ready" — let the user decide when to restart.
    } catch (err) {
      setStatus({ kind: "error", message: String(err) });
    }
  }, []);

  const runCheck = useCallback(async () => {
    setStatus({ kind: "checking" });
    try {
      if (IS_LINUX) {
        const info = await checkLinuxRelease();
        if (info) setStatus({ kind: "manual-available", info });
        else setStatus({ kind: "uptodate" });
        return;
      }
      const update = await check();
      if (update) setStatus({ kind: "available", update });
      else setStatus({ kind: "uptodate" });
    } catch (err) {
      setStatus({ kind: "error", message: String(err) });
    }
  }, []);

  const install = useCallback(async () => {
    if (status.kind !== "available") return;
    await installUpdate(status.update);
  }, [installUpdate, status]);

  const dismiss = useCallback(() => {
    setStatus({ kind: "idle" });
  }, []);

  const restart = useCallback(() => {
    void relaunch();
  }, []);

  const deferRestart = useCallback(() => {
    localStorage.setItem(PENDING_RELAUNCH_KEY, "true");
    setStatus({ kind: "idle" });
  }, []);

  useEffect(() => {
    // If a previous session staged an update, apply it now.
    if (localStorage.getItem(PENDING_RELAUNCH_KEY) === "true") {
      localStorage.removeItem(PENDING_RELAUNCH_KEY);
      void relaunch();
      return;
    }
    if (!autoCheck || !prefsHydrated || !checkForUpdates) return;
    void runCheck();
  }, [autoCheck, prefsHydrated, checkForUpdates, runCheck]);

  return { status, check: runCheck, install, dismiss, restart, deferRestart };
}
