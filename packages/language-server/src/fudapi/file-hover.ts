/**
 * The hover over `file` in a `.fudapi` (SDD-81 §3.8, decision 181): a type of the language, not a
 * name of the project, so the hover says what it becomes and where it may be written.
 */

import type { Hover } from 'vscode-languageserver-protocol';
import { rangeOf, touches, type ApiDocument } from './document.js';
import { builtInTypes } from './refs.js';

const FILE = [
  '```fudapi\nfile\n```',
  'A file: the platform `File` — `File | null` in a form, `readonly File[]` as `file[]`.',
  'It travels in the body of a `post`, `put`, `patch` or `delete`, as `multipart/form-data`, and comes back as a download from any `->`. Never in a URL or in the data of a page.',
  'Its rules: `required`, `max-size 2mb`, `accept "image/png, .pdf"`, and `min-length`/`max-length` on `file[]`.',
].join('\n\n');

export function fileHover(doc: ApiDocument, offset: number): Hover | undefined {
  const name = builtInTypes(doc.source.file, doc.index).find((n) => n.text === 'file' && touches(n.span, offset));
  return name === undefined ? undefined : { contents: { kind: 'markdown', value: FILE }, range: rangeOf(doc.path, doc.text, name.span) };
}
