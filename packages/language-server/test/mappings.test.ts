/**
 * The mapping boundary with Volar (SDD-24 §4.1).
 *
 * Two things must hold, and nothing else matters here: the six capabilities survive the
 * crossing untouched — a lossy translation always loses on the same side, scaffolding becoming
 * visible — and the two lengths stay two, because a stretch that *stands for* source it does
 * not reproduce would otherwise underline whatever follows it.
 */

import { describe, expect, it } from 'vitest';
import { SCAFFOLD_CAPS, USER_CAPS, DIAGNOSTIC_ONLY_CAPS, type Mapping } from '@fudic/language-core';
import { identityMapping, toCodeInformation, toCodeMapping, toCodeMappings } from '../src/mappings.js';

const mapping = (over: Partial<Mapping> = {}): Mapping => ({
  sourceOffset: 10,
  generatedOffset: 40,
  length: 4,
  sourceLength: 4,
  caps: USER_CAPS,
  ...over,
});

describe('toCodeInformation', () => {
  it('carries user capabilities across as they are', () => {
    expect(toCodeInformation(USER_CAPS)).toEqual({
      verification: true,
      // Additional, and it travels as the object it is: Volar reads `isAdditional` off this
      // very field to decide whether the projection's answer is the only one (SDD-28 §5.5).
      completion: { isAdditional: true },
      semantic: true,
      navigation: true,
      structure: true,
      format: false,
    });
  });

  it('keeps scaffolding invisible: every flag false', () => {
    const information = toCodeInformation(SCAFFOLD_CAPS);

    expect(Object.values(information)).toEqual([false, false, false, false, false, false]);
  });

  it('lets a diagnostic-only stretch report without offering rename or completion', () => {
    const information = toCodeInformation(DIAGNOSTIC_ONLY_CAPS);

    expect(information.verification).toBe(true);
    expect(information.completion).toBe(false);
    expect(information.navigation).toBe(false);
  });
});

describe('toCodeMapping', () => {
  it('omits generatedLengths for a verbatim copy, which is the common case', () => {
    expect(toCodeMapping(mapping())).toEqual({
      sourceOffsets: [10],
      generatedOffsets: [40],
      lengths: [4],
      data: toCodeInformation(USER_CAPS),
    });
  });

  it('keeps both lengths when the stretch stands for shorter source', () => {
    // `$C_app_missing` — 14 generated characters standing for the 11 of `app-missing`.
    const code = toCodeMapping(mapping({ length: 14, sourceLength: 11 }));

    expect(code.lengths).toEqual([11]);
    expect(code.generatedLengths).toEqual([14]);
  });

  it('translates a whole table in order', () => {
    const table = toCodeMappings([mapping(), mapping({ sourceOffset: 20, caps: SCAFFOLD_CAPS })]);

    expect(table.length).toBe(2);
    expect(table[1]?.sourceOffsets).toEqual([20]);
    expect(table[1]?.data.navigation).toBe(false);
  });
});

describe('identityMapping', () => {
  it('maps a file onto itself with every capability open', () => {
    expect(identityMapping(120)).toEqual({
      sourceOffsets: [0],
      generatedOffsets: [0],
      lengths: [120],
      data: {
        verification: true,
        completion: true,
        semantic: true,
        navigation: true,
        structure: true,
        format: true,
      },
    });
  });
});
