# `@fudic/resolve`

Where an `href` written in a `.fud` points.

```html
<link rel="component" href="./app-card.fud">          <!-- a path -->
<link rel="component" href="../../libs/ui/card.fud">  <!-- a path, across packages -->
<link rel="component" href="@acme/ui/card.fud">       <!-- a package -->
```

A path resolves against the file. A bare specifier resolves as an `import` would, `exports`
included, so the answer agrees with what Node, the bundler and the editor each already
believe.

## Why a package

The Vite plugin, the CLI and the language server all ask this question. Three copies of a
module-resolution algorithm is three answers the day one of them falls behind, and an editor
and a build that disagree about which file a tag is cost a day to find.

## Use

```ts
import { nodeResolveFs, resolveHref, resolveHrefPath } from '@fudic/resolve';

const io = nodeResolveFs();

// The file, for a caller that only wants the file. This is what a host's
// `ResolveIo.resolve` is built on: it returns a string, always.
const path = resolveHrefPath(fromPath, href, io);

// The whole answer, for a caller that has to explain a failure.
const resolution = resolveHref(fromPath, href, io);
switch (resolution.outcome) {
  case 'path':
  case 'package':
    resolution.path;            // absolute
    break;
  case 'external':
    resolution.href;            // a URL: not ours to resolve
    break;
  case 'unresolved':
    resolution.reason;          // 'not-installed' | 'not-exported'
    break;
}
```

A resolved package comes with what the package turns out to be:

```ts
if (resolution.outcome === 'package') {
  resolution.target.name;       // '@acme/ui'
  resolution.target.root;       // the directory holding its package.json
  resolution.target.config;     // its fudic.json, or null
}
```

## What it does not do

It does not throw. A specifier that does not resolve is an outcome with a reason, and the
two reasons are kept apart because they are two different fixes: an install, or the
library's `package.json`.

It does not read `.fud` files, walk the component graph or emit diagnostics. It answers one
question, and the host decides what to say about the answer.

The filesystem is injected (`ResolveFs`), so every rule above is testable without a disk;
`nodeResolveFs()` is the real one.
