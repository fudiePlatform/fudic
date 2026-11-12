/**
 * SDD-82 §3.8, §4.2–§4.5 against a real app Vite and a real browser: flows with their services,
 * one instance per criterion; the session of a real login, kept by the criterion's browser;
 * `as` with a browser of its own; the quiet page before a `then`; and what a backend that is not
 * fudic's asks the bench. Criteria 19–21, 29–31 and 34.
 *
 * The vocabulary of SDD-82 §3.7 is not this phase's: the project carries the few terms these
 * criteria need in its own `fudic/terms/`, as a project would.
 */

import { mkdirSync, symlinkSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runSpecs, type RunSummary } from '../../src/run.js';
import type { CriterionReport } from '../../src/report-of.js';
import { isFailure } from '../../src/types.js';
import { REPO } from '../helpers/bench.js';
import { inbox, resultOf, tempProject, type TempProject } from '../helpers/project.js';
import { openWorkbench } from '../../src/open.js';
import { startProject } from '../../src/project.js';

const FILES: Readonly<Record<string, string>> = {
  'package.json': JSON.stringify({ name: 'bench-app', private: true, type: 'module', dependencies: { '@fudic/http': '0.0.0' } }),
  'vite.config.ts': "import { fudic } from '@fudic/vite';\n\nexport default { plugins: [fudic({ liveCheck: false })] };\n",
  'src/http.fudapi': 'chain\n  use json\n',
  'src/users.ts': `import { Service } from '@fudic/di';

export class Users {
  constructor(readonly list: string[] = ['real']) {}
  all(): string[] { return this.list; }
  add(name: string): void { this.list.push(name); }
}
Service(Users);
`,
  'src/routes/usuarios.fud': `<!DOCTYPE html>
<html>
<head><title>Usuarios</title><link rel="server" href="./usuarios.fudapi"></head>
<body><ul>@foreach (const u of data.users) key (u) { <li>@u</li> }</ul></body>
</html>
`,
  'src/routes/usuarios.fudapi': 'load\n  users  str[]\n\nput add\n  name  str\n  -> str\n\nget hang\n  -> str\n',
  'src/server/usuarios.ts': `import { inject } from '@fudic/di';
import { load, add, hang } from 'fudic:routes/usuarios';
import { Users } from '../users';

load.handle(() => ({ users: inject(Users).all() }));
add.handle((ctx) => { inject(Users).add(ctx.args.name); return ctx.args.name; });
hang.handle(() => new Promise<string>(() => undefined));
`,
  'src/routes/cuenta.fud': `<!DOCTYPE html>
<html>
<head><title>Cuenta</title><link rel="server" href="./cuenta.fudapi"></head>
<body><p>@(data.who === '' ? 'Nadie ha entrado' : 'Sesión: ' + data.who)</p></body>
</html>
`,
  'src/routes/cuenta.fudapi': 'load\n  who  str\n\npost login\n  user  str\n',
  'src/server/cuenta.ts': `import { setCookie } from '@fudic/http';
import { load, login } from 'fudic:routes/cuenta';

load.handle((ctx) => ({ who: ctx.cookies.get('fudic-session') ?? '' }));
login.handle((ctx) => { setCookie(ctx, 'fudic-session', ctx.args.user); });
`,
  // The quiet page: what each page starts on its own, from a file of `public/`.
  'src/routes/espera.fud': quietPage('Espera', '/debounce.js'),
  'src/routes/reloj.fud': quietPage('Reloj', '/clock.js'),
  'src/routes/colgada.fud': quietPage('Colgada', '/hang.js'),
  'public/data.json': JSON.stringify(['una', 'otra']),
  'public/debounce.js': `setTimeout(async () => {
  const items = await (await fetch('/data.json')).json();
  for (const item of items) document.querySelector('ul').append(Object.assign(document.createElement('li'), { textContent: item }));
}, 300);
`,
  'public/clock.js': "setInterval(() => { document.querySelector('ul').dataset.now = String(Date.now()); }, 1000);\n",
  'public/hang.js': "fetch('/_fudic/fn/routes/usuarios/hang', { headers: { accept: 'application/json' } });\n",
  // The few terms these criteria need, in the project's own layer.
  'fudic/terms/when/go.js': term('go', 'when', ['url'], 'await ctx.page.goto(new URL(String(args.url), ctx.page.url()).href); return { pass: true, evidence: null };'),
  'fudic/terms/when/add.js': term('add', 'when', ['name'], `await ctx.page.evaluate((name) => fetch('/_fudic/fn/routes/usuarios/add', { method: 'PUT', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ name }) }), String(args.name));
  return { pass: true, evidence: null };`),
  'fudic/terms/when/login.js': term('login', 'when', ['user'], `await ctx.page.evaluate((user) => fetch('/_fudic/fn/routes/cuenta/login', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ user }) }), String(args.user));
  return { pass: true, evidence: null };`),
  'fudic/terms/then/has.js': term('has', 'then', ['css', 'text'], `const n = await ctx.page.locator(String(args.css), { hasText: String(args.text) }).count();
  return { pass: n > 0, evidence: { expected: 'there', actual: String(n) } };`),
  'fudic/terms/then/absent.js': term('absent', 'then', ['css', 'text'], `const n = await ctx.page.locator(String(args.css), { hasText: String(args.text) }).count();
  return { pass: n === 0, evidence: { expected: 'absent', actual: String(n) } };`, true),
  'fudic/terms/then/at.js': term('at', 'then', ['path'], `const at = new URL(ctx.page.url()).pathname;
  return { pass: at === String(args.path), evidence: { expected: String(args.path), actual: at } };`),
  'fudic/terms/then/bench-says.js': term('bench-says', 'then', ['services'], `const said = await ctx.page.evaluate(async () => {
    const id = decodeURIComponent(document.cookie.split('; ').find((c) => c.startsWith('fudic-bench=')).slice('fudic-bench='.length));
    return (await fetch('/__bench/criterion/' + encodeURIComponent(id))).json();
  });
  return { pass: said.services === String(args.services), evidence: { expected: String(args.services), actual: JSON.stringify(said) } };`),
  // Flows (§4.3).
  'src/flows/servicios.fixture.ts': `import { Users } from '../users';

export default {
  services: { dos: [{ provide: Users, use: () => new Users(['ana', 'luis']) }] },
};
`,
  'src/flows/servicios.fudspec': `flow servicios

criterion crea-a-marta
  given
    services dos
    url /usuarios
  when
    add "Marta"
    go "/usuarios"
  then
    has "li" "Marta"
    has "li" "ana"

criterion no-ve-a-marta
  given
    services dos
    url /usuarios
  when
    go "/usuarios"
  then
    absent "li" "Marta"
    has "li" "luis"

criterion sin-servicios-es-el-de-verdad
  given
    url /usuarios
  then
    has "li" "real"

criterion lo-dice-a-otro-backend
  given
    services dos
    url /usuarios
  then
    bench-says "dos"
`,
  // A page (§4.2): its fixture in place of `load`, and its answers in place of a function.
  'src/routes/usuarios.fixture.ts': `export default {
  data: { dos: { users: ['ana', 'luis'] } },
  calls: { guarda: { add: 'de la fixture' } },
};
`,
  'src/routes/usuarios.fudspec': `page /usuarios

criterion con-la-fixture
  given
    data dos
    answers guarda
  when
    add "Marta"
    go "/usuarios"
  then
    has "li" "ana"
    absent "li" "Marta"

criterion sin-fixture-es-load
  then
    has "li" "real"
`,
  'src/flows/sesion.fudspec': `flow sesion

criterion entra-y-sigue-dentro
  given
    url /cuenta
  when
    login "ana"
    go "/cuenta"
  then
    has "p" "Sesión: ana"
    at "/cuenta"

criterion luis-no-ve-lo-de-ana
  given
    url /cuenta
  when
    login "ana"
    go "/cuenta"
    as luis
    go "/cuenta"
  then
    has "p" "Nadie ha entrado"
    as main
    has "p" "Sesión: ana"
`,
  'src/flows/quieta.fudspec': `flow quieta

criterion la-respuesta-llega-antes-del-then
  given
    url /espera
  then
    absent "li" "una"

criterion un-reloj-no-la-deja-inquieta
  given
    url /reloj
  then
    absent "li" "nada"

criterion una-peticion-que-no-acaba
  given
    url /colgada
  then
    absent "li" "nada"
`,
};

