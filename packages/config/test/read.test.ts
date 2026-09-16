import { describe, expect, it } from 'vitest';
import {
  CONFIG_FILE,
  FUD_CONFIG_MALFORMED,
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

    expect(result.config).toEqual({ id: 'shop', kind: 'app', prefix: 'shop', styles: [] });
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

    expect(result.config).toEqual({ id: '', kind: 'app', prefix: '', styles: [] });
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
      expect(result.diagnostics[0]?.code).toBe(FUD_CONFIG_MALFORMED);
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
      expect(result.diagnostics[0]?.code).toBe(FUD_CONFIG_MALFORMED);
      expect(result.diagnostics[0]?.message).toContain('EACCES');
      expect(result.diagnostics[0]?.span).toBeUndefined();
    });

    it('reports something thrown that is not an Error', () => {
      const result = readProjectConfig(ROOT, throwingIo('boom'));

      expect(result.diagnostics[0]?.message).toContain('boom');
    });
  });
});
