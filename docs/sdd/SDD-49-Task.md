# SDD-49 — Tareas

> **SDD:** [SDD-49 — El CSS que cada página usa](./SDD-49-css-por-pagina.md)
> **Paquetes:** `@fudic/compiler` · `@fudic/vite` · `@fudic/example-basic`
> **Rama:** `worktree-sdd-49-css-por-pagina`
> **Progreso:** 24 / 28 — las fases 1–6 están en el código, sin tests. La **segunda redacción**
> (2026-10-01) añade la fase 7: aplanar `@import`, podar tokens, `url()` en la copia enlazada y
> los errores de `@import` en hojas adoptadas y **quitar el Razor del CSS** (decisión 136, que
> revoca la 42; tarea 25). Después, los tests, el OK de Pedro en navegador (tarea 27) y el
> cierre (tarea 28).

## Qué cambió en la segunda redacción

La primera conservaba los `@import` sin seguirlos y no tocaba las custom properties. Pedro lo
corrigió: una guía real es un `main.css` que importa un fichero por tema, y lo que pesa son los
tokens. Lo ya implementado que la spec nueva **contradice**, y que la fase 7 cambia:

- `FUD0850` ya no es «la hoja contiene `@import`», sino «un `@import` que no se puede aplanar».
  `imports()` y `sheetDiagnostics` de [prune.ts](../../packages/compiler/src/emit/prune.ts)
  cambian con él.
- `@property` ya no se conserva siempre: depende de que su token esté vivo.
- `@keyframes` y `@font-face` se deciden en el punto fijo de los tokens (§4.6), no por
  aparecer en cualquier declaración conservada.
- `StyleRule.declarations` pasa de `Span[]` a `CssDeclaration[]` (nombre + valor).
- `PageSheet.css` pasa a `PageSheet.sheet: FlatSheet`, `prunePage` recibe `consumers` y
  `PrunedSheet` gana `contributing`.
- `LinkedAssets.recordSheet` pasa a registrar también cada fichero importado (FUD0852 por
  `@import`).

**No escribas tests de lo de arriba contra el código actual**: se escriben contra la fase 7.

## Tests pendientes (para otra sesión)

La implementación se hizo sin tests por decisión de Pedro: los escribe otra sesión, en este
mismo worktree y rama. Los números son los criterios de la spec (§6, segunda redacción).

### 0. Antes de empezar

- `pnpm install` y `pnpm build` en el worktree (sin los `dist` no compila ni el typecheck).
- **Medir el suelo en `main`** de `@fudic/compiler` y `@fudic/vite` (`pnpm --filter <pkg>
  coverage`, las cuatro cifras) sobre un checkout de `main`: no se midió antes de empezar. Al
  cerrar, ningún fichero existente puede quedar por debajo de ese suelo.
- **Escribir los umbrales al 100 %** de los ficheros nuevos en el `vitest.config.ts` de
  `@fudic/compiler`: `src/css/rules.ts`, `src/css/selectors.ts`, `src/css/flatten.ts`,
  `src/emit/surface.ts`, `src/emit/prune.ts`, `src/emit/page-sheets.ts`. Hoy no están, y el
  suelo global de 80/80/75 los tapa.
- `src/linked-assets.ts` de `@fudic/vite` **ya** tiene umbral 100 y sus métodos nuevos (`sheet`,
  `recordSheet`, `unusedSheets`, `sheetDiagnostics`) no tienen test: `coverage` de vite está en
  rojo hasta el apartado 7.
- Hoy fallan 6 tests existentes, todos por cambio de comportamiento pedido (apartado 8).

### 1. `packages/compiler/test/css/rules.test.ts` — criterios 1–2 (`src/css/rules.ts`, 100 %)

- Reglas de estilo, `at-block` con hijos (`@media`, `@supports`, `@container`, `@layer x {}`,
  `@scope`, `@starting-style`) y sin hijos (`@font-face`, `@keyframes`, `@page`, desconocida),
  `at-statement` (`@import`, `@layer a, b;`, `@charset`, `@namespace`), sentencia al final sin
  `;`, sentencia dentro de un bloque cerrada por `}`.
- Declaraciones: nombre en minúsculas (`COLOR` → `color`), custom property tal cual (`--Brand`),
  span del valor; `!important` dentro del valor.
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

