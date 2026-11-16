/**
 * The bulbs of Baseline (SDD-83 §3.11): over a `FUD1524`, allow its feature in the project, see it on
 * webstatus.dev and, in CSS, guard it with `@supports`; over the Baseline warnings of a `fudic.json`,
 * raise the level, allow what a library uses, follow an id that moved and take out an id nothing uses.
 *
 * «Move to `@supports`» writes a rule of its own after the one it leaves, never one nested in it: a
 * separate rule works at any level, nesting is from December 2023 and a project may ask for less
 * (§8.1, decision 18).
 */

import { status } from '@fudic/baseline';
import { feature, FLOOR } from '@fudic/baseline/config';
import { parseCssRules, type CssRule, type StyleRule } from '@fudic/compiler';
import type { FudCode, Span } from '@fudic/diagnostics';
import type { CodeAction } from '@volar/language-service';
import type { TextEdit } from '../json-edit.js';
import {
  allowEdit,
  removeAllowEdit,
  removePolicyEntryEdit,
  replaceAllowEdit,
  targetEdit,
} from './config-edits.js';
import { configAction, silenceable, turnOffAction, type ConfigFile, type ShownDiagnostic } from './suppressions.js';

/** The client command that opens a web page (`fudic-vscode`). Argument: the url. */
export const OPEN_URL_COMMAND = 'fudic.openUrl';

/** The compat key a `FUD1524` message names, between the parentheses after the name. */
export function keyOfBaselineMessage(message: string): string | undefined {
  return /\(([^()\s]+)\) is newer than this project's Baseline/u.exec(message)?.[1];
}

/** The web-features ids a `FUD1526` message lists, after its last colon. */
export function featuresOfLibraryMessage(message: string): string[] {
  return /does not accept: (.*)$/u.exec(message)?.[1]!.split(', ') ?? [];
}

/**
 * «Allow `<id>` in the project» and «See on webstatus.dev» for each feature of a `FUD1524`'s key: most
 * keys are of one feature, a few of two (`audio` and `video` share `HTMLMediaElement`).
 */
export function baselineFeatureActions(diagnostic: ShownDiagnostic, config: ConfigFile | undefined): CodeAction[] {
  const key = keyOfBaselineMessage(diagnostic.message);
  const features = key === undefined ? [] : (status(key)?.features ?? []);
  return features.flatMap((id) => {
    const allow = config === undefined ? undefined : allowEdit(config.text, [id]);
    const url = `https://webstatus.dev/features/${id}`;
    return [
      ...(config === undefined || allow === undefined ? [] : [configAction(`Allow ${id} in the project`, config, allow)]),
      { title: `See ${id} on webstatus.dev`, kind: 'quickfix', command: { title: url, command: OPEN_URL_COMMAND, arguments: [url] } },
    ];
  });
}

/** A repair of a stylesheet: a title and its edits, over the sheet's own offsets. */
export interface CssFix {
  readonly title: string;
  readonly edits: readonly TextEdit[];
}

/** Where a rule sits: nested in another style rule or not. Only a rule that is not can be moved whole. */
interface Found {
  readonly rule: StyleRule;
  readonly nested: boolean;
}

/** The style rule whose own text holds `at` with `inside`, the innermost one. */
function ruleAt(rules: readonly CssRule[], at: number, inside: (rule: StyleRule) => boolean, nested = false): Found | undefined {
  for (const rule of rules) {
    if (at < rule.span.start || at >= rule.span.end) continue;
    if (rule.type === 'at-statement') return undefined;
    if (rule.type === 'at-block') return ruleAt(rule.children ?? [], at, inside, nested);
    return ruleAt(rule.children, at, inside, true) ?? (inside(rule) ? { rule, nested } : undefined);
  }
  return undefined;
}

/**
 * The `@supports` repairs of a `FUD1524` at `at` of `css`: «Move to `@supports`» on a declaration,
 * «Wrap in `@supports selector(…)`» on a selector. None in a rule nested in another, whose selector
 * the guard would have to resolve against its parent.
 */
export function supportsFixes(css: string, at: Span): CssFix[] {
  const rules = parseCssRules(css).value.rules;
  const declared = ruleAt(rules, at.start, (rule) => rule.declarations.some((d) => d.span.start <= at.start && at.start < d.span.end));
  if (declared !== undefined) return declared.nested ? [] : [moveFix(css, declared.rule, at.start)];
  const selected = ruleAt(rules, at.start, (rule) => rule.prelude.start <= at.start && at.start < rule.prelude.end);
  return selected === undefined || selected.nested ? [] : [wrapFix(css, selected.rule, at)];
}

/** The declaration out of its rule, and a rule of its own behind it, under `@supports (p: v)`. */
function moveFix(css: string, rule: StyleRule, at: number): CssFix {
  const declaration = rule.declarations.find((d) => d.span.start <= at && at < d.span.end)!;
  const written = `${css.slice(declaration.span.start, declaration.value.start).replace(/\s*:\s*$/u, '')}: ${css.slice(declaration.value.start, declaration.value.end)}`;
  const indent = indentOf(css, rule.span.start);
  const unit = unitOf(css);
  const selector = css.slice(rule.prelude.start, rule.prelude.end);
  const block = `@supports (${written}) {\n${indent}${unit}${selector} { ${written}; }\n${indent}}`;
  const title = `Move to @supports (${written})`;
  if (rule.declarations.length === 1 && rule.children.length === 0) {
    return { title, edits: [{ span: rule.span, newText: block }] };
  }
  return { title, edits: [declarationRemoval(css, declaration.span), { span: { start: rule.span.end, end: rule.span.end }, newText: `\n\n${indent}${block}` }] };
}

