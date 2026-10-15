import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** A build of an app with two or more `locales` and no `site` in `fudic.json` (SDD-58). */
export const FUD1027 = (): ProjectDiagnostic =>
  project(
    'FUD1027',
    'error',
    'this app has two or more "locales" and no "site" in fudic.json: its canonical and hreflang ' +
      'links must be absolute URLs, and a prerendered page has no request to take the origin from. ' +
      'Add "site": "https://example.com", the origin the app is published at.',
  );
