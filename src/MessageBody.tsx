import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import type { Components } from 'react-markdown';

/*
 * VS Code Dark Modern–style token colors.
 * We build a custom Prism theme inline to exactly match the user's palette.
 */
const vscDarkModern: Record<string, React.CSSProperties> = {
  'code[class*="language-"]': { color: '#cccccc', fontFamily: "var(--mono)", fontSize: '12.5px', lineHeight: '1.55', direction: 'ltr', textAlign: 'left', whiteSpace: 'pre', wordSpacing: 'normal', wordBreak: 'normal', tabSize: 2 },
  'pre[class*="language-"]':  { color: '#cccccc', fontFamily: "var(--mono)", fontSize: '12.5px', lineHeight: '1.55', direction: 'ltr', textAlign: 'left', whiteSpace: 'pre', wordSpacing: 'normal', wordBreak: 'normal', tabSize: 2, padding: '14px 16px', margin: '0', overflow: 'auto', background: '#1a1a1a' },
  comment:      { color: '#6a9955', fontStyle: 'italic' },
  prolog:       { color: '#6a9955' },
  doctype:      { color: '#6a9955' },
  cdata:        { color: '#6a9955' },
  punctuation:  { color: '#cccccc' },
  property:     { color: '#9cdcfe' },
  tag:          { color: '#569cd6' },
  boolean:      { color: '#569cd6' },
  number:       { color: '#b5cea8' },
  constant:     { color: '#9cdcfe' },
  symbol:       { color: '#b5cea8' },
  deleted:      { color: '#f14c4c' },
  selector:     { color: '#d7ba7d' },
  'attr-name':  { color: '#9cdcfe' },
  string:       { color: '#ce9178' },
  char:         { color: '#ce9178' },
  builtin:      { color: '#4ec9b0' },
  inserted:     { color: '#b5cea8' },
  operator:     { color: '#d4d4d4' },
  entity:       { color: '#569cd6' },
  url:          { color: '#ce9178' },
  'attr-value': { color: '#ce9178' },
  keyword:      { color: '#569cd6' },
  'class-name': { color: '#4ec9b0' },
  function:     { color: '#dcdcaa' },
  regex:        { color: '#d16969' },
  important:    { color: '#569cd6', fontWeight: 'bold' },
  variable:     { color: '#9cdcfe' },
  bold:         { fontWeight: 'bold' },
  italic:       { fontStyle: 'italic' },
  'template-string':    { color: '#ce9178' },
  'string-interpolation': { color: '#ce9178' },
  'literal-property':   { color: '#9cdcfe' },
  'template-punctuation': { color: '#ce9178' },
  // Extra tokens for common languages
  'function-variable': { color: '#dcdcaa' },
  parameter:    { color: '#9cdcfe' },
  'maybe-class-name': { color: '#4ec9b0' },
  'script-punctuation': { color: '#cccccc' },
  'spread':     { color: '#d4d4d4' },
  'arrow':      { color: '#569cd6' },
  module:       { color: '#c586c0' },
  'control-flow': { color: '#c586c0' },
  'imports':    { color: '#c586c0' },
  'exports':    { color: '#c586c0' },
};

/**
 * Renders a unified diff block with VS Code–style gutter, line numbers,
 * and green/red backgrounds for added/removed lines.
 */
