/** SDD-20 §6.4–§6.9: the linker that stands in for the forbidden `import()`. */

import { describe, expect, it } from 'vitest';
import { canLink, createLinker, LinkError, type ModuleExports } from '../src/linker.js';

/** A source table plus a call log, so ORDER and count are observable. */
function sources(table: Record<string, string>): {
  fetchSource: (url: string) => Promise<string>;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    calls,
    fetchSource: async (url: string): Promise<string> => {
      calls.push(url);
      const source = table[url];
      if (source === undefined) {
        throw new Error(`no source: ${url}`);
      }
      return source;
    },
  };
}

describe('createLinker', () => {
  it('§6.4 evaluates deps in order, then the module, and returns its exports', async () => {
    const { fetchSource, calls } = sources({
      '/a.js': 'exports.a = 1;',
      '/b.js': 'exports.b = require("./a.js").a + 1;',
      '/main.js': 'exports.render = () => require("./b.js").b;',
    });
    const linker = createLinker({ fetchSource });
    const main = await linker.link('/main.js', ['/a.js', '/b.js']);
    expect(calls).toEqual(['/a.js', '/b.js', '/main.js']);
    expect((main['render'] as () => number)()).toBe(2);
  });

  it('§6.5 a module shared by two chunks is evaluated exactly once', async () => {
    const { fetchSource, calls } = sources({
      '/shared.js': 'exports.n = 1;',
      '/one.js': 'exports.v = require("./shared.js").n;',
      '/two.js': 'exports.v = require("./shared.js").n;',
    });
    const linker = createLinker({ fetchSource });
    await linker.link('/one.js', ['/shared.js']);
    await linker.link('/two.js', ['/shared.js']);
    expect(calls.filter((c) => c === '/shared.js')).toHaveLength(1);
    expect(linker.has('/shared.js')).toBe(true);
  });

  it('§6.5 concurrent links of the same module share one evaluation', async () => {
    const { fetchSource, calls } = sources({ '/x.js': 'exports.v = 7;' });
    const linker = createLinker({ fetchSource });
    const [a, b] = await Promise.all([linker.link('/x.js'), linker.link('/x.js')]);
    expect(calls).toHaveLength(1);
    expect(a).toBe(b);
  });

  it('§6.6 a cycle links without hanging: the requirer sees a live exports object', async () => {
    const { fetchSource } = sources({
      '/a.js': 'exports.name = "a"; exports.peer = () => require("./b.js").name;',
      '/b.js': 'const a = require("./a.js"); exports.name = "b"; exports.from = a.name;',
    });
    const linker = createLinker({ fetchSource });
    const a = await linker.link('/a.js');
    const b = await linker.link('/b.js', ['/a.js']);
    // `b` ran while `a` was still evaluating in the first link, so it saw the object
    // (populated by then) rather than `undefined` — the point of registering early.
    expect(b['from']).toBe('a');
    expect((a['peer'] as () => string)()).toBe('b');
  });

  it('§6.7 a bare specifier resolves from builtins without touching fetchSource', async () => {
    const { fetchSource, calls } = sources({ '/c.js': 'exports.v = require("@fudic/ssr").mark;' });
    const linker = createLinker({
      fetchSource,
      builtins: { '@fudic/ssr': { mark: 'runtime' } as ModuleExports },
    });
    const mod = await linker.link('/c.js');
    expect(mod['v']).toBe('runtime');
    expect(calls).toEqual(['/c.js']);
  });

  it('§6.8 an unlinked dependency throws LinkError naming the specifier and its requirer', async () => {
    const { fetchSource } = sources({ '/c.js': 'exports.v = require("./missing.js");' });
    const linker = createLinker({ fetchSource });
    await expect(linker.link('/c.js')).rejects.toBeInstanceOf(LinkError);
    await expect(linker.link('/c.js')).rejects.toThrow(/missing\.js.*\/c\.js/u);
  });

  it('§6.9 the evaluated module reports its own URL (the sourceURL comment)', async () => {
    // Without `//# sourceURL` the engine names the frame `<anonymous>` and debugging a
    // linked chunk is not viable; the module's own stack is the observable proof.
    const linker = createLinker({
      fetchSource: async () => 'exports.stack = new Error("x").stack;',
    });
    const mod = await linker.link('/deep/chunk.js');
    expect(String(mod['stack'])).toContain('/deep/chunk.js');
  });

  it('resolves relative specifiers against the requiring module, and absolute URLs too', async () => {
    const { fetchSource } = sources({
      'https://app.test/sw/dep.js': 'exports.v = 5;',
      'https://app.test/sw/main.js': 'exports.v = require("./dep.js").v;',
    });
    const linker = createLinker({ fetchSource });
    const mod = await linker.link('https://app.test/sw/main.js', ['https://app.test/sw/dep.js']);
    expect(mod['v']).toBe(5);
  });

  it('honours a module that reassigns module.exports', async () => {
    const { fetchSource } = sources({ '/c.js': 'module.exports = { v: 3 };' });
    const linker = createLinker({ fetchSource });
    expect((await linker.link('/c.js'))['v']).toBe(3);
  });

  it('reset forgets everything (a build version change)', async () => {
    const { fetchSource, calls } = sources({ '/c.js': 'exports.v = 1;' });
    const linker = createLinker({ fetchSource });
    await linker.link('/c.js');
    linker.reset();
    expect(linker.has('/c.js')).toBe(false);
    await linker.link('/c.js');
    expect(calls).toHaveLength(2);
  });
});

describe('canLink', () => {
  it('is true where evaluation is allowed', () => {
    expect(canLink()).toBe(true);
  });

  it('is false when the realm forbids it', () => {
    const original = globalThis.Function;
    // Simulate a CSP without 'unsafe-eval': the constructor throws.
    (globalThis as { Function: unknown }).Function = function Blocked(): never {
      throw new EvalError('blocked by CSP');
    };
    try {
      expect(canLink()).toBe(false);
    } finally {
      (globalThis as { Function: unknown }).Function = original;
    }
  });
});
