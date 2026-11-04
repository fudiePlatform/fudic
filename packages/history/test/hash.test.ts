/**
 * SDD-65 criteria 4, 5 and 6 (§4.2): the hash of approval is the `.fudspec` and its fixture; the
 * hash of entry is everything that can change a result — siblings, linked `.fud` transitively,
 * imported modules transitively, a workspace library — but not a published package; and neither
 * depends on line endings.
 *
 * On a real project on disk: the links are resolved by the same `FudIndex` and resolver the
 * editor and the build use, and a pnpm-style link needs a real symlink to follow.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { approvalHash, inputsHash, nodeIo, type HistoryIo } from '../src/index.js';
import { approvalFiles, hashFiles } from '../src/hash.js';
import { InputGraph, TEST_EXTENSION } from '../src/inputs.js';
import { pathOf, relativeTo, stemOf } from '../src/unit.js';
import { memoryIo } from './memory-io.js';

const UNIT = 'src/components/acme-button/acme-button.fud';

let root: string;
let io: HistoryIo;

const write = (path: string, text: string): void => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
};

const BUTTON = `<link rel="component" href="../acme-icon/acme-icon.fud">
<link rel="component" href="">
<link rel="component">

@code {
  import { label } from './format.js';
  import { signal } from '@fudic/core';
  import { card } from '@acme/ui';
  import { lost } from './missing.js';
  const { text } = props<{ text: string }>();
  const pressed = signal(false);
}

<acme-button>
  <template shadowrootmode="open">
    <button>@label(text)</button>
    <acme-icon></acme-icon>
  </template>
</acme-button>
`;

const ICON = `<link rel="component" href="../acme-button/acme-button.fud">
<link rel="component" href="../acme-glyph/acme-glyph.fud">

<acme-icon>
  <template shadowrootmode="open"><i></i></template>
</acme-icon>
`;

const GLYPH = `<acme-glyph>
  <template shadowrootmode="open"><b></b></template>
</acme-glyph>
`;

const OTHER = `<acme-other>
  <template shadowrootmode="open"><p></p></template>
</acme-other>
`;

/** A project with a piece that links, imports, cycles, and reaches a workspace library and a published one. */
function project(): void {
  write(UNIT, BUTTON);
  write('src/components/acme-button/acme-button.fudspec', 'criterion one\n');
  write('src/components/acme-button/acme-button.fixture.ts', 'export default { text: "Save" };\n');
  write('src/components/acme-button/acme-button.test.ts', "import './acme-button.fud';\nimport { helper } from './helper';\n");
  write('src/components/acme-button/acme-button.fudapi', 'fn save() -> bool\n');
  write('src/components/acme-button/helper.ts', 'export const helper = 1;\n');
  write('src/components/acme-button/format.ts', "export { pad } from '../../lib';\nexport * from '../../lib/case.js';\nexport const label = (t: string) => t;\n");
  write('src/lib/index.ts', "export { pad } from './pad';\n");
  write('src/lib/pad.ts', "import { label } from '../components/acme-button/format.js';\nexport const pad = label;\n");
  write('src/lib/case.ts', 'export const upper = (s: string) => s.toUpperCase();\n');
  write('src/components/acme-icon/acme-icon.fud', ICON);
  write('src/components/acme-icon/acme-icon.fudapi', 'fn icon() -> str\n');
  write('src/components/acme-glyph/acme-glyph.fud', GLYPH);
  write('src/components/acme-other/acme-other.fud', OTHER);
  // A workspace library, installed as a link the way pnpm does.
  write('libs/ui/package.json', JSON.stringify({ name: '@acme/ui', type: 'module', exports: { '.': './index.ts' } }));
  write('libs/ui/index.ts', 'export const card = 1;\n');
  mkdirSync(join(root, 'node_modules/@acme'), { recursive: true });
  symlinkSync(join(root, 'libs/ui'), join(root, 'node_modules/@acme/ui'), 'junction');
  // A published package: a real folder inside node_modules.
  write('node_modules/@fudic/core/package.json', JSON.stringify({ name: '@fudic/core', type: 'module', exports: { '.': './index.js' } }));
  write('node_modules/@fudic/core/index.js', 'export const signal = 1;\n');
}

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'fudic-history-hash-')));
  io = nodeIo(root);
  project();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const relative = (files: Iterable<string>): string[] => [...files].map((file) => relativeTo(io, file)).sort();

