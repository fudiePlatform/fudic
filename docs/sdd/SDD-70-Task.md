# SDD-70 — Tareas

> **SDD:** [SDD-70 — `@await` en la vista](./SDD-70-await-en-la-vista.md)
> **Paquetes:** `@fudic/api` · `@fudic/compiler` · `@fudic/diagnostics` · `@fudic/ssr` ·
> `@fudic/core` · `@fudic/vite` · `@fudic/transport` · `@fudic/language-core` ·
> `@fudic/language-server` · `@fudic/formatter` · `fudic-vscode` · `examples/basic`
> **Rama:** `sdd-70-await-en-la-vista`. Nace de `main` **con SDD-61, SDD-67 y SDD-68 en
> `Hecho`**: el constructo nuevo entra en la lista blanca de la 61, las tramas del endpoint de
> datos usan el codec de la 67 y `load.fetch` de la 68 pasa a leerlas.
> **Progreso:** 36 / 37 — `En curso`.

**Dos sesiones.** Una implementa y coordina. La otra escribe los tests de cada fase (las tareas
«Los tests de…») contra los criterios de SDD §6. Si un test destapa un defecto, se corrige el
código, no el test.

**El orden manda en tres puntos.**

- **Sin `@await`, los mismos bytes, en cada commit.** Los goldens del compilador y las páginas
  de `examples/*` no se regeneran en ninguna tarea. Si uno cambia, es un defecto.
- **El servidor antes que el navegador.** Las fases 3 y 4 dejan el HTML por partes correcto y
  probado. El lector del navegador (fase 5) se escribe contra ese HTML, no contra uno imaginado.
- **El streaming de desarrollo va antes que la ruta de ejemplo.** Sin él, la prueba en el
  navegador recibe la página entera de golpe y no prueba nada.

---

## Traspaso 2 (2026-10-29, fin de la jornada a mitad de la fase 5)

**Dónde se queda.** Fases 1–4 cerradas. El último commit es un «wip(sdd-70)» con la tarea 26 a
medias. Lo que sigue, en orden:

1. **Tarea 26, terminar.** El `@await` del cliente lo escribía un agente, parado a medias. Ya
   hecho: el constructo entra en el recorrido de bloques del cliente (`block.ts`,
   `markup-client.ts`, `route-client.ts`, `constructs.ts`, `marker.ts`), y la fábrica de la ruta
   recibe `maps.fields` como segundo argumento (`core/hydrate/chunks.ts`, `install.ts`). Tests
   nuevos en `compiler/test/emit/hydrate/await.test.ts`. **Un test en rojo:** «releases what it
   hooked up inside the body». También quedaban dos expectativas de `await-parts.test.ts` por
   ajustar: ahora la mitad de cliente lee el campo dentro de su `@await`, así que `fields`
   viaja. Revisar el diff entero del wip antes de seguir: lo escribió el agente y nadie lo ha
   repasado. Los goldens siguen en verde.
2. **Tarea 27**, los tests de la fase 5: criterios 18–20, con un DOM que recibe nodos poco a
   poco. El lector (`core/src/hydrate/parts.ts`) y lo nuevo de `maps.ts` e `install.ts` están
   sin cubrir: `@fudic/core` hoy no llega al 100 %. Marcar después las tareas 22–27.
3. **Fase 6.** La tarea 28 (streaming en dev y preview) está hecha y con commit
   (`renderRouteStream`, `openStream` en `serve.ts`), sin marcar hasta sus tests. **La 29 tiene
   un hueco de diseño por decidir con Pedro:** §3.7 pide las tramas con el codec binario de
   SDD-67, que necesita el tipo de cada campo, y la pieza `load` no lleva descriptor de tipos
   (decisión 8.2.1). Dos caminos: el `.fudapi` emite los tipos de `load` y `layout` en su spec
   (lo que pide la spec), o tramas en JSON y el binario para otra spec. Luego la 30 (el SW) y
   la 31.
4. **Fase 7.** Las guías de `@await` y `later` ya están en los README. Falta el ejemplo
   `espera.fud`, la prueba de Pedro y el cierre.

**Hecho en esta sesión, además:**
- `RenderContext.onError`; en dev, el error de un `@await` sin `@catch` va al overlay.
- El coordinador ya no lee `fud-ioc` ni `fud-di` del DOM: `installHydration` recibe `inject` y
  levanta el árbol desde memoria. Una ruta con `@await` pide la pieza `core/parts`.
