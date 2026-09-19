/**
 * SDD-29 §6.1, §6.3 and §6.5 — the expansion.
 *
 * What is asserted is the TEXT that comes out, because the text is the contract: the
 * expansion writes what the author would have written, and everything downstream parses that
 * and never learns a snippet was involved.
 */

import { describe, expect, it } from 'vitest';
import { parseDocument } from '../../src/html/index.js';
import { atConstructs } from '../../src/constructs.js';
import { structureDocument } from '../../src/document/index.js';
import { expandDocument, type Expansion } from '../../src/expand/index.js';
import { documentRoots } from '../../src/semantic/index.js';
import type { HtmlContent } from '../../src/html/index.js';
import type { ResolveIo } from '../../src/types/index.js';

function io(files: Record<string, string>): ResolveIo {
  return {
    read(path) {
      const source = files[path];
      if (source === undefined) throw new Error(`no such file: ${path}`);
      return source;
    },
    resolve(fromPath, href) {
      const dir = fromPath.slice(0, fromPath.lastIndexOf('/'));
      return `${dir}/${href.replace(/^\.\//u, '')}`;
    },
  };
}

const ENTRY = '/app/page.fud';

function expand(files: Record<string, string>): Expansion {
  const source = files[ENTRY]!;
  const doc = structureDocument(source, parseDocument(source, { atConstructs }).value).value;
  return expandDocument(ENTRY, source, doc, io(files));
}

/** A component, since a `@render` lives in markup and markup lives inside the host wrapper. */
const component = (body: string, head = ''): string =>
  `${head}<app-page><template shadowrootmode="open">${body}</template></app-page>`;

/** Every node type the expanded tree holds, depth-first — the shape criterion 3 is about. */
function types(nodes: readonly HtmlContent[], out: string[] = []): readonly string[] {
  for (const node of nodes) {
    out.push(node.type);
    const children = (node as { children?: readonly HtmlContent[] }).children;
    if (children) types(children, out);
  }
  return out;
}

describe('the expansion writes the markup in place (§4.8)', () => {
  it('replaces the call with the body and drops the declaration (criterion 2)', () => {
    const { source } = expand({
      [ENTRY]: `@snippet card(title: string) { <article><h2>@title</h2></article> }\n${component('@render card("Hola")')}`,
    });
    expect(source).toContain('<article><h2>@("Hola")</h2></article>');
    expect(source).not.toContain('@snippet');
    expect(source).not.toContain('@render');
  });

  it('leaves no SnippetDecl and no RenderCall in the tree (criterion 3)', () => {
    const { document } = expand({
      [ENTRY]: `@snippet card(title: string) { <article>@title</article> }\n${component('@render card("A")')}`,
    });
    expect(document.snippets).toEqual([]);
    const shape = types(documentRoots(document));
    expect(shape).not.toContain('render');
    expect(shape).not.toContain('snippet');
    expect(shape).toContain('element');
  });

  it('is the same tree as the markup written by hand (criterion 4)', () => {
    const viaSnippet = expand({
      [ENTRY]: `@snippet card(title: string) { <article class="card"><h2>@title</h2></article> }\n${component('<div>@render card(data.title)</div>')}`,
    });
    const byHand = component('<div><article class="card"><h2>@data.title</h2></article></div>');
    // Not merely the same shape: the same TEXT, because the substitution of a plain chain
    // keeps the implicit form (§4.10).
    expect(viaSnippet.source).toContain(
      '<div><article class="card"><h2>@data.title</h2></article></div>',
    );
    expect(byHand).toContain('<div><article class="card"><h2>@data.title</h2></article></div>');
  });

  it('uses the default of a parameter the call leaves out (criterion 5)', () => {
    const { source } = expand({
      [ENTRY]: `@snippet card(variant: 'a' | 'b' = 'a') { <i class="@variant"></i> }\n${component('@render card()')}`,
    });
    expect(source).toContain(`<i class="@('a')"></i>`);
  });

  it('writes undefined for an optional parameter nobody fills (criterion 6)', () => {
    const { source } = expand({
      [ENTRY]: `@snippet card(sub?: string) { <i>@sub</i> }\n${component('@render card()')}`,
    });
    expect(source).toContain('<i>@(undefined)</i>');
  });

  it('substitutes every read of a parameter, not only the first', () => {
    const { source } = expand({
      [ENTRY]: `@snippet card(t: string) { <i title="@t">@t</i> }\n${component('@render card("A")')}`,
    });
    expect(source).toContain('<i title="@("A")">@("A")</i>');
  });

  it('removes several declarations, wherever in the file they were written', () => {
    const { source } = expand({
      [ENTRY]: `@snippet b(t: string) { <b>@t</b> }\n${component('@render a()@render b("B")')}\n@snippet a() { <i></i> }`,
    });
    expect(source).not.toContain('@snippet');
    expect(source).toContain('<i></i><b>@("B")</b>');
  });

  it('does not expand a call written inside a nested declaration', () => {
    const { source } = expand({
      [ENTRY]: `@snippet outer(t: string) { <i>@t</i>@snippet inner() { @render outer("no") } }\n${component('@render outer("A")')}`,
    });
    // The nested declaration is illegal (FUD0824) and its body is markup nobody renders: it
    // travels as written, and the call inside it is not expanded.
    expect(source).toContain('@render outer("no")');
  });

  it('does not touch a member that merely shares the name of a parameter', () => {
    const { source } = expand({
      [ENTRY]: `@snippet card(t: string) { <i>@data.t</i> }\n${component('@render card("A")')}`,
    });
    expect(source).toContain('<i>@data.t</i>');
  });

  it('does not touch a name a lambda of the body declares', () => {
    const { source } = expand({
      [ENTRY]: `@snippet card(t: string) { <i .on="@((t) => t)"></i> }\n${component('@render card("A")')}`,
    });
    expect(source).toContain('.on="@((t) => t)"');
  });

  it('keeps the chain that follows a substituted head, in explicit form (§4.10)', () => {
    const { source } = expand({
      [ENTRY]: `@snippet card(t: string) { <i>@t.length</i> }\n${component('@render card(p.title)')}`,
    });
    expect(source).toContain('<i>@((p.title).length)</i>');
  });

  it('survives a construct whose header holds no JS at all', () => {
    const { source } = expand({
      [ENTRY]: `@snippet card(t: string) { @if () { <i>@t</i> } }\n${component('@render card("A")')}`,
    });
    expect(source).toContain('<i>@("A")</i>');
  });

  it('parenthesizes an argument that is not a chain', () => {
    const { source } = expand({
      [ENTRY]: `@snippet card(t: string) { <i>@t</i> }\n${component('@render card(a + b)')}`,
    });
    expect(source).toContain('<i>@(a + b)</i>');
  });

  it('expands a call written inside a loop, with the loop variable as the argument (criterion 14)', () => {
    const { source } = expand({
      [ENTRY]: `@snippet card(t: string) { <li>@t</li> }\n${component('@foreach (const p of items) key (p.id) { @render card(p.title) }')}`,
    });
    expect(source).toContain('<li>@p.title</li>');
  });
});

