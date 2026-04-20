import type { ReactNode } from 'react';

import type { SessionSummary } from '../types';
import { groupSessionsByDate } from '../lib/session-format';
import EmptyState from './EmptyState';
import SessionCard from './SessionCard';

interface SessionFeedProps {
  sessions: SessionSummary[];
  loading: boolean;
  grouped?: boolean;
  showFavoriteToggle?: boolean;
  emptyState: {
    icon: ReactNode;
    title: string;
    description: string;
    action?: ReactNode;
  };
  onOpen: (id: string) => void;
  onToggleFavorite?: (sessionId: string) => Promise<void>;
}

export default function SessionFeed({
  sessions,
  loading,
  grouped = false,
  showFavoriteToggle = true,
  emptyState,
  onOpen,
  onToggleFavorite,
}: SessionFeedProps) {
  if (loading) {
    return (
      <div className="empty">
        <span className="spinner" />
      </div>
    );
  }

  if (sessions.length === 0) {
    return <EmptyState {...emptyState} />;
  }

  if (grouped) {
    const sessionGroups = groupSessionsByDate(sessions);

    return (
      <div className="session-feed">
        {sessionGroups.map((group) => (
          <section key={group.label}>
            <div className="group-label">{group.label}</div>
            {group.items.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                onOpen={onOpen}
                onToggleFavorite={onToggleFavorite}
                showFavoriteToggle={showFavoriteToggle}
              />
            ))}
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="session-feed">
      {sessions.map((session) => (
        <SessionCard
          key={session.id}
          session={session}
          onOpen={onOpen}
          onToggleFavorite={onToggleFavorite}
          showFavoriteToggle={showFavoriteToggle}
        />
      ))}
    </div>
  );
}