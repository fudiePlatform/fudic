/**
 * SDD-29 §6.4 — the import, the namespace and the collision.
 *
 * The I/O is injected, as everywhere in this compiler: the files below are a map, not a
 * directory, and nothing here reads a disk.
 */

import { describe, expect, it } from 'vitest';
import { parseDocument } from '../../src/html/index.js';
import { atConstructs } from '../../src/constructs.js';
import { structureDocument } from '../../src/document/index.js';
import { SnippetRegistry, type SnippetScope } from '../../src/expand/index.js';
import type { Diagnostic, ResolveIo } from '../../src/types/index.js';

/** A filesystem that is an object: `resolve` normalizes `./x` against the file's directory. */
function io(files: Record<string, string>): ResolveIo {
  return {
    read(path) {
      const source = files[path];
      if (source === undefined) throw new Error(`no such file: ${path}`);
      return source;
    },
    resolve(fromPath, href) {
      if (!href.startsWith('.')) return `/node_modules/${href}`;
      const dir = fromPath.slice(0, fromPath.lastIndexOf('/'));
      return `${dir}/${href.replace(/^\.\//u, '')}`;
    },
  };
}

function scopeOf(
  files: Record<string, string>,
  entry = '/app/page.fud',
): { scope: SnippetScope; diagnostics: readonly Diagnostic[] } {
  const source = files[entry]!;
  const doc = structureDocument(source, parseDocument(source, { atConstructs }).value).value;
  const diagnostics: Diagnostic[] = [];
  const scope = new SnippetRegistry(io(files)).scopeOf(entry, source, doc, diagnostics);
  return { scope, diagnostics };
}

const UI = '@snippet card(title: string) { <article>@title</article> }\n@snippet badge() { <b></b> }';

describe('the scope of a file (§4.3)', () => {
  it('holds what the file declares itself', () => {
    const { scope, diagnostics } = scopeOf({ '/app/page.fud': UI });
    expect(diagnostics).toEqual([]);
    expect([...scope.global.keys()]).toEqual(['card', 'badge']);
  });

  it('holds every @snippet of an imported file, by name (criterion 16)', () => {
    const { scope, diagnostics } = scopeOf({
      '/app/page.fud': '<link rel="snippet" href="./ui.fud">',
      '/app/ui.fud': UI,
    });
    expect(diagnostics).toEqual([]);
    expect([...scope.global.keys()]).toEqual(['card', 'badge']);
    expect(scope.global.get('card')!.file).toBe('/app/ui.fud');
    expect(scope.global.get('card')!.params[0]!.name).toBe('title');
  });

  it('puts them under the namespace when `as` is written, and nowhere else (criterion 17)', () => {
    const { scope } = scopeOf({
      '/app/page.fud': '<link rel="snippet" href="./ui.fud" as="form">',
      '/app/ui.fud': UI,
    });
    expect(scope.global.size).toBe(0);
    expect([...scope.namespaced.get('form')!.keys()]).toEqual(['card', 'badge']);
  });

  it('resolves a package specifier the same way a component link does', () => {
    const { scope, diagnostics } = scopeOf({
      '/app/page.fud': '<link rel="snippet" href="@acme/ui/helpers.fud">',
      '/node_modules/@acme/ui/helpers.fud': UI,
    });
    expect(diagnostics).toEqual([]);
    expect(scope.global.has('card')).toBe(true);
  });
});

describe('the collision (§4.4)', () => {
  it('reports two imports that bring the same name (criterion 18, FUD0834)', () => {
    const { diagnostics } = scopeOf({
      '/app/page.fud': '<link rel="snippet" href="./a.fud">\n<link rel="snippet" href="./b.fud">',
      '/app/a.fud': '@snippet card() { <i></i> }',
      '/app/b.fud': '@snippet card() { <b></b> }',
    });
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0834']);
    // The span is on the SECOND import, and the first travels as the related location: the
    // author has to look at both to decide which one gets the `as`.
    expect(diagnostics[0]!.related).toHaveLength(1);
  });

  it('reports a name an import takes from the file that declares it', () => {
    const { diagnostics } = scopeOf({
      '/app/page.fud': '@snippet card() { <i></i> }\n<link rel="snippet" href="./a.fud">',
      '/app/a.fud': '@snippet card() { <b></b> }',
    });
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0834']);
    expect(diagnostics[0]!.related![0]!.file).toBe('/app/page.fud');
  });

  it('does not collide when one of the two is namespaced (criterion 19)', () => {
    const { scope, diagnostics } = scopeOf({
      '/app/page.fud': '<link rel="snippet" href="./a.fud">\n<link rel="snippet" href="./b.fud" as="form">',
      '/app/a.fud': '@snippet card() { <i></i> }',
      '/app/b.fud': '@snippet card() { <b></b> }',
    });
    expect(diagnostics).toEqual([]);
    expect(scope.global.get('card')!.file).toBe('/app/a.fud');
    expect(scope.namespaced.get('form')!.get('card')!.file).toBe('/app/b.fud');
  });
});

