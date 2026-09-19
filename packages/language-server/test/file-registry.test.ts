/**
 * The `FileRegistry` of SDD-23 over the index (SDD-24 §2, §4.5).
 *
 * What a tag resolves to is the href **as written**, because the virtual file imports it
 * verbatim: if the registry normalized the path, TypeScript and the editor would disagree
 * about which file a tag is.
 */

import { describe, expect, it } from 'vitest';
import type { SnippetImport } from '@fudic/language-core';
import { createFileRegistry } from '../src/file-registry.js';
import { parseFud } from '../src/parse.js';
import { WorkspaceIndex } from '../src/workspace-index.js';
import { component, LAYOUT, memoryFs, PAGE, route } from './_support.js';

const SLUG = '/p/blog/[slug].fud';

const WORKSPACE: Record<string, string> = {
  '/p/components/app-badge.fud': component('app-badge'),
  '/p/components/site-nav.fud': component('site-nav'),
  '/p/layouts/_layout.fud': LAYOUT,
  '/p/about.fud': PAGE,
};

function registryFor(path: string, source: string, extra: Readonly<Record<string, string>> = {}) {
  const files = { ...WORKSPACE, ...extra, [path]: source };
  const index = new WorkspaceIndex(memoryFs(files));
  index.scan('/p');

  return createFileRegistry(path, parseFud(source).document, index);
}

describe('component', () => {
  it('answers with the href the user wrote', () => {
    const registry = registryFor(
      SLUG,
      route('../layouts/_layout.fud', ['../components/app-badge.fud']),
    );

    expect(registry.component('app-badge')).toBe('../components/app-badge.fud');
  });

  it('does not answer for a tag this file never declared', () => {
    const registry = registryFor(
      SLUG,
      route('../layouts/_layout.fud', ['../components/app-badge.fud']),
    );

    // site-nav exists in the workspace, but not behind a <link> of THIS file.
    expect(registry.component('site-nav')).toBeUndefined();
  });

  it('leaves an href that points nowhere unresolved', () => {
    const registry = registryFor(SLUG, route('../layouts/_layout.fud', ['./ghost.fud']));

    expect(registry.component('ghost')).toBeUndefined();
  });

  it('ignores a link whose target defines no tag', () => {
    const registry = registryFor(SLUG, route('../layouts/_layout.fud', ['../about.fud']));

    expect(registry.component('about')).toBeUndefined();
  });

  it('ignores a <link rel="component"> with no href', () => {
    const source = `<link rel="layout" href="../layouts/_layout.fud">\n<link rel="component">\n<article>hi</article>\n`;
    const registry = registryFor(SLUG, source);

    expect(registry.component('app-badge')).toBeUndefined();
  });

  it('resolves the links of a component too, not only of a route', () => {
    const registry = registryFor('/p/components/app-card.fud', component('app-card', ['./app-badge.fud']));

    expect(registry.component('app-badge')).toBe('./app-badge.fud');
  });
});

describe('snippets (SDD-29 §4.3)', () => {
  const UI = '@snippet card(title: string) { <b>@title</b> }\n';

  /** A component that imports snippets, with `links` written verbatim. */
  const importing = (links: string): string =>
    `${links}\n<app-card>\n  <template shadowrootmode="open"><p>x</p></template>\n</app-card>\n`;

  const snippetsOf = (links: string): readonly SnippetImport[] =>
    registryFor('/p/components/app-card.fud', importing(links), {
      '/p/components/ui.fud': UI,
    }).snippets();

  it('answers with the href as written, and no namespace without `as`', () => {
    expect(snippetsOf('<link rel="snippet" href="./ui.fud">')).toEqual([{ href: './ui.fud' }]);
  });

  it('carries the namespace and the span of the `as` VALUE, not of the attribute', () => {
    const source = importing('<link rel="snippet" href="./ui.fud" as="form">');
    const [first, ...rest] = snippetsOf('<link rel="snippet" href="./ui.fud" as="form">');

    expect(rest).toEqual([]);
    expect(first!.namespace?.name).toBe('form');
    // Asserted by the text under it: hovering `form` in a `@render form.card(…)` has to land
    // on the four characters, never on `as="form"`.
    const span = first!.namespace!.span;
    expect(source.slice(span.start, span.end)).toBe('form');
  });

  it('keeps every import, in source order', () => {
    const links =
      '<link rel="snippet" href="./ui.fud">\n<link rel="snippet" href="./ui.fud" as="form">';
    expect(snippetsOf(links).map((s) => s.namespace?.name)).toEqual([undefined, 'form']);
  });

  it('skips an import with no href: there is nothing to import', () => {
    expect(snippetsOf('<link rel="snippet">')).toEqual([]);
  });

  it('treats an empty `as` as no namespace, which is what the compiler does', () => {
    expect(snippetsOf('<link rel="snippet" href="./ui.fud" as="">')).toEqual([
      { href: './ui.fud' },
    ]);
  });

  it('treats a dynamic `as` as no namespace: it names nothing at compile time', () => {
    expect(snippetsOf('<link rel="snippet" href="./ui.fud" as="@ns">')).toEqual([
      { href: './ui.fud' },
    ]);
  });

  it('is empty for a file that imports none', () => {
    expect(snippetsOf('')).toEqual([]);
  });
});

describe('layout', () => {
  it('is the href of the route', () => {
    const registry = registryFor(SLUG, route('../layouts/_layout.fud'));

    expect(registry.layout()).toBe('../layouts/_layout.fud');
  });

  it('is undefined for a file that declares none', () => {
    const registry = registryFor('/p/components/app-card.fud', component('app-card'));

    expect(registry.layout()).toBeUndefined();
  });
});
