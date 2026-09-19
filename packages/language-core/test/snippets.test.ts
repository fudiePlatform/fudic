/**
 * SDD-29 §4.11 — the projection: a declaration is a function, a call is a call.
 *
 * What is asserted is the virtual TypeScript, because that IS the feature: from the text
 * below, TypeScript gives the argument types, the arity, the hover with the signature and
 * go-to-definition across files, and none of it is code of ours.
 */

import { describe, expect, it } from 'vitest';
import { emitClientVirtual } from '../src/emit-client.js';
import { emitClient, parseFud, registryOf } from './_support.js';

const component = (body: string, head = ''): string =>
  `${head}<app-page><template shadowrootmode="open">${body}</template></app-page>`;

describe('a declaration is an exported function', () => {
  it('copies the name and the signature verbatim, at the top level', () => {
    const text = emitClient(
      `@snippet card(title: string, variant: 'a' | 'b' = 'a') { <i>@title</i> }\n${component('')}`,
    ).text;
    expect(text).toContain(`export function card(title: string, variant: 'a' | 'b' = 'a'): void {`);
    // Before `$tpl`, because a consumer imports it and a nested function is not exportable.
    expect(text.indexOf('export function card')).toBeLessThan(text.indexOf('function $tpl'));
  });

  it('projects the body with the same projector as any other markup', () => {
    const text = emitClient(
      `@snippet card(title: string) { <i>@title</i><app-badge .tone="@title"></app-badge> }\n${component('')}`,
      'x.fud',
      registryOf({ 'app-badge': './app-badge.fud' }),
    ).text;
    // The interpolation is projected, and so is the child's prop — which is what gives a tag
    // inside a snippet its contract.
    expect(text).toContain('title');
    expect(text).toContain('$C0');
  });

  it('takes an empty signature', () => {
    expect(emitClient(`@snippet spacer() { <hr> }\n${component('')}`).text).toContain(
      'export function spacer(): void {',
    );
  });
});

describe('a file of snippets', () => {
  it('declares the names its bodies read, because they belong to whoever expands them', () => {
    const text = emitClient('@snippet card(t: string) { <i>@t</i><b>@user.name</b> }').text;
    expect(text).toContain('declare const user: any;');
    // The parameter lands in the list too, and harmlessly: the function's own `t: string`
    // shadows it, so the type the author wrote is still the one that wins inside the body.
    expect(text).toContain('declare const t: any;');
    expect(text).toContain('export function card(t: string): void {');
  });

  it('does not declare `data` twice: every virtual already has it', () => {
    const text = emitClient('@snippet card() { <i>@data.title</i> }').text;
    expect(text).not.toContain('declare const data: any;');
  });

  it('does not declare a name that is one of its own snippets', () => {
    const text = emitClient('@snippet a() { <i></i> }\n@snippet b() { @render a() }').text;
    expect(text).not.toContain('declare const a: any;');
  });

  it('declares nothing in a file that also has markup of its own', () => {
    const text = emitClient(
      `@snippet card() { <i>@data.title</i> }\n${component('<p>@data.title</p>')}`,
    ).text;
    // A component resolves `data` in its own scope, so inventing an `any` for it would throw
    // away the type it actually has.
    expect(text).not.toContain('declare const data');
  });
});

