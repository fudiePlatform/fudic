/**
 * The client virtual file: imports, neutral zone, `@client` region and the projected
 * template, in that order (SDD-23 §4.1).
 *
 * This is the file the user is looking at when they edit markup, so it is the canonical
 * one: diagnostics from the neutral zone — which is duplicated into the server virtual —
 * are deduplicated against this one (§4.1).
 *
 * The template is projected inside `function $tpl(): void { … }` rather than at top level,
 * because a function body is a scope: `const` declared in a `@foreach` header does not leak
 * into the module, and `return` and `break` cannot escape into it either.
 */

import type { HtmlContent, OxcNode, Span, StructuredDocument, TextNode } from '@fudic/compiler';
import { planDelegation, span, unwrapParens } from '@fudic/compiler';
import { partitionCode } from './code.js';
import { emitDataDeclaration } from './data.js';
import { emitImports, templateContent } from './imports.js';
import { clientFileName } from './paths.js';
import { emitPropsProjection, type PropsCall } from './props.js';
import { emitElementBindings } from './template/attrs.js';
import type { FragmentAst, TemplateContext } from './template/context.js';
import { emitControl, emitInlineCode, type ControlLike } from './template/control.js';
import { emitSection, emitSectionsContract, emitSlot, emitSlotsContract } from './template/sections.js';
import { emitDanglingAt, emitInterpolation } from './template/text.js';
import type { FileRegistry, VirtualFile } from './types.js';
import { VirtualWriter } from './writer.js';

/** The single node of a fragment, past the parentheses the author wrote. */
const rootOf = (ast: FragmentAst | undefined): OxcNode | undefined =>
  ast === undefined || Array.isArray(ast) ? undefined : unwrapParens(ast as OxcNode);

/** Elements whose body belongs to another language, never to the TypeScript projection. */
const OPAQUE_ELEMENTS: ReadonlySet<string> = new Set(['style', 'script']);

/**
 * Emit `<name>.fud.ts`.
 *
 * `props` is passed in rather than computed here because finding it needs the JS AST, and
 * the golden rule allows Oxc exactly one invocation per file: the orchestrator (`emit.ts`)
 * owns that single batch and hands the result down.
 */
export function emitClientVirtual(
  source: string,
  fudPath: string,
  doc: StructuredDocument,
  registry: FileRegistry,
  props: PropsCall | undefined,
  template: TemplateJs = {},
): VirtualFile {
  const w = new VirtualWriter(source);
  const content = templateContent(doc);

  const aliases = emitImports(w, content, registry);
  emitDataDeclaration(w, doc, fudPath);

  emitNeutralZone(w, source, doc, props);
  emitSectionsContract(w, doc);
  emitSlotsContract(w, doc);

  for (const region of partitionCode(doc.code).client) {
    w.copy(region);
    w.scaffold('\n');
  }

  // A page, a route and a layout have no shadow root of their own, so nothing at their top
  // level is inside a component: the host starts as nothing, and a `slot=` written there is
  // checked against `never`, which is what it fills.
  // Paired once for the whole file, by the very function the compiler's own emit pairs with:
  // an editor that types `$day` from a different reading than the build compiles is BUG-23
  // §2.8 again. Its diagnostics are not read here — the semantic pass is their channel.
  const delegation = planDelegation(source, content, {
    headerAst: (loop) => rootOf(template.ast?.(loop.header.inner)),
    valueAst: (expr) => rootOf(template.ast?.(expr.expr)),
    // The `$name` spans are the compiler emit's business, not the projection's: this side
    // reads the NAMES and the loop header, never an offset inside the batch's buffer.
    spanOf: (node) => span(node.start, node.end),
  });

  const ctx = hostContext(
    {
      source,
      w,
      aliases,
      reactives: template.reactives ?? new Set(),
      ast: template.ast,
      delegation,
    },
    undefined,
  );

  w.scaffold('function $tpl(): void {\n');
  emitContent(ctx, content);
  // Referencing `$tpl` keeps "declared but never read" quiet without exporting it: the
  // template is not part of anyone's contract.
  w.scaffold('}\n$tpl;\n');

  return w.build(clientFileName(fudPath), 'typescript');
}

