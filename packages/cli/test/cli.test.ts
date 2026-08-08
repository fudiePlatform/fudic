/**
 * The binary as a shell over the plan API — acceptance criteria §6.9 (`--dry-run` exact),
 * §6.12 (`--json` clean) and §6.13 (no interactivity), plus argv parsing.
 */

import { describe, expect, it } from 'vitest';
import { run, type RunDeps } from '../src/run.js';
import { parseArgs, USAGE } from '../src/args.js';
import { captureStreams, MemoryFs, RecordingRunner } from './helpers.js';

const CWD = '/project';

const LAYOUT = `<!DOCTYPE html>
<html lang="en">
  <head>
    @RenderHead()
  </head>
  <body>
    @RenderSection(nav)
    <main>@RenderBody()</main>
  </body>
</html>
`;

function deps(
  fs: MemoryFs,
  statuses: Readonly<Record<string, number | null>> = {},
): RunDeps & { capture: ReturnType<typeof captureStreams>; runner: RecordingRunner } {
  const capture = captureStreams();
  const runner = new RecordingRunner(statuses);
  return { readIo: fs, writeIo: fs, runner, streams: capture.streams, capture };
}

describe('run()', () => {
  it('exits 1 when a command of the plan fails, after listing what was written', async () => {
    const fs = new MemoryFs({}, CWD);
    const d = deps(fs, { pnpm: 1 });

    expect(await run(['new', 'demo', '--cwd', CWD], d)).toBe(1);

    // The files are reported as created, because they were: a failing install does not
    // unwrite them. The failure comes after, so both facts reach the user.
    expect(d.capture.stdout()).toContain('create  demo/package.json');
    expect(d.capture.stdout()).toContain('error FUD0451');
    expect(d.capture.stdout()).toContain('`pnpm install` exited with code 1');
  });

  it('--dry-run lists exactly what the real run writes, and writes nothing (§6.9)', async () => {
    const argv = ['g', 'component', 'app-card', '--cwd', CWD];

    const dry = new MemoryFs({}, CWD);
    const dryDeps = deps(dry);
    expect(await run([...argv, '--dry-run'], dryDeps)).toBe(0);
    expect(dry.paths()).toEqual([]);
    expect(dryDeps.capture.stdout()).toContain('src/components/app-card.fud');

    const real = new MemoryFs({}, CWD);
    const realDeps = deps(real);
    expect(await run(argv, realDeps)).toBe(0);
    expect(real.paths()).toEqual(['src/components/app-card.fud']);

    const listed = dryDeps.capture
      .stdout()
      .split('\n')
      .filter((line) => line.startsWith('  create') || line.startsWith('  modify'))
      .map((line) => line.trim());
    const written = real.paths().map((path) => `create  ${path}`);
    expect(listed).toEqual(written);
  });

  it('--dry-run shows a modification as a diff (§6.9)', async () => {
    const fs = new MemoryFs(
      { 'src/components/app-card.fud': '<app-card>\n  <template shadowrootmode="open"></template>\n</app-card>\n' },
      CWD,
    );
    const d = deps(fs);
    const code = await run(
      ['g', 'component', 'app-icon', '--cwd', CWD, '--in', 'src/components/app-card.fud', '--dry-run'],
      d,
    );
    expect(code).toBe(0);
    expect(d.capture.stdout()).toContain('+<link rel="component" href="./app-icon.fud">');
    expect(fs.at('src/components/app-card.fud')).not.toContain('app-icon');
  });

  it('--json puts JSON and only JSON on stdout (§6.12)', async () => {
    const fs = new MemoryFs({}, CWD);
    const d = deps(fs);
    expect(await run(['g', 'component', 'app-card', '--cwd', CWD, '--json', '--dry-run'], d)).toBe(0);

    const parsed = JSON.parse(d.capture.stdout()) as { changes: { path: string }[] };
    expect(parsed.changes.map((change) => change.path)).toEqual(['src/components/app-card.fud']);
    expect(d.capture.stderr()).toContain('dry run');
  });

  it('a usage error exits 1 with the usage text, writing nothing (§6.13)', async () => {
    const fs = new MemoryFs({}, CWD);
    const d = deps(fs);
    expect(await run(['g'], d)).toBe(1);
    expect(d.capture.stderr()).toContain('fudic g needs a type');
    expect(d.capture.stderr()).toContain('fudic new <name>');
    expect(fs.paths()).toEqual([]);

    expect(await run(['frobnicate'], deps(fs))).toBe(1);
    expect(await run([], deps(fs))).toBe(0); // no args: usage on stdout, success
  });

  it('an unknown flag is an error, never a silent no-op', async () => {
    const fs = new MemoryFs({}, CWD);
    const d = deps(fs);
    expect(await run(['g', 'component', 'app-card', '--level', '3'], d)).toBe(1);
    expect(d.capture.stderr()).toContain('unknown flag --level');
  });

  it('generates a page against the project layout end to end', async () => {
    const fs = new MemoryFs({ 'src/layouts/_layout.fud': LAYOUT }, CWD);
    const d = deps(fs);
    expect(await run(['g', 'p', 'blog', '--cwd', CWD], d)).toBe(0);
    expect(fs.at('src/routes/blog.fud')).toContain('@section nav {');
    expect(d.runner.commands).toEqual([]); // g never spawns anything
  });
});