- `readPageMaps` borra los bloques del final en todas las páginas, y los tests de
  `@fudic/testing` lo esperan así.
- Ocho commits sin subir a origin cuando se escribe esto: hay que hacer push.

## Traspaso (2026-10-29, cambio de sesión a mitad de la fase 4)

**Cómo se trabajó.** Una sesión implementa y lanza por fase un agente en segundo plano (worktree
aislado) que solo escribe tests, empuja su rama `sdd-70-tests-N` y reporta. La rama de tests se
mergea en esta, se marca la tarea de tests y se cierra la fase. **Cada fase cerrada se empuja a
origin**, y el agente empuja también la suya.

**Estado.**
- Fases 1, 2 y 3 cerradas. Los tests de la fase 2 (rama `sdd-70-tests-2`) están mergeados y en
  verde, sin defectos.
- Fase 4 cerrada. Sus tests (rama `sdd-70-tests-4`) destaparon dos defectos, ya corregidos: la
  marca de fin caía dentro del último elemento construido, y `data` llevaba los campos `later`
  como `{}` cuando la ruta no tenía forma de datos.
- Fase 5: lector de partes, mapas en memoria, celdas por parte y ruta al final hechos (tareas
  22–25). La 26 queda a medias (ver «Traspaso 2»).

**Fase 4, hecho:**
- `@fudic/ssr`: `PageParts` (`page-parts.ts`) escribe cada parte con su bloque delante y su
  marca detrás, y en la última también `end()`. `SsrDom.hydrationPart()` da el estado por
  tramos.
- `@fudic/http`: `runLoad` resuelve los campos `later` en cuanto `load` devuelve
  (`settleLater`). Cada uno pasa a `{ ok }` o `{ error: Problem, cause }`, y una redirección
  avisa en dev.
- `@fudic/api`: `load` lleva `later: [...]` en su spec, y `dataShape` deja fuera los campos
  `later`.
- Compilador:
  - Layouts `async function*`. Las ranuras de la ruta son generadores `open`, `body`, `section`
    y `close`, delegados con `yield*`. `blocks` ya no existe; ahora es `close`.
  - Las rutas con layout pasan a `async function* page`.
  - Un elemento que contiene un `@await` o un hueco del layout se cuelga de su padre **antes**
    de construir su contenido (`holdsCut` en `markup.ts`): `partSerializer` exige crecer solo
    por la derecha.
  - `#await` en `markup.ts` emite: `yield* $parts.cut()`, el `await` del campo,
    `$parts.field`, el cuerpo con `data` reatado, o el `@catch`, o `io.onError`.
  - `writePartsOpen` en `maps.ts`.
  - El runtime va con `async` en las páginas por partes.
- `@fudic/vite`: `io.parts` y `io.onError` en el wrapper.

- `module.ts`: una página sin layout con `@await` sale por partes igual (`async function* page`).
- `RenderContext.onError`; en dev, `renderRouteHtml` lo lleva al overlay.

**Fase 5, decisión de diseño a revisar:** en una página por partes que inyecta, el árbol de
contenedores se levanta tras la última parte (el mapa `ioc` crece hasta entonces), así que los
componentes de esa página esperan al final para hidratarse.

**Decisiones de esta fase, para pasar a §8.2:**
- El bloque es texto cedido, no un nodo del árbol. El de la parte 0 va justo después de la
  etiqueta de apertura `<body>`.
- Cada corte deja abiertos solo el punto de inserción y sus antecesores: lo terminado se
  cierra antes de la marca. En la última parte solo queda abierto el `<body>`:
  `<p>…</p></main><!--fud-end--></body>`.
- `ioc` sale entero cada vez que crece, y el navegador lo sustituye. `di` sale con solo las
  claves nuevas.
- Los mapas estáticos van en la parte 0 siempre que la página los tenga.
- Con un `@await`, la ruta reclama el `<body>` al abrir y no al cerrar, así que su id pasa a
  ser el 0.

## Mapa de dependencias

