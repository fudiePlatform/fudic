/**
 * BUG-44 — what the projection gives a layout's shell and a route's resolver.
 *
 * The client half: `<html>`, `<head>` and `<body>` carry attributes `templateContent` never
 * stepped over, so `<html lang="@culture">` had no program behind it. And a layout reads its
 * props, never `data`.
 *
 * The server half (criteria 3 and 4) went with `@server`: see the note at the end.
 */

import { describe, expect, it } from 'vitest';
import type { VirtualFile } from '../src/types.js';
import { emitClient, registryOf } from './_support.js';

const LAYOUT = `<!DOCTYPE html>
<html lang="@culture">
  <head>
    @code {
      const { culture, seccion } = props<{ culture: string; seccion: string }>();
    }
    <meta property="article:section" content="@seccion">
    @RenderHead()
  </head>
  <body data-x="@culture">
    @RenderBody()
  </body>
</html>
`;

const PAGE = `<!DOCTYPE html>
<html lang="@data.lang">
  <head>
    <link rel="server" href="./index.fudapi">
    <title>t</title>
  </head>
  <body class="@data.lang">
    <p>hi</p>
  </body>
</html>
`;

/** The generated text a mapping of `source`'s `nth` occurrence of `text` lands on. */
function mappedAt(virtual: VirtualFile, source: string, text: string, nth = 0): string | undefined {
  let at = -1;
  for (let i = 0; i <= nth; i++) at = source.indexOf(text, at + 1);
  const m = virtual.mappings.find(
    (mapping) => mapping.sourceOffset === at && mapping.sourceLength === text.length,
  );
  return m === undefined ? undefined : virtual.text.slice(m.generatedOffset, m.generatedOffset + m.length);
}

describe('the shell’s own attributes are projected (BUG-44 §3.2)', () => {
  it('maps a layout’s `<html lang="@culture">` and `<body data-x="@culture">` to the `.fud`', () => {
    const virtual = emitClient(LAYOUT, '_layout.fud');
    // The first and the last `culture` of the file: `<html lang>` and `<body data-x>`.
    expect(mappedAt(virtual, LAYOUT, 'culture', 0)).toBe('culture');
    expect(mappedAt(virtual, LAYOUT, 'culture', 3)).toBe('culture');
  });

  it('does the same for a page', () => {
    const virtual = emitClient(PAGE, 'routes/index.fud', registryOf({}));
    expect(mappedAt(virtual, PAGE, 'data.lang', 0)).toBe('data.lang');
    expect(mappedAt(virtual, PAGE, 'data.lang', 1)).toBe('data.lang');
  });

  it('declares `data` for a page and never for a layout', () => {
    expect(emitClient(PAGE, 'routes/index.fud').text).toContain('declare const data');
    expect(emitClient(LAYOUT, '_layout.fud').text).not.toContain('declare const data');
  });
});

// Criteria 3 and 4 — `ctx.`, `data.` and `return { }` in the route's resolver — left with the
// `@server` they completed in: `layout.handle` is a `.ts` of `src/server`, and what it is
// offered is TypeScript's over the `.d.ts` of the `.fudapi` (SDD-60 §3.4, §3.11).
