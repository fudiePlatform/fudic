/**
 * The builders of a contract file's declarations, except forms: functions, `load`, `paths`,
 * `layout`, `chain`, `type`, `enum` and `messages`. Each reads its line and the lines below it
 * by what its context takes (SDD §3.2–§3.5, §3.9).
 */

import { FUD1063, FUD1067, FUD1068, FUD1072, FUD1073, FUD1074, FUD1076, span } from '@fudic/diagnostics';
import type {
  ArgDecl,
  ChainDecl,
  CompressClause,
  Duration,
  EnumDecl,
  FailsClause,
  FnDecl,
  FormRef,
  InvalidatesClause,
  LayoutDecl,
  LoadDecl,
  MessageEntry,
  MessagesDecl,
  Name,
  PageOption,
  PathsDecl,
  ReturnsClause,
  Route,
  SkipClause,
  TypeDecl,
  TypedField,
  UseClause,
  Verb,
} from './ast.js';
import {
  blockSpan,
  compressClause,
  declName,
  failsClause,
  isShape,
  leaf,
  name,
  repeated,
  shaped,
  skipClause,
  trailing,
  laterWord,
  typedField,
  unexpected,
  useClause,
  type Ctx,
} from './clauses.js';
import { ruleUse } from './form.js';
import type { LineNode, Token } from './line.js';
import { duration, readType, route, text } from './type.js';

const doc = (node: LineNode): { doc?: string } => (node.doc !== undefined ? { doc: node.doc } : {});

const FN_CLAUSES = ['use', 'skip', 'form', 'invalidates', 'compress', 'fails', 'query', '->', '<arg> <type>'];

const INVALIDATED = /^\/(?:(?:[A-Za-z0-9_-]+|:[A-Za-z_][A-Za-z0-9_]*)(?:\/(?:[A-Za-z0-9_-]+|:[A-Za-z_][A-Za-z0-9_]*))*)?$/u;

/** `<verb> <name> [<route>]` and its clauses. */
export function fnDecl(node: LineNode, c: Ctx): FnDecl | undefined {
  const [verb] = node.tokens as [Token];
  const fnName = declName(node, 'identifier', 'function', c);
  if (fnName === undefined) return undefined;
  const routeToken = node.tokens[2];
  const fnRoute: Route | undefined = routeToken !== undefined ? route(routeToken, c.out) : undefined;
  trailing(node, 3, c);

  const uses: UseClause[] = [];
  const skips: SkipClause[] = [];
  const invalidates: InvalidatesClause[] = [];
  const fails: FailsClause[] = [];
  const args: Omit<ArgDecl, 'place'>[] = [];
  let form: FormRef | undefined;
  let compress: CompressClause | undefined;
  let returns: ReturnsClause | undefined;

  for (const child of node.children) {
    const [head] = child.tokens as [Token];
    switch (head.raw) {
      case 'use': {
        const use = useClause(child, c);
        if (use !== undefined) uses.push(use);
        break;
      }
      case 'skip': {
        const skip = skipClause(child, c);
        if (skip !== undefined) skips.push(skip);
        break;
      }
      case 'form': {
        if (repeated(form, head, c)) break;
        leaf(child, c);
        const formName = declName(child, 'identifier', 'form', c);
        trailing(child, 2, c);
        if (formName !== undefined) form = { keyword: head.span, name: formName, span: child.span };
        break;
      }
      case 'invalidates': {
        leaf(child, c);
        const routes = child.tokens.slice(1).filter((t) => {
          if (INVALIDATED.test(t.raw)) return true;
          c.out.push(FUD1068({ span: t.span, text: t.raw, kind: 'route' }));
          return false;
        });
        if (child.tokens.length === 1) c.out.push(FUD1063({ span: head.span, keyword: head.raw }));
        else invalidates.push({ keyword: head.span, routes: routes.map(name), span: child.span });
        break;
      }
      case 'compress': {
        if (repeated(compress, head, c)) break;
        compress = compressClause(child, c);
        break;
      }
      case 'fails': {
        const f = failsClause(child, c);
        if (f !== undefined) fails.push(f);
        break;
      }
      case 'query': {
        const argName = child.tokens[1];
        if (argName === undefined) {
          c.out.push(FUD1063({ span: head.span, keyword: head.raw }));
          break;
        }
        if (argName.raw === 'a') c.out.push(FUD1076({ span: argName.span, name: argName.raw }));
        const arg = argDecl(child, 1, c);
        if (arg !== undefined) args.push({ ...arg, query: head.span });
        break;
      }
      case '->': {
        if (repeated(returns, head, c)) break;
        leaf(child, c);
        const { type, used } = readType(child.tokens.slice(1), c.out);
        if (child.tokens.length === 1) c.out.push(FUD1067({ span: head.span, text: '' }));
        trailing(child, 1 + used + laterWord(child, 1 + used, false, c).used, c);
        if (type !== undefined) returns = { arrow: head.span, type, span: child.span };
        break;
      }
      default: {
        if (child.tokens.length < 2 || !isShape(head, 'identifier')) {
          unexpected(child, node, FN_CLAUSES, c);
          break;
        }
        const arg = argDecl(child, 0, c);
        if (arg !== undefined) args.push(arg);
      }
    }
  }

  const params = new Set(fnRoute?.segments.filter((s) => s.kind === 'param').map((s) => s.text));
  const placed: ArgDecl[] = args.map((arg) => ({
    ...arg,
    place: arg.query !== undefined ? 'query' : params.has(arg.name.text) ? 'route' : 'body',
  }));
  if (form !== undefined && placed.some((a) => a.place === 'body')) c.out.push(FUD1072({ span: form.span }));

  return {
    kind: 'fn',
    verb: verb.raw as Verb,
    verbSpan: verb.span,
    name: fnName,
    ...(fnRoute !== undefined ? { route: fnRoute } : {}),
    uses,
    skips,
    ...(form !== undefined ? { form } : {}),
    invalidates,
    ...(compress !== undefined ? { compress } : {}),
    fails,
    args: placed,
    ...(returns !== undefined ? { returns } : {}),
    ...doc(node),
    span: blockSpan(node),
  };
}

