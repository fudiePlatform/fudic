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
import { LinkedAssets, assetUrlFrom } from '../src/linked-assets.js';

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

describe('assetUrlFrom', () => {
  it('resolves the specifier against the file that wrote it', () => {
    const assets = new LinkedAssets('/');
    const resolve = assetUrlFrom(assets, join(root, 'styles'));
    expect(resolve('./theme.css', 'head')).toBe(assets.url(sheet()));
    expect(resolve('../logo.png', 'markup')).toBe(assets.url(join(root, 'logo.png')));
  });

  it('carries the origin through, so the head of one `.fud` reaches the shell', () => {
    const assets = new LinkedAssets('/');
    assetUrlFrom(assets, join(root, 'styles'))('./theme.css', 'head');
    expect(assets.shell()).toHaveLength(1);
  });
});
