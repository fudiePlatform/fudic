/**
 * The printing algorithm: a `Doc` and a width in, one string out.
 *
 * Two modes and a lookahead. A group is printed flat when what follows it fits in the
 * columns that are left, and broken when it does not; everything else — indentation,
 * fills, hard breaks — falls out of that single decision. It is Wadler's algorithm in the
 * shape Prettier gave it, and there is no reason to invent a third.
 *
 * Synchronous and pure, and that is a design constraint rather than an accident: the
 * delegated leaves are formatted BEFORE this runs (see `leaf/collect.ts`), so nothing here
 * awaits, nothing here can interleave, and the same document always prints the same bytes.
 */

import { indentUnit } from '../options.js';
import type { ResolvedOptions } from '../types.js';
import { concat, fill, type Doc } from './builders.js';

const FLAT = 0;
const BREAK = 1;
type Mode = typeof FLAT | typeof BREAK;

/** [indentation, mode, document] — the unit the two loops below push around. */
type Command = readonly [string, Mode, Doc];

/**
 * Would this document fit in `width` columns, followed by whatever is already queued?
 *
 * The queue matters: `<a>` fits in the columns left only if the `</a>` that the outer
 * document will print right after it fits too. Measuring the group alone is how formatters
 * end up breaking a line that was already over the margin for a reason outside the group.
 */
function fits(next: Command, rest: readonly Command[], width: number, unit: string): boolean {
  let remaining = width;
  const cmds: Command[] = [next];
  let restIndex = rest.length;

  while (remaining >= 0) {
    if (cmds.length === 0) {
      // Nothing of our own left to measure: keep going with what the printer will do next.
      if (restIndex === 0) return true;
      restIndex -= 1;
      cmds.push(rest[restIndex]!);
      continue;
    }

    const [ind, mode, doc] = cmds.pop()!;

    if (typeof doc === 'string') {
      // A literal newline ends the line: everything after it is somebody else's problem.
      const nl = doc.indexOf('\n');
      if (nl >= 0) return remaining - nl >= 0;
      remaining -= doc.length;
      continue;
    }

    switch (doc.kind) {
      case 'concat':
      case 'fill':
        for (let i = doc.parts.length - 1; i >= 0; i -= 1) cmds.push([ind, mode, doc.parts[i]!]);
        break;
      case 'indent':
        cmds.push([ind + unit, mode, doc.contents]);
        break;
      case 'group':
        cmds.push([ind, doc.shouldBreak ? BREAK : mode, doc.contents]);
        break;
      case 'line':
        if (mode === BREAK || doc.hard) return true;
        if (!doc.soft) remaining -= 1;
        break;
      case 'break-parent':
        break;
    }
  }

  return false;
}

/** Drop the spaces and tabs a break would otherwise leave hanging at the end of a line. */
function trimTrailingSpace(out: string[]): void {
  while (out.length > 0) {
    const last = out[out.length - 1]!;
    const trimmed = last.replace(/[ \t]+$/, '');
    if (trimmed === last) return;
    if (trimmed === '') out.pop();
    else {
      out[out.length - 1] = trimmed;
      return;
    }
  }
}

/** Print a document. The result holds `\n` only: the terminator is applied by `format`. */
export function printDoc(doc: Doc, options: ResolvedOptions): string {
  const unit = indentUnit(options);
  const width = options.printWidth;
  const out: string[] = [];
  const cmds: Command[] = [['', BREAK, doc]];
  let pos = 0;

  while (cmds.length > 0) {
    const [ind, mode, current] = cmds.pop()!;

    if (typeof current === 'string') {
      out.push(current);
      const nl = current.lastIndexOf('\n');
      pos = nl === -1 ? pos + current.length : current.length - nl - 1;
      continue;
    }

    switch (current.kind) {
      case 'concat':
        for (let i = current.parts.length - 1; i >= 0; i -= 1) {
          cmds.push([ind, mode, current.parts[i]!]);
        }
        break;

      case 'indent':
        cmds.push([ind + unit, mode, current.contents]);
        break;

      case 'group': {
        // A group that must break is not measured; one that need not be is measured against
        // what the printer already has queued behind it.
        const flat =
          !current.shouldBreak &&
          fits([ind, FLAT, current.contents], cmds, width - pos, unit);
        cmds.push([ind, flat ? FLAT : BREAK, current.contents]);
        break;
      }

      case 'fill': {
        const parts = current.parts;
        if (parts.length === 0) break;

        const content = parts[0]!;
        const contentFits = fits([ind, FLAT, content], [], width - pos, unit);

        if (parts.length === 1) {
          cmds.push([ind, contentFits ? FLAT : BREAK, content]);
          break;
        }

        const separator = parts[1]!;

        if (parts.length === 2) {
          const mode2: Mode = contentFits ? FLAT : BREAK;
          cmds.push([ind, mode2, separator]);
          cmds.push([ind, mode2, content]);
          break;
        }

        // Three or more: the separator's fate depends on whether content, separator and the
        // NEXT content fit together. That pairwise question is the whole of `fill`.
        const rest = fill(parts.slice(2));
        const pair = concat([content, separator, parts[2]!]);
        const pairFits = fits([ind, FLAT, pair], [], width - pos, unit);

        cmds.push([ind, BREAK, rest]);
        if (pairFits) {
          cmds.push([ind, FLAT, separator]);
          cmds.push([ind, FLAT, content]);
        } else {
          cmds.push([ind, BREAK, separator]);
          cmds.push([ind, contentFits ? FLAT : BREAK, content]);
        }
        break;
      }

      case 'line':
        if (mode === FLAT && !current.hard) {
          if (!current.soft) {
            out.push(' ');
            pos += 1;
          }
          break;
        }
        trimTrailingSpace(out);
        out.push('\n');
        out.push(ind);
        pos = ind.length;
        break;

      case 'break-parent':
        break;
    }
  }

  trimTrailingSpace(out);
  return out.join('');
}
