# SDD-27 — Tareas

> **SDD:** [SDD-27 — Artefactos de build y manifiesto](./SDD-27-artefactos-y-manifiesto.md)
> **Paquetes:** `@fudic/vite`, `@fudic/transport` · **Rama:** `feat/sdd-27-artefactos`
> **Progreso:** 18 / 24

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

> **Corrección de orden (encontrada al implementar).** Las fases 1, 3 y 4 **no son
> separables**: el manifiesto no puede dejar de llevar URLs hasta que los ficheros lleven el
> build id, así que la fase 3 va antes que la 4 y las tres aterrizan en un solo commit. El
> plan original las tenía al revés. Se detectó porque 6 tests de build fallaron con «el chunk
> derivado no existe» — fallaban por la razón correcta.

## Fase 1 — Contratos en `@fudic/transport` (4) ✅

- [x] **4. Mudar `safeName`.**
      Movida a `packages/transport/src/manifest.ts` con su test; `@fudic/vite` la reexporta
      desde ahí. **Una sola definición**, o build y runtime derivan nombres distintos sin que
      nadie lo note.

- [x] **5. La nueva forma de `RouteRecord`.**
      Fuera `chunk`, `data` y `esm`; `deps` pasa a nombres desnudos y **su presencia es la
      señal de capacidad** (un registro sin `deps` es una ruta que solo sirve el servidor —
      una `ssg` enumerada es justo ese caso). `ManifestFile` gana `base`, que antes iba
      horneado en cada URL.

- [x] **6. El resolvedor de URLs.**
      `packages/transport/src/urls.ts`: `createUrlResolver(base, build)` con `renderUrl`,
      `depUrl`, `hydrateUrl` y `dataUrl`. `dataUrl` es **total** (toma el patrón, no el
      registro): quién tiene datos lo dice `dataPolicy`, y juntar las dos preguntas dejaba al
      llamante una rama imposible de tomar. `RouteTable` gana `urls`.

- [x] **7. Tests del resolvedor.**
      `packages/transport/test/urls.test.ts`: las cuatro derivaciones, `base` con subruta,
      lista vacía ≠ ausente, y que todo se mueve cuando se mueve el build id.


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

## Fase 3 — Nombres por build id (6) ✅

- [x] **12. Guardia de longitud de hash.**
      `src/rename.ts` + `FUD0500`: si un chunk no termina en `-<8 caracteres>.js`, se avisa y
      **no se renombra nada**. Media nomenclatura es peor que ninguna.

- [x] **13. La sustitución.**
      `renameToBuildId` → `planRename` + `rewriteReferences`. **El hallazgo que costó:** el
      hash de Rollup es base64url y **lleva guiones** (`site-nav-Bq-vwUs5.js` es `site-nav` +
      `Bq-vwUs5`). Partir por el último `-` daba `site-nav-Bq`, un nombre que ningún fichero
      tuvo. Se parte **por anchura**, anclado al final.

- [x] **14. Detección de colisión.**
      `FUD0501`: dos ficheros que quedarían con el mismo nombre conservan su hash, y solo ese
      par. Degrada, no rompe.

- [x] **15. Tests del rename.**
      `test/rename.test.ts`, 14 tests: los hashes con guion, que el nombre nuevo mide lo mismo
      que el viejo (que es lo que mantiene válidos los mapas), `FUD0500`, `FUD0501`.

- [x] **16. Aplicar en el build.**
      Los chunks del link pass **dejan de emitirse en el paso 1** y se emiten en el 3b, ya
      renombrados. Los de cliente se identifican por `facadeModuleId` (no por ruta de salida:
      `assetsDir` es del host) y se mutan **in situ**. **Segundo hallazgo que costó:** borrar
      la clave del bundle y re-añadirla bajo el nombre nuevo **expulsa el chunk del output** y
      el fichero deja de escribirse en silencio; lo que decide la ruta escrita es `fileName`.

- [x] **17. Comprobar los mapas en un build real.**
      `examples/basic` → `sw/c/about-c72057ac.js`, `assets/h/app-badge-c72057ac.js`; los
      `require` internos, el `sourceMappingURL` y los `.map` renombrados. `assets/element-*`
      **conserva su hash**: nadie deriva su URL, y ahí el hash sí ahorra descargas.


## Fase 4 — El manifiesto (4)

- [x] **18. Nombres de chunk como única fuente.**
      `src/names.ts`: `chunkNameOf`/`chunkNamesOf`, con la misma partición por anchura.

- [x] **19. `buildManifest` emite la forma nueva.**
      `linkChunkOf`/`depsOf`/`esmOf` → un solo `depsOf` que devuelve nombres o `null`.
      `FUD0399` se conserva.

- [x] **20. El Service Worker consume la forma nueva.**
      `router.ts` pide las URLs a `table.urls` en `warm`, `render`, `fetchData` e
      `invalidate`. Ya no lee `record.chunk` ni `record.data`.

- [ ] **21. El hilo principal resuelve la hidratación.**
      Modificar `src/bootstrap.ts` (`emitMainBootstrap`): dado un tag, la URL de su chunk de
      hidratación sale de `hydrateUrl(tag)`, con el `build` que ya viaja en el manifiesto.
      **Solo la URL** — el disparador es SDD-17 y no se toca.

## Fase 5 — Aceptación (3)

- [ ] **22. El manifiesto de `examples/basic`.**
      Crear `test/manifest-shape.test.ts`: el `fudic-routes.json` del build real casa byte a
      byte con §5.4 del SDD, no contiene ninguna URL y pesa **≤ 500 B**.
- [x] **23. Prerender y e2e.**
      Los 5 HTML de `examples/basic` **idénticos byte a byte** al baseline. `test:e2e`
      (Playwright, Chromium real): **16/16**, recarga sin red incluida.

- [x] **24. Cobertura.**
      `src/rename.ts`, `src/names.ts` y `packages/transport/src/urls.ts` al **100 %** en las
      cuatro métricas. Agregados: vite 87,1 % de ramas, transport 91,2 % — ambos por encima
      del suelo heredado (83,1 / 83,8).

---

## Cierre de la SDD

- [ ] `pnpm typecheck`, `pnpm test` y `pnpm build` en verde en todo el workspace.
- [ ] Los 12 criterios de §7 del SDD verificados uno a uno.
- [ ] `FUD0500` y `FUD0501` anotados en el catálogo consolidado de [SDD-12](./SDD-12-semantica.md).
- [ ] Marcar SDD-27 como `Hecho` y anotarlo en [INDEX.md](./INDEX.md) (tabla + registro de progreso).
