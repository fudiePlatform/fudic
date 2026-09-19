/**
 * SDD-29 §6.3 and §6.6 — whether a `@render` adds up.
 *
 * The same function the editor runs and the build runs before expanding. Nothing here
 * expands anything, and nothing here checks a TYPE: that is TypeScript's, over the virtual
 * files (§7).
 */

import { describe, expect, it } from 'vitest';
import { parseDocument } from '../../src/html/index.js';
import { atConstructs } from '../../src/constructs.js';
import { structureDocument } from '../../src/document/index.js';
import { documentRoots } from '../../src/semantic/index.js';
import { SnippetRegistry, checkRenderCalls } from '../../src/expand/index.js';
import type { Diagnostic, ResolveIo } from '../../src/types/index.js';

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

/** Everything said about the entry file: the parse, the structure, the scope and the calls. */
function check(files: Record<string, string>): readonly Diagnostic[] {
  const source = files[ENTRY]!;
  const parsed = parseDocument(source, { atConstructs });
  const structured = structureDocument(source, parsed.value);
  const diagnostics: Diagnostic[] = [...parsed.diagnostics, ...structured.diagnostics];
  const doc = structured.value;
  const scope = new SnippetRegistry(io(files)).scopeOf(ENTRY, source, doc, diagnostics);
  checkRenderCalls(documentRoots(doc), scope, ENTRY, diagnostics);
  return diagnostics;
}

const codes = (files: Record<string, string>): readonly string[] =>
  check(files).map((d) => d.code);

/** A component, since a `@render` lives in markup and markup lives inside the host wrapper. */
const component = (body: string, head = ''): string =>
  `${head}<app-page><template shadowrootmode="open">${body}</template></app-page>`;

/** A file that declares `card(title, variant = 'a', subtitle?)` and renders `body`. */
const withCard = (body: string): Record<string, string> => ({
  [ENTRY]: `@snippet card(title: string, variant: 'a' | 'b' = 'a', subtitle?: string) {
  <article class="@variant"><h2>@title</h2></article>
}
${component(body)}`,
});

describe('resolving the name (§4.7)', () => {
  it('accepts a call that covers every required parameter', () => {
    expect(codes(withCard('<p>@render card("A")</p>'))).toEqual([]);
  });

  it('reports a name no scope holds (FUD0826)', () => {
    expect(codes(withCard('<p>@render badge()</p>'))).toEqual(['FUD0826']);
  });

  it('reports a namespace no import declares (FUD0827)', () => {
    expect(codes(withCard('<p>@render form.card("A")</p>'))).toEqual(['FUD0827']);
  });

  it('reports a name the namespace does not hold (criterion 17, FUD0826)', () => {
    const files = {
      [ENTRY]: component('<p>@render form.badge()</p>', '<link rel="snippet" href="./ui.fud" as="form">'),
      '/app/ui.fud': '@snippet card() { <i></i> }',
    };
    expect(codes(files)).toEqual(['FUD0826']);
  });

  it('does not find a namespaced snippet by its bare name (criterion 17)', () => {
    const files = {
      [ENTRY]: component('<p>@render card()</p>', '<link rel="snippet" href="./ui.fud" as="form">'),
      '/app/ui.fud': '@snippet card() { <i></i> }',
    };
    expect(codes(files)).toEqual(['FUD0826']);
  });
});