describe('parseArgs', () => {
  it('accepts --flag=value, repeated --in, and comma lists', () => {
    const parsed = parseArgs(['g', 'c', 'app-card', '--dir=components', '--in', 'a.fud', '--in', 'b.fud']);
    expect(parsed.kind).toBe('component');
    if (parsed.kind !== 'component') return;
    expect(parsed.opts.dir).toBe('components');
    expect(parsed.opts.wireInto).toEqual(['a.fud', 'b.fud']);
  });

  it('defaults --dir to src/, and the usage text says the same thing (§6.5)', () => {
    const dirOf = (argv: readonly string[]): string => {
      const parsed = parseArgs([...argv]);
      return 'opts' in parsed && 'dir' in parsed.opts ? parsed.opts.dir : '';
    };
    expect(dirOf(['g', 'c', 'app-card'])).toBe('src/components');
    expect(dirOf(['g', 'p', 'blog'])).toBe('src/routes');
    expect(dirOf(['g', 'l', 'admin'])).toBe('src/layouts');

    // Help output is interface: a default that is right in the code and stale in the text is
    // still a wrong default for whoever reads it before running anything.
    expect(USAGE).toContain('(default: src/components)');
    expect(USAGE).toContain('(default: src/routes)');
    expect(USAGE).toContain('(default: src/layouts)');
  });

  it('maps the --no-* flags onto their positive options', () => {
    const parsed = parseArgs(['new', 'demo', '--no-install', '--no-git', '--no-sw', '--pm', 'npm']);
    expect(parsed.kind).toBe('new');
    if (parsed.kind !== 'new') return;
    expect(parsed.opts).toMatchObject({ install: false, git: false, sw: false, pm: 'npm' });
  });

  it('--no-layout and --layout are distinguishable from "not given"', () => {
    const none = parseArgs(['g', 'p', 'solo', '--no-layout']);
    const forced = parseArgs(['g', 'p', 'solo', '--layout', 'layouts/_admin.fud']);
    const absent = parseArgs(['g', 'p', 'solo']);
    expect(none.kind === 'page' && none.opts.layout).toBe(null);
    expect(forced.kind === 'page' && forced.opts.layout).toBe('layouts/_admin.fud');
    expect(absent.kind === 'page' && 'layout' in absent.opts).toBe(false);
  });

  it('rejects a valued flag with no value', () => {
    expect(parseArgs(['g', 'c', 'app-card', '--dir']).kind).toBe('error');
  });
});
