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

// SDD-20 (FUD0390–FUD0419): Service Worker render — config, strategy and linking.
export const FUD_SW_CONFIG_MALFORMED = 'FUD0390';
export const FUD_SW_SHELL_MISSING = 'FUD0391';
export const FUD_TTL_INVALID = 'FUD0392';
export const FUD_STRATEGY_NOT_LITERAL = 'FUD0393';
export const FUD_STRATEGY_DUPLICATE = 'FUD0394';
export const FUD_UNLINKABLE_CONSTRUCT = 'FUD0395';
export const FUD_TWO_TTLS = 'FUD0396';
export const FUD_STRATEGY_AND_DEFAULT = 'FUD0397';
export const FUD_SSG_WITHOUT_PATHS = 'FUD0398';
export const FUD_CHUNK_NOT_EMITTED = 'FUD0399';

// SDD-21 (FUD0420–FUD0449): layouts. Only the build-level one lives here; the rest are
// span-carrying diagnostics the compiler emits (structure + resolveDocument).
export const FUD_ORPHAN_LAYOUT = 'FUD0434';
