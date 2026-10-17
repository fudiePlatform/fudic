/**
 * Criterion 30: `examples/basic` as it is — app-card and the tab strip, each with its
 * `.fudspec` — opened in the workbench, and every criterion green. Nothing is written into the
 * example: the workbench's own folder lives under its `node_modules` and goes on close.
 */

import { existsSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openWorkbench } from '../../src/open.js';
import type { ResultMessage } from '../../src/protocol.js';
import { isFailure, type WorkbenchSession } from '../../src/types.js';
import { EXAMPLE, EXAMPLE_TERMS } from '../helpers/bench.js';
import { connectShell, isSession, type Shell } from '../helpers/project.js';

let session: WorkbenchSession | undefined;
let shell: Shell | undefined;

afterEach(async () => {
  shell?.close();
  await session?.close();
  shell = undefined;
  session = undefined;
});

describe('examples/basic in the workbench — criterion 30', () => {
  it('SDD-59 §4.11 — keeps no term the stock vocabulary already has: only given/route', () => {
    const own = ['given', 'when', 'then'].flatMap((block) =>
      existsSync(`${EXAMPLE_TERMS}/${block}`) ? readdirSync(`${EXAMPLE_TERMS}/${block}`).map((file) => `${block}/${file}`) : [],
    );
    expect(own).toEqual(['given/route.js']);
  });

  it.each(['app-card', 'app-tabs'])('every criterion of %s is green', async (tag) => {
    const opened = await openWorkbench(`${EXAMPLE}/src/components/${tag}.fud`);
    if (isFailure(opened)) throw new Error(opened.diagnostic.message);
    session = opened;
    shell = await connectShell(opened.url);

    const message = await shell.next(isSession);
    expect(message.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const ids = message.criteria.map((c) => c.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(opened.criteria).toBe(ids.length);

    const results = await Promise.all(
      ids.map((id) => shell!.next((m): m is ResultMessage => m.type === 'result' && m.id === id, 0, 60_000)),
    );
    expect(results.map((r) => [r.id, r.verdict, r.error ?? r.steps.find((s) => 'error' in s || !s.pass)])).toEqual(
      ids.map((id) => [id, 'pass', undefined]),
    );
    // SDD-59 §6.7.8: the stock terms of @fudic/terms; only `route` is the example's own.
    for (const step of results.flatMap((r) => r.steps)) {
      expect(`${step.term}:${step.layer}`).toMatch(/^route:workspace$|:framework$/u);
    }

    await opened.close();
    expect(existsSync(`${EXAMPLE}/node_modules/.fudic-bench/${process.pid}`)).toBe(false);
  }, 120_000);

  it('criterion 3 of BUG-48 — opening app-card writes no false FUD0742', async () => {
    const written: string[] = [];
    const spies = [
      vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => void written.push(args.join(' '))),
      vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void written.push(args.join(' '))),
      vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void written.push(args.join(' '))),
    ];
    try {
      const opened = await openWorkbench(`${EXAMPLE}/src/components/app-card.fud`);
      if (isFailure(opened)) throw new Error(opened.diagnostic.message);
      session = opened;
      shell = await connectShell(opened.url);
      const message = await shell.next(isSession);
      await Promise.all(
        message.criteria.map((c) => shell!.next((m): m is ResultMessage => m.type === 'result' && m.id === c.id, 0, 60_000)),
      );
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
    expect(written.filter((line) => line.includes('FUD0742'))).toEqual([]);
  }, 120_000);

  it('the tab strip has the two criteria of the bug of the first click', async () => {
    const opened = await openWorkbench(`${EXAMPLE}/src/components/app-tabs.fudspec`);
    if (isFailure(opened)) throw new Error(opened.diagnostic.message);
    session = opened;
    shell = await connectShell(opened.url);
    expect((await shell.next(isSession)).criteria.map((c) => c.id)).toEqual(['empieza-en-a', 'cambia-de-pestana']);
  }, 120_000);
});
