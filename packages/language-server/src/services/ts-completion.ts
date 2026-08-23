/**
 * What TypeScript is allowed to say inside a `.fud` (BUG-23, TODOs 1 and 4).
 *
 * Two rules, both about lists that TypeScript computes correctly and that are nevertheless
 * wrong ANSWERS, because the position means something in fudic that it does not mean in
 * TypeScript. Neither can be applied from this package's own service: Volar hands each
 * plugin its own reply and never shows it another's, so a filter over somebody else's items
 * has to wrap the plugin that produced them. Hence a decorator around the TypeScript
 * services rather than a branch in `createFudicService`.
 *
 * Measured against `tsserver` directly, at the exact shapes the projection emits:
 *
 *     $props<$C0>({ na| : true })  with a real contract  →   3 items, all `property`
 *     $props<$C0>({ na| : true })  with `$Props = never` → 979 items: `var`, `function`, …
 *     $on('cli|')                                        → 107 items, all `string`
 *
 * The second line is the whole of TODO 1. A component that declares no `props<T>()` gets
 * `$Props = never` (SDD-23 §3.2), the object literal has no members to enumerate, and
 * TypeScript falls back to the ordinary identifier list — so a dot on such a component
 * offered `navigator`, `NaN` and auto-imports from `vite`. Nothing was mismapped; the
 * fallback itself is the bug.
 */

import { CompletionItemKind, InsertTextFormat } from 'vscode-languageserver-protocol';
import type {
  CompletionItem,
  LanguageServiceContext,
  LanguageServicePlugin,
} from '@volar/language-service';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { regionAt } from '@fudic/compiler';
import { clientFileName, mapToSource, type VirtualFile } from '@fudic/language-core';
import { URI } from 'vscode-uri';
import type { CachedDocument } from '../document-cache.js';
import { CLIENT_CODE_ID, type FudicVirtualCode } from '../virtual-code.js';
import { isFudSourceUri } from '../uri.js';
import {
  bareBindingValueContextAt,
  directiveContextAt,
  expressionValueContextAt,
  handlerContextAt,
  propertyContextAt,
  type PartialName,
} from './position.js';
import { scopeAt, snippetsAt } from './snippets.js';
import { scopeNames, templateScope, type TemplateScope } from './template-scope.js';

/**
 * The kinds an object-literal member comes back as.
 *
 * `Field` is what `memberVariable` converts to, and it is what every contextual property
 * arrives as — a prop typed `() => void` included, which is why `Method` is here only for
 * the shapes TypeScript may classify differently in a future version, and not because the
 * projection produces any.
 */
const MEMBER_KINDS: ReadonlySet<CompletionItemKind> = new Set([
  CompletionItemKind.Field,
  CompletionItemKind.Property,
  CompletionItemKind.Method,
]);

/**
 * The kinds a name that can be CALLED comes back as.
 *
 * What may go after `@click=` is a listener, so only these survive there. A prop that happens
 * to hold a callback arrives as `Field` and is deliberately not among them: TypeScript reports
 * the kind of the binding, not whether its type is callable, and guessing from the label would
 * be inventing an answer.
 */
const CALLABLE_KINDS: ReadonlySet<CompletionItemKind> = new Set([
  CompletionItemKind.Function,
  CompletionItemKind.Method,
]);

/** The projection's own namespace, reserved by SDD-24 §4.4 precisely so this is safe. */
const RESERVED_PREFIX = '$';

/**
 * Wrap every TypeScript service so its completions obey the two rules above.
 *
 * The array is rebuilt rather than mutated: `createTypeScriptServices` returns plugins that
 * are also used to answer hovers, definitions and diagnostics, and only the completion half
 * is being changed. A plugin with no `provideCompletionItems` travels through untouched.
 */
