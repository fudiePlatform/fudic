/**
 * Whether a `@render` can be expanded (SDD-29 §4.7).
 *
 * ONE function, run by the build and by the editor. The build calls it before expanding,
 * because expanding a call that does not add up is expanding garbage; the editor calls it
 * and never expands at all (§4.11). Two implementations of one rule is two messages for one
 * mistake, and the day one of them grows a case the other has not, the editor and the build
 * disagree about whether a file compiles.
 *
 * What it does NOT check is the TYPE of an argument. That is TypeScript's, over the virtual
 * files (§7): here the question is shape and arity — whether a name resolves, whether every
 * parameter is covered exactly once, and whether the call is inside itself.
 */

import { type Diagnostic, errorDiag, relatedError } from '../types/index.js';
import type { HtmlContent } from '../html/index.js';
import type {
  NamedArg,
  PositionalArg,
  RenderCallNode,
  SnippetDeclNode,
  SnippetParam,
} from '../snippet/index.js';
import type { ResolvedSnippet, SnippetScope } from './scope.js';

/** A `@render` whose name is in no scope. */
const FUD_UNKNOWN_SNIPPET = 'FUD0826';
/** A `@render ns.name` whose namespace no `<link rel="snippet" as>` declares. */
const FUD_UNKNOWN_NAMESPACE = 'FUD0827';
/** A parameter with no default and no `?` that the call does not cover. */
const FUD_MISSING_ARGUMENT = 'FUD0828';
/** More arguments than the signature has parameters. */
const FUD_EXTRA_ARGUMENT = 'FUD0829';
/** A named argument that matches no parameter. */
const FUD_UNKNOWN_ARGUMENT = 'FUD0830';
/** A parameter covered twice, by position and by name. */
const FUD_DUPLICATE_ARGUMENT = 'FUD0831';
/** A snippet that expands into itself, directly or through others. */
const FUD_RECURSION = 'FUD0835';

/** What one argument of a resolved call is: where its text is, and where it was written. */
export interface BoundArgument {
  /** The parameter it fills. */
  readonly param: SnippetParam;
  /**
   * The expression that fills it, as a span into `file`.
   *
   * It is the ARGUMENT's span when the call wrote one, and the parameter's DEFAULT when it
   * did not — which is why the file travels with it: a default is written in the snippet's
   * file and an argument in the caller's.
   */
  readonly value: { readonly start: number; readonly end: number };
  /** Absolute path of the file `value` is a span into. */
  readonly file: string;
  /**
   * `true` when the call wrote nothing and the DEFAULT is what fills it.
   *
   * Its own flag rather than comparing files, because a snippet declared in the file that
   * calls it makes the two paths equal — and then an argument and a default become
   * indistinguishable exactly where it matters: an argument's text is written in the
   * caller's frame and may itself mention a parameter, a default's never does.
   */
  readonly fromDefault: boolean;
  /** `true` when nothing filled it: optional, no default. It expands to `undefined`. */
  readonly empty: boolean;
}

/** A call that can be expanded: the snippet it names, and its parameters already bound. */
export interface ResolvedCall {
  readonly call: RenderCallNode;
  readonly snippet: ResolvedSnippet;
  readonly args: readonly BoundArgument[];
}

/**
 * One snippet on the expansion stack: the identity a cycle is measured by.
 *
 * A file and a name, and not the `ResolvedSnippet` itself, because the body being walked may
 * belong to a declaration that is in no scope — a repeat of a name (`FUD0834`) or one with no
 * name at all (`FUD0820`) — and a walk that needed an object for those would have to invent
 * one. Two files may each declare a `card`; they are two snippets and neither is a cycle.
 */
export interface SnippetFrame {
  readonly file: string;
  readonly name: string;
}

