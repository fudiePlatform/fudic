/**
 * `--in` over the four document roles — acceptance criteria §6.5 (a route takes the link
 * top-level, a page and a layout inside `<head>`) and §6.6 (a broken target is never
 * touched, exit 2).
 */

import { describe, expect, it } from 'vitest';
import { planComponent } from '../src/plans/component.js';
import { apply } from '../src/apply.js';
import { parseFud } from '../src/parse.js';
import { run } from '../src/run.js';
import { FUD_WIRE_TARGET_BROKEN, FUD_WIRE_TARGET_MISSING } from '../src/diagnostics.js';
import { captureStreams, MemoryFs, RecordingRunner } from './helpers.js';
import type { ComponentOptions } from '../src/types.js';

const CWD = '/project';

function options(overrides: Partial<ComponentOptions> = {}): ComponentOptions {
  return { cwd: CWD, force: false, dir: 'components', wireInto: [], style: true, slot: false, ...overrides };
}

const ROUTE = `<link rel="layout" href="../layouts/_layout.fud">

<head>
  <title>Home</title>
</head>

<h1>Home</h1>
`;

const LAYOUT = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    @RenderHead()
  </head>
  <body>
    <main>@RenderBody()</main>
  </body>
</html>
`;

const PAGE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <title>Standalone</title>
  </head>
  <body>
    <h1>Standalone</h1>
  </body>
</html>
`;

async function wire(file: string, source: string): Promise<string> {
  const fs = new MemoryFs({ [file]: source });
  const plan = await planComponent('app-icon', options({ wireInto: [file] }), fs);
  expect(plan.errors).toEqual([]);
  const change = plan.changes.find((c) => c.path === file);
  expect(change, 'the target was not modified').toBeDefined();
  return change!.contents;
}

describe('--in, by document role', () => {
  it('a route takes the link top-level, after rel="layout" (decision 83)', async () => {
    const contents = await wire('routes/index.fud', ROUTE);
    const doc = parseFud(contents).doc;
    expect(doc.type).toBe('route-document');
    expect(doc.links).toHaveLength(1);

    const link = contents.indexOf('<link rel="component"');
    expect(link).toBeGreaterThan(contents.indexOf('rel="layout"'));
    expect(link).toBeLessThan(contents.indexOf('<head>'));
    expect(parseFud(contents).diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('a layout takes the link inside <head> (decision 59)', async () => {
    const contents = await wire('layouts/_layout.fud', LAYOUT);
    const doc = parseFud(contents).doc;
    expect(doc.type).toBe('layout-document');
    expect(doc.links).toHaveLength(1);

    const link = contents.indexOf('<link rel="component"');
    expect(link).toBeGreaterThan(contents.indexOf('<head>'));
    expect(link).toBeLessThan(contents.indexOf('</head>'));
  });

  it('a standalone page takes the link inside <head> (decision 59)', async () => {
    const contents = await wire('routes/solo.fud', PAGE);
    const doc = parseFud(contents).doc;
    expect(doc.type).toBe('page-document');
    expect(doc.links).toHaveLength(1);
    expect(contents.indexOf('<link rel="component"')).toBeLessThan(contents.indexOf('</head>'));
  });

  it('leaves a broken target byte-for-byte identical and exits 2 (§6.6)', async () => {
    const broken = '<link rel="layout" href="./x.fud">\n<div><span></div>\n';
    const fs = new MemoryFs({ 'routes/broken.fud': broken });
    const plan = await planComponent('app-icon', options({ wireInto: ['routes/broken.fud'] }), fs);

    expect(plan.errors.map((e) => e.code)).toContain(FUD_WIRE_TARGET_BROKEN);
    expect(plan.diagnostics.length).toBeGreaterThan(0);
    expect(plan.diagnostics[0]!.file).toBe('routes/broken.fud');
    expect(plan.diagnostics[0]!.diagnostic.span.start).toBeGreaterThanOrEqual(0);
    expect(plan.changes.some((change) => change.path === 'routes/broken.fud')).toBe(false);

    await apply(plan, options(), fs);
    expect(fs.at('routes/broken.fud')).toBe(broken);

    const capture = captureStreams();
    const code = await run(['g', 'component', 'app-icon', '--cwd', CWD, '--in', 'routes/broken.fud'], {
      readIo: fs,
      writeIo: fs,
      runner: new RecordingRunner(),
      streams: capture.streams,
    });
    expect(code).toBe(2);
    expect(fs.at('routes/broken.fud')).toBe(broken);
  });

  it('reports a missing --in target without writing anything', async () => {
    const fs = new MemoryFs();
    const plan = await planComponent('app-icon', options({ wireInto: ['routes/nope.fud'] }), fs);
    expect(plan.errors.map((e) => e.code)).toEqual([FUD_WIRE_TARGET_MISSING]);
    await apply(plan, options(), fs);
    expect(fs.paths()).toEqual([]);
  });
});
