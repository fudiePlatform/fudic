/**
 * `fudic_record` (SDD-77 §4.6, criterion 20): each event in the history of a piece, and `done`
 * only when every phase is. The runs of tests and criteria that `done` needs are the history's
 * to say: where a test needs them in `pass`, `unitState` answers them so — everything else it
 * reads is the real history on disk. The commands of a plan (`git tag`) are never run.
 */

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { nodeIo, unitState, type UnitState } from '@fudic/history';
import { Checks } from '../src/checks.js';
import { openProject } from '../src/project.js';
import { createServer } from '../src/server.js';
import { connect } from './helpers.js';

const child = vi.hoisted(() => ({ spawnSync: vi.fn() }));
vi.mock('node:child_process', async (original) => ({
  ...(await original<typeof import('node:child_process')>()),
  spawnSync: child.spawnSync,
}));

/** When set, the last runs of tests and criteria every piece has: the rest is the real history. */
const runs = vi.hoisted(() => ({ passing: false }));
vi.mock('@fudic/history', async (original) => {
  const real = await original<typeof import('@fudic/history')>();
  return {
    ...real,
    unitState: async (unit: string, io?: Parameters<typeof real.unitState>[1]): Promise<UnitState> => {
      const state = await real.unitState(unit, io);
      if (!runs.passing) return state;
      const pass = { state: 'pass', passed: 1, total: 1 } as const;
      return { ...state, approval: 'valid', tests: pass, spec: pass };
    },
  };
});

beforeEach(() => {
  child.spawnSync.mockReturnValue({ status: 0, stdout: '', stderr: '' });
  runs.passing = false;
});

