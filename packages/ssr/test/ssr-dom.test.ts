import { describe, it, expect } from 'vitest';
import { SsrDom } from '../src/ssr-dom.js';
import type { SsrNode } from '../src/tree.js';
import { renderToString } from '../src/serialize.js';

describe('SsrDom tree mutation', () => {
  it('append moves a node out of its previous parent', () => {
    const d = new SsrDom();
    const p1 = d.element('div');
    const p2 = d.element('section');
    const child = d.element('span');
    d.append(p1, child);
    d.append(p2, child); // re-parent
    expect(renderToString(p1)).toBe('<div></div>');
    expect(renderToString(p2)).toBe('<section><span></span></section>');
  });

  it('before inserts a node ahead of the anchor', () => {
    const d = new SsrDom();
    const parent = d.element('div');
    const anchor = d.comment('anchor');
    d.append(parent, anchor);
    d.before(anchor, d.element('span'));
    expect(renderToString(parent)).toBe('<div><span></span><!--anchor--></div>');
  });

  it('before on an un-parented anchor is a no-op', () => {
    const d = new SsrDom();
    const parent = d.element('div');
    d.append(parent, d.text('x'));
    const orphanAnchor = d.comment('orphan');
    const node = d.element('span');
    d.before(orphanAnchor, node);
    expect(renderToString(parent)).toBe('<div>x</div>');
  });

  it('remove detaches a node', () => {
    const d = new SsrDom();
    const parent = d.element('div');
    const child = d.element('span');
    d.append(parent, child);
    d.remove(child);
    expect(renderToString(parent)).toBe('<div></div>');
  });

  it('remove on an un-parented node is a no-op and does not throw', () => {
    const d = new SsrDom();
    const orphan = d.element('span');
    expect(() => d.remove(orphan)).not.toThrow();
    expect(renderToString(orphan)).toBe('<span></span>');
  });

  it('removeAttr deletes an attribute', () => {
    const d = new SsrDom();
    const el = d.element('input');
    d.setAttr(el, 'disabled', '');
    d.removeAttr(el, 'disabled');
    expect(renderToString(el)).toBe('<input>');
  });

  it('attachShadow is idempotent', () => {
    const d = new SsrDom();
    const host = d.element('app-x');
    const first = d.attachShadow(host);
    expect(d.attachShadow(host)).toBe(first);
  });

  it('host gives the shadow root back its host, with no extra link (SDD-15 §4.4)', () => {
    const d = new SsrDom();
    const host = d.element('app-x');
    expect(d.host(d.attachShadow(host))).toBe(host);
  });

  it('event and bus do nothing, share one disposer, and leave no trace (SDD-15 §3.8, §6.14)', () => {
    const d = new SsrDom();
    const host = d.element('app-x');
    const off = d.event(host, 'click', () => undefined);
    expect(d.bus(host, 'carrito', () => undefined)).toBe(off); // one constant, not a closure per call
    // In production nobody calls it — `r()` on the server never runs — and that is exactly
    // the branch a 100% floor makes us write.
    expect(off()).toBeUndefined();
    expect(renderToString(host)).toBe('<app-x></app-x>');
  });

  it('detaching a node held outside its parent children list is safe', () => {
    // A shadow root is parented to its host but lives in `.shadow`, not `children`.
    const d = new SsrDom();
    const host = d.element('app-x');
    const shadow = d.attachShadow(host);
    expect(() => d.remove(shadow)).not.toThrow();
  });
});

