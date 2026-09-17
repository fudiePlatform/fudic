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
/**
 * A relative specifier that walks into the project's public directory.
 *
 * The two ways of naming a file of your own differ in WHO chooses the URL: a relative path
 * hands it to the build, which hashes and publishes it; a root-absolute one keeps the name
 * the author gave the file under `public/`. Reaching into `public/` with `../../public/x`
 * asks for both at once, and gets the worse half of each — a second, hashed copy of a file
 * that is already being served under its own name.
 *
 * Error, because there is no version of it the author meant: either `/x`, or the file does
 * not belong in `public/`.
 */
export const FUD_PUBLIC_BY_PATH = 'FUD0366';
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

// SDD-27 (FUD0500–FUD0519): build artifacts and manifest. Neither breaks the build:
// the first disables the rename entirely, the second only for the colliding pair.
export const FUD_HASH_LENGTH = 'FUD0500';
export const FUD_NAME_COLLISION = 'FUD0501';

// SDD-21 (FUD0420–FUD0449): layouts. Only the build-level one lives here; the rest are
// span-carrying diagnostics the compiler emits (structure + resolveDocument).
export const FUD_ORPHAN_LAYOUT = 'FUD0434';

// SDD-39 (FUD0620–FUD0639): reactive routes. Both are the BUILD's and carry no span — one
// is about a page that failed to render, the other about two files that would be written to
// the same name.
/** A route's prerender threw. The page is not generated AND the build fails (§4.11). */
export const FUD_PRERENDER_FAILED = 'FUD0620';
/** A route's chunk name collides with a component tag: two files, one name (§3.5). */
export const FUD_ROUTE_NAME_COLLISION = 'FUD0622';

// SDD-42 (FUD0740–FUD0759): the project style guide. The other three of that range belong
// to `@fudic/config`, which owns the field; this one is the BUILD's, because it is the only
// place that knows the whole project.
/**
 * The project declares `styles` and defines no component of its own: nothing adopts the
 * sheet (SDD-42 §5).
 *
 * A warning and a build that finishes, because a project with no components yet is what
 * every project looks like on its first day — and it carries no span, because what it is
 * about is the absence of files.
 */
export const FUD_STYLES_NOT_ADOPTED = 'FUD0742';
