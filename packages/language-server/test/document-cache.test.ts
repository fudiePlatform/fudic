/**
 * The per-document cache (SDD-24 §4.5).
 *
 * "A `.fud` is not parsed twice per keystroke" is only checkable if a hit is the very same
 * object: a second parse could not produce an identical AST reference. That identity is the
 * assertion in most of this file.
 */

import { describe, expect, it } from 'vitest';
import { DocumentCache } from '../src/document-cache.js';
import { WorkspaceIndex } from '../src/workspace-index.js';
import { component, LAYOUT, memoryFs, route } from './_support.js';

const BADGE = `@code {
  type Tone = 'neutral' | 'info';

  const { tone = 'neutral' } = props<{ tone?: Tone }>();
}

<head>
  <style>
    :host { display: inline-block; }
  </style>
</head>

<app-badge>
  <template shadowrootmode="open">
    <span>@tone</span>
  </template>
</app-badge>
`;

const SLUG = '/p/blog/[slug].fud';
const SLUG_SOURCE = route('../layouts/_layout.fud', ['../components/app-badge.fud']);

function setup() {
  const files: Record<string, string> = {
    '/p/components/app-badge.fud': BADGE,
    '/p/layouts/_layout.fud': LAYOUT,
    [SLUG]: SLUG_SOURCE,
  };
  const index = new WorkspaceIndex(memoryFs(files));
  index.scan('/p');

  return { files, index, cache: new DocumentCache(index) };
}

describe('get', () => {
  it('parses once per version', () => {
    const { cache } = setup();

    const first = cache.get(SLUG, 1, SLUG_SOURCE);
    const second = cache.get(SLUG, 1, SLUG_SOURCE);

    expect(second).toBe(first);
  });

  it('re-parses when the version moves', () => {
    const { cache } = setup();

    const first = cache.get(SLUG, 1, SLUG_SOURCE);
    const second = cache.get(SLUG, 2, `${SLUG_SOURCE}<p>more</p>\n`);

    expect(second).not.toBe(first);
    expect(second.document).not.toBe(first.document);
    expect(second.version).toBe(2);
  });

  it('answers the same entry however the path is spelled', () => {
    const { cache } = setup();

    expect(cache.get('\\p\\blog\\[slug].fud', 1, SLUG_SOURCE)).toBe(cache.get(SLUG, 1, SLUG_SOURCE));
  });

  it('emits the three virtuals of SDD-23', () => {
    const { cache } = setup();
    const badge = cache.get('/p/components/app-badge.fud', 1, BADGE);

    expect(badge.virtuals.map((virtual) => virtual.fileName)).toEqual([
      '/p/components/app-badge.fud.ts',
      '/p/components/app-badge.fud.server.ts',
      '/p/components/app-badge.fud.0.css',
    ]);
  });

  it('projects props<T>() through the batch it was handed, not a second one', () => {
    const { cache } = setup();
    const [client] = cache.get('/p/components/app-badge.fud', 1, BADGE).virtuals;

    expect(client?.text).toContain('$p0');
    expect(client?.text).toContain('export type $Props');
  });

  it('resolves the file’s own links through the index', () => {
    const { cache } = setup();
    const slug = cache.get(SLUG, 1, SLUG_SOURCE);

    expect(slug.registry.component('app-badge')).toBe('../components/app-badge.fud');
    expect(slug.registry.layout()).toBe('../layouts/_layout.fud');
  });

  it('carries the parse diagnostics and the Oxc ones together', () => {
    const { cache } = setup();
    const broken = cache.get('/p/broken.fud', 1, `@code {\n  @client {\n    const = ;\n  }\n}\n`);

    expect(broken.diagnostics.some((diagnostic) => diagnostic.code === 'FUD0170')).toBe(true);
  });
});

describe('invalidation by the workspace index', () => {
  it('re-projects when a .fud appears, keeping the AST it already had', () => {
    const { files, index, cache } = setup();
    const source = `<link rel="layout" href="../layouts/_layout.fud">\n<link rel="component" href="../components/app-card.fud">\n<article><app-card></app-card></article>\n`;
    const before = cache.get(SLUG, 1, source);

    expect(before.registry.component('app-card')).toBeUndefined();

    files['/p/components/app-card.fud'] = component('app-card');
    index.upsert('/p/components/app-card.fud');
    const after = cache.get(SLUG, 1, source);

    expect(after).not.toBe(before);
    expect(after.document).toBe(before.document); // the expensive half survives
    expect(after.js).toBe(before.js);
    expect(after.registry.component('app-card')).toBe('../components/app-card.fud');
  });

  it('does not re-project while the workspace stands still', () => {
    const { index, cache } = setup();

    const first = cache.get(SLUG, 1, SLUG_SOURCE);
    index.remove('/p/nothing-here.fud'); // no entry: the revision must not move
    const second = cache.get(SLUG, 1, SLUG_SOURCE);

    expect(second).toBe(first);
  });
});

describe('forgetting', () => {
  it('drops one document', () => {
    const { cache } = setup();

    const first = cache.get(SLUG, 1, SLUG_SOURCE);
    cache.invalidate(SLUG);

    expect(cache.get(SLUG, 1, SLUG_SOURCE)).not.toBe(first);
  });

  it('drops everything: the server rebuilds all state from scratch (§4.6)', () => {
    const { cache } = setup();

    const first = cache.get(SLUG, 1, SLUG_SOURCE);
    cache.clear();

    expect(cache.get(SLUG, 1, SLUG_SOURCE)).not.toBe(first);
  });
});
