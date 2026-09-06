/**
 * BUG-24 §4.1 in the editor — the projection checks the OBJECT where the build crosses the
 * object, and its READ where the build crosses the read (criterion 20).
 *
 * What decides between the two is what the CHILD declares, and the projection cannot open the
 * child's `.fud`: its contract is already an imported type. So the value goes through
 * `$cross<$Prop<$C0, 'tone'>>(…)`, which hands the checker both readings at once against that
 * type — one rule, applied by the same `crossing` the emit applies, and the answer computed
 * where the answer lives.
 *
 * Measured against the real checker over the real corpus, because the whole question is what
 * TypeScript concludes; asserting the projected text would only restate the emitter.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { typecheckCorpus, type CorpusDiagnostic } from './typecheck.js';

const FIXTURES = resolve(fileURLToPath(new URL('../fixtures', import.meta.url)));
const SLUG = 'blog/[slug].fud';
const BADGE = 'components/app-badge.fud';

const read = (path: string): string => readFileSync(resolve(FIXTURES, path), 'utf8');

/** The route's own `@client`, declaring a reactive and the `signal` the corpus cannot import. */
const CLIENT = `  }
  @client {
    type Signal<T> = { (): T; set(next: T): void };
    declare function signal<T>(initial: T): Signal<T>;
    type Tone = 'neutral' | 'success' | 'info';

    const titulo = signal<Tone>('info');
    const numero = signal(1);
  }
}`;

/** The badge, rewritten to ask for its prop BY REFERENCE (props-spec decision 86). */
const SIGNAL_BADGE = `@code {
  type Tone = 'neutral' | 'success' | 'info';
  type Signal<T> = { (): T; set(next: T): void };

  const { tone } = props<{ tone: Signal<Tone> }>();
}

<app-badge>
  <template shadowrootmode="open">
    <span class="badge">@tone()<slot></slot></span>
  </template>
</app-badge>
`;

const TONE_PROP = `.tone="@(data.found ? 'info' : 'neutral')"`;

/** The corpus with the route's `@client` in place and its `.tone` replaced by `to`. */
function corpus(to: string, badge?: string): Record<string, string> {
  const source = read(SLUG).replace('  }\n}', CLIENT).replace(TONE_PROP, to);
  if (!source.includes(to)) throw new Error(`mutation anchor not found: ${to}`);
  return badge === undefined ? { [SLUG]: source } : { [SLUG]: source, [BADGE]: badge };
}

const describeDiag = (d: CorpusDiagnostic): string =>
  `${d.code} ${d.message} @${d.sourceText ?? '<unmapped>'}`;

describe('a prop declared `Signal<T>` takes the object', () => {
  it('and the editor says nothing about it', () => {
    const diags = typecheckCorpus(corpus(`.tone="@titulo"`, SIGNAL_BADGE));
    expect(diags.map(describeDiag)).toEqual([]);
  });

  it('while the very same value against a `Tone` prop is still checked as its READ', () => {
    // BUG-23 §4.2 rule 6, untouched: the badge as the corpus really declares it.
    expect(typecheckCorpus(corpus(`.tone="@titulo"`)).map(describeDiag)).toEqual([]);
  });

  it('rejects a value that is neither the object nor its read — the editor half of FUD0200', () => {
    const diags = typecheckCorpus(corpus(`.tone="@numero"`, SIGNAL_BADGE));

    expect(diags).toHaveLength(1);
    // On the author's own characters, which is the whole point of projecting it at all.
    expect(diags[0]!.sourceText).toBe('numero');
  });

  it('and the hand-written read of it, which is a `Tone` and not the cell, too', () => {
    const diags = typecheckCorpus(corpus(`.tone="@(titulo())"`, SIGNAL_BADGE));
    expect(diags).toHaveLength(1);
  });
});
