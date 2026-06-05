const TOOL_THEME_BY_MATCH = [
  ["copilot cli", { label: "Copilot CLI", rgb: "86, 156, 214" }],
  ["copilot", { label: "Copilot VS Code", rgb: "86, 156, 214" }],
  ["antigravity", { label: "Antigravity", rgb: "78, 201, 176" }],
  ["claude", { label: "Claude Code", rgb: "206, 145, 120" }],
  ["codex", { label: "Codex", rgb: "197, 134, 192" }],
  ["pi", { label: "Pi", rgb: "129, 199, 132" }],
] as const;

export function getToolTheme(tool: string): { label: string; rgb: string } {
  const lower = tool.toLowerCase();
  for (const [match, theme] of TOOL_THEME_BY_MATCH) {
    if (lower.includes(match)) return theme;
  }
  return { label: tool, rgb: "86, 156, 214" };
}