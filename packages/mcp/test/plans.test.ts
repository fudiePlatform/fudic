/**
 * `fudic_new`, `fudic_generate` and `fudic_add` (SDD-77 §4.6, criteria 18 and 19): what the MCP
 * writes is, byte for byte, what the CLI writes with the same options. The commands of a plan
 * (`pnpm install`, `git init`) are never run: `spawnSync` is replaced, and says what it was asked.
 */

import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { apply, nodeReadIo, nodeWriteIo, parseArgs, planOf, type PlannedCommand } from '@fudic/cli';
import { nodeIo, unitState } from '@fudic/history';
import { Checks } from '../src/checks.js';
import type { Cli } from '../src/fudic.js';
import { flagOf, flagsOf, runPlan } from '../src/plans.js';
import { inPlace } from '../src/project-tools.js';
import { openProject } from '../src/project.js';
import { createServer } from '../src/server.js';
import { connect, fakeProject } from './helpers.js';

const child = vi.hoisted(() => ({ spawnSync: vi.fn() }));

vi.mock('node:child_process', async (original) => ({
  ...(await original<typeof import('node:child_process')>()),
  spawnSync: child.spawnSync,
}));

/** Every command a plan runs succeeds, and says nothing. */
function quietCommands(): void {
  child.spawnSync.mockReturnValue({ status: 0, stdout: '', stderr: '' });
}

beforeEach(quietCommands);
afterEach(() => {
  child.spawnSync.mockReset();
});

/** This package's own `node_modules`: the `@fudic/*` a project's install would leave. */
const MODULES = fileURLToPath(new URL('../node_modules', import.meta.url));

