/**
 * SDD-27 §5.2: the chunks whose URL the client derives trade their content hash for the
 * build id, in a substitution that moves no offset.
 *
 * The case that drove the design is `site-nav-Bq-vwUs5.js`. Rollup's hash alphabet is
 * base64url, so a hash contains `-` just as a chunk name does; splitting on the last
 * separator gives `site-nav-Bq`, and the manifest then derives a URL for a file that was
 * never written. Every test here that mentions a dash is guarding that.
 */

import { describe, it, expect } from 'vitest';
import { planRename, rewriteReferences, mapNameOf } from '../src/rename.js';
import { chunkNameOf, chunkNamesOf } from '../src/names.js';
import { FUD_HASH_LENGTH, FUD_NAME_COLLISION } from '../src/diagnostics.js';
import { manifestFile, renderUrlOf } from './helpers/manifest.js';

const BUILD = 'c72057ac';

describe('planRename', () => {
  it('replaces the content hash with the build id, keeping the directory', () => {
    const { files, diagnostics } = planRename(
      ['sw/c/about-o23EwdAA.js', 'assets/h/app-badge-BWBimzjf.js'],
      BUILD,
    );
    expect(diagnostics).toEqual([]);
    expect(files.get('sw/c/about-o23EwdAA.js')).toBe(`sw/c/about-${BUILD}.js`);
    expect(files.get('assets/h/app-badge-BWBimzjf.js')).toBe(`assets/h/app-badge-${BUILD}.js`);
  });

  it('splits a hash that contains dashes by WIDTH, not by the last separator', () => {
    const { files } = planRename(
      ['sw/c/site-nav-Bq-vwUs5.js', 'sw/c/app-card-B-eQzVTr.js', 'sw/c/blog-slug-N9OIQ_Kf.js'],
      BUILD,
    );
    expect(files.get('sw/c/site-nav-Bq-vwUs5.js')).toBe(`sw/c/site-nav-${BUILD}.js`);
    expect(files.get('sw/c/app-card-B-eQzVTr.js')).toBe(`sw/c/app-card-${BUILD}.js`);
    expect(files.get('sw/c/blog-slug-N9OIQ_Kf.js')).toBe(`sw/c/blog-slug-${BUILD}.js`);
  });

  it('the new name is exactly as long as the old one, which is what keeps maps valid', () => {
    const { files } = planRename(['sw/c/site-nav-Bq-vwUs5.js'], BUILD);
    for (const [from, to] of files) {
      expect(to).toHaveLength(from.length);
    }
  });

  it('FUD0500: a hash of another width disables the rename ENTIRELY', () => {
    // Half a naming scheme is worse than none: the manifest would derive URLs for files
    // that kept their hash. So one bad name means nobody moves.
    const { files, diagnostics } = planRename(
      ['sw/c/about-o23EwdAA.js', 'sw/c/blog-ABC.js'],
      BUILD,
    );
    expect(files.size).toBe(0);
    expect(diagnostics.map((d) => d.code)).toEqual([FUD_HASH_LENGTH]);
    expect(diagnostics[0]?.message).toContain('blog-ABC.js');
  });

  it('FUD0501: colliding names keep their hash, and only that pair', () => {
    // `/blog/:slug` and `/blog-slug` both reduce to `blog-slug` once the hash is gone.
    const { files, diagnostics } = planRename(
      ['sw/c/blog-slug-AAAAAAAA.js', 'sw/c/blog-slug-BBBBBBBB.js', 'sw/c/about-CCCCCCCC.js'],
      BUILD,
    );
    expect(files.has('sw/c/blog-slug-AAAAAAAA.js')).toBe(false);
    expect(files.has('sw/c/blog-slug-BBBBBBBB.js')).toBe(false);
    expect(files.get('sw/c/about-CCCCCCCC.js')).toBe(`sw/c/about-${BUILD}.js`);
    expect(diagnostics.map((d) => d.code)).toEqual([FUD_NAME_COLLISION]);
    expect(diagnostics[0]?.message).toContain('sw/c/blog-slug-AAAAAAAA.js and sw/c/blog-slug-BBBBBBBB.js');
  });

  it('an empty input is an empty plan, not an error', () => {
    expect(planRename([], BUILD)).toEqual({ files: new Map(), diagnostics: [] });
  });
});

describe('rewriteReferences', () => {
  it('rewrites a require, an import and the sourceMappingURL in one pass', () => {
    const { files } = planRename(['sw/c/site-nav-Bq-vwUs5.js'], BUILD);
    const code = [
      'const n = require("./site-nav-Bq-vwUs5.js");',
      'import x from "../site-nav-Bq-vwUs5.js";',
      '//# sourceMappingURL=site-nav-Bq-vwUs5.js.map',
    ].join('\n');
    const out = rewriteReferences(code, files);
    expect(out).toContain(`require("./site-nav-${BUILD}.js")`);
    expect(out).toContain(`from "../site-nav-${BUILD}.js"`);
    expect(out).toContain(`sourceMappingURL=site-nav-${BUILD}.js.map`);
    // Same length in, same length out: no offset moved, so the map still describes it.
    expect(out).toHaveLength(code.length);
  });

  it('leaves a file that is not in the plan alone', () => {
    const { files } = planRename(['sw/c/about-o23EwdAA.js'], BUILD);
    const code = 'import { t } from "../element-Czbkvc-4.js";';
    expect(rewriteReferences(code, files)).toBe(code);
  });
});

describe('mapNameOf', () => {
  it('names the map beside its chunk', () => {
    expect(mapNameOf(`sw/c/about-${BUILD}.js`)).toBe(`sw/c/about-${BUILD}.js.map`);
  });
});

describe('chunkNameOf', () => {
  it('strips the directory and the hash, dashes in either included', () => {
    expect(chunkNameOf('sw/c/blog-slug-N9OIQ_Kf.js')).toBe('blog-slug');
    expect(chunkNameOf('sw/c/site-nav-Bq-vwUs5.js')).toBe('site-nav');
    expect(chunkNameOf('about-o23EwdAA.js')).toBe('about');
  });

  it('returns null for anything that is not a hashed chunk name', () => {
    expect(chunkNameOf('fudic-sw.js')).toBeNull();
    expect(chunkNameOf('sw/c/about.js')).toBeNull();
    expect(chunkNameOf('logo.svg')).toBeNull();
  });
});

describe('the manifest test helper', () => {
  // It is a helper, but one that must FAIL rather than return something plausible: a
  // build that emitted no manifest has to look different from one that emitted an empty
  // one, or every test downstream reports the wrong cause.
  it('says so when the build emitted no manifest, and when a pattern is unknown', () => {
    expect(() => manifestFile([])).toThrow('fudic-routes.json');
    const output = [
      {
        type: 'asset',
        fileName: 'fudic-routes.json',
        source: JSON.stringify({ build: BUILD, base: '/', csp: {}, routes: [] }),
      },
    ];
    expect(() => renderUrlOf(output, '/nope')).toThrow('/nope');
  });
});

describe('chunkNamesOf', () => {
  it('maps a topological list, preserving its order', () => {
    expect(
      chunkNamesOf(['sw/c/app-badge-BtWdjIM9.js', 'sw/c/site-nav-Bq-vwUs5.js']),
    ).toEqual(['app-badge', 'site-nav']);
  });

  it('drops what it cannot name rather than emitting a mangled one', () => {
    expect(chunkNamesOf(['sw/c/app-badge-BtWdjIM9.js', 'fudic-sw.js'])).toEqual(['app-badge']);
  });
});
