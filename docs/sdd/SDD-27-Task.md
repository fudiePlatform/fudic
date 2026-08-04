# SDD-27 — Tareas

> **SDD:** [SDD-27 — Artefactos de build y manifiesto](./SDD-27-artefactos-y-manifiesto.md)
> **Paquetes:** `@fudic/vite`, `@fudic/transport` · **Rama:** `feat/sdd-27-artefactos`
> **Progreso:** 23 / 23 · SDD `Hecho`

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


## Fase 2 — Purga de la pasada *page* (4) ✅

- [x] **8. Conjunto a conservar.**
      `src/prune.ts`: `keepSet(items, isRoot)` → todo asset, más los chunks raíz y su
      **clausura de imports**. Raíz es lo que algo carga de verdad: `fudic-main` y los chunks
      de hidratación, identificados por `facadeModuleId`. Un `.map` se va con su chunk: es un
      asset, y «conservar todo asset» dejaba los mapas de lo que se acababa de borrar.

- [x] **9. Tests del conjunto.**
      `test/prune.test.ts`, 9 tests: `element-*` sobrevive **sin nombrarlo** (es alcanzable),
      `stream`/`app-card` caen porque solo los alcanza *page*, el asset enlazado siempre
      dentro, y el mapa de un chunk borrado fuera.

- [x] **10. Borrar del bundle.**
      `plugin.ts` paso 3c, después del renombrado y con las claves **originales** del bundle
      (`imports` sigue hablando en claves). `examples/basic`: 47 → 33 ficheros.

- [x] **11. Regresión del linker de assets.**
      `test/build-asset-survives-prune.test.ts`. **Verificado que muerde**: quitando el
      `emitFile` de página del plugin, 2 de sus 3 tests fallan. Usa un asset por encima del
      límite de inline en **los dos** builds — el anidado no hereda `assetsInlineLimit`, y un
      data-URI no probaría nada porque entonces no hace falta que exista ningún fichero.


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


## Fase 4 — El manifiesto (3) ✅

- [x] **18. Nombres de chunk como única fuente.**
      `src/names.ts`: `chunkNameOf`/`chunkNamesOf`, con la misma partición por anchura.

- [x] **19. `buildManifest` emite la forma nueva.**
      `linkChunkOf`/`depsOf`/`esmOf` → un solo `depsOf` que devuelve nombres o `null`.
      `FUD0399` se conserva.

- [x] **20. El Service Worker consume la forma nueva.**
      `router.ts` pide las URLs a `table.urls` en `warm`, `render`, `fetchData` e
      `invalidate`. Ya no lee `record.chunk` ni `record.data`.

> **El hilo principal no aparece en este SDD.** Aquí había una tarea que le hacía resolver
> la URL de hidratación. Se eliminó: el hilo principal no descarga chunks de hidratación.
> Detecta tags con un IntersectionObserver, se lo dice al Service Worker por `postMessage`,
> y el SW los descarga y los deja en caché junto a los de render. Cuando el usuario
> interactúa, el capturador global de eventos hace `import` y **no va a red** — sale de la
> caché del SW. Ese diseño es de Pedro y está medido (INP 16 ms); este SDD solo tiene que
> dejar la URL **derivable**, que es lo que hace `hydrateUrl`. Quién la pide y cuándo no se
> decide aquí.

## Fase 5 — Aceptación (3) ✅

- [x] **21. El manifiesto de `examples/basic`.**
      `test/manifest-shape.test.ts`, 6 tests sobre un build real: ni una URL en el fichero,
      `base` una sola vez, presupuesto de 500 B, y —lo que sostiene el SDD entero— que **cada
      URL derivada (render, dep e hidratación) aterriza en un fichero que el build escribió**.

- [x] **22. Prerender y e2e.**
      Los 5 HTML de `examples/basic` **idénticos byte a byte** al baseline. `test:e2e`
      (Playwright, Chromium real): **16/16**, recarga sin red incluida.

- [x] **23. Cobertura.**
      `src/rename.ts`, `src/names.ts` y `packages/transport/src/urls.ts` al **100 %** en las
      cuatro métricas. Agregados: vite 87,1 % de ramas, transport 91,2 % — ambos por encima
      del suelo heredado (83,1 / 83,8).

---

## Cierre de la SDD

- [x] `pnpm typecheck`, `pnpm test` y `pnpm build` en verde en todo el workspace: **2293 tests**.
- [x] Los 12 criterios de §7 del SDD verificados uno a uno.
- [x] `FUD0500` y `FUD0501` anotados en el catálogo consolidado de [SDD-12](./SDD-12-semantica.md).
- [x] Marcar SDD-27 como `Hecho` y anotarlo en [INDEX.md](./INDEX.md) (tabla + registro de progreso).
