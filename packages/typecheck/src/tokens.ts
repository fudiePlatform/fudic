/**
 * `@fudic/typecheck/tokens` — the style tokens a project sees.
 *
 * A token is a custom property (`--x: …`) declared in a `:host` or `:root` rule of a sheet the
 * project lists in `globalStyles` or `styles`, or that a library of its chain lists. `:host` is
 * how a sheet adopted into a shadow root is written; `:root`, how a page's is. A custom property
 * in any other rule is a variable local to that rule, not a token.
 *
 * Documented the way a prop is: a `/** … *\/` right before the declaration.
 *
 * Never throws. A sheet that cannot be read or parsed is a diagnostic and a list with fewer
 * tokens, never an exception in the middle of a hover.
 */

import { CONFIG_FILE, readProjectStyles, type ConfigIo } from '@fudic/config';
import { parseCssRules, type CssDeclaration, type CssRule, type Span } from '@fudic/compiler';
import type { FileDiagnostic } from '@fudic/diagnostics';
import { dependencyChain, nodePackageFs, type PackageFs } from '@fudic/resolve';
import { toPosix } from './paths.js';

/** One token, where it is declared and what it says. */
export interface Token {
  /** `--acme-color-primary`, as written. */
  readonly name: string;
  /** `oklch(55% 0.2 260)`, as written, trimmed. */
  readonly value: string;
  /** The second segment of the name when it has three or more: `--acme-color-primary` → `color`. */
  readonly group?: string;
  /** The `/** … *\/` right before its declaration. */
  readonly doc?: string;
  /** The package that declares it, or null for the project itself. */
  readonly from: string | null;
  /** The style that holds it, by its name in fudic.json, and whether every component adopts it. */
  readonly style: { readonly name: string; readonly global: boolean };
  /** The sheet. */
  readonly path: string;
  /** The declaration, over the sheet. */
  readonly span: Span;
}

/** What `projectTokens` returns: every token, and why a sheet gave none. */
export interface ProjectTokens {
  readonly tokens: readonly Token[];
  readonly diagnostics: readonly FileDiagnostic[];
}

/** What reading the tokens needs of the world: the dependency walk's port, nothing more. */
export type TokenIo = PackageFs;

/** The selectors a token is declared under. */
const TOKEN_SELECTORS = new Set([':host', ':root']);

/**
 * The tokens a project sees: its libraries' first, in dependency order, then its own; in each
 * package, its global styles before its optional ones. A name declared twice stays twice, in
 * that order — the last one wins in CSS, and the list says the same.
 */
export function projectTokens(root: string, io: TokenIo = nodePackageFs()): ProjectTokens {
  const project = toPosix(io.realPath(root));
  const config: ConfigIo = {
    exists: (path) => io.readFile(path) !== undefined,
    // `exists` answered first, and a file is not taken away between the two questions.
    read: (path) => io.readFile(path)!,
  };

  const tokens: Token[] = [];
  const diagnostics: FileDiagnostic[] = [];
  for (const pkg of dependencyChain(root, io)) {
    const from = pkg.root === project ? null : pkg.name;
    const styles = readProjectStyles(pkg.root, pkg.config, config);
    // `readProjectStyles` names the file it complains about as the author reads it; across a
    // chain, `fudic.json` alone does not say whose.
    for (const diagnostic of styles.diagnostics) {
      diagnostics.push({ ...diagnostic, file: `${pkg.root}/${CONFIG_FILE}` });
    }
    const sheets = [
      ...styles.global.map((sheet) => ({ sheet, global: true })),
      ...styles.optional.map((sheet) => ({ sheet, global: false })),
    ];
    for (const { sheet, global } of sheets) {
      const parsed = parseCssRules(sheet.css);
      for (const diagnostic of parsed.diagnostics) diagnostics.push({ ...diagnostic, file: sheet.path });
      const style = { name: sheet.specifier, global };
      for (const declared of declarationsOf(sheet.css, parsed.value.rules)) {
        const group = groupOf(declared.name);
        tokens.push({
          name: declared.name,
          value: sheet.css.slice(declared.value.start, declared.value.end),
          ...(group === undefined ? {} : { group }),
          ...(declared.doc === undefined ? {} : { doc: declared.doc.text }),
          from,
          style,
          path: sheet.path,
          span: declared.span,
        });
      }
    }
  }
  return { tokens, diagnostics };
}

/**
 * The custom properties declared directly in a `:host` or `:root` rule, also inside `@layer`.
 *
 * A rule nested in one of them has a selector of its own, so its properties are local to it.
 */
function declarationsOf(css: string, rules: readonly CssRule[]): readonly CssDeclaration[] {
  return rules.flatMap((rule) => {
    if (rule.type === 'at-block') {
      return rule.name === 'layer' ? declarationsOf(css, rule.children ?? []) : [];
    }
    if (rule.type !== 'style-rule' || !isTokenRule(css.slice(rule.prelude.start, rule.prelude.end))) {
      return [];
    }
    return rule.declarations.filter((declaration) => declaration.name.startsWith('--'));
  });
}

/** Every selector of the list is `:host` or `:root`: `:root, :host` declares tokens for both. */
function isTokenRule(prelude: string): boolean {
  return prelude.split(',').every((selector) => TOKEN_SELECTORS.has(selector.trim()));
}

/** The second segment of a name with three or more: `--acme-color-primary` → `color`. */
function groupOf(name: string): string | undefined {
  const segments = name.slice(2).split('-');
  return segments.length >= 3 ? segments[1] : undefined;
}
