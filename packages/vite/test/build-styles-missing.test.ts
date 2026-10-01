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

/** What `fudic.json` declares about sheets: the two maps of SDD-46. */
interface Sheets {
  readonly globalStyles?: Readonly<Record<string, string>>;
  readonly styles?: Readonly<Record<string, string>>;
}

/** The guide every test below starts from: one global sheet, `theme`. */
const THEME: Sheets = { globalStyles: { theme: 'src/styles/theme.css' } };

/** A project whose `fudic.json` declares `sheets`, with whatever files are given. */
async function buildWith(
  sheets: Sheets,
  files: Record<string, string>,
  page = PAGE,
): Promise<BuildOut> {
  const root = mkdtempSync(join(tmpdir(), 'fudic-styles-'));
  mkdirSync(join(root, 'src', 'routes'), { recursive: true });
  mkdirSync(join(root, 'src', 'styles'), { recursive: true });
  mkdirSync(join(root, 'src', 'components'), { recursive: true });
  writeFileSync(join(root, 'src', 'routes', 'index.fud'), page);
  writeFileSync(join(root, 'fudic.json'), JSON.stringify({ id: 'test', ...sheets }));
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
    await expect(buildWith(THEME, {})).rejects.toThrow(/FUD0740/u);
  }, 120000);

  it('FUD0741: one name in both maps stops it too', async () => {
    await expect(
      buildWith(
        { globalStyles: { theme: 'src/styles/theme.css' }, styles: { theme: 'src/routes/theme.css' } },
        {
          'src/styles/theme.css': '.a{color:red}',
          'src/routes/theme.css': '.b{color:blue}',
        },
      ),
    ).rejects.toThrow(/FUD0741/u);
  }, 120000);

  it('FUD0742: a guide nothing can adopt builds, and says so once', async () => {
    const { warnings } = await buildWith(THEME, {
      'src/styles/theme.css': ':host{--gap:8px}',
    });
    const raised = warnings.filter((w) => w.includes('FUD0742'));
    // Once, not once per route: what it is about is the project, not a file.
    expect(raised).toHaveLength(1);
    expect(raised[0]).toContain('<link rel="stylesheet">');
  }, 120000);

  it('FUD0743: a document-only rule is warned once, and the page does not get it', async () => {
    const { warnings, code } = await buildWith(
      THEME,
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
    // And since SDD-49 the page gets only what it can use: `:root` matches nothing inside a
    // shadow root, so the rule the warning is about does not travel.
    expect(code).not.toContain('--brand:red');
  }, 120000);

  it('§6.7 a project with a guide and no styled component still ships the polyfill', async () => {
    const { warnings, code } = await buildWith(
      THEME,
      {
        // The token is used, so the prune (SDD-49) keeps it and there is CSS to adopt.
        'src/styles/theme.css': ':host{--gap:8px}span{padding:var(--gap)}',
        'src/components/s-plain.fud': PLAIN,
      },
      PAGE_WITH_COMPONENT,
    );
    // It defines a component now, so the sheet is adopted somewhere.
    expect(warnings.filter((w) => w.includes('FUD0742'))).toEqual([]);
    // The VALUE and never the name: the nested build renames every local, so `PROJECT_STYLES`
    // is not in the output and only what it held survives.
    expect(code).toContain('"theme"');
    expect(code).toContain('--gap:8px');
    // BUG-31 §T3 widened: there is something to adopt, so the thing that adopts it ships.
    expect(code).toContain('adoptedStyleSheets');
  }, 120000);
});

/** A page with two components: `s-pick` chooses `panel`, `s-plain` chooses nothing. */
const PAGE_WITH_TWO = `<!DOCTYPE html>
<html>
<head>
<link rel="component" href="../components/s-pick.fud">
<link rel="component" href="../components/s-plain.fud">
<title>Home</title>
</head>
<body><s-pick></s-pick><s-plain></s-plain></body>
</html>
`;

const pick = (chosen: string): string =>
  // `class="panel"`: the chosen sheet is pruned against this template (SDD-49), and a rule
  // that matches nothing in it would not travel.
  `<s-pick><template shadowrootmode="open" shadowrootadoptedstylesheets="${chosen}"><span class="panel"><slot></slot></span></template></s-pick>\n`;

const CHOOSING: Sheets = {
  globalStyles: { theme: 'src/styles/theme.css' },
  styles: { panel: 'src/styles/panel.css', extra: 'src/styles/extra.css' },
};

const SHEETS = {
  'src/styles/theme.css': ':host{--gap:8px}',
  'src/styles/panel.css': '.panel{padding:1rem}',
  'src/styles/extra.css': '.extra{margin:0}',
  'src/components/s-plain.fud': PLAIN,
};

describe('vite build — the sheets a component chooses (SDD-46)', () => {
  it('puts the chosen sheets after the global ones, in the order written', async () => {
    const { code } = await buildWith(CHOOSING, { ...SHEETS, 'src/components/s-pick.fud': pick('extra panel') }, PAGE_WITH_TWO);
    expect(code).toContain('theme extra panel');
    // The one that chose nothing adopts the guide alone.
    expect(code).not.toContain('theme extra panel s-plain');
  }, 120000);

  it('hoists a chosen sheet only where some component chooses it', async () => {
    const chosen = await buildWith(CHOOSING, { ...SHEETS, 'src/components/s-pick.fud': pick('panel') }, PAGE_WITH_TWO);
    expect(chosen.code).toContain('.panel{padding:1rem}');
    expect(chosen.code).not.toContain('.extra{margin:0}');
  }, 120000);

  it('FUD0744: a name the project does not declare stops the build, naming the word', async () => {
    await expect(
      buildWith(CHOOSING, { ...SHEETS, 'src/components/s-pick.fud': pick('panel nope') }, PAGE_WITH_TWO),
    ).rejects.toThrow(/FUD0744[\s\S]*"nope"/u);
  }, 120000);

  it('FUD0744 says the project declares none when it has no `styles`', async () => {
    await expect(
      buildWith(THEME, { ...SHEETS, 'src/components/s-pick.fud': pick('panel') }, PAGE_WITH_TWO),
    ).rejects.toThrow(/declares none/u);
  }, 120000);
});
