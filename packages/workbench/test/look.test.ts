/**
 * SDD-78 §4.4, `lookInBrowser` without a browser: the browser it is asked for reaches the start of
 * the project, and a project that does not start is its failure. test/browser/look.test.ts paints
 * the cases in Chrome.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FUD0971 } from '@fudic/diagnostics';
import { PROJECT } from './helpers/bench.js';

const state = vi.hoisted(() => ({ started: [] as unknown[], failure: undefined as { diagnostic: unknown } | undefined }));

vi.mock('../src/project.js', () => ({
  startProject: async (input: unknown) => {
    state.started.push(input);
    return state.failure;
  },
}));

vi.mock('../src/execute-fixtures.js', () => ({
  executeFixtures: async (_root: string, files: readonly string[]) => ({ fixtures: new Map([[files[0], { only: { value: 1 } }]]), diagnostics: [] }),
}));

const { lookInBrowser } = await import('../src/paint.js');

/** A real component of the fixture project, with a fixture beside it. */
const BUMP = `${PROJECT}/src/components/app-bump.fud`;

beforeEach(() => {
  state.started = [];
  state.failure = { diagnostic: FUD0971({ file: 'x.fud' }) };
});

describe('lookInBrowser, without a browser', () => {
  it('a project that does not start is its failure, with the browser it was asked for', async () => {
    expect(await lookInBrowser({ component: BUMP, browser: 'firefox' })).toBe(state.failure);
    expect(state.started).toEqual([expect.objectContaining({ options: { browser: 'firefox' } })]);
  });

  it('without a browser asked for, the bench chooses', async () => {
    await lookInBrowser({ component: BUMP });
    expect(state.started).toEqual([expect.objectContaining({ options: {} })]);
  });
});
