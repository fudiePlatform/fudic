/** `globalStyles` and `styles`: two maps of named sheets, and what resolving them costs. */

import { describe, expect, it } from 'vitest';
import { readProjectConfig, type ConfigIo } from '../src/read.js';
import { readProjectStyles } from '../src/styles.js';

/** An in-memory filesystem: present keys exist, everything else does not. */
function io(files: Record<string, string>): ConfigIo {
  return {
    exists: (path) => path in files,
    read: (path) => {
      const text = files[path];
      if (text === undefined) throw new Error(`no such file: ${path}`);
      return text;
    },
  };
}

const ROOT = '/p';
const configWith = (fields: Record<string, unknown>): Record<string, string> => ({
  '/p/fudic.json': JSON.stringify({ id: 'shop', ...fields }),
});

describe('the two maps', () => {
  it('are [] when absent', () => {
    const config = readProjectConfig(ROOT, io(configWith({}))).config;
    expect(config?.globalStyles).toEqual([]);
    expect(config?.styles).toEqual([]);
  });

  it('keep the declaration order, because the order is the cascade', () => {
    const files = configWith({ globalStyles: { b: 'b.css', a: 'a.css' }, styles: { panel: 'p.css' } });
    const config = readProjectConfig(ROOT, io(files)).config;
    expect(config?.globalStyles).toEqual([
      { name: 'b', path: 'b.css' },
      { name: 'a', path: 'a.css' },
    ]);
    expect(config?.styles).toEqual([{ name: 'panel', path: 'p.css' }]);
  });

  it('an array — the old shape — is FUD0725 and leaves no config at all', () => {
    const result = readProjectConfig(ROOT, io(configWith({ styles: ['theme.css'] })));
    expect(result.config).toBeNull();
    expect(result.diagnostics.map((d) => d.code)).toEqual(['FUD0725']);
    expect(result.diagnostics[0]?.message).toContain('globalStyles');
    expect(result.diagnostics[0]?.span).toBeDefined();
  });

  it('a name with a hyphen, or a path that is not a string, is the same verdict', () => {
    expect(readProjectConfig(ROOT, io(configWith({ styles: { 'a-b': 'x.css' } }))).config).toBeNull();
    expect(readProjectConfig(ROOT, io(configWith({ styles: { a: 7 } }))).config).toBeNull();
    expect(readProjectConfig(ROOT, io(configWith({ globalStyles: 'x.css' }))).config).toBeNull();
  });
});

describe('readProjectStyles', () => {
  it('resolves each entry to its name as specifier, the entry, a path and its CSS', () => {
    const result = readProjectStyles(
      ROOT,
      { globalStyles: [{ name: 'theme', path: 'src/theme.css' }], styles: [{ name: 'row', path: 'src/row.css' }] },
      io({ '/p/src/theme.css': ':host{--gap:8px}', '/p/src/row.css': '.row{display:flex}' }),
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.global).toEqual([
      { specifier: 'theme', entry: 'src/theme.css', path: '/p/src/theme.css', css: ':host{--gap:8px}' },
    ]);
    expect(result.optional).toEqual([
      { specifier: 'row', entry: 'src/row.css', path: '/p/src/row.css', css: '.row{display:flex}' },
    ]);
  });

  it('FUD0740 for a file that is not there, and for one that cannot be read', () => {
    const missing = readProjectStyles(ROOT, { globalStyles: [{ name: 't', path: 'src/theme.css' }], styles: [] }, io({}));
    expect(missing.global).toEqual([]);
    expect(missing.diagnostics.map((d) => d.code)).toEqual(['FUD0740']);

    const angry: ConfigIo = {
      exists: () => true,
      read: () => {
        throw new Error('EACCES');
      },
    };
    const unreadable = readProjectStyles(ROOT, { globalStyles: [], styles: [{ name: 't', path: 'x.css' }] }, angry);
    expect(unreadable.diagnostics[0]?.message).toContain('EACCES');
  });

  it('and when what it throws is not an Error, the message still says something', () => {
    const rude: ConfigIo = {
      exists: () => true,
      read: () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'nope';
      },
    };
    const result = readProjectStyles(ROOT, { globalStyles: [{ name: 't', path: 'x.css' }], styles: [] }, rude);
    expect(result.diagnostics[0]?.message).toContain('nope');
  });

  it('FUD0741 when a name is in both maps, and the global one wins', () => {
    const result = readProjectStyles(
      ROOT,
      { globalStyles: [{ name: 'theme', path: 'a.css' }], styles: [{ name: 'theme', path: 'b.css' }] },
      io({ '/p/a.css': '.a{}', '/p/b.css': '.b{}' }),
    );
    expect(result.global.map((s) => s.path)).toEqual(['/p/a.css']);
    expect(result.optional).toEqual([]);
    expect(result.diagnostics.map((d) => d.code)).toEqual(['FUD0741']);
  });
});