/**
 * The neutral zone, with the `props<T>()` declaration rewritten in place.
 *
 * Everything around that one statement is copied verbatim, so the rewrite costs the user
 * nothing: the chunk before it and the chunk after it keep their exact offsets.
 */
function emitNeutralZone(
  w: VirtualWriter,
  source: string,
  doc: StructuredDocument,
  props: PropsCall | undefined,
): void {
  const { neutral } = partitionCode(doc.code);
  let projected = false;

  for (const chunk of neutral) {
    const inChunk =
      props !== undefined &&
      props.declaration.start >= chunk.start &&
      props.declaration.end <= chunk.end;

    if (!inChunk) {
      w.copy(chunk);
      w.scaffold('\n');
      continue;
    }

    w.copy({ start: chunk.start, end: props.declaration.start });
    emitPropsProjection(w, props);
    w.copy({ start: props.declaration.end, end: chunk.end });
    w.scaffold('\n');
    projected = true;
  }

  // A component with no `props<T>()` still owes the other files a contract (§3.2).
  if (!projected) emitPropsProjection(w, undefined);
}

/**
 * Dispatch a list of children.
 *
 * Text, comments, doctype, CDATA and `@@` escapes project to nothing: they carry no
 * program. A Razor comment projects to nothing either (decision 37), leaving its span
 * unmapped — which is exactly what "the comment is not part of the program" means.
 */
function emitContent(ctx: TemplateContext, content: readonly HtmlContent[]): void {
  for (const node of content) {
    switch (node.type) {
      case 'element':
        emitElement(ctx, node);
        break;
      case 'razor-expression':
        emitInterpolation(ctx, node);
        break;
      case 'raw-expression':
        emitInterpolation(ctx, node.expr);
        break;
      case 'inline-code':
        emitInlineCode(ctx, node);
        break;
      // Text projects to nothing — except for the `@` the author has just pressed, which is
      // still a text node and is the one position in markup where the list is wanted.
      case 'text':
        emitDanglingAt(ctx, node as TextNode);
        break;
      case 'section':
        emitSection(ctx, node as Parameters<typeof emitSection>[1]);
        break;
      case 'if':
      case 'foreach':
      case 'for':
      case 'while':
      case 'switch':
        emitControl(ctx, node as ControlLike);
        break;
      default:
        break;
    }
  }
}

function emitElement(ctx: TemplateContext, el: Extract<HtmlContent, { type: 'element' }>): void {
  if (el.name === 'slot') {
    emitSlot(ctx, el.span);
    return;
  }
  // `<style>` goes to its own CSS virtual and `<script>` is opaque (decision 43): projecting
  // either into TypeScript would report CSS syntax as type errors.
  if (OPAQUE_ELEMENTS.has(el.name)) return;

  // The element's own attributes are checked with the host ABOVE it — its `slot=` names a
  // slot of its parent — and its children are projected with this element as their host,
  // which is only a host at all when it is a component (decision 41).
  emitElementBindings(ctx, el);
  emitContent(hostContext(ctx, el.name.includes('-') ? el.name : undefined), el.children);
}

/**
 * What the template projectors need beyond the document, when someone else parsed the JS.
 *
 * Both halves are optional and both degrade to «say nothing new»: with no reactives a value
 * crosses as written, and with no AST a handler is copied as written. That is what the
 * projection did before BUG-23, so a caller that hands over neither gets exactly the old
 * behaviour rather than a wrong one.
 */
export interface TemplateJs {
  /** `signal(...)` / `computed(...)` names of this file, from `reactiveNames`. */
  readonly reactives?: ReadonlySet<string>;
  /** The AST registered at a source span — the attribute values included. */
  readonly ast?: (at: Span) => FragmentAst | undefined;
}

/**
 * The context for the children of one host.
 *
 * A new object per host rather than a mutable field: the recursion hook is a closure over the
 * context it belongs to, so a `@foreach` inside `<app-card>` re-enters with the card still as
 * its host — which is what makes a `slot=` written three constructs deep still check against
 * the component it will actually be placed in.
 */
function hostContext(base: Omit<TemplateContext, 'host' | 'emit'>, host: string | undefined): TemplateContext {
  const ctx: TemplateContext = {
    ...base,
    host,
    emit: (nodes) => emitContent(ctx, nodes),
  };
  return ctx;
}
