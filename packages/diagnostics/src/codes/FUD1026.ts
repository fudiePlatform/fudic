import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** `fudic translate` in an app whose `fudic.json` declares no `locales` (SDD-58). */
export const FUD1026 = (): ProjectDiagnostic =>
  project(
    'FUD1026',
    'error',
    'this app has no "locales" in fudic.json: there is nothing to translate into. ' +
      'Add "locales": ["es", "en"], the first one being the language the code is written in.',
  );
