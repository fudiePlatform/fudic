// The typecheck of `vite dev`, in a process of its own (see `src/live-checker.ts`).
//
// Plain JavaScript and outside `src` for the reason `check.mjs` is: started by path from `src/`
// under the tests and from `dist/` once published. It lives as long as the dev server and keeps
// its checker, so a re-check only redoes what changed.
//
// The root arrives as the only argument. Messages in: `{ type: 'invalidate', path }` and
// `{ type: 'check', id }`; out: `{ id, report }`, in the order the checks were asked.
import { createProjectChecker } from '@fudic/typecheck';

const checker = createProjectChecker({ root: process.argv[2] });

process.on('message', (message) => {
  if (message.type === 'invalidate') checker.invalidate(message.path);
  else if (message.type === 'check') process.send({ id: message.id, report: checker.check() });
});
// The server went away: nothing is left to check for.
process.on('disconnect', () => process.exit(0));
