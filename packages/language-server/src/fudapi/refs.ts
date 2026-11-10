/**
 * Every project name a `.fudapi` writes, with its place: the declarations of the file and every
 * use of a type, form, rule, middleware or pattern. Hover, definition and semantic tokens all
 * ask the same question — what name is here, and what does it refer to — so they share this
 * one walk.
 */

import type {
  ApiFile,
  ApiIndex,
  FormMember,
  Name,
  ProjectKind,
  RuleUse,
  SkipClause,
  SummaryBlock,
  TypeExpr,
  UseClause,
} from '@fudic/api';
import { PRIMITIVES } from '@fudic/api';

/** The names a type is written with that are no project type: the language's, and what a rule's `on` and parameters add. */
const BUILT_IN: ReadonlySet<string> = new Set([...PRIMITIVES, '*', 'pattern']);

export interface ApiRef {
  readonly name: Name;
  readonly kind: ProjectKind;
  /** The name of a declaration, not a use of one. */
  readonly declaration: boolean;
}

export function apiRefs(file: ApiFile, index: ApiIndex): readonly ApiRef[] {
  return walkRefs(file, index).refs;
}

/** Every type of the language a `.fudapi` writes (`str`, `file`), by its name: what has a hover of its own. */
export function builtInTypes(file: ApiFile, index: ApiIndex): readonly Name[] {
  return walkRefs(file, index).builtIns;
}

function walkRefs(file: ApiFile, index: ApiIndex): { readonly refs: readonly ApiRef[]; readonly builtIns: readonly Name[] } {
  const refs: ApiRef[] = [];
  const builtIns: Name[] = [];
  const use = (name: Name, kind: ProjectKind): void => {
    refs.push({ name, kind, declaration: false });
  };
  const type = (t: TypeExpr): void => {
    switch (t.kind) {
      case 'named':
        if (BUILT_IN.has(t.name.text)) builtIns.push(t.name);
        else use(t.name, 'type');
        return;
      case 'list':
        return type(t.element);
      case 'optional':
        return type(t.inner);
      case 'map':
        type(t.key);
        return type(t.value);
    }
  };
  const middlewares = (uses: readonly UseClause[], skips: readonly SkipClause[]): void => {
    for (const u of uses) for (const m of u.middlewares) use(m.name, 'middleware');
    for (const s of skips) for (const m of s.middlewares) use(m, 'middleware');
  };
  const rule = (r: RuleUse): void => {
    use(r.name, 'rule');
    const params = index.lookup('rule', r.name.text)?.decl.params ?? [];
    r.args.forEach((arg, i) => {
      const param = params[i]?.type;
      if (arg.kind === 'word' && param?.kind === 'named' && param.name.text === 'pattern') {
        use({ text: arg.text, span: arg.span }, 'pattern');
      }
    });
  };
  const summary = (s: SummaryBlock | undefined): void => {
    for (const item of s?.items ?? []) if (item.kind === 'rule-use') rule(item);
  };
  const members = (list: readonly FormMember[]): void => {
    for (const m of list) {
      if (m.kind === 'form-group') {
        members(m.fields);
        summary(m.summary);
      } else {
        type(m.type);
        m.rules.forEach(rule);
      }
    }
  };

  for (const d of file.declarations) {
    switch (d.kind) {
      case 'fn':
        middlewares(d.uses, d.skips);
        if (d.form !== undefined) use(d.form.name, 'form');
        d.args.forEach((a) => {
          type(a.type);
          a.rules.forEach(rule);
        });
        if (d.returns !== undefined) type(d.returns.type);
        break;
      case 'load':
        middlewares(d.uses, d.skips);
        d.fields.forEach((f) => type(f.type));
        break;
      case 'chain':
        middlewares(d.uses, d.skips);
        break;
      case 'type':
        refs.push({ name: d.name, kind: 'type', declaration: true });
        d.fields.forEach((f) => type(f.type));
        break;
      case 'enum':
        refs.push({ name: d.name, kind: 'type', declaration: true });
        break;
      case 'form':
        refs.push({ name: d.name, kind: 'form', declaration: true });
        members(d.fields);
        summary(d.summary);
        break;
      case 'rule':
        refs.push({ name: d.name, kind: 'rule', declaration: true });
        d.params.forEach((p) => type(p.type));
        d.on?.types.forEach(type);
        break;
      case 'middleware':
        refs.push({ name: d.name, kind: 'middleware', declaration: true });
        d.params.forEach((p) => type(p.type));
        d.adds?.fields.forEach((f) => type(f.type));
        break;
      case 'pattern':
        refs.push({ name: d.name, kind: 'pattern', declaration: true });
        break;
      case 'pipe':
        refs.push({ name: d.name, kind: 'pipe', declaration: true });
        d.on?.types.forEach(type);
        d.params.forEach((p) => type(p.type));
        break;
      default:
        break;
    }
  }
  return { refs: refs.sort((a, b) => a.name.span.start - b.name.span.start), builtIns };
}
