# BUG-40 — Tareas

> **BUG:** [BUG-40 — Una hoja de estilos enlazada: el import que no compila, y el nombre que
> nadie escribe](./BUG-40-una-hoja-que-no-se-puede-enlazar.md)
> **Paquetes:** `@fudic/compiler` · `@fudic/vite` · `@fudic/example-basic`
> **Rama:** `sdd-42-guia-de-estilos` — se implementó dentro de [SDD-42](../SDD-42-guia-de-estilos.md),
> que es quien lo destapó, y cierra con él.
> **Progreso:** 10 / 10

Diez tareas en tres fases. Las siete primeras están hechas y verificadas **en el navegador**
antes de existir un solo test: era la condición del encargo — implementar de una tirada para
poder probar de verdad, y escribir los tests después, sobre un comportamiento que ya se ha
visto funcionar.

Lo que queda es la tanda de tests (§6 del BUG), la cobertura y el cierre.

---

## Fase 1 — el nombre y la publicación (4) · hecha

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **Un solo bautizo.** `LinkedAssets` calcula `assets/<nombre>-<hash><ext>` sobre los bytes publicados, y cualquier pasada que resuelva el mismo fichero obtiene la misma cadena. Criterios 1, 2, 7 | `vite` | `src/linked-assets.ts` |
| [x] | 2 | 1 | **Lo pequeño se incrusta; una hoja nunca.** Por debajo de 4096 bytes, `data:`; el `.css` siempre fichero. Criterios 4, 5 | `vite` | `src/linked-assets.ts` |
| [x] | 3 | 1 | **La URL en vez del import.** `EmitOptions.assetUrl` y el tercer argumento de `AssetLinker`: con resolutor, el emit escribe un literal y no registra import. `AssetLinker.filePath` comprueba la existencia sin el `?query`. Criterio 1 | `compiler` | `src/emit/assets.ts` · `src/emit/module.ts` (+ los cinco sitios donde nace el enlazador) |
| [x] | 4 | 3 | **Todas las pasadas usan el mismo registro.** `transformFud`, `transformFudClient`, `runEdgePass` y `runLinkPass` lo reciben; el build principal publica cada fichero una vez, después de las dos pasadas anidadas. Criterios 2, 3, 6 | `vite` | `src/transform.ts` · `src/edge.ts` · `src/link.ts` · `src/plugin.ts` |

---

## Fase 2 — desarrollo, worker y CSS (3) · hecha

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 5 | 4 | **Desarrollo sirve la misma URL.** Middleware que contesta el registro en la ruta que publica el build, con los bytes ya compactados y su tipo de contenido. Criterio 8 | `vite` | `src/plugin.ts` · `src/linked-assets.ts` |
| [x] | 6 | 4 | **El worker la precachea.** Las hojas enlazadas entran en el shell, junto al grafo de los dos entries y por el mismo argumento; nada más entra. Criterio 9 | `vite` | `src/plugin.ts` |
| [x] | 7 | 2 | **Un solo camino para el CSS.** La hoja enlazada pasa por la compactación del `<style>` de componente, y esa compactación tira los comentarios salvo `/*!`, conservando el espacio alrededor. Criterios 10, 11, 12 | `compiler` · `vite` | `src/emit/css-compact.ts` · `vite/src/linked-assets.ts` |

---

## Fase 3 — la red, la evidencia y el cierre (3) · hecha

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 8 | 1–7 | **La tanda de tests.** Los criterios 1–12 de §6, y el 13: el golden de [SDD-42](../SDD-42-guia-de-estilos.md) tarea 1 vuelve a verde sin editarse salvo por los comentarios que ya no viajan. **Hay un test en rojo a propósito**: el de la compactación afirmaba que un comentario sin cerrar se conserva, y ahora se tira — hay que reescribirlo, no restaurarlo. Criterios 1–13 | `vite` · `compiler` | `vite/test/` · `compiler/test/emit/` |
| [x] | 9 | 8 | **Cobertura.** El código nuevo al 100 % en las cuatro; ni `@fudic/vite` ni `@fudic/compiler` bajan de su suelo (medido al empezar la rama: compiler 99,27/98,23/99,48/99,70 · vite 96,17/90,28/96,41/96,06). Criterio 15 | — | — |
| [x] | 10 | 9 | **Cierre.** `pnpm typecheck`, `pnpm test`, `pnpm build`, los 15 criterios, BUG-40 a `Hecho` en [INDEX.md](./INDEX.md) —tabla y grafo— y en el registro de progreso de [docs/sdd/INDEX.md](../INDEX.md), junto al cierre de SDD-42 | — | [INDEX.md](./INDEX.md) · [../INDEX.md](../INDEX.md) |

---

## Lo que ya se verificó a mano, y no sustituye a los tests

En Chrome, sobre `examples/basic`, antes de escribir un test: desarrollo, build con worker y
build sin worker. La hoja se descarga de una URL con hash que existe, no da 404, sus tokens
llegan al markup de las rutas y al interior de los componentes, el logo sigue apareciendo, y
la hoja aparece en el shell del worker. El criterio 14 es eso mismo, escrito para que se
repita.
