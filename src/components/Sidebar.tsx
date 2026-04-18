import type { Stats, View } from '../types';
import { toolCssClass } from '../lib/tool-style';
import AppLogo from './AppLogo';
import { CloseIcon, RefreshIcon, SettingsIcon, StarIcon, TimelineIcon } from './AppIcons';

interface SidebarProps {
  view: View;
  toolFilter?: string;
  tools: string[];
  stats: Stats | null;
  scanning: boolean;
  mobileOpen?: boolean;
  onTimeline: () => void;
  onFavorites: () => void;
  onSettings: () => void;
  onToolSelect: (tool: string) => void;
  onScan: () => void;
  onClose?: () => void;
}

export default function Sidebar({
  view,
  toolFilter,
  tools,
  stats,
  scanning,
  mobileOpen = false,
  onTimeline,
  onFavorites,
  onSettings,
  onToolSelect,
  onScan,
  onClose = () => {},
}: SidebarProps) {
  return (
    <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
      <div className="sidebar-header">
        {mobileOpen && (
          <button
            aria-label="Close navigation"
            className="sidebar-close-btn"
            onClick={onClose}
            type="button"
          >
            <CloseIcon />
          </button>
        )}
        <div className="sidebar-logo">
          <AppLogo />
          <span>Recall</span>
        </div>
        {stats && <div className="sidebar-stats">{stats.total_sessions} sessions · {stats.total_tools} tools</div>}
      </div>

      <nav className="sidebar-nav">
        <div className="nav-group-label">Browse</div>
        <button
          className={`nav-item ${view === 'timeline' && !toolFilter ? 'active' : ''}`}
          onClick={() => {
            onTimeline();
            onClose();
          }}
          type="button"
        >
          <span className="nav-icon"><TimelineIcon /></span>
          Timeline
          {stats && <span className="nav-count">{stats.total_sessions}</span>}
        </button>
        <button
          className={`nav-item ${view === 'favorites' ? 'active' : ''}`}
          onClick={() => {
            onFavorites();
            onClose();
          }}
          type="button"
        >
          <span className="nav-icon"><StarIcon /></span>
          Favorites
        </button>

        {tools.length > 0 && (
          <>
            <div className="nav-group-label">Tools</div>
            {tools.map((tool) => (
              <button
                key={tool}
                className={`nav-item ${toolFilter === tool && view === 'timeline' ? 'active' : ''}`}
                onClick={() => {
                  onToolSelect(tool);
                  onClose();
                }}
                type="button"
              >
                <div className={`tool-dot ${toolCssClass(tool)}`} />
                {tool}
              </button>
            ))}
          </>
        )}

        <div className="nav-group-label">System</div>
        <button
          className={`nav-item ${view === 'settings' ? 'active' : ''}`}
          onClick={() => {
            onSettings();
            onClose();
          }}
          type="button"
        >
          <span className="nav-icon"><SettingsIcon /></span>
          Settings
        </button>
      </nav>

      <div className="sidebar-bottom">
        <button
          className={`scan-btn ${scanning ? 'scanning' : ''}`}
          onClick={() => {
            onScan();
            onClose();
          }}
          disabled={scanning}
          type="button"
        >
          <span className="scan-btn-content">
            <RefreshIcon className={scanning ? 'spin-icon' : undefined} />
            <span>{scanning ? 'Scanning…' : 'Scan Sources'}</span>
          </span>
          {scanning && <span className="scan-bar" />}
        </button>
      </div>
    </aside>
  );
}