```
1 códigos nuevos
   │
   ▼
2 later en el .fudapi ─→ 3 LoadData con Promise ─→ 4 formatter y gramática del .fudapi ─→ 5 tests
   │
   ▼
6 at.ts y control.ts ─→ 7 nodo await ─→ 8 analizador 1320–1322 ─→ 9 proyección ─→ 10 formatter ─→ 11 gramática
   ─→ 33 snippets @await/@catch ─→ 34 completado solo de campos later ─→ 12 tests
   │
   ▼
13 FLUSH ─→ 14 partSerializer ─→ 15 tests
   │
   ▼
16 layouts async ─→ 17 emit por partes ─→ 18 bloque por parte ─→ 19 promesas manejadas ─→ 20 runtime async ─→ 21 tests
   │
   ▼
22 lector de partes ─→ 23 mapas en memoria y borrado ─→ 24 celdas por parte ─→ 25 ruta al final ─→ 26 constructo de cliente ─→ 27 tests
   │
   ▼
28 dev y preview en streaming ─→ 29 endpoint por tramas ─→ 30 el SW por tramas ─→ 31 tests
   │
   ▼
32 ejemplo espera.fud, docs, entrega y cierre
```

---

## Fase 1 — el campo que llega después (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **Los códigos nuevos.** `FUD1320`–`FUD1324`: `.ts`, `.md` (título y arreglo de SDD §3.8) y su línea en `index.ts`. El rango en la fila de SDD-70 del `INDEX.md` | `diagnostics` | `src/codes/FUD1320`–`1324.{ts,md}` · `src/index.ts` |
| [x] | 2 | 1 | **`later`.** `typedField` acepta la palabra detrás del tipo y la guarda en el campo (`later?: Span`); fuera de los campos de `load`, `FUD1324` | `api` | `src/clauses.ts` · `src/ast.ts` · `src/contract.ts` |
| [x] | 3 | 2 | **`LoadData` con promesas.** Un campo `later` se declara `Promise<T>`; el conform del servidor comprueba el valor cuando se cumple, no la promesa | `api` · `http` | `src/emit/declarations.ts` · `src/contract/page.ts` |
| [x] | 4 | 2 | **El `.fudapi` en el editor.** El formatter alinea `later` como una columna más; `fudapi.tmLanguage.json` la resalta; el completado la ofrece detrás del tipo de un campo de `load` | `api` · `vscode` · `language-server` | `src/format.ts` · `syntaxes/fudapi.tmLanguage.json` · `src/fudapi/completion.ts` |
| [x] | 5 | 3, 4 | **Los tests de la fase.** Criterios 1–2 | `api` | `test/**` |

## Fase 2 — `@await` y `@catch` en la vista (9)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 6 | 1 | **El parser.** `await` y `catch` en `CONTROL_KEYWORDS`; `control.ts` lee `@await <expr> { … }` y el `@catch (<ident>) { … }` opcional detrás de la llave, como `@else`; `FUD1323` para el suelto y el repetido, y sigue | `compiler` | `src/at/at.ts` · `src/control/control.ts` |
| [x] | 7 | 6 | **El nodo.** `{ type: 'await', span, expression, body, catch? }` en `control/nodes.ts`, con su visita en el balancer, en `expand` y en todo lo que hoy recorre los constructos | `compiler` | `src/control/nodes.ts` · `src/balancer/*` · `src/expand/expand.ts` |
| [x] | 8 | 7, 2 | **El analizador.** `FUD1320` (no es un campo `later` de `data`), `FUD1321` (lectura fuera de su `@await`), `FUD1322` (head, componente, layout o snippet), con el `.fudapi` de la ruta | `compiler` | `src/semantic/analyzers/await.ts` · `ANALYZERS` |
| [x] | 9 | 7 | **La proyección.** Dentro del cuerpo, `data.<campo>` es `Awaited<…>`; `e` es `Problem` de `@fudic/http`. El pase tipado, el hover y el completado lo ven | `language-core` · `typecheck` | `src/template/*` · `src/data.ts` |
| [x] | 10 | 7 | **El formatter.** `@await … { } @catch (e) { }` como `@if … { } @else { }`; idempotente | `formatter` | `src/print/*` |
| [x] | 11 | 6 | **La gramática de colores.** `@await` y `@catch` como palabras de control | `vscode` | `syntaxes/fudic.tmLanguage.json` |
| [x] | 33 | 2, 7 | **Snippets `@await` y `@catch`.** `@await data.$1 { $0 }` con `suggest`, solo en el body de una ruta o página fuera del `<head>` y con algún campo `later` en su `.fudapi`; `@catch (e) { }` solo detrás de la `}` de un `@await` sin `@catch` (SDD §4.1) | `language-server` | `src/services/snippets.ts` |
| [x] | 34 | 9, 33 | **Completado selectivo.** Detrás de `@await data.` solo los campos `later`, con su tipo resuelto como detalle; los demás campos no salen | `language-server` · `language-core` | `src/services/view-completion.ts` |
| [x] | 12 | 8–11, 33, 34 | **Los tests de la fase.** Criterios 3–8, 24 y 25; los del editor por el plugin del language server, no solo por el catálogo | `compiler` · `language-core` · `formatter` · `language-server` | `test/**` |

