import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A host wrapper that does not hold exactly one `<template>` (SDD-10). */
export const FUD0157 = (p: SourceInput): SourceDiagnostic =>
  source('FUD0157', 'error', 'The host wrapper must contain exactly one <template>', p);
