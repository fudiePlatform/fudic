/**
 * Tag validation (SDD-22 §4.3), in the command and not in the browser. Decision 41 allows
 * any `[a-zA-Z][a-zA-Z0-9-]*` at parse time because that also covers standard HTML and
 * SVG; a tag the CLI is about to DEFINE is narrower — it must be a legal custom element
 * name, or `customElements.define` throws at runtime, far from here.
 */

import { cliError, FUD_TAG_EXISTS, FUD_TAG_INVALID, FUD_TAG_RESERVED } from './diagnostics.js';
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

/** `null` when the tag is usable. Order matters: shape, then spec, then project. */
export function validateTag(tag: string, taken: ReadonlySet<string>): CliError | null {
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
  return null;
}
