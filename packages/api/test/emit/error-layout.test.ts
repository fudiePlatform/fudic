/**
 * SDD-88 §3.6, criterion 11 (the `.d.ts` half): the `.fudapi` of an error page may declare
 * `layout`, and its handler receives the error it paints as `data: ErrorPage`. Strict `tsc`
 * holds a handler to it: `data.status` is a number, `data.foo` does not exist. The handler of a
 * route keeps its `LoadData`, or `undefined` without `load`.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { declarationsOf, project } from './_project.js';

const TSC = fileURLToPath(new URL('../../../../node_modules/typescript/bin/tsc', import.meta.url));
/** Inside the package's `node_modules`, so `@fudic/http/contract` resolves as it does for an app. */
const DIR = fileURLToPath(new URL(`../../node_modules/.fudic-emit/error-layout-${String(process.pid)}/`, import.meta.url));

const ERROR_CTX = { route: { params: [], error: true, layoutProps: '{ readonly title: string }' } } as const;

/** The project of `_project`, plus an error page with `layout`, as an app's and as a library's. */
function withErrorPage(): ReturnType<typeof project> {
  const p = project({ 'routes/_error': 'layout\n' });
  return { ...p, ctx: { ...p.ctx, 'routes/_error': ERROR_CTX } };
}

describe('layout in _error.fudapi', () => {
  it('its handler receives data: ErrorPage, imported from the contract, and returns the layout props', () => {
    const dts = declarationsOf(withErrorPage(), 'routes/_error');
    expect(dts).toContain(
      'export type LayoutHandler = (ctx: PageContext<{}>, data: ErrorPage) => { readonly title: string } | Promise<{ readonly title: string }>;',
    );
    expect(dts).toMatch(/import type \{[^}]*\bErrorPage\b[^}]*\} from '@fudic\/http\/contract';/u);
  });

  it('a route keeps its LoadData, and undefined without load; neither imports ErrorPage', () => {
    const p = withErrorPage();
    const blog = declarationsOf(p, 'routes/blog/[slug]');
    expect(blog).toContain('data: LoadData)');
    expect(blog).not.toContain('ErrorPage');
    const bare = project({ 'routes/bare': 'layout\n' });
    const noLoad = declarationsOf({ ...bare, ctx: { ...bare.ctx, 'routes/bare': { route: { params: [], pattern: '/bare' } } } }, 'routes/bare');
    expect(noLoad).toContain('data: undefined)');
    expect(noLoad).not.toContain('ErrorPage');
  });

  it('strict tsc: data.status is a number, data.home a string, data.foo an error', () => {
    const p = withErrorPage();
    mkdirSync(join(DIR, 'src', 'server'), { recursive: true });
    writeFileSync(
      join(DIR, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2024',
          module: 'ESNext',
          moduleResolution: 'bundler',
          lib: ['ES2024', 'DOM'],
          strict: true,
          exactOptionalPropertyTypes: true,
          verbatimModuleSyntax: true,
          skipLibCheck: false,
          noEmit: true,
        },
        include: ['src/**/*.ts', '.fudic/api/**/*.d.ts'],
      }),
    );
    for (const id of Object.keys(p.sources)) {
      const file = join(DIR, '.fudic', 'api', `${id}.d.ts`);
      mkdirSync(join(file, '..'), { recursive: true });
      writeFileSync(file, declarationsOf(p, id));
    }
    writeFileSync(
      join(DIR, 'src', 'server', 'error.ts'),
      `import { layout } from 'fudic:routes/_error';

layout.handle((_ctx, data) => {
  const status: number = data.status;
  const home: string = data.home;
  // @ts-expect-error an ErrorPage has no foo
  void data.foo;
  // @ts-expect-error status is a number, not a string
  const wrong: string = data.status;
  void [status, home, wrong];
  return { title: data.title };
});

// @ts-expect-error the layout props are the layout's: a title, a string
layout.handle(() => ({ title: 1 }));
`,
    );
    let output = '';
    try {
      execFileSync(process.execPath, [TSC, '-p', DIR], { encoding: 'utf8' });
    } catch (e) {
      output = String((e as { stdout?: string }).stdout ?? e);
    }
    expect(output).toBe('');
  }, 120_000);
});
