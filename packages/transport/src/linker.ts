/**
 * The linker (SDD-20 §4.3): what the browser does with ESM, done by hand, because
 * `import()` is forbidden inside a `ServiceWorkerGlobalScope` and `importScripts()`
 * only works during `install` (which would mean loading all N routes at once).
 *
 * This module is the ONLY place that knows there is no dynamic import. The day
 * Service Workers support it, `createLinker` becomes a three-line wrapper over
 * `import()` and nothing else in the system changes.
 */

export type ModuleExports = Record<string, unknown>;

/** A `require()` of something that was not linked first — a `deps` ordering bug. */
export class LinkError extends Error {
  constructor(
    readonly specifier: string,
    readonly from: string,
  ) {
    super(`fudic: unlinked dependency "${specifier}" required by ${from}`);
    this.name = 'LinkError';
  }
}

export interface LinkerConfig {
  /** Source of a module by URL. Injected (DIP): in production, the routes cache. */
  readonly fetchSource: (url: string) => Promise<string>;
  /** Modules resolved inside the SW itself by bare specifier (e.g. `@fudic/ssr`). */
  readonly builtins?: Readonly<Record<string, ModuleExports>>;
}

export interface Linker {
  /** Link `deps` in order, then `url`. Memoized and global to the SW. */
  link(url: string, deps?: readonly string[]): Promise<ModuleExports>;
  has(url: string): boolean;
  /** Forget everything (a build version change). */
  reset(): void;
}

/**
 * The safety valve (§4.1): can this realm evaluate at all? If a deployment ships
 * `/sw.js` without `'unsafe-eval'`, the SW declares itself useless and never
 * intercepts — the app degrades to server/SSG instead of breaking.
 */
export function canLink(): boolean {
  try {
    return new Function('return 42')() === 42;
  } catch {
    return false;
  }
}

/** Resolve a relative specifier against the URL of the module requiring it. */
function resolveUrl(specifier: string, from: string): string {
  if (!specifier.startsWith('.')) {
    return specifier;
  }
  const base = from.startsWith('http') ? from : `http://fudic.invalid${from}`;
  const resolved = new URL(specifier, base);
  return from.startsWith('http') ? resolved.href : resolved.pathname + resolved.search;
}

export function createLinker(config: LinkerConfig): Linker {
  const builtins = config.builtins ?? {};
  const modules = new Map<string, ModuleExports>(); // GLOBAL to the SW
  const inFlight = new Map<string, Promise<ModuleExports>>();

  const require = (specifier: string, from: string): ModuleExports => {
    const builtin = builtins[specifier];
    if (builtin !== undefined) {
      return builtin;
    }
    const dep = modules.get(resolveUrl(specifier, from));
    if (dep === undefined) {
      throw new LinkError(specifier, from);
    }
    return dep;
  };

  const evaluate = async (url: string): Promise<ModuleExports> => {
    const source = await config.fetchSource(url);
    const module = { exports: {} as ModuleExports };
    // Registered BEFORE running: this is what supports cycles — a module that
    // requires its requirer sees the (still empty) exports object, not undefined.
    modules.set(url, module.exports);
    // `//# sourceURL` is not optional: without it DevTools shows the code as
    // anonymous and debugging a linked chunk is not viable.
    const factory = new Function(
      'exports',
      'require',
      'module',
      `${source}\n//# sourceURL=${url}`,
    ) as (e: ModuleExports, r: (s: string) => ModuleExports, m: { exports: ModuleExports }) => void;
    try {
      factory(module.exports, (specifier: string) => require(specifier, url), module);
    } catch (error) {
      // A module that threw is not a module: unregister it, or the early registration
      // that supports cycles would hand a half-built husk to the next caller.
      modules.delete(url);
      throw error;
    }
    modules.set(url, module.exports); // the module may have reassigned module.exports
    return module.exports;
  };

  const load = (url: string): Promise<ModuleExports> => {
    const done = modules.get(url);
    if (done !== undefined) {
      return Promise.resolve(done);
    }
    const pending = inFlight.get(url);
    if (pending !== undefined) {
      return pending;
    }
    const promise = evaluate(url).finally(() => {
      inFlight.delete(url);
    });
    inFlight.set(url, promise);
    return promise;
  };

  return {
    async link(url: string, deps: readonly string[] = []): Promise<ModuleExports> {
      for (const dep of deps) {
        await load(dep); // IN ORDER: `require` is synchronous, `deps` is topological
      }
      return load(url);
    },
    has(url: string): boolean {
      return modules.has(url);
    },
    reset(): void {
      modules.clear();
      inFlight.clear();
    },
  };
}
