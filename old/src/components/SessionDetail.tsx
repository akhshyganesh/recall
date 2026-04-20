import { useState, type ReactNode } from 'react';

import MessageBody from '../MessageBody';
import type { Session } from '../types';
import { formatDateTime } from '../lib/session-format';
import { toolCssClass } from '../lib/tool-style';
import {
  BranchIcon,
  CalendarIcon,
  CopyIcon,
  DatabaseIcon,
  FileChangesIcon,
  FolderIcon,
  JsonIcon,
  MessagesIcon,
} from './AppIcons';

interface SessionDetailProps {
  session: Session;
  onExport: (format: 'markdown' | 'json' | 'text') => void;
}

function DiffFileChange({
  fileChange,
}: {
  fileChange: Session['file_changes'][number];
}) {
  const [open, setOpen] = useState(false);
  const hasDiff = Boolean(fileChange.diff_text);

  return (
    <div className={`diff-file ${open ? 'open' : ''}`}>
      <button
        className={`diff-file-head ${hasDiff ? '' : 'no-toggle'}`.trim()}
        onClick={hasDiff ? () => setOpen((current) => !current) : undefined}
        type="button"
        aria-expanded={hasDiff ? open : undefined}
        disabled={!hasDiff}
      >
        {hasDiff && (
          <span className={`accordion-chevron ${open ? 'open' : ''}`}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M6 4l4 4-4 4" />
            </svg>
          </span>
        )}
        <span className="diff-file-path">{fileChange.path}</span>
        <div className="diff-stats">
          {fileChange.additions > 0 && <span className="add">+{fileChange.additions}</span>}
          {fileChange.deletions > 0 && <span className="del">-{fileChange.deletions}</span>}
        </div>
      </button>
      {hasDiff && open && (
        <div className="diff-body">
          {fileChange.diff_text?.split('\n').map((line, index) => (
            <div
              key={`${fileChange.id}-${index}`}
              className={`diff-ln ${line.startsWith('+') ? 'plus' : line.startsWith('-') ? 'minus' : ''}`}
            >
              <span className="diff-ln-num">{index + 1}</span>
              <span>{line}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailChip({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="detail-chip">
      <span className="chip-icon">{icon}</span>
      <span className="label">{label}</span>
      <span className="val">{value}</span>
    </div>
  );
}

function ToolbarButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="ghost-btn" onClick={onClick} type="button">
      {icon}
      {label}
    </button>
  );
}

export default function SessionDetail({ session, onExport }: SessionDetailProps) {
  return (
    <div className="detail enter">
      <div className="detail-chips">
        {session.started_at && (
          <DetailChip icon={<CalendarIcon />} label="Started" value={formatDateTime(session.started_at)} />
        )}
        {session.ended_at && (
          <DetailChip icon={<CalendarIcon />} label="Ended" value={formatDateTime(session.ended_at)} />
        )}
        {session.repo_path && <DetailChip icon={<FolderIcon />} label="Repo" value={session.repo_path} />}
        {session.branch && <DetailChip icon={<BranchIcon />} label="Branch" value={session.branch} />}
      </div>

      <div className="detail-toolbar">
        <ToolbarButton icon={<MessagesIcon />} label="Export MD" onClick={() => onExport('markdown')} />
        <ToolbarButton icon={<JsonIcon />} label="Export JSON" onClick={() => onExport('json')} />
        <ToolbarButton icon={<DatabaseIcon />} label="Export Text" onClick={() => onExport('text')} />
        {session.repo_path && (
          <ToolbarButton icon={<CopyIcon />} label="Copy Path" onClick={() => navigator.clipboard.writeText(session.repo_path || '')} />
        )}
      </div>

      <div className="thread">
        {session.messages.map((message) => (
          <div key={message.id} className={`msg-wrap ${message.role}`}>
            <div className="msg-role">
              {message.role === 'user' ? 'You' : message.author || message.role}
              {message.created_at && <span className="msg-ts">{formatDateTime(message.created_at)}</span>}
            </div>
            <div className="msg">
              <MessageBody content={message.content} extra={message.extra} />
              <button className="msg-copy" onClick={() => navigator.clipboard.writeText(message.content)} type="button">
                copy
              </button>
            </div>
          </div>
        ))}
      </div>

      {session.file_changes.length > 0 && (
        <div className="diff-section">
          <div className="diff-section-title">
            <span className="section-icon"><FileChangesIcon /></span>
            <span>Files Changed ({session.file_changes.length})</span>
          </div>
          {session.file_changes.map((fileChange) => <DiffFileChange key={fileChange.id} fileChange={fileChange} />)}
        </div>
      )}

      <div className="detail-footer-pill">
        <span className={`tool-pill ${toolCssClass(session.tool)}`}>{session.tool}</span>
      </div>
    </div>
  );
}