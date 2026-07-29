# BUG-02 — Tareas

> **BUG:** [BUG-02 — El router cachea HTML por ruta en lugar de renderizar](./BUG-02-html-por-ruta.md)
> **Paquetes:** `@fudic/transport` · `@fudic/vite` · **Rama:** `fix/bug-02-render-not-html`
> **Depende de:** [BUG-01](./BUG-01-Task.md) en `Hecho` (ambos tocan el `fetch` handler)
> **Progreso:** 0 / 20

Cada tarea es un paso cerrado: se implementa, se verifica y se marca. Ninguna depende de
tareas posteriores. Las rutas son relativas a la raíz del repo.

El orden es deliberado: **primero el build produce chunks para las `ssg`** (fases 2–3) y
solo después el router deja de descargar HTML (fase 4). Al revés, entre una fase y la
siguiente las rutas `ssg` quedarían sin forma de renderizarse.

---

## Fase 0 — Rojo primero (4)

- [ ] **1. `warm` no descarga documentos.**
      En `packages/transport/test/router.test.ts`: `warm()` sobre una ruta con HTML
      prerenderizado invoca `net` solo para `chunk` y `deps`. **Verlo fallar** (§6.1).
- [ ] **2. Ninguna URL `.html` sale a red.**
      Mismo fichero, ciclo install → warm → navegación → navegación: ningún argumento de
      `net` termina en `.html`. **Verlo fallar** (§6.2).
- [ ] **3. El manifest no lleva `html`.**
      En `packages/vite/test/manifest.test.ts`: ningún record de `buildManifest` contiene
      la clave. **Verlo fallar** (§6.3).
- [ ] **4. Una `ssg` obtiene chunk y deps.**
      Mismo fichero: ruta `mode: 'ssg'` con `paths()` → `chunk` y `deps` no vacíos, más
      `data`/`dataPolicy` si declara `load`. **Verlo fallar** (§6.4).

## Fase 1 — Contrato (2)

- [ ] **5. `html` sale de `RouteRecord`.**
      Modificar `packages/transport/src/manifest.ts` (§3.1): eliminar el campo y su
      comentario. `pnpm typecheck` señalará todos los consumidores — esa lista es el
      alcance real de la tarea.
- [ ] **6. Documentar la semántica nueva de `RouteMode`.**
      Mismo fichero: `ssg` significa «el build escribió HTML de arranque en frío»; para el
      `fetch` handler la partición es `ssr` frente al resto (§3.2).

## Fase 2 — El link pass alcanza a las `ssg` (3)

- [ ] **7. Seleccionar toda ruta renderizable.**
      Modificar `packages/vite/src/link.ts:127`: `mode !== 'ssr'` y no excluida, en lugar
      de `mode === 'sw'` (§4.6.1). `withLoad: false` en `linkPlugin` **no se toca**.
- [ ] **8. Tests del link pass.**
      En `packages/vite/test/link.test.ts`: una `ssg` enumerada produce entrada y deps
      topológicos; una `ssr` sigue sin producir nada.
- [ ] **9. Comprobar el coste en bytes.**
      `pnpm build` en `examples/basic`: anotar en el PR el tamaño de `dist/sw/c/` antes y
      después. Ninguna descarga nueva en runtime (§4.7).

## Fase 3 — El manifest emite chunk, deps y data para las `ssg` (3)

- [ ] **10. Unificar las ramas de `buildManifest`.**
      Modificar `packages/vite/src/manifest.ts:97-135`: la rama no-`sw` queda solo para
      `ssr`; todo `mode !== 'ssr'` emite `chunk`, `deps` y —si `hasLoad`— `data` +
      `dataPolicy`. Eliminar `htmlUrlFor` y la variable `html` (§4.6.2).
- [ ] **11. Verde en 3 y 4, más `FUD0399`.**
      Añadir un test de que una ruta sin chunk emite `FUD_CHUNK_NOT_EMITTED` y sigue en el
      manifest (el servidor la sirve).
- [ ] **12. El endpoint de datos cubre las `ssg`.**
      Verificar en `plugin.ts` (dev) y `configurePreviewServer` que `/_fudic/data/**`
      responde para una ruta `ssg` con `load`. Test en `packages/vite/test/plugin.test.ts`.

## Fase 4 — El router deja de cachear documentos (5)

- [ ] **13. `warm` calienta chunks, nunca documentos.**
      Modificar `packages/transport/src/router.ts:220-245`: condición
      `record.mode !== 'ssr' && record.chunk !== undefined`; **eliminar** el bloque
      `233-244` entero (§4.3). Verde en 1 y 2.
- [ ] **14. La clave de páginas es la URL de navegación.**
      Mismo fichero: `pageUrlOf` → `abs(pathname)` (§4.4). Actualizar sus tres llamadas
      (`render`/persist, la decisión, `invalidate`). Verde en §6.9 y §6.12.
- [ ] **15. La decisión deja de mirar `mode`.**
      `router.ts:263-278`: quitar la rama `record.mode === 'ssg'`; la guarda pasa a ser
      `record.chunk === undefined || !warmed.has(record.pattern)` → frío. Eliminar la
      aserción `record.chunk!` de la línea 168 (§4.6.3). Verde en §6.5, §6.6, §6.7, §6.8.
- [ ] **16. El nonce se aplica al servir, no al renderizar.**
      `render` emite `NONCE_TOKEN` en el stream; el camino de servicio aplica `applyNonce`
      con el nonce de **esa** respuesta (§4.5). Verde en §6.10 y §6.11.
- [ ] **17. `servePage` se reduce a servir lo persistido.**
      Sin `record.html`, sin descarga: si la entrada no está, se borra del índice y se cae
      al camino de red, como hoy.

## Fase 5 — El edge no se entera (1)

- [ ] **18. Confirmar que preview no dependía de `record.html`.**
      `packages/vite/src/plugin.ts:295-321` ya localiza el fichero con
      `join(outDir, htmlPathFor(pathname))`. Añadir el test de §6.13 para que nadie
      reintroduzca la dependencia.

## Fase 6 — Extremo a extremo (2)

- [ ] **19. Reescribir el arnés CDP.**
      Modificar `examples/basic/scripts/sw-check.mjs`: **sustituir** el caso «a warm
      prerendered page is served from the SW cache» (afirma el comportamiento incorrecto)
      por los cuatro de §6.14. Añadir la comprobación de que el `nonce` del documento
      cambia entre recargas.
- [ ] **20. Ejecutarlo contra el build real.**
      `pnpm build && pnpm --filter @fudic/example-basic preview` y, en otra shell,
      `pnpm --filter @fudic/example-basic check:sw`. Todo en verde, incluida la ausencia de
      `/index.html` en el Network de la primera carga.

---

## Cierre del BUG

- [ ] `pnpm typecheck`, `pnpm test` y `pnpm build` en verde.
- [ ] Cobertura de ramas de `router.ts` **superior** a la de `main` (§6: el borrado de
      `servePage`/`pageUrlOf` quita ramas, no debe quitar tests).
- [ ] Marcar BUG-02 como `Hecho` en [INDEX.md](./INDEX.md) (tabla + registro de progreso).
- [ ] Actualizar [SDD-20](../SDD-20-render-sw.md) §4.2 (el manifest ya no lleva `html`),
      §4.4 (la decisión no mira `mode`) y §4.6 (`warm` solo calienta chunks), con enlace a
      este BUG.
