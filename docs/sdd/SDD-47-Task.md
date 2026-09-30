# SDD-47 — Tareas

> **SDD:** [SDD-47 — Eventos en el host y en el shadow root](./SDD-47-eventos-en-host-y-shadow.md)
> **Paquetes:** `@fudic/compiler` · `@fudic/core` · `@fudic/language-core` · `@fudic/example-basic`
> **Rama:** `worktree-SDD-47-host-sahdow-events`
> **Progreso:** 16 / 16

Se implementó al revés de lo habitual, por decisión expresa: primero el código y el ejemplo, para
que Pedro lo probara en el navegador y en el editor; después este documento; y los tests y la
cobertura al final (fase 6).

**Cobertura:** `@fudic/core` y `@fudic/language-core` siguen al 100 % en las cuatro métricas;
`@fudic/compiler` queda en 99,40 / 98,54 / 99,63 / 99,78, su suelo de `main`, con las líneas
nuevas cubiertas. Escribir los tests quitó una rama muerta del capturador: el `?? 'text'` del tipo
de un `<input>`, que siempre responde `type`.

---

## Fase 1 — el compilador (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **Listeners en el shadow root.** Los atributos del `<template>` entran en el lote de Oxc; `emitShadow` emite sus listeners sobre `$shadow` | `compiler` | `src/emit/oxc-code.ts` · `src/emit/client.ts` · `src/emit/markup-client.ts` |
| [x] | 2 | 1 | **Enganche desde el host.** `hasHookup` recorre desde el host: un evento en el host o en el template hace hidratar | `compiler` | `src/emit/level.ts` |

## Fase 2 — el runtime (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 3 | — | **Los diez tipos.** `CAPTURED_TYPES` con los gestos del §4.2 | `core` | `src/hydrate/install.ts` |
| [x] | 4 | — | **Reproducción fiel.** `replayer` copia los miembros de init que el original tiene | `core` | `src/hydrate/replay.ts` |
| [x] | 5 | 4 | **Editables y cola.** Sin `preventDefault` en destinos editables; cola por instancia mientras el camino 2 está en vuelo | `core` | `src/hydrate/capture.ts` |

## Fase 3 — el editor (1)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 6 | 1 | **La proyección del template.** `emitShadowBindings` por el mismo `$on` que el host | `language-core` | `src/template/attrs.ts` · `src/emit-client.ts` |

## Fase 4 — el ejemplo (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 7 | 1–6 | **`app-eventos` en `/ruta-evento`.** Registro de lo que oyen host y shadow, avisos `composed` y no, llamadas con valores | `example-basic` | `src/components/app-eventos.fud` · `src/routes/ruta-evento.fud` |
| [x] | 8 | — | **`tsconfig.json` del ejemplo.** El mismo que genera la CLI; quita el `TS2345` de los calendarios | `example-basic` | `tsconfig.json` |

## Fase 5 — la evidencia (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 9 | 7 | **Build y typecheck verdes.** El chunk de `app-eventos` lleva los listeners del host y del shadow root | — | — |
| [x] | 10 | 9 | **Pedro en navegador y editor.** Criterio 13 | — | — |
| [x] | 11 | 8 | **Pedro en el editor: los calendarios sin `TS2345`.** Criterio 14 | — | — |

## Fase 6 — tests y cobertura (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 12 | 2 | **Compilador.** Criterios 1–5 | `compiler` | `test/emit/shadow-events.test.ts` |
| [x] | 13 | 5 | **Runtime.** Criterios 6–9, incluido el foco que levanta un componente sin perder el clic de detrás | `core` | `test/hydrate/capture.test.ts` · `test/hydrate/replay.test.ts` · `test/hydrate/install.test.ts` |
| [x] | 14 | 6 | **Editor.** Criterio 10 en la proyección; 11 y 12 contra el servidor real | `language-core` · `language-server` | `test/shadow-bindings.test.ts` · `test/acceptance/shadow-events.test.ts` |
| [x] | 15 | 12–14 | **`pnpm test` verde y cobertura.** Criterio 15 | todos | — |

## Cierre (1)

| ✓ | # | dep | tarea |
|---|---|---|---|
| [x] | 16 | 15 | `pnpm typecheck`, `pnpm test` y `pnpm build` verdes; SDD-47 a `Hecho` en la tabla y el registro del `INDEX.md` |