export function filterTypeScriptCompletions(
  plugins: readonly LanguageServicePlugin[],
): LanguageServicePlugin[] {
  // Shared by the wrappers of one call, which is what makes the collapse possible: the three
  // TypeScript plugins are created together and serve the same request, in order.
  const spoken = new Spoken();

  return plugins.map((plugin) => ({
    ...plugin,
    create(context) {
      const instance = plugin.create(context);
      const inner = instance.provideCompletionItems?.bind(instance);
      if (inner === undefined) return instance;

      return {
        ...instance,
        async provideCompletionItems(document, position, completionContext, token) {
          const list = await inner(document, position, completionContext, token);
          const narrowed = allowedItems(context, document, position, list?.items ?? []);
          const kept =
            narrowed.at === undefined ? narrowed.items : spoken.fresh(narrowed, token);

          // TypeScript said NOTHING, and that is not the same as there being nothing to say.
          // A program that has not finished loading answers `undefined` at every offset, and
          // returning it unchanged hands the position to the HTML service — or to no one. The
          // names of the template come from the parse, so when the rules above produced any,
          // they are the answer whether or not TypeScript ever arrives.
          if (list === undefined || list === null) {
            return kept.length === 0 ? list : { isIncomplete: true, items: kept };
          }

          // The SAME object shape back, `isIncomplete` included: an incomplete list that
          // comes back complete stops the editor from ever asking again, and a list that
          // grows with the next keystroke is exactly what an import suggestion is.
          return { ...list, items: kept };
        },
      };
    },
  }));
}

/**
 * What has already been offered for the `.fud` position being asked about.
 *
 * Volar walks a completion request once per plugin AND once per generated position the source
 * offset maps into, and at a mapping declared `isAdditional` nothing claims the position — so
 * nothing stops the same answer arriving several times. It did: `handlerClick` three times,
 * every snippet three times. Deduplication cannot live in any one plugin, because no plugin
 * is ever shown another's reply; it lives here, in the only object all three wrappers share.
 *
 * What identifies a request is its CANCELLATION TOKEN: Volar creates one per request and
 * hands that same object to every plugin and every mapping of it. Keying on the position
 * instead would be a bug with a long fuse — asking twice in the same place, which is what
 * pressing Ctrl+Space again is, would come back empty the second time. The token ALONE, and
 * the comment inside `fresh` says why the offset cannot join it.
 *
 * Only at the positions this package owns — `at` is set nowhere else — where the list is a
 * small closed set of distinct names. Elsewhere two items may legitimately share a label, an
 * auto-import of the same name from two modules being the ordinary case, and dropping one
 * would be losing an answer rather than a duplicate.
 */
class Spoken {
  #request: unknown;
  #labels = new Set<string>();

