/**
 * After the shutdown, no service validates anything.
 *
 * Volar's push model schedules a validation of every open document 250 ms after each edit, and a
 * batch scheduled before the shutdown still runs after it, against TypeScript projects that are
 * already disposed: TypeScript's own service then throws, and Volar logs it as a failure. There
 * is nothing left to validate for, so every service answers nothing.
 */

import type { LanguageServicePlugin } from '@volar/language-service';

/** Every service, with its diagnostics silent once `closed()` says the server shut down. */
export function quietAfterShutdown(plugins: readonly LanguageServicePlugin[], closed: () => boolean): LanguageServicePlugin[] {
  return plugins.map((plugin) => ({
    ...plugin,
    create(context) {
      const instance = plugin.create(context);
      const inner = instance.provideDiagnostics?.bind(instance);
      if (inner === undefined) return instance;
      return {
        ...instance,
        provideDiagnostics: (document, token) => (closed() ? undefined : inner(document, token)),
      };
    },
  }));
}
