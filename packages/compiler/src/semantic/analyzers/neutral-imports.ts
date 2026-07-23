/**
 * `neutral-imports` (decision 33.c): the neutral zone of `@code` holds only shared, pure
 * modules. A side-effect import (`import './reset.css'` — no bindings) is flagged as a
 * warning: purity is not statically decidable, so SDD-12 only warns on the clear case (§8.3).
 *
 * Named imports are allowed (they name a shared module); a side-effect import brings a
 * side effect into the shared scope. Detection reads the neutral fragment's Oxc AST.
 */

import { warningDiag } from '../../types/index.js';
import type { OxcNode } from '../../oxc/index.js';
import type { Analyzer } from '../model.js';
import { documentCode } from '../walk.js';

const FUD_NEUTRAL_SIDE_EFFECT_IMPORT = 'FUD0196';

export const neutralImports: Analyzer = {
  name: 'neutral-imports',
  run(input, report) {
    const code = documentCode(input.document);
    if (code === undefined) return;

    for (const part of code.parts) {
      if (part.type !== 'neutral-js') continue;
      const id = input.fragmentId(part);
      if (id === undefined) continue;

      // A neutral chunk is registered as `module-statements`, so `ast` is the Statement[].
      const statements = input.js.ast(id) as readonly OxcNode[];
      for (const statement of statements) {
        if (statement.type === 'ImportDeclaration' && isSideEffectImport(statement)) {
          report(
            warningDiag(
              FUD_NEUTRAL_SIDE_EFFECT_IMPORT,
              'side-effect import in the neutral zone; only pure shared modules belong here',
              input.js.mapSpan(statement.start, statement.end),
            ),
          );
        }
      }
    }
  },
};

/** `import './x'` — an import with no specifiers imports for effect only. */
function isSideEffectImport(node: OxcNode): boolean {
  const specifiers = node['specifiers'];
  return !Array.isArray(specifiers) || specifiers.length === 0;
}