describe('the hash of approval (criterion 4)', () => {
  it('is the .fudspec and its fixture', () => {
    expect(approvalFiles('/p/src/a/a.fud')).toEqual(['/p/src/a/a.fudspec', '/p/src/a/a.fixture.ts']);
  });

  it('changes with a criterion, and with the fixture', async () => {
    const before = await approvalHash(UNIT, io);
    expect(before).toMatch(/^[0-9a-f]{12}$/u);
    write('src/components/acme-button/acme-button.fudspec', 'criterion one, changed\n');
    const criterion = await approvalHash(UNIT, io);
    expect(criterion).not.toBe(before);
    write('src/components/acme-button/acme-button.fixture.ts', 'export default { text: "Send" };\n');
    expect(await approvalHash(UNIT, io)).not.toBe(criterion);
  });

  it('does not change with the .fud, its test or anything it links', async () => {
    const before = await approvalHash(UNIT, io);
    write(UNIT, `${BUTTON}<!-- touched -->\n`);
    write('src/components/acme-button/acme-button.test.ts', '// touched\n');
    write('src/components/acme-icon/acme-icon.fud', `${ICON}\n`);
    expect(await approvalHash(UNIT, io)).toBe(before);
  });

  it('is the same given the piece absolute, or relative to the root', async () => {
    expect(await approvalHash(join(root, UNIT), io)).toBe(await approvalHash(UNIT, io));
  });

  it('of a piece with no criteria is the hash of nothing', async () => {
    write('src/components/bare/bare.fud', OTHER);
    expect(await approvalHash('src/components/bare/bare.fud', io)).toBe(createHash('sha256').digest('hex').slice(0, 12));
  });
});

describe('the files of entry (§4.2)', () => {
  it('are the siblings, what it links transitively, what it imports transitively and the workspace library', () => {
    const files = relative(new InputGraph(io).filesOf(UNIT));
    // Only the files that exist count in the hash; the set may name siblings still to be written.
    expect(files.filter((file) => io.fs.readFile(`${io.root}/${file}`) !== undefined)).toEqual([
      'libs/ui/index.ts',
      'src/components/acme-button/acme-button.fixture.ts',
      'src/components/acme-button/acme-button.fud',
      'src/components/acme-button/acme-button.fudapi',
      'src/components/acme-button/acme-button.fudspec',
      'src/components/acme-button/acme-button.test.ts',
      'src/components/acme-button/format.ts',
      'src/components/acme-button/helper.ts',
      'src/components/acme-glyph/acme-glyph.fud',
      'src/components/acme-icon/acme-icon.fud',
      'src/components/acme-icon/acme-icon.fudapi',
      'src/lib/case.ts',
      'src/lib/index.ts',
      'src/lib/pad.ts',
    ]);
  });

  it('leave out a published package and a component nobody links', () => {
    const files = relative(new InputGraph(io).filesOf(UNIT));
    expect(files.some((file) => file.includes('node_modules'))).toBe(false);
    expect(files.some((file) => file.includes('acme-other'))).toBe(false);
  });

  it('carry the siblings of a piece even before they exist', () => {
    write('src/components/bare/bare.fud', OTHER);
    const files = relative(new InputGraph(io).filesOf('src/components/bare/bare.fud'));
    expect(files).toEqual([
      'src/components/bare/bare.fixture.ts',
      'src/components/bare/bare.fud',
      'src/components/bare/bare.fudapi',
      'src/components/bare/bare.fudspec',
      `src/components/bare/bare${TEST_EXTENSION}`,
    ].sort());
  });
});