describe('a snippet inside a snippet (§4.6)', () => {
  it('expands two levels (criterion 24)', () => {
    const { source } = expand({
      [ENTRY]: component('@render a("X")', '<link rel="snippet" href="./ui.fud">'),
      '/app/ui.fud':
        '<link rel="snippet" href="./atoms.fud">\n@snippet a(t: string) { <div>@render b(t)</div> }',
      '/app/atoms.fud': '@snippet b(x: string) { <b>@x</b> }',
    });
    expect(source).toContain('<div><b>@("X")</b></div>');
  });

  it('reads the outer parameter both in markup and inside the inner call', () => {
    const { source } = expand({
      [ENTRY]: component('@render a("X")', '<link rel="snippet" href="./ui.fud">'),
      '/app/ui.fud':
        '<link rel="snippet" href="./atoms.fud">\n@snippet a(t: string) { <h1>@t</h1><div>@render b(t)</div> }',
      '/app/atoms.fud': '@snippet b(x: string) { <b>@x</b> }',
    });
    expect(source).toContain('<h1>@("X")</h1><div><b>@("X")</b></div>');
  });

  it('carries a parameter of the outer body into the inner call', () => {
    const { source } = expand({
      [ENTRY]: component('@render a(data.name)', '<link rel="snippet" href="./ui.fud">'),
      '/app/ui.fud':
        '<link rel="snippet" href="./atoms.fud">\n@snippet a(t: string) { <div>@render b(t.trim())</div> }',
      '/app/atoms.fud': '@snippet b(x: string) { <b>@x</b> }',
    });
    expect(source).toContain('<b>@((data.name).trim())</b>');
  });

  it('leaves an unresolved call exactly as written, and reports it', () => {
    const { source, diagnostics } = expand({ [ENTRY]: component('@render card()') });
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0826']);
    // Inert: the call stays in the text and the emit paints nothing for it.
    expect(source).toContain('@render card()');
  });

  it('cuts a cycle instead of expanding forever (criteria 25, 27)', () => {
    const { source, diagnostics } = expand({
      [ENTRY]: component('@render a()', '<link rel="snippet" href="./ui.fud">'),
      '/app/ui.fud': '@snippet a() { <i>@render a()</i> }',
    });
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0835']);
    expect(diagnostics[0]!.message).toContain('a → a');
    // The first level expanded; the one that closed the cycle is left where it was.
    expect(source).toContain('<i>@render a()</i>');
  });
});