/** The snippet a call names, or `undefined` with the reason reported. */
function resolve(
  call: RenderCallNode,
  scope: SnippetScope,
  diagnostics: Diagnostic[],
): ResolvedSnippet | undefined {
  if (call.namespace === undefined) {
    const found = scope.global.get(call.name);
    if (found !== undefined) return found;
    diagnostics.push(
      errorDiag(
        FUD_UNKNOWN_SNIPPET,
        `no snippet called "${call.name}" is in scope: declare it here, or import the file that does with <link rel="snippet">`,
        call.nameSpan,
      ),
    );
    return undefined;
  }
  const namespace = scope.namespaced.get(call.namespace.name);
  if (namespace === undefined) {
    diagnostics.push(
      errorDiag(
        FUD_UNKNOWN_NAMESPACE,
        `no <link rel="snippet" as="${call.namespace.name}"> in this file: "as" is the only thing that declares a namespace, and it is never inferred`,
        call.namespace.span,
      ),
    );
    return undefined;
  }
  const found = namespace.get(call.name);
  if (found !== undefined) return found;
  diagnostics.push(
    errorDiag(
      FUD_UNKNOWN_SNIPPET,
      `"${call.namespace.name}" declares no snippet called "${call.name}"`,
      call.nameSpan,
    ),
  );
  return undefined;
}

/**
 * Bind the arguments to the parameters: positionals by order, names by name, defaults for
 * what is left (§4.8.c).
 *
 * Every mismatch is reported and the binding goes on: a call with one wrong argument still
 * expands the rest of the document, and an editor that stopped at the first problem would go
 * quiet exactly while a call is being typed.
 */
function bind(
  call: RenderCallNode,
  snippet: ResolvedSnippet,
  callerFile: string,
  diagnostics: Diagnostic[],
): readonly BoundArgument[] {
  const params = snippet.params;
  const filled = new Map<number, { value: PositionalArg | NamedArg; index: number }>();

  let next = 0;
  for (const arg of call.args) {
    if (arg.type === 'positional-arg') {
      const index = next++;
      const param = params[index];
      if (param === undefined) {
        diagnostics.push(
          errorDiag(
            FUD_EXTRA_ARGUMENT,
            `@render ${call.name} takes ${params.length} argument${params.length === 1 ? '' : 's'}`,
            arg.span,
          ),
        );
        continue;
      }
      filled.set(index, { value: arg, index });
      continue;
    }
    const index = params.findIndex((p) => p.name === arg.name);
    if (index === -1) {
      diagnostics.push(
        errorDiag(
          FUD_UNKNOWN_ARGUMENT,
          `"${arg.name}" is not a parameter of @snippet ${call.name}`,
          arg.nameSpan,
        ),
      );
      continue;
    }
    const taken = filled.get(index);
    if (taken !== undefined) {
      diagnostics.push(
        relatedError(
          FUD_DUPLICATE_ARGUMENT,
          `"${arg.name}" is given twice`,
          arg.nameSpan,
          [{ span: taken.value.span, message: 'it already arrived by position here' }],
        ),
      );
      continue;
    }
    filled.set(index, { value: arg, index });
  }

  const out: BoundArgument[] = [];
  params.forEach((param, index) => {
    const given = filled.get(index);
    if (given !== undefined) {
      out.push({
        param,
        value: given.value.value,
        file: callerFile,
        fromDefault: false,
        empty: false,
      });
      return;
    }
    if (param.defaultValue !== undefined) {
      // A default is written in the snippet's own file, so it travels with that path: the
      // expansion copies its text from there and a diagnostic about it points there too.
      out.push({
        param,
        value: param.defaultValue,
        file: snippet.file,
        fromDefault: true,
        empty: false,
      });
      return;
    }
    if (param.required) {
      diagnostics.push(
        errorDiag(
          FUD_MISSING_ARGUMENT,
          `@render ${call.name} is missing "${param.name === '' ? `argument ${index + 1}` : param.name}", which has no default`,
          call.span,
        ),
      );
    }
    out.push({ param, value: param.span, file: snippet.file, fromDefault: false, empty: true });
  });
  return out;
}

