/**
 * The pieces a tool that shows something is asked about, by the names of SDD-77 §4.7: a component
 * by its tag, a route by a concrete URL, a function by `<id>.<name>`. And the place in its source
 * of what one of them threw, read off the stack.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FUD1405, LineMap, type Span } from '@fudic/diagnostics';
import type { Piece, ProjectService } from '@fudic/language-server/project';
import { closest } from '@fudic/spec';
import { within } from './locate.js';

/** The component `tag` names, or the diagnostic that says it is not there. */
export function componentOf(service: ProjectService, tag: string): { readonly piece: Piece } | { readonly error: ReturnType<typeof FUD1405> } {
  const components = service.pieces().filter((p) => p.kind === 'component');
  const piece = components.find((p) => p.name === tag);
  if (piece !== undefined) return { piece };
  const near = closest(tag, components.map((p) => p.name));
  return { error: FUD1405({ name: tag, ...(near !== undefined ? { closest: near } : {}) }) };
}

/** The `.fixture.ts` beside a component's `.fud`, when it has one. */
export function fixtureFile(piece: Piece): string | undefined {
  const file = `${piece.file.slice(0, -'.fud'.length)}.fixture.ts`;
  return existsSync(file) ? file : undefined;
}

const segments = (path: string): readonly string[] => path.split('?')[0]!.split('/').filter((s) => s !== '');

/** Whether the concrete `url` is one `pattern` matches: `/products/42` and `/products/:id`. */
export function matches(pattern: string, url: string): boolean {
  const want = segments(pattern);
  const got = segments(url);
  return want.length === got.length && want.every((s, i) => s.startsWith(':') || s === got[i]);
}

/** The route piece that answers `url`: its pattern, or the URL itself when it is one. */
export function routeOf(service: ProjectService, url: string): Piece | undefined {
  const routes = service.pieces().filter((p) => p.kind === 'route');
  return routes.find((p) => p.name === url) ?? routes.find((p) => matches(p.name, url));
}

/** A frame of a stack: `at fn (C:/x/y.ts:3:7)` or `at C:/x/y.ts:3:7`, `file:///` or not. */
const FRAME = /(?:\(|at )(?:file:\/\/\/?)?([^()\s]+?):(\d+):(\d+)\)?$/u;

/**
 * The first frame of `stack` in a file of the project — not what it installed, not the files a
 * tool writes under `.fudic` —, as a file and a span; undefined when none is.
 */
export function placeOfStack(stack: string, root: string): { readonly file: string; readonly span: Span } | undefined {
  for (const line of stack.split('\n')) {
    const frame = FRAME.exec(line.trim());
    if (frame === null) continue;
    const file = resolve(decodeURIComponent(frame[1]!).replace(/^\/(?=[A-Za-z]:)/u, ''));
    if (!within(root, file) || /[\\/](?:node_modules|\.fudic)[\\/]/u.test(file) || !existsSync(file)) continue;
    const map = new LineMap(readFileSync(file, 'utf8'));
    const start = map.offsetAt({ line: Number(frame[2]) - 1, character: Number(frame[3]) - 1 });
    return { file, span: { start, end: start } };
  }
  return undefined;
}
