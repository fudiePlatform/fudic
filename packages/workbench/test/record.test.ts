/**
 * SDD-82 §3.9: what `writeRecording` makes of what the bench kept — the cases a real server
 * hardly gives: an answer that never settles, a value with no literal after a good one, a file
 * deep inside a value, a fixture it cannot write into, nothing to write.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Recorded } from '@fudic/vite';
import type { CriterionResult } from '../src/engine.js';
import { writeRecording } from '../src/record.js';
import { slashes, type BenchTarget } from '../src/target.js';

let root: string;

beforeEach(() => {
  root = slashes(mkdtempSync(`${tmpdir()}/record-`));
  mkdirSync(`${root}/src/routes`, { recursive: true });
  mkdirSync(`${root}/src/flows`, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const page = (fixture: string | null = null): BenchTarget => ({
  kind: 'page',
  tag: 'page-usuarios',
  component: `${root}/src/routes/usuarios.fud`,
  route: '/usuarios',
  spec: `${root}/src/routes/usuarios.fudspec`,
  fixture,
  projectRoot: root,
});

const flow = (): BenchTarget => ({
  kind: 'flow',
  tag: 'flow-alta',
  component: `${root}/src/flows/alta.fudspec`,
  spec: `${root}/src/flows/alta.fudspec`,
  fixture: null,
  projectRoot: root,
});

const result = (id: string, recorded: readonly Recorded[] | undefined, verdict: CriterionResult['verdict'] = 'pass'): CriterionResult => ({
  id,
  verdict,
  ms: 1,
  steps: [],
  pageErrors: [],
  shots: {},
  marks: [],
  diagnostics: [],
  ...(recorded !== undefined ? { recorded } : {}),
});

const data = (value: unknown, route = 'routes/usuarios'): Recorded => ({ kind: 'data', route, value: Promise.resolve(value) });
const call = (name: string, value: unknown): Recorded => ({ kind: 'call', name, value });
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8');

const SPEC = 'page /usuarios\n\ncriterion a\n  then\n    title "x"\n\ncriterion b\n  then\n    title "x"\n';

describe('writeRecording', () => {
  it('a data that never settles is FUD1515, and the ones after it are not named', async () => {
    writeFileSync(`${root}/src/routes/usuarios.fudspec`, SPEC);
    const never: Recorded = { kind: 'data', route: 'routes/usuarios', value: new Promise(() => undefined) };
    const out = await writeRecording(page(), [result('a', [data({ n: 1 }), never, data({ n: 3 })])], 5);
    expect(out.recorded).toEqual([{ spec: `${root}/src/routes/usuarios.fudspec`, id: 'a', data: ['a'], calls: [] }]);
    expect(out.diagnostics).toMatchObject([{ code: 'FUD1515', message: expect.stringContaining('`data.a-2` is an answer that never settled') }]);
    expect(read('src/routes/usuarios.fudspec')).toContain('criterion a\n  given\n    data a\n  then');
  });

  it('a data with no literal after a good one stops there; another route’s data is not the page’s', async () => {
    writeFileSync(`${root}/src/routes/usuarios.fudspec`, SPEC);
    const out = await writeRecording(page(), [result('a', [data({ n: 1 }, 'routes/otra'), data({ $fails: { status: 503, title: 'caído' } }), data({ at: new Date(0) }), data({ n: 3 })])]);
    expect(read('src/routes/usuarios.fixture.ts')).toContain("a: fails(503, 'caído'),");
    expect(out.recorded[0]?.data).toEqual(['a']);
    expect(out.diagnostics).toMatchObject([{ code: 'FUD1515', message: expect.stringContaining('`data.a-2.at` is a Date') }]);
  });

  it('a call with no literal runs for real; the last answer of a call is the one written; a file deep inside, with its bytes', async () => {
    writeFileSync(`${root}/src/routes/usuarios.fudspec`, SPEC);
    const plain = new File(['x'], 'sin-tipo.bin');
    const out = await writeRecording(page(), [
      result('a', [
        call('search', ['primera']),
        call('search', ['luis']),
        call('format', () => 'x'),
        call('docs', { list: [plain], at: new Map() }),
        call('later', { $later: 10, value: 1 }),
      ]),
    ]);
    expect(out.recorded[0]?.calls).toEqual(['search', 'later']);
    expect(out.diagnostics.map((d) => d.message)).toEqual([
      '`calls.a.format` is a function and cannot be written as a literal: not recorded',
      '`calls.a.docs.at` is a Map and cannot be written as a literal: not recorded',
    ]);
    expect(read('src/routes/fixtures/a/sin-tipo.bin')).toBe('x');
    expect(read('src/routes/usuarios.fixture.ts')).toContain("a: { search: ['luis'], later: later(10, 1) }");
    expect(read('src/routes/usuarios.fixture.ts')).toContain("import { later } from '@fudic/spec';");
    expect(read('src/routes/usuarios.fudspec')).toContain('criterion a\n  given\n    answers a\n  then');
  });

  it('a fixture it cannot write into is FUD1510, and the criterion is not recorded', async () => {
    writeFileSync(`${root}/src/routes/usuarios.fudspec`, SPEC);
    writeFileSync(`${root}/src/routes/usuarios.fixture.ts`, 'export default make();\n');
    const out = await writeRecording(page(`${root}/src/routes/usuarios.fixture.ts`), [result('a', [data({ n: 1 })])]);
    expect(out.recorded).toEqual([]);
    expect(out.skipped).toMatchObject([{ id: 'a', reason: expect.stringContaining('export default object literal') }]);
    expect(out.diagnostics).toMatchObject([{ code: 'FUD1510' }]);
    expect(read('src/routes/usuarios.fixture.ts')).toBe('export default make();\n');
    expect(read('src/routes/usuarios.fudspec')).toBe(SPEC);
  });

  it('writes nothing when nothing recorded: a criterion that did not record, or did not pass', async () => {
    writeFileSync(`${root}/src/routes/usuarios.fudspec`, SPEC);
    const out = await writeRecording(page(), [result('a', undefined), result('b', [data({ n: 1 })], 'error')]);
    expect(out).toEqual({ recorded: [], skipped: [{ spec: `${root}/src/routes/usuarios.fudspec`, id: 'b', reason: 'it did not pass (error)' }], diagnostics: [] });
    expect(existsSync(`${root}/src/routes/usuarios.fixture.ts`)).toBe(false);
  });

  it('a flow keeps no data, and a spec that is gone is written anew', async () => {
    const out = await writeRecording(flow(), [result('entra', [data({ n: 1 }), call('login', undefined)])]);
    expect(out.recorded).toEqual([{ spec: `${root}/src/flows/alta.fudspec`, id: 'entra', data: [], calls: ['login'] }]);
    expect(read('src/flows/alta.fixture.ts')).toContain('entra: { login: undefined }');
    expect(read('src/flows/alta.fudspec')).toBe('');
  });
});
