import type { ReactNode } from 'react';

import type { SearchResult } from '../types';
import { formatTimeLabel, getRepoShortName } from '../lib/session-format';
import { toolCssClass } from '../lib/tool-style';
import EmptyState from './EmptyState';

interface SearchResultsProps {
  query: string;
  results: SearchResult[];
  loading: boolean;
  emptyStateIcon: ReactNode;
  onOpen: (id: string) => void;
}

function HighlightedSnippet({ snippet }: { snippet: string }) {
  const parts = snippet.split(/(<mark>|<\/mark>)/g).filter(Boolean);
  let inMark = false;

  return (
    <>
      {parts.map((part, index) => {
        if (part === '<mark>') {
          inMark = true;
          return null;
        }

        if (part === '</mark>') {
          inMark = false;
          return null;
        }

        return inMark ? <mark key={index}>{part}</mark> : <span key={index}>{part}</span>;
      })}
    </>
  );
}

export default function SearchResults({ query, results, loading, emptyStateIcon, onOpen }: SearchResultsProps) {
  if (loading) {
    return (
      <div className="empty">
        <span className="spinner" />
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <EmptyState
        icon={emptyStateIcon}
        title="No results"
        description={query.trim() ? 'Try a different search term or widen the tool, path, or time filters.' : 'Start typing to search indexed sessions.'}
      />
    );
  }

  return (
    <div className="search-results">
      {results.map((result) => {
        const resultPath = result.repo_path || result.workspace;
        const resultPathLabel = resultPath ? getRepoShortName(resultPath) : null;

        return (
          <div key={result.id} className="search-hit" onClick={() => onOpen(result.id)}>
            <div className="search-hit-title">{result.title || 'Untitled Session'}</div>
            <div className="search-hit-snippet">
              <HighlightedSnippet snippet={result.snippet} />
            </div>
            <div className="search-hit-meta">
              <span className={`tool-pill ${toolCssClass(result.tool)}`}>{result.tool}</span>
              <span>{formatTimeLabel(result.started_at)}</span>
              {result.repo_name && <span>{result.repo_name}</span>}
              {resultPathLabel && <span title={resultPath ?? undefined}>{resultPathLabel}</span>}
              <span>{result.message_count} msgs</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}