import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** A project with a `sw.json` whose `fudic.json` declares no `id`; was `FUD0721` (SDD-41). */
export const FUD0726 = (p: FileInput): FileDiagnostic =>
  file(
    'FUD0726',
    'error',
    `sw.json is present, so fudic.json must declare an "id": it is what namespaces this application's caches, and without it two apps on one origin wipe each other's`,
    p,
  );
