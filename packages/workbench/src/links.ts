/**
 * The `.fud` files a component reads: itself and, transitively, every component it links with a
 * relative `<link rel="component" href>`. A process serves several components, and a saved
 * `.fud` reruns only those that read it.
 *
 * A specifier that is not relative names a library: it lives in `node_modules`, out of Vite's
 * watcher, so it never arrives as a change and is not followed.
 */

import { dirname, resolve } from 'node:path';
import { slashes } from './target.js';

const LINK = /<link\b[^>]*>/gu;
const COMPONENT = /\brel\s*=\s*["']component["']/u;
const HREF = /\bhref\s*=\s*["']([^"']+)["']/u;

/** Absolute paths, with forward slashes; the component first. */
export function componentFiles(component: string, read: (path: string) => string | undefined): ReadonlySet<string> {
  const files = new Set<string>();
  const pending = [slashes(component)];
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (files.has(file)) continue;
    files.add(file);
    for (const href of links(read(file) ?? '')) pending.push(slashes(resolve(dirname(file), href)));
  }
  return files;
}

/** The relative `href`s of the `<link rel="component">` of a source. */
function links(source: string): string[] {
  const hrefs: string[] = [];
  for (const [tag] of source.matchAll(LINK)) {
    const href = HREF.exec(tag)?.[1];
    if (COMPONENT.test(tag) && href !== undefined && href.startsWith('.')) hrefs.push(href);
  }
  return hrefs;
}
