/**
 * Which snippets a file can see (SDD-29 §4.3, §4.4).
 *
 * A file's scope is its own `@snippet` declarations plus, for each `<link rel="snippet">`,
 * every declaration of the file it names. The grain is the FILE: there is no selective
 * import, and there is no transitive one either — a snippet invoked inside another snippet's
 * body resolves in the scope of the file that DECLARES it, not in the caller's. That is what
 * makes a library of snippets a closed thing: what it uses is its business.
 *
 * Nothing here throws and nothing here loops. A `href` that does not resolve is a
 * diagnostic, a file that is not a file is a diagnostic, and a cycle of imports is cut by the
 * same memo table that makes the second import of a file free.
 */

import { type Diagnostic, type ResolveIo, errorDiag, relatedError } from '../types/index.js';
import { parseDocument, type ElementNode } from '../html/index.js';
import { atConstructs } from '../constructs.js';
import { structureDocument, type StructuredDocument } from '../document/index.js';
import { JsBatch } from '../oxc/index.js';
import {
  readParams,
  registerSignature,
  type SnippetDeclNode,
  type SnippetParam,
} from '../snippet/index.js';
import { readSnippetLink } from './links.js';

/** A `<link rel="snippet">` that names nothing readable, or a file with no snippet in it. */
const FUD_BAD_SNIPPET_LINK = 'FUD0836';
/** Two snippets of one global scope under one name (§4.4). */
const FUD_SNIPPET_COLLISION = 'FUD0834';

/** One snippet, with everything its call site needs to check it and expand it. */
export interface ResolvedSnippet {
  readonly decl: SnippetDeclNode;
  /** The signature, read by the declaring file's own Oxc batch. */
  readonly params: readonly SnippetParam[];
  /** Absolute path of the file that declares it — where a diagnostic about the body goes. */
  readonly file: string;
  /** That file's text: what the expansion copies the body out of. */
  readonly source: string;
  /**
   * The scope this snippet's own body resolves its `@render` in — its file's, never the
   * caller's (§4.6). A thunk, because a file's scope holds its snippets and its snippets hold
   * its scope: building it eagerly is a cycle, and asking for it is rare.
   */
  readonly scope: () => SnippetScope;
  /**
   * The `<link rel="component">` of the declaring file.
   *
   * A snippet may instantiate components, and the links that resolve them are its file's,
   * not the caller's. Invoking it DRAGS them into the caller's graph (§4.5), so they travel
   * on the snippet and the caller declares nothing.
   */
  readonly componentLinks: readonly ElementNode[];
}

/** The snippets visible from one file. */
export interface SnippetScope {
  /** Declared here, or imported with no `as`. */
  readonly global: ReadonlyMap<string, ResolvedSnippet>;
  /** Imported with `as`: the outer key is the namespace. */
  readonly namespaced: ReadonlyMap<string, ReadonlyMap<string, ResolvedSnippet>>;
}

/** The empty scope: what a file with no declarations and no imports can see. */
export const EMPTY_SCOPE: SnippetScope = { global: new Map(), namespaced: new Map() };

/** One file the registry has read, parsed, and asked Oxc about exactly once. */
interface LoadedFile {
  readonly path: string;
  readonly source: string;
  readonly doc: StructuredDocument;
  /** Its own declarations, by name, in source order. A repeat is reported on the second. */
  readonly declared: ReadonlyMap<string, ResolvedSnippet>;
}

/**
 * Reads the `.fud` files a scope is built from, once each.
 *
 * Memoized by PATH, which is what cuts a cycle: `a.fud` importing `b.fud` importing `a.fud`
 * finds `a.fud` already in the table — with its declarations already read, because the read
 * happens before any link of the file is followed.
 */
export class SnippetRegistry {
  readonly #io: ResolveIo;
  readonly #files = new Map<string, LoadedFile | null>();
  readonly #scopes = new Map<string, SnippetScope>();

  constructor(io: ResolveIo) {
    this.#io = io;
  }

  /**
   * Every OTHER `.fud` this registry read, absolute.
   *
   * It is the dependency edge a host needs: a `<link rel="snippet">` makes the file it names
   * part of the document, so changing it has to reparse every consumer (§5). The entry is not
   * in the list — whoever asked already has it.
   */
  get files(): readonly string[] {
    const out: string[] = [];
    for (const [path, file] of this.#files) if (file !== null && path !== this.#entry) out.push(path);
    return out;
  }

  #entry = '';

  /**
   * The scope of a file already parsed by the caller — the entry of a build, or the document
   * an editor has open. Its own declarations come from `doc`, so it is never re-read.
   */
  scopeOf(
    path: string,
    source: string,
    doc: StructuredDocument,
    diagnostics: Diagnostic[],
  ): SnippetScope {
    this.#entry = path;
    const own = this.#adopt({ path, source, doc });
    // Seeded so that a file importing back into the entry reuses what the caller already
    // parsed instead of reading it off disk — which in an editor is a stale copy of what the
    // author is looking at, and in a test is a file that does not exist.
    this.#files.set(path, own);
    const scope = this.#build(own, diagnostics);
    this.#scopes.set(path, scope);
    return scope;
  }

  /**
   * The scope of a file already loaded. Memoized by path.
   *
   * Its own diagnostics are dropped here, and that is the rule: a file reports its own
   * mistakes when it is the one being compiled, or when the editor opens it. Repeating them
   * on everyone who imports it would multiply one mistake by its consumers.
   */
  #scopeOfLoaded(file: LoadedFile): SnippetScope {
    const cached = this.#scopes.get(file.path);
    if (cached !== undefined) return cached;
    // Seeded BEFORE the links are followed: a cycle that comes back here finds the empty
    // scope and stops, instead of recursing until the stack ends.
    this.#scopes.set(file.path, EMPTY_SCOPE);
    const scope = this.#build(file, []);
    this.#scopes.set(file.path, scope);
    return scope;
  }

