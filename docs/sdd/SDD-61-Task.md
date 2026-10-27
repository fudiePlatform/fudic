# SDD-61 — Tareas

> **SDD:** [SDD-61 — La vista portable](./SDD-61-vista-portable.md) ·
> [anexo de traducción](./SDD-61-anexo-traduccion.md)
> **Paquetes:** `@fudic/diagnostics` · `@fudic/compiler` · `@fudic/core` · `@fudic/dom` · `@fudic/ssr` ·
> `@fudic/typecheck` · `@fudic/language-core` · `@fudic/language-server` · `@fudic/formatter` ·
> `fudic-vscode` · `@fudic/vite` · `examples/*` · `packages/testing`
> **Rama:** `sdd-61-vista-portable-impl`. Nace de `main` **con SDD-60 en `Hecho`**: esta spec parte
> de un único `@code` y de su corte de servidor.
> **Progreso:** 44 / 44 — `Hecho`.

**Dos sesiones.** Una implementa y coordina. La otra escribe los tests de cada fase (las tareas
«Los tests de…») contra los criterios de SDD §6. Si un test destapa un defecto, se corrige el
código, no el test.

**El orden manda en tres puntos.**

- **El catálogo va antes que el código que lo usa.** Ningún `'FUD11xx'` provisional.
- **Los analizadores se activan en la tarea 36, cuando la migración ha terminado.** Hasta entonces
  corren detrás de un interruptor interno de los tests (`portableView: true` en la entrada del
  análisis). Así el repositorio compila en cada commit.
- **La migración va fichero a fichero, con `examples/basic` primero**, y cada fichero se comprueba
  con los analizadores activados en su test.

---

## Mapa de dependencias

```
1 códigos ─→ 2 reescritos ─→ 3 rango
   │
   ▼
4 @empty en la estructura ─→ 5 view-expressions ─→ 6 view-statements ─→ 7 view-identifiers
─→ 8 view-rest ─→ 9 view-control ─→ 12 tests                                    (fase 2a)
   │
   ▼
10 readModule ─→ 11 server-cut ─→ 44 tests                                      (fase 2b)
   │
   ▼
13 now() ─→ 14 now en fud-state ─→ 15 presencia y defectos ─→ 16 @empty servidor ─→ 17 @empty cliente
─→ 43 orden del spread ─→ 18 tests
   │
   ▼
19 portableTypeDiagnostics ─→ 20 project checker ─→ 21 language server ─→ 22 tests
   │
   ▼
23 proyección @empty ─→ 24 completado ─→ 25 gramática ─→ 26 formateador ─→ 27 tests
   │
   ▼
28 suite de conformidad ─→ 29 tests
   │
   ▼
30 basic: reloj, locales, carrito ─→ 31 basic: el resto ─→ 32 vista.fud ─→ 33 vista-errores
─→ 34 i18n y fixtures ─→ 35 tests reescritos ─→ 36 activar ─→ 37 tests del corpus
   │
   ▼
38 decisiones y SDD-51 ─→ 39 docs ─→ 40 producto ─→ 41 entrega ─→ 42 cierre
```

---

## Fase 1 — catálogo (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **Los códigos nuevos.** `FUD1140`–`FUD1153`: `.ts` con su función tipada, `.md` con la forma de SDD-50 §4.4 (título y «Fix» de SDD §5, citan `SDD-61`) y su línea en `index.ts` | `diagnostics` | `src/codes/FUD1140`–`1153.{ts,md}` · `src/index.ts` |
| [x] | 2 | 1 | **Reescritos.** Texto nuevo de `FUD0905`, `0907`, `0908`, `0910`, `0912`, `0913`, `0917`, `0919` (SDD §5). La retirada de `FUD0911` pasa a la tarea 36: la regla de SDD-51 lo emite hasta que se apaga, y borrar su `.ts` antes rompería el repositorio | `diagnostics` | `src/codes/FUD09xx.{ts,md}` · `src/index.ts` |
| [x] | 3 | — | **El rango.** `FUD1140`–`FUD1159` en la fila de SDD-61 del `INDEX.md` | — | `docs/sdd/INDEX.md` |

