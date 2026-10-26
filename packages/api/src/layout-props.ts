/**
 * The props a route's `layout` resolves, as its `.d.ts` names them (SDD-60 §3.4).
 *
 * The type comes out of the `<link rel="layout">` of the route's `.fud`, as `$LayoutProps` did:
 * `import('../../../src/layouts/_layout.fud').$Props`, relative to the `.d.ts` that carries it.
 * The checker of fudic resolves a `.fud`; a TypeScript that does not (the editor's own, for a
 * `.ts` of `src/server`) reads it as `any` under `skipLibCheck`, which is a check given up, never
 * a false error.
 *
 * Read off the text with no parser: a host that writes `.d.ts` must not pay for the `.fud`.
 */

const LINK = /<link\b[^>]*>/giu;
const REL_LAYOUT = /\brel\s*=\s*(["'])layout\1/iu;
const HREF = /\bhref\s*=\s*(["'])(.*?)\1/iu;

/**
 * The type of the props of the layout `pageSource` links, for the `.d.ts` at `typesFile`, or
 * `undefined` when it links none. Both paths absolute, with `/`.
 */
export function layoutPropsType(pagePath: string, pageSource: string, typesFile: string): string | undefined {
  for (const [tag] of pageSource.matchAll(LINK)) {
    if (!REL_LAYOUT.test(tag)) continue;
    const href = HREF.exec(tag)?.[2];
    if (href === undefined || href === '' || href.startsWith('/')) return undefined;
    const layout = join(dirOf(pagePath), href);
    return `import('${relative(dirOf(typesFile), layout)}').$Props`;
  }
  return undefined;
}

const dirOf = (path: string): string => path.slice(0, path.lastIndexOf('/'));

/** `dir` + `href`, with `.` and `..` folded. */
function join(dir: string, href: string): string {
  const out = dir.split('/');
  for (const part of href.split('/')) {
    if (part === '..') out.pop();
    else if (part !== '.') out.push(part);
  }
  return out.join('/');
}

/** The relative path from the folder `from` to `to`, always starting with `.`. */
function relative(from: string, to: string): string {
  const a = from.split('/');
  const b = to.split('/');
  let common = 0;
  while (common < a.length && a[common] === b[common]) common++;
  const up = a.slice(common).map(() => '..');
  return [...(up.length === 0 ? ['.'] : up), ...b.slice(common)].join('/');
}
