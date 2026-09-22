/**
 * SDD-45 §4.2 — linking the published runtime instead of bundling it.
 *
 * `runtime-pieces.ts` answers «which pieces exist». This module answers the three that
 * follow: which URL a name resolves to, which pieces this build actually reached, and what
 * has to be copied into the output. It is pure text and path work over an injected reader,
 * which is why almost all of it can be held to account without a filesystem.
 */

import { describe, expect, it } from 'vitest';

import {
  RUNTIME_SHIM,
  insidePublisher,
  linkedPieces,
  loadedPieces,
  pieceUrl,
  piecesToCopy,
  publisherOf,
  runtimeCacheOf,
  runtimeLinkage,
  runtimeShim,
  shimIdFor,
  shimSpecifier,
  type LinkedPiece,
  type RuntimeLinkage,
} from '../src/runtime-link.js';
import { BUILD_TOKEN } from '../src/constants.js';
import type { RuntimePiece } from '../src/runtime-pieces.js';

/**
 * How every hook of the plugin reads an id — `splitId`, private to `plugin.ts` and repeated
 * here rather than exported: what the test below fixes is how a shim id ANSWERS this, so the
 * question has to be asked in its own words.
 */
const splitId = (id: string): { readonly path: string; readonly query: string } => {
  const q = id.indexOf('?');
  return q === -1 ? { path: id, query: '' } : { path: id.slice(0, q), query: id.slice(q + 1) };
};

const ROOT = '/repo/node_modules/@fudic/core';

/** A piece of `@fudic/core`, published where discovery would have found it. */
const piece = (pkg: string, name: string, version = '0.0.1'): RuntimePiece => ({
  pkg,
  name,
  url: `/_fudic/${version}/${pkg.replace('@fudic/', '')}/${name}.js`,
  file: `/repo/node_modules/${pkg}/runtime/${name}.js`,
});

/** A reader over a map of files, plus a `package.json` at each publisher's root. */
function io(files: Record<string, string>): { readFile(path: string): string | undefined } {
  const all: Record<string, string> = { ...files };
  for (const path of Object.keys(files)) {
    const pkg = path.replace(/\/runtime\/.*$/u, '');
    all[`${pkg}/package.json`] = '{"name":"x"}';
  }
  return { readFile: (path) => all[path] };
}

/** The linkage of two `@fudic/core` pieces, which is the shape most questions need. */
function coreLinkage(extra: Record<string, string> = {}): RuntimeLinkage {
  return runtimeLinkage(
    [piece('@fudic/core', 'signal'), piece('@fudic/core', 'hydrate')],
    io({
      '/repo/node_modules/@fudic/core/runtime/signal.js': 'export{r as signal,a as batch};',
      '/repo/node_modules/@fudic/core/runtime/hydrate.js':
        'import"/_fudic/0.0.1/core/signal.js";export{h as hydrate};',
      ...extra,
    }),
  );
}

describe('shimIdFor and shimSpecifier', () => {
  it('puts the SPECIFIER last, so the id is never read as a file', () => {
    const importer = '/app/src/app-card.fud?client';
    const id = shimIdFor('@fudic/core', importer);

    // An id that ENDED in the importer is a `.fud?client` to every hook that asks what a file
    // is: same path, and a query that matches exactly. Sixty of them tried to compile
    // `@fudic/core`. With the specifier last the path still looks like a `.fud` — it is the
    // importer, after all — but the query no longer answers to any of them.
    expect(splitId(importer).query).toBe('client');
    expect(splitId(id).query).not.toBe('client');
    expect(id.endsWith('@fudic/core')).toBe(true);
    // And the prefix is what the hooks recognise it by, ahead of asking anything about paths.
    expect(id.startsWith(RUNTIME_SHIM)).toBe(true);
    expect(shimSpecifier(id)).toBe('@fudic/core');
  });

  it('is one id per specifier AND per importer', () => {
    // With one shim per specifier the bundler made it a SHARED chunk whose whole content was
    // a re-export — a request bought for nothing, and worse: the piece URLs then sat one
    // round trip deep, which is the discovery chain §1.5 rule 2 forbids.
    const a = shimIdFor('@fudic/core', '/app/a.fud?client');
    const b = shimIdFor('@fudic/core', '/app/b.fud?client');
    expect(a).not.toBe(b);
    expect(shimSpecifier(a)).toBe(shimSpecifier(b));
  });

  it('survives an importer the build did not give', () => {
    const id = shimIdFor('@fudic/core', undefined);
    expect(shimSpecifier(id)).toBe('@fudic/core');
  });

  it('answers the empty string for an id with nothing in it', () => {
    expect(shimSpecifier('')).toBe('');
  });
});

