/**
 * `FUD0760` and `FUD0763` — what a `<link rel="component">` names (SDD-43 §4.3, criteria 4, 5).
 *
 * Both are the build's and neither carries a span, because what they are about is a package:
 * whether it is installed, what it publishes, and whether it ever meant to be consumed. None
 * of that is anywhere in the `.fud` that named it.
 *
 * Driven through an injected `LinkCheckIo` rather than a real build, so the four answers a
 * resolver can give are all reachable — including the two halves of `FUD0760`, which on a
 * disk differ only by whether somebody ran an install.
 */

import { describe, it, expect } from 'vitest';
import type { HrefResolution } from '@fudic/resolve';
import type { ProjectConfig } from '@fudic/config';
import { checkLinks, type LinkCheckIo } from '../src/link-check.js';

const ENTRY = '/ws/apps/tienda/src/routes/index.fud';

const page = (...hrefs: readonly string[]): string =>
  `<!DOCTYPE html>\n<html>\n  <head>\n${hrefs
    .map((href) => `    <link rel="component" href="${href}">`)
    .join('\n')}\n  </head>\n  <body></body>\n</html>\n`;

const component = (tag: string, ...hrefs: readonly string[]): string =>
  `${hrefs.map((href) => `<link rel="component" href="${href}">`).join('\n')}\n<${tag}>\n  <template shadowrootmode="open"><slot></slot></template>\n</${tag}>\n`;

/** A fudic library's config, as `@fudic/config` fills it. */
const libConfig: ProjectConfig = { id: '', kind: 'lib', prefix: 'ui', styles: [] };
const appConfig: ProjectConfig = { id: 'otra', kind: 'app', prefix: '', styles: [] };

/** Files in a `Record`, and whatever the resolver is told to answer per href. */
function io(
  files: Readonly<Record<string, string>>,
  resolutions: Readonly<Record<string, HrefResolution>> = {},
): LinkCheckIo {
  return {
    read: (path) => files[path],
    resolve: (from, href) =>
      resolutions[href] ?? { outcome: 'path', path: `${dir(from)}/${href.replace(/^\.\//u, '')}` },
  };
}

const dir = (path: string): string => path.slice(0, path.lastIndexOf('/'));

describe('FUD0760 — a package specifier that does not resolve', () => {
  it('says INSTALL when the package is not installed', () => {
    const problems = checkLinks([ENTRY], {
      ...io({ [ENTRY]: page('@acme/ui/card.fud') }),
      resolve: () => ({
        outcome: 'unresolved',
        specifier: '@acme/ui/card.fud',
        reason: 'not-installed',
      }),
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]?.code).toBe('FUD0760');
    expect(problems[0]?.message).toMatch(/not installed/);
    expect(problems[0]?.message).toMatch(/dependencies/);
    expect(problems[0]?.file).toBe(ENTRY);
  });

  it('says EXPORTS when the package is there and the file is not published', () => {
    // The other half, and the reason the code has two messages: this one is fixed in the
    // library's package.json, and an install would not touch it.
    const problems = checkLinks([ENTRY], {
      ...io({ [ENTRY]: page('@acme/ui/card.fud') }),
      resolve: () => ({
        outcome: 'unresolved',
        specifier: '@acme/ui/card.fud',
        reason: 'not-exported',
      }),
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]?.code).toBe('FUD0760');
    expect(problems[0]?.message).toMatch(/exports/);
    expect(problems[0]?.message).toMatch(/@acme\/ui/);
    expect(problems[0]?.message).not.toMatch(/not installed/);
  });

  it('names the package of an unscoped specifier too', () => {
    const problems = checkLinks([ENTRY], {
      ...io({ [ENTRY]: page('ui-kit/card.fud') }),
      resolve: () => ({ outcome: 'unresolved', specifier: 'ui-kit/card.fud', reason: 'not-exported' }),
    });
    expect(problems[0]?.message).toMatch(/"ui-kit"/);
  });
});

