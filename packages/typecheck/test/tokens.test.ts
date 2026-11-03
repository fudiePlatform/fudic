/**
 * The style tokens a project sees (SDD-63 §3.3, §4.3 and §6.8–6.10).
 *
 * Over a package tree held in a `Record` for the rules, and over the real two-app workspace for
 * the order and the places a real chain gives.
 */

import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import type { PackageFs } from '@fudic/resolve';
import { projectTokens, type Token } from '../src/tokens.js';

/** A `PackageFs` over a map of path → contents, with every path its own real name. */
const memoryPackages = (files: Readonly<Record<string, string>>): PackageFs => ({
  readFile: (path) => files[path],
  realPath: (path) => path,
});

const APP = '/w/app';
const LIB = '/w/app/node_modules/@acme/guia';

/** An app that depends on one library, with `css` as its sheets and `config` as its fudic.json. */
function tree(
  sheets: Readonly<Record<string, string>>,
  appConfig: object = { globalStyles: { app: 'app.css' }, styles: { extra: 'extra.css' } },
): Readonly<Record<string, string>> {
  return {
    [`${APP}/package.json`]: JSON.stringify({ name: 'app', dependencies: { '@acme/guia': '1' } }),
    [`${APP}/fudic.json`]: JSON.stringify({ id: 'app', kind: 'app', prefix: 'app', ...appConfig }),
    [`${LIB}/package.json`]: JSON.stringify({ name: '@acme/guia' }),
    [`${LIB}/fudic.json`]: JSON.stringify({ kind: 'lib', globalStyles: { tokens: 'tokens.css' } }),
    ...Object.fromEntries(Object.entries(sheets).map(([path, css]) => [path, css])),
  };
}

const names = (tokens: readonly Token[]): readonly string[] => tokens.map((token) => token.name);

describe('projectTokens', () => {
  const LIB_CSS =
    ':host {\n' +
    '  /** Main action background. */\n' +
    '  --acme-color-primary:  oklch(55% 0.2 260) ;\n' +
    '  --acme-ink: #111;\n' +
    '  color: red;\n' +
    '}\n';
  const files = tree({
    [`${LIB}/tokens.css`]: LIB_CSS,
    [`${APP}/app.css`]: ':root { --app-space: 4px; }',
    [`${APP}/extra.css`]: ':host { --app-extra: 1; --acme-ink: #222; }',
  });
  const { tokens, diagnostics } = projectTokens(APP, memoryPackages(files));

  it("lists the library's tokens first, then the project's global ones, then its optional ones", () => {
    expect(diagnostics).toEqual([]);
    expect(names(tokens)).toEqual([
      '--acme-color-primary',
      '--acme-ink',
      '--app-space',
      '--app-extra',
      '--acme-ink',
    ]);
  });

  it('says what each token is, where it comes from and where it is declared', () => {
    const [primary, ink] = tokens as [Token, Token];

    expect(primary).toEqual({
      name: '--acme-color-primary',
      value: 'oklch(55% 0.2 260)',
      group: 'color',
      doc: 'Main action background.',
      from: '@acme/guia',
      style: { name: 'tokens', global: true },
      path: `${LIB}/tokens.css`,
      span: primary.span,
    });
    expect(LIB_CSS.slice(primary.span.start, primary.span.end)).toBe(
      '--acme-color-primary:  oklch(55% 0.2 260)',
    );
    // Two segments, no group; no comment, no doc.
    expect(ink).not.toHaveProperty('group');
    expect(ink).not.toHaveProperty('doc');
  });

  it("marks the project's own tokens with a null package, and an optional style as not global", () => {
    expect(tokens[2]).toMatchObject({ from: null, style: { name: 'app', global: true } });
    expect(tokens[3]).toMatchObject({ from: null, style: { name: 'extra', global: false } });
  });

  it('keeps a name declared twice, in the order CSS lets the last one win', () => {
    expect(tokens.filter((token) => token.name === '--acme-ink').map((token) => token.value)).toEqual([
      '#111',
      '#222',
    ]);
  });
});

