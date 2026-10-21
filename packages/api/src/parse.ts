/**
 * `parseApi`: a `.fudapi` into its tree. It never throws: a broken input gives a partial tree
 * and its diagnostics, sorted by position, one per place (SDD §4.1).
 *
 * The lines are hung by level first; then each level-0 line is read by the builder of its
 * keyword, which reads the lines below it by what that declaration takes. A level-0 line that
 * starts no declaration is reported once and what hangs from it is skipped.
 */

import { FUD1062, FUD1078, FUD1079, span, type SourceDiagnostic } from '@fudic/diagnostics';
import type { ApiFile, ChainDecl, Decl, FileRole, ParseResult } from './ast.js';
import type { Ctx } from './clauses.js';
import { bareDecl, chainDecl, enumDecl, fnDecl, loadDecl, messagesDecl, typeDecl } from './contract.js';
import { middlewareDecl, patternDecl, ruleDecl } from './extensions.js';
import { formDecl } from './form.js';
import { lineTree, type LineNode } from './line.js';

type Builder = (node: LineNode, c: Ctx) => Decl | undefined;

const BUILDERS: Readonly<Record<string, Builder>> = {
  get: fnDecl,
  post: fnDecl,
  put: fnDecl,
  patch: fnDecl,
  delete: fnDecl,
  load: loadDecl,
  paths: bareDecl,
  layout: bareDecl,
  chain: chainDecl,
  type: typeDecl,
  enum: enumDecl,
  form: formDecl,
  messages: messagesDecl,
  rule: ruleDecl,
  middleware: middlewareDecl,
  pattern: patternDecl,
};

/** The keywords a level-0 line can start with. */
export const DECLARATION_KEYWORDS: readonly string[] = Object.keys(BUILDERS);

/** What a declaration makes its file; `type` and `enum` fit in both. */
function roleOf(decl: Decl): FileRole | undefined {
  switch (decl.kind) {
    case 'type':
    case 'enum':
      return undefined;
    case 'rule':
    case 'middleware':
    case 'pattern':
      return 'extensions';
    default:
      return 'contract';
  }
}

export function parseApi(source: string): ParseResult<ApiFile> {
  const out: SourceDiagnostic[] = [];
  const c: Ctx = { source, out };
  const declarations: Decl[] = [];
  let role: { readonly role: FileRole; readonly decl: Decl } | undefined;
  let chain: ChainDecl | undefined;

  for (const node of lineTree(source, out)) {
    const head = node.tokens[0]!;
    const builder = BUILDERS[head.raw];
    if (builder === undefined) {
      out.push(FUD1062({ span: head.span, word: head.raw, expected: DECLARATION_KEYWORDS }));
      continue;
    }
    const decl = builder(node, c);
    if (decl === undefined) continue;

    const declRole = roleOf(decl);
    if (declRole !== undefined && role === undefined) role = { role: declRole, decl };
    else if (declRole !== undefined && declRole !== role!.role) {
      out.push(
        FUD1078({
          span: head.span,
          keyword: head.raw,
          kind: role!.role,
          related: [{ span: role!.decl.span, message: `the first declaration makes it a ${role!.role} file` }],
        }),
      );
    }

    if (decl.kind === 'chain') {
      if (chain !== undefined) {
        out.push(FUD1079({ span: head.span, related: [{ span: chain.span, message: 'the first `chain`' }] }));
        continue;
      }
      chain = decl;
    }
    declarations.push(decl);
  }

  return {
    value: {
      kind: 'file',
      declarations,
      ...(role !== undefined ? { role: role.role } : {}),
      span: span(0, source.length),
    },
    diagnostics: out.sort((a, b) => a.span.start - b.span.start),
  };
}
