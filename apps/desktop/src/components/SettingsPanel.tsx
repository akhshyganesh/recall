import { useState } from 'react';
import type { AppInfo, DetectedSource, McpStatus, UpdateStatus } from '../types';
import { formatUpdateDate, trimReleaseNotes } from '../lib/update-format';
import { DownloadIcon, RefreshIcon, TrashIcon } from './AppIcons';

interface SettingsPanelProps {
  appInfo: AppInfo | null;
  sources: DetectedSource[];
  updateStatus: UpdateStatus;
  mcpStatus: McpStatus;
  onCheckForUpdates: () => void;
  onDownloadAndInstall: () => void;
  onClearDatabase: () => Promise<void>;
  onToggleMcp: (enabled: boolean) => Promise<void>;
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
    case 'checking':
      return 'Checking GitHub Releases for a newer build.';
    case 'available':
      return updateStatus.latest_version
        ? `Version ${updateStatus.latest_version} is available.`
        : 'A newer release is available.';
    case 'up-to-date':
      return 'You are at the latest build.';
    case 'error':
      return 'The last update check did not complete.';
    default:
      return 'Check GitHub Releases for a newer build.';
  }
}

function getUpdateMeta(appInfo: AppInfo | null, updateStatus: UpdateStatus): string | null {
  const releaseDate = formatUpdateDate(updateStatus.release_date);
  const checkedAt = formatCheckTime(updateStatus.checked_at);

  switch (updateStatus.state) {
    case 'checking':
      return 'Querying the latest release from GitHub.';
    case 'available':
      return releaseDate ? `Published ${releaseDate}.` : 'Ready to download and install.';
    case 'downloading':
      return updateStatus.download_progress != null
        ? `Downloading update… ${updateStatus.download_progress}%`
        : 'Downloading update…';
    case 'installing':
      return 'Installing update — the app will restart shortly.';
    case 'up-to-date':
      return checkedAt ? `Last checked ${checkedAt}.` : 'You are already at the latest build.';
    case 'error':
      return checkedAt ? `Last attempted ${checkedAt}.` : 'The release check could not complete.';
    default:
      return appInfo ? `Running Recall ${appInfo.current_version}.` : null;
  }
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
  updateStatus,
  mcpStatus,
  onCheckForUpdates,
  onDownloadAndInstall,
  onClearDatabase,
  onToggleMcp,
}: SettingsPanelProps) {
  const checkDisabled = updateStatus.state === 'checking' || updateStatus.state === 'downloading' || updateStatus.state === 'installing';
  const releaseNotes = trimReleaseNotes(updateStatus.release_notes, 360);
  const updateMeta = getUpdateMeta(appInfo, updateStatus);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [mcpToggling, setMcpToggling] = useState(false);

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

              <div className="update-card-actions">
                <button
                  className="update-secondary-btn"
                  disabled={checkDisabled}
                  onClick={onCheckForUpdates}
                  type="button"
                >
                  <RefreshIcon className={updateStatus.state === 'checking' ? 'spin-icon' : undefined} />
                  <span>{updateStatus.state === 'checking' ? 'Checking...' : 'Check now'}</span>
                </button>
                {updateStatus.state === 'available' && (
                  <button className="update-primary-btn" onClick={onDownloadAndInstall} type="button">
                    <DownloadIcon />
                    <span>Update now</span>
                  </button>
                )}
                {(updateStatus.state === 'downloading' || updateStatus.state === 'installing') && (
                  <button className="update-primary-btn" disabled type="button">
                    <RefreshIcon className="spin-icon" />
                    <span>
                      {updateStatus.state === 'installing'
                        ? 'Installing…'
                        : `Downloading… ${updateStatus.download_progress ?? 0}%`}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="settings-section settings-section-database">
            <div className="settings-heading">Database</div>

            <div className="danger-box">
              <p>Permanently clear all indexed sessions and messages. This will not delete your actual harness session data.</p>
              {confirmClear && !clearing && (
                <p className="danger-box-confirm">Are you sure? This cannot be undone.</p>
              )}
              <div className="danger-box-actions">
                {!confirmClear ? (
                  <button
                    disabled={clearing}
                    onClick={() => setConfirmClear(true)}
                    type="button"
                  >
                    <TrashIcon />
                    Clear Database
                  </button>
                ) : (
                  <>
                    <button
                      className="danger-box-confirm-btn"
                      disabled={clearing}
                      onClick={async () => {
                        setClearing(true);
                        try {
                          await onClearDatabase();
                        } finally {
                          setClearing(false);
                          setConfirmClear(false);
                        }
                      }}
                      type="button"
                    >
                      {clearing ? (
                        <>
                          <RefreshIcon className="spin-icon" />
                          Clearing…
                        </>
                      ) : (
                        <>
                          <TrashIcon />
                          Yes, clear everything
                        </>
                      )}
                    </button>
                    {!clearing && (
                      <button
                        className="danger-box-cancel-btn"
                        onClick={() => setConfirmClear(false)}
                        type="button"
                      >
                        Cancel
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </section>

          <section className="settings-section settings-section-mcp">
            <div className="settings-heading">MCP Server</div>

            <div className={`mcp-card ${mcpStatus.running ? 'active' : ''}`}>
              <div className="mcp-card-top">
                <div className={`mcp-dot ${mcpStatus.running ? 'on' : ''}`} />
                <div className="mcp-card-copy">
                  <div className="mcp-card-title">
                    {mcpStatus.running ? 'MCP Server Running' : 'MCP Server Stopped'}
                  </div>
                  <div className="mcp-card-meta">
                    {mcpStatus.running
                      ? `Listening on port ${mcpStatus.port}`
                      : 'Enable to let AI agents query your session history'}
                  </div>
                </div>
                <label className="mcp-toggle">
                  <input
                    checked={mcpStatus.running}
                    disabled={mcpToggling}
                    onChange={async (e) => {
                      setMcpToggling(true);
                      try {
                        await onToggleMcp(e.target.checked);
                      } finally {
                        setMcpToggling(false);
                      }
                    }}
                    type="checkbox"
                  />
                  <span className="mcp-toggle-track" />
                </label>
              </div>

              {mcpStatus.running && mcpStatus.url && (
                <div className="mcp-connection-info">
                  <div className="mcp-info-label">SSE Endpoint</div>
                  <code className="mcp-info-url">{mcpStatus.url}</code>
                  <div className="mcp-info-label" style={{ marginTop: 12 }}>Agent Configuration</div>
                  <pre className="mcp-info-config">{`{
  "mcpServers": {
    "recall": {
      "url": "${mcpStatus.url}"
    }
  }
}`}</pre>
                  <div className="mcp-info-hint">
                    Add the config above to your AI agent's MCP settings to connect.
                  </div>
                </div>
              )}
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
                  href={appInfo?.repository_url ?? 'https://github.com/akhshyganesh/recall'}
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
