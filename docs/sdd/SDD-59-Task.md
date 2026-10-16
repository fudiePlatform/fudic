# SDD-59 — Tareas

> **SDD:** [SDD-59 — Los términos de serie](./SDD-59-terminos-de-serie.md)
> **Paquetes:** `@fudic/terms` (nuevo) · `@fudic/workbench` · `@fudic/language-server` · `fudic-vscode` · `examples/basic`
> **Progreso:** 0 / 9 — `Listo`.

`@fudic/terms` nace al 100 % en las cuatro métricas; los paquetes tocados no bajan de su suelo.

---

## Fase 1 — El paquete (3)

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [ ] | 1 | — | **Paquete.** `package.json` (versión exacta, `files`, `exports`), `tsconfig`, `vitest.config.ts` con umbrales al 100, `README.md` en inglés con el vocabulario (§3.1) | `packages/terms/*` |
| [ ] | 2 | 1 | **Vocabulario.** Los siete términos de §3.2 y `termsDir()` | `packages/terms/terms/**/*.js` · `packages/terms/src/index.ts` |
| [ ] | 3 | 2 | **Tests.** Criterios 1–3 | `packages/terms/test/*` |

## Fase 2 — El banco y el editor lo encuentran (4)

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [ ] | 4 | 2 | **Banco.** Resolver `@fudic/terms` desde la raíz del proyecto y pasarlo como `frameworkTerms` (§3.3) | `packages/workbench/src/session.ts` |
| [ ] | 5 | 2 | **Editor.** Resolver la capa por proyecto del `.fudspec` (§3.3) | `packages/language-server/src/fudspec/host.ts` · `packages/vscode/src/*` |
| [ ] | 6 | 4, 5 | **Tests.** Criterios 4–8 | `packages/workbench/test/*` · `packages/language-server/test/*` |
| [ ] | 7 | 6 | **Prueba de Pedro.** Spec de §6.4 en verde desde VS Code y desde `fudic-workbench run` | — |

## Fase 3 — El ejemplo y el cierre (2)

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [ ] | 8 | 4 | **`examples/basic`.** Borrar los cinco términos duplicados, añadir `@fudic/terms` como devDependency; criterio 9 | `examples/basic/*` |
| [ ] | 9 | 1–8 | **Cierre.** Estado `Hecho`, registro de progreso, tabla maestra | `docs/sdd/INDEX.md` |
