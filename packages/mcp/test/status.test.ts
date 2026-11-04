/**
 * `fudic_status` (SDD-77 §4.4, criteria 21 and 22): where the project is and the one next step.
 * The history is real on disk; where a test needs the last runs of tests and criteria, the
 * mocked `unitState` answers them — nothing is run. The commands of a plan are never run.
 */

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { UnitState } from '@fudic/history';
import type { CheckProblem, CheckReport } from '@fudic/typecheck';
import type { Piece, ProjectService } from '@fudic/language-server/project';
import { Checks } from '../src/checks.js';
import type { Unit } from '../src/phases.js';
import { openProject, type Project } from '../src/project.js';
import { createServer } from '../src/server.js';
import { Session } from '../src/session.js';
import { statusOf, stepOf, withGuide } from '../src/status.js';
import { connect, fakeProject, tempDir } from './helpers.js';

const child = vi.hoisted(() => ({ spawnSync: vi.fn() }));
vi.mock('node:child_process', async (original) => ({
  ...(await original<typeof import('node:child_process')>()),
  spawnSync: child.spawnSync,
}));

/** What the history says over the real one, by the end of the piece's path: runs, approval, done. */
const over = vi.hoisted(() => ({ states: new Map<string, Partial<UnitState>>() }));
vi.mock('@fudic/history', async (original) => {
  const real = await original<typeof import('@fudic/history')>();
  return {
    ...real,
    unitState: async (unit: string, io?: Parameters<typeof real.unitState>[1]): Promise<UnitState> => {
      const state = await real.unitState(unit, io);
      const forced = [...over.states].find(([end]) => unit.replace(/\\/gu, '/').endsWith(end))?.[1];
      return forced === undefined ? state : { ...state, ...forced };
    },
  };
});

beforeEach(() => {
  child.spawnSync.mockReturnValue({ status: 0, stdout: '', stderr: '' });
  over.states.clear();
});

