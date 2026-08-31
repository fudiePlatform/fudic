# SDD-36 — Tareas

> **SDD:** [SDD-36 — La bombilla y la tarjeta del componente](./SDD-36-editor-terminado.md)
> **Paquetes:** `@fudic/language-server` · `fudic-vscode`
> **Rama:** `worktree-bug-23`
> **Progreso:** 4 / 9

**El orden manda en un punto:** la **1 antes que la 2–5**, porque sin el enrutador cada acción se
escribiría su propia búsqueda.

---

## Fase 1 — la bombilla (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **El enrutador.** `provideCodeActions` pasa de un caso a una tabla: por cada diagnóstico del contexto, la fila que lo repara. El caso del `href` entra en la tabla sin cambiar (criterios 11, 12) | `language-server` | `src/services/actions.ts` · `src/services/plugin.ts` |
| [ ] | 2 | 1, 6 | **`FUD0197` → las props que faltan** (criterios 1–4). **Movida a la fase 2:** el registro del servidor solo expone `has`, así que el editor no emite hoy `FUD0197` y no hay diagnóstico donde anclar la acción. La tarea 6 es la que se lo da | `language-server` | `src/services/actions.ts` |
| [x] | 3 | 1 | **`FUD0191` → el `<link>`**, con el `TextEdit` de `linkInsertionFor` (criterio 5) | `language-server` | `src/services/actions.ts` |
| [x] | 4 | 1 | **`FUD0056` → entrecomillar** el valor y solo el valor (criterio 6) | `language-server` | `src/services/actions.ts` |
| [x] | 5 | 1 | **`FUD0540` → `key (…)`** con el primer binding (criterios 7–9). **La mitad de `FUD0199` va con la 2**, y por lo mismo: sin `slotsOf` en el registro del servidor no hay diagnóstico que reparar | `language-server` | `src/services/actions.ts` |

### Lo que la fase 1 encontró y el Task no preveía

**El editor no emite `FUD0197` ni `FUD0199`.** El registro que el servidor le pasa al pase
semántico es `{ has }` y nada más, así que las dos reglas de contrato —la prop requerida que falta
y el slot que el padre no declara— solo corren en el build, que es quien resuelve el grafo. Las
acciones que las reparan no tienen dónde anclarse hasta que el índice sepa lo suficiente, que es
justo lo que hace la tarea 6. Ambas se mueven a la fase 2 en vez de fabricarse un diagnóstico
propio: dos fuentes para un hecho es lo que separó al editor del build en BUG-23.

**Una fuente para las ligaduras de una cabecera.** La acción del `key` necesita el primer nombre
que declara el bucle, que es la misma pregunta que el ámbito ya resuelve. En lugar de un segundo
lector, el ámbito exporta la lista y la acción toma el primero.

**El `)` no se busca, se sabe.** El punto donde va el `key (…)` sale del balanceador, no de buscar
un paréntesis en la fuente: una búsqueda trae consigo un caso «no encontrado» que ninguna entrada
puede provocar y por tanto ningún test puede cubrir.

---

## Fase 2 — la tarjeta (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 6 | — | **Lo que el índice tiene que saber**: props con `required` y `doc`, slots, eventos (`new CustomEvent('x')` del `@client`) y el doc del componente. Decisión 107 | `language-server` | `src/mode.ts` · `src/workspace-index.ts` |
| [ ] | 7 | 6 | **`tagCardAt` y el hover**, la mitad barata: tag, ruta, props, slots, eventos, doc. Sin TypeScript. Un tag desconocido y un `<div>` no dan tarjeta (criterios 13, 14, 16, 17, 18) | `language-server` | `src/services/tag-card.ts` · `src/services/plugin.ts` |
| [ ] | 8 | 7 | **La segunda mitad**: el tipo de cada prop desde la proyección, cuando TypeScript conteste (criterio 15) | `language-server` | `src/services/ts-completion.ts` · `src/services/tag-card.ts` |

---

## Fase 3 — guardar y cerrar (1)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 9 | todas | **`editor.formatOnSave` en `[fudic]`** (criterio 19). Y cierre: `pnpm typecheck`, `pnpm test`, `pnpm build`, los 20 criterios verdes, los dos paquetes al 100 % (criterio 20), SDD-36 a `Hecho` en [INDEX.md](./INDEX.md) | `vscode` | `package.json` · [INDEX.md](./INDEX.md) |
