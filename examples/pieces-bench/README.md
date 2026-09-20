# Pieces bench

What every SDD-45 scenario actually downloads, in a browser, as requests — not as bytes
deduced from reading imports.

```sh
pnpm -r build                      # the publishing packages must have produced `runtime/`
node examples/pieces-bench/serve.mjs .
# http://localhost:4545          (PORT=4546 … when that one is taken)

node examples/pieces-bench/check.mjs .        # the three checks, in a terminal
node examples/pieces-bench/check.mjs . --json # the same, for something else to read
```

The first panel of the page is **the split**: the three checks of §6.5 — no module in two
pieces, no exported value without a piece, no piece below its frontier — plus the guard that
every import inside a piece resolves to a piece that exists. They run over the published files
and they are on this page, not only in a terminal, because whoever is looking at a waterfall
about to move a frontier is the person who has to see them.

`check.mjs` derives what it checks rather than reading a list: which modules are inside a piece
comes from building each package's own `rolldown.config.ts` with source maps, and which values
a package exports comes from its `dist/`, where the types are already erased. The exceptions —
`@fudic/transport` living inside the worker, the constants only the emit consumes — are written
at the top of that file, with their reason, which is where adding one is a deliberate act.

Each scenario has two buttons. **Tal cual** imports only the entry pieces and lets the browser
discover the rest by reading the code — what happens with no preload. **Con preload** names
every piece of the closure in the head first — what the page will do once the emit writes the
`modulepreload` links. The waterfall under each run is real resource timing.

Open the Network tab and throttle to Slow 3G. At local speed a discovery chain and a flat fan
of requests look the same, and the whole point is that they are not.

Every click uses a fresh URL prefix, so the module registry and the HTTP cache never answer a
second run — otherwise every measurement after the first is a lie.

This is the harness behind the browser milestones of phases 1, 3 and 5. It reads the published
pieces straight from each package's `runtime/` directory, so a rebuild shows up on reload.
