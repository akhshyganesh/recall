import { invoke } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";
import { unzipSync, strFromU8 } from "fflate";
import { create } from "zustand";
import { loadExtension, unloadExtension } from "./registry";
import type { RecallExtension } from "./types";

// ── Data model ────────────────────────────────────────────────────────────────

export type ExtensionSource =
  | { kind: "zip" }
  | { kind: "github"; owner: string; repo: string; tag: string }
  | { kind: "local" }
  | { kind: "builtin" };

export interface InstalledExtension {
  id: string;
  name: string;
  version: string;
  description: string;
  entry: string; // absolute path on disk
  source: ExtensionSource;
  enabled: boolean;
  installedAt: number;
  latestVersion: string | null;
  checkedAt: number | null;
}

// ── Builtin disabled / removed state (localStorage) ──────────────────────────

const BUILTIN_DISABLED_KEY = "recall.builtins.disabled.v1";
const BUILTIN_REMOVED_KEY  = "recall.builtins.removed.v1";

function readSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeSet(key: string, s: Set<string>): void {
  try { localStorage.setItem(key, JSON.stringify([...s])); } catch {}
}

export function isBuiltinDisabled(id: string): boolean {
  return readSet(BUILTIN_DISABLED_KEY).has(id);
}

export function isBuiltinRemoved(id: string): boolean {
  return readSet(BUILTIN_REMOVED_KEY).has(id);
}

// ── Zustand store ─────────────────────────────────────────────────────────────

interface ExtensionStoreState {
  extensions: InstalledExtension[];
  loading: boolean;
  hydrated: boolean;
  _set: (ext: InstalledExtension[]) => void;
  _patch: (id: string, patch: Partial<InstalledExtension>) => void;
  _remove: (id: string) => void;
  _addBuiltin: (ext: InstalledExtension) => void;
}

export const useExtensionStore = create<ExtensionStoreState>((set) => ({
  extensions: [],
  loading: false,
  hydrated: false,
  _set: (extensions) => set({ extensions, hydrated: true }),
  _patch: (id, patch) =>
    set((s) => ({
      extensions: s.extensions.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    })),
  _remove: (id) =>
    set((s) => ({ extensions: s.extensions.filter((e) => e.id !== id) })),
  _addBuiltin: (ext) =>
    set((s) => {
      if (s.extensions.find((e) => e.id === ext.id)) return s;
      return { extensions: [ext, ...s.extensions] };
    }),
}));

// ── plugins.json I/O ──────────────────────────────────────────────────────────

interface PluginsFile {
  version: number;
  plugins: InstalledExtension[];
}

async function getDataDir(): Promise<string> {
  const d = await appDataDir();
  return d.endsWith("/") || d.endsWith("\\") ? d : d + "/";
}

async function readPluginsFile(): Promise<InstalledExtension[]> {
  try {
    const dataDir = await getDataDir();
    const result = await invoke<{ kind: string; content?: string }>("fs_read_file", {
      path: `${dataDir}plugins.json`,
      workspace: { kind: "local" },
    });
    if (result.kind !== "text" || !result.content) return [];
    const parsed = JSON.parse(result.content) as PluginsFile | { plugins: unknown[] };
    return (parsed.plugins ?? []) as InstalledExtension[];
  } catch {
    return [];
  }
}

async function writePluginsFile(plugins: InstalledExtension[]): Promise<void> {
  const dataDir = await getDataDir();
  const file: PluginsFile = { version: 1, plugins };
  await invoke<void>("fs_write_file", {
    path: `${dataDir}plugins.json`,
    content: JSON.stringify(file, null, 2),
    workspace: { kind: "local" },
  });
}

// ── Hydration ─────────────────────────────────────────────────────────────────

export async function hydrateExtensionStore(): Promise<void> {
  const plugins = await readPluginsFile();
  // Preserve any builtins already registered before hydration runs.
  const existing = useExtensionStore.getState().extensions;
  const builtins = existing.filter((e) => e.source.kind === "builtin");
  useExtensionStore.getState()._set([...builtins, ...plugins]);
}

// ── Register a built-in extension in the UI store ─────────────────────────────

