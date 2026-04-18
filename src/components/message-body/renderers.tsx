import { useState, type CSSProperties, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import c from 'react-syntax-highlighter/dist/esm/languages/prism/c';
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp';
import csharp from 'react-syntax-highlighter/dist/esm/languages/prism/csharp';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go';
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import kotlin from 'react-syntax-highlighter/dist/esm/languages/prism/kotlin';
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import ruby from 'react-syntax-highlighter/dist/esm/languages/prism/ruby';
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import swift from 'react-syntax-highlighter/dist/esm/languages/prism/swift';
import toml from 'react-syntax-highlighter/dist/esm/languages/prism/toml';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';

import type { StructuredPart, TextEditPart } from './types';

SyntaxHighlighter.registerLanguage('bash', bash);
SyntaxHighlighter.registerLanguage('c', c);
SyntaxHighlighter.registerLanguage('cpp', cpp);
SyntaxHighlighter.registerLanguage('csharp', csharp);
SyntaxHighlighter.registerLanguage('css', css);
SyntaxHighlighter.registerLanguage('go', go);
SyntaxHighlighter.registerLanguage('java', java);
SyntaxHighlighter.registerLanguage('javascript', javascript);
SyntaxHighlighter.registerLanguage('json', json);
SyntaxHighlighter.registerLanguage('jsx', jsx);
SyntaxHighlighter.registerLanguage('kotlin', kotlin);
SyntaxHighlighter.registerLanguage('markdown', markdown);
SyntaxHighlighter.registerLanguage('markup', markup);
SyntaxHighlighter.registerLanguage('python', python);
SyntaxHighlighter.registerLanguage('ruby', ruby);
SyntaxHighlighter.registerLanguage('rust', rust);
SyntaxHighlighter.registerLanguage('sql', sql);
SyntaxHighlighter.registerLanguage('swift', swift);
SyntaxHighlighter.registerLanguage('toml', toml);
SyntaxHighlighter.registerLanguage('tsx', tsx);
SyntaxHighlighter.registerLanguage('typescript', typescript);
SyntaxHighlighter.registerLanguage('yaml', yaml);

const codeBlockTheme: Record<string, CSSProperties> = {
  'code[class*="language-"]': {
    color: '#cccccc',
    fontFamily: 'var(--mono)',
    fontSize: '12.5px',
    lineHeight: '1.55',
    direction: 'ltr',
    textAlign: 'left',
    whiteSpace: 'pre',
    wordSpacing: 'normal',
    wordBreak: 'normal',
    tabSize: 2,
  },
  'pre[class*="language-"]': {
    color: '#cccccc',
    fontFamily: 'var(--mono)',
    fontSize: '12.5px',
    lineHeight: '1.55',
    direction: 'ltr',
    textAlign: 'left',
    whiteSpace: 'pre',
    wordSpacing: 'normal',
    wordBreak: 'normal',
    tabSize: 2,
    padding: '14px 16px',
    margin: '0',
    overflow: 'auto',
    background: '#1a1a1a',
  },
  comment: { color: '#6a9955', fontStyle: 'italic' },
  prolog: { color: '#6a9955' },
  doctype: { color: '#6a9955' },
  cdata: { color: '#6a9955' },
  punctuation: { color: '#cccccc' },
  property: { color: '#9cdcfe' },
  tag: { color: '#569cd6' },
  boolean: { color: '#569cd6' },
  number: { color: '#b5cea8' },
  constant: { color: '#9cdcfe' },
  symbol: { color: '#b5cea8' },
  deleted: { color: '#f14c4c' },
  selector: { color: '#d7ba7d' },
  'attr-name': { color: '#9cdcfe' },
  string: { color: '#ce9178' },
  char: { color: '#ce9178' },
  builtin: { color: '#4ec9b0' },
  inserted: { color: '#b5cea8' },
  operator: { color: '#d4d4d4' },
  entity: { color: '#569cd6' },
  url: { color: '#ce9178' },
  'attr-value': { color: '#ce9178' },
  keyword: { color: '#569cd6' },
  'class-name': { color: '#4ec9b0' },
  function: { color: '#dcdcaa' },
  regex: { color: '#d16969' },
  important: { color: '#569cd6', fontWeight: 'bold' },
  variable: { color: '#9cdcfe' },
  bold: { fontWeight: 'bold' },
  italic: { fontStyle: 'italic' },
  'template-string': { color: '#ce9178' },
  'string-interpolation': { color: '#ce9178' },
  'literal-property': { color: '#9cdcfe' },
  'template-punctuation': { color: '#ce9178' },
  'function-variable': { color: '#dcdcaa' },
  parameter: { color: '#9cdcfe' },
  'maybe-class-name': { color: '#4ec9b0' },
  'script-punctuation': { color: '#cccccc' },
  spread: { color: '#d4d4d4' },
  arrow: { color: '#569cd6' },
  module: { color: '#c586c0' },
  'control-flow': { color: '#c586c0' },
  imports: { color: '#c586c0' },
  exports: { color: '#c586c0' },
};

const Icons = {
  thinking: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 1C4.13 1 1 3.58 1 6.75c0 1.83 1.03 3.45 2.63 4.5L3 14l3.18-1.88C6.73 12.22 7.35 12.3 8 12.3c3.87 0 7-2.48 7-5.55C15 3.58 11.87 1 8 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx="5" cy="6.75" r="0.75" fill="currentColor" />
      <circle cx="8" cy="6.75" r="0.75" fill="currentColor" />
      <circle cx="11" cy="6.75" r="0.75" fill="currentColor" />
    </svg>
  ),
  tool: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14.35 3.35l-1.7-1.7a.5.5 0 00-.71 0L9.79 3.79a3 3 0 00-3.58.58 3 3 0 00-.58 3.58L2 11.59V14h2.41l3.64-3.63a3 3 0 003.58-.58 3 3 0 00.58-3.58l2.14-2.15a.5.5 0 000-.71z" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  filePen: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9.5 1H4a1 1 0 00-1 1v12a1 1 0 001 1h3" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M9 1v4h4" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M10.5 10.5l3-3 1.5 1.5-3 3H10.5v-1.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  ),
  spinner: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="spin-icon-svg">
      <path d="M8 1.5a6.5 6.5 0 11-6.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  check: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 8.5l3.5 3.5 6.5-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

function normalizeLanguage(language: string): string {
  const aliases: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    tsx: 'tsx',
    jsx: 'jsx',
    py: 'python',
    rb: 'ruby',
    sh: 'bash',
    shell: 'bash',
    zsh: 'bash',
    yml: 'yaml',
    rs: 'rust',
    md: 'markdown',
    cs: 'csharp',
    'c++': 'cpp',
    'c#': 'csharp',
    html: 'markup',
    xml: 'markup',
    svg: 'markup',
    scss: 'css',
    less: 'css',
    docker: 'bash',
  };

  return aliases[language] ?? language;
}

