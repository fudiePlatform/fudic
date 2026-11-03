/**
 * `data-without-load`: the `@code` of a route or a page reads `data`, and no `.fudapi` it links
 * declares `load`, so nothing ever fills it and it is `undefined`, always (`FUD0621`). Only when
 * the links are KNOWN (`apis` present): a file whose `.fudapi` could not be read says nothing. A
 * read in the view is `FUD0907`, the name the view does not have.
 */

import { FUD0621 } from '@fudic/diagnostics';
import { freeReferenceNodes } from '../../emit/scope.js';
import type { Analyzer } from '../model.js';
import { nameOf } from '../view-ast.js';
import { codeStatements } from '../view-scope.js';

/** The roles whose `data` is what `load` returns. A layout's comes from its route. */
const READS_LOAD: ReadonlySet<string> = new Set(['page-document', 'route-document']);

export const dataWithoutLoad: Analyzer = {
  name: 'data-without-load',
  run(input, report) {
    if (input.apis === undefined || input.apis.data || !READS_LOAD.has(input.document.type)) return;
    const read = freeReferenceNodes([codeStatements(input)]).find((node) => nameOf(node) === 'data');
    if (read !== undefined) report(FUD0621({ span: input.js.mapSpan(read.start, read.end) }));
  },
};
