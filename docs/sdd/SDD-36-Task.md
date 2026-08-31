# SDD-36 — Tareas

> **SDD:** [SDD-36 — El editor terminado](./SDD-36-editor-terminado.md)
> **Paquetes:** `@fudic/language-server` · `fudic-vscode`
> **Rama:** `worktree-bug-23`
> **Progreso:** 0 / 10

Diez tareas, casi todas independientes: cada fila del catálogo de acciones se puede aterrizar
sola.

**El orden manda en dos puntos.** La **1 antes que nada**, porque es una medida y su resultado
decide si hay trabajo o no lo hay. Y la **2 antes que la 3–6**: sin el andamiaje que enruta por
código de diagnóstico, cada acción se escribiría su propia búsqueda.

---

## Fase 1 — medir antes de diseñar (1)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 1 | — | **Qué renombra TypeScript hoy.** Sobre la proyección: una prop en `props<{ name }>()`, un `<slot name>` y una `@section`. Qué se propaga a los consumidores y qué no. El resultado es una nota en [SDD-36](./SDD-36-editor-terminado.md) §1 y decide si el renombrado necesita SDD propio. **No se escribe una línea de implementación antes de esto** (criterio 19) | `language-server` | `test/acceptance/rename-survey.test.ts` |

---

## Fase 2 — la bombilla (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 2 | — | **El enrutador.** `provideCodeActions` deja de ser un caso y pasa a ser una tabla: por cada diagnóstico del contexto, la fila que lo repara. El caso del `href` que ya existe entra en la tabla sin cambiar de comportamiento (§4.1, criterio 11) | `language-server` | `src/services/actions.ts` · `src/services/plugin.ts` |
| [ ] | 3 | 2 | **`FUD0197` → las props que faltan.** La diferencia entre lo requerido y lo escrito, en el orden del hijo, `.name=$1` sin comillas. Sin `propsOf`, ninguna acción (§4.2, criterios 1–4) | `language-server` | `src/services/actions/required-props.ts` |
| [ ] | 4 | 2 | **`FUD0191` → el `<link>`.** El mismo `TextEdit` que `linkInsertionFor` ya fabrica, sin re-derivar nada (§4.3, criterio 5) | `language-server` | `src/services/actions/component-link.ts` |
| [ ] | 5 | 2 | **`FUD0056` → entrecomillar** el valor, y nada más que el valor (criterio 6) | `language-server` | `src/services/actions/quote-value.ts` |
| [ ] | 6 | 2 | **`FUD0540` → `key (…)`** con el primer binding de la cabecera, leído del `JsBatch` como el ámbito; sin binding, sin acción. Y **`FUD0199` → los slots** que el padre sí declara, una acción por candidato (§4.4, criterios 7–10) | `language-server` | `src/services/actions/loop-key.ts` · `src/services/actions/slot-name.ts` |

---

## Fase 3 — la tarjeta (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 7 | — | **`tagCardAt`, la mitad barata**: tag, fichero, props con su marca de requerida, slots. Del índice, síncrono, sin TypeScript. Un tag desconocido y un `<div>` no devuelven tarjeta (§4.5, criterios 12, 14, 15) | `language-server` | `src/services/tag-card.ts` |
| [ ] | 8 | 7 | **La segunda mitad, si la hay**: el tipo de cada prop desde la proyección, y el JSDoc del `props<T>()` tal cual. Con TypeScript caído la tarjeta sale igual, sin tipos — se mide así (criterios 12, 13, 16) | `language-server` | `src/services/tag-card.ts` · `src/services/plugin.ts` |

---

## Fase 4 — guardar (1)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 9 | — | **`editor.formatOnSave` en `[fudic]`**, con `defaultFormatter` intacto, y un test que afirma que el manifiesto no rebinda `tab` (§4.6, criterios 17, 18). Anotar en el SDD que con esto la normalización de comillas de SDD-26 pasa a ocurrir siempre | `vscode` | `package.json` · `test/manifest.test.ts` |

---

## Fase 5 — cierre (1)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 10 | todas | **Cierre.** `pnpm typecheck`, `pnpm test`, `pnpm build`. Los 20 criterios de §6 verdes. `language-server` y `vscode` al 100 % en las cuatro métricas (criterio 20). SDD-36 a `Hecho` en [INDEX.md](./INDEX.md) | — | [INDEX.md](./INDEX.md) |