## Fase 2a — el compilador sin tipos: `@empty` y las reglas de la vista (7)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 4 | 1 | **`@empty`.** La estructura reconoce `} @empty { … }` tras el cuerpo de `@foreach`, `@for` y `@while` como `EmptyBlock` hijo del bucle, con `Span`. `FUD1149` si sigue a otra cosa o se repite. El `walk` lo entrega | `compiler` | `src/control/*` · `src/document/*` · `src/types/*` · `src/semantic/walk.ts` |
| [x] | 5 | 1 | **`view-expressions`.** Lista blanca de SDD §3.2–§3.5 bis: llamadas con argumentos que no sean `filter`/`map`/`reduce`/`toSorted`, `?.()` y llamado que no es camino (`FUD1140`; exento `t()` en valor de prop; una llamada sin argumentos sobre un camino es del pase tipado), `new` (`FUD1141`), operadores (`FUD1142`), literales (`FUD1143`; exento el objeto de huecos de `t()`), sintaxis TS (`FUD1144`), forma de las operaciones de colección (`FUD1145`: `reduce` sin inicial, flecha de bloque, nombre de función, parámetro o argumento de más), patrón de array o con clave calculada (`FUD1146`), toda flecha y función salvo el argumento de una operación de colección (`FUD0905`), regex (`FUD0919`). El cuerpo de esas flechas pasa por la misma lista, con sus parámetros en scope. Deja de emitir `FUD0911` y la parte de `0910`/`0912`/`0913`/`0917` que cubren las llamadas y los globales. La regla nueva no emite `FUD0911`; la vieja sí, hasta que la tarea 36 la quite, y por eso su retirada va allí. Los callbacks (SDD §3.1) quedan fuera | `compiler` | `src/semantic/analyzers/view-expressions.ts` |
| [x] | 6 | 5 | **`view-statements`.** `@{ }` solo `const`/`let` (con patrones de objeto) y reasignación de variables; `if`, `switch`, bucles, bloques y llamadas como sentencia son `FUD0908`. `@for`/`@while` siguen con `FUD0900`/`0901`/`0913` | `compiler` | `src/semantic/analyzers/view-statements.ts` |
| [x] | 7 | 5 | **`view-identifiers`.** Globales: solo `undefined` (`FUD0907`). En manejadores y callbacks, sin comprobación de globales; se conserva la regla de los nombres de `@{ }` | `compiler` | `src/semantic/analyzers/view-identifiers.ts` · `src/semantic/view-globals.ts` |
| [x] | 8 | 5 | **`view-rest`** (nuevo). Un `...resto` de la vista solo como `resto.campo`, spread de atributo o el origen de otro patrón (`const { b, ...r2 } = resto`); otro uso es `FUD1147` sobre el uso (SDD §3.6, anexo A.3.3) | `compiler` | `src/semantic/analyzers/view-rest.ts` · `ANALYZERS` |
| [x] | 9 | 5 | **`view-control`** (nuevo). `case` que no es un literal es `FUD1148` | `compiler` | `src/semantic/analyzers/view-control.ts` · `ANALYZERS` |
| [x] | 12 | 4–9 | **Los tests de la fase.** Criterios 2–5, 11, 12, 16–18 y 38 (salvo `xs.sort()`, que es de la tarea 22), cada código sobre su span exacto, uno por nodo | `compiler` | `test/semantic/*.test.ts` |

