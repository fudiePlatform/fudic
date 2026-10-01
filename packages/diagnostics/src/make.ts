/**
 * The three constructors every code's function is written with. Internal to the package: NOT
 * exported from `index.ts`, so outside it a diagnostic can only be made by calling its code.
 *
 * They copy the location fields one by one and never spread the input: the input also carries
 * the data the message was composed from, and that data is not part of the diagnostic.
 */

import type {
  FileDiagnostic,
  FileInput,
  FudCode,
  ProjectDiagnostic,
  Severity,
  SourceDiagnostic,
  SourceInput,
} from './types.js';

export function source(
  code: FudCode,
  severity: Severity,
  message: string,
  input: SourceInput,
): SourceDiagnostic {
  return {
    severity,
    code,
    message,
    span: input.span,
    ...(input.file !== undefined ? { file: input.file } : {}),
    ...(input.related !== undefined ? { related: input.related } : {}),
  };
}

export function file(
  code: FudCode,
  severity: Severity,
  message: string,
  input: FileInput,
): FileDiagnostic {
  return {
    severity,
    code,
    message,
    file: input.file,
    ...(input.span !== undefined ? { span: input.span } : {}),
  };
}

export function project(code: FudCode, severity: Severity, message: string): ProjectDiagnostic {
  return { severity, code, message };
}
