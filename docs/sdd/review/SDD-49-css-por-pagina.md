# SDD-49 — Revisión en navegador: el CSS que recibe cada página

> Para comprobar a mano, página a página, que lo que llega es lo que la página necesita.
> Sacado del build de `examples/basic` (`pnpm build`, `dist/`).

**Común** = lo que toda página de `_layout` recibe de `base.css`: el reset (`*`, `html`,
`body`), `p`, `h1`, `code`, `main`, `footer.site`, `::placeholder` y los tres `@media`
(móvil, movimiento reducido, impresión).

| Ruta | Layout | `base.css` (inline) | `tokens.css` | `theme` | `panel` |
|---|---|---|---|---|---|
| `/` | `_layout` | común + `section + section` | fichero | `:host` | — |
| `/about` | `_layout` | común + `ul`, `li` | fichero | `:host` | — |
| `/delegacion` | `_layout` | común + `h2`, `strong`, `em`, `ol`, `li`, `button` | fichero | `:host` + `button` | `.panel` |
| `/di` | `_layout` | común + `h2`, `strong` | fichero | `:host` + `button` | `.panel` `.row` |
| `/formularios` | `_layout` | común + `h2`, `strong`, `em` | fichero | `:host` + `button` | `.panel` |
| `/hidratacion` | `_layout` | común + `h2`, `strong`, `em`, `details`, `summary` | fichero | `:host` + `button` | `.panel` |
| `/mapas` | `_layout` | común + `h2`, `strong`, `em` | fichero | `:host` + `button` | `.panel` |
| `/reactividad` | `_layout` | común + `h2`, `strong` | fichero | `:host` + `button` | entera |
| `/ruta-evento` | `_layout` | común + `h2`, `strong`, `em`, `a`, `button` | fichero | `:host` + `button` | — |
| `/ruta-reactiva` | `_layout` | común + `h2`, `strong`, `a`, `ul`, `li`, `button` | fichero | `:host` + `button` | `.panel` `.row` |
| `/ruta-reloj` | `_layout` | común + `h2`, `strong` | fichero | `:host` | — |
| `/signal-prop` | `_layout` | común + `h2`, `strong`, `a` | fichero | `:host` + `button` | `.panel` `.row` |
| `/snippets` | `_layout` | común + `h2`, `h3`, `small`, `form`, `label`, `input` (foco, inválido, deshabilitado), `article`, `@keyframes shake` | fichero | `:host` | — |
| `/value-prop` | `_layout` | común + `h2`, `strong`, `em`, `a` | fichero | `:host` + `button` | `.panel` `.row` |
| `/blog/*` (3 artículos) | `_layout-articulo` | — (no la enlaza) | fichero | `:host` | — |
| `/marco`, `/marco-sin-lateral` | `_layout-marco` | — (no la enlaza) | fichero | `:host` + `button` | `.panel` |
| `/vivo` | `_layout-inline` | — (no la enlaza) | inline, entera | `:host` + `button` | `.panel` |

- `tokens.css` llega siempre entera: solo tiene `:root`.
- `theme` y `panel` son las hojas de `fudic.json`; la columna dice qué reglas de cada una se
  quedan. `—` es que ningún componente de la página la adopta.
- `/blog` y `/sesion/[user]` usan `_layout` pero no se prerenderizan: se comprueban en
  `pnpm dev`.
- En `/formularios` no llegan las reglas de formularios de `base.css`, y es correcto: los
  `input` viven dentro de componentes, y el CSS del documento no entra en un shadow root.
- Los `<style>` que escriben las rutas en su `<head>` (`delegacion`, `hidratacion`,
  `ruta-evento`, `ruta-reactiva`, `ruta-reloj`) no se podan: salen enteros, compactados y
  con nonce.
