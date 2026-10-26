# SDD-66 — Tareas

> **SDD:** [SDD-66 — Los generadores que faltan](./SDD-66-generadores-que-faltan.md)
> **Paquetes:** `@fudic/cli` · `@fudic/workbench` · `@fudic/spec` · `@fudic/diagnostics` ·
> `examples/workspace`
> **Rama:** `sdd-66-generadores-que-faltan`. Nace de `main` **con SDD-61 en `Hecho`**: enmienda su
> analizador `server-cut` (tarea 17).
> **Progreso:** 0 / 17 — `Listo`.

**Dos sesiones.** Una implementa y coordina. La otra escribe los tests de cada fase (las tareas
«Los tests de…») contra los criterios de SDD §6. Si un test destapa un defecto, se corrige el
código, no el test.

**El orden manda en un punto.** El generador de páginas del banco se **mueve** a una función
compartida antes de que el escaparate lo use (tarea 6): las páginas del banco no cambian, y sus
tests lo comprueban sin tocarlos.

---

## Mapa de dependencias

```
1 códigos
   │
   ▼
2 plantillas de g api ─→ 3 planApi ─→ 4 args, run y ayuda ─→ 5 tests
   │
   ▼
6 páginas del banco a función compartida ─→ 7 planShowcase ─→ 8 regenerar ─→ 9 g showcase en la CLI ─→ 10 tests
   │
   ▼
11 librerías exportan fixtures ─→ 12 una sola forma de fixture ─→ 17 enmienda a SDD-61 ─→ 13 tests
   │
   ▼
14 verify:generated ─→ 15 docs y entrega ─→ 16 cierre
```

---

## Fase 1 — catálogo (1)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 1 | — | **Los códigos.** `FUD1240`–`FUD1242`: `.ts`, `.md` y línea en `index.ts`. El rango en la fila de SDD-66 del `INDEX.md` | `diagnostics` | `src/codes/FUD1240`–`1242.{ts,md}` · `src/index.ts` |

## Fase 2 — `g api` (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 2 | — | **Plantillas.** `component-api.fudapi.tmpl` y `component-api.ts.tmpl` (SDD §3.1); la de ruta reutiliza `load.fudapi.tmpl` y `load.ts.tmpl` | `cli` | `templates/*` · `src/templates.ts` |
| [ ] | 3 | 1, 2 | **`planApi`.** Pieza por `.fud` o carpeta; `<id>` y handler en `<server>/<id>.ts`; el enlace en su sitio por papel (`componentLinkAnchor`); `FUD0443`, `FUD1240`, `FUD1241` | `cli` | `src/plans/api.ts` |
| [ ] | 4 | 3 | **En la CLI.** `GenerateType` `api`, `parseGenerate`, el `switch` de `run.ts`, `HELP`, `GENERATES` (y `spec`, que faltaba) y la ayuda general | `cli` | `src/args.ts` · `src/run.ts` · `src/help/*` |
| [ ] | 5 | 3, 4 | **Los tests de la fase.** Criterios 1–5 (el 1 con el servidor en memoria de `@fudic/testing`) | `cli` | `test/api.test.ts` |

## Fase 3 — `g showcase` (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 6 | — | **Las páginas del banco, compartidas.** Lo que `pages.ts` escribe para montar un caso (props, `$content`, host con señales) pasa a una función exportada; el banco la usa sin cambiar su salida | `workbench` | `src/mount-source.ts` · `src/pages.ts` · `src/index.ts` |
| [ ] | 7 | 6 | **`planShowcase`.** Ejecuta las fixtures como el banco; una ruta por componente con un bloque por caso, una variable por caso (camelCase, numerada si choca), hosts en `src/components/showcase/`, índice; la marca en la primera línea | `workbench` | `src/showcase.ts` · `src/index.ts` |
| [ ] | 8 | 7 | **Regenerar.** Reescribe lo marcado sin `--force`, añade lo nuevo, borra lo de componentes sin fixture; `FUD0443` sobre lo no marcado; `FUD1242` sin nada que enseñar | `workbench` | `src/showcase.ts` |
| [ ] | 9 | 7, 8 | **`g showcase` en la CLI.** Workspace (crea o amplía la app con `planApp`/`planAdd`) y app sola (`src/routes/showcase/`); resuelve `@fudic/workbench` desde el proyecto; ayuda | `cli` | `src/plans/showcase.ts` · `src/args.ts` · `src/run.ts` · `src/help/*` |
| [ ] | 10 | 6–9 | **Los tests de la fase.** Criterios 6–12 | `workbench` · `cli` | `test/**` |

## Fase 4 — lo que cambia (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 11 | — | **Las librerías exportan sus fixtures.** `"./*.fixture"` en la plantilla de librería y en `examples/workspace/libs/ui` | `cli` · `examples` | `templates/lib/package.json.tmpl` · `examples/workspace/libs/ui/package.json` |
| [ ] | 12 | — | **Una sola forma de fixture.** `fixtureModule` escribe `Fixtures<$Props>` con su import | `spec` | `src/scaffold/fixture.ts` |
| [ ] | 17 | — | **La enmienda a SDD-61 §3.9.** `server-cut` acepta como módulo de datos el `export default` de un módulo resuelto dentro de una librería fudic (paquete con `fudic.json`); un paquete cualquiera sigue en `FUD1150`. Nota en la cabecera de SDD-61: «Enmendada por SDD-66» | `compiler` · `docs` | `src/semantic/analyzers/server-cut.ts` · `docs/sdd/SDD-61-vista-portable.md` |
| [ ] | 13 | 11, 12, 17 | **Los tests de la fase.** Criterios 13–16 | `cli` · `spec` · `compiler` | `test/**` |

## Fase 5 — la garantía y cierre (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 14 | 5, 10, 13 | **`verify:generated`.** El script de SDD §3.4 sobre el registro local, con su tabla de comandos; el test de la CLI que compara la tabla con `GENERATE_TYPES`. Criterio 17, ejecutado y en verde | raíz · `cli` | `scripts/verify-generated.mjs` · `package.json` · `packages/cli/test/verify-table.test.ts` |
| [ ] | 15 | 14 | **Docs y entrega.** README de la CLI (`g api`, `g showcase`) y su sección de desarrollo (`verify:generated`), en inglés y sin citar SDD. `pnpm typecheck`, `pnpm test` y `pnpm build` en verde; lo nuevo al 100 % (criterio 18) | `cli` | `packages/cli/README.md` |
| [ ] | 16 | 15 | **Cierre.** SDD-66 y este fichero en `Hecho`; fila y registro de progreso del `INDEX.md` | — | `docs/sdd/*` |
