/**
 * SDD-83 §3.1, §3.3: `diagnostics` in `fudic.json`, and the project a file obeys.
 * Criteria 1–6 on the reader.
 */

import { describe, expect, it } from 'vitest';
import { CONFIG_FILE, ProjectPolicies, readProjectConfig, type ConfigIo, type ProjectConfig } from '../src/index.js';

const ROOT = '/p';

function io(text: string): ConfigIo {
  return { exists: (path) => path === `${ROOT}/${CONFIG_FILE}`, read: () => text };
}

const read = (diagnostics: unknown, extra = '') =>
  readProjectConfig(ROOT, io(`{"id":"shop"${extra},"diagnostics":${JSON.stringify(diagnostics)}}`));

describe('diagnostics in fudic.json', () => {
  it('absent is an empty policy: every code as it is', () => {
    expect(readProjectConfig(ROOT, io('{"id":"shop"}')).config?.diagnostics).toEqual({ codes: new Map() });
  });

  it('a code and warnings, each read as written (criteria 1–3)', () => {
    const result = read({ FUD1380: 'off', FUD1022: 'error', warnings: 'error' });
    expect(result.diagnostics).toEqual([]);
    expect(result.config?.diagnostics).toEqual({
      codes: new Map([
        ['FUD1380', 'off'],
        ['FUD1022', 'error'],
      ]),
      warnings: 'error',
    });
  });

  it('raising an info or a warning, and an error left an error, are fine', () => {
    expect(read({ FUD0480: 'error', FUD1380: 'hint', FUD0051: 'error' }).diagnostics).toEqual([]);
  });

  it('lowering an error is FUD1521 on its key, and the rest still applies (criterion 4)', () => {
    const text = '{"id":"shop","diagnostics":{"FUD1380":"off","FUD0051":"off"}}';
    const result = readProjectConfig(ROOT, io(text));
    const at = text.indexOf('"FUD0051"');
    expect(result.diagnostics).toEqual([
      {
        severity: 'error',
        code: 'FUD1521',
        message: '"FUD0051": "off" does not apply: FUD0051 is an error, and an error cannot be lowered',
        file: CONFIG_FILE,
        span: { start: at, end: at + '"FUD0051"'.length },
      },
    ]);
    expect(result.config?.diagnostics.codes).toEqual(new Map([['FUD1380', 'off']]));
  });

  it('an unknown code is FUD1520; a retired one names what replaced it (criterion 5)', () => {
    const result = read({ FUD9999: 'off', FUD0050: 'off' });
    expect(result.diagnostics.map((d) => [d.code, d.severity, d.message])).toEqual([
      ['FUD1520', 'warning', 'FUD9999 is not a fudic code, so its entry in "diagnostics" does nothing'],
      ['FUD1520', 'warning', 'FUD0050 is retired: it was replaced by FUD0052, FUD0051, so its entry in "diagnostics" does nothing'],
    ]);
    expect(result.config?.diagnostics.codes.size).toBe(0);
  });

  it('a key spelled with escapes has no span, and is still refused', () => {
    const result = readProjectConfig(ROOT, io('{"diagnostics":{"FUD\\u0039999":"off"}}'));
    expect(result.diagnostics).toEqual([expect.objectContaining({ code: 'FUD1520', file: CONFIG_FILE })]);
    expect(result.diagnostics[0]).not.toHaveProperty('span');
  });

  it('a "diagnostics" spelled with escapes: its keys are looked for from the start', () => {
    const text = '{"diagnostic\\u0073":{"FUD9999":"off"}}';
    const at = text.indexOf('"FUD9999"');
    expect(readProjectConfig(ROOT, io(text)).diagnostics[0]?.span).toEqual({ start: at, end: at + 9 });
  });

  it('the key is found inside "diagnostics", not where the same text appears earlier', () => {
    const text = '{"prefix":"x","styles":{"FUD1380":"a.css"},"diagnostics":{"FUD9999":"off"}}';
    const result = readProjectConfig(ROOT, io(text));
    const at = text.indexOf('"FUD9999"');
    expect(result.diagnostics.find((d) => d.code === 'FUD1520')?.span).toEqual({ start: at, end: at + 9 });
  });

  describe('a malformed field is FUD0725, and the file has no configuration (criterion 6)', () => {
    const cases: readonly [unknown, string][] = [
      [[], 'it is not an object'],
      ['error', 'it is not an object'],
      [null, 'it is not an object'],
      [{ FUD1380: 'loud' }, '"FUD1380" is "loud"'],
      [{ FUD1380: 3 }, '"FUD1380" is 3'],
      [{ warning: 'error' }, '"warning" is neither a code ("FUD" and four digits) nor "warnings"'],
    ];
    for (const [value, reason] of cases) {
      it(JSON.stringify(value), () => {
        const result = read(value);
        expect(result.config).toBeNull();
        expect(result.diagnostics).toEqual([
          expect.objectContaining({ code: 'FUD0725', message: expect.stringContaining(`"diagnostics" must be`) }),
        ]);
        expect(result.diagnostics[0]!.message.endsWith(reason)).toBe(true);
        expect(result.diagnostics[0]!.span).toBeDefined();
      });
    }
  });

  it('an entry it dropped is said even when another field breaks the file', () => {
    const result = read({ FUD9999: 'off' }, ',"kind":"neither"');
    expect(result.config).toBeNull();
    expect(result.diagnostics.map((d) => d.code)).toEqual(['FUD0725', 'FUD1520']);
  });
});