## Fase 2b — el compilador sin tipos: lo que el servidor evalúa del `@code` (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 10 | — | **`readModule`.** Campo opcional de `SemanticInput`: `(specifier, importer) => { path, source } \| undefined` para módulos del proyecto. Lo dan el plugin de Vite, `@fudic/typecheck` y el language server, con caché por ruta y versión | `compiler` · `vite` · `typecheck` · `language-server` | `src/semantic/model.ts` · hosts |
| [x] | 11 | 5, 10 | **`server-cut`** (nuevo). Sobre el corte de SDD-60 §4.8: la forma de cada declaración (`FUD1150` con `related` al uso), la lista blanca de los inicializadores con los mismos códigos, las llamadas del catálogo, `now()` (`FUD0912`), stores (siguiendo `export … from`) y módulos de datos (SDD §3.9) | `compiler` | `src/semantic/analyzers/server-cut.ts` · `ANALYZERS` |
| [x] | 44 | 10, 11 | **Los tests de la fase.** Criterios 19 (la parte sin tipos), 20, 21 y 24, cada código sobre su span exacto, uno por nodo; `readModule` en cada host | `compiler` · `vite` · `typecheck` · `language-server` | `test/**` |

## Fase 3 — runtime y emit (6)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 13 | — | **`now()`.** `export function now(): Date` en `@fudic/core`, podable por ruta | `core` | `src/now.ts` · `src/index.ts` |
| [x] | 14 | 13 | **`now()` en `fud-state`.** Una señal inicializada con `now()` lleva siempre su valor en el slot de su instancia; el cliente que hidrata lo toma de ahí (`$pN ?? signal(now())`) y no llama a `now()` | `compiler` · `ssr` · `core` | `src/emit/*` · `src/ssr-dom.ts` |
| [x] | 15 | — | **Presencia y defectos.** En la vista y en el corte, `=== null`/`=== undefined` (y `!==`) se emiten como `== null`/`!= null`; el defecto de un patrón de la vista como `?? defecto` | `compiler` | `src/emit/*` |
| [x] | 16 | 4 | **`@empty` en el servidor.** Los tres bucles cuentan vueltas y, con cero, pintan el bloque | `compiler` · `ssr` | `src/emit/markup.ts` |
| [x] | 17 | 4 | **`@empty` en el cliente.** Rama del constructo con su marca de hidratación, como una rama de `@if`; la reconciliación del `@foreach` la monta con cero elementos y la desmonta con alguno; `@for` y `@while` igual al reevaluarse | `compiler` · `core` | `src/emit/markup-client.ts` · `src/hydrate/*` |
| [x] | 43 | — | **Orden del spread.** `attrsOf` y `attrsDiff` devuelven los atributos ordenados por nombre (unidades UTF-16); el emit llama a `setAttrs` una vez por elemento, en el sitio del primer spread, con todos sus objetos (SDD §3.8, §4.4.5) | `dom` · `compiler` | `dom/src/attrs.ts` · `compiler/src/emit/*` |
| [x] | 18 | 13–17, 43 | **Los tests de la fase.** Criterios 10, 13 (orden y D6 del anexo), 14, 15, 19 (pinta `20`), 25, 28, 36 (servidor y cliente) y 40 | `compiler` · `core` · `testing` | `test/**` |

## Fase 4 — el pase tipado (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 19 | 1 | **`portableTypeDiagnostics(program, document)`.** Con el checker sobre la proyección, como `propShapes`: llamada sin argumentos no reactiva (`FUD1140`), condiciones, flecha de `filter` y operandos lógicos (`FUD1151`), operandos de §3.4 —`<` admite dos `number`, dos `string` o dos `Date`— y comparador de `toSorted` (`FUD1152`), tipos de §3.10 (también lo que da `map` y el acumulador de `reduce`), iterable, índice, `key`, `@switch`, literal de objeto sin tipo con nombre, desestructurar o esparcir un `map`, operación de colección sobre algo que no es lista y `.length` sobre algo que no es lista ni texto (`FUD1153`). Símbolos por el nombre que imprime el checker; importación de `typescript` solo de tipos | `typecheck` | `src/portable-types.ts` · `src/index.ts` |
| [x] | 20 | 19 | **En dev y en build.** El project checker lo llama: en dev, terminal y overlay; en build, el build falla | `typecheck` · `vite` | `typecheck/src/checker.ts` · `vite/src/dev-typecheck.ts` · `vite/src/background-check.ts` |
| [x] | 21 | 19 | **En el editor.** El language server lo publica por el mismo canal que los demás `FUD`, con el mismo span | `language-server` | `src/services/*` |
| [x] | 22 | 19–21 | **Los tests de la fase.** Criterios 2 (`@hora()`), 6, 7, 8, 9, 22, 23, 38 (`xs.sort()`), 39, y el mismo span en build y editor (30) | `typecheck` · `language-server` | `test/**` |

