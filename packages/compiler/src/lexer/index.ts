/**
 * Tokenizer and mode stack (SDD-03). Canonical re-export.
 */

export type {
  TokenType,
  BaseToken,
  NamedTagToken,
  AttrNameToken,
  JsRegionToken,
  RawTextToken,
  PlainToken,
  Token,
} from './token.js';
export { Lexer, tokenize } from './lexer.js';
