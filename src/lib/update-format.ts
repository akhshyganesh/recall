export function formatUpdateDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function trimReleaseNotes(notes: string | null | undefined, maxLength = 280): string | null {
  if (!notes) {
    return null;
  }

  const normalized = notes.trim().replace(/\r\n/g, '\n');
  if (!normalized) {
    return null;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

/**
 * Strip a leading 'v' and any build metadata, then compare semver-ish numeric segments.
 * Returns 1 if a > b, -1 if a < b, 0 if equal. Non-numeric segments compare lexically.
 */
export function compareVersions(a: string, b: string): number {
  const normalize = (value: string): (number | string)[] => value
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .map((segment) => {
      const numeric = Number(segment);
      return Number.isFinite(numeric) ? numeric : segment;
    });

  const left = normalize(a);
  const right = normalize(b);
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i += 1) {
    const lv = left[i] ?? 0;
    const rv = right[i] ?? 0;

    if (typeof lv === 'number' && typeof rv === 'number') {
      if (lv > rv) return 1;
      if (lv < rv) return -1;
      continue;
    }

    const ls = String(lv);
    const rs = String(rv);
    if (ls > rs) return 1;
    if (ls < rs) return -1;
  }

  return 0;
}