// Holds RecallExtension refs so builtins can be re-activated after enable.
const builtinRefs = new Map<string, import("./types").RecallExtension>();

export function registerBuiltinInStore(
  ext: import("./types").RecallExtension,
): void {
  builtinRefs.set(ext.id, ext);
  // Skip builtins the user has permanently removed.
  if (isBuiltinRemoved(ext.id)) return;
  const disabled = readSet(BUILTIN_DISABLED_KEY);
  const entry: InstalledExtension = {
    id: ext.id,
    name: ext.name,
    version: ext.version,
    description: ext.description ?? "",
    entry: "",
    source: { kind: "builtin" },
    enabled: !disabled.has(ext.id),
    installedAt: 0,
    latestVersion: null,
    checkedAt: null,
  };
  useExtensionStore.getState()._addBuiltin(entry);
}

// ── Install helpers ───────────────────────────────────────────────────────────

async function ensureExtensionDir(extId: string): Promise<string> {
  const dataDir = await getDataDir();
  const dir = `${dataDir}extensions/${extId}`;
  try {
    await invoke<void>("fs_create_dir", { path: dir, workspace: { kind: "local" } });
  } catch {
    // dir may already exist
  }
  return dir;
}

async function writeTextFile(path: string, content: string): Promise<void> {
  await invoke<void>("fs_write_file", {
    path,
    content,
    workspace: { kind: "local" },
  });
}

async function deleteDir(path: string): Promise<void> {
  await invoke<void>("fs_delete", { path, workspace: { kind: "local" } });
}

// ── Manifest inside a ZIP or standalone JS ────────────────────────────────────

interface ExtManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  entry?: string; // filename of the entry JS, defaults to "index.js"
}

function extractManifestFromJs(src: string): Partial<ExtManifest> {
  // Best-effort: look for id/name/version declared as string literals at top level.
  const grab = (key: string) => {
    const m = src.match(new RegExp(`\\b${key}:\\s*["'\`]([^"'\`]+)["'\`]`));
    return m?.[1];
  };
  return {
    id: grab("id"),
    name: grab("name"),
    version: grab("version"),
    description: grab("description"),
  };
}

// ── Install from ZIP bytes (Uint8Array) ───────────────────────────────────────

