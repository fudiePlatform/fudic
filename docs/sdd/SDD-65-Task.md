# SDD-65 — Tareas

> **SDD:** [SDD-65 — El historial de cada pieza](./SDD-65-historial-de-cada-pieza.md)
> **Paquetes:** `@fudic/history` (nuevo) · `@fudic/cli` · `@fudic/diagnostics` · `@fudic/conventions`
> **Rama:** `sdd-65-historial-de-cada-pieza`. Nace de `main` **con SDD-64 en `Hecho`** (los
> informes que graba) y SDD-63 (el contrato).
> **Progreso:** 0 / 17 — `Listo`.

**Dos sesiones.** Una implementa y coordina. La otra escribe los tests de cada fase (las tareas
«Los tests de…») contra los criterios de SDD §6. Si un test destapa un defecto, se corrige el
código, no el test.

**El paquete nace al 100 %** en las cuatro métricas desde su primer commit (tarea 3).

---

## Mapa de dependencias

```
1 códigos ─→ 2 HISTORY_EXTENSION ─→ 3 el paquete
   │
   ▼
4 formatLine ─→ 5 parseHistory ─→ 6 record ─→ 7 tests
   │
   ▼
8 hash de aprobación ─→ 9 hash de entrada ─→ 10 tests
   │
   ▼
11 unitState ─→ 12 snapshot y record…Run ─→ 13 tests
   │
   ▼
14 approve, accept, history ─→ 15 .gitattributes en new ─→ 16 tests
   │
   ▼
17 docs, entrega y cierre
```

---

## Fase 1 — catálogo y paquete (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 1 | — | **Los códigos.** `FUD1220`–`FUD1222`: `.ts`, `.md` y línea en `index.ts`. El rango en la fila de SDD-65 del `INDEX.md` | `diagnostics` | `src/codes/FUD1220`–`1222.{ts,md}` · `src/index.ts` |
| [ ] | 2 | — | **`HISTORY_EXTENSION = '.fudlog'`** | `conventions` | `src/index.ts` |
| [ ] | 3 | — | **`@fudic/history`.** `package.json` con versiones exactas, `tsconfig`, `vitest.config` con umbrales al 100 en las cuatro métricas e `include: ['src/**/*.ts']`, README corto | `history` | `packages/history/*` |

## Fase 2 — el fichero (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 4 | 3 | **`formatLine`.** Cada suceso de SDD §3.2; textos con escape de JSON | `history` | `src/format.ts` |
| [ ] | 5 | 1, 4 | **`parseHistory`.** Nunca lanza; `FUD1220` por línea rota; ordenado por instante, estable | `history` | `src/parse.ts` |
| [ ] | 6 | 4 | **`record`.** Añade al final, crea el fichero si falta; instante UTC al minuto y commit de `HEAD` (o `-------`) | `history` | `src/record.ts` |
| [ ] | 7 | 4–6 | **Los tests de la fase.** Criterios 1–3 (el de merge con un git temporal) | `history` | `test/**` |

## Fase 3 — los hashes (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 8 | 3 | **Hash de aprobación.** `.fudspec` y fixture, ordenados, `LF` | `history` | `src/hash.ts` |
| [ ] | 9 | 8 | **Hash de entrada.** Hermanos, `<link rel="component">` transitivos con sus `.fudapi` (por `FudIndex`), imports del proyecto transitivos (parser del compilador); sin `node_modules` | `history` | `src/inputs.ts` |
| [ ] | 10 | 8, 9 | **Los tests de la fase.** Criterios 4–6 | `history` | `test/**` |

## Fase 4 — el estado y las ejecuciones (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 11 | 5, 9 | **`unitState`.** `approval`, `tests`, `spec`, `look`, `done`, `accepted` según SDD §4.4 | `history` | `src/state.ts` |
| [ ] | 12 | 9 | **`snapshot`, `recordSpecRun` y `recordTestRun`.** A qué pieza va cada ejecución (SDD §4.3), con el hash del `snapshot` | `history` | `src/runs.ts` |
| [ ] | 13 | 11, 12 | **Los tests de la fase.** Criterios 7–11, con `runSpecs` y `runTests` de verdad sobre un proyecto de prueba | `history` | `test/**` |

## Fase 5 — la CLI (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 14 | 11 | **`approve`, `accept` y `history`.** Planes; la persona de `git config user.name`; la etiqueta como `PlanCommand`; `FUD1221`/`FUD1222`; ayuda de cada comando | `cli` | `src/plans/history.ts` · `src/args.ts` · `src/run.ts` · `src/help/*` |
| [ ] | 15 | — | **`.gitattributes` en `new`.** `*.fudlog merge=union` en las dos formas de `new` | `cli` | `templates/gitattributes.tmpl` · `src/plans/scaffold.ts` · `src/plans/workspace.ts` |
| [ ] | 16 | 14, 15 | **Los tests de la fase.** Criterios 12–15 | `cli` | `test/**` |

## Fase 6 — cierre (1)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 17 | 16 | **Docs, entrega y cierre.** README de `@fudic/history` y de la CLI (los tres comandos), en inglés y sin citar SDD; `pnpm typecheck`, `pnpm test` y `pnpm build` en verde y al 100 % (criterio 16); SDD-65 y este fichero en `Hecho`, fila y registro del `INDEX.md` | varios | `packages/*/README.md` · `docs/sdd/*` |
