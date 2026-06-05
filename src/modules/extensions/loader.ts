import { invoke } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";
import { loadExtension } from "./registry";
import {
  hydrateExtensionStore,
  isBuiltinDisabled,
  registerBuiltinInStore,
} from "./store";
import type { RecallExtension } from "./types";
import { scratchPadExtension } from "./builtin/scratch-pad";
import { snippetsExtension } from "./builtin/snippets";
import { todoExtension } from "./builtin/todo";

interface PluginsEntry {
  id: string;
  entry: string;
  enabled?: boolean;
}

interface PluginsFile {
  plugins: PluginsEntry[];
}

interface ReadResult {
  kind: string;
  content?: string;
}

async function readTextFileSafe(path: string): Promise<string | null> {
  try {
    const result = await invoke<ReadResult>("fs_read_file", {
      path,
      workspace: { kind: "local" },
    });
    return result.kind === "text" && result.content ? result.content : null;
  } catch {
    return null;
  }
}

let loaded = false;

/**
 * Call once at app startup.  Reads `<appDataDir>/plugins.json`, hydrates the
 * persistent extension store, then dynamically imports each enabled extension.
 * Failures are isolated — a broken plugin cannot prevent the app from launching.
 */
export async function loadInstalledExtensions(): Promise<void> {
  if (loaded) return;
  loaded = true;

  // Built-in extensions: register in the UI store, activate unless disabled.
  for (const ext of [todoExtension, snippetsExtension, scratchPadExtension]) {
    registerBuiltinInStore(ext);
    if (!isBuiltinDisabled(ext.id)) loadExtension(ext);
  }

  // Hydrate the settings UI store regardless of whether loading succeeds.
  void hydrateExtensionStore();

  let file: PluginsFile;
  try {
    const dataDir = await appDataDir();
    const raw = await readTextFileSafe(`${dataDir}plugins.json`);
    if (!raw) return;
    file = JSON.parse(raw) as PluginsFile;
  } catch (err) {
    console.warn("[extensions] Could not read plugins.json:", err);
    return;
  }

  for (const entry of file.plugins ?? []) {
    if (entry.enabled === false) continue;
    try {
      const mod = (await import(/* @vite-ignore */ entry.entry)) as {
        default?: RecallExtension;
        plugin?: RecallExtension;
      };
      const ext = mod.default ?? mod.plugin;
      if (!ext || typeof ext.activate !== "function") {
        console.warn(`[extensions] "${entry.id}" has no valid default export — skipping`);
        continue;
      }
      loadExtension(ext);
    } catch (err) {
      console.error(`[extensions] Failed to load "${entry.id}":`, err);
    }
  }
}
