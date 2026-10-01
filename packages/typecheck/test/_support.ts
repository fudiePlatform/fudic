/**
 * Shared test helpers: a filesystem that lives in a `Record`, an index and a projection over
 * it, and the small `.fud` sources the suites are written with.
 *
 * The index takes a port precisely so that most of the suite never touches a disk.
 */

import type { CheckFs } from '../src/files.js';
import { describeFud, FudIndex } from '../src/fud-index.js';
import { resolveFrom, toPosix } from '../src/paths.js';
import { projectFud, type ProjectedFud } from '../src/project.js';

/**
 * A `CheckFs` over a map of path → source.
 *
 * `resolveHref` is the path arithmetic alone, with no package resolution, unless the specifier
 * is listed in `packages`.
 */
export function memoryFs(
  files: Readonly<Record<string, string>>,
  packages: Readonly<Record<string, string>> = {},
): CheckFs {
  return {
    fudFiles: (root) =>
      Object.keys(files).filter((path) => path.startsWith(root) && path.endsWith('.fud')),
    readFile: (path) => files[path],
    resolveHref: (fromFile, href) => packages[href] ?? resolveFrom(toPosix(fromFile), href),
    realPath: (path) => toPosix(path),
  };
}

/** An index of `files`, swept from `root`. */
export function indexOf(files: Readonly<Record<string, string>>, root = '/p'): FudIndex {
  const index = new FudIndex(memoryFs(files), describeFud);
  index.scan(root);
  return index;
}

/** `path` with `source`, projected against an index of `files` plus itself. */
export function projected(
  path: string,
  source: string,
  files: Readonly<Record<string, string>> = {},
): { readonly index: FudIndex; readonly document: ProjectedFud } {
  const index = indexOf({ ...files, [path]: source });
  return { index, document: projectFud({ path, source, index }) };
}

/** A minimal component `.fud` defining `tag`. */
export function component(tag: string, links: readonly string[] = []): string {
  const head = links.map((href) => `<link rel="component" href="${href}">`).join('\n');
  return `${head}\n<${tag}>\n  <template shadowrootmode="open">\n    <span><slot></slot></span>\n  </template>\n</${tag}>\n`;
}

/** A minimal route `.fud` pointing at `layoutHref`. */
export function route(layoutHref: string, links: readonly string[] = []): string {
  const head = links.map((href) => `<link rel="component" href="${href}">`).join('\n');
  return `<link rel="layout" href="${layoutHref}">\n${head}\n<article>hi</article>\n`;
}

/** A minimal layout `.fud`. */
export const LAYOUT = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    @RenderHead()
  </head>
  <body>
    <main>
      @RenderBody()
    </main>
  </body>
</html>
`;

/** A minimal standalone page `.fud`. */
export const PAGE = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8">
  </head>
  <body>
    <h1>hi</h1>
  </body>
</html>
`;
