import type { AppInfo, DetectedSource, Stats, UpdateStatus } from '../types';
import { formatBytes, formatUpdateDate, trimReleaseNotes } from '../lib/update-format';
import { DatabaseIcon, DownloadIcon, RefreshIcon, TrashIcon } from './AppIcons';

interface SettingsPanelProps {
  appInfo: AppInfo | null;
  sources: DetectedSource[];
  stats: Stats | null;
  updateStatus: UpdateStatus;
  onCheckForUpdates: () => void;
  onInstallUpdate: () => void;
  onClearDatabase: () => Promise<void>;
}

function formatCheckTime(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getUpdateTitle(updateStatus: UpdateStatus): string {
  switch (updateStatus.state) {
    case 'disabled':
      return 'Automatic updates are only enabled in signed release builds.';
    case 'checking':
      return 'Checking GitHub Releases for a newer build.';
    case 'available':
      return updateStatus.available_version
        ? `Version ${updateStatus.available_version} is ready to install.`
        : 'A newer signed release is ready to install.';
    case 'up-to-date':
      return 'This build already matches the latest published release.';
    case 'installing':
      return 'Downloading and installing the latest release.';
    case 'restarting':
      return 'Restarting Recall to finish the update.';
    case 'error':
      return 'The last update check did not complete.';
    default:
      return 'Check GitHub Releases for a signed in-place update.';
  }
}

function getUpdateMeta(appInfo: AppInfo | null, updateStatus: UpdateStatus): string | null {
  const releaseDate = formatUpdateDate(updateStatus.release_date);
  const checkedAt = formatCheckTime(updateStatus.checked_at);

  switch (updateStatus.state) {
    case 'disabled':
      return appInfo ? `Running Recall ${appInfo.current_version}.` : null;
    case 'checking':
      return 'Querying the latest release manifest.';
    case 'available':
      if (releaseDate) {
        return `Published ${releaseDate}.`;
      }

      return 'A newer signed release was found.';
    case 'up-to-date':
      return checkedAt ? `Last checked ${checkedAt}.` : 'No newer release was found.';
    case 'installing':
      if (updateStatus.total_bytes) {
        return `${formatBytes(updateStatus.downloaded_bytes)} of ${formatBytes(updateStatus.total_bytes)} downloaded.`;
      }

      return 'Preparing the update package.';
    case 'restarting':
      return 'The app will relaunch automatically when installation completes.';
    case 'error':
      return checkedAt ? `Last attempted ${checkedAt}.` : 'The updater could not complete the request.';
    default:
      return appInfo ? `Running Recall ${appInfo.current_version}.` : null;
  }
}

function getProgressPercent(updateStatus: UpdateStatus): number | null {
  if (!updateStatus.total_bytes || updateStatus.total_bytes <= 0) {
    return updateStatus.state === 'restarting' ? 100 : null;
  }

  return Math.max(
    0,
    Math.min(100, Math.round((updateStatus.downloaded_bytes / updateStatus.total_bytes) * 100)),
  );
}

function getSourceLocationPreview(source: DetectedSource): { preview: string; full: string; truncated: boolean } {
  if (!source.detected || source.root_paths.length === 0) {
    return {
      preview: source.evidence,
      full: source.evidence,
      truncated: false,
    };
  }

  const full = source.root_paths.join('\n');

  if (source.root_paths.length <= 2) {
    return {
      preview: source.root_paths.join(' | '),
      full,
      truncated: false,
    };
  }

  return {
    preview: `${source.root_paths.slice(0, 2).join(' | ')} ...`,
    full,
    truncated: true,
  };
}

export default function SettingsPanel({
  appInfo,
  sources,
  stats,
  updateStatus,
  onCheckForUpdates,
  onInstallUpdate,
  onClearDatabase,
}: SettingsPanelProps) {
  const checkDisabled = !appInfo?.updater_enabled
    || updateStatus.state === 'checking'
    || updateStatus.state === 'installing'
    || updateStatus.state === 'restarting';
  const progressPercent = getProgressPercent(updateStatus);
  const releaseNotes = trimReleaseNotes(updateStatus.release_notes, 360);
  const updateMeta = getUpdateMeta(appInfo, updateStatus);

  return (
    <div className="settings enter">
      <div className="settings-page-header">
        <h1 className="settings-page-title">Settings</h1>
        {appInfo && <span className="settings-version">Recall {appInfo.current_version}</span>}
      </div>

      <div className="settings-layout">
        <section className="settings-section settings-section-sources">
          <div className="settings-heading">Detected Sources</div>

          <div className="source-list">
            {sources.map((source) => {
              const location = getSourceLocationPreview(source);

              return (
                <div key={source.agent_slug} className={`source-row ${source.detected ? 'found' : ''}`}>
                  <div className={`source-dot ${source.detected ? 'on' : ''}`} />
                  <div className="source-copy">
                    <div className="source-name-row">
                      <div className="source-name">{source.name}</div>
                      {location.truncated && <span className="source-preview-badge">Hover for all</span>}
                    </div>
                    <div className="source-evidence" title={location.full}>
                      {location.preview}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="settings-side-stack">
          <section className="settings-section settings-section-updates">
            <div className="settings-heading">Updates</div>

            <div className={`update-card ${updateStatus.state}`}>
              <div className="update-card-top">
                <div className="update-card-icon"><DownloadIcon /></div>
                <div className="update-card-copy">
                  <div className="update-card-title">{getUpdateTitle(updateStatus)}</div>
                  {updateMeta && <div className="update-card-meta">{updateMeta}</div>}
                  {updateStatus.error && <div className="update-card-error">{updateStatus.error}</div>}
                </div>
              </div>

              {releaseNotes && updateStatus.state === 'available' && (
                <div className="update-card-notes">{releaseNotes}</div>
              )}

              {(updateStatus.state === 'installing' || updateStatus.state === 'restarting') && progressPercent !== null && (
                <div className="update-progress-row">
                  <div className="update-progress-bar"><span style={{ width: `${progressPercent}%` }} /></div>
                  <div className="update-progress-label">{progressPercent}%</div>
                </div>
              )}

              <div className="update-card-actions">
                {appInfo?.updater_enabled && (
                  <button
                    className="update-secondary-btn"
                    disabled={checkDisabled}
                    onClick={onCheckForUpdates}
                    type="button"
                  >
                    <RefreshIcon className={updateStatus.state === 'checking' ? 'spin-icon' : undefined} />
                    <span>{updateStatus.state === 'checking' ? 'Checking...' : 'Check now'}</span>
                  </button>
                )}
                {updateStatus.state === 'available' && (
                  <button className="update-primary-btn" onClick={onInstallUpdate} type="button">
                    <DownloadIcon />
                    <span>Install update</span>
                  </button>
                )}
                {(updateStatus.state === 'installing' || updateStatus.state === 'restarting') && (
                  <button className="update-primary-btn" disabled type="button">
                    <DownloadIcon />
                    <span>{updateStatus.state === 'installing' ? 'Installing...' : 'Restarting...'}</span>
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="settings-section settings-section-database">
            <div className="settings-heading">Database</div>

            <div className="danger-box">
              <p>Permanently clear all indexed sessions and messages. This will not delete your actual harness session data.</p>
              <button onClick={() => void onClearDatabase()} type="button">
                <TrashIcon />
                Clear Database
              </button>
            </div>
          </section>

          <section className="settings-section settings-section-shortcuts">
            <div className="settings-heading">Keyboard Shortcuts</div>

            <div className="shortcut-list">
              <div className="shortcut-row">
                <span className="shortcut-label">Focus search</span>
                <span className="shortcut-keys"><kbd>Cmd</kbd><kbd>K</kbd></span>
              </div>
              <div className="shortcut-row">
                <span className="shortcut-label">Close session / exit search</span>
                <span className="shortcut-keys"><kbd>Esc</kbd></span>
              </div>
            </div>
          </section>

          <section className="settings-section settings-section-about">
            <div className="settings-heading">About</div>

            <div className="about-card">
              <div className="about-row">
                <span className="about-label">Source</span>
                <a
                  className="about-link"
                  href="https://github.com/akhshyganesh/recall"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  github.com/akhshyganesh/recall
                </a>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="settings-footer">
        <p>All session data stays on your machine. Nothing is sent to any server.</p>
      </div>
    </div>
  );
}
