# SDD-27 — Tareas

> **SDD:** [SDD-27 — Artefactos de build y manifiesto](./SDD-27-artefactos-y-manifiesto.md)
> **Paquetes:** `@fudic/vite`, `@fudic/transport` · **Rama:** `feat/sdd-27-artefactos`
> **Progreso:** 3 / 24

Cada tarea es un paso cerrado: se implementa, se verifica y se marca. Ninguna depende de
tareas posteriores. Los ficheros son relativos a `packages/vite/` salvo cuando se diga
otra cosa.

---

## Fase 0 — Nomenclatura (3) ✅

- [x] **1. Nombrar las cuatro pasadas.**
      Modificar `src/constants.ts`: la tabla de §3 del SDD como comentario de cabecera y
      `PAGE_NAME_PREFIX`/`CLIENT_NAME_PREFIX` junto a `LINK_DIR`/`EDGE_DIR`. Se nombran por
      **prefijo de `chunk.name`**, no por ruta de salida: `assetsDir` es configurable, y el
      prune y el rename deben casar contra algo que el usuario no pueda mover.
- [x] **2. Sustituir los literales dispersos.**
      Modificar `src/client.ts` (`clientChunkName`) y `src/plugin.ts` para usar las
      constantes. Sin cambio de comportamiento: el `dist` emitido es idéntico.
- [x] **3. Comprobar que nada se movió.**
      `pnpm build` en `examples/basic`; la lista de ficheros de `dist/` y los 5 HTML son
      idénticos byte a byte a los de antes de la fase.

## Fase 1 — Contratos en `@fudic/transport` (4)

- [ ] **4. Mudar `safeName`.**
      Mover de `src/link.ts` a `packages/transport/src/manifest.ts` con su test; `@fudic/vite`
      la reexporta desde ahí. **Una sola definición**, o build y runtime derivan nombres
      distintos sin que nadie lo note.
- [ ] **5. La nueva forma de `RouteRecord`.**
      Modificar `packages/transport/src/manifest.ts`: fuera `chunk`, `data` y `esm`; `deps`
      pasa a nombres desnudos. Actualizar `compileManifest` y `RouteTable`.
- [ ] **6. El resolvedor de URLs.**
      Crear `packages/transport/src/urls.ts`: `UrlResolver` y `createUrlResolver(base, build)`
      con `renderUrl`, `depUrl`, `hydrateUrl` y `dataUrl` (§4.1 del SDD). `RouteTable` gana `urls`.
- [ ] **7. Tests del resolvedor.**
      Crear `packages/transport/test/urls.test.ts`: las cuatro derivaciones, `base` con y sin
      barra final, `dataUrl` → `null` sin `dataPolicy`, patrón con `:param` sin rellenar.

## Fase 2 — Purga de la pasada *page* (4)

- [ ] **8. Conjunto a conservar.**
      Crear `src/prune.ts`: `keepSet(bundle, clientChunkNames)` → `fudic-main`, `fudic-sw`,
      los chunks de *client* y su **clausura de imports**, más todo `type === 'asset'`.
- [ ] **9. Tests del conjunto.**
      Crear `test/prune.test.ts`: `element-*.js` dentro, `assets/c/about-*.js` fuera, un asset
      siempre dentro, y un chunk compartido entre *page* y *client* dentro.
- [ ] **10. Borrar del bundle.**
      Modificar `src/plugin.ts` (`generateBundle`): aplicar `keepSet` **después** de que los
      assets estén emitidos y nombrados. Verificar en `examples/basic` que `dist/assets/c/`
      desaparece y `assets/h/` sigue.
- [ ] **11. Regresión del linker de assets.**
      Crear `test/build-asset-survives-prune.test.ts`: variante de `build-asset.test.ts` con
      `assetsInlineLimit: 0` que afirma que el `logo-<hash>.png` **se sigue emitiendo** y que el
      chunk de `sw/c/` apunta a él. **Este test es lo único que impide que alguien borre los
      `emitFile` de página de `plugin.ts:381-393` al ver `assets/c/` vacío.**

## Fase 3 — Nombres por build id (6)

