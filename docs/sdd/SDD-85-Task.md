# SDD-85 — Tareas

> **SDD:** [SDD-85 — Crear clonando una plantilla, y las clases sin pisar](./SDD-85-crear-clonando-y-clases.md)
> **Paquetes:** `@fudic/dom` · `@fudic/ssr` · `@fudic/compiler` · `@fudic/vite` · `@fudic/core` ·
> `@fudic/testing` · `@fudic/mcp` · `examples/basic`
> **Rama:** `sdd-85-crear-clonando`, desde `main`.
> **Progreso:** 25 / 34 — `En curso`.

**El orden manda en tres puntos.**

- **`@fudic/dom` antes que el compilador.** El emit llama a `template`, `toggleClass` y `swapClass`.
- **Las clases antes que la plantilla.** La plantilla lleva la clase estática ya resuelta, y el paso de
  escribir valores al crear usa los escritores de clase nuevos.
- **La equivalencia (tarea 24) antes de borrar el cuerpo de fabricar (tarea 21).** Es lo que prueba que
  el camino nuevo hace lo mismo que el viejo. Se escribe primero contra el `c` viejo, en verde, y tiene
  que seguir en verde con el nuevo.

---

## Fase 1 — `@fudic/dom` y `@fudic/ssr`

- [x] **1. El escape, a `@fudic/dom`.**
  - `escapeText` y `escapeAttr` se mueven a `@fudic/dom` y se exportan. `@fudic/ssr` los reexporta sin
    cambiar su API (SDD §3.3).
  - *Depende de:* —.
  - *Paquetes:* `dom`, `ssr`.
  - *Ficheros:* `dom/src/escape.ts`, `dom/src/index.ts`, `ssr/src/serialize.ts`, `ssr/src/index.ts`.
- [x] **2. `template` y `templateIn`.**
  - Literal único y congelado o `TypeError`; parseo perezoso en la primera llamada, a través de
    `trustedHtmlOf`; `cloneNode(true)` del contenido; `templateIn` devuelve los hijos del envoltorio
    (SDD §3.1).
  - Exportados desde `index.ts` con el tipo `Template`.
  - *Depende de:* —.
  - *Paquete:* `dom`.
  - *Ficheros:* `src/template.ts`, `src/index.ts`.
- [x] **3. La pieza `dom/template`.**
  - Entrada en `rolldown.config.ts`, importando `dom/trusted` como externa (frontera con estado).
  - *Depende de:* 2.
  - *Paquete:* `dom`.
  - *Ficheros:* `rolldown.config.ts`.
- [x] **4. `toggleClass` y `swapClass` en el contrato y en el navegador.**
  - Los dos métodos en `Dom<N>` y en `browserDom`, con tokens separados por espacio ASCII (SDD §3.2).
  - *Depende de:* —.
  - *Paquete:* `dom`.
  - *Ficheros:* `src/dom.ts`, `src/browser.ts`.
- [x] **5. `toggleClass` y `swapClass` en `SsrDom`.**
  - Un conjunto ordenado de tokens por elemento que se serializa como `class`; sin tokens, sin
    atributo (SDD §4.5, reglas 2 y 3).
  - *Depende de:* 4.
  - *Paquete:* `ssr`.
  - *Ficheros:* `src/ssr-dom.ts`, `src/tree.ts`.
- [x] **6. La `class` de un spread, por tokens.**
  - `setAttrs` escribe `class` con `swapClass` en el navegador y en el servidor; el resto de atributos
    como hoy (SDD §3.2, §4.5 regla 4).
  - *Depende de:* 4, 5.
  - *Paquetes:* `dom`, `ssr`.
  - *Ficheros:* `dom/src/browser.ts`, `dom/src/attrs.ts`, `ssr/src/ssr-dom.ts`.
- [x] **7. Tests de la fase.**
  - `template`: literal válido, string, literal con huecos, perezoso (no crea la policy sin llamar),
    con y sin `trustedTypes`, `templateIn` con SVG y MathML.
  - `toggleClass` / `swapClass` / spreads en los dos adaptadores. `dom` y `ssr` al 100 %.
  - *Depende de:* 1–6.
  - *Paquetes:* `dom`, `ssr`.
  - *Ficheros:* `dom/test/template.test.ts`, `dom/test/browser.test.ts`, `ssr/test/ssr-dom.test.ts`.

## Fase 2 — compilador: las clases

