# BUG-50 — Tareas

> **BUG:** [BUG-50 — La CLI que nadie entiende](./BUG-50-la-cli-que-nadie-entiende.md)
> **Paquetes:** `@fudic/cli` · `@fudic/language-core` · `@fudic/typecheck` · `examples/workspace` · `@fudic/workbench` · `@fudic/testing` · `@fudic/terms` · `@fudic/resolve`
> **Rama:** `bug-50-cli-usable` (worktree `fudic-bug-50`), desde `main` en `e4f7a8a`.
> **Depende de:** SDD-59 `Hecho` para las tareas que ejecutan un `.fudspec` (12, 24).
> **Progreso:** 12 / 27 — en curso (13 y 18, pruebas de Pedro, al final).

Lo nuevo nace al 100 % en las cuatro métricas; `@fudic/cli` no baja de su suelo.

---

## Fase 1 — La ayuda y los errores (3)

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [x] | 1 | — | **Ayuda general.** El texto de §6.1 (BUG §4.1) | `src/args.ts` · `src/help/*` |
| [x] | 2 | 1 | **Ayuda por comando y errores de una línea.** `fudic <command> --help`; `run.ts` deja de volcar `USAGE`; FUD0440 sugiere con el prefijo del proyecto (§6.6, §6.8) | `src/args.ts` · `src/run.ts` · `packages/diagnostics/src/codes/FUD0440.ts` |
| [x] | 3 | 1, 2 | **Tests.** §6.1, §6.6, §6.8 | `packages/cli/test/*` |

## Fase 2 — Proyectos que se prueban (6)

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [x] | 4 | — | **Prefijo por defecto** = nombre del proyecto en `new`, `g app`, `g lib` (BUG §3.2) | `src/args.ts` |
| [x] | 5 | — | **Dependencias y scripts de prueba** en app y lib; `vitest.config.ts`; `src/fudic-env.d.ts` siempre (BUG §4.2). **Añadido (Pedro, 2026-10-17):** `fudic-workbench run --pass-with-no-specs` y los tipos de jest-dom en `@fudic/testing` | `templates/*` · `src/plans/scaffold.ts` · `src/plans/lib.ts` · `packages/workbench/src/run-cli.ts` · `packages/testing/src/index.ts` |
| [x] | 6 | 5 | **Tests de página y layout** en `new`, `g page`, `g layout` (BUG §4.4) | `src/plans/page.ts` · `src/plans/layout.ts` · `src/plans/scaffold.ts` · `templates/*` |
| [x] | 7 | — | **Sin comentarios de diseño** en lo generado: `GLOBALS_DTS`, `fudic-env.d.ts`, `layout.fud`, `vite.config.ts`, READMEs (BUG §4.8) | `packages/language-core/src/globals.ts` · `packages/typecheck/src/globals.ts` · `src/plans/spec.ts` · `templates/*` |
| [x] | 8 | 4–7 | **Tests.** Contenido de ficheros de §6.2–§6.5 y §6.14 | `packages/cli/test/*` |
| [x] | 9 | 8 | **Prueba en verde.** `new` + `pnpm test` en una app real, contra Verdaccio (contra Verdaccio: app de `fudic new` con `pnpm test`, `pnpm spec` y `tsc` en verde. Destapó dos fallos que el enlace `workspace:*` ocultaba: `scripts/local-registry.mjs` no olvidaba la caché de pnpm 11 y publicaba 9 de 24 paquetes; `@fudic/testing` instalado no pasaba sus wrappers por vitest y `visit` daba 500) | — |