const work = mkdtempSync(join(tmpdir(), 'fudic-mcp-record-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

interface Answer {
  readonly body: Record<string, unknown>;
  readonly isError: boolean;
}

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<Answer> {
  const result = await client.callTool({ name, arguments: args });
  expect(result.structuredContent, JSON.stringify(result.content)).toBeDefined();
  return { body: result.structuredContent as Record<string, unknown>, isError: result.isError === true };
}

const codes = (answer: Answer): unknown => (answer.body['diagnostics'] as { code: string }[]).map((d) => d.code);
const BADGE = 'src/components/app-badge/app-badge.fud';

let root: string;
let client: Client;
/** What the history of a piece says, event by event. */
const events = async (piece: string): Promise<readonly unknown[]> =>
  (await unitState(join(root, piece), nodeIo(root))).lines.map((line) => line.event.kind);

beforeAll(async () => {
  child.spawnSync.mockReturnValue({ status: 0, stdout: '', stderr: '' });
  root = join(work, 'demo');
  mkdirSync(root);
  client = await connect(createServer({ project: openProject(root), entry: 'http', checks: new Checks(root) }));
  expect((await call(client, 'fudic_new', { name: 'demo', prefix: 'app' })).isError).toBe(false);
  // What the install would leave: the project's own fudic, which the check and the plans load.
  symlinkSync(fileURLToPath(new URL('../node_modules', import.meta.url)), join(root, 'node_modules'), 'junction');
  for (const [kind, name, extra] of [
    ['component', 'app-badge', { skipTest: true }],
    ['page', 'about', {}],
    ['page', 'shop', { server: true }],
  ] as const) {
    const answer = await call(client, 'fudic_generate', { kind, name, purpose: `The ${name}`, ...extra });
    expect(answer.isError, JSON.stringify(answer.body)).toBe(false);
  }
}, 120_000);

// The first `done` mounts the project's checker and checks it whole.
describe('fudic_record (criterion 20)', { timeout: 60_000 }, () => {
  it('done on a piece whose criteria are not approved: FUD1407, naming criteria', async () => {
    const answer = await call(client, 'fudic_record', { piece: BADGE, event: 'done' });
    expect(answer.isError).toBe(true);
    expect(codes(answer)).toEqual(['FUD1407']);
    expect(answer.body['phase']).toBe('criteria');
  });

  it('approved: the plan of fudic approve, with the hash of its .fudspec', async () => {
    const answer = await call(client, 'fudic_record', { piece: BADGE, event: 'approved' });
    expect(answer.isError, JSON.stringify(answer.body)).toBe(false);
    expect(answer.body).toMatchObject({ command: `fudic approve ${BADGE}`, written: true });
    expect((await unitState(join(root, BADGE), nodeIo(root))).approval).toBe('valid');
  });

  it('done on a piece without tests: FUD1407, naming red', async () => {
    const answer = await call(client, 'fudic_record', { piece: 'src/components/app-badge', event: 'done' });
    expect(answer.isError).toBe(true);
    expect(codes(answer)).toEqual(['FUD1407']);
    expect(answer.body).toMatchObject({ piece: BADGE, phase: 'red' });
    expect(await events(BADGE)).toEqual(['started', 'approved']);
  });

  it('accepted: the plan of fudic accept, with the user\'s words, and its tag', async () => {
    const answer = await call(client, 'fudic_record', { piece: BADGE, event: 'accepted', text: 'The client signed it off' });
    expect(answer.isError, JSON.stringify(answer.body)).toBe(false);
    expect(await events(BADGE)).toEqual(['started', 'approved', 'accepted']);
  });

  it('reopened: by the agent, with the user\'s words', async () => {
    const answer = await call(client, 'fudic_record', { piece: BADGE, event: 'reopened', text: '  It takes a colour now ' });
    expect(answer.body).toMatchObject({ piece: BADGE, recorded: ['reopened'] });
    const state = await unitState(join(root, BADGE), nodeIo(root));
    expect(state.lines.at(-1)?.event).toEqual({ kind: 'reopened', by: 'agent', text: 'It takes a colour now' });
  });

  it.each(['accepted', 'reopened'])('%s without a text: FUD1410, and nothing written', async (event) => {
    const before = await events(BADGE);
    for (const text of [undefined, ' ']) {
      const answer = await call(client, 'fudic_record', { piece: BADGE, event, ...(text === undefined ? {} : { text }) });
      expect(codes(answer)).toEqual(['FUD1410']);
    }
    expect(await events(BADGE)).toEqual(before);
  });

  it('done once every phase is: documented, done; and once done, nothing more', async () => {
    runs.passing = true;
    writeFileSync(join(root, 'src/routes/about.fudspec'), '');
    const answer = await call(client, 'fudic_record', { piece: 'src/routes/about.fud', event: 'done' });
    expect(answer.isError, JSON.stringify(answer.body)).toBe(false);
    expect(answer.body).toMatchObject({ piece: 'src/routes/about.fud', recorded: ['documented', 'done'] });
    const state = await unitState(join(root, 'src/routes/about.fud'), nodeIo(root));
    expect(state.lines.map((l) => l.event)).toContainEqual({ kind: 'documented', documented: 0, props: 0 });
    expect(state.done).toBe(true);

    const again = await call(client, 'fudic_record', { piece: 'src/routes/about.fud', event: 'done' });
    expect(again.body).toMatchObject({ recorded: [], next: null });
    expect(await events('src/routes/about.fud')).toEqual(['started', 'documented', 'done']);
  });

  it('done of a piece with a server: connected, with the functions that have a handler', async () => {
    runs.passing = true;
    writeFileSync(join(root, 'src/routes/shop.fudspec'), '');
    const answer = await call(client, 'fudic_record', { piece: 'src/routes/shop.fud', event: 'done' });
    expect(answer.isError, JSON.stringify(answer.body)).toBe(false);
    expect(answer.body).toMatchObject({ recorded: ['documented', 'connected', 'done'] });
    const state = await unitState(join(root, 'src/routes/shop.fud'), nodeIo(root));
    expect(state.lines.map((l) => l.event)).toContainEqual({ kind: 'connected', functions: ['routes/shop.load'] });

    // Reopened and done again: the functions already named are not named twice.
    await call(client, 'fudic_record', { piece: 'src/routes/shop.fud', event: 'reopened', text: 'A filter' });
    const second = await call(client, 'fudic_record', { piece: 'src/routes/shop.fud', event: 'done' });
    expect(second.body).toMatchObject({ recorded: ['documented', 'done'] });
  });

  it('a .fud that is not a piece — a layout — has no phases: FUD1401', async () => {
    const answer = await call(client, 'fudic_record', { piece: 'src/layouts/_layout.fud', event: 'done' });
    expect(codes(answer)).toEqual(['FUD1401']);
  });

  it('a piece that does not exist: FUD1401; one outside the project: FUD1400', async () => {
    expect(codes(await call(client, 'fudic_record', { piece: 'src/components/app-nope', event: 'reopened', text: 'x' }))).toEqual(['FUD1401']);
    expect(codes(await call(client, 'fudic_record', { piece: '../elsewhere.fud', event: 'reopened', text: 'x' }))).toEqual(['FUD1400']);
  });

  it('outside a project: FUD1404', async () => {
    const empty = join(work, 'empty');
    mkdirSync(empty);
    const outside = await connect(createServer({ project: openProject(empty), entry: 'http', checks: new Checks(empty) }));
    expect(codes(await call(outside, 'fudic_record', { piece: 'a.fud', event: 'done' }))).toEqual(['FUD1404']);
  });
});
