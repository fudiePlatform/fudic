# SDD-49 — Medición en `examples/basic`

> Criterio 25 de [SDD-49](./SDD-49-css-por-pagina.md). Build de `examples/basic` en la rama
> `worktree-sdd-49-css-por-pagina`. Bytes del CSS **compactado** (`compactProjectCss`), que es
> lo que viajaba antes de este SDD y lo que viaja ahora.

## Las hojas enteras (antes)

| Hoja | Cómo llega | Ámbito | Bytes enteros |
|---|---|---|---|
| `base.css` | `_layout.fud`, `?inline` | documento | 5 920 |
| `tokens.css` | `_layout.fud`, fichero | documento | 209 |
| `theme.css` | `globalStyles` | shadow | 167 |
| `panel.css` | `styles` | shadow | 227 |

Antes, toda página del layout principal recibía las cuatro enteras: 6 523 bytes, de los que
5 920 iban dentro del HTML.

## Por página (después)

`—` es que la hoja no llega a esa página: el layout no la enlaza, o ningún componente de la
página la adopta.

| Página | `base.css` | `tokens.css` | `theme.css` | `panel.css` |
|---|---|---|---|---|
| `/` | 1 202 | 209 | 21 | — |
| `/about` | 1 263 | 209 | 21 | — |
| `/delegacion` | 1 766 | 209 | 167 | 118 |
| `/di` | 1 218 | 209 | 167 | 171 |
| `/formularios` | 1 240 | 209 | 167 | 118 |
| `/hidratacion` | 1 415 | 209 | 167 | 118 |
| `/mapas` | 1 240 | 209 | 167 | 118 |
| `/reactividad` | 1 218 | 209 | 167 | 227 |
| `/ruta-evento` | 1 872 | 209 | 167 | — |
| `/ruta-reactiva` | 1 946 | 209 | 167 | 171 |
| `/ruta-reloj` | 1 218 | 209 | 21 | — |
| `/signal-prop` | 1 423 | 209 | 167 | 171 |
| `/snippets` | 1 754 | 209 | 21 | — |
| `/value-prop` | 1 445 | 209 | 167 | 171 |
| `/blog/*` (3) | — | 209 | 21 | — |
| `/marco`, `/marco-sin-lateral` | — | 209 | 167 | 118 |
| `/vivo` | — | — (inline, 209) | 167 | 118 |

`/blog/*`, `/marco*` y `/vivo` usan otros layouts, que no enlazan `base.css`.

## Lo que se publica

| Hoja | Copias distintas publicadas |
|---|---|
| `tokens.css` | 1 — solo tiene `:root`, que siempre se queda, así que la copia de todas las páginas es la misma y conserva el nombre de antes |
| `base.css` | 0 — va `?inline`, dentro de cada página |
| `theme.css`, `panel.css` | 0 — van como `<style type="module" specifier>` dentro de cada página |

Ninguna hoja queda vacía en todas las páginas: el build no emite `FUD0852`.
