/**
 * What may be written in a `control`, and where (SDD-34 §4.1, decisions 109 and 115).
 *
 * `control` is the one binding whose value is not «any expression the template can see». It
 * takes a form NODE — a `Control<T>`, a form or a group — and nothing else: `@data`, a handler
 * and a `string` prop are all in scope at that offset and none of them can go there. The
 * editor was offering the whole scope anyway, which is the same class of mistake as offering
 * TypeScript's 984 globals after a `=@` and one level deeper.
 *
 * Two halves, and they are answered by two different authorities on purpose.
 *
 * WHERE it may be written is the grammar's, and it is asked of the parse alone: an element
 * inside a `<form control="…">`, the `<form>` that opens one, or anything at all inside a
 * `formassociated` template — the same three cases `control-inside-form` reports `FUD0595` off
 * (decision 115). One rule, and the editor must ask it with the analyser's own function or the
 * bulb lights where the compiler is about to complain.
 *
 * WHAT may be written is the TYPE's, and only TypeScript knows it. The shape is asked of the
 * checker rather than of a name — a form arrives from an `import`, from `props<T>()`, from a
 * `@foreach` binding, and no reader of the source could classify all three — and it is asked
 * STRUCTURALLY, with the two shapes `globals.ts` already checks the projection against: a
 * control is CALLABLE and carries `set`/`touch`, a form or a group carries `$touch`/`$validate`
 * and is not callable. The projection and the completion therefore agree by construction; a
 * table of type names here would be a second reader of one fact.
 *
 * Everything degrades to «no answer» rather than to a wrong one: no TypeScript loaded
 * (SDD-24 §6.1), a program still building, a file the project never included. The callers
 * then leave the position as they found it, which is the list that was there before this
 * module existed.
 */

import {
  attributeValueSpan,
  classifyAttribute,
  CONTROL_PROP,
  controlTarget,
  documentRoots,
  isFormAssociated,
  walk,
  type Attribute,
  type ElementNode,
  type StructuredDocument,
} from '@fudic/compiler';
import { clientFileName, mapToGenerated } from '@fudic/language-core';
import type * as ts from 'typescript';
import type { CachedDocument } from '../document-cache.js';

/**
 * What a node IS, by the shape it has rather than by the type it was declared with.
 *
 * Two and not three: a group IS a nested form (`GroupNode<S> = Form<S>`), so there is no shape
 * that tells them apart and inventing one here would be inventing a distinction the model does
 * not make.
 */
export type NodeKind = 'control' | 'group';

/** What the element a `control` sits on expects to be handed (decision 109). */
export type ControlWants =
  /** `<form>` — the form itself. */
  | 'form'
  /** `<input>`, `<textarea>`, `<select>` — a leaf. */
  | 'control'
  /** Anything else: a `<div>`, a `<fieldset>`, a `<section>` grouping part of the form. */
  | 'group'
  /** A component tag: what fits is whatever its `ctrl` prop declared (decision 112). */
  | 'component';

/** The members of `Control<T>` that no form has. It is also CALLABLE, which is checked apart. */
const CONTROL_SHAPE: readonly string[] = ['set', 'touch'];

/** The members of `FormApi` that no control has. */
const GROUP_SHAPE: readonly string[] = ['$touch', '$validate'];

/** The tag that opens a form's scope. HTML's own, never a component that is named so. */
const FORM_TAG = 'form';

/**
 * What the element makes of a `control`, or nothing when it can make nothing of one.
 *
 * `controlTarget` is the compiler's, and asking it here rather than re-reading the tag is the
 * whole point: the emit picks its bind module off that answer and the semantic pass reports
 * `FUD0592` off it, so an editor with a rule of its own is BUG-23 §2.4 again. `unsupported` —
 * an `<input type="submit">`, an `<input type="file">` — has no answer, and offering the
 * attribute there would be offering the error.
 */
export function controlWants(el: ElementNode, isComponent: boolean): ControlWants | undefined {
  const target = controlTarget(el, isComponent);
  switch (target.kind) {
    case 'form':
      return 'form';
    case 'value':
      return 'control';
    case 'component':
      return 'component';
    case 'group':
      return 'group';
    default:
      return undefined;
  }
}

