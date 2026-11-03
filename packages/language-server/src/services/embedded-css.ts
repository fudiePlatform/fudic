/**
 * The CSS service, inside a `.fud` and nowhere else.
 *
 * The server opens a project's plain `.css` too, so that `var(--` offers the tokens there. But
 * the editor already has a CSS service for a `.css` — VS Code's own — and Volar's answering
 * there as well is every completion, hover and colour twice. Inside a `.fud` it is the only one,
 * so there it stays.
 *
 * A document is the `<style>` of a `.fud` when its URI is an embedded one: Volar hands every
 * virtual code over under `volar-embedded-content://`, and a plain file never.
 */

import type { LanguageServicePlugin, LanguageServicePluginInstance } from '@volar/language-service';
import { URI } from 'vscode-uri';

/** `plugin`, silent over any document that is not embedded in another. */
export function embeddedOnly(plugin: LanguageServicePlugin): LanguageServicePlugin {
  return {
    ...plugin,
    create(context) {
      const instance = plugin.create(context);
      const wrapped: Record<string, unknown> = { ...instance };
      for (const [key, value] of Object.entries(instance)) {
        // Every `provide…` of an instance takes the document first; the rest is lifecycle.
        if (!key.startsWith('provide') || typeof value !== 'function') continue;
        wrapped[key] = (document: { readonly uri: string }, ...rest: unknown[]): unknown =>
          context.decodeEmbeddedDocumentUri(URI.parse(document.uri)) === undefined
            ? undefined
            : (value as (...args: unknown[]) => unknown).call(instance, document, ...rest);
      }
      return wrapped as LanguageServicePluginInstance;
    },
  };
}
