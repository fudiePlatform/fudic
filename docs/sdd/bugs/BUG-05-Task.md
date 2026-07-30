# BUG-05 — Tareas

> **BUG:** [BUG-05 — El Service Worker y los chunks enlazables se emiten sin source map](./BUG-05-sourcemaps-builds-anidados.md)
> **Paquete:** `@fudic/vite` · **Rama:** worktree `fix-build-output`
> **Depende de:** nada
> **Progreso:** 12 / 12

Cada tarea es un paso cerrado: se implementa, se verifica y se marca. Ninguna depende de
tareas posteriores. Las rutas son relativas a la raíz del repo.

El orden importa en un punto: **la tarea 3 va antes que la 5**. El link pass es el único
sitio donde activar `sourcemap` sin más produce un mapa *válido y falso* —lleva al JS
generado, no al `.fud`—, y un mapa falso pasa cualquier test que solo compruebe que existe.

---

## Fase 1 — Rojo primero (4)

- [x] **1. No hay `.map` para el SW.**
      En `packages/vite/test/build-sw-selfcontained.test.ts`: build con
      `build.sourcemap: true` → el bundle contiene `fudic-sw.js.map` y `fudic-sw.js` termina
      en `//# sourceMappingURL=fudic-sw.js.map`. **Verlo fallar** (§6.1).
- [x] **2. No hay `.map` para los chunks enlazables.**
      En `packages/vite/test/link.test.ts`: mismo build → cada `sw/c/*.js` tiene `.map`
      hermano y comentario. **Verlo fallar** (§6.2).
- [x] **3. El mapa del link pass no lleva al `.fud`.**
      Mismo fichero: el `sources` del mapa de un chunk contiene una ruta `.fud`.
      **Verlo fallar** — y comprobar que falla *por el contenido*, no por ausencia: es el
      test que separa un mapa útil de uno presente (§6.3, §2.2).
- [x] **4. El default sigue sin mapas.**
      Sin `build.sourcemap`: cero `.map`, cero `sourceMappingURL`. Este **pasa en verde
      desde el principio** y está para que la corrección no se lleve el default por delante
      (§6.5).

## Fase 2 — La costura compartida (2)

- [x] **5. `NestedOutputOptions` y su captura.**
      Crear la interfaz (§3.1) donde vivan las constantes del plugin, y capturar
      `config.build.sourcemap` en `configResolved`
      (`packages/vite/src/plugin.ts:116-134`), junto a `resolveAlias`. Pensada para que
      BUG-06 le añada `minify` y nada más.
- [x] **6. Las dos firmas la reciben.**
      `buildServiceWorker` (`packages/vite/src/swbuild.ts:67-72`) y `runLinkPass`
      (`packages/vite/src/link.ts:130-135`) toman el nuevo parámetro y lo pasan a
      `build.sourcemap` de su build anidado. `pnpm typecheck` señala los dos llamantes.

## Fase 3 — Que el mapa exista y sirva (3)

- [x] **7. El link pass deja de tirar el mapa del `.fud`.**
      `packages/vite/src/link.ts:95`: devolver `{ code, map }` de `transformFud`. Verde
      en 3. **Esta tarea es la que da valor a todo el resto.**
- [x] **8. Los resultados llevan mapa.**
      `SwBuildResult` y `LinkChunk` ganan `map?: string` (§3.2, campo **omitido** cuando no
      hay mapa — `exactOptionalPropertyTypes`). `swChunkOf`
      (`packages/vite/src/swbuild.ts:110-113`) pasa a devolver `{ code, map? }` (§3.3),
      conservando su rama de «no hay tal chunk». `link.ts:181` propaga el `map` del chunk.
- [x] **9. La sustitución de `BUILD_TOKEN` deja de mover el código.**
      `packages/vite/src/constants.ts:26`: `BUILD_TOKEN` pasa a 8 caracteres, la longitud del
      `buildId`, para que la sustitución de `packages/vite/src/plugin.ts:476` preserve
      offsets (§4.4). Actualizar el literal en los dos asserts de BUG-03 que lo nombran.
      Verde en el test de la tarea 11.

## Fase 4 — Emisión (2)

- [x] **10. El `.map` se emite como asset hermano.**
      En `generateBundle` (`packages/vite/src/plugin.ts:436` y `:473-477`): por cada salida
      con mapa, `emitFile` del `.map` y `//# sourceMappingURL=` al final del código (§4.3).
      Honrar `'hidden'` (mapa sin comentario) e `'inline'` (data URI, sin fichero). Verde
      en 2, 3 y 6.
- [x] **11. El mapa apunta donde debe.**
      Test de resolución posicional (§6.7): una posición conocida del `fudic-sw.js`
      **emitido** resuelve a la línea correcta del fuente. Y §6.4: `sources` del mapa del SW
      incluye una ruta bajo `packages/transport`.

## Fase 5 — El prerender (1)

- [x] **12. `materializeBundle` escribe los mapas.**
      `packages/vite/src/prerender.ts:51-58`: escribir el `.map` de cada chunk que lo tenga,
      para que el `catch` de `plugin.ts:535` reporte stacks legibles (§4.5).

---

## Cierre del BUG

- [ ] `pnpm typecheck`, `pnpm test` y `pnpm build` en verde.
- [ ] `swbuild.ts` sigue al **100 %** en las cuatro métricas; `link.ts` y `plugin.ts` no
      bajan su cobertura de ramas respecto a `main`.
- [ ] Extremo a extremo (§6.10): `pnpm --filter @fudic/example-basic exec vite build --sourcemap`
      produce `dist/fudic-sw.js.map` y siete `dist/sw/c/*.js.map`. Comprobar a mano **una**
      vez en DevTools que el paso a paso del SW cae en el `.ts` de transport — es el síntoma
      original y ningún test unitario lo cubre del todo.
- [ ] Regresión de BUG-03 §6.4 en verde: ningún artefacto con `__FUDIC_BUILD__`, id de 8
      hexadecimales.
- [ ] Marcar BUG-05 como `Hecho` en [INDEX.md](./INDEX.md) (tabla + registro de progreso).
- [ ] Anotar en [SDD-19](../SDD-19-plugin-vite.md) §4.6 que los builds anidados heredan
      `build.sourcemap` y que el mapa del link pass encadena hasta el `.fud`, con enlace a
      este BUG.