function DiffBlock({ code }: { code: string }) {
  const lines = code.split('\n');
  // Remove trailing empty line
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  let oldNum = 0;
  let newNum = 0;

  // Try to parse starting line numbers from first hunk header
  const hunkRe = /^@@\s*-(\d+)(?:,\d+)?\s*\+(\d+)(?:,\d+)?\s*@@/;

  return (
    <div className="diff-block">
      <div className="diff-block-body">
        {lines.map((line, i) => {
          const hunkMatch = line.match(hunkRe);
          if (hunkMatch) {
            oldNum = parseInt(hunkMatch[1], 10) - 1;
            newNum = parseInt(hunkMatch[2], 10) - 1;
            return (
              <div key={i} className="diff-line diff-line-hunk">
                <span className="diff-gutter diff-gutter-old">…</span>
                <span className="diff-gutter diff-gutter-new">…</span>
                <span className="diff-indicator"> </span>
                <span className="diff-line-content">{line}</span>
              </div>
            );
          }

          let type: 'add' | 'del' | 'ctx' = 'ctx';
          let content = line;
          let displayOld = '';
          let displayNew = '';

          if (line.startsWith('+')) {
            type = 'add';
            content = line.slice(1);
            newNum++;
            displayNew = String(newNum);
          } else if (line.startsWith('-')) {
            type = 'del';
            content = line.slice(1);
            oldNum++;
            displayOld = String(oldNum);
          } else {
            content = line.startsWith(' ') ? line.slice(1) : line;
            oldNum++;
            newNum++;
            displayOld = String(oldNum);
            displayNew = String(newNum);
          }

          return (
            <div key={i} className={`diff-line diff-line-${type}`}>
              <span className="diff-gutter diff-gutter-old">{displayOld}</span>
              <span className="diff-gutter diff-gutter-new">{displayNew}</span>
              <span className="diff-indicator">{type === 'add' ? '+' : type === 'del' ? '-' : ' '}</span>
              <span className="diff-line-content">{content || '\n'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="code-copy-btn"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? '✓' : 'Copy'}
    </button>
  );
}

/** Map common language aliases react-markdown may produce */
function normalizeLanguage(lang: string): string {
  const map: Record<string, string> = {
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
    dockerfile: 'docker',
  };
  return map[lang] || lang;
}

const components: Components = {
  code({ className, children, ...rest }) {
    const match = /language-(\w+)/.exec(className || '');
    const lang = match ? normalizeLanguage(match[1]) : '';
    const code = String(children).replace(/\n$/, '');

    // Inline code (no language, short content)
    if (!match && !code.includes('\n')) {
      return <code className="inline-code" {...rest}>{children}</code>;
    }

    // Diff blocks get special rendering
    if (lang === 'diff' || lang === 'patch') {
      return (
        <div className="code-block-wrapper">
          <div className="code-block-header">
            <span className="code-block-lang">diff</span>
            <CopyButton text={code} />
          </div>
          <DiffBlock code={code} />
        </div>
      );
    }

    return (
      <div className="code-block-wrapper">
        <div className="code-block-header">
          <span className="code-block-lang">{lang || 'text'}</span>
          <CopyButton text={code} />
        </div>
        <SyntaxHighlighter
          style={vscDarkModern}
          language={lang || 'text'}
          PreTag="div"
          customStyle={{
            margin: 0,
            borderRadius: '0 0 6px 6px',
            border: 'none',
            background: '#1a1a1a',
          }}
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
  },
  // Render tables with wrapper for horizontal scroll
  table({ children }) {
    return (
      <div className="md-table-wrap">
        <table>{children}</table>
      </div>
    );
  },
  // Checkbox list items for GFM task lists
  li({ children, ...props }) {
    // @ts-expect-error - checked prop comes from remark-gfm
    const { checked } = props;
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
  // Open links in default browser (Tauri)
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
};

/* ============================================================
   Structured Part Types (from copilot.rs extra.parts)
   ============================================================ */
interface TextPart { type: 'text'; content: string }
interface ThinkingPart { type: 'thinking'; content: string; title?: string }
interface ToolCallPart { type: 'tool_call'; tool: string; message: string; description?: string; complete: boolean }
interface TextEditPart { type: 'text_edit'; file_path: string; content: string; done: boolean }
interface ProgressPart { type: 'progress'; content: string }
interface ReferencePart { type: 'reference'; name: string; uri: string; ref_kind: 'file' | 'file_edit' | 'symbol' }
type StructuredPart = TextPart | ThinkingPart | ToolCallPart | TextEditPart | ProgressPart | ReferencePart;

/* VS Code–style SVG icons (codicon-inspired) */
const Icons = {
  thinking: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 1C4.13 1 1 3.58 1 6.75c0 1.83 1.03 3.45 2.63 4.5L3 14l3.18-1.88C6.73 12.22 7.35 12.3 8 12.3c3.87 0 7-2.48 7-5.55C15 3.58 11.87 1 8 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
      <circle cx="5" cy="6.75" r="0.75" fill="currentColor"/>
      <circle cx="8" cy="6.75" r="0.75" fill="currentColor"/>
      <circle cx="11" cy="6.75" r="0.75" fill="currentColor"/>
    </svg>
  ),
  tool: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14.35 3.35l-1.7-1.7a.5.5 0 00-.71 0L9.79 3.79a3 3 0 00-3.58.58 3 3 0 00-.58 3.58L2 11.59V14h2.41l3.64-3.63a3 3 0 003.58-.58 3 3 0 00.58-3.58l2.14-2.15a.5.5 0 000-.71z" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  file: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9.5 1H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V4.5L9.5 1z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
      <path d="M9 1v4h4" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
    </svg>
  ),
  filePen: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9.5 1H4a1 1 0 00-1 1v12a1 1 0 001 1h3" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
      <path d="M9 1v4h4" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
      <path d="M10.5 10.5l3-3 1.5 1.5-3 3H10.5v-1.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
    </svg>
  ),
  symbol: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 4h10M3 8h6M3 12h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  spinner: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="spin-icon-svg">
      <path d="M8 1.5a6.5 6.5 0 11-6.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  check: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 8.5l3.5 3.5 6.5-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
};

/** Guess language from file extension */
function langFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    py: 'python', rs: 'rust', go: 'go', rb: 'ruby',
    java: 'java', kt: 'kotlin', swift: 'swift', cs: 'csharp',
    cpp: 'cpp', c: 'c', h: 'c', hpp: 'cpp',
    css: 'css', scss: 'scss', less: 'less', html: 'html',
    json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
    md: 'markdown', sql: 'sql', sh: 'bash', bash: 'bash',
    dockerfile: 'docker', xml: 'xml', svg: 'xml',
  };
  return map[ext] || 'text';
}

/** Shorten a full file path to a display-friendly name */
function shortPath(path: string): string {
  if (!path) return 'untitled';
  const parts = path.split('/');
  // Show last 3 segments
  return parts.slice(-3).join('/');
}

/** Tool ID to friendly display name */
function toolDisplayName(toolId: string): string {
  const map: Record<string, string> = {
    runSubagent: 'Sub-agent',
    'vscode.search': 'Search',
    read_file: 'Read File',
    list_dir: 'List Directory',
    grep_search: 'Grep Search',
    semantic_search: 'Semantic Search',
    run_in_terminal: 'Terminal',
    replace_string_in_file: 'Edit File',
    create_file: 'Create File',
    file_search: 'File Search',
  };
  return map[toolId] || toolId.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
}

/* ============================================================
   Collapsible Accordion
   ============================================================ */
function Accordion({ label, icon, variant, defaultOpen = false, children }: {
  label: string;
  icon: React.ReactNode;
  variant: 'thinking' | 'tool' | 'edit' | 'progress';
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`accordion accordion-${variant} ${open ? 'open' : ''}`}>
      <button className="accordion-header" onClick={() => setOpen(!open)}>
        <span className={`accordion-chevron ${open ? 'open' : ''}`}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M6 4l4 4-4 4" /></svg>
        </span>
        <span className="accordion-icon">{icon}</span>
        <span className="accordion-label">{label}</span>
      </button>
      {open && <div className="accordion-body">{children}</div>}
    </div>
  );
}

