/**
 * The scope an instance the browser created resolves its services from (SDD-85, `scope.ts`).
 *
 * The chain is the server's: the VIEW a host is rendered by, up to the first owner. What is
 * measured is each link — the creator `live` records, the shadow root of a painted host, the
 * node a painted owner carries, the scope an owner created here opens — and that a host in a
 * fragment, out of any tree, still finds the view that created it.
 */

import { describe, expect, it } from 'vitest';
import { live, ownScope, SCOPE_ATTR, scopeOf } from '../../src/hydrate/live.js';
import { publishTagSource, type ElementRegistry } from '../../src/hydrate/registry.js';

/** A host with a shadow root, as a component's is. */
function component(tag: string): { host: Element; shadow: ShadowRoot } {
  const host = document.createElement(tag);
  return { host, shadow: host.attachShadow({ mode: 'open' }) };
}

/** A registry that knows every tag, so `live` raises at once. */
const everything: ElementRegistry = {
  get: () => class {},
  whenDefined: () => Promise.resolve(),
  upgrade: () => undefined,
} as unknown as ElementRegistry;

/** A child the browser creates inside `parent`'s view: in a fragment, as a block's clone is. */
function created(tag: string, parent: ShadowRoot): Element {
  const child = document.createElement(tag);
  (child as unknown as { c: () => void }).c = () => undefined;
  document.createDocumentFragment().append(child);
  live(child, [], parent);
  return child;
}

describe('the scope of a host', () => {
  publishTagSource(() => Promise.resolve(), everything);

  it('is none in the page’s own markup', () => {
    const el = document.createElement('x-page');
    document.body.append(el);
    expect(scopeOf(el)).toBeUndefined();
  });

  it('is the node of the painted owner whose view holds it', () => {
    const owner = component('x-owner');
    owner.host.setAttribute(SCOPE_ATTR, '3');
    const inner = component('x-inner');
    owner.shadow.append(inner.host);
    const leaf = document.createElement('x-leaf');
    inner.shadow.append(leaf);
    expect(scopeOf(leaf)).toBe(3);
  });

  it('follows the view that created a host, though it sits in a fragment', () => {
    const owner = component('x-owner2');
    owner.host.setAttribute(SCOPE_ATTR, '5');
    expect(scopeOf(created('x-child', owner.shadow))).toBe(5);
  });

  it('is the scope an owner created here opened, for everything its view creates', () => {
    const outer = component('x-outer');
    outer.host.setAttribute(SCOPE_ATTR, '1');
    const owner = created('x-made', outer.shadow);
    const shadow = owner.attachShadow({ mode: 'open' });
    const opened: unknown[] = [];
    const scope = ownScope(owner, (around) => {
      opened.push(around);
      return { child: around };
    });
    expect(opened).toEqual([1]);
    expect(scope).toEqual({ child: 1 });
    expect(scopeOf(created('x-grand', shadow))).toBe(scope);
  });

  it('is the painted node for an owner the server painted, and nothing is opened', () => {
    const owner = component('x-painted');
    owner.host.setAttribute(SCOPE_ATTR, '7');
    expect(ownScope(owner.host, () => 'never')).toBe(7);
  });

  it('a route creates with no view of its own: the host is in the page’s', () => {
    const child = document.createElement('x-routed');
    (child as unknown as { c: () => void }).c = () => undefined;
    live(child, []);
    expect(scopeOf(child)).toBeUndefined();
  });
});
