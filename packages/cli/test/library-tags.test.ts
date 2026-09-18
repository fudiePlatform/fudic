/**
 * SDD-43 §4.5, criterion 10 — a tag a LIBRARY already defines fails while generating.
 *
 * `customElements` is one registry per document, so the tag space of an app that consumes a
 * library is shared with it. Without this the collision is discovered by the browser, at the
 * second `define()`, on a page that generated and built cleanly — and the file that has to be
 * renamed is by then linked from everywhere.
 *
 * The libraries are found by following DECLARED dependencies, which is the walk the editor's
 * index uses too: a project with a thousand packages and one fudic library reads one library.
 */

import { describe, expect, it } from 'vitest';
import { planComponent } from '../src/plans/component.js';
import { libraryTags } from '../src/project.js';
import { validateTag } from '../src/tag.js';
import { FUD_DUPLICATE_TAG, FUD_TAG_EXISTS } from '../src/diagnostics.js';
import { MemoryFs } from './helpers.js';
import type { ComponentOptions } from '../src/types.js';

const CWD = '/project';

const options = (overrides: Partial<ComponentOptions> = {}): ComponentOptions => ({
  cwd: CWD,
  force: false,
  dir: 'components',
  wireInto: [],
  style: true,
  slot: false,
  ...overrides,
});

const component = (tag: string): string =>
  `<${tag}>\n  <template shadowrootmode="open"><slot></slot></template>\n</${tag}>\n`;

const manifest = (name: string, deps: Readonly<Record<string, string>> = {}): string =>
  JSON.stringify({ name, dependencies: deps });

/** An app that depends on `@acme/ui`, a library defining `ui-card`. */
const withLibrary = (extra: Readonly<Record<string, string>> = {}): MemoryFs =>
  new MemoryFs(
    {
      'package.json': manifest('@acme/tienda', { '@acme/ui': 'workspace:*' }),
      'node_modules/@acme/ui/package.json': manifest('@acme/ui'),
      'node_modules/@acme/ui/fudic.json': JSON.stringify({ kind: 'lib', prefix: 'ui' }),
      'node_modules/@acme/ui/src/ui-card.fud': component('ui-card'),
      ...extra,
    },
    CWD,
  );

describe('a tag a library already defines', () => {
  it('refuses to generate it, and the message names the library and its file', async () => {
    const plan = await planComponent('ui-card', options(), withLibrary());
    expect(plan.changes).toEqual([]);
    expect(plan.errors).toHaveLength(1);
    expect(plan.errors[0]?.code).toBe(FUD_DUPLICATE_TAG);
    expect(plan.errors[0]?.message).toContain('@acme/ui');
    expect(plan.errors[0]?.message).toContain('ui-card.fud');
  });

  it('lets through a tag nobody defines', async () => {
    const plan = await planComponent('app-card', options(), withLibrary());
    expect(plan.errors).toEqual([]);
    expect(plan.changes).toHaveLength(1);
  });

  it('reports the project first when the name is taken on both sides', async () => {
    // A name the author already used is the likelier mistake and the cheaper fix.
    const fs = withLibrary({ 'components/ui-card.fud': component('ui-card') });
    const plan = await planComponent('ui-card', options(), fs);
    expect(plan.errors[0]?.code).toBe(FUD_TAG_EXISTS);
  });

  it('follows a library that consumes another one', async () => {
    const fs = withLibrary({
      'node_modules/@acme/ui/package.json': manifest('@acme/ui', { '@acme/guia': '*' }),
      'node_modules/@acme/guia/package.json': manifest('@acme/guia'),
      'node_modules/@acme/guia/fudic.json': JSON.stringify({ kind: 'lib' }),
      'node_modules/@acme/guia/g-box.fud': component('g-box'),
    });
    const plan = await planComponent('g-box', options(), fs);
    expect(plan.errors[0]?.code).toBe(FUD_DUPLICATE_TAG);
  });

  it('says nothing about a dependency that is not a fudic library', async () => {
    // An app's components are nobody's to consume (FUD0763), so its tags are not taken
    // either: the file would never be linked, and the registry never sees it.
    const fs = new MemoryFs(
      {
        'package.json': manifest('@acme/tienda', { '@acme/otra': '*' }),
        'node_modules/@acme/otra/package.json': manifest('@acme/otra'),
        'node_modules/@acme/otra/fudic.json': JSON.stringify({ kind: 'app', id: 'otra' }),
        'node_modules/@acme/otra/src/ui-card.fud': component('ui-card'),
      },
      CWD,
    );
    expect(await planComponent('ui-card', options(), fs)).toMatchObject({ errors: [] });
  });

  it('is still answerable without a graph: the two-argument form stays legal', () => {
    // Which is what every caller that has no dependency graph to ask about passes — the
    // shape SDD-22 left, and the one a project with no libraries never needs more than.
    expect(validateTag('app-card', new Set())).toBeNull();
    expect(validateTag('app-card', new Set(['app-card']))?.code).toBe(FUD_TAG_EXISTS);
  });

  it('is empty for a project with no dependencies at all', () => {
    expect(libraryTags(CWD, new MemoryFs({ 'package.json': manifest('@acme/tienda') }, CWD)).size).toBe(0);
  });

  it('keeps the FIRST file for a tag a library defines twice', () => {
    // Two files under one tag inside the library is its own `FUD0761`, and not this
    // command's: what matters here is that the name is taken.
    const tags = libraryTags(
      CWD,
      withLibrary({ 'node_modules/@acme/ui/src/a/ui-card.fud': component('ui-card') }),
    );
    // The sweep is sorted, so «first» is a fact and not the order a directory happened to
    // be read in. No absolute prefix in the assertion: the root carries a drive on Windows.
    expect(tags.get('ui-card')?.file).toContain('/node_modules/@acme/ui/src/a/ui-card.fud');
  });

  it('ignores a library file that is not a component', () => {
    const tags = libraryTags(
      CWD,
      withLibrary({
        'node_modules/@acme/ui/src/page.fud': '<!DOCTYPE html><html><head></head><body><p>x</p></body></html>',
      }),
    );
    expect([...tags.keys()]).toEqual(['ui-card']);
  });
});
