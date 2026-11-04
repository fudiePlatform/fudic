/**
 * What exists in a project, as the editor knows it: its routes, its components and their
 * contracts, what its `.fudapi` declare — and whether each handler is written — and its tokens.
 * Every answer comes from the machine the editor answers with: the workspace index, the
 * `.fudapi` reader, the implementation index of the CodeLens, the token reader.
 */

import type * as ts from 'typescript';
import type { ApiSource, Decl } from '@fudic/api';
import type { Span } from '@fudic/compiler';
import { BROWSER_DIR, PIPES_DIR, ROUTES_DIR, SERVER_DIR } from '@fudic/conventions';
import { readProjectConfig } from '@fudic/config';
import { sampleValue, type PropShape } from '@fudic/spec';
import { linkHref } from '@fudic/compiler';
import { parseFud, propShapes, serverLinksOf } from '@fudic/typecheck';
import { typedContract, type Contract } from '@fudic/typecheck/contract';
import { readApiProject } from '@fudic/typecheck/api';
import { projectTokens, type Token } from '@fudic/typecheck/tokens';
import { implemented } from './fudapi/lenses.js';
import { ImplementationIndex, type Implementation, type ImplementationMethod } from './fudapi/implementations.js';
import { nodeApiFs } from './fudapi/fs.js';
import type { WorkspaceIndex } from './workspace-index.js';

/** The kinds `symbols` lists. */
export const SYMBOL_KINDS = ['routes', 'components', 'types', 'functions', 'middlewares', 'pipes', 'tokens'] as const;
export type SymbolKind = (typeof SYMBOL_KINDS)[number];

/** Where something is: a file, and the span of its declaration in it when there is one. */
export interface Place {
  /** Absolute, POSIX. */
  readonly file: string;
  readonly span?: Span;
}

/** One thing a project has, as a list shows it. */
export interface ProjectSymbol extends Place {
  readonly kind: SymbolKind;
  readonly name: string;
  /** The package it comes from; null for the project's own. */
  readonly from: string | null;
  /** The first line of its doc. */
  readonly doc?: string;
  /** For a function, a middleware or a pipe: whether every handler it needs is written. */
  readonly state?: 'connected' | 'missing';
  /** For a token. */
  readonly value?: string;
  readonly group?: string;
}

/** A component as whoever writes its tag needs it. */
export interface ComponentDescription extends Place {
  readonly kind: 'component';
  readonly name: string;
  readonly from: string | null;
  /** The `<link>` a route of the project writes to use it. */
  readonly link: string;
  readonly contract: Contract;
  /** Where its tag is written. */
  readonly usedIn: readonly Place[];
  /** A use that compiles, written from the contract; `fill` names the required props it could not give a value. */
  readonly example: { readonly text: string; readonly fill: readonly string[] };
}

/** A route: its file, its contract and what that contract declares about the page. */
export interface RouteDescription extends Place {
  readonly kind: 'route';
  readonly name: string;
  readonly api?: string;
  readonly declares: readonly string[];
}

/** A declaration of a `.fudapi`, as written, with who implements it. */
export interface DeclarationDescription extends Place {
  readonly kind: 'type' | 'function' | 'middleware' | 'pipe';
  readonly name: string;
  readonly from: string | null;
  readonly doc?: string;
  /** Its lines in the `.fudapi`. */
  readonly source: string;
  readonly state?: 'connected' | 'missing';
  readonly implementedIn?: readonly Place[];
}

export interface TokenDescription extends Place {
  readonly kind: 'token';
  readonly name: string;
  readonly from: string | null;
  readonly value: string;
  readonly group?: string;
  readonly doc?: string;
  readonly style: Token['style'];
}

export type Description = ComponentDescription | RouteDescription | DeclarationDescription | TokenDescription;

/** A piece of the project — one of its components or routes —, as its phases are read. */
export interface Piece {
  readonly kind: 'component' | 'route';
  /** The tag, or the URL pattern. */
  readonly name: string;
  /** Absolute, POSIX. */
  readonly file: string;
  /** The `<id>` of each `.fudapi` its `<link rel="server">` reach. */
  readonly servers: readonly string[];
  /** The `<id>` of the `.fudapi` beside it, linked or not. */
  readonly sibling?: string;
  /** Its JSDoc, and how many of its props have one. */
  readonly documented: { readonly doc: boolean; readonly props: number; readonly documented: number };
}

/** One declaration of a `.fudapi` that needs a handler. */
export interface Handler {
  /** As `symbols` lists it: `routes/products.save`. */
  readonly name: string;
  /** What `fudic:<id>` exports for it: `save`, `load`, `emailTaken`. */
  readonly exported: string;
  readonly kind: Decl['kind'];
  readonly methods: readonly ImplementationMethod[];
  /** For a rule: where it runs, which decides the folder of its handler. */
  readonly runs?: string;
  readonly state: 'connected' | 'missing';
  readonly implementedIn: readonly string[];
}

