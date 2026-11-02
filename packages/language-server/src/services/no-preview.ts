/**
 * Definitions without VS Code's preview (SDD-75, Pedro 2026-11-02).
 *
 * Holding Ctrl over a name, VS Code adds to the hover the source lines of its definition: the
 * `targetRange` of the link, read from the target file. Every name of a `.fud`, a `.fudspec` and
 * a `.fudapi` already has a hover that says what it is, so the card showed the same thing twice.
 * An empty `targetRange` at the start of the name leaves the preview nothing to show; Ctrl+Click
 * still lands where it did, on `targetSelectionRange`.
 */

import type { LanguageServicePlugin } from '@volar/language-service';
import type { LocationLink } from 'vscode-languageserver-protocol';

/** The links with no lines to preview: `targetRange` collapsed onto where the name starts. */
export function withoutPreview(links: readonly LocationLink[] | null | undefined): LocationLink[] | null | undefined {
  if (links === null || links === undefined) return links;
  return links.map((link) => {
    const at = link.targetSelectionRange.start;
    return { ...link, targetRange: { start: at, end: at } };
  });
}

/** Every plugin, its definitions without preview. */
export function definitionsWithoutPreview(plugins: readonly LanguageServicePlugin[]): LanguageServicePlugin[] {
  return plugins.map((plugin) => ({
    ...plugin,
    create(context) {
      const instance = plugin.create(context);
      const definition = instance.provideDefinition?.bind(instance);
      // A client without links gets a Location made of `targetRange`: collapsed, it would select
      // nothing. Only a client that reads `targetSelectionRange` — VS Code — previews anything.
      const links = context.env.clientCapabilities?.textDocument?.definition?.linkSupport === true;
      if (definition === undefined || !links) return instance;
      return {
        ...instance,
        async provideDefinition(document, position, token) {
          return withoutPreview(await definition(document, position, token));
        },
      };
    },
  }));
}
