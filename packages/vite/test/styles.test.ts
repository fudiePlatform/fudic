/**
 * SDD-42 criterion 11: the host reads the project's stylesheets, and the compiler does not.
 *
 * The second half is the one worth a test, because it is an invariant and not a behaviour:
 * the emit is handed `{ specifier, css }` and has nothing to open. It is measured the way
 * the spec asks — with a `ResolveIo` that throws the moment anyone asks it for a `.css`.
 */

import { describe, expect, it } from 'vitest';
import { resolveComponents, emitPageModule, type ResolveIo } from '@fudic/compiler';
import { FUD_STYLE_NOT_FOUND, FUD_STYLE_SPECIFIER_CLASH, type ConfigIo } from '@fudic/config';
import { readStyles } from '../src/styles.js';

function io(files: Record<string, string>): ConfigIo {
  return {
    exists: (path) => path in files,
    read: (path) => files[path]!,
  };
}

const CONFIG = { id: 'shop', kind: 'app', prefix: 'shop', styles: [] } as const;

describe('readStyles', () => {
  it('is empty for a project with no fudic.json at all', () => {
    expect(readStyles('/p', null, io({}))).toEqual({ styles: [], errors: [] });
  });

  it('is empty for a project whose fudic.json declares no styles', () => {
    expect(readStyles('/p', CONFIG, io({}))).toEqual({ styles: [], errors: [] });
  });

  it('hands the emit a specifier and CSS, and nothing else — no path travels on', () => {
    const result = readStyles(
      '/p',
      { ...CONFIG, styles: ['src/theme.css'] },
      io({ '/p/src/theme.css': ':host{--gap:8px}' }),
    );
    expect(result.styles).toEqual([{ specifier: '_theme', css: ':host{--gap:8px}' }]);
    expect(result.errors).toEqual([]);
  });

  it('surfaces the missing sheet as an error, not a warning', () => {
    const result = readStyles('/p', { ...CONFIG, styles: ['src/theme.css'] }, io({}));
    expect(result.styles).toEqual([]);
    expect(result.errors.map((d) => d.code)).toEqual([FUD_STYLE_NOT_FOUND]);
  });

  it('surfaces a specifier clash the same way', () => {
    const result = readStyles(
      '/p',
      { ...CONFIG, styles: ['a/theme.css', 'b/theme.css'] },
      io({ '/p/a/theme.css': '.a{}', '/p/b/theme.css': '.b{}' }),
    );
    expect(result.errors.map((d) => d.code)).toEqual([FUD_STYLE_SPECIFIER_CLASH]);
  });
});

describe('the compiler never opens a stylesheet', () => {
  const FILES: Record<string, string> = {
    '/home.fud':
      '<!DOCTYPE html>\n<html><head><link rel="component" href="./s-card.fud">' +
      '<title>t</title></head><body><s-card></s-card></body></html>',
    '/s-card.fud':
      '<head><style>.card{padding:8px}</style></head>\n' +
      '<s-card><template shadowrootmode="open"><slot></slot></template></s-card>',
  };

  /** Reads `.fud` and refuses everything else, loudly. */
  function strictIo(): { io: ResolveIo; asked: string[] } {
    const asked: string[] = [];
    return {
      asked,
      io: {
        read: (path) => {
          asked.push(path);
          if (path.endsWith('.css')) {
            throw new Error(`the compiler asked for a stylesheet: ${path}`);
          }
          return FILES[path]!;
        },
        resolve: (from, href) => {
          const base = from.slice(0, from.lastIndexOf('/') + 1);
          return (base + href).replace('/./', '/');
        },
      },
    };
  }

  it('emits a page handed project styles without asking anyone for a file', () => {
    const { io: resolveIo, asked } = strictIo();
    const graph = resolveComponents('/home.fud', resolveIo);
    const code = emitPageModule(graph, {
      projectStyles: [{ specifier: '_theme', css: ':host{--gap:8px}' }],
    });
    expect(code).not.toBe('');
    // Two `.fud` and nothing else. The sheet arrived READ, through the options.
    expect(asked).toEqual(['/home.fud', '/s-card.fud']);
  });
});
