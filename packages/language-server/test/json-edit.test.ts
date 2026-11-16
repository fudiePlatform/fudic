/**
 * SDD-83 §3.11: the edits the bulbs make to a `fudic.json` — read with the span of every value, and
 * written as one replacement that keeps the author's layout.
 */

import { describe, expect, it } from 'vitest';
import { appendItem, insertMember, memberOf, parseJson, removeEntry, type JsonArray, type JsonObject, type TextEdit } from '../src/json-edit.js';
import {
  allowEdit,
  removeAllowEdit,
  removePolicyEntryEdit,
  replaceAllowEdit,
  targetEdit,
  turnOffEdit,
} from '../src/services/config-edits.js';

const apply = (text: string, edit: TextEdit | undefined): string =>
  edit === undefined ? text : text.slice(0, edit.span.start) + edit.newText + text.slice(edit.span.end);

describe('reading JSON with its spans', () => {
  it('reads every kind of value, and the spans of keys and values', () => {
    const text = '{ "a": [1, -2.5e3, true, false, null, "x\\"y"], "b": {}, "c": [] }';
    const root = parseJson(text) as JsonObject;
    expect(root.members.map((m) => m.key)).toEqual(['a', 'b', 'c']);
    const a = root.members[0]!;
    expect(text.slice(a.keySpan.start, a.keySpan.end)).toBe('"a"');
    expect((a.value as JsonArray).items.map((item) => (item.kind === 'scalar' ? item.value : item.kind))).toEqual([1, -2500, true, false, null, 'x"y']);
    expect(memberOf(root, 'b')?.value.kind).toBe('object');
    expect(memberOf(root, 'nope')).toBeUndefined();
    expect(memberOf(a.value, 'x')).toBeUndefined();
  });

  it('is undefined for what is not JSON', () => {
    for (const text of ['', '{', '{ "a" 1 }', '{ a: 1 }', '{ "a": }', '{ "a": 1 ', '{ "a": 1; }', '[1 2]', '[1,', '[', 'nope', '"open', '{} x']) {
      expect(parseJson(text), text).toBeUndefined();
    }
  });
});

describe('editing objects and arrays', () => {
  it('a member at the end of an object over several lines, indented like its siblings', () => {
    const text = '{\n    "id": "x"\n}';
    expect(apply(text, insertMember(text, parseJson(text) as JsonObject, 'k', '1'))).toBe('{\n    "id": "x",\n    "k": 1\n}');
  });

  it('inline in an object written on one line, and in an empty one', () => {
    const one = '{ "id": "x" }';
    expect(apply(one, insertMember(one, parseJson(one) as JsonObject, 'k', '1'))).toBe('{ "id": "x", "k": 1 }');
    expect(apply('{}', insertMember('{}', parseJson('{}') as JsonObject, 'k', '1'))).toBe('{ "k": 1 }');
    const open = '{\n}';
    expect(apply(open, insertMember(open, parseJson(open) as JsonObject, 'k', '1'))).toBe('{\n  "k": 1\n}');
    const nested = '{\n\t"a": {\n\t}\n}';
    const inner = memberOf(parseJson(nested), 'a')!.value as JsonObject;
    expect(apply(nested, insertMember(nested, inner, 'k', '1'))).toBe('{\n\t"a": {\n\t\t"k": 1\n\t}\n}');
  });

  it('an item after the last one, or into an empty array', () => {
    expect(apply('[1]', appendItem(parseJson('[1]') as JsonArray, '2'))).toBe('[1, 2]');
    expect(apply('[]', appendItem(parseJson('[]') as JsonArray, '2'))).toBe('[2]');
  });

  it('an entry out, with its comma, whichever it is', () => {
    const text = '{\n  "a": 1,\n  "b": 2,\n  "c": 3\n}';
    const root = parseJson(text) as JsonObject;
    expect(apply(text, removeEntry(root, 0))).toBe('{\n  "b": 2,\n  "c": 3\n}');
    expect(apply(text, removeEntry(root, 2))).toBe('{\n  "a": 1,\n  "b": 2\n}');
    expect(apply('[1]', removeEntry(parseJson('[1]') as JsonArray, 0))).toBe('[]');
  });
});