describe('binding the arguments (§4.8.c)', () => {
  it('uses the default of a parameter the call does not cover (criterion 5)', () => {
    expect(codes(withCard('<p>@render card("A")</p>'))).toEqual([]);
  });

  it('accepts an optional parameter left out (criterion 6)', () => {
    expect(codes(withCard(`<p>@render card("A", 'b')</p>`))).toEqual([]);
  });

  it('reports a required parameter nobody covers (criterion 7, FUD0828)', () => {
    expect(codes(withCard('<p>@render card()</p>'))).toEqual(['FUD0828']);
  });

  it('mixes positional and named (criterion 9)', () => {
    expect(codes(withCard(`<p>@render card("A", variant: 'b')</p>`))).toEqual([]);
  });

  it('reports arguments of more (FUD0829)', () => {
    expect(codes(withCard(`<p>@render card("A", 'b', "S", "X")</p>`))).toEqual(['FUD0829']);
  });

  it('counts in the singular when the signature has one parameter', () => {
    const files = {
      [ENTRY]: `@snippet one(a: string) { <i>@a</i> }\n${component('<p>@render one("A", "B")</p>')}`,
    };
    expect(check(files)[0]!.message).toContain('takes 1 argument');
  });

  it('names a destructuring parameter by its position, since it has no name', () => {
    const files = {
      [ENTRY]: `@snippet card({ title }: { title: string }) { <i>@title</i> }\n${component('<p>@render card()</p>')}`,
    };
    expect(check(files)[0]!.message).toContain('argument 1');
  });

  it('reports a name that is no parameter (criterion 12, FUD0830)', () => {
    expect(codes(withCard(`<p>@render card("A", tone: 'x')</p>`))).toEqual(['FUD0830']);
  });

  it('reports a parameter given twice, with both places (criterion 11, FUD0831)', () => {
    const diagnostics = check(withCard('<p>@render card("A", title: "B")</p>'));
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0831']);
    expect(diagnostics[0]!.related).toHaveLength(1);
  });

  it('reports a positional after a named, and still binds the rest (criterion 10)', () => {
    // FUD0832 is the parser's; the check has nothing left to complain about.
    expect(codes(withCard(`<p>@render card(variant: 'b', "A")</p>`))).toEqual(['FUD0832']);
  });
});

describe('recursion (§4.6)', () => {
  it('reports a snippet that renders itself, with the cycle (criterion 25, FUD0835)', () => {
    const diagnostics = check({ [ENTRY]: '@snippet card() { @render card() }' });
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0835']);
    expect(diagnostics[0]!.message).toContain('card → card');
  });

  it('reports an indirect cycle with the whole chain (criterion 26, FUD0835)', () => {
    const diagnostics = check({
      [ENTRY]: component('<p>@render a()</p>', '<link rel="snippet" href="./a.fud">'),
      '/app/a.fud': '<link rel="snippet" href="./b.fud">\n@snippet a() { @render b() }',
      '/app/b.fud': '<link rel="snippet" href="./a.fud">\n@snippet b() { @render a() }',
    });
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0835']);
    expect(diagnostics[0]!.message).toContain('a → b → a');
  });

  it('neither hangs nor overflows on either of them (criterion 27)', () => {
    // The assertion is that the two above returned at all; this one adds the shape that
    // used to be the trap: a snippet invoked from many places, in a graph with a cycle.
    const diagnostics = check({
      [ENTRY]: component(
        '<p>@render a()@render a()@render a()</p>',
        '<link rel="snippet" href="./a.fud">',
      ),
      '/app/a.fud': '<link rel="snippet" href="./b.fud">\n@snippet a() { @render b()@render b() }',
      '/app/b.fud': '<link rel="snippet" href="./a.fud">\n@snippet b() { @render a() }',
    });
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0835']);
  });

  it('is not recursion when two different snippets share a name across files', () => {
    const diagnostics = check({
      [ENTRY]: component('<p>@render a()</p>', '<link rel="snippet" href="./a.fud">'),
      '/app/a.fud': '<link rel="snippet" href="./b.fud" as="deep">\n@snippet a() { @render deep.a() }',
      '/app/b.fud': '@snippet a() { <i></i> }',
    });
    expect(diagnostics).toEqual([]);
  });
});

describe('where a diagnostic belongs (§5)', () => {
  it('tags one produced inside an imported body with that file', () => {
    const diagnostics = check({
      [ENTRY]: component('<p>@render card()</p>', '<link rel="snippet" href="./ui.fud">'),
      '/app/ui.fud': '@snippet card() { @render gone() }',
    });
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0826']);
    expect(diagnostics[0]!.file).toBe('/app/ui.fud');
  });

  it('leaves one produced in the file being compiled untagged', () => {
    const diagnostics = check(withCard('<p>@render gone()</p>'));
    expect(diagnostics[0]!.file).toBeUndefined();
  });
});
