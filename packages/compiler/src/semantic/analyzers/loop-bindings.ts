/**
 * `loop-bindings`: a `@foreach` or `@for` whose header declares a variable that names nothing —
 * `const {} of rows`, `const [] of rows` — has nothing to tell its rows apart (`FUD0543`). A fact
 * about the header, so it is said for every loop, reactive or not, in the build and the editor.
 *
 * An assignment header (`row of rows`) is `FUD0900`, and one Oxc could not read is `FUD0170`:
 * they are not this rule's to repeat.
 */

import { FUD0543 } from '@fudic/diagnostics';
import { patternNames, type OxcNode } from '../../oxc/index.js';
import type { Analyzer } from '../model.js';
import { documentRoots, walk } from '../walk.js';

export const loopBindings: Analyzer = {
  name: 'loop-bindings',
  run(input, report) {
    walk(documentRoots(input.document), {
      control(node) {
        if (node.type !== 'foreach' && node.type !== 'for') return;
        const id = input.fragmentId(node);
        const root = id === undefined ? undefined : input.js.ast(id);
        if (root === undefined || Array.isArray(root)) return;
        const declaration = (root as OxcNode)[node.type === 'foreach' ? 'left' : 'init'] as OxcNode | null;
        if (declaration?.type !== 'VariableDeclaration') return;
        const first = (declaration['declarations'] as readonly OxcNode[])[0]!;
        if (patternNames(first['id'] as OxcNode).length === 0) report(FUD0543({ span: node.header.span }));
      },
    });
  },
};