describe('what the bulbs write in fudic.json', () => {
  it('turns a code off: the object created, an entry added, an entry changed', () => {
    expect(apply('{ "id": "x" }', turnOffEdit('{ "id": "x" }', 'FUD1380'))).toBe('{ "id": "x", "diagnostics": { "FUD1380": "off" } }');
    const some = '{ "diagnostics": { "warnings": "error" } }';
    expect(apply(some, turnOffEdit(some, 'FUD1380'))).toBe('{ "diagnostics": { "warnings": "error", "FUD1380": "off" } }');
    const own = '{ "diagnostics": { "FUD1380": "error" } }';
    expect(apply(own, turnOffEdit(own, 'FUD1380'))).toBe('{ "diagnostics": { "FUD1380": "off" } }');
    expect(turnOffEdit('[]', 'FUD1380')).toBeUndefined();
    expect(turnOffEdit('{ "diagnostics": [] }', 'FUD1380')).toBeUndefined();
  });

  it('allows a feature: in each shape baseline can have', () => {
    expect(apply('{}', allowEdit('{}', ['popover']))).toBe('{ "baseline": { "target": "widely", "allow": ["popover"] } }');
    const level = '{ "baseline": 2024 }';
    expect(apply(level, allowEdit(level, ['popover']))).toBe('{ "baseline": { "target": 2024, "allow": ["popover"] } }');
    const object = '{ "baseline": { "target": "newly" } }';
    expect(apply(object, allowEdit(object, ['state']))).toBe('{ "baseline": { "target": "newly", "allow": ["state"] } }');
    const listed = '{ "baseline": { "allow": ["popover"] } }';
    expect(apply(listed, allowEdit(listed, ['popover', 'state']))).toBe('{ "baseline": { "allow": ["popover", "state"] } }');
    expect(allowEdit(listed, ['popover'])).toBeUndefined();
    const odd = '{ "baseline": { "allow": [[]] } }';
    expect(apply(odd, allowEdit(odd, ['popover']))).toBe('{ "baseline": { "allow": [[], "popover"] } }');
    expect(allowEdit('{ "baseline": [] }', ['x'])).toBeUndefined();
    expect(allowEdit('{ "baseline": { "allow": "x" } }', ['x'])).toBeUndefined();
    expect(allowEdit('nope', ['x'])).toBeUndefined();
  });

  it('sets the year of the level', () => {
    expect(apply('{ "baseline": 2023 }', targetEdit('{ "baseline": 2023 }', 2024))).toBe('{ "baseline": 2024 }');
    const object = '{ "baseline": { "target": 2023, "allow": [] } }';
    expect(apply(object, targetEdit(object, 2024))).toBe('{ "baseline": { "target": 2024, "allow": [] } }');
    const bare = '{ "baseline": { "allow": [] } }';
    expect(apply(bare, targetEdit(bare, 2024))).toBe('{ "baseline": { "allow": [], "target": 2024 } }');
    expect(targetEdit('{}', 2024)).toBeUndefined();
    expect(targetEdit('{ "baseline": [] }', 2024)).toBeUndefined();
  });

  it('takes out an entry of diagnostics, an id of allow; changes an id', () => {
    const policy = '{ "diagnostics": { "FUD0051": "off", "FUD1380": "off" } }';
    const key = { start: policy.indexOf('"FUD0051"'), end: policy.indexOf('"FUD0051"') + 9 };
    expect(apply(policy, removePolicyEntryEdit(policy, key))).toBe('{ "diagnostics": { "FUD1380": "off" } }');
    expect(removePolicyEntryEdit(policy, { start: 0, end: 1 })).toBeUndefined();
    expect(removePolicyEntryEdit('{}', key)).toBeUndefined();

    const allow = '{ "baseline": { "allow": ["masonry", "state"] } }';
    const id = { start: allow.indexOf('"masonry"'), end: allow.indexOf('"masonry"') + 9 };
    expect(apply(allow, removeAllowEdit(allow, id))).toBe('{ "baseline": { "allow": ["state"] } }');
    expect(apply(allow, replaceAllowEdit(allow, id, ['grid-lanes']))).toBe('{ "baseline": { "allow": ["grid-lanes", "state"] } }');
    expect(apply(allow, replaceAllowEdit(allow, id, ['a', 'b']))).toBe('{ "baseline": { "allow": ["a", "b", "state"] } }');
    expect(removeAllowEdit(allow, { start: 0, end: 1 })).toBeUndefined();
    expect(replaceAllowEdit('{}', id, ['x'])).toBeUndefined();
  });
});
