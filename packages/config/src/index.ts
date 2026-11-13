/**
 * `@fudic/config` — what a fudic project declares about itself.
 *
 * A leaf package with no runtime dependencies, and the ONE implementation of the
 * `fudic.json` reader. Its three consumers — the CLI, the Vite plugin and the language
 * server — all call `readProjectConfig`: three readers of the same file is the exact way
 * the editor and the build end up with two ideas of what the prefix is.
 *
 * It does not live in `@fudic/conventions` for the reason that package states in its own
 * header: what belongs there is *a name two packages must agree on and neither one owns*,
 * four constants with no I/O. A JSON parser, a diagnostic range and a filesystem seam turn
 * it into something else.
 */

export { CONFIG_FILE, ID_PATTERN, PREFIX_PATTERN, STYLE_NAME_PATTERN } from './constants.js';
// The diagnostics of `fudic.json` live in `@fudic/diagnostics` (SDD-50): `FUD0724`–`FUD0726`,
// `FUD0740`, `FUD0741`. `FUD0722` is reserved and deliberately unused (the prefix is a guide,
// and what breaks — two components defining one tag — is `FUD0761`).
export {
  readProjectStyles,
  type ProjectStyleFile,
  type ProjectStylesResult,
} from './styles.js';
export { readServe, sizeOf, type ServeConfig, type UploadsConfig } from './serve.js';
export {
  readProjectConfig,
  type ConfigIo,
  type ConfigResult,
  type GuideConfig,
  type NamedStyle,
  type ProjectConfig,
} from './read.js';
export { tagOf } from './tag.js';
export { readPolicy, ProjectPolicies, type PolicyRead, type ProjectAt } from './policy.js';
export {
  allowedFeatures,
  baselineContextOf,
  buildTargetOf,
  DEFAULT_BASELINE,
  floorWarning,
  readBaseline,
  type AllowedId,
  type BaselineConfig,
  type BaselineJudged,
  type BaselineRead,
} from './baseline.js';
export { projectConfigSchema } from './schema.js';
export type { HeaderEntry, HeadersKind, Piece } from './headers/segments.js';
export { segmentsOf, nameSpanOf } from './headers/segments.js';
export { HEADERS_FILES, parseHeaders, type AssetRule, type ParsedHeaders } from './headers/parse.js';
export { HEADERS_TEMPLATES } from './headers/templates.js';
export {
  readHeaders,
  type HeadersConfig,
  type HeadersRead,
  type HeadersSource,
  type ReadHeadersOptions,
} from './headers/read.js';
export { KNOWN_HEADERS, FUDIC_HEADERS, FUDIC_PATHS, type KnownHeader } from './headers/known.js';
export { CACHE_CONTROL_DIRECTIVES } from './headers/checks.js';
export {
  CSP_DIRECTIVES,
  CSP_KEYWORDS,
  cspOf,
  directiveOf,
  NONCE_SOURCE,
  parseCsp,
  PLACEHOLDERS,
  SOURCE_LIST_DIRECTIVES,
  type CspDirective,
  type CspPolicy,
} from './headers/csp.js';
export { checkNeeds, CSP_NEEDS_FILE, readCspNeeds, type CspNeed, type NeedFinding } from './headers/needs.js';
