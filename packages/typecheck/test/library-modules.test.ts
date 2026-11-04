/**
 * SDD-66 §4.2 (criterion 16), amending SDD-61 §3.9: the index tells the server cut which module
 * a package specifier reaches is a fudic library's — its package root has a `fudic.json` — and
 * the `.fud` of an app that reads `cases["primary"]` of a library's fixture is not `FUD1150`.
 */

import { describe, expect, it } from 'vitest';
import { analyze } from '@fudic/compiler';
import { describeFud, FudIndex } from '../src/fud-index.js';
import { semanticInput } from '../src/fudic-diagnostics.js';
import { projectFud } from '../src/project.js';
import { memoryFs } from './_support.js';

const PAGE = '/w/apps/web/src/components/web-demo/web-demo.fud';
const FIXTURE = '/w/libs/ui/src/components/acme-button/acme-button.fixture.ts';
const PLAIN = '/w/node_modules/plain/src/data.ts';
const LOOSE = '/loose/data.ts';

/** The fixture as `fudic g component` writes it, with two cases. */
const CASES = `import type { Fixtures } from '@fudic/terms';
import type { $Props } from './acme-button.fud';

export default {
  primary: { variant: 'primary' },
  disabled: { variant: 'primary', disabled: true },
} satisfies Fixtures<$Props>;
`;

function files(): Record<string, string> {
  return {
    '/w/libs/ui/package.json': '{ "name": "@acme/ui" }',
    '/w/libs/ui/fudic.json': '{ "kind": "lib", "prefix": "acme" }',
    [FIXTURE]: CASES,
    '/w/node_modules/plain/package.json': '{ "name": "plain" }',
    [PLAIN]: CASES,
    [LOOSE]: CASES,
  };
}

/** The package specifiers, resolved as the `exports` of each `package.json` would. */
const PACKAGES = {
  '@acme/ui/acme-button.fixture': FIXTURE,
  'plain/data': PLAIN,
  'loose/data': LOOSE,
};

function indexOver(disk: Record<string, string>): FudIndex {
  const index = new FudIndex(memoryFs(disk, PACKAGES), describeFud);
  index.scan('/w/apps/web');
  index.scan('/w/libs/ui');
  return index;
}

describe('FudIndex.module with a package specifier', () => {
  it("is the module, marked as a library's, when its package has a fudic.json", () => {
    expect(indexOver(files()).module(PAGE, '@acme/ui/acme-button.fixture')).toEqual({ path: FIXTURE, source: CASES, library: true });
  });

  it('is nothing for a package without fudic.json, with no package.json above, or not resolved', () => {
    const index = indexOver(files());
    expect(index.module(PAGE, 'plain/data')).toBeUndefined();
    expect(index.module(PAGE, 'loose/data')).toBeUndefined();
    expect(index.module(PAGE, '@acme/ui/nada.fixture')).toBeUndefined();
  });

  it('hands back the same object while the text is the same, and a new one when it changes', () => {
    const disk = files();
    const index = indexOver(disk);
    const first = index.module(PAGE, '@acme/ui/acme-button.fixture');
    expect(index.module(PAGE, '@acme/ui/acme-button.fixture')).toBe(first);
    disk[FIXTURE] = `export default { primary: {} };`;
    expect(index.module(PAGE, '@acme/ui/acme-button.fixture')).not.toBe(first);
  });

  it('the same file read first as a module of its own project is marked once a package reaches it', () => {
    const index = indexOver(files());
    const own = index.module('/w/libs/ui/src/components/acme-button/acme-button.fud', './acme-button.fixture.ts');
    expect(own).toEqual({ path: FIXTURE, source: CASES });
    expect(index.module(PAGE, '@acme/ui/acme-button.fixture')?.library).toBe(true);
  });
});

describe('the server cut over an app that reads a library fixture (criterion 16)', () => {
  const view = (from: string): string =>
    `@code {\n  import cases from '${from}';\n\n  const primary = cases["primary"];\n}\n\n<web-demo>\n  <template shadowrootmode="open">\n    <p>@primary.variant</p>\n  </template>\n</web-demo>\n`;

  function cut(from: string): readonly string[] {
    const source = view(from);
    const index = indexOver({ ...files(), [PAGE]: source });
    const input = semanticInput(projectFud({ path: PAGE, source, index }), index);
    return analyze({ ...input }).diagnostics.filter((d) => d.code === 'FUD1150').map((d) => d.code);
  }

  it('importing @acme/ui/acme-button.fixture (a fudic library) is not FUD1150', () => {
    expect(cut('@acme/ui/acme-button.fixture')).toEqual([]);
  });

  it('the same import from a package without fudic.json is', () => {
    expect(cut('plain/data')).toEqual(['FUD1150']);
  });
});
