/**
 * Every code's function, called once: it answers with its own code, the severity its `.md`
 * declares and the place it was given — and nothing of the data the message was composed
 * from leaks into the diagnostic.
 *
 * The parameters are a stand-in that answers every field: `span` with a span, anything else
 * with `['x']`, which a message can interpolate, `.join`, `.map` and measure. What each code
 * SAYS is asserted by the tests of the package that emits it; the branches a message takes
 * are in `branches.test.ts`.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as catalogue from '../src/index.js';
import { span, type FudDiagnostic } from '../src/index.js';

const codes = Object.entries(catalogue as Record<string, unknown>)
  .filter(([name]) => /^FUD\d{4}$/u.test(name))
  .map(([name, fn]) => [name, fn as (p: unknown) => FudDiagnostic] as const);

/** Answers every field, except the place: the place is what the test checks comes back. */
function anything(place: Record<string, unknown>): unknown {
  return new Proxy(place, {
    get: (target, key) => (key in target ? target[key as string] : ['x']),
    has: () => true,
  });
}

/** What the `.md` says the severity is. */
function declared(code: string): string {
  const md = readFileSync(new URL(`../src/codes/${code}.md`, import.meta.url), 'utf8');
  return /^\*\*(\w+)\*\*/mu.exec(md)![1]!;
}

const LOCATION = new Set(['severity', 'code', 'message', 'span', 'file', 'related']);

describe('every code', () => {
  it('is exported from the index, one function per code', () => {
    expect(codes.length).toBeGreaterThan(200);
    for (const [, fn] of codes) expect(typeof fn).toBe('function');
  });

  for (const [code, fn] of codes) {
    it(code, () => {
      const place = { span: span(3, 7), file: '/p/a.fud' };
      const d = fn(anything(place));

      expect(d.code).toBe(code);
      expect(d.severity).toBe(declared(code));
      // Not `message`: a code that picks its text by a discriminant has none for `['x']`.
      expect(Object.keys(d).filter((k) => !LOCATION.has(k))).toEqual([]);
      // A source or file code keeps the place it was given; a project code has none to keep.
      if ('span' in d) expect(d.span).toEqual(place.span);
      if ('file' in d) expect(d.file).toBe('/p/a.fud');
    });
  }
});
