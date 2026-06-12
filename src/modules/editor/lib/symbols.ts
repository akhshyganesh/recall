import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";

/**
 * Shared lezer-tree symbol extraction. Used by:
 *  - the "@" go-to-symbol palette mode
 *  - the editor breadcrumbs bar
 *  - sticky scroll headers
 *
 * One declarative table maps node names (across the JS/TS, Python, Rust,
 * Go, JSON and Markdown grammars) to a symbol kind plus the node names of
 * their direct name-children.
 */

export type SymbolKind =
  | "function"
  | "method"
  | "class"
  | "interface"
  | "enum"
  | "type"
  | "struct"
  | "trait"
  | "impl"
  | "module"
  | "constant"
  | "property"
  | "heading";

export type EditorSymbol = {
  name: string;
  kind: SymbolKind;
  /** 1-based line of the symbol's declaration. */
  line: number;
  from: number;
  to: number;
  /** Nesting depth (0 = top level). For headings, heading level - 1. */
  depth: number;
};

type NodeRule = { kind: SymbolKind; nameNodes: string[] };

/** Declaration node name → rule. Name children are searched among DIRECT
 * children only (Go's MethodDecl receiver hides a nested DefName). */
const SYMBOL_NODES: Record<string, NodeRule> = {
  // JavaScript / TypeScript (@lezer/javascript)
  FunctionDeclaration: { kind: "function", nameNodes: ["VariableDefinition"] },
  ClassDeclaration: {
    kind: "class",
    nameNodes: ["VariableDefinition", "TypeDefinition"],
  },
  MethodDeclaration: { kind: "method", nameNodes: ["PropertyDefinition"] },
  InterfaceDeclaration: { kind: "interface", nameNodes: ["TypeDefinition"] },
  TypeAliasDeclaration: { kind: "type", nameNodes: ["TypeDefinition"] },
  EnumDeclaration: { kind: "enum", nameNodes: ["TypeDefinition"] },
  // Python (@lezer/python)
  FunctionDefinition: { kind: "function", nameNodes: ["VariableName"] },
  ClassDefinition: { kind: "class", nameNodes: ["VariableName"] },
  // Rust (@lezer/rust)
  FunctionItem: { kind: "function", nameNodes: ["BoundIdentifier"] },
  StructItem: { kind: "struct", nameNodes: ["TypeIdentifier"] },
  EnumItem: { kind: "enum", nameNodes: ["TypeIdentifier"] },
  TraitItem: { kind: "trait", nameNodes: ["TypeIdentifier"] },
  ImplItem: { kind: "impl", nameNodes: ["TypeIdentifier"] },
  ModItem: { kind: "module", nameNodes: ["BoundIdentifier"] },
  // Go (@lezer/go)
  FunctionDecl: { kind: "function", nameNodes: ["DefName"] },
  MethodDecl: { kind: "method", nameNodes: ["FieldName"] },
  TypeSpec: { kind: "type", nameNodes: ["DefName"] },
};

const HEADING_RE = /^(?:ATXHeading|SetextHeading)([1-6])$/;
const TOP_NODES = new Set(["Script", "Program", "SourceFile", "Document"]);

function directChildName(
  node: SyntaxNode,
  state: EditorState,
  names: string[],
): string | null {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (names.includes(c.name)) return state.sliceDoc(c.from, c.to);
  }
  return null;
}

function headingName(node: SyntaxNode, state: EditorState): string {
  const line = state.doc.lineAt(node.from);
  return line.text.replace(/^#+\s*/, "").replace(/\s+#+\s*$/, "").trim();
}

/** Treat a JS `const x = …` at the top level as a symbol (function if the
 * initializer is a function, constant otherwise). */
function variableDeclSymbol(
  node: SyntaxNode,
  state: EditorState,
): { name: string; kind: SymbolKind } | null {
  if (!node.parent || !TOP_NODES.has(node.parent.name)) return null;
  const name = directChildName(node, state, ["VariableDefinition"]);
  if (!name) return null;
  let kind: SymbolKind = "constant";
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === "ArrowFunction" || c.name === "FunctionExpression") {
      kind = "function";
      break;
    }
  }
  return { name, kind };
}

/** JSON: only surface top-level object properties. */
function jsonPropertySymbol(
  node: SyntaxNode,
  state: EditorState,
): string | null {
  const obj = node.parent;
  if (!obj || obj.name !== "Object" || obj.parent?.name !== "JsonText")
    return null;
  const raw = directChildName(node, state, ["PropertyName"]);
  return raw ? raw.replace(/^"|"$/g, "") : null;
}

/** Resolve a node into a symbol descriptor, or null if it isn't one. */
export function symbolForNode(
  node: SyntaxNode,
  state: EditorState,
): { name: string; kind: SymbolKind } | null {
  const rule = SYMBOL_NODES[node.name];
  if (rule) {
    const name = directChildName(node, state, rule.nameNodes);
    return name ? { name, kind: rule.kind } : null;
  }
  const h = HEADING_RE.exec(node.name);
  if (h) {
    const name = headingName(node, state);
    return name ? { name, kind: "heading" } : null;
  }
  if (node.name === "VariableDeclaration") return variableDeclSymbol(node, state);
  if (node.name === "Property") {
    const name = jsonPropertySymbol(node, state);
    return name ? { name, kind: "property" } : null;
  }
  return null;
}

const MAX_SYMBOLS = 5000;

/** Flat, document-ordered symbol list with nesting depth. */
export function extractSymbols(state: EditorState): EditorSymbol[] {
  const tree =
    ensureSyntaxTree(state, state.doc.length, 100) ?? syntaxTree(state);
  const symbols: EditorSymbol[] = [];
  const stack: SyntaxNode[] = [];
  tree.iterate({
    enter(n) {
      if (symbols.length >= MAX_SYMBOLS) return false;
      const sym = symbolForNode(n.node, state);
      if (!sym) return undefined;
      const isHeading = sym.kind === "heading";
      const depth = isHeading
        ? Number(HEADING_RE.exec(n.name)?.[1] ?? 1) - 1
        : stack.length;
      symbols.push({
        ...sym,
        line: state.doc.lineAt(n.from).number,
        from: n.from,
        to: n.to,
        depth,
      });
      if (!isHeading) stack.push(n.node);
      return undefined;
    },
    leave(n) {
      if (stack.length && stack[stack.length - 1].from === n.from) {
        const top = stack[stack.length - 1];
        if (top.to === n.to && top.name === n.name) stack.pop();
      }
    },
  });
  return symbols;
}

/** Innermost-last chain of symbols enclosing `pos` (e.g. class › method). */
export function symbolChainAt(
  state: EditorState,
  pos: number,
): EditorSymbol[] {
  const tree = syntaxTree(state);
  const chain: EditorSymbol[] = [];
  for (
    let node: SyntaxNode | null = tree.resolveInner(pos, -1);
    node;
    node = node.parent
  ) {
    const sym = symbolForNode(node, state);
    if (sym && sym.kind !== "heading") {
      chain.push({
        ...sym,
        line: state.doc.lineAt(node.from).number,
        from: node.from,
        to: node.to,
        depth: 0,
      });
    }
  }
  chain.reverse();
  chain.forEach((s, i) => (s.depth = i));
  return chain;
}
