// The typecheck of a build, in a process of its own (see `src/background-check.ts`).
//
// Plain JavaScript and outside `src` on purpose: it is started by path from `src/` under the
// tests and from `dist/` once published, and both sit one directory below this one. It
// imports nothing of this package, so it needs no compiling.
//
// The root arrives as the only argument; the report leaves through the IPC channel, and the
// channel is closed once it is sent so the process can end on its own.
import { createProjectChecker } from '@fudic/typecheck';

const report = createProjectChecker({ root: process.argv[2] }).check();
process.send(report, () => process.disconnect());
