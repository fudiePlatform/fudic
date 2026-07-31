/**
 * Shared helpers for the formatter tests.
 *
 * The parse is wired exactly as the emit and the language server wire it — never a second
 * pipeline — so the tree under test is the authentic one.
 */

import {
  parseCodeBlock,
  parseControl,
  parseDirective,
  parseDocument,
  type AtConstructParser,
  type HtmlDocument,
} from '@fudic/compiler';
import { resolveOptions } from '../src/options.js';
import type { LeafEngine, LeafRequest } from '../src/leaf/index.js';
import type { ResolvedOptions } from '../src/types.js';

const constructs: AtConstructParser = { parseControl, parseCodeBlock, parseDirective };

/** The flat HTML tree of a `.fud` source: what the printer walks. */
export function parse(source: string): HtmlDocument {
  return parseDocument(source, { atConstructs: constructs }).value;
}

export const options = (partial: Record<string, unknown> = {}): ResolvedOptions =>
  resolveOptions('', partial);

/**
 * An engine that does nothing but record and answer.
 *
 * The promises this package makes are about what happens when the leaf formatter
 * misbehaves, and a promise nobody can provoke is not a promise: this is how "does not
 * parse" and "swallowed a placeholder" become tests instead of hopes.
 */
export class FakeEngine implements LeafEngine {
  readonly requests: LeafRequest[] = [];

  constructor(
    private readonly reply: (request: LeafRequest) => { code: string; ok: boolean } = (r) => ({
      code: r.source,
      ok: true,
    }),
  ) {}

  format(request: LeafRequest): Promise<{ code: string; ok: boolean }> {
    this.requests.push(request);
    return Promise.resolve(this.reply(request));
  }
}