describe('what a token is (§6.9)', () => {
  /** The tokens of an app whose only sheet is `css`. */
  const tokensOf = (css: string): readonly string[] =>
    names(
      projectTokens(
        APP,
        memoryPackages(tree({ [`${LIB}/tokens.css`]: '', [`${APP}/app.css`]: css }, { globalStyles: { app: 'app.css' } })),
      ).tokens,
    );

  it('is declared in `:host`, `:root` or a list of both', () => {
    expect(tokensOf(':host { --a: 1; } :root { --b: 2; } :root , :host { --c: 3; }')).toEqual([
      '--a',
      '--b',
      '--c',
    ]);
  });

  it('is never a custom property of any other rule', () => {
    expect(tokensOf('.card { --local: 1; } :host .x { --scoped: 1; } :host, .card { --mixed: 1; }')).toEqual(
      [],
    );
  });

  it('is never a property of a rule nested inside `:host`', () => {
    expect(tokensOf(':host { --a: 1; .x { --nested: 1; } }')).toEqual(['--a']);
  });

  it('is read inside `@layer`, and not inside `@media` nor from an at-statement', () => {
    const css =
      '@layer base;\n' +
      '@layer base { :host { --layered: 1; } @layer inner { :root { --deeper: 1; } } }\n' +
      '@media (width > 1px) { :host { --media: 1; } }\n' +
      '@font-face { --font: 1; }';

    expect(tokensOf(css)).toEqual(['--layered', '--deeper']);
  });
});

describe('a sheet that cannot be read (§6.10)', () => {
  it('gives the parse error against the sheet, and the tokens of the other sheets', () => {
    const files = tree({
      [`${LIB}/tokens.css`]: ':host { --lib: 1; }',
      [`${APP}/app.css`]: ':host { --broken: 1;',
      [`${APP}/extra.css`]: ':host { --extra: 1; }',
    });
    const { tokens, diagnostics } = projectTokens(APP, memoryPackages(files));

    expect(names(tokens)).toContain('--lib');
    expect(names(tokens)).toContain('--extra');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ code: 'FUD0851', file: `${APP}/app.css` });
  });

  it("gives the configuration's diagnostic against the fudic.json of the package that lists it", () => {
    const files = tree(
      { [`${LIB}/tokens.css`]: ':host { --lib: 1; }', [`${APP}/extra.css`]: ':host { --extra: 1; }' },
      // `app` names a sheet that is not there; `extra` is named twice.
      { globalStyles: { app: 'missing.css', extra: 'extra.css' }, styles: { extra: 'extra.css' } },
    );
    const { tokens, diagnostics } = projectTokens(APP, memoryPackages(files));

    expect(names(tokens)).toEqual(['--lib', '--extra']);
    expect(diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.file])).toEqual([
      ['FUD0740', `${APP}/fudic.json`],
      ['FUD0741', `${APP}/fudic.json`],
    ]);
  });
});

describe('the two-app workspace (§6.8)', () => {
  const tienda = fileURLToPath(new URL('../../../examples/workspace/apps/tienda', import.meta.url));
  const { tokens, diagnostics } = projectTokens(tienda);

  it("lists the guide's tokens before the app's own, with their package, path and span", () => {
    expect(diagnostics).toEqual([]);

    const guide = tokens.filter((token) => token.from === '@fudic/example-guia');
    const own = tokens.filter((token) => token.from === null);
    expect(names(guide)).toEqual(['--guia-ink', '--guia-line', '--guia-accent', '--guia-radius', '--guia-pad']);
    expect(names(own)).toEqual(['--guia-accent']);
    expect(tokens.indexOf(guide[0]!)).toBeLessThan(tokens.indexOf(own[0]!));

    const accent = guide[2]!;
    expect(accent).toMatchObject({ value: '#0b5fff', style: { name: 'tokens', global: true } });
    expect(accent.path.endsWith('/examples/workspace/libs/guia/tokens.css')).toBe(true);
    expect(own[0]!.path.endsWith('/examples/workspace/apps/tienda/src/tienda.css')).toBe(true);
    expect(accent.span.end).toBeGreaterThan(accent.span.start);
  });
});
