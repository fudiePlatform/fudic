/**
 * The guide does not lie (criterion 8): every example is built as `fudic build` would build it,
 * in a fresh copy of what `fudic new` writes. The good blocks of a topic go into one copy
 * together and must build with no diagnostic; each `broken=FUDnnnn` block goes alone into its
 * own copy and must fail with that code. The unit tests the `testing` topic shows must pass.
 * Every «Instead of…» row names a code the catalogue has.
 */

import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apply, nodeReadIo, nodeWriteIo, planNew, type NewOptions } from '@fudic/cli';
import { explain } from '@fudic/diagnostics/explain';
import { TOPICS, type Topic } from '../src/guide.js';
import { ALL_BLOCKS, insteadRows, type Block } from './blocks.js';

/** The packages this test declares stand in for the ones `fudic add` and `fudic g` install. */
const MODULES = fileURLToPath(new URL('../node_modules', import.meta.url));
const VITE = join(MODULES, 'vite', 'bin', 'vite.js');
const VITEST = join(MODULES, 'vitest', 'vitest.mjs');

/** What a page of the example does not use is said, and it is true: a warning, not an error. */
const TRUE_WARNINGS: Readonly<Partial<Record<Topic, readonly string[]>>> = { 'html-css': ['FUD0742', 'FUD0852'] };

interface Run {
  readonly ok: boolean;
  readonly codes: readonly string[];
  readonly text: string;
}

let work: string;
let template: string;
let serial = 0;

function options(cwd: string): NewOptions {
  return { cwd, force: false, id: 'demo', prefix: 'app', pm: 'pnpm', install: false, git: false, sw: true, layout: { own: '_layout' }, target: 'static' };
}

/** A copy of the new app, with what `fudic add` / `fudic g` would have added for `blocks`. */
function project(blocks: readonly Block[]): string {
  serial += 1;
  const dir = join(work, `p${serial}`);
  cpSync(template, dir, { recursive: true });
  symlinkSync(MODULES, join(dir, 'node_modules'), 'junction');
  const extra = new Set<string>();
  for (const b of blocks) {
    for (const m of b.body.matchAll(/from\s+['"](@fudic\/[a-z-]+)/gu)) extra.add(m[1]!);
    if (b.lang === 'fudapi') extra.add('@fudic/http');
    if (b.lang === 'fudapi' && (/^form\s/mu.test(b.body) || /^ {4,}(required|max-length|min-length|pattern|min|max)\b/mu.test(b.body))) {
      extra.add('@fudic/forms');
    }
  }
  const file = join(dir, 'package.json');
  const pkg = JSON.parse(readFileSync(file, 'utf8')) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
  for (const name of extra) if (!(name in pkg.dependencies) && !(name in pkg.devDependencies)) pkg.dependencies[name] = '0.0.1';
  writeFileSync(file, JSON.stringify(pkg, null, 2));
  for (const b of blocks) {
    const target = join(dir, b.path!);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, b.body);
  }
  return dir;
}

function node(dir: string, args: readonly string[]): Promise<Run> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let text = '';
    child.stdout.on('data', (c: Buffer) => (text += c.toString('utf8')));
    child.stderr.on('data', (c: Buffer) => (text += c.toString('utf8')));
    child.on('close', (status) => resolve({ ok: status === 0, codes: [...new Set(text.match(/\b(FUD\d{4}|TS\d{4,5})\b/gu) ?? [])].sort(), text }));
  });
}

const build = (blocks: readonly Block[]): Promise<Run> => node(project(blocks), [VITE, 'build', '--logLevel', 'warn']);

/** A few at a time: each build is a process of its own. */
async function pool<T, R>(items: readonly T[], size: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array<R>(items.length);
  let next = 0;
  const lane = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      out[i] = await work(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: size }, lane));
  return out;
}

const files = ALL_BLOCKS.filter((b) => b.path !== undefined);
const good = (topic: Topic): readonly Block[] => files.filter((b) => b.topic === topic && b.broken === undefined);
const broken = files.filter((b) => b.broken !== undefined);
const tests = files.filter((b) => b.broken === undefined && b.path!.endsWith('.test.ts'));