describe('what an expansion drags with it (§4.5)', () => {
  const files = {
    [ENTRY]: component('@render go("Save")', '<link rel="snippet" href="./ui.fud">'),
    '/app/ui.fud': `<link rel="component" href="./app-button.fud">
<link rel="component" href="./app-badge.fud">
@snippet go(t: string) { <app-button>@t</app-button> }
@snippet tag(t: string) { <app-badge>@t</app-badge> }`,
  };

  it('brings the component link of the invoked snippet (criterion 21)', () => {
    const { dragged } = expand(files);
    expect(dragged).toEqual([{ href: './app-button.fud', from: '/app/ui.fud' }]);
  });

  it('brings nothing for the snippet that was not invoked (criterion 23)', () => {
    expect(expand(files).dragged.map((d) => d.href)).not.toContain('./app-badge.fud');
  });

  it('skips a component link with no href to drag', () => {
    const broken = {
      [ENTRY]: component('@render go("Save")', '<link rel="snippet" href="./ui.fud">'),
      '/app/ui.fud': '<link rel="component">\n@snippet go(t: string) { <app-button>@t</app-button> }',
    };
    expect(expand(broken).dragged).toEqual([]);
  });

  it('brings one link for two calls to the same snippet (criterion 22)', () => {
    const twice = { ...files, [ENTRY]: component('@render go("A")@render go("B")', '<link rel="snippet" href="./ui.fud">') };
    expect(expand(twice).dragged).toHaveLength(1);
  });
});

describe('every role of document expands (§4.9)', () => {
  const card = '@snippet card(t: string) { <i>@t</i> }';

  it('a page', () => {
    const { source } = expand({
      [ENTRY]: `<!DOCTYPE html><html><head>${card}</head><body><p>@render card("A")</p></body></html>`,
    });
    expect(source).toContain('<p><i>@("A")</i></p>');
  });

  it('a layout', () => {
    const { source } = expand({
      [ENTRY]: `<!DOCTYPE html><html><head>${card}@RenderHead()</head><body><p>@render card("A")</p>@RenderBody()</body></html>`,
    });
    expect(source).toContain('<p><i>@("A")</i></p>');
  });

  it('a component, in its <head> fragment as well as its template', () => {
    const { source } = expand({
      [ENTRY]: `${card}\n<head><title>@render card("H")</title></head>\n${component('@render card("B")')}`,
    });
    expect(source).toContain('<title><i>@("H")</i></title>');
    expect(source).toContain('<i>@("B")</i>');
  });

  it('a route with no head of its own', () => {
    const { source } = expand({
      [ENTRY]: `<link rel="layout" href="./base.fud">\n${card}\n<p>@render card("B")</p>`,
    });
    expect(source).toContain('<p><i>@("B")</i></p>');
  });

  it('expands nothing a degraded document does not reach', () => {
    // No host wrapper, so the `<div>` is part of no component (`FUD0156`, from the
    // structuring pass). The expansion follows the document, not the text: markup nothing
    // renders is left exactly as it was written.
    const { source } = expand({ [ENTRY]: `${card}\n<div>@render card("B")</div>` });
    expect(source).toContain('<div>@render card("B")</div>');
  });

  it('a route, in its markup, its head and its sections', () => {
    const { source } = expand({
      [ENTRY]: `<link rel="layout" href="./base.fud">\n${card}\n<head><title>@render card("H")</title></head>\n<p>@render card("B")</p>\n@section aside { @render card("S") }`,
    });
    expect(source).toContain('<title><i>@("H")</i></title>');
    expect(source).toContain('<p><i>@("B")</i></p>');
    expect(source).toContain('@section aside { <i>@("S")</i> }');
  });

  it('a file of snippets is not expanded at all', () => {
    const text = `${card}\n@snippet other() { @render card("X") }`;
    const { source, document } = expand({ [ENTRY]: text });
    // It renders nothing of its own, and it is nobody's entry: it emits no module and its
    // bodies are inlined — and checked — where somebody calls them. So it comes back as it
    // went in, declarations and all. Removing them instead, which is what this did until
    // task 15, left a document with no root element and no snippets: a component with no
    // host wrapper, which is the exact error the fifth role exists to avoid saying. It also
    // crashed the Vite plugin, which then emitted a component out of it.
    expect(source).toBe(text);
    expect(document.type).toBe('snippet-document');
    expect(document.snippets).toHaveLength(2);
  });
});

describe('the file list and the untouched case', () => {
  it('names every other .fud it read, for the host to watch (§5)', () => {
    const { files } = expand({
      [ENTRY]: component('@render a()', '<link rel="snippet" href="./ui.fud">'),
      '/app/ui.fud': '@snippet a() { <i></i> }',
    });
    expect(files).toEqual(['/app/ui.fud']);
  });

  it('returns a file with no snippets untouched, and does not reparse it', () => {
    const source = component('<p>hello</p>');
    const doc = structureDocument(source, parseDocument(source, { atConstructs }).value).value;
    const expansion = expandDocument(ENTRY, source, doc, io({ [ENTRY]: source }));
    expect(expansion.source).toBe(source);
    expect(expansion.document).toBe(doc);
  });
});
