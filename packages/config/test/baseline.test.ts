/**
 * SDD-83 §3.4: `baseline` in `fudic.json`. Criteria 15 and 16 on the reader.
 */

import { describe, expect, it } from 'vitest';
import {
  allowedFeatures,
  CONFIG_FILE,
  DEFAULT_BASELINE,
  readBaseline,
  readProjectConfig,
  type ConfigIo,
} from '../src/index.js';

const ROOT = '/p';

function io(text: string): ConfigIo {
  return { exists: (path) => path === `${ROOT}/${CONFIG_FILE}`, read: () => text };
}

const readText = (text: string) => readProjectConfig(ROOT, io(text));
const read = (baseline: unknown) => readText(`{"id":"shop","baseline":${JSON.stringify(baseline)}}`);

describe('baseline in fudic.json', () => {
  it('absent is widely, with nothing allowed (criterion 15)', () => {
    const result = readText('{"id":"shop"}');
    expect(result.diagnostics).toEqual([]);
    expect(result.config?.baseline).toEqual({ target: 'widely', allow: [] });
    expect(result.config?.baseline).toEqual(DEFAULT_BASELINE);
  });

  it('reads a level written short: widely, newly, or a year', () => {
    expect(read('widely').config?.baseline).toEqual({ target: 'widely', allow: [] });
    expect(read('newly').config?.baseline).toEqual({ target: 'newly', allow: [] });
    expect(read(2024).config?.baseline).toEqual({ target: 2024, allow: [] });
    expect(read(2015).config?.baseline.target).toBe(2015);
    expect(read(2026).config?.baseline.target).toBe(2026);
  });

  it('reads the object form, target widely when it has none', () => {
    expect(read({ target: 'newly', allow: ['popover', 'state'] }).config?.baseline).toEqual({
      target: 'newly',
      allow: [
        { id: 'popover', features: ['popover'] },
        { id: 'state', features: ['state'] },
      ],
    });
    expect(read({ allow: ['state'] }).config?.baseline.target).toBe('widely');
    expect(read({ target: 2024 }).config?.baseline).toEqual({ target: 2024, allow: [] });
  });

  it.each([
    [2014, '2014 is not "widely", "newly" or a year from 2015 to 2026'],
    ['pronto', '"pronto" is not "widely", "newly" or a year from 2015 to 2026'],
    [2027, '2027 is not "widely", "newly" or a year from 2015 to 2026'],
    [2024.5, '2024.5 is not "widely", "newly" or a year from 2015 to 2026'],
    [null, 'it is neither a level nor an object'],
    [true, 'it is neither a level nor an object'],
    [['widely'], 'it is neither a level nor an object'],
    [{ target: 'widely', only: [] }, '"only" is neither "target" nor "allow"'],
    [{ target: 'soon' }, '"target": "soon" is not "widely", "newly" or a year from 2015 to 2026'],
    [{ allow: 'popover' }, '"allow" is not an array'],
    [{ allow: ['popover', 3] }, '"allow" holds 3, which is not a feature id'],
  ])('%j is FUD0725 with the problem baseline, on the key (criterion 15)', (value, reason) => {
    const text = `{"id":"shop","baseline":${JSON.stringify(value)}}`;
    const result = readText(text);
    expect(result.config).toBeNull();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({ code: 'FUD0725', severity: 'error' });
    expect(result.diagnostics[0]?.message).toContain(reason);
    expect(result.diagnostics[0]?.span).toEqual({ start: text.indexOf('"baseline"'), end: text.indexOf('"baseline"') + 10 });
  });

  it('an id that is not a feature is FUD1527 on the id, and allows nothing (criterion 16)', () => {
    const text = '{"id":"shop","baseline":{"target":"widely","allow":["popover","nada"]}}';
    const result = readText(text);
    expect(result.config?.baseline.allow).toEqual([{ id: 'popover', features: ['popover'] }]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      code: 'FUD1527',
      severity: 'warning',
      file: CONFIG_FILE,
      span: { start: text.indexOf('"nada"'), end: text.indexOf('"nada"') + 6 },
    });
    expect(result.diagnostics[0]?.message).toBe('"nada" in "allow" is not a web-features id, so it allows nothing');
  });

  it('an id that moved is FUD1527 with where it went, and allows that (criterion 16)', () => {
    const result = read({ allow: ['masonry'] });
    expect(result.config?.baseline.allow).toEqual([{ id: 'masonry', features: ['grid-lanes'] }]);
    expect(result.diagnostics[0]?.message).toBe('"masonry" in "allow" is now "grid-lanes": it is allowed under that id');
  });

  it('an id that was split is FUD1527 with every part, and allows all of them', () => {
    const result = read({ allow: ['text-wrap-style'] });
    expect(allowedFeatures(result.config!.baseline)).toEqual(new Set(['text-wrap', 'text-wrap-balance', 'text-wrap-pretty']));
    expect(result.diagnostics[0]?.message).toBe(
      '"text-wrap-style" in "allow" was split into "text-wrap", "text-wrap-balance", "text-wrap-pretty": all of them are allowed',
    );
  });

  it('points FUD1527 at the id in allow, not at the same text elsewhere in the file', () => {
    const text = '{"id":"shop","prefix":"nada","baseline":{"allow":["nada"]}}';
    const result = readText(text);
    expect(result.diagnostics[0]?.span).toEqual({ start: text.lastIndexOf('"nada"'), end: text.lastIndexOf('"nada"') + 6 });
  });

  it('a FUD1527 is said even when another field makes the file unusable', () => {
    const result = readText('{"id":"Shop","baseline":{"allow":["nada"]}}');
    expect(result.config).toBeNull();
    expect(result.diagnostics.map((d) => d.code)).toEqual(['FUD0725', 'FUD1527']);
  });

  it('leaves a span out when the key or the id is written with escapes', () => {
    const escapedKey = readText('{"id":"shop","\\u0062aseline":2014}');
    expect(escapedKey.diagnostics[0]?.code).toBe('FUD0725');
    expect(escapedKey.diagnostics[0]?.span).toBeUndefined();
    const escapedAllow = readText('{"id":"shop","\\u0062aseline":{"\\u0061llow":["n\\u0061da"]}}');
    expect(escapedAllow.diagnostics[0]?.code).toBe('FUD1527');
    expect(escapedAllow.diagnostics[0]?.span).toBeUndefined();
  });

  it('readBaseline and allowedFeatures on their own', () => {
    expect(readBaseline(undefined, () => undefined)).toEqual({ baseline: DEFAULT_BASELINE, dropped: [] });
    expect(allowedFeatures(DEFAULT_BASELINE)).toEqual(new Set());
  });
});