/**
 * The tests of the testing topic, with what they test: the pieces they import are shown in other
 * topics, in the same folder (the post of fudspec, the pipe of view).
 */
function withCompanions(blocks: readonly Block[]): readonly Block[] {
  const have = new Set(blocks.map((b) => b.path));
  const dirs = new Set(tests.map((b) => dirname(b.path!)));
  const companions = files.filter((b) => b.broken === undefined && b.topic !== 'testing' && dirs.has(dirname(b.path!)) && !have.has(b.path));
  return [...blocks, ...companions.filter((b, i) => companions.findIndex((c) => c.path === b.path) === i)];
}

const goodRuns =new Map<Topic, Run>();
const brokenRuns = new Map<Block, Run>();
let testRun: Run;

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), 'fudic-guide-'));
  template = join(work, 'template');
  const opts = options(work);
  await apply(await planNew('template', { ...opts, id: 'template' }, nodeReadIo()), opts, nodeWriteIo());
  type Job = { readonly topic: Topic } | { readonly block: Block } | { readonly tests: true };
  const jobs: Job[] = [...TOPICS.map((topic) => ({ topic })), ...broken.map((block) => ({ block })), { tests: true }];
  await pool(jobs, 4, async (job) => {
    if ('topic' in job) goodRuns.set(job.topic, await build(good(job.topic)));
    else if ('block' in job) brokenRuns.set(job.block, await build([job.block]));
    else testRun = await node(project(withCompanions(good('testing'))), [VITEST, 'run']);
  });
}, 900_000);

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

describe('every example of the guide is true (criterion 8)', () => {
  it('every fud, fudapi and fudspec block says where it goes', () => {
    const loose = ALL_BLOCKS.filter((b) => ['fud', 'fudapi', 'fudspec'].includes(b.lang) && b.path === undefined);
    expect(loose.map((b) => `${b.topic}.md:${b.line}`)).toEqual([]);
  });

  it('every topic has fud examples, and some say what not to write', () => {
    expect(files.filter((b) => b.lang === 'fud' && b.broken === undefined).length).toBeGreaterThan(20);
    expect(broken.length).toBeGreaterThanOrEqual(10);
  });

  it.each(TOPICS.map((t) => [t]))('the good blocks of %s build together with no diagnostic', (topic) => {
    const run = goodRuns.get(topic)!;
    expect(run.ok, run.text).toBe(true);
    expect(run.codes, run.text).toEqual(TRUE_WARNINGS[topic] ?? []);
  });

  it.each(broken.map((b) => [`${b.topic}.md:${b.line}`, b.broken!, b]))('%s fails with %s', (_where, code, block) => {
    const run = brokenRuns.get(block)!;
    // A broken block may only warn (JSX printed as text): what it must give is its code.
    expect(run.codes, run.text).toContain(code);
  });

  it('every broken block names a code of the catalogue', () => {
    for (const b of broken) expect(explain(b.broken!), b.broken).toBeDefined();
  });

  it('the unit tests the testing topic shows pass', () => {
    expect(tests.length).toBeGreaterThan(3);
    expect(testRun.ok, testRun.text).toBe(true);
    expect(testRun.text).toMatch(/Tests\s+\d+ passed/u);
  });
});

describe('every «Instead of…» row names its code (criterion 8)', () => {
  const rows = TOPICS.flatMap((topic) => insteadRows(topic).map((row) => ({ topic, ...row })));

  it('the tables are there: components and view', () => {
    expect([...new Set(rows.map((r) => r.topic))]).toEqual(['components', 'view']);
    expect(rows.length).toBeGreaterThan(40);
  });

  it.each(rows.map((r) => [r.topic, r.instead, r.code]))('%s: %s → %s', (_topic, _instead, code) => {
    const cited = code.match(/FUD\d{4}/gu) ?? [];
    // A habit the compiler does not refuse (useState → signal) cites none, and says so with «—».
    if (cited.length === 0) expect(code).toBe('—');
    for (const c of cited) expect(explain(c), c).toBeDefined();
  });
});
