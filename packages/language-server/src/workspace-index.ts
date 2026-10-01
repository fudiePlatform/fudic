/**
 * The workspace index (SDD-24 §4.5): every `.fud` of the folder with its role and its tag.
 *
 * The sweep, the per-file update and the lookup are `@fudic/typecheck`'s `FudIndex`, the same
 * one the build indexes a project with (SDD-35 §4.1). What is the editor's own is what it keeps
 * about each file — role, sections, snippets, contract — for its completions and its card, and
 * the two questions only the editor asks: which files have a role, and how to write a link.
 */

import {
  describeFud,
  FudIndex,
  layoutHrefOf,
  relativeHref,
  toPosix,
  type IndexedFud,
} from '@fudic/typecheck';
import {
  contractOf,
  roleOf,
  sectionsOf,
  snippetsOf,
  type Contract,
  type FudRole,
  type SnippetSignature,
} from './mode.js';
// The dependency walk lives in `@fudic/resolve`: the CLI asks the same question — which tags
// a library already defines — and the build asks it in order, for the style chain of §4.6.
import { dependencyChain, owningPackage, specifierOf } from '@fudic/resolve';
import type { FileSystemScanner } from './types.js';

/** What the index knows about one `.fud`. */
export interface IndexEntry extends IndexedFud {
  readonly role: FudRole;
  /** Its `<link rel="layout">` href, `''` when it declares none. */
  readonly layoutHref: string;
  /**
   * The sections a layout declares with `@RenderSection`, in source order. Empty for
   * everything else.
   *
   * Kept here because the alternative is parsing the layout on every keystroke of
   * `@section `: the file was already parsed to learn its role, so the names are free.
   */
  readonly sections: readonly string[];
  /**
   * The `@snippet`s the file declares, with their signatures: what a `@render` in a file that
   * links this one completes to. Kept for the reason `sections` is.
   */
  readonly snippets: readonly SnippetSignature[];
  /**
   * The props a component declares without a `?`, in declaration order. Empty for everything
   * else — and empty also when they cannot be proven, which is what makes the tag expansion
   * degrade to the plain element instead of inventing tabstops (BUG-23 task 25).
   */
  readonly requiredProps: readonly string[];
  /**
   * Everything the component declares to whoever writes its tag: props, slots, events and the
   * doc its author wrote (SDD-36 §3.2). Empty for everything that is not a component.
   *
   * Kept here for the reason `sections` is: the file was parsed to learn its role, so reading
   * the contract is free — once per file and per change, never per keystroke — and the card of
   * a component nobody has opened has to come from somewhere.
   */
  readonly contract: Contract;
}

export class WorkspaceIndex extends FudIndex<IndexEntry> {
  constructor(scanner: FileSystemScanner) {
    super(scanner, (input) => {
      const { source, document } = input;
      // One read of the contract, and the required props come OUT of it: asking twice would
      // run the `@code` extraction twice per change, and — worse — would let the two answers
      // differ.
      const contract = contractOf(source, document);
      return {
        ...describeFud(input),
        role: roleOf(document),
        layoutHref: layoutHrefOf(document),
        sections: sectionsOf(document),
        snippets: snippetsOf(source, document),
        requiredProps: contract.props.filter((prop) => prop.required).map((prop) => prop.name),
        contract,
      };
    });
  }

  /** Every entry of one role — what the `href` completion filters with (§4.2). */
  byRole(role: FudRole): readonly IndexEntry[] {
    return this.all().filter((entry) => entry.role === role);
  }

  /**
   * How `fromFile` writes a link to each file it may link, and `undefined` for the rest.
   *
   * The inverse of `resolve`, and what the `href` completion offers. The index holds every
   * `.fud` under the folder the editor opened, and in a monorepo that is several projects at
   * once: a file of the app next door is on disk, but no `href` of this one reaches it the
   * way the build does. So a file of the SAME package is written as a relative path, a file
   * of a library this package depends on by the name its `exports` give it, and anything else
   * is not a candidate at all.
   *
   * A function rather than an answer per file because the dependency walk is the costly part,
   * and it is one per request, not one per candidate.
   */
  linker(fromFile: string): (target: string) => string | undefined {
    const from = toPosix(fromFile);
    const own = owningPackage(from, this.fs);
    const libraries =
      own === undefined ? [] : dependencyChain(own, this.fs).filter((pkg) => pkg.root !== own);

    return (target) => {
      const owner = owningPackage(target, this.fs);
      if (owner === own) return relativeHref(from, target);
      const library = libraries.find((pkg) => pkg.root === owner);
      return library === undefined ? undefined : specifierOf(library, target, this.fs);
    };
  }
}
