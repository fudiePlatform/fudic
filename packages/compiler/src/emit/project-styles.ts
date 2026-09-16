/**
 * The project's style guide, on its way into a document (SDD-42 §4.1, §4.7).
 *
 * A sheet arrives as text — the compiler has no filesystem — and leaves as one
 * `<style type="module" specifier="_x">` in the `<head>`, hoisted once per document however
 * many components adopt it.
 *
 * It goes through the SAME two passes a component's `<style>` does, and that is the point
 * of this module rather than an argument for it: it is compacted by `compactStyleCss`
 * (BUG-08) and its `url(…)` are linked by the `AssetLinker` (SDD-19 §4.5). A second path
 * for CSS is how one of the two outputs stops being minified without anybody noticing,
 * which is literally the defect BUG-08 fixed.
 *
 * What it does NOT get is Razor. The parser is the same one — there is only one — but the
 * input is a `.css` the author can open in any tool, so nothing here depends on an `@`
 * meaning anything but what CSS says it means. The at-rule whitelist of SDD-09 is what
 * makes that true for free: `@media`, `@supports`, `@layer` and the rest stay literal.
 */

import { parseStyle } from '../css/index.js';
import { compactStyleCss } from './css-compact.js';
import type { AssetLinker } from './assets.js';

/** A stylesheet the project adopts into every shadow root it owns (SDD-42 §3.2). */
export interface ProjectStyle {
  /** The module-map specifier: `_<basename>`, impossible as a tag (SDD-42 §4.3). */
  readonly specifier: string;
  /** The CSS as written. The host read it; this module compacts and links it. */
  readonly css: string;
}

/**
 * A project sheet's CSS, compacted by the component pass.
 *
 * `parseStyle` over the whole text, because a `.css` file IS a `<style>` body: the span it
 * takes is the content between `>` and `</style>`, and here that is the file. Its
 * diagnostics are dropped on purpose — a `.css` has no Razor to get wrong, and the one
 * thing the scanner could complain about (unbalanced braces) is a CSS error the browser
 * reports better than a build ever could.
 */
export function compactProjectCss(css: string): string {
  const parsed = parseStyle(css, { start: 0, end: css.length });
  return compactStyleCss(css, parsed.value);
}

/**
 * The `const PROJECT_STYLES = [...]` line, or `null` when the project declares no guide.
 *
 * It is BUILT here and WRITTEN by the caller, and the split is not stylistic: linking a
 * `url(…)` registers an import, and the module's import lines are flushed before the
 * constants are written. A sheet whose asset was linked after that flush would reference a
 * binding nobody imported — a module that does not even parse, from a CSS rule.
 *
 * So the caller calls this while the linker is still open, and writes what comes back
 * wherever the constants go.
 */
export function renderProjectStyles(
  styles: readonly ProjectStyle[] | undefined,
  linker: AssetLinker,
): string | null {
  if (styles === undefined || styles.length === 0) return null;
  const entries = styles.map(
    (s) =>
      `{ specifier: ${JSON.stringify(s.specifier)}, css: ${linker.cssTemplate(
        compactProjectCss(s.css),
      )} }`,
  );
  return `const PROJECT_STYLES = [${entries.join(', ')}];`;
}

/**
 * The adopted list of one component, as it goes into BOTH outputs.
 *
 * `projectAdopt` is the project's specifiers already joined; `own` is whether this
 * component carries a sheet of its own. The project's come FIRST — the cascade of §4.1 —
 * and the component's tag last.
 *
 * `''` means *adopts nothing*, and that is the condition BUG-31 §T4 used to express as
 * *has no CSS*. With no project guide the two are the same sentence, which is what keeps
 * every pre-SDD-42 document byte for byte what it was.
 *
 * One function, two callers — the server path and the client one. Two copies of this
 * expression is a component that hydrates with different stylesheets than it rendered
 * with, and nothing in a test would say so.
 */
export function adoptListOf(projectAdopt: string, tag: string, own: boolean): string {
  if (!own) return projectAdopt;
  return projectAdopt === '' ? tag : `${projectAdopt} ${tag}`;
}

/** The specifiers a project's sheets contribute, joined for the adopted list. */
export function projectAdoptOf(styles: readonly ProjectStyle[] | undefined): string {
  return (styles ?? []).map((s) => s.specifier).join(' ');
}