function extractLanguage(className?: string): string {
  const match = /language-([A-Za-z0-9#+-]+)/.exec(className ?? '');
  return match ? normalizeLanguage(match[1].toLowerCase()) : '';
}

function langFromPath(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  const languages: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    py: 'python',
    rs: 'rust',
    go: 'go',
    rb: 'ruby',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    cs: 'csharp',
    cpp: 'cpp',
    c: 'c',
    h: 'c',
    hpp: 'cpp',
    css: 'css',
    scss: 'css',
    less: 'css',
    html: 'markup',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    md: 'markdown',
    sql: 'sql',
    sh: 'bash',
    bash: 'bash',
    dockerfile: 'bash',
    xml: 'markup',
    svg: 'markup',
  };

  return languages[extension] ?? 'text';
}

function shortPath(path: string): string {
  if (!path) {
    return 'untitled';
  }

  return path.split('/').slice(-3).join('/');
}

function diffStats(diff: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;

  diff.split('\n').forEach((line) => {
    if (line.startsWith('+++') || line.startsWith('---')) {
      return;
    }

    if (line.startsWith('+')) {
      additions += 1;
      return;
    }

    if (line.startsWith('-')) {
      deletions += 1;
    }
  });

  return { additions, deletions };
}

function toolDisplayName(toolId: string): string {
  const labels: Record<string, string> = {
    apply_patch: 'Edit File',
    create_directory: 'Create Directory',
    create_file: 'Create File',
    file_search: 'File Search',
    grep_search: 'Grep Search',
    list_dir: 'List Directory',
    read_file: 'Read File',
    replace_string_in_file: 'Edit File',
    run_in_terminal: 'Terminal',
    runSubagent: 'Sub-agent',
    semantic_search: 'Semantic Search',
    'vscode.search': 'Search',
  };

  return labels[toolId] ?? toolId.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button className="code-copy-btn" onClick={() => void handleCopy()} type="button">
      {copied ? '✓' : 'Copy'}
    </button>
  );
}

