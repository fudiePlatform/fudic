import { project } from '../make.js';
import type { ProjectDiagnostic } from '../types.js';

/** No `tsconfig.json`: the typecheck ran with the editor's inferred options (SDD-35). */
export const FUD0870 = (): ProjectDiagnostic =>
  project(
    'FUD0870',
    'warning',
    "no tsconfig.json found: the typecheck used the editor's default options, which may not be what this project wants",
  );
