/**
 * The rest of `props<T>()` in the editor: `const { tone, ...resto } = props<T>()`.
 *
 * TypeScript already understands a rest in a destructuring; what has to hold is that the
 * projection does not get in its way. A component that gathers keys and reads them as
 * `@resto.x` checks clean, and a parent still has to hand it every REQUIRED key the rest
 * gathers — the contract is `T`, whatever the child names.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { typecheckCorpus } from './typecheck.js';

const FIXTURES = resolve(fileURLToPath(new URL('../fixtures', import.meta.url)));
const SLUG = 'blog/[slug].fud';
const BADGE = 'components/app-badge.fud';
const read = (path: string): string => readFileSync(resolve(FIXTURES, path), 'utf8');

/** `app-badge` naming `tone` and gathering the rest, read back in its template. */
const badge = read(BADGE)
  .replace(
    "const { tone = 'neutral' } = props<{ tone?: Tone }>();",
    "const { tone = 'neutral', ...resto } = props<{ tone?: Tone; placeholder?: string; required: boolean }>();",
  )
  .replace('><slot></slot></span>', ' title=@resto.placeholder>@resto.placeholder @(String(resto.required))<slot></slot></span>');

const withHost = (host: string): Record<string, string> => ({
  [BADGE]: badge,
  [SLUG]: read(SLUG).replace(/<app-badge [^>]*>/u, host),
});

describe('a component with a rest of props', () => {
  it('checks clean, its template reading the rest object', () => {
    expect(typecheckCorpus(withHost('<app-badge .tone="info" .required=@(true)>'))).toEqual([]);
  });

  it('a parent still owes it every required key the rest gathers', () => {
    const seen = typecheckCorpus(withHost('<app-badge .tone="info">')).filter((d) => d.sourceOffset !== undefined);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((d) => d.code === 2345 && d.message.includes("'required'"))).toBe(true);
  });
});