  /** The items of this reply that nobody has said yet, remembering them for the next one. */
  fresh(narrowed: Narrowed, request: unknown): CompletionItem[] {
    // The REQUEST alone. Keying on the offset as well left two copies standing: one caret maps
    // into the projection at more than one generated position, and mapping those back does not
    // land on the same source offset — so the offset is the thing that varies within a request,
    // not the thing that identifies it.
    if (request !== this.#request) {
      this.#request = request;
      this.#labels = new Set();
    }

    const kept: CompletionItem[] = [];
    for (const item of narrowed.items) {
      if (this.#labels.has(item.label)) continue;
      this.#labels.add(item.label);
      kept.push(item);
    }
    return kept;
  }
}

/**
 * One reply, narrowed — and WHERE in the `.fud` it was asked, when the position is one of
 * ours.
 *
 * The offset travels back out because it is the only stable identity a request has here.
 * Volar calls this decorator once per TypeScript plugin AND once per generated position the
 * source offset maps to, and at a mapping that is `isAdditional` nothing claims the position,
 * so none of those calls suppresses the others: the same list came back three times over and
 * the editor rendered `handlerClick` three times. Keyed by the SOURCE offset they collapse
 * into one, which the generated position cannot do — each mapping has a different one.
 */
interface Narrowed {
  readonly items: CompletionItem[];
  /** Set only at a position this package owns, which is where collapsing is safe. */
  readonly at?: number;
}

/** Apply both rules to one reply. */
function allowedItems(
  context: LanguageServiceContext,
  document: TextDocument,
  position: { line: number; character: number },
  items: readonly CompletionItem[],
): Narrowed {
  const source = fudSourceAt(context, document);
  // Not a `.fud` at all: a real `.ts` in the workspace is none of this package's business.
  if (source === undefined) return { items: [...items] };

  const visible = items.filter((item) => !isScaffolding(item));

  const offset = sourceOffsetOf(source.cached, source.isClient, document, position);
  if (offset === undefined) return { items: visible };

  const region = regionAt(source.cached.source, source.cached.html, offset);

  // Nothing has been opened yet, so there is nothing to complete (BUG-23): the value of a
  // prop or an event is an expression, and an expression starts with `@`. This is what was
  // offering `role` on `.name=r` and `JSON` on `@click=j`.
  if (bareBindingValueContextAt(source.cached.source, offset, region) !== undefined) {
    return { items: [], at: offset };
  }

  // After a `.` on a tag only a prop of that component can go there, so the members ARE the
  // list. Anything else TypeScript offers at that offset is the identifier fallback it takes
  // when the contextual type has nothing to enumerate, and it is never an answer.
  //
  // The kind alone is not enough, and a real project is what proved it: filtering the global
  // fallback of a workspace that has a `vite.config.ts` left exactly one survivor — an
  // AUTO-IMPORT of `viteConfig`, offered as a member. A prop is a key of a type that is already
  // in scope; it is never something the editor has to import a module to write. So an item that
  // carries a module to import from is not a prop, whatever kind TypeScript gave it.
  if (propertyContextAt(source.cached.source, offset, region) !== undefined) {
    return {
      items: visible.filter(
        (item) => item.kind !== undefined && MEMBER_KINDS.has(item.kind) && !isAutoImport(item),
      ),
      at: offset,
    };
  }

  // After a `=@` — an event's handler included — what goes there is an expression over what the
  // TEMPLATE can see: the route's `data`, the props the file destructured, the names its
  // `@client` declares. Asked at that offset TypeScript answers with its entire scope —
  // `arguments`, `atob`, `await`, and auto-imports from every package in the workspace — and
  // every one of them is a name the runtime will not have there.
  //
  // An event is NOT narrowed further to the functions of `@client`, and that was a mistake this
  // rule used to make: a handler is an expression like any other, and what may be passed to one
  // includes a prop or a property holding a callback. The same list, one rule.
  // BEFORE the directive branch, and the order is the rule: `directiveContextAt` excludes only
  // the region `tag`, so inside an attribute VALUE it matches too — and a `=@` is a binding
  // being given a value, never a construct being opened. Asking the narrower question first is
  // what keeps `@()` and the callable-only narrowing on the positions they belong to.
  const value = expressionValueContextAt(source.cached.source, offset, region);
  if (value !== undefined) {
    const scope = templateScope(source.cached);
    // An EVENT takes the same list, minus everything that cannot be called: what goes after
    // `@click=` has to be a listener, so a `const` holding a number is not a candidate however
    // legitimately it is in scope. Any other binding keeps the whole scope — a value is a value.
    const callableOnly = handlerContextAt(source.cached.source, offset, region) !== undefined;

    const kept = visible.filter(
      (item) =>
        scope.has(item.label) &&
        !isAutoImport(item) &&
        (!callableOnly || (item.kind !== undefined && CALLABLE_KINDS.has(item.kind))),
    );
    const range = anchor(document, position, value);
    return {
      items: anchored([...kept, ...missingNames(scope, callableOnly, kept), escapeHatch()], range),
      at: offset,
    };
  }

  // A `@` in markup is BOTH: the control constructs it may open, and every name in scope.
  //
  // Both, and that is the whole difficulty — Volar hands the position to the first document
  // that answers, and the root is walked last, so the server's snippets and TypeScript's names
  // could never appear together. Whichever answered silenced the other. The snippets travel
  // with this reply for the same reason `@()` does.
  // MARKUP only, and the gate belongs here as much as in the root: a `@` inside `@code` opens
  // `@client`, not an interpolation, and there the whole TypeScript scope is the right answer
  // rather than the template's slice of it.
  const directive = directiveContextAt(source.cached.source, offset, region);
  if (directive !== undefined && scopeAt(source.cached, directive.span.start) === 'markup') {
    const scope = templateScope(source.cached);
    const kept = visible.filter((item) => scope.has(item.label) && !isAutoImport(item));
    const range = anchor(document, position, directive);
    return {
      items: anchored([
      ...kept,
      ...missingNames(scope, false, kept),
      // `@()` belongs here too, and its absence was the one defect this position had that the
      // suite did catch: a `@` in text may open any expression at all, exactly as a `=@` may,
      // and the way out has to be offered in both or in neither.
      escapeHatch(),
      ...directiveSnippets(source.cached, document, position, directive),
      ], range),
      at: offset,
    };
  }

  return { items: visible };
}

/**
 * `@(|)` — the way out to any TypeScript expression at all (BUG-23 §2.3).
 *
 * It rides with TypeScript's own reply, and that is not where it belongs conceptually — it is
 * this server's snippet, not TypeScript's. It is here because Volar skips an `isAdditionalCompletion`
 * plugin on every mapping but the FIRST, and the embedded codes are walked before the root: at
 * a position that maps into the projection, which is every position this rule fires at, the
 * additional service is never reached. Contributing the item next to the list it accompanies is
 * what makes it arrive.
 *
 * The range covers the PARTIAL NAME and not the `@`. The `@` is source the projection never
 * copied, so it has no counterpart here to point at; the partial does, one-to-one. Replacing
 * `a` with `($0)` leaves the source reading `@($0)` — the `@` the author already typed, and the
 * parentheses with the caret between them.
 */
/**
 * The `@if` / `@foreach` / `@section` family, as items that ride with TypeScript's reply.
 *
 * Same range arithmetic as `escapeHatch`, and for the same reason: the `@` the author typed is
 * source the projection never copied, so the only thing there is to point at here is the
 * partial name after it. The bodies are stored with their `@`, so it comes off the front —
 * completing `@if` over the `@` would leave `@@if`, the escape of decision 1.
 */
function directiveSnippets(
  cached: CachedDocument,
  document: TextDocument,
  position: { line: number; character: number },
  directive: PartialName,
): CompletionItem[] {
  const typed = directive.text.length - 1;
  const start = document.positionAt(document.offsetAt(position) - typed);

  return snippetsAt(cached, directive.span.start)
    .filter((snippet) => snippet.label.startsWith('@'))
    .map((snippet) => ({
      label: snippet.label,
      kind: CompletionItemKind.Snippet,
      detail: snippet.detail,
      sortText: `0_${snippet.label}`,
      labelDetails: { description: 'fudic' },
      insertTextFormat: InsertTextFormat.Snippet,
      textEdit: { range: { start, end: position }, newText: snippet.body.slice(1) },
    }));
}

/**
 * The names in scope that TypeScript did NOT offer, as items of our own.
 *
 * The correction of BUG-23: this set was only ever a filter, so whatever TypeScript failed to
 * say the developer never saw — and in a real project TypeScript fails to say things for
 * reasons that have nothing to do with the `.fud`. A program still loading, a `tsconfig` that
 * does not reach the file, a virtual the project never included: any of them turns the list
 * into `@()` and nothing else, which is exactly what the editor was showing while every test
 * in the suite was green.
 *
 * The names come from the parse, so they exist whenever the file parses. TypeScript's item
 * WINS when there is one — it carries the type, the documentation and the resolve step — and
 * this fills only the gaps. Which means that when everything is healthy this function
 * contributes nothing at all, and the list is TypeScript's, as it should be.
 *
 * Same range arithmetic as `escapeHatch`, and for its reason: the `@` the author typed is
 * source the projection never copied, so the only thing there is to point at is the partial
 * name after it.
 */
function missingNames(
  scope: TemplateScope,
  callableOnly: boolean,
  already: readonly CompletionItem[],
): CompletionItem[] {
  const offered = new Set(already.map((item) => item.label));

  return scopeNames(scope, callableOnly)
    .filter((name) => !offered.has(name))
    .map((name) => ({
      label: name,
      kind: scope.get(name) === 'function' ? CompletionItemKind.Function : CompletionItemKind.Variable,
      detail: 'in scope',
      // Between the constructs a `@` may open (`0_`) and the way out of them (`zz_`).
      sortText: `1_${name}`,
    }));
}

/**
 * The stretch an accepted item replaces: what has been typed AFTER the `@`, never the `@`.
 *
 * Every item of these lists needs one explicitly, and the protocol log is what proves it.
 * TypeScript returns `data`, `handlerClick` and `title` with no replacement range at all —
 * there is nothing to replace at the offset it was asked about — and an item with no range
 * is one the editor ranges itself, using its own idea of where the word starts. In a `.fud`
 * that idea includes the `@`, so the text it filters against is `@h` while the labels are
 * written without one, and it hides every name it was sent. The snippets in the same reply
 * were visible throughout for the only reason that mattered: they carried a range.
 *
 * So the range is stamped on all of them, TypeScript's own included. It is computed in the
 * coordinates of the PROJECTION, which is the document these items belong to, and Volar maps
 * it back — `@if` arriving at `[37:1, 37:1]` in the log is that mapping working.
 */
function anchor(
  document: TextDocument,
  position: { line: number; character: number },
  context: PartialName,
): { start: { line: number; character: number }; end: { line: number; character: number } } {
  // `context.text` is the `@` plus what has been typed of the name; only the name is replaced.
  const typed = context.text.length - 1;
  return { start: document.positionAt(document.offsetAt(position) - typed), end: position };
}

/** Every item given the same replacement range, unless it already brought a usable one. */
function anchored(
  items: readonly CompletionItem[],
  range: ReturnType<typeof anchor>,
): CompletionItem[] {
  return items.map((item) =>
    item.textEdit === undefined
      ? { ...item, textEdit: { range, newText: item.insertText ?? item.label } }
      : item,
  );
}

function escapeHatch(): CompletionItem {
  return {
    label: '@()',
    kind: CompletionItemKind.Snippet,
    detail: 'expression',
    // Last: the names actually in scope are the likelier answer, and this is the way out.
    sortText: 'zz_@(',
    labelDetails: { description: 'fudic' },
    insertTextFormat: InsertTextFormat.Snippet,
    // The `@` is already in the source and is not replaced, so only the parentheses go in.
    // `anchored` turns this into the textEdit; the range is the caller's to know.
    insertText: '($0)',
  };
}


/**
 * An identifier the projection invented.
 *
 * By name, and only by prefix, which is the same test `reservedDollarDiagnostics` applies to
 * the other direction of the same rule: the user may not DECLARE a `$` name, so an offered
 * one can only have come from the scaffolding. `$tpl`, `$props`, `$on`, `$C0` and `$Props`
 * all go; `foo$` stays, because the rule is about what a name starts with.
 */
function isScaffolding(item: CompletionItem): boolean {
  return item.label.startsWith(RESERVED_PREFIX);
}

/**
 * An item TypeScript offers by importing a module for it.
 *
 * Two marks, because the two halves of the protocol carry it differently before the item is
 * resolved: `labelDetails.description` is the module path the editor shows on the right of the
 * list (`../../vite.config`), and `data.source` is what the resolve step would import from.
 * Either one is proof the name does not exist at this position yet — which is exactly what a
 * prop cannot be.
 */
function isAutoImport(item: CompletionItem): boolean {
  if (item.labelDetails?.description !== undefined) return true;
  const data = item.data as { source?: unknown } | undefined;
  return typeof data === 'object' && data !== null && data.source !== undefined;
}

/** The `.fud` behind an embedded document, and whether this is the client projection. */
function fudSourceAt(
  context: LanguageServiceContext,
  document: TextDocument,
): { cached: CachedDocument; isClient: boolean } | undefined {
  const decoded = context.decodeEmbeddedDocumentUri(URI.parse(document.uri));
  if (decoded === undefined) return undefined;

  const [sourceUri, codeId] = decoded;
  if (!isFudSourceUri(sourceUri)) return undefined;

  const root = context.language.scripts.get(sourceUri)?.generated?.root as
    | FudicVirtualCode
    | undefined;
  if (root === undefined) return undefined;

  return { cached: root.document, isClient: codeId === CLIENT_CODE_ID };
}

/**
 * Where a position of the CLIENT projection lives in the `.fud`.
 *
 * Only the client, because it is the only virtual that holds the template, and the template
 * is where every closed position of the grammar is. The server projection is `@code` and
 * nothing else, so a position in it is ordinary TypeScript and the second rule must not
 * touch it.
 */
function sourceOffsetOf(
  cached: CachedDocument,
  isClient: boolean,
  document: TextDocument,
  position: { line: number; character: number },
): number | undefined {
  if (!isClient) return undefined;

  const client = clientVirtualOf(cached);
  if (client === undefined) return undefined;

  return mapToSource(client, document.offsetAt(position), 'completion');
}

/** The client virtual among the three, found by the name the emitter gave it. */
function clientVirtualOf(cached: CachedDocument): VirtualFile | undefined {
  const wanted = clientFileName(cached.path);
  return cached.virtuals.find((virtual) => virtual.fileName === wanted);
}
