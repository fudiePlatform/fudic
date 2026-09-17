/** SDD-42 §3.1, §4.3 and criterion 10: the `styles` field, and what resolving it costs. */

import { describe, expect, it } from 'vitest';
import { readProjectConfig, type ConfigIo } from '../src/read.js';
import { readProjectStyles, specifierOf } from '../src/styles.js';
import { FUD_CONFIG_MALFORMED, FUD_STYLE_NOT_FOUND, FUD_STYLE_SPECIFIER_CLASH } from '../src/diagnostics.js';

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
const configWith = (styles: unknown): Record<string, string> => ({
  '/p/fudic.json': JSON.stringify({ id: 'shop', ...(styles === undefined ? {} : { styles }) }),
});

describe('the `styles` field', () => {
  it('is [] when absent — which is every project that existed before SDD-42', () => {
    expect(readProjectConfig(ROOT, io(configWith(undefined))).config?.styles).toEqual([]);
  });

  it('keeps the declaration order, because the order is the cascade', () => {
    const files = configWith(['b.css', 'a.css']);
    expect(readProjectConfig(ROOT, io(files)).config?.styles).toEqual(['b.css', 'a.css']);
  });

  it('a non-array is FUD0720 and leaves no config at all', () => {
    const result = readProjectConfig(ROOT, io(configWith('theme.css')));
    expect(result.config).toBeNull();
    expect(result.diagnostics.map((d) => d.code)).toEqual([FUD_CONFIG_MALFORMED]);
    // The span underlines the key, so the editor points at the field and not the file.
    expect(result.diagnostics[0]?.span).toBeDefined();
  });

  it('an array with something that is not a string is the same verdict', () => {
    const result = readProjectConfig(ROOT, io(configWith(['a.css', 7])));
    expect(result.config).toBeNull();
    expect(result.diagnostics.map((d) => d.code)).toEqual([FUD_CONFIG_MALFORMED]);
  });
});

describe('specifierOf', () => {
  it('is `_` plus the basename, which cannot collide with a tag', () => {
    expect(specifierOf('src/styles/theme.css')).toBe('_theme');
    expect(specifierOf('theme.css')).toBe('_theme');
    expect(specifierOf('src\\styles\\theme.css')).toBe('_theme');
  });

  it('keeps a name that has no extension, and a dotfile is its own name', () => {
    expect(specifierOf('src/theme')).toBe('_theme');
    expect(specifierOf('.theme')).toBe('_.theme');
  });
});

describe('readProjectStyles', () => {
  it('resolves each entry to a specifier, the entry, a path and its CSS, in order', () => {
    const result = readProjectStyles(
      ROOT,
      ['src/theme.css', 'src/layout.css'],
      io({ '/p/src/theme.css': ':host{--gap:8px}', '/p/src/layout.css': '.row{display:flex}' }),
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.styles).toEqual([
      {
        specifier: '_theme',
        entry: 'src/theme.css',
        path: '/p/src/theme.css',
        css: ':host{--gap:8px}',
      },
      {
        specifier: '_layout',
        entry: 'src/layout.css',
        path: '/p/src/layout.css',
        css: '.row{display:flex}',
      },
    ]);
  });

  it('FUD0740 for a file that is not there, with the path as written', () => {
    const result = readProjectStyles(ROOT, ['src/theme.css'], io({}));
    expect(result.styles).toEqual([]);
    expect(result.diagnostics.map((d) => d.code)).toEqual([FUD_STYLE_NOT_FOUND]);
    expect(result.diagnostics[0]?.message).toContain('"src/theme.css"');
  });

  it('FUD0740 as well when it exists and cannot be read: the project loses the sheet, not the build', () => {
    const angry: ConfigIo = {
      exists: () => true,
      read: () => {
        throw new Error('EACCES');
      },
    };
    const result = readProjectStyles(ROOT, ['src/theme.css'], angry);
    expect(result.styles).toEqual([]);
    expect(result.diagnostics[0]?.code).toBe(FUD_STYLE_NOT_FOUND);
    expect(result.diagnostics[0]?.message).toContain('EACCES');
  });

  it('and when what it throws is not an Error, the message still says something', () => {
    const rude: ConfigIo = {
      exists: () => true,
      read: () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'nope';
      },
    };
    const result = readProjectStyles(ROOT, ['src/theme.css'], rude);
    expect(result.diagnostics[0]?.message).toContain('nope');
  });

  it('FUD0741 when two entries claim the same specifier, and the first one wins', () => {
    const result = readProjectStyles(
      ROOT,
      ['a/theme.css', 'b/theme.css'],
      io({ '/p/a/theme.css': '.a{}', '/p/b/theme.css': '.b{}' }),
    );
    expect(result.styles.map((s) => s.path)).toEqual(['/p/a/theme.css']);
    expect(result.diagnostics.map((d) => d.code)).toEqual([FUD_STYLE_SPECIFIER_CLASH]);
    // Both paths in the message: renaming one is the repair, and the author picks which.
    expect(result.diagnostics[0]?.message).toContain('"b/theme.css"');
    expect(result.diagnostics[0]?.message).toContain('"a/theme.css"');
  });

  it('no entries is no work and no diagnostics', () => {
    expect(readProjectStyles(ROOT, [], io({}))).toEqual({ styles: [], diagnostics: [] });
  });
});
