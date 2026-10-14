/**
 * `fudic-workbench run` when no browser starts: the run answers the browser's FUD0975 and leaves
 * nothing behind. The browser is swapped; Vite and the server are real.
 */

import { existsSync } from 'node:fs';
import { FUD0975 } from '@fudic/diagnostics';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isFailure } from '../../src/types.js';
import { tempProject, type TempProject } from '../helpers/project.js';

vi.mock('../../src/browser.js', async (original) => {
  const real = await original<typeof import('../../src/browser.js')>();
  return {
    ...real,
    launchBrowser: async () => ({
      diagnostic: FUD0975({ tried: ['firefox'], reason: 'firefox: not found', install: 'npx playwright-core install firefox' }),
    }),
  };
});

const { runSpecs } = await import('../../src/run.js');

let project: TempProject | undefined;

afterEach(() => {
  project?.remove();
  project = undefined;
});

describe('runSpecs without a browser', () => {
  it('answers FUD0975 and deletes its folder', async () => {
    project = tempProject('run-no-browser');
    project.write('src/components/app-tabs.fudspec', 'component app-tabs\n\ncriterion a\n  then\n    visible app-tabs\n');
    const answer = await runSpecs([], { root: project.root, browser: 'firefox' });
    expect(isFailure(answer) && answer.diagnostic.code).toBe('FUD0975');
    expect(existsSync(project.path('node_modules/.fudic-bench'))).toBe(false);
  }, 60_000);
});
