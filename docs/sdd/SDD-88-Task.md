# SDD-88 — Tareas

> **SDD:** [SDD-88 — Toda página tiene layout](./SDD-88-toda-pagina-con-layout.md)
> **Paquetes:** `@fudic/compiler` · `@fudic/diagnostics` · `@fudic/language-core` ·
> `@fudic/language-server` · `@fudic/typecheck` · `@fudic/formatter` · `@fudic/api` · `@fudic/vite` ·
> `@fudic/testing` · `@fudic/workbench` · `@fudic/cli` · `@fudic/mcp` · `examples/workspace` ·
> `examples/vista-errores`
> **Rama:** `sdd-88-toda-pagina-con-layout`, desde `main`.
> **Progreso:** 0 / 26 — `Listo`.

**El orden manda en tres puntos.**

- **Primero, quienes escriben páginas sin layout (fases 1 y 2).** `@fudic/testing`, el workbench,
  las fixtures y los tests generan páginas sin layout. Si el compilador las rechaza antes de que
  dejen de escribirlas, se rompe medio repo a la vez.
- **El compilador las rechaza en la fase 3**, cuando ya nadie las escribe. Desde ahí, cualquier
  página sin layout que quede la encuentra `FUD1580`.
- **Los goldens de rutas con layout se fijan antes de tocar el emit** (tarea 3). Es lo que prueba que
  una ruta emite lo mismo, byte a byte.

---

## Fase 1 — Diagnósticos, gramática y los goldens de rutas

- [ ] **1. `FUD1580`, `FUD1581`, `FUD1582`.**
  - Un fichero por código en `codes/`, con su `.md` de unas cinco líneas y su línea en `index.ts`
    (SDD §3.5).
  - *Depende de:* —.
  - *Paquete:* `diagnostics`.
  - *Ficheros:* `src/codes/FUD1580.ts`, `src/codes/FUD1581.ts`, `src/codes/FUD1582.ts` y sus `.md`,
    `src/index.ts`, sus tests.
- [ ] **2. La gramática.**
  - Decisión 183. Notas de enmienda en la 51 y la 82, y en la 43.c, 58, 59, 60, 61 y 78. La
    producción `document`, el ejemplo canónico como ruta más layout, y el índice (SDD §3.2).
  - *Depende de:* —.
  - *Ficheros:* `docs/gramar/gramatica-v1-decisiones.md`.
- [ ] **3. Los goldens de rutas con layout.**
  - Comprobar que los goldens de rutas con layout de `packages/compiler/test/emit/__golden__` cubren
    una ruta con layout de un idioma y otra de dos. Añadir los que falten **antes** de la fase 3. No
    cambian en toda la SDD (criterio 7).
  - *Depende de:* —.
  - *Paquete:* `compiler`.
  - *Ficheros:* `test/emit/golden.test.ts`, `test/emit/__golden__/*`.

## Fase 2 — Nadie escribe páginas sin layout

- [ ] **4. `@fudic/testing`: el layout de host.**
  - `hostPage()` escribe una ruta que enlaza `_host-layout.fud`, escrito con `cached` (SDD §3.4).
    Los tests de `mount` y `renderSnippet` pasan sin tocar sus expectativas del cuerpo (criterio 24).
  - `test/lib-workspace/libs/ui` gana un layout, y su `_error.fud` lo enlaza.
  - *Depende de:* —.
  - *Paquete:* `testing`.
  - *Ficheros:* `src/host.ts`, `src/mount.ts`, `test/host.test.ts`, `test/lib-workspace/libs/ui/src/*`.
- [ ] **5. El workbench: el layout del banco.**
  - `pageSource()`, `casePage` y `documentOf` escriben rutas que enlazan `_bench-layout.fud`.
    `ShowcaseInput.layout` deja de admitir `null`, e `isShowcaseFile` deja de quitar un doctype. Las
    esperadas de `app-card` se reescriben (criterio 25).
  - *Depende de:* —.
  - *Paquete:* `workbench`.
  - *Ficheros:* `src/pages.ts`, `src/paint.ts`, `src/showcase.ts`, `test/showcase.test.ts`,
    `test/expected/app-card/*.fud`.