/**
 * Whether a node of this kind is worth OFFERING on an element that wants that.
 *
 * Wider than `accepts` on purpose, and the difference is the one a list has that a repair does
 * not: a completion is a step and a repair is a finished binding. `@userForm` is not what an
 * `<input>` binds — `accepts` is right about that — but it is the only way to REACH what it
 * binds, and dropping it left the one position where the form is the whole answer empty. The
 * same holds one level down: `@userForm.direccion` on an `<input>` is a group, and it is how
 * `@userForm.direccion.calle` gets written.
 *
 * A control is the other direction and stays filtered: nothing hangs off a leaf, so on a
 * `<form>` or a `<div>` it neither fits nor leads anywhere.
 */
export function reaches(wants: ControlWants, kind: NodeKind): boolean {
  return kind === 'group' ? true : accepts(wants, kind);
}

/** Whether a node of this kind may be handed to an element that wants that. */
export function accepts(wants: ControlWants, kind: NodeKind): boolean {
  // A component is checked against the `ctrl` its own contract declares, in the props literal
  // and by TypeScript (decision 112). Narrowing it from here would be this package guessing at
  // a type it has not read — a control-component is the ordinary case, a component that groups
  // is legal, and the child is the one that says which.
  if (wants === 'component') return true;
  return wants === 'control' ? kind === 'control' : kind === 'group';
}

/** How an element that wants this reads in a list. */
export function wantsLabel(wants: ControlWants): string {
  switch (wants) {
    case 'form':
      return 'form';
    case 'control':
      return 'control';
    case 'group':
      return 'group';
    default:
      return 'control node';
  }
}

/**
 * Every element of this document where a `control` may legally be written (decision 115).
 *
 * The analyser's rule, read forwards instead of backwards: `control-inside-form` walks for the
 * bindings that have no `<form control>` above them, and this walks for the places that do. The
 * three cases are the same three, and they have to be — an editor that offers the attribute
 * where `FUD0595` is about to land is an editor that hands out errors.
 *
 * A `<form>` is always in the set even when it carries no `control` yet: it is the element that
 * OPENS a form, so «you may write one here» is exactly true of it. That is also the only way
 * the first binding of a file can ever be offered.
 */
export function controlSites(document: StructuredDocument, source: string): ReadonlySet<ElementNode> {
  const sites = new Set<ElementNode>();

  // A control-component binds the node its parent handed it, and its own template has no form
  // in it by construction (decision 115's exemption). Everything in it is a site.
  const host = document.type === 'component-document' ? document.template : undefined;
  const anywhere = host !== undefined && isFormAssociated(host);

  const inside = new WeakSet<ElementNode>();

  walk(documentRoots(document), {
    element(el, parent) {
      const under = parent !== undefined && (inside.has(parent) || opensForm(parent, source));
      if (under) inside.add(el);
      if (anywhere || under || el.name.toLowerCase() === FORM_TAG) sites.add(el);
    },
  });
  return sites;
}

/**
 * Every place in this file where a `control` could be written and is not — with the form it
 * would belong to, when there is one above it.
 *
 * What the light bulb is made of. The completion answers «what may I write HERE», which needs
 * only the element under the cursor; the bulb answers «what is missing», which needs the whole
 * tree: a `<form>` with a form in scope and no binding, and every field under a bound `<form>`
 * that names no node yet. Both readings share `controlSites` so a bulb never appears where the
 * attribute would be `FUD0595`.
 *
 * `owner` is the expression the enclosing `<form control="…">` was given, verbatim — `@userForm`
 * — plus an offset INSIDE it. The text is what a repair writes and the offset is what the
 * checker reads the fields off; keeping them together is what stops the two from being
 * recovered twice by two readers.
 */
export interface ControlSite {
  readonly element: ElementNode;
  readonly wants: ControlWants;
  /** Just past the tag name: where ` control=…` goes. */
  readonly insertAt: number;
  /** The form above, when this element is not the one that opens it. */
  readonly owner?: FormOwner;
}

