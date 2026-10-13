import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** A spread on the component's own host wrapper or on its `<template shadowrootmode>`. */
export const FUD0992 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0992',
    'error',
    "a spread does not go on the component's own host or shadow template: put it on a component or a native element inside",
    p,
  );
