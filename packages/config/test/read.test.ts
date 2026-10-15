import { describe, expect, it } from 'vitest';
import {
  CONFIG_FILE,
  readProjectConfig,
  type ConfigIo,
} from '../src/index.js';

const ROOT = '/p';
const PATH = `${ROOT}/${CONFIG_FILE}`;

function io(text: string): ConfigIo {
  return { exists: (path) => path === PATH, read: () => text };
}

/** An `io` whose `read` blows up — a directory, a permission, a racing delete. */
function throwingIo(error: unknown): ConfigIo {
  return {
    exists: () => true,
    read: () => {
      throw error;
    },
  };
}

describe('readProjectConfig', () => {
  it('reads the three fields and says nothing else (criterion 1)', () => {
    const result = readProjectConfig(ROOT, io('{"id":"shop","kind":"app","prefix":"shop"}'));

    expect(result.config).toEqual({ id: 'shop', kind: 'app', prefix: 'shop', globalStyles: [], styles: [] });
    expect(result.diagnostics).toEqual([]);
  });

  it('accepts kind "lib"', () => {
    const result = readProjectConfig(ROOT, io('{"kind":"lib"}'));

    expect(result.config?.kind).toBe('lib');
  });

  it('an absent file is legal and silent — zero diagnostics (criterion 2)', () => {
    const absent: ConfigIo = { exists: () => false, read: () => '' };

    expect(readProjectConfig(ROOT, absent)).toEqual({ config: null, diagnostics: [] });
  });

  it('fills the defaults of the fields that are not there (criterion 4)', () => {
    const result = readProjectConfig(ROOT, io('{}'));

    expect(result.config).toEqual({ id: '', kind: 'app', prefix: '', globalStyles: [], styles: [] });
    expect(result.diagnostics).toEqual([]);
  });

  describe('a broken file degrades and points at the field (criterion 3)', () => {
    it.each([
      ['broken JSON', '{'],
      ['an id that is not a string', '{"id":42}'],
      ['an id with capitals', '{"id":"Shop"}'],
      ['an unknown kind', '{"kind":"plugin"}'],
      ['a prefix carrying the hyphen', '{"prefix":"app-"}'],
    ])('%s leaves no config', (_case, text) => {
      const result = readProjectConfig(ROOT, io(text));

      expect(result.config).toBeNull();
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]?.code).toBe('FUD0725');
      expect(result.diagnostics[0]?.file).toBe(CONFIG_FILE);
    });

    it('names the guilty field in the message', () => {
      const result = readProjectConfig(ROOT, io('{"prefix":"app-"}'));

      expect(result.diagnostics[0]?.message).toContain('"prefix"');
    });

    it('spans the key, so the editor underlines the field and not the file', () => {
      const text = '{"id":"Shop"}';
      const result = readProjectConfig(ROOT, io(text));

      const span = result.diagnostics[0]?.span;
      expect(span).toEqual({ start: 1, end: 5 });
      expect(text.slice(span!.start, span!.end)).toBe('"id"');
    });

    it('finds the key even when the same text appears first as a value', () => {
      const text = '{"prefix":"id","id":42}';
      const result = readProjectConfig(ROOT, io(text));

      const span = result.diagnostics[0]?.span;
      expect(text.slice(span!.start, span!.end)).toBe('"id"');
      expect(span?.start).toBe(15);
    });

    it('tolerates whitespace between the key and its colon', () => {
      const result = readProjectConfig(ROOT, io('{"id" \t\r\n : 42}'));

      expect(result.diagnostics[0]?.span).toEqual({ start: 1, end: 5 });
    });

    it('carries no span when the key is spelled with escapes', () => {
      const result = readProjectConfig(ROOT, io('{"\\u006bind":"plugin"}'));

      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]?.span).toBeUndefined();
    });

    it('emits one diagnostic per guilty field', () => {
      const result = readProjectConfig(ROOT, io('{"id":"Shop","kind":"plugin","prefix":"A"}'));

      expect(result.diagnostics).toHaveLength(3);
    });

    it('does NOT rescue the good fields of a file with a bad one (§4.2)', () => {
      const result = readProjectConfig(ROOT, io('{"id":"shop","kind":"plugin"}'));

      expect(result.config).toBeNull();
    });

    it.each([
      ['null', 'null'],
      ['a number', '42'],
      ['an array', '[]'],
    ])('%s is not a project configuration', (_case, text) => {
      const result = readProjectConfig(ROOT, io(text));

      expect(result.config).toBeNull();
      expect(result.diagnostics[0]?.message).toContain('must be a JSON object');
    });
  });

  describe('an io that blows up is a diagnostic, never an exception (criterion 6)', () => {
    it('reports the reason of an Error', () => {
      const result = readProjectConfig(ROOT, throwingIo(new Error('EACCES')));

      expect(result.config).toBeNull();
      expect(result.diagnostics[0]?.code).toBe('FUD0725');
      expect(result.diagnostics[0]?.message).toContain('EACCES');
      expect(result.diagnostics[0]?.span).toBeUndefined();
    });

    it('reports something thrown that is not an Error', () => {
      const result = readProjectConfig(ROOT, throwingIo('boom'));

      expect(result.diagnostics[0]?.message).toContain('boom');
    });
  });

  describe('locales (SDD-58 criterion 1)', () => {
    it('is absent when the file does not declare it', () => {
      const result = readProjectConfig(ROOT, io('{"id":"shop"}'));

      expect(result.config).not.toHaveProperty('locales');
    });

    it('reads ["es", "en"] in written order', () => {
      const result = readProjectConfig(ROOT, io('{"id":"shop","locales":["es","en"]}'));

      expect(result.config).toEqual({
        id: 'shop',
        kind: 'app',
        prefix: '',
        globalStyles: [],
        styles: [],
        locales: ['es', 'en'],
      });
      expect(result.diagnostics).toEqual([]);
    });

    it('canonicalizes every tag', () => {
      const result = readProjectConfig(ROOT, io('{"locales":["EN-us","zh-hant-tw","ES"]}'));

      expect(result.config?.locales).toEqual(['en-US', 'zh-Hant-TW', 'es']);
    });

    it.each([
      ['an empty array', '[]', 'it is empty'],
      ['a repeated tag', '["es","es"]', '"es" is repeated'],
      ['a tag repeated only after canonicalization', '["es","ES"]', '"es" is repeated'],
      ['an invalid tag', '["xx-?"]', '"xx-?" is not a BCP 47 tag'],
      ['a non-string element', '["es",42]', '42 is not a BCP 47 tag'],
      ['a string instead of an array', '"es"', 'it is not an array'],
      ['an object instead of an array', '{"es":true}', 'it is not an array'],
      ['null', 'null', 'it is not an array'],
    ])('%s is FUD0725 problem locales and leaves no config', (_case, value, reason) => {
      const text = `{"id":"shop","locales":${value}}`;
      const result = readProjectConfig(ROOT, io(text));

      expect(result.config).toBeNull();
      expect(result.diagnostics).toHaveLength(1);
      const d = result.diagnostics[0]!;
      expect(d.code).toBe('FUD0725');
      expect(d.severity).toBe('error');
      expect(d.file).toBe(CONFIG_FILE);
      expect(d.message).toContain('"locales" must be a non-empty array of distinct BCP 47 tags');
      expect(d.message).toContain(reason);
      expect(text.slice(d.span!.start, d.span!.end)).toBe('"locales"');
    });

    it('a bad locales does not rescue the other fields, and adds to their diagnostics', () => {
      const result = readProjectConfig(ROOT, io('{"id":"Shop","locales":[]}'));

      expect(result.config).toBeNull();
      expect(result.diagnostics).toHaveLength(2);
    });
  });

  describe('site (SDD-58 criterion 37)', () => {
    it('is absent when the file does not declare it', () => {
      expect(readProjectConfig(ROOT, io('{"id":"shop"}')).config).not.toHaveProperty('site');
    });

    it.each([
      ['https://example.com', 'https://example.com'],
      ['https://Example.COM/', 'https://example.com'],
      ['http://localhost:4173', 'http://localhost:4173'],
      ['https://example.com:443', 'https://example.com'],
    ])('reads %s as the origin %s', (value, origin) => {
      expect(readProjectConfig(ROOT, io(`{"site":"${value}"}`)).config?.site).toBe(origin);
    });

    it.each([
      ['a number', '42', '42 is not a URL'],
      ['a relative path', '"/es"', '"/es" is not a URL'],
      ['another protocol', '"ftp://example.com"', '"ftp:" is not http or https'],
      ['a path', '"https://example.com/app"', 'it has a path'],
      ['a query', '"https://example.com/?a=1"', 'it has a path'],
      ['a fragment', '"https://example.com/#x"', 'it has a path'],
    ])('%s is FUD0725 problem site and leaves no config', (_case, value, reason) => {
      const text = `{"id":"shop","site":${value}}`;
      const result = readProjectConfig(ROOT, io(text));

      expect(result.config).toBeNull();
      const d = result.diagnostics[0]!;
      expect(d.code).toBe('FUD0725');
      expect(d.message).toContain('"site" must be the origin of an http(s) URL');
      expect(d.message).toContain(reason);
      expect(text.slice(d.span!.start, d.span!.end)).toBe('"site"');
    });
  });
});
