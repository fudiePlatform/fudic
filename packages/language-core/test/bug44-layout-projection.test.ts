/**
 * BUG-44 — what the projection gives a layout's shell and a route's resolver.
 *
 * The client half: `<html>`, `<head>` and `<body>` carry attributes `templateContent` never
 * stepped over, so `<html lang="@culture">` had no program behind it. And a layout reads its
 * props, never `data`.
 *
 * The server half is measured against the real TypeScript language service (criteria 3 and
 * 4): the splices are only worth what `ctx.` and `return { }` then offer.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { VirtualFile } from '../src/types.js';
import { emitClient, registryOf } from './_support.js';
import { languageServiceFor } from './typecheck.js';

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
    @code {
      @server {
        export async function load() { return { lang: 'es' }; }
      }
    }
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

// ── Criterion 3 and 4, through the TypeScript language service ────────────────

const FIXTURES = resolve(fileURLToPath(new URL('../fixtures', import.meta.url)));
const SLUG = 'blog/[slug].fud';
const ORIGINAL = "export function layout(ctx: unknown, data: PageData) {\n      return { culture: data.found ? 'es' : 'en' };\n    }";

/** The route's resolver rewritten with `body`, and the completion names at `marker`. */
function completionsIn(body: string, marker: string): readonly string[] {
  const source = readFileSync(resolve(FIXTURES, SLUG), 'utf8');
  if (!source.includes(ORIGINAL)) throw new Error('fixture anchor not found');
  const { service, pathOf, projected } = languageServiceFor({ [SLUG]: source.replace(ORIGINAL, body) });
  const server = projected
    .find(({ file }) => file.path === SLUG)!
    .virtuals.find((v) => v.fileName.endsWith('.server.ts'))!;
  const at = server.text.indexOf(marker);
  if (at === -1) throw new Error(`marker not in the projection: ${marker}`);
  const completions = service.getCompletionsAtPosition(pathOf(server.fileName), at + marker.length, {});
  return (completions?.entries ?? []).map((entry) => entry.name);
}

describe('ctx and data autocomplete (criterion 3)', () => {
  it('`ctx.` lists the context, `inject` included', () => {
    const names = completionsIn(
      'export function layout(ctx, data) {\n      ctx.\n      return { culture: "es" };\n    }',
      'ctx.',
    );
    expect(names).toEqual(
      expect.arrayContaining(['url', 'params', 'origin', 'mode', 'nonce', 'inject']),
    );
  });

  it('`ctx.params.` lists the route’s own params', () => {
    const names = completionsIn(
      'export function layout(ctx, data) {\n      ctx.params.\n      return { culture: "es" };\n    }',
      'ctx.params.',
    );
    expect(names).toEqual(['slug']);
  });

  it('`data.` lists what `load` returns', () => {
    const names = completionsIn(
      'export function layout(ctx, data) {\n      data.\n      return { culture: "es" };\n    }',
      'data.',
    );
    expect(names).toEqual(expect.arrayContaining(['title', 'tag', 'body', 'found', 'note']));
  });
});

describe('the resolver’s `return { }` lists the layout’s props (criterion 4)', () => {
  it('the required and the optional, and no member of a promise', () => {
    const names = completionsIn(
      'export function layout(ctx, data) {\n      return {  };\n    }',
      'return {  ',
    );
    expect(names).toEqual(expect.arrayContaining(['culture', 'theme']));
    expect(names).not.toContain('then');
    expect(names).not.toContain('catch');
    expect(names).not.toContain('finally');
  });

  it('in an `async` resolver too', () => {
    const names = completionsIn(
      'export async function layout(ctx, data) {\n      return {  };\n    }',
      'return {  ',
    );
    expect(names).toEqual(expect.arrayContaining(['culture', 'theme']));
    expect(names).not.toContain('then');
  });
});
