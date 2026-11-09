/**
 * A control bound to a field of a linked form, and what that field is (SDD-81 §3.7, decision 182):
 * what `<input type="file">` needs from the `.fudapi` the compiler does not read.
 *
 * - `FUD1484` / `FUD1485`: `multiple` has to say what the field says — one `file`, or `file[]`.
 * - `FUD1486`: a file input and a field that are not both about files.
 * - the `accept` the compiler writes on a file input whose field has the rule and whose author
 *   wrote no attribute: the dialog of the system filters as the rule does.
 *
 * The node is resolved only when it is written as a path from a linked form, `personForm.avatar`:
 * a form reached through a variable or a prop is not known here, and then nothing is said.
 */

import { FUD1484, FUD1485, FUD1486 } from '@fudic/diagnostics';
import { classifyAttribute, controlTarget } from '../binding/index.js';
import type { Attribute, ElementNode, HtmlContent } from '../html/index.js';
import type { Diagnostic, LinkedField } from '../types/index.js';
import { walkElements } from './level.js';
import type { ResolvedApi } from './resolve.js';

/** What a node of a template resolves to: its field, or `undefined` when it cannot be known. */
export type FieldOf = (node: string) => LinkedField | undefined;

/** `personForm.data.proof` → form `personForm`, path `data.proof`. */
const PATH = /^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)$/u;

/** The fields of every form the linked `.fudapi` give, by node. */
export function fieldsOf(apis: readonly ResolvedApi[]): FieldOf {
  const forms = new Map<string, Readonly<Record<string, LinkedField>>>();
  for (const { api } of apis) for (const [name, fields] of Object.entries(api?.fields ?? {})) forms.set(name, fields);
  return (node) => {
    const match = PATH.exec(node.trim());
    return match === null ? undefined : forms.get(match[1]!)?.[match[2]!];
  };
}

const attribute = (el: ElementNode, name: string): Attribute | undefined =>
  el.attributes.find((a) => typeof a.name === 'string' && a.name.toLowerCase() === name);

const isFileField = (field: LinkedField): boolean => field.type === 'file' || field.type === 'file[]';

/**
 * The `accept` the compiler writes on a file input bound to `node`, or `undefined`: the field
 * has none, or the author wrote their own — then theirs is the one.
 */
export function acceptOf(el: ElementNode, node: string, field: FieldOf): string | undefined {
  return attribute(el, 'accept') === undefined ? field(node)?.accept : undefined;
}

/** `FUD1484`–`FUD1486` over the `control` bindings of a template. */
export function fileFieldDiagnostics(
  source: string,
  roots: readonly HtmlContent[],
  isComponent: (tag: string) => boolean,
  field: FieldOf,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  walkElements(roots, (el) => {
    for (const attr of el.attributes) {
      const binding = classifyAttribute(attr, source).value;
      if (binding.type !== 'control') continue;
      const target = controlTarget(el, isComponent(el.name));
      // A `type` known only at runtime says nothing yet; a group or a component is not a field.
      if (target.kind !== 'value' || target.dynamicType === true) continue;
      const found = field(source.slice(binding.value.expr.start, binding.value.expr.end));
      if (found === undefined) continue;
      const fileInput = target.bind === 'bindFile';
      if (fileInput !== isFileField(found)) {
        out.push(FUD1486({ span: attr.span, field: found.type, fileInput }));
        continue;
      }
      if (!fileInput) continue;
      const multiple = attribute(el, 'multiple');
      if (found.type === 'file' && multiple !== undefined) out.push(FUD1484({ span: multiple.span }));
      if (found.type === 'file[]' && multiple === undefined) out.push(FUD1485({ span: attr.span }));
    }
  });
  return out;
}
