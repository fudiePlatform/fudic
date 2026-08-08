/**
 * `fudic g page` — acceptance criteria §6.8 (sections collected from the layout chain)
 * and §6.15 (route → file mapping), plus the layout choice of §4.5.
 */

import { describe, expect, it } from 'vitest';
import { planPage } from '../src/plans/page.js';
import { planLayout } from '../src/plans/layout.js';
import { parseFud } from '../src/parse.js';
import { routeToFile } from '../src/route.js';
import { FUD_LAYOUT_INVALID, FUD_SECTION_UNKNOWN } from '../src/diagnostics.js';
import { MemoryFs } from './helpers.js';
import type { PageOptions } from '../src/types.js';

const CWD = '/project';

// The default `--dir`, spelled out rather than imported from `@fudic/conventions`: a test
// that reads the constant agrees with whatever the constant says, including a wrong value.
function options(overrides: Partial<PageOptions> = {}): PageOptions {
  return { cwd: CWD, force: false, dir: 'src/routes', server: false, sections: null, ...overrides };
}

const LAYOUT = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    @RenderHead()
  </head>
  <body>
    @RenderSection(aside)
    @RenderSection(scripts)
    <main>@RenderBody()</main>
  </body>
</html>
`;

describe('route → file (§6.15)', () => {
  it.each([
    ['/', 'index.fud'],
    ['', 'index.fud'],
    ['blog', 'blog.fud'],
    ['blog/', 'blog/index.fud'],
    ['blog/:slug', 'blog/[slug].fud'],
    ['blog/[slug]', 'blog/[slug].fud'],
    ['/customer/:id/edit', 'customer/[id]/edit.fud'],
  ])('%s → %s', (route, file) => {
    expect(routeToFile(route).file).toBe(file);
  });

  it('rejects a segment that is not a legal path piece', () => {
    expect(routeToFile('blog/../etc').error).toBeDefined();
  });
});

describe('g page', () => {
  it('declares every section the layout chain renders (§6.8)', async () => {
    const fs = new MemoryFs({ 'src/layouts/_layout.fud': LAYOUT });
    const plan = await planPage('perfil', options(), fs);
    expect(plan.errors).toEqual([]);

    const change = plan.changes[0]!;
    expect(change.path).toBe('src/routes/perfil.fud');
    // Byte for byte what it was before the tree moved: `src/routes` and `src/layouts` went
    // down together, so the relative depth between them never changed (BUG-20 §4.4).
    expect(change.contents).toContain('<link rel="layout" href="../layouts/_layout.fud">');
    expect(change.contents).toContain('@section aside {');
    expect(change.contents).toContain('@section scripts {');

    const parsed = parseFud(change.contents);
    expect(parsed.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(parsed.doc.type).toBe('route-document');
    if (parsed.doc.type !== 'route-document') return;
    expect(parsed.doc.sections.map((section) => section.name)).toEqual(['aside', 'scripts']);
  });

  it('--sections restricts the set, and an unknown one is an error (§6.8)', async () => {
    const fs = new MemoryFs({ 'src/layouts/_layout.fud': LAYOUT });

    const restricted = await planPage('perfil', options({ sections: ['scripts'] }), fs);
    expect(restricted.errors).toEqual([]);
    expect(restricted.changes[0]!.contents).toContain('@section scripts {');
    expect(restricted.changes[0]!.contents).not.toContain('@section aside {');

    const unknown = await planPage('perfil', options({ sections: ['nope'] }), fs);
    expect(unknown.changes).toEqual([]);
    expect(unknown.errors.map((e) => e.code)).toEqual([FUD_SECTION_UNKNOWN]);
  });

  it('collects sections along the rel="layout" chain (decision 87)', async () => {
    const nested = `<!DOCTYPE html>
<html lang="en">
  <head>
    <link rel="layout" href="./_layout.fud">
    @RenderHead()
  </head>
  <body>
    @RenderSection(admin)
    <main>@RenderBody()</main>
  </body>