/** The `<form control="…">` an element hangs under, as written and as the checker sees it. */
export interface FormOwner {
  /** `@userForm` — the value of its `control`, verbatim. */
  readonly path: string;
  /** An offset inside that expression, in `.fud` coordinates. */
  readonly at: number;
}

export function controlBindingSites(
  document: StructuredDocument,
  source: string,
): readonly ControlSite[] {
  const sites = controlSites(document, source);
  const owners = new WeakMap<ElementNode, FormOwner>();
  const found: ControlSite[] = [];

  walk(documentRoots(document), {
    element(el, parent) {
      // Parents fire before children, so the owner of this element is already known — the same
      // property `control-inside-form` leans on to decide what is inside what.
      const inherited = parent === undefined ? undefined : (owners.get(parent) ?? ownerOf(parent, source));
      if (inherited !== undefined) owners.set(el, inherited);

      if (!sites.has(el) || bindsControl(el, source)) return;
      const wants = controlWants(el, el.name.includes('-'));
      if (wants === undefined) return;

      found.push({
        element: el,
        wants,
        insertAt: el.openSpan.start + 1 + el.name.length,
        ...(inherited === undefined ? {} : { owner: inherited }),
      });
    },
  });
  return found;
}

/**
 * The form this element opens, when it opens one: `<form control="@userForm">`.
 *
 * The span comes off the BINDING and not off the attribute, and that is what makes the empty
 * cases disappear instead of being guarded: a `control` with no expression behind it —
 * `control=`, `control=""` — never classifies as one, the grammar degrades it to a plain
 * attribute (`FUD0590`). So a binding that reaches here has an expression, and an expression
 * has at least its `@`.
 */
function ownerOf(el: ElementNode, source: string): FormOwner | undefined {
  if (el.name.toLowerCase() !== FORM_TAG) return undefined;

  for (const attr of el.attributes) {
    const binding = classifyAttribute(attr, source).value;
    if (binding.type !== 'control') continue;
    // One character back from the end, so the offset falls INSIDE the expression rather than
    // just past it — which is where a half-open mapping would already have left it.
    const value = binding.value.span;
    return { path: source.slice(value.start, value.end), at: value.end - 1 };
  }
  return undefined;
}

/**
 * Every path this file already binds: `@userForm.name`, `@userForm`, and the `.ctrl` twins.
 *
 * What keeps the bulb from offering a field that is already on screen three lines up. Read as
 * TEXT and compared as text, which is exactly right here: two spellings of one path are two
 * bindings of one node, and the mistake the author would be making is the same either way.
 */
export function boundPaths(document: StructuredDocument, source: string): ReadonlySet<string> {
  const taken = new Set<string>();

  walk(documentRoots(document), {
    element(el) {
      for (const attr of el.attributes) {
        if (!isControlBinding(attr, source)) continue;
        const value = attributeValueSpan(source, attr);
        if (value !== undefined) taken.add(source.slice(value.start, value.end));
      }
    },
  });
  return taken;
}

/** Whether this element is the `<form control="…">` that opens a form's scope. */
function opensForm(el: ElementNode, source: string): boolean {
  if (el.name.toLowerCase() !== FORM_TAG) return false;
  return el.attributes.some((attr) => classifyAttribute(attr, source).value.type === 'control');
}

/**
 * Whether the element already names a node, in which case there is none to offer.
 *
 * Two spellings of one binding, and both have to count. `control="@f.alias"` on a component tag
 * IS the `ctrl` prop (decision 112), so an author who wrote `.ctrl=@f.alias` by hand has bound
 * that element as surely as one who wrote the attribute — and an editor that offers `control`
 * there is offering the same node twice on the same tag.
 */
export function bindsControl(el: ElementNode, source: string): boolean {
  return el.attributes.some((attr) => isControlBinding(attr, source));
}

/** A `control`, or the `.ctrl` prop it crosses as. */
function isControlBinding(attr: Attribute, source: string): boolean {
  const binding = classifyAttribute(attr, source).value;
  if (binding.type === 'control') return true;
  return binding.type === 'property' && binding.name === CONTROL_PROP;
}

