import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { EditorState, type Extension } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { extractSymbols, symbolChainAt } from "./symbols";

function stateOf(ext: Extension, doc: string): EditorState {
  return EditorState.create({ doc, extensions: [ext] });
}

describe("extractSymbols", () => {
  it("extracts TypeScript classes, methods, functions and top-level consts", () => {
    const state = stateOf(
      javascript({ typescript: true }),
      [
        "class Foo {",
        "  bar(x: number) { return x }",
        "}",
        "function qux() {}",
        "const alpha = () => {};",
        "const NUM = 3;",
        "interface Shape { a: number }",
        "type T = number;",
      ].join("\n"),
    );
    const symbols = extractSymbols(state);
    expect(symbols.map((s) => [s.name, s.kind])).toEqual([
      ["Foo", "class"],
      ["bar", "method"],
      ["qux", "function"],
      ["alpha", "function"],
      ["NUM", "constant"],
      ["Shape", "interface"],
      ["T", "type"],
    ]);
    const bar = symbols.find((s) => s.name === "bar")!;
    expect(bar.line).toBe(2);
    expect(bar.depth).toBe(1);
    expect(symbols.find((s) => s.name === "Foo")!.depth).toBe(0);
  });

  it("extracts Python classes and functions with nesting depth", () => {
    const state = stateOf(
      python(),
      "class Foo:\n    def bar(self):\n        pass\n\ndef qux():\n    pass\n",
    );
    const symbols = extractSymbols(state);
    expect(symbols.map((s) => [s.name, s.kind, s.depth])).toEqual([
      ["Foo", "class", 0],
      ["bar", "function", 1],
      ["qux", "function", 0],
    ]);
  });

  it("extracts Rust items", () => {
    const state = stateOf(
      rust(),
      "struct Foo {}\nimpl Foo { fn bar(&self) {} }\nfn qux() {}\ntrait T {}\nmod m {}\n",
    );
    const symbols = extractSymbols(state);
    expect(symbols.map((s) => [s.name, s.kind])).toEqual([
      ["Foo", "struct"],
      ["Foo", "impl"],
      ["bar", "function"],
      ["qux", "function"],
      ["T", "trait"],
      ["m", "module"],
    ]);
  });

  it("extracts markdown headings with level-based depth", () => {
    const state = stateOf(markdown(), "# Title\n\n## Sub *head*\n\ntext\n");
    const symbols = extractSymbols(state);
    expect(symbols.map((s) => [s.name, s.kind, s.depth, s.line])).toEqual([
      ["Title", "heading", 0, 1],
      ["Sub *head*", "heading", 1, 3],
    ]);
  });

  it("extracts only top-level JSON keys", () => {
    const state = stateOf(json(), '{"a": 1, "b": {"c": 2}}');
    const symbols = extractSymbols(state);
    expect(symbols.map((s) => [s.name, s.kind])).toEqual([
      ["a", "property"],
      ["b", "property"],
    ]);
  });

  it("returns an empty list for plain text", () => {
    const state = EditorState.create({ doc: "just some text\nno symbols" });
    expect(extractSymbols(state)).toEqual([]);
  });
});

describe("symbolChainAt", () => {
  it("returns the enclosing class › method chain at a position", () => {
    const doc = "class Foo {\n  bar() {\n    return 1;\n  }\n}\n";
    const state = stateOf(javascript({ typescript: true }), doc);
    const pos = doc.indexOf("return");
    const chain = symbolChainAt(state, pos);
    expect(chain.map((s) => s.name)).toEqual(["Foo", "bar"]);
    expect(chain.map((s) => s.depth)).toEqual([0, 1]);
  });

  it("returns an empty chain at the top level", () => {
    const doc = "const x = 1;\nclass Foo {}\n";
    const state = stateOf(javascript({ typescript: true }), doc);
    expect(symbolChainAt(state, 0).map((s) => s.name)).toEqual([]);
  });
});
