/**
 * The repairs of a file input against its field (SDD-81 §3.7, decision 182):
 *
 * - `FUD1484` — `multiple` on an input bound to one `file`: remove it.
 * - `FUD1485` — no `multiple` on an input bound to a `file[]`: add it.
 * - `FUD1486` — a file input and a field that are not both about files: give the `<input>` the
 *   `type` its field takes. Only where that type is not a guess: an `<input>` bound to a `file`
 *   becomes `type="file"` (with `multiple` for a `file[]`); a file input bound to a `bool`, a
 *   number, a `date` or a `str` becomes a checkbox, a number, a date or a text box. A `<select>`,
 *   a `<textarea>` or a field of another type has none: changing the element is the author's.
 *
 * The field is read as the check reads it: the binding's path against the fields of the forms
 * the file's links give.
 */

import {
  classifyAttribute,
  documentRoots,
  formFieldsOf,
  span,
  walk,
  type Attribute,
  type ElementNode,
  type Span,
} from '@fudic/compiler';
import type { SourceDiagnostic } from '@fudic/diagnostics';
import type { CachedDocument } from './document-cache.js';

/** One stretch of the file and what replaces it. */
export interface FileInputEdit {
  readonly span: Span;
  readonly newText: string;
}

/** One repair: its title and its edits. */
export interface FileInputFix {
  readonly title: string;
  readonly edits: readonly FileInputEdit[];
}

const WIDTHS = new Set(['u8', 'i8', 'u16', 'i16', 'u32', 'i32', 'f32', 'f64']);

/** The `type` of an `<input>` a field that is not a file takes; `''` is no `type` at all. */
function inputTypeOf(field: string): string | undefined {
  if (field === 'bool') return 'checkbox';
  if (WIDTHS.has(field)) return 'number';
  if (field === 'date') return 'date';
  return field === 'str' ? '' : undefined;
}

const named = (attr: Attribute, name: string): boolean => typeof attr.name === 'string' && attr.name.toLowerCase() === name;

/** The element that carries the attribute at `at`, and that attribute. */
function elementAt(cached: CachedDocument, at: Span): { readonly el: ElementNode; readonly attr: Attribute } | undefined {
  let found: { readonly el: ElementNode; readonly attr: Attribute } | undefined;
  walk(documentRoots(cached.document), {
    element(el) {
      const attr = el.attributes.find((a) => a.span.start === at.start && a.span.end === at.end);
      if (attr !== undefined) found = { el, attr };
    },
  });
  return found;
}

/** An attribute removed with the blank in front of it. */
function removal(source: string, attr: Attribute): FileInputEdit {
  let start = attr.span.start;
  while (start > 0 && /\s/u.test(source.charAt(start - 1))) start -= 1;
  return { span: span(start, attr.span.end), newText: '' };
}

/** `FUD1484`: the `multiple` the diagnostic is on goes. */
export function removeMultiple(cached: CachedDocument, diagnostic: SourceDiagnostic): readonly FileInputFix[] {
  const found = elementAt(cached, diagnostic.span);
  return found === undefined ? [] : [{ title: 'Remove multiple', edits: [removal(cached.source, found.attr)] }];
}

/** `FUD1485`: `multiple` after the `control` the diagnostic is on. */
export function addMultiple(_cached: CachedDocument, diagnostic: SourceDiagnostic): readonly FileInputFix[] {
  const at = diagnostic.span.end;
  return [{ title: 'Add multiple', edits: [{ span: span(at, at), newText: ' multiple' }] }];
}

/** `FUD1486`: the `<input>`'s `type`, as its field wants it. */
export function fieldInputType(cached: CachedDocument, diagnostic: SourceDiagnostic): readonly FileInputFix[] {
  const found = elementAt(cached, diagnostic.span);
  if (found === undefined || found.el.name.toLowerCase() !== 'input') return [];
  const { el, attr } = found;
  const binding = classifyAttribute(attr, cached.source).value;
  if (binding.type !== 'control') return [];
  const forms = cached.registry.servers().flatMap((s) => (s.fields === undefined ? [] : [s.fields]));
  const field = formFieldsOf(forms)(cached.source.slice(binding.value.expr.start, binding.value.expr.end));
  if (field === undefined) return [];

  const type = el.attributes.find((a) => named(a, 'type'));
  const multiple = el.attributes.find((a) => named(a, 'multiple'));
  const file = field.type === 'file' || field.type === 'file[]';
  const wanted = file ? 'file' : inputTypeOf(field.type);
  if (wanted === undefined) return [];

  const edits: FileInputEdit[] = [];
  if (wanted === '') edits.push(removal(cached.source, type!));
  else if (type === undefined) edits.push({ span: span(attr.span.start, attr.span.start), newText: `type="${wanted}" ` });
  else edits.push({ span: type.span, newText: `type="${wanted}"` });
  // Only a `file[]` takes `multiple`: one `file` would be `FUD1484`, and on the others it means nothing.
  if (field.type !== 'file[]' && multiple !== undefined) edits.push(removal(cached.source, multiple));
  if (field.type === 'file[]' && multiple === undefined) edits.push({ span: span(attr.span.end, attr.span.end), newText: ' multiple' });
  return [{ title: wanted === '' ? 'Make it a text input' : `Change to type="${wanted}"`, edits: edits.sort((a, b) => a.span.start - b.span.start) }];
}
