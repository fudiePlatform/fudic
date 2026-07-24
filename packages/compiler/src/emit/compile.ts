/**
 * The public one-call entry a consumer uses: `.fud` source → SSR emit artifacts.
 * Runs the real pipeline (SDD-05 parse + SDD-06/08 constructs + SDD-10 structure)
 * and hands the component AST to the SSR emit. Returns text only; the compiler
 * imports no runtime package.
 */

import { parseDocument, type AtConstructParser } from '../html/index.js';
import { parseControl } from '../control/index.js';
import { parseCodeBlock } from '../code/index.js';
import { structureDocument } from '../document/index.js';
import { emitComponentSsr, type SsrEmitResult } from './component-ssr.js';

const constructs: AtConstructParser = { parseControl, parseCodeBlock };

/** Compile a component `.fud` to its SSR render function + style module (text). */
export function compileComponentSsr(source: string): SsrEmitResult {
  const parsed = parseDocument(source, { atConstructs: constructs });
  const doc = structureDocument(source, parsed.value).value;
  if (doc.type !== 'component-document') {
    return {
      specifier: '',
      styleModule: '',
      render: '',
      diagnostics: ['not a component document (page emit is a later slice).'],
    };
  }
  return emitComponentSsr(source, doc);
}