/**
 * `<arg> <type>` from `tokens[at]`, and the rules below it: the argument without its place,
 * which the route decides.
 */
function argDecl(node: LineNode, at: number, c: Ctx): Omit<ArgDecl, 'place'> | undefined {
  const argName = shaped(node.tokens[at]!, 'identifier', 'argument', c);
  const rules = node.children.flatMap((child) => ruleUse(child, node, ARG_LINES, c) ?? []);
  const rest = node.tokens.slice(at + 1);
  if (rest.length === 0) {
    c.out.push(FUD1067({ span: argName.span, text: '' }));
    return undefined;
  }
  const { type, used } = readType(rest, c.out);
  trailing(node, at + 1 + used + laterWord(node, at + 1 + used, false, c).used, c);
  if (type === undefined) return undefined;
  return { kind: 'arg', name: argName, type, rules, ...doc(node), span: blockSpan(node) };
}

const ARG_LINES = ['<rule>'];

const MODES = ['ssg', 'ssr', 'sw'];
const POLICIES = ['cache-first', 'network-first', 'stale-while-revalidate', 'network-only'];
const PAGE = ['never', 'persist'];
const LOAD_OPTIONS = [...MODES, 'ttl', ...POLICIES, 'page'];

/** `load [mode] [ttl <dur>] [<policy>] [page <never|persist> [<dur>]]`, `use`, `skip`, `fails`, fields. */
export function loadDecl(node: LineNode, c: Ctx): LoadDecl {
  const [keyword] = node.tokens as [Token];
  let mode: Name | undefined;
  let ttl: Duration | undefined;
  let policy: Name | undefined;
  let page: PageOption | undefined;
  const bad = (t: Token | undefined, at: Token, expected: readonly string[]): void => {
    c.out.push(FUD1074({ span: (t ?? at).span, text: t?.raw ?? '', expected }));
  };

  const tokens = node.tokens;
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (MODES.includes(t.raw)) {
      if (!repeated(mode, t, c)) mode = name(t);
    } else if (POLICIES.includes(t.raw)) {
      if (!repeated(policy, t, c)) policy = name(t);
    } else if (t.raw === 'ttl') {
      const d = tokens[i + 1] !== undefined ? duration(tokens[i + 1]!) : undefined;
      if (d === undefined) {
        bad(tokens[i + 1], t, ['<duration>']);
      } else if (!repeated(ttl, t, c)) {
        ttl = d;
      }
      i++;
    } else if (t.raw === 'page') {
      const value = tokens[i + 1];
      i++;
      if (value === undefined || !PAGE.includes(value.raw)) {
        bad(value, t, PAGE);
        continue;
      }
      const d = tokens[i + 1] !== undefined ? duration(tokens[i + 1]!) : undefined;
      if (d !== undefined) i++;
      if (!repeated(page, t, c)) {
        page = {
          keyword: t.span,
          value: name(value),
          ...(d !== undefined ? { duration: d } : {}),
          span: span(t.span.start, (d ?? value).span.end),
        };
      }
    } else {
      bad(t, t, LOAD_OPTIONS);
    }
  }

  const uses: UseClause[] = [];
  const skips: SkipClause[] = [];
  const fails: FailsClause[] = [];
  const fields: TypedField[] = [];
  for (const child of node.children) {
    const head = child.tokens[0]!.raw;
    if (head === 'use') {
      const use = useClause(child, c);
      if (use !== undefined) uses.push(use);
    } else if (head === 'skip') {
      const skip = skipClause(child, c);
      if (skip !== undefined) skips.push(skip);
    } else if (head === 'fails') {
      const f = failsClause(child, c);
      if (f !== undefined) fails.push(f);
    } else {
      const field = typedField(child, node, ['use', 'skip', 'fails', '<field> <type> [later]'], c, true);
      if (field !== undefined) fields.push(field);
    }
  }

  return {
    kind: 'load',
    keyword: keyword.span,
    ...(mode !== undefined ? { mode } : {}),
    ...(ttl !== undefined ? { ttl } : {}),
    ...(policy !== undefined ? { policy } : {}),
    ...(page !== undefined ? { page } : {}),
    uses,
    skips,
    fails,
    fields,
    ...doc(node),
    span: blockSpan(node),
  };
}