- [x] **8. La clase estática, como literal.**
  - `setAttr(el, 'class', 'a b')` sin `filter` ni `join`, en el servidor y en el cliente. Los tokens
    que tienen su propio `class:` se quitan del literal (SDD §4.5, regla 1).
  - *Depende de:* —.
  - *Paquete:* `compiler`.
  - *Ficheros:* `src/emit/attrs.ts`.
- [x] **9. `class:` con `toggleClass`.**
  - Al pintar en el servidor, al crear y en cada cambio en el cliente; nada al hidratar (SDD §4.5).
  - *Depende de:* 4, 8.
  - *Paquete:* `compiler`.
  - *Ficheros:* `src/emit/attrs.ts`, `src/emit/markup-client.ts`, `src/emit/block.ts`.
- [x] **10. `class=@expr` con `swapClass`.**
  - Guardando el valor anterior para el siguiente cambio; orden de §4.5 regla 2; con `class:` en el
    mismo elemento, regla 5.
  - *Depende de:* 4, 8.
  - *Paquete:* `compiler`.
  - *Ficheros:* `src/emit/attrs.ts`.
- [x] **11. Tests de emit de las clases.**
  - Criterios 19, 23, 24 y 25 sobre el código emitido y su ejecución en el servidor.
  - *Depende de:* 8–10.
  - *Paquete:* `compiler`.
  - *Ficheros:* `test/emit/classes.test.ts`.

## Fase 3 — compilador: la plantilla

- [x] **12. El cuarto cuerpo del recorrido: el HTML de la plantilla.**
  - Elementos, atributos estáticos (escapados con `escapeAttr`), texto estático (`escapeText`), tramos
    con las partes dinámicas vacías, comentarios separadores, bloques cerrados, hosts de hijos vacíos
    (SDD §4.1).
  - *Depende de:* 1, 8.
  - *Paquete:* `compiler`.
  - *Ficheros:* `src/emit/markup-client.ts`, `src/emit/template-html.ts`.
- [x] **13. Los contenidos especiales.**
  - RCDATA (`<textarea>`, `<title>`), `<script>` de datos, `<template>` del autor y `@raw` vacío, como
    los escribe el servidor (SDD §4.1).
  - *Depende de:* 12.
  - *Paquete:* `compiler`.
  - *Ficheros:* `src/emit/template-html.ts`.
- [x] **14. El literal y SVG / MathML.**
  - Una constante por plantilla a nivel de módulo; escape de `\`, `` ` `` y `${`; `templateIn` con su
    envoltorio cuando la raíz del trozo está en SVG o MathML (SDD §3.1, §4.1).
  - *Depende de:* 2, 12.
  - *Paquete:* `compiler`.
  - *Ficheros:* `src/emit/template-html.ts`, `src/emit/client.ts`, `src/emit/route-client.ts`.
- [x] **15. Una plantilla por rama y por cuerpo de bloque.**
  - `@if` / `else`, cada `case`, `@foreach`, `@for`, `@while` y cada rama de `@await` (SDD §4.1).
  - *Depende de:* 12, 14.
  - *Paquete:* `compiler`.
  - *Ficheros:* `src/emit/block.ts`, `src/emit/constructs.ts`.
- [x] **16. Tests de la plantilla.**
  - Criterios 2, 3, 4, 5 y 6 sobre el HTML generado.
  - *Depende de:* 12–15.
  - *Paquete:* `compiler`.
  - *Ficheros:* `test/emit/template-html.test.ts`.

## Relevo de la fase 3 para la fase 4

Lo que la siguiente sesión tiene que saber antes de empezar, decidido con Pedro el 2026-11-16:

- **El orden de los atributos no cuenta.** Todo atributo dinámico (no solo los de un spread) queda
  detrás de los estáticos en un elemento creado, porque la plantilla trae los estáticos y el paso 3
  escribe el resto. La tarea 24 compara los atributos como **conjunto** de nombre y valor; el orden
  de los nodos, el texto, el tipo y el espacio de nombres sí se comparan. Ya está en la spec (§5 y
  §8.2, decisión 22). La condición de Pedro: que funcione sin dejar dudas, así que la comparación
  tiene que ser estricta en todo lo demás.
