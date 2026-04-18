import type { SessionSummary } from '../types';
import { getRepoShortName, formatTimeLabel } from '../lib/session-format';
import { toolCssClass } from '../lib/tool-style';
import { StarIcon } from './AppIcons';

interface SessionCardProps {
  session: SessionSummary;
  showFavoriteToggle?: boolean;
  onOpen: (id: string) => void;
  onToggleFavorite?: (sessionId: string) => Promise<void>;
}

export default function SessionCard({
  session,
  showFavoriteToggle = true,
  onOpen,
  onToggleFavorite,
}: SessionCardProps) {
  return (
    <div className="session-card" onClick={() => onOpen(session.id)}>
      <div className="session-card-body">
        <div className="session-card-title">{session.title || 'Untitled Session'}</div>
        <div className="session-card-sub">
          <span className={`tool-pill ${toolCssClass(session.tool)}`}>{session.tool}</span>
          {session.model && <span>{session.model}</span>}
          {session.repo_path && <span className="repo-tag">{getRepoShortName(session.repo_path)}</span>}
        </div>
      </div>

      <div className="session-card-right">
        <span className="session-card-time">{formatTimeLabel(session.started_at)}</span>
        <span className="session-card-counts">
          {session.message_count} msg{session.message_count !== 1 ? 's' : ''}
          {session.file_count > 0 ? ` · ${session.file_count} file${session.file_count !== 1 ? 's' : ''}` : ''}
        </span>
        {showFavoriteToggle && onToggleFavorite && (
          <button
            className={`fav-btn ${session.is_favorite ? 'on' : ''}`}
            aria-label={session.is_favorite ? 'Remove favorite' : 'Add favorite'}
            onClick={(event) => {
              event.stopPropagation();
              void onToggleFavorite(session.id);
            }}
            type="button"
          >
            <StarIcon fill={session.is_favorite ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>
    </div>
  );
}