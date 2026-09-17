/**
 * What a `<link rel="component">` names, checked before the graph is walked (SDD-43 §4.3).
 *
 * Until now an href that resolved to nothing crashed the build with a raw `ENOENT` naming a
 * path the author never wrote — and with a package specifier that path could not even exist,
 * because the specifier was joined to the file's directory as if it were one. This is the
 * pass that turns those into the two diagnostics of §5, and it runs FIRST: the compiler's
 * graph walk reads every file it reaches, and it has nothing to say about why one is missing.
 *
 * It walks the same links `resolveComponents` does and answers three questions per href:
 * does it resolve, what package did it come from, and is that package a fudic library. The
 * walk is its own rather than the compiler's because the compiler stops at the first file it
 * cannot read, and a build that reports one broken link at a time is a build reported one
 * mistake per run.
 */

import { linkHref, type ElementNode } from '@fudic/compiler';
import type { HrefResolution } from '@fudic/resolve';
import { parseFud } from './parse.js';
import {
  FUD_LINK_NOT_A_LIBRARY,
  FUD_LINK_UNRESOLVED,
  type FudicDiagnostic,
} from './diagnostics.js';

/** What the check needs of the world: read a file, and resolve an href written in one. */
export interface LinkCheckIo {
  /** The file's text, or `undefined` when there is none. Never throws. */
  read(path: string): string | undefined;
  resolve(fromPath: string, href: string): HrefResolution;
}

/**
 * Check every link reachable from `entries`, transitively.
 *
 * One diagnostic per href, and each file visited once: a component shared by twenty pages
 * has its links checked once, and a link that is broken in it is reported once.
 */
export function checkLinks(
  entries: readonly string[],
  io: LinkCheckIo,
): readonly FudicDiagnostic[] {
  const diagnostics: FudicDiagnostic[] = [];
  const seen = new Set<string>();
  const queue = [...entries];

  while (queue.length > 0) {
    const path = queue.pop();
    if (path === undefined || seen.has(path)) continue;
    seen.add(path);

    const source = io.read(path);
    if (source === undefined) continue; // reported by whoever pointed here

    for (const link of linksOf(parseFud(source))) {
      const href = linkHref(link);
      if (href === undefined || href === '') continue; // FUD0436 / FUD0460 already say so

      const resolution = io.resolve(path, href);
      const problem = problemWith(resolution, href, path);
      if (problem !== undefined) {
        diagnostics.push(problem);
        continue;
      }
      if (resolution.outcome === 'path' || resolution.outcome === 'package') {
        queue.push(resolution.path);
      }
    }
  }

  return diagnostics;
}

/** Every `<link>` a structured document declares, components and layout alike. */
function linksOf(document: ReturnType<typeof parseFud>): readonly ElementNode[] {
  const layout = 'layoutLink' in document ? [document.layoutLink] : [];
  return [...document.links, ...layout.filter((link): link is ElementNode => link !== undefined)];
}

/** What is wrong with this href, if anything. */
function problemWith(
  resolution: HrefResolution,
  href: string,
  from: string,
): FudicDiagnostic | undefined {
  switch (resolution.outcome) {
    case 'path':
      // A path that is not there is FUD0460's business, in the editor and in the emit: it
      // has a span, and a build-level copy of it would be the same mistake said twice.
      return undefined;

    case 'external':
      return undefined;

    case 'unresolved':
      return {
        code: FUD_LINK_UNRESOLVED,
        file: from,
        message:
          resolution.reason === 'not-installed'
            ? `"${href}" names a package that is not installed. Add it to this project's ` +
              'dependencies and install — the file cannot be found until the package is there.'
            : `the package "${packageOf(href)}" is installed but does not publish ` +
              `"${href}". Its "exports" decides what a consumer may link; the fix is in that ` +
              "package's package.json, not in an install.",
      };

    case 'package':
      // A `.fud` inside a package that never declared itself a library. Reaching into one is
      // a coupling nobody declared, and the day that package reorganizes its folders it
      // breaks with no warning — so it is an error, not a warning.
      return resolution.target.config?.kind === 'lib'
        ? undefined
        : {
            code: FUD_LINK_NOT_A_LIBRARY,
            file: from,
            message:
              `"${href}" resolves inside "${resolution.target.name}", which does not declare ` +
              'itself a fudic library. A package is consumable when its fudic.json says ' +
              '{ "kind": "lib" }; without it, what you are linking is somebody\'s private file.',
          };
  }
}

/** The package part of a specifier, for a message that names what to go and fix. */
function packageOf(specifier: string): string {
  const parts = specifier.split('/');
  return parts.slice(0, specifier.startsWith('@') ? 2 : 1).join('/');
}
