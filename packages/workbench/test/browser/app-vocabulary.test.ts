/**
 * SDD-82 §3.7, §4.6 and criteria 25–28 against a real app Vite, its server and a real browser,
 * with the stock terms: `clock` stands the browser and the server at one instant, `wait` makes a
 * fixture's `later(2000, …)` arrive, `locale` reaches the server, `header` and `status` read the
 * real response, and `not-reloaded` and `requests` read what the last `when` did.
 */

import { mkdirSync, symlinkSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runSpecs, type RunSummary } from '../../src/run.js';
import type { CriterionReport } from '../../src/report-of.js';
import { isFailure } from '../../src/types.js';
import { REPO } from '../helpers/bench.js';
import { tempProject, type TempProject } from '../helpers/project.js';

const FILES: Readonly<Record<string, string>> = {
  'package.json': JSON.stringify({ name: 'bench-vocabulary', private: true, type: 'module', dependencies: { '@fudic/http': '0.0.0' } }),
  'vite.config.ts': "import { fudic } from '@fudic/vite';\n\nexport default { plugins: [fudic({ liveCheck: false })] };\n",
  'src/http.fudapi': 'chain\n  use json\n',
  'src/routes/hora.fud': `<!DOCTYPE html>
<html>
<head><title>Hora</title><link rel="server" href="./hora.fudapi"><link rel="icon" href="data:,"></head>
<body>
<p role="note">@data.now</p>
<p role="definition">@data.lang</p>
@await data.total {
  <p role="status">total @data.total</p>
}
</body>
</html>
`,
  'src/routes/hora.fudapi': 'load\n  now    str\n  lang   str\n  total  i32  later\n',
  'src/server/hora.ts': `import { load } from 'fudic:routes/hora';

load.handle((ctx) => {
  ctx.response.headers.set('cache-control', 'private, no-cache');
  return { now: new Date().toISOString(), lang: ctx.request.headers.get('accept-language') ?? '', total: Promise.resolve(1) };
});
`,
  // A later of two seconds, as \`later(2000, 10)\` of @fudic/spec writes it.
  'src/routes/hora.fixture.ts': "export default { data: { 'con-espera': { now: 'de la fixture', lang: 'xx', total: { $later: 2000, value: 10 } } } };\n",
  // What the browser's clock says: no stock term reads it.
  'fudic/terms/then/browser-time.js': `export const meta = { name: 'browser-time', block: 'then', params: [{ name: 'expected', type: 'string' }] };

export async function run(ctx, { expected }) {
  const actual = await ctx.page.evaluate('new Date().toISOString()');
  return { pass: actual === String(expected), evidence: { expected: String(expected), actual } };
}

export async function selfTest() {}
`,
  'src/routes/hora.fudspec': `page /hora

criterion el-reloj-en-el-navegador-y-en-el-servidor
  given
    clock 2026-11-08T10:00:00Z
  then
    text role:note "2026-11-08T10:00:00.000Z"
    browser-time "2026-11-08T10:00:00.000Z"

criterion wait-hace-llegar-un-later
  given
    clock 2026-11-08T10:00:00Z
    data con-espera
  then
    count role:status 0
    text role:note "de la fixture"
  when
    wait 2000
  then
    text role:status "total 10"
    browser-time "2026-11-08T10:00:02.000Z"

criterion en-ingles
  given
    locale en
  then
    text role:definition "en"

criterion la-cabecera-del-servidor
  then
    status 200
    header cache-control "private, no-cache"

criterion pasar-el-raton-ni-recarga-ni-pide
  when
    hover role:note
  then
    not-reloaded
    requests 0

criterion recargar-se-nota
  when
    reload
  then
    not-reloaded
`,
};

let project: TempProject;
let summary: RunSummary;

const report = (id: string): CriterionReport => {
  const found = summary.reports.find((r) => r.id === id)!;
  if (found.verdict === 'error') throw new Error(JSON.stringify(found.broken));
  return found;
};

beforeAll(async () => {
  project = tempProject('app-vocabulary');
  for (const [path, text] of Object.entries(FILES)) project.write(path, text);
  mkdirSync(project.path('node_modules/@fudic'), { recursive: true });
  for (const name of ['http', 'di', 'forms', 'conventions']) {
    symlinkSync(`${REPO}/packages/${name}`, project.path(`node_modules/@fudic/${name}`), 'junction');
  }
  const ran = await runSpecs(['src/routes/hora.fudspec'], { root: project.root, workers: 2 });
  if (isFailure(ran)) throw new Error(ran.diagnostic.message);
  summary = ran;
}, 240_000);

afterAll(() => {
  project.remove();
});

describe('the clock (criterion 26)', () => {
  it('stands the browser and the server at the instant', () => {
    expect(report('el-reloj-en-el-navegador-y-en-el-servidor')).toMatchObject({ verdict: 'pass' });
  });

  it('wait 2000 makes a later(2000, …) of the fixture arrive, and moves the browser too', () => {
    expect(report('wait-hace-llegar-un-later')).toMatchObject({ verdict: 'pass' });
  });
});

describe('the language and the response (criteria 25, 28)', () => {
  it('locale en asks the server for the page in English', () => {
    expect(report('en-ingles')).toMatchObject({ verdict: 'pass' });
  });

  it('status and header read the real server’s response', () => {
    expect(report('la-cabecera-del-servidor')).toMatchObject({ verdict: 'pass' });
  });
});

describe('what the last when did (criterion 27)', () => {
  it('a hover neither reloads nor asks for anything', () => {
    expect(report('pasar-el-raton-ni-recarga-ni-pide')).toMatchObject({ verdict: 'pass' });
  });

  it('not-reloaded fails when the when reloaded, saying so', () => {
    expect(report('recargar-se-nota')).toMatchObject({ verdict: 'fail', failed: { expected: 'the same document', actual: 'another document' } });
  });
});
