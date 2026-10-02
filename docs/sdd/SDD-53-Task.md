# SDD-53 — Tareas

> **SDD:** [SDD-53 — Escribir una `.fudspec` sin saberse el lenguaje](./SDD-53-fudspec-autoria.md)
> **Paquetes:** `@fudic/spec` · `@fudic/typecheck` · `@fudic/cli` · `@fudic/language-server` ·
> `fudic-vscode` · `@fudic/diagnostics`
> **Rama:** `sdd-53-fudspec-autoria` (nace de `sdd-52-fudspec`)
> **Progreso:** 19 / 30 — `En curso`.

**El orden manda en tres puntos.**

- **Los generadores van antes que sus dos clientes.** La CLI y la bombilla no escriben ni una
  línea de plantilla propia: llaman a `@fudic/spec`.
- **La medición de §8.1 (tarea 19) va antes que la bombilla de la fixture.** Decide si el server
  rellena las props o crea la fixture vacía.
- **El catálogo va antes que el código que lo usa.** Ningún `'FUD096n'` provisional.

---

## Mapa de dependencias

```
1 rango e INDEX ──→ 2 códigos de la CLI
3 PropShape y sampleValue ──→ 4 fixtures y Fixtures.end ──┐
5 termModule · 6 specSkeleton · 7 closest ────────────────┼──→ 8 tests de generadores
                                                          │
3 ──→ 9 propShapes ──→ 10 ProjectChecker.propShapes ──→ 11 tests de tipos
                                                          │
12 formatSpec ──→ 13 tests del formateador                │
                                                          ▼
2 ──→ 14 argumentos ──→ 15 g spec ──→ 16 fudic-env.d.ts ──→ 17 g term ──→ 18 fmt .fudspec ──→ 22 tests CLI
                                                                                                │
19 medición TS ──→ 20 snippets ──→ 21 bombilla ──→ 23 formato en el server ──→ 24 VS Code ──→ 25 tests editor
                                                                                                │
                                                   26 mismo fichero ──→ 27 ejemplo ──→ 28 READMEs ──→ 29 cobertura ──→ 30 cierre
```

---

## Fase 1 — catálogo (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **El rango.** `FUD0960`–`FUD0969` reservado en la fila de SDD-53 del `INDEX.md` | — | `docs/sdd/INDEX.md` |
| [x] | 2 | 1 | **Los cuatro códigos de la CLI.** `FUD0960`–`FUD0963`: `.ts` con su función tipada (severidad `error`, mensaje en inglés), `.md` con la forma de SDD-50 §4.4 citando `SDD-53` y su línea en `index.ts`. `@fudic/diagnostics` sigue al 100 % | `diagnostics` | `src/codes/FUD0960`–`0963.{ts,md}` · `src/index.ts` |

## Fase 2 — generadores (6)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 3 | — | **`PropShape` y `sampleValue`.** Los tipos de §3.1 y la tabla de §4.3, exportados desde `index.ts` | `spec` | `src/scaffold/shape.ts` |
| [x] | 4 | 3 | **Fixtures.** `fixtureEntry` y `fixtureModule` (§3.2), con el `import type` relativo y el `satisfies`. `readFixtures` gana `Fixtures.end`, el offset de la `}` del objeto exportado | `spec` | `src/scaffold/fixture.ts` · `src/fixtures.ts` |
| [x] | 5 | — | **Módulo de término.** `termModule(block, name, params)` (§4.2): `meta`, `run` que devuelve `{ pass: false, evidence: 'not implemented' }` y `selfTest = []` | `spec` | `src/scaffold/term.ts` |
| [x] | 6 | — | **Esqueleto.** `specSkeleton(tag)` con la forma comentada de §4.1. Recibe si lleva la línea `props base` | `spec` | `src/scaffold/spec.ts` |
| [x] | 7 | — | **`closest`.** Distancia de edición ≤ 2 y ≤ un tercio del nombre; empate, el alfabético | `spec` | `src/scaffold/closest.ts` |
| [x] | 8 | 3–7 | **Tests de los generadores.** Criterios 1–5. `@fudic/spec` sigue al 100 % | `spec` | `test/scaffold/*.test.ts` |

## Fase 3 — tipos (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 9 | 3 | **`propShapes(program, file)`.** `ts.Type` → `PropField[]` desde el export `$Props`, con el corte por ciclo y a profundidad 4 (§4.3). Igual que `propDetails`: los primitivos se reconocen por el nombre que imprime el checker, sin `TypeFlags`. `@fudic/typecheck` añade `@fudic/spec` a sus dependencias | `typecheck` | `src/prop-shapes.ts` · `package.json` |
| [x] | 10 | 9 | **`ProjectChecker.propShapes(file)`.** Sobre el programa del checker, sin lanzar | `typecheck` | `src/checker.ts` |
| [x] | 11 | 10 | **Tests de tipos.** Criterio 6, sobre el `app-card` del ejemplo y un `.fud` por forma | `typecheck` | `test/prop-shapes.test.ts` |

## Fase 4 — formateador (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 12 | — | **`formatSpec`.** Las siete reglas de §4.6, con el mismo lector de líneas que el parser (`lines`, `readLine` y `levelOf` pasan a `line.ts`), para imprimir todo token leído y no perder el texto que el árbol no recoge. `ok: false` solo con `FUD0920` | `spec` | `src/format.ts` |
| [x] | 13 | 12 | **Tests del formateador.** Criterios 19–22: el `app-card.fudspec` del ejemplo, una entrada por regla, `\r\n`, idempotencia sobre todas las fixtures y árbol igual salvo spans | `spec` | `test/format.test.ts` |

