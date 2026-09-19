/**
 * SDD-29, task 15 — the canonical fixtures, through the real pipeline.
 *
 * The other suites of this SDD build their inputs in the test, which is how a rule is
 * measured in isolation. This one reads the files a developer would write, off disk, and
 * runs what every host runs: `resolveDocument`, which expands, and then the emit.
 *
 * `app-panel.fud` holds the four cases of task 15 in one file — a local declaration, an
 * import with no `as`, an import with `as`, and a snippet that instantiates a component the
 * caller never declared — so what is verified here is that they compose, not that each one
 * works alone.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { emitComponentModule, resolveDocument, type ComponentGraph } from '../../src/emit/index.js';
import type { ResolveIo } from '../../src/types/index.js';

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), '../../fixtures');

const io: ResolveIo = {
  read: (path) => readFileSync(path, 'utf8'),
  resolve: (from, href) => resolve(dirname(from), href),
};

const PANEL = join(fixtures, 'app-panel.fud');

const graphOf = (path: string) => resolveDocument(path, io);

/** The module the build ships for a component entry. */
function moduleOf(graph: ComponentGraph, path: string): string {
  const entry = graph.entry;
  if (entry.type !== 'component-document') throw new Error(`role: ${entry.type}`);
  return emitComponentModule(graph, {
    tag: entry.name,
    path,
    source: graph.entrySource,
    doc: entry,
    deps: graph.entryDeps,
  });
}

describe('app-panel.fud — the four cases in one component', () => {
  it('resolves and expands with nothing to report', () => {
    expect(graphOf(PANEL).diagnostics).toEqual([]);
  });

  it('leaves no snippet and no call in the text the emit reads (criterion 3)', () => {
    // The expansion works by writing the source the author would have written, so the
    // absence is checked where it is decided: in the text the second parse reads.
    const source = graphOf(PANEL).value.entrySource;
    expect(source).not.toContain('@snippet');
    expect(source).not.toContain('@render');
  });

  it('writes the body of each snippet in the place its call stood', () => {
    const source = graphOf(PANEL).value.entrySource;
    // The local declaration, invoked from inside a `@foreach`: the argument is the loop's
    // own variable, resolved in the scope the markup landed in (criterion 14).
    expect(source).toContain('data-id=@r.id');
    expect(source).toContain('@if ((r.label).length > 12)');
    // Imported with no `as`, twice: one call takes the default, the other overrides it.
    expect(source).toContain(".variant=@('primary')");
    expect(source).toContain(".variant=@('ghost')");
    // Imported under a namespace: a second `action`, and no collision with the first.
    expect(source).toContain('<button class="form-action"');
    expect(source).toContain('<label class="field">');
  });

  it('is byte for byte the markup written by hand (criterion 4)', () => {
    const source = graphOf(PANEL).value.entrySource;
    // The one call with no interpolation of its own: what a hand-written `app-button`
    // looks like at that spot, and the expansion produces exactly it.
    expect(source).toContain(`<app-button .variant=@('ghost')>@("Cancelar")</app-button>`);
  });

  it('drags the component the invoked snippet declares (criterion 21)', () => {
    // `app-button` is never declared by a call site of its own here: it arrives because
    // `action` instantiates it and `ui-helpers.fud` declares it.
    expect([...graphOf(PANEL).value.components.keys()]).toContain('app-button');
  });

  it('resolves it once, though caller and snippet both declare it (criterion 22)', () => {
    const module = moduleOf(graphOf(PANEL).value, PANEL);
    // One import, not two: the two declarations resolve to the same file and the same tag.
    const imports = module
      .split('\n')
      .filter((line) => line.startsWith('import ') && line.includes('app-button'));
    expect(imports).toHaveLength(1);
  });

  it('does not drag the component of the snippet it never called (criterion 23)', () => {
    // `ui-helpers.fud` declares `app-badge` for its `tag` snippet, which nobody calls.
    const graph = graphOf(PANEL).value;
    expect([...graph.components.keys()]).not.toContain('app-badge');
    expect(moduleOf(graph, PANEL)).not.toContain('app-badge');
  });

  it('consumes both snippet links: neither reaches the module (criterion 20)', () => {
    const module = moduleOf(graphOf(PANEL).value, PANEL);
    expect(module).not.toContain('snippet');
    expect(module).not.toContain('ui-helpers');
    expect(module).not.toContain('form-helpers');
  });

  it('names both snippet files as files to watch, since nothing imports them', () => {
    const files = graphOf(PANEL).value.snippetFiles;
    expect([...files].sort()).toEqual(
      [join(fixtures, 'form-helpers.fud'), join(fixtures, 'ui-helpers.fud')].sort(),
    );
  });
});

describe('the files of snippets themselves', () => {
  it.each(['ui-helpers.fud', 'form-helpers.fud'])(
    '%s is a document of snippets, not a component missing its wrapper (criterion 32)',
    (name) => {
      // The expansion does not touch one (§4.9), which is what keeps the role: stripping the
      // declarations would leave a component with no host wrapper and an FUD0156 its author
      // cannot act on.
      const result = graphOf(join(fixtures, name));
      expect(result.diagnostics).toEqual([]);
      expect(result.value.entry.type).toBe('snippet-document');
    },
  );
});
