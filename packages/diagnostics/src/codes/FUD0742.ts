import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** The project declares stylesheets and defines no component to adopt them (SDD-42). */
export const FUD0742 = (): ProjectDiagnostic =>
  project(
    'FUD0742',
    'warning',
    'fudic.json declares stylesheets and this project defines no component: ' +
      'a project sheet is adopted into the shadow roots of its own components, and there are none. ' +
      'A stylesheet meant for the document goes in a <link rel="stylesheet"> in the layout.',
  );
