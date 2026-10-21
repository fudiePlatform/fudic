# Contract AST experiment

How far the Oxc AST reaches when reading the TS server contracts of IDEA-05
(`docs/sdd/ideas/IDEA-05-contrato-ts-y-backend-generado.md`). Not about generating C#, Java, Go
or Rust: about whether everything a generator needs can be read off the AST, and where it
cannot.

Outside the pnpm workspace on purpose, and it touches nothing of fudic.

```sh
pnpm install --ignore-workspace
pnpm check        # every simulation must be valid TS
pnpm ast          # all simulations → output/
pnpm ast 07       # only the ones starting with 07
```

## What the process does

For each `sims/NN-name/`, it finds the `<link rel="server" href="…">` of every `.fud`, parses the
contract with Oxc (once per file), follows its imports, and writes to `output/NN-name/`:

- `ast/<file>.json`: what Oxc gives, untouched.
- `model.json`: the normalised contract (functions, verbs, params, results, middlewares, types,
  forms). What a backend generator would read.
- `report.md`: the same for a human, with every issue (`error`: cannot be generated as written;
  `note`: can, with a decision).

`output/SUMMARY.md` puts all of them in one table, with the issues counted by code.

The process lives in `src/`: `scope.ts` resolves names across files (the piece Oxc does not
bring), `types.ts` reads types under the subset, `values.ts` reads middlewares and forms,
`contract.ts` reads the interface.

## Writing a simulation

Copy `sims/01-usuarios/` as the model. Rules:

1. Folder `sims/NN-name/`, `NN` from 02 to 25. Inside, the layout of a fudic app: `routes/`,
   `components/`, `middlewares/`.
2. Each `.fud` that has a server carries `<link rel="server" href="./x.server.ts">`. The rest of
   the `.fud` is not read; a few lines of view are enough.
3. **One file per `server.ts`, with everything in it**: the interface first, then the types it
   sends and receives and the forms it takes. Whoever opens it sees at a glance how each
   function is called, what it receives and what it returns. Only middlewares live apart
   (`middlewares/`), because several `server.ts` share them. Cases that split types into other
   files (07, 23, 24) exist to test the resolver, not as the style to follow.
4. The contract is the file's **`export default interface`**. Each member is
   `name: Verb<(args) => Result, [typeof mw, …], { options }>` with `Get`, `Post`, `Put`,
   `Patch`, `Delete` from `@fudic/contract`, or `load: Load<() => Data, { strategy: … }>` (also
   the method `load(): Data`). A parameter `typeof someForm` passes a whole form.
5. Widths (`u8`…`f64`) and the verb markers come from `@fudic/contract`, the only stub
   (`fudic/contract.ts`): it does not exist in fudic yet. Everything else is the real thing,
   read from `packages/*/src` through `tsconfig.json` paths: `@fudic/forms`, `@fudic/http`,
   `@fudic/core`… The `.fud` files are copies of real ones from `examples/basic` with their
   `@server` replaced by the link: write views and forms the way `examples/basic` does, never
   invented ones.
6. **Every simulation passes `pnpm check`.** Breaking the subset on purpose is fine (generics,
   `Omit`, `number`…): it is still valid TS.
7. **Each simulation has an `EXPECTED.md`**: what it exercises and the issues it should produce.
   If `report.md` does not match, write the difference at the end of `EXPECTED.md` under
   `## Mismatch`. Do not touch `src/`: a mismatch is a finding.

## The 24 to write

Realistic apps, and cases aimed at the edges of the AST and the resolver:

| # | Theme | What it pushes |
|---|---|---|
| 02 | Blog | Route with params (`blog/[slug]`), `Date`, literal unions as tags |
| 03 | Shop cart | Component contract, nested DTOs, `Record<string, T>`, `f64` prices |
| 04 | Login | Form with `minLength`/`maxLength`, several middlewares in a row |
| 05 | Dashboard | Many GETs, arrays of arrays, nullable fields |
| 06 | Invoices | Form with `group` and `arr`, dates |
| 07 | Barrels (resolver test) | Types split out: `export *`, `export { X as Y } from`, `index.ts` re-exports |
| 08 | Inheritance | Interfaces extending several others, in chains |
| 09 | Comment tree | Self reference and mutual recursion between types |
| 10 | Aliases | Chains of `type` aliases, literal unions as enums |
| 11 | Generics | Generic types in the contract (expected errors) |
| 12 | Utility types | `Omit`, `Pick`, `Partial` (expected errors) |
| 13 | Bare numbers | `number` everywhere (expected errors) |
| 14 | Discriminated unions | Unions of objects (expected errors; the key question for the subset) |
| 15 | Optionals | Optional params and fields, `null` vs `undefined` |
| 16 | Wrappers | `Promise`, `void`, `Readonly<>`, `ReadonlyArray<>` |
| 17 | Middlewares | Shared function (error), server half in TS (note), `Adds` with imported types, via barrel |
| 18 | Several components | One page, several component contracts |
| 19 | Every control | `u8`…`f64`, `date`, `arr` of each, custom validator (error), non-literal initial (error) |
| 20 | Nested groups | `group` two levels deep |
| 21 | Forms and verbs | Form to `Post`/`Patch`, form on `Get` (error) |
| 22 | Wrong shapes | Method without verb, `load` in a component, `Load` under another name (errors) |
| 23 | External types | Types from an npm package (expected `unresolved`) |
| 24 | Namespaces | `import * as T`, qualified `T.Person` (expected errors: reach of the resolver) |
| 25 | Big app | Five routes and three components, each `server.ts` self-contained: scale |