const work = mkdtempSync(join(tmpdir(), 'fudic-mcp-plans-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

let serial = 0;
/** A fresh, empty folder under the test's own. */
function folder(name: string): string {
  const dir = join(work, `${serial++}`, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Every file under `root` with its text, but the history, whose lines carry a date. */
function tree(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (!entry.name.endsWith('.fudlog')) out[relative(root, path).replace(/\\/gu, '/')] = readFileSync(path, 'utf8');
    }
  };
  visit(root);
  return out;
}

/** What the CLI writes for `argv` in `cwd`, with every command succeeding. */
async function cliWrites(argv: readonly string[], cwd: string): Promise<void> {
  const command = parseArgs([...argv, '--cwd', cwd]) as PlannedCommand;
  const runner = { run: () => 0 };
  const io = { readIo: nodeReadIo(), writeIo: nodeWriteIo(), runner, streams: { out: () => undefined, err: () => undefined } };
  const plan = await planOf(command, io);
  expect(plan.errors, `fudic ${argv.join(' ')}`).toEqual([]);
  await apply(plan, command.opts, nodeWriteIo(), runner);
}

/** A client of a server started in `root`, as Pedro starts it over HTTP. */
async function clientIn(root: string): Promise<Client> {
  return connect(createServer({ project: openProject(root), entry: 'http', checks: new Checks(root) }));
}

interface Answer {
  readonly body: Record<string, unknown>;
  readonly isError: boolean;
}

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<Answer> {
  const result = await client.callTool({ name, arguments: args });
  // Nothing throws out of a tool: every answer is the common shape, even an error.
  expect(result.structuredContent, JSON.stringify(result.content)).toBeDefined();
  return { body: result.structuredContent as Record<string, unknown>, isError: result.isError === true };
}

const codes = (answer: Answer): unknown => (answer.body['diagnostics'] as { code: string }[]).map((d) => d.code);

/** An app `fudic_new` made, and a copy of it for the CLI to write in. */
async function twinApps(): Promise<{ readonly mcp: string; readonly cli: string }> {
  quietCommands();
  const mcp = folder('demo');
  const answer = await call(await clientIn(mcp), 'fudic_new', { name: 'demo', prefix: 'app' });
  expect(answer.isError).toBe(false);
  const cli = folder('demo');
  cpSync(mcp, cli, { recursive: true });
  return { mcp, cli };
}

describe('flags', () => {
  it('camelCase is the kebab-case of the command line', () => {
    expect(flagOf('skipTest')).toBe('skip-test');
    expect(flagOf('noSw')).toBe('no-sw');
    expect(flagOf('dir')).toBe('dir');
  });

  it('true is the flag, a string its value, a list one comma value or the flag repeated; false and absent nothing', () => {
    expect(
      flagsOf({ slot: true, noStyle: false, dir: 'ui', in: ['a.fud', 'b.fud'], param: ['a:string', 'b:number'], prefix: undefined }),
    ).toEqual(['--slot', '--dir', 'ui', '--in', 'a.fud,b.fud', '--param', 'a:string', '--param', 'b:number']);
  });
});

describe('inPlace', () => {
  it('takes the folder off every path and command; the report loses its cd', () => {
    const plan = {
      changes: [
        { kind: 'create' as const, path: 'demo\\package.json', content: '' },
        { kind: 'create' as const, path: 'other/x', content: '' },
      ],
      commands: [{ command: 'pnpm', args: ['install'], dir: 'demo' }],
      errors: [],
      diagnostics: [],
      report: ['  cd demo', '  pnpm dev'],
    };
    const out = inPlace(plan as never, 'demo');
    expect(out.changes.map((c) => c.path)).toEqual(['package.json', 'other/x']);
    expect(out.commands.map((c) => c.dir)).toEqual(['.']);
    expect(out.report).toEqual(['  pnpm dev']);
    const { report: _, ...bare } = plan;
    expect(inPlace(bare as never, 'demo')).not.toHaveProperty('report');
  });
});

// It runs the commands it writes, as `fudic new` does: under a full suite that takes more than 5 s.
describe('fudic_new (criterion 18)', { timeout: 60_000 }, () => {
  it('writes in its own folder what `fudic new` writes in <name>/, and runs its commands', async () => {
    const { mcp } = await twinApps();
    const cli = folder('cli');
    await cliWrites(['new', 'demo', '--prefix', 'app'], cli);
    expect(tree(mcp)).toEqual(tree(join(cli, 'demo')));
    // pnpm install and git init ran in the project, quietly.
    const ran = child.spawnSync.mock.calls.map(([command, args, options]) => [command, (args as string[]).join(' '), options.cwd]);
    expect(ran).toContainEqual(['pnpm', 'install', mcp]);
  });

  it('a workspace, with its first app and libraries', async () => {
    quietCommands();
    const mcp = folder('shop');
    const answer = await call(await clientIn(mcp), 'fudic_new', { name: 'shop', workspace: true, app: 'web', lib: ['ui'] });
    expect(answer.isError).toBe(false);
    const cli = folder('cli');
    await cliWrites(['new', 'shop', '--workspace', '--app', 'web', '--lib', 'ui'], cli);
    expect(tree(mcp)).toEqual(tree(join(cli, 'shop')));
  });

  it('dryRun says what it would write, and writes nothing', async () => {
    const mcp = folder('demo');
    const answer = await call(await clientIn(mcp), 'fudic_new', { name: 'demo', dryRun: true });
    expect(answer.isError).toBe(false);
    expect(answer.body).toMatchObject({ command: 'fudic new demo', written: false });
    expect(answer.body['changes']).toContainEqual({ create: 'package.json' });
    expect(readdirSync(mcp)).toEqual([]);
    expect(child.spawnSync).not.toHaveBeenCalled();
  });

  it('then says what comes next: the compass', async () => {
    const mcp = folder('demo');
    const answer = await call(await clientIn(mcp), 'fudic_new', { name: 'demo', dryRun: true });
    expect(answer.body['next']).toBe('Call fudic_status.');
  });

  it('in a folder that is already a project: FUD1409, and nothing written', async () => {
    const { mcp } = await twinApps();
    const before = tree(mcp);
    const answer = await call(await clientIn(mcp), 'fudic_new', { name: 'again' });
    expect(answer.isError).toBe(true);
    expect(codes(answer)).toEqual(['FUD1409']);
    expect(tree(mcp)).toEqual(before);
  });

  it('an option the CLI refuses is its usage error, with its hints', async () => {
    const answer = await call(await clientIn(folder('demo')), 'fudic_new', { name: 'Not A Name!' });
    expect(answer.isError).toBe(true);
    expect(answer.body['next']).toBeNull();
  });

  it('a command that fails: its last lines, and the answer is an error', async () => {
    child.spawnSync.mockImplementation((command: string) =>
      command === 'pnpm' ? { status: 1, stdout: 'resolving\n', stderr: 'ERR_PNPM_FETCH_404\n' } : { status: 0, stdout: '', stderr: '' },
    );
    const mcp = folder('demo');
    const answer = await call(await clientIn(mcp), 'fudic_new', { name: 'demo' });
    expect(answer.isError).toBe(true);
    expect(answer.body['ran']).toContainEqual({
      command: 'pnpm install',
      dir: mcp,
      status: 1,
      output: 'resolving\nERR_PNPM_FETCH_404',
    });
    expect(answer.body).not.toHaveProperty('report');
  });

  it('a command that cannot be launched has no status', async () => {
    child.spawnSync.mockReturnValue({ status: null, error: new Error('spawn pnpm ENOENT') });
    const answer = await call(await clientIn(folder('demo')), 'fudic_new', { name: 'demo' });
    expect(answer.isError).toBe(true);
    expect(answer.body['ran']).toContainEqual(expect.objectContaining({ command: 'pnpm install', status: null }));
    expect((answer.body['ran'] as object[])[0]).not.toHaveProperty('output');
  });
});

// A plan that reads the project — a spec, a showcase — parses it: slow under coverage.
describe('fudic_generate (criteria 18 and 19)', { timeout: 60_000 }, () => {
  let app: { readonly mcp: string; readonly cli: string };
  let client: Client;
  beforeAll(async () => {
    app = await twinApps();
    client = await clientIn(app.mcp);
  });

  it.each([
    ['component', { kind: 'component', name: 'app-badge', purpose: 'A badge for a count', slot: true, skipSpec: true }, ['g', 'component', 'app-badge', '--slot', '--skip-spec']],
    ['page', { kind: 'page', name: 'about', purpose: 'Who we are' }, ['g', 'page', 'about']],
    ['layout', { kind: 'layout', name: '_admin' }, ['g', 'layout', '_admin']],
    ['snippet', { kind: 'snippet', file: 'ui', name: 'card' }, ['g', 'snippet', 'ui', 'card']],
    ['spec', { kind: 'spec', name: 'app-badge' }, ['g', 'spec', 'app-badge']],
    ['term', { kind: 'term', block: 'then', name: 'has-shadow', param: ['target:element', 'px:number'] }, ['g', 'term', 'then', 'has-shadow', '--param', 'target:element', '--param', 'px:number']],
    ['api', { kind: 'api', name: 'src/routes/about.fud' }, ['g', 'api', 'src/routes/about.fud']],
    ['service', { kind: 'service', name: 'cart', provided: true }, ['g', 'service', 'cart', '--provided']],
    ['form', { kind: 'form', name: 'person', skipTest: true }, ['g', 'form', 'person', '--skip-test']],
    ['pipe', { kind: 'pipe', name: 'money', on: 'number' }, ['g', 'pipe', 'money', '--on', 'number']],
    ['style', { kind: 'style', name: 'theme' }, ['g', 'style', 'theme']],
  ])('%s: what `fudic g` writes', async (_kind, input, argv) => {
    const answer = await call(client, 'fudic_generate', input);
    expect(answer.isError, JSON.stringify(answer.body)).toBe(false);
    expect(answer.body['written']).toBe(true);
    await cliWrites(argv, app.cli);
    expect(tree(app.mcp)).toEqual(tree(app.cli));
  });

  it('a component starts its history with what the user asked for, by the agent', async () => {
    const state = await unitState(join(app.mcp, 'src/components/app-badge/app-badge.fud'), nodeIo(app.mcp));
    expect(state.lines.map((l) => l.event)).toContainEqual({ kind: 'started', by: 'agent', text: 'A badge for a count' });
    const page = await unitState(join(app.mcp, 'src/routes/about.fud'), nodeIo(app.mcp));
    expect(page.lines.map((l) => l.event)).toContainEqual({ kind: 'started', by: 'agent', text: 'Who we are' });
  });

  it('a component or a page without purpose: FUD1408, and nothing written', async () => {
    for (const purpose of [undefined, '  ']) {
      const answer = await call(client, 'fudic_generate', { kind: 'page', name: 'contact', ...(purpose === undefined ? {} : { purpose }) });
      expect(answer.isError).toBe(true);
      expect(codes(answer)).toEqual(['FUD1408']);
    }
    expect(existsSync(join(app.mcp, 'src/routes/contact.fud'))).toBe(false);
  });

  it('dryRun writes nothing, and no history', async () => {
    const before = tree(app.mcp);
    const answer = await call(client, 'fudic_generate', { kind: 'component', name: 'app-chip', purpose: 'A chip', dryRun: true });
    expect(answer.body).toMatchObject({ written: false });
    expect(tree(app.mcp)).toEqual(before);
    expect(existsSync(join(app.mcp, 'src/components/app-chip'))).toBe(false);
  });

  it('an option its kind does not take is the CLI\'s FUD0448, with its hints', async () => {
    const answer = await call(client, 'fudic_generate', { kind: 'style', name: 'print', slot: true });
    expect(answer.isError).toBe(true);
    expect(codes(answer)).toEqual(['FUD0448']);
    expect(answer.body).toHaveProperty('hints');
  });

  it('a plan the CLI refuses: its errors, nothing written', async () => {
    const answer = await call(client, 'fudic_generate', { kind: 'component', name: 'app-badge', purpose: 'Again' });
    expect(answer.isError).toBe(true);
    expect(answer.body['next']).toBeNull();
  });

  it('a snippet or a term without its names is the CLI\'s usage error', async () => {
    expect((await call(client, 'fudic_generate', { kind: 'snippet' })).isError).toBe(true);
    expect((await call(client, 'fudic_generate', { kind: 'term' })).isError).toBe(true);
    expect((await call(client, 'fudic_generate', { kind: 'term', block: 'then' })).isError).toBe(true);
    expect((await call(client, 'fudic_generate', { kind: 'snippet', file: 'ui' })).isError).toBe(true);
    // Without a name, the kind alone: an app has no library to show.
    const showcase = await call(client, 'fudic_generate', { kind: 'showcase' });
    expect(showcase.isError).toBe(true);
    expect(showcase.body['command']).toBe('fudic g showcase');
  });

  it('outside a project: FUD1404', async () => {
    const answer = await call(await clientIn(folder('empty')), 'fudic_generate', { kind: 'style', name: 'x' });
    expect(codes(answer)).toEqual(['FUD1404']);
  });
});

describe('fudic_generate in a workspace (criterion 18)', { timeout: 60_000 }, () => {
  let ws: { readonly mcp: string; readonly cli: string };
  let client: Client;
  beforeAll(async () => {
    quietCommands(); // beforeEach comes after beforeAll
    const mcp = folder('shop');
    expect((await call(await clientIn(mcp), 'fudic_new', { name: 'shop', workspace: true, app: 'web', lib: ['ui'] })).isError).toBe(false);
    const cli = folder('shop');
    cpSync(mcp, cli, { recursive: true });
    // What the install would leave: `g showcase` reads the project's own @fudic/workbench.
    for (const root of [mcp, cli]) symlinkSync(MODULES, join(root, 'node_modules'), 'junction');
    ws = { mcp, cli };
    client = await clientIn(mcp);
  });

  it('started at its root, it is a project: fudic_new refuses it, FUD1409', async () => {
    expect(codes(await call(client, 'fudic_new', { name: 'again' }))).toEqual(['FUD1409']);
  });

  it('a planner that stops — the showcase before the install — is FUD1411, not a throw', async () => {
    const bare = folder('shop');
    const fresh = await clientIn(bare);
    expect((await call(fresh, 'fudic_new', { name: 'shop', workspace: true, app: 'web', lib: ['ui'] })).isError).toBe(false);
    const answer = await call(fresh, 'fudic_generate', { kind: 'showcase', name: 'ui' });
    expect(answer.isError).toBe(true);
    expect(codes(answer)).toEqual(['FUD1411']);
    expect(answer.body['command']).toBe('fudic g showcase ui');
  });

  it.each([
    ['app', { kind: 'app', name: 'admin' }, ['g', 'app', 'admin']],
    ['lib', { kind: 'lib', name: 'kit', prefix: 'kit' }, ['g', 'lib', 'kit', '--prefix', 'kit']],
    ['component in a library', { kind: 'component', name: 'ui-card', purpose: 'A card', project: 'ui' }, ['g', 'component', 'ui-card', '--project', 'ui']],
    ['showcase', { kind: 'showcase', name: 'ui' }, ['g', 'showcase', 'ui']],
  ])('%s: what `fudic g` writes', async (_kind, input, argv) => {
    const answer = await call(client, 'fudic_generate', input);
    expect(answer.isError, JSON.stringify(answer.body)).toBe(false);
    await cliWrites(argv, ws.cli);
    expect(tree(ws.mcp)).toEqual(tree(ws.cli));
  });
});

describe('fudic_add (criterion 18)', () => {
  let app: { readonly mcp: string; readonly cli: string };
  let client: Client;
  beforeAll(async () => {
    app = await twinApps();
    client = await clientIn(app.mcp);
  });

  it('what `fudic add` writes, and it installs', async () => {
    quietCommands();
    const answer = await call(client, 'fudic_add', { module: 'i18n', locales: ['es', 'en'] });
    expect(answer.isError, JSON.stringify(answer.body)).toBe(false);
    await cliWrites(['add', 'i18n', '--locales', 'es,en'], app.cli);
    expect(tree(app.mcp)).toEqual(tree(app.cli));
    expect(child.spawnSync).toHaveBeenCalledWith('pnpm', ['install'], expect.objectContaining({ cwd: app.mcp }));
  });

  it('dryRun writes nothing', async () => {
    const before = tree(app.mcp);
    const answer = await call(client, 'fudic_add', { module: 'forms', dryRun: true });
    expect(answer.body).toMatchObject({ written: false });
    expect(tree(app.mcp)).toEqual(before);
  });

  it('outside a project: FUD1404', async () => {
    const answer = await call(await clientIn(folder('empty')), 'fudic_add', { module: 'forms' });
    expect(codes(answer)).toEqual(['FUD1404']);
  });
});

describe('runPlan', () => {
  it('the problems of a plan, in project coordinates: its errors with or without a file, and its diagnostics', async () => {
    const plan = {
      changes: [],
      commands: [],
      errors: [
        { code: 'FUD0443', severity: 'error', message: 'exists', file: 'src/a.fud' },
        { code: 'FUD0448', severity: 'error', message: 'usage' },
      ],
      diagnostics: [{ file: 'src/b.fud', diagnostic: { code: 'FUD0540', severity: 'error', message: 'key', span: { start: 0, end: 1 } } }],
    };
    const said: string[] = [];
    const planOf = async (_command: unknown, deps: { streams: { out(t: string): unknown; err(t: string): unknown } }): Promise<object> => {
      // What a planner writes to its streams goes nowhere: over stdio, stdout is the protocol.
      said.push(String(deps.streams.out('out')), String(deps.streams.err('err')));
      return plan;
    };
    const cli = { parseArgs: () => ({ kind: 'generate', opts: {} }), planOf, nodeReadIo, nodeWriteIo } as unknown as Cli;
    const { answer } = await runPlan(cli, fakeProject('/p'), ['g', 'component', 'x'], { dryRun: true });
    expect(said).toEqual(['undefined', 'undefined']);
    expect(answer.failed).toBe(true);
    expect(answer.diagnostics?.map((d) => [d.code, 'file' in d ? d.file : undefined])).toEqual([
      ['FUD0443', '/p/src/a.fud'],
      ['FUD0448', undefined],
      ['FUD0540', '/p/src/b.fud'],
    ]);
  });
});
