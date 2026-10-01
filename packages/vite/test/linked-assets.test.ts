/**
 * BUG-40 §4.1–§4.4 at the unit that decides all of it: the registry that names a linked file.
 *
 * The defect this module exists for is not visible in one build. Three passes compile the
 * same `.fud` — the host bundles the client graph, the link pass what the Service Worker
 * loads, the edge pass what renders a page in Node — and a bundler's asset hash is a
 * property of the bundle, so each of them named the same file differently and the page
 * shipped a URL nobody wrote. So the assertions here are mostly about TWO registries
 * agreeing: one registry agreeing with itself only proves it has a cache.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LinkedAssets, assetSheetFrom, assetUrlFrom } from '../src/linked-assets.js';
import type { Diagnostic } from '@fudic/compiler';
import type { FudCode } from '@fudic/diagnostics';

/** Over the inline limit (4096), so it is a file and not a `data:` URI. */
const BIG_PNG = Buffer.alloc(5000, 7);
/** Under it, which is exactly why the example's logo never showed the bug. */
const SMALL_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>';
const SHEET = '/* the tokens, for whoever opens this */\n:host  {\n  --gap:  8px;\n}\n';

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'fudic-linked-'));
  mkdirSync(join(root, 'styles'), { recursive: true });
  writeFileSync(join(root, 'styles', 'theme.css'), SHEET);
  writeFileSync(join(root, 'styles', 'other.css'), ':host{display:block}');
  writeFileSync(join(root, 'logo.png'), BIG_PNG);
  writeFileSync(join(root, 'small.svg'), SMALL_SVG);
  writeFileSync(join(root, 'data.bin'), Buffer.alloc(5000, 3));
  writeFileSync(join(root, 'LICENSE'), 'x'.repeat(5000));
  mkdirSync(join(root, 'public'), { recursive: true });
  writeFileSync(join(root, 'public', 'site.svg'), SMALL_SVG);
});

const sheet = (): string => join(root, 'styles', 'theme.css');

describe('LinkedAssets — the name is a property of the bytes', () => {
  it('§6.2 two registries, one name: the pass that asks does not change the answer', () => {
    // The edge pass writes the URL into the HTML and the host build writes the file. This
    // is those two, standing in for each other.
    expect(new LinkedAssets('/').url(sheet())).toBe(new LinkedAssets('/').url(sheet()));
  });

  it('§6.7 the same bytes keep the name across builds, and new bytes get a new one', () => {
    const before = new LinkedAssets('/').url(sheet());
    writeFileSync(sheet(), SHEET); // rewritten, byte for byte the same
    expect(new LinkedAssets('/').url(sheet())).toBe(before);

    writeFileSync(sheet(), `${SHEET}.card{padding:var(--gap)}`);
    const after = new LinkedAssets('/').url(sheet());
    expect(after).not.toBe(before);
    writeFileSync(sheet(), SHEET);
  });

  it('carries the base, so a project served from a subdirectory links inside it', () => {
    expect(new LinkedAssets('/app/').url(sheet())).toMatch(/^\/app\/assets\/theme-[\w-]{8}\.css$/u);
    // A base without its trailing slash is the same base.
    expect(new LinkedAssets('/app').url(sheet())).toBe(new LinkedAssets('/app/').url(sheet()));
  });

  it('§6.6 one file, once: two passes resolving the same sheet publish a single entry', () => {
    const assets = new LinkedAssets('/');
    assets.url(sheet());
    assets.url(sheet());
    expect([...assets.files().keys()]).toHaveLength(1);
  });
});

