/**
 * SDD-80 §3.1, §4.1, §4.2 and criteria 1–5: `runs remote`, `debounce` and the middlewares of a
 * rule — read, checked, formatted, and the module and declarations generated for them.
 */

import type { SourceDiagnostic } from '@fudic/diagnostics';
import { describe, expect, it } from 'vitest';
import type { Rule, runRulesWith } from '@fudic/forms/contract';
import {
  createApiIndex,
  emitDeclarations,
  emitModule,
  formatApi,
  GLOBAL_ID,
  parseApi,
  validateApi,
  type ApiSource,
  type RuleDecl,
} from '../src/index.js';
import { fnv1a, ruleCanonical } from '../src/emit/signature.js';
import { load } from './emit/_load.js';
import { slice } from './helpers.js';
import { BUILT_INS, app, codesOf } from './project.js';

const lines = (...l: string[]): string => l.join('\n');

/** The middlewares a rule may use: one that adds a user, and the `json` mark. */
const MIDDLEWARES = app(
  'middlewares/own',
  lines('middleware auth', '  server', '  adds', '    user  str', 'middleware rate-limit', '  server', '  per  u16?', 'middleware json'),
);

/** The diagnostics the parser gives, with the text each span covers. */
function parsed(text: string): readonly (readonly [string, string])[] {
  return parseApi(text).diagnostics.map((d: SourceDiagnostic) => [d.code, slice(text, d.span)] as const);
}

/** The rule of a one-rule file, as the parser builds it. */
const ruleOf = (text: string): RuleDecl => parseApi(text).value.declarations[0] as RuleDecl;

const REMOTE = lines('rule x', '  on field str', '  runs remote', '  fails x');

