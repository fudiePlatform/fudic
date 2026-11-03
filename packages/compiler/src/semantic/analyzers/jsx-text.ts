/**
 * `jsx-text` (SDD-62): JSX written in the markup, `{items.map(i => <li>…</li>)}` or
 * `{open && <p>…</p>}`. Braces are text in fudic, so the page prints the code. `FUD1162`, a
 * warning, from the `{` to its `}`; never inside `<code>` or `<pre>`, where code is meant to be
 * shown.
 *
 * The `<li>` of a `.map` is an element of its own, so the JSX is spread over several children:
 * the braces are balanced over the source from a text child's `{` to the end of the element's
 * content, across them.
 */

import { FUD1162 } from '@fudic/diagnostics';
import type { ElementNode } from '../../html/index.js';
import { span } from '../../types/index.js';
import type { Analyzer } from '../model.js';
import { documentRoots, walk } from '../walk.js';

/** Where code is shown on purpose. */
const SHOWS_CODE: ReadonlySet<string> = new Set(['code', 'pre']);

/** A loop or a condition written as JSX. */
const JSX = /\.map\([\s\S]*=>|&&\s*</u;

/** The offset of the `}` that closes the `{` at `open`, before `end`; -1 when none does. */
function closing(source: string, open: number, end: number): number {
  let depth = 0;
  for (let at = open; at < end; at++) {
    if (source[at] === '{') depth++;
    else if (source[at] === '}' && --depth === 0) return at;
  }
  return -1;
}

/** Every element inside `el`, at any depth. */
function descendants(el: ElementNode, into: Set<ElementNode>): void {
  for (const child of el.children) {
    if (child.type !== 'element') continue;
    into.add(child);
    descendants(child, into);
  }
}

export const jsxText: Analyzer = {
  name: 'jsx-text',
  run(input, report) {
    const shown = new Set<ElementNode>();
    walk(documentRoots(input.document), {
      element(el) {
        // Parents come first, so a `<code>` has marked what it holds before it is reached.
        if (SHOWS_CODE.has(el.name)) descendants(el, shown);
        if (SHOWS_CODE.has(el.name) || shown.has(el)) return;

        const end = el.children.at(-1)?.span.end ?? el.span.end;
        let from = el.span.start;
        for (const child of el.children) {
          if (child.type !== 'text') continue;
          // The source and not `value`, whose entities are decoded: the offsets are the file's.
          const text = input.source.slice(child.span.start, child.span.end);
          for (let at = text.indexOf('{'); at !== -1; at = text.indexOf('{', at + 1)) {
            const open = child.span.start + at;
            if (open < from) continue;
            const close = closing(input.source, open, end);
            if (close === -1) break;
            if (!JSX.test(input.source.slice(open, close))) continue;
            report(FUD1162({ span: span(open, close + 1) }));
            // What the report covers is not read again: a `{i}` inside it is part of it.
            from = close + 1;
          }
        }
      },
    });
  },
};
