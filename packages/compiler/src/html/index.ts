/**
 * The strict-subset HTML parser (SDD-05). Canonical re-export.
 */

export type {
  DocumentMode,
  Namespace,
  ElementKind,
  HtmlDocument,
  ElementNode,
  Attribute,
  AttributeValuePart,
  AttributeText,
  TextNode,
  CommentNode,
  DoctypeNode,
  CdataNode,
  RawTextNode,
  RazorCommentNode,
  AtEscapeNode,
  InlineCodeNode,
  RawExpressionNode,
  RazorConstruct,
  RazorConstructType,
  UnhandledConstructNode,
  HtmlContent,
} from './nodes.js';
export { VOID_ELEMENTS, RAW_ELEMENTS } from './nodes.js';

export type { HtmlParseContext, AtConstructParser, HtmlParserOptions } from './parser.js';
export { parseDocument } from './parser.js';
