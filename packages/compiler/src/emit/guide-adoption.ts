/**
 * Whether a component adopts the pieces of the style guide its template needs — and only
 * those. The build and the editor ask the same function, so they say the same thing.
 *
 * The two answers are not symmetric, on purpose. A piece is MISSING when an element of the
 * template is styled by it (`piecesForTag`: a type selector in a rule's subject, nothing
 * cleverer), and adding it is always safe. A piece is UNUSED only when pruning it against the
 * shadow root leaves no rule — and the prune keeps whatever it is not sure about, so the
 * warning only comes when it is certain. Neither ever changes what is adopted: the attribute
 * is the truth, and these are only advice about it.
 */

import { FUD1440, FUD1441 } from '@fudic/diagnostics';
import { adoptedStylesOf } from '../binding/index.js';
import { piecesForTag, plainSheet, type GuidePiece } from '../css/index.js';
import type { ElementNode } from '../html/index.js';
import type { Diagnostic } from '../types/index.js';
import { walkElements } from './level.js';
import { prunePage } from './prune.js';
import type { ScopeSurface } from './surface.js';

/**
 * `FUD1440` over the first element of each tag a piece styles and the template does not adopt,
 * `FUD1441` over each adopted piece that styles nothing in `surface`. `surface` is what the
 * shadow root can hold; `null` when it cannot be known (a snippet the caller could not
 * expand), and then nothing is called unused.
 */
export function guideAdoptionDiagnostics(
  template: ElementNode | undefined,
  pieces: readonly GuidePiece[],
  surface: ScopeSurface | null,
): readonly Diagnostic[] {
  if (template === undefined || pieces.length === 0) return [];
  const adopted = adoptedStylesOf(template).names;
  const named = new Set(adopted.map((a) => a.name));
  const out: Diagnostic[] = [];
  const seen = new Set<string>();
  walkElements(template.children, (el) => {
    const tag = el.name.toLowerCase();
    if (seen.has(tag)) return;
    seen.add(tag);
    const missing = piecesForTag(pieces, tag).filter((name) => !named.has(name));
    if (missing.length === 0) return;
    const start = el.openSpan.start + 1;
    out.push(FUD1440({ span: { start, end: start + el.name.length }, tag, pieces: missing }));
  });
  if (surface === null) return out;
  const byName = new Map(pieces.map((p) => [p.name, p]));
  for (const { name, span } of adopted) {
    const piece = byName.get(name);
    if (piece === undefined) continue;
    const [pruned] = prunePage(
      [{ key: name, sheet: plainSheet(name, piece.css), scope: 'shadow', surface }],
      [],
    ).value;
    if (pruned!.css === '') out.push(FUD1441({ span, name }));
  }
  return out;
}