describe('the `.fudapi` reads a remote rule (criteria 1–3)', () => {
  it('criterion 1: `runs remote`, with and without `debounce`, has no diagnostics', () => {
    expect(codesOf(REMOTE)).toEqual([]);
    expect(codesOf(`${REMOTE}\n  debounce 0`)).toEqual([]);
    expect(codesOf(`${REMOTE}\n  debounce 500`)).toEqual([]);
    expect(ruleOf(`${REMOTE}\n  debounce 500`).debounce?.value.value).toBe(500);
    // `async` is redundant in a remote rule, and not reported.
    expect(codesOf(`${REMOTE}\n  async`)).toEqual([]);
  });

  it('a rule keeps its `use` and `skip` clauses, empty when it writes none', () => {
    expect(ruleOf(REMOTE)).toMatchObject({ uses: [], skips: [] });
    const rule = ruleOf(lines('rule x', '  runs remote', '  use auth rate-limit', '    per 10', '  skip *', '  fails x'));
    expect(rule.uses[0]!.middlewares.map((m) => [m.name.text, m.args.length])).toEqual([['auth', 0], ['rate-limit', 1]]);
    expect(rule.skips[0]!.all).toBeDefined();
    // Empty, each is FUD1063 and is not kept.
    expect(parsed(`${REMOTE}\n  use\n  skip`)).toEqual([['FUD1063', 'use'], ['FUD1063', 'skip']]);
    expect(ruleOf(`${REMOTE}\n  use\n  skip`)).toMatchObject({ uses: [], skips: [] });
  });

  it('criterion 2: `debounce` in a rule that is not remote is FUD1460 on `debounce`', () => {
    const text = lines('rule x', '  on field str', '  runs server', '  debounce 300', '  fails x');
    const { diagnostics } = checkOf(text);
    expect(diagnostics.map((d) => [d.code, slice(text, d.span)])).toEqual([['FUD1460', 'debounce']]);
    expect(diagnostics[0]!.message).toContain('runs `server`');
    // A rule without `runs` runs both: it is said so, besides the missing `runs`.
    const bare = checkOf(lines('rule x', '  on field str', '  debounce 300', '  fails x')).diagnostics;
    expect(bare.map((d) => d.code)).toEqual(['FUD1097', 'FUD1460']);
    expect(bare[1]!.message).toContain('runs `both`');
  });

  it('criterion 2: `debounce` without a value, with a word, twice, or with more after it', () => {
    expect(parsed(`${REMOTE}\n  debounce`)).toEqual([['FUD1063', 'debounce']]);
    expect(parsed(`${REMOTE}\n  debounce rápido`)).toEqual([['FUD1065', 'rápido']]);
    expect(parseApi(`${REMOTE}\n  debounce rápido`).diagnostics[0]!.message).toContain('`debounce`');
    expect(parsed(`${REMOTE}\n  debounce -1`)).toEqual([['FUD1065', '-1']]);
    expect(parsed(`${REMOTE}\n  debounce 300\n  debounce 200`)).toEqual([['FUD1071', 'debounce']]);
    // A second one is not read: the first counts.
    expect(ruleOf(`${REMOTE}\n  debounce 300\n  debounce 200`).debounce?.value.value).toBe(300);
    expect(parsed(`${REMOTE}\n  debounce 300 ms`)).toEqual([['FUD1064', 'ms']]);
    expect(parsed(`${REMOTE}\n  debounce 300\n    x`).map(([code]) => code)).toEqual(['FUD1065']);
    // A wrong first one is reported and still counts as the line: a second is a repetition.
    expect(parsed(`${REMOTE}\n  debounce\n  debounce 200`).map(([code]) => code)).toEqual(['FUD1063', 'FUD1071']);
  });

  it('criterion 3: `use` or `skip` in a `runs both` rule is FUD1461 on the keyword', () => {
    const text = lines('rule x', '  on field str', '  runs both', '  use auth', '  skip csrf', '  fails x');
    const global = app(GLOBAL_ID, 'chain\n  use csrf');
    const { diagnostics } = checkOf(text, [global]);
    expect(diagnostics.map((d) => [d.code, slice(text, d.span)])).toEqual([
      ['FUD1461', 'use'],
      ['FUD1461', 'skip'],
    ]);
    expect(diagnostics.map((d) => d.message)).toEqual([expect.stringContaining('`use` needs'), expect.stringContaining('`skip` needs')]);
  });

  it('criterion 3: in a `server` or `remote` rule they are checked as in a function', () => {
    for (const runs of ['server', 'remote']) {
      expect(codesOf(lines('rule x', '  on field str', `  runs ${runs}`, '  use auth', '  fails x'), { others: [MIDDLEWARES] })).toEqual([]);
      expect(codesOf(lines('rule x', '  on field str', `  runs ${runs}`, '  use nadie', '  fails x'))).toEqual(['FUD1080']);
      expect(codesOf(lines('rule x', '  on field str', `  runs ${runs}`, '  use rate-limit', '    per many', '  fails x'), { others: [MIDDLEWARES] })).toEqual(['FUD1087']);
    }
    // A rule inherits the global chain, and only that: a skip of what it does not inherit is FUD1086.
    const global = app(GLOBAL_ID, 'chain\n  use csrf');
    const skip = lines('rule x', '  on field str', '  runs remote', '  skip csrf', '  fails x');
    expect(codesOf(skip, { others: [global] })).toEqual([]);
    expect(codesOf(skip)).toEqual(['FUD1086']);
    // A rule in the global file itself inherits nothing.
    expect(codesOf(skip, { id: GLOBAL_ID })).toEqual(['FUD1086']);
  });

  it('`{detail}` is offered by a remote rule, as by a server one', () => {
    const remote = app('r', lines('rule taken', '  on field str', '  runs remote', '  fails taken'));
    expect(codesOf('form f\n  a  str\n    taken  "{detail}"', { others: [remote] })).toEqual([]);
  });
});

describe('the formatter (criterion 4)', () => {
  it('keeps `debounce` and `use` in place, with their indentation, idempotent', () => {
    const messy = lines('rule alias-taken', '  on field str', '  runs   remote', '  debounce    300', '  use auth', '    per 10', '  use json', '  fails alias-taken', '');
    // The parameter lines under a `use` line up as in a function: two spaces past the name.
    const formatted = lines('rule alias-taken', '  on field str', '  runs remote', '  debounce 300', '  use auth', '    per  10', '  use json', '  fails alias-taken', '');
    expect(formatApi(messy)).toBe(formatted);
    expect(formatApi(formatted)).toBe(formatted);
  });
});

/** A project with the rules file `rules/people` and, optionally, a global chain. */
function project(rules: string, global?: string): { readonly source: ApiSource; readonly sources: readonly ApiSource[] } {
  const source = app('rules/people', rules);
  const others = global === undefined ? [MIDDLEWARES] : [MIDDLEWARES, app(GLOBAL_ID, global)];
  return { source, sources: [...BUILT_INS, ...others, source] };
}

