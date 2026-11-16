/**
 * `FUD1555` (SDD-84 §4.6): a string handed to a sink Trusted Types guards, in the code that runs in
 * the browser, while the page's policy requires trusted types — which the browser then refuses.
 *
 * The same reading as the Baseline detector of SDD-83, and over the same code: the `@code` of a
 * `.fud` and the project's modules the browser loads (never `src/server`). WHERE comes from Oxc;
 * WHAT comes from the checker:
 *
 * - The sink is the browser's: its symbol is declared in the `lib` of TypeScript, so an object of
 *   the author's with an `innerHTML` field is not one.
 * - The value is a string: its type, or a member of its union, is assignable to `string` and is
 *   not `any`. A `TrustedHTML` of the author's policy is not, and says nothing — the decision is the
 *   type's and not the name's (§8.1.16).
 *
 * The sinks are the ones the directive guards: assigning `innerHTML`, `outerHTML`, `srcdoc`, and
 * the `src`, `text`, `textContent` or `innerText` of a `<script>`; passing text to
 * `insertAdjacentHTML`, `document.write(ln)`, `setHTMLUnsafe`, `parseHTMLUnsafe`,
 * `createContextualFragment`, `DOMParser.parseFromString`, `eval`, `Function` or a
 * `setTimeout`/`setInterval`.
 *
 * Type-only import of `typescript`, as in `baseline`: the language server bundles this file.
 */

import type * as ts from 'typescript';
import type { OxcNode } from '@fudic/compiler';
import { HEADERS_FILES, HEADERS_TEMPLATES, parseHeaders, type HeaderEntry } from '@fudic/config';
import { FUD1555, type SourceDiagnostic } from '@fudic/diagnostics';
import { fromLibrary, fudCode, isNode, moduleCode, tsNodeAt, type CodeSite } from './baseline.js';
import type { ProjectedFud } from './project.js';

/** The project a file belongs to, as `ProjectPolicies.projectOf` answers. */
export interface TrustedTypesProject {
  readonly root: string;
  readonly config: { readonly kind: 'app' | 'lib' } | null;
}

/**
 * Whether the pages of `project` require trusted types: its `page.headers` — its template when the
 * app has none — carries `require-trusted-types-for` in its CSP. A library is served by nobody, so
 * its headers apply to nothing (`FUD1554`) and require nothing.
 */
export function requiresTrustedTypes(
  project: TrustedTypesProject | null,
  readFile: (path: string) => string | undefined,
): boolean {
  if (project === null || project.config?.kind === 'lib') return false;
  const text = readFile(`${project.root}/${HEADERS_FILES.page}`) ?? HEADERS_TEMPLATES.page;
  const entries = parseHeaders('page', text).entries as readonly HeaderEntry[];
  const csp = entries.find((entry) => entry.name.toLowerCase() === 'content-security-policy');
  return (csp?.value ?? '')
    .split(';')
    .some((directive) => directive.trim().split(/\s+/u)[0]!.toLowerCase() === 'require-trusted-types-for');
}

/** Every `FUD1555` of the `@code` of `document`, on the `.fud`. */
export function fudTrustedTypesDiagnostics(program: ts.Program, document: ProjectedFud): readonly SourceDiagnostic[] {
  const code = fudCode(program, document);
  return code === undefined ? [] : sinksOf(code, document.path);
}

/** Every `FUD1555` of the module `fileName` of the program, on it. */
export function moduleTrustedTypesDiagnostics(program: ts.Program, fileName: string): readonly SourceDiagnostic[] {
  const code = moduleCode(program, fileName);
  return code === undefined ? [] : sinksOf(code, fileName);
}

/** The properties whose assignment parses HTML. */
const HTML_PROPERTIES: ReadonlySet<string> = new Set(['innerHTML', 'outerHTML', 'srcdoc']);
/** The properties of a `<script>` whose assignment is its code or its URL. */
const SCRIPT_PROPERTIES: ReadonlySet<string> = new Set(['src', 'text', 'textContent', 'innerText']);
/** Methods that take text to parse or run, and which of their arguments: `-1` for every one. */
const METHODS: ReadonlyMap<string, number> = new Map([
  ['insertAdjacentHTML', 1],
  ['write', -1],
  ['writeln', -1],
  ['setHTMLUnsafe', 0],
  ['parseHTMLUnsafe', 0],
  ['createContextualFragment', 0],
  ['parseFromString', 0],
]);
/** Global functions that run text, and which of their arguments. */
const GLOBALS: ReadonlyMap<string, number> = new Map([
  ['eval', 0],
  ['setTimeout', 0],
  ['setInterval', 0],
  ['Function', -1],
]);

/** The types of Trusted Types: what a sink accepts under the directive. */
const TRUSTED: ReadonlySet<string> = new Set(['TrustedHTML', 'TrustedScript', 'TrustedScriptURL']);

