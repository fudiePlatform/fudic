// The typecheck of a build, on its own thread (see `src/background-check.ts`).
//
// Plain JavaScript and outside `src` on purpose: it is loaded by URL from `src/` under the
// tests and from `dist/` once published, and both sit one directory below this one. It
// imports nothing of this package, so it needs no compiling.
import { parentPort, workerData } from 'node:worker_threads';
import { createProjectChecker } from '@fudic/typecheck';

parentPort.postMessage(createProjectChecker({ root: workerData.root }).check());
