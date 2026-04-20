const TOOL_CLASS_BY_MATCH = [
  ['copilot', 'copilot'],
  ['claude', 'claude_code'],
  ['cursor', 'cursor'],
  ['aider', 'aider'],
  ['codex', 'codex'],
  ['cline', 'cline'],
  ['gemini', 'gemini'],
] as const;

const TOOL_THEME_BY_KEY = {
  copilot: { key: 'copilot', label: 'Copilot', rgb: '86,156,214' },
  claude_code: { key: 'claude_code', label: 'Claude Code', rgb: '206,145,120' },
  cursor: { key: 'cursor', label: 'Cursor', rgb: '156,220,254' },
  aider: { key: 'aider', label: 'Aider', rgb: '106,153,85' },
  codex: { key: 'codex', label: 'Codex', rgb: '197,134,192' },
  cline: { key: 'cline', label: 'Cline', rgb: '215,186,125' },
  gemini: { key: 'gemini', label: 'Gemini', rgb: '220,220,170' },
} as const;

export interface ToolTheme {
  key: string;
  label: string;
  rgb: string;
}

function toolSlug(name: string): string {
  return name.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export function toolCssClass(name: string): string {
  const lowerCasedName = name.toLowerCase();

  for (const [match, className] of TOOL_CLASS_BY_MATCH) {
    if (lowerCasedName.includes(match)) {
      return className;
    }
  }

  return toolSlug(name);
}

export function getToolTheme(name: string): ToolTheme {
  const key = toolCssClass(name);

  if (key in TOOL_THEME_BY_KEY) {
    return TOOL_THEME_BY_KEY[key as keyof typeof TOOL_THEME_BY_KEY];
  }

  return {
    key,
    label: name,
    rgb: '86,156,214',
  };
}
