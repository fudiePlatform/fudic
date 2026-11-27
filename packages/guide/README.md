# @fudic/guide

Fudic's style guide, the same one [fudic.dev](https://fudic.dev) uses: design tokens with a dark mode, one self-hosted font
(Inter Tight for headings and text, under the SIL Open Font License in
`fonts/OFL-InterTight.txt`; code uses the system's monospace), a favicon, and one stylesheet
per element the browser styles.

**The font is cut small.** `fonts/inter-tight-wght-400-600.woff2` is Inter Tight with
its weight axis limited to 400–600 and its characters to Latin-1 plus typographic
punctuation, about 23 KB. Made with fontTools from the upstream variable font:

```sh
fonttools varLib.instancer InterTight[wght].ttf wght=400:600 -o inst.ttf
pyftsubset inst.ttf --flavor=woff2 --no-hinting --desubroutinize \
  --layout-features=kern,liga,calt,ccmp,locl,mark,mkmk \
  --unicodes="U+0020-007E,U+00A0-00FF,U+2013-2014,U+2018-201E,U+2022,U+2026,U+2039-203A,U+20AC,U+2122,U+2190-2193,U+2212" \
  --output-file=inter-tight-wght-400-600.woff2
```

A weight outside 400–600 or a character outside that range needs the font made again, and
the `unicode-range` in `tokens.css` kept in step.

**The page gets all of it.** Every page of a project that depends on this package links
`guide.css` — tokens, the document's reset and every piece — pruned to what the page uses. No
`<link>` to write: the dependency is enough. `fudic new` adds it to every app it creates.

**A component gets the pieces it names.** A shadow root sees only what it adopts, so a
component lists the pieces it needs, named after their files:

```html
<template shadowrootmode="open" shadowrootadoptedstylesheets="button input">
```

The editor adds a piece when you write its element, and warns both ways — a piece missing for an
element, and a piece that styles nothing. It never removes one for you: a script may create what
it styles.

**Changing it.** This package does not change: to make the guide your own, `fudic g guide`
writes a copy of it into the project, and the project depends on that copy instead. In the copy,
the tokens are on `:root` in `tokens.css`, and every colour is
`light-dark(light, dark)`; a zone of a page forces a mode with `color-scheme: dark`. Pieces are
plain CSS, written with the tokens. Remove a piece by deleting its `@import`, and its file.
