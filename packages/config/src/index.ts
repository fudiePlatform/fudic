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

export { CONFIG_FILE, ID_PATTERN, PREFIX_PATTERN } from './constants.js';
export {
  FUD_CONFIG_DUPLICATE_ID,
  FUD_CONFIG_ID_REQUIRED,
  FUD_CONFIG_LIB_WITH_DEPLOYMENT,
  FUD_CONFIG_MALFORMED,
  FUD_STYLE_NOT_FOUND,
  FUD_STYLE_SPECIFIER_CLASH,
  type ConfigDiagnostic,
  type Span,
} from './diagnostics.js';
export {
  readProjectStyles,
  specifierOf,
  type ProjectStyleFile,
  type ProjectStylesResult,
} from './styles.js';
export {
  readProjectConfig,
  type ConfigIo,
  type ConfigResult,
  type ProjectConfig,
} from './read.js';
export { tagOf } from './tag.js';
