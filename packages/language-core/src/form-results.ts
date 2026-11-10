/**
 * What the forms of one component return, registered for the whole project (SDD-80 §3.7, §4.7).
 *
 * `fudic:result` crosses the shadow root (it is `composed`), so the host of a component hears
 * what its forms announce: `<user-form @fudic:result=@alta>`. The type of that datum is the
 * union of the `-> T` of each `form:=@fn` of the component's template, and of what the
 * components it uses register in turn — the event goes up every level. The registry is a global
 * interface, as the bus's is, so every `.fud` of the program adds to the same one:
 *
 * ```ts
 * declare global {
 *   interface FudicFormResults {
 *     'user-form': $Result<typeof save> | $FormResult<'app-address'>;
 *   }
 * }
 * export {};
 * ```
 *
 * Only a function the module names at its top level registers — one the `@code` imports or
 * declares, or one the file takes from its `<link rel="server">` —: `typeof` is written at the
 * end of the module, where nothing else exists. A component with no form and no component
 * inside registers nothing, which reads as `never`.
 */

import {
  classifyAttribute,
  codeNames,
  documentRoots,
  walk,
  type StructuredDocument,
} from '@fudic/compiler';
import type { ServerImport } from './types.js';
import type { VirtualWriter } from './writer.js';

/** The entry of one component: its tag and the members of its union. */
export interface FormResults {
  readonly tag: string;
  /** The `form:=` functions, as written: `save`, `api.save`. */
  readonly sends: readonly string[];
  /** The component tags its template uses, its own excluded. */
  readonly children: readonly string[];
}

/** `save` or `api.save`: what `typeof` can be written over. */
const PATH = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/u;

/**
 * The entry of a component, or `undefined` for a page, a layout or a route. `servers` are the
 * contracts the file links: their names are declared at the top of the module too.
 */
export function formResults(source: string, doc: StructuredDocument, servers: readonly ServerImport[]): FormResults | undefined {
  if (doc.type !== 'component-document' || doc.host === undefined) return undefined;
  const tag = doc.host.name;
  const names = new Set([...(doc.code === undefined ? [] : codeNames(source, doc.code)), ...servers.flatMap((s) => s.names)]);
  const sends = new Set<string>();
  const children = new Set<string>();
  walk(documentRoots(doc), {
    element(el) {
      if (el.name.includes('-') && el.name !== tag) children.add(el.name);
      for (const attr of el.attributes) {
        const binding = classifyAttribute(attr, source).value;
        if (binding.type !== 'form-send') continue;
        const text = source.slice(binding.value.expr.start, binding.value.expr.end);
        if (PATH.test(text) && names.has(text.split('.')[0]!)) sends.add(text);
      }
    },
  });
  return { tag, sends: [...sends], children: [...children] };
}

/** The registry block at the end of the module. */
export function emitFormResults(w: VirtualWriter, entry: FormResults | undefined): void {
  if (entry === undefined) return;
  const members = [
    ...entry.sends.map((fn) => `$Result<typeof ${fn}>`),
    ...entry.children.map((tag) => `$FormResult<${JSON.stringify(tag)}>`),
  ];
  // No form and no component inside: `$FormResult` already gives `never` for a tag nobody registered.
  if (members.length === 0) return;
  w.scaffold('declare global {\n  interface FudicFormResults {\n');
  w.scaffold(`    ${JSON.stringify(entry.tag)}: ${members.join(' | ')};\n`);
  // `declare global` is only valid in a module, and a `@code` with no import is not one.
  w.scaffold('  }\n}\nexport {};\n');
}
