/**
 * `snippet-recursion` (SDD-51 §3.8): a snippet that renders itself with nothing in between is
 * an expansion that never ends — on the server, for every request (`FUD0914`).
 *
 * Recursion as such is fine: a tree renders its children under the `@if` or the loop that
 * runs out. What is refused is the call with no control construct between it and the top of
 * its own snippet's body. Only direct recursion: a cycle through another snippet, or through
 * another file, is a known limit.
 */

import { FUD0914 } from '@fudic/diagnostics';
import type { SnippetDeclNode } from '../../snippet/index.js';
import type { Analyzer } from '../model.js';
import { documentRoots, walk } from '../walk.js';

/** One open body: a snippet's, with the bodies opened inside it since, or any other. */
type Frame = { readonly snippet: string } | { readonly snippet?: undefined };

export const snippetRecursion: Analyzer = {
  name: 'snippet-recursion',
  run(input, report) {
    const frames: Frame[] = [];
    walk(documentRoots(input.document), {
      enterBlock(owner) {
        frames.push(owner.type === 'snippet' ? { snippet: (owner as SnippetDeclNode).name } : {});
      },
      exitBlock() {
        frames.pop();
      },
      render(node) {
        // The innermost body must be the snippet's own: any other one is a construct between.
        const own = frames[frames.length - 1]?.snippet;
        if (node.namespace === undefined && own !== undefined && own === node.name) {
          report(FUD0914({ span: node.nameSpan }));
        }
      },
    });
  },
};