interface Answer {
  readonly body: Record<string, unknown>;
  readonly next: unknown;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<Answer> {
  const result = await client.callTool({ name, arguments: args });
  const body = result.structuredContent as Record<string, unknown>;
  expect(result.isError, JSON.stringify(body)).not.toBe(true);
  return { body, next: body['next'] };
}

const pass = { state: 'pass', passed: 1, total: 1 } as const;

/** The badge with its doc and its prop's: what the document phase asks for. */
const DOCUMENTED = `@code {
  /**
   * A badge for a count.
   */
  const { count = 0 } = props<{
    /** How many. */
    count?: number;
  }>();
}

<app-badge>
  <template shadowrootmode="open">
    <span>@count</span>
  </template>
</app-badge>
`;

describe('a project made and grown through the tools (criteria 21 and 22)', { timeout: 120_000 }, () => {
  const work = mkdtempSync(join(tmpdir(), 'fudic-mcp-status-'));
  afterAll(() => rmSync(work, { recursive: true, force: true }));
  const BADGE = 'src/components/app-badge/app-badge.fud';
  let root: string;
  let client: Client;

  beforeAll(async () => {
    child.spawnSync.mockReturnValue({ status: 0, stdout: '', stderr: '' });
    root = join(work, 'demo');
    mkdirSync(root);
    client = await connect(createServer({ project: openProject(root), entry: 'http', checks: new Checks(root) }));
  });

  it('without a project: phase none, and ask the user what is missing for fudic_new', async () => {
    const { body, next } = await call(client, 'fudic_status');
    expect(body['phase']).toBe('none');
    expect(next).toMatch(/^There is no fudic project here yet\. Ask the user only what is missing .* then call fudic_new\.$/u);
  });

  it('walks a component through its phases, one next at a time', async () => {
    expect((await call(client, 'fudic_new', { name: 'demo', prefix: 'app' })).body['written']).toBe(true);
    symlinkSync(fileURLToPath(new URL('../node_modules', import.meta.url)), join(root, 'node_modules'), 'junction');
    await call(client, 'fudic_generate', { kind: 'component', name: 'app-badge', purpose: 'A badge for a count' });

    // 1. Criteria: ask, do not build — and the guide of .fudspec first, this once.
    let status = await call(client, 'fudic_status');
    expect(status.body).toMatchObject({ phase: 'criteria', project: { name: 'demo', kind: 'app', prefix: 'app' }, summary: { errors: 0, warnings: 0 } });
    expect((status.body['units'] as { piece: string }[])[0]).toMatchObject({ piece: BADGE, kind: 'component', phase: 'criteria', approval: 'none', server: false, tests: 'not run' });
    expect(status.next).toBe(
      'Ask the user for the props and the behaviour of app-badge. Propose them, wait for their approval, then write ' +
        'src/components/app-badge/app-badge.fudspec and its fixture, and call fudic_record { piece: "src/components/app-badge/app-badge.fud", event: "approved" }. ' +
        'Call fudic_guide { topic: "fudspec" } first.',
    );
    await call(client, 'fudic_guide', { topic: 'fudspec' });
    expect((await call(client, 'fudic_status')).next).not.toContain('fudic_guide');

    // 2. Red: approved, and no run yet.
    await call(client, 'fudic_record', { piece: BADGE, event: 'approved' });
    status = await call(client, 'fudic_status');
    expect(status.body['phase']).toBe('red');
    expect(status.next).toMatch(/^Write the unit tests of src\/components\/app-badge\/app-badge\.fud in .*app-badge\.test\.ts.* Call fudic_guide \{ topic: "testing" \} first\.$/u);

    // 3. View: red for the right reason.
    over.states.set(BADGE, { tests: { state: 'red', passed: 0, total: 1 }, spec: { state: 'fail', passed: 0, total: 1 } });
    status = await call(client, 'fudic_status');
    expect(status.body['phase']).toBe('view');
    expect(status.next).toMatch(/^Write the view of .* until fudic_test and fudic_spec_run pass\. Do not change the tests\./u);

    // 4. Document: green, and no JSDoc yet.
    over.states.set(BADGE, { tests: pass, spec: pass });
    status = await call(client, 'fudic_status');
    expect(status.body['phase']).toBe('document');
    expect(status.next).toMatch(/^Document src\/components\/app-badge\/app-badge\.fud: a JSDoc on the component/u);
    await call(client, 'fudic_write', { path: BADGE, content: DOCUMENTED });

    // 5. Finished: closed with done, and the next piece comes.
    status = await call(client, 'fudic_status');
    expect(status.body['phase']).toBe('done');
    expect(status.next).toBe(`${BADGE} is finished: call fudic_record { piece: "${BADGE}", event: "done" }.`);
    await call(client, 'fudic_record', { piece: BADGE, event: 'done' });
    status = await call(client, 'fudic_status');
    expect((status.body['units'] as { piece: string; phase: string }[]).find((u) => u.piece === BADGE)?.phase).toBe('done');
    expect(status.next).not.toContain(BADGE);
  });

  it('with an error: fix it first, and nothing else', async () => {
    writeFileSync(join(root, 'src/components/broken.fud'), '<p>\n');
    try {
      const { body, next } = await call(client, 'fudic_status');
      expect((body['summary'] as { errors: number }).errors).toBeGreaterThan(0);
      expect(next).toMatch(/^(Fix FUD\d{4} at src\/components\/broken\.fud|Run fudic_fix)/u);
    } finally {
      rmSync(join(root, 'src/components/broken.fud'));
    }
  });
});

/** A check, a service and a project as the test decides; the history is the mocked one. */
function fakeChecks(root: string, pieces: readonly Piece[], problems: readonly CheckProblem[] = []): Checks {
  const report: CheckReport = { problems, project: [], inputs: [] };
  const service = { pieces: () => pieces, handlers: () => undefined, repairs: () => [] } as unknown as ProjectService;
  return {
    run: async () => report,
    repairs: async () => [],
    service: async () => service,
    folders: async () => [root],
    // A library outside a workspace: no showcase to keep.
    fudic: async () => ({ cli: { nodeReadIo: () => ({}), workspaceRoot: () => null } }),
  } as unknown as Checks;
}

const piece = (root: string, name: string): Piece => ({
  kind: 'component',
  name,
  file: `${root.replace(/\\/gu, '/')}/src/components/${name}/${name}.fud`,
  servers: [],
  documented: { doc: true, props: 0, documented: 0 },
});

describe('statusOf, over a project of the test\'s', () => {
  const dirs: { dispose(): void }[] = [];
  afterAll(() => dirs.forEach((d) => d.dispose()));
  function folder(files: Readonly<Record<string, string>>): string {
    const dir = tempDir();
    dirs.push(dir);
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(dir.root, path, '..'), { recursive: true });
      writeFileSync(join(dir.root, path), text);
    }
    return dir.root;
  }
  const project = (root: string, git: Project['git'] = () => 'the diff'): Project => ({ ...fakeProject(root), git });

  it('an expired approval: the diff of what the user approved since, and ask them again', async () => {
    const root = folder({ 'fudic.json': '{ "kind": "lib", "prefix": "ui" }' });
    over.states.set('ui-a/ui-a.fud', { approval: 'expired', approvedAt: 'abc1234' });
    over.states.set('ui-b/ui-b.fud', { approval: 'expired', approvedAt: 'none' });
    over.states.set('ui-c/ui-c.fud', { approval: 'expired' });
    const git = vi.fn<Project['git']>(() => 'the diff');
    const answer = await statusOf(project(root, git), fakeChecks(root, [piece(root, 'ui-a'), piece(root, 'ui-b'), piece(root, 'ui-c')]), new Session());
    expect(answer.body['project']).toEqual({ name: 'demo', kind: 'lib', prefix: 'ui' });
    expect(answer.body['expired']).toEqual([
      { piece: 'src/components/ui-a/ui-a.fud', since: 'abc1234', diff: 'the diff' },
      { piece: 'src/components/ui-b/ui-b.fud', since: 'none', diff: null },
      { piece: 'src/components/ui-c/ui-c.fud', since: 'none', diff: null },
    ]);
    expect(git).toHaveBeenCalledExactlyOnceWith(root, ['diff', 'abc1234', '--', 'src/components/ui-a/ui-a.fudspec', 'src/components/ui-a/ui-a.fixture.ts']);
    expect(answer.next).toMatch(/^The approval of src\/components\/ui-a\/ui-a\.fud expired: .* Show the user the diff in "expired"/u);
  });