## Fase 5 — CLI (6)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 14 | 2 | **Argumentos.** `g spec|s <component>`, `g term|t <block> <name>` con `--param` repetible y valorado, y `--spec` en `g component`. Nuevas variantes de `ParsedCommand` y `USAGE` | `cli` | `src/args.ts` · `src/types.ts` |
| [x] | 15 | 4, 6, 10, 14 | **`planSpec`.** §4.1, pasos 1–3: el componente por tag o nombre (`FUD0960`), la `.fudspec` (`FUD0443` sin `--force`) y la fixture si hay props obligatorias y no existe. `@fudic/cli` añade `@fudic/spec` y `@fudic/typecheck` | `cli` | `src/plans/spec.ts` · `src/run.ts` · `package.json` |
| [x] | 16 | 15 | **La declaración `*.fud`.** §4.1, paso 4: buscar `declare module '*.fud'` en los `.d.ts` de `src/` y, si no está, `src/fudic-env.d.ts` | `cli` | `src/plans/spec.ts` |
| [x] | 17 | 5, 14 | **`planTerm`.** §4.2: bloque (`FUD0448`), nombre (`FUD0961`), parámetros (`FUD0962`, `FUD0963`), destino (`FUD0443`). Y `g component --spec` encadena `planSpec` | `cli` | `src/plans/term.ts` · `src/plans/component.ts` · `src/run.ts` |
| [x] | 18 | 12 | **`fudic fmt` con `.fudspec`.** `filesOf` y el recorrido incluyen `.fudspec`; uno que no se puede formatear es `FUD0450`; `--check` cuenta los dos | `cli` | `src/plans/fmt.ts` · `src/io.ts` |
| [x] | 22 | 15–18 | **Tests de la CLI.** Criterios 7–12 y la parte CLI del 23, con `--dry-run` y `--json` | `cli` | `test/spec.test.ts` · `test/term.test.ts` · `test/fmt.test.ts` |

## Fase 6 — editor (7)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 19 | — | **Medición de §8.1.** Desde el servicio `.fudspec`, ¿da `context.inject('typescript/languageService')` el programa con el `.fud` del componente? Resultado anotado en SDD §8.1 | `language-server` | `docs/sdd/SDD-53-fudspec-autoria.md` |
| [ ] | 20 | 4, 6 | **Snippets.** §4.4: `component` con el tag hermano primero, `criterion` (con `props` si hacen falta), términos con un hueco por parámetro y `props` con las claves. Se añaden a las palabras clave, no las sustituyen | `language-server` | `src/fudspec/completion.ts` · `src/fudspec/snippets.ts` |
| [ ] | 21 | 4, 5, 7, 19 | **La bombilla.** `provideCodeActions` y `codeActionProvider` en el servicio `.fudspec`. Una función por fila de §4.5, cada una con su `WorkspaceEdit` entero (`CreateFile` + texto para los ficheros nuevos). Las props desde `propShapes` o, sin programa, la fixture sin props | `language-server` | `src/fudspec/actions.ts` · `src/fudspec/service.ts` · `src/fudspec/host.ts` |
| [ ] | 23 | 12 | **Formato en el server.** `provideDocumentFormattingEdits` en el servicio `.fudspec`: una edición entera o `[]`. Respeta `fudic.format.enable` | `language-server` | `src/fudspec/service.ts` |
| [ ] | 24 | 23 | **VS Code.** `configurationDefaults["[fudspec]"]` con `editor.defaultFormatter` y `editor.formatOnSave` | `vscode` | `package.json` |
| [ ] | 25 | 20–24 | **Tests del editor.** Criterios 14–18 y la parte server y extensión del 23, unitarios y sobre la conexión viva (como en SDD-28, para que Volar no se trague nuestros ítems) | `language-server` · `vscode` | `test/fudspec/*.test.ts` |
| [ ] | 26 | 15, 21 | **Mismo fichero.** Criterio 13: la `.fudspec` y la fixture de `g spec` frente a las de la bombilla, byte a byte | `language-server` | `test/fudspec/same-file.test.ts` |

## Fase 7 — entrega (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 27 | 18 | **El ejemplo.** `fudic fmt` sobre `examples/basic`: `app-card.fudspec` formateada; `pnpm build` verde | `example-basic` | `examples/basic/src/components/app-card.fudspec` |
| [ ] | 28 | 22, 25 | **READMEs.** `@fudic/spec` (generadores y `formatSpec`) y `@fudic/cli` (`g spec`, `g term`, `--spec`, `fmt`) | `spec` · `cli` | `README.md` |
| [ ] | 29 | 27, 28 | **Cobertura.** Criterio 24: los cuatro paquetes al 100 %, y el código nuevo de `cli` y `typecheck` al 100 % por fichero | — | `vitest.config.ts` |
| [ ] | 30 | 29 | **Cierre.** `pnpm typecheck`, `pnpm test` y `pnpm build` verdes; estado `Hecho` aquí, en la SDD y en el `INDEX.md`, con su línea en el registro de progreso | — | `docs/sdd/*` |
