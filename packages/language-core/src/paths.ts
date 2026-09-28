/**
 * Virtual file names, derived from the `.fud` path (SDD-23 §4.1).
 *
 * Pure string work, no `node:path`: the emitter never touches the filesystem, and the
 * server may serve URIs that are not filesystem paths at all.
 *
 * The `.fud.ts` suffix is what makes the projection resolvable: a synthetic
 * `import type … from './x.fud'` resolves to `x.fud.ts` under TypeScript's extension
 * lookup, so components reference each other's contracts with the href the user wrote.
 */

/** The client virtual: `blog/[slug].fud` → `blog/[slug].fud.ts`. */
export function clientFileName(fudPath: string): string {
  return `${fudPath}.ts`;
}

/** The server virtual: `blog/[slug].fud` → `blog/[slug].fud.server.ts`. */
export function serverFileName(fudPath: string): string {
  return `${fudPath}.server.ts`;
}

/** The n-th `<style>` virtual: `app-badge.fud` → `app-badge.fud.0.css`. */
export function styleFileName(fudPath: string, index: number): string {
  return `${fudPath}.${index}.css`;
}

/**
 * How the client virtual names its server sibling: `'./[slug].fud.server'`.
 *
 * Relative and extensionless, because the two virtuals always sit in the same directory
 * and TypeScript appends the extension itself.
 */
export function serverModuleSpecifier(fudPath: string): string {
  return `./${baseName(fudPath)}.server`;
}

/**
 * How the client virtual imports another `.fud`'s contract, from an `href` the user wrote.
 *
 * The href is used as-is: it is already relative to this file, TypeScript resolves it the
 * same way, and rewriting it would break the mapping between what the user typed and what
 * the checker complains about. Only the leading `./` is ensured — a bare `x.fud` means a
 * package to TypeScript, but a sibling file to the user.
 */
export function componentModuleSpecifier(href: string): string {
  return href.startsWith('.') || href.startsWith('/') ? href : `./${href}`;
}

/** A `[name]` segment of a route path: the one spelling the router reads as a param. */
const PARAM_SEGMENT = /^\[([A-Za-z_][A-Za-z0-9_]*)\]$/u;

/** The routes directory, as it appears inside a `.fud` path. */
const ROUTES_SEGMENT = '/routes/';

/**
 * The params of a route, read off its path: `routes/blog/[slug].fud` → `['slug']`.
 *
 * Only what lies below `routes/` counts, because that is the part the router turns into a
 * pattern — a `[x]` directory above it names nothing the request will carry. A path with no
 * `routes/` in it is read whole, which is what a path relative to that directory looks like.
 */
export function routeParams(fudPath: string): readonly string[] {
  const normalized = fudPath.replace(/\\/gu, '/');
  const cut = normalized.lastIndexOf(ROUTES_SEGMENT);
  const relative = cut === -1 ? normalized : normalized.slice(cut + ROUTES_SEGMENT.length);
  const params: string[] = [];
  for (const segment of relative.replace(/\.fud$/u, '').split('/')) {
    const name = PARAM_SEGMENT.exec(segment)?.[1];
    if (name !== undefined) params.push(name);
  }
  return params;
}

function baseName(path: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return cut === -1 ? path : path.slice(cut + 1);
}
