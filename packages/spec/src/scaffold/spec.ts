/**
 * A new `.fudspec` (SDD-53 §4.1, SDD-82 §3.10): the header and the shape of a criterion,
 * commented.
 *
 * No criterion is written: it would need a term, and a term the project lacks would make the
 * file red the moment it is born.
 */

const TERM = '<term> <args>';

/** The commented criterion, its `given` holding `given`: the lines a criterion of this kind starts with. */
function criterion(given: readonly string[]): string {
  const lines = ['criterion <slug>', '  given', ...(given.length === 0 ? [TERM] : given).map((line) => `    ${line}`)];
  lines.push('  when', `    ${TERM}`, '  then', `    ${TERM}`);
  return lines.map((line) => `# ${line}\n`).join('');
}

/**
 * The text of a new component `.fudspec`. With `props`, the commented `given` starts with
 * `props base`, for a component that needs a fixture; without, with a term like the other blocks.
 */
export function specSkeleton(tag: string, props: boolean): string {
  return `component ${tag}\n\n${criterion(props ? ['props base'] : [])}`;
}

/** What the commented `given` of a page's criterion opens with. */
export interface PageGiven {
  /** The name of the fixture's `data` entry, when the route declares `load`. */
  readonly data?: string;
  /** How a route with params is opened: `path <value>` when it declares `paths`, else `url <url>`. */
  readonly params?: 'path' | 'url';
}

/** The text of a new page `.fudspec`: `page <route>`, as the header writes it (`/blog/[slug]`). */
export function pageSpecSkeleton(route: string, given: PageGiven = {}): string {
  const lines = [
    ...(given.data !== undefined ? [`data ${given.data}`] : []),
    ...(given.params === 'path' ? ['path <value>'] : given.params === 'url' ? ['url <url>'] : []),
  ];
  return `page ${route}\n\n${criterion(lines)}`;
}

/** The text of a new flow `.fudspec`: every criterion of a flow opens a URL. */
export function flowSpecSkeleton(name: string): string {
  return `flow ${name}\n\n${criterion(['url /'])}`;
}
