# BUG-04 — Tareas

> **BUG:** [BUG-04 — La clave de la caché no es la URL, y nadie lo había dicho](./BUG-04-clave-de-cache.md)
> **Paquetes:** `@fudic/transport` · `@fudic/vite` · **Rama:** `fix/bug-04-cache-key`
> **Depende de:** [BUG-01](./BUG-01-Task.md) en `Hecho`
> **Progreso:** 16 / 16

Cada tarea es un paso cerrado: se implementa, se verifica y se marca. Ninguna depende de
tareas posteriores. Las rutas son relativas a la raíz del repo.

El orden no es negociable en un punto: **la tarea 1 va primero**. El doble de `Cache` que
hay hoy es un `Map` por URL, es decir, ya se comporta como queremos que se comporte la
caché real; contra él, todos los tests de este BUG pasan en verde sin haber arreglado nada.
Sin `VaryingCache` no hay rojo, y sin rojo esto es una conjetura verificada por inspección.

---

## Fase 0 — El doble que hace visible el defecto (1)

- [x] **1. `VaryingCache` en `packages/transport/test/helpers.ts`.**
      Implementar el algoritmo de §2.1: la entrada guarda **(petición, respuesta)**; el
      match compara URL y, si `ignoreVary` no viene, los headers que nombre el `Vary` de la
      respuesta guardada; `Vary: *` nunca casa. Honrar `ignoreVary` en `match` y en
      `delete`. `keys()` en orden de inserción, como `FakeCache`.
      El `FakeCache` actual **se queda**: sigue valiendo para los tests que no van de esto.

## Fase 1 — Rojo primero (5)

- [x] **2. El precache se sirve a la petición real.**
      En `packages/transport/test/store.test.ts`, sobre `VaryingCache`: entrada escrita por
      una petición sin `Origin` con respuesta `Vary: Origin` → un `get` cuya petición sí
      lleva `Origin` acierta y `net` no se invoca. **Verlo fallar** (§6.1).
- [x] **3. `Vary: *`.** Mismo fichero: también acierta. **Verlo fallar** (§6.2).
- [x] **4. `delete` borra lo que otro escribió.** Mismo fichero, `keys()` vacío después.
      **Verlo fallar** (§6.3).
- [x] **5. Un `206` no tumba la respuesta.**
      Mismo fichero: `net` devuelve `206` → `get` **resuelve** y no guarda nada. Y un
      `cache.put` que lanza → `get` resuelve igual. **Verlo fallar** (§6.7, §6.8).
- [x] **6. El manifest se rehidrata pese a la clave ajena.**
      En `packages/transport/test/manifest.test.ts`: `loadManifest` encuentra la entrada
      cuando la escribió una petición con `Origin`. Es §2.4.1 —el SW dejando de
      interceptar—, así que este test vale por sí solo. **Verlo fallar** (§6.9).

## Fase 2 — El contrato (2)

- [x] **7. `Store` deja de aceptar claves inventadas.**
      Modificar `packages/transport/src/store.ts` (§3.1): `put(url: string, …)`,
      `match(url: string)`, `delete(url: string)`, y `get(target: Request | string, …)`.
      `pnpm typecheck` señalará todos los consumidores — esa lista es el alcance real.
- [x] **8. Una sola derivación de clave.**
      Mismo fichero (§4.1): `keyOf(target) → string`, pasada como `RequestInfo` a
      `cache.match`/`put`/`delete`. **La misma expresión** que alimenta el mapa de dedup en
      vuelo (§4.6): una sola indexación, no dos. `ignoreSearch` e `ignoreMethod` se quedan
      en `false`, con el comentario que dice por qué.

## Fase 3 — Las lecturas (3)

- [x] **9. `ignoreVary: true` en toda lectura y todo borrado.**
      Mismo fichero (§4.2): una constante `QUERY`, usada en el `cache.match` de `get`, en
      `match` y en `delete`. Verde en 2, 3 y 4.
- [x] **10. `loadManifest` lee igual.**
      Modificar `packages/transport/src/manifest.ts:179`. Verde en 6.
- [x] **11. Cachear es best-effort; servir no.**
      Mismo `store.ts` (§4.4): guardar solo con `status === 200`, y el `put` con su propio
      `catch`. Verde en 5.

## Fase 4 — Los llamantes (2)

- [x] **12. El router usa la firma nueva.**
      Modificar `packages/transport/src/router.ts`: los siete `new Request(...)` de las
      llamadas al `Store` desaparecen (líneas 164, 180, 213, 280, 282, 339, 341); los dos
      que pasan `event.request` a `get` se quedan **tal cual** — la pata de red necesita la
      petición original (§3.1). Verde en §6.5, §6.6 y §6.10.
- [x] **13. El `install` pasa por el `Store`.**
      Modificar `packages/vite/src/bootstrap.ts:40-48` (§4.5): fuera `cache.add`; un
      `createStore` sobre la caché del shell, `fetch(url, { cache: 'reload' })`, guardar si
      `ok`, y el `catch` se mantiene. Test del texto emitido en
      `packages/vite/test/bootstrap.test.ts` (§6.11).

## Fase 5 — Una URL, una entrada (1)

- [x] **14. Tests de identidad y presupuesto.**
      En `store.test.ts`: tres consumidores con headers distintos sobre una URL → `keys()`
      de longitud 1; `prune` con `maxEntries: 1` sobre dos URLs deja una (§6.4).

## Fase 6 — Extremo a extremo (2)

- [x] **15. La carga 2 no sale a red.**
      En `examples/basic/tests/sw-network.spec.ts`: en la carga 2, `/fudic-main.js` con
      `fromServiceWorker === true` y **cero** peticiones del SW a esa URL; la lista «fue a
      la red» de la carga 2 contiene como mucho `/fudic-sw.js` (§6.12).
- [x] **16. Una entrada por URL, y todas selladas.**
      Mismo fichero, con `dumpCaches`: tras las tres cargas, ninguna caché tiene dos
      entradas para la misma URL y todas llevan `x-fudic-stored` — el `install` incluido
      (§6.13).
      Ejecutar: `pnpm build && pnpm --filter @fudic/example-basic preview` y, en otra shell,
      `pnpm --filter @fudic/example-basic exec playwright test`.

---

## Cierre del BUG

- [x] `pnpm typecheck`, `pnpm test` y `pnpm build` en verde.
- [x] `store.ts` al **100 %** en las cuatro métricas (§6). Subir el umbral por fichero en
      `packages/transport/vitest.config.ts`, junto a `manifest.ts`/`linker.ts`/`control.ts`,
      para que no se pueda volver a bajar.
- [x] Cobertura de ramas de `router.ts` no inferior a la de `main`.
- [x] Marcar BUG-04 como `Hecho` en [INDEX.md](./INDEX.md) (tabla + registro de progreso).
- [x] Anotar en [SDD-20](../SDD-20-render-sw.md) §4.6.3 y §4.7 que la clave de un `Store` es
      la URL y que `Vary` no se respeta, con enlace a este BUG.
- [x] Documentar en el apartado de `resources` de `sw.json` la regla de §4.3: si una
      respuesta depende de un header, ese eje va en la URL.
