/**
 * Turning the `globalStyles` and `styles` of a `fudic.json` into sheets the emit can adopt.
 *
 * It lives here, next to the reader that owns the fields, and not in the compiler — the
 * compiler never touches a filesystem, and both questions this answers need one: does the
 * file exist, and what does it contain. What it hands back is already resolved: a
 * specifier and the raw CSS.
 *
 * The specifier is the NAME the author wrote, as is. No prefix, no basename: what ends up in
 * the HTML is the word the author reads in `fudic.json` and writes in a template.
 *
 * Like its neighbour, it **never throws**. A sheet that cannot be read is a diagnostic and
 * a project with one sheet fewer, not an exception in the middle of a build.
 */

import { CONFIG_FILE } from './constants.js';
import { FUD0740, FUD0741, type FileDiagnostic } from '@fudic/diagnostics';
import type { ConfigIo, NamedStyle, ProjectConfig } from './read.js';

/** One project stylesheet, resolved and read. */
export interface ProjectStyleFile {
  /** The module-map specifier: the name the author gave it in `fudic.json`. */
  readonly specifier: string;
  /**
   * The path as it was written, relative to the project root.
   *
   * It travels because a diagnostic ABOUT the sheet has to name it the way the author
   * named it — `src/styles/theme.css`, not the absolute path a machine joined.
   */
  readonly entry: string;
  /** Where it was read from. Absolute, joined from the project root. */
  readonly path: string;
  /** The CSS as written. Minification and asset linking are the compiler's. */
  readonly css: string;
}

export interface ProjectStylesResult {
  /** `globalStyles`, in declaration order, which is adoption order. Failed entries absent. */
  readonly global: readonly ProjectStyleFile[];
  /** `styles`: the ones a component may choose. Failed entries absent. */
  readonly optional: readonly ProjectStyleFile[];
  readonly diagnostics: readonly FileDiagnostic[];
}

/**
 * Resolve and read every `globalStyles` and `styles` entry of a project.
 *
 * Diagnostics carry no span, and that is deliberate rather than an omission: the entry is
 * a string inside an object inside a file this function was never given the text of, and
 * re-reading `fudic.json` to underline it would mean a second reader of the same file —
 * the exact thing `@fudic/config` exists to prevent. The name is quoted in the message,
 * which is what the author searches for.
 */
export function readProjectStyles(
  root: string,
  config: Pick<ProjectConfig, 'globalStyles' | 'styles'>,
  io: ConfigIo,
): ProjectStylesResult {
  const diagnostics: FileDiagnostic[] = [];
  const claimed = new Set<string>();

  const read = (entries: readonly NamedStyle[]): ProjectStyleFile[] => {
    const files: ProjectStyleFile[] = [];
    for (const { name, path: entry } of entries) {
      if (claimed.has(name)) {
        diagnostics.push(FUD0741({ file: CONFIG_FILE, where: 'project', name }));
        continue;
      }
      const path = `${root}/${entry}`;
      if (!io.exists(path)) {
        diagnostics.push(FUD0740({ file: CONFIG_FILE, name, entry, problem: 'missing' }));
        continue;
      }
      let css: string;
      try {
        css = io.read(path);
      } catch (error) {
        diagnostics.push(
          FUD0740({
            file: CONFIG_FILE,
            name,
            entry,
            problem: 'unreadable',
            reason: error instanceof Error ? error.message : String(error),
          }),
        );
        continue;
      }
      claimed.add(name);
      files.push({ specifier: name, entry, path, css });
    }
    return files;
  };

  const global = read(config.globalStyles);
  const optional = read(config.styles);
  return { global, optional, diagnostics };
}
