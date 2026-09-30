# SDD-49 — Tareas

> **SDD:** [SDD-49 — El CSS que cada página usa](./SDD-49-css-por-pagina.md)
> **Paquetes:** `@fudic/compiler` · `@fudic/vite` · `@fudic/example-basic`
> **Rama:** `worktree-sdd-49-css-por-pagina`
> **Progreso:** 16 / 18 — código hecho; faltan los tests (ver **Tests pendientes**), el OK de
> Pedro en navegador (tarea 17) y el cierre (tarea 18).

## Tests pendientes (para otra sesión)

La implementación se hizo sin tests por decisión de Pedro: los escribe otra sesión, en este
mismo worktree y rama. Todo lo de abajo está en el código; solo falta probarlo.

### 0. Antes de empezar

- `pnpm install` y `pnpm build` en el worktree (sin los `dist` no compila ni el typecheck).
- **Medir el suelo en `main`** de `@fudic/compiler` y `@fudic/vite` (`pnpm --filter <pkg>
  coverage`, las cuatro cifras) sobre un checkout de `main`: no se midió antes de empezar. Al
  cerrar, ningún fichero existente puede quedar por debajo de ese suelo.
- Hoy fallan 6 tests existentes, todos por cambio de comportamiento pedido (apartado 7).

### 1. `packages/compiler/test/css/rules.test.ts` — criterios 1–2 (`src/css/rules.ts`, 100 %)

- Reglas de estilo, `at-block` con hijos (`@media`, `@supports`, `@container`, `@layer x {}`,
  `@scope`, `@starting-style`) y sin hijos (`@font-face`, `@keyframes`, `@page`, desconocida),
  `at-statement` (`@import`, `@layer a, b;`, `@charset`, `@namespace`), sentencia al final sin
  `;`, sentencia dentro de un bloque cerrada por `}`.
