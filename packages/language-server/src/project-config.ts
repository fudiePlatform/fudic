/**
 * The `fudic.json` of each workspace folder (SDD-41 §3.3).
 *
 * One per folder, read at `initialize` and kept current through the channel that already
 * maintains the index — `didChangeWatchedFiles`, not a second one. The editor uses it for
 * exactly one thing: what the `component` snippet PROPOSES as a tag. Nothing is checked
 * against it and no `.fud` gains a diagnostic from it (§4.8).
 *
 * Three readers of the same file is how the editor and the build end up with two ideas of
 * what the prefix is, so this one calls `readProjectConfig` like the other two.
 */

import { readProjectConfig, tagOf, type ProjectConfig } from '@fudic/config';
import { toPosix } from './paths.js';
import type { FileSystemScanner } from './types.js';

/** What the snippet proposes when the project declares no prefix — the literal of today. */
export const DEFAULT_COMPONENT_TAG = 'app-button';

export class ProjectConfigs {
  readonly #scanner: FileSystemScanner;
  /** Folder (POSIX, no trailing slash) → what its `fudic.json` declares. */
  readonly #byRoot = new Map<string, ProjectConfig | null>();

  constructor(scanner: FileSystemScanner) {
    this.#scanner = scanner;
  }

  /** Read the configuration of one workspace folder. */
  scan(root: string): void {
    const key = normalize(root);
    this.#byRoot.set(key, this.#read(key));
  }

  /**
   * A `fudic.json` changed on disk: re-read the folder it belongs to.
   *
   * A path that is not one of the known folders' is ignored rather than added — a
   * `fudic.json` deep inside the workspace belongs to a project this server was not
   * opened on, and SDD-44 is what teaches the editor about those.
   */
  invalidate(path: string): void {
    // Any `fudic.json` may be the nearest one of some file: forget them all, they are cheap.
    this.#nearestByDir.clear();
    const root = normalize(path.slice(0, path.lastIndexOf('/')));
    if (!this.#byRoot.has(root)) return;
    this.#byRoot.set(root, this.#read(root));
  }

  /** What governs `path`: the longest workspace folder it sits under. */
  configFor(path: string): ProjectConfig | null {
    const file = toPosix(path);
    let best = '';
    for (const root of this.#byRoot.keys()) {
      if ((file === root || file.startsWith(`${root}/`)) && root.length > best.length) best = root;
    }
    return this.#byRoot.get(best) ?? null;
  }

  /**
   * The tag the `component` skeleton offers as its tabstop for a file under `path`.
   *
   * With no configuration, and with one that declares no prefix, it is the literal this
   * server has always written. It is a tabstop either way: what the user types over it wins.
   */
  componentTagFor(path: string): string {
    const prefix = this.configFor(path)?.prefix ?? '';
    return prefix === '' ? DEFAULT_COMPONENT_TAG : tagOf(prefix, 'button');
  }

  /**
   * The `styles` names a component under `path` may choose in its root template, from the
   * NEAREST `fudic.json` above it — not the workspace folder's: a workspace opened at its root
   * holds several projects, and each component chooses from its own. `null` when no
   * `fudic.json` governs the file, and then nothing is offered and nothing is checked.
   */
  choosableStylesFor(path: string): readonly string[] | null {
    const config = this.#nearest(toPosix(path));
    return config === null ? null : config.styles.map((style) => style.name);
  }

  /** Directory → the config of the nearest `fudic.json` at or above it. Cleared on change. */
  readonly #nearestByDir = new Map<string, ProjectConfig | null>();

  #nearest(file: string): ProjectConfig | null {
    const visited: string[] = [];
    let dir = file.slice(0, file.lastIndexOf('/'));
    let found: ProjectConfig | null = null;
    for (;;) {
      const cached = this.#nearestByDir.get(dir);
      if (cached !== undefined) {
        found = cached;
        break;
      }
      visited.push(dir);
      if (this.#scanner.readFile(`${dir}/fudic.json`) !== undefined) {
        found = this.#read(dir);
        break;
      }
      const up = dir.lastIndexOf('/');
      if (up <= 0) break;
      dir = dir.slice(0, up);
    }
    for (const seen of visited) this.#nearestByDir.set(seen, found);
    return found;
  }

  #read(root: string): ProjectConfig | null {
    // One read, not two: `exists` and `read` would otherwise hit the disk twice for a file
    // this is asked about on every folder of the workspace.
    const source = this.#scanner.readFile(`${root}/fudic.json`);
    if (source === undefined) return null;
    return readProjectConfig(root, { exists: () => true, read: () => source }).config;
  }
}

/** POSIX, and without the trailing slash a workspace folder URI sometimes carries. */
function normalize(root: string): string {
  return toPosix(root).replace(/\/+$/u, '');
}
