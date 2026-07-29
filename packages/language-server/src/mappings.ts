/**
 * Translation of the SDD-23 mapping table into Volar's (SDD-24 §4.1).
 *
 * It is a rename, not a transformation, and that is the point: `MappingCaps` was defined as
 * exactly Volar's six `CodeInformation` flags precisely so this boundary could be lossless.
 * A private vocabulary here would force a 6→6 lossy translation, and the loss always falls on
 * the same side — scaffolding becoming visible to the user.
 *
 * The one thing that needs care is the two lengths. In Volar, `lengths` is the SOURCE length
 * and `generatedLengths` the generated one; they differ where a stretch *stands for* source it
 * does not reproduce — `$C_app_missing` is 14 characters standing for the 11 of `app-missing`
 * — and collapsing them would underline whatever follows the tag.
 */

import type { CodeInformation, CodeMapping } from '@volar/language-core';
import type { Mapping, MappingCaps } from '@fudic/language-core';

/** Every capability of a stretch, under Volar's names. */
export function toCodeInformation(caps: MappingCaps): CodeInformation {
  return {
    verification: caps.verification,
    completion: caps.completion,
    semantic: caps.semantic,
    navigation: caps.navigation,
    structure: caps.structure,
    format: caps.format,
  };
}

/** One SDD-23 mapping as one Volar mapping. */
export function toCodeMapping(mapping: Mapping): CodeMapping {
  const data = toCodeInformation(mapping.caps);
  const base = {
    sourceOffsets: [mapping.sourceOffset],
    generatedOffsets: [mapping.generatedOffset],
    lengths: [mapping.sourceLength],
    data,
  };

  // Omitted when both sides are the same length, which is the overwhelming majority: user
  // text is copied 1:1 so that columns survive.
  return mapping.length === mapping.sourceLength
    ? base
    : { ...base, generatedLengths: [mapping.length] };
}

/** The whole table of a virtual file. */
export function toCodeMappings(mappings: readonly Mapping[]): CodeMapping[] {
  return mappings.map(toCodeMapping);
}

/**
 * The mapping of a source file onto itself.
 *
 * Volar's root virtual code needs it so that features which do not go through any embedded
 * language — document links, the server's own completions — still have a table to travel on.
 */
export function identityMapping(length: number): CodeMapping {
  return {
    sourceOffsets: [0],
    generatedOffsets: [0],
    lengths: [length],
    data: {
      verification: true,
      completion: true,
      semantic: true,
      navigation: true,
      structure: true,
      format: true,
    },
  };
}