- **Dónde está cada pieza.** `ClientMarkupEmitter.template` da el `TemplateHtml` de cada recorrido;
  `Templates.add()` devuelve el nombre de la constante (`$TN`) o `null` si el trozo no tiene nodos
  propios. Hoy ese nombre se descarta en `block.ts` (`#declare`) y en `client.ts` (tras
  `emitRoots`): la fase 4 lo guarda y lo usa en el `c`.
- **`LiteralSink`.** Los atributos literales pasan por `#literal` en `markup-client.ts`, que hoy
  escribe el `setAttr` en el cuerpo de fabricar **y** en la plantilla. Al borrar el cuerpo de
  fabricar (tarea 21), `#literal` solo escribe en la plantilla. Las URL de asset y el `setAttrs` de
  un spread en su sitio no son literales: van a `fixed` y tienen que acabar en el paso 3.
- **Un caso a vigilar en la tarea 24:** un `<option selected>` estático dentro de un `<select
  value=@x>`. El servidor quita ese `selected` y escribe `selected=""` en la opción elegida; la
  plantilla lleva el estático y el navegador elige por la propiedad. Si la equivalencia lo marca, se
  resuelve en el emisor, no con una excepción en la comparación.
- **Tests.** Los arneses que evalúan chunks reciben `$template` / `$templateIn` como globales
  (`test/setup-templates.ts`). Los goldens se regeneran con
  `pnpm --filter @fudic/compiler exec vitest run test/emit/golden.test.ts -u`.
- **Paquetes intactos hasta la fase 5:** el chunk ya importa de `@fudic/dom` la pieza `template`,
  pero el manifiesto de vite aún no la conoce (tarea 26). No se ha corrido `pnpm build` del ejemplo.

## Fase 4 — compilador: el nuevo `c`

- [x] **17. La adopción con los bloques cerrados.**
  - Un parámetro del recorrido de adopción: «el servidor pintó los bloques» (para `h`) o «están
    cerrados» (para `c`). En el segundo caso no se llama al `h` de los bloques (SDD §4.3).
  - *Depende de:* —.
  - *Paquete:* `compiler`.
  - *Ficheros:* `src/emit/markup-client.ts`, `src/emit/block.ts`.
- [x] **18. Escribir una vez cada valor.**
  - Un pase que llama una vez a cada escritor de `u` con el valor actual: textos (`setText`),
    atributos, `class:`, `class=@expr`, `setLive`, spreads (`setAttrs`), `@raw` (SDD §4.2 paso 3,
    §4.4, §4.6).
  - *Depende de:* 9, 10, 17.
  - *Paquete:* `compiler`.
  - *Ficheros:* `src/emit/markup-client.ts`, `src/emit/attrs.ts`.
- [x] **19. El `c` raíz: clonar, adoptar, escribir, abrir, levantar, enganchar.**
  - Los seis pasos de SDD §4.2 en la raíz del componente.
  - *Depende de:* 14, 17, 18.
  - *Paquete:* `compiler`.
  - *Ficheros:* `src/emit/client.ts`, `src/emit/markup-client.ts`.
- [x] **20. El `c` de los bloques.**
  - Clonar en un fragmento, adoptar dentro con el fragmento como `$parent`, escribir, abrir los bloques
    internos, levantar hijos; `m` y `move` como hoy; filas con clave (SDD §4.2).
  - *Depende de:* 15, 17, 18.
  - *Paquete:* `compiler`.
  - *Ficheros:* `src/emit/block.ts`.
- [x] **21. Lo que se va.**
  - Borrar el cuerpo de fabricar y los helpers que solo usaba él; actualizar el comentario de cabecera
    de `markup-client.ts` (SDD §4.9). Criterio 7.
  - *Depende de:* 19, 20, 24 en verde con el camino nuevo.
  - *Paquete:* `compiler`.
  - *Ficheros:* `src/emit/markup-client.ts`, `src/emit/block.ts`, `src/emit/runs.ts`.
- [x] **22. La necesidad de Trusted Types.**
  - `paintsHtml` es cierto en todo chunk que lleva una plantilla, así que registra
    `TRUSTED_TYPES_NEEDS` (SDD §4.7).
  - *Depende de:* 19, 20.
  - *Paquete:* `compiler`.
  - *Ficheros:* `src/emit/client.ts`, `src/emit/route-client.ts`.
- [x] **23. Source maps.**
  - Cada literal de plantilla y cada línea del `c` nuevo apuntan al elemento o al bloque del `.fud`
    que los genera.
  - *Depende de:* 19, 20.
  - *Paquete:* `compiler`.
  - *Ficheros:* `src/emit/source-locations.ts`, `src/emit/maps.ts`.
