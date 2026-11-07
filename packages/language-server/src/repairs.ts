/**
 * The repairs of a `.fud`'s diagnostics, without an editor.
 *
 * What the light bulb offers, as data: a title and the edits, by file path. The Volar plugin is
 * one adapter of it (`services/actions.ts`); anything else that holds a parsed file and the
 * workspace index — a tool that fixes files for an agent — asks the same table and gets the same
 * answer.
 *
 * Every repair is anchored on a diagnostic and leaves the file without a new error where it
 * acted. A diagnostic with several reasonable repairs — a key for a loop over objects with no
 * `id` — gets none: that choice is the author's.
 */

import type * as ts from 'typescript';
import { adoptedStylesOf, span, type GuidePiece, type RouteDocument, type Span } from '@fudic/compiler';
import type { FudCode, SourceDiagnostic } from '@fudic/diagnostics';
import type { OxcNode } from '@fudic/compiler';
import { missingSections } from '@fudic/typecheck';
import type { CachedDocument } from './document-cache.js';
import type { WorkspaceIndex } from './workspace-index.js';
import { loopKeyAt } from './services/loop-key.js';
import { linkInsertionFor } from './services/tags.js';
import { adoptionEditFor } from './services/template-attrs.js';

/** One change to one file. */
export interface RepairEdit {
  /** The file to change, absolute; created when it does not exist. */
  readonly path: string;
  /** Empty span = insert. */
  readonly span: Span;
  readonly newText: string;
}

/** One way to repair one diagnostic. */
export interface Repair {
  /** English. */
  readonly title: string;
  /** The diagnostic it repairs. */
  readonly code: FudCode;
  readonly edits: readonly RepairEdit[];
  /**
   * Only when the author asks for it: the light bulb offers it, and nothing that fixes files on
   * its own — `fudic_fix`, a «fix all» — applies it. A repair that removes what may still be
   * needed for reasons no check can see.
   */
  readonly manual?: true;
}

/** What a repair is computed from. */
export interface RepairInput {
  /** The parsed file. */
  readonly cached: CachedDocument;
  readonly index: WorkspaceIndex;
  /** The project's TypeScript, which knows a loop's element type. Absent, a repair that needs a type degrades. */
  readonly typescript?: ts.LanguageService;
  /** The style guide's pieces the file may adopt. Absent, the guide's repairs are not offered. */
  readonly pieces?: readonly GuidePiece[];
}

/** One stretch of the file the repair is computed for. */
interface Edit {
  readonly span: Span;
  readonly newText: string;
}

/** A repair before it is stamped with its file and its code. */
interface Fix {
  readonly title: string;
  readonly edits: readonly Edit[];
  readonly manual?: true;
}

type Repairer = (input: RepairInput, diagnostic: SourceDiagnostic) => readonly Fix[];

/**
 * `FUD0056` — an unquoted value: put quotes around what is there, and touch nothing else.
 *
 * Not for a value in braces, which is JSX (`FUD1161`): quoting `{f}` writes `"{f}"`, a string
 * where an expression was meant.
 */
const quoteValue: Repairer = ({ cached }, diagnostic) => {
  const text = cached.source.slice(diagnostic.span.start, diagnostic.span.end);
  // A `"` already there means the parser is reporting something else about a value that IS
  // quoted; an empty one has nothing to quote.
  if (text === '' || text.includes('"') || text.startsWith('{')) return [];
  return [{ title: 'Quote the value', edits: [{ span: diagnostic.span, newText: `"${text}"` }] }];
};

/**
 * Whether an open tag — `<app-badge class="x">` — is the opening of `tag`. The boundary is the
 * whole of it: `<app-badge-large>` does not open `app-badge`.
 */
const opensTag = (opened: string, tag: string): boolean =>
  tag !== '' && opened.startsWith(`<${tag}`) && !/[-\w]/u.test(opened.charAt(tag.length + 1));

/**
 * `FUD0191` — a custom element with no `<link rel="component">`.
 *
 * Only for a tag the index has seen, and the edit is `linkInsertionFor`'s — the one the tag
 * completion writes — so the two cannot drift apart. Of the components that answer, the first
 * this file can link: a link into the app next door is one the build never resolves.
 */