## Fase 3 — `@fudic/ssr`: vaciar el búfer y serializar por partes (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 13 | — | **`FLUSH`.** El símbolo y `HtmlPiece`; `htmlToByteStream` vacía el búfer al recibirlo y no hace nada con el búfer vacío | `ssr` | `src/stream.ts` · `src/index.ts` |
| [x] | 14 | — | **`partSerializer`.** `part()` saca lo añadido desde el último corte dejando abiertos los elementos abiertos; `end()` cierra lo que queda. Reutiliza las reglas de `serialize.ts` (vacíos, rawtext, DSD, escapes) | `ssr` | `src/serialize.ts` · `src/parts.ts` |
| [x] | 15 | 13, 14 | **Los tests de la fase.** `part()` + `end()` unidos dan los mismos bytes que `renderToString` sobre el mismo árbol, cortando a cualquier profundidad (dentro de `<table>`, `<ul>`, un anfitrión con DSD); `FLUSH` entrega antes de 8 KB | `ssr` | `test/**` |

## Fase 4 — el render por partes en el servidor (6)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 16 | — | **Layouts `async function*`.** El layout espera `body()` y `section()`; los tests que recorren `page` o `layout` en síncrono pasan a `for await`. Los goldens no cambian | `compiler` | `src/emit/layout.ts` · `src/emit/layout-code.ts` · `test/**` |
| [x] | 17 | 7, 14, 16 | **El emit por partes.** Con algún `@await`, `async function* page`; en cada `@await`: bloque de la parte, `part()`, `<!--fud-end-->`, `FLUSH`, esperar, cuerpo o `@catch` en el punto de inserción. Sin `@await`, el emit de hoy | `compiler` | `src/emit/module.ts` · `src/emit/layout.ts` · `src/emit/constructs.ts` |
| [x] | 18 | 17 | **El bloque por parte.** `data-fud-part` con `state` (`[firstId, offsets, data]` de lo reclamado en la parte), `fields`, `di`, y en la 0 los estáticos, `data` e `ioc`; nada vacío. `writeRouteClaim` en la parte 0. `ssr-dom` entrega el estado por tramos | `compiler` · `ssr` | `src/emit/maps.ts` · `src/ssr-dom.ts` · `src/seed.ts` |
| [x] | 19 | 17 | **Ninguna promesa suelta.** El wrapper engancha un manejador a cada campo `later` antes de pintar; un rechazo pasa a `Problem` (`problemOf`, `detail` solo en dev) y va al `@catch` o a `onError`; el aviso de redirección tras el primer byte en dev | `vite` · `compiler` | `src/wrapper.ts` · `src/emit/module.ts` |
| [x] | 20 | 17 | **El runtime con `async`.** `writeRuntimeTags` pone `async` en la etiqueta del runtime solo en las páginas con `@await`, y pide la pieza del lector de partes | `compiler` · `vite` | `src/emit/parts.ts` · `src/runtime-pieces.ts` |
| [x] | 21 | 18–20 | **Los tests de la fase.** Criterios 9–16, con promesas controladas y leyendo el `ReadableStream` trozo a trozo | `compiler` · `vite` | `test/**` |