- Anidamiento: declaraciones y reglas hijas separadas; `@media` dentro de una regla; `&`.
- Spans: `css.slice(span)` de cada regla, preludio, cuerpo y declaración recorta el texto exacto.
- Texto que no es regla (`;` sueltos, `}` sobrante en la raíz, declaración en la raíz): se salta.
- Escapes `\` en selectores, strings con `{` dentro, comentarios con `{` dentro, paréntesis.
- `FUD0851` (warning), sin lanzar, con lo leído hasta ahí: `{` sin cerrar (span en la `{`, en
  regla, en `@media` y en `@font-face`), string sin cerrar, comentario sin cerrar.

### 2. `packages/compiler/test/css/selectors.test.ts` — criterio 3 (`src/css/selectors.ts`, 100 %)

- Listas, compuestos, los cuatro combinadores, descendiente por espacio; tipo en minúsculas;
  `*` y `&` sin tipo; clases, ids, atributos sin valor, con cada operador (`=`, `~=`, `|=`,
  `^=`, `$=`, `*=`), valor string e ident, flag `s` (conserva valor) e `i` (solo nombre).
- `:is()`, `:where()`, `:matches()` → `anyOf`; `:not()`, `:has()`, `:hover`, `:nth-child()`
  → `pseudo`; `::slotted(x)` → `slotted`; `::part(a b)` → `part`; `:host(.x)` → `pseudo`.
- Escapes de ident (`.md\:flex` → `md:flex`, hexadecimal), comentarios dentro del preludio.
- Selector relativo `> li` (combinador inicial descartado).
- `null`: `50%`, `a,,b`, lista con coma final, namespace `ns|a` y `*|a`, `[*|x]`, `||`,
  `::slotted()` vacío o con dos selectores, `::part()` vacío, `:is(50%)`, string o comentario
  sin cerrar, operador de atributo inválido, flag distinto de `i`/`s`.
- `splitSelectorList`: textos originales; `null` con string sin cerrar.

### 3. `packages/compiler/test/emit/surface.test.ts` — criterios 4–7 (`src/emit/surface.ts`, 100 %)

- `documentSurface` de ruta + layout: `html`, `body`, atributos de `<html>`/`<body>`, body del
  layout, markup de la ruta, secciones, hosts y contenido proyectado; **no** un `h1` que solo
  está en el template de un componente. Página sin layout (`page-document`). Entrada componente
  (solo `html`/`body`). Hueco con `slot` (SDD-48): las raíces de la ruta llevan `slot`.
- `shadowSurface`: template, snippets expandidos, las dos ramas de un `@if` falso en SSR,
  `@switch`, `@foreach`, host de un componente anidado; `slotted` = hijos directos de cada
  `<tag>` en cualquier ámbito de la página (a través de `@if`); `parts` literal y `'any'`.
- Criterio 6: `class:activo=@x` aporta `activo`; `class="a @b"` aporta `a` y `openClasses`;
  `id=@x` → `openIds`; `type=@t` → valores `null`; `.prop`, `@click`, `bus:` no cuentan;
  `style:x=@y` → atributo `style` con `null`.
- Criterio 7: `frameworkAttributesOf` de un control con `control` (+ `novalidate` en `<form>`),
  campo sin `control`, marcador `error`/`summary`, custom element, `sealed`. **Un test que
  recorre `packages/forms/src`** buscando `setAttribute`/`toggleAttribute` y comprueba que cada
  atributo está en la lista.
- `unionSurfaces`: conjuntos, `null` gana en atributos, `openX` en OR, `slotted` unido o `null`,
  `parts` `'any'` si alguno lo es.

### 4. `packages/compiler/test/emit/prune.test.ts` — criterios 8–16 (`src/emit/prune.ts`, 100 %)

- 8: `h1, h2, h3 {}` → `h1{…}`; `table` fuera; `:root{--x:1}` se queda.
- 9: `ul > li` con `ul` y `li` sueltos. 10: `.btn:hover`, `a:not(.x)`, `li:nth-child(2n)`.
- 11: shadow `:host`, `:host(.x)` siempre; `:root`/`html`/`body` nunca; `::slotted(p)` según
  `slotted` (y `null`); documento `::part(label)` según `parts` (y `'any'`); `:host` en
  documento se va.
- Atributos con cada operador contra valores literales, contra `null`, y valor vacío en
  `^=`/`$=`/`*=`. `openClasses`/`openIds`. `:is()` con un argumento que casa y ninguno.
- 12: `@media` vacío tras podar se va; `@layer a, b;`, `@charset`, `@property`, `@page`,
  desconocida se quedan; `@media` dentro de una regla se queda con su padre.
- 13: `@keyframes` y `@font-face` (con comillas y sin ellas, sin `font-family`) se quedan si
  otra hoja **de la misma página** los nombra, y se van si no; una hoja `reference` cuenta como
  nombre pero no sale en la salida ni da diagnósticos; una hoja ilegible cuenta entera.
- 14: regla anidada con `&` se va con su padre y se poda sola si su padre queda.
- 15: `@import` → `FUD0850`; hoja ilegible → entera + `FUD0851`; `sheetDiagnostics` directo.
- 16: superficie total → idéntica a `compactProjectCss` de la entrada. Hoja con solo
  `@charset`/`@layer` tras podar → `''`. Preludio que `parseSelectorList` no entiende → entera.

### 5. `packages/compiler/test/emit/page-sheets.test.ts` — criterios 17–20 (`src/emit/page-sheets.ts`, 100 %)

- 17: layout con `<link rel="stylesheet" href="./base.css" media="screen">` y otro `?inline`:
  el layout escribe `route.sheet("0:0")` y `route.sheet("0:1")`; la ruta entrega `<link>` con
  la URL de `AssetSheet` conservando `media`, y `<style' + $nonce + '>` con el CSS podado.
- 18: dos rutas con el mismo layout y markup distinto → CSS distinto para la misma clave.
- 19 (**corregido**, ver §4.5 de la spec): una `styles` que ningún componente adopta sale de
  `PROJECT_STYLES`; una adoptada que queda vacía se queda con `css: ''`; `data-fud-adopt` y
  `shadowrootadoptedstylesheets` no cambian.
- 20: sin `pruneStyles` todos los fixtures y goldens actuales pasan igual (ya lo hacen).
- Además: sin `AssetSheet` el `<link>` conserva la URL del fichero entero; hoja vacía → `''`;
  el `<link>` propio del `<head>` de la ruta y el de una página sin layout; `rebaseSpec` con
  rutas Windows (`\`) y POSIX, misma carpeta, subir y bajar, con `?query`; `EmitOutput.sheets`
  con `spec` y `specifier`; `<link>` no podable (URL absoluta, `/public`, interpolado,
  ilegible) se escribe como antes; `<style>` del `<head>` y de un componente como referencia.

### 6. `packages/vite/test/` — criterios 21–24

- `prune-build.test.ts`: dos páginas con la misma hoja podada → mismo fichero; una tercera →
  otro; host, pase SW y edge escriben la misma URL; el fichero se publica una vez; las copias
  están en el shell del manifiesto/SW (22); `FUD0852` para una hoja sin reglas en ninguna
  página, sobre la entrada de `fudic.json` y sobre el `<link>` (24); `FUD0850`/`FUD0851` una
  sola vez por hoja aunque la enlacen varias páginas.
- `dev-sheets.test.ts` (23): en `vite dev` el `<link>` apunta a `/@fudic/sheet/…` y el
  middleware sirve ese CSS; tras editar la hoja, la siguiente navegación trae la poda nueva.
- `LinkedAssets.sheet`, `recordSheet`, `unusedSheets`, `sheetDiagnostics`, `assetSheetFrom`.

### 7. Tests existentes que cambian de expectativa (hoy en rojo)

- `packages/vite/test/build-styles-missing.test.ts`: «FUD0743 … the sheet ships whole» (`:root`
  dentro de un shadow ya no llega) y «hoists a chosen sheet only where some component chooses
  it» (`.panel` no casa con el template de `s-pick`: hay que darle `class="panel"`).
- `packages/vite/test/lib-extras-probe.test.ts`: «publishes a stylesheet its layout links»
  (`.lib` no casa con nada de la página; o se usa `.lib` en el markup, o se espera que no se
  publique).
- `packages/vite/test/dev-linked-asset.test.ts`: en dev la copia podada vive en
  `/@fudic/sheet/…` (§4.8), no en `/assets/…`.
- `packages/compiler/test/css/css.test.ts`: «does not count braces inside a Razor comment» y
  «reports FUD0011 when it is never closed»: un `@* … *@` dentro de `<style>` es ahora
  `FUD0132` (error), por decisión de Pedro.

### 8. Cambios hechos durante la revisión, también sin test

- `FUD0132` (`src/css/css.ts`): comentario Razor dentro de `<style>` es error, con el span del
  comentario entero, cerrado y sin cerrar (este último da también `FUD0011`).
- `<style>` escrito en el `<head>` de ruta, página y layout (`headStyleExpr` en
  `src/emit/parts.ts`): sale compactado, con `$nonce` y los atributos del autor (`media`); el
  layout que lo tiene declara `$nonce` (`headEmbedsAsset`).
- Evidencia: `examples/basic` y `build:nosw` compilan; ningún `<style>` sin nonce en `dist`.

El orden va de abajo arriba: primero leer CSS, después saber qué hay en cada ámbito, después
decidir qué se queda, y solo entonces tocar el emit, que es donde un error se vuelve visible.
Los tests van con cada fase y no al final: la poda es conservadora por diseño, y cada caso de
§4.3 que se escriba sin su test es una regla que puede empezar a quitar de más sin que nadie lo
note.

---

## Fase 1 — leer CSS (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **El árbol de reglas.** `parseCssRules`: reglas de estilo, at-rules de bloque (con hijos o con declaraciones), sentencias, anidamiento; spans en todo; nunca lanza (`FUD0851` en el punto donde se pierde). Criterios 1–2 | `compiler` | `src/css/rules.ts` · `src/css/index.ts` · `test/css/rules.test.ts` |
| [x] | 2 | — | **Los selectores.** `parseSelectorList`: listas, compuestos, combinadores, atributos con operador, `:is()`/`:where()`/`:matches()`, `::slotted()`, `::part()`; `null` para lo que no entiende. Criterio 3 | `compiler` | `src/css/selectors.ts` · `test/css/selectors.test.ts` |
| [x] | 3 | 1, 2 | **El índice.** `parseCssRules`, `parseSelectorList` y sus tipos exportados desde el paquete | `compiler` | `src/index.ts` |

## Fase 2 — la superficie (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 4 | — | **Lo que añade el framework.** `frameworkAttributesOf`: `slot` de un hueco, los atributos de `controls.ts`, `aria-invalid`/`aria-label` de `@fudic/forms`, `data-fud-*`. El test que recorre `@fudic/forms` y compara. Criterio 7 | `compiler` | `src/emit/surface.ts` · `test/emit/surface.test.ts` |
| [x] | 5 | 4 | **Un elemento.** Tag, clases literales y de `class:`, `openClasses`, `id`/`openIds`, atributos con valor literal o `null`; `.prop` no cuenta. Criterio 6 | `compiler` | `src/emit/surface.ts` |
| [x] | 6 | 5 | **El ámbito de un componente.** `shadowSurface`: template, todas las ramas, snippets renderizados dentro, hosts anidados con su contenido proyectado; `slotted` y `parts`. Criterio 5 | `compiler` | `src/emit/surface.ts` |
| [x] | 7 | 5 | **El ámbito del documento.** `documentSurface`: `html`, `body`, la cadena de layouts, la ruta, sus secciones, los snippets, los hosts y lo proyectado, **sin** entrar en ningún template; `unionSurfaces`. Criterio 4 | `compiler` | `src/emit/surface.ts` |

## Fase 3 — la poda (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 8 | 3, 6, 7 | **Selectores contra una superficie.** Compuestos, listas recortadas, pseudoclases que no restringen, `:root`/`html`/`body` y `:host` por ámbito, `::slotted()`, `::part()`, anidamiento con `&`, preludio ininteligible conservado. Criterios 8–11, 14 | `compiler` | `src/emit/prune.ts` · `test/emit/prune.test.ts` |
| [x] | 9 | 8 | **At-rules y la página entera.** `prunePage`: interiores de `@media`/`@supports`/`@container`/`@layer`/`@scope`, sentencias conservadas, `@keyframes` y `@font-face` por identificador en **todas** las hojas de la página, `@import` con `FUD0850`, hoja ilegible entera. Criterios 12, 13, 15 | `compiler` | `src/emit/prune.ts` |
| [x] | 10 | 9 | **Salida idéntica con superficie total.** La salida pasa por `compactProjectCss`; con todo en la superficie es byte a byte la de hoy. Criterio 16 | `compiler` | `src/emit/prune.ts` |

## Fase 4 — el emit (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 11 | 10 | **El puerto y la clave.** `EmitOptions.pruneStyles`; `AssetSheet` y `AssetLinker.sheetRef`; `sheetKey(depth, ordinal)` | `compiler` | `src/emit/module.ts` · `src/emit/assets.ts` · `src/emit/parts.ts` |
| [x] | 12 | 11 | **Layout y ruta.** El layout escribe `route.sheet(K)` por cada `<link>` podable; la ruta calcula `prunePage` y entrega `<link>` (atributos del autor, `href` podado), `<style nonce>` o `''`; `PROJECT_STYLES`, `data-fud-adopt` y `shadowrootadoptedstylesheets` sin las hojas vacías. El módulo de página sin layout hace lo mismo. Criterios 17–19 | `compiler` | `src/emit/layout.ts` · `src/emit/module.ts` · `src/emit/parts.ts` · `src/emit/project-styles.ts` · `test/emit/page-sheets.test.ts` |
| [x] | 13 | 12 | **Sin la opción, como hoy.** Los tests y fixtures existentes pasan sin cambios. Criterio 20 | `compiler` | — |

## Fase 5 — el build (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 14 | 12 | **Nombre por contenido, en el shell, en dev.** `LinkedAssets.sheet`; `pruneStyles: true` y `AssetSheet` en los tres pases y en dev; el middleware de `/@fudic/sheet/…`. Criterios 21–23 | `vite` | `src/linked-assets.ts` · `src/transform.ts` · `src/plugin.ts` · `test/prune-build.test.ts` · `test/dev-sheets.test.ts` |
| [x] | 15 | 14 | **La hoja que no usa nadie.** `FUD0852` al cerrar el build, sobre la entrada de `fudic.json` o el `<link>`. Criterio 24 | `vite` | `src/plugin.ts` · `src/diagnostics.ts` · `test/prune-build.test.ts` |

## Fase 6 — la evidencia (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 16 | 15 | **Una guía de tamaño real, y su medición.** `base.css` de unos 10 KB enlazada con `?inline` en `_layout.fud`; bytes por página y hoja antes y después, y copias distintas publicadas. Criterio 25 | `example-basic` | `src/styles/base.css` · `src/layouts/_layout.fud` · `docs/sdd/SDD-49-medicion.md` |
| [ ] | 17 | 16 | **Pedro en navegador.** Todas las páginas iguales que antes; SW activo; una página no visitada abre offline con su hoja. Criterio 26 | — | — |

## Cierre (1)

| ✓ | # | dep | tarea |
|---|---|---|---|
| [ ] | 18 | 17 | Cobertura de los ficheros nuevos al 100 % en las cuatro métricas y ninguno por debajo de su suelo en `main` (criterio 27); `pnpm typecheck`, `pnpm test` y `pnpm build` verdes; SDD-49 a `Hecho` en la tabla y el registro del `INDEX.md` |
