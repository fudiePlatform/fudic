/**
 * SDD-82 §3.9 against a real app Vite and a real browser: `record` runs a page's and a flow's
 * criteria against the real server, writes what it answered into their fixtures — `data` in
 * order, `calls` by criterion, a file with its bytes — changes the `.fudspec` to name it, and the
 * criterion passes afterwards with the server's handlers broken. Criteria 32 and 33.
 */

import { existsSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FudDiagnostic } from '@fudic/diagnostics';
import { runSpecs, type RunSummary } from '../../src/run.js';
import { isFailure } from '../../src/types.js';
import { REPO } from '../helpers/bench.js';
import { tempProject, type TempProject } from '../helpers/project.js';

/** A term module: its meta and its `run`. */
function term(name: string, block: string, params: readonly string[], body: string): string {
  const meta = { name, block, params: params.map((p) => ({ name: p, type: 'string' })) };
  return `export const meta = ${JSON.stringify(meta)};\n\nexport async function run(ctx, args) {\n  ${body}\n}\n\nexport async function selfTest() {}\n`;
}

/** A term that asks a function of the page by `fetch`, as its client would. */
const fetching = (name: string, url: string, init: string): string =>
  term(name, 'when', ['value'], `await ctx.page.evaluate(async (value) => { await fetch('${url}', ${init}); }, String(args.value));
  return { pass: true, evidence: null };`);

const JSON_HEADERS = "{ 'content-type': 'application/json', accept: 'application/json' }";

const SERVER = `import { setCookie } from '@fudic/http';
import { load, login, exportar } from 'fudic:routes/usuarios';

load.handle((ctx) => ({ users: ['real'], who: ctx.cookies.get('fudic-session') ?? '' }));
login.handle((ctx) => { setCookie(ctx, 'fudic-session', ctx.args.user); });
exportar.handle(() => new File(['nombre\\nana\\n'], 'personas.csv', { type: 'text/csv' }));
`;

/** The same server, broken: what a criterion recorded must not need. */
const BROKEN = `import { load, login, exportar } from 'fudic:routes/usuarios';

load.handle(() => { throw new Error('the server is down'); });
login.handle(() => { throw new Error('the server is down'); });
exportar.handle(() => { throw new Error('the server is down'); });
`;

const SPEC = `page /usuarios

criterion entrar-como-ana
  given
    data aun-no-existe
    answers tampoco
  when
    login "ana"
    exportar "csv"
    go "/usuarios"
  then
    has "p" "Sesión: ana"

criterion no-pasa
  then
    has "p" "Sesión: luis"
`;

const FILES: Readonly<Record<string, string>> = {
  'package.json': JSON.stringify({ name: 'bench-record', private: true, type: 'module', dependencies: { '@fudic/http': '0.0.0' } }),
  'vite.config.ts': "import { fudic } from '@fudic/vite';\n\nexport default { plugins: [fudic({ liveCheck: false })] };\n",
  'src/http.fudapi': 'chain\n  use json\n',
  'src/routes/usuarios.fud': `<!DOCTYPE html>
<html>
<head><title>Usuarios</title><link rel="server" href="./usuarios.fudapi"></head>
<body><p>Sesión: @data.who</p><ul>@foreach (const u of data.users) key (u) { <li>@u</li> }</ul></body>
</html>
`,
  'src/routes/usuarios.fudapi': 'load\n  users  str[]\n  who    str\n\npost login\n  user  str\n\nget exportar\n  -> file\n',
  'src/server/usuarios.ts': SERVER,
  'src/routes/usuarios.fudspec': SPEC,
  // A `load` that answers what has no literal.
  'src/routes/raro.fud': `<!DOCTYPE html>
<html>
<head><title>Raro</title><link rel="server" href="./raro.fudapi"></head>
<body><p>n @data.n</p></body>
</html>
`,
  'src/routes/raro.fudapi': 'load\n  n  i32\n',
  'src/server/raro.ts': `import { load } from 'fudic:routes/raro';

load.handle(() => ({ n: 1, format: () => 'x' }) as never);
`,
  'src/routes/raro.fixture.ts': `export default {
  data: {
    'con-funcion': { n: 7 },
  },
};
`,
  'src/routes/raro.fudspec': `page /raro

criterion con-funcion
  given
    data con-funcion
  then
    has "p" "n 1"
`,
  // A flow without a fixture yet: the call it makes is written into a new one.
  'src/flows/alta.fudspec': `flow alta

criterion entra
  given
    url /usuarios
  when
    login "luis"
  then
    has "p" "Sesión"

criterion a-ninguna-parte
  given
    url /nada
  then
    has "p" "Sesión"
`,
  // A component's spec is not recorded.
  'src/components/app-nada.fud': '<app-nada><template shadowrootmode="open"><p>nada</p></template></app-nada>\n',
  'src/components/app-nada.fudspec': 'component app-nada\n\ncriterion uno\n  then\n    text p "nada"\n',
  'fudic/terms/when/go.js': term('go', 'when', ['url'], 'await ctx.page.goto(new URL(String(args.url), ctx.page.url()).href); return { pass: true, evidence: null };'),
  'fudic/terms/when/login.js': fetching('login', '/_fudic/fn/routes/usuarios/login', `{ method: 'POST', headers: ${JSON_HEADERS}, body: JSON.stringify({ user: value }) }`),
  'fudic/terms/when/exportar.js': fetching('exportar', '/_fudic/fn/routes/usuarios/exportar', '{ headers: { accept: \'application/json\' } }'),
  'fudic/terms/then/has.js': term('has', 'then', ['css', 'text'], `const n = await ctx.page.locator(String(args.css), { hasText: String(args.text) }).count();
  return { pass: n > 0, evidence: { expected: 'there', actual: String(n) } };`),
};

