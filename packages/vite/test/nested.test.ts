/**
 * BUG-05 §4.3: what a nested build's output becomes on the way to the bundle.
 *
 * The two nested builds always produce the plain map and this module composes the host's
 * four modes from it — one code path inside, four outside. These are the branches that
 * decide whether `sourcemap: 'hidden'` really hides and whether a comment can end up
 * written twice.
 */

import { describe, it, expect } from 'vitest';
import { emitPlan, serializeMap, stripSourceMappingURL } from '../src/nested.js';

const MAP = '{"version":3,"sources":["a.fud"],"mappings":"AAAA"}';
const artifact = { fileName: 'sw/c/page-abc.js', code: 'const x = 1;', map: MAP };

describe('serializeMap', () => {
  it('passes a string through and stringifies an object', () => {
    // Rollup hands back a `SourceMap` instance, Rolldown a plain object, a plugin a string.
    expect(serializeMap(MAP)).toBe(MAP);
    expect(serializeMap({ version: 3 })).toBe('{"version":3}');
  });

  it('is nothing when the build produced no map', () => {
    expect(serializeMap(undefined)).toBeUndefined();
    expect(serializeMap(null)).toBeUndefined();
  });
});

describe('stripSourceMappingURL', () => {
  it('drops a trailing comment, so the host mode is the only one that speaks', () => {
    expect(stripSourceMappingURL('const x = 1;\n//# sourceMappingURL=x.js.map')).toBe('const x = 1;');
    expect(stripSourceMappingURL('const x = 1;\n//# sourceMappingURL=x.js.map  ')).toBe('const x = 1;');
  });

  it('leaves code that has none alone', () => {
    expect(stripSourceMappingURL('const x = 1;')).toBe('const x = 1;');
    // Not trailing: it is part of the program, not the bundler's footer.
    const middle = '//# sourceMappingURL=x.map\nconst x = 1;';
    expect(stripSourceMappingURL(middle)).toBe(middle);
  });
});

describe('emitPlan', () => {
  it('`false` emits neither comment nor map — the default of Vite, and not ours to change', () => {
    expect(emitPlan(artifact, false)).toEqual({ code: 'const x = 1;' });
  });

  it('a build with no map emits none, whatever the mode says', () => {
    expect(emitPlan({ fileName: 'a.js', code: 'x' }, true)).toEqual({ code: 'x' });
  });

  it('`true` points at the map by BASE name: the URL resolves against its own directory', () => {
    const plan = emitPlan(artifact, true);
    expect(plan.code).toBe('const x = 1;\n//# sourceMappingURL=page-abc.js.map\n');
    expect(plan.map).toEqual({ fileName: 'sw/c/page-abc.js.map', source: MAP });
  });

  it('`hidden` emits the map and no comment', () => {
    const plan = emitPlan(artifact, 'hidden');
    expect(plan.code).toBe('const x = 1;');
    expect(plan.map).toEqual({ fileName: 'sw/c/page-abc.js.map', source: MAP });
  });

  it('`inline` emits the data URI and no second file', () => {
    const plan = emitPlan(artifact, 'inline');
    expect(plan.map).toBeUndefined();
    const encoded = plan.code.split('base64,')[1]!.trim();
    expect(Buffer.from(encoded, 'base64').toString('utf8')).toBe(MAP);
  });

  it('never stacks two comments on a code the inner build already annotated', () => {
    const annotated = { ...artifact, code: 'const x = 1;\n//# sourceMappingURL=page-abc.js.map' };
    expect(emitPlan(annotated, true).code).toBe('const x = 1;\n//# sourceMappingURL=page-abc.js.map\n');
  });
});