/** A page that runs one script of `public/` and paints a list. */
function quietPage(title: string, script: string): string {
  return `<!DOCTYPE html>
<html>
<head><title>${title}</title><script type="module" src="${script}"></script></head>
<body><ul></ul></body>
</html>
`;
}

/** A term module: its meta and its `run`. */
function term(name: string, block: string, params: readonly string[], body: string, negative = false): string {
  const meta = { name, block, params: params.map((p) => ({ name: p, type: 'string' })), ...(negative ? { negative: true } : {}) };
  return `export const meta = ${JSON.stringify(meta)};\n\nexport async function run(ctx, args) {\n  ${body}\n}\n\nexport async function selfTest() {}\n`;
}

let project: TempProject;
let summary: RunSummary;

const report = (id: string): CriterionReport => {
  const found = summary.reports.find((r) => r.id === id);
  if (found === undefined) throw new Error(`no report for ${id}: ${JSON.stringify(summary.reports.map((r) => r.id))}`);
  return found;
};

beforeAll(async () => {
  project = tempProject('app');
  for (const [path, text] of Object.entries(FILES)) project.write(path, text);
  mkdirSync(project.path('node_modules/@fudic'), { recursive: true });
  for (const name of ['http', 'di', 'forms', 'conventions']) {
    symlinkSync(`${REPO}/packages/${name}`, project.path(`node_modules/@fudic/${name}`), 'junction');
  }
  const said: string[] = [];
  const ran = await runSpecs(['src/flows', 'src/routes'], {
    root: project.root,
    workers: 4,
    onDiagnostic: (d) => void said.push(d.message),
    onMessage: (m) => {
      if (m.type === 'session') for (const d of m.diagnostics) said.push(`${d.code} ${d.message}`);
      if (m.type === 'problem') said.push(JSON.stringify(m));
    },
  });
  if (isFailure(ran)) throw new Error(ran.diagnostic.message);
  // A project these criteria cannot even read is a fault of the test, said as it is.
  if (ran.reports.length === 0) throw new Error(said.join('\n'));
  summary = ran;
}, 240_000);

