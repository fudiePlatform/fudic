/**
 * `@fudic/baseline` — what Baseline a fudic project asks for (SDD-83).
 *
 * The data of web-features, cut to what the judge asks and generated into `data.generated.ts` and
 * `table.generated.ts`, and the judge over it: a level is a date, a compat key passes when it reached
 * every core browser by then. No runtime dependency, and no clock: the date is the data's.
 *
 * It knows no language. The detectors that read HTML, CSS and TS live with their readers, in
 * `@fudic/compiler` and `@fudic/typecheck`, and ask here. What only reads a `fudic.json` imports
 * `@fudic/baseline/config`, which leaves the table of keys out.
 */

export * from './config.js';
export {
  CORE_BROWSERS,
  cssFunctionKeys,
  cssUnitKey,
  firstKnown,
  passes,
  status,
  tagInterface,
  type CoreBrowser,
  type KeyStatus,
} from './judge.js';
export { browsersFor } from './browsers.js';
