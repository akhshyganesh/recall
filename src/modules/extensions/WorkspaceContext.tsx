import { createContext, useContext } from "react";

interface WorkspaceContextValue {
  workspacePath: string | null;
}

export const WorkspaceContext = createContext<WorkspaceContextValue>({ workspacePath: null });

export function useWorkspacePath(): string | null {
  return useContext(WorkspaceContext).workspacePath;
}

/**
 * Storage key scoped to either the active workspace or global.
 *
 * scope === "workspace"  →  "${baseKey}.ws.${hash}"
 * scope === "global"     →  baseKey
 */
export function useScopedStorageKey(
  baseKey: string,
  extensionId: string,
  workspacePath: string | null,
): string {
  const scopeKey = `recall.ext-scope.${extensionId}`;
  let scope: "global" | "workspace" = "global";
  try {
    const raw = localStorage.getItem(scopeKey);
    if (raw === "workspace") scope = "workspace";
  } catch { /* ignore */ }

  if (scope === "workspace" && workspacePath) {
    const hash = simpleHash(workspacePath);
    return `${baseKey}.ws.${hash}`;
  }
  return baseKey;
}

export function getExtensionScope(extensionId: string): "global" | "workspace" {
  try {
    const raw = localStorage.getItem(`recall.ext-scope.${extensionId}`);
    return raw === "workspace" ? "workspace" : "global";
  } catch {
    return "global";
  }
}

export function setExtensionScope(extensionId: string, scope: "global" | "workspace"): void {
  try {
    localStorage.setItem(`recall.ext-scope.${extensionId}`, scope);
  } catch { /* ignore */ }
}

function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}
