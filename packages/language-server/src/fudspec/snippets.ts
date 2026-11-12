/**
 * The snippets of a `.fudspec` (SDD-53 §4.4, SDD-82 §3.10). Served by completion, like the `.fud`
 * ones (SDD-28), because each one depends on the workspace: the component tags and the routes,
 * the terms of the block with their parameters, the names of the fixture.
 *
 * Every builder returns the text of an LSP snippet; completion decides where it is offered.
 */

import { FIXTURE_LINES, SPEC_EXTENSION, componentTag, type HeaderKind, type RouteFile, type TermModule } from '@fudic/spec';
import { peopleOf, type SpecDocument } from './document.js';
import type { SpecHost } from './host.js';

/** The fixture name the snippets propose when the fixture has none yet. */
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

/** The name a `.fudspec` has without its extension: `app-card.fudspec` → `app-card`. */
export function siblingTag(spec: SpecDocument): string {
  const file = spec.path.slice(spec.path.lastIndexOf('/') + 1);
  return file.slice(0, file.length - SPEC_EXTENSION.length);
}

/** The folder a path is in. */
const dirname = (path: string): string => path.slice(0, path.lastIndexOf('/'));

/**
 * What the file's place says it specifies: the page whose `.fud` it sits beside, or the flow it
 * names in the flows folder; undefined anywhere else (a component's, or a file not placed yet).
 */
export function siblingHeader(spec: SpecDocument, host: SpecHost): { readonly kind: 'page' | 'flow'; readonly name: string } | undefined {
  const context = host.context(spec.path);
  const stem = spec.path.slice(0, -SPEC_EXTENSION.length);
  const route = context.routes().find((r) => r.path === `${stem}.fud`);
  if (route !== undefined) return { kind: 'page', name: route.route };
  const name = siblingTag(spec);
  return context.flow(name).dir === dirname(spec.path) ? { kind: 'flow', name } : undefined;
}

/** `component <tag>`: the sibling first when it is a component, then every other tag. */
export function componentSnippet(spec: SpecDocument, host: SpecHost): string {
  const tags = host.componentTags();
  const sibling = siblingTag(spec);
  const ordered = tags.includes(sibling) ? [sibling, ...tags.filter((tag) => tag !== sibling)] : tags;
  return `component ${ordered.length === 0 ? '${1:tag}' : choice(1, ordered)}`;
}

/** The header line of a kind: the component, the page or the flow the file's place suggests first. */
export function headerSnippet(kind: HeaderKind, spec: SpecDocument, host: SpecHost): string {
  if (kind === 'component') return componentSnippet(spec, host);
  const sibling = siblingHeader(spec, host);
  if (kind === 'flow') return `flow ${choice(1, [sibling?.kind === 'flow' ? sibling.name : 'name'])}`;
  const routes = host.context(spec.path).routes().map((r) => r.route);
  const first = sibling?.kind === 'page' ? [sibling.name] : [];
  const ordered = [...first, ...routes.filter((r) => !first.includes(r))];
  return `page ${ordered.length === 0 ? '${1:/route}' : choice(1, ordered)}`;
}

/** The names a fixture line can name — its group's, `paths`' or the component's — or `base` when there are none. */
function fixtureNames(line: string, spec: SpecDocument, host: SpecHost): readonly string[] {
  const subject = host.subject(spec.path, spec.file);
  const fixtures = host.fixturesOf(subject);
  const shape = FIXTURE_LINES[line]!;
  const group = shape.param === 'value' ? fixtures?.paths : fixtures?.[shape.group!];
  const names = (group?.names ?? []).map((name) => name.text);
  return names.length === 0 ? [shape.param === 'value' ? 'value' : BASE_FIXTURE] : names;
}

/** `props <key>`, numbered from `n`: the component's fixture names. */
export function propsSnippet(spec: SpecDocument, host: SpecHost, n = 1): string {
  const tag = componentTag(spec.file)?.text;
  const names = tag === undefined ? [] : (host.fixtures(tag)?.names ?? []).map((name) => name.text);
  return `props ${choice(n, names.length === 0 ? [BASE_FIXTURE] : names)}`;
}

/** A line of the validator in `given`, numbered from `n`: its name and a stop for its argument. */
export function fixtureLineSnippet(line: string, spec: SpecDocument, host: SpecHost, n = 1): string {
  if (line === 'props') return propsSnippet(spec, host, n);
  if (line === 'url') {
    const subject = host.subject(spec.path, spec.file);
    const page = subject.kind === 'page' ? subject.page : undefined;
    return `url ${page === undefined ? `\${${n}:/}` : renumber(urlSnippet(page), n)}`;
  }
  return `${line} ${choice(n, fixtureNames(line, spec, host))}`;
}

/** `as <who>`: the people the file already names, `main` first. */
export function asSnippet(spec: SpecDocument): string {
  return `as ${choice(1, peopleOf(spec))}`;
}

/** A URL of a route: its pattern with a stop for each param, `/blog/${1:slug}`. */
export function urlSnippet(route: RouteFile): string {
  let n = 0;
  return route.pattern.replace(/:([^/]+)/gu, (_, param: string) => `\${${++n}:${placeholderValue(param)}}`);
}

/** The stops of a snippet moved to start at `n`. */
function renumber(snippet: string, n: number): string {
  return snippet.replace(/\$\{(\d+):/gu, (_, stop: string) => `\${${Number(stop) + n - 1}:`);
}

/**
 * The `given` lines a new criterion starts with: `props` when the component needs them, `data`
 * when the page's fixture has some and `path` when its route has params; `url` for a flow,
 * which opens nothing by itself.
 */
function givenLines(spec: SpecDocument, host: SpecHost): readonly string[] {
  const subject = host.subject(spec.path, spec.file);
  switch (subject.kind) {
    case 'component': {
      // The props the component must be mounted with; none when they cannot be proven.
      const required = subject.component?.requiredProps;
      return Array.isArray(required) && required.length > 0 ? ['props'] : [];
    }
    case 'page': {
      const fixtures = subject.page?.fixtures;
      return [
        ...((fixtures?.data?.names.length ?? 0) > 0 ? ['data'] : []),
        ...((subject.page?.params.length ?? 0) > 0 ? [(fixtures?.paths?.names.length ?? 0) > 0 ? 'path' : 'url'] : []),
      ];
    }
    case 'flow':
      return ['url'];
    case undefined:
      return [];
  }
}

/** A whole criterion: its slug, a `given` with the lines it needs, and a `then`. */
export function criterionSnippet(spec: SpecDocument, host: SpecHost): string {
  const lines = givenLines(spec, host);
  // Each line's stops follow the ones before: `url` of a route with two params takes two.
  let n = 2;
  const written = lines.map((line) => {
    const text = fixtureLineSnippet(line, spec, host, n);
    // Every line a criterion starts with has a stop: a name to choose, or a URL with its params.
    n += text.match(/\$\{\d+[:|]/gu)!.length;
    return text;
  });
  const given = written.length === 0 ? '$2' : written.join('\n    ');
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
