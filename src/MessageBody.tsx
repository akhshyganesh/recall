import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { FileEditsGroup, markdownComponents, renderStructuredPart } from './components/message-body/renderers';
import type { StructuredPart, TextEditPart } from './components/message-body/types';

function parseStructuredParts(extra?: string): StructuredPart[] | null {
  if (!extra) {
    return null;
  }

  try {
    const parsed = JSON.parse(extra);

    if (!Array.isArray(parsed?.parts) || parsed.parts.length === 0) {
      return null;
    }

    return parsed.parts as StructuredPart[];
  } catch {
    return null;
  }
}

function isTextEditPart(part: StructuredPart): part is TextEditPart {
  return part.type === 'text_edit';
}

function isVisibleStructuredPart(part: StructuredPart): boolean {
  return part.type !== 'text_edit' && part.type !== 'reference' && part.type !== 'progress';
}

export default function MessageBody({ content, extra }: { content: string; extra?: string }) {
  const parts = useMemo(() => parseStructuredParts(extra), [extra]);

  if (parts && parts.length > 0) {
    const editParts = parts.filter(isTextEditPart);
    const visibleParts = parts.filter(isVisibleStructuredPart);

    return (
      <div className="msg-body">
        {visibleParts.map((part, index) => renderStructuredPart(part, index))}
        {editParts.length > 0 && <FileEditsGroup parts={editParts} />}
      </div>
    );
  }

  return (
    <div className="msg-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
