/**
 * SDD-87 criterion 2: an agent that asks `fudic_status` in `examples/workspace` reads which error
 * page each app paints with. `admin` has none of its own and paints with the one of `ui`;
 * `tienda` depends on `ui` too and paints with its own. The workspace as it is in the repository,
 * installed by `pnpm install`.
 */

import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Session } from '../src/session.js';
import { statusOf } from '../src/status.js';
import type { Checks } from '../src/checks.js';
import { fakeProject } from './helpers.js';

const WORKSPACE = fileURLToPath(new URL('../../../examples/workspace/', import.meta.url));

/** Checks with nothing to say: what is asked here is the project block. */
const quiet = (root: string): Checks =>
  ({
    run: async () => ({ problems: [], project: [], inputs: [] }),
    repairs: async () => [],
    service: async () => ({ pieces: () => [], handlers: () => undefined, repairs: () => [] }),
    folders: async () => [root],
    fudic: async () => ({ cli: { nodeReadIo: () => ({}), workspaceRoot: () => null } }),
  }) as unknown as Checks;

async function errorPageIn(app: string): Promise<unknown> {
  const root = `${WORKSPACE}apps/${app}`;
  const answer = await statusOf(fakeProject(root), quiet(root), new Session());
  return (answer.body['project'] as Record<string, unknown>)['errorPage'];
}

describe('fudic_status in examples/workspace (criterion 2)', () => {
  it('admin: the page of @fudic/example-ui', async () => {
    expect(await errorPageIn('admin')).toEqual({ from: '@fudic/example-ui', file: '../../libs/ui/src/_error.fud' });
  });

  it('tienda: its own', async () => {
    expect(await errorPageIn('tienda')).toEqual({ from: 'own', file: 'src/routes/_error.fud' });
  });
});
