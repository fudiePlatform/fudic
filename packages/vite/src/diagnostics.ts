/**
 * Build/config-level diagnostics (SDD-19 §5, range FUD0360–FUD0389). Distinct from
 * the compiler's span-carrying `Diagnostic`: these concern files, routes and the
 * manifest — not source offsets. The plugin elevates them to Vite errors/warnings.
 */

export interface FudicDiagnostic {
  readonly code: string;
  readonly message: string;
  /** The route file, asset or pattern this concerns. */
  readonly file: string;
}

export const FUD_MALFORMED_PARAM = 'FUD0360';
export const FUD_ROUTE_COLLISION = 'FUD0361';
export const FUD_PATHS_INCOMPLETE = 'FUD0362';
export const FUD_ASSET_NOT_FOUND = 'FUD0363';
export const FUD_UNKNOWN_ROUTE_OVERRIDE = 'FUD0364';
export const FUD_MANIFEST_URL_NOT_ABSOLUTE = 'FUD0365';
