/**
 * `@fudic/baseline/config` — what reading a `fudic.json` needs: the levels and the feature ids,
 * without the table of keys. The CLI reads a `fudic.json` on every command and judges nothing; the
 * table is for the detectors, which import the package itself.
 */

export { AS_OF, VERSION } from './data.generated.js';
export { cutoff, describeTarget, FIRST_YEAR, lastYear, widelyOn, type Target } from './level.js';
export { feature, type FeatureInfo, type Moved } from './features.js';