function DiffBlock({ code }: { code: string }) {
  const lines = code.split('\n');

  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  let oldNumber = 0;
  let newNumber = 0;
  const hunkPattern = /^@@\s*-(\d+)(?:,\d+)?\s*\+(\d+)(?:,\d+)?\s*@@/;

  return (
    <div className="diff-block">
      <div className="diff-block-body">
        {lines.map((line, index) => {
          const hunkMatch = line.match(hunkPattern);

          if (hunkMatch) {
            oldNumber = parseInt(hunkMatch[1], 10) - 1;
            newNumber = parseInt(hunkMatch[2], 10) - 1;

            return (
              <div key={index} className="diff-line diff-line-hunk">
                <span className="diff-gutter diff-gutter-old">…</span>
                <span className="diff-gutter diff-gutter-new">…</span>
                <span className="diff-indicator"> </span>
                <span className="diff-line-content">{line}</span>
              </div>
            );
          }

          if (
            line.startsWith('--- ') ||
            line.startsWith('+++ ') ||
            line.startsWith('diff --git ') ||
            line === '\\ No newline at end of file'
          ) {
            return (
              <div key={index} className="diff-line diff-line-meta">
                <span className="diff-gutter diff-gutter-old" />
                <span className="diff-gutter diff-gutter-new" />
                <span className="diff-indicator"> </span>
                <span className="diff-line-content">{line}</span>
              </div>
            );
          }

          let type: 'add' | 'del' | 'ctx' = 'ctx';
          let content = line;
          let oldDisplay = '';
          let newDisplay = '';

          if (line.startsWith('+')) {
            type = 'add';
            content = line.slice(1);
            newNumber += 1;
            newDisplay = String(newNumber);
          } else if (line.startsWith('-')) {
            type = 'del';
            content = line.slice(1);
            oldNumber += 1;
            oldDisplay = String(oldNumber);
          } else {
            content = line.startsWith(' ') ? line.slice(1) : line;
            oldNumber += 1;
            newNumber += 1;
            oldDisplay = String(oldNumber);
            newDisplay = String(newNumber);
          }

          return (
            <div key={index} className={`diff-line diff-line-${type}`}>
              <span className="diff-gutter diff-gutter-old">{oldDisplay}</span>
              <span className="diff-gutter diff-gutter-new">{newDisplay}</span>
              <span className="diff-indicator">{type === 'add' ? '+' : type === 'del' ? '-' : ' '}</span>
              <span className="diff-line-content">{content || '\n'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CodeBlockFrame({
  language,
  code,
  showLineNumbers = false,
  maxHeight,
  wrapperStyle,
}: {
  language: string;
  code: string;
  showLineNumbers?: boolean;
  maxHeight?: string;
  wrapperStyle?: CSSProperties;
}) {
  const customStyle: CSSProperties = {
    margin: 0,
    borderRadius: '0 0 6px 6px',
    border: 'none',
    background: '#1a1a1a',
  };

  if (maxHeight) {
    customStyle.maxHeight = maxHeight;
  }

  return (
    <div className="code-block-wrapper" style={wrapperStyle}>
      <div className="code-block-header">
        <span className="code-block-lang">{language}</span>
        <CopyButton text={code} />
      </div>
      <SyntaxHighlighter
        style={codeBlockTheme}
        language={language === 'text' ? undefined : language}
        PreTag="div"
        showLineNumbers={showLineNumbers}
        lineNumberStyle={
          showLineNumbers
            ? { color: '#3a3a3a', fontSize: '11px', minWidth: '36px', paddingRight: '12px' }
            : undefined
        }
        customStyle={customStyle}
        codeTagProps={{
          style: {
            fontFamily: 'var(--mono)',
            fontSize: '12.5px',
            lineHeight: '1.55',
          },
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

function DiffPreview({ code, wrapperStyle }: { code: string; wrapperStyle?: CSSProperties }) {
  return (
    <div className="code-block-wrapper" style={wrapperStyle}>
      <div className="code-block-header">
        <span className="code-block-lang">diff</span>
        <CopyButton text={code} />
      </div>
      <DiffBlock code={code} />
    </div>
  );
}

export const markdownComponents: Components = {
  code({ className, children, ...rest }) {
    const language = extractLanguage(className);
    const code = String(children).replace(/\n$/, '');

    if (!language && !code.includes('\n')) {
      return (
        <code className="inline-code" {...rest}>
          {children}
        </code>
      );
    }

    if (language === 'diff' || language === 'patch') {
      return <DiffPreview code={code} />;
    }

    return <CodeBlockFrame language={language || 'text'} code={code} />;
  },
  table({ children }) {
    return (
      <div className="md-table-wrap">
        <table>{children}</table>
      </div>
    );
  },
  li({ children, ...props }) {
    const { checked } = props as { checked?: boolean };

    if (typeof checked === 'boolean') {
      return (
        <li className="task-list-item">
          <input type="checkbox" checked={checked} readOnly />
          {children}
        </li>
      );
    }

    return <li>{children}</li>;
  },
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
};

function Accordion({
  label,
  icon,
  variant,
  defaultOpen = false,
  children,
}: {
  label: string;
  icon: ReactNode;
  variant: 'thinking' | 'tool' | 'edit' | 'progress';
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`accordion accordion-${variant} ${open ? 'open' : ''}`}>
      <button className="accordion-header" onClick={() => setOpen((current) => !current)} type="button">
        <span className={`accordion-chevron ${open ? 'open' : ''}`}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 4l4 4-4 4" />
          </svg>
        </span>
        <span className="accordion-icon">{icon}</span>
        <span className="accordion-label">{label}</span>
      </button>
      {open && <div className="accordion-body">{children}</div>}
    </div>
  );
}

function FileEditBlock({ part }: { part: TextEditPart }) {
  const [open, setOpen] = useState(false);
  const language = langFromPath(part.file_path);
  const lineCount = part.content ? part.content.split('\n').length : 0;
  const stats = part.diff ? diffStats(part.diff) : null;
  const changeKind = part.change_kind ?? 'edit';
  const changeLabel = changeKind === 'create' ? 'Created' : changeKind === 'delete' ? 'Deleted' : 'Edited';

  return (
    <div className={`file-edit-block ${open ? 'open' : ''}`}>
      <button className="file-edit-header" onClick={() => setOpen((current) => !current)} type="button">
        <span className={`accordion-chevron ${open ? 'open' : ''}`}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 4l4 4-4 4" />
          </svg>
        </span>
        <span className="file-edit-icon">{Icons.filePen}</span>
        <span className="file-edit-path">{shortPath(part.file_path)}</span>
        <span className="file-edit-meta">
          <span className={`file-edit-kind file-edit-kind-${changeKind}`}>{changeLabel}</span>
          {stats ? (
            <span className="file-edit-stats">
              {stats.additions > 0 && <span className="add">+{stats.additions}</span>}
              {stats.deletions > 0 && <span className="del">-{stats.deletions}</span>}
            </span>
          ) : lineCount > 0 ? (
            <span className="file-edit-lines">{lineCount} lines</span>
          ) : null}
          {part.done && <span className="file-edit-status">{Icons.check}</span>}
        </span>
      </button>

      {open && (
        <div className="file-edit-body">
          {part.diff && (
            <div className="file-edit-section">
              <DiffPreview code={part.diff} wrapperStyle={{ margin: 0 }} />
            </div>
          )}

          {part.content && changeKind !== 'delete' && (
            <div className="file-edit-section">
              <div className="file-edit-result-head">Resulting file</div>
              <CodeBlockFrame
                language={language}
                code={part.content}
                showLineNumbers
                maxHeight="500px"
                wrapperStyle={{ margin: 0 }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function renderStructuredPart(part: StructuredPart, key: number): ReactNode {
  switch (part.type) {
    case 'text':
      return part.content.trim() ? (
        <ReactMarkdown key={key} remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {part.content}
        </ReactMarkdown>
      ) : null;

    case 'thinking':
      return (
        <Accordion key={key} label={part.title || 'Thinking…'} icon={Icons.thinking} variant="thinking">
          <div className="thinking-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {part.content}
            </ReactMarkdown>
          </div>
        </Accordion>
      );

    case 'tool_call':
      return (
        <Accordion
          key={key}
          label={`${toolDisplayName(part.tool)}${part.message ? `: ${part.message}` : ''}`}
          icon={Icons.tool}
          variant="tool"
        >
          <div className="tool-call-content">
            <div className="tool-call-detail">
              <span className="tool-call-key">Tool</span>
              <code>{part.tool}</code>
            </div>
            {part.message && (
              <div className="tool-call-detail">
                <span className="tool-call-key">Task</span>
                <span>{part.message}</span>
              </div>
            )}
            {part.description && (
              <div className="tool-call-detail">
                <span className="tool-call-key">Description</span>
                <span>{part.description}</span>
              </div>
            )}
            <div className="tool-call-detail">
              <span className="tool-call-key">Status</span>
              <span className={part.complete ? 'tool-status-done' : 'tool-status-running'}>
                {part.complete ? (
                  <>
                    {Icons.check} Complete
                  </>
                ) : (
                  <>
                    {Icons.spinner} Running
                  </>
                )}
              </span>
            </div>
          </div>
        </Accordion>
      );

    default:
      return null;
  }
}

export function FileEditsGroup({ parts }: { parts: TextEditPart[] }) {
  return (
    <div className="file-edits-group">
      <div className="file-edits-group-header">
        {Icons.filePen}
        <span>
          {parts.length} file{parts.length !== 1 ? 's' : ''} changed
        </span>
      </div>
      {parts.map((part, index) => (
        <FileEditBlock key={`edit-${index}`} part={part} />
      ))}
    </div>
  );
}