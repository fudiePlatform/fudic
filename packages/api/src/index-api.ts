/**
 * The project index: every `.fudapi` of the app and of its direct dependencies, read once, so
 * that a name of the project resolves without imports (SDD §3.1, §3.13).
 *
 * Libraries go first and the app after, whatever order the host passes: when a name is
 * declared twice, the first declaration is the one that counts and the one reported is the
 * later, which then is the app's — the only one its author can change.
 */

import type {
  ApiFile,
  ChainDecl,
  EnumDecl,
  FnDecl,
  FormDecl,
  LoadDecl,
  MessagesDecl,
  MiddlewareDecl,
  PatternDecl,
  RuleDecl,
  TypeDecl,
  TypeExpr,
} from './ast.js';

/** One `.fudapi` as the host found it. */
export interface ApiSource {
  /** Its path inside `src/` without extension, or `<package>/<path inside fudapi/>`. */
  readonly id: string;
  /** Its absolute path, where a diagnostic about it points. */
  readonly path: string;
  readonly file: ApiFile;
  readonly origin: 'app' | { readonly package: string };
}

/** The `<id>` of `src/http.fudapi`, whose `chain` is the global level. */
export const GLOBAL_ID = 'http';

/** The classes of project names, each its own namespace. A `type` and an `enum` share one. */
export interface ProjectDecls {
  readonly type: TypeDecl | EnumDecl;
  readonly form: FormDecl;
  readonly rule: RuleDecl;
  readonly middleware: MiddlewareDecl;
  readonly pattern: PatternDecl;
}

export type ProjectKind = keyof ProjectDecls;

/** A declaration and the source it is in. */
export interface Declared<D> {
  readonly decl: D;
  readonly source: ApiSource;
}

export interface ApiIndex {
  /** Libraries first, then the app. */
  readonly sources: readonly ApiSource[];
  /** The declaration that counts for a name: the first one. */
  lookup<K extends ProjectKind>(kind: K, name: string): Declared<ProjectDecls[K]> | undefined;
  /** Every declaration of a class, repetitions included, in index order. */
  all<K extends ProjectKind>(kind: K): readonly Declared<ProjectDecls[K]>[];
  /** Every declaration of one name, in index order. */
  named<K extends ProjectKind>(kind: K, name: string): readonly Declared<ProjectDecls[K]>[];
  /** The names of a class close enough to `name` to be a typo of it. */
  candidates(kind: ProjectKind, name: string): readonly string[];
  /** The rules whose `on field` takes a field of `type`. */
  rulesFor(type: TypeExpr): readonly Declared<RuleDecl>[];
  /** Every `messages` of the project, in index order. */
  messages(): readonly Declared<MessagesDecl>[];
  /**
   * The middlewares a level inherits: for a file's `chain`, the global one's; for a function
   * or a `load`, the global and the file's, less what the file's skips.
   */
  inherited(source: ApiSource, level: ChainDecl | FnDecl | LoadDecl): readonly string[];
}

const KIND_OF: Readonly<Record<string, ProjectKind>> = {
  type: 'type',
  enum: 'type',
  form: 'form',
  rule: 'rule',
  middleware: 'middleware',
  pattern: 'pattern',
};

/** `str`, `Person[]`, `i32?`, `map str u8`: a type as it is written. */
export function typeText(t: TypeExpr): string {
  switch (t.kind) {
    case 'named':
      return t.name.text;
    case 'list':
      return `${typeText(t.element)}[]`;
    case 'optional':
      return `${typeText(t.inner)}?`;
    case 'map':
      return `map ${typeText(t.key)} ${typeText(t.value)}`;
  }
}

/** Whether a type of `on field` takes a field of `type`: `*` any, `*[]` any list. */
function takes(accepted: TypeExpr, type: TypeExpr): boolean {
  const field = type.kind === 'optional' ? type.inner : type;
  if (accepted.kind === 'named' && accepted.name.text === '*') return true;
  if (accepted.kind === 'list' && accepted.element.kind === 'named' && accepted.element.name.text === '*') {
    return field.kind === 'list';
  }
  return typeText(accepted) === typeText(field);
}

/** Levenshtein distance: insertions, deletions and substitutions. */
function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current.push(Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost));
    }
    previous = current;
  }
  return previous[b.length]!;
}

/**
 * The names close enough to be a typo: at most two edits and never more than a third of the
 * name, the closest first, ties alphabetical.
 */
export function closest(name: string, names: readonly string[]): readonly string[] {
  const limit = Math.min(2, name.length / 3);
  return [...new Set(names)]
    .map((text) => ({ text, cost: distance(name, text) }))
    .filter((c) => c.cost <= limit)
    .sort((a, b) => a.cost - b.cost || a.text.localeCompare(b.text))
    .map((c) => c.text);
}

export function createApiIndex(sources: readonly ApiSource[]): ApiIndex {
  const ordered = [...sources.filter((s) => s.origin !== 'app'), ...sources.filter((s) => s.origin === 'app')];
  const byKind = new Map<ProjectKind, Declared<ProjectDecls[ProjectKind]>[]>();
  const messages: Declared<MessagesDecl>[] = [];
  for (const source of ordered) {
    for (const decl of source.file.declarations) {
      if (decl.kind === 'messages') messages.push({ decl, source });
      const kind = KIND_OF[decl.kind];
      if (kind === undefined) continue;
      const list = byKind.get(kind) ?? [];
      byKind.set(kind, list);
      list.push({ decl: decl as ProjectDecls[ProjectKind], source });
    }
  }

  const all = <K extends ProjectKind>(kind: K): readonly Declared<ProjectDecls[K]>[] =>
    (byKind.get(kind) ?? []) as Declared<ProjectDecls[K]>[];
  const named = <K extends ProjectKind>(kind: K, name: string): readonly Declared<ProjectDecls[K]>[] =>
    all(kind).filter((d) => d.decl.name.text === name);
  const global = ordered.find((s) => s.origin === 'app' && s.id === GLOBAL_ID);
  const chainOf = (source: ApiSource | undefined): ChainDecl | undefined =>
    source?.file.declarations.find((d): d is ChainDecl => d.kind === 'chain');
  const uses = (chain: ChainDecl | undefined): string[] =>
    chain?.uses.flatMap((u) => u.middlewares.map((m) => m.name.text)) ?? [];

  return {
    sources: ordered,
    lookup: (kind, name) => named(kind, name)[0],
    all,
    named,
    candidates: (kind, name) => closest(name, all(kind).map((d) => d.decl.name.text)),
    rulesFor: (type) => all('rule').filter((r) => r.decl.on?.types.some((t) => takes(t, type)) === true),
    messages: () => messages,
    inherited: (source, level) => {
      const outer = source === global ? [] : uses(chainOf(global));
      if (level.kind === 'chain') return outer;
      const file = chainOf(source);
      const skipped = new Set(file?.skips.flatMap((s) => s.middlewares.map((m) => m.text)));
      const skipAll = file?.skips.some((s) => s.all !== undefined) === true;
      return [...(skipAll ? [] : outer.filter((m) => !skipped.has(m))), ...uses(file)];
    },
  };
}