describe('LinkedAssets — what travels inside the document and what does not', () => {
  it('publishes a small file too — nothing a document links is inlined', () => {
    // The `data:` threshold is right for an asset a MODULE imports and wrong for a file a
    // DOCUMENT links: a data URI is not revalidated, not precached, repeated in full in
    // every page that links it, and blocked by a policy that does not name `data:`. A
    // favicon is the case that says it out loud — three hundred bytes, in every page.
    const assets = new LinkedAssets('/');
    const url = assets.url(join(root, 'small.svg'));
    expect(url).toMatch(/^\/assets\/small-[\w-]{8}\.svg$/u);
    expect(assets.files().size).toBe(1);
  });

  it('never writes a data: URI, whatever the size or the type', () => {
    const assets = new LinkedAssets('/');
    for (const file of ['small.svg', 'logo.png', 'styles/theme.css', 'data.bin']) {
      expect(assets.url(join(root, file))).not.toContain('data:');
    }
  });

  it('§6.3 a big one is a file, however ordinary — the defect was never the CSS', () => {
    const assets = new LinkedAssets('/');
    expect(assets.url(join(root, 'logo.png'))).toMatch(/^\/assets\/logo-[\w-]{8}\.png$/u);
    expect([...assets.files().keys()]).toEqual([expect.stringMatching(/\.png$/u)]);
  });

  it('§6.5 a stylesheet is a file, however small', () => {
    const assets = new LinkedAssets('/');
    expect(assets.url(join(root, 'styles', 'other.css'))).toMatch(/^\/assets\/other-/u);
    expect(assets.files().size).toBe(1);
  });

  it('falls back to octet-stream for a type it does not know', () => {
    const assets = new LinkedAssets('/');
    const url = assets.url(join(root, 'data.bin'));
    expect(assets.served(url)?.type).toBe('application/octet-stream');
  });

  it('publishes a file with no extension under its whole name', () => {
    // There is no dot to cut at, and cutting at the one in a parent directory would name
    // the file after half of it.
    const assets = new LinkedAssets('/');
    expect(assets.url(join(root, 'LICENSE'))).toMatch(/^\/assets\/LICENSE-[\w-]{8}$/u);
  });
});

describe('LinkedAssets — §6.10 one path for the CSS', () => {
  it('publishes a stylesheet through the component compaction, prose and all', () => {
    const assets = new LinkedAssets('/');
    const url = assets.url(sheet());
    const published = Buffer.from(assets.files().get(url.slice(1))!).toString('utf8');
    expect(published).toBe(':host{--gap:8px;}');
  });

  it('copies anything else byte for byte — a `.svg` has its own minifier and it is not ours', () => {
    const assets = new LinkedAssets('/');
    const url = assets.url(join(root, 'logo.png'));
    expect(Buffer.from(assets.files().get(url.slice(1))!).equals(BIG_PNG)).toBe(true);
  });
});

describe('LinkedAssets — §6.8 what the dev server answers', () => {
  it('serves the very bytes the build publishes, with the content type', () => {
    const assets = new LinkedAssets('/');
    const url = assets.url(sheet());
    const served = assets.served(url)!;
    expect(served.type).toBe('text/css');
    // Not a re-read of the source: compacted in dev exactly as in the output, which is the
    // difference that is otherwise found last.
    expect(Buffer.from(served.bytes)).toEqual(assets.files().get(url.slice(1)));
  });

  it('answers nothing for a URL it never named, so the next middleware gets its turn', () => {
    const assets = new LinkedAssets('/');
    assets.url(sheet());
    expect(assets.served('/assets/theme-00000000.css')).toBeUndefined();
    expect(assets.served('/index.html')).toBeUndefined();
  });
});

describe('LinkedAssets — §6.9 what the worker precaches', () => {
  it('is what a document HEAD links, and not what its content references', () => {
    const assets = new LinkedAssets('/');
    assets.url(sheet(), 'head'); // <link rel="stylesheet">
    assets.url(join(root, 'small.svg'), 'head'); // <link rel="icon">
    assets.url(join(root, 'logo.png'), 'markup'); // an <img> inside a component

    // The line is the document against its content, not stylesheets against images. What a
    // head links is what every page needs to render ITSELF — and leaving the icon out is
    // what made the example take three loads to work offline instead of two.
    expect([...assets.shell()].sort()).toEqual([
      expect.stringMatching(/^\/assets\/small-.*\.svg$/u),
      expect.stringMatching(/^\/assets\/theme-.*\.css$/u),
    ]);
  });

  it('keeps a file in the shell once any head has linked it', () => {
    const assets = new LinkedAssets('/');
    assets.url(join(root, 'logo.png'), 'markup');
    assets.url(join(root, 'logo.png'), 'head'); // another document, its head
    expect(assets.shell()).toHaveLength(1);
  });

  it('is empty when nothing was linked from a head', () => {
    const assets = new LinkedAssets('/');
    assets.url(sheet(), 'markup');
    expect(assets.shell()).toEqual([]);
  });
});

