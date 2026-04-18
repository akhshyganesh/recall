export interface TextPart {
  type: 'text';
  content: string;
}

export interface ThinkingPart {
  type: 'thinking';
  content: string;
  title?: string;
}

export interface ToolCallPart {
  type: 'tool_call';
  tool: string;
  message: string;
  description?: string;
  complete: boolean;
}

export interface TextEditPart {
  type: 'text_edit';
  file_path: string;
  content: string;
  done: boolean;
  diff?: string;
  change_kind?: 'create' | 'edit' | 'delete';
}

export interface ProgressPart {
  type: 'progress';
  content: string;
}

export interface ReferencePart {
  type: 'reference';
  name: string;
  uri: string;
  ref_kind: 'file' | 'file_edit' | 'symbol';
}

export type StructuredPart =
  | TextPart
  | ThinkingPart
  | ToolCallPart
  | TextEditPart
  | ProgressPart
  | ReferencePart;