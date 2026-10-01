# @fudic/typecheck

The one machine that typechecks `.fud` files.

It holds the projection recipe (parse → JS batch → virtual TypeScript), the Volar language
plugin for `.fud`, and the fudic rules the editor reports. Two clients use it:

- `@fudic/language-server` shows the errors while you type.
- `@fudic/vite` refuses to build, and `vite dev` shows the overlay, while there is one.

Because both import the same code, what the editor marks is what the build fails on.

```ts
import { createProjectChecker, formatProblem } from '@fudic/typecheck';

const checker = createProjectChecker({ root: process.cwd() });
const report = checker.check();
```
