# BUG-01 — Tareas

> **BUG:** [BUG-01 — El shell precacheado nunca se sirve desde caché](./BUG-01-shell-sin-politica.md)
> **Paquetes:** `@fudic/transport` · `@fudic/vite` · **Rama:** `fix/bug-01-shell-policy`
> **Progreso:** 0 / 12

Cada tarea es un paso cerrado: se implementa, se verifica y se marca. Ninguna depende de
tareas posteriores. Las rutas son relativas a la raíz del repo.

---

## Fase 0 — Rojo primero (3)

- [ ] **1. Test del shell servido desde caché.**
      En `packages/transport/test/router.test.ts`: petición no-navegación a una URL de
      `shell` con la entrada en `stores.shell` → `respondWith` desde caché, `net` sin
      invocar. **Verlo fallar** (§6.1).
- [ ] **2. Test del shell sin clases de recurso.**
      Mismo fichero, `resources: []` → sigue sirviéndose. **Verlo fallar** (§6.2).
- [ ] **3. Test de auditoría de cableado.**
      Doble de `Cache` que cuenta `match`; tras install → navegación → recurso de shell →
      recurso de clase, los cuatro contadores > 0. **Verlo fallar** (§6.5).

## Fase 1 — Contrato (2)

- [ ] **4. `RouterStores` gana `shell`.**
      Modificar `packages/transport/src/router.ts` (§3.1): campo **requerido**, no
      opcional. Actualizar todos los constructores de `RouterStores` en tests.
- [ ] **5. `RouterConfig` gana `shell?: readonly string[]`.**
      Mismo fichero (§3.2): URLs exactas, resueltas con `abs()`, documentadas como
      identidad y no como glob.

## Fase 2 — El camino de servicio (3)

- [ ] **6. Conjunto de URLs de shell en `createRouter`.**
      Construir un `Set<string>` con `config.shell` absolutizado, una sola vez al crear el
      router (la decisión de `handleResource` es síncrona y caliente).
- [ ] **7. Identidad antes que clase en `handleResource`.**
      `router.ts:203-218`: si la URL está en el conjunto → `respondWith` desde
      `stores.shell` con `cache-first`/`ttl: null` y `return`; si no, las `resources` como
      hoy; si nada casa, `return` sin tocar la petición (§4.1, §4.2).
- [ ] **8. Verde en 1, 2, 3 y los criterios 4 y 6.**
      Añadir §6.3 (el shell gana a `pattern: '/**'`), §6.4 (miss → red por `stores.shell`,
      sellado en `shell`) y §6.6 (nada casa → cero `respondWith`).

## Fase 3 — El bootstrap emitido (2)

- [ ] **9. Cablear la caché y la lista.**
      Modificar `packages/vite/src/bootstrap.ts`: `stores.shell` en `build()` reutilizando
      el `caches.open(NAMES.shell)` que ya existe (línea 79), y
      `shell: [...SHELL, MANIFEST_URL]` en `createRouter` (§4.3).
- [ ] **10. Test del texto emitido.**
      En `packages/vite/test/bootstrap.test.ts`: el bootstrap pasa a `createRouter` un
      `shell` con exactamente `[...SHELL, MANIFEST_URL]`, y `MANIFEST_URL` se sirve desde
      `stores.shell` sin red (§6.7, §6.8).

## Fase 4 — `FUD0391` deja de ser decorativo (1)

- [ ] **11. Validar el shell contra el bundle.**
      Modificar `packages/vite/src/plugin.ts` (`generateBundle`): cada entrada de
      `swConfig.shell` que no exista entre los nombres del bundle ni entre los assets
      emitidos → `this.warn` con `FUD_SW_SHELL_MISSING`. Test en
      `packages/vite/test/plugin.test.ts` (§6.9). **Ver fallar primero.**

## Fase 5 — Extremo a extremo (1)

- [ ] **12. Arranque sin red en Chrome real.**
      Modificar `examples/basic/scripts/sw-check.mjs`: tras dos cargas, tercera con
      `Network.emulateNetworkConditions { offline: true }`; la navegación se sirve y
      `/fudic-main.js` llega con `fromServiceWorker === true` (§6.10).
      Ejecutar: `pnpm build && pnpm --filter @fudic/example-basic preview` y, en otra
      shell, `pnpm --filter @fudic/example-basic check:sw`.

---

## Cierre del BUG

- [ ] `pnpm typecheck`, `pnpm test` y `pnpm build` en verde.
- [ ] Cobertura de ramas de `router.ts` y `bootstrap.ts` **no inferior** a la de `main`.
- [ ] Marcar BUG-01 como `Hecho` en [INDEX.md](./INDEX.md) (tabla + registro de progreso).
- [ ] Anotar en [SDD-20](../SDD-20-render-sw.md) §4.7 que el shell tiene política, con
      enlace a este BUG.
