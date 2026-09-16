/**
 * SDD-42 §5, criterion 10 on the build side: a `styles` entry that names a file which is
 * not there stops the build (`FUD0740`).
 *
 * Fatal, unlike a malformed `fudic.json`, and the difference is whether there is a correct
 * behaviour to degrade to. A project with no configuration renders as it did before SDD-41;
 * a project whose style guide silently did not load renders like a project that has none,
 * and looks exactly the same in the terminal.
 */

import { describe, it, expect } from 'vitest';
import { build, type Rollup } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fudic } from '../src/index.js';
import { runtimeAlias } from './helpers/alias.js';
import { allCode } from './helpers/output.js';

const PAGE = `<!DOCTYPE html>
<html>
<head><title>Home</title></head>
<body><h1>hola</h1></body>
</html>
`;

/** The same page, but naming a component so the project defines one. */
const PAGE_WITH_COMPONENT = `<!DOCTYPE html>
<html>
<head><link rel="component" href="../components/s-plain.fud"><title>Home</title></head>
<body><s-plain></s-plain></body>
</html>
`;

const PLAIN =
  '<s-plain><template shadowrootmode="open"><span><slot></slot></span></template></s-plain>\n';

interface BuildOut {
  readonly warnings: readonly string[];
  readonly code: string;
}

/** A project whose `fudic.json` declares `styles`, with whatever files are given. */
async function buildWith(
  styles: readonly string[],
  files: Record<string, string>,
  page = PAGE,
): Promise<BuildOut> {
  const root = mkdtempSync(join(tmpdir(), 'fudic-styles-'));
  mkdirSync(join(root, 'src', 'routes'), { recursive: true });
  mkdirSync(join(root, 'src', 'styles'), { recursive: true });
  mkdirSync(join(root, 'src', 'components'), { recursive: true });
  writeFileSync(join(root, 'src', 'routes', 'index.fud'), page);
  writeFileSync(join(root, 'fudic.json'), JSON.stringify({ id: 'test', styles }));
  // A Service Worker, so the build publishes a render chunk to assert on: since SDD-27 §5.1
  // the `page` chunks are pruned and `sw/c` is the render code that actually ships.
  writeFileSync(join(root, 'sw.json'), JSON.stringify({ shell: [] }));
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(join(root, name), text);
  }
  const warnings: string[] = [];
  const result = (await build({
    root,
    logLevel: 'silent',
    resolve: { alias: { ...runtimeAlias } },
    plugins: [fudic()],
    build: {
      write: false,
      minify: false,
      rollupOptions: { onwarn: (w: Rollup.RollupLog) => warnings.push(w.message) },
    },
  })) as unknown as { output: Parameters<typeof allCode>[0] };
  return { warnings, code: allCode(result.output) };
}

describe('vite build — the project style guide', () => {
  it('FUD0740: a sheet that is not there stops the build, naming the path as written', async () => {
    await expect(buildWith(['src/styles/theme.css'], {})).rejects.toThrow(/FUD0740/u);
  }, 120000);

  it('FUD0741: two sheets that would adopt under the same specifier stop it too', async () => {
    await expect(
      buildWith(['src/styles/theme.css', 'src/routes/theme.css'], {
        'src/styles/theme.css': '.a{color:red}',
        'src/routes/theme.css': '.b{color:blue}',
      }),
    ).rejects.toThrow(/FUD0741/u);
  }, 120000);

  it('FUD0742: a guide nothing can adopt builds, and says so once', async () => {
    const { warnings } = await buildWith(['src/styles/theme.css'], {
      'src/styles/theme.css': ':host{--gap:8px}',
    });
    const raised = warnings.filter((w) => w.includes('FUD0742'));
    // Once, not once per route: what it is about is the project, not a file.
    expect(raised).toHaveLength(1);
    expect(raised[0]).toContain('<link rel="stylesheet">');
  }, 120000);

  it('FUD0743: a document-only rule is warned once, and the sheet ships whole', async () => {
    const { warnings, code } = await buildWith(
      ['src/styles/theme.css'],
      {
        'src/styles/theme.css': ':host{--gap:8px}\n:root{--brand:red}\n',
        'src/components/s-plain.fud': PLAIN,
      },
      PAGE_WITH_COMPONENT,
    );
    const raised = warnings.filter((w) => w.includes('FUD0743'));
    // Once per sheet, not once per route it travels into: the reading happens where the
    // file is read, and the build emits the same sheet into several modules.
    expect(raised).toHaveLength(1);
    expect(raised[0]).toContain('src/styles/theme.css:2:1');
    // An advice, not a pruning (§4.5): the rule is still in the document.
    expect(code).toContain('--brand:red');
  }, 120000);

  it('§6.7 a project with a guide and no styled component still ships the polyfill', async () => {
    const { warnings, code } = await buildWith(
      ['src/styles/theme.css'],
      {
        'src/styles/theme.css': ':host{--gap:8px}',
        'src/components/s-plain.fud': PLAIN,
      },
      PAGE_WITH_COMPONENT,
    );
    // It defines a component now, so the sheet is adopted somewhere.
    expect(warnings.filter((w) => w.includes('FUD0742'))).toEqual([]);
    // The VALUE and never the name: the nested build renames every local, so `PROJECT_STYLES`
    // is not in the output and only what it held survives.
    expect(code).toContain('_theme');
    expect(code).toContain('--gap:8px');
    // BUG-31 §T3 widened: there is something to adopt, so the thing that adopts it ships.
    expect(code).toContain('adoptedStyleSheets');
  }, 120000);
});
