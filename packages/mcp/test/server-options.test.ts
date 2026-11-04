/**
 * What each tool takes from a call reaches what it does: the options of fudic_fix and
 * fudic_format over a client, and the runners loaded by the importer Node gives.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRunners } from '../src/fudic.js';
import { openProject } from '../src/project.js';
import { createServer } from '../src/server.js';
import { connect, tempDir } from './helpers.js';

describe('fudic_fix and fudic_format over a client', () => {
  it('take paths, codes and dryRun from the call', async () => {
    const dir = tempDir({ 'fudic.json': '{}' });
    try {
      const client = await connect(createServer({ project: openProject(dir.root, () => 'b59fa7d'), entry: 'stdio' }));
      const outside = async (name: string, args: Record<string, unknown>): Promise<unknown> =>
        ((await client.callTool({ name, arguments: args })).structuredContent as { diagnostics: { code: string }[] }).diagnostics.map((d) => d.code);
      // A path out of the project is refused before anything is read: the paths were passed on.
      expect(await outside('fudic_fix', { paths: ['../x'], codes: ['FUD0540'], dryRun: true })).toEqual(['FUD1400']);
      expect(await outside('fudic_format', { paths: ['../x'], dryRun: true })).toEqual(['FUD1400']);
      // Without paths, the whole project: here there is nothing to format.
      expect(await outside('fudic_format', { dryRun: true })).toEqual([]);
      await client.close();
    } finally {
      dir.dispose();
    }
  }, 60_000);
});

describe('loadRunners with the importer of Node', () => {
  it('imports the file the package exports', async () => {
    const dir = tempDir();
    try {
      const pkg = join(dir.root, 'node_modules/@fudic/testing');
      mkdirSync(pkg, { recursive: true });
      writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: '@fudic/testing', type: 'module', exports: { './run': { import: './run.js' } } }));
      writeFileSync(join(pkg, 'run.js'), 'export const runTests = () => "ran";\n');
      const { runTests } = await loadRunners(dir.root);
      expect((runTests as unknown as () => string)()).toBe('ran');
    } finally {
      dir.dispose();
    }
  });
});
