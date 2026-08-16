/**
 * SDD-33 §6.16 — the promise this package makes about the browser, measured.
 *
 * The claim is that a route only carries what it uses, and the reason the package
 * is written the way it is — one export per module, no namespace hung off a
 * factory, no module-scope registry — is that a bundler prunes by REACHABLE
 * MODULE. So the measurement is exactly that: from the entry point, follow the
 * export that an app names and see which modules come with it.
 *
 * It reads the sources instead of running a bundler, and that is deliberate: this
 * has to answer the same question on any machine, with no bundler version in the
 * middle. A bundled measurement in bytes is the natural next step, and it belongs
 * where the compiler half already measures chunks per route.
 */

import { describe, expect, it } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const SRC = fileURLToPath(new URL('../src', import.meta.url));
const INDEX = join(SRC, 'index.ts');

/** `import`/`export … from './x.js'`, skipping the type-only ones TypeScript erases. */
const FROM = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?[^;]*?from\s*['"](\.[^'"]+)['"]/g;

/** `export { name } from './path.js'` — what an app actually names. */
const REEXPORT = /export\s*\{\s*([A-Za-z0-9_]+)\s*\}\s*from\s*['"](\.[^'"]+)['"]/g;

const asTs = (from: string, spec: string): string =>
  resolve(dirname(from), spec.replace(/\.js$/, '.ts'));

async function runtimeImports(file: string): Promise<readonly string[]> {
  const code = await readFile(file, 'utf8');
  const out: string[] = [];
  for (const [, typeOnly, spec] of code.matchAll(FROM)) {
    if (typeOnly === undefined && spec !== undefined) {
      out.push(asTs(file, spec));
    }
  }
  return out;
}

/** Every module reachable from a set of entry modules, the way a bundler walks it. */
async function reachable(entries: readonly string[]): Promise<ReadonlySet<string>> {
  const seen = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || seen.has(file)) {
      continue;
    }
    seen.add(file);
    queue.push(...(await runtimeImports(file)));
  }
  return new Set([...seen].map((f) => relative(SRC, f).replace(/\\/g, '/')));
}

/** The export map of the entry point: which module each public name lives in. */
async function exportMap(): Promise<ReadonlyMap<string, string>> {
  const code = await readFile(INDEX, 'utf8');
  const map = new Map<string, string>();
  for (const [, name, spec] of code.matchAll(REEXPORT)) {
    if (name !== undefined && spec !== undefined) {
      map.set(name, asTs(INDEX, spec));
    }
  }
  return map;
}

/** What a route pulls in when it imports these names and nothing else. */
async function routeUsing(names: readonly string[]): Promise<ReadonlySet<string>> {
  const map = await exportMap();
  const entries = names.map((n) => {
    const file = map.get(n);
    if (file === undefined) {
      throw new Error(`"${n}" is not exported from index.ts`);
    }
    return file;
  });
  return reachable(entries);
}

const TYPED = [
  'u8',
  'i8',
  'u16',
  'i16',
  'u32',
  'i32',
  'f32',
  'f64',
  'bool',
  'str',
  'date',
  'arr',
] as const;

describe('the package prunes by route (§6.16)', () => {
  it('exports every public name from its own module', async () => {
    const map = await exportMap();
    const modules = new Set(map.values());
    // One export per module is the whole mechanism: two names sharing a module
    // means importing one drags the other.
    expect(modules.size).toBe(map.size);

    const files = (await readdir(join(SRC, 'typed'))).filter((f) => f.endsWith('.ts'));
    // The twelve factories plus the two they share.
    expect(files).toHaveLength(TYPED.length + 2);
  });

  it('a route with a plain form carries no typed factory and no unused rule', async () => {
    const used = await routeUsing(['form', 'control', 'required']);

    for (const tag of TYPED) {
      expect(used.has(`typed/${tag}.ts`)).toBe(false);
    }
    expect(used.has('typed/range.ts')).toBe(false);
    expect(used.has('typed/typed.ts')).toBe(false);

    for (const rule of ['pattern', 'min', 'max', 'min-length', 'max-length']) {
      expect(used.has(`validators/${rule}.ts`)).toBe(false);
    }
    expect(used.has('validators/server.ts')).toBe(false);

    // And it does carry what it asked for.
    expect(used.has('form.ts')).toBe(true);
    expect(used.has('control.ts')).toBe(true);
    expect(used.has('validators/required.ts')).toBe(true);
  });

  it('adding a rule adds that rule and nothing else', async () => {
    const before = await routeUsing(['form', 'control', 'required']);
    const after = await routeUsing(['form', 'control', 'required', 'pattern', 'min']);

    const added = [...after].filter((f) => !before.has(f)).sort();
    expect(added).toEqual(['validators/min.ts', 'validators/pattern.ts']);
  });

  it('a typed control does not drag the form implementation', async () => {
    const used = await routeUsing(['u8']);

    expect(used.has('typed/u8.ts')).toBe(true);
    expect(used.has('control.ts')).toBe(true);
    expect(used.has('form.ts')).toBe(false);
    expect(used.has('group.ts')).toBe(false);
    for (const tag of TYPED.filter((t) => t !== 'u8')) {
      expect(used.has(`typed/${tag}.ts`)).toBe(false);
    }
  });

  it('a route that imports nothing carries nothing', async () => {
    const used = await reachable([]);
    expect(used.size).toBe(0);
  });

  it('no module in the package has an import-time side effect', async () => {
    const files = await readdir(SRC, { recursive: true, withFileTypes: true });
    for (const entry of files) {
      if (!entry.isFile() || !entry.name.endsWith('.ts')) {
        continue;
      }
      const code = await readFile(join(entry.parentPath, entry.name), 'utf8');
      // A bare `import './x.js'` is imported for effect, which is the one shape
      // `sideEffects: false` would be lying about.
      expect(code).not.toMatch(/(?:^|\n)\s*import\s*['"]/);
    }
  });
});