/** One declaration of a `.fudapi`, with what kind of symbol it is and its name. */
interface Declared {
  readonly kind: 'types' | 'functions' | 'middlewares' | 'pipes';
  readonly name: string;
  readonly source: ApiSource;
  readonly decl: Decl;
}

/**
 * The first sentence of a doc, for a list: its first paragraph, unwrapped, up to the first full
 * stop that ends a sentence. A doc is wrapped at its author's width, so its first line is often
 * half a sentence.
 */
function firstLine(doc: string | undefined): string | undefined {
  const paragraph = (doc ?? '').trim().split(/\n\s*\n/u)[0]!.replace(/\s*\n\s*/gu, ' ').trim();
  if (paragraph === '') return undefined;
  const end = /[.!?](?=\s|$)/u.exec(paragraph);
  return end === null ? paragraph : paragraph.slice(0, end.index + 1);
}

/** The name a declaration is listed by: `routes/products.save`, `routes/products.load`, `Person`. */
function declared(source: ApiSource, decl: Decl): Declared | undefined {
  switch (decl.kind) {
    case 'type':
    case 'enum':
    case 'form':
      return { kind: 'types', name: decl.name.text, source, decl };
    case 'fn':
    case 'rule':
      return { kind: 'functions', name: `${source.id}.${decl.name.text}`, source, decl };
    case 'load':
    case 'paths':
    case 'layout':
      return { kind: 'functions', name: `${source.id}.${decl.kind}`, source, decl };
    case 'middleware':
      return { kind: 'middlewares', name: decl.name.text, source, decl };
    case 'pipe':
      return { kind: 'pipes', name: decl.name.text, source, decl };
    default:
      return undefined;
  }
}

/** The URL of a route file: `src/routes/products/[id].fud` → `/products/:id`. */
export function routePattern(root: string, file: string): string | undefined {
  const base = `${root}/${ROUTES_DIR}/`;
  if (!file.startsWith(base) || !file.endsWith('.fud')) return undefined;
  const segments = file.slice(base.length, -'.fud'.length).split('/');
  // `_layout`, `_error` and every `_` file are the router's, not pages.
  if (segments.some((s) => s.startsWith('_'))) return undefined;
  if (segments.at(-1) === 'index') segments.pop();
  return `/${segments.map((s) => s.replace(/^\[([^\]]+)\]$/u, ':$1')).join('/')}`;
}

export interface SymbolsDeps {
  readonly root: string;
  readonly index: WorkspaceIndex;
  readonly typescript: () => ts.LanguageService | undefined;
}

/** The questions `symbols` and `describe` answer, over one project. */
export class ProjectSymbols {
  readonly #deps: SymbolsDeps;
  readonly #implementations = new ImplementationIndex(nodeApiFs());

  constructor(deps: SymbolsDeps) {
    this.#deps = deps;
  }

  /** A script changed: who implements what is read again. */
  invalidate(path: string): void {
    this.#implementations.invalidate(path);
  }

