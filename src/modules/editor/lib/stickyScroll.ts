import { detectMonoFontFamily } from "@/lib/fonts";
import type { Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { symbolChainAt } from "./symbols";

/**
 * VS Code-style sticky scroll: pins the enclosing scope's header lines
 * (function/class/etc. declarations containing the first visible line) to
 * the top of the editor while scrolling. Up to 3 rows; clicking a row
 * jumps to that declaration. Recomputed on scroll via a rAF throttle and
 * only re-rendered when the header set actually changes.
 */

const MAX_ROWS = 3;

const stickyTheme = EditorView.baseTheme({
  ".cm-sticky-scroll": {
    position: "absolute",
    top: "0",
    left: "0",
    right: "0",
    zIndex: "20",
    overflow: "hidden",
    fontSize: "13px",
    lineHeight: "1.55",
    backgroundColor: "var(--background)",
    borderBottom: "1px solid color-mix(in srgb, var(--border) 60%, transparent)",
    boxShadow: "0 2px 6px -2px color-mix(in srgb, var(--foreground) 12%, transparent)",
    cursor: "pointer",
  },
  ".cm-sticky-scroll-line": {
    whiteSpace: "pre",
    overflow: "hidden",
    textOverflow: "ellipsis",
    color: "var(--foreground)",
    opacity: "0.85",
  },
  ".cm-sticky-scroll-line:hover": {
    backgroundColor: "color-mix(in srgb, var(--foreground) 6%, transparent)",
    opacity: "1",
  },
  ".cm-sticky-scroll-num": {
    display: "inline-block",
    textAlign: "right",
    opacity: "0.45",
    userSelect: "none",
    color: "var(--muted-foreground)",
  },
});

class StickyScrollPlugin {
  private dom: HTMLElement;
  private view: EditorView;
  private rafId = -1;
  private renderedKey = "";
  private onScroll = () => this.schedule();

  constructor(view: EditorView) {
    this.view = view;
    this.dom = document.createElement("div");
    this.dom.className = "cm-sticky-scroll";
    this.dom.style.display = "none";
    this.dom.style.fontFamily = detectMonoFontFamily();
    this.dom.setAttribute("aria-hidden", "true");
    // Forward wheel events so the overlay never blocks scrolling.
    this.dom.addEventListener(
      "wheel",
      (e) => {
        view.scrollDOM.scrollTop += e.deltaY;
        view.scrollDOM.scrollLeft += e.deltaX;
        e.preventDefault();
      },
      { passive: false },
    );
    view.dom.appendChild(this.dom);
    view.scrollDOM.addEventListener("scroll", this.onScroll);
    this.schedule();
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged || update.geometryChanged) {
      this.schedule();
    }
  }

  private schedule() {
    if (this.rafId !== -1) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = -1;
      this.measure();
    });
  }

  private measure() {
    const view = this.view;
    if (!view.dom.isConnected) return;
    const editorRect = view.dom.getBoundingClientRect();
    if (editorRect.height === 0) return;
    const stickyHeight = this.dom.style.display === "none" ? 0 : this.dom.offsetHeight;
    // First content line visible underneath the sticky overlay.
    const probeY = editorRect.top + stickyHeight + 1;
    const gutters = view.scrollDOM.querySelector<HTMLElement>(".cm-gutters");
    const gutterWidth = gutters?.offsetWidth ?? 0;
    const pos = view.posAtCoords(
      { x: editorRect.left + gutterWidth + 4, y: probeY },
      false,
    );
    const state = view.state;
    const firstLine = state.doc.lineAt(pos).number;
    const chain = symbolChainAt(state, pos).filter(
      (s) => s.line < firstLine,
    );
    const rows = chain.slice(-MAX_ROWS);
    // Suppress when the headers would just cover themselves.
    const key = rows.map((r) => `${r.from}:${r.line}`).join("|");
    if (key === this.renderedKey) return;
    this.renderedKey = key;

    if (rows.length === 0) {
      this.dom.style.display = "none";
      this.dom.replaceChildren();
      return;
    }
    const numWidth = `${String(state.doc.lines).length + 1}ch`;
    const frag = document.createDocumentFragment();
    for (const row of rows) {
      const lineText = state.doc.line(row.line).text;
      const el = document.createElement("div");
      el.className = "cm-sticky-scroll-line";
      const num = document.createElement("span");
      num.className = "cm-sticky-scroll-num";
      num.style.width = numWidth;
      num.style.marginRight = "12px";
      num.textContent = String(row.line);
      el.appendChild(num);
      el.appendChild(document.createTextNode(lineText.trimEnd()));
      el.style.paddingLeft = "8px";
      const targetLine = row.line;
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const target = view.state.doc.line(targetLine).from;
        view.dispatch({
          selection: { anchor: target },
          effects: EditorView.scrollIntoView(target, { y: "start" }),
        });
        view.focus();
      });
      frag.appendChild(el);
    }
    this.dom.replaceChildren(frag);
    this.dom.style.display = "block";
  }

  destroy() {
    if (this.rafId !== -1) cancelAnimationFrame(this.rafId);
    this.view.scrollDOM.removeEventListener("scroll", this.onScroll);
    this.dom.remove();
  }
}

export function stickyScroll(): Extension {
  return [stickyTheme, ViewPlugin.fromClass(StickyScrollPlugin)];
}
