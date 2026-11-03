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

The main entry loads TypeScript. To read, sort or print a report without paying for that, use
the light entry:

```ts
import { formatProblem, hasErrors, toPosix } from '@fudic/typecheck/problems';
```

## What a component declares

`@fudic/typecheck/contract` reads a component's contract: its doc, its props (type, default,
doc), its named slots and whether it has a default one, the events it emits (doc, and the type
of their detail with a checker), its CSS parts and the custom properties its `<style>` reads.
The editor's hover and any other tool read the same answer.

```ts
import { contractOf, typedContract } from '@fudic/typecheck/contract';

const contract = contractOf(source, document); // from the parse, no TypeScript
const typed = typedContract(contract, languageService, file, toGenerated); // adds types
```

`toGenerated` maps an offset of the `.fud` to its client projection; without it the contract
has no event details.

## Style tokens

`@fudic/typecheck/tokens` lists the tokens a project sees: every custom property declared in a
`:host` or `:root` rule (also inside `@layer`) of a sheet in `globalStyles` or `styles`, of the
project and of the fudic libraries it depends on. Libraries come first, in dependency order;
in each package, global styles before optional ones. Document a token the way you document a
prop:

```css
:host {
  /** Main action background. */
  --acme-color-primary: oklch(55% 0.2 260);
}
```

```ts
import { projectTokens } from '@fudic/typecheck/tokens';

const { tokens, diagnostics } = projectTokens('/path/to/app');
// tokens[0] → { name, value, group, doc, from, style, path, span }
```

A sheet that cannot be read or parsed gives a diagnostic and the other sheets still count.
