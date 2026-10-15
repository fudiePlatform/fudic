# @fudic/i18n

Translations and formats for fudic. The text a page paints is translated at build time: every
module is compiled once per locale with its text already inside, so a page without JavaScript
stays without JavaScript, and the browser downloads only its own language.

## Declare the locales

```jsonc
// fudic.json
{ "kind": "app", "locales": ["es", "en"], "site": "https://example.com" }
```

The first locale is the language the code is written in. With two or more, every route is
served under its prefix (`/es/about`, `/en/about`), and `/` or a page asked without its prefix
(`/about`) redirects to the best match of `Accept-Language`. Links that start with `/` get the
prefix of the page they are on.

Every page carries its `canonical` and one `hreflang` link per locale, plus `x-default` on the
page without a prefix, all as absolute URLs. `site` is the origin they are written on; a build
in two or more locales requires it. `pnpm dev` uses the origin of each request instead.

## Extract and translate

Text nodes and the translatable attributes (`title`, `alt`, `placeholder`, `aria-label`…) are
messages with nothing to mark. Where the compiler cannot tell text from a value — a prop, a
`.ts` module — wrap it in `t()`:

```html
@code { import { t } from '@fudic/i18n'; }
<app-card .title=@t("Acerca de")></app-card>
```

```ts
import { t } from '@fudic/i18n';
const greeting = t('Hola {name}', { name: user.name });
```

Add the command to the app and run it:

```json
{ "scripts": { "translate": "fudic translate" } }
```

```sh
pnpm translate
```

It writes one folder per locale, with one file per component, route or module —
`src/locales/en/components/app-card.json` — so a team touching different components never meets
in a catalog. It reports what is missing.
Fill in `translation`; when a source text changes, its old translation stays with a `review`
field until you delete it. `pnpm dev`, `pnpm build` and `pnpm preview` only read the catalogs: a
missing translation shows the original text.

Messages use a subset of ICU: `{name}`, `{n, plural, one {…} other {…}}` (with `=N` and `#`) and
`{x, select, …}`. Inline elements appear as `<0>…</0>`; move them, do not rewrite them.

## Format with pipes

```html
@code {
  import { currency, date } from '@fudic/i18n';
  const euros = currency('EUR');
  const long = date({ dateStyle: 'long', timeZone: 'Europe/Madrid' });
}
<p>Total: @(price | euros), @(published | long)</p>
```

A pipe is a preset — `date`, `number`, `currency`, `percent`, `relativeTime`, `list` — over
`Intl`, and it is plain data. The locale is never written: the compiler adds the page's. In
code, `format(value, euros)` does the same, and `locale` reads the page's locale. `date`
requires a `timeZone`, so the server and the browser write the same time.