/** `node` and every expression under its casts and parentheses: `x as unknown as string` is `x` too. */
function castsOf(node: OxcNode): readonly OxcNode[] {
  const out = [node];
  let at = node;
  while (['TSAsExpression', 'TSTypeAssertion', 'TSSatisfiesExpression', 'TSNonNullExpression', 'ParenthesizedExpression'].includes(at.type)) {
    at = at['expression'] as OxcNode;
    out.push(at);
  }
  return out;
}

/** Every sink of `code` handed a string, as `FUD1555` on the assignment or the call. */
function sinksOf(code: CodeSite, file: string): readonly SourceDiagnostic[] {
  const { site } = code;
  const checker = site.program.getTypeChecker();
  const out: SourceDiagnostic[] = [];
  const report = (node: OxcNode, sink: string): void => {
    out.push(FUD1555({ file, span: site.source(node.start, node.end), sink }));
  };
  /** The type of `node` and of each member of its union; none when the program does not hold it as written. */
  const typesOf = (node: OxcNode): readonly ts.Type[] => {
    const at = tsNodeAt(site, node);
    if (at === undefined) return [];
    const type = checker.getTypeAtLocation(at);
    return type.isUnion() ? type.types : [type];
  };
  /** Whether the name at `node` is the browser's: declared in the `lib` of TypeScript. */
  const browsers = (node: OxcNode): boolean => {
    const at = tsNodeAt(site, node);
    const symbol = at === undefined ? undefined : checker.getSymbolAtLocation(at);
    return symbol !== undefined && fromLibrary(site.program, symbol);
  };
  /** Whether the type of `node`, or a part of its union or intersection, is one of Trusted Types'. */
  const isTrusted = (node: OxcNode): boolean =>
    typesOf(node)
      .flatMap((part) => (part.isIntersection() ? part.types : [part]))
      .some((part) => TRUSTED.has(part.getSymbol()?.name ?? ''));
  /**
   * A string, and not `any` — which is assignable to `number` as well. A value of Trusted Types is
   * not one, even cast: `lib.dom` types `innerHTML` as `string`, so an author who holds a
   * `TrustedHTML` writes `as unknown as string` to assign it, and the cast hides nothing here.
   */
  const isText = (node: OxcNode): boolean => {
    if (castsOf(node).some(isTrusted)) return false;
    const text = checker.getStringType();
    const number = checker.getNumberType();
    return typesOf(node).some(
      (part) => checker.isTypeAssignableTo(part, text) && !checker.isTypeAssignableTo(part, number),
    );
  };
  /** Whether `receiver` is a `<script>`: its type, or one of its union, is `HTMLScriptElement`. */
  const isScript = (receiver: OxcNode): boolean =>
    typesOf(receiver).some((part) => part.getSymbol()?.name === 'HTMLScriptElement');
  const anyText = (args: readonly OxcNode[], which: number): boolean =>
    (which === -1 ? args : args.slice(which, which + 1)).some((arg) => arg.type !== 'SpreadElement' && isText(arg));

  const visit = (node: OxcNode): void => {
    if (node.type === 'AssignmentExpression') assignment(node);
    else if (node.type === 'CallExpression' || node.type === 'NewExpression') call(node);
    for (const value of Object.values(node)) {
      for (const child of Array.isArray(value) ? value : [value]) {
        if (isNode(child)) visit(child);
      }
    }
  };
  const assignment = (node: OxcNode): void => {
    const left = node['left'] as OxcNode;
    if (left.type !== 'MemberExpression' || left['computed'] === true) return;
    const property = left['property'] as OxcNode;
    const name = property['name'] as string;
    const html = HTML_PROPERTIES.has(name);
    if (!html && !(SCRIPT_PROPERTIES.has(name) && isScript(left['object'] as OxcNode))) return;
    if (!browsers(property)) return;
    // `+=` always yields a string, whatever was added.
    if (node['operator'] === '+=' || isText(node['right'] as OxcNode)) report(node, name);
  };
  const call = (node: OxcNode): void => {
    const callee = node['callee'] as OxcNode;
    const args = node['arguments'] as readonly OxcNode[];
    if (callee.type === 'MemberExpression' && callee['computed'] !== true) {
      const property = callee['property'] as OxcNode;
      const name = property['name'] as string;
      const which = METHODS.get(name);
      if (which !== undefined && browsers(property) && anyText(args, which)) report(node, name);
      return;
    }
    if (callee.type !== 'Identifier') return;
    const name = callee['name'] as string;
    const which = GLOBALS.get(name);
    if (which !== undefined && browsers(callee) && anyText(args, which)) report(node, name);
  };

  for (const statement of code.statements) visit(statement);
  return out;
}