- [x] **24. La prueba de equivalencia.**
  - Criterio 8: para cada fixture con controlador de cliente y cada componente de `examples/basic`,
    el árbol de `c` contra el del HTML del servidor parseado, en happy-dom, con todos los bloques
    abiertos y con todos cerrados. Se escribe primero contra el `c` viejo.
  - *Depende de:* 9, 10.
  - *Paquete:* `compiler`, `examples/basic`.
  - *Ficheros:* `test/emit/create-equivalence.test.ts`, `test/helpers/tree-compare.ts`,
    `examples/basic/src/create-equivalence.test.ts` (SDD §8.2, decisión 31).
- [x] **25. Tests del nuevo `c`.**
  - Criterios 9, 12 y 14 en happy-dom; cobertura de `compiler` al 100 % en los ficheros nuevos y
    tocados.
  - *Depende de:* 19–23.
  - *Paquete:* `compiler`.
  - *Ficheros:* `test/emit/create.test.ts`, `test/emit/hydrate/await.test.ts` (criterio 12).

## Relevo de la fase 4 para la fase 5

- **Cómo quedó el `c`.** Decisiones 23–33 de la spec. En una frase: el clon se importa, la
  adopción se escribe dos veces en el mismo recorrido (`create` y `adopt`), los bloques se crean en
  su sitio y se montan cuando el nivel está adoptado, y el texto que comparte trozo con otro texto
  lo crea el `c`.
- **Lo que cambió fuera del compilador**, que la fase 5 tiene que conocer: `DomClient.setDefault`
  (dom), el `u` provisional de `live` (core), el runtime instalado en el camino `client` de `mount`
  y `customElements.upgrade` en sitio sobre happy-dom (testing). Los cuatro con su test y al 100 %.
- **La tarea 24 no se escribió antes que el `c` nuevo**, como pedía el orden: el camino viejo ya
  lo cubrían las suites de equivalencia de `test/emit/hydrate/`, que pasaron sin tocar con el
  nuevo, y la prueba nueva es más estricta (atributos como conjunto, texto, espacio de nombres,
  shadow roots de los hijos).
- **Cobertura.** Todo lo nuevo de la fase al 100 %. En los ficheros del compilador tocados quedan
  ramas parciales que ya estaban (`attrs.ts` 159, `client.ts` 330, `markup-client.ts` 854…);
  `dom`, `core` y `testing` al 100 %.
- **`node-server.test.ts` del ejemplo** necesita el build del ejemplo (`vite build`): es del
  cierre, con la pieza `dom/template` en el manifiesto (tarea 26).
- **Tres fallos previos que la fase destapó y no son de este SDD**, pendientes de decisión de
  Pedro: (1) al hidratar, el texto que el HTML funde a los dos lados de un bloque cerrado se
  descoloca o se pierde cuando el bloque se abre (`h` no puede separarlos sin marcadores en el
  HTML del servidor; el `c` nuevo no lo tiene); (2) un dueño de servicio (`provide`) creado en el
  navegador no da contenedor a sus hijos; (3) un `let` de un `@{ }` no lo ve un bloque posterior
  en el cliente (en el servidor sí).

## Antes de la fase 5 — los tres fallos previos

Decidido con Pedro el 2026-11-16: no se pasa a la fase 5 sin arreglarlos, y de raíz.

- [x] **F1. Ningún texto del HTML toca a otro.** Comentarios de `marker.ts` en el servidor, la
  plantilla y el cliente; textos buscados hacia atrás, con el `t` de cada bloque (SDD §8.2,
  decisión 34). *Ficheros:* `compiler/src/emit/marker.ts`, `markup.ts`, `markup-client.ts`,
  `block.ts`, `layout.ts`; `test/emit/hydrate/text-between-blocks.test.ts`.
- [x] **F3. Lo que declara un `@{ }` lo ve el cliente.** La declaración sube al cierre (SDD §8.2,
  decisión 35). *Ficheros:* `compiler/src/emit/hoist.ts`, `markup-client.ts`;
  `test/emit/hydrate/inline-scope.test.ts`.
- [ ] **F2. Un dueño de servicio creado en el navegador da su contenedor a sus hijos.** Pendiente de
  decidir con Pedro: SDD-38 dice que un componente creado en el navegador solo ve la raíz.

