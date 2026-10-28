/**
 * The registry of implementations (SDD-60 §3.12, §4.4).
 *
 * Every piece a `.fudapi` declares that the developer implements — a function, `load`, a rule,
 * a middleware half — owns one `Slot`. `.handle(fn)`, `.check(fn)`, `.client(fn)` and
 * `.server(fn)` fill it when the developer's module is evaluated. The generated root loads the
 * two folders file by file, and says before each one which folder it comes from: that is what
 * lets a slot refuse a second implementation, or one in the wrong folder, naming both files.
 *
 * It lives here and not in `@fudic/http` because the rules of a form register too, and
 * `@fudic/http` depends on this package, not the other way round. `@fudic/http/contract`
 * re-exports it: there is one registry per process.
 */

/** Which folder an implementation belongs in: `src/server` or `src/browser`. */
export type Side = 'server' | 'browser';

/** The folders of the project, by side (`fudic.json` may move them). */
const folders: Record<Side, string> = { server: 'src/server', browser: 'src/browser' };

/** The file being loaded, and the folder it comes from. */
let current: { readonly side: Side; readonly file: string } | undefined;

/** Every slot created, so a reload can empty them all. */
const slots = new Set<Slot<unknown>>();

/** Where the two folders are. The generated root calls it once, before loading anything. */
export function setFolders(dirs: Readonly<Record<Side, string>>): void {
  folders.server = dirs.server;
  folders.browser = dirs.browser;
}

/** The folder of a side, as the project names it. */
export const folderOf = (side: Side): string => folders[side];

/** The root is about to evaluate `file`, from the folder of `side`; `undefined` once it is done. */
export function loadingFile(side: Side, file: string): void;
export function loadingFile(done: undefined): void;
export function loadingFile(side: Side | undefined, file?: string): void {
  current = side === undefined ? undefined : { side, file: file! };
}

/** The last implementation refused, until somebody asks for it. */
let refused: Error | undefined;

const refuse = (message: string): Error => {
  refused = new Error(message);
  return refused;
};

/**
 * The implementation the registry refused last, once: what the root throws when loading a file
 * failed. The error that reaches the root is not always this one — a bundler wraps a dynamic
 * `import()` in a preload helper that, on a server, fails on a browser global of its own — and the
 * registry's message is the one that names the two files.
 */
export function takeRefusal(): Error | undefined {
  const error = refused;
  refused = undefined;
  return error;
}

/** The load of the root before, so the next one waits for it. */
let turn: Promise<unknown> = Promise.resolve();

/**
 * Runs `load` once every root asked before has finished loading. Two roots in one process —
 * one per locale of an app with languages (SDD-60 §4.4) — would otherwise interleave their
 * files, and the folder the registry was told about would be the other root's.
 */
export function inTurn(load: () => Promise<void>): Promise<void> {
  const mine = turn.then(load);
  turn = mine.catch(() => undefined);
  return mine;
}

/**
 * Every root asked so far, loaded or failed. A call waits for it before it reads a slot: the
 * browser root loads its folder with dynamic imports, and a click that lands first would find
 * the client half of its chain still empty.
 */
export const settled = (): Promise<unknown> => turn;

/** Empties every slot: what a dev reload does before loading the folders again. */
export function resetRegistry(): void {
  for (const slot of slots) slot.clear();
}

/** One implementable piece: `save of components/user-form`, and the folder it belongs in. */
export class Slot<F> {
  #fn: F | undefined;
  #at = '';

  /**
   * @param label  what errors call it: `save of components/user-form`.
   * @param side   the folder its implementation goes in.
   * @param never  the browser variant of a server piece: no implementation is possible here.
   */
  constructor(
    readonly label: string,
    readonly side: Side,
    private readonly never = false,
  ) {
    slots.add(this as Slot<unknown>);
  }

  /** Registers the implementation, refusing a second one and one from the wrong folder. */
  set(fn: F): void {
    const here = current;
    if (this.never || (here !== undefined && here.side !== this.side)) {
      const where = here === undefined ? '' : `: ${here.file}`;
      throw refuse(`${this.label} must be implemented in ${folders[this.side]}${where}`);
    }
    const at = here?.file ?? 'outside the folders';
    if (this.#fn !== undefined) throw refuse(`${this.label} is implemented twice: ${this.#at}, ${at}`);
    this.#fn = fn;
    this.#at = at;
  }

  /** The implementation, or `undefined` when nobody wrote one. */
  get(): F | undefined {
    return this.#fn;
  }

  /** What a request without an implementation is told: `… has no implementation in src/server`. */
  missing(): string {
    return `${this.label} has no implementation in ${folders[this.side]}`;
  }

  clear(): void {
    this.#fn = undefined;
    this.#at = '';
  }
}
