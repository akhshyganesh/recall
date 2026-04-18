import type { Stats } from '../types';

const FEATURES = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 2v16M6 6l4-4 4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        <rect x="2" y="10" width="16" height="8" rx="2" stroke="currentColor" strokeWidth="1.4"/>
      </svg>
    ),
    title: 'Every session, indexed',
    desc: 'Automatically discovers sessions from Copilot, Claude Code, Cursor, Aider, Cline, Codex, and Gemini — no setup.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M12.5 12.5L17 17" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    ),
    title: 'Full-text search',
    desc: 'Find any prompt, response, or code snippet across your entire AI history in milliseconds.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 14l4-4 3 3 7-9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    title: 'See the diffs',
    desc: 'Every file created, edited, or deleted — rendered with unified diffs and syntax highlighting.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="2" y="4" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.4"/>
        <path d="M2 8h16" stroke="currentColor" strokeWidth="1.4"/>
        <circle cx="5" cy="6" r="0.8" fill="currentColor"/>
        <circle cx="7.5" cy="6" r="0.8" fill="currentColor"/>
        <circle cx="10" cy="6" r="0.8" fill="currentColor"/>
      </svg>
    ),
    title: '100% local & private',
    desc: 'All data stays on your machine. SQLite database, no cloud, no telemetry, no accounts.',
  },
];

function StatNumber({ value, label }: { value: number; label: string }) {
  const formatted = value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
  return (
    <div className="hero-stat">
      <span className="hero-stat-value">{formatted}</span>
      <span className="hero-stat-label">{label}</span>
    </div>
  );
}

export default function LandingHero({ stats, onScan, scanning }: {
  stats: Stats | null;
  onScan: () => void;
  scanning: boolean;
}) {
  const hasSessions = stats && stats.total_sessions > 0;

  return (
    <section className="landing-hero">
      <div className="hero-glow" />

      <div className="hero-header">
        <h1 className="hero-title">
          <span className="hero-title-dim">Your AI coding history,</span>
          <br />
          <span className="hero-title-bright">searchable & local.</span>
        </h1>
        <p className="hero-subtitle">
          Recall indexes every AI session across your tools — prompts, responses,
          tool calls, and file diffs — into a single searchable timeline.
          Never lose context again.
        </p>
      </div>

      {hasSessions ? (
        <div className="hero-stats-row">
          <StatNumber value={stats.total_sessions} label="sessions" />
          <span className="hero-stat-divider" />
          <StatNumber value={stats.total_messages} label="messages" />
          <span className="hero-stat-divider" />
          <StatNumber value={stats.total_tools} label="tools" />
        </div>
      ) : (
        <div className="hero-cta">
          <button className="hero-scan-btn" onClick={onScan} disabled={scanning} type="button">
            {scanning ? (
              <>
                <span className="hero-scan-spinner" />
                Scanning…
              </>
            ) : (
              'Scan for Sessions'
            )}
          </button>
          <p className="hero-cta-hint">
            Discovers sessions from VS Code, terminals, and editor storage
          </p>
        </div>
      )}

      <div className="hero-features">
        {FEATURES.map((f) => (
          <div key={f.title} className="hero-feature">
            <span className="hero-feature-icon">{f.icon}</span>
            <div>
              <div className="hero-feature-title">{f.title}</div>
              <div className="hero-feature-desc">{f.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {hasSessions && (
        <div className="hero-scroll-hint">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8 2v12M4 10l4 4 4-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Scroll for your sessions</span>
        </div>
      )}
    </section>
  );
}