const addComponentLink: Repairer = ({ cached, index }, diagnostic) => {
  const opened = cached.source.slice(diagnostic.span.start, diagnostic.span.end);
  const hrefTo = index.linker(cached.path);
  for (const entry of index.byRole('component')) {
    if (entry.path === cached.path || !opensTag(opened, entry.tag)) continue;
    const href = hrefTo(entry.path);
    if (href === undefined) continue;

    // Always an insertion: it declines only a file that already links the href, and such a file
    // does not get `FUD0191`.
    const insertion = linkInsertionFor(cached, href) as Edit;
    return [{ title: `Add <link rel="component"> for <${entry.tag}>`, edits: [insertion] }];
  }
  return [];
};

/**
 * The key a loop's binding offers: a destructured `id`, or what the element's type allows.
 * Nothing for a header that declares neither — `FUD0543`'s case, or a design decision.
 */
function loopKey(statement: OxcNode, keyOf: (at: number) => 'self' | 'id' | undefined): string | undefined {
  // `for (const x of xs)` keeps its declaration in `left`; `for (let i = 0; …)` in `init`.
  const declaration = (statement['left'] ?? statement['init']) as OxcNode | null;
  if (declaration?.type !== 'VariableDeclaration') return undefined;
  const binding = (declaration['declarations'] as readonly OxcNode[])[0]!['id'] as OxcNode;

  if (binding.type === 'ObjectPattern') {
    const id = (binding['properties'] as readonly OxcNode[]).find(
      (p) => p.type === 'Property' && (p['key'] as OxcNode)['name'] === 'id' && (p['value'] as OxcNode).type === 'Identifier',
    );
    return id === undefined ? undefined : ((id['value'] as OxcNode)['name'] as string);
  }
  if (binding.type !== 'Identifier') return undefined;

  const name = binding['name'] as string;
  const key = keyOf(binding.start);
  if (key === undefined) return undefined;
  return key === 'self' ? name : `${name}.id`;
}

/**
 * `FUD0540` — a loop with no `key (…)`. The key goes between the header and the `{`
 * (decision 91), at `headerClose`, straight from the balancer.
 */
const addLoopKey: Repairer = ({ cached, typescript }, diagnostic) => {
  const loop = cached.js.loops.find(
    (candidate) => candidate.span.start <= diagnostic.span.start && diagnostic.span.end <= candidate.span.end,
  );
  if (loop?.statement === undefined) return [];

  // The header's AST is in the batch's coordinates; the checker is asked at the `.fud`'s.
  const key = loopKey(loop.statement, (at) => loopKeyAt(typescript, cached, cached.js.result.mapOffset(at)));
  if (key === undefined) return [];
  const at = loop.headerClose;
  return [{ title: `Add key (${key})`, edits: [{ span: span(at, at), newText: ` key (${key})` }] }];
};

/**
 * `FUD0890` — the route leaves a `required: true` section of its layout unfilled. One repair
 * writes every missing section, empty, after the route's last `@section` or at the end.
 */
const addRequiredSections: Repairer = ({ cached, index }) => {
  // Only a route that leaves a required section unfilled carries this code: the document is
  // that route, and the list is not empty.
  const route = cached.document as RouteDocument;
  const missing = missingSections(cached, index);
  const at = route.sections.at(-1)?.span.end ?? cached.source.trimEnd().length;
  const text = missing.map((s) => `\n\n@section ${s.name} {\n}`).join('');
  const names = missing.map((s) => s.name).join(', ');
  return [{ title: `Add the layout's required sections (${names})`, edits: [{ span: span(at, at), newText: text }] }];
};

/**
 * `FUD0894` — a `@render` argument that reads the scope, written without its `@`. A name or a
 * path takes the `@`; anything else goes into `@( … )`. The span IS the argument's value.
 */
