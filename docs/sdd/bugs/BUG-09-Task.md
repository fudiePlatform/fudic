# BUG-09 — Tareas

> **BUG:** [BUG-09 — El código y el fuente de `@server` se publican al cliente](./BUG-09-frontera-servidor.md)
> **Paquetes:** `@fudic/vite` · `@fudic/compiler` · **Rama:** worktree `fix-build-output`
> **Depende de:** [BUG-05](./BUG-05-Task.md) en `Hecho`
> **Progreso:** 11 / 11

Cada tarea es un paso cerrado: se implementa, se verifica y se marca. Las rutas son
relativas a la raíz del repo.

Las dos vías son independientes y se pueden cerrar por separado, pero **A va primero**: en
cuanto el wrapper del edge sale del build de cliente, el chunk de `data/posts.ts` y su mapa
desaparecen solos, y el criterio §6.1 se queda solo con lo que B tiene que arreglar. Al
revés, B pasaría en verde sobre un `dist/` que sigue publicando el código.

---

## Fase 1 — Rojo primero (3)

- [x] **1. El fuente de `@server` está en el `dist`.**
      Test de build en `packages/vite/test/` con una ruta con `@server` que importe un módulo
      reconocible: ningún fichero del output —`.js` ni `.map`— contiene ese identificador.
      **Verlo fallar** con las tres coincidencias de hoy (§6.1).
- [x] **2. El manifest publica `esm`.**
      Mismo build: ningún registro de `fudic-routes.json` trae `esm`. **Verlo fallar** (§6.3).
- [x] **3. El `sourcesContent` lleva el bloque `@server`.**
      Sobre el mapa de un chunk del link pass: no contiene el cuerpo de `@server`, y sí el
      markup y el `@code` de cliente. **Verlo fallar** (§6.4).

## Fase 2 — Vía A: el wrapper del edge sale de `outDir` (4)

- [x] **4. `runEdgePass`.**
      Nuevo `packages/vite/src/edge.ts` (§3.1), calcado del link pass: build anidado con
      `write: false`, un input por ruta no excluida, `withLoad: true`, y
      `NestedOutputOptions` heredado como en BUG-05. Devuelve patrón → fichero.
- [x] **5. Se escribe fuera de `outDir`.**
      Los ficheros van a `EDGE_DIR` (`.fudic/edge`), hermano de `outDir` y **nunca** dentro.
      Escritura directa, no `emitFile`: `emitFile` significa «esto se publica», que es justo
      lo que este BUG corrige.
- [x] **6. Fuera el `emitFile` del wrapper.**
      `packages/vite/src/plugin.ts:349-359`: dejar de emitirlo como chunk del build de
      cliente. `wrapperRefs` y `this.getFileName(ref)` desaparecen o pasan a resolverse
      contra `EDGE_DIR`; ojo con los dos usos en el prerender (`plugin.ts:515-519`) y en
      `esmOf` del manifest. Verde en 1 y 2.
- [x] **7. La preview lee de `EDGE_DIR`.**
      `importEsmChunk` (`plugin.ts:620`) resuelve `EDGE_DIR/<safeName(pattern)>.js` en vez de
      `join(outDir, record.esm)`, y `previewRender`/`previewData` dejan de exigir
      `record.esm`. Verde en §6.7.

## Fase 3 — Vía B: el fuente redactado (2)

- [x] **8. `redactServerRegions`.**
      En `@fudic/compiler`: sustituir cada región `@server` por espacios **carácter a
      carácter**, conservando los saltos de línea (§4.3). Misma longitud, mismas líneas — es
      lo que mantiene válidos los `mappings` (§6.5).
- [x] **9. `buildMap` lo usa.**
      `packages/vite/src/transform.ts:65`: pasar el fuente redactado como `sourceContent`.
      Verde en 3, y el test posicional de BUG-05 §6.7 **tiene que seguir verde** (§6.6).

## Fase 4 — Que no se haya roto nada (2)

- [x] **10. El prerender y el resto, intactos.**
      Los `.html` prerenderizados salen byte a byte iguales que antes (§6.8), y las
      regresiones de BUG-03 §6.1 y BUG-05 §6.1-§6.3 siguen verdes (§6.9).
- [x] **11. Extremo a extremo.**
      `pnpm build && grep -rl "listPosts" examples/basic/dist/` no devuelve nada (§6.10), y
      los 16 tests de `examples/basic/tests/` en verde. Comprobar además que
      `.fudic/` está en `.gitignore` y que `vite preview` sigue sirviendo una ruta no
      prerenderizada.

---

## Cierre del BUG

- [x] `pnpm typecheck`, `pnpm test` y `pnpm build` en verde. (`language-server` tiene un test
      de cancelación intermitente, §6.14, ajeno a esta rama: verde al repetirlo.)
- [x] `edge.ts` y lo nuevo del compilador al **100 %** en las cuatro métricas; `plugin.ts` y
      `link.ts` no bajan de ramas respecto a `main`. Medido: `edge.ts` y `redact.ts` al 100 %;
      ramas de `plugin.ts` 75,5 → 77,1 y `link.ts` sin cambio en 72,2.
- [x] Marcar BUG-09 como `Hecho` en [INDEX.md](./INDEX.md) (tabla + registro de progreso),
      anotando **qué se publicaba y desde cuándo**: es lo que hace que un defecto de
      frontera no se repita.
- [x] Anotar en [SDD-19](../SDD-19-plugin-vite.md) §4.3 la regla de §4.1 —`outDir` es lo que
      se publica; el artefacto del edge se escribe fuera— y en §4.6 que el `sourcesContent`
      va redactado.
- [x] Corregir la cabecera de `examples/basic/data/posts.ts`: hoy afirma que nunca llega al
      bundle del navegador, y eso pasa a ser cierto en este commit y no antes.