/** The declaration at `span` with its `;`, and its line when nothing else is on it. */
function declarationRemoval(css: string, span: Span): TextEdit {
  const semicolon = /^\s*;/u.exec(css.slice(span.end))?.[0].length ?? 0;
  const end = span.end + semicolon;
  const lineStart = css.lastIndexOf('\n', span.start - 1) + 1;
  const rest = /^[ \t]*(?:\r?\n|$)/u.exec(css.slice(end));
  if (css.slice(lineStart, span.start).trim() === '' && rest !== null) {
    return { span: { start: lineStart, end: end + rest[0].length }, newText: '' };
  }
  return { span: { start: span.start, end: end + (/^[ \t]*/u.exec(css.slice(end))![0].length) }, newText: '' };
}

/** The whole rule inside `@supports selector(…)` of what the selector warns about. */
function wrapFix(css: string, rule: StyleRule, at: Span): CssFix {
  // Its arguments too, when it has them: `:state(open)`, nested up to two levels as `:is(:not(a))`.
  const args = /^\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)/u.exec(css.slice(at.end))?.[0] ?? '';
  const guard = `${css.slice(at.start, at.end)}${args}`;
  const indent = indentOf(css, rule.span.start);
  const unit = unitOf(css);
  const body = css.slice(rule.span.start, rule.span.end).replace(/\n/gu, `\n${unit}`);
  return {
    title: `Wrap in @supports selector(${guard})`,
    edits: [{ span: rule.span, newText: `@supports selector(${guard}) {\n${indent}${unit}${body}\n${indent}}` }],
  };
}

function indentOf(text: string, offset: number): string {
  const line = text.lastIndexOf('\n', offset - 1) + 1;
  return /^[ \t]*/u.exec(text.slice(line))![0];
}

/**
 * One step of the sheet's indentation: the smallest difference between two of the indents its lines
 * use, two spaces when it uses one. Not the first indent: a `<style>` body is indented as a whole.
 */
function unitOf(text: string): string {
  const indents = [...new Set([...text.matchAll(/^([ \t]*)\S/gmu)].map((m) => m[1]!))].sort((a, b) => a.length - b.length);
  const steps = indents.slice(1).map((indent, i) => indent.slice(indents[i]!.length));
  return steps.sort((a, b) => a.length - b.length)[0] ?? '  ';
}

/** The year whose level first holds every browser fudic needs: what «Raise to …» writes. */
export const FLOOR_YEAR = Number(FLOOR.slice(0, 4));

/**
 * The bulbs over the diagnostics of a `fudic.json`: its own Baseline and policy repairs, and «Turn
 * FUDnnnn off in the project» for a code that is not an error, since the file has no comments.
 */
export function configFileActions(config: ConfigFile, diagnostics: readonly ShownDiagnostic[]): CodeAction[] {
  const actions: CodeAction[] = [];
  for (const diagnostic of diagnostics) {
    const repair = configRepair(config, diagnostic);
    if (repair !== undefined) actions.push(configAction(repair.title, config, repair.edit));
    const off = silenceable(diagnostic.code) ? turnOffAction(config, diagnostic.code) : undefined;
    if (off !== undefined) actions.push(off);
  }
  return actions;
}

type ConfigRepair = (config: ConfigFile, diagnostic: ShownDiagnostic) => { readonly title: string; readonly edit: TextEdit | undefined } | undefined;

/** `FUD1527`: the id that moved or was split, changed to where it went; nothing for one that never existed. */
const followMoved: ConfigRepair = (config, d) => {
  // The id as written, a plain string: the reader points at nothing when it is spelled with escapes.
  const id = /^"([^"\\]+)"$/u.exec(config.text.slice(d.span.start, d.span.end))?.[1];
  const found = id === undefined ? undefined : feature(id);
  if (found === undefined || found.kind === 'feature') return undefined;
  return { title: `Change to ${found.to.join(', ')}`, edit: replaceAllowEdit(config.text, d.span, found.to) };
};

/** The repair of each Baseline and policy warning of a `fudic.json`, by code. */
const CONFIG_REPAIRS: ReadonlyMap<FudCode, ConfigRepair> = new Map<FudCode, ConfigRepair>([
  ['FUD1521', (config, d) => ({ title: 'Remove', edit: removePolicyEntryEdit(config.text, d.span) })],
  ['FUD1525', (config) => ({ title: `Raise to ${FLOOR_YEAR}`, edit: targetEdit(config.text, FLOOR_YEAR) })],
  ['FUD1526', (config, d) => ({ title: 'Allow them in the app', edit: allowEdit(config.text, featuresOfLibraryMessage(d.message)) })],
  ['FUD1527', followMoved],
  ['FUD1528', (config, d) => ({ title: 'Remove', edit: removeAllowEdit(config.text, d.span) })],
]);

function configRepair(config: ConfigFile, diagnostic: ShownDiagnostic): { readonly title: string; readonly edit: TextEdit } | undefined {
  const found = CONFIG_REPAIRS.get(diagnostic.code)?.(config, diagnostic);
  return found?.edit === undefined ? undefined : { title: found.title, edit: found.edit };
}