### 3. `packages/compiler/test/css/flatten.test.ts` — criterios 4–9 (`src/css/flatten.ts`, 100 %)

- 4: `parseImport` con cada forma de URL, `layer`/`layer(x)`, `supports(…)`, medios, y sus
  combinaciones; `null` para lo inválido (sin URL, `layer(` sin cerrar, orden de condiciones
  incorrecto).
- 5: orden del contenido; anidado `@layer` > `@supports` > `@media`; importación en dos niveles.
- 6: `url()` rebasado al `.fud` desde otra carpeta (subir, bajar, misma), con comillas y sin ellas; un
  `url()` absoluto o `data:` no se toca; `@charset` importado se quita y el de la raíz se queda.
- 7: repetido → una vez, última aparición; repetido con capas → todas; repetido con
  condiciones distintas → son dos imports.
- 8: `FUD0856`, `FUD0853`, `FUD0857`, `FUD0850` (absoluta, `//otro`, `/public`) y `FUD0858`
  (en fichero importado; detrás de un aplanado). Sin lanzar.
- 9: `originOf` en cada región; diagnósticos de un fichero anidado sobre su propio texto;
  `files` con la raíz y cada importado una vez.

### 4. `packages/compiler/test/emit/surface.test.ts` — criterios 10–14 (`src/emit/surface.ts`, 100 %)

- 10: `documentSurface` de ruta + layout: `html`, `body`, atributos de `<html>`/`<body>`, body
  del layout, markup de la ruta, secciones, hosts y contenido proyectado; **no** un `h1` que solo
  está en el template de un componente. Página sin layout (`page-document`). Entrada componente
  (solo `html`/`body`). Hueco con `slot` (SDD-48): las raíces de la ruta llevan `slot`.
- 11: `shadowSurface`: template, snippets expandidos, las dos ramas de un `@if` falso en SSR,
  `@switch`, `@foreach`, host de un componente anidado; `slotted` = hijos directos de cada
  `<tag>` en cualquier ámbito de la página (a través de `@if`); `parts` literal y `'any'`.
- 12: `class:activo=@x` aporta `activo`; `class="a @b"` aporta `a` y `openClasses`;
  `id=@x` → `openIds`; `type=@t` → valores `null`; `.prop`, `@click`, `bus:` no cuentan;
  `style:x=@y` → atributo `style` con `null`.
- 13: `frameworkAttributesOf` de un control con `control` (+ `novalidate` en `<form>`), campo
  sin `control`, marcador `error`/`summary`, custom element, `sealed`. **Un test que recorre
  `packages/forms/src`** buscando `setAttribute`/`toggleAttribute` y comprueba que cada
  atributo está en la lista.
- 14: `pageTokenConsumers`: `<style>` de cada componente de la página (anidado, de librería,
  creado solo en cliente), ninguno de un componente fuera de la página; `style="…"` literal y la
  parte literal de uno con `@`.
- `unionSurfaces`: conjuntos, `null` gana en atributos, `openX` en OR, `slotted` unido o `null`,
  `parts` `'any'` si alguno lo es.

### 5. `packages/compiler/test/emit/prune.test.ts` — criterios 15–29 (`src/emit/prune.ts`, 100 %)

- 15: `h1, h2, h3 {}` → `h1{…}`; `table` fuera.
- 16: `ul > li` con `ul` y `li` sueltos. 17: `.btn:hover`, `a:not(.x)`, `li:nth-child(2n)`.
- 18: shadow `:host`, `:host(.x)` siempre; `:root`/`html`/`body` nunca; `::slotted(p)` según
  `slotted` (y `null`); documento `::part(label)` según `parts` (y `'any'`); `:host` en
  documento se va.
- Atributos con cada operador contra valores literales, contra `null`, y valor vacío en
  `^=`/`$=`/`*=`. `openClasses`/`openIds`. `:is()` con un argumento que casa y ninguno.
- 19: `@media` vacío tras podar se va (también el nacido de un `@import … screen`); `@layer a,
  b;`, `@charset`, `@page`, desconocida se quedan; `@media` dentro de una regla se queda con su
  padre.
- 20: regla anidada con `&` se va con su padre y se poda sola si su padre queda.
- 21: el caso de §1.4 — `inputs.css` importado no deja reglas en el documento ni figura en
  `contributing`; adoptado por `<x-input>`, sí.
