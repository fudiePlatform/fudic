/**
 * SDD-75 §4.3 — what a `.fudapi` generates, at its edges: a file nobody can read, and a project
 * with one. The cases with a server are `acceptance/fudapi-generated.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { FILES, SRC, world } from './_api.js';

describe('generated, at the edges', () => {
  it('a file that cannot be read is an empty one: clean, and its module is empty of pieces', () => {
    const { generated } = world({ files: { ...FILES, [`${SRC}/routes/gone.fudapi`]: undefined } });
    const answer = generated.module(`${SRC}/routes/gone.fudapi`, 'server');
    expect(answer).toMatchObject({ name: 'fudic:routes/gone.server.ts' });
  });

  it('Regenerate reads a listed file that cannot be read as empty, and writes its own types', () => {
    const { host, fs } = world({ files: { ...FILES, [`${SRC}/routes/gone.fudapi`]: undefined } });
    const written = host.regenerate(`${SRC}/types/person.fudapi`);
    expect(written).toEqual([`${SRC.slice(0, -4)}/.fudic/api/types/person.d.ts`]);
    expect(fs.writes).toEqual(written);
    expect(host.written(written[0]!)).toContain('Person');
  });
});