- [ ] **6. Las fixtures.**
  - `fixtures/home.fud` y `test/fixtures/blog-monolithic.fud` del compilador, y
    `fixtures/canonical/home.fud` del formatter, como ruta más layout. `scripts/build.ts` emite
    `home.fud` por el camino de las rutas. El golden `home.mjs` se regenera.
  - Las fixtures de `packages/diagnostics/fixtures/` de SDD §4.4: cada una sigue provocando su código,
    y su `.fixed.fud` sigue sin él.
  - *Depende de:* 3.
  - *Paquete:* `compiler`, `formatter`, `diagnostics`.
  - *Ficheros:* `packages/compiler/fixtures/*`, `packages/compiler/scripts/build.ts`,
    `packages/compiler/test/fixtures/blog-monolithic.fud`, `packages/compiler/test/emit/__golden__/home.mjs`,
    `packages/formatter/fixtures/canonical/home.fud`, `packages/formatter/test/acceptance/_emit.ts`,
    `packages/diagnostics/fixtures/{FUD0150,FUD0151,FUD0161,FUD0152,FUD0153,FUD0427,FUD0850,FUD0853,FUD0857,FUD0919}/**`.
- [ ] **7. Los tests con fuentes de página sin layout.**
  - Cada fuente de página sin layout de los tests de `compiler`, `vite`, `language-server`,
    `language-core`, `typecheck`, `ssr`, `transport`, `terms` y `mcp` se reescribe como ruta más
    layout, y sigue comprobando lo mismo (SDD §4.4). Los tests de la CLI y del editor que comprueban
    la página sin layout como forma válida van con sus tareas (12, 16, 17, 19).
  - *Depende de:* 4, 6.
  - *Paquete:* los nombrados.
  - *Ficheros:* `packages/*/test/**`.
- [ ] **8. `examples/vista-errores`.**
  - `src/layouts/_layout.fud`, y `vista-errores.fud` como ruta que lo enlaza. Los tests del corpus,
    a las posiciones nuevas, con los mismos errores (criterio 30).
  - *Depende de:* —.
  - *Paquete:* `examples/vista-errores`, `typecheck`, `compiler`.
  - *Ficheros:* `examples/vista-errores/**`, `packages/typecheck/test/vista-errores.test.ts`,
    `packages/compiler/test/semantic/vista-errores.test.ts`, los tests de corpus de ambos.

## Fase 3 — El compilador

- [ ] **9. `structureShell`: un documento con doctype es un layout.**
  - Sin huecos, `layout-document` con `FUD1580` en el span del doctype. Fuera `PageDocument`, su
    miembro de la unión y su exportación. El `<link rel="layout">` del `<head>` de un documento con
    doctype es `FUD0439` (criterios 1, 2, 4, 5).
  - *Depende de:* 1, 7.
  - *Paquete:* `compiler`.
  - *Ficheros:* `src/document/structure.ts`, `src/document/nodes.ts`, `src/document/index.ts`,
    `test/document/structure.test.ts`.
- [ ] **10. Fuera las ramas `page-document`.**
  - `anchor.ts`, `walk.ts`, `view-scope.ts`, `data-without-load.ts`, `await.ts`, `localize.ts`,
    `oxc-code.ts`, `surface.ts`, `resolve.ts` (la rama de `FUD0423` queda para un layout sin
    `@RenderBody()`), `api-links.ts`, `level.ts`, `markup.ts`, `route-client.ts` y `compose.ts`
    (criterio 3).
  - *Depende de:* 9.
  - *Paquete:* `compiler`.
  - *Ficheros:* los nombrados y sus tests.
- [ ] **11. Fuera el emit de la página sin layout.**
  - `buildPageModule`, `emitPageModule`, `emitPageModuleMapped`, `htmlLang` y `pageBoxes`. El
    comentario de `EmitOptions.i18n`, al día. El `lang` de un layout con uno y dos idiomas (criterios
    5, 6, 7).
  - *Depende de:* 10.
  - *Paquete:* `compiler`.
  - *Ficheros:* `src/emit/module.ts`, `src/emit/index.ts`, `test/emit/*`, `test/i18n/*`.