/** `paths` or `layout`: a word alone, with nothing below it. */
export function bareDecl(node: LineNode, c: Ctx): PathsDecl | LayoutDecl {
  const [keyword] = node.tokens as [Token];
  trailing(node, 1, c);
  leaf(node, c);
  return { kind: keyword.raw as 'paths' | 'layout', keyword: keyword.span, ...doc(node), span: node.span };
}

/** `chain` and its `use`, `skip` and `compress`. */
export function chainDecl(node: LineNode, c: Ctx): ChainDecl {
  const [keyword] = node.tokens as [Token];
  trailing(node, 1, c);
  const uses: UseClause[] = [];
  const skips: SkipClause[] = [];
  let compress: CompressClause | undefined;
  for (const child of node.children) {
    const [head] = child.tokens as [Token];
    if (head.raw === 'use') {
      const use = useClause(child, c);
      if (use !== undefined) uses.push(use);
    } else if (head.raw === 'skip') {
      const skip = skipClause(child, c);
      if (skip !== undefined) skips.push(skip);
    } else if (head.raw === 'compress') {
      if (!repeated(compress, head, c)) compress = compressClause(child, c);
    } else {
      unexpected(child, node, ['use', 'skip', 'compress'], c);
    }
  }
  return {
    kind: 'chain',
    keyword: keyword.span,
    uses,
    skips,
    ...(compress !== undefined ? { compress } : {}),
    ...doc(node),
    span: blockSpan(node),
  };
}

/** `type <Name>` and its fields. */
export function typeDecl(node: LineNode, c: Ctx): TypeDecl | undefined {
  const [keyword] = node.tokens as [Token];
  const typeName = declName(node, 'pascal', 'type', c);
  if (typeName === undefined) return undefined;
  trailing(node, 2, c);
  const fields = node.children
    .map((child) => typedField(child, node, ['<field> <type>'], c))
    .filter((f): f is TypedField => f !== undefined);
  if (node.children.length === 0) c.out.push(FUD1073({ span: typeName.span, block: 'type' }));
  return { kind: 'type', keyword: keyword.span, name: typeName, fields, ...doc(node), span: blockSpan(node) };
}

/** `enum <Name>` and its members, one per line. */
export function enumDecl(node: LineNode, c: Ctx): EnumDecl | undefined {
  const [keyword] = node.tokens as [Token];
  const enumName = declName(node, 'pascal', 'enum', c);
  if (enumName === undefined) return undefined;
  trailing(node, 2, c);
  const members = node.children.map((child) => {
    leaf(child, c);
    trailing(child, 1, c);
    return name(child.tokens[0]!);
  });
  if (members.length === 0) c.out.push(FUD1073({ span: enumName.span, block: 'enum' }));
  return { kind: 'enum', keyword: keyword.span, name: enumName, members, ...doc(node), span: blockSpan(node) };
}

/** `messages` and its `<code> "<text>"` lines. */
export function messagesDecl(node: LineNode, c: Ctx): MessagesDecl {
  const [keyword] = node.tokens as [Token];
  trailing(node, 1, c);
  const entries: MessageEntry[] = [];
  for (const child of node.children) {
    leaf(child, c);
    const code = shaped(child.tokens[0]!, 'kebab', 'error code', c);
    const value = child.tokens[1];
    const message = value !== undefined ? text(value, c.out) : undefined;
    if (value === undefined) c.out.push(FUD1068({ span: code.span, text: '', kind: 'text' }));
    trailing(child, 2, c);
    if (message !== undefined) entries.push({ code, text: message, ...doc(child), span: child.span });
  }
  return { kind: 'messages', keyword: keyword.span, entries, ...doc(node), span: blockSpan(node) };
}
