/**
 * `renderSnippet`: one snippet, expanded where it always is — inside whoever renders it
 * (§3.9, §4.10).
 *
 * A snippet does not exist at runtime, so the harness writes a host component that links the
 * snippet file, declares the values of `scope` as literals and renders the call in its shadow
 * root, and mounts it as `mount` mounts any component. The components the snippet instantiates
 * come with it, as they do in a page.
 */

import { dirname, resolve } from 'node:path';
import { expect } from 'vitest';
import { cachedAs, hashOf } from './cache.js';
import { FILE_EXPORT } from './constants.js';
import { snippetHost } from './host.js';
import { mount, type Mounted } from './mount.js';

export interface SnippetOptions {
  /** The values the call reads by name, with `@` as in a `.fud`: `fila(@item)`. JSON only. */
  readonly scope?: Readonly<Record<string, unknown>>;
}

/** The tag every host is named with, before its hash. */
const TAG = 'fudic-snippet';

/**
 * Render `call` — what follows `@render` — of the snippets in `file`, relative to the test, and
 * hand back the host it was rendered in.
 */
export async function renderSnippet(
  file: string,
  call: string,
  options: SnippetOptions = {},
): Promise<Mounted<Record<string, never>>> {
  // The test that is running, which `file` is relative to: vitest always knows it inside a test.
  const path = resolve(dirname(expect.getState().testPath!), file);
  const input = { file: path, call, scope: options.scope ?? {} };
  // Named by what it renders, and the tag by the same hash: a component is named after its file.
  const tag = `${TAG}-${hashOf(snippetHost({ ...input, tag: TAG }))}`;
  const host = cachedAs(`${tag}.fud`, snippetHost({ ...input, tag }));
  return mount({ tag, [FILE_EXPORT]: host });
}