## Fase 5 — editor (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 23 | 4 | **Proyección de `@empty`.** `if ($empty()) { … }` tras el bucle, con `declare function $empty(): boolean` en `GLOBALS_DTS`; el cuerpo tipa con el scope de fuera | `language-core` | `src/template/control.ts` · `src/globals.ts` |
| [x] | 24 | — | **Completado de la vista.** En las posiciones de SDD §3.1 se filtran los métodos y funciones (salvo valores reactivos) y los globales salvo `undefined`; sobre una lista quedan `filter`, `map`, `reduce`, `toSorted` y `length`, y sobre un texto solo `length`; en manejadores y callbacks, sin filtro. Tras la `}` de un bucle se ofrece `@empty` | `language-server` | `src/services/*` |
| [x] | 25 | — | **Gramática.** `@empty` como palabra clave de control en la TextMate de `.fud` | `vscode` | `syntaxes/fudic.tmLanguage.json` |
| [x] | 26 | 4 | **Formateador.** `} @empty {` en la línea de la `}` del bucle, como `} else {` | `formatter` | `src/*` |
| [x] | 27 | 23–26 | **Los tests de la fase.** Criterio 30 (completado y `@empty`), formateo idempotente con `@empty`, coloreado | `language-core` · `language-server` · `formatter` · `vscode` | `test/**` |

## Fase 6 — conformidad (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 28 | 12, 44, 18, 22 | **La suite.** Un `.fud` por fila de SDD §3.2–§3.12 con datos fijos y su `.html` de servidor esperado, incluidos los casos frontera de SDD §4.6, cada fila del recetario de colecciones (§3.5 bis) y el ejemplo guía 3 del anexo (A.8) | `testing` | `test/conformance/*.fud` · `*.html` |
| [x] | 29 | 28 | **El test.** Monta cada fixture con `mount` y compara byte a byte; las filas de pipes, salvo el texto formateado (criterios 29 y 37) | `testing` | `test/conformance/conformance.test.ts` |

*Decidido al implementar (fase 6).* La suite destapó cuatro huecos, cerrados aquí para que todos
los backends pinten lo mismo (SDD §4.4, §4.6): el arnés compila con el idioma de la app y acepta
un `Date` en las props; `fud-state` marca un `Date` a cualquier profundidad; el defecto de una
prop de `props<T>()` se aplica también con `null` en TS (servidor, cliente y layout), como en los
otros cinco; y el pase tipado da por presente un nombre con defecto y no trata como dato el objeto
de opciones de un preset de pipe.

