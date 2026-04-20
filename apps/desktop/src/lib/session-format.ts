import type { DateFilter, SessionSummary } from '../types';

export interface SessionGroup {
  label: string;
  items: SessionSummary[];
}

export const DATE_FILTERS: DateFilter[] = ['all', 'today', 'yesterday', '7days', '30days'];

export function formatDateFilterLabel(filter: DateFilter): string {
  switch (filter) {
    case 'all':
      return 'All';
    case 'today':
      return 'Today';
    case 'yesterday':
      return 'Yesterday';
    case '7days':
      return '7d';
    case '30days':
      return '30d';
  }
}

export function formatTimeLabel(timestamp: string | null): string {
  if (!timestamp) return '—';

  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);

    if (diffInDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    if (diffInDays === 1) {
      return 'Yesterday';
    }

    if (diffInDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }

    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

export function formatDateTime(timestamp: string | null): string {
  if (!timestamp) return '—';

  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return '—';
  }
}

export function getDateGroupLabel(timestamp: string | null): string {
  if (!timestamp) return 'Unknown';

  try {
    const date = new Date(timestamp);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sessionDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffInDays = Math.floor((today.getTime() - sessionDay.getTime()) / 86_400_000);

    if (diffInDays === 0) return 'Today';
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays < 7) return 'This Week';
    if (diffInDays < 30) return 'This Month';

    return date.toLocaleDateString([], { month: 'long', year: 'numeric' });
  } catch {
    return 'Unknown';
  }
}

export function getDateRange(filter: DateFilter): { from?: string; to?: string } {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (filter) {
    case 'today':
      return { from: startOfDay.toISOString() };
    case 'yesterday': {
      const yesterday = new Date(startOfDay);
      yesterday.setDate(yesterday.getDate() - 1);
      return { from: yesterday.toISOString(), to: startOfDay.toISOString() };
    }
    case '7days': {
      const weekAgo = new Date(startOfDay);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return { from: weekAgo.toISOString() };
    }
    case '30days': {
      const monthAgo = new Date(startOfDay);
      monthAgo.setDate(monthAgo.getDate() - 30);
      return { from: monthAgo.toISOString() };
    }
    case 'all':
      return {};
  }
}

export function getRepoShortName(path: string | null): string {
  if (!path) return '';

  const parts = path.replace(/\/$/, '').split('/');
  return parts[parts.length - 1] || path;
}

export function groupSessionsByDate(sessions: SessionSummary[]): SessionGroup[] {
  const groups = new Map<string, SessionSummary[]>();

  for (const session of sessions) {
    const label = getDateGroupLabel(session.started_at);
    const existingGroup = groups.get(label);

    if (existingGroup) {
      existingGroup.push(session);
      continue;
    }

    groups.set(label, [session]);
  }

  return Array.from(groups, ([label, items]) => ({ label, items }));
}