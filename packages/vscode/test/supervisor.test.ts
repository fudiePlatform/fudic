/**
 * Starting the server, and giving up on it (SDD-25 §4.4, criterion 10).
 *
 * The clock is injected, so what would be a seven-second test is a synchronous one. Waiting
 * for real would make this the test everyone skips, which is the same as not having it.
 */

import { describe, expect, it } from 'vitest';
import { ATTEMPTS, BACKOFF_MS, RESTART_HINT, superviseStart } from '../src/supervisor.js';
import type { ServerState } from '../src/status.js';

const supervisorWith = (failures: number) => {
  const record = {
    attempts: 0,
    states: [] as ServerState[],
    waits: [] as number[],
    log: [] as string[],
    offered: 0,
  };

  const deps = {
    start: async () => {
      record.attempts += 1;
      if (record.attempts <= failures) throw new Error(`boom ${String(record.attempts)}`);
    },
    onState: (state: ServerState) => record.states.push(state),
    delay: async (ms: number) => {
      record.waits.push(ms);
    },
    log: (message: string) => record.log.push(message),
    offerRestart: () => {
      record.offered += 1;
    },
  };

  return { deps, record };
};

describe('superviseStart', () => {
  it('starts once when the server is there', async () => {
    const { deps, record } = supervisorWith(0);

    expect(await superviseStart(deps)).toBe(true);
    expect(record.attempts).toBe(1);
    expect(record.waits).toEqual([]);
    expect(record.states).toEqual(['starting']);
  });

  it('retries with a growing wait and succeeds', async () => {
    const { deps, record } = supervisorWith(2);

    expect(await superviseStart(deps)).toBe(true);
    expect(record.attempts).toBe(3);
    expect(record.waits).toEqual([...BACKOFF_MS]);
  });

  it('gives up after three attempts and offers the manual restart', async () => {
    // Criterion 10. Three tries, then stop — not a loop. A client that retries forever
    // burns a core and buries the reason, and the reason is always external.
    const { deps, record } = supervisorWith(Number.POSITIVE_INFINITY);

    expect(await superviseStart(deps)).toBe(false);
    expect(record.attempts).toBe(ATTEMPTS);
    expect(record.states.at(-1)).toBe('stopped');
    expect(record.offered).toBe(1);
  });

  it('does not wait after the last failure', async () => {
    // Waiting for a retry that will never happen is four seconds of an editor showing the
    // wrong state before it shows the right one.
    const { deps, record } = supervisorWith(Number.POSITIVE_INFINITY);
    await superviseStart(deps);

    expect(record.waits).toHaveLength(ATTEMPTS - 1);
  });

  it('logs each failure with its attempt number', async () => {
    const { deps, record } = supervisorWith(Number.POSITIVE_INFINITY);
    await superviseStart(deps);

    expect(record.log).toHaveLength(ATTEMPTS);
    expect(record.log[0]).toContain('attempt 1 of 3');
    expect(record.log[2]).toContain('boom 3');
  });

  it('points at the command by the name the palette shows', () => {
    // The hint is useless if it names something the user cannot find.
    expect(RESTART_HINT).toContain('Fudic: Reiniciar el servidor de lenguaje');
  });
});