- 22–23: tokens por uso y cadenas de tokens; regla que se queda sin declaraciones se va.
- 24: token usado solo por el `<style>` de un componente de la página → se queda.
- 25: `style="… var(--x)"` en `consumers`; `style(--x: y)` en un `@container` conservado.
- 26: variantes de un token en `:root` y en `@media` dark juntas; `--X` ≠ `--x`.
- 27: `@keyframes` y `@font-face` (con comillas y sin ellas, sin `font-family`) vivos por el
  texto vivo de **otra** hoja de la página, por un token vivo, o muertos; `@property` según su
  token; una hoja `reference` cuenta como nombre pero no sale en la salida ni da diagnósticos.
- 28: hoja ilegible → entera, `FUD0851`, y sus `var()` cuentan.
- 29: superficie y usos totales, sin `@import` → idéntica a `compactProjectCss`. Hoja con solo
  `@charset`/`@layer` tras podar → `''`. Preludio que `parseSelectorList` no entiende → entera.
- `sheetDiagnostics` directo.

### 6. `packages/compiler/test/emit/page-sheets.test.ts` — criterios 30–35 (`src/emit/page-sheets.ts`, 100 %)

- 30 (lado compilador): `@import` en el `<style>` de un componente → `FUD0855`, también sin
  `pruneStyles`.
- 31: layout con `<link rel="stylesheet" href="./base.css" media="screen">` y otro `?inline`:
  el layout escribe `route.sheet("0:0")` y `route.sheet("0:1")`; la ruta entrega `<link>` con
  la URL de `AssetSheet` conservando `media`, y `<style' + $nonce + '>` con el CSS podado.
- 32: dos rutas con el mismo layout y markup distinto → CSS distinto para la misma clave.
- 33 (**corregido**, §4.7 de la spec): una `styles` que ningún componente adopta sale de
  `PROJECT_STYLES`; una adoptada que queda vacía se queda con `css: ''`; `data-fud-adopt` y
  `shadowrootadoptedstylesheets` no cambian.
- 34: `url()` relativo conservado → URL del host en la copia enlazada y `cssTemplate` en
  `?inline`; el de una regla podada no se enlaza.
