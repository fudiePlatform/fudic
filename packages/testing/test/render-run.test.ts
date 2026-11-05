/**
 * `renderPiece` (SDD-78 criteria 2, 3 and 5, as the MCP asks for them): one piece painted by the
 * project's own vitest. The project is `render-project/`: its own config, a component with a
 * fixture, one that does not compile, and a page.
 */

import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { RENDER_DIR, renderPiece, renderSource } from '../src/render-run.js';

const at = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
const ROOT = at('./render-project/');
const TILE = at('./render-project/src/components/x-tile.fud');
const FIXTURE = at('./render-project/src/components/x-tile.fixture.ts');

/** A vitest run inside a test is a whole run: seconds, not milliseconds. */
const SLOW = 120_000;

/** Nothing is left behind under `.fudic/render`. */
function leftBehind(root: string): readonly string[] {
  const dir = `${root}${RENDER_DIR}`;
  return existsSync(dir) ? readdirSync(dir) : [];
}

describe('the test file that paints', () => {
  test('a route', () => {
    expect(renderSource({ root: '/p', target: { route: '/a?b' } }, 'C:\\p\\.fudic\\render\\1.json')).toBe(
      [
        "import { writeFileSync } from 'node:fs';",
        "import { test } from 'vitest';",
        "import { renderJob } from '@fudic/testing/render';",
        '',
        "test('fudic render', async () => {",
        '  writeFileSync("C:/p/.fudic/render/1.json", JSON.stringify(await renderJob({ target: { route: "/a?b" } })));',
        '}, 60_000);',
        '',
      ].join('\n'),
    );
  });

  test('a component with its fixture, a case, props and a selector, imported relative to the test file', () => {
    const source = renderSource(
      {
        root: '/p',
        target: { component: resolve('/p/src/x.fud'), fixture: resolve('/p/src/x.fixture.ts'), case: 'big', props: { n: 1 } },
        select: 'b',
      },
      resolve('/p/.fudic/render/out.json'),
    );
    expect(source).toContain('import * as piece from "./../../src/x.fud";');
    expect(source).toContain('import fixture from "./../../src/x.fixture.ts";');
    expect(source).not.toMatch(/from "[A-Za-z]:|from "\//u);
    expect(source).toContain('renderJob({ target: { component: piece, fixture, case: "big", props: {"n":1} }, select: "b" })');
  });

  test('a component alone', () => {
    const source = renderSource({ root: '/p', target: { component: resolve('/p/src/x.fud') } }, resolve('/p/.fudic/render/out.json'));
    expect(source).not.toContain('fixture');
    expect(source).toContain('import * as piece from "./../../src/x.fud";');
    expect(source).toContain('renderJob({ target: { component: piece } })');
  });
});

describe('a piece painted by the project', () => {
  test(
    'a component with a case and props on top, its files gone after',
    async () => {
      const out = await renderPiece({ root: ROOT, target: { component: TILE, fixture: FIXTURE, case: 'disabled', props: { label: 'Keep' } } });
      expect(out).toMatchObject({
        kind: 'rendered',
        outline: '- button "Keep" [disabled]',
        html: '<x-tile><template shadowrootmode="open"> <button disabled="">Keep</button> </template></x-tile>',
        calls: [],
      });
      expect(leftBehind(ROOT)).toEqual([]);
    },
    SLOW,
  );

  test(
    'a route, narrowed by a selector',
    async () => {
      const out = await renderPiece({ root: ROOT, target: { route: '/' }, select: 'h1' });
      expect(out).toMatchObject({ kind: 'rendered', status: 200, outline: '- heading "Home" [level=1]', html: '<h1>Home</h1>' });
    },
    SLOW,
  );

  test(
    'what renderJob answers that is no painting comes back as it is',
    async () => {
      expect(await renderPiece({ root: ROOT, target: { component: TILE, fixture: FIXTURE, case: 'big' } })).toEqual({
        kind: 'no-case',
        cases: ['primary', 'disabled'],
      });
    },
    SLOW,
  );
});

describe('a piece that never got painted', () => {
  test(
    'a .fud that does not compile: what the compiler says, placed in it',
    async () => {
      const out = await renderPiece({ root: ROOT, target: { component: at('./render-project/src/components/x-broken.fud') } });
      expect(out.kind).toBe('broken');
      const diagnostics = (out as { diagnostics: readonly { code: string; file: string | null }[] }).diagnostics;
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics.every((d) => d.file === 'src/components/x-broken.fud')).toBe(true);
      expect(leftBehind(ROOT)).toEqual([]);
    },
    SLOW,
  );

  test(
    'a module that is not there: the first line of the error, as what could not run',
    async () => {
      const out = await renderPiece({ root: ROOT, target: { component: at('./render-project/src/components/x-none.fud') } });
      expect(out).toEqual({
        kind: 'broken',
        diagnostics: [
          { code: 'FUD1207', severity: 'error', message: expect.stringContaining('x-none.fud'), file: null, line: null, column: null },
        ],
      });
    },
    SLOW,
  );

  test(
    'a vitest that runs and skips it: the render did not run',
    async () => {
      expect(await renderPiece({ root: at('./render-skip/'), target: { route: '/' } })).toEqual({
        kind: 'broken',
        diagnostics: [
          { code: 'FUD1207', severity: 'error', message: expect.stringContaining('the render did not run'), file: null, line: null, column: null },
        ],
      });
    },
    SLOW,
  );

  test(
    'a vitest that leaves the file out: what vitest says, as what could not run',
    async () => {
      const root = at('./render-none/');
      expect(await renderPiece({ root, target: { route: '/' } })).toEqual({
        kind: 'broken',
        diagnostics: [
          { code: 'FUD1207', severity: 'error', message: 'could not run: No test files found', file: null, line: null, column: null },
        ],
      });
      expect(leftBehind(root)).toEqual([]);
    },
    SLOW,
  );

  test(
    'a vitest that cannot start: why, and nothing left behind',
    async () => {
      const root = at('./run-broken/');
      expect(await renderPiece({ root, target: { route: '/' } })).toEqual({
        kind: 'broken',
        diagnostics: [
          { code: 'FUD1207', severity: 'error', message: expect.stringContaining('this config is broken'), file: null, line: null, column: null },
        ],
      });
      expect(leftBehind(root)).toEqual([]);
    },
    SLOW,
  );
});