describe('SsrDom — the instance collector (SDD-15 §3.1, §3.3)', () => {
  /** One claimed host with its shadow, the shape the emit produces. */
  function instance(d: SsrDom, tag: string): { host: SsrNode; shadow: SsrNode } {
    const host = d.element(tag);
    d.claim(host);
    return { host, shadow: d.attachShadow(host) };
  }

  it('claim hands out base-0 correlative ids and writes them on the host', () => {
    const d = new SsrDom();
    const a = instance(d, 'app-a');
    const b = instance(d, 'app-b');
    expect(renderToString(a.host)).toContain('data-fud-id="0"');
    expect(renderToString(b.host)).toContain('data-fud-id="1"');
  });

  it('claim on a host that already has an id does not renumber it', () => {
    // The id is the node's, not the call's. A second claim is a no-op, and — this is the
    // half that matters — it does not burn a slice either.
    const d = new SsrDom();
    const a = instance(d, 'app-a');
    d.claim(a.host);
    const b = instance(d, 'app-b');
    d.state(a.shadow, ['A']);
    d.state(b.shadow, ['B']);
    expect(renderToString(a.host)).toContain('data-fud-id="0"');
    expect(renderToString(b.host)).toContain('data-fud-id="1"');
    expect(d.hydrationState()).toEqual({ offsets: [0, 1, 2], data: ['A', 'B'] });
  });

  it('state fills the slice of the host that owns the shadow, in id order', () => {
    const d = new SsrDom();
    const a = instance(d, 'app-a');
    const b = instance(d, 'app-b');
    // Out of order on purpose: a child finishes its render before a later sibling claims,
    // so ARRIVAL order is not id order. The offsets are prefix sums over the reservations.
    d.state(b.shadow, [true, false]);
    d.state(a.shadow, [1, 'Pedro']);
    const { offsets, data } = d.hydrationState();
    expect(offsets).toEqual([0, 2, 4]);
    expect(data).toEqual([1, 'Pedro', true, false]);
    expect(data.slice(offsets[0]!, offsets[1]!)).toEqual([1, 'Pedro']);
    expect(data.slice(offsets[1]!, offsets[2]!)).toEqual([true, false]);
  });

  it('a claimed host whose render never called state keeps an empty slice', () => {
    // Which is exactly what an empty slice means: `offsets[id] === offsets[id + 1]`. Without
    // the reservation this instance would shift every following offset by one.
    const d = new SsrDom();
    instance(d, 'app-quiet');
    const b = instance(d, 'app-b');
    d.state(b.shadow, ['B']);
    expect(d.hydrationState()).toEqual({ offsets: [0, 0, 1], data: ['B'] });
  });

  it('state over a shadow whose host was never claimed is a no-op', () => {
    // The emit's hydration harness calls `render` with a shadow made by hand: there is no
    // page around it, so there is no slice to fill and nothing to report.
    const d = new SsrDom();
    const shadow = d.attachShadow(d.element('app-loose'));
    d.state(shadow, ['ignored']);
    expect(d.hydrationState()).toEqual({ offsets: [0], data: [] });
  });

  it('state over a fragment that is not a shadow root is a no-op too', () => {
    const d = new SsrDom();
    const detached = d.element('div');
    d.state(detached, ['ignored']);
    expect(d.hydrationState()).toEqual({ offsets: [0], data: [] });
  });

  it('a page with no claimed instance has an empty payload', () => {
    expect(new SsrDom().hydrationState()).toEqual({ offsets: [0], data: [] });
  });

  it('BUG-24 §4.2 — the cells go behind the props, and the consumer gets the marker', () => {
    const d = new SsrDom();
    const owner = instance(d, 'app-owner');
    const view = instance(d, 'app-view');
    const count = (): number => 0; // an inert signal: on this side it is a function
    d.state(owner.shadow, [0], [{ of: count, value: count() }]);
    d.state(view.shadow, [count]);

    expect(d.hydrationState()).toEqual({ offsets: [0, 2, 3], data: [0, 0, { $: [0, 1] }] });
  });

  it('a cell with no value is `$f`, and its own slot is reserved as null', () => {
    // A callback: `@code { @client }` never runs here, so there is nothing to write down —
    // and that absence is the instruction to raise the owner before handing the slice over.
    const d = new SsrDom();
    const owner = instance(d, 'app-owner');
    const form = instance(d, 'app-form');
    const save = (): void => {};
    d.state(owner.shadow, [], [{ of: save }]);
    d.state(form.shadow, [save]);

    expect(d.hydrationState()).toEqual({ offsets: [0, 1, 2], data: [null, { $f: [0, 0] }] });
  });

  it('a FORWARDED cell keeps the original owner’s address, however deep it goes', () => {
    // The registry is keyed by the object, so a component that hands on a prop it received
    // serialises the address of whoever declared it — not a second one of its own.
    const d = new SsrDom();
    const owner = instance(d, 'app-owner');
    const child = instance(d, 'app-child');
    const grandchild = instance(d, 'app-grandchild');
    const count = (): number => 7;
    d.state(owner.shadow, [], [{ of: count, value: count() }]);
    d.state(child.shadow, [count]);
    d.state(grandchild.shadow, [count]);

    expect(d.hydrationState().data).toEqual([7, { $: [0, 0] }, { $: [0, 0] }]);
  });

  it('a nested value travels with its shape (vía B, §4.1)', () => {
    const d = new SsrDom();
    const a = instance(d, 'app-a');
    d.state(a.shadow, [1, { id: 1 }, [{ id: 2 }]]);
    expect(JSON.stringify(d.hydrationState().data)).toBe('[1,{"id":1},[{"id":2}]]');
  });
});

describe('stateOf — the slice of a host held directly (SDD-39 §3.2)', () => {
  it('fills the slice of a node nobody reaches through a shadow', () => {
    // What a ROUTE holds is the `<body>` itself: there is no shadow to go through, and the
    // layout hands it over at the one moment the body is finished (SDD-21 §4.5).
    const d = new SsrDom();
    const body = d.element('body');
    d.claim(body);
    const count = (): number => 3;
    d.stateOf(body, [], [{ of: count, value: count() }]);
    expect(d.hydrationState()).toEqual({ offsets: [0, 1], data: [3] });
  });

  it('fills nothing for a node that was never claimed', () => {
    const d = new SsrDom();
    d.stateOf(d.element('body'), [1]);
    expect(d.hydrationState()).toEqual({ offsets: [0], data: [] });
  });

  it('resolves a cell a consumer serialised BEFORE its owner existed', () => {
    // The order a route forces: the component is rendered inside the body, and the body can
    // only be claimed once it is finished — so the consumer's slot is written first and the
    // cell is registered afterwards. The substitution happens when the payload is built.
    const d = new SsrDom();
    const child = d.element('signal-display');
    const shadow = d.attachShadow(child);
    d.claim(child);
    const count = (): number => 9;
    d.state(shadow, [count]);

    const body = d.element('body');
    d.claim(body);
    d.stateOf(body, [], [{ of: count, value: count() }]);

    expect(d.hydrationState()).toEqual({ offsets: [0, 1, 2], data: [{ $: [1, 0] }, 9] });
  });
});
