/**
 * The fixtures of a project, executed (SDD-66 §4.2): a fixture can hold signals and `$content`,
 * and its real shape is only known by running it. Run through Vite, as the workbench runs them,
 * so an `import { signal } from '@fudic/core'` resolves as it does in the project.
 */

import { FUD0973, type FudDiagnostic } from '@fudic/diagnostics';
import { createServer } from 'vite';
import { firstLine } from './browser.js';
import type { ExecutedFixtures } from './pages.js';

export interface ExecutedProject {
  /** By fixture file, as given: its `export default`. A fixture that threw is not here. */
  readonly fixtures: ReadonlyMap<string, ExecutedFixtures>;
  /** `FUD0973` for each fixture that threw. */
  readonly diagnostics: readonly FudDiagnostic[];
}

/** Every fixture in `files` (absolute), executed from the project at `root`, in one Vite. */
export async function executeFixtures(root: string, files: readonly string[]): Promise<ExecutedProject> {
  const vite = await createServer({ root, configFile: false, appType: 'custom', logLevel: 'silent', server: { middlewareMode: true, hmr: false } });
  const fixtures = new Map<string, ExecutedFixtures>();
  const diagnostics: FudDiagnostic[] = [];
  try {
    for (const file of files) {
      try {
        const module = await vite.ssrLoadModule(file);
        fixtures.set(file, (module['default'] ?? {}) as ExecutedFixtures);
      } catch (error) {
        diagnostics.push(FUD0973({ file, reason: firstLine(error) }));
      }
    }
  } finally {
    await vite.close();
  }
  return { fixtures, diagnostics };
}
