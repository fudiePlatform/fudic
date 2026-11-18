/**
 * SDD-86 §3.3 — the three codes of the lifecycle hooks: their title and severity as the spec
 * names them, and a message that names the hook the author wrote.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FUD1560, FUD1561, FUD1562, span } from '../src/index.js';

const S = span(10, 24);

function title(code: string): string {
  const md = readFileSync(new URL(`../src/codes/${code}.md`, import.meta.url), 'utf8');
  return /^# (FUD\d{4}) — (.+)$/mu.exec(md)!.slice(1).join(' — ');
}

describe('SDD-86 §3.3 — titles and severity', () => {
  it.each([
    ['FUD1560', 'FUD1560 — Lifecycle hook outside the top level of `@code`'],
    ['FUD1561', 'FUD1561 — A create hook in a file that is never created'],
    ['FUD1562', 'FUD1562 — A declaration hides a lifecycle hook'],
  ])('%s', (code, expected) => {
    expect(title(code)).toBe(expected);
  });

  it('all three are errors and keep the span they are given', () => {
    for (const d of [
      FUD1560({ span: S, hook: 'afterHydrate' }),
      FUD1561({ span: S, hook: 'afterCreate', role: 'page' }),
      FUD1562({ span: S, name: 'onConnect' }),
    ]) {
      expect(d.severity).toBe('error');
      expect(d.span).toEqual(S);
    }
  });
});

describe('SDD-86 §3.3 — the message names what the author wrote', () => {
  it('FUD1560 names the hook and says where it goes', () => {
    const { message } = FUD1560({ span: S, hook: 'onDispose' });
    expect(message).toMatch(/^onDispose\(…\)/u);
    expect(message).toContain('top level of @code');
  });

  it('FUD1561 names the hook, the file and the hydrate hook to use instead', () => {
    const { message } = FUD1561({ span: S, hook: 'beforeCreate', role: 'page' });
    expect(message).toContain('beforeCreate never runs in a page');
    expect(message).toContain('use beforeHydrate');
  });

  it('FUD1562 names the hidden hook', () => {
    expect(FUD1562({ span: S, name: 'afterHydrate' }).message).toMatch(/^afterHydrate is a lifecycle hook/u);
  });
});
