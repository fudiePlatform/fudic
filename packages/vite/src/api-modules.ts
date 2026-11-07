/**
 * The `.fudapi` of a project, as the plugin serves them (SDD-60 §3.10, §3.11).
 *
 * One index for the whole project: every `.fudapi` of the app under `src/`, and the `fudapi/`
 * folder of each DIRECT dependency of its `package.json` — read by `@fudic/typecheck/api`, the
 * same reader the project check reports from. From it come the three things the plugin hands
 * out:
 *
 *   - the virtual module `fudic:<id>`, in its server or its browser variant;
 *   - `.fudic/api/<id>.d.ts`, written only when its text changes;
 *   - what the compiler is told about a linked file (`LinkedApi`), which keeps it free of
 *     `@fudic/api`.
 *
 * Read once and kept until `invalidate()`: a build reads it once, dev forgets it when a
 * `.fudapi` or the `package.json` changes on disk.
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  API_EXTENSION,
  dataShape,
  framesShape,
  emitModule,
  type ApiContext,
  type ApiLocale,
  type ApiSource,
  type Decl,
  type LoadDecl,
  type Side,
} from '@fudic/api';
import {
  apiContextOf,
  apiDiagnostics,
  readApiProject,
  writeApiDeclarations,
  type ApiFileDiagnostics,
  type ApiLibrary,
  type ApiProjectFiles,
} from '@fudic/typecheck/api';
import type { PageApi } from './analyze.js';
import type { LinkedApi } from '@fudic/compiler';
import { FN_PREFIX, RULE_PREFIX } from '@fudic/conventions';

export type { ApiLibrary };

/** The scheme of a generated module: `fudic:routes/usuarios`. */
export const API_SCHEME = 'fudic:';

/** What a `.fudapi` can declare with no implementation behind it: nothing to register. */
const UNIMPLEMENTED: ReadonlySet<string> = new Set(['pipe', 'type', 'enum']);

/**
 * Whether a `.fudapi` has nothing to implement (SDD-71 §3.3): only pipes, types and enums. Its
 * module needs no root — nothing in it has a half to register — and a root would ask for
 * `@fudic/http`, which an app made by `fudic new` does not have until it declares a contract.
 */
export const nothingToImplement = (source: ApiSource): boolean =>
  source.file.declarations.length > 0 && source.file.declarations.every((d) => UNIMPLEMENTED.has(d.kind));

const PARAM = /^\[([A-Za-z_][A-Za-z0-9_]*)\]$/u;
const posix = (path: string): string => path.replace(/\\/gu, '/');

export class ApiProject {
  readonly #root: string;
  #state: ApiProjectFiles | undefined;

  constructor(root: string) {
    this.#root = posix(root);
  }

  /** Forget everything read: a `.fudapi` or the `package.json` changed. */
  invalidate(): void {
    this.#state = undefined;
  }

  get sources(): readonly ApiSource[] {
    return this.#read().sources;
  }

  /** The dependencies that publish `.fudapi`. */
  get libraries(): readonly ApiLibrary[] {
    return this.#read().libraries;
  }

  /**
   * Whether the app declares a `.fudapi` that needs a root: one of its own with something to
   * implement (SDD-71 §3.3). Pipes, types and enums have nothing, and a root would ask for
   * `@fudic/http`, which an app with them and no contracts does not have.
   */
  hasRoot(): boolean {
    return this.sources.some((s) => s.origin === 'app' && !nothingToImplement(s));
  }

  /** Every `<id>` of the project, the dependencies' included. */
  ids(): readonly string[] {
    return this.sources.map((s) => s.id);
  }

  /** The source of `<id>`, or `undefined` when the project has none. */
  source(id: string): ApiSource | undefined {
    return this.#read().byId.get(id);
  }

  /**
   * The module `fudic:<id>`, or `undefined` when there is no such file. With `i18n`, the one of
   * its locale: the texts of the `.fudapi` translated (SDD-74 §4.5).
   */
  module(id: string, side: Side, i18n?: ApiLocale): string | undefined {
    const state = this.#read();
    const source = state.byId.get(id);
    return source === undefined ? undefined : emitModule(source, state.index, this.context(source), side, i18n);
  }

