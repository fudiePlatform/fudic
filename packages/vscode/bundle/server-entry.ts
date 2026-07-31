/**
 * The entry point of the bundled server (SDD-25 §4.5).
 *
 * It lives outside `src/` on purpose: `src/` is the extension, and it is measured at 100 %
 * coverage. This file is never loaded by the extension host — the client forks it as its
 * own Node process — so there is nothing here a unit test could meaningfully drive. It is
 * the same shape as the server's own `bin` shim, and for the same reason: no branches, so
 * there is nothing in it to get wrong.
 */

import { main } from '@fudic/language-server';

process.exitCode = main(process.argv.slice(2));
