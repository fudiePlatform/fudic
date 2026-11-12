/**
 * SDD-82 §4.7 and criterion 22 against the app built, its Service Worker and a real browser, with
 * the stock terms: a criterion that cuts the network runs on the bench's own build, served as
 * `vite preview` serves it; a page the worker already knows opens without network — from the
 * first moment (`given offline`) or after cutting it (`when offline`) — while one it never saw
 * fails as the browser fails. The criteria with network still run on dev, in the same run.
 */

import { mkdirSync, symlinkSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runSpecs, type RunSummary } from '../../src/run.js';
import type { CriterionReport } from '../../src/report-of.js';
import { isFailure } from '../../src/types.js';
import { REPO } from '../helpers/bench.js';
import { tempProject, type TempProject } from '../helpers/project.js';

const page = (title: string): string => `<!DOCTYPE html>
<html>
<head><title>${title}</title><script type="module" src="fudic:runtime"></script></head>
<body><h1>${title}</h1></body>
</html>
`;

const FILES: Readonly<Record<string, string>> = {
  'package.json': JSON.stringify({ name: 'bench-offline', private: true, type: 'module' }),
  'vite.config.ts': "import { fudic } from '@fudic/vite';\n\nexport default { plugins: [fudic({ liveCheck: false })] };\n",
  // `"dev": "off"`, as the example ships it: the build has its worker all the same.
  'sw.json': JSON.stringify({ shell: [], dev: 'off' }),
  'src/routes/blog.fud': page('Blog'),
  'src/routes/about.fud': page('About'),
  'src/routes/nunca.fud': page('Nunca'),
  'src/flows/sin-red.fudspec': `flow sin-red

criterion abre-sin-red-desde-el-principio
  given
    url /about
    offline
  then
    status 200
    title "About"

criterion abre-una-visitada-tras-cortar
  given
    url /blog
    offline
  when
    online
    go /about
    offline
    go /blog
    go /about
  then
    status 200
    title "About"

criterion no-abre-una-nunca-vista
  given
    url /blog
    offline
  when
    go /nunca
  then
    status 200

criterion con-red-en-dev
  given
    url /about
  then
    title "About"
`,
};

let project: TempProject;
let summary: RunSummary;

const report = (id: string): CriterionReport => {
  const found = summary.reports.find((r) => r.id === id)!;
  // An error is a fault of the run, not of the worker: said whole.
  if (found.verdict === 'error') throw new Error(JSON.stringify(found.broken));
  return found;
};

beforeAll(async () => {
  project = tempProject('app-offline');
  for (const [path, text] of Object.entries(FILES)) project.write(path, text);
  mkdirSync(project.path('node_modules/@fudic'), { recursive: true });
  for (const name of ['http', 'di', 'forms', 'conventions']) {
    symlinkSync(`${REPO}/packages/${name}`, project.path(`node_modules/@fudic/${name}`), 'junction');
  }
  const ran = await runSpecs(['src/flows'], { root: project.root, workers: 2 });
  if (isFailure(ran)) throw new Error(ran.diagnostic.message);
  summary = ran;
}, 300_000);

afterAll(() => {
  project.remove();
});

describe('without network (criterion 22)', () => {
  it('a page the worker knows opens from it, from the first moment', () => {
    expect(report('abre-sin-red-desde-el-principio')).toMatchObject({ verdict: 'pass' });
  });

  it('and after cutting the network, once the worker saw it', () => {
    expect(report('abre-una-visitada-tras-cortar')).toMatchObject({ verdict: 'pass' });
  });

  it('one it never saw fails as the browser fails: no response', () => {
    expect(report('no-abre-una-nunca-vista')).toMatchObject({ verdict: 'fail', failed: { expected: '200', actual: 'no response' } });
  });

  it('a criterion with network runs on dev in the same run', () => {
    expect(report('con-red-en-dev')).toMatchObject({ verdict: 'pass' });
  });
});
