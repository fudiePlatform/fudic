# Pieces bench

What every SDD-45 scenario actually downloads, in a browser, as requests — not as bytes
deduced from reading imports.

```sh
pnpm -r build                      # the publishing packages must have produced `runtime/`
node examples/pieces-bench/serve.mjs .
# http://localhost:4545
```

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
