/**
 * The hover of a `.headers` (SDD-84 §3.8) holds together with the reader: every header of its table
 * and every CSP3 directive has its line, and nothing else does.
 */

import { CSP_DIRECTIVES, KNOWN_HEADERS } from '@fudic/config';
import { describe, expect, it } from 'vitest';
import { DIRECTIVE_DOCS, HEADER_DOCS } from '../../src/headers/docs.js';

describe('the docs of the hover', () => {
  it('one per header the reader knows, under its name as MDN writes it', () => {
    expect(Object.keys(HEADER_DOCS).sort()).toEqual([...KNOWN_HEADERS.keys()].sort());
    for (const [lower, known] of KNOWN_HEADERS) expect(HEADER_DOCS[lower]!.name).toBe(known.name);
  });

  it('one per CSP3 directive', () => {
    expect(Object.keys(DIRECTIVE_DOCS).sort()).toEqual([...CSP_DIRECTIVES].sort());
  });
});
