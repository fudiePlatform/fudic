/**
 * What delegation costs, measured on the emitted chunk (SDD-37 §6.11, §6.12; invariants 1–3).
 *
 * The three claims of the SDD are all about a NUMBER — one table, one listener, zero bytes of
 * HTML — so they are asserted by counting on the real output of the real emit, over the
 * `app-calendar` fixture and over the same fixture with the markers taken out.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resolveComponents,
  emitComponentModule,
  emitComponentClientModule,
  type ComponentGraph,
} from '../../src/emit/index.js';
import { delegatedHandler, hookupContext, templateDelegationJs } from '../../src/emit/events.js';
import { extractCode } from '../../src/emit/oxc-code.js';
import { planDelegation } from '../../src/semantic/delegation.js';
import { classifyAttribute } from '../../src/binding/index.js';
import type { ComponentDocument } from '../../src/document/index.js';
import type { ElementNode } from '../../src/html/index.js';
import { fixturesDir, fixtureIo, parse } from './_support.js';

const graph: ComponentGraph = resolveComponents(join(fixturesDir, 'home.fud'), fixtureIo);
const comp = graph.components.get('app-calendar')!;
const client = emitComponentClientModule(graph, comp);
const server = emitComponentModule(graph, comp);

/** How many times a needle appears — the form every claim of this suite takes. */
const count = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

describe('delegation — the emit (§6.12, invariant 3)', () => {
  it('declares ONE table for a loop of N rows, whatever N turns out to be', () => {
    expect(count(client, 'new WeakMap()')).toBe(1);
  });

  it('subscribes ONE listener, and it is on the ancestor', () => {
    expect(count(client, '$dom.event(')).toBe(1);
    expect(client).toContain('$n0 && $d.push($dom.event($n0, "click"');
  });

  it('registers the row in both branches: created and adopted alike', () => {
    // Two markers per row — the cell and the button — and both in `c` and in `h`.
    expect(count(client, '$t0.set(')).toBe(4);
  });

  it('registers a GETTER and never the value, so `u` needs no wiring at all', () => {
    expect(client).toContain('$t0.set($n3, () => day);');
    expect(client).not.toContain('$t0.set($n3, day)');
    // The update path of the row is the same one a row with no marker has.
    expect(client).toContain('u: (...$p) => { [day] = $p; $a(); }');
  });

  it('resolves in one pass over composedPath, with the guard §3.3 promises', () => {
    expect(client).toContain(
      '($event) => { let $z0; for (const $y of $event.composedPath()) { $z0 ??= $t0.get($y); } ' +
        'if ($z0 === undefined) return; return pick($event, $z0()); }',
    );
  });

  it('takes back nothing when a row leaves: there is no removeEventListener to write', () => {
    expect(client).not.toContain('removeEventListener');
    // `r()` of the row is teardowns plus node removal, and the table is not in it.
    expect(client).toContain('r: () => { $d.forEach(($f) => $f()); for (const $n of $r) $dom.remove($n); }');
  });
});

describe('delegatedHandler — the wrapper itself (§4.1)', () => {
  /** The listener one component's single event binding compiles to. */
  function wrapper(inner: string): string | undefined {
    const source = `<m-el>\n  <template shadowrootmode="open">${inner}</template>\n</m-el>\n`;
    const doc = parse(source) as ComponentDocument;
    const { template } = extractCode(source, doc);
    const roots = doc.template!.children;
    const plan = planDelegation(source, roots, templateDelegationJs(template));
    const ctx = hookupContext(template, [], new Set(), new Map(), new Set(), plan);
    const [attr, reads] = [...plan.reads][0] ?? [];
    if (attr === undefined || reads === undefined) return undefined;
    const binding = classifyAttribute(attr, source).value;
    if (binding.type !== 'event') throw new Error('expected an event binding');
    return delegatedHandler(source, binding.value.expr, ctx, reads);
  }

  it('walks the path ONCE for two names, and guards on both', () => {
    expect(
      wrapper(
        `<div @click="@fn($event, $row, $tag)">` +
          `@foreach (const row of rows) key (row.id) {` +
          `@foreach (const tag of row.tags) key (tag.id) { <b delegate:row delegate:tag></b> }` +
          `}</div>`,
      ),
    ).toBe(
      '($event) => { let $z0, $z1; ' +
        'for (const $y of $event.composedPath()) { $z0 ??= $t0.get($y); $z1 ??= $t1.get($y); } ' +
        'if ($z0 === undefined || $z1 === undefined) return; return fn($event, $z0(), $z1()); }',
    );
  });

  it('splices from the right, so an earlier getter cannot move a later name', () => {
    // `$b` is written before `$a` here: the substitution has to survive the reversal.
    expect(
      wrapper(
        `<div @click="@fn($b, $a)">` +
          `@foreach (const a of xs) key (a.id) {` +
          `@foreach (const b of a.ys) key (b.id) { <i delegate:a delegate:b></i> }` +
          `}</div>`,
      ),
    ).toContain('return fn($z0(), $z1());');
  });

  it('returns nothing for a value that is not a call: there is no argument list to wrap', () => {
    const source = `<m-el>\n  <template shadowrootmode="open"><b @click="@fn"></b></template>\n</m-el>\n`;
    const doc = parse(source) as ComponentDocument;
    const { template } = extractCode(source, doc);
    const el = doc.template!.children.find((c): c is ElementNode => c.type === 'element')!;
    const binding = classifyAttribute(el.attributes[0]!, source).value;
    if (binding.type !== 'event') throw new Error('expected an event binding');
    expect(
      delegatedHandler(source, binding.value.expr, hookupContext(template, []), [
        { name: 'day', table: '$t0', at: binding.value.expr, loopHeaders: [] },
      ]),
    ).toBeUndefined();
  });
});

describe('delegation — the HTML (§6.11, invariant 1)', () => {
  it('writes no attribute, no marker and no index', () => {
    expect(server).not.toContain('delegate');
    expect(server).not.toContain('data-day');
  });

  it('emits the same server module as the same component without the markers', () => {
    // The fixture with `delegate:day` removed, compiled through the same pipeline. Byte for
    // byte: the marker is a fact about the CLIENT, and the server has no opinion on it.
    const source = readFileSync(join(fixturesDir, 'app-calendar.fud'), 'utf8');
    const plain = source.replaceAll(' delegate:day', '').replace('@click=@pick($event, $day)', '');
    const io = {
      ...fixtureIo,
      read: (file: string): string =>
        file.endsWith('app-calendar.fud') ? plain : fixtureIo.read(file),
    };
    const other = resolveComponents(join(fixturesDir, 'home.fud'), io);
    expect(emitComponentModule(other, other.components.get('app-calendar')!)).toBe(server);
  });
});
