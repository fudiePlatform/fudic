/**
 * SDD-65 criterion 7 and §4.4: what `unitState` says of a piece from its history and its files,
 * now. The facts only: no phase, no next step.
 */

import { describe, expect, it } from 'vitest';
import { approvalHash, inputsHash, record, unitState, type HistoryEvent } from '../src/index.js';
import { memoryIo, type MemoryIo } from './memory-io.js';

const UNIT = 'src/components/acme-button/acme-button.fud';
const SPEC = 'src/components/acme-button/acme-button.fudspec';
const LOG = 'src/components/acme-button/acme-button.fudlog';
const FUD = '<acme-button>\n  <template shadowrootmode="open"><button>+</button></template>\n</acme-button>\n';
const OTHER = 'ffffffffffff';

const io = (head = 'a1b2c3d4e5'): MemoryIo =>
  memoryIo({ head, files: { [UNIT]: FUD, [SPEC]: 'component acme-button\n\ncriterion a\n  then\n    visible acme-button\n' } });

/** Records with the clock one minute later each time. */
async function write(q: MemoryIo, ...events: readonly HistoryEvent[]): Promise<void> {
  for (const event of events) {
    const last = q.now();
    q.at(new Date(last.getTime() + 60_000).toISOString());
    await record(UNIT, event, q);
  }
}

describe('a piece with no history', () => {
  it('says nothing happened', async () => {
    expect(await unitState(UNIT, io())).toEqual({
      unit: UNIT,
      lines: [],
      diagnostics: [],
      approval: 'none',
      tests: { state: 'not run' },
      spec: { state: 'not run' },
      look: 'none',
      done: false,
    });
  });

  it('takes the piece absolute, and answers it relative to the root', async () => {
    expect((await unitState(`/project/${UNIT}`, io())).unit).toBe(UNIT);
  });
});

describe('an approval that expires (criterion 7)', () => {
  it('is valid after approving, expired after touching a criterion, none after reopening', async () => {
    const q = io('d4e5f6a0000');
    await write(q, { kind: 'approved', by: 'pedro', criteria: 1, hash: await approvalHash(UNIT, q) });
    expect(await unitState(UNIT, q)).toMatchObject({ approval: 'valid', approvedAt: 'd4e5f6a' });

    q.files.set(`/project/${SPEC}`, `${q.text(SPEC)}\ncriterion b\n  then\n    visible acme-button\n`);
    expect(await unitState(UNIT, q)).toMatchObject({ approval: 'expired', approvedAt: 'd4e5f6a' });

    await write(q, { kind: 'reopened', by: 'pedro', text: 'one more criterion' });
    const state = await unitState(UNIT, q);
    expect(state.approval).toBe('none');
    expect(state).not.toHaveProperty('approvedAt');
  });

  it('is valid again once approved after reopening, and only the last approval counts', async () => {
    const q = io();
    await write(
      q,
      { kind: 'approved', by: 'pedro', criteria: 1, hash: OTHER },
      { kind: 'reopened', by: 'pedro', text: 'again' },
      { kind: 'approved', by: 'ana', criteria: 1, hash: OTHER },
    );
    expect((await unitState(UNIT, q)).approval).toBe('expired');
    await write(q, { kind: 'approved', by: 'ana', criteria: 1, hash: await approvalHash(UNIT, q) });
    expect((await unitState(UNIT, q)).approval).toBe('valid');
  });

  it('touching the .fud does not expire it', async () => {
    const q = io();
    await write(q, { kind: 'approved', by: 'pedro', criteria: 1, hash: await approvalHash(UNIT, q) });
    q.files.set(`/project/${UNIT}`, `${FUD}<!-- touched -->\n`);
    expect((await unitState(UNIT, q)).approval).toBe('valid');
  });
});

