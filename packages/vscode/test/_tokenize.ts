/**
 * The tokenisation harness for the TextMate grammar (SDD-25 §4.2).
 *
 * The grammar is data, so it never appears in the coverage report — and it is still half of
 * what this package contributes. This runs it under the same engine VS Code uses,
 * `vscode-textmate` over `vscode-oniguruma`, so a change to it fails a test instead of
 * failing quietly in someone's editor.
 *
 * **The embedded grammars are empty on purpose.** The real TypeScript, CSS and HTML
 * grammars ship inside VS Code and cannot be loaded from here. That is not a gap: what this
 * extension actually contributes is where each embedded region *begins and ends*, and that
 * is exactly what an empty grammar leaves visible. Asserting the colour of a TypeScript
 * keyword would be testing Microsoft's grammar, not ours.
 */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { INITIAL, Registry, parseRawGrammar, type IGrammar } from 'vscode-textmate';
import { OnigScanner, OnigString, loadWASM } from 'vscode-oniguruma';

const require = createRequire(import.meta.url);

/** The scopes the grammar embeds. Each is registered as a grammar with no patterns. */
const EMBEDDED = ['source.ts', 'source.css', 'source.js', 'text.html'] as const;

const onigLib = loadWASM(readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm')).buffer).then(
  () => ({
    createOnigScanner: (patterns: string[]) => new OnigScanner(patterns),
    createOnigString: (text: string) => new OnigString(text),
  }),
);

const registry = new Registry({
  onigLib,
  loadGrammar: async (scopeName) => {
    if (scopeName === 'text.html.fudic') {
      const path = fileURLToPath(new URL('../syntaxes/fudic.tmLanguage.json', import.meta.url));
      return parseRawGrammar(readFileSync(path, 'utf8'), path);
    }
    if ((EMBEDDED as readonly string[]).includes(scopeName)) {
      return parseRawGrammar(JSON.stringify({ scopeName, patterns: [] }), `${scopeName}.json`);
    }
    return null;
  },
});

let cached: IGrammar | undefined;

const grammar = async (): Promise<IGrammar> => {
  // One load for the whole run: the WASM engine and the grammar are immutable, and reloading
  // them per test turns a 300 ms suite into a 30 s one.
  cached ??= (await registry.loadGrammar('text.html.fudic')) ?? undefined;
  if (cached === undefined) throw new Error('the fudic grammar failed to load');
  return cached;
};

export interface Token {
  readonly text: string;
  readonly scopes: readonly string[];
  /** Zero-based line the token sits on. */
  readonly line: number;
}

/** Tokenises a whole document, line by line, exactly as the editor does. */
export const tokenize = async (source: string): Promise<Token[]> => {
  const g = await grammar();
  const tokens: Token[] = [];
  let stack = INITIAL;

  source.split(/\r\n|\n/).forEach((text, line) => {
    const result = g.tokenizeLine(text, stack);
    for (const token of result.tokens) {
      tokens.push({
        text: text.slice(token.startIndex, token.endIndex),
        scopes: token.scopes,
        line,
      });
    }
    stack = result.ruleStack;
  });

  return tokens;
};

/** Reads a fixture from `fixtures/`. */
export const fixture = (relative: string): string =>
  readFileSync(fileURLToPath(new URL(`../fixtures/${relative}`, import.meta.url)), 'utf8');

/** The first token whose text contains `needle`. Throws rather than returning undefined:
 *  a test that silently asserts on nothing is worse than one that fails. */
export const find = (tokens: readonly Token[], needle: string): Token => {
  const token = tokens.find((t) => t.text.includes(needle));
  if (token === undefined) throw new Error(`no token contains ${JSON.stringify(needle)}`);
  return token;
};

/**
 * The first token whose text is exactly `text`.
 *
 * Prefer this over `find` for short names: in the real corpus `nav` also occurs inside
 * `../components/site-nav.fud`, and a substring search would quietly assert about the
 * wrong token — the failure mode where a test passes for the wrong reason.
 */
export const findExact = (tokens: readonly Token[], text: string): Token => {
  const token = tokens.find((t) => t.text === text);
  if (token === undefined) throw new Error(`no token is exactly ${JSON.stringify(text)}`);
  return token;
};

/** Every token whose text contains `needle`. */
export const findAll = (tokens: readonly Token[], needle: string): Token[] =>
  tokens.filter((t) => t.text.includes(needle));

/**
 * The scopes a plain word gets when appended after `source` on its own line.
 *
 * This is the no-bleed probe, and it is the criterion §6.2 actually cares about. Asking
 * "does the last token look right" is not the same question: a file can end inside a
 * runaway string and still finish on a plausible-looking token. Appending a probe asks the
 * grammar directly whether it came back to the base scope.
 */
export const trailingScopes = async (source: string): Promise<readonly string[]> => {
  const probe = 'FUDIC_BLEED_PROBE';
  const tokens = await tokenize(`${source}\n${probe}`);
  return find(tokens, probe).scopes;
};

/** True when the token carries `scope`, or any scope nested under it. */
export const has = (token: Token, scope: string): boolean =>
  token.scopes.some((s) => s === scope || s.startsWith(`${scope}.`));