describe('runtimeLinkage', () => {
  it('reads the name AFTER `as`, because the other one is the minifier’s', () => {
    const linkage = coreLinkage();
    const core = linkage.urlOf.get('@fudic/core');

    // `export{r as signal}` offers `signal`; `r` is this build's name for it and will be a
    // different letter on the next one.
    expect(core?.get('signal')).toBe('/_fudic/0.0.1/core/signal.js');
    expect(core?.get('batch')).toBe('/_fudic/0.0.1/core/signal.js');
    expect(core?.get('r')).toBeUndefined();
  });

  it('reads several statements, empty braces and a bare name with no `as`', () => {
    const linkage = runtimeLinkage(
      [piece('@fudic/core', 'signal')],
      io({
        '/repo/node_modules/@fudic/core/runtime/signal.js':
          'export{};export{r as signal};export {untouched, d as default};',
      }),
    );
    const core = linkage.urlOf.get('@fudic/core');

    expect(core?.get('signal')).toBe('/_fudic/0.0.1/core/signal.js');
    // A name the minifier left alone is still a name a consumer writes.
    expect(core?.get('untouched')).toBe('/_fudic/0.0.1/core/signal.js');
    // `default` is not a name anybody imports from a piece by specifier.
    expect(core?.get('default')).toBeUndefined();
  });

  it('skips a piece it cannot read rather than failing over it', () => {
    // Discovery already said so, and saying it twice helps nobody.
    const linkage = runtimeLinkage([piece('@fudic/core', 'gone')], io({}));
    expect(linkage.byUrl.size).toBe(0);
    expect(linkage.packages).toEqual([]);
  });

  it('does NOT offer a name two pieces of one package export', () => {
    const linkage = runtimeLinkage(
      [piece('@fudic/core', 'element'), piece('@fudic/core', 'hydrate')],
      io({
        '/repo/node_modules/@fudic/core/runtime/element.js': 'export{i as install,e as element};',
        '/repo/node_modules/@fudic/core/runtime/hydrate.js': 'export{i as install,h as hydrate};',
      }),
    );
    const core = linkage.urlOf.get('@fudic/core');

    // `install` is the one collision there is on purpose: every STARTUP piece exports it
    // (§3.4), which is what lets a new package join without the coordinator's generator
    // learning about it. Nothing imports it by specifier, so it is simply not offered.
    expect(core?.get('install')).toBeUndefined();
    expect(core?.get('element')).toBe('/_fudic/0.0.1/core/element.js');
    expect(core?.get('hydrate')).toBe('/_fudic/0.0.1/core/hydrate.js');
  });

  it('carries the source map when the publisher emitted one, and nothing when not', () => {
    const linkage = runtimeLinkage(
      [piece('@fudic/core', 'signal'), piece('@fudic/core', 'hydrate')],
      io({
        '/repo/node_modules/@fudic/core/runtime/signal.js': 'export{r as signal};',
        '/repo/node_modules/@fudic/core/runtime/signal.js.map': '{"version":3}',
        '/repo/node_modules/@fudic/core/runtime/hydrate.js': 'export{h as hydrate};',
      }),
    );

    // The piece names its map in its last line, so copying one without the other is a 404 in
    // the devtools of anybody who opens them.
    expect(linkage.byUrl.get('/_fudic/0.0.1/core/signal.js')?.map).toBe('{"version":3}');
    expect(linkage.byUrl.get('/_fudic/0.0.1/core/hydrate.js')?.map).toBeUndefined();
  });

  it('walks UP to the package root instead of counting segments back', () => {
    // What a publisher declares is a path relative to itself — `./runtime`, and tomorrow
    // `./dist/runtime` — so counting backwards would be counting somebody else's decision.
    const linkage = runtimeLinkage(
      [{ ...piece('@fudic/core', 'signal'), file: `${ROOT}/dist/runtime/deep/signal.js` }],
      {
        readFile: (path) =>
          path === `${ROOT}/dist/runtime/deep/signal.js`
            ? 'export{r as signal};'
            : path === `${ROOT}/package.json`
              ? '{"name":"@fudic/core"}'
              : undefined,
      },
    );

    expect(linkage.roots).toEqual([ROOT]);
  });

  it('has no root for a piece with no `package.json` above it', () => {
    const linkage = runtimeLinkage([{ ...piece('@fudic/core', 'signal'), file: '/signal.js' }], {
      readFile: (path) => (path === '/signal.js' ? 'export{r as signal};' : undefined),
    });

    expect(linkage.roots).toEqual([]);
  });
});

