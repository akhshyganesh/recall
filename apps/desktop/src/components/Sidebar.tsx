import type { OpenTab, Stats, UpdateStatus, View } from '../types';
import { toolCssClass } from '../lib/tool-style';
import AppLogo from './AppLogo';
import { CloseIcon, DownloadIcon, PinIcon, RefreshIcon, SettingsIcon, StarIcon, TimelineIcon } from './AppIcons';

interface SidebarProps {
  view: View;
  activeSessionId: string | null;
  openTabs: OpenTab[];
  stats: Stats | null;
  scanning: boolean;
  updateStatus: UpdateStatus;
  mobileOpen?: boolean;
  onTimeline: () => void;
  onFavorites: () => void;
  onSettings: () => void;
  onDownloadAndInstall: () => void;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onTogglePinTab: (id: string) => void;
  onScan: () => void;
  onClose?: () => void;
}

function getUpdateBannerSubtitle(updateStatus: UpdateStatus): string {
  if (updateStatus.state === 'downloading') {
    return `Downloading… ${updateStatus.download_progress ?? 0}%`;
  }
  if (updateStatus.state === 'installing') {
    return 'Installing — restarting shortly';
  }
  return updateStatus.latest_version
    ? `Version ${updateStatus.latest_version} available`
    : 'A newer release is available';
}

export default function Sidebar({
  view,
  activeSessionId,
  openTabs,
  stats,
  scanning,
  updateStatus,
  mobileOpen = false,
  onTimeline,
  onFavorites,
  onSettings,
  onDownloadAndInstall,
  onSelectTab,
  onCloseTab,
  onTogglePinTab,
  onScan,
  onClose = () => {},
}: SidebarProps) {
  const showUpdateBanner = updateStatus.state === 'available' || updateStatus.state === 'downloading' || updateStatus.state === 'installing';
  const sortedTabs = [...openTabs].sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }

    return 0;
  });

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
        <div className="sidebar-brand-row">
          <div className="sidebar-logo">
            <AppLogo />
          </div>
          {stats && (
            <div className="sidebar-stats">
              <span>{stats.total_sessions} sessions</span>
              <span>{stats.total_tools} tools</span>
            </div>
          )}
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-group-label">Browse</div>
        <button
          className={`nav-item ${view === 'timeline' ? 'active' : ''}`}
          onClick={() => {
            onTimeline();
            onClose();
          }}
          type="button"
        >
          <span className="nav-icon"><TimelineIcon /></span>
          <span className="nav-label">Timeline</span>
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
          <span className="nav-label">Favorites</span>
        </button>

        {sortedTabs.length > 0 && (
          <>
            <div className="nav-group-label">Open Sessions</div>
            {sortedTabs.map((tab) => (
              <div
                key={tab.id}
                className={`tab-item ${view === 'session' && activeSessionId === tab.id ? 'active' : ''} ${tab.pinned ? 'pinned' : ''}`}
              >
                <button
                  className="tab-item-main"
                  onClick={() => {
                    onSelectTab(tab.id);
                    onClose();
                  }}
                  type="button"
                >
                  <div className={`tool-dot ${toolCssClass(tab.tool)}`} />
                  <span className="nav-label">{tab.title}</span>
                </button>
                <div className="tab-item-actions">
                  <button
                    aria-label={tab.pinned ? 'Unpin tab' : 'Pin tab'}
                    className={`tab-action-btn ${tab.pinned ? 'pin-active' : ''}`}
                    onClick={() => onTogglePinTab(tab.id)}
                    type="button"
                  >
                    <PinIcon />
                  </button>
                  <button
                    aria-label="Close tab"
                    className="tab-action-btn"
                    onClick={() => onCloseTab(tab.id)}
                    type="button"
                  >
                    <CloseIcon />
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
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
        {showUpdateBanner && (
          <button
            className={`update-banner available ${updateStatus.state === 'downloading' || updateStatus.state === 'installing' ? 'in-progress' : ''}`}
            disabled={updateStatus.state === 'downloading' || updateStatus.state === 'installing'}
            onClick={onDownloadAndInstall}
            type="button"
          >
            <span className="update-banner-icon">
              {updateStatus.state === 'downloading' || updateStatus.state === 'installing'
                ? <RefreshIcon className="spin-icon" />
                : <DownloadIcon />}
            </span>
            <span className="update-banner-copy">
              <span className="update-banner-title">
                {updateStatus.state === 'downloading' ? 'Downloading update' :
                 updateStatus.state === 'installing' ? 'Installing update' :
                 'Update available'}
              </span>
              <span className="update-banner-sub">{getUpdateBannerSubtitle(updateStatus)}</span>
            </span>
            <span className="update-banner-action">
              {updateStatus.state === 'available' ? 'Install' : ''}
            </span>
          </button>
        )}
        <button
          className={`nav-item sidebar-utility ${view === 'settings' ? 'active' : ''}`}
          onClick={() => {
            onSettings();
            onClose();
          }}
          type="button"
        >
          <span className="nav-icon"><SettingsIcon /></span>
          <span className="nav-label">Settings</span>
        </button>
      </div>
    </aside>
  );
}
