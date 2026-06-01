import { isTauri } from "@tauri-apps/api/core";

export function isTauriRuntime(): boolean {
  try {
    return isTauri();
  } catch {
    return false;
  }
}