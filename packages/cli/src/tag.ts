/**
 * Tag validation (SDD-22 §4.3), in the command and not in the browser. Decision 41 allows
 * any `[a-zA-Z][a-zA-Z0-9-]*` at parse time because that also covers standard HTML and
 * SVG; a tag the CLI is about to DEFINE is narrower — it must be a legal custom element
 * name, or `customElements.define` throws at runtime, far from here.
 */

import { FUD0440, FUD0441, FUD0442, FUD0761 } from '@fudic/diagnostics';
import type { CliError } from './types.js';

/** Kebab-case with at least one hyphen — the custom-element rule (decision 41). */
const CUSTOM_ELEMENT = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/u;

/**
 * Hyphenated names the HTML/SVG/MathML specs already own. They pass the hyphen rule but
 * `define()` rejects them.
 */
const RESERVED = new Set([
  'annotation-xml',
  'color-profile',
  'font-face',
  'font-face-src',
  'font-face-uri',
  'font-face-format',
  'font-face-name',
  'missing-glyph',
]);

/**
 * The tag to propose when `name` does not make a valid one: the project's prefix — or, in a
 * project that declares none, its name — and the name in kebab-case. `project-button`, never
 * an `app-` the project has nothing to do with.
 */
export function suggestTag(prefix: string, project: string, name: string): string {
  const kebab = (text: string): string =>
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-+|-+$/gu, '');
  return `${kebab(prefix) || kebab(project) || 'app'}-${kebab(name) || 'card'}`;
}

/**
 * The prefix a project gets when none is given: its name, as `prefix` may spell it — lowercase,
 * no hyphen (`my-shop` → `myshop`). A name with nothing usable leaves `app`.
 */
export function prefixOf(name: string): string {
  const last = name.slice(name.replace(/\\/gu, '/').lastIndexOf('/') + 1);
  return last.toLowerCase().replace(/[^a-z0-9]/gu, '').replace(/^[0-9]+/u, '') || 'app';
}

/** A tag some LIBRARY of the dependency graph already defines (SDD-43 §4.5). */
export interface ForeignTag {
  /** The package that defines it, as its `package.json` spells it. */
  readonly library: string;
  /** The file that defines it, so the author can go and read the contract. */
  readonly file: string;
}

/**
 * `null` when the tag is usable. Order matters: shape, then spec, then project, then graph.
 *
 * The project comes before the graph because a name the author already used is the likelier
 * mistake and the cheaper fix; a library's tag is the one that needs the message to say WHOSE
 * it is, since nothing in this project shows it.
 */
export function validateTag(
  tag: string,
  taken: ReadonlySet<string>,
  foreign: ReadonlyMap<string, ForeignTag>,
  suggestion: string,
): CliError | null {
  if (!CUSTOM_ELEMENT.test(tag)) {
    return FUD0440({ tag, suggestion });
  }
  if (RESERVED.has(tag)) {
    return FUD0442({ tag });
  }
  if (taken.has(tag)) {
    return FUD0441({ tag });
  }
  const defined = foreign.get(tag);
  if (defined !== undefined) {
    // The same `FUD0761` the build reports, said before the file exists: it is one fact — two
    // components of one graph under one tag — and generating the second is where it starts.
    return FUD0761({ kind: 'library', tag, library: defined.library, file: defined.file });
  }
  return null;
}