const emit = (rules: string, side: 'server' | 'browser', global?: string): string => {
  const { source, sources } = project(rules, global);
  return emitModule(source, createApiIndex(sources), {}, side);
};

const declarations = (rules: string): string => {
  const { source, sources } = project(rules);
  return emitDeclarations(source, createApiIndex(sources), {});
};

const ALIAS = lines('rule alias-taken', '  on field str', '  runs remote', '  fails alias-taken');

describe('the module generated (criterion 5, SDD §4.2)', () => {
  it('criterion 5: the browser variant of a remote rule has no `never` and no check', () => {
    const browser = emit(ALIAS, 'browser');
    const sig = fnv1a(ruleCanonical(ruleOf(ALIAS), createApiIndex(project(ALIAS).sources)));
    expect(browser).toContain(
      `export const aliasTaken = rule({ id: "rules/people", name: "alias-taken", fails: [["alias-taken", []]], remote: true, async: true, debounce: 300, ask: askRemote, send: ruleSend("alias-taken", () => [{ steps: [] }]), value: "str", params: {  }, wire: binWire, sig: "${sig}" });`,
    );
    expect(browser).not.toContain('never');
    // No chain of its own to run around a check: the question walks the client halves (§8.2.28).
    expect(browser).not.toContain('chain:');
    expect(browser).toContain("import { ruleSend } from '@fudic/http/contract';");
    // With a global chain, its client halves come first, imported as in a function.
    expect(emit(ALIAS, 'browser', 'chain\n  use csrf')).toContain('send: ruleSend("alias-taken", () => [$global, { steps: [] }])');
    expect(browser).toContain("import { binWire } from '@fudic/http/wire/bin';");
  });

  it('criterion 5: `.check()` throws in the browser', async () => {
    const { sources } = project(ALIAS);
    const browser = load(createApiIndex(sources), sources, 'browser');
    const { aliasTaken } = await browser.module<{ aliasTaken: Rule<string, {}> }>('rules/people');
    expect(() => aliasTaken.check(() => true)).toThrow('alias-taken of rules/people must be implemented in src/server');
  });

  it('the server variant: `server`, `remote`, `async`, its chain, its format and signature', () => {
    const server = emit(ALIAS, 'server');
    expect(server).toMatch(/rule\(\{ [^}]*fails: \[\["alias-taken", \[\]\]\], server: true, remote: true, async: true, value: "str", params: \{ {2}\}, wire: binWire, sig: "[0-9a-f]{8}", chain: \[\{ steps: \[\] \}\] \}\);/u);
    expect(server).not.toContain('debounce');
    // With a global chain, it is the first level, imported as in a function.
    const global = emit(ALIAS, 'server', 'chain\n  use csrf');
    expect(global).toContain('chain: [$global, { steps: [] }]');
    expect(global).toContain(`import { $chain as $global } from "fudic:${GLOBAL_ID}";`);
  });

  it('the server variant can be implemented and run', async () => {
    const { sources } = project(ALIAS);
    const server = load(createApiIndex(sources), sources, 'server');
    const { aliasTaken } = await server.module<{ aliasTaken: Rule<string, {}, never, unknown> }>('rules/people');
    aliasTaken.check((value) => value !== 'admin');
    // Its chain runs through the runner `@fudic/http` installs on the server; here, one that only calls the check.
    const forms = await server.entry<{ runRulesWith: typeof runRulesWith }>('@fudic/forms/contract');
    forms.runRulesWith((_levels, ctx, inner) => inner(ctx));
    const validator = aliasTaken.use() as unknown as (value: string) => unknown;
    expect(await validator('admin')).toEqual({ aliasTaken: true });
    expect(await validator('pedro')).toBeNull();
  });

  it('`debounce`, `use` and `use json` reach the module', () => {
    const rules = lines('rule alias-taken', '  on field str', '  runs remote', '  debounce 0', '  use auth', '  use json', '  fails alias-taken');
    const browser = emit(rules, 'browser');
    expect(browser).toContain('debounce: 0');
    expect(browser).toContain('wire: jsonWire');
    expect(browser).not.toContain('sig:');
    expect(browser).toContain("import { jsonWire } from '@fudic/http/wire/json';");
    const server = emit(rules, 'server');
    expect(server).toContain('chain: [{ steps: [{ use: [use(auth)] }, { use: [use(json)] }] }]');
  });

  it('the value is the one type of `on field`, or `any`', () => {
    const remote = (on: string): string => emit(lines('rule r', `  on ${on}`, '  runs remote', '  limit  u8', '  fails r limit'), 'browser');
    expect(remote('field u8')).toContain('value: "u8", params: { limit: "u8" }');
    expect(remote('field str u8')).toContain('value: "any"');
    expect(remote('field *')).toContain('value: "any"');
    expect(remote('field str[]')).toContain('value: { list: "str" }');
    expect(remote('group')).toContain('value: "any"');
    expect(remote('form')).toContain('value: "any"');
  });

  it('a server rule carries its chain only when it has middlewares, and keeps `never` in the browser', () => {
    const plain = lines('rule taken', '  on field str', '  runs server', '  fails taken');
    expect(emit(plain, 'server')).toContain('fails: [["taken", []]], server: true });');
    expect(emit(plain, 'browser')).toContain('fails: [["taken", []]], server: true, never: true });');
    const used = lines('rule taken', '  on field str', '  runs server', '  async', '  use auth', '  fails taken');
    expect(emit(used, 'server')).toContain('server: true, async: true, chain: [{ steps: [{ use: [use(auth)] }] }] });');
    expect(emit(used, 'browser')).toContain('server: true, async: true, never: true });');
    const skips = lines('rule taken', '  on field str', '  runs server', '  skip csrf', '  fails taken');
    expect(emit(skips, 'server', 'chain\n  use csrf')).toContain('chain: [$global, { steps: [{ skip: [csrf] }] }]');
    // A `both` rule, never.
    expect(emit(lines('rule ok', '  on field str', '  runs both', '  fails ok'), 'server')).toContain('fails: [["ok", []]] });');
  });

  it('the signature says the value and the parameters, and nothing else', () => {
    const index = createApiIndex(project(ALIAS).sources);
    expect(ruleCanonical(ruleOf(ALIAS), index)).toBe('rule(str)|params()|->str?');
    const withParams = ruleOf(lines('rule r', '  on group', '  runs remote', '  limit  u8', '  fails r'));
    expect(ruleCanonical(withParams, index)).toBe('rule(any)|params(limit:u8)|->str?');
    const bare = ruleOf(lines('rule r', '  runs remote', '  fails r'));
    expect(ruleCanonical(bare, index)).toBe('rule(any)|params()|->str?');
  });
});