/**
 * Whether `control` belongs in the attribute list of this element, and what it would take.
 *
 * The one question the two gap lists ask — a native `<input |>` from the additional plugin, a
 * `<app-input |>` from inside TypeScript's own reply — so that the same element answers the
 * same way whoever is asking. Three reasons for a no, and each is a fact and not a taste: the
 * position is outside any form (decision 115), the element already carries one, or the element
 * can make nothing of a `control` at all — `<input type="submit">`, which is `FUD0592`.
 *
 * A LAYOUT never offers it: it has no `@code` (`FUD0437`), so there is no node to name and the
 * attribute would be an error the moment it landed.
 */
export function controlOfferAt(
  cached: CachedDocument,
  el: ElementNode,
  isComponent: boolean,
): ControlOffer | undefined {
  if (cached.document.type === 'layout-document') return undefined;

  const wants = controlWants(el, isComponent);
  if (wants === undefined) return undefined;
  if (bindsControl(el, cached.source)) return undefined;
  if (!controlSites(cached.document, cached.source).has(el)) return undefined;

  return { wants, label: wantsLabel(wants) };
}

/** What the completion item at a gap is made of: what fits there, and how to say it. */
export interface ControlOffer {
  readonly wants: ControlWants;
  /** `form`, `control`, `group` — what the element takes, in the words of the model. */
  readonly label: string;
}

/**
 * The names visible at a projected offset that hold a form node, and what each one is.
 *
 * `getSymbolsInScope` and not the template scope of the parse, and the two are answering
 * different questions: the parse knows which names EXIST, and only the checker knows which of
 * them is a `Control<T>`. The lexical part comes free with it — a form pulled out of a
 * `@foreach` is in scope at the offset and nowhere else, and no set computed per file could
 * have said so.
 *
 * Every meaning is asked for rather than `SymbolFlags.Value`, because the SHAPE is what decides
 * here: a type or a namespace simply fails both tests, and passing a flag would mean this
 * module carrying a copy of TypeScript's enum for a filter it does not need.
 */
export function nodesInScope(
  languageService: ts.LanguageService | undefined,
  file: string,
  at: number,
): ReadonlyMap<string, NodeKind> {
  const found = new Map<string, NodeKind>();

  const program = languageService?.getProgram();
  const source = program?.getSourceFile(file);
  if (program === undefined || source === undefined) return found;

  const checker = program.getTypeChecker();
  const location = nodeAt(source, at);

  for (const symbol of checker.getSymbolsInScope(location, ALL_MEANINGS)) {
    // A name the projection invented is not a name the author may write, and `$props` and
    // `$control` are in scope at every offset of the virtual.
    if (symbol.name.startsWith('$')) continue;
    const kind = kindOf(checker, checker.getTypeOfSymbolAtLocation(symbol, location));
    if (kind !== undefined) found.set(symbol.name, kind);
  }
  return found;
}

/**
 * The members of the node written just before a `.`, and what each one is.
 *
 * `@userForm.|` — the caret is one character past the dot, and the identifier that ends there
 * is what the members belong to. Reading the type off it rather than off the completion items
 * is what makes `$validate`, `$errors` and `$fields` disappear without a list of names being
 * kept here: a form's own API is not a node, so it fails the shape test like anything else.
 */
export function nodeMembersBefore(
  languageService: ts.LanguageService | undefined,
  file: string,
  at: number,
): ReadonlyMap<string, NodeKind> {
  // Two characters back: one for the dot, one to land INSIDE the name rather than at its end,
  // which is where a half-open containment test would already have left it.
  return at < 2 ? new Map() : nodeMembersAt(languageService, file, at - 2);
}

/**
 * The members of the node whose expression covers this projected offset.
 *
 * The same reading, asked from inside the expression rather than from past its dot. It is what
 * the light bulb needs: the `<form control="@userForm">` above a field says which form the
 * field belongs to, and its fields are the answers the bulb offers.
 *
 * The offset is optional because its source is: `projectedOffset` has nothing to say about a
 * `.fud` offset the projection never copied. Taking that here rather than at each call site is
 * what keeps the degradation in ONE place — a caller hands over what it has, and «no offset»
 * and «no program» come back as the one empty answer this module promises.
 */
