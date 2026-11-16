/**
 * SDD-83 §8.2.2: the catalogue as data says what the folder says. A code added or retired
 * without regenerating the table fails here, with the command that fixes it.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { codeInfo, liveCodes } from '../src/index.js';

const CODES = new URL('../src/codes/', import.meta.url);
const md = readdirSync(CODES).filter((f) => f.endsWith('.md')).sort();
const FIX = 'run `pnpm --filter @fudic/diagnostics catalog`';

describe('codeInfo agrees with every .md', () => {
  it('has an entry for every code of the folder, and only for those', () => {
    const live = liveCodes().map((c) => c.code);
    const retired = md.map((f) => f.slice(0, -3)).filter((code) => !live.includes(code as never));
    expect(retired.every((code) => codeInfo(code) !== undefined && 'retired' in codeInfo(code)!), FIX).toBe(true);
    expect(live.length + retired.length, FIX).toBe(md.length);
  });

  for (const name of md) {
    const code = name.slice(0, -3);
    it(code, () => {
      const [head, status] = readFileSync(new URL(name, CODES), 'utf8').replace(/\r\n/gu, '\n').split('\n');
      const info = codeInfo(code);
      expect(info?.title, FIX).toBe(head!.replace(/^# FUD\d{4} — /u, ''));
      const severity = /^\*\*(\w+)\*\*$/u.exec(status!)![1];
      if (severity === 'retired') expect(info && 'retired' in info, FIX).toBe(true);
      else expect(info && 'severity' in info ? info.severity : undefined, FIX).toBe(severity);
    });
  }
});

describe('codeInfo', () => {
  it('a live code: severity and title', () => {
    expect(codeInfo('FUD1380')).toEqual({ code: 'FUD1380', title: 'Event binding inside a loop', severity: 'warning' });
  });

  it('a retired code: what replaced it', () => {
    expect(codeInfo('FUD0050')).toEqual({
      code: 'FUD0050',
      title: 'Closing tag does not match',
      retired: true,
      replacedBy: ['FUD0052', 'FUD0051'],
    });
  });

  it('a code fudic never had, and a name that is not one', () => {
    expect(codeInfo('FUD9999')).toBeUndefined();
    expect(codeInfo('toString')).toBeUndefined();
  });

  it('liveCodes in numeric order', () => {
    const codes = liveCodes().map((c) => c.code);
    expect(codes).toEqual([...codes].sort());
  });
});
