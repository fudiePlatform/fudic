# SDD-79 — Tareas

> **SDD:** [SDD-79 — La guía de estilos generada](./SDD-79-guia-de-estilos-generada.md)
> **Paquetes:** `config` · `compiler` · `vite` · `language-server` · `cli` · `mcp` · `diagnostics` ·
> `examples/workspace`
> **Rama:** `sdd-79-guia-de-estilos-generada`, desde `main`.
> **Progreso:** 6 / 22 — `En curso`. Las tareas de tests (5, 8, 12, 13, 16, 18) las escribe la
> sesión de test y se marcan cuando las entrega.

**El orden manda en dos puntos.** El defecto de los `url()` (tarea 3) va antes que los trozos,
porque un trozo de lib con un icono lo pisa. Y la plantilla de la guía (fase 4) se escribe después
del compilador y el build, porque sus criterios (25, 26) construyen la app generada.

---

## Mapa de dependencias

```
1 códigos ─┬─ 2 config.guide ─→ 4 readGuide/piecesForTag ─→ 5 tests
           │                        │
3 url() de hojas adoptadas ─────────┤
                                    ▼
                    6 emit: guides + icon ─→ 7 vite: cadena, trozos, avisos ─→ 8 tests del build
                                    │
                                    ├─→ 9 LS: cadena y trozos ─→ 10 completado ─→ 11 avisos y arreglos ─→ 12 tests
                                    │                                               │
                                    │                                               └─→ 13 fudic_fix respeta lo manual
                                    ▼
             14 bytes en la CLI ─→ 15 plantilla guide ─→ 16 test de contraste
                                    │
                                    └─→ 17 new / workspace / g app / g lib / g guide ─→ 18 tests de la CLI
                                                                                          │
                     19 examples/workspace ─→ 20 guía del MCP ─→ 21 prueba de Pedro ─→ 22 cierre
```

---

## Fase 1 — los cimientos (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **Los códigos.** `FUD1440`–`FUD1443`, cada uno con su `.ts` tipado, su `.md` de unas cinco líneas y su línea en `index.ts` (SDD §3.6). Rango `FUD1440`–`FUD1459` reservado | `diagnostics` | `src/codes/FUD144*.{ts,md}` · `src/index.ts` |
| [x] | 2 | — | **`guide` en `fudic.json`.** `GuideConfig`, lectura con `readFolder` para las rutas, `FUD0725` en las formas inválidas (SDD §3.1). Criterio 1 | `config` | `src/read.ts` · `test/read.test.ts` |
| [x] | 3 | — | **Los `url()` de una hoja adoptada desde su fichero.** `ProjectStyle.spec`; `renderProjectStyles`, la poda (`plainSheet`) y `sheetUrlsOf` reescriben contra él; el host lo rellena desde la ruta que hoy descarta ([styles.ts:57](../../packages/vite/src/styles.ts)) (SDD §4.6). Criterio 14 | `compiler` · `vite` | `src/emit/project-styles.ts` · `src/emit/page-sheets.ts` · `src/emit/module.ts` · `src/styles.ts` |

## Fase 2 — el compilador y el build (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 4 | 1, 2 | **`readGuide` y `piecesForTag`.** Aplanar con `flattenImports`; clasificar cada import directo según §4.3 (adoptable, no global, nombre válido → trozo; `FUD1442` si el nombre no vale); `piecesForTag` por el sujeto de cada selector (§4.5) | `compiler` | `src/css/guide.ts` (nuevo) · `src/index.ts` |
| [ ] | 5 | 4 | **Sus tests.** Criterios 2–5, sobre la plantilla real (`packages/cli/templates/guide`) cuando exista y sobre fixtures mínimas hasta entonces | `compiler` | `test/css/guide.test.ts` |
| [x] | 6 | 3, 4 | **El emit: `guides` e `icon`.** `pageSheets` añade cada `GuideSheet` como hoja de documento antes de las del layout, con ámbito `document` y la misma entrega que un `<link>` podado; el `<link rel="icon">` solo si el `<head>` no tiene uno (SDD §4.2, §4.7) | `compiler` | `src/emit/page-sheets.ts` · `src/emit/layout.ts` · `src/emit/module.ts` (`EmitOptions`) |
| [x] | 7 | 6 | **Vite: la cadena.** `ProjectStyleChains.guidesFor`/`iconFor`; los trozos en `choosableFor` con la comprobación de `FUD0741`; `FUD1443`; `FUD1440` y `FUD1441` para el componente de la entrada, junto a `adoptDiagnostics`; el fichero de la guía y sus imports entran en las dependencias del módulo para que editar un trozo repinte en dev | `vite` | `src/styles.ts` · `src/transform.ts` |
| [ ] | 8 | 7 | **Tests del build.** Criterios 6–17 y 24 con un workspace de prueba (app + `libs/ui` + `libs/guide`); el 8 con el snapshot existente sin tocar | `vite` | `test/guide-*.test.ts` |

