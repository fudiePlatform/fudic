/**
 * The store behind the read-only views (SDD-25 §4.3).
 */

import { describe, expect, it } from 'vitest';
import { VIRTUAL_SCHEME, createVirtualDocStore } from '../src/virtual-doc-provider.js';

describe('createVirtualDocStore', () => {
  it('round-trips a virtual by its URI', () => {
    const store = createVirtualDocStore();
    const uri = store.put('[slug].fud.ts', 'export {}');

    expect(uri.startsWith(`${VIRTUAL_SCHEME}:`)).toBe(true);
    expect(store.get(uri)).toBe('export {}');
  });

  it('encodes a name that is full of URI syntax', () => {
    // A route component really is called `blog/[slug].fud.ts`. The slash would become path
    // structure and the brackets are reserved — both would come back as a different name,
    // and the point of the command is showing the user the name they are looking for.
    const store = createVirtualDocStore();
    const uri = store.put('blog/[slug].fud.ts', 'x');

    expect(uri).toBe(`${VIRTUAL_SCHEME}:blog%2F%5Bslug%5D.fud.ts`);
    expect(store.get(uri)).toBe('x');
  });

  it('keeps several virtuals of the same document apart', () => {
    const store = createVirtualDocStore();
    const client = store.put('x.fud.ts', 'client');
    const server = store.put('x.fud.server.ts', 'server');

    expect(store.get(client)).toBe('client');
    expect(store.get(server)).toBe('server');
  });

  it('answers an unknown URI with an empty document', () => {
    // VS Code asks again for content after a window reload, when the store is gone. An
    // empty editor is the right answer; a crash in a content provider is not.
    expect(createVirtualDocStore().get('fudic-virtual:never-stored')).toBe('');
  });
});
