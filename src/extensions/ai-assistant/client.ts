const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "anthropic/claude-sonnet-4-5";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type StreamCallbacks = {
  onChunk: (text: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
};

export async function streamChat(
  apiKey: string,
  messages: ChatMessage[],
  systemPrompt: string,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: true,
      }),
      signal,
    });
  } catch (err) {
    if ((err as DOMException)?.name !== "AbortError") {
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    }
    return;
  }

  if (!response.ok) {
    let msg = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      msg = body?.error?.message ?? msg;
    } catch {}
    callbacks.onError(new Error(msg));
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    callbacks.onError(new Error("No response body"));
    return;
  }

  const decoder = new TextDecoder();
  let buf = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") continue;
        try {
          const ev = JSON.parse(payload);
          const delta = ev?.choices?.[0]?.delta?.content;
          if (typeof delta === "string") {
            callbacks.onChunk(delta);
          }
        } catch {}
      }
    }
    callbacks.onDone();
  } catch (err) {
    if ((err as DOMException)?.name !== "AbortError") {
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    }
  } finally {
    reader.releaseLock();
  }
}

export function buildSystemPrompt(opts: {
  workspacePath?: string | null;
  sessionContext?: string | null;
}): string {
  const lines: string[] = [
    "You are a helpful AI assistant embedded in Recall, a terminal workspace for developers.",
    "Help with terminal commands, code, development questions, and debugging.",
    "Be concise and practical. Use markdown formatting for code blocks.",
  ];
  if (opts.workspacePath) {
    lines.push(`\nCurrent workspace: ${opts.workspacePath}`);
  }
  if (opts.sessionContext) {
    lines.push("\n" + opts.sessionContext);
  }
  return lines.join("\n");
}

export function buildNlCommandPrompt(cwd: string | null | undefined): string {
  const os = navigator.userAgent.includes("Windows") ? "Windows" : navigator.userAgent.includes("Linux") ? "Linux" : "macOS";
  return [
    "You are a shell command expert. Convert natural language into a single shell command.",
    `OS: ${os}`,
    cwd ? `Current directory: ${cwd}` : "",
    "",
    "Rules:",
    "- Respond with ONLY the shell command, nothing else",
    "- No explanation, no markdown fences, no backticks — just the raw command",
    "- If multiple steps are needed, chain with && or ;",
    "- Prefer safe, non-destructive commands when possible",
  ].filter(Boolean).join("\n");
}
