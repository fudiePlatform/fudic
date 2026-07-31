/**
 * The door: `format` and `formatRange` (§3, §4.6, §4.7).
 *
 * Four steps and one guarantee. Parse; refuse if the parse had anything to say; format
 * every leaf at once; print. The guarantee is that this function does not throw — not on
 * broken input, not on an invalid fragment, not on a leaf formatter that fails in a way
 * nobody predicted (§5). An editor calls this on every save.
 */

import {
  parseCodeBlock,
  parseControl,
  parseDirective,
  parseDocument,
  type AtConstructParser,
  type Diagnostic,
  type HtmlContent,
  type HtmlDocument,
  type Span,
} from '@fudic/compiler';
import { printDoc } from './doc/index.js';
import { applyEndOfLine } from './eol.js';
import { internalFailure } from './diagnostics.js';
import { collectLeaves, oxfmtEngine, type LeafEngine } from './leaf/index.js';
import { resolveOptions } from './options.js';
import { printRoot } from './print/content.js';
import { smallestNodeAround } from './range.js';
import type { FormatOptions, FormatResult } from './types.js';

const constructs: AtConstructParser = { parseControl, parseCodeBlock, parseDirective };

interface Parsed {
  readonly document: HtmlDocument;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * The parse the formatter refuses on: SDD-05..09, and nothing else.
 *
 * The tree this printer walks is the flat one — the structuring pass of SDD-10 lifts pieces
 * into named fields and validates document rules (phase order, the host wrapper of decision
 * 75), none of which changes a single character of the layout. Refusing on those would mean
 * a component that has not grown its wrapper yet cannot be formatted while it is being
 * written, which is the one moment formatting is asked for. Semantic diagnostics and type
 * errors are out for the same reason, only more so: a formatter that switches itself off on
 * a `TS2304` is off almost always.
 *
 * What DOES stop it is a broken tree. An unclosed element has no correct layout, and
 * inventing one reorganizes code the user is halfway through writing (§4.6).
 */
function parseFud(source: string): Parsed {
  const html = parseDocument(source, { atConstructs: constructs });
  return { document: html.value, diagnostics: html.diagnostics };
}

/** Print a list of roots with the leaves already resolved. */
async function run(
  engine: LeafEngine,
  source: string,
  roots: readonly HtmlContent[],
  partial: Partial<FormatOptions> | undefined,
): Promise<{ readonly text: string; readonly notes: readonly Diagnostic[] }> {
  const options = resolveOptions(source, partial);
  const leaves = await collectLeaves(engine, source, roots, options);
  const text = printDoc(printRoot({ source, leaves, options }, roots), options);
  return { text, notes: leaves.notes };
}

/**
 * Format a whole file.
 *
 * `engine` is here for the tests, and for the one thing they cannot otherwise reach: the
 * promise that nothing escapes. Callers use the default.
 */
export async function formatWith(
  engine: LeafEngine,
  source: string,
  partial?: Partial<FormatOptions>,
): Promise<FormatResult> {
  try {
    const parsed = parseFud(source);
    if (parsed.diagnostics.length > 0) return { ok: false, diagnostics: parsed.diagnostics };

    const options = resolveOptions(source, partial);
    const printed = await run(engine, source, parsed.document.children, partial);
    // Exactly one terminating newline. It is not a run between two pieces of content, so
    // nothing about it is preserved from the source: it is simply how a text file ends.
    return {
      ok: true,
      text: applyEndOfLine(`${printed.text}\n`, options.endOfLine),
      notes: printed.notes,
    };
  } catch (error) {
    return { ok: false, diagnostics: [internalFailure(source, error)] };
  }
}

/** Format a whole file (§3). */
export function format(source: string, options?: Partial<FormatOptions>): Promise<FormatResult> {
  return formatWith(oxfmtEngine, source, options);
}

/**
 * Format the smallest complete node that contains `range`, and splice it back in.
 *
 * Never half a construct (§4.7): selecting the middle of an `@if` header formats the whole
 * `@if`. The rest of the file comes out byte for byte as it went in — a range format that
 * rewrites anything outside the range is a range format nobody can trust with a selection.
 */
export async function formatRangeWith(
  engine: LeafEngine,
  source: string,
  range: Span,
  partial?: Partial<FormatOptions>,
): Promise<FormatResult> {
  try {
    const parsed = parseFud(source);
    if (parsed.diagnostics.length > 0) return { ok: false, diagnostics: parsed.diagnostics };

    // A selection that no single node covers — across two siblings, or the whole file — is
    // a request to format the document. There is no smaller correct answer.
    const target = smallestNodeAround(parsed.document.children, range);
    if (target === undefined) return formatWith(engine, source, partial);

    const options = resolveOptions(source, partial);
    const printed = await run(engine, source, [target], partial);
    // Only the fragment gets the terminator applied: the rest of the file already carries
    // its own, and running the conversion over it again would double every one of them.
    const text =
      source.slice(0, target.span.start) +
      applyEndOfLine(printed.text, options.endOfLine) +
      source.slice(target.span.end);
    return { ok: true, text, notes: printed.notes };
  } catch (error) {
    return { ok: false, diagnostics: [internalFailure(source, error)] };
  }
}

/** Format a range (§3). */
export function formatRange(
  source: string,
  range: Span,
  options?: Partial<FormatOptions>,
): Promise<FormatResult> {
  return formatRangeWith(oxfmtEngine, source, range, options);
}
