/**
 * The stylesheets a component CHOOSES: the names its author writes in the
 * `shadowrootadoptedstylesheets` of its root `<template>`.
 *
 * The names are the ones a project declares under `styles` in its `fudic.json`. The compiler
 * does not know that file, so it only reads the words and where they are: the host — the build
 * and the editor — holds the project and checks them against it (`FUD0744`).
 *
 * The value has to be a literal. The attribute is read once, at compile time, into the list
 * the page hoists and the template carries; an `@` in it would be a list nobody can know
 * before the render (`FUD0745`).
 */

import type { Diagnostic, Span } from '../types/index.js';
import { FUD0745 } from '@fudic/diagnostics';
import type { Attribute, ElementNode } from '../html/index.js';

/** The standard attribute of a declarative shadow root that lists its adopted sheets. */
export const ADOPTED_STYLESHEETS_ATTR = 'shadowrootadoptedstylesheets';

/** One name, where the author wrote it. */
export interface AdoptedName {
  readonly name: string;
  readonly span: Span;
}

export interface AdoptedStylesResult {
  /** In written order, repeats dropped. Empty when the attribute is absent. */
  readonly names: readonly AdoptedName[];
  /** `FUD0745` when the attribute is not a literal, already built. */
  readonly problems: readonly Diagnostic[];
}

const NONE: AdoptedStylesResult = { names: [], problems: [] };

function attribute(el: ElementNode, name: string): Attribute | undefined {
  return el.attributes.find((a) => typeof a.name === 'string' && a.name.toLowerCase() === name);
}

/** The names the root `<template>` of a component chooses; none when it has no template. */
export function adoptedStylesOf(template: ElementNode | undefined): AdoptedStylesResult {
  if (template === undefined) return NONE;
  const written = attribute(template, ADOPTED_STYLESHEETS_ATTR);
  if (written === undefined) return NONE;

  const names: AdoptedName[] = [];
  const seen = new Set<string>();
  for (const part of written.value) {
    if (part.type !== 'attribute-text') {
      return { names: [], problems: [FUD0745({ span: written.span })] };
    }
    for (const match of part.value.matchAll(/\S+/gu)) {
      const name = match[0];
      if (seen.has(name)) continue;
      seen.add(name);
      const start = part.span.start + match.index;
      names.push({ name, span: { start, end: start + name.length } });
    }
  }
  return { names, problems: [] };
}
