# SDD-49 — Tareas

> **SDD:** [SDD-49 — El CSS que cada página usa](./SDD-49-css-por-pagina.md)
> **Paquetes:** `@fudic/compiler` · `@fudic/vite` · `@fudic/example-basic`
> **Rama:** por crear desde `main`
> **Progreso:** 0 / 18

El orden va de abajo arriba: primero leer CSS, después saber qué hay en cada ámbito, después
decidir qué se queda, y solo entonces tocar el emit, que es donde un error se vuelve visible.
Los tests van con cada fase y no al final: la poda es conservadora por diseño, y cada caso de
§4.3 que se escriba sin su test es una regla que puede empezar a quitar de más sin que nadie lo
note.

---

## Fase 1 — leer CSS (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 1 | — | **El árbol de reglas.** `parseCssRules`: reglas de estilo, at-rules de bloque (con hijos o con declaraciones), sentencias, anidamiento; spans en todo; nunca lanza (`FUD0851` en el punto donde se pierde). Criterios 1–2 | `compiler` | `src/css/rules.ts` · `src/css/index.ts` · `test/css/rules.test.ts` |
| [ ] | 2 | — | **Los selectores.** `parseSelectorList`: listas, compuestos, combinadores, atributos con operador, `:is()`/`:where()`/`:matches()`, `::slotted()`, `::part()`; `null` para lo que no entiende. Criterio 3 | `compiler` | `src/css/selectors.ts` · `test/css/selectors.test.ts` |
| [ ] | 3 | 1, 2 | **El índice.** `parseCssRules`, `parseSelectorList` y sus tipos exportados desde el paquete | `compiler` | `src/index.ts` |

## Fase 2 — la superficie (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 4 | — | **Lo que añade el framework.** `frameworkAttributesOf`: `slot` de un hueco, los atributos de `controls.ts`, `aria-invalid`/`aria-label` de `@fudic/forms`, `data-fud-*`. El test que recorre `@fudic/forms` y compara. Criterio 7 | `compiler` | `src/emit/surface.ts` · `test/emit/surface.test.ts` |
| [ ] | 5 | 4 | **Un elemento.** Tag, clases literales y de `class:`, `openClasses`, `id`/`openIds`, atributos con valor literal o `null`; `.prop` no cuenta. Criterio 6 | `compiler` | `src/emit/surface.ts` |
| [ ] | 6 | 5 | **El ámbito de un componente.** `shadowSurface`: template, todas las ramas, snippets renderizados dentro, hosts anidados con su contenido proyectado; `slotted` y `parts`. Criterio 5 | `compiler` | `src/emit/surface.ts` |
| [ ] | 7 | 5 | **El ámbito del documento.** `documentSurface`: `html`, `body`, la cadena de layouts, la ruta, sus secciones, los snippets, los hosts y lo proyectado, **sin** entrar en ningún template; `unionSurfaces`. Criterio 4 | `compiler` | `src/emit/surface.ts` |

## Fase 3 — la poda (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 8 | 3, 6, 7 | **Selectores contra una superficie.** Compuestos, listas recortadas, pseudoclases que no restringen, `:root`/`html`/`body` y `:host` por ámbito, `::slotted()`, `::part()`, anidamiento con `&`, preludio ininteligible conservado. Criterios 8–11, 14 | `compiler` | `src/emit/prune.ts` · `test/emit/prune.test.ts` |
| [ ] | 9 | 8 | **At-rules y la página entera.** `prunePage`: interiores de `@media`/`@supports`/`@container`/`@layer`/`@scope`, sentencias conservadas, `@keyframes` y `@font-face` por identificador en **todas** las hojas de la página, `@import` con `FUD0850`, hoja ilegible entera. Criterios 12, 13, 15 | `compiler` | `src/emit/prune.ts` |
| [ ] | 10 | 9 | **Salida idéntica con superficie total.** La salida pasa por `compactProjectCss`; con todo en la superficie es byte a byte la de hoy. Criterio 16 | `compiler` | `src/emit/prune.ts` |

## Fase 4 — el emit (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 11 | 10 | **El puerto y la clave.** `EmitOptions.pruneStyles`; `AssetSheet` y `AssetLinker.sheetRef`; `sheetKey(depth, ordinal)` | `compiler` | `src/emit/module.ts` · `src/emit/assets.ts` · `src/emit/parts.ts` |
| [ ] | 12 | 11 | **Layout y ruta.** El layout escribe `route.sheet(K)` por cada `<link>` podable; la ruta calcula `prunePage` y entrega `<link>` (atributos del autor, `href` podado), `<style nonce>` o `''`; `PROJECT_STYLES`, `data-fud-adopt` y `shadowrootadoptedstylesheets` sin las hojas vacías. El módulo de página sin layout hace lo mismo. Criterios 17–19 | `compiler` | `src/emit/layout.ts` · `src/emit/module.ts` · `src/emit/parts.ts` · `src/emit/project-styles.ts` · `test/emit/page-sheets.test.ts` |
| [ ] | 13 | 12 | **Sin la opción, como hoy.** Los tests y fixtures existentes pasan sin cambios. Criterio 20 | `compiler` | — |

## Fase 5 — el build (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 14 | 12 | **Nombre por contenido, en el shell, en dev.** `LinkedAssets.sheet`; `pruneStyles: true` y `AssetSheet` en los tres pases y en dev; el middleware de `/@fudic/sheet/…`. Criterios 21–23 | `vite` | `src/linked-assets.ts` · `src/transform.ts` · `src/plugin.ts` · `test/prune-build.test.ts` · `test/dev-sheets.test.ts` |
| [ ] | 15 | 14 | **La hoja que no usa nadie.** `FUD0852` al cerrar el build, sobre la entrada de `fudic.json` o el `<link>`. Criterio 24 | `vite` | `src/plugin.ts` · `src/diagnostics.ts` · `test/prune-build.test.ts` |

## Fase 6 — la evidencia (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 16 | 15 | **Una guía de tamaño real, y su medición.** `base.css` de unos 10 KB enlazada con `?inline` en `_layout.fud`; bytes por página y hoja antes y después, y copias distintas publicadas. Criterio 25 | `example-basic` | `src/styles/base.css` · `src/layouts/_layout.fud` · `docs/sdd/SDD-49-medicion.md` |
| [ ] | 17 | 16 | **Pedro en navegador.** Todas las páginas iguales que antes; SW activo; una página no visitada abre offline con su hoja. Criterio 26 | — | — |

## Cierre (1)

| ✓ | # | dep | tarea |
|---|---|---|---|
| [ ] | 18 | 17 | Cobertura de los ficheros nuevos al 100 % en las cuatro métricas y ninguno por debajo de su suelo en `main` (criterio 27); `pnpm typecheck`, `pnpm test` y `pnpm build` verdes; SDD-49 a `Hecho` en la tabla y el registro del `INDEX.md` |
