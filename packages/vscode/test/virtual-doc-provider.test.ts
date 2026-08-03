/**
 * The store behind the read-only views (SDD-25 §4.3).
 *
 * Every round trip here goes through `URI` — the very implementation VS Code uses — and not
 * through the string the store handed back. That distinction is the whole test: the previous
 * version asserted `get(put(...))` against its own encoding, so it round-tripped
 * `encodeURIComponent` with itself and passed while every virtual file in the editor opened
 * blank. What the editor actually does is `Uri.parse` the string and hand the provider a `Uri`.
 */

import { describe, expect, it } from 'vitest';
import { URI } from 'vscode-uri';
import { VIRTUAL_SCHEME, createVirtualDocStore } from '../src/virtual-doc-provider.js';

/** What the content provider receives: the URI as VS Code reconstitutes it. */
const asProviderSees = (uri: string): string => URI.parse(uri).path;

describe('createVirtualDocStore', () => {
  it('round-trips a virtual through a real Uri, not through its own encoding', () => {
    const store = createVirtualDocStore();
    const uri = store.put('[slug].fud.ts', 'export {}');

    expect(uri.startsWith(`${VIRTUAL_SCHEME}:`)).toBe(true);
    expect(store.get(asProviderSees(uri))).toBe('export {}');
  });

  it('finds a virtual named by an absolute path, slashes and drive letter included', () => {
    // The name a virtual really has: the absolute path of the `.fud` plus a suffix. This is
    // the case that was broken. `encodeURIComponent` escapes `/` as `%2F`; VS Code's own
    // encoder leaves `/` alone and escapes `:`. Keyed on the URI text, the two never met.
    const store = createVirtualDocStore();
    const name = 'c:/Users/Home/proj/components/app-button.fud.ts';
    const uri = store.put(name, 'client virtual');

    expect(URI.parse(uri).toString()).not.toBe(uri); // the two encoders disagree, on purpose
    expect(store.get(asProviderSees(uri))).toBe('client virtual');
  });

  it('encodes a name that is full of URI syntax', () => {
    // A route component really is called `blog/[slug].fud.ts`. The slash would become path
    // structure and the brackets are reserved — both would come back as a different name,
    // and the point of the command is showing the user the name they are looking for.
    const store = createVirtualDocStore();
    const uri = store.put('blog/[slug].fud.ts', 'x');

    expect(uri).toBe(`${VIRTUAL_SCHEME}:blog%2F%5Bslug%5D.fud.ts`);
    expect(asProviderSees(uri)).toBe('blog/[slug].fud.ts');
    expect(store.get(asProviderSees(uri))).toBe('x');
  });

  it('keeps the three virtuals of one document apart', () => {
    const store = createVirtualDocStore();
    const client = store.put('c:/p/x.fud.ts', 'client');
    const server = store.put('c:/p/x.fud.server.ts', 'server');
    const style = store.put('c:/p/x.fud.0.css', '.a { color: red }');

    expect(store.get(asProviderSees(client))).toBe('client');
    expect(store.get(asProviderSees(server))).toBe('server');
    expect(store.get(asProviderSees(style))).toBe('.a { color: red }');
  });

  it('answers an unknown URI with an empty document', () => {
    // VS Code asks again for content after a window reload, when the store is gone. An
    // empty editor is the right answer; a crash in a content provider is not.
    expect(createVirtualDocStore().get('never-stored')).toBe('');
  });
});
