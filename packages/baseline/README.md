# `@fudic/baseline`

What [Baseline](https://web.dev/baseline) a fudic project asks for, and whether a piece of the web
platform passes it. No runtime dependencies, and no clock.

## A level is a date

A project names its level in `fudic.json` — `"widely"` (the default), `"newly"` or a year — and each
level is a cut-off date. A compat key passes when it reached every core browser (Chrome, Edge,
Firefox and Safari, desktop and mobile) on that date or before.

| Level | Cut-off |
|---|---|
| `2024` | 2024-12-31 |
| `"newly"` | the data's date |
| `"widely"` | the data's date minus 30 months |

The data's date is that of the newest browser release the data knows of (`AS_OF`). It travels with
fudic, so the same fudic gives the same answer today and a year from now; the data moves when fudic
releases a new version.

The judge looks at each compat key, not at the feature: the `popover` attribute reached every
browser before popover as a whole did, and the attribute is what an author writes.

## The API

```ts
import { cutoff, passes, status, feature, browsersFor } from '@fudic/baseline';

cutoff('widely');                                    // '2024-04-27' with web-features 3.45.0
passes('css.selectors.state', 'widely');             // false
passes('css.selectors.state', 'widely', new Set(['state']));   // true: allowed
status('css.properties.field-sizing')?.newly;        // '2026-06-16'
feature('masonry');                                  // { kind: 'moved', id: 'masonry', to: ['grid-lanes'] }
browsersFor('widely');                               // ['chrome124', 'edge124', 'firefox125', 'safari17.4', 'ios17.4']
```

A key the table does not have always passes: better silent than wrong. Every function that depends
on the data's date takes it as a last parameter, so a test can fix it.

`firstKnown`, `cssFunctionKeys`, `cssUnitKey` and `tagInterface` are what the detectors ask: they
turn what an author wrote into the compat key the data knows it by.

## The table

`src/data.generated.ts` is written from [`web-features`](https://www.npmjs.com/package/web-features)
and committed; the package is a development dependency only. After moving `web-features` to another
version:

```sh
pnpm --filter @fudic/baseline generate
```

It keeps the keys of `css`, `html`, `svg`, `mathml`, `api` and `javascript` — not `http`: a browser
ignores a header it does not know — with each repeated status written once, every feature's name and
redirects, the releases Vite's `build.target` needs, and three indexes: CSS functions by name, CSS
units (`scripts/units.ts`, by hand), and the DOM interface of each HTML tag.
