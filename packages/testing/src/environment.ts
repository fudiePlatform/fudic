import { builtinEnvironments, type Environment } from 'vitest/runtime';
import { RENEW_WINDOW } from './constants.js';

/**
 * The `fudic` environment: happy-dom's globals, as vitest's own `happy-dom` environment sets
 * them, with modules transformed by the plugin's SSR path.
 *
 * That path is what keeps the test, the client and the server in ONE module graph: the plugin
 * erases nothing there, so a `.ts` arrives whole, and a `vi.mock` in the test reaches the
 * module a handler of `src/server` imports. What the browser would not receive is checked apart, without
 * running it.
 */
const happy = builtinEnvironments['happy-dom'];

/**
 * The fetch primitives stay Node's (decision 8.1.20). The in-memory server runs in this same
 * scope, and happy-dom's `Response` drops `Set-Cookie` as a browser does with a response a
 * script builds — which would take every cookie a server function sets out of the test.
 */
const KEPT = ['Request', 'Response', 'Headers'] as const;

type Opened = Awaited<ReturnType<typeof happy.setup>>;

/** happy-dom's globals on `global`, with Node's fetch primitives put back over its own. */
async function open(global: Record<string, unknown>, options: Parameters<typeof happy.setup>[1]): Promise<Opened> {
  const kept = KEPT.map((name) => [name, global[name]] as const);
  const env = await happy.setup(global, options);
  for (const [name, value] of kept) global[name] = value;
  return env;
}

const environment: Environment = {
  ...happy,
  name: 'fudic',
  viteEnvironment: 'ssr',
  async setup(global: Record<string, unknown>, options) {
    let current = await open(global, options);
    const scope = global as Record<PropertyKey, unknown>;
    scope[RENEW_WINDOW] = async (): Promise<void> => {
      await current.teardown(global);
      current = await open(global, options);
    };
    return {
      // The window open when the worker ends, which is the last one `renew` opened.
      async teardown(at: Record<string, unknown>) {
        delete (at as Record<PropertyKey, unknown>)[RENEW_WINDOW];
        await current.teardown(at);
      },
    };
  },
};

export default environment;
