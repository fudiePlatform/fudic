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
import { CLASS_PREFIX, PROPERTY_PREFIX, regionAt } from '@fudic/compiler';
import { clientFileName, mapToSource, type VirtualFile } from '@fudic/language-core';
import { URI } from 'vscode-uri';
import type { CachedDocument } from '../document-cache.js';
import { CLIENT_CODE_ID, type FudicVirtualCode } from '../virtual-code.js';
import { isFudSourceUri } from '../uri.js';
import {
  attributeGapContextAt,
  bareBindingValueContextAt,
  brokenValueContextAt,
  directiveContextAt,
  memberContextAt,
  eventContextAt,
  expressionValueContextAt,
  handlerContextAt,
  valueBegun,
  propertyContextAt,
  slotValueContextAt,
  type PartialName,
} from './position.js';
import { styleClassNames } from './classes.js';
import { scopeAt, snippetsAt } from './snippets.js';
import { interpolates, scopeNames, templateScope, type TemplateScope } from './template-scope.js';

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
 * The `sortText` bands TypeScript gives to a name DECLARED where the caret is.
 *
 * `10` is a local declaration and `11` is everything else the lexical scope holds at that
 * offset; `15` is the globals and the keywords, `16` an auto-import. The bands are tsserver's
 * own (`Completions.SortText`) and they answer the one question this file could not answer for
 * itself: which of the 984 names TypeScript offers are in scope AT the offset, rather than
 * merely in the program.
 */
const LOCAL_BANDS: ReadonlySet<string> = new Set(['10', '11']);

/**
 * The two names TypeScript puts in every function scope and no template may read.
 *
 * They arrive in the local band like a real binding because that is what they are — bindings
 * of the function the projection wraps the template in — and they belong to the projection,
 * not to the `.fud`. `$`-prefixed scaffolding is already gone by the time this is asked; these
 * two cannot carry the prefix, because they are the language's and not ours.
 */
const IMPLICIT_BINDINGS: ReadonlySet<string> = new Set(['arguments', 'this']);

/**
 * Whether a name TypeScript offered is one the template may write at THIS offset.
 *
 * The correction of BUG-23 §2.9. The rule used to be `scope.has(item.label)`, with `scope` the
 * names declared at the top level of `@code` and `@client` — a set computed once per file, with
 * no offset in it. That is a global answer to a positional question, and everything a BLOCK
 * introduces fell through it: the `x` of `@foreach (const x of xs)`, the `i` of a `@for`, the
 * bindings of a nested loop at any depth, and anything a `@{ … }` declares. The projection
 * emits real control flow precisely so TypeScript knows those names (`control.ts`), and the
 * filter was throwing away the answer it had asked for.
 *
 * So the question is put to TypeScript instead, through the band it sorts by: a name it reports
 * as LOCAL at this offset is in scope, whatever declared it and however deeply nested. Nesting
 * needs no rule of its own — lexical scope is what the band measures.
 *
 * `scope` survives as a second chance and nothing more: a program that has not finished loading
 * reports no bands at all, and the file's own names still have to be offered then. It can only
 * ADD, so a name it does not know about is no longer a name the developer cannot see.
 */
function inTemplateScope(item: CompletionItem, scope: TemplateScope): boolean {
  if (IMPLICIT_BINDINGS.has(item.label) || isAutoImport(item)) return false;

  const band = item.sortText;
  if (band !== undefined && LOCAL_BANDS.has(band.startsWith('z') ? band.slice(1) : band)) {
    return true;
  }
  return scope.has(item.label);
}

/** What opens an expression: the value of a prop and of an event is one (decision 1). */
const EXPRESSION_PREFIX = '@';

/**
 * Ask the editor for the list again, right where the accepted item left the caret.
 *
 * A prop and an event are only half-written when their name is: what the author is after is
 * `.tone=@`, and the interesting question comes AFTER the `=@`, which is where the names in
 * scope live. Inserting the name and stopping leaves them one manual Ctrl+Space away, every
 * single time; inserting `=@` and asking again chains the two lists into one gesture.
 *
 * The command is VS Code's, and a client that does not know it simply ignores the field — the
 * insertion is complete either way, and no other behaviour depends on it running.
 */
