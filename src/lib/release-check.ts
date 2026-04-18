import { compareVersions } from './update-format';

const GITHUB_RELEASES_API = 'https://api.github.com/repos/akhshyganesh/recall/releases/latest';
const REQUEST_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 10 * 60 * 1_000; // 10 minutes

let cachedRelease: { data: LatestRelease; fetchedAt: number } | null = null;

export interface LatestRelease {
  version: string;
  release_url: string;
  release_date: string | null;
  release_notes: string | null;
}

interface GithubReleasePayload {
  tag_name?: unknown;
  name?: unknown;
  html_url?: unknown;
  published_at?: unknown;
  body?: unknown;
  draft?: unknown;
  prerelease?: unknown;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Fetches the latest published release from the public GitHub API and returns
 * normalized fields. Throws when the request fails or the payload is unusable.
 */
export async function fetchLatestRelease(): Promise<LatestRelease> {
  // Return cached result if still fresh
  if (cachedRelease && Date.now() - cachedRelease.fetchedAt < CACHE_TTL_MS) {
    return cachedRelease.data;
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch(GITHUB_RELEASES_API, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'recall-desktop-app',
      },
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (response.status === 403 || response.status === 429) {
    throw new Error('GitHub API rate limit reached — try again in a few minutes');
  }

  if (!response.ok) {
    throw new Error(`GitHub returned ${response.status} when checking for releases`);
  }

  const payload = (await response.json()) as GithubReleasePayload;

  if (payload.draft === true || payload.prerelease === true) {
    throw new Error('Latest release is unpublished');
  }

  const tag = asString(payload.tag_name) ?? asString(payload.name);
  if (!tag) {
    throw new Error('Latest release has no tag name');
  }

  const result: LatestRelease = {
    version: tag.replace(/^v/i, ''),
    release_url: asString(payload.html_url) ?? 'https://github.com/akhshyganesh/recall/releases/latest',
    release_date: asString(payload.published_at),
    release_notes: asString(payload.body),
  };

  cachedRelease = { data: result, fetchedAt: Date.now() };
  return result;
}

export function isNewerVersion(latest: string, current: string): boolean {
  return compareVersions(latest, current) > 0;
}