describe('FUD0763 — a package that is not a fudic library', () => {
  it('reports a `.fud` inside a package with no `kind: "lib"`', () => {
    const target = '/ws/apps/otra/src/components/card.fud';
    const problems = checkLinks(
      [ENTRY],
      io(
        { [ENTRY]: page('@acme/otra/card.fud'), [target]: component('otra-card') },
        {
          '@acme/otra/card.fud': {
            outcome: 'package',
            path: target,
            target: { name: '@acme/otra', root: '/ws/apps/otra', config: appConfig },
          },
        },
      ),
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]?.code).toBe('FUD0763');
    expect(problems[0]?.message).toMatch(/@acme\/otra/);
    expect(problems[0]?.message).toMatch(/"kind": "lib"/);
  });

  it('reports one with no `fudic.json` at all', () => {
    const target = '/ws/node_modules/cualquiera/card.fud';
    const problems = checkLinks(
      [ENTRY],
      io(
        { [ENTRY]: page('cualquiera/card.fud'), [target]: component('x-card') },
        {
          'cualquiera/card.fud': {
            outcome: 'package',
            path: target,
            target: { name: 'cualquiera', root: '/ws/node_modules/cualquiera', config: null },
          },
        },
      ),
    );
    expect(problems[0]?.code).toBe('FUD0763');
  });

  it('says nothing about a package that IS a library', () => {
    const target = '/ws/libs/ui/src/ui-card.fud';
    const problems = checkLinks(
      [ENTRY],
      io(
        { [ENTRY]: page('@acme/ui/ui-card.fud'), [target]: component('ui-card') },
        {
          '@acme/ui/ui-card.fud': {
            outcome: 'package',
            path: target,
            target: { name: '@acme/ui', root: '/ws/libs/ui', config: libConfig },
          },
        },
      ),
    );
    expect(problems).toEqual([]);
  });
});

describe('the walk', () => {
  it('follows a library component into its own links', () => {
    // A library that links a broken specifier is a broken build, and the page that consumed
    // it is not where the mistake is — so the file reported is the library's.
    const card = '/ws/libs/ui/src/ui-card.fud';
    const problems = checkLinks(
      [ENTRY],
      {
        ...io(
          { [ENTRY]: page('@acme/ui/ui-card.fud'), [card]: component('ui-card', '@otra/rota/x.fud') },
          {
            '@acme/ui/ui-card.fud': {
              outcome: 'package',
              path: card,
              target: { name: '@acme/ui', root: '/ws/libs/ui', config: libConfig },
            },
          },
        ),
        resolve: (from, href) =>
          href === '@acme/ui/ui-card.fud'
            ? {
                outcome: 'package',
                path: card,
                target: { name: '@acme/ui', root: '/ws/libs/ui', config: libConfig },
              }
            : { outcome: 'unresolved', specifier: href, reason: 'not-installed' },
      },
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]?.file).toBe(card);
  });

  it('visits a shared component once, so one mistake is reported once', () => {
    const shared = '/ws/apps/tienda/src/components/app-card.fud';
    const other = '/ws/apps/tienda/src/routes/otra.fud';
    const problems = checkLinks([ENTRY, other], {
      ...io({
        [ENTRY]: page('../components/app-card.fud'),
        [other]: page('../components/app-card.fud'),
        [shared]: component('app-card', '@acme/rota/x.fud'),
      }),
      resolve: (from, href) =>
        href.startsWith('@')
          ? { outcome: 'unresolved', specifier: href, reason: 'not-installed' }
          : { outcome: 'path', path: shared },
    });

    expect(problems).toHaveLength(1);
  });

  it('stops at a file that is not there, and says nothing about it', () => {
    // A path that does not exist is `FUD0460`'s business: it has a span, and a second,
    // span-less copy here would be one mistake said twice.
    const problems = checkLinks([ENTRY], io({ [ENTRY]: page('./no-existe.fud') }));
    expect(problems).toEqual([]);
  });

  it('ignores an entry that is not there', () => {
    expect(checkLinks(['/ws/no-existe.fud'], io({}))).toEqual([]);
  });

  it('ignores a link with no href and one with an empty href', () => {
    const source = '<!DOCTYPE html>\n<html><head><link rel="component"><link rel="component" href=""></head><body></body></html>\n';
    expect(checkLinks([ENTRY], io({ [ENTRY]: source }))).toEqual([]);
  });

  it('says nothing about an href that is a URL', () => {
    const problems = checkLinks([ENTRY], {
      ...io({ [ENTRY]: page('https://cdn.example.com/card.fud') }),
      resolve: (from, href) => ({ outcome: 'external', href }),
    });
    expect(problems).toEqual([]);
  });

  it('checks a route’s layout link as well as its components', () => {
    const route = '/ws/apps/tienda/src/routes/blog.fud';
    const source = '<link rel="layout" href="@acme/rota/_layout.fud">\n<h1>blog</h1>\n';
    const problems = checkLinks([route], {
      read: (path) => (path === route ? source : undefined),
      resolve: (from, href) => ({ outcome: 'unresolved', specifier: href, reason: 'not-installed' }),
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]?.code).toBe('FUD0760');
  });
});