describe('LinkedAssets — the project public directory', () => {
  const publicDir = (): string => join(root, 'public');

  it('answers for a file that is there, and not for one that is not', () => {
    const assets = new LinkedAssets('/', publicDir());
    expect(assets.publicFile('/site.svg')).toBe(join(publicDir(), 'site.svg'));
    expect(assets.publicFile('/site.svg?v=2')).toBe(join(publicDir(), 'site.svg'));
    expect(assets.publicFile('/ghost.svg')).toBeUndefined();
  });

  it('answers nothing at all when the project has no public directory', () => {
    const assets = new LinkedAssets('/');
    expect(assets.publicFile('/site.svg')).toBeUndefined();
    // And then a relative path cannot be "inside" it either, so nothing is misnamed.
    assets.url(join(publicDir(), 'site.svg'), 'head');
    expect(assets.publicByPath()).toEqual([]);
  });

  it('keeps the URL the author wrote, and adds the base', () => {
    expect(new LinkedAssets('/', publicDir()).publicUrl('/site.svg')).toBe('/site.svg');
    expect(new LinkedAssets('/admin/', publicDir()).publicUrl('/site.svg')).toBe(
      '/admin/site.svg',
    );
  });

  it('puts one a head links into the shell, and one from markup nowhere', () => {
    const assets = new LinkedAssets('/', publicDir());
    assets.publicUrl('/site.svg', 'head');
    assets.publicUrl('/probe.txt', 'markup');
    expect(assets.shell()).toEqual(['/site.svg']);
  });

  it('FUD0366: a relative path into public is recorded, and answered with what was meant', () => {
    const assets = new LinkedAssets('/', publicDir());
    // What `../../public/logo.svg` resolves to. It gets the URL the author meant — the
    // build complains, the page is still right — and nothing is published.
    expect(assets.url(join(publicDir(), 'site.svg'), 'head')).toBe('/site.svg');
    expect(assets.publicByPath()).toEqual(['/site.svg']);
    expect(assets.files().size).toBe(0);
    expect(assets.shell()).toEqual(['/site.svg']);
  });

  it('does not mistake a sibling of public for something inside it', () => {
    // `relative()` on `public` → `public-assets` yields `../public-assets`, and the `..`
    // is what says it is outside. Compared on the resolved path, never on the text.
    const assets = new LinkedAssets('/', publicDir());
    expect(assets.url(join(root, 'logo.png'))).toMatch(/^\/assets\/logo-/u);
    expect(assets.publicByPath()).toEqual([]);
  });
});

describe('assetUrlFrom', () => {
  it('resolves the specifier against the file that wrote it', () => {
    const assets = new LinkedAssets('/');
    const resolve = assetUrlFrom(assets, join(root, 'styles'));
    expect(resolve('./theme.css', 'head')).toBe(assets.url(sheet()));
    expect(resolve('../logo.png', 'markup')).toBe(assets.url(join(root, 'logo.png')));
  });

  it('hands a root-absolute specifier to the public directory, unhashed', () => {
    const assets = new LinkedAssets('/app/', join(root, 'public'));
    expect(assetUrlFrom(assets, join(root, 'styles'))('/site.svg', 'markup')).toBe('/app/site.svg');
    expect(assets.files().size).toBe(0);
  });

  it('carries the origin through, so the head of one `.fud` reaches the shell', () => {
    const assets = new LinkedAssets('/');
    assetUrlFrom(assets, join(root, 'styles'))('./theme.css', 'head');
    expect(assets.shell()).toHaveLength(1);
  });
});

/**
 * SDD-49 §3.7, §4.9–§4.11: the pruned copy of a sheet, and what the build learns about each
 * sheet page by page.
 */
