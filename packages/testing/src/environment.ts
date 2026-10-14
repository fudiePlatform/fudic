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
const environment: Environment = {
  ...builtinEnvironments['happy-dom'],
  name: 'fudic',
  viteEnvironment: 'ssr',
};

export default environment;