## Fase 7 — migración (8)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 30 | 13, 16 | **`examples/basic`: reloj, locales y carrito.** `"locales": ["es"]` en `fudic.json`; `app-clock` y `ruta-reloj` con presets `date` (`timeZone: "Europe/Madrid"`) y `signal(now())`; `shopping-cart` con `currency('EUR')` | `examples` | `basic/fudic.json` · `app-clock.fud` · `ruta-reloj.fud` · `shopping-cart.fud` |
| [x] | 31 | 30 | **`examples/basic`: el resto** de la tabla de SDD §4.7: `signal-control`, `ruta-reactiva`, `signal-while` (+ `signal-while.fudapi`), `snippets` (`type Paso`), `vista-url`, `campo-texto`, `blog/index`, `app-calendar` y cada `@if (xs.length === 0)` que pinta un vacío (→ `@empty`); cada `some`/`find`/`join`/`includes`/`sort` por su receta de SDD §3.5 bis | `examples` | `basic/src/**` |
| [x] | 32 | 31 | **`vista.fud`.** Reescrito como catálogo positivo: un caso por fila de SDD §3 y por fila del recetario de colecciones, cada uno con «sin diagnóstico» | `examples` | `basic/src/routes/vista.fud` |
| [x] | 33 | 31 | **`vista-errores`.** Un caso por código nuevo y por ampliación, con «FUDnnnn sobre `texto`» | `examples` | `vista-errores/vista-errores.fud` |
| [x] | 34 | 31 | **`examples/i18n` y fixtures.** `app-greeting` (`alta` como prop desde el `load`); fixtures de `compiler` (`app-list`), `formatter` (`snippets`), `testing`, `language-core`, `language-server`, `workbench` | `examples` · varios | `i18n/src/**` · `packages/*/fixtures/**` · `packages/*/test/**` |
| [x] | 35 | 34 | **Tests reescritos.** Los que escribían algo que sale (`find`, `some`, `join`, `@{ }` con bucles…) se reescriben sin perder el caso que probaban | varios | `packages/*/test/**` |
| [x] | 36 | 35 | **Activar.** Fuera el interruptor `portableView` —de `SemanticInput`, de `CheckOptions` del project checker y del contexto del servicio del language server—: los analizadores y el pase tipado corren siempre. Se borran la regla de SDD-51 (`view-js.ts`) y `VIEW_GLOBALS`, y se retira `FUD0911`: se borra su `.ts` y su línea de `index.ts`, y su `.md` queda `retired` con `FUD1140` | `compiler` · `diagnostics` | `src/semantic/*` · `src/codes/FUD0911.*` |
| [x] | 37 | 36 | **Los tests del corpus.** Criterios 1, 32 y 33: ningún `.fud` fuera de `experiments/` da un diagnóstico de esta spec; `vista-errores` da exactamente sus comentarios | `compiler` · `typecheck` | `test/corpus*.test.ts` |

*Decidido al implementar (fase 7).* Una pasada con los analizadores encendidos sobre todo
el repositorio destapó tres huecos, cerrados para que todos los backends pinten lo mismo: el defecto
de una prop de `props<T>()` puede ser un literal de datos (`rows = []`, `m = {}`), como el valor de
una señal; `string | TrustedURL` porta como valor de URL (SDD §3.10) también en el pase tipado; y en
una app con idiomas los ficheros `server/` y `browser/` de una librería se compilan por idioma, porque
rellenan los contratos de ese idioma (sin ello, `"locales"` en `examples/basic` dejaba `csrf` sin
implementar). El arnés de `@fudic/testing` hace lo mismo con idiomas: un test es un módulo del primer
idioma de la app, así que su `.fud`, su `fudic:<id>` y lo que mockea son los de ese idioma, y la raíz
del servidor en memoria también; los tests de `examples/basic` no cambian. Y en dev un módulo vigila
su catálogo solo si existe: Vite tomaba el fichero vigilado por un import y, sin catálogo (el idioma
del código no tiene), la página del navegador no cargaba. En la migración:
`signal-control` y `ruta-reactiva` conservan su `@foreach` filtrando una lista fija (el test de
navegador mide su reconciliación); los calendarios leen dos listas literales de `data/days.ts` en
lugar de una fábrica; `raw-demo` pierde el caso del `as` (SDD §4.7). El golden de la tabla de
hidratación gana las filas de la suite de fase 6; ninguna fila existente cambia. `vista.fud` se reescribe
con sus datos en un `load` (las fechas del recetario solo llegan así) y la parte reactiva —`signal`,
`computed`, `now()`, `@empty` en vivo y manejadores— en un componente nuevo, `vista-tareas`: la ruta
sigue sin ser reactiva y su fila del golden solo gana esa etiqueta entre las que hidratan.
`vista-errores` se reescribe para la vista portable y su test lo lee por el canal del build: el
project checker con el interruptor enciende también el pase semántico portable, y los casos del
corte de servidor llevan su comentario en líneas `//` (en el `@code` y en `util.ts`). Los casos de
SDD-51 se quedan como fixture del test del compilador hasta que la tarea 36 borre su regla. El
ejemplo destapó tres voces dobles del pase tipado, cerradas: no entra en una sentencia de `@{ }` que
no es una asignación, ni en `f?.()`, ni en un objeto o lista literal que devuelve `map` o que es el
valor inicial de `reduce` (`FUD0908`, `FUD1140` y `FUD1143` del compilador ya lo dicen).
En la tarea 34: `app-cart` de `examples/i18n` pinta su plural como texto, que los catálogos
reescriben (como `app-greeting`), porque `t()` solo vale en una prop; la fecha de `app-greeting` llega
del `load` de la portada. En `@fudic/testing`, el reloj del criterio 25 pinta con un pipe y pasa al
proyecto de conformidad, que tiene idioma; `x-signup` declara su form en un `.fudapi` y pasa, con sus
tests, a `test/app`, el proyecto con contratos; el snippet `fila` recibe los campos. Las páginas
`expected/*.fud` del banco no cambian: importan `C:/proj/…`, que no existe en el disco, y el
criterio 22 las comprueba en la tarea 37 dentro del proyecto que nombran, `examples/basic`.
En las tareas 35 a 37: los tests que escribían algo que sale se reescriben con su equivalente portable
(una fecha con pipe, una lista vacía para un fallo de render, un tipo con nombre para un literal); los
que probaban la regla de SDD-51 se van con ella. La red del corpus es doble: el pase semántico sobre
cada `.fud` versionado, y el project checker sobre cada proyecto del repositorio, con una lista de
raíces que un test mantiene completa. Destapó dos huecos, cerrados: un import absoluto de Windows
(`C:/…`) es un módulo del proyecto, no un paquete; y el banco lee un fixture como `fixtures.minima`, o
como `fixtures["titulo-largo"]` cuando el nombre no cabe tras un punto, índice que el pase tipado acepta
porque nombra un campo declarado (`post["title"]` sigue siendo `FUD1153`, criterio 9).