## Fase 5 — la hidratación por partes en el navegador (6)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 22 | 18 | **El lector de partes.** `parts.ts`: con el documento cargándose, un `MutationObserver` recoge bloques `data-fud-part` y marcas `fud-end`; una parte está lista con su marca; con el documento completo, lo lee todo de una vez. Pieza aparte del runtime | `core` | `src/hydrate/parts.ts` · `src/runtime-entry.ts` |
| [x] | 23 | 22 | **Mapas en memoria y borrado.** `PageMaps` crece parte a parte; cada bloque y cada marca se borran al leerse; `readPageMaps` borra también los bloques del final en las páginas sin `@await`. El coordinador que lee `fud-ioc`/`fud-di` y `packages/testing` leen de memoria o del HTML servido, nunca del DOM vivo | `core` · `vite` · `testing` | `src/hydrate/maps.ts` · `src/coordinator.ts` · `src/providers.ts` |
| [x] | 24 | 23 | **Celdas por parte.** El barrido de `cells.ts` se hace al llegar cada parte; los anfitriones de una parte se hidratan con sus reglas de siempre en cuanto está lista | `core` | `src/hydrate/cells.ts` · `src/hydrate/install.ts` · `src/hydrate/cascade.ts` |
| [x] | 25 | 23 | **La ruta al final.** `raiseRoute` espera a la última parte; los componentes de cada parte no la esperan | `core` | `src/hydrate/install.ts` |
| [x] | 26 | 7 | **El constructo en el cliente.** `@await` pinta su cuerpo con `fields.<campo>.ok` o su `@catch` con `fields.<campo>.error`; con una promesa pendiente conserva lo pintado y repinta al cumplirse | `compiler` · `core` | `src/emit/markup-client.ts` · `src/emit/route-client.ts` |
| [x] | 27 | 22–26 | **Los tests de la fase.** Criterios 18–20, con un DOM que recibe los nodos poco a poco | `core` · `compiler` | `test/**` |

## Fase 6 — desarrollo, preview, el Service Worker y sin refresco implícito (7)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 28 | 17 | **Streaming en dev y preview.** `renderRouteHtml` y `previewRender` responden con el stream en lugar de `drainStream`; un error antes del primer byte sigue yendo a `page-errors.ts`. El prerender sigue drenando | `vite` | `src/plugin.ts` · `src/serve.ts` |
| [x] | 35 | — | **Los tipos de `load` y `layout` en la spec.** El `.fudapi` emite en la spec de la pieza `load` (y de `layout`) los tipos de sus campos, los que el codec de SDD-67 necesita para codificar el `data`. Decisión de Pedro (2026-10-30): el endpoint va en binario, no en JSON | `api` · `http` | `src/emit/*` · `src/contract/page.ts` |
| [x] | 29 | 19, 35 | **El endpoint por tramas, en binario.** En toda ruta, con el codec de SDD-67: la trama de `{ data, layout }` y una por campo `later` según se cumple; sin campos `later`, una sola trama. `load.fetch` (SDD-68) pasa a leer las tramas (SDD §3.7) | `vite` · `http` | `src/wrapper.ts` · `src/serve.ts` · `src/plugin.ts` · `src/contract/page.ts` |
| [x] | 30 | 29 | **El SW por tramas.** `fetchData` arma el `data` con promesas que cumplen las tramas y llama a `render` con la primera; la caché guarda la respuesta completa | `transport` | `src/router.ts` |
| [x] | 36 | — | **Sin refresco implícito.** Decisión de Pedro (2026-10-30), revierte en parte SDD-68 §4.8: una mutación de la ruta ya no hace que la página pida su `data` otra vez; solo lo hace una función que nombra la página en `invalidates`. El estado vive en las señales y lo actualiza el autor en sus handlers. La invalidación del caché del SW sigue igual | `http` | `src/contract/fn.ts` · `test/**` |
| [x] | 37 | 36 | **`usuarios.fud` actualiza su señal.** `activar` espera a `guardar` y pone `personas` al día, o devuelve el checkbox a su sitio si falló; `borrar` espera a `quitar` y quita la fila si no falló. Los comentarios y el texto que hablan de `/_fudic/data/usuarios` se corrigen | `examples/basic` | `src/routes/usuarios.fud` |
| [x] | 31 | 28–30, 36, 37 | **Los tests de la fase.** Criterios 17 y 21; una mutación sin `invalidates` no pide el `data`, una con `invalidates` de su página sí | `vite` · `transport` · `http` | `test/**` |

## Fase 7 — ejemplo y cierre (1)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 32 | 31 | **Ejemplo, docs, entrega y cierre.** `examples/basic/src/routes/espera.{fud,fudapi,ts}` del criterio 22 y su enlace en `site-nav`; Pedro lo prueba en el navegador y en el editor (criterio 26). Criterio 23: la guía de `@await` en el README del compilador (dónde va, lo lento abajo, el status no es una promesa) y `later` en el del `.fudapi`; decisiones 168–170 ya en `gramatica-v1-decisiones.md`; `pnpm typecheck`, `pnpm test` y `pnpm build` en verde y al 100 % en lo nuevo; SDD-70 y este fichero en `Hecho`, fila y registro del `INDEX.md` | varios | `examples/basic/**` · `packages/*/README.md` · `docs/sdd/*` |