describe('runs', () => {
  it('give the verdict and numbers of the last of their kind while the inputs hold', async () => {
    const q = io();
    const hash = await inputsHash(UNIT, q);
    await write(
      q,
      { kind: 'tests', verdict: 'red', passed: 0, total: 6, hash },
      { kind: 'spec_run', verdict: 'error', passed: 1, total: 4, hash, failing: ['b', 'c', 'd'] },
      { kind: 'tests', verdict: 'broken', passed: 5, total: 6, hash },
    );
    const state = await unitState(UNIT, q);
    expect(state.tests).toEqual({ state: 'broken', passed: 5, total: 6 });
    expect(state.spec).toEqual({ state: 'error', passed: 1, total: 4 });
  });

  it('are stale with their last verdict once the inputs change, and a reopen does not forget them', async () => {
    const q = io();
    await write(
      q,
      { kind: 'tests', verdict: 'pass', passed: 6, total: 6, hash: OTHER },
      { kind: 'spec_run', verdict: 'fail', passed: 3, total: 4, hash: OTHER, failing: ['d'] },
      { kind: 'reopened', by: 'pedro', text: 'x' },
    );
    const state = await unitState(UNIT, q);
    expect(state.tests).toEqual({ state: 'stale', last: 'pass' });
    expect(state.spec).toEqual({ state: 'stale', last: 'fail' });
  });
});

describe('look', () => {
  it('is none without a line, valid without a way to check it', async () => {
    const q = io();
    expect((await unitState(UNIT, q)).look).toBe('none');
    await write(q, { kind: 'look', by: 'pedro', hash: OTHER });
    expect((await unitState(UNIT, q)).look).toBe('valid');
  });

  it('is checked against the hash of the captures that io gives, and is none after reopening', async () => {
    let shots = OTHER;
    const asked: string[] = [];
    const q: MemoryIo = Object.assign(io(), {
      lookHash: (unit: string) => {
        asked.push(unit);
        return Promise.resolve(shots);
      },
    });
    await write(q, { kind: 'look', by: 'pedro', hash: OTHER });
    expect((await unitState(UNIT, q)).look).toBe('valid');
    expect(asked).toEqual([`/project/${UNIT}`]);
    shots = '000000000000';
    expect((await unitState(UNIT, q)).look).toBe('expired');
    await write(q, { kind: 'reopened', by: 'pedro', text: 'x' });
    expect((await unitState(UNIT, q)).look).toBe('none');
  });
});

describe('done and accepted', () => {
  it('done is the last of done and reopened', async () => {
    const q = io();
    await write(q, { kind: 'done' });
    expect((await unitState(UNIT, q)).done).toBe(true);
    await write(q, { kind: 'reopened', by: 'client', text: 'a danger variant' });
    expect((await unitState(UNIT, q)).done).toBe(false);
    await write(q, { kind: 'connected', functions: ['save'] }, { kind: 'done' }, { kind: 'documented', documented: 1, props: 1 });
    expect((await unitState(UNIT, q)).done).toBe(true);
  });

  it('accepted is the last one, with its tag and its commit, and survives a reopen', async () => {
    const q = io('9d8c7b6aaaa');
    await write(
      q,
      { kind: 'accepted', by: 'client', text: 'ok', tag: 'accepted/acme-button/2026-10-22' },
      { kind: 'accepted', by: 'client', text: 'ok again', tag: 'accepted/acme-button/2026-10-22-2' },
      { kind: 'reopened', by: 'client', text: 'x' },
    );
    expect((await unitState(UNIT, q)).accepted).toEqual({ tag: 'accepted/acme-button/2026-10-22-2', commit: '9d8c7b6' });
  });
});

describe('a broken history', () => {
  it('gives what it could read, and its FUD1220 on the .fudlog', async () => {
    const q = io();
    q.files.set(`/project/${LOG}`, '2026-10-22T10:02Z abc garbage\n2026-10-22T10:03Z ------- done\n');
    const state = await unitState(UNIT, q);
    expect(state.done).toBe(true);
    expect(state.lines).toHaveLength(1);
    expect(state.diagnostics).toHaveLength(1);
    expect(state.diagnostics[0]).toMatchObject({ code: 'FUD1220', file: `/project/${LOG}` });
  });

  it('is deterministic: the same files give the same state', async () => {
    const q = io();
    await write(q, { kind: 'tests', verdict: 'pass', passed: 1, total: 1, hash: await inputsHash(UNIT, q) });
    expect(await unitState(UNIT, q)).toEqual(await unitState(UNIT, q));
  });
});
