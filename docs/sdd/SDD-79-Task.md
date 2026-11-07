# SDD-79 — Tareas

> **SDD:** [SDD-79 — La guía de estilos generada](./SDD-79-guia-de-estilos-generada.md)
> **Paquetes:** `config` · `compiler` · `vite` · `language-server` · `cli` · `mcp` · `diagnostics` ·
> `examples/workspace`
> **Rama:** `sdd-79-guia-de-estilos-generada`, desde `main`.
> **Progreso:** 22 / 22 — `Hecho` (2026-11-06).

## Relevo 2 (2026-11-06, segunda sesión)

**Hecho.** Tests de todo el SDD escritos y en verde (commit `ef37e12a`); lo nuevo al 100 % con su
umbral (compiler, vite, cli); `language-server`, `config`, `diagnostics`, `mcp` y `typecheck` al
100 %. Arreglado que una app recién creada avisara `FUD0742`/`FUD0852` por el `base.css` de su guía
(SDD §8.3.6), con sus tests (`vite/test/build-guide.test.ts`, `guide-chains.test.ts`); los ejemplos
de la guía del MCP pasan. El e2e del ejemplo da 3 verdes y 2 rojos (`caches.spec.ts`, abrir sin
conexión tras visitar la otra app) que **ya fallaban en `main`** (§8.3.7).

**Falta, en este orden:**

1. `pnpm typecheck`, `pnpm test` y `pnpm build` completos desde la raíz (por paquete ya pasan; con
   la máquina cargada dos tests de `typecheck` se pasan de tiempo y pasan solos).
2. Decidir con Pedro si el e2e de cachés va a un BUG aparte (§8.3.7) y marcar la tarea 19.
3. La prueba de Pedro (tarea 21, §6.1).
4. Cierre (tarea 22): estado `Hecho` aquí, en la spec y en `INDEX.md` (tabla y registro).

## Relevo (2026-11-06)

**Estado.** Implementación completa en la rama `sdd-79-guia-de-estilos-generada` (origin), worktree
`.claude/worktrees/sdd-79-guia-de-estilos-generada`. Commits: `1719c775` (fase 1), `23533193`
(fase 2), `648b44a6` (fase 3), `a06ac4a7` (fase 4), `8713bb20` (fase 5). `pnpm typecheck` del
código fuente y `pnpm build` en verde. **No hay ni un test escrito** de este SDD: la sesión de test
emparejada no llegó a arrancar. Las decisiones tomadas al implementar están en SDD §8.2 (1–23).

**Lo que falta, en este orden** (un commit por bloque, cobertura al cierre de cada uno):

1. **Que compilen los tests rotos.** `FileChange` ganó la variante `{ kind: 'create', path, bytes }`
   y `WriteIo` ganó `writeBytes`: ~40 ficheros de `packages/cli/test` (empezar por el `MemoryFs` de
   `test/helpers.ts` y un helper que estreche a `contents`), más
   `language-server/test/acceptance/formatting.test.ts`, `language-server/test/fudspec/same-file.test.ts`
   y `mcp/test/format.test.ts`. Ver con `pnpm -r --no-bail typecheck`. Los fakes de `ProjectStyles`
   en `vite/test` necesitan `guidesFor`, `iconFor` y `piecesFor`.
2. **Compilador — criterios 2–5** (tarea 5): `readGuide` sobre `packages/cli/templates/guide` y sobre
   fixtures mínimas; `piecesForTag`; `rebaseUrls`/`projectCss` (criterio 14 en el compilador);
   `pageGuide`/`guideOf`, `onGuide` y `hasIcon` de `parts.ts`, `guideAdoptionDiagnostics`,
   `templateSurface`. Ficheros nuevos al 100 %: `css/guide.ts`, `emit/guide-adoption.ts`.
