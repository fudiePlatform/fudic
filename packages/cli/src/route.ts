/**
 * Route path → file path (SDD-22 §4.5), the inverse of the filesystem routing of SDD-19.
 * The user types the URL they want; the CLI knows the tree that produces it:
 *
 *   /            → index.fud
 *   blog         → blog.fud
 *   blog/        → blog/index.fud
 *   blog/:slug   → blog/[slug].fud
 */

import { FUD0448 } from '@fudic/diagnostics';
import type { CliError } from './types.js';

const SEGMENT = /^[a-z0-9][a-z0-9._-]*$/iu;

export interface RouteFile {
  readonly file: string;
  readonly error?: CliError;
}

export function routeToFile(route: string): RouteFile {
  const trimmed = route.trim();
  const trailingSlash = trimmed.endsWith('/');
  const raw = trimmed.replace(/^\/+/u, '').replace(/\/+$/u, '');
  const parts = raw === '' ? [] : raw.split('/');

  const segments: string[] = [];
  for (const part of parts) {
    const param = part.startsWith(':') ? part.slice(1) : /^\[(.+)\]$/u.exec(part)?.[1];
    const name = param ?? part;
    if (!SEGMENT.test(name)) {
      return { file: '', error: FUD0448({ problem: 'route-segment', part, route }) };
    }
    segments.push(param === undefined ? name : `[${name}]`);
  }

  // An empty path or a trailing slash means the directory's index route.
  if (segments.length === 0 || trailingSlash) segments.push('index');
  return { file: `${segments.join('/')}.fud` };
}
