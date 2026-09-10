/**
 * Raising an instance nobody painted (SDD-17 §3, SDD-15 §3.7).
 *
 * The cascade reaches what the server rendered, by page identity. A component created at
 * runtime — a host inside a `@foreach` whose list just grew — has no identity and no slice
 * of the payload, so the only code that can bring it up is the parent that made it. What is
 * measured here is that bridge: the definition is asked for once, the element is upgraded,
 * and `c` gets the props the parent composed.
 */

import { describe, expect, it, vi } from 'vitest';
import type { ElementRegistry } from '../../src/hydrate/registry.js';
import { installFabricator, live } from '../../src/hydrate/live.js';

/** A host that records the props it was raised with. Anything with `c` serves. */
function host(tag: string): Element & { raised: unknown[][] } {
  const el = document.createElement(tag) as unknown as Element & { raised: unknown[][] };
  el.raised = [];
  (el as unknown as { c: (props: readonly unknown[]) => void }).c = (props) => {
    el.raised.push([...props]);
  };
  return el;
}

/** A registry that knows a fixed set of tags, and counts what was asked of it. */
function registryOf(defined: readonly string[]): ElementRegistry & { upgraded: Node[] } {
  const upgraded: Node[] = [];
  return {
    upgraded,
    get: (name) =>
      defined.includes(name) ? (class extends HTMLElement {} as CustomElementConstructor) : undefined,
    whenDefined: () => Promise.resolve(),
    upgrade: (node) => {
      upgraded.push(node);
    },
  };
}

describe('live — a parent raising the child it fabricated', () => {
  it('raises it at once when the tag is already defined, downloading nothing', async () => {
    const registry = registryOf(['x-known']);
    const define = vi.fn(async () => {});
    installFabricator(define, registry);
    const el = host('x-known');

    live(el, ['a', 1]);

    // Synchronous: the page that fabricated the second instance of a tag already has it.
    expect(el.raised).toEqual([['a', 1]]);
    expect(define).not.toHaveBeenCalled();
    expect(registry.upgraded).toEqual([el]);
  });

  it('asks the page for the definition when the tag is unknown, and raises after it', async () => {
    const registry = registryOf([]);
    const define = vi.fn(async () => {});
    installFabricator(define, registry);
    const el = host('x-new');

    live(el, ['b']);

    // Not yet: defining a tag is a download, and nothing is raised over a class that is
    // not there — an element with no definition has no `c` to call.
    expect(el.raised).toEqual([]);
    await Promise.resolve();
    expect(define).toHaveBeenCalledWith('x-new');
    await Promise.resolve();
    expect(el.raised).toEqual([['b']]);
  });

  it('raises one element once, however many times it is asked', async () => {
    installFabricator(async () => {}, registryOf(['x-twice']));
    const el = host('x-twice');

    live(el, ['first']);
    live(el, ['second']);

    // A second controller over one element would open a second shadow root and throw. The
    // guard is on the element and not on the tag: two instances are two raisings.
    expect(el.raised).toEqual([['first']]);
    const other = host('x-twice');
    live(other, ['another instance']);
    expect(other.raised).toEqual([['another instance']]);
  });
});
