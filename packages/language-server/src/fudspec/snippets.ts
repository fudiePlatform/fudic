/**
 * The snippets of a `.fudspec` (SDD-53 §4.4). Served by completion, like the `.fud` ones
 * (SDD-28), because each one depends on the workspace: the component tags, the terms of the
 * block with their parameters, the keys of the component's fixture.
 *
 * Every builder returns the text of an LSP snippet; completion decides where it is offered.
 */

import { SPEC_EXTENSION, type TermModule } from '@fudic/spec';
import type { SpecDocument } from './document.js';
import type { SpecHost } from './host.js';

/** The fixture key the snippets propose when the component has no fixture file yet. */
const BASE_FIXTURE = 'base';

/** A value inside `${n|a,b|}`: the choice syntax reserves `,`, `|`, `$`, `}` and `\`. */
function choiceValue(text: string): string {
  return text.replace(/[,|$}\\]/gu, (c) => `\\${c}`);
}

/** A value inside `${n:text}`. */
function placeholderValue(text: string): string {
  return text.replace(/[$}\\]/gu, (c) => `\\${c}`);
}

/** `${n|a,b|}`, or `${n:a}` when there is only one value to offer. */
function choice(n: number, values: readonly string[]): string {
  return values.length === 1
    ? `\${${n}:${placeholderValue(values[0] as string)}}`
    : `\${${n}|${values.map(choiceValue).join(',')}|}`;
}

/** The component a `.fudspec` is named after: `app-card.fudspec` → `app-card`. */
export function siblingTag(spec: SpecDocument): string {
  const file = spec.path.slice(spec.path.lastIndexOf('/') + 1);
  return file.slice(0, file.length - SPEC_EXTENSION.length);
}

/** `component <tag>`: the sibling first when it is a component, then every other tag. */
export function componentSnippet(spec: SpecDocument, host: SpecHost): string {
  const tags = host.componentTags();
  const sibling = siblingTag(spec);
  const ordered = tags.includes(sibling) ? [sibling, ...tags.filter((tag) => tag !== sibling)] : tags;
  return `component ${ordered.length === 0 ? '${1:tag}' : choice(1, ordered)}`;
}

/** The keys a `props` line can name: the fixture's, or `base` when there is no fixture file. */
function fixtureKeys(spec: SpecDocument, host: SpecHost): readonly string[] {
  const tag = spec.file.component?.tag?.text;
  const names = tag === undefined ? [] : (host.fixtures(tag)?.names ?? []).map((name) => name.text);
  return names.length === 0 ? [BASE_FIXTURE] : names;
}

/** `props <key>`, numbered from `n`. */
export function propsSnippet(spec: SpecDocument, host: SpecHost, n = 1): string {
  return `props ${choice(n, fixtureKeys(spec, host))}`;
}

/** Whether the declared component has props a criterion must mount it with. */
function needsProps(spec: SpecDocument, host: SpecHost): boolean {
  const tag = spec.file.component?.tag?.text;
  const required = tag === undefined ? undefined : host.component(tag)?.requiredProps;
  return Array.isArray(required) && required.length > 0;
}

/** A whole criterion: its slug, a `given` (with `props` when the component needs them) and a `then`. */
export function criterionSnippet(spec: SpecDocument, host: SpecHost): string {
  const given = needsProps(spec, host) ? propsSnippet(spec, host, 2) : '$2';
  return `criterion \${1:slug}\n  given\n    ${given}\n  then\n    $0`;
}

/** A term with one tab stop per parameter: the tags of the workspace and `role:` for an `element`. */
export function termSnippet(module: TermModule, host: SpecHost): string {
  const tags = host.componentTags();
  const stops = module.params.map((param, i) =>
    param.type === 'element' ? choice(i + 1, [...tags, 'role:']) : `\${${i + 1}:${placeholderValue(param.name)}}`,
  );
  return [module.name, ...stops].join(' ');
}
