import { error as logError } from "@tauri-apps/plugin-log";
import { isTauriRuntime } from "./tauri";

function messageFromUnknown(value: unknown): string {
  if (value instanceof Error) return value.stack || value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function reportFrontendError(message: string): void {
  console.error(message);
  if (!isTauriRuntime()) return;
  void logError(message, { file: "frontend" }).catch(() => undefined);
}

export function installFrontendErrorLogging(): void {
  window.addEventListener("error", (event) => {
    reportFrontendError(
      `[frontend:error] ${event.message}\n${messageFromUnknown(event.error)}`,
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    reportFrontendError(
      `[frontend:unhandledrejection] ${messageFromUnknown(event.reason)}`,
    );
  });
}