describe('the declarations (SDD §3.2, §4.2)', () => {
  it('a rule the server runs is given its `ctx`, with what its middlewares add', () => {
    const d = declarations(lines('rule email-taken', '  on field str', '  runs remote', '  use auth', '  fails email-taken'));
    expect(d).toContain(`import type { ServerContext } from '@fudic/http/contract';`);
    expect(d).toContain(`export type EmailTakenCtx = ServerContext & import("fudic:middlewares/own").AuthAdds;`);
    expect(d).toContain('export const emailTaken: Rule<string, {}, never, EmailTakenCtx>;');
    expect(d).toContain('export type EmailTakenCheck = Check<string, {}, never, EmailTakenCtx>;');
    expect(declarations(lines('rule t', '  on field str', '  runs server', '  fails t'))).toContain('export type TCtx = ServerContext;');
  });

  it('a `runs both` rule has no `ctx`', () => {
    const d = declarations(lines('rule ok', '  on field str', '  runs both', '  fails ok'));
    expect(d).toContain('export type OkCheck = Check<string, {}, never>;');
    expect(d).not.toContain('ServerContext');
    expect(declarations(lines('rule ok', '  on field str', '  fails ok'))).not.toContain('Ctx');
  });
});

/** Validates `text` as `rules/x`, with the middlewares and `others` in the project. */
function checkOf(text: string, others: readonly ApiSource[] = []): { readonly diagnostics: readonly SourceDiagnostic[] } {
  const source = app('rules/x', text);
  return { diagnostics: validateApi(source, createApiIndex([...BUILT_INS, MIDDLEWARES, ...others, source]), {}) };
}
