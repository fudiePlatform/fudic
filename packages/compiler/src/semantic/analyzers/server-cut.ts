/**
 * `server-cut` (SDD-61 §3.9, decision 164): what the view reads of the `@code`, transitively and
 * into the project's stores, is what the server evaluates to paint, in whatever backend paints.
 * A declaration of a form no backend can evaluate is `FUD1150`; a node of its initializer off the
 * white list gets the markup's own code; `now()` outside a `signal(…)` of the `@code`, `FUD0912`.

 */

import type { Analyzer } from '../model.js';
import { serverCutDiagnostics } from '../server-cut.js';

export const serverCut: Analyzer = {
  name: 'server-cut',
  run(input, report) {
    serverCutDiagnostics(input).forEach(report);
  },
};
