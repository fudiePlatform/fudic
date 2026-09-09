/**
 * `live` before anything installs a page runtime.
 *
 * Its own file because what is under test is the state of the module BEFORE anyone installs
 * anything, and a test file is the only place that state exists once.
 *
 * The behaviour is deliberate and it is not a production path: without a page runtime there
 * is nobody to download a chunk, so the platform registry is all there is — the instance
 * comes up if something else defines the tag, and waits otherwise. What it must not do is
 * throw, or raise a host before its definition exists.
 */

import { describe, expect, it } from 'vitest';
import { live } from '../../src/hydrate/live.js';

describe('live with no runtime installed', () => {
  it('waits for the platform registry, and raises when the tag arrives', async () => {
    const raised: unknown[][] = [];
    // The `c` is hung on the element rather than coming from a class: this environment does
    // not upgrade, and what is under test is WHEN the raise happens, not who defines it.
    const el = document.createElement('x-late') as unknown as Element & {
      c: (props: readonly unknown[]) => void;
    };
    el.c = (props): void => {
      raised.push([...props]);
    };

    live(el, ['waited']);
    // Nothing yet: the tag is unknown, so there is no class for the instance to be.
    expect(raised).toEqual([]);

    customElements.define('x-late', class extends HTMLElement {});
    await customElements.whenDefined('x-late');
    await Promise.resolve();

    expect(raised).toEqual([['waited']]);
  });
});