let project: TempProject;
let recorded: RunSummary;
const said: FudDiagnostic[] = [];

beforeAll(async () => {
  project = tempProject('record');
  for (const [path, text] of Object.entries(FILES)) project.write(path, text);
  mkdirSync(project.path('node_modules/@fudic'), { recursive: true });
  for (const name of ['http', 'di', 'forms', 'conventions', 'spec']) {
    symlinkSync(`${REPO}/packages/${name}`, project.path(`node_modules/@fudic/${name}`), 'junction');
  }
  const ran = await runSpecs(['src/routes', 'src/flows', 'src/components'], {
    root: project.root,
    record: true,
    onDiagnostic: (d) => void said.push(d),
  });
  if (isFailure(ran)) throw new Error(ran.diagnostic.message);
  recorded = ran;
}, 240_000);

afterAll(() => {
  project.remove();
});

describe('record (criterion 32)', () => {
  it('runs against the real server, without data or answers, and says what it wrote', () => {
    expect(recorded.recording?.recorded).toEqual([
      { spec: project.path('src/routes/raro.fudspec'), id: 'con-funcion', data: [], calls: [] },
      { spec: project.path('src/routes/usuarios.fudspec'), id: 'entrar-como-ana', data: ['entrar-como-ana', 'entrar-como-ana-2'], calls: ['login', 'exportar'] },
      { spec: project.path('src/flows/alta.fudspec'), id: 'entra', data: [], calls: ['login'] },
    ]);
    expect(recorded.recording?.skipped).toEqual([
      { spec: project.path('src/routes/usuarios.fudspec'), id: 'no-pasa', reason: 'it did not pass (fail)' },
      { spec: project.path('src/flows/alta.fudspec'), id: 'a-ninguna-parte', reason: 'it did not pass (fail)' },
    ]);
  });

  it('writes data in order and calls by criterion into the page fixture, which it creates', () => {
    expect(project.read('src/routes/usuarios.fixture.ts')).toBe(
      "import type { Fixtures } from 'fudic:routes/usuarios';\nimport { file } from '@fudic/spec';\n\n" +
        'export default {\n  data: {\n' +
        "    'entrar-como-ana': { users: ['real'], who: '' },\n" +
        "    'entrar-como-ana-2': { users: ['real'], who: 'ana' },\n  },\n" +
        "  calls: {\n    'entrar-como-ana': {\n      login: undefined,\n      exportar: file('./fixtures/entrar-como-ana/personas.csv', { type: 'text/csv' }),\n    },\n  },\n" +
        '} satisfies Fixtures;\n',
    );
  });

  it('changes the .fudspec to name them, and leaves the rest as written', () => {
    expect(project.read('src/routes/usuarios.fudspec')).toBe(
      SPEC.replace('data aun-no-existe', 'data entrar-como-ana entrar-como-ana-2').replace('answers tampoco', 'answers entrar-como-ana'),
    );
  });

  it('writes a flow’s calls into a new fixture of its own', () => {
    expect(project.read('src/flows/alta.fixture.ts')).toBe(
      "import type { FlowFixtures } from '@fudic/spec';\n\nexport default {\n  calls: {\n    entra: { login: undefined },\n  },\n} satisfies FlowFixtures;\n",
    );
    expect(project.read('src/flows/alta.fudspec')).toContain('  given\n    answers entra\n    url /usuarios\n');
  });

  it('a component’s spec is not recorded', () => {
    expect(said.find((d) => d.code === 'FUD1207')?.message).toContain('only a page or a flow is recorded');
  });

  it('the criterion passes afterwards with the server broken', async () => {
    project.write('src/server/usuarios.ts', BROKEN);
    const again = await runSpecs(['src/routes/usuarios.fudspec'], { root: project.root, criteria: ['entrar-como-ana'] });
    if (isFailure(again)) throw new Error(again.diagnostic.message);
    const report = again.reports.find((r) => r.id === 'entrar-como-ana');
    expect(report).toMatchObject({ verdict: 'pass' });
    expect(report?.calls?.map((c) => [c.name, c.faked])).toEqual([
      ['login', true],
      ['exportar', true],
    ]);
    project.write('src/server/usuarios.ts', SERVER);
  }, 240_000);
});

describe('record (criterion 33)', () => {
  it('a File received is written with its bytes beside the fixture', () => {
    const csv = project.path('src/routes/fixtures/entrar-como-ana/personas.csv');
    expect(existsSync(csv)).toBe(true);
    expect(readFileSync(csv, 'utf8')).toBe('nombre\nana\n');
  });

  it('a value with a function is FUD1515 and not recorded: its data line goes, the fixture keeps what it had', () => {
    expect(said.find((d) => d.code === 'FUD1515')).toMatchObject({
      severity: 'warning',
      message: '`data.con-funcion.format` is a function and cannot be written as a literal: not recorded',
    });
    expect(project.read('src/routes/raro.fudspec')).not.toContain('data ');
    expect(project.read('src/routes/raro.fixture.ts')).toContain("'con-funcion': { n: 7 }");
  });
});
