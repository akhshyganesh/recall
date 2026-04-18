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
      <div className="settings-heading">Application</div>
      <div className="settings-sub">Version, release checks, and signed in-place updates</div>

      <div className={`update-card ${updateStatus.state}`}>
        <div className="update-card-top">
          <div className="update-card-icon"><DownloadIcon /></div>
          <div className="update-card-copy">
            <div className="update-card-eyebrow">
              {appInfo ? `Recall ${appInfo.current_version}` : 'Recall'}
            </div>
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

      <div className="settings-heading">Detected Sources</div>
      <div className="settings-sub">AI tools found on your system</div>

      {sources.map((source) => (
        <div key={source.agent_slug} className={`source-row ${source.detected ? 'found' : ''}`}>
          <div className={`source-dot ${source.detected ? 'on' : ''}`} />
          <div className="source-copy">
            <div className="source-name">{source.name}</div>
            <div className="source-evidence">
              {source.detected ? source.root_paths.join(', ') : source.evidence}
            </div>
          </div>
        </div>
      ))}

      <div className="settings-heading settings-heading-gap">Database</div>
      <div className="settings-sub">Manage your local index</div>

      {stats && (
        <div className="settings-stats">
          <DatabaseIcon />
          <span>
            {stats.total_sessions} sessions, {stats.total_messages} messages across {stats.total_tools} tools
          </span>
        </div>
      )}

      <div className="danger-box">
        <p>Permanently clear all indexed sessions and messages.</p>
        <button onClick={() => void onClearDatabase()} type="button">
          <TrashIcon />
          Clear Database
        </button>
      </div>
    </div>
  );
}