  /** Read, parse and index one file. `null` when it cannot be read. */
  #load(path: string): LoadedFile | null {
    const cached = this.#files.get(path);
    if (cached !== undefined) return cached;
    let source: string;
    try {
      source = this.#io.read(path);
    } catch {
      // The host's I/O is the one thing here that CAN throw — a file that was deleted between
      // the link being written and the build reading it. It is a missing import like any
      // other, and the link that names it is where it is reported.
      this.#files.set(path, null);
      return null;
    }
    const doc = structureDocument(source, parseDocument(source, { atConstructs }).value).value;
    const file = this.#adopt({ path, source, doc });
    this.#files.set(path, file);
    return file;
  }

  /** Index a parsed file's own declarations, asking Oxc once for every signature. */
  #adopt(input: { path: string; source: string; doc: StructuredDocument }): LoadedFile {
    const { path, source, doc } = input;
    const declared = new Map<string, ResolvedSnippet>();
    const file: LoadedFile = { path, source, doc, declared };
    if (doc.snippets.length > 0) {
      const batch = new JsBatch(source);
      const ids = doc.snippets.map((decl) => registerSignature(batch, decl));
      const parsed = batch.parse().value;
      const scope = (): SnippetScope => this.#scopeOfLoaded(file);
      doc.snippets.forEach((decl, i) => {
        // An unnamed declaration is `FUD0820` already, and a repeated one is `FUD0834` from
        // the structuring pass: giving either a slot would make a mistyped call resolve.
        if (decl.name === '' || declared.has(decl.name)) return;
        declared.set(decl.name, {
          decl,
          params: readParams(parsed, ids[i]!),
          file: path,
          source,
          scope,
          componentLinks: doc.links,
        });
      });
    }
    return file;
  }

  /** A file's own declarations plus what each of its `<link rel="snippet">` brings in. */
  #build(file: LoadedFile, diagnostics: Diagnostic[]): SnippetScope {
    const global = new Map<string, ResolvedSnippet>(file.declared);
    const namespaced = new Map<string, ReadonlyMap<string, ResolvedSnippet>>();
    const from = new Map<string, ElementNode | undefined>();

    for (const el of file.doc.snippetLinks) {
      const link = readSnippetLink(el);
      const imported = this.#imported(file.path, link.href, el, diagnostics);
      if (imported === undefined) continue;
      if (link.namespace !== undefined) {
        // A namespace never collides: not with the global scope, not with another namespace.
        // It is the whole cure §4.4 prescribes, so it cannot be the disease.
        namespaced.set(link.namespace, imported);
        continue;
      }
      for (const [name, snippet] of imported) {
        const taken = global.get(name);
        if (taken !== undefined) {
          diagnostics.push(collision(name, snippet, taken, el, from.get(name)));
          continue;
        }
        global.set(name, snippet);
        from.set(name, el);
      }
    }
    return { global, namespaced };
  }

  /** The declarations a link brings in, or `undefined` with the link reported. */
  #imported(
    fromPath: string,
    href: string,
    el: ElementNode,
    diagnostics: Diagnostic[],
  ): ReadonlyMap<string, ResolvedSnippet> | undefined {
    if (href === '') {
      diagnostics.push(
        errorDiag(FUD_BAD_SNIPPET_LINK, '<link rel="snippet"> requires a static href', el.span),
      );
      return undefined;
    }
    const path = this.#resolve(fromPath, href);
    const file = path === undefined ? null : this.#load(path);
    if (file === null) {
      diagnostics.push(
        errorDiag(
          FUD_BAD_SNIPPET_LINK,
          `<link rel="snippet"> does not resolve: no file for "${href}"`,
          el.span,
        ),
      );
      return undefined;
    }
    if (file.declared.size === 0) {
      diagnostics.push(
        errorDiag(
          FUD_BAD_SNIPPET_LINK,
          `${file.path} declares no @snippet: nothing is imported from it`,
          el.span,
        ),
      );
      return undefined;
    }
    return file.declared;
  }

  #resolve(fromPath: string, href: string): string | undefined {
    try {
      return this.#io.resolve(fromPath, href);
    } catch {
      // A bare specifier for a package that is not installed throws out of the host's
      // resolver (SDD-43 §4.3). It is the same unresolved import as a bad relative path.
      return undefined;
    }
  }
}

/** `FUD0834`, with the declaration that got the name first as the related location. */
function collision(
  name: string,
  second: ResolvedSnippet,
  first: ResolvedSnippet,
  el: ElementNode,
  firstLink: ElementNode | undefined,
): Diagnostic {
  return relatedError(
    FUD_SNIPPET_COLLISION,
    `two snippets are called "${name}" in this file's scope: ${first.file} and ${second.file}. Give one of the two imports an "as" to put it under a namespace`,
    el.span,
    [
      firstLink === undefined
        ? { span: first.decl.nameSpan, message: `"${name}" is declared here`, file: first.file }
        : { span: firstLink.span, message: `"${name}" came in through this import` },
    ],
  );
}
