/**
 * Shared test helpers: a filesystem that lives in a `Record`, and the corpus paths.
 *
 * The index takes a port precisely so that most of the suite never touches a disk — the one
 * test that does is the one about `node:fs` itself.
 */

import { fileURLToPath } from 'node:url';
import { toPosix } from '../src/paths.js';
import type { FileSystemScanner } from '../src/types.js';

/** Absolute POSIX path of the fixture workspace. */
export const FIXTURES = toPosix(fileURLToPath(new URL('../fixtures', import.meta.url)));

/** A `FileSystemScanner` over a map of path → source. */
export function memoryFs(files: Readonly<Record<string, string>>): FileSystemScanner {
  return {
    fudFiles: (root) =>
      Object.keys(files).filter((path) => path.startsWith(root) && path.endsWith('.fud')),
    readFile: (path) => files[path],
  };
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

/** A layout that itself declares a parent layout (decision 87). */
export const NESTED_LAYOUT = `<!DOCTYPE html>
<html lang="es">
  <head>
    <link rel="layout" href="./_root.fud">
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
