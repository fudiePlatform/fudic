/**
 * The workspace index (SDD-24 §4.5).
 *
 * The point of this state is that resolving a `<link>` never asks the disk anything: the
 * sweep happens once, the watchers keep it true, and everything downstream is a map lookup.
 */

import { describe, expect, it } from 'vitest';
import { WorkspaceIndex } from '../src/workspace-index.js';
import { component, LAYOUT, memoryFs, PAGE, route } from './_support.js';

const WORKSPACE = {
  '/p/components/app-badge.fud': component('app-badge'),
  '/p/components/site-nav.fud': component('site-nav'),
  '/p/layouts/_layout.fud': LAYOUT,
  '/p/blog/[slug].fud': route('../layouts/_layout.fud', ['../components/app-badge.fud']),
  '/p/about.fud': PAGE,
  '/p/data/posts.ts': 'export const posts = [];',
};

const indexOf = (files: Readonly<Record<string, string>> = WORKSPACE): WorkspaceIndex => {
  const index = new WorkspaceIndex(memoryFs(files));
  index.scan('/p');
  return index;
};

describe('scan', () => {
  it('reads every .fud of the workspace and nothing else', () => {
    expect(indexOf().all().map((entry) => entry.path)).toEqual([
      '/p/components/app-badge.fud',
      '/p/components/site-nav.fud',
      '/p/layouts/_layout.fud',
      '/p/blog/[slug].fud',
      '/p/about.fud',
    ]);
  });

  it('records role, tag and layout href per file', () => {
    const index = indexOf();

    expect(index.get('/p/components/app-badge.fud')).toEqual({
      path: '/p/components/app-badge.fud',
      role: 'component',
      tag: 'app-badge',
      layoutHref: '',
      sections: [],
    });
    expect(index.get('/p/blog/[slug].fud')).toEqual({
      path: '/p/blog/[slug].fud',
      role: 'route',
      tag: '',
      layoutHref: '../layouts/_layout.fud',
      sections: [],
    });
  });

  it('answers with the same entry however the path is spelled', () => {
    expect(indexOf().get('\\p\\components\\app-badge.fud')?.tag).toBe('app-badge');
  });

  it('knows nothing about a file that is not there', () => {
    expect(indexOf().get('/p/components/ghost.fud')).toBeUndefined();
  });
});

describe('byRole', () => {
  it('separates what the href completion has to filter by (§4.2)', () => {
    const index = indexOf();

    expect(index.byRole('component').map((entry) => entry.tag)).toEqual(['app-badge', 'site-nav']);
    expect(index.byRole('layout').map((entry) => entry.path)).toEqual(['/p/layouts/_layout.fud']);
    expect(index.byRole('page').map((entry) => entry.path)).toEqual(['/p/about.fud']);
    expect(index.byRole('route').map((entry) => entry.path)).toEqual(['/p/blog/[slug].fud']);
  });
});

describe('resolve', () => {
  it('follows an href from the file that wrote it', () => {
    const index = indexOf();

    expect(index.resolve('/p/blog/[slug].fud', '../components/app-badge.fud')?.tag).toBe('app-badge');
    expect(index.resolve('/p/blog/[slug].fud', '../layouts/_layout.fud')?.role).toBe('layout');
  });

  it('is undefined when the href points nowhere — what FUD0460 is built on', () => {
    expect(indexOf().resolve('/p/blog/[slug].fud', './missing.fud')).toBeUndefined();
  });
});

describe('maintenance', () => {
  it('takes a new file without a rescan (§6.13)', () => {
    const files: Record<string, string> = { ...WORKSPACE };
    const index = indexOf(files);

    files['/p/components/app-card.fud'] = component('app-card');
    index.upsert('/p/components/app-card.fud');

    expect(index.resolve('/p/blog/[slug].fud', '../components/app-card.fud')?.tag).toBe('app-card');
  });

  it('re-reads a file whose content changed role', () => {
    const files: Record<string, string> = { ...WORKSPACE };
    const index = indexOf(files);

    files['/p/about.fud'] = component('app-about');
    index.upsert('/p/about.fud');

    expect(index.get('/p/about.fud')?.role).toBe('component');
    expect(index.byRole('page')).toEqual([]);
  });

  it('drops a file it can no longer read instead of keeping it stale', () => {
    const files: Record<string, string> = { ...WORKSPACE };
    const index = indexOf(files);

    delete files['/p/components/site-nav.fud'];
    index.upsert('/p/components/site-nav.fud');

    expect(index.get('/p/components/site-nav.fud')).toBeUndefined();
  });

  it('removes a deleted file', () => {
    const index = indexOf();
    index.remove('/p/components/site-nav.fud');

    expect(index.get('/p/components/site-nav.fud')).toBeUndefined();
    expect(index.all().length).toBe(4);
  });

  it('renames by content, not by name: the role travels with the file', () => {
    const files: Record<string, string> = { ...WORKSPACE };
    const index = indexOf(files);

    files['/p/components/badge.fud'] = files['/p/components/app-badge.fud'] as string;
    delete files['/p/components/app-badge.fud'];
    index.rename('/p/components/app-badge.fud', '/p/components/badge.fud');

    expect(index.get('/p/components/app-badge.fud')).toBeUndefined();
    expect(index.get('/p/components/badge.fud')?.tag).toBe('app-badge');
  });

  it('moves the revision only when the set of .fud actually changed', () => {
    const files: Record<string, string> = { ...WORKSPACE };
    const index = indexOf(files);
    const swept = index.revision;

    expect(swept).toBe(5); // one per file of the sweep

    index.remove('/p/components/ghost.fud');
    expect(index.revision).toBe(swept);

    index.upsert('/p/components/ghost.fud'); // unreadable: nothing enters
    expect(index.revision).toBe(swept);

    files['/p/components/app-card.fud'] = component('app-card');
    index.upsert('/p/components/app-card.fud');
    expect(index.revision).toBe(swept + 1);
  });

  it('leaves every other entry untouched: invalidation is per file, not global', () => {
    const files: Record<string, string> = { ...WORKSPACE };
    const index = indexOf(files);
    const before = index.get('/p/blog/[slug].fud');

    files['/p/components/app-card.fud'] = component('app-card');
    index.upsert('/p/components/app-card.fud');

    expect(index.get('/p/blog/[slug].fud')).toBe(before);
  });
});
