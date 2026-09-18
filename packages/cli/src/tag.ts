/**
 * Tag validation (SDD-22 §4.3), in the command and not in the browser. Decision 41 allows
 * any `[a-zA-Z][a-zA-Z0-9-]*` at parse time because that also covers standard HTML and
 * SVG; a tag the CLI is about to DEFINE is narrower — it must be a legal custom element
 * name, or `customElements.define` throws at runtime, far from here.
 */

import {
  cliError,
  FUD_DUPLICATE_TAG,
  FUD_TAG_EXISTS,
  FUD_TAG_INVALID,
  FUD_TAG_RESERVED,
} from './diagnostics.js';
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
  foreign: ReadonlyMap<string, ForeignTag> = new Map(),
): CliError | null {
  if (!CUSTOM_ELEMENT.test(tag)) {
    return cliError(
      FUD_TAG_INVALID,
      `invalid custom element name "${tag}": it must be kebab-case and contain a hyphen (e.g. "app-${tag || 'card'}")`,
    );
  }
  if (RESERVED.has(tag)) {
    return cliError(FUD_TAG_RESERVED, `"${tag}" is reserved by the HTML/SVG/MathML specs and cannot be defined`);
  }
  if (taken.has(tag)) {
    return cliError(FUD_TAG_EXISTS, `a component named "${tag}" already exists in this project`);
  }
  const defined = foreign.get(tag);
  if (defined !== undefined) {
    // The same `FUD0761` the build reports, said before the file exists: it is one fact — two
    // components of one graph under one tag — and generating the second is where it starts.
    return cliError(
      FUD_DUPLICATE_TAG,
      `the library "${defined.library}" already defines "${tag}" (${defined.file}). ` +
        'customElements is one registry per document, so the second define() throws: give this ' +
        "one another name, or a prefix of this project's own",
    );
  }
  return null;
}