- 35: sin `pruneStyles` todos los fixtures y goldens actuales pasan igual (ya lo hacen).
- Además: sin `AssetSheet` el `<link>` conserva la URL del fichero entero; hoja vacía → `''`;
  el `<link>` propio del `<head>` de la ruta y el de una página sin layout; `rebaseSpec` con
  rutas Windows (`\`) y POSIX, misma carpeta, subir y bajar, con `?query`; `EmitOutput.sheets`
  con `spec` y `specifier`; `<link>` no podable (URL absoluta, `/public`, interpolado,
  ilegible) se escribe como antes; `<style>` del `<head>` y de un componente como referencia.

### 7. `packages/vite/test/` — criterios 30, 36–39

- `prune-build.test.ts`: dos páginas con la misma hoja podada → mismo fichero; una tercera →
  otro; host, pase SW y edge escriben la misma URL; el fichero se publica una vez; las copias
  están en el shell del manifiesto/SW (37); `FUD0852` sobre la entrada de `fudic.json`, sobre el
  `<link>` y sobre el `@import` de un fichero importado que no aporta nada (39); los
  diagnósticos de una hoja, una sola vez aunque la enlacen varias páginas; `FUD0854` sobre una
  hoja de `fudic.json` con `@import`, una vez por hoja (30).
- `dev-sheets.test.ts` (38): en `vite dev` el `<link>` apunta a `/@fudic/sheet/…` y el
  middleware sirve ese CSS; tras editar la hoja **o un fichero que importa**, la siguiente
  navegación trae la poda nueva.
- `LinkedAssets.sheet`, `recordSheet`, `unusedSheets`, `sheetDiagnostics`, `assetSheetFrom`.

### 8. Tests existentes que cambian de expectativa (hoy en rojo)

- `packages/vite/test/build-styles-missing.test.ts`: «FUD0743 … the sheet ships whole» (`:root`
  dentro de un shadow ya no llega) y «hoists a chosen sheet only where some component chooses
  it» (`.panel` no casa con el template de `s-pick`: hay que darle `class="panel"`).
- `packages/vite/test/lib-extras-probe.test.ts`: «publishes a stylesheet its layout links»
  (`.lib` no casa con nada de la página; o se usa `.lib` en el markup, o se espera que no se
  publique).
- `packages/vite/test/dev-linked-asset.test.ts`: en dev la copia podada vive en
  `/@fudic/sheet/…` (§4.10), no en `/assets/…`.
- `packages/compiler/test/css/css.test.ts`: «does not count braces inside a Razor comment» y
  «reports FUD0011 when it is never closed». Con la decisión 136 todo Razor dentro de `<style>`
  es `FUD0132` (error) y ya no hay `FUD0011` ahí: se reescriben con el resto de tests de Razor
  en CSS (tarea 25).

### 9. Cambios hechos durante la revisión, también sin test

- `FUD0132` (`src/css/css.ts`): hoy cubre solo el comentario Razor dentro de `<style>`; la
  tarea 25 lo amplía a todo Razor ahí. Su test es el del criterio 43.
- `<style>` escrito en el `<head>` de ruta, página y layout (`headStyleExpr` en
  `src/emit/parts.ts`): sale compactado, con `$nonce` y los atributos del autor (`media`); el
  layout que lo tiene declara `$nonce` (`headEmbedsAsset`).
- Evidencia: `examples/basic` y `build:nosw` compilan; ningún `<style>` sin nonce en `dist`.

El orden va de abajo arriba: primero leer CSS, después saber qué hay en cada ámbito, después
decidir qué se queda, y solo entonces tocar el emit, que es donde un error se vuelve visible.
Los tests van con cada fase y no al final: la poda es conservadora por diseño, y cada caso de
§4.4 o §4.6 que se escriba sin su test es una regla que puede empezar a quitar de más sin que
nadie lo note.

---

## Fase 1 — leer CSS (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **El árbol de reglas.** `parseCssRules`: reglas de estilo, at-rules de bloque (con hijos o con declaraciones), sentencias, anidamiento; spans en todo; nunca lanza (`FUD0851` en el punto donde se pierde). Criterios 1–2. *Las declaraciones con nombre las añade la tarea 17* | `compiler` | `src/css/rules.ts` · `src/css/index.ts` · `test/css/rules.test.ts` |
| [x] | 2 | — | **Los selectores.** `parseSelectorList`: listas, compuestos, combinadores, atributos con operador, `:is()`/`:where()`/`:matches()`, `::slotted()`, `::part()`; `null` para lo que no entiende. Criterio 3 | `compiler` | `src/css/selectors.ts` · `test/css/selectors.test.ts` |
| [x] | 3 | 1, 2 | **El índice.** `parseCssRules`, `parseSelectorList` y sus tipos exportados desde el paquete | `compiler` | `src/index.ts` |

## Fase 2 — la superficie (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 4 | — | **Lo que añade el framework.** `frameworkAttributesOf`: `slot` de un hueco, los atributos de `controls.ts`, `aria-invalid`/`aria-label` de `@fudic/forms`, `data-fud-*`. El test que recorre `@fudic/forms` y compara. Criterio 13 | `compiler` | `src/emit/surface.ts` · `test/emit/surface.test.ts` |
| [x] | 5 | 4 | **Un elemento.** Tag, clases literales y de `class:`, `openClasses`, `id`/`openIds`, atributos con valor literal o `null`; `.prop` no cuenta. Criterio 12 | `compiler` | `src/emit/surface.ts` |
| [x] | 6 | 5 | **El ámbito de un componente.** `shadowSurface`: template, todas las ramas, snippets renderizados dentro, hosts anidados con su contenido proyectado; `slotted` y `parts`. Criterio 11 | `compiler` | `src/emit/surface.ts` |
| [x] | 7 | 5 | **El ámbito del documento.** `documentSurface`: `html`, `body`, la cadena de layouts, la ruta, sus secciones, los snippets, los hosts y lo proyectado, **sin** entrar en ningún template; `unionSurfaces`. Criterio 10 | `compiler` | `src/emit/surface.ts` |

## Fase 3 — la poda (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 8 | 3, 6, 7 | **Selectores contra una superficie.** Compuestos, listas recortadas, pseudoclases que no restringen, `:root`/`html`/`body` y `:host` por ámbito, `::slotted()`, `::part()`, anidamiento con `&`, preludio ininteligible conservado. Criterios 15–18, 20 | `compiler` | `src/emit/prune.ts` · `test/emit/prune.test.ts` |
| [x] | 9 | 8 | **At-rules y la página entera.** `prunePage`: interiores de `@media`/`@supports`/`@container`/`@layer`/`@scope`, sentencias conservadas, hoja ilegible entera. Criterio 19. *`@import`, `@keyframes`, `@font-face` y `@property` los rehace la fase 7* | `compiler` | `src/emit/prune.ts` |
| [x] | 10 | 9 | **Salida idéntica con superficie total.** La salida pasa por `compactProjectCss`; con todo en la superficie es byte a byte la de hoy. Criterio 29 | `compiler` | `src/emit/prune.ts` |

## Fase 4 — el emit (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 11 | 10 | **El puerto y la clave.** `EmitOptions.pruneStyles`; `AssetSheet` y `AssetLinker.sheetRef`; `sheetKey(depth, ordinal)` | `compiler` | `src/emit/module.ts` · `src/emit/assets.ts` · `src/emit/parts.ts` |
| [x] | 12 | 11 | **Layout y ruta.** El layout escribe `route.sheet(K)` por cada `<link>` podable; la ruta calcula `prunePage` y entrega `<link>` (atributos del autor, `href` podado), `<style nonce>` o `''`; `PROJECT_STYLES` sin las hojas que nadie adopta, y con `css: ''` la adoptada que queda vacía (`data-fud-adopt` y `shadowrootadoptedstylesheets` **no** cambian, §4.7). El módulo de página sin layout hace lo mismo. Criterios 31–33 | `compiler` | `src/emit/layout.ts` · `src/emit/module.ts` · `src/emit/parts.ts` · `src/emit/project-styles.ts` · `test/emit/page-sheets.test.ts` |
| [x] | 13 | 12 | **Sin la opción, como hoy.** Los tests y fixtures existentes pasan sin cambios. Criterio 35 | `compiler` | — |

## Fase 5 — el build (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 14 | 12 | **Nombre por contenido, en el shell, en dev.** `LinkedAssets.sheet`; `pruneStyles: true` y `AssetSheet` en los tres pases y en dev; el middleware de `/@fudic/sheet/…`. Criterios 36–38 | `vite` | `src/linked-assets.ts` · `src/transform.ts` · `src/plugin.ts` · `test/prune-build.test.ts` · `test/dev-sheets.test.ts` |
| [x] | 15 | 14 | **La hoja que no usa nadie.** `FUD0852` al cerrar el build, sobre la entrada de `fudic.json` o el `<link>`. Criterio 39. *El de un fichero importado lo añade la tarea 23* | `vite` | `src/plugin.ts` · `src/diagnostics.ts` · `test/prune-build.test.ts` |

## Fase 6 — la evidencia (1)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 16 | 15 | **Una guía de tamaño real, y su medición** (primera redacción). `base.css` de unos 10 KB enlazada con `?inline` en `_layout.fud`; bytes por página y hoja antes y después. *La rehace la tarea 24* | `example-basic` | `src/styles/base.css` · `src/layouts/_layout.fud` · `docs/sdd/SDD-49-medicion.md` |

## Fase 7 — segunda redacción: `@import` y tokens (8)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 17 | 1 | **Declaraciones con nombre.** `CssDeclaration` (`name` en minúsculas salvo custom property, `value`); `StyleRule.declarations` pasa a esa forma. Criterio 1 | `compiler` | `src/css/rules.ts` · `test/css/rules.test.ts` |
| [x] | 18 | 17 | **El aplanado.** `parseImport`, `flattenImports`, `originOf`: resolución relativa por aritmética de rutas, condiciones a bloques, posición, `url()` rebasados, `@charset`, repetidos, ciclos; `FUD0850`, `FUD0853`, `FUD0856`, `FUD0857`, `FUD0858`; tabla de regiones. Exportado desde el índice. Criterios 4–9 | `compiler` | `src/css/flatten.ts` · `src/css/index.ts` · `src/index.ts` · `test/css/flatten.test.ts` |
| [x] | 19 | 7 | **Los consumidores de tokens.** `pageTokenConsumers`: `<style>` de cada componente de la página y partes literales de `style="…"`. Criterio 14 | `compiler` | `src/emit/surface.ts` · `test/emit/surface.test.ts` |
| [x] | 20 | 9, 17, 18, 19 | **La poda de tokens.** `prunePage(sheets, consumers)` sobre `FlatSheet`: punto fijo de tokens, `@keyframes` y `@font-face`; quitar declaraciones `--x` muertas, `@property` muertos y reglas vacías; `contributing` por fichero; `FUD0850` con su sentido nuevo. Criterios 21–29 | `compiler` | `src/emit/prune.ts` · `test/emit/prune.test.ts` |
| [x] | 21 | 20 | **El emit aplana.** La ruta (y la página sin layout) aplana cada hoja del documento con `AssetLinker.textOf` antes de `prunePage`, y pasa `pageTokenConsumers`. En la copia enlazada, cada `url()` relativo que queda se escribe con la URL del host. Criterios 31–34 | `compiler` | `src/emit/page-sheets.ts` · `src/emit/layout.ts` · `src/emit/module.ts` · `test/emit/page-sheets.test.ts` |
| [x] | 22 | — | **`@import` en el `<style>` de un componente.** `FUD0855`, sobre el `@import`, que se quita; también sin `pruneStyles`. Criterio 30 | `compiler` | `src/css/css.ts` · `test/emit/page-sheets.test.ts` |
| [x] | 23 | 21 | **Lo que hace el host.** `FUD0854` sobre cada hoja de `fudic.json` con `@import`, una vez por hoja; vigilar `FlatSheet.files` en dev; `FUD0852` por fichero importado que no aporta nada (`contributing`), sobre su `@import`. Criterios 30, 38, 39 | `vite` | `src/styles.ts` · `src/linked-assets.ts` · `src/plugin.ts` · `test/prune-build.test.ts` · `test/dev-sheets.test.ts` |
| [x] | 24 | 23 | **La guía partida en ficheros, y su medición.** `src/styles/main.css` importa reset, tokens de color (con modo oscuro) y de espaciado, tipografía, listas, tablas, formularios y animaciones, ~12 KB entre todos; `_layout.fud` la enlaza con `?inline`. `SDD-49-medicion.md` rehecho: bytes por página antes y después, tokens que llegan de cuántos, copias distintas publicadas. Criterio 40 | `example-basic` | `src/styles/*.css` · `src/layouts/_layout.fud` · `docs/sdd/SDD-49-medicion.md` |

## Fase 8 — el `<style>` es CSS plano (1)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 25 | — | **Quitar el Razor del CSS** (decisión 136, revoca la 42 y 42.a–c). `parseStyle` da un solo run `css-text`; todo `@` que no abre una at-rule de la lista cerrada (`atrules.ts`, que se queda) ni lleva prefijo de fabricante, fuera de strings y comentarios, es `FUD0132` (error): expresión, constructo, comentario Razor, `@@`, `@` suelto; sin `FUD0011` en `<style>`; el lexer, el formatter y el código virtual CSS del language server sin huecos de Razor; reescribir los tests de Razor en CSS. Criterio 43 | `compiler` · `formatter` · `language-core` · `language-server` | `src/css/css.ts` · `src/css/atrules.ts` · `src/lexer/lexer.ts` · `formatter/src/leaf/css.ts` · `language-core/src/css.ts` · `language-server/src/virtual-code.ts` · `test/css/css.test.ts` |

## Navegador y cierre (3)

| ✓ | # | dep | tarea |
|---|---|---|---|
| [ ] | 26 | 24, 25 | Los tests pendientes de arriba, y los 6 en rojo con su expectativa nueva |
| [ ] | 27 | 26 | **Pedro en navegador.** Todas las páginas iguales que antes, en modo claro y oscuro; SW activo; una página no visitada abre offline con su hoja. Criterio 41 |
| [ ] | 28 | 27 | Cobertura de los ficheros nuevos al 100 % en las cuatro métricas, con su umbral en el `vitest.config.ts`, y ninguno por debajo de su suelo en `main` (criterio 42); `pnpm typecheck`, `pnpm test` y `pnpm build` verdes; SDD-49 a `Hecho` en la tabla y el registro del `INDEX.md` |
