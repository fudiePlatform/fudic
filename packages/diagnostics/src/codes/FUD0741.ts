import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD0741`. */
export type FUD0741Params = FileInput &
  (
    | {
        /**
         * One `fudic.json` declares the name both in `globalStyles` and in `styles`; `file` is
         * that `fudic.json`.
         */
        readonly where: 'project';
        /** The sheet name declared twice. */
        readonly name: string;
      }
    | {
        /**
         * Two packages of one dependency chain declare it; `file` is the second package (its
         * name, or its directory when it has none), the one the author has to go and talk to.
         */
        readonly where: 'chain';
        /** The sheet name both declare. */
        readonly name: string;
        /** The package that claimed the name first. */
        readonly first: string;
      }
  );

/** Two stylesheets under one name (SDD-42, SDD-43). */
export const FUD0741 = (p: FUD0741Params): FileDiagnostic =>
  file(
    'FUD0741',
    'error',
    p.where === 'project'
      ? `${p.file}: "${p.name}" is both in "globalStyles" and in "styles". A name is ` +
          'one sheet in the module map — rename one.'
      : `"${p.first}" and "${p.file}" both declare a stylesheet named "${p.name}". Two sheets ` +
          'under one name cannot be told apart in the module map, and one would silently ' +
          'replace the other — rename one of the two.',
    p,
  );