## Fase 4 — El editor, el typecheck y el `.fudapi`

- [ ] **12. `language-core` y `language-server`.**
  - Fuera la rama de página de `emit-client.ts` y `data.ts`. Fuera el rol `page`, el snippet `page`
    y `PAGE_SKELETON`, y `page` en los roles de `snippets.ts` y en `href.ts`. Los tests de snippets,
    con `component`, `route` y `layout`. `FUD1580` en el editor (criterios 22, 23).
  - *Depende de:* 9.
  - *Paquete:* `language-core`, `language-server`.
  - *Ficheros:* `packages/language-core/src/emit-client.ts`, `packages/language-core/src/data.ts`,
    `packages/language-server/src/mode.ts`, `packages/language-server/src/services/snippets.ts`,
    `packages/language-server/src/services/href.ts`, `packages/language-server/src/services/template-scope.ts`,
    `packages/language-server/test/**/snippets*.test.ts`, `packages/language-server/test/mode.test.ts`,
    `packages/language-server/test/_support.ts`.
- [ ] **13. `FUD1581` en el typecheck.**
  - En `fudicDiagnostics`, para el `_error.fud` de su proyecto (`<routesDir>/_error.fud` de una app,
    `src/_error.fud` de una librería) que no es una ruta ni tiene doctype (criterios 8, 9, 10).
  - *Depende de:* 1, 9.
  - *Paquete:* `typecheck`.
  - *Ficheros:* `src/fudic-diagnostics.ts`, su test.
- [ ] **14. `layout` en `_error.fudapi`.**
  - Su handler recibe `data: ErrorPage` en el `.d.ts` y en el editor, en una app y en una librería.
    `FUD0702` sin `_error.fudapi` (criterio 11). Si hoy no se tipa así, se arregla aquí.
  - *Depende de:* —.
  - *Paquete:* `api`, `typecheck`, `language-server`, `vite`.
  - *Ficheros:* `packages/api/src/emit/declarations.ts`, sus tests, un test de punta a punta en `vite`.
- [ ] **15. `layoutPropsType` con un `href` de paquete.**
  - Un `href` que no empieza por `.` ni por `/` da `import('<href>').$Props` (criterio 13).
  - *Depende de:* —.
  - *Paquete:* `api`.
  - *Ficheros:* `src/layout-props.ts`, su test.

## Fase 5 — Vite

- [ ] **16. `analyze`, `transform` y `discover`.**
  - Fuera el rol `page` de `analyze.ts` y la rama `page-document` de `transform.ts`. `discover` emite
    `FUD1581` para un `_error.fud` (propio o de librería) que no es una ruta y no lo compila; la app
    pinta con la página mínima. La página de una librería con su layout (criterios 8, 9, 12). El
    README, al día.
  - *Depende de:* 9, 13.
  - *Paquete:* `vite`.
  - *Ficheros:* `src/analyze.ts`, `src/transform.ts`, `src/discover.ts`, `README.md`, sus tests.

## Fase 6 — La CLI

- [ ] **17. `resolveLayout` sin `null`, y `g page`.**
  - Sin layout, `FUD1582`. Fuera `explicit === null`. `g page` siempre con `route.fud`; fuera la
    plantilla `page.fud`, `'page-document'` de `TemplateRole` y la rama de `api.ts` (criterios 14,
    21).
  - *Depende de:* 1.
  - *Paquete:* `cli`.
  - *Ficheros:* `src/layout.ts`, `src/plans/page.ts`, `src/plans/api.ts`, `src/templates.ts`,
    `templates/page.fud`, `test/page.test.ts`, `test/templates*.test.ts`.
- [ ] **18. `g error-page` con layout.**
  - La plantilla como ruta con `{{layoutHref}}`; el layout por `resolveLayout` en una app y
    `src/layouts/_layout.fud` en una librería; `--layout`; `FUD1582`; la línea `layout` del informe
    (criterios 16, 17, 18).
  - *Depende de:* 17.
  - *Paquete:* `cli`.
  - *Ficheros:* `src/plans/error-page.ts`, `templates/_error.fud`, `src/args.ts`, `src/types.ts`,
    `test/error-page*.test.ts`.