const addArgumentAt: Repairer = ({ cached }, diagnostic) => {
  const text = cached.source.slice(diagnostic.span.start, diagnostic.span.end);
  const path = /^[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*$/u.test(text);
  return [
    {
      title: path ? `Write @${text}` : 'Wrap in @( … )',
      edits: [{ span: diagnostic.span, newText: path ? `@${text}` : `@(${text})` }],
    },
  ];
};

/**
 * `FUD1160` — React's `className` or `htmlFor` as an attribute: write the HTML name. The span
 * is the name, and it is one of the two in some case.
 */
const htmlName: Repairer = ({ cached }, diagnostic) => {
  const name = cached.source.slice(diagnostic.span.start, diagnostic.span.end);
  const html = name.toLowerCase() === 'classname' ? 'class' : 'for';
  return [{ title: `Change to ${html}`, edits: [{ span: diagnostic.span, newText: html }] }];
};

/**
 * `FUD1440` — an element a piece of the guide styles, in a component that does not adopt it:
 * add the piece, with the edit the tag completion writes. Adding is always safe.
 */
const adoptPiece: Repairer = ({ cached, pieces }, diagnostic) => {
  const tag = cached.source.slice(diagnostic.span.start, diagnostic.span.end);
  const edit = adoptionEditFor(cached, diagnostic.span.start, tag, pieces ?? []);
  if (edit === undefined) return [];
  return [{ title: `Adopt the guide's sheet for <${tag}>`, edits: [edit] }];
};

/**
 * `FUD1441` — an adopted piece that styles nothing here: remove its name, and the attribute with
 * it when it was the only one. Manual: a script may create what the piece styles, and only the
 * author knows that, so nothing applies it without asking.
 */
const dropPiece: Repairer = ({ cached }, diagnostic) => {
  const template = cached.document.type === 'component-document' ? cached.document.template : undefined;
  const attr = template?.attributes.find(
    (a) => a.span.start <= diagnostic.span.start && diagnostic.span.end <= a.span.end,
  );
  if (attr === undefined) return [];
  const name = cached.source.slice(diagnostic.span.start, diagnostic.span.end);
  const title = `Stop adopting ${name}`;
  if (adoptedStylesOf(template).names.length === 1) {
    // The only name: the attribute goes, with the space in front of it.
    let start = attr.span.start;
    while (start > 0 && /\s/u.test(cached.source.charAt(start - 1))) start -= 1;
    return [{ title, manual: true, edits: [{ span: span(start, attr.span.end), newText: '' }] }];
  }
  let { start, end } = diagnostic.span;
  // A space after the name goes with it; for the last name, the one before it.
  if (/^\s*["']/u.test(cached.source.slice(end))) {
    while (/\s/u.test(cached.source.charAt(start - 1))) start -= 1;
  } else {
    while (/\s/u.test(cached.source.charAt(end))) end += 1;
  }
  return [{ title, manual: true, edits: [{ span: span(start, end), newText: '' }] }];
};

/** A diagnostic code, and what repairs it. A code that is not here has no repair. */
const REPAIRS: ReadonlyMap<FudCode, Repairer> = new Map<FudCode, Repairer>([
  ['FUD0894', addArgumentAt],
  ['FUD0056', quoteValue],
  ['FUD0191', addComponentLink],
  ['FUD0890', addRequiredSections],
  ['FUD0540', addLoopKey],
  ['FUD1160', htmlName],
  ['FUD1440', adoptPiece],
  ['FUD1441', dropPiece],
]);

/** The codes that have a repair. */
export const REPAIRED_CODES: readonly FudCode[] = [...REPAIRS.keys()];

/** The repairs for one diagnostic of one file. Several = the author chooses; empty = none is safe. */
export function repairsFor(input: RepairInput, diagnostic: SourceDiagnostic): readonly Repair[] {
  const repairer = REPAIRS.get(diagnostic.code);
  if (repairer === undefined) return [];
  const path = input.cached.path;
  return repairer(input, diagnostic).map((fix) => ({
    title: fix.title,
    code: diagnostic.code,
    edits: fix.edits.map((edit) => ({ path, span: edit.span, newText: edit.newText })),
    ...(fix.manual === undefined ? {} : { manual: fix.manual }),
  }));
}