## Fase 3 — El componente completo (4)

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [x] | 10 | 4, 5 | **Carpeta con cuatro ficheros**; `.fud` sin `@code` vacío; fixture siempre; spec con `renders`; `--skip-test`, `--skip-spec`; retirar `--spec`; borrar `.gitkeep` (BUG §4.3). **Añadido (Pedro, 2026-10-17):** término de serie `then present` en `@fudic/terms` y el spec generado lo usa; `@fudic/ssr` en las devDependencies de la lib | `src/plans/component.ts` · `src/plans/spec.ts` · `templates/component.fud` · `packages/terms/terms/then/present.js` |
| [x] | 11 | 10 | **`exports` de la lib** `./*.fud` → `./src/components/*/*.fud`; `--dir` relativo al proyecto y el aviso de §6.7 | `templates/lib/package.json.tmpl` · `src/workspace/link.ts` · `src/plans/component.ts` · `packages/resolve/src/libraries.ts` (`exports` con varios `*`) |
| [x] | 12 | 10, 11 | **Tests.** §6.5, §6.6, §6.7; `pnpm test` y `pnpm spec` en verde sobre la lib generada | `packages/cli/test/*` |
| [ ] | 13 | 12 | **Prueba de Pedro.** Lib nueva + componente, test y spec en verde (al final, con la 26: decisión de Pedro, no detiene las fases) | — |

## Fase 4 — Workspace, bases y servidor único (5)

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [ ] | 14 | — | **Raíz del workspace.** Scripts `dev`, `preview`, `build`, `test`, `spec`; README; `--uses` en `new --workspace`; commit `chore: create workspace <name>` (BUG §4.5, §4.9) | `src/plans/workspace.ts` · `src/plans/new.ts` · `src/args.ts` · `templates/workspace/*` |
| [ ] | 15 | — | **Bases.** Primera app `/`; `g app` escribe `base` (`--base`); dos apps con la misma base es error; `g app` instala (BUG §4.5, §4.6) | `src/plans/app.ts` · `templates/vite.config.ts.tmpl` |
| [ ] | 16 | 15 | **`fudic dev` y `fudic preview`.** Todas las apps en un puerto, base más larga primero (BUG §4.5). **`fudic test` y `fudic spec`**: los del proyecto, o los de todo el workspace desde su raíz (BUG §3.1; añadido por decisión de Pedro, 2026-10-17: ninguna tarea los cubría) | `src/serve/*` · `src/args.ts` · `src/run.ts` |
| [ ] | 17 | 14–16 | **Tests.** §6.2, §6.4, §6.9 | `packages/cli/test/*` |
| [ ] | 18 | 17 | **Prueba de Pedro.** `pnpm dev` y `pnpm preview` con `/` y `/admin/` en el navegador; `pnpm --filter admin dev` (al final, con la 26: decisión de Pedro, no detiene las fases) | — |

## Fase 5 — Añadir: módulos, librerías, servicios, formularios y estilos (6)

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [ ] | 19 | — | **`fudic add`.** `di`, `forms`, `http` (+ `src/http.ts`), `i18n` (`--locales`), librería del workspace (BUG §4.6) | `src/plans/add.ts` · `src/args.ts` · `src/workspace/uses.ts` |
| [ ] | 20 | 19 | **`g service`** con `--provided` (BUG §4.7) | `src/plans/service.ts` · `templates/*` |
| [ ] | 21 | 19 | **`g form`** con `--binary` (BUG §4.7) | `src/plans/form.ts` · `templates/*` |
| [ ] | 22 | — | **`g style` y `g lib --styles-only`** (BUG §4.7) | `src/plans/style.ts` · `src/plans/lib.ts` · `templates/lib/*` |
| [ ] | 23 | 19–22 | **Tests.** §6.10–§6.13 | `packages/cli/test/*` |
| [ ] | 24 | 23 | **`examples/workspace` regenerado con la CLI**: misma estructura (`guia` solo estilos, `ui`, dos apps en `/` y `/admin/`), y sus e2e en verde | `examples/workspace/*` |

## Fase 6 — Cierre (3)

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [ ] | 25 | 1–24 | **README de `@fudic/cli`** en inglés, corto, sin citas a SDD | `packages/cli/README.md` |
| [ ] | 26 | 25 | **Prueba de Pedro.** Repetir como desarrollador nuevo la sesión del §1 contra Verdaccio | — |
| [ ] | 27 | 26 | **Cierre.** Estado `Hecho`, índices, registro de progreso | `docs/sdd/bugs/INDEX.md` · `docs/sdd/INDEX.md` |
