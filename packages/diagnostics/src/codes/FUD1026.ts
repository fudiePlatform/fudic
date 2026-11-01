import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** `fudic translate` in an app with a single language (SDD-58, SDD-71). */
export const FUD1026 = (): ProjectDiagnostic =>
  project(
    'FUD1026',
    'error',
    'this app is in a single language: there is nothing to translate into. ' +
      'Add the others to "locales" in fudic.json, e.g. ["es", "en"], the first one being the language the code is written in.',
  );
