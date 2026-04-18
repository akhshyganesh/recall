import type { DetectedSource, Stats } from '../types';
import { DatabaseIcon, TrashIcon } from './AppIcons';

interface SettingsPanelProps {
  sources: DetectedSource[];
  stats: Stats | null;
  onClearDatabase: () => Promise<void>;
}

export default function SettingsPanel({ sources, stats, onClearDatabase }: SettingsPanelProps) {
  return (
    <div className="settings enter">
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