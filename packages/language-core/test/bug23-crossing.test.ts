/**
 * BUG-23 §2.8 — the editor judges the object, the build crosses the value.
 *
 * Decision 84 says a value whose text is the bare name of a `signal(...)` crosses the shadow
 * boundary as `name()`. The emit has applied that rule since SDD-17; the projection has never
 * known about it, so `.tone="@titulo"` is checked as `Signal<Tone>` against `Tone` — a type
 * error about an expression the build never emits.
 *
 * Measured here rather than through the language server, and the reason is the shape of the
 * error: when the value is CALLABLE and calling it would fit, TypeScript anchors the complaint
 * on the expression instead of on the key, and the expression is wrapped in the parentheses
 * this projection adds. Both ends of the range land in scaffolding, so the server drops it —
 * the wrong judgement is made either way, but only in here is it visible.
 *
 * Written RED first (task 1): what is not fixed yet is `it.fails`, so the suite is green at
 * every commit and the flip to a plain `it` is the proof that the phase landed.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { typecheckCorpus, type CorpusDiagnostic } from './typecheck.js';

const FIXTURES = resolve(fileURLToPath(new URL('../fixtures', import.meta.url)));
const SLUG = 'blog/[slug].fud';

const read = (path: string): string => readFileSync(resolve(FIXTURES, path), 'utf8');

/**
 * A `@client` block for the route, declaring two reactives and the one thing the fixture
 * workspace cannot import: `signal` itself.
 *
 * A local declaration is not a shortcut. What makes a name reactive is the CALLEE the
 * declarator was initialized with, never where that callee came from — which is exactly what
 * `reactiveNames` reads, and what lets a component declare its own.
 */
const CLIENT = `  }
  @client {
    type Signal<T> = { (): T; set(next: T): void };
    declare function signal<T>(initial: T): Signal<T>;
    type Tone = 'neutral' | 'success' | 'info';

    const titulo = signal<Tone>('info');
    const numero = signal(1);
  }
}`;

/** The route with the `@client` above, and `markup` replacing its `<article>` body. */
function corpusWith(from: string, to: string): Record<string, string> {
  const source = read(SLUG).replace('  }\n}', CLIENT).replace(from, to);
  if (!source.includes(to)) throw new Error(`mutation anchor not found: ${from}`);
  return { [SLUG]: source };
}

const TONE_PROP = `.tone="@(data.found ? 'info' : 'neutral')"`;

const describeDiag = (d: CorpusDiagnostic): string =>
  `${d.code} ${d.message} @${d.sourceText ?? '<unmapped>'}`;

describe('the `.prop` of a component', () => {
  it.fails('says nothing about a reactive whose VALUE is what the prop declares', () => {
    expect(typecheckCorpus(corpusWith(TONE_PROP, `.tone="@titulo"`)).map(describeDiag)).toEqual([]);
  });

  it('still reports a reactive whose value is the wrong type', () => {
    const diags = typecheckCorpus(corpusWith(TONE_PROP, `.tone="@numero"`));

    expect(diags).toHaveLength(1);
    expect(diags[0]!.code).toBe(2322);
  });

  it('leaves the hand-written read exactly as it was', () => {
    expect(typecheckCorpus(corpusWith(TONE_PROP, `.tone="@(titulo())"`))).toEqual([]);
  });
});

describe('the plain interpolated attribute — the emit crosses there too', () => {
  it.fails('says nothing about a reactive whose value is a scalar', () => {
    const diags = typecheckCorpus(corpusWith('<h1>@data.title</h1>', '<h1 id="@titulo"></h1>'));

    expect(diags.map(describeDiag)).toEqual([]);
  });
});

describe('a text node — the emit does NOT cross there, so neither does the editor', () => {
  it('keeps reporting the object, because that is what the build interpolates', () => {
    const diags = typecheckCorpus(corpusWith('<p>@data.body</p>', '<p>@titulo</p>'));

    expect(diags).toHaveLength(1);
    expect(diags[0]!.code).toBe(2345);
  });
});
