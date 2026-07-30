# BUG-03 — Tareas

> **BUG:** [BUG-03 — Chunk servido desde caché y pedido a red a la vez](./BUG-03-chunks-compartidos-sw.md)
> **Paquete:** `@fudic/vite` · **Rama:** `fix/bug-03-sw-self-contained`
> **Progreso:** 11 / 11

Cada tarea es un paso cerrado: se implementa, se verifica y se marca. Ninguna depende de
tareas posteriores. Las rutas son relativas a la raíz del repo.

Independiente de BUG-01 y BUG-02: no comparte ni un fichero. Se puede llevar en un worktree
aparte.

---

## Fase 0 — Rojo primero (3)

- [x] **1. El SW no tiene imports.**
      En `packages/vite/test/plugin.test.ts`: el `fudic-sw.js` emitido no contiene ninguna
      sentencia `import` ni `from` con especificador de fichero. **Verlo fallar** (§6.1).
- [x] **2. Sin chunks compartidos entre realms.**
      Mismo fichero: la intersección de los especificadores de `fudic-main.js` y
      `fudic-sw.js` es vacía. **Verlo fallar** (§6.2).
- [x] **3. `__FUDIC_BUILD__` no sobrevive al build.**
      Mismo fichero: ningún artefacto emitido contiene la cadena; el SW contiene un id hex
      de 8 caracteres. Pasa hoy — se escribe **ahora** porque es la red de seguridad de la
      tarea 6, que es donde se puede romper (§6.4).

## Fase 1 — El build aislado del SW (3)

- [x] **4. Extraer el build del Service Worker.**
      Crear `packages/vite/src/swbuild.ts`: `buildServiceWorker(root, base, options)` con
      `build({ write: false, … })`, entrada `SW_ID`, salida única `fudic-sw.js`, sin code
      splitting. Modelado sobre `runLinkPass`
      (`packages/vite/src/link.ts:137-162`), que ya resuelve el mismo problema (§4.1).
- [x] **5. Emitirlo como asset desde `generateBundle`.**
      Modificar `packages/vite/src/plugin.ts`: llamar a `buildServiceWorker` junto al link
      pass y emitir el resultado con `emitFile({ type: 'asset', fileName: 'fudic-sw.js' })`.
      **Eliminar** `swRef` y su `emitFile` de `buildStart` (líneas 352-354).
- [x] **6. Reordenar build id y `BUILD_TOKEN`.**
      Mismo fichero (§4.3): incluir el `fileName` del SW en el hash del id
      (líneas 437-439); sustituir `BUILD_TOKEN` **en el código del SW antes de emitirlo**,
      no recorriendo `bundle` (441-445). Verde en 3 y §6.5.
      **Es el punto donde esto se rompe en silencio** — un `shell-__FUDIC_BUILD__` no lo
      purga `isStaleCache` nunca.

## Fase 2 — El bootstrap main y la configuración (2)

- [x] **7. URL literal en lugar de `ROLLUP_FILE_URL`.**
      Modificar `plugin.ts:370`: `JSON.stringify(`${base}${DEV_SW_URL}`)` en las dos ramas
      (dev y build). Eliminar el helper `fileUrl` si queda sin uso (§4.2). Verde en §6.6
      con `base: '/app/'`.
- [x] **8. Limpiar `chunkFileNames`.**
      Modificar `plugin.ts:99-114`: `pinned('fudic-sw')` ya no aplica —el SW no es un chunk
      de ese output—. Dejar `entryFileNames: pinned('fudic-main')` y el
      `chunkFileNames` por defecto de Vite. Verde en §6.3.

## Fase 3 — No romper lo que ya funciona (2)

- [x] **9. Link pass y manifest intactos.**
      `packages/vite/test/link.test.ts` en verde sin cambios; los chunks `sw/c/*` se emiten
      igual y el manifest los apunta (§6.7).
- [x] **10. Sin `sw.json`, sin Service Worker.**
      Test de que no se emite `fudic-sw.js` ni se corre el build del SW cuando
      `swConfig === null` (§6.8).

## Fase 4 — Extremo a extremo (1)

> **Nota de cierre.** El criterio extremo a extremo se cumplió con el arnés **Playwright**
> de `examples/basic` (`tests/sw-network.spec.ts` y `tests/sw-render.spec.ts`), no con
> `scripts/sw-check.mjs`: ese script se retiró al portarlo. El arnés captura el tráfico de
> red distinguiendo *quién* responde —el fetch handler del SW, el SW saliendo a red, o la
> red sin interceptar— y vuelca Cache Storage **con sus claves**, que es lo que hizo visible
> [BUG-04](./BUG-04-clave-de-cache.md). Se ejecuta con
> `pnpm --filter @fudic/example-basic test:e2e`.

- [x] **11. Verificarlo en Chrome real.**
      Modificar `examples/basic/scripts/sw-check.mjs`: tras la segunda carga, cero
      peticiones de red a `/assets/**` que el SW haya servido en esa misma carga; y tras
      `ServiceWorker.stopAllWorkers` + recarga, la única petición de script del worker es
      `/fudic-sw.js` (§6.9).
      Ejecutar: `pnpm build && pnpm --filter @fudic/example-basic preview` y, en otra
      shell, `pnpm --filter @fudic/example-basic check:sw`.

---

## Cierre del BUG

- [x] `pnpm typecheck`, `pnpm test` y `pnpm build` en verde.
- [x] Cobertura de ramas de `plugin.ts` **no inferior** a la de `main`.
- [x] Anotar en el PR el tamaño de `dist/fudic-sw.js` antes y después (§7: crece, y es
      deliberado).
- [x] Marcar BUG-03 como `Hecho` en [INDEX.md](./INDEX.md) (tabla + registro de progreso).
- [x] Anotar en [SDD-20](../SDD-20-render-sw.md) §4.1 la regla «un realm con su propio
      cargador tiene su propio bundle», con enlace a este BUG.
