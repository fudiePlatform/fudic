import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** `formassociated` on a template that is not the component's root template (SDD-34). */
export const FUD0593 = (p: SourceInput): SourceDiagnostic =>
  source(
    'FUD0593',
    'error',
    '`formassociated` belongs to the root `<template shadowrootmode>` of a component: it decides the emitted class, and there is none here',
    p,
  );
