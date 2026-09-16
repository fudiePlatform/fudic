/**
 * Turning the `styles` of a `fudic.json` into sheets the emit can adopt (SDD-42 §3.1, §4.3).
 *
 * It lives here, next to the reader that owns the field, and not in the compiler — the
 * compiler never touches a filesystem, and both questions this answers need one: does the
 * file exist, and what does it contain. What it hands back is already resolved: a
 * specifier and the raw CSS.
 *
 * Like its neighbour, it **never throws**. A sheet that cannot be read is a diagnostic and
 * a project with one sheet fewer, not an exception in the middle of a build.
 */

import { CONFIG_FILE } from './constants.js';
import {
  FUD_STYLE_NOT_FOUND,
  FUD_STYLE_SPECIFIER_CLASH,
  type ConfigDiagnostic,
} from './diagnostics.js';
import type { ConfigIo } from './read.js';

/** One project stylesheet, resolved and read. */
export interface ProjectStyleFile {
  /**
   * The module-map specifier: `_` plus the basename without extension (§4.3).
   *
   * The leading underscore is what makes it impossible to collide with a tag — a custom
   * element name starts with `[a-z]` by specification — so there is no registry, no
   * configurable prefix and no cross-check to write. The collision is unconstructible.
   */
  readonly specifier: string;
  /** Where it was read from. Absolute, joined from the project root. */
  readonly path: string;
  /** The CSS as written. Minification and asset linking are the compiler's (§4.7). */
  readonly css: string;
}

export interface ProjectStylesResult {
  /** In declaration order, which is adoption order. Entries that failed are absent. */
  readonly styles: readonly ProjectStyleFile[];
  readonly diagnostics: readonly ConfigDiagnostic[];
}

/** `src/styles/theme.css` → `_theme`. */
export function specifierOf(entry: string): string {
  // Both separators, because a `fudic.json` gets written on Windows too and the specifier
  // it produces has to be the same file on both — it ends up inside the HTML.
  const base = entry.slice(Math.max(entry.lastIndexOf('/'), entry.lastIndexOf('\\')) + 1);
  const dot = base.lastIndexOf('.');
  return `_${dot > 0 ? base.slice(0, dot) : base}`;
}

/**
 * Resolve and read every `styles` entry of a project.
 *
 * Diagnostics carry no span, and that is deliberate rather than an omission: the entry is
 * a string inside an array inside a file this function was never given the text of, and
 * re-reading `fudic.json` to underline it would mean a second reader of the same file —
 * the exact thing `@fudic/config` exists to prevent. The path is quoted in the message,
 * which is what the author searches for.
 */
export function readProjectStyles(
  root: string,
  entries: readonly string[],
  io: ConfigIo,
): ProjectStylesResult {
  const styles: ProjectStyleFile[] = [];
  const diagnostics: ConfigDiagnostic[] = [];
  const claimed = new Map<string, string>();

  for (const entry of entries) {
    const specifier = specifierOf(entry);
    const owner = claimed.get(specifier);
    if (owner !== undefined) {
      diagnostics.push({
        code: FUD_STYLE_SPECIFIER_CLASH,
        message:
          `${CONFIG_FILE}: "${entry}" and "${owner}" both adopt as "${specifier}". ` +
          'Two sheets with the same basename cannot be told apart in the module map — ' +
          'rename one.',
        file: CONFIG_FILE,
      });
      continue;
    }

    const path = `${root}/${entry}`;
    if (!io.exists(path)) {
      diagnostics.push({
        code: FUD_STYLE_NOT_FOUND,
        message: `${CONFIG_FILE}: "${entry}" does not exist.`,
        file: CONFIG_FILE,
      });
      continue;
    }

    let css: string;
    try {
      css = io.read(path);
    } catch (error) {
      diagnostics.push({
        code: FUD_STYLE_NOT_FOUND,
        message: `${CONFIG_FILE}: "${entry}" could not be read: ${
          error instanceof Error ? error.message : String(error)
        }`,
        file: CONFIG_FILE,
      });
      continue;
    }

    claimed.set(specifier, entry);
    styles.push({ specifier, path, css });
  }

  return { styles, diagnostics };
}