- [ ] **19. Fuera `--no-layout`.**
  - En `new`, `new --workspace --app` y `g app`: `layoutChoice`, `frameOf`, `AppLayout`, la línea del
    README generado y la del informe. `g showcase` sin layout da `FUD1582`. `wire.ts` sin la rama de
    página. Los tests que lo usaban, al día (criterios 15, 19).
  - *Depende de:* 17.
  - *Paquete:* `cli`.
  - *Ficheros:* `src/args.ts`, `src/types.ts`, `src/plans/scaffold.ts`, `src/plans/app.ts`,
    `src/plans/showcase.ts`, `src/wire.ts`, `test/cli.test.ts`, `test/locale.test.ts`,
    `test/showcase.test.ts`, `test/workspace/shapes.test.ts`, `test/wire.test.ts`.
- [ ] **20. La ayuda y el README.**
  - Fuera `--no-layout`; `g page` y `g error-page` dicen qué layout enlazan; `--layout` en
    `g error-page` (criterio 20).
  - *Depende de:* 18, 19.
  - *Paquete:* `cli`.
  - *Ficheros:* `src/help/commands.ts`, `README.md`, `test/help.test.ts`.

## Fase 7 — El MCP

- [ ] **21. Las herramientas.**
  - Fuera `noLayout` de `GENERATE_OPTIONS` y `fudic_new`; `layout` con descripción; la descripción
    de `fudic_generate` (criterio 26).
  - *Depende de:* 19.
  - *Paquete:* `mcp`.
  - *Ficheros:* `src/project-tools.ts`, `test/plans.test.ts`, `test/status.test.ts`.
- [ ] **22. La guía.**
  - `pages.md` y `html-css.md`, en inglés y en español, como dice SDD §3.8. `guide-examples.test.ts`
    en verde (criterio 27).
  - *Depende de:* 14, 18.
  - *Paquete:* `mcp`.
  - *Ficheros:* `guide/pages.md`, `guide/html-css.md`, `guide/es/pages.md`, `guide/es/html-css.md`,
    `test/guide-examples.test.ts`.

## Fase 8 — Los ejemplos y el cierre

- [ ] **23. `examples/workspace`.**
  - El layout de `admin` pasa a `libs/ui/src/layouts/_layout.fud`, exportado. Las rutas de `admin`
    lo enlazan por el paquete. `libs/ui/src/_error.fud` y `tienda/src/routes/_error.fud` como rutas
    con layout. `tests/errores.spec.ts` con lo de SDD §4.3 (criterios 28, 29).
  - *Depende de:* 16, 15.
  - *Paquete:* `examples/workspace`.
  - *Ficheros:* `libs/ui/package.json`, `libs/ui/src/layouts/_layout.fud`, `libs/ui/src/_error.fud`,
    `apps/admin/src/layouts/_layout.fud` (borrado), `apps/admin/src/routes/*.fud`,
    `apps/tienda/src/routes/_error.fud`, `tests/errores.spec.ts`.
- [ ] **24. `verify:generated`.**
  - El paso `g error-page --project ui` necesita el layout de `ui`: un paso `g layout _layout
    --project ui` antes. El resto de pasos, sin cambios.
  - *Depende de:* 18.
  - *Ficheros:* `scripts/verify-generated.mjs`.
- [ ] **25. Las notas en los SDD cerrados.**
  - «Enmendada por SDD-88» en SDD-22 §4.5 (regla 3) y en SDD-87 §3.6 y §8.1, decisión 12 (SDD §8.1,
    decisión 12).
  - *Depende de:* —.
  - *Ficheros:* `docs/sdd/SDD-22-fudic-cli.md`, `docs/sdd/SDD-87-pagina-de-error-compartida.md`.
- [ ] **26. El cierre.**
  - `pnpm typecheck`, `pnpm build`, `verify:generated`, la cobertura de SDD §5 y los e2e de
    `examples/workspace` y `examples/basic`, en verde. Un grep de `<!DOCTYPE` en los `.fud` del repo
    (fuera de `node_modules` y `dist`) solo encuentra layouts (criterios 28, 31). Estado `Hecho` en
    el SDD, este fichero y el INDEX.
  - *Depende de:* todas.
