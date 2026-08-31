# SDD-36 — Tareas

> **SDD:** [SDD-36 — La bombilla y la tarjeta del componente](./SDD-36-editor-terminado.md)
> **Paquetes:** `@fudic/language-server` · `fudic-vscode`
> **Rama:** `worktree-bug-23`
> **Progreso:** 6 / 8 (la tarea 2 se retiró en la fase 2; la nota de esa fase dice por qué)

**El orden manda en un punto:** la **1 antes que la 2–5**, porque sin el enrutador cada acción se
escribiría su propia búsqueda.

---

## Fase 1 — la bombilla (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **El enrutador.** `provideCodeActions` pasa de un caso a una tabla: por cada diagnóstico del contexto, la fila que lo repara. El caso del `href` entra en la tabla sin cambiar (criterios 11, 12) | `language-server` | `src/services/actions.ts` · `src/services/plugin.ts` |
| — | 2 | — | ~~**`FUD0197` → las props que faltan**~~ **Retirada en la fase 2, medida en mano:** el editor no emite `FUD0197` ni `FUD0199` porque TypeScript ya reporta ambos sobre la proyección, y con más precisión. Dárselos al pase semántico produjo el mismo error dos veces. Ver la nota de la fase 2 | — | — |
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
| [x] | 6 | — | **Lo que el índice tiene que saber**: props con `required`, slots, eventos y el doc del componente. Decisión 107 | `language-server` | `src/mode.ts` · `src/workspace-index.ts` |
| [x] | 7 | 6 | **`tagCardAt` y el hover**, la mitad barata: tag, ruta, props, slots, eventos, doc. Sin TypeScript. Un tag desconocido y un `<div>` no dan tarjeta (criterios 13, 14, 16, 17, 18) | `language-server` | `src/services/tag-card.ts` · `src/services/plugin.ts` |
| [ ] | 8 | 7 | **La segunda mitad**: el tipo de cada prop desde la proyección, cuando TypeScript conteste (criterio 15). `cardMarkdown` ya toma el mapa de tipos y lo pinta; falta quien lo llene | `language-server` | `src/services/ts-completion.ts` · `src/services/plugin.ts` |

### Lo que la fase 2 midió, y que cambia la tarea 2

**Las dos bombillas que faltaban se retiran, y no por falta de tiempo.** Con el contrato ya en el
índice se le pasó al pase semántico un registro completo, para que el editor emitiera `FUD0197` y
`FUD0199` y las acciones tuvieran dónde anclarse. La suite lo rechazó al instante: `.currnt=` sobre
un componente pasó a dar **`TS2561` y `FUD0198`**, el mismo error dicho dos veces, y solo uno de
los dos sabe que el nombre era `current`. En el build no hay TypeScript y los tres `FUD019x` son la
única red; en el editor TypeScript **es** la red y estos serían una segunda voz diciendo menos. Una
voz por hecho.

Así que el registro del servidor se queda en `has`, la tarea 2 se retira del SDD y los criterios
1–5 y 10 de §6 pasan a describir lo que hace el build. Lo que el consumidor ve en el editor —que
falta una prop requerida, que ese slot no existe— ya se lo dice TypeScript sobre la proyección, con
la posición exacta y con sugerencia.

**Y el contrato no se lee dos veces.** `requiredPropsOf` desaparece: el índice saca las requeridas
del mismo contrato que alimenta la tarjeta. Dos lecturas del mismo hecho es lo que separó al editor
del build en BUG-23, una talla más pequeña.

---

## Fase 3 — guardar y cerrar (1)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 9 | todas | **`editor.formatOnSave` en `[fudic]`** (criterio 19). Y cierre: `pnpm typecheck`, `pnpm test`, `pnpm build`, los 20 criterios verdes, los dos paquetes al 100 % (criterio 20), SDD-36 a `Hecho` en [INDEX.md](./INDEX.md) | `vscode` | `package.json` · [INDEX.md](./INDEX.md) |
