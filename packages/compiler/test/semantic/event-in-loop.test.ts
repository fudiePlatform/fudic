/**
 * SDD-72 §3.5, §4.7 — `FUD1380`: an `@event` inside a loop adds one listener per item, so the
 * analyzer warns and points at delegation (criteria 31–34). A warning, never an error: a list
 * written without delegating on purpose is legitimate.
 */

import { describe, expect, it } from 'vitest';
import { parseDocument, type AtConstructParser } from '../../src/html/index.js';
import { parseControl } from '../../src/control/index.js';
import { parseCodeBlock } from '../../src/code/index.js';
import { structureDocument } from '../../src/document/index.js';
import { JsBatch, type FragmentId } from '../../src/oxc/index.js';
import { documentRoots, walk, type SemanticInput } from '../../src/semantic/index.js';
import type { Diagnostic, Node } from '../../src/types/index.js';
import { eventInLoop } from '../../src/semantic/analyzers/event-in-loop.js';

const constructs: AtConstructParser = { parseControl, parseCodeBlock };

const component = (inner: string): string =>
  `<app-test><template shadowrootmode="open">${inner}</template></app-test>`;

/** The semantic input of `source`, its loop headers registered as the batch registers them. */
function inputFor(source: string, headers = true): SemanticInput {
  const document = structureDocument(source, parseDocument(source, { atConstructs: constructs }).value).value;
  const batch = new JsBatch(source);
  const ids = new Map<Node, FragmentId>();
  walk(documentRoots(document), {
    control(node) {
      if (!headers || (node.type !== 'foreach' && node.type !== 'for')) return;
      ids.set(node, batch.add(node.type === 'foreach' ? 'for-of-header' : 'for-header', node.header.inner));
    },
  });
  return { source, document, js: batch.parse().value, fragmentId: (n) => ids.get(n), components: { has: () => true } };
}

function report(inner: string, headers = true): readonly Diagnostic[] {
  const found: Diagnostic[] = [];
  eventInLoop.run(inputFor(component(inner), headers), (d) => void found.push(d));
  return found;
}

const blamed = (inner: string, d: Diagnostic): string => component(inner).slice(d.span.start, d.span.end);

describe('FUD1380 — an event inside a loop (criterion 31)', () => {
  const LOOP = '@foreach (const p of ps) key (p.id) { <button @click=@borrar(p)>x</button> }';

  it('warns, on the attribute name, naming the row and its marker', () => {
    const [d, ...rest] = report(LOOP);
    expect(rest).toEqual([]);
    expect(d!.code).toBe('FUD1380');
    expect(d!.severity).toBe('warning');
    expect(blamed(LOOP, d!)).toBe('@click');
    expect(d!.message).toBe(
      'an `@click` inside a loop adds one listener per item. Delegate it: put the handler on an element outside the loop, pass it `p`, and mark this element with `delegate:p`',
    );
  });

  it('inside a @for and a @while too', () => {
    const inFor = report('@for (let i = 0; i < n; i++) key (i) { <b @click=@f(i)></b> }');
    expect(inFor.map((d) => d.code)).toEqual(['FUD1380']);
    expect(inFor[0]!.message).toContain('`delegate:i`');
    expect(report('@while (more) key (id) { <b @click=@f()></b> }').map((d) => d.code)).toEqual(['FUD1380']);
  });

  it('at any depth inside the body, through elements and other constructs', () => {
    const deep = '@foreach (const p of ps) key (p.id) { <tr><td>@if (p.ok) { <span><i @input=@f(p)></i></span> }</td></tr> }';
    expect(report(deep).map((d) => d.code)).toEqual(['FUD1380']);
  });

  it('every event binding of the element, and the name of the NEAREST loop', () => {
    const nested = '@foreach (const g of gs) key (g.id) { @foreach (const p of g.ps) key (p.id) { <b @click=@f(p) @keydown=@k(p)></b> } }';
    const found = report(nested);
    expect(found.map((d) => d.code)).toEqual(['FUD1380', 'FUD1380']);
    expect(found.every((d) => d.message.includes('`delegate:p`'))).toBe(true);
  });
});

describe('no warning (criterion 32)', () => {
  it('outside every loop', () => {
    expect(report('<button @click=@f()>x</button>')).toEqual([]);
  });

  it('@if and @switch are not loops', () => {
    expect(report('@if (x) { <b @click=@f()></b> }')).toEqual([]);
    expect(report('@switch (x) { case 1: { <b @click=@f()></b> } }')).toEqual([]);
  });

  it('an event that does not bubble and has no substitute cannot be delegated', () => {
    for (const event of ['load', 'scroll', 'error', 'abort', 'resize', 'unload']) {
      expect(report(`@foreach (const p of ps) key (p.id) { <img @${event}=@f(p)> }`)).toEqual([]);
    }
  });

  it('a binding that is not an event', () => {
    expect(report('@foreach (const p of ps) key (p.id) { <b class:on=@p.ok title=@p.name></b> }')).toEqual([]);
  });
});

describe('the substitute (criterion 33)', () => {
  it('@focus warns and suggests @focusin', () => {
    const [d] = report('@foreach (const p of ps) key (p.id) { <input @focus=@f(p)> }');
    expect(d!.message).toContain('Delegate it (use `@focusin`):');
  });

  it.each([
    ['blur', 'focusout'],
    ['mouseenter', 'mouseover'],
    ['mouseleave', 'mouseout'],
    ['pointerenter', 'pointerover'],
    ['pointerleave', 'pointerout'],
  ])('@%s suggests @%s', (event, substitute) => {
    const [d] = report(`@foreach (const p of ps) key (p.id) { <b @${event}=@f(p)></b> }`);
    expect(d!.message).toContain(`(use \`@${substitute}\`)`);
  });
});

describe('several bindings or none (criterion 34)', () => {
  it('a destructured header says name and delegate:name', () => {
    const [d] = report('@foreach (const [k, v] of m) key (k) { <b @click=@f(k, v)></b> }');
    expect(d!.message).toContain('pass it `name`, and mark this element with `delegate:name`');
  });

  it('a @while declares nothing: name too', () => {
    const [d] = report('@while (more) key (id) { <b @click=@f()></b> }');
    expect(d!.message).toContain('`delegate:name`');
  });

  it('a header the batch did not register: name, and still the warning', () => {
    const [d] = report('@foreach (const p of ps) key (p.id) { <b @click=@f(p)></b> }', false);
    expect(d!.code).toBe('FUD1380');
    expect(d!.message).toContain('`delegate:name`');
  });
});

describe('FUD1380 — a named handler inside a loop (SDD-80 §4.6)', () => {
  it('is blamed on the whole name, and judged by its event', () => {
    const LOOP = '@foreach (const p of ps) key (p.id) { <button @click.borrar=@borrar(p)>x</button> }';
    const [d] = report(LOOP);
    expect(blamed(LOOP, d!)).toBe('@click.borrar');
    expect(d!.message).toContain('an `@click` inside a loop');
  });
});
