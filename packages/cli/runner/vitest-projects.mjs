// Every project's unit tests in ONE vitest (see `src/run.ts`, `runChecks`).
//
// Plain JavaScript and outside `src`: it is started by path, with the workspace's own vitest,
// from `src/` under the tests and from `dist/` once published. One process instead of one per
// project — each vitest pays a second of start-up before its first test — and the projects
// share its workers.
//
// Arguments: the path of vitest's `dist/node.js`, the workspace root, then each project's dir.
import { pathToFileURL } from 'node:url';

const [vitestNode, root, ...projects] = process.argv.slice(2);
const { startVitest } = await import(pathToFileURL(vitestNode).href);
const vitest = await startVitest('test', [], { run: true, watch: false, root, projects });
const failed =
  vitest === undefined || vitest.state.getCountOfFailedTests() > 0 || vitest.state.getUnhandledErrors().length > 0;
await vitest?.close();
process.exit(failed ? 1 : 0);
