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

/** The n-th `<style>` virtual: `app-badge.fud` → `app-badge.fud.0.css`. */
export function styleFileName(fudPath: string, index: number): string {
  return `${fudPath}.${index}.css`;
}

/**
 * How the client virtual imports another `.fud`'s contract, from an `href` the user wrote.
 *
 * The href is used as-is: it is already relative to this file, TypeScript resolves it the
 * same way, and rewriting it would break the mapping between what the user typed and what
 * the checker complains about. Only the leading `./` is ensured — a bare `x.fud` means a
 * package to TypeScript, but a sibling file to the user.
 *
 * A bare href with a `/` is a package's (`@shop/ui/snippets/ui.fud`, `ui-kit/card.fud`), and it
 * goes as it is, so TypeScript resolves it through the package's `exports` as the build does.
 * With a `./` in front it named a file that is not there, and the import silently fell to the
 * `*.fud` wildcard: a library snippet was "not declared", and a library layout had no props.
 */
export function componentModuleSpecifier(href: string): string {
  return href.startsWith('.') || href.startsWith('/') || href.includes('/') ? href : `./${href}`;
}

/** Whether `fudPath` names the file `name`, in whatever directory. */
export function isFile(fudPath: string, name: string): boolean {
  return baseName(fudPath) === name;
}

function baseName(path: string): string {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return cut === -1 ? path : path.slice(cut + 1);
}
