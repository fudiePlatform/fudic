import { builtinEnvironments, type Environment } from 'vitest/runtime';

/**
 * The `fudic` environment: happy-dom's globals, as vitest's own `happy-dom` environment sets
 * them, with modules transformed by the plugin's SSR path.
 *
 * That path is what keeps the test, the client and the server in ONE module graph: the plugin
 * erases nothing there, so a `.ts` arrives whole, and a `vi.mock` in the test reaches the
 * module a `?server` imports. What the browser would not receive is checked apart, without
 * running it.
 */
const happy = builtinEnvironments['happy-dom'];

/**
 * The fetch primitives stay Node's (decision 8.1.20). The in-memory server runs in this same
 * scope, and happy-dom's `Response` drops `Set-Cookie` as a browser does with a response a
 * script builds — which would take every cookie a server function sets out of the test.
 */
const KEPT = ['Request', 'Response', 'Headers'] as const;

const environment: Environment = {
  ...happy,
  name: 'fudic',
  viteEnvironment: 'ssr',
  async setup(global: Record<string, unknown>, options) {
    const kept = KEPT.map((name) => [name, global[name]] as const);
    const env = await happy.setup(global, options);
    for (const [name, value] of kept) global[name] = value;
    return env;
  },
};

export default environment;
