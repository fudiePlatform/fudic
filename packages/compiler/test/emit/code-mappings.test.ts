/**
 * BUG-31 — the code of `@code` is made of MAPPED lines.
 *
 * This is the bug underneath the other two. The author's statements all went out through
 * `w.line(statement.text)`, which carries no anchor at all — so the emit returned ZERO
 * mappings for the author's own code, in every file, always, and nothing detected it: the
 * map was still a valid Source Map v3, still served with a 200, and still described nothing
 * but the markup.
 *
 * What is asserted here is the pair a debugger needs: a mapping that lands inside the
 * statement, and a name it can resolve — in the server module for the server cut the markup
 * reads (SDD-60 §4.8), in the client chunk for the whole `@code`.
 */
import { describe, expect, it } from 'vitest';
import {
  resolveComponents,
  emitComponentModuleMapped,
  emitComponentClientModuleMapped,
  type ComponentGraph,
  type EmitMapping,
} from '../../src/emit/index.js';
import { memoryIo } from './_support.js';

const SOURCE = `@code {
  import { signal } from '@fudic/core';

  const { label = 'hi' } = props<{ label?: string }>();

  const shouted = label.trim();

  function serverCut() { return label.toUpperCase(); }

  const browserOnly = label.toLowerCase();

  const count = signal(0);
  const inc = () => count.set(count() + browserOnly.length);
}

<app-counter>
  <template shadowrootmode="open">
    <p>@shouted @serverCut()</p>
    <button @click=@inc()>@count()</button>
  </template>
</app-counter>
`;

function graphOf(): ComponentGraph {
  return resolveComponents(
    '/page.fud',
    memoryIo({
      '/page.fud':
        '<link rel="component" href="./app-counter.fud">\n' +
        '<html><head></head><body><app-counter></app-counter></body></html>\n',
      '/app-counter.fud': SOURCE,
    }),
  );
}

const graph = graphOf();
const component = graph.components.get('app-counter')!;
const server = emitComponentModuleMapped(graph, component);
const client = emitComponentClientModuleMapped(graph, component);

/** The names carried by a run of mappings, deduplicated. */
const namesOf = (mappings: readonly EmitMapping[]): string[] => [
  ...new Set(mappings.map((m) => m.name).filter((n): n is string => n !== undefined)),
];

/** Whether any mapping points into the `.fud` span of `text`. */
function mapsInto(mappings: readonly EmitMapping[], text: string): boolean {
  const start = SOURCE.indexOf(text);
  expect(start).toBeGreaterThan(-1);
  return mappings.some((m) => m.sourceOffset >= start && m.sourceOffset < start + text.length);
}

describe('the server module maps the code the author wrote', () => {
  it('returns mappings at all — before this it returned none, in every file', () => {
    expect(server.mappings.length).toBeGreaterThan(0);
  });

  it('maps into the server cut', () => {
    // The `props<…>()` line is consumed by the extraction, so the statement of the cut that
    // actually reaches the output is the one below it.
    expect(mapsInto(server.mappings, 'const shouted = label.trim();')).toBe(true);
    expect(mapsInto(server.mappings, 'function serverCut() { return label.toUpperCase(); }')).toBe(true);
  });

  it('carries the names a console needs to resolve a binding', () => {
    // A function of the cut is copied verbatim and keeps its identifiers; a `const` is rebuilt
    // from its surviving declarators and anchors at the statement alone.
    expect(namesOf(server.mappings)).toContain('serverCut');
  });

  it('does NOT map what the markup does not read: that code is not in this file', () => {
    expect(mapsInto(server.mappings, 'const browserOnly = label.toLowerCase();')).toBe(false);
    expect(server.code).not.toContain('browserOnly');
  });

  it('every source offset is inside the `.fud`, which is what makes the map resolvable', () => {
    for (const m of server.mappings) {
      expect(m.sourceOffset).toBeGreaterThanOrEqual(0);
      expect(m.sourceOffset).toBeLessThanOrEqual(SOURCE.length);
    }
  });

  it('every generated offset is inside the emitted code', () => {
    for (const m of server.mappings) {
      expect(m.generatedOffset).toBeGreaterThanOrEqual(0);
      expect(m.generatedOffset).toBeLessThanOrEqual(server.code.length);
    }
  });
});

describe('the client chunk maps the whole `@code`', () => {
  it('returns mappings at all', () => {
    expect(client.mappings.length).toBeGreaterThan(0);
  });

  it('maps into the browser code', () => {
    expect(mapsInto(client.mappings, 'const count = signal(0);')).toBe(true);
    expect(mapsInto(client.mappings, 'const browserOnly = label.toLowerCase();')).toBe(true);
  });

  it('names the bindings of the browser code, which is where the debugger is used', () => {
    const names = namesOf(client.mappings);
    expect(names).toContain('count');
    expect(names).toContain('inc');
    expect(names).toContain('signal');
    expect(names).toContain('browserOnly');
  });
});

describe('a name resolves back to itself in the `.fud`', () => {
  it('for every named mapping of both branches', () => {
    // The one check that catches an offset measured against the wrong text: read the name
    // back out of the source where the mapping says it is.
    for (const mappings of [server.mappings, client.mappings]) {
      for (const m of mappings) {
        if (m.name === undefined) continue;
        expect(SOURCE.slice(m.sourceOffset, m.sourceOffset + m.name.length)).toBe(m.name);
      }
    }
  });
});

describe('a component with no `@code` maps its markup and claims no names', () => {
  it('emits a map that is honest about having nothing of the author’s to say', () => {
    const bare = resolveComponents(
      '/page.fud',
      memoryIo({
        '/page.fud':
          '<link rel="component" href="./app-bare.fud">\n' +
          '<html><head></head><body><app-bare></app-bare></body></html>\n',
        '/app-bare.fud': '<app-bare>\n  <template shadowrootmode="open"><p>hi</p></template>\n</app-bare>\n',
      }),
    );
    const out = emitComponentModuleMapped(bare, bare.components.get('app-bare')!);
    expect(namesOf(out.mappings)).toEqual([]);
  });
});
