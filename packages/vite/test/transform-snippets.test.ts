/**
 * SDD-29 §6.5 — a snippet, through the build.
 *
 * Real files on disk and the real `transformFud`, because what this is about is the seam:
 * the expansion runs inside `resolveDocument`, the components an invoked snippet declares
 * enter the caller's graph, and the file the snippet lives in becomes something the watcher
 * has to know about.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { transformFud } from '../src/transform.js';
import { nodeIo } from '../src/io.js';

let dir: string;

const write = (name: string, source: string): string => {
  const path = join(dir, name);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, source, 'utf8');
  return path;
};

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'fudic-snippets-'));

  write(
    'app-button.fud',
    `<app-button><template shadowrootmode="open"><button><slot></slot></button></template></app-button>`,
  );
  write(
    'app-badge.fud',
    `<app-badge><template shadowrootmode="open"><b><slot></slot></b></template></app-badge>`,
  );
  write(
    'ui.fud',
    `<link rel="component" href="./app-button.fud">
<link rel="component" href="./app-badge.fud">
@snippet action(label: string) { <app-button>@label</app-button> }
@snippet tag(label: string) { <app-badge>@label</app-badge> }`,
  );
  write(
    'card.fud',
    `<link rel="snippet" href="./ui.fud">
<app-card><template shadowrootmode="open">
  <article>@render action("Save")</article>
</template></app-card>`,
  );
});

describe('a component that renders a snippet', () => {
  it('composes the component the snippet declares, which it never declared itself (criterion 21)', () => {
    const result = transformFud(join(dir, 'card.fud'), nodeIo())!;
    expect(result.code).toContain("import { render as renderAppButton } from './app-button.fud';");
    expect(result.code).toContain('renderAppButton(');
  });

  it('does not drag the component of the snippet it did not call (criterion 23)', () => {
    const result = transformFud(join(dir, 'card.fud'), nodeIo())!;
    expect(result.code).not.toContain('app-badge');
  });

  it('names the snippet file as something to watch, since nothing imports it', () => {
    const result = transformFud(join(dir, 'card.fud'), nodeIo())!;
    expect(result.watchFiles).toEqual([join(dir, 'ui.fud')]);
  });

  it('compiles with nothing to report', () => {
    expect(transformFud(join(dir, 'card.fud'), nodeIo())!.diagnostics).toEqual([]);
  });

  it('maps the emitted module back to the file on disk, not to the expanded text', () => {
    const result = transformFud(join(dir, 'card.fud'), nodeIo())!;
    const content = result.map.sourcesContent?.[0] ?? '';
    // The `sourcesContent` is the `.fud` the author opens — `@render` and all.
    expect(content).toContain('@render action("Save")');
    expect(content).not.toContain('<app-button>');
  });
});

describe('the file of snippets itself, handed to the plugin', () => {
  /**
   * Nothing imports a file of snippets, so a build reaches it only sideways — dropped into
   * a routes directory, saved in the editor, imported by hand. Until task 15 that threw a
   * `TypeError` out of the emit: the expansion stripped the declarations, the role stopped
   * being `snippet-document`, and the emitter went looking for the template of a component
   * that was never there.
   */
  it('emits an empty module and does not throw (§4.9)', () => {
    const result = transformFud(join(dir, 'ui.fud'), nodeIo())!;
    expect(result.code).toBe('');
    expect(result.diagnostics).toEqual([]);
  });
});

describe('a snippet whose body does not add up', () => {
  it('reports it in the SNIPPET file and not in the page (criterion 34)', () => {
    write('broken.fud', '@snippet oops() { @render missing() }');
    const path = write(
      'uses-broken.fud',
      `<link rel="snippet" href="./broken.fud">
<app-broken><template shadowrootmode="open">@render oops()</template></app-broken>`,
    );
    const diagnostics = transformFud(path, nodeIo())!.diagnostics;
    expect(diagnostics.map((d) => d.code)).toEqual(['FUD0826']);
    expect(diagnostics[0]!.file).toBe(join(dir, 'broken.fud'));
  });
});
