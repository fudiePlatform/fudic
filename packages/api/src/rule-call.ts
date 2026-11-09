/**
 * What a rule use passes and says, once its rule is known (SDD-81 §3.2).
 *
 * A `str` argument is written between quotes, and so is the rule's text, behind it. The parser
 * cannot tell them apart when there is one string: `accept "image/*"` passes it, `required "Escribe
 * tu nombre."` says it. Read against the rule, a lone string that fills the one `str` parameter
 * still missing is that argument, and the use has no text.
 */

import type { Literal, RuleUse, StringLiteral, TypedField } from './ast.js';

export interface RuleCall {
  readonly args: readonly Literal[];
  readonly text?: StringLiteral;
}

const isText = (param: TypedField | undefined): boolean => {
  const type = param?.type;
  const inner = type?.kind === 'optional' ? type.inner : type;
  return inner?.kind === 'named' && inner.name.text === 'str';
};

/** The arguments and the text of `use` for a rule with `params`. */
export function ruleCall(use: RuleUse, params: readonly TypedField[]): RuleCall {
  if (use.text !== undefined && use.args.length === params.length - 1 && isText(params[use.args.length])) {
    return { args: [...use.args, use.text] };
  }
  return { args: use.args, ...(use.text !== undefined ? { text: use.text } : {}) };
}