/**
 * Check one call against a scope. `undefined` when it cannot be expanded — and then the node
 * is left INERT in the tree, which the emit paints as nothing.
 *
 * `stack` is the chain of snippets being expanded, innermost last. A snippet already in it is
 * recursion (§4.6), direct or not, and it is reported with the whole cycle: without the
 * detection a recursive snippet is an infinite loop at COMPILE time, which is the one kind of
 * failure a compiler may not have.
 */
export function checkRenderCall(
  call: RenderCallNode,
  scope: SnippetScope,
  callerFile: string,
  stack: readonly SnippetFrame[],
  diagnostics: Diagnostic[],
): ResolvedCall | undefined {
  const snippet = resolve(call, scope, diagnostics);
  if (snippet === undefined) return undefined;

  const cycle = stack.findIndex((f) => f.file === snippet.file && f.name === snippet.decl.name);
  if (cycle !== -1) {
    const names = [...stack.slice(cycle).map((f) => f.name), snippet.decl.name];
    diagnostics.push(
      errorDiag(
        FUD_RECURSION,
        `a snippet cannot expand into itself: ${names.join(' → ')}`,
        call.span,
      ),
    );
    return undefined;
  }

  return { call, snippet, args: bind(call, snippet, callerFile, diagnostics) };
}

/** A node's children, for the walk — every construct that holds markup has them. */
function childrenOf(node: HtmlContent): readonly HtmlContent[] {
  return (node as { readonly children?: readonly HtmlContent[] }).children ?? [];
}

/**
 * Check every `@render` a document reaches, its snippets' bodies included, ACROSS files.
 *
 * This is what the editor runs — it never expands — and what the build runs before it does.
 * Following into the body of every snippet invoked is what finds an indirect cycle
 * (`a → b → a`) from the file where it starts, rather than from whichever of the three files
 * happens to be compiled first.
 *
 * `seen` keeps the walk linear: a snippet invoked from ten places is checked once. The cycle
 * is caught before it, on the STACK, so nothing is missed by the shortcut.
 */
export function checkRenderCalls(
  roots: readonly HtmlContent[],
  scope: SnippetScope,
  file: string,
  diagnostics: Diagnostic[],
): void {
  const seen = new Set<SnippetDeclNode>();
  /**
   * A call written inside an imported body is written in THAT file, and so is everything said
   * about it: the span means nothing against this document's text. Tagging it is what lets
   * the host report it where the author can act on it (§5).
   */
  const report = (inFile: string, produced: readonly Diagnostic[]): void => {
    for (const d of produced) diagnostics.push(inFile === file ? d : { ...d, file: inFile });
  };

  const walk = (
    nodes: readonly HtmlContent[],
    inScope: SnippetScope,
    inFile: string,
    stack: readonly SnippetFrame[],
  ): void => {
    for (const node of nodes) {
      if (node.type === 'snippet') {
        const decl = node as unknown as SnippetDeclNode;
        walk(decl.children, inScope, inFile, [...stack, { file: inFile, name: decl.name }]);
        continue;
      }
      if (node.type === 'render') {
        const own: Diagnostic[] = [];
        const resolved = checkRenderCall(
          node as unknown as RenderCallNode,
          inScope,
          inFile,
          stack,
          own,
        );
        report(inFile, own);
        if (resolved === undefined) continue;
        const snippet = resolved.snippet;
        if (seen.has(snippet.decl)) continue;
        seen.add(snippet.decl);
        // Its body resolves in ITS file's scope, never in the caller's (§4.6).
        walk(snippet.decl.children, snippet.scope(), snippet.file, [
          ...stack,
          { file: snippet.file, name: snippet.decl.name },
        ]);
        continue;
      }
      walk(childrenOf(node), inScope, inFile, stack);
    }
  };

  walk(roots, scope, file, []);
}