describe('ProjectPolicies: the nearest fudic.json above a file (§3.3)', () => {
  const files: Record<string, string> = {
    '/w/apps/shop/fudic.json': '{"id":"shop","diagnostics":{"FUD1380":"off"}}',
    '/w/libs/ui/fudic.json': '{"kind":"lib"}',
    '/w/broken/fudic.json': '{',
  };
  const seen: string[] = [];
  const fs: ConfigIo = {
    exists: (path) => {
      seen.push(path);
      return path in files;
    },
    read: (path) => files[path]!,
  };
  const configOf = (root: string): ProjectConfig | null => readProjectConfig(root, fs).config;

  it('a file obeys the project above it, however deep', () => {
    const policies = new ProjectPolicies(fs, configOf);
    expect(policies.projectOf('/w/apps/shop/src/components/a.fud')?.root).toBe('/w/apps/shop');
    expect(policies.policyOf('/w/apps/shop/src/a.fud')?.codes.get('FUD1380')).toBe('off');
    expect(policies.policyOf('/w/libs/ui/card.fud')).toEqual({ codes: new Map() });
  });

  it('Windows paths are read with forward slashes', () => {
    const policies = new ProjectPolicies(fs, configOf);
    expect(policies.projectOf('\\w\\apps\\shop\\src\\a.fud')?.root).toBe('/w/apps/shop');
  });

  it('no project, no policy; a fudic.json that does not read is a project without one', () => {
    const policies = new ProjectPolicies(fs, configOf);
    expect(policies.projectOf('/elsewhere/a.fud')).toBeNull();
    expect(policies.policyOf('/elsewhere/a.fud')).toBeNull();
    expect(policies.projectOf('/w/broken/a.fud')).toEqual({ root: '/w/broken', config: null });
    expect(policies.policyOf('/w/broken/a.fud')).toBeNull();
  });

  it('every folder is asked once, until clear', () => {
    const policies = new ProjectPolicies(fs, configOf);
    seen.length = 0;
    policies.projectOf('/w/apps/shop/src/a.fud');
    const first = seen.length;
    policies.projectOf('/w/apps/shop/src/b.fud');
    policies.projectOf('/w/apps/shop/src/deeper/c.fud');
    expect(seen.length).toBe(first + 1);
    policies.clear();
    policies.projectOf('/w/apps/shop/src/a.fud');
    expect(seen.length).toBe(first * 2 + 1);
  });
});