</html>
`;
    const fs = new MemoryFs({ 'src/layouts/_layout.fud': LAYOUT, 'src/layouts/_layout-admin.fud': nested });
    const plan = await planPage('admin', options({ layout: 'src/layouts/_layout-admin.fud' }), fs);
    expect(plan.errors).toEqual([]);
    expect(plan.changes[0]!.contents).toContain('@section admin {');
    expect(plan.changes[0]!.contents).toContain('@section aside {');
  });

  it('picks the nearest _layout.fud walking up from the page (§6.7)', async () => {
    const fs = new MemoryFs({ 'src/layouts/_layout.fud': LAYOUT, 'src/routes/admin/_layout.fud': LAYOUT });
    const near = await planPage('admin/users', options(), fs);
    expect(near.changes[0]!.contents).toContain('href="./_layout.fud"');

    const far = await planPage('about', options(), fs);
    expect(far.changes[0]!.contents).toContain('href="../layouts/_layout.fud"');
  });

  it('falls back to a standalone page when the project has no layout', async () => {
    const fs = new MemoryFs();
    const plan = await planPage('/', options(), fs);
    expect(plan.errors).toEqual([]);
    const doc = parseFud(plan.changes[0]!.contents).doc;
    expect(doc.type).toBe('page-document');
    expect(plan.changes[0]!.path).toBe('src/routes/index.fud');
  });

  it('--dir outside src/ writes where it is told (§6.6)', async () => {
    // The escape hatch of §3.3: `src/` is the convention, not a cage. A project that keeps
    // the old layout says so once per command and nothing else changes.
    const fs = new MemoryFs({ 'routes/_layout.fud': LAYOUT });
    const plan = await planPage('perfil', options({ dir: 'routes' }), fs);
    expect(plan.errors).toEqual([]);
    expect(plan.changes[0]!.path).toBe('routes/perfil.fud');
    // The walk-up cuts at `--dir`, so the layout next to the page is found there too.
    expect(plan.changes[0]!.contents).toContain('<link rel="layout" href="./_layout.fud">');
  });

  it('--no-layout forces a standalone page even when a layout exists', async () => {
    const fs = new MemoryFs({ 'src/layouts/_layout.fud': LAYOUT });
    const plan = await planPage('solo', options({ layout: null }), fs);
    expect(parseFud(plan.changes[0]!.contents).doc.type).toBe('page-document');
  });

  it('rejects a --layout that is not a layout (FUD0449)', async () => {
    const fs = new MemoryFs({ 'src/components/app-card.fud': '<app-card><template shadowrootmode="open"></template></app-card>' });
    const plan = await planPage('perfil', options({ layout: 'src/components/app-card.fud' }), fs);
    expect(plan.changes).toEqual([]);
    expect(plan.errors.map((e) => e.code)).toEqual([FUD_LAYOUT_INVALID]);
  });

  it('--server puts @code top-level in a route, and inside <head> in a standalone page', async () => {
    const withLayout = new MemoryFs({ 'src/layouts/_layout.fud': LAYOUT });
    const route = await planPage('blog', options({ server: true }), withLayout);
    const routeDoc = parseFud(route.changes[0]!.contents);
    expect(routeDoc.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(routeDoc.doc.type).toBe('route-document');
    if (routeDoc.doc.type === 'route-document') {
      expect(routeDoc.doc.code).toBeDefined();
      // Decision 83: @code is phase 3, before the <head> fragment — not inside it.
      expect(routeDoc.doc.code!.span.start).toBeLessThan(routeDoc.doc.head!.span.start);
    }

    const bare = new MemoryFs();
    const page = await planPage('blog', options({ server: true }), bare);
    const pageDoc = parseFud(page.changes[0]!.contents);
    expect(pageDoc.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(pageDoc.doc.type).toBe('page-document');
    if (pageDoc.doc.type === 'page-document') {
      expect(pageDoc.doc.code).toBeDefined(); // decision 60: inside <head>
    }
  });
});

describe('g layout', () => {
  it('emits one @RenderSection per name, a single @RenderBody and a @RenderHead', async () => {
    const fs = new MemoryFs();
    const plan = await planLayout('_layout', { cwd: CWD, force: false, dir: 'layouts', sections: ['nav', 'aside'], head: true }, fs);
    const change = plan.changes[0]!;
    expect(change.path).toBe('layouts/_layout.fud');

    const parsed = parseFud(change.contents);
    expect(parsed.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(parsed.doc.type).toBe('layout-document');
    if (parsed.doc.type !== 'layout-document') return;
    expect(parsed.doc.renderSections.map((section) => section.name)).toEqual(['nav', 'aside']);
    expect(parsed.doc.renderBody).toBeDefined();
    expect(parsed.doc.renderHead).toBeDefined();
  });

  it('--no-head omits @RenderHead()', async () => {
    const fs = new MemoryFs();
    const plan = await planLayout('_layout', { cwd: CWD, force: false, dir: 'layouts', sections: [], head: false }, fs);
    const parsed = parseFud(plan.changes[0]!.contents);
    expect(parsed.doc.type).toBe('layout-document');
    if (parsed.doc.type !== 'layout-document') return;
    expect(parsed.doc.renderHead).toBeUndefined();
  });
});
