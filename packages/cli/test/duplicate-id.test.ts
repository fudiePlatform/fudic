/**
 * Discovering the projects of a workspace, and the one thing two of them may not share —
 * SDD-41 §4.7 and criterion 10.
 */

import { describe, expect, it } from 'vitest';
import { FUD_CONFIG_DUPLICATE_ID } from '@fudic/config';
import { duplicateIds, findProjectConfigs } from '../src/project.js';
import { MemoryFs } from './helpers.js';

const ROOT = '/workspace';

function config(fields: Readonly<Record<string, string>>): string {
  return JSON.stringify(fields);
}

describe('findProjectConfigs', () => {
  it('finds a project by its fudic.json, wherever it hangs', () => {
    const fs = new MemoryFs(
      {
        'apps/tienda/fudic.json': config({ id: 'tienda' }),
        'libs/ui/fudic.json': config({ kind: 'lib', prefix: 'ui' }),
        'apps/tienda/src/routes/index.fud': '<!doctype html>',
      },
      ROOT,
    );

    expect(findProjectConfigs(ROOT, fs).map((project) => project.dir)).toEqual([
      'apps/tienda',
      'libs/ui',
    ]);
  });

  it('finds the root itself when the root is the project', () => {
    const fs = new MemoryFs({ 'fudic.json': config({ id: 'solo' }) }, ROOT);

    expect(findProjectConfigs(ROOT, fs)).toEqual([
      { dir: '.', config: { id: 'solo', kind: 'app', prefix: '' } },
    ]);
  });

  it('never descends into node_modules', () => {
    const fs = new MemoryFs(
      {
        'fudic.json': config({ id: 'solo' }),
        'node_modules/@acme/ui/fudic.json': config({ id: 'acme' }),
      },
      ROOT,
    );

    expect(findProjectConfigs(ROOT, fs).map((project) => project.dir)).toEqual(['.']);
  });

  it('excludes a project whose fudic.json does not read, and keeps sweeping', () => {
    const fs = new MemoryFs(
      {
        'apps/roto/fudic.json': '{',
        'apps/sana/fudic.json': config({ id: 'sana' }),
      },
      ROOT,
    );

    expect(findProjectConfigs(ROOT, fs).map((project) => project.dir)).toEqual(['apps/sana']);
  });

  it('is empty outside a workspace', () => {
    expect(findProjectConfigs(ROOT, new MemoryFs({ 'README.md': '#' }, ROOT))).toEqual([]);
  });
});

describe('duplicateIds (criterion 10)', () => {
  it('two projects with the same id is FUD0724', () => {
    const fs = new MemoryFs(
      {
        'apps/uno/fudic.json': config({ id: 'tienda' }),
        'apps/dos/fudic.json': config({ id: 'tienda' }),
      },
      ROOT,
    );

    const errors = duplicateIds(findProjectConfigs(ROOT, fs));

    expect(errors.map((error) => error.code)).toEqual([FUD_CONFIG_DUPLICATE_ID]);
    expect(errors[0]?.message).toContain('apps/uno, apps/dos');
  });

  it('different ids collide with nothing', () => {
    const fs = new MemoryFs(
      {
        'apps/uno/fudic.json': config({ id: 'uno' }),
        'apps/dos/fudic.json': config({ id: 'dos' }),
      },
      ROOT,
    );

    expect(duplicateIds(findProjectConfigs(ROOT, fs))).toEqual([]);
  });

  it('projects that declare no id declare no identity, and never collide', () => {
    const fs = new MemoryFs(
      {
        'libs/ui/fudic.json': config({ kind: 'lib' }),
        'libs/guia/fudic.json': config({ kind: 'lib' }),
      },
      ROOT,
    );

    expect(duplicateIds(findProjectConfigs(ROOT, fs))).toEqual([]);
  });
});