## Fase 8 — cierre (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 38 | 36 | **Decisiones.** 162 (lista blanca portable; enmienda 137, 138 y 141), 163 (`@empty`), 164 (el corte y los tipos portables), 165 (`now()`), 166 (las cinco operaciones de colección y `<` entre textos y fechas) en la gramática y su índice. Nota en la cabecera de SDD-51: «Enmendada por SDD-61» | — | `docs/gramar/gramatica-v1-decisiones.md` · `docs/sdd/SDD-51-expresiones-de-la-vista.md` |
| [x] | 39 | 36 | **Docs.** La guía de la vista de cada README que la explique (lo que vale, las colecciones con su recetario, `@empty`, `now()`), en inglés y sin citar SDD | varios | `packages/*/README.md` · `examples/*/README.md` |
| [x] | 40 | 37 | **Producto.** `examples/basic` en el navegador: reloj, carrito, blog vacío y lleno (`@empty`), `signal-while`, `usuarios` y `user-form` como antes. Tabla de hidratación sin cambios (criterio 34) | `examples` | — |
| [x] | 41 | 40 | **Entrega.** `pnpm typecheck`, `pnpm test` y `pnpm build` en verde; lo nuevo al 100 % en las cuatro métricas sin `v8 ignore`; ningún umbral baja (criterio 35) | — | — |
| [x] | 42 | 41 | **Cierre.** SDD-61 y este fichero en `Hecho`; fila y registro de progreso del `INDEX.md` | — | `docs/sdd/*` |

## Traspaso (2026-10-27) — cerrado

Todo lo de abajo está hecho; se conserva como registro. `/raw` se resolvió con el tipo `html` del
`.fudapi` (decisión 167): el caso sin marca vuelve, llega del servidor y `@raw` lo escapa.

### Lo que quedaba para cerrar 40–42

Lo pendiente lo decidió Pedro; no se reabre. La referencia es `main`: `examples/basic` debe dar lo mismo
que en `main` (salvo lo aceptado abajo), comprobado con build, preview y dev, en `sw` y en `nosw`.