export async function installFromZipBytes(
  bytes: Uint8Array,
): Promise<InstalledExtension> {
  let files: ReturnType<typeof unzipSync>;
  try {
    files = unzipSync(bytes);
  } catch (e) {
    throw new Error(`Could not read ZIP: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Strip common top-level folder prefix
  const allKeys = Object.keys(files);
  const prefix = (() => {
    const first = allKeys[0] ?? "";
    const slash = first.indexOf("/");
    if (slash < 0) return "";
    const candidate = first.slice(0, slash + 1);
    return allKeys.every((k) => k.startsWith(candidate)) ? candidate : "";
  })();
  const file = (name: string) => files[`${prefix}${name}`] ?? files[name];

  // Parse manifest.json
  let manifest: ExtManifest | null = null;
  const manifestBytes = file("manifest.json");
  if (manifestBytes) {
    try {
      manifest = JSON.parse(strFromU8(manifestBytes)) as ExtManifest;
    } catch {
      throw new Error("manifest.json in ZIP is not valid JSON");
    }
  }

  // Locate entry JS
  const entryName = manifest?.entry ?? "index.js";
  const entryBytes = file(entryName);
  if (!entryBytes) throw new Error(`Entry file "${entryName}" not found in ZIP`);
  const entryText = strFromU8(entryBytes);

  // Fallback manifest from JS content
  if (!manifest) {
    const partial = extractManifestFromJs(entryText);
    if (!partial.id) throw new Error("Could not find extension id in ZIP (no manifest.json and no id in index.js)");
    manifest = {
      id: partial.id,
      name: partial.name ?? partial.id,
      version: partial.version ?? "0.0.0",
      description: partial.description,
      entry: entryName,
    };
  }

  if (!manifest.id) throw new Error("Extension manifest is missing required 'id' field");

  const extDir = await ensureExtensionDir(manifest.id);
  const entryPath = `${extDir}/${entryName}`;

  // Write manifest.json
  await writeTextFile(`${extDir}/manifest.json`, JSON.stringify(manifest, null, 2));
  // Write entry JS
  await writeTextFile(entryPath, entryText);
  // Write any other text files (assets, etc.)
  for (const [key, fileBytes] of Object.entries(files)) {
    const name = prefix ? key.slice(prefix.length) : key;
    if (!name || name === "manifest.json" || name === entryName) continue;
    try {
      const text = strFromU8(fileBytes);
      await writeTextFile(`${extDir}/${name}`, text);
    } catch {
      // Skip binary assets we can't write as text
    }
  }

  const ext: InstalledExtension = {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description ?? "",
    entry: entryPath,
    source: { kind: "zip" },
    enabled: true,
    installedAt: Date.now(),
    latestVersion: null,
    checkedAt: null,
  };

  await persistAndActivate(ext);
  return ext;
}

// ── Install from GitHub URL ───────────────────────────────────────────────────

export function parseGitHubUrl(
  url: string,
): { owner: string; repo: string; tag: string | null } | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname !== "github.com") return null;
    const parts = u.pathname.replace(/^\//, "").split("/");
    const [owner, repo, , , tag] = parts;
    if (!owner || !repo) return null;
    return {
      owner,
      repo: repo.replace(/\.git$/, ""),
      tag: tag ?? null,
    };
  } catch {
    return null;
  }
}

interface GitHubRelease {
  tag_name: string;
  html_url: string;
  assets: Array<{ name: string; browser_download_url: string }>;
}

async function fetchGitHubRelease(
  owner: string,
  repo: string,
  tag: string | null,
): Promise<GitHubRelease> {
  const endpoint = tag
    ? `https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`
    : `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
  const res = await fetch(endpoint, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
  return res.json() as Promise<GitHubRelease>;
}

export async function installFromGitHub(url: string): Promise<InstalledExtension> {
  const parsed = parseGitHubUrl(url);
  if (!parsed) throw new Error("Not a valid GitHub repository URL");
  const { owner, repo, tag } = parsed;

  const release = await fetchGitHubRelease(owner, repo, tag);

  // Prefer recall-plugin.js > plugin.js > index.js > any .js > recall-plugin.zip > *.zip
  const jsAsset =
    release.assets.find((a) => a.name === "recall-plugin.js") ??
    release.assets.find((a) => a.name === "plugin.js") ??
    release.assets.find((a) => a.name === "index.js") ??
    release.assets.find((a) => a.name.endsWith(".js"));
  const zipAsset =
    release.assets.find((a) => a.name === "recall-plugin.zip") ??
    release.assets.find((a) => a.name.endsWith(".zip"));

  if (!jsAsset && !zipAsset) {
    throw new Error(
      `No installable asset found in release ${release.tag_name}. ` +
        "Publish a recall-plugin.js or recall-plugin.zip release asset.",
    );
  }

  if (zipAsset && !jsAsset) {
    const res = await fetch(zipAsset.browser_download_url);
    if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const ext = await installFromZipBytes(bytes);
    return {
      ...ext,
      source: { kind: "github", owner, repo, tag: release.tag_name },
    };
  }

  const res = await fetch(jsAsset!.browser_download_url);
  if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);
  const entryText = await res.text();

  const partial = extractManifestFromJs(entryText);
  if (!partial.id) {
    throw new Error(
      "Could not find extension id in the downloaded JS. " +
        "Make sure the extension exports an id string literal.",
    );
  }

  const extDir = await ensureExtensionDir(partial.id);
  const entryPath = `${extDir}/index.js`;
  await writeTextFile(entryPath, entryText);

  const ext: InstalledExtension = {
    id: partial.id,
    name: partial.name ?? partial.id,
    version: partial.version ?? release.tag_name.replace(/^v/, ""),
    description: partial.description ?? "",
    entry: entryPath,
    source: { kind: "github", owner, repo, tag: release.tag_name },
    enabled: true,
    installedAt: Date.now(),
    latestVersion: null,
    checkedAt: null,
  };

  await persistAndActivate(ext);
  return ext;
}

// ── Persist + activate ────────────────────────────────────────────────────────

async function persistAndActivate(ext: InstalledExtension): Promise<void> {
  const store = useExtensionStore.getState();
  const next = [
    ...store.extensions.filter((e) => e.id !== ext.id),
    ext,
  ];
  await writePluginsFile(next);
  store._set(next);

  if (ext.enabled) {
    try {
      const mod = (await import(/* @vite-ignore */ ext.entry)) as {
        default?: RecallExtension;
        plugin?: RecallExtension;
      };
      const plugin = mod.default ?? mod.plugin;
      if (plugin) loadExtension(plugin);
    } catch (err) {
      console.error(`[extensions] runtime load failed for "${ext.id}":`, err);
    }
  }
}

// ── Toggle / remove ───────────────────────────────────────────────────────────

export async function setExtensionEnabled(id: string, enabled: boolean): Promise<void> {
  const store = useExtensionStore.getState();
  const ext = store.extensions.find((e) => e.id === id);
  if (!ext) return;

  if (ext.source.kind === "builtin") {
    store._patch(id, { enabled });
    const disabled = readSet(BUILTIN_DISABLED_KEY);
    if (enabled) disabled.delete(id);
    else disabled.add(id);
    writeSet(BUILTIN_DISABLED_KEY, disabled);
    if (!enabled) {
      unloadExtension(id);
    } else {
      const ref = builtinRefs.get(id);
      if (ref) loadExtension(ref);
    }
    return;
  }

  store._patch(id, { enabled });
  // Read fresh state after patch so we don't write stale data; also exclude builtins.
  const fresh = useExtensionStore.getState().extensions.filter((e) => e.source.kind !== "builtin");
  await writePluginsFile(fresh.map((e) => (e.id === id ? { ...e, enabled } : e)));

  if (!enabled) {
    unloadExtension(id);
  } else {
    // Re-activate — the module is already cached by Vite so this is cheap.
    try {
      const mod = (await import(/* @vite-ignore */ ext.entry)) as {
        default?: RecallExtension;
        plugin?: RecallExtension;
      };
      const plugin = mod.default ?? mod.plugin;
      if (plugin) loadExtension(plugin);
    } catch (err) {
      console.error(`[extensions] runtime re-load failed for "${ext.id}":`, err);
    }
  }
}

export async function removeExtension(id: string): Promise<void> {
  const store = useExtensionStore.getState();
  const ext = store.extensions.find((e) => e.id === id);
  if (!ext) return;

  unloadExtension(id);
  store._remove(id);

  if (ext.source.kind === "builtin") {
    // Mark as removed so loader skips it on next startup.
    const removed = readSet(BUILTIN_REMOVED_KEY);
    removed.add(id);
    writeSet(BUILTIN_REMOVED_KEY, removed);
    // Also clear any disabled entry so state is clean.
    const disabled = readSet(BUILTIN_DISABLED_KEY);
    disabled.delete(id);
    writeSet(BUILTIN_DISABLED_KEY, disabled);
    return;
  }

  const remaining = useExtensionStore.getState().extensions.filter((e) => e.source.kind !== "builtin");
  await writePluginsFile(remaining);
  try {
    const dataDir = await getDataDir();
    await deleteDir(`${dataDir}extensions/${id}`);
  } catch {
    // best-effort
  }
}

// ── Update checking ───────────────────────────────────────────────────────────

export async function checkForUpdates(id: string): Promise<void> {
  const store = useExtensionStore.getState();
  const ext = store.extensions.find((e) => e.id === id);
  if (!ext || ext.source.kind !== "github") return;
  const { owner, repo } = ext.source;
  try {
    const release = await fetchGitHubRelease(owner, repo, null);
    const latest = release.tag_name.replace(/^v/, "");
    store._patch(id, { latestVersion: latest, checkedAt: Date.now() });
    await writePluginsFile(useExtensionStore.getState().extensions);
  } catch {
    // silently ignore network errors
  }
}

export async function updateExtension(id: string): Promise<void> {
  const store = useExtensionStore.getState();
  const ext = store.extensions.find((e) => e.id === id);
  if (!ext || ext.source.kind !== "github") return;
  const { owner, repo } = ext.source;
  const url = `https://github.com/${owner}/${repo}`;
  unloadExtension(id);
  await installFromGitHub(url);
}
