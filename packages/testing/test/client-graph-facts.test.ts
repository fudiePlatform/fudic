import { describe, expect, test } from 'vitest';
import { factsOf } from '../src/client-graph.js';

const effects = async (code: string): Promise<boolean> => (await factsOf(code)).effects;

describe('what keeps a module in a bundle (decision 8.1.23)', () => {
  test('declarations that call nothing do nothing', async () => {
    expect(await effects('import { a } from "./a";\nexport * from "./b";\nexport { c } from "./c";')).toBe(false);
    expect(await effects('function f() { g(); }\nclass K { m() { g(); } }')).toBe(false);
    expect(await effects('export const n = 1, s = `x`;\nexport function h() { return g(); }')).toBe(false);
    expect(await effects('const lazy = () => g(), fn = function () { return g(); };')).toBe(false);
    expect(await effects('export default function () { g(); }')).toBe(false);
    expect(await effects('export default { a: 1 };')).toBe(false);
  });

  test('a call, a new or a tagged template at the top level is an effect', async () => {
    expect(await effects('Service(Tokens);')).toBe(true);
    expect(await effects('export const t = token("x");')).toBe(true);
    expect(await effects('const m = new Map();')).toBe(true);
    expect(await effects('const q = sql`select`;')).toBe(true);
    expect(await effects('export default make();')).toBe(true);
    expect(await effects('if (a) b = 1;')).toBe(true);
  });

  test('the sources still needed: used names, bare imports and re-exports', async () => {
    const { needed } = await factsOf(
      'import { used } from "/u";\nimport { unused } from "/x";\nimport "/side";\nexport * from "/all";\nexport { r } from "/re";\nused();',
    );
    expect([...needed].sort()).toEqual(['/all', '/re', '/side', '/u']);
  });
});

test('a default class is defined, not run', async () => {
  expect(await effects('export default class { m() { g(); } }')).toBe(false);
  expect(await effects('const K = class { m() { g(); } };')).toBe(false);
});