describe('pieceUrl', () => {
  it('finds a piece by its package and its name within that package', () => {
    // What the coordinator asks (§4.4): it names PIECES, so `core/hydrate` has to become a URL.
    expect(pieceUrl(coreLinkage(), '@fudic/core', 'hydrate')).toBe(
      '/_fudic/0.0.1/core/hydrate.js',
    );
  });

  it('is asked with the FULL package name, and the short one finds nothing', () => {
    // `pieceUrl(runtime, 'ssr', 'index')` never matched: what is stored is `@fudic/ssr`. It
    // is the same defect `runtimeCacheOf` had, and it answered silently rather than loudly.
    expect(pieceUrl(coreLinkage(), 'core', 'hydrate')).toBeUndefined();
    // And a piece this build does not have — a publisher whose runtime was never built, or
    // one that moved between versions.
    expect(pieceUrl(coreLinkage(), '@fudic/core', 'nowhere')).toBeUndefined();
  });
});

describe('insidePublisher', () => {
  it('says yes for a publisher’s own file and no for the application’s', () => {
    const linkage = coreLinkage();

    // Linking happens at the boundary the APPLICATION crosses and never inside a package: a
    // package's internal imports belong to whatever part of it stayed bundled, and the
    // dependency is the package's, not the app's — which is how it broke a workspace app
    // that never declared `@fudic/di`.
    expect(insidePublisher(`${ROOT}/dist/index.js`, linkage)).toBe(true);
    expect(insidePublisher('/repo/app/src/app-card.fud', linkage)).toBe(false);
  });

  it('reads Windows separators, and an absent importer is not inside anything', () => {
    const linkage = coreLinkage();
    expect(insidePublisher(ROOT.replace(/\//gu, '\\') + '\\dist\\index.js', linkage)).toBe(true);
    expect(insidePublisher(undefined, linkage)).toBe(false);
  });
});

describe('publisherOf', () => {
  it('matches the package and its subpaths, and nothing else', () => {
    const packages = ['@fudic/core', '@fudic/forms'];

    expect(publisherOf('@fudic/core', packages)).toBe('@fudic/core');
    // The subpaths are what the emit writes: `@fudic/forms/dom`, `@fudic/di/page`.
    expect(publisherOf('@fudic/forms/dom', packages)).toBe('@fudic/forms');
    expect(publisherOf('@fudic/router', packages)).toBeNull();
    // A `package.json` is a file and not a surface.
    expect(publisherOf('@fudic/core/package.json', packages)).toBeNull();
    // And a package whose name merely starts like one of ours.
    expect(publisherOf('@fudic/core-extras', packages)).toBeNull();
  });
});

describe('runtimeShim', () => {
  it('puts `export *` FIRST so the explicit re-exports shadow it', () => {
    const shim = runtimeShim('@fudic/core', coreLinkage(), '@fudic/core');
    const lines = shim.split('\n');

    // Link what is published and bundle what is not, with no second list of names to keep in
    // step: whatever the package exports and does not publish still resolves, still gets
    // bundled, and still gets pruned if nobody uses it.
    expect(lines[0]).toBe('export * from "@fudic/core";');
    expect(lines.slice(1).every((line) => line.startsWith('export {'))).toBe(true);
  });

  it('writes ONE statement per piece and not one per name', () => {
    const shim = runtimeShim('@fudic/core', coreLinkage(), '@fudic/core');

    // So the output holds one import per URL. Per name it would be two requests for one file.
    expect(shim).toContain('export { batch, signal } from "/_fudic/0.0.1/core/signal.js";');
    expect(shim.split('\n')).toHaveLength(3);
  });

  it('is stable across builds, because two builds must produce the same bytes', () => {
    const first = runtimeShim('@fudic/core', coreLinkage(), '@fudic/core');
    // Same pieces, discovered the other way round: the order is sorted and not observed.
    const reversed = runtimeLinkage(
      [piece('@fudic/core', 'hydrate'), piece('@fudic/core', 'signal')],
      io({
        '/repo/node_modules/@fudic/core/runtime/signal.js': 'export{a as batch,r as signal};',
        '/repo/node_modules/@fudic/core/runtime/hydrate.js': 'export{h as hydrate};',
      }),
    );
    expect(runtimeShim('@fudic/core', reversed, '@fudic/core')).toBe(first);
  });

  it('leaves `install` out, and is just the star for a package with no pieces', () => {
    const linkage = runtimeLinkage(
      [piece('@fudic/core', 'element')],
      io({
        '/repo/node_modules/@fudic/core/runtime/element.js': 'export{i as install};',
      }),
    );
    // One published name and it is the ambiguous-by-design one, so nothing to re-export.
    expect(runtimeShim('@fudic/core', linkage, '@fudic/core')).toBe('export * from "@fudic/core";');
    // And a package the linkage has never heard of: the star alone, which is the old
    // behaviour and exactly right — it has nothing published to link.
    expect(runtimeShim('@fudic/http', linkage, '@fudic/http')).toBe(
      'export * from "@fudic/http";',
    );
  });

  it('names the SPECIFIER in the star, subpath included', () => {
    // Not a circularity: an import whose importer is a shim is left alone, so the resolver
    // answers it the ordinary way with the ordinary file.
    expect(runtimeShim('@fudic/forms', coreLinkage(), '@fudic/forms/dom')).toContain(
      'export * from "@fudic/forms/dom";',
    );
  });
});

describe('runtimeCacheOf', () => {
  it('is named by the FRAMEWORK’s version, which is `@fudic/core`’s', () => {
    const linkage = runtimeLinkage(
      [piece('@fudic/http', 'client', '2.5.0'), piece('@fudic/core', 'signal', '0.0.1')],
      io({
        '/repo/node_modules/@fudic/http/runtime/client.js': 'export{c as client};',
        '/repo/node_modules/@fudic/core/runtime/signal.js': 'export{r as signal};',
      }),
    );

    // By its FULL name. Written short — `core` — this never matched and the fallback answered
    // with the FIRST piece in map order, whose version is its own package's: right by
    // coincidence while every package shares a number, wrong the day one of them moves.
    expect(runtimeCacheOf(linkage)).toBe('fudic-runtime-0.0.1');
  });

  it('falls back to the first piece when `@fudic/core` publishes nothing', () => {
    const linkage = runtimeLinkage(
      [piece('@fudic/http', 'client', '2.5.0')],
      io({ '/repo/node_modules/@fudic/http/runtime/client.js': 'export{c as client};' }),
    );
    expect(runtimeCacheOf(linkage)).toBe('fudic-runtime-2.5.0');
  });

  it('is the empty string when nothing is published at all', () => {
    expect(runtimeCacheOf(runtimeLinkage([], io({})))).toBe('');
  });

  it('is the empty string when the URL carries no version segment', () => {
    const linkage = runtimeLinkage(
      [{ ...piece('@fudic/core', 'signal'), url: '/x.js' }],
      io({ '/repo/node_modules/@fudic/core/runtime/signal.js': 'export{r as signal};' }),
    );
    expect(runtimeCacheOf(linkage)).toBe('');
  });
});

describe('loadedPieces — what a route pays for at LOAD', () => {
  const linkage = (): RuntimeLinkage =>
    runtimeLinkage(
      [
        piece('@fudic/core', 'hydrate'),
        piece('@fudic/core', 'registry'),
        piece('@fudic/core', 'signal'),
        piece('@fudic/dom', 'browser'),
      ],
      io({
        // Hydration names its registry statically and asks for the deferred two dynamically,
        // which is the whole of §4.4.1.
        '/repo/node_modules/@fudic/core/runtime/hydrate.js':
          'import{r}from"/_fudic/0.0.1/core/registry.js";' +
          'const p=()=>Promise.all([import(`/_fudic/0.0.1/dom/browser.js`),' +
          'import("/_fudic/0.0.1/core/signal.js")]);export{h as hydrate};',
        '/repo/node_modules/@fudic/core/runtime/registry.js': 'export{r};',
        '/repo/node_modules/@fudic/core/runtime/signal.js': 'export{r as signal};',
        '/repo/node_modules/@fudic/dom/runtime/browser.js': 'export{b as browserDom};',
      }),
    );

  it('is the transitive closure of the STATIC imports, and stops at the dynamic ones', () => {
    const coordinator = 'import{hydrate}from"/_fudic/0.0.1/core/hydrate.js";hydrate();';

    // `core/registry` is in the list although the coordinator never names it — preloading
    // only the direct imports leaves the chain intact one level down. And the adapter and the
    // signal are NOT, although `core/hydrate` asks for them: preloading those would buy back
    // for every page the bytes §4.4.1 just removed.
    expect(loadedPieces(coordinator, linkage())).toEqual([
      '/_fudic/0.0.1/core/hydrate.js',
      '/_fudic/0.0.1/core/registry.js',
    ]);
  });

  it('tells the two forms apart by SYNTAX and not by quote style', () => {
    const l = linkage();
    // `from "…"` and `import "…"` are static, whatever quotes the minifier chose.
    expect(loadedPieces("import'/_fudic/0.0.1/core/signal.js';", l)).toEqual([
      '/_fudic/0.0.1/core/signal.js',
    ]);
    expect(loadedPieces('import`/_fudic/0.0.1/core/signal.js`;', l)).toEqual([
      '/_fudic/0.0.1/core/signal.js',
    ]);
    // `import("…")` is not, and neither is a method that happens to be called `import`.
    expect(loadedPieces('import("/_fudic/0.0.1/core/signal.js")', l)).toEqual([]);
    expect(loadedPieces('x.import "/_fudic/0.0.1/core/signal.js"', l)).toEqual([]);
  });

  it('ignores a URL with no piece behind it', () => {
    expect(loadedPieces('import"/_fudic/0.0.1/core/ghost.js";', linkage())).toEqual([]);
  });

  it('is in the order the head will write them, stable across builds, and deduped', () => {
    const code =
      'import"/_fudic/0.0.1/core/signal.js";import"/_fudic/0.0.1/core/registry.js";' +
      'import"/_fudic/0.0.1/core/signal.js";';
    // One `<link>` per piece: named twice it would be preloaded twice, which the browser
    // reports as a duplicate and which buys nothing either way.
    expect(loadedPieces(code, linkage())).toEqual([
      '/_fudic/0.0.1/core/registry.js',
      '/_fudic/0.0.1/core/signal.js',
    ]);
  });
});

describe('linkedPieces — what has to be copied', () => {
  const linkage = (): RuntimeLinkage =>
    runtimeLinkage(
      [
        piece('@fudic/core', 'hydrate'),
        piece('@fudic/core', 'registry'),
        piece('@fudic/core', 'signal'),
        piece('@fudic/core', 'computed'),
        piece('@fudic/dom', 'browser'),
      ],
      io({
        '/repo/node_modules/@fudic/core/runtime/hydrate.js':
          'import{r}from"/_fudic/0.0.1/core/registry.js";' +
          'const p=()=>import(`/_fudic/0.0.1/dom/browser.js`);export{h as hydrate};',
        '/repo/node_modules/@fudic/core/runtime/registry.js': 'export{r};',
        '/repo/node_modules/@fudic/core/runtime/signal.js': 'export{r as signal};',
        '/repo/node_modules/@fudic/core/runtime/computed.js': 'export{c as computed};',
        '/repo/node_modules/@fudic/dom/runtime/browser.js': 'export{b as browserDom};',
      }),
    );

  it('is TRANSITIVE, so a `dist` does not 404 on the second hop', () => {
    const urls = linkedPieces(
      ['import{hydrate}from"/_fudic/0.0.1/core/hydrate.js";'],
      linkage(),
    ).map((p) => p.url);

    // A piece names other pieces by URL (§4.3): `core/hydrate` asks for `core/registry`
    // without any chunk of the application ever mentioning it.
    expect(urls).toContain('/_fudic/0.0.1/core/registry.js');
    // And a signal nobody derives is not copied, which is what makes the prune measurable
    // (criterion 10) — counted on the output and not deduced from the source.
    expect(urls).not.toContain('/_fudic/0.0.1/core/computed.js');
  });

  it('follows a BACKTICK url, because that is how a dynamic import is minified', () => {
    // The third quote is not cosmetic. A scanner blind to it left `dom/browser.js` uncopied,
    // and the 404 arrived on the first gesture of a page that had already loaded fine.
    const urls = linkedPieces(
      ['import{hydrate}from"/_fudic/0.0.1/core/hydrate.js";'],
      linkage(),
    ).map((p) => p.url);

    expect(urls).toContain('/_fudic/0.0.1/dom/browser.js');
  });

  it('reads several chunks, dedupes, and comes out sorted by URL', () => {
    const urls = linkedPieces(
      [
        'import"/_fudic/0.0.1/core/signal.js";',
        'import"/_fudic/0.0.1/core/computed.js";import"/_fudic/0.0.1/core/signal.js";',
      ],
      linkage(),
    ).map((p) => p.url);

    expect(urls).toEqual(['/_fudic/0.0.1/core/computed.js', '/_fudic/0.0.1/core/signal.js']);
  });

  it('ignores a URL no piece is behind', () => {
    // Discovery already said what it could, and inventing a file here would publish bytes
    // nobody built.
    expect(linkedPieces(['import"/_fudic/0.0.1/core/ghost.js";'], linkage())).toEqual([]);
  });
});

describe('piecesToCopy', () => {
  const linked = (over: Partial<LinkedPiece> = {}): LinkedPiece => ({
    ...piece('@fudic/core', 'signal'),
    exports: ['signal'],
    code: 'export{r as signal};',
    ...over,
  });

  it('copies each piece to the path its URL names, outside every app’s `base`', () => {
    const { files, diagnostics } = piecesToCopy([linked()], () => undefined);

    // `url` is origin-absolute and outside every app's `base` (§3.1); the file it names sits
    // at the same path inside the output, which is what makes a `dist` deployable on its own.
    expect(files).toEqual([
      { fileName: '_fudic/0.0.1/core/signal.js', code: 'export{r as signal};' },
    ]);
    expect(diagnostics).toEqual([]);
  });

  it('copies the source map beside the piece', () => {
    const { files } = piecesToCopy([linked({ map: '{"version":3}' })], () => undefined);

    // The piece names its map in its last line, so a piece without it is undebuggable
    // exactly where this framework runs.
    expect(files.map((f) => f.fileName)).toEqual([
      '_fudic/0.0.1/core/signal.js',
      '_fudic/0.0.1/core/signal.js.map',
    ]);
  });

  it('FUD0806: a piece carrying the build token is NOT copied', () => {
    const { files, diagnostics } = piecesToCopy(
      [linked({ code: `export{r as signal};//${BUILD_TOKEN}` })],
      () => undefined,
    );

    // Bytes shared by two applications cannot hold a fact of one (§4.13), and the whole
    // architecture rests on that being impossible. Not copied, because publishing it is the
    // harm the diagnostic is about.
    expect(files).toEqual([]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('FUD0806');
  });

  it('FUD0802: the output already holds that URL with different bytes', () => {
    const { files, diagnostics } = piecesToCopy([linked()], (name) =>
      name === '_fudic/0.0.1/core/signal.js' ? 'export{q as signal};' : undefined,
    );

    // It should not be possible (§4.2): the same version of a package was built by the same
    // build of the framework, so two applications deploying over one origin overwrite each
    // other with identical bytes. Only reachable with the `dist` not emptied, which is the
    // real scenario — two apps deploying over one origin.
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe('FUD0802');
    // Reported and still copied: what is wrong is the publishing, not this copy.
    expect(files).toHaveLength(1);
  });

  it('FUD0802 for the MAP too, under the same argument', () => {
    const { diagnostics } = piecesToCopy([linked({ map: '{"version":3}' })], (name) =>
      name.endsWith('.map') ? '{"version":3,"other":1}' : undefined,
    );

    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0802']);
    expect(diagnostics[0]?.file).toBe('_fudic/0.0.1/core/signal.js.map');
  });

  it('says nothing when the output already holds the very same bytes', () => {
    // Which is the ordinary case for a second application deploying over one origin, and the
    // property that makes sharing possible at all.
    const { files, diagnostics } = piecesToCopy(
      [linked({ map: '{"version":3}' })],
      (name) => (name.endsWith('.map') ? '{"version":3}' : 'export{r as signal};'),
    );

    expect(diagnostics).toEqual([]);
    expect(files).toHaveLength(2);
  });
});