  /** What the parser and the validator say about every file of the app, by file. */
  diagnostics(): readonly ApiFileDiagnostics[] {
    return apiDiagnostics(this.#root, this.#read());
  }

  /** What the compiler is told about the `.fudapi` at `path` (SDD-60 §3.14). */
  linked(path: string): LinkedApi | undefined {
    const source = this.#read().byPath.get(posix(path));
    if (source === undefined) return undefined;
    const decls = source.file.declarations;
    const has = (kind: Decl['kind']): boolean => decls.some((d) => d.kind === kind);
    const fns = decls.flatMap((d) => (d.kind === 'fn' ? [d] : []));
    const forms = [
      ...decls.flatMap((d) => (d.kind === 'form' ? [d.name.text] : [])),
      ...fns.flatMap((f) => (f.form === undefined ? [] : [f.form.name.text])),
    ];
    const route = this.context(source).route === undefined ? undefined : `${path.slice(0, -API_EXTENSION.length)}.fud`;
    const data = dataShape(source, this.#read().index);
    const later = decls.flatMap((d) => (d.kind === 'load' ? d.fields.filter((f) => f.later !== undefined) : []));
    return {
      id: source.id,
      load: has('load'),
      paths: has('paths'),
      layout: has('layout'),
      functions: fns.map((f) => f.name.text),
      forms: [...new Set(forms)],
      ...(route !== undefined ? { route } : {}),
      ...(data !== undefined ? { data } : {}),
      ...(later.length > 0 ? { later: later.map((f) => f.name.text) } : {}),
    };
  }

  /**
   * Every function of the project by URL pattern and method, for an adapter to mount
   * (SDD-60 §3.11): `/_fudic/fn/routes/blog/:slug/save/:id`.
   */
  functionTable(): readonly { readonly url: string; readonly method: string }[] {
    return this.sources.flatMap((source) =>
      source.file.declarations.flatMap((d) => {
        if (d.kind !== 'fn') return [];
        const id = source.id.split('/').map((seg) => seg.replace(PARAM, ':$1'));
        const own = (d.route?.segments ?? []).map((seg) => (seg.kind === 'param' ? `:${seg.text}` : seg.text));
        return [{ url: [FN_PREFIX, ...id, d.name.text, ...own].join('/'), method: d.verb.toUpperCase() }];
      }),
    );
  }

  /**
   * Every `runs remote` rule of the project by URL, for an adapter to mount (SDD-80 §4.2):
   * `/_fudic/rule/rules/people/alias-taken`, always `POST`. A `runs server` rule has none.
   */
  ruleTable(): readonly { readonly url: string; readonly method: 'POST' }[] {
    return this.sources.flatMap((source) =>
      source.file.declarations.flatMap((d) =>
        d.kind === 'rule' && d.runs?.value.text === 'remote'
          ? [{ url: [RULE_PREFIX, source.id, d.name.text].join('/'), method: 'POST' as const }]
          : [],
      ),
    );
  }

  /** What the `.fudapi` at `path` declares about the page it serves (SDD-60 §3.4, §4.5). */
  page(path: string): PageApi | undefined {
    const source = this.#read().byPath.get(posix(path));
    if (source === undefined) return undefined;
    const decls = source.file.declarations;
    const load = decls.find((d): d is LoadDecl => d.kind === 'load');
    const frames = framesShape(source, this.#read().index);
    return {
      id: source.id,
      file: source.path,
      ...(load !== undefined ? { load } : {}),
      ...(frames !== undefined ? { frames } : {}),
      paths: decls.some((d) => d.kind === 'paths'),
      layout: decls.some((d) => d.kind === 'layout'),
    };
  }

  /** Whether the file is the sibling of a route, its parameters and its URL pattern. */
  context(source: ApiSource): ApiContext {
    return apiContextOf(this.#root, source);
  }

  /**
   * Writes `.fudic/api/<id>.d.ts` for every `.fudapi` of the project, and only where the text
   * changed: an unchanged file keeps its date, so the TS server of the editor is not woken.
   * Answers the paths written.
   */
  writeDeclarations(): readonly string[] {
    return writeApiDeclarations(this.#root, this.#read());
  }

  #read(): ApiProjectFiles {
    this.#state ??= readApiProject(this.#root);
    return this.#state;
  }
}

/** The compiled files of a library folder, `.js` only, for the root to load one by one. */
export function libraryFiles(dir: string): readonly string[] {
  if (!existsSync(dir)) return [];
  return (readdirSync(dir, { recursive: true }) as string[])
    .map(posix)
    .filter((f) => f.endsWith('.js'))
    .sort()
    .map((f) => join(dir, f).replace(/\\/gu, '/'));
}
