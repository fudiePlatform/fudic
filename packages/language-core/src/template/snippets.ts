/**
 * Snippets, projected (SDD-29 §4.11).
 *
 *     @snippet card(title: string) { … }   →  export function card(title: string): void { … }
 *     <link rel="snippet" href="./ui.fud"> →  import * as $Sn0 from './ui.fud';
 *     @render card("A")                    →  $snippets.card("A");
 *     @render form.card("A")               →  $Sn1.card("A");
 *
 * The editor does NOT expand. It projects the declaration as a function and the call as a
 * call, and then everything the author expects comes from TypeScript itself: the types of the
 * arguments (which §7 delegates to exactly this), the arity, the hover with the full
 * signature, the completion after the namespace dot, and go-to-definition across files.
 * Writing our own checker for any of it would be a second opinion that ages.
 *
 * The signature is copied VERBATIM, so it is the author's text TypeScript reads and the
 * author's text a diagnostic lands on. The body is projected by the same template projector
 * as everything else, which is what gives a tag inside a snippet its contract.
 */

import { freeReferences, type RenderCallNode, type SnippetDeclNode, type StructuredDocument } from '@fudic/compiler';
import { DIAGNOSTIC_ONLY_CAPS } from '../caps.js';
import type { TemplateContext } from './context.js';

/**
 * How a `@render` names what it calls.
 *
 * `undefined` means the bare name: the file declares the snippet itself, or nothing does and
 * TypeScript is about to say so with `TS2304` — which is the shape an undeclared tag takes
 * too (decision 41), and the right one, because both are a name with nothing behind it.
 */
export interface SnippetAliases {
  aliasFor(namespace: string | undefined, name: string): string | undefined;
}

/** Nothing imported and nothing declared: every call projects bare. */
export const NO_SNIPPETS: SnippetAliases = { aliasFor: () => undefined };

/**
 * Project every declaration of a file as an exported function.
 *
 * At the TOP level of the virtual and not inside `$tpl`, because a consumer imports them:
 * that is the whole mechanism, and a function nested in another is not exportable.
 */
export function emitSnippets(ctx: TemplateContext, doc: StructuredDocument): void {
  if (doc.snippets.length === 0) return;
  // A file that is NOTHING BUT snippets has no scope of its own, so every free name in a
  // body belongs to whoever calls it. Declaring them `any` is what that means in TypeScript,
  // and it is the difference between a snippet file that checks and one that is solid red.
  if (doc.type === 'snippet-document') emitCallerScope(ctx, doc);
  for (const snippet of doc.snippets) emitSnippet(ctx, snippet);
}

function emitSnippet(ctx: TemplateContext, snippet: SnippetDeclNode): void {
  const w = ctx.w;
  w.scaffold('export function ', snippet.keywordSpan);
  // The name is the author's, so renaming it here renames the declaration.
  w.copy(snippet.nameSpan);
  w.scaffold('(');
  // Verbatim: optionals, defaults, unions, destructuring — everything TypeScript allows in a
  // parameter list is allowed here, because the parser that owns the language reads it.
  w.copy(snippet.signature);
  w.scaffold('): void {\n');
  ctx.emit(snippet.children);
  w.scaffold('}\n');
}

/**
 * `declare const x: any;` for every name a snippet file's bodies read and do not declare.
 *
 * A body is markup that lands somewhere else, so its free names are resolved at the point of
 * expansion (§4.7) — in this file they resolve nowhere, and TypeScript would report every one
 * of them as an undefined name. `any` is the honest type for a value this file cannot know,
 * and it costs nothing else: every tag keeps its contract and every parameter keeps its type,
 * because the function's own parameter SHADOWS a module-level declaration of that name.
 *
 * Which is also why the parameters are not filtered out of the list. A name a body reads is
 * either its own parameter — shadowed, so the declaration is never consulted — or a name from
 * the call site, which is exactly what this is for. Telling the two apart would cost a second
 * reading of the signature to change nothing.
 */
function emitCallerScope(ctx: TemplateContext, doc: StructuredDocument): void {
  // Two kinds of name the projection has ALREADY put in scope, and declaring either a second
  // time is `TS2451`: a snippet of this file, which is a function above, and `data`, which
  // every virtual declares. The `$` namespace is the compiler's everywhere (SDD-15 §4.7).
  const declared = new Set(['data', ...doc.snippets.map((s) => s.name)]);
  const free = new Set<string>();
  for (const snippet of doc.snippets) {
    for (const name of freeNamesOf(ctx, snippet)) {
      if (!declared.has(name) && !name.startsWith('$')) free.add(name);
    }
  }
  for (const name of free) ctx.w.scaffold(`declare const ${name}: any;\n`);
}

/** The names a body reads, from the ASTs the file's single batch already produced. */
function freeNamesOf(ctx: TemplateContext, snippet: SnippetDeclNode): readonly string[] {
  const asts = ctx.fragmentsOf(snippet.children);
  return asts.length === 0 ? [] : freeReferences(asts);
}

/**
 * Project a `@render` as the call it is.
 *
 * The namespace and the name are mapped onto the pieces of `$Sn0.card`, so hovering either
 * half answers and go-to-definition on the name opens the declaration in the file that wrote
 * it. A named argument is projected as its VALUE: TypeScript has no named arguments, the name
 * is checked by `FUD0830` where it belongs, and what the author wants from the editor here is
 * the type of the expression they are writing.
 */
export function emitRenderCall(ctx: TemplateContext, call: RenderCallNode): void {
  const w = ctx.w;
  const alias = ctx.snippets.aliasFor(call.namespace?.name, call.name);
  if (alias !== undefined) {
    w.projected(alias, call.namespace?.span ?? call.keywordSpan, DIAGNOSTIC_ONLY_CAPS);
    w.scaffold('.');
  }
  w.copy(call.nameSpan);
  w.scaffold('(');
  call.args.forEach((arg, i) => {
    if (i > 0) w.scaffold(', ');
    w.copy(arg.value);
  });
  w.scaffold(');\n');
}