  #declarations(): readonly Declared[] {
    return readApiProject(this.#deps.root).sources.flatMap((source) =>
      source.file.declarations.flatMap((decl) => declared(source, decl) ?? []),
    );
  }

  /** The folders whose scripts implement the `.fudapi` of the app. */
  #folders(): readonly string[] {
    const { root } = this.#deps;
    const { config } = readProjectConfig(root, nodeApiFsConfig);
    return [config?.server ?? SERVER_DIR, config?.browser ?? BROWSER_DIR, config?.pipes ?? PIPES_DIR].map((dir) => `${root}/${dir}`);
  }

  /** Who implements a declaration, and whether every method it needs has someone. */
  #implementers(item: Declared): { readonly state?: 'connected' | 'missing'; readonly found: readonly Implementation[] } {
    const piece = implemented(item.decl);
    if (piece === undefined || item.source.origin !== 'app') return { found: [] };
    const found = this.#implementations.of(this.#folders(), item.source.id).filter((f) => f.name === piece.name);
    const connected = piece.methods.every((method) => found.some((f) => f.method === method));
    return { state: connected ? 'connected' : 'missing', found };
  }

  #components() {
    return this.#deps.index.byRole('component').filter((e) => e.tag !== '');
  }

  #from(file: string, external: boolean): string | null {
    return external ? (this.#deps.index.packageNameOf(file) ?? null) : null;
  }

  #tokens(): readonly Token[] {
    return projectTokens(this.#deps.root).tokens;
  }

  /** Everything of a kind, or of every kind, in a stable order. */
  symbols(kind?: SymbolKind): readonly ProjectSymbol[] {
    const wanted = (k: SymbolKind): boolean => kind === undefined || kind === k;
    const out: ProjectSymbol[] = [];
    if (wanted('routes')) {
      for (const entry of this.#deps.index.all()) {
        const name = entry.external ? undefined : routePattern(this.#deps.root, entry.path);
        if (name !== undefined) out.push({ kind: 'routes', name, from: null, file: entry.path });
      }
    }
    if (wanted('components')) {
      for (const entry of this.#components()) {
        const doc = firstLine(entry.contract.doc);
        out.push({ kind: 'components', name: entry.tag, from: this.#from(entry.path, entry.external), file: entry.path, ...(doc !== undefined ? { doc } : {}) });
      }
    }
    for (const item of this.#declarations()) {
      if (!wanted(item.kind)) continue;
      const doc = firstLine(item.decl.doc);
      const { state } = this.#implementers(item);
      out.push({
        kind: item.kind,
        name: item.name,
        from: item.source.origin === 'app' ? null : item.source.origin.package,
        file: item.source.path,
        span: item.decl.span,
        ...(doc !== undefined ? { doc } : {}),
        ...(state !== undefined ? { state } : {}),
      });
    }
    if (wanted('tokens')) {
      for (const token of this.#tokens()) {
        out.push({
          kind: 'tokens',
          name: token.name,
          from: token.from,
          file: token.path,
          span: token.span,
          value: token.value,
          ...(token.group !== undefined ? { group: token.group } : {}),
          ...(token.doc !== undefined ? { doc: firstLine(token.doc)! } : {}),
        });
      }
    }
    // Tokens keep the order they are adopted in: it is the order CSS resolves them.
    const order = (s: ProjectSymbol): number => SYMBOL_KINDS.indexOf(s.kind);
    return out.sort((a, b) => order(a) - order(b) || (a.kind === 'tokens' ? 0 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  /**
   * What the `.fudapi` of `<id>` asks to be implemented: each declaration with a handler, the name
   * its module exports, the methods called on it and whether they are written. Undefined when
   * the project has no such `<id>`.
   */
  handlers(id: string): readonly Handler[] | undefined {
    const source = readApiProject(this.#deps.root).byId.get(id);
    if (source === undefined) return undefined;
    return source.file.declarations.flatMap((decl): Handler[] => {
      const item = declared(source, decl);
      const piece = implemented(decl);
      if (item === undefined || piece === undefined) return [];
      const { state, found } = this.#implementers(item);
      return [
        {
          name: item.name,
          exported: piece.name,
          kind: decl.kind,
          methods: piece.methods,
          ...(decl.kind === 'rule' && decl.runs !== undefined ? { runs: decl.runs.value.text } : {}),
          state: state ?? 'missing',
          implementedIn: found.map((f) => f.file),
        },
      ];
    });
  }

  /** The components and routes of the project itself, in path order. */
  pieces(): readonly Piece[] {
    const { root, index } = this.#deps;
    const api = readApiProject(root);
    const service = this.#deps.typescript();
    const out: Piece[] = [];
    // Paths are unique in the index: no two entries compare equal.
    for (const entry of [...index.all()].sort((a, b) => (a.path < b.path ? -1 : 1))) {
      if (entry.external) continue;
      const pattern = routePattern(root, entry.path);
      const component = entry.role === 'component' && entry.tag !== '';
      if (pattern === undefined && !component) continue;
      const source = nodeApiFs().readFile(entry.path) ?? '';
      const servers = serverLinksOf(parseFud(source).document).flatMap((link) => {
        const href = linkHref(link);
        const linked = href === undefined ? undefined : index.server(entry.path, href);
        return linked === undefined ? [] : [linked.id];
      });
      const sibling = api.byPath.get(`${entry.path.slice(0, -'.fud'.length)}.fudapi`)?.id;
      const contract = component ? typedContract(entry.contract, service, entry.path) : entry.contract;
      out.push({
        kind: component ? 'component' : 'route',
        name: component ? entry.tag : pattern!,
        file: entry.path,
        servers,
        ...(sibling !== undefined ? { sibling } : {}),
        documented: {
          doc: contract.doc !== undefined && contract.doc.trim() !== '',
          props: contract.props.length,
          documented: contract.props.filter((p) => p.doc !== undefined && p.doc.trim() !== '').length,
        },
      });
    }
    return out;
  }

  /** Every name `describe` knows, for a «did you mean». */
  names(): readonly string[] {
    return this.symbols().map((s) => s.name);
  }

  /** What one name is, in full; undefined when nothing has it. */
  describe(name: string): Description | undefined {
    return this.#component(name) ?? this.#route(name) ?? this.#declaration(name) ?? this.#token(name);
  }

  #component(tag: string): ComponentDescription | undefined {
    const entry = this.#components().find((e) => e.tag === tag);
    if (entry === undefined) return undefined;
    const service = this.#deps.typescript();
    const contract = typedContract(entry.contract, service, entry.path);
    const from = `${this.#deps.root}/${ROUTES_DIR}/index.fud`;
    const href = this.#deps.index.linker(from)(entry.path) ?? entry.path;
    const program = service?.getProgram();
    const fields = program === undefined ? [] : (propShapes(program, entry.path) ?? []);
    const shapes = new Map(fields.map((field) => [field.name, field.shape]));
    return {
      kind: 'component',
      name: tag,
      from: this.#from(entry.path, entry.external),
      file: entry.path,
      link: `<link rel="component" href="${href}">`,
      contract,
      usedIn: this.#deps.index.usesOf(tag).map((use) => ({ file: use.path, span: use.span })),
      example: exampleOf(tag, contract, shapes),
    };
  }

  #route(pattern: string): RouteDescription | undefined {
    const entry = this.#deps.index.all().find((e) => !e.external && routePattern(this.#deps.root, e.path) === pattern);
    if (entry === undefined) return undefined;
    const apiPath = `${entry.path.slice(0, -'.fud'.length)}.fudapi`;
    const source = readApiProject(this.#deps.root).byPath.get(apiPath);
    const declares = source === undefined ? [] : source.file.declarations.map((d) => d.kind).filter((k) => k === 'load' || k === 'paths' || k === 'layout');
    return { kind: 'route', name: pattern, file: entry.path, ...(source !== undefined ? { api: source.path } : {}), declares };
  }

  #declaration(name: string): DeclarationDescription | undefined {
    const item = this.#declarations().find((d) => d.name === name);
    if (item === undefined) return undefined;
    const { state, found } = this.#implementers(item);
    // `#declarations` has just read it: a file is not taken away between the two reads.
    const text = nodeApiFs().readFile(item.source.path)!;
    const kind = item.kind === 'types' ? 'type' : item.kind === 'functions' ? 'function' : item.kind === 'middlewares' ? 'middleware' : 'pipe';
    const doc = item.decl.doc;
    return {
      kind,
      name,
      from: item.source.origin === 'app' ? null : item.source.origin.package,
      file: item.source.path,
      span: item.decl.span,
      ...(doc !== undefined ? { doc } : {}),
      source: text.slice(item.decl.span.start, item.decl.span.end),
      ...(state !== undefined ? { state, implementedIn: found.map((f) => ({ file: f.file })) } : {}),
    };
  }

  #token(name: string): TokenDescription | undefined {
    const token = this.#tokens().find((t) => t.name === name);
    if (token === undefined) return undefined;
    return {
      kind: 'token',
      name,
      from: token.from,
      file: token.path,
      span: token.span,
      value: token.value,
      style: token.style,
      ...(token.group !== undefined ? { group: token.group } : {}),
      ...(token.doc !== undefined ? { doc: token.doc } : {}),
    };
  }
}

/** The config reader's disk. */
const nodeApiFsConfig = {
  exists: (path: string) => nodeApiFs().readFile(path) !== undefined,
  // `exists` answered first, and a file is not taken away between the two questions.
  read: (path: string) => nodeApiFs().readFile(path)!,
};

/**
 * A use of the component written from its contract: every required prop with the smallest value
 * that compiles, a text in its default slot and an element in each named one. A required prop
 * whose type has no honest sample is left for whoever pastes it, and named in `fill`.
 */
export function exampleOf(
  tag: string,
  contract: Contract,
  shapes: ReadonlyMap<string, PropShape>,
): { readonly text: string; readonly fill: readonly string[] } {
  const fill: string[] = [];
  const attributes: string[] = [];
  for (const prop of contract.props.filter((p) => p.required)) {
    const shape = shapes.get(prop.name);
    const sample = shape === undefined ? undefined : sampleValue(shape);
    if (sample === undefined) fill.push(prop.name);
    else attributes.push(` .${prop.name}=@(${sample})`);
  }
  const inner = [
    ...(contract.defaultSlot ? ['  Text'] : []),
    ...contract.slots.map((slot) => `  <span slot="${slot}">${slot}</span>`),
  ];
  const open = `<${tag}${attributes.join('')}>`;
  const text = inner.length === 0 ? `${open}</${tag}>` : `${open}\n${inner.join('\n')}\n</${tag}>`;
  return { text, fill };
}
