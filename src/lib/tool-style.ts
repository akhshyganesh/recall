const TOOL_CLASS_BY_MATCH = [
  ['copilot', 'copilot'],
  ['claude', 'claude_code'],
  ['cursor', 'cursor'],
  ['aider', 'aider'],
  ['codex', 'codex'],
  ['cline', 'cline'],
  ['gemini', 'gemini'],
] as const;

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