export function nodeMembersAt(
  languageService: ts.LanguageService | undefined,
  file: string,
  at: number | undefined,
): ReadonlyMap<string, NodeKind> {
  const found = new Map<string, NodeKind>();

  const program = languageService?.getProgram();
  const source = program?.getSourceFile(file);
  if (at === undefined || program === undefined || source === undefined) return found;

  const checker = program.getTypeChecker();
  const base = nodeAt(source, at);

  for (const symbol of nonNullable(checker, checker.getTypeAtLocation(base)).getProperties()) {
    const kind = kindOf(checker, checker.getTypeOfSymbolAtLocation(symbol, base));
    if (kind !== undefined) found.set(symbol.name, kind);
  }
  return found;
}

/**
 * What a type IS, structurally — or nothing, which is the answer for everything else in scope.
 *
 * The two shapes of `globals.ts`, and they are disjoint by design: a control is CALLABLE and a
 * form is not, so a mix-up is a missing member rather than a type nobody wrote. Asking the
 * members rather than the name is what makes `Control<string>`, `TypedControl<number>`,
 * `Control<unknown> | undefined` and an alias of any of them all answer the same.
 */
function kindOf(checker: ts.TypeChecker, declared: ts.Type): NodeKind | undefined {
  // `ctrl?: Control<unknown>` is a UNION with `undefined` in it, and a union's properties are
  // the ones its members share — none. Without this the canonical control-component's own prop
  // was the one name its own template could not complete.
  const type = nonNullable(checker, declared);
  const members = new Set(type.getProperties().map((symbol) => symbol.name));

  if (GROUP_SHAPE.every((name) => members.has(name))) return 'group';
  if (type.getCallSignatures().length === 0) return undefined;
  return CONTROL_SHAPE.every((name) => members.has(name)) ? 'control' : undefined;
}

/** `T | undefined` read as `T`. An optional prop is still a prop of that shape. */
function nonNullable(checker: ts.TypeChecker, type: ts.Type): ts.Type {
  return checker.getNonNullableType(type);
}

/**
 * Every meaning a symbol can have, as `getSymbolsInScope` wants it.
 *
 * `SymbolFlags` is a runtime enum and this package holds TypeScript as a TYPE only — the
 * program arrives through Volar's `inject`, never as a module imported here (`tag-card.ts`
 * says the same about `TypeFlags`). All bits is the one value that needs no copy of the enum,
 * and it costs nothing: what survives is decided by `kindOf`, and a namespace has no `$touch`.
 */
const ALL_MEANINGS = ~0 as ts.SymbolFlags;

/**
 * The innermost node covering an offset, or the file when none does.
 *
 * `forEachChild` and `getStart`/`getEnd`, which are methods on every node — no `SyntaxKind`,
 * for the reason `ALL_MEANINGS` exists. The walk descends while a child contains the offset, so
 * the last assignment is the deepest one, which is the identifier a type is wanted from.
 */
function nodeAt(source: ts.SourceFile, offset: number): ts.Node {
  let found: ts.Node = source;

  const visit = (node: ts.Node): void => {
    if (node.getStart(source) > offset || offset >= node.getEnd()) return;
    found = node;
    node.forEachChild(visit);
  };
  source.forEachChild(visit);

  return found;
}

/**
 * Where a `.fud` offset lives in the client projection, or nothing when it lives nowhere.
 *
 * The checker reads the PROJECTION, and everything outside the completion decorator holds only
 * `.fud` coordinates — the light bulb, which is anchored on the tree. Nothing is the ordinary
 * answer for an offset the projection never copied, and every caller degrades to silence there
 * rather than to a guess.
 */
export function projectedOffset(cached: CachedDocument, at: number): number | undefined {
  const wanted = clientFileName(cached.path);
  const client = cached.virtuals.find((virtual) => virtual.fileName === wanted);
  return client === undefined ? undefined : mapToGenerated(client, at, 'completion');
}
