/**
 * SDD-70 — what the compiler is told about a linked `.fudapi` whose `load` marks fields `later`:
 * their names, in declaration order. A file with none says nothing (`api-units.test.ts`).
 */

import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApiProject } from '../src/api-modules.js';

describe('ApiProject.linked — the later fields of load (SDD-70)', () => {
  it('names them in the order the contract declares them', () => {
    const root = mkdtempSync(join(tmpdir(), 'fudic-api-later-')).replace(/\\/gu, '/');
    mkdirSync(join(root, 'src/routes'), { recursive: true });
    writeFileSync(join(root, 'package.json'), '{}');
    writeFileSync(
      join(root, 'src/routes/espera.fudapi'),
      'load\n  title  str\n  users  Person[]  later\n  stats  i32  later\n\ntype Person\n  id  i32\n',
    );
    writeFileSync(join(root, 'src/routes/espera.fud'), '<p>x</p>');

    expect(new ApiProject(root).linked(`${root}/src/routes/espera.fudapi`)?.later).toEqual(['users', 'stats']);
  });
});