describe('LinkedAssets.sheet — a pruned copy is named by its own bytes', () => {
  it('names it like `url()` does, over the pruned CSS: same bytes, same name, from any registry', () => {
    const first = new LinkedAssets('/').sheet(sheet(), '.a{color:red}', 'markup');
    expect(first).toMatch(/^\/assets\/theme-[\w-]{8}\.css$/u);
    expect(new LinkedAssets('/').sheet(sheet(), '.a{color:red}', 'markup')).toBe(first);
    // Another prune of the same file is another file.
    expect(new LinkedAssets('/').sheet(sheet(), '.b{color:red}', 'markup')).not.toBe(first);
  });

  it('is not the whole file: its name says nothing about the bytes on disk', () => {
    const assets = new LinkedAssets('/');
    expect(assets.sheet(sheet(), '.a{color:red}', 'markup')).not.toBe(assets.url(sheet()));
  });

  it('two pages that keep the same rules publish one file', () => {
    const assets = new LinkedAssets('/');
    const one = assets.sheet(sheet(), '.a{color:red}', 'markup');
    const two = assets.sheet(sheet(), '.a{color:red}', 'markup');
    expect(two).toBe(one);
    expect([...assets.files().keys()]).toEqual([one.slice(1)]);
    expect(new TextDecoder().decode(assets.files().get(one.slice(1)))).toBe('.a{color:red}');
  });

  it('publishes the CSS it is handed as it is: it arrives compacted, and is not compacted twice', () => {
    const assets = new LinkedAssets('/');
    const url = assets.sheet(sheet(), '.a { color: red; }', 'markup');
    expect(new TextDecoder().decode(assets.files().get(url.slice(1)))).toBe('.a { color: red; }');
  });

  it('carries the base', () => {
    expect(new LinkedAssets('/app/').sheet(sheet(), '.a{}', 'markup')).toMatch(/^\/app\/assets\/theme-/u);
  });

  it('lives under the directory it is told: `@fudic/sheet` in dev, served from memory', () => {
    const assets = new LinkedAssets('/', '', '@fudic/sheet');
    const url = assets.sheet(sheet(), '.a{color:red}', 'markup');
    expect(url).toMatch(/^\/@fudic\/sheet\/theme-[\w-]{8}\.css$/u);
    const served = assets.served(url);
    expect(served?.type).toBe('text/css');
    expect(new TextDecoder().decode(served?.bytes)).toBe('.a{color:red}');
  });

  it('does not enter the shell when linked as the compiler links it, from markup (§4.9)', () => {
    const assets = new LinkedAssets('/');
    assets.sheet(sheet(), '.a{color:red}', 'markup');
    expect(assets.shell()).toEqual([]);
  });

  it('honours an explicit head origin, as every resolver of the registry does', () => {
    const assets = new LinkedAssets('/');
    const url = assets.sheet(sheet(), '.a{color:red}', 'head');
    expect(assets.shell()).toEqual([url]);
    // The default is the markup's: a pruned copy is one page's, cached on visit.
    assets.sheet(sheet(), '.b{color:red}');
    expect(assets.shell()).toEqual([url]);
  });
});

describe('assetSheetFrom', () => {
  it('resolves the specifier against the file that wrote it, its query dropped', () => {
    const assets = new LinkedAssets('/');
    const named = assetSheetFrom(assets, join(root, 'styles'));
    expect(named('./theme.css?inline', '.a{}', 'markup')).toBe(
      new LinkedAssets('/').sheet(sheet(), '.a{}', 'markup'),
    );
    expect(named('../styles/theme.css', '.a{}', 'markup')).toBe(
      new LinkedAssets('/').sheet(sheet(), '.a{}', 'markup'),
    );
    expect(assets.shell()).toEqual([]);
  });
});

describe('LinkedAssets — the sheets no page uses (FUD0852) and what they say (§4.11)', () => {
  const warning = (code: FudCode, start: number): Diagnostic => ({
    code,
    severity: 'warning',
    message: code,
    span: { start, end: start + 1 },
  });

  it('has nothing to say before any page was compiled', () => {
    const assets = new LinkedAssets('/');
    expect(assets.unusedSheets()).toEqual([]);
    expect(assets.sheetDiagnostics().size).toBe(0);
  });

  it('a sheet no page keeps a rule of is unused; one any page uses is not', () => {
    const assets = new LinkedAssets('/');
    assets.recordSheet('/s/dead.css', false);
    assets.recordSheet('/s/main.css', false);
    assets.recordSheet('/s/main.css', true);
    assets.recordSheet('/s/main.css', false);
    assets.recordSheet('fudic.json "panel"', false);
    expect(assets.unusedSheets()).toEqual(['/s/dead.css', 'fudic.json "panel"']);
  });

  it('keeps what a sheet says from the first page that read it: once per file, not per page', () => {
    const assets = new LinkedAssets('/');
    const first = [warning('FUD0850', 0)];
    assets.recordSheet('/s/main.css', true, first);
    assets.recordSheet('/s/main.css', true, [warning('FUD0850', 0)]);
    assets.recordSheet('/s/quiet.css', true);
    const said = assets.sheetDiagnostics();
    expect(said.get('/s/main.css')).toBe(first);
    expect(said.get('/s/quiet.css')).toEqual([]);
    expect([...said.keys()]).toEqual(['/s/main.css', '/s/quiet.css']);
  });
});
