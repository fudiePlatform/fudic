/**
 * The project's style guide, from the build's point of view (SDD-42 §3.2).
 *
 * The plugin is the one that owns a filesystem, so it is the plugin that turns the
 * `styles` of `fudic.json` into sheets the emit can hoist. The compiler receives them
 * already read, through `EmitOptions.projectStyles`, and never opens a `.css` — which is
 * the same seam a component's linked assets travel over.
 *
 * Both diagnostics are errors, and the reason is that neither has a correct degraded
 * behaviour. A sheet that is not there and a sheet that cannot be told from another are
 * both a document rendered with styles the author did not write — silently, because a
 * missing stylesheet looks exactly like a stylesheet that did nothing.
 */

import type { ProjectStyle } from '@fudic/compiler';
import {
  readProjectStyles,
  type ConfigDiagnostic,
  type ConfigIo,
  type ProjectConfig,
} from '@fudic/config';

export interface StylesResult {
  /** In adoption order. Empty for a project with no `fudic.json` or no `styles`. */
  readonly styles: readonly ProjectStyle[];
  /** Fatal: the document would render with styles nobody declared (§4.1). */
  readonly errors: readonly ConfigDiagnostic[];
}

/** Resolve and read `<root>/<entry>` for every `styles` entry of the project. */
export function readStyles(
  root: string,
  config: ProjectConfig | null,
  io: ConfigIo,
): StylesResult {
  if (config === null || config.styles.length === 0) {
    return { styles: [], errors: [] };
  }
  const { styles, diagnostics } = readProjectStyles(root, config.styles, io);
  // Only the two the emit needs: the path it was read from is the reader's business, and
  // carrying it further would put a filesystem path inside the compiler's options.
  return {
    styles: styles.map(({ specifier, css }) => ({ specifier, css })),
    errors: diagnostics,
  };
}