const TRIGGER_SUGGEST = { title: 'Suggest', command: 'editor.action.triggerSuggest' };

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

          // `isIncomplete` survives, and at a position of OURS it is forced on. An incomplete
          // list that comes back complete stops the editor from ever asking again — a list
          // that grows with the next keystroke is exactly what an import suggestion is — and
          // at these positions the answer is a function of the text BEFORE the caret, so it
          // changes with every keystroke by construction.
          //
          // It is what makes the silence of `valueBegun` reach the screen (BUG-23 task 25).
          // With a COMPLETE list VS Code caches the reply and filters it in the client from
          // then on, against `filterText` and never against the server: the four names offered
          // at `.id=` survived `.id=t` because `t` is inside `items`, and `.id=h` because `h`
          // is inside `handlerClick`, so a widget left standing over a written value swallowed
          // the Tab meant for the next prop. Whether it survived depended on the letter and on
          // the names of the file, which is why it looked like a different bug every time.
          //
          // And ONLY when there is something to offer. `isIncomplete` means «ask me again», so
          // an EMPTY incomplete list is a session VS Code keeps alive: it renders «No
          // suggestions» instead of closing, and the widget still eats the first Tab — the
          // silence was right and the flag on it was holding the window open. Empty means
          // complete, which is the one thing that dismisses the list.
          //
          // At a position that is NOT ours the flag is TypeScript's and is left alone: a list
          // that grows with the next keystroke is exactly what an auto-import suggestion is,
          // and inside `@code` that is the whole point.
          if (narrowed.at === undefined) return { ...list, items: kept };
          return { ...list, items: kept, isIncomplete: kept.length > 0 };
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

  // A member reached with a `.` inside an expression: `@data.|`, `title="@data.|"`.
  //
  // TypeScript's list is exactly right here — it is the members of what the author wrote — and
  // this branch exists to SAY so, before the rule at the bottom that drops raw members inside a
  // tag. Without it, `title="@data.|"` and `.tone=@data.|` came back empty: both are attribute
  // values, so both were swept up by a rule written for the keys of `$gap`.
  if (memberContextAt(source.cached.source, offset, region) !== undefined) {
    return { items: visible };
  }

  // A value opened with a `.`: `.name=.|`, `@click=.|`. `FUD0056` — an unquoted value has to be
  // an expression, and an expression opens with a `@`. FIRST, because every branch below would
  // otherwise recognise its own shape in it and answer with a list where the compiler is
  // reporting an error.
  if (brokenValueContextAt(source.cached.source, offset, region)) return { items: [], at: offset };

  // Right of the `=`, with nothing opened yet: `.name=|`, `@click=|`. The value of a prop or an
  // event is an expression over what the TEMPLATE can see, so that scope IS the list — offered
  // WITH the `@` in front, because the author has not typed one and `.name=data` would be a
  // literal rather than the read they meant.
  //
  // This used to answer nothing at all, on the rule that until the `@` is there the author has
  // said nothing to complete. The rule was right about the grammar and wrong about the editor:
  // typing the `@` for them is the whole job. What the silence did fix stays fixed, because the
  // list is this scope and nothing else — never HTML's `role`, never TypeScript's `JSON`.
  //
  // TypeScript's own items are dropped whatever they were, exactly as before: at `.name=` the
  // projection has a hole whose contextual type is the prop's, and at `@click=` one inside
  // `$on`, and in neither is the answer «every name in the program».
  const bare = bareBindingValueContextAt(source.cached.source, offset, region);
  if (bare !== undefined) {
    // A value that has BEGUN as a scalar literal is the author's to finish and nobody else's:
    // a `.prop` takes a bare number (decision 105), and no name in scope can continue `0`. The
    // list has to go, and not because it is noise — a suggestion widget left open over a value
    // that is already written swallows the <kbd>Tab</kbd> meant for the next prop, so the
    // expansion of a tag stops halfway through (BUG-23 task 25).
    if (valueBegun(bare.text)) return { items: [], at: offset };

    const scope = templateScope(source.cached, offset);
    return {
      items: openingItems(scope, bare.event, plainAnchor(document, position, bare)),
      at: offset,
    };
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
  const property = propertyContextAt(source.cached.source, offset, region);
  if (property !== undefined) {
    const range = plainAnchor(document, position, property);
    return {
      items: visible
        .filter(
          (item) => item.kind !== undefined && MEMBER_KINDS.has(item.kind) && !isAutoImport(item),
        )
        // `name=@` and ask again, the same as a prop accepted at a gap, an event and a
        // `class:`. The three of those were doing it and this one was not, so the very same
        // prop behaved differently depending on whether the developer had reached it with
        // Ctrl+Space or by typing the dot — which is the kind of difference nobody can learn.
        // The `.` is already in the source here, so only the name is written.
        .map((item) => {
          const name = memberName(item.label);
          return {
            label: name,
            kind: CompletionItemKind.Property,
            filterText: name,
            sortText: item.sortText ?? name,
            detail: 'prop',
            textEdit: { range, newText: `${name}=${EXPRESSION_PREFIX}` },
            command: TRIGGER_SUGGEST,
          };
        }),
      at: offset,
    };
  }

  // A slot name being typed: `<div slot="PE|">`. The names are TypeScript's — the union the
  // parent declares — and the RANGE is not, because the projection carries the quotes and the
  // source does not, so every offset TypeScript reports inside that stretch is two characters
  // adrift. Stamped from the source, where the name is a plain word, `PEPITO` replaces the `p`
  // instead of landing beside it.
  const slotValue = slotValueContextAt(source.cached.source, offset, region);
  if (slotValue !== undefined) {
    const range = plainAnchor(document, position, slotValue);
    return {
      items: visible.map((item) => ({
        label: item.label,
        kind: CompletionItemKind.EnumMember,
        filterText: item.label,
        sortText: item.sortText ?? item.label,
        detail: 'slot of the parent',
        // `data` dropped for the reason it is dropped at a gap: resolving rebuilds the edit from
        // TypeScript's own coordinates, which are the ones that were adrift to begin with.
        textEdit: { range, newText: item.label },
      })),
      at: offset,
    };
  }

  // After the `@` of an event: `<app-badge @cli|>`. The list is `keyof HTMLElementEventMap`,
  // computed by TypeScript over the string literal `$on` takes, and it arrives here correct —
  // what it does not carry is fudic's half of the answer. An event is written `@click=@handler`,
  // so accepting the NAME writes the `=@` behind it and asks again, exactly as a prop does at a
  // gap. The two halves of one binding, one gesture.
  const event = eventContextAt(source.cached.source, offset, region);
  if (event !== undefined) {
    // Not in a LAYOUT. `keyof HTMLElementEventMap` is as true there as anywhere, and it is
    // still the wrong answer: an event is written `@click=@handler`, a layout has no `@code`
    // (`FUD0437`) and therefore no handler to name, so every one of those 107 names leads to a
    // binding that cannot be completed. Empty, and the position stays closed — see
    // `ownedByProjection` — so nothing else fills the silence either.
    if (!interpolates(source.cached)) return { items: [], at: offset };

    const range = plainAnchor(document, position, event);
    return {
      items: visible.map((item) => ({
        label: item.label,
        kind: item.kind ?? CompletionItemKind.Event,
        filterText: item.label,
        sortText: item.sortText ?? item.label,
        detail: 'event',
        // `data` dropped for the reason `gapItem` drops it: resolving rebuilds the edit from
        // TypeScript's own idea of the name and overwrites the `=@` on the way to the document.
        textEdit: { range, newText: `${item.label}=${EXPRESSION_PREFIX}` },
        command: TRIGGER_SUGGEST,
      })),
      at: offset,
    };
  }

  // An EMPTY position inside a start tag — `<app-badge |>` — and the one place where the three
  // vocabularies of an attribute meet. AFTER the branch above, and the order is the rule: a
  // caret one character past a dot is a prop being reached, never a gap, and answering it from
  // here would insert `.tone` over the dot already written.
  //
  // The props arrive from `$gap` with their dot inside a QUOTED key, because `.tone` is not an
  // identifier and TypeScript quotes what it cannot write bare. That accident is the whole
  // discriminator: quoted means the component's contract, bare means HTML's vocabulary, and no
  // list of attribute names is kept anywhere to tell them apart.
  //
  // The classes ride along rather than coming from the root service, and it is the constraint
  // of `createFudicTagService` all over again: an additional plugin runs on the FIRST mapping
  // alone, the embedded codes are walked before the root, and a gap maps into the projection.
  // Whatever is to appear beside TypeScript's answer has to travel inside TypeScript's answer.
  const gap = attributeGapContextAt(source.cached.source, offset, region);
  if (gap !== undefined) {
    const range = plainAnchor(document, position, gap);
    const members = visible.filter(
      (item) => item.kind !== undefined && MEMBER_KINDS.has(item.kind) && !isAutoImport(item),
    );
    return {
      items: anchored(
        [
          ...members.map((item) => gapItem(item, range)),
          ...classItems(source.cached),
          SLOT_ITEM,
        ],
        range,
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
    const scope = templateScope(source.cached, offset);
    // An EVENT takes the same list, minus everything that cannot be called: what goes after
    // `@click=` has to be a listener, so a `const` holding a number is not a candidate however
    // legitimately it is in scope. Any other binding keeps the whole scope — a value is a value.
    const callableOnly = handlerContextAt(source.cached.source, offset, region) !== undefined;

    const kept = visible.filter(
      (item) =>
        inTemplateScope(item, scope) &&
        (!callableOnly || (item.kind !== undefined && CALLABLE_KINDS.has(item.kind))),
    );
    const range = anchor(document, position, value);
    return {
      items: anchored(
        [...reading([...kept, ...missingNames(scope, callableOnly, kept)]), escapeHatch()],
        range,
      ),
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
  const directiveScope =
    directive === undefined ? undefined : scopeAt(source.cached, directive.span.start);

  // A `@` inside `@code` opens a REGION — `@server`, `@client` — and nothing else. The offset is
  // TypeScript's, so TypeScript answers it with the whole program: a thousand names, of which
  // exactly zero can follow a `@`. Empty here, and the two snippets arrive from the root, which
  // is the only voice left at a position no other service claims.
  if (directive !== undefined && directiveScope === 'code-block') {
    return { items: [], at: offset };
  }

  if (directive !== undefined && directiveScope === 'markup') {
    const scope = templateScope(source.cached, offset);
    const kept = visible.filter((item) => inTemplateScope(item, scope));
    const range = anchor(document, position, directive);
    // A LAYOUT keeps only the snippets, and there they are the three `@Render*`: it has no
    // `@code` and no `data`, so an expression cannot read anything — `@()` included. See
    // `interpolates`.
    const open = interpolates(source.cached);
    return {
      items: anchored([
      ...(open ? reading([...kept, ...missingNames(scope, false, kept)]) : []),
      // `@()` belongs here too, and its absence was the one defect this position had that the
      // suite did catch: a `@` in text may open any expression at all, exactly as a `=@` may,
      // and the way out has to be offered in both or in neither.
      ...(open ? [escapeHatch()] : []),
      ...directiveSnippets(source.cached, document, position, directive),
      ], range),
      at: offset,
    };
  }

  // Inside a start tag, a raw MEMBER is never an answer.
  //
  // Every object literal the projection puts there is ours — `$props`, `$attrs`, `$gap` — so
  // every member TypeScript can enumerate at such an offset is a key WE invented, in the shape
  // the projection needed and not in the shape the author types: `".tone"?`, `accesskey?`.
  // Where a branch above recognises the position it rewrites them into `.tone=@` and
  // `class:red=@`; where none does, the caret is somewhere the mapping cannot place exactly —
  // a gap anchor spells three characters and stands for however many the author left blank, so
  // an offset mapped back out of it lands NEAR the caret rather than on it.
  //
  // That is how `.tone=.|` came to answer with a hundred and fifty keys: a position the
  // compiler is reporting `FUD0056` on, answered with the raw insides of the projection.
  // Dropping them is safe precisely because they are ours — a member the USER can complete
  // lives inside `@code`, where the region is `ts` and this rule does not reach.
  if (region.kind === 'tag') {
    return {
      items: visible.filter((item) => item.kind === undefined || !MEMBER_KINDS.has(item.kind)),
      at: offset,
    };
  }

  // Inside the value of a PLAIN attribute, TypeScript has nothing to say at all.
  //
  // `class`, `slot`, `role`, `href` are HTML's, and the projection puts only literals there —
  // so whatever TypeScript can enumerate is the inside of a literal WE wrote, in coordinates
  // that are ours and not the author's. `slot=".` proved it: with the dot making the name
  // broken, the server's own branch stood aside and TypeScript's `'PEPITO'` came through with
  // the projection's range, which inserts beside the dot instead of over it.
  //
  // Empty rather than filtered, and it is what lets HTML answer: Volar only hands the position
  // to the next document when a list comes back with nothing in it. That is how `role=""` on a
  // component came to offer the ARIA roles, exactly as it does on a `<div>`.
  //
  // A `.prop`, a `@event` and anything with a `:` are NOT plain — their values are expressions
  // and TypeScript owns them, narrowed by the branches above.
  if (region.kind === 'attr-value' && isPlainAttribute(region.attribute?.name)) {
    return { items: [], at: offset };
  }
  return { items: visible };
}

/**
 * An attribute HTML owns — `class`, `slot`, `role`, `data-x` — and nothing fudic added to it.
 *
 * Said as what a plain name IS rather than as the three prefixes it is not: a letter and then
 * letters, digits, hyphens and underscores. That admits every attribute of the specification,
 * `data-*` and `aria-*` included, and it excludes `.tone`, `@click`, `class:red` and `bus:cart`
 * by the characters they are spelled with — as well as an attribute NAMED with an expression,
 * which is not a string at all.
 */
function isPlainAttribute(name: string | { readonly type: string } | undefined): boolean {
  return typeof name === 'string' && /^[A-Za-z][-\w]*$/u.test(name);
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
      // WITHOUT the `@`, and it is what makes the list survive the second keystroke. The range
      // this item replaces is the partial name alone — the `@` is source the projection never
      // copied — so the editor filters `@foreach` against `f` and drops it. At `@` the word is
      // empty and everything shows; at `@f` only this makes `@if` and `@foreach` stay.
      filterText: snippet.label.slice(1),
      sortText: `0_${snippet.label}`,
      labelDetails: { description: 'fudic' },
      insertTextFormat: InsertTextFormat.Snippet,
      textEdit: { range: { start, end: position }, newText: snippet.body.slice(1) },
    }));
}

/**
 * The NAME inside the label TypeScript hands back for a member of an object literal.
 *
 * Two marks it adds and neither belongs to any name: a trailing `?` on every optional member,
 * and quotes around every key that is not a bare identifier. Both families of a gap are quoted,
 * for opposite reasons — a prop because `$gap` writes the dot into the key, `.tone`, and an
 * ARIA attribute because it carries a hyphen, `"aria-checked"` — so stripping is the rule and
 * not the exception.
 *
 * Two marks, TWO steps, and one pattern for both is what got it wrong twice. The first attempt
 * matched the quotes and forgot the `?`, so `".id"?` was taken for an HTML attribute and written
 * into the source with its quotes. The second matched both at once — `/^"?([^"]+)"?\??$/` — and
 * the greedy class ate the `?` of every UNQUOTED label: `aria-sort` came out clean because the
 * quote stopped it, `role?` and `accesskey?` kept their mark. A name has no quotes and no
 * question mark; peeling one and then the other cannot half-succeed.
 */
function memberName(label: string): string {
  const optional = label.endsWith('?') ? label.slice(0, -1) : label;
  return optional.length > 1 && optional.startsWith('"') && optional.endsWith('"')
    ? optional.slice(1, -1)
    : optional;
}

/**
 * One item of a gap: its family, its place in the order, its icon and what it writes.
 *
 * Two groups come through here — the props and HTML's vocabulary — and the dot tells them
 * apart, because `$gap` put it in the key. The classes are added separately, between the two.
 * TypeScript hands every one of them back with the same `sortText`, measured `12` for all, so
 * the grouping is entirely ours to state.
 *
 * The item is rebuilt rather than spread over, and `data` is deliberately DROPPED. That field
 * is what `completionItem/resolve` reads, and resolving one of these rebuilds the edit from
 * `originalItem.name` — which is `"\"aria-sort\""`, the key as an object literal spells it. The
 * reply carried the right edit all along and the resolve step overwrote it on the way to the
 * document, which is how `<app-circle "aria-sort">` ended up in the file. No `data`, no
 * resolve, no overwrite. The cost is the documentation pane, and predictable insertion is worth
 * more than a tooltip.
 *
 * The kind is stated for the same reason the text is: an HTML attribute must look and behave in
 * a `.fud` exactly as it does in a `.html`, so it gets `Value` — the kind the HTML service uses,
 * the icon of the second screenshot — and it writes `aria-sort="$1"`, name, equals, quotes and
 * the caret between them. A prop is fudic's own and says so with a different icon, and it
 * writes the bare `.tone`: what follows a prop is `="@(…)"`, and guessing which of the two the
 * author wants is not this function's business.
 */
function gapItem(item: CompletionItem, range: ReturnType<typeof anchor>): CompletionItem {
  const name = memberName(item.label);
  const prop = name.startsWith(PROPERTY_PREFIX);

  return {
    label: name,
    kind: prop ? CompletionItemKind.Property : CompletionItemKind.Value,
    filterText: name,
    sortText: `${prop ? '0' : '2'}_${name}`,
    detail: prop ? 'prop' : 'attribute of any element',
    insertTextFormat: prop ? InsertTextFormat.PlainText : InsertTextFormat.Snippet,
    // A prop is written `.tone=@expr`, so accepting one writes the `=@` too and asks again. An
    // HTML attribute takes a literal, so it gets the quotes and the caret between them, which is
    // what a `.html` does.
    textEdit: { range, newText: prop ? `${name}=${EXPRESSION_PREFIX}` : `${name}="$1"` },
    // BOTH families ask again, and that is the whole of «a native attribute behaves the same on
    // a custom element». In a `<div>` the HTML service writes `role="…"` and reopens the list,
    // so the values arrive without touching the keyboard; on a component the very same
    // attribute came from here and stopped at the quotes, so the author had to know to press
    // Ctrl+Space. Two behaviours for one attribute is the kind of difference nobody can learn.
    //
    // It is what makes `class=` and `slot=` work too: the list behind those quotes is this
    // server's — the classes of the file's `<style>`, the slots the parent declares — and a
    // list nobody opens is a list nobody has.
    command: TRIGGER_SUGGEST,
  };
}

/**
 * `slot` at a gap, which no other voice offers on a COMPONENT.
 *
 * It is HTML's attribute and it is deliberately absent from `$GlobalAttrs` — its value is
 * checked against the parent's `$Slots` rather than as a scalar, and declaring it there would
 * give that up. The consequence nobody had noticed is that it then appears in no list at all
 * on a custom element, while a `<div>` gets it from the HTML service: the one attribute whose
 * values this server can name was the one the author had to know about in advance.
 *
 * Written like any other native attribute — `slot="…"`, quotes and a caret between them — and
 * asking again, which is what puts the parent's slot names on screen without a keystroke.
 */
const SLOT_ITEM: CompletionItem = {
  label: 'slot',
  kind: CompletionItemKind.Value,
  filterText: 'slot',
  sortText: '2_slot',
  detail: 'attribute of any element',
  insertTextFormat: InsertTextFormat.Snippet,
  insertText: 'slot="$1"',
  command: TRIGGER_SUGGEST,
};

/**
 * `class:red`, `class:yellow` — the conditional classes this file's `<style>` declares.
 *
 * The same list `classContextAt` already answers with once the colon is typed, offered one step
 * earlier: at a gap the developer has not written `class:` yet, and a name they have to know in
 * advance to ask for is a name the editor is not helping with. `styleClassNames` is the one
 * definition, so the two positions can never disagree.
 *
 * Written whole, prefix included, because that is what goes in the source — the gap is empty,
 * so there is no `class:` there to complete after.
 *
 * `EnumMember` and not `Value`, and the icon is the reason: `Value` is what the HTML service
 * marks an attribute with, so wearing it here would make fudic's own binding indistinguishable
 * from HTML's vocabulary in the very list where the two sit side by side. The same kind the
 * sections of a layout already use — a name out of a closed set this file knows.
 */
function classItems(cached: CachedDocument): CompletionItem[] {
  return styleClassNames(cached).map((name) => ({
    label: `${CLASS_PREFIX}${name}`,
    kind: CompletionItemKind.EnumMember,
    detail: 'class of this file',
    sortText: `1_${name}`,
    // `class:red=@` and ask again, exactly as a prop and an event do: a conditional class is a
    // BINDING, and a binding with no expression is half of one — what decides whether the class
    // is on is the value, and that is the list the author is really after.
    insertText: `${CLASS_PREFIX}${name}=${EXPRESSION_PREFIX}`,
    command: TRIGGER_SUGGEST,
  }));
}

/**
 * The list for a value the author has committed to and not opened: every name the template can
 * see, each one writing the `@` the author has yet to type, and the way out to any expression.
 *
 * The `@` in the `newText` and not in the label, and both halves are deliberate. In the label it
 * would be noise the developer has to read past on every item; in the text it is the difference
 * between `.name=@data`, the read they meant, and `.name=data`, a literal string that happens to
 * spell a variable's name.
 *
 * `callableOnly` for an event, because what goes after `@click=` has to be a listener — the same
 * narrowing `expressionValueContextAt` applies once the `@` is there, so the list does not change
 * shape under the keystroke that opens it.
 */
function openingItems(
  scope: TemplateScope,
  event: boolean,
  range: ReturnType<typeof anchor>,
): CompletionItem[] {
  const names = scopeNames(scope, event).map(
    (name): CompletionItem => ({
      label: `${EXPRESSION_PREFIX}${name}`,
      filterText: name,
      kind:
        scope.get(name) === 'function' ? CompletionItemKind.Function : CompletionItemKind.Variable,
      detail: 'in scope',
      sortText: `1_${name}`,
      textEdit: { range, newText: `@${name}` },
    }),
  );

  return [
    ...names,
    {
      label: '@()',
      kind: CompletionItemKind.Snippet,
      detail: 'expression',
      sortText: 'zz_@(',
      labelDetails: { description: 'fudic' },
      insertTextFormat: InsertTextFormat.Snippet,
      textEdit: { range, newText: '@($0)' },
    },
  ];
}

/**
 * The stretch an accepted item replaces at a position with NO prefix.
 *
 * `anchor` subtracts one for the `@` that opened its contexts; a gap has nothing of the sort,
 * so what is replaced is exactly the word typed so far — empty at `<app-badge |>`, `na` at
 * `<app-badge na|>`.
 */
function plainAnchor(
  document: TextDocument,
  position: { line: number; character: number },
  context: PartialName,
): ReturnType<typeof anchor> {
  return {
    start: document.positionAt(document.offsetAt(position) - context.text.length),
    end: position,
  };
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
/**
 * The names of the template, LABELLED with the `@` that reaches them.
 *
 * In fudic a name is read with a `@` — `@data.title`, `@click=@fn` — and a list that spells
 * them bare beside `@if` and `@()` teaches that `data` is something you write as `data`. It is
 * not: without the `@` it is a literal, or an unknown identifier, depending on where it lands.
 * The label is the only part of an item the developer reads, so it is the part that has to be
 * true.
 *
 * `filterText` keeps the bare name, and that is not a detail: VS Code matches an item against
 * the text between the start of its replacement range and the caret, and that range begins
 * AFTER the `@` — the one the author already typed is not replaced. With the `@` in the
 * matched text every one of these items would be dropped by the editor before reaching the
 * list, which is the trap `scopeItems` documents and the reason the labels were bare to begin
 * with.
 */
function reading(items: readonly CompletionItem[]): CompletionItem[] {
  return items.map((item) => ({
    ...item,
    label: `${EXPRESSION_PREFIX}${item.label}`,
    filterText: item.filterText ?? item.label,
    // And what is WRITTEN is the bare name, always. `anchored` falls back to the label for an
    // item that carries no edit of its own, and the label now starts with the `@` the author
    // has already typed: accepting `@fn` after `@click=@` wrote `@@fn`, which is the escape of
    // decision 1 and a `FUD0056` on the value. The label is for reading; this is for writing.
    ...(item.textEdit === undefined && item.insertText === undefined
      ? { insertText: item.label }
      : {}),
  }));
}

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

/**
 * Every item given the same replacement range, unless it already brought a usable one.
 *
 * What is WRITTEN is the insert text, never the label. Every item that arrives here without an
 * edit carries one — `escapeHatch`, `classItems`, `SLOT_ITEM`, and everything `reading` has
 * been through — and the reason is the labels: they open with the `@` that reaches a name, and
 * that `@` is already in the source. Writing the label after one wrote `@@fn`, which is the
 * escape of decision 1 and a `FUD0056` on the value.
 */
function anchored(
  items: readonly CompletionItem[],
  range: ReturnType<typeof anchor>,
): CompletionItem[] {
  return items.map((item) => {
    if (item.textEdit !== undefined) return item;

    /* v8 ignore next -- every unanchored item carries one; the `??` is for the LSP type alone. */
    const newText = item.insertText ?? item.label;
    return { ...item, textEdit: { range, newText } };
  });
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
