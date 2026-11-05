/**
 * The hash of a component's look (SDD-78 §3.4, criterion 14): of the files that can change how it
 * is drawn. Its tests and its criteria are not among them; a global sheet of its project or of a
 * library it adopts is. Real files on disk, no browser.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { lookFiles, lookHashOf } from '../src/look-hash.js';
import { tempDir } from './helpers.js';

let dir: ReturnType<typeof tempDir>;
const put = (file: string, text: string): void => {
  mkdirSync(dirname(join(dir.root, file)), { recursive: true });
  writeFileSync(join(dir.root, file), text);
};
const slashes = (path: string): string => path.replace(/\\/gu, '/');

const PIECE = 'src/components/app-button/app-button.fud';

beforeEach(() => {
  dir = tempDir();
  put('fudic.json', JSON.stringify({ kind: 'app', prefix: 'app', globalStyles: { theme: 'theme.css' } }));
  put('theme.css', 'button { border-radius: 4px; }\n');
  put('package.json', JSON.stringify({ name: 'demo', dependencies: { '@acme/ui': '1.0.0', plain: '1.0.0' }, devDependencies: { '@acme/kit': '1.0.0' } }));
  put('node_modules/@acme/ui/package.json', JSON.stringify({ name: '@acme/ui' }));
  put('node_modules/@acme/ui/fudic.json', JSON.stringify({ kind: 'lib', prefix: 'ui', globalStyles: { ui: 'ui.css' } }));
  put('node_modules/@acme/ui/ui.css', ':host { color: navy; }\n');
  put('node_modules/@acme/kit/package.json', JSON.stringify({ name: '@acme/kit' }));
  put('node_modules/@acme/kit/fudic.json', JSON.stringify({ kind: 'lib', prefix: 'kit' }));
  // A dependency that is no fudic library: its sheets, if it had any, are not adopted.
  put('node_modules/plain/package.json', JSON.stringify({ name: 'plain' }));
  put('node_modules/plain/fudic.json', JSON.stringify({ kind: 'app', globalStyles: { x: 'x.css' } }));
  put(PIECE, '<app-button>\n  <template shadowrootmode="open">\n    <button>Go</button>\n  </template>\n</app-button>\n');
  put('src/components/app-button/app-button.test.ts', "import { test } from 'vitest';\ntest('x', () => {});\n");
  put('src/components/app-button/app-button.fudspec', 'component app-button\n');
  put('src/components/app-button/app-button.fixture.ts', 'export default { primary: {} };\n');
});
afterEach(() => dir.dispose());

const hash = (): string => lookHashOf(join(dir.root, PIECE), dir.root, dir.root);

describe('the files of a look', () => {
  it('are the inputs of the piece without its tests and its criteria, then the global sheets of the project and its libraries', () => {
    const files = lookFiles(join(dir.root, PIECE), dir.root, dir.root).map(slashes);
    expect(files.some((f) => f.endsWith('app-button.fud'))).toBe(true);
    expect(files.some((f) => f.endsWith('app-button.fixture.ts'))).toBe(true);
    expect(files.some((f) => f.endsWith('.test.ts') || f.endsWith('.fudspec'))).toBe(false);
    const sheets = files.filter((f) => f.endsWith('.css'));
    expect(sheets).toEqual([slashes(join(dir.root, 'theme.css')), slashes(join(dir.root, 'node_modules/@acme/ui/ui.css'))]);
  });

  it('have no sheets without a fudic.json, or one with no globalStyles, and no libraries without a package.json', () => {
    rmSync(join(dir.root, 'fudic.json'));
    rmSync(join(dir.root, 'package.json'));
    expect(lookFiles(join(dir.root, PIECE), dir.root, dir.root).filter((f) => f.endsWith('.css'))).toEqual([]);
    put('fudic.json', JSON.stringify({ kind: 'app' }));
    expect(lookFiles(join(dir.root, PIECE), dir.root, dir.root).filter((f) => f.endsWith('.css'))).toEqual([]);
  });

  it('take a package.json without dependencies, and a dependency that is not installed', () => {
    put('package.json', JSON.stringify({ name: 'demo' }));
    expect(lookFiles(join(dir.root, PIECE), dir.root, dir.root).filter((f) => f.endsWith('.css')).map(slashes)).toEqual([
      slashes(join(dir.root, 'theme.css')),
    ]);
    put('package.json', JSON.stringify({ name: 'demo', dependencies: { missing: '1.0.0' } }));
    expect(lookFiles(join(dir.root, PIECE), dir.root, dir.root).filter((f) => f.endsWith('.css'))).toHaveLength(1);
  });
});

describe('the hash of a look (criterion 14)', () => {
  it('does not change with the tests or the criteria', () => {
    const before = hash();
    put('src/components/app-button/app-button.test.ts', "import { test } from 'vitest';\ntest('y', () => {});\n");
    put('src/components/app-button/app-button.fudspec', 'component app-button\n\ncriterion other\n');
    expect(hash()).toBe(before);
  });

  it('changes with the view, a global sheet of the project, and one of a library', () => {
    const first = hash();
    put(PIECE, '<app-button>\n  <template shadowrootmode="open">\n    <button>Stop</button>\n  </template>\n</app-button>\n');
    const second = hash();
    expect(second).not.toBe(first);
    put('theme.css', 'button { border-radius: 12px; }\n');
    const third = hash();
    expect(third).not.toBe(second);
    put('node_modules/@acme/ui/ui.css', ':host { color: teal; }\n');
    expect(hash()).not.toBe(third);
  });

  it('leaves out a global sheet that is not there', () => {
    const before = hash();
    rmSync(join(dir.root, 'theme.css'));
    expect(hash()).not.toBe(before);
    expect(hash()).toMatch(/^[0-9a-f]{12}$/u);
  });
});