**Hecho en esta sesión** (en el working tree, sin commitear todavía):

- Globs de cobertura anclados al paquete en los 19 `vitest.config.ts` que usan `include`. Vitest compara
  el glob con la ruta ABSOLUTA sin anclar (`contains: true`), y el `impl/` del nombre de este worktree
  metía `test/` en la cobertura de forms y http. En `main` están al 100 % y siguen al 100 %. El
  `exclude: ['test/**']` de `testing` sobraba y se ha quitado.
- `view-ast.ts` (nuevo en la rama, sin umbral): fuera `hasBreak` y `acts`, que estaban muertos; tests
  en `view-portable.test.ts` y umbral del 100 % en `compiler/vitest.config.ts`. `view-scope.ts` al 100 %.
- Lo que la rama dejaba sin cubrir respecto a `main`: un test del spread mal formado en
  `spread-attrs.test.ts` (`attrs.ts`) y una rama muerta menos en `emit/resolve.ts`. Comparado fichero a
  fichero con `main`: ninguno empeora en compiler, cli, dom, ssr, transport ni vite.
- Fixtures de vite que la vista portable rompía: `@enlace()` (i18n-build) y `data as {...}` en las
  páginas de error (i18n-serve, http-build).
- `hookTimeout` en typecheck; `testTimeout: 30_000` en vite, medido: la rama NO es más lenta en esos
  tests, solo pasaban de 5 s con la máquina cargada.
- `pnpm typecheck` y `pnpm build` en verde. `pnpm test`: todo en verde salvo `examples/basic` (punto 2).

**Actualización (tarde del 2026-10-27):** los puntos 1, 2 y 4 están HECHOS.
1. `edge.ts` y el middleware de funciones de dev cargan `functions.mjs` y la raíz con el primer locale:
   un solo grafo, una sola copia de `people` (de 78 chunks de servidor a 50). Playwright
   `usuarios.spec` pasa en los tres proyectos.
2. Además de `realpathSync`: `@fudic/i18n` importaba los TIPOS de la raíz de `@fudic/diagnostics`, que
   reexporta los 362 códigos, y el typecheck de toda app que use un pipe los cargaba (de 491 a 872
   ficheros en el programa). Ahora diagnostics exporta `./types` y i18n importa sus tipos de ahí (512
   ficheros). Resultado, 7 builds alternados: `main` 7,98 s mínimo / 8,47 s mediana, rama 8,31 / 8,70
   (+3 %, dentro del ruido y con más contenido). El doble parseo del lowering mide 0,1 s en total: no
   se ha tocado.
4. Las expectativas del carrito están puestas a `3,50 €`, etc.
Punto 5 hecho: `pnpm build`, `pnpm typecheck` y `pnpm test` en verde (29 suites); Playwright de
`examples/basic` con 267 de 268 (el que falla, la primera búsqueda de `/usuarios` en `preview`, falla
igual en `main`: 1 de cada 15 pasadas, inestable desde antes). El HTML contra `main` da las mismas
diferencias explicadas. El worktree `main-cov` está borrado. Solo queda el punto 3 (`/raw`), que
necesita una decisión de Pedro (abajo), y la tarea 42.

**Pendiente, en este orden:**

1. **Estado duplicado por locale (rompe `/usuarios`).** Con `"locales": ["es"]` (lo pide el SDD), vite
   compila cada módulo del proyecto dos veces, normal y `?locale=es`: en `.fudic/edge/c` hay dos
   `people-*.js`. `functions.mjs` escribe en una copia y la página lee de la otra. Es
   `compilesPerLocale` en `packages/vite/src/i18n.ts`. Arreglo decidido (opción a): un módulo de datos es
   UNA instancia en el servidor; lo mínimo, que con un solo locale y sin prefijo la pasada normal y la
   del locale sean la misma. Playwright: fallan `usuarios.spec` 104 y 162 en los tres proyectos.