/* ============================================================
   File Edit Block (VS Code–style created/edited file view)
   ============================================================ */
function FileEditBlock({ part }: { part: TextEditPart }) {
  const [open, setOpen] = useState(false);
  const lang = langFromPath(part.file_path);
  const lineCount = part.content.split('\n').length;

  return (
    <div className={`file-edit-block ${open ? 'open' : ''}`}>
      <button className="file-edit-header" onClick={() => setOpen(!open)}>
        <span className={`accordion-chevron ${open ? 'open' : ''}`}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M6 4l4 4-4 4" /></svg>
        </span>
        <span className="file-edit-icon">{Icons.filePen}</span>
        <span className="file-edit-path">{shortPath(part.file_path)}</span>
        <span className="file-edit-meta">
          <span className="file-edit-lines">+{lineCount} lines</span>
          {part.done && <span className="file-edit-status">{Icons.check}</span>}
        </span>
      </button>
      {open && (
        <div className="file-edit-body">
          <div className="code-block-wrapper" style={{ margin: 0 }}>
            <div className="code-block-header">
              <span className="code-block-lang">{lang}</span>
              <CopyButton text={part.content} />
            </div>
            <SyntaxHighlighter
              style={vscDarkModern}
              language={lang}
              PreTag="div"
              showLineNumbers
              lineNumberStyle={{ color: '#3a3a3a', fontSize: '11px', minWidth: '36px', paddingRight: '12px' }}
              customStyle={{
                margin: 0,
                borderRadius: '0 0 6px 6px',
                border: 'none',
                background: '#1a1a1a',
                maxHeight: '500px',
              }}
              codeTagProps={{
                style: { fontFamily: 'var(--mono)', fontSize: '12.5px', lineHeight: '1.55' },
              }}
            >
              {part.content}
            </SyntaxHighlighter>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   MessageBody — Main exported component
   ============================================================ */
export default function MessageBody({ content, extra }: { content: string; extra?: string }) {
  const parts = useMemo<StructuredPart[] | null>(() => {
    if (!extra) return null;
    try {
      const parsed = JSON.parse(extra);
      if (parsed?.parts && Array.isArray(parsed.parts) && parsed.parts.length > 0) {
        return parsed.parts as StructuredPart[];
      }
    } catch {
      // not valid JSON
    }
    return null;
  }, [extra]);

  // If we have structured parts, render them in order
  if (parts && parts.length > 0) {
    return (
      <div className="msg-body">
        {parts.map((part, i) => {
          switch (part.type) {
            case 'text':
              return part.content.trim() ? (
                <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={components}>
                  {part.content}
                </ReactMarkdown>
              ) : null;

            case 'thinking':
              return (
                <Accordion
                  key={i}
                  label={part.title || 'Thinking…'}
                  icon={Icons.thinking}
                  variant="thinking"
                >
                  <div className="thinking-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                      {part.content}
                    </ReactMarkdown>
                  </div>
                </Accordion>
              );

            case 'tool_call':
              return (
                <Accordion
                  key={i}
                  label={`${toolDisplayName(part.tool)}${part.message ? ': ' + part.message : ''}`}
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
                        {part.complete ? <>{Icons.check} Complete</> : <>{Icons.spinner} Running</>}
                      </span>
                    </div>
                  </div>
                </Accordion>
              );

            case 'text_edit':
              return <FileEditBlock key={i} part={part} />;

            case 'reference':
              return (
                <span key={i} className={`inline-ref inline-ref-${part.ref_kind}`}>
                  <span className="inline-ref-icon">
                    {part.ref_kind === 'symbol' ? Icons.symbol : part.ref_kind === 'file_edit' ? Icons.filePen : Icons.file}
                  </span>
                  <span className="inline-ref-name">{part.name || shortPath(part.uri)}</span>
                </span>
              );

            case 'progress':
              return (
                <div key={i} className="progress-part">
                  <span className="progress-icon">{Icons.spinner}</span>
                  <span>{part.content}</span>
                </div>
              );

            default:
              return null;
          }
        })}
      </div>
    );
  }

  // Fallback: render content as markdown (for non-Copilot messages or old data)
  return (
    <div className="msg-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