## Fase 3 — el editor (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 9 | 4 | **La cadena en el servidor.** `choosableStylesFor` con `dependencyChain` y los trozos de cada guía, invalidado al cambiar cualquier `fudic.json` o fichero de guía de la cadena. Criterio 18 | `language-server` | `src/project-config.ts` |
| [ ] | 10 | 9 | **El completado añade el trozo.** En el template raíz, `additionalTextEdits` que añaden a `shadowrootadoptedstylesheets` o crean el atributo (SDD §4.8). Criterio 19 | `language-server` | `src/services/plugin.ts` · `src/services/template-attrs.ts` |
| [ ] | 11 | 9 | **Los avisos y sus arreglos.** `FUD1440` sobre la etiqueta, `FUD1441` sobre el nombre (con `prunePage` contra `shadowSurface`); `repairsFor` gana los dos, el de `FUD1441` marcado *manual* (SDD §4.9) | `language-server` | `src/services/template-attrs.ts` · `src/repairs.ts` |
| [ ] | 12 | 10, 11 | **Sus tests.** Criterios 18–22 | `language-server` | `test/services/template-attrs.test.ts` · `test/repairs.test.ts` |
| [ ] | 13 | 11 | **`fudic_fix` no quita.** Salta los arreglos marcados *manual*. Criterio 23 | `mcp` | `src/fix.ts` · `test/fix.test.ts` |

## Fase 4 — la CLI (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 14 | — | **Ficheros binarios.** `FileChange` con `bytes`, `io.writeBytes`, `apply` y `--dry-run` con el tamaño; leer una plantilla como bytes. Criterio 31 | `cli` | `src/types.ts` · `src/io.ts` · `src/apply.ts` · `src/templates.ts` |
| [ ] | 15 | 14 | **La plantilla.** `templates/guide/**` según SDD §4.1, §4.4, §4.10, §4.11: `guide.css`, `tokens.css` con `light-dark()`, `document.css`, `base.css`, los trozos (lista cerrada contra las hojas UA de Chromium, Firefox y WebKit; anotar en §8.2 lo que se añada o quite), Inter 4.1 + `OFL.txt` de la release oficial, `logo.svg` provisional, `fudic.json`, `package.json`, `README.md` | `cli` | `templates/guide/**` |
| [ ] | 16 | 15 | **El test de contraste.** Lee `tokens.css` de la plantilla, resuelve cada `light-dark()` y comprueba la tabla de §4.10 en los dos modos. Criterio 32 | `cli` | `test/guide-contrast.test.ts` |
| [ ] | 17 | 15 | **Los comandos.** `g guide` (workspace y app suelta), `new` con `src/guide/`, `new --workspace` con `libs/guide` y las dependencias, `g app`/`g lib` dependen de las guías del workspace, `--styles-only` fuera con su sugerencia; ayuda (`help/commands.ts`, `usage.ts`), `README.md` de la CLI y `templates/README.md.tmpl` (SDD §3.5, §4.12). Enmienda en BUG-50 §4.7 | `cli` · docs | `src/args.ts` · `src/run.ts` · `src/plans/{guide,new,workspace,app,lib}.ts` · `src/help/*` · `README.md` · `docs/sdd/bugs/BUG-50-*.md` |
| [ ] | 18 | 16, 17 | **Tests de la CLI.** Criterios 25–30, con `pnpm build` real de la app y del workspace generados (como `new-build.test.ts`) | `cli` | `test/generate/guide.test.ts` · `test/workspace/*.test.ts` |

## Fase 5 — ejemplo, documentación y cierre (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 19 | 8 | **`examples/workspace`.** `libs/guia` al formato de §4.1; `tienda` mueve su `--guia-accent` a su hoja de documento; e2e en verde (SDD §4.13). Criterio 33 | `examples` | `examples/workspace/**` |
| [ ] | 20 | 17 | **La guía del MCP.** `html-css.md` y su copia en español: la guía, los trozos, la adopción, la asimetría | `mcp` | `guide/html-css.md` · `guide/es/html-css.md` |
| [ ] | 21 | 18, 19 | **La prueba de Pedro** (SDD §6.1). Lo que salga va a §8.2 | — | — |
| [ ] | 22 | 1–21 | **Cierre.** Criterio 34: `pnpm typecheck`, `pnpm test`, `pnpm build`; ficheros nuevos al 100 % con su umbral por fichero en `compiler`, `vite` y `cli`; `language-server` al 100 %. Estado `Hecho` en la SDD, aquí y en `INDEX.md`; entrada en el registro de progreso | docs | `docs/sdd/*` |