2. **Rendimiento: NO se acepta que sea más lento.** Medido con perfiles de CPU (`NODE_OPTIONS=
   "--cpu-prof --cpu-prof-dir=…" npx vite build` en las dos ramas, comparando el tiempo inclusivo de cada
   función) y con 5 builds alternados de cada rama (mediana):
   - **Arreglado:** `implementationDirs()` (vite `plugin.ts`, añadido en esta rama) hacía dos
     `realpathSync` por librería en CADA `resolveId` de un grafo con locale: ~0,76 s. Ahora va memorizado
     por `api`. Con eso, la mediana pasa de +20 % (7,36 s → 8,83 s) a +13 % (7,66 s → 8,66 s).
   - **Lo que queda (~1 s):** typecheck (`check`/`collect` de `@fudic/typecheck`, +0,4 s); lowering
     portable (`lowering()` en `compiler/src/emit/resolve.ts`, +0,1 s propio; 239 llamadas para 177
     ficheros, así que la caché funciona); `load`/`resolveDocument`/`parse` +0,3 s (el lowering parsea y
     luego `load` vuelve a parsear); y la doble pasada del servidor por locale del punto 1. Parte de la
     diferencia es contenido nuevo de `examples/basic` (`/vista`), que `main` no tiene.
   - Siguiente paso: arreglar el punto 1 y volver a medir; después atacar el doble parseo (reutilizar
     el documento que ya parseó `lowerPortable` cuando no hay nada que rebajar) y el typecheck.
   - El primer test de cada fichero de `examples/basic` pasaba de ~3 s a ~4 s (por eso no llegaba en
     5 s en `pnpm test`). Hay que volver a medirlo tras los arreglos. No se resuelve subiendo timeouts.
3. **`/raw`: hay que recuperar el caso del string sin marcar.** El framework lo necesita. La rama lo
   quitó de `raw-demo.fud`, de `raw.fud`, de `raw.spec.ts` y de la §4.7 del SDD porque
   `"…" as unknown as TrustedHTML` no es portable. Hay que devolverlo con una forma que la vista acepte, y
   restaurar el test (`git diff main -- examples/basic`). Ya probado: moverlo a un `src/data/*.ts` no
   sirve (un módulo de datos que importa un `.fud` también es portable: `FUD1144`), y `.fudapi` no tiene
   ningún tipo de HTML. Opciones para Pedro: añadir a `.fudapi` un tipo `html` (llega del servidor sin
   marca, el caso real), o dar el caso por cubierto con el test del compilador.
4. **Carrito: aceptado.** `currency("EUR")` pinta `3,50 €` donde antes salía `3.50 €`. Hay que poner
   las tres expectativas de `tests/hydration.spec.ts` (tests 11–13: `3,50 €`, `7,50 €`, `5,50 €`).
5. Después: `pnpm build`, `pnpm test` (con `NO_COLOR=1 FORCE_COLOR=0 TERM=dumb`) y `npx playwright test`
   en `examples/basic` (preview, dev y nosw; en `main`, 268 en verde), y repetir la comparación con `main`.
   Por último, la tarea 42 y un commit sin push.

**Diferencias con `main` que ya están explicadas** (HTML de build y de preview, sw y nosw, 28 rutas en
200): `/resto` ordena por nombre los atributos del spread (§3.8); `/ruta-reloj` lleva las fechas en el
estado (`now()`) y una zona horaria fija; `/blog` mete el vacío de `@empty` dentro de `<section>`;
`/vista` está rehecha; en `nosw` cambia el orden de los `modulepreload` (son los mismos módulos). El
resto es idéntico una vez enmascarados hashes, id de build y nonces.

**Entorno:** hay un worktree temporal de `main` en `.claude/worktrees/main-cov` (ya instalado y
construido), solo para comparar. Hay que BORRARLO al terminar: `git worktree remove --force` y, si
queda la carpeta, `cmd /c rmdir /s /q`. Los puertos de Playwright (4173, 5273, 4273) tienen que estar
libres antes de lanzarlo, porque usa `reuseExistingServer`.
