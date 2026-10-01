# SDD-49 — Medición en `examples/basic`

> Criterio 40 de [SDD-49](./SDD-49-css-por-pagina.md), segunda redacción. Build de
> `examples/basic` en la rama `worktree-sdd-49-css-por-pagina`. Bytes del CSS **compactado**
> (`compactProjectCss`), que es lo que viaja.

## La guía

`src/styles/main.css` importa once ficheros: `reset`, `tokens/color` (91 colores de paleta, 18
nombres de uso y su modo oscuro), `tokens/space` (20 huecos), `typography`, `lists`, `tables`,
`forms`, `buttons`, `blocks`, `utilities` y `motion`. `_layout.fud` la enlaza con `?inline`, y
`tokens.css` —los tokens que leen los componentes— sigue enlazado como fichero.

| | Bytes | Tokens |
|---|---|---|
| `main.css` aplanado entero (lo que llegaría sin poda) | 9 547 | 133 |
| `tokens.css` entero | 209 | 10 |

## Por página

`main.css` va dentro del HTML; `tokens.css` es un fichero, y su columna es el tamaño de la copia
podada que enlaza la página. `—`: la página usa otro layout, que no enlaza `main.css`.

| Página | `main.css` (bytes) | Tokens de `main.css` que llegan | `tokens.css` (bytes) |
|---|---|---|---|
| `/` | 1 986 | 23 de 133 | 128 |
| `/about` | 2 033 | 22 | 55 |
| `/delegacion` | 2 714 | 25 | 153 |
| `/di` | 1 991 | 23 | 183 |
| `/formularios` | 1 967 | 21 | 193 |
| `/hidratacion` | 2 184 | 22 | 167 |
| `/mapas` | 1 967 | 21 | 153 |
| `/reactividad` | 1 945 | 21 | 167 |
| `/ruta-evento` | 2 751 | 23 | 153 |
| `/ruta-reactiva` | 2 894 | 25 | 167 |
| `/ruta-reloj` | 1 945 | 21 | 112 |
| `/signal-prop` | 2 196 | 23 | 183 |
| `/snippets` | 2 558 | 23 | 55 |
| `/value-prop` | 2 218 | 23 | 183 |
| `/blog/*` (3) | — | — | 23 |
| `/marco`, `/marco-sin-lateral` | — | — | 167 |
| `/vivo` | — | — | — |

Cada página recibe entre el 20 % y el 30 % de la guía. Lo que más pesa de lo que se queda fuera
son los tokens: de 133 llegan entre 21 y 25. `/formularios` no recibe nada de `forms.css`,
porque todos sus campos viven dentro de componentes y el CSS del documento no los alcanza.

## Lo que se publica

| Hoja | Copias distintas publicadas |
|---|---|
| `main.css` | 0 ficheros — va `?inline`; 13 contenidos distintos entre 20 páginas |
| `tokens.css` | 8 — una por contenido podado; las páginas que usan los mismos tokens comparten fichero |
| `theme.css`, `panel.css` | 0 — van como `<style type="module" specifier>` dentro de cada página |

El build emite un `FUD0852`: `guide/tables.css` no aporta ninguna regla a ninguna página — el
ejemplo no tiene una sola tabla en su light DOM —, así que su `@import` sobra.
