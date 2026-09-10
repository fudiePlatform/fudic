/**
 * The NEUTRAL zone of `@code` reaching both emitted modules (SDD-34 §4.4).
 *
 * It is the half of `@code` that runs on both sides, and until now it reached NEITHER: the
 * emit read it for the `props<T>()` destructuring and the reactive declarations and dropped
 * everything else, so decision 33.c — *imports inside the regions, hoisted at emit* — was true
 * of `@client` alone. That is the shape a form needs: it is written in its own `.ts` and
 * IMPORTED by the view, so that the server renders its values and the client hydrates the very
 * same object.
 */

import { describe, expect, it } from 'vitest';
import {
  emitComponentModule,
  emitComponentClientModule,
  resolveComponents,
} from '../../src/emit/index.js';
import { memoryIo } from './_support.js';

/** Emit both modules of a one-component graph whose `@code` is the given source. */
function both(code: string, template = '<p>x</p>'): { server: string; client: string } {
  const io = memoryIo({
    '/home.fud':
      '<!DOCTYPE html>\n<html><head><link rel="component" href="./m.fud"></head><body></body></html>',
    '/m.fud': `@code {\n${code}\n}\n<m-el>\n  <template shadowrootmode="open">${template}</template>\n</m-el>\n`,
  });
  const graph = resolveComponents('/home.fud', io);
  const comp = graph.components.get('m-el')!;
  return {
    server: emitComponentModule(graph, comp),
    client: emitComponentClientModule(graph, comp),
  };
}

describe('the neutral zone reaches both modules (§4.4)', () => {
  it('hoists a neutral import into the server module and the client chunk', () => {
    const { server, client } = both("  import { userForm } from './user.form.js';");
    const line = "import { userForm } from './user.form.js';";
    expect(server).toContain(line);
    expect(client).toContain(line);
    // At MODULE scope, not inside the function: an import is only legal there.
    expect(server.indexOf(line)).toBeLessThan(server.indexOf('export function render'));
    expect(client.indexOf(line)).toBeLessThan(client.indexOf('customElements.define'));
  });

  it('carries a neutral statement into the body of both', () => {
    const { server, client } = both('  const f = 1;');
    expect(server).toContain('const f = 1;');
    expect(client).toContain('const f = 1;');
    // INSIDE, because it is per render on one side and per instance on the other.
    expect(server.indexOf('const f = 1;')).toBeGreaterThan(server.indexOf('export function render'));
    expect(client.indexOf('const f = 1;')).toBeGreaterThan(client.indexOf('static c($props)'));
  });

  it('keeps source order between neutral statements', () => {
    const { server } = both('  const a = 1;\n  const b = a + 1;');
    expect(server.indexOf('const a = 1;')).toBeLessThan(server.indexOf('const b = a + 1;'));
  });

  it('a side-effect import still travels: it names nothing and does something', () => {
    const { server, client } = both("  import './register.js';");
    expect(server).toContain("import './register.js';");
    expect(client).toContain("import './register.js';");
  });
});

describe('what the emit already writes is not written twice', () => {
  it('a props destructuring stays the emit’s own, with its defaults', () => {
    const { server, client } = both(
      '  const { title, variant = "x" } = props<{ title: string; variant?: string }>();',
    );
    // The emit's shape on each side, and the author's line nowhere.
    expect(server).toContain('const { title, variant = "x" } = props ?? {};');
    expect(server).not.toContain('props<');
    expect(client).not.toContain('props<');
  });

  it('an empty props destructuring is recognised too, though it declares nothing', () => {
    // `const {} = props<Props>()` produces no prop, and it is still the emit's to write:
    // copied into a module it would call a `props` that exists nowhere. What decides is what
    // the reader RECOGNISED, never what it produced.
    const { server, client } = both(
      '  interface Props { a?: string }\n  const {} = props<Props>();',
    );
    expect(server).not.toContain('props<Props>()');
    expect(client).not.toContain('props<Props>()');
  });

  it('a reactive declaration stays inert on the server and is not duplicated', () => {
    const { server } = both('  const n = signal(0);', '<p>@(n())</p>');
    expect(server).toContain('const n = () => (0); // inert signal');
    expect(server.match(/const n = /gu)).toHaveLength(1);
  });

  it('a line mixing a reactive with an ordinary binding keeps its own half', () => {
    const { server } = both('  const helper = 1, n = signal(0);', '<p>@(n())</p>');
    expect(server).toContain('const helper = 1;');
    expect(server).toContain('const n = () => (0); // inert signal');
  });
});

describe('types travel to neither module', () => {
  it('drops a type alias and an interface', () => {
    const { server, client } = both('  type Tone = "a" | "b";\n  interface P { a: string }');
    for (const out of [server, client]) {
      expect(out).not.toContain('type Tone');
      expect(out).not.toContain('interface P');
    }
  });

  it('drops an `import type` whole', () => {
    const { server, client } = both("  import type { Post } from './post.js';");
    for (const out of [server, client]) {
      expect(out).not.toContain('./post.js');
    }
  });

  it('narrows an import that mixes a type specifier with a value one', () => {
    const { server, client } = both("  import { type Post, userForm } from './user.form.js';");
    for (const out of [server, client]) {
      // Rebuilt from the specifiers rather than sliced: cutting the type out textually would
      // take the comma of its neighbour with it.
      expect(out).toContain("import { userForm } from './user.form.js';");
      expect(out).not.toContain('type Post');
    }
  });

  it('keeps a renamed and a default specifier when it narrows', () => {
    const { server } = both("  import base, { type T, a as b } from './x.js';");
    expect(server).toContain("import base, { a as b } from './x.js';");
  });

  it('keeps a string-named import when it narrows (ES2022 arbitrary namespace names)', () => {
    const { server } = both('  import { type T, "a-b" as ab } from \'./x.js\';');
    expect(server).toContain('import { "a-b" as ab } from \'./x.js\';');
  });

  it('narrows down to the default specifier alone', () => {
    const { server } = both("  import base, { type T } from './x.js';");
    expect(server).toContain("import base from './x.js';");
    expect(server).not.toContain('type T');
  });

  it('leaves a namespace import alone: it has nothing to narrow', () => {
    // `import * as ns, { a } from '…'` is not grammatical, so a namespace import never
    // reaches the rebuild — it either travels whole or is a type import and does not travel.
    const { server } = both("  import { type T } from './x.js';\n  import * as ns from './y.js';");
    expect(server).toContain("import * as ns from './y.js';");
    expect(server).not.toContain('./x.js');
  });
});
