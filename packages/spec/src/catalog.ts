/**
 * The vocabulary of a `.fudspec`: the term modules of every root, by block. There is no index
 * and no manifest — the directory listing is the vocabulary. Roots are tried in order and the
 * first that has `<block>/<term>.js` wins whole: a workspace term replaces the framework's, it
 * is never merged with it.
 *
 * A catalog is a snapshot: each module is read once. Whoever watches the files makes a new one
 * when a term changes.
 */

import type { BlockKind } from './ast.js';
import { readTermModule, unreadableTermModule, type Layer, type TermModule } from './term-module.js';

/** A folder of term modules (`given/`, `when/`, `then/` inside it). */
export interface TermRoot {
  readonly layer: Layer;
  /** Absolute. */
  readonly path: string;
}

/** The file system the catalog reads, injected so it can be checked without a disk. */
export interface SpecFs {
  /** File names in a directory; empty when it does not exist. */
  readDirectory(path: string): readonly string[];
  /** The text of a file; undefined when it cannot be read. */
  readFile(path: string): string | undefined;
}

export interface TermCatalog {
  /** The first module that resolves `<block>/<name>.js`, in layer order. */
  resolve(block: BlockKind, name: string): TermModule | undefined;
  /** Every term of a block, for an error and for completion: one per name, sorted by name. */
  list(block: BlockKind): readonly TermModule[];
}

const MODULE = /\.js$/u;

export function createTermCatalog(roots: readonly TermRoot[], fs: SpecFs): TermCatalog {
  const modules = new Map<string, TermModule>();

  const folder = (root: TermRoot, block: BlockKind): string => `${root.path.replace(/[\\/]+$/u, '')}/${block}`;
  const files = (root: TermRoot, block: BlockKind): readonly string[] =>
    fs.readDirectory(folder(root, block)).filter((file) => MODULE.test(file));

  const load = (root: TermRoot, block: BlockKind, file: string): TermModule => {
    const path = `${folder(root, block)}/${file}`;
    const known = modules.get(path);
    if (known !== undefined) return known;
    const source = fs.readFile(path);
    const module =
      source === undefined
        ? unreadableTermModule(path, root.layer, block)
        : readTermModule(source, path, root.layer, block);
    modules.set(path, module);
    return module;
  };

  return {
    resolve(block, name) {
      const file = `${name}.js`;
      const root = roots.find((r) => files(r, block).includes(file));
      return root === undefined ? undefined : load(root, block, file);
    },
    list(block) {
      const byName = new Map<string, TermModule>();
      for (const root of roots) {
        for (const file of files(root, block)) {
          const name = file.replace(MODULE, '');
          if (!byName.has(name)) byName.set(name, load(root, block, file));
        }
      }
      return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
  };
}
