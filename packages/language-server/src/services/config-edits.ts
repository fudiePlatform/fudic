/**
 * What the light bulb writes in a `fudic.json` (SDD-83 §3.11), as edits of its text. Each answers
 * `undefined` when the file is not JSON, or when the field it would touch is of a shape the reader
 * already refuses (`FUD0725`): a bulb that writes into a broken field makes two problems of one.
 */

import type { Span } from '@fudic/diagnostics';
import {
  appendItem,
  insertMember,
  memberOf,
  parseJson,
  removeEntry,
  type JsonArray,
  type TextEdit,
} from '../json-edit.js';

/** `"FUDnnnn": "off"` in `diagnostics`: the object created when there is none, the entry's level changed when there is one. */
export function turnOffEdit(text: string, code: string): TextEdit | undefined {
  const root = parseJson(text);
  if (root?.kind !== 'object') return undefined;
  const diagnostics = memberOf(root, 'diagnostics');
  if (diagnostics === undefined) return insertMember(text, root, 'diagnostics', `{ ${JSON.stringify(code)}: "off" }`);
  if (diagnostics.value.kind !== 'object') return undefined;
  const own = memberOf(diagnostics.value, code);
  if (own !== undefined) return { span: own.value.span, newText: '"off"' };
  return insertMember(text, diagnostics.value, code, '"off"');
}

/**
 * The ids in `baseline.allow`, the ones not already there. A `baseline` written as a level becomes
 * the object form with that level; with no `baseline`, the object form with `widely`, the default.
 */
export function allowEdit(text: string, ids: readonly string[]): TextEdit | undefined {
  const root = parseJson(text);
  if (root?.kind !== 'object') return undefined;
  const list = (wanted: readonly string[]): string => wanted.map((id) => JSON.stringify(id)).join(', ');
  const baseline = memberOf(root, 'baseline');
  if (baseline === undefined) return insertMember(text, root, 'baseline', `{ "target": "widely", "allow": [${list(ids)}] }`);
  const value = baseline.value;
  if (value.kind === 'scalar') {
    const target = text.slice(value.span.start, value.span.end);
    return { span: value.span, newText: `{ "target": ${target}, "allow": [${list(ids)}] }` };
  }
  if (value.kind !== 'object') return undefined;
  const allow = memberOf(value, 'allow');
  if (allow === undefined) return insertMember(text, value, 'allow', `[${list(ids)}]`);
  if (allow.value.kind !== 'array') return undefined;
  const written = new Set(allow.value.items.map((item) => (item.kind === 'scalar' ? item.value : undefined)));
  const missing = ids.filter((id) => !written.has(id));
  return missing.length === 0 ? undefined : appendItem(allow.value, list(missing));
}

/** The level of `baseline` set to `year`: its `target` in the object form, the value itself otherwise. */
export function targetEdit(text: string, year: number): TextEdit | undefined {
  const baseline = memberOf(parseJson(text), 'baseline');
  if (baseline === undefined) return undefined;
  if (baseline.value.kind === 'scalar') return { span: baseline.value.span, newText: String(year) };
  const target = memberOf(baseline.value, 'target');
  if (target !== undefined) return { span: target.value.span, newText: String(year) };
  return baseline.value.kind === 'object' ? insertMember(text, baseline.value, 'target', String(year)) : undefined;
}

/** The entry of `diagnostics` whose key is written at `keySpan`, taken out. */
export function removePolicyEntryEdit(text: string, keySpan: Span): TextEdit | undefined {
  const diagnostics = memberOf(parseJson(text), 'diagnostics')?.value;
  if (diagnostics?.kind !== 'object') return undefined;
  const index = diagnostics.members.findIndex((member) => member.keySpan.start === keySpan.start);
  return index < 0 ? undefined : removeEntry(diagnostics, index);
}

/** The id of `allow` written at `idSpan`, taken out. */
export function removeAllowEdit(text: string, idSpan: Span): TextEdit | undefined {
  const found = allowItemAt(text, idSpan);
  return found === undefined ? undefined : removeEntry(found.allow, found.index);
}

/** The id of `allow` written at `idSpan`, replaced by `to`. */
export function replaceAllowEdit(text: string, idSpan: Span, to: readonly string[]): TextEdit | undefined {
  const found = allowItemAt(text, idSpan);
  if (found === undefined) return undefined;
  return { span: found.allow.items[found.index]!.span, newText: to.map((id) => JSON.stringify(id)).join(', ') };
}

function allowItemAt(text: string, idSpan: Span): { readonly allow: JsonArray; readonly index: number } | undefined {
  const allow = memberOf(memberOf(parseJson(text), 'baseline')?.value, 'allow')?.value;
  if (allow?.kind !== 'array') return undefined;
  const index = allow.items.findIndex((item) => item.span.start === idSpan.start);
  return index < 0 ? undefined : { allow, index };
}