## Fase 5 — vite, core y testing

- [ ] **26. La pieza en el manifiesto.**
  - `dom/template` aparece en las piezas, se reescribe su import y entra en el presupuesto
    (SDD §4.8).
  - *Depende de:* 3, 19.
  - *Paquete:* `vite`.
  - *Ficheros:* `src/runtime-pieces.ts`, `test/runtime-pieces.test.ts`.
- [ ] **27. `core` y `testing`.**
  - Sin cambios de comportamiento: actualizar los comentarios de `FudicElement.c()` y de `live()`.
    Criterio 13: los tests de `examples/basic` con `mount` pasan sin tocarlos.
  - *Depende de:* 19, 20.
  - *Paquetes:* `core`, `testing`.
  - *Ficheros:* `core/src/element.ts`, `core/src/hydrate/live.ts`.

## Fase 6 — e2e, docs y cierre

- [ ] **28. e2e: crear desde cada bloque.**
  - En `/vivo`, `/spread` y `/mapas` (`vivo-item`, `vivo-otro`, `spread-card`, `bus-option`): abrir y
    cerrar, añadir, quitar y reordenar filas con clave (criterio 10), sin errores en consola. El spec
    entra en los proyectos de `playwright.config.ts` que sirven con y sin SW.
  - *Depende de:* 26.
  - *Paquete:* `examples/basic`.
  - *Ficheros:* `tests/create.spec.ts`, `playwright.config.ts`.
- [ ] **29. e2e: el formulario creado desde un `@if`.**
  - Valida, enseña errores y envía (criterio 11). Si el ejemplo no tiene uno, se añade a `/vivo`.
  - *Depende de:* 26.
  - *Paquete:* `examples/basic`.
  - *Ficheros:* `tests/create.spec.ts`, `src/routes/vivo.fud`.
- [ ] **30. e2e: SVG y Trusted Types.**
  - Un `@if` dentro de un `<svg>` (criterio 6); con la plantilla de `page.headers`, cero violaciones
    (criterio 16); la policy no existe en una página sin bloques que se abran (criterio 17).
  - `templateIn` con `<math>`: los hijos salen con el espacio de nombres MathML. happy-dom parsea
    `<math>` como HTML y el test unitario de la fase 1 solo prueba que se quita el envoltorio
    (SDD §8.2, 6).
  - *Depende de:* 22, 26.
  - *Paquete:* `examples/basic`.
  - *Ficheros:* `tests/create.spec.ts`, `src/routes/vivo.fud`.
- [ ] **31. e2e: las clases ajenas sobreviven.**
  - Criterios 20, 21, 22 y 26 en el navegador, con un `ref` que añade `extra`.
  - *Depende de:* 9, 10, 6.
  - *Paquete:* `examples/basic`.
  - *Ficheros:* `tests/classes.spec.ts`, `playwright.config.ts`, `src/routes/clases.fud`.
- [ ] **32. Docs.**
  - README de `@fudic/dom` (`template`, `toggleClass`, `swapClass`); en la guía del MCP, que `class:`,
    `class=@expr` y la `class` de un spread no borran clases ajenas, y el orden de los tokens.
  - *Depende de:* 2, 4.
  - *Paquetes:* `dom`, `mcp`.
  - *Ficheros:* `dom/README.md`, `mcp/guide/*.md`.
- [ ] **33. La prueba de Pedro.**
  - `SDD-85-Prueba.md` con el criterio 1 paso a paso.
  - *Depende de:* 28–31.
  - *Ficheros:* `docs/sdd/SDD-85-Prueba.md`.
- [ ] **34. Cierre.**
  - `pnpm typecheck`, `pnpm build`, cobertura de todos los paquetes tocados, e2e del ejemplo y del
    banco (criterio 27). Estado, registro de progreso de `INDEX.md` e IDEA-08.
  - `pnpm build` termina con `examples/pieces-bench/check.mjs`: tiene que pasar con la pieza
    `dom/template` y con `escape.ts` / `classes.ts` dentro de `ssr/index` y sin pieza propia (la
    fase 1 los anotó en el check, sin poder correrlo sin el build entero).
  - *Depende de:* 1–33.
  - *Ficheros:* `docs/sdd/INDEX.md`, `docs/sdd/SDD-85-crear-clonando-y-clases.md`,
    `docs/sdd/ideas/IDEA-08-adelgazar-el-cliente.md`.
