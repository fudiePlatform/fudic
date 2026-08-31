/**
 * The card a component shows when the pointer rests on its tag (SDD-36 §3.2, §4.5).
 *
 * A component of fudic has no documentation anywhere: to learn what `<app-button>` takes, the
 * consumer opens the file. Everything needed to answer that is already in the index — props,
 * slots, events and whatever the author wrote in the `@code` — and this is where it is put in
 * front of the person asking.
 *
 * The card is NOT waited for. Its two halves are built separately and only the second one asks
 * TypeScript: a program still loading, a `tsconfig` that does not reach the file, a component
 * nobody has opened. A card that waits for an answer that may not come is a card that sometimes
 * does not appear, and «sometimes not» is indistinguishable from «there is no hover». So
 * everything a consumer needs is read from the parse, and the type of each prop is the one
 * thing that may be missing from it — the lesson of BUG-23 §2.9, paid once and applied here
 * before it costs anything.
 *
 * The tag and only the tag. A `<div>` has no fudic contract and HTML already describes it, and
 * a prop, an event or an expression are answered by TypeScript over the projection, correctly.
 */

import type * as ts from 'typescript';
import type { Span } from '@fudic/compiler';
import type { CachedDocument } from '../document-cache.js';
import type { Contract } from '../mode.js';
import type { WorkspaceIndex } from '../workspace-index.js';
import { tagNameAt } from './position.js';

/** A component's contract, ready to render. */
export interface TagCard {
  readonly tag: string;
  /** Absolute path of the `.fud` that declares it. */
  readonly file: string;
  readonly contract: Contract;
  /**
   * The tag NAME in the source, which is what the hover underlines.
   *
   * It travels with the card so the caller never has to ask where the tag was a second time.
   * Asking twice would mean a second «and what if it is not there now» to answer, on a question
   * this function has already answered by returning at all.
   */
  readonly span: Span;
}

/**
 * The card for the tag at `offset`, or nothing when the offset is not on one.
 *
 * Nothing for three reasons, and they are all the same reason: there is no contract to show.
 * The offset is not inside a tag name; the name is a native element; or it is a custom element
 * the workspace has never seen — a typo, or a component that is not written yet.
 */
export function tagCardAt(
  cached: CachedDocument,
  index: WorkspaceIndex,
  offset: number,
): TagCard | undefined {
  const name = tagNameAt(cached.source, offset);
  // A native element has no hyphen (decision 41), and nothing fudic to say about it.
  if (name === undefined || !name.text.includes('-')) return undefined;

  const entry = index.byRole('component').find((candidate) => candidate.tag === name.text);
  if (entry === undefined) return undefined;

  return { tag: entry.tag, file: entry.path, contract: entry.contract, span: name.span };
}

/**
 * The card as Markdown, which is what a hover carries.
 *
 * A section that would be empty is left out rather than printed with «none»: a card that lists
 * three headings and nothing under them reads as broken, and the absence of a heading already
 * says the component declares none of that kind. A component that declares nothing at all still
 * gets its tag and its file, which is the answer to «what is this and where does it live».
 */
export function cardMarkdown(card: TagCard, types: ReadonlyMap<string, string>): string {
  const parts: string[] = [`**\`<${card.tag}>\`** · fudic component`];

  if (card.contract.doc !== undefined) parts.push(card.contract.doc);

  if (card.contract.props.length > 0) {
    const rows = card.contract.props.map((prop) => {
      const type = types.get(prop.name);
      // The `?` is how TypeScript itself spells optional, so it needs no legend.
      const name = `\`.${prop.name}${prop.required ? '' : '?'}\``;
      return type === undefined ? `- ${name}` : `- ${name} — \`${type}\``;
    });
    parts.push(`**Props**\n${rows.join('\n')}`);
  }

  if (card.contract.slots.length > 0) {
    parts.push(`**Slots**\n${card.contract.slots.map((slot) => `- \`${slot}\``).join('\n')}`);
  }

  if (card.contract.events.length > 0) {
    parts.push(`**Eventos**\n${card.contract.events.map((event) => `- \`@${event}\``).join('\n')}`);
  }

  return parts.join('\n\n');
}

/**
 * The name SDD-23 §3.2 exports a component's contract under.
 *
 * The projection writes `export type $Props = typeof $p0;` into every client virtual, and this
 * is the other end of that sentence. Spelled once here rather than searched for: the emitter
 * owns the name and this only has to agree with it.
 */
const PROPS_EXPORT = '$Props';

/** No types, which is what every degraded path answers with. */
const NO_TYPES: ReadonlyMap<string, string> = new Map();

/**
 * The type of each prop, read from the projection (SDD-36 §4.5, criterion 15).
 *
 * The card's second half, and the only half that is allowed not to arrive. Every step below
 * can come back empty for a reason that is normal rather than exceptional — no TypeScript was
 * loaded at all (SDD-24 §6.1), the program has not been built yet, the component is not in it,
 * or it declares no `props<T>()` and its contract is `never`. All of them answer the same way:
 * an empty map, and a card that renders without the column.
 *
 * The checker, never the text. `$Props` is `typeof $p0` and `$p0` is a `props<T>()` call, so
 * the members are reachable only by resolving that chain — which is precisely what TypeScript
 * is here for, and what a reader of the type argument's source could not do.
 */
export function propTypes(
  languageService: ts.LanguageService | undefined,
  file: string,
): ReadonlyMap<string, string> {
  const program = languageService?.getProgram();
  if (program === undefined) return NO_TYPES;

  // A `.fud` IS the program's file name: the language plugin gives TypeScript the client
  // virtual as that file's script (SDD-24 §4.1), so no name has to be derived here.
  const source = program.getSourceFile(file);
  if (source === undefined) return NO_TYPES;

  const checker = program.getTypeChecker();
  const module = checker.getSymbolAtLocation(source);
  if (module === undefined) return NO_TYPES;

  const contract = checker.getExportsOfModule(module).find((it) => it.name === PROPS_EXPORT);
  if (contract === undefined) return NO_TYPES;

  const types = new Map<string, string>();
  for (const prop of checker.getDeclaredTypeOfSymbol(contract).getProperties()) {
    types.set(prop.name, checker.typeToString(checker.getTypeOfSymbolAtLocation(prop, source)));
  }
  return types;
}