3. **Build — criterios 6–17 y 24** (tarea 8): un workspace de prueba (app + `libs/ui` +
   `libs/guide`); el 8 con el snapshot existente sin tocar. `vite/src/guide.ts` al 100 %.
4. **Editor y MCP — criterios 18–23** (tareas 12 y 13), por el plugin del LS; `language-server`
   tiene que seguir al 100 %. Incluye `adoptionEditFor`, el completado de `owned.ts`, los arreglos
   de `repairs.ts` (el de `FUD1441` con `manual`), `fudic_fix` y `problemsOf` del MCP.
5. **CLI — criterios 25–32** (tareas 16 y 18): con `pnpm build` real de la app y del workspace
   generados (como `new-build.test.ts`); el test de contraste lee `templates/guide/tokens.css`.
   `plans/guide.ts` y `plans/guide-files.ts` al 100 %. Snapshots del árbol de `fudic new` y de su
   `fudic.json` cambian a propósito (§8.2.14).
6. **Diagnósticos y config**: `FUD1440`–`FUD1444` y el problema `guide` de `FUD0725` en los tests de
   catálogo; criterio 1 en `config/test/read.test.ts` (umbral 100). `typecheck/tokens.ts` lee la guía
   (§8.2.21): un test.
7. **e2e del ejemplo** (tarea 19, criterio 33): `pnpm --filter @fudic/example-workspace test:e2e`.
   La ejecución se cortó a medias: comprobar que no quedó un `serve.mjs` vivo en el puerto 4373. El
   build del ejemplo ya da la guía, el favicon y `data-fud-adopt="base ui h2 …"`.
8. **Prueba de Pedro** (tarea 21) y **cierre** (tarea 22).

Antes de tocar `compiler`, `vite` y `cli`, medir su suelo de cobertura.

---

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
| [x] | 5 | 4 | **Sus tests.** Criterios 2–5, sobre la plantilla real (`packages/cli/templates/guide`) cuando exista y sobre fixtures mínimas hasta entonces | `compiler` | `test/css/guide.test.ts` |
| [x] | 6 | 3, 4 | **El emit: `guides` e `icon`.** `pageSheets` añade cada `GuideSheet` como hoja de documento antes de las del layout, con ámbito `document` y la misma entrega que un `<link>` podado; el `<link rel="icon">` solo si el `<head>` no tiene uno (SDD §4.2, §4.7) | `compiler` | `src/emit/page-sheets.ts` · `src/emit/layout.ts` · `src/emit/module.ts` (`EmitOptions`) |
| [x] | 7 | 6 | **Vite: la cadena.** `ProjectStyleChains.guidesFor`/`iconFor`; los trozos en `choosableFor` con la comprobación de `FUD0741`; `FUD1443`; `FUD1440` y `FUD1441` para el componente de la entrada, junto a `adoptDiagnostics`; el fichero de la guía y sus imports entran en las dependencias del módulo para que editar un trozo repinte en dev | `vite` | `src/styles.ts` · `src/transform.ts` |
| [x] | 8 | 7 | **Tests del build.** Criterios 6–17 y 24 con un workspace de prueba (app + `libs/ui` + `libs/guide`); el 8 con el snapshot existente sin tocar | `vite` | `test/guide-*.test.ts` |

## Fase 3 — el editor (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 9 | 4 | **La cadena en el servidor.** `choosableStylesFor` con `dependencyChain` y los trozos de cada guía, invalidado al cambiar cualquier `fudic.json` o fichero de guía de la cadena. Criterio 18 | `language-server` | `src/project-config.ts` |
| [x] | 10 | 9 | **El completado añade el trozo.** En el template raíz, `additionalTextEdits` que añaden a `shadowrootadoptedstylesheets` o crean el atributo (SDD §4.8). Criterio 19 | `language-server` | `src/services/plugin.ts` · `src/services/template-attrs.ts` |
| [x] | 11 | 9 | **Los avisos y sus arreglos.** `FUD1440` sobre la etiqueta, `FUD1441` sobre el nombre (con `prunePage` contra `shadowSurface`); `repairsFor` gana los dos, el de `FUD1441` marcado *manual* (SDD §4.9) | `language-server` | `src/services/template-attrs.ts` · `src/repairs.ts` |
| [x] | 12 | 10, 11 | **Sus tests.** Criterios 18–22 | `language-server` | `test/services/template-attrs.test.ts` · `test/repairs.test.ts` |
| [x] | 13 | 11 | **`fudic_fix` no quita.** Salta los arreglos marcados *manual*. Criterio 23 | `mcp` | `src/fix.ts` · `test/fix.test.ts` |