describe('a call is a call', () => {
  it('projects a local snippet by its bare name, so go-to-definition lands a line above', () => {
    const text = emitClient(
      `@snippet card(t: string) { <i>@t</i> }\n${component('@render card("A")')}`,
    ).text;
    expect(text).toContain('card("A");');
  });

  it('projects an imported one through the merged namespace', () => {
    const text = emitClient(
      component('@render card("A")', '<link rel="snippet" href="./ui.fud">'),
      'x.fud',
      registryOf({}, undefined, [{ href: './ui.fud' }]),
    ).text;
    expect(text).toContain("import * as $Sn0 from './ui.fud';");
    expect(text).toContain('const $snippets = { ...$Sn0 };');
    expect(text).toContain('$snippets.card("A");');
  });

  it('merges two imports written without an `as`, which is what a global scope is', () => {
    const text = emitClient(
      component('@render card("A")', '<link rel="snippet" href="./a.fud"><link rel="snippet" href="./b.fud">'),
      'x.fud',
      registryOf({}, undefined, [{ href: './a.fud' }, { href: './b.fud' }]),
    ).text;
    expect(text).toContain('const $snippets = { ...$Sn0, ...$Sn1 };');
  });

  it('projects a namespaced one through its own import', () => {
    const text = emitClient(
      component('@render form.card("A")', '<link rel="snippet" href="./ui.fud" as="form">'),
      'x.fud',
      registryOf({}, undefined, [
        { href: './ui.fud', namespace: { name: 'form', span: { start: 0, end: 4 } } },
      ]),
    ).text;
    expect(text).toContain("import * as $Sn0 from './ui.fud';");
    expect(text).not.toContain('$snippets');
    expect(text).toContain('$Sn0.card("A");');
  });

  it('projects a name nothing declares bare, so TypeScript reports it', () => {
    const text = emitClient(component('@render card("A")')).text;
    expect(text).toContain('card("A");');
    expect(text).not.toContain('$snippets');
  });

  it('projects every argument, a named one by its value', () => {
    const text = emitClient(
      `@snippet card(t: string, v: string) { <i>@t</i> }\n${component(`@render card("A", v: 'b')`)}`,
    ).text;
    expect(text).toContain(`card("A", 'b');`);
  });

  it('projects a call written inside a loop', () => {
    const text = emitClient(
      `@snippet card(t: string) { <i>@t</i> }\n${component('@foreach (const p of items) key (p.id) { @render card(p.title) }')}`,
    ).text;
    expect(text).toContain('card(p.title);');
  });
});

describe('the edges of the import list', () => {
  it('keeps the first of two imports that claim the same namespace', () => {
    // Two files under one `as` is the author naming two things the same. The first wins and
    // the second is an unreachable namespace — a rule for a diagnostic, not for here, and in
    // no case may `form` quietly come to mean the second file.
    const head =
      '<link rel="snippet" href="./a.fud" as="form"><link rel="snippet" href="./b.fud" as="form">';
    const text = emitClient(component('@render form.card("A")', head), 'x.fud',
      registryOf({}, undefined, [
        { href: './a.fud', namespace: { name: 'form', span: { start: 0, end: 4 } } },
        { href: './b.fud', namespace: { name: 'form', span: { start: 0, end: 4 } } },
      ]),
    ).text;

    expect(text).toContain("import * as $Sn0 from './a.fud';");
    expect(text).toContain("import * as $Sn1 from './b.fud';");
    expect(text).toContain('$Sn0.card("A");');
    expect(text).not.toContain('$Sn1.card');
  });
});

describe('the projector handed no batch', () => {
  /**
   * `emitClientVirtual` straight, with no `TemplateJs`: no reactive names and no ASTs.
   *
   * A supported mode and not a hypothetical — it is what every AST-dependent rule degrades
   * to, «say nothing new» — and for a file of snippets it is the one path where the free
   * names of a body cannot be read, because reading them IS asking the batch.
   */
  const bare = (source: string): string =>
    emitClientVirtual(source, 'x.fud', parseFud(source), registryOf({}), undefined).text;

  it('projects the declarations of a snippet file, without their caller scope', () => {
    const text = bare('@snippet card(title: string) { <b>@title</b><i>@tone</i> }\n');

    expect(text).toContain('export function card(title: string): void {');
    // `tone` is a free name of the body, and with no batch there is nothing to read it from.
    expect(text).not.toContain('declare const tone: any;');
  });

  it('projects a component, with no reactive name for a value to cross as', () => {
    expect(bare(component('<p>@title</p>'))).toContain('$tpl');
  });
});