afterAll(() => {
  project.remove();
});

describe('a page (criteria 10 and 13, in the browser)', () => {
  it('paints the fixture data and answers the call from it, without running add', () => {
    expect(report('con-la-fixture')).toMatchObject({ verdict: 'pass' });
    expect(report('con-la-fixture').calls).toEqual([{ id: 'routes/usuarios', name: 'add', args: { name: 'Marta' }, faked: true, status: 200 }]);
  });

  it('without a data line, load runs for real', () => {
    expect(report('sin-fixture-es-load')).toMatchObject({ verdict: 'pass' });
  });
});

describe('flows (criteria 19–21)', () => {
  it('criterion 19: what one criterion creates its services keep, and another running beside it does not see', () => {
    expect(report('crea-a-marta')).toMatchObject({ verdict: 'pass' });
    expect(report('no-ve-a-marta')).toMatchObject({ verdict: 'pass' });
    // Without a `services` line, the app's own service answers.
    expect(report('sin-servicios-es-el-de-verdad')).toMatchObject({ verdict: 'pass' });
  });

  it('every call of a criterion is in its report, answered for real', () => {
    expect(report('crea-a-marta').calls).toEqual([{ id: 'routes/usuarios', name: 'add', args: { name: 'Marta' }, faked: false, status: 200 }]);
    expect(report('no-ve-a-marta').calls).toEqual([]);
  });

  it('criterion 20: a real login keeps its cookie in the criterion browser, and the page says so', () => {
    expect(report('entra-y-sigue-dentro')).toMatchObject({ verdict: 'pass' });
  });

  it('criterion 21: as luis has cookies of its own; as main comes back', () => {
    expect(report('luis-no-ve-lo-de-ana')).toMatchObject({ verdict: 'pass' });
  });
});

describe('the quiet page (criteria 29–31)', () => {
  it('criterion 29: a then waits for what a debounce started — absent fails once the answer arrives', () => {
    expect(report('la-respuesta-llega-antes-del-then')).toMatchObject({ verdict: 'fail', failed: { actual: '1' } });
  });

  it('criterion 30: a setInterval does not keep the page from settling', () => {
    expect(report('un-reloj-no-la-deja-inquieta')).toMatchObject({ verdict: 'pass' });
  });

  it('criterion 31: a request that never ends is FUD1508, with what was pending', () => {
    const broken = report('una-peticion-que-no-acaba');
    expect(broken.verdict).toBe('error');
    expect(broken.broken?.diagnostics[0]).toMatchObject({ code: 'FUD1508' });
    expect(broken.broken?.diagnostics[0]?.message).toContain('GET /_fudic/fn/routes/usuarios/hang');
  });
});

describe('a flow opened from the editor', () => {
  it('opens on the app’s Vite, runs, and its results carry the calls', async () => {
    const box = inbox();
    const opened = await openWorkbench(project.path('src/flows/servicios.fudspec'), { onMessage: box.onMessage });
    if (isFailure(opened)) throw new Error(opened.diagnostic.message);
    try {
      expect(opened.tag).toBe('flow-servicios');
      const result = await box.next(resultOf('crea-a-marta'), 0, 120_000);
      expect(result).toMatchObject({ verdict: 'pass', calls: [{ name: 'add', faked: false }] });
    } finally {
      await opened.close();
    }
  }, 180_000);
});

describe('a project whose app does not start', () => {
  it('rejects the app, and still closes everything', async () => {
    const started = await startProject({
      root: project.root,
      targets: [],
      options: {},
      startApp: () => Promise.reject(new Error('no vite.config')),
    });
    if (isFailure(started)) throw new Error(started.diagnostic.message);
    await expect(started.app()).rejects.toThrow('no vite.config');
    await started.close();
  }, 120_000);
});

describe('a backend that is not fudic’s (criterion 34)', () => {
  it('reads the criterion from its cookie and asks the bench for its names', () => {
    expect(report('lo-dice-a-otro-backend')).toMatchObject({ verdict: 'pass' });
  });
});