  it('a commit git no longer has: no diff', async () => {
    const root = folder({ 'fudic.json': '{' });
    over.states.set('ui-a/ui-a.fud', { approval: 'expired', approvedAt: 'abc1234' });
    const gone: Project['git'] = () => {
      throw new Error('bad revision');
    };
    const answer = await statusOf(project(root, gone), fakeChecks(root, [piece(root, 'ui-a')]), new Session());
    // A fudic.json that does not parse: an app, with no prefix.
    expect(answer.body['project']).toEqual({ name: 'demo', kind: 'app' });
    expect(answer.body['expired']).toEqual([{ piece: 'src/components/ui-a/ui-a.fud', since: 'abc1234', diff: null }]);
  });

  it('every piece done: phase done, and next is null', async () => {
    const root = folder({ 'fudic.json': '{}' });
    over.states.set('ui-a/ui-a.fud', { done: true });
    const answer = await statusOf(project(root), fakeChecks(root, [piece(root, 'ui-a')]), new Session());
    expect(answer.body['phase']).toBe('done');
    expect(answer.body).not.toHaveProperty('expired');
    expect(answer.next).toBeNull();
  });

  it('an error without a repair: fix it by its place', async () => {
    const root = folder({ 'fudic.json': '{}' });
    const problem: CheckProblem = { file: join(root, 'src/a.fud'), span: { start: 0, end: 1 }, severity: 'error', code: 'FUD0001', message: 'x' };
    const answer = await statusOf(project(root), fakeChecks(root, [], [problem]), new Session());
    expect(answer.body['summary']).toEqual({ errors: 1, warnings: 0 });
    expect(answer.next).toMatch(/^Fix FUD0001/u);
  });

  it('a workspace: its projects', async () => {
    const root = folder({ 'pnpm-workspace.yaml': '', 'apps/web/fudic.json': '{}', 'libs/ui/fudic.json': '{ "kind": "lib" }' });
    const checks = fakeChecks(root, []);
    (checks as { folders: () => Promise<readonly string[]> }).folders = async () => [join(root, 'apps/web'), join(root, 'libs/ui')];
    const answer = await statusOf(project(root), checks, new Session());
    expect(answer.body['project']).toEqual({ name: 'demo', kind: 'workspace', projects: ['apps/web', 'libs/ui'] });
    expect(answer.body['units']).toEqual([]);
    expect(answer.next).toBeNull();
  });
});

describe('the step of each phase', () => {
  const unit = (over: Partial<Unit>): Unit => ({
    piece: 'src/components/app-a/app-a.fud',
    kind: 'component',
    name: 'app-a',
    phase: 'criteria',
    complete: false,
    approval: 'valid',
    project: '/w/libs/ui',
    server: false,
    tests: 'pass 1/1',
    spec: 'pass 1/1',
    documented: '1/2',
    functions: { connected: 0, missing: 1 },
    connectedFunctions: [],
    ...over,
  });

  it.each([
    [{ phase: 'criteria', kind: 'route', name: '/about' }, /^Ask the user for what the page shows and does of \/about\./u, 'fudspec'],
    [{ phase: 'api' }, /^Link the \.fudapi of .* with <link rel="server"/u, 'fudapi'],
    [{ phase: 'red' }, /^Write the unit tests of /u, 'testing'],
    [{ phase: 'view' }, /^Write the view of /u, 'components'],
    [{ phase: 'view', kind: 'route' }, /^Write the view of /u, 'pages'],
    [{ phase: 'connect', api: 'components/app-a' }, /fudic_contract \{ id: "components\/app-a" \}/u, 'fudapi'],
    [{ phase: 'document' }, /^Document .*\(1\/2 props have one\)\.$/u, 'components'],
    [{ phase: 'showcase' }, /fudic_generate \{ kind: "showcase", name: "ui" \}\.$/u, undefined],
    [{ phase: 'done', complete: true }, /is finished: call fudic_record .* event: "done" \}\.$/u, undefined],
  ] as const)('%j', (asked, step, topic) => {
    const one = unit(asked as Partial<Unit>);
    expect(stepOf(one)).toMatch(step);
    const fresh = withGuide('Step.', one, new Session());
    expect(fresh).toBe(topic === undefined ? 'Step.' : `Step. Call fudic_guide { topic: "${topic}" } first.`);
    const read = new Session();
    if (topic !== undefined) read.read(topic);
    expect(withGuide('Step.', one, read)).toBe('Step.');
  });
});
