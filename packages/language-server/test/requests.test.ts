/**
 * The server's own requests (SDD-24 §3.4, §6.15).
 *
 * `fudic/virtualFiles` is instrumental: without seeing what `tsserver` was shown, every odd
 * diagnostic is debugged blind. So the payload carries the TEXT, not a summary of it.
 */

import { describe, expect, it } from 'vitest';
import { DocumentCache } from '../src/document-cache.js';
import { WorkspaceIndex } from '../src/workspace-index.js';
import { componentRegistryPayload, virtualFilesPayload } from '../src/requests.js';
import { component, LAYOUT, memoryFs, route } from './_support.js';

const SLUG = '/p/blog/[slug].fud';

function setup(path: string, source: string) {
  const files: Record<string, string> = {
    '/p/components/app-badge.fud': component('app-badge'),
    '/p/layouts/_layout.fud': LAYOUT,
    [path]: source,
  };
  const index = new WorkspaceIndex(memoryFs(files));
  index.scan('/p');

  return { index, document: new DocumentCache(index).get(path, 1, source) };
}

describe('virtualFilesPayload', () => {
  it('returns the three virtuals of a document with their text', () => {
    const source = `@code {\n  const { a = 1 } = props<{ a?: number }>();\n}\n\n<head>\n  <style>:host { color: red; }</style>\n</head>\n\n<app-x>\n  <template shadowrootmode="open"><i>@a</i></template>\n</app-x>\n`;
    const { document } = setup('/p/components/app-x.fud', source);

    expect(virtualFilesPayload(document).map((file) => [file.fileName, file.languageId])).toEqual([
      ['/p/components/app-x.fud.ts', 'typescript'],
      ['/p/components/app-x.fud.server.ts', 'typescript'],
      ['/p/components/app-x.fud.0.css', 'css'],
    ]);
    expect(virtualFilesPayload(document)[0]?.text).toContain('$tpl');
  });
});

describe('componentRegistryPayload', () => {
  it('reports every link with what it resolved to, layout included', () => {
    const { index, document } = setup(
      SLUG,
      route('../layouts/_layout.fud', ['../components/app-badge.fud']),
    );

    expect(componentRegistryPayload(document, index)).toEqual([
      {
        tag: 'app-badge',
        href: '../components/app-badge.fud',
        resolved: '/p/components/app-badge.fud',
      },
      { tag: '', href: '../layouts/_layout.fud', resolved: '/p/layouts/_layout.fud' },
    ]);
  });

  it('reports an unresolved link as resolving to nothing, rather than hiding it', () => {
    const { index, document } = setup(SLUG, route('../layouts/_ghost.fud', ['./ghost.fud']));

    expect(componentRegistryPayload(document, index)).toEqual([
      { tag: '', href: './ghost.fud', resolved: '' },
      { tag: '', href: '../layouts/_ghost.fud', resolved: '' },
    ]);
  });

  it('skips a link with no href, and a file with no layout', () => {
    const { index, document } = setup(
      '/p/components/app-y.fud',
      `<link rel="component">\n${component('app-y')}`,
    );

    expect(componentRegistryPayload(document, index)).toEqual([]);
  });
});