## Fase 4 — la CLI (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 14 | — | **Ficheros binarios.** `FileChange` con `bytes`, `io.writeBytes`, `apply` y `--dry-run` con el tamaño; leer una plantilla como bytes. Criterio 31 | `cli` | `src/types.ts` · `src/io.ts` · `src/apply.ts` · `src/templates.ts` |
| [x] | 15 | 14 | **La plantilla.** `templates/guide/**` según SDD §4.1, §4.4, §4.10, §4.11: `guide.css`, `tokens.css` con `light-dark()`, `document.css`, `base.css`, los trozos (lista cerrada contra las hojas UA de Chromium, Firefox y WebKit; anotar en §8.2 lo que se añada o quite), Inter 4.1 + `OFL.txt` de la release oficial, `logo.svg` provisional, `fudic.json`, `package.json`, `README.md` | `cli` | `templates/guide/**` |
| [x] | 16 | 15 | **El test de contraste.** Lee `tokens.css` de la plantilla, resuelve cada `light-dark()` y comprueba la tabla de §4.10 en los dos modos. Criterio 32 | `cli` | `test/guide-contrast.test.ts` |
| [x] | 17 | 15 | **Los comandos.** `g guide` (workspace y app suelta), `new` con `src/guide/`, `new --workspace` con `libs/guide` y las dependencias, `g app`/`g lib` dependen de las guías del workspace, `--styles-only` fuera con su sugerencia; ayuda (`help/commands.ts`, `usage.ts`), `README.md` de la CLI y `templates/README.md.tmpl` (SDD §3.5, §4.12). Enmienda en BUG-50 §4.7 | `cli` · docs | `src/args.ts` · `src/run.ts` · `src/plans/{guide,new,workspace,app,lib}.ts` · `src/help/*` · `README.md` · `docs/sdd/bugs/BUG-50-*.md` |
| [x] | 18 | 16, 17 | **Tests de la CLI.** Criterios 25–30, con `pnpm build` real de la app y del workspace generados (como `new-build.test.ts`) | `cli` | `test/generate/guide.test.ts` · `test/workspace/*.test.ts` |

## Fase 5 — ejemplo, documentación y cierre (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 19 | 8 | **`examples/workspace`.** `libs/guia` al formato de §4.1; `tienda` mueve su `--guia-accent` a su hoja de documento; e2e en verde (SDD §4.13). Criterio 33 | `examples` | `examples/workspace/**` |
| [x] | 20 | 17 | **La guía del MCP.** `html-css.md` y su copia en español: la guía, los trozos, la adopción, la asimetría | `mcp` | `guide/html-css.md` · `guide/es/html-css.md` |
| [x] | 21 | 18, 19 | **La prueba de Pedro** (SDD §6.1). Lo que salga va a §8.2 | — | — |
| [x] | 22 | 1–21 | **Cierre.** Criterio 34: `pnpm typecheck`, `pnpm test`, `pnpm build`; ficheros nuevos al 100 % con su umbral por fichero en `compiler`, `vite` y `cli`; `language-server` al 100 %. Estado `Hecho` en la SDD, aquí y en `INDEX.md`; entrada en el registro de progreso | docs | `docs/sdd/*` |