describe('the hash of entry (criterion 5)', () => {
  const changes: readonly (readonly [string, string, string])[] = [
    ['the .fud', UNIT, `${BUTTON}<!-- touched -->\n`],
    ['the .fudspec', 'src/components/acme-button/acme-button.fudspec', 'criterion two\n'],
    ['the fixture', 'src/components/acme-button/acme-button.fixture.ts', 'export default {};\n'],
    ['its test', 'src/components/acme-button/acme-button.test.ts', '// touched\n'],
    ['its .fudapi', 'src/components/acme-button/acme-button.fudapi', 'fn save() -> str\n'],
    ['a component it links', 'src/components/acme-icon/acme-icon.fud', `${ICON}<!-- touched -->\n`],
    ['the .fudapi of a component it links', 'src/components/acme-icon/acme-icon.fudapi', 'fn icon() -> bool\n'],
    ['a component linked through another', 'src/components/acme-glyph/acme-glyph.fud', `${GLYPH}<!-- touched -->\n`],
    ['a module its @code imports', 'src/components/acme-button/format.ts', 'export const label = (t: string) => t + "!";\n'],
    ['a module re-exported from a folder index', 'src/lib/pad.ts', 'export const pad = 2;\n'],
    ['a module re-exported with export *', 'src/lib/case.ts', 'export const upper = 1;\n'],
    ['a module its test imports', 'src/components/acme-button/helper.ts', 'export const helper = 2;\n'],
    ['a workspace library', 'libs/ui/index.ts', 'export const card = 2;\n'],
  ];

  for (const [what, path, text] of changes) {
    it(`changes with ${what}`, async () => {
      const before = await inputsHash(UNIT, io);
      write(path, text);
      expect(await inputsHash(UNIT, io)).not.toBe(before);
    });
  }

  const still: readonly (readonly [string, string, string])[] = [
    ['another component it does not link', 'src/components/acme-other/acme-other.fud', `${OTHER}<!-- touched -->\n`],
    ['a published package', 'node_modules/@fudic/core/index.js', 'export const signal = 2;\n'],
    ['the .fudspec of a component it links', 'src/components/acme-icon/acme-icon.fudspec', 'it is not a sibling of the piece\n'],
    ['the .fudlog of the piece', 'src/components/acme-button/acme-button.fudlog', '2026-10-22T10:02Z ------- done\n'],
  ];

  for (const [what, path, text] of still) {
    it(`does not change with ${what}`, async () => {
      const before = await inputsHash(UNIT, io);
      write(path, text);
      expect(await inputsHash(UNIT, io)).toBe(before);
    });
  }

  it('is the same for every piece of a cycle, and does not loop', async () => {
    const graph = new InputGraph(io);
    const icon = relative(graph.filesOf('src/components/acme-icon/acme-icon.fud'));
    expect(icon).toContain('src/components/acme-button/acme-button.fud');
    expect(icon).toContain('src/lib/pad.ts');
  });
});

describe('line endings and paths (criterion 6)', () => {
  it('gives the same hash for CRLF and LF', async () => {
    const lf = await inputsHash(UNIT, io);
    const approvalLf = await approvalHash(UNIT, io);
    for (const path of [
      UNIT,
      'src/components/acme-button/acme-button.fudspec',
      'src/components/acme-button/format.ts',
      'src/components/acme-icon/acme-icon.fud',
      'src/lib/index.ts',
    ]) {
      const text = io.fs.readFile(join(root, path))!;
      write(path, text.replace(/\n/gu, '\r\n'));
    }
    expect(await inputsHash(UNIT, io)).toBe(lf);
    expect(await approvalHash(UNIT, io)).toBe(approvalLf);
  });

  it('hashes each path relative to the root with /, in path order, path, break, text, break', () => {
    const mem = memoryIo({ files: { 'b.txt': 'two\r\n', 'a/x.txt': 'one\n' } });
    const expected = createHash('sha256').update('a/x.txt\none\n\nb.txt\ntwo\n\n').digest('hex').slice(0, 12);
    expect(hashFiles(mem, ['/project/b.txt', '/project/a/x.txt', '/project/missing.txt'])).toBe(expected);
    expect(hashFiles(mem, ['/project/a/x.txt', '/project/b.txt'])).toBe(expected);
  });

  it('does not depend on where the project lives', () => {
    const one = memoryIo({ files: { 'a.txt': 'x' } });
    const other = { ...memoryIo({ files: {} }), root: '/elsewhere', fs: { ...one.fs, readFile: (path: string) => (path === '/elsewhere/a.txt' ? 'x' : undefined) } };
    expect(hashFiles(other, ['/elsewhere/a.txt'])).toBe(hashFiles(one, ['/project/a.txt']));
  });
});

describe('a piece and its paths', () => {
  it('takes a piece relative to the root or absolute, with either slash', () => {
    const mem = memoryIo();
    expect(pathOf('src/a/a.fud', mem)).toBe('/project/src/a/a.fud');
    expect(pathOf('src\\a\\a.fud', mem)).toBe('/project/src/a/a.fud');
    expect(pathOf('/other/./src/../a.fud', mem)).toBe('/other/a.fud');
    expect(relativeTo(mem, '/project/src/a/a.fud')).toBe('src/a/a.fud');
    expect(stemOf('/project/src/a/a.fud')).toBe('/project/src/a/a');
  });

  it('by default reads the disk under the working directory', async () => {
    const cwd = process.cwd();
    process.chdir(root);
    try {
      expect(await approvalHash(UNIT)).toBe(await approvalHash(UNIT, io));
      expect(await inputsHash(UNIT)).toBe(await inputsHash(UNIT, io));
    } finally {
      process.chdir(cwd);
    }
  });
});