describe('an import that does not work (§4.3)', () => {
  it('reports an href that names no file (FUD0836)', () => {
    const { diagnostics } = scopeOf({ '/app/page.fud': '<link rel="snippet" href="./gone.fud">' });
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0836']);
  });

  it('reports an absent href (FUD0836)', () => {
    const { diagnostics } = scopeOf({ '/app/page.fud': '<link rel="snippet">' });
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0836']);
  });

  it('reports a file that declares no @snippet, and says so (FUD0836)', () => {
    const { diagnostics } = scopeOf({
      '/app/page.fud': '<link rel="snippet" href="./empty.fud">',
      '/app/empty.fud': '<app-card><template shadowrootmode="open"></template></app-card>',
    });
    expect(diagnostics[0]!.message).toContain('declares no @snippet');
  });

  it('reports a package the host cannot resolve, rather than letting it throw (FUD0836)', () => {
    const files = { '/app/page.fud': '<link rel="snippet" href="@acme/gone/ui.fud">' };
    const base = io(files);
    const throwing: ResolveIo = {
      read: (p) => base.read(p),
      resolve: () => {
        throw new Error('Cannot find package "@acme/gone"');
      },
    };
    const source = files['/app/page.fud'];
    const doc = structureDocument(source, parseDocument(source, { atConstructs }).value).value;
    const diagnostics: Diagnostic[] = [];
    new SnippetRegistry(throwing).scopeOf('/app/page.fud', source, doc, diagnostics);
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0836']);
  });

  it('ignores an interpolated `as`: a namespace is a name, not a value', () => {
    const { scope } = scopeOf({
      '/app/page.fud': '<link rel="snippet" href="./ui.fud" as="@computed">',
      '/app/ui.fud': UI,
    });
    expect(scope.namespaced.size).toBe(0);
    expect(scope.global.has('card')).toBe(true);
  });

  it('resolves a snippet body @render in the scope of the file that declares it (§4.6)', () => {
    const files = {
      '/app/page.fud': '<link rel="snippet" href="./ui.fud">',
      '/app/ui.fud': '<link rel="snippet" href="./atoms.fud">\n@snippet card() { @render badge() }',
      '/app/atoms.fud': '@snippet badge() { <b></b> }',
    };
    const source = files['/app/page.fud'];
    const doc = structureDocument(source, parseDocument(source, { atConstructs }).value).value;
    const registry = new SnippetRegistry(io(files));
    const scope = registry.scopeOf('/app/page.fud', source, doc, []);
    // The caller sees `card` and NOT `badge`: the import is one level, and what a snippet
    // uses inside is its own file's business.
    expect([...scope.global.keys()]).toEqual(['card']);
    const card = scope.global.get('card')!;
    expect([...card.scope().global.keys()]).toEqual(['card', 'badge']);
    // Memoized by file: asking twice is the same object, not a second parse of `atoms.fud`.
    expect(card.scope()).toBe(card.scope());
  });

  it('keeps the first of two declarations of one name: the second is FUD0834 already', () => {
    const { scope } = scopeOf({
      '/app/page.fud': '@snippet card() { <i></i> }\n@snippet card(x: string) { <b></b> }',
    });
    expect(scope.global.get('card')!.params).toEqual([]);
  });

  it('does not hang on a cycle of imports', () => {
    const { scope, diagnostics } = scopeOf({
      '/app/page.fud': '<link rel="snippet" href="./a.fud">',
      '/app/a.fud': '<link rel="snippet" href="./b.fud">\n@snippet a() { <i></i> }',
      '/app/b.fud': '<link rel="snippet" href="./a.fud">\n@snippet b() { <b></b> }',
    });
    expect(diagnostics).toEqual([]);
    expect([...scope.global.keys()]).toEqual(['a']);
    // And walking INTO the cycle terminates: `a` sees `b`, and `b`'s own scope — which sees
    // `a` again — is the one the guard cuts.
    const inner = scope.global.get('a')!.scope();
    expect([...inner.global.keys()]).toEqual(['a', 'b']);
    // And the step that closes it: `b`'s scope imports `a` back, which is already read.
    expect([...inner.global.get('b')!.scope().global.keys()]).toEqual(['b', 'a']);
  });
});
