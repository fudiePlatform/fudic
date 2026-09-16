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

import { LineMap, lintProjectStyle, type ProjectStyle } from '@fudic/compiler';
import {
  readProjectStyles,
  type ConfigDiagnostic,
  type ConfigIo,
  type ProjectConfig,
  type ProjectStyleFile,
} from '@fudic/config';

export interface StylesResult {
  /** In adoption order. Empty for a project with no `fudic.json` or no `styles`. */
  readonly styles: readonly ProjectStyle[];
  /** Fatal: the document would render with styles nobody declared (§4.1). */
  readonly errors: readonly ConfigDiagnostic[];
  /** `FUD0743`: a rule of the sheet that matches nothing where the sheet goes (§4.5). */
  readonly warnings: readonly ConfigDiagnostic[];
}

/** Resolve and read `<root>/<entry>` for every `styles` entry of the project. */
export function readStyles(
  root: string,
  config: ProjectConfig | null,
  io: ConfigIo,
): StylesResult {
  if (config === null || config.styles.length === 0) {
    return { styles: [], errors: [], warnings: [] };
  }
  const { styles, diagnostics } = readProjectStyles(root, config.styles, io);
  // Only the two the emit needs: the path it was read from is the reader's business, and
  // carrying it further would put a filesystem path inside the compiler's options.
  return {
    styles: styles.map(({ specifier, css }) => ({ specifier, css })),
    errors: diagnostics,
    warnings: styles.flatMap(lintOne),
  };
}

/**
 * `FUD0743` over one sheet, here and not in the emit.
 *
 * The sheet is handed to every module the build emits, so the same reading repeated there
 * would be one warning per route for one mistake — the reason `FUD0742` sits in the plugin
 * too. Read once, where the file is read.
 *
 * The position is resolved here as well: the compiler speaks in offsets on purpose
 * (SDD-13), and a build log is the one place where that has to become a line and a column
 * the author can click.
 */
function lintOne(file: ProjectStyleFile): readonly ConfigDiagnostic[] {
  const found = lintProjectStyle(file.css);
  if (found.length === 0) return [];
  const lines = new LineMap(file.css);
  return found.map((d) => {
    const at = lines.positionAt(d.span.start);
    return {
      code: d.code,
      message: `${file.entry}:${at.line + 1}:${at.character + 1}: ${d.message}`,
      file: file.entry,
      span: d.span,
    };
  });
}