- [ ] **12. Guardia de longitud de hash.**
      Crear `src/rename.ts` con `FUD0500` en `src/diagnostics.ts`: si algún chunk de *link* o
      *client* no termina en `-<8 caracteres>.js`, avisar y **no renombrar nada**.
- [ ] **13. La sustitución.**
      Implementar `renameToBuildId(files, build)` en `src/rename.ts`: nombre del fichero,
      nombre del `.map`, `sourceMappingURL` y toda referencia dentro del código. Misma
      longitud, cero desplazamiento de offsets.
- [ ] **14. Detección de colisión.**
      Añadir `FUD0501`: si dos ficheros quedan con el mismo nombre tras el rename, avisar y
      **conservar el hash de ese par**. Degrada, no rompe.
- [ ] **15. Tests del rename.**
      Crear `test/rename.test.ts`: chunk sintético con `require("./x-AAAAAAAA.js")`, el mapa
      resultante valida contra el original, `FUD0500` con `hashCharacters` alterado, `FUD0501`
      con dos nombres iguales.
- [ ] **16. Aplicar en el build.**
      Modificar `src/plugin.ts`: llamar a `renameToBuildId` sobre *link* y *client* entre el
      cálculo del build id (`plugin.ts:572`) y la emisión del manifiesto (`plugin.ts:611`).
- [ ] **17. Comprobar los mapas en un build real.**
      `pnpm build` en `examples/basic` → `dist/sw/c/about-<build>.js`,
      `dist/assets/h/app-badge-<build>.js`; cada `.map` resuelve a su `.fud`.

## Fase 4 — El manifiesto (4)

- [ ] **18. Nombres de chunk como única fuente.**
      Crear `src/names.ts`: `chunkNamesOf(builds)` → `pattern → { entry, deps }` (§4.2 del
      SDD). Test que compara su salida con `link.entries`/`link.deps` del build real.
- [ ] **19. `buildManifest` emite la forma nueva.**
      Modificar `src/manifest.ts`: `linkChunkOf`/`depsOf`/`esmOf` se sustituyen por
      `namesOf(rb)` sobre la tarea 18. `FUD0399` se conserva — sigue siendo posible que el
      link pass no produzca entrada para una ruta.
- [ ] **20. El Service Worker consume la forma nueva.**
      Modificar `packages/transport/src/router.ts` y el linker: las URLs se piden a
      `table.urls`, nunca se leen de `record.chunk`/`record.deps`.
- [ ] **21. El hilo principal resuelve la hidratación.**
      Modificar `src/bootstrap.ts` (`emitMainBootstrap`): dado un tag, la URL de su chunk de
      hidratación sale de `hydrateUrl(tag)`, con el `build` que ya viaja en el manifiesto.
      **Solo la URL** — el disparador es SDD-17 y no se toca.

## Fase 5 — Aceptación (3)

- [ ] **22. El manifiesto de `examples/basic`.**
      Crear `test/manifest-shape.test.ts`: el `fudic-routes.json` del build real casa byte a
      byte con §5.4 del SDD, no contiene ninguna URL y pesa **≤ 500 B**.
- [ ] **23. Prerender y e2e.**
      Los 5 HTML de `examples/basic` idénticos a los de antes del cambio salvo hashes;
      `tests/sw-render.spec.ts` y `tests/sw-network.spec.ts` verdes contra el build nuevo.
- [ ] **24. Cobertura.**
      `src/prune.ts`, `src/rename.ts`, `src/names.ts` y `packages/transport/src/urls.ts`
      nacen al **100 %** en las cuatro métricas. `@fudic/vite` y `@fudic/transport` no bajan
      de donde estaban (ramas 83,1 % y 83,8 %).

---

## Cierre de la SDD

- [ ] `pnpm typecheck`, `pnpm test` y `pnpm build` en verde en todo el workspace.
- [ ] Los 12 criterios de §7 del SDD verificados uno a uno.
- [ ] `FUD0500` y `FUD0501` anotados en el catálogo consolidado de [SDD-12](./SDD-12-semantica.md).
- [ ] Marcar SDD-27 como `Hecho` y anotarlo en [INDEX.md](./INDEX.md) (tabla + registro de progreso).
