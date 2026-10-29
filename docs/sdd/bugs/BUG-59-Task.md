# BUG-59 — Tareas

> **BUG:** [BUG-59 — Los nombres del `.fudapi` no navegan, y `task(` ofrece todo el ámbito](./BUG-59-nombres-del-contrato-en-el-editor.md)
> **Paquetes:** `@fudic/language-core` · `@fudic/language-server`
> **Rama:** `sdd-68-llamadas-sin-fontaneria` (a petición de Pedro: se cierra el producto aquí)
> **Progreso:** 6 / 6 — `Hecho`.

---

## Fase 1 — el editor y el contrato

| ✓ | # | tarea | package | fichero |
|---|---|---|---|---|
| [x] | 1 | **La definición redirigida al `.fudapi`** desde el andamiaje: `serverDefinition` y el decorador sobre TypeScript. Criterios 1, 2 y 4 | `language-server` | `src/fudapi/navigation.ts` · `src/services/server-definition.ts` · `src/server.ts` · `test/fudapi/navigation.test.ts` · `test/acceptance/bug59-contract-names.test.ts` |
| [x] | 2 | **`form:=` proyectado** como `$formSend(x)`. Criterios 1 y 6 | `language-core` | `src/template/attrs.ts` · `src/globals.ts` · `test/server-links.test.ts` |
| [x] | 3 | **`task(` ofrece las funciones del contrato** (filtro sobre TypeScript; sustituido en la tarea 5). Criterio 5 | `language-server` | `src/services/ts-completion.ts` |

## Fase 2 — lo que Pedro pidió al probarlo

| ✓ | # | tarea | package | fichero |
|---|---|---|---|---|
| [x] | 4 | **Del `.d.ts` generado al `.fudapi`**: `generatedDefinition` (campo de formulario y de grupo, de `data`, de un tipo, argumento). Criterio 3 | `language-server` | `src/fudapi/navigation.ts` · `src/services/server-definition.ts` · `test/fudapi/navigation.test.ts` · `test/acceptance/navigation.test.ts` |
| [x] | 5 | **La lista de `task(` y de `form:=` la da el servicio de fudic**, que sale al teclear `(`; TypeScript y el de etiquetas callan ahí. Criterio 5 | `language-server` | `src/services/contract-functions.ts` · `src/services/plugin.ts` · `src/services/ts-completion.ts` · `src/server.ts` · `test/contract-functions.test.ts` · `test/acceptance/bug59-contract-names.test.ts` |

## Cierre

| ✓ | # | tarea |
|---|---|---|
| [x] | 6 | Prueba de Pedro en VS Code sobre `examples/basic`; BUG-59 a `Hecho` con su fila y su entrada en `bugs/INDEX.md` |

## Notas de la implementación

- `language-core` y `language-server` al 100 % en las cuatro métricas. `pnpm typecheck` y
  `pnpm build` del workspace en verde; el checker de proyecto no da problemas en `examples/basic`.
- Comprobado con un servidor real sobre `examples/basic`: `task(save)` → `usuarios.fudapi:24
  put save`; `data.users` → `usuarios.fudapi:3`; `personForm.name` → `forms/person.fudapi:10`;
  `form:=@save` → `user-form.fudapi:3`; `task(` tecleado → las seis funciones de la ruta.
- Los campos de formulario y los argumentos no tienen test de aceptación: los tipa
  `@fudic/forms` / `@fudic/http`, que el workspace de fixtures no instala, y sin ellos TypeScript
  no llega al `.d.ts`. Los cubren los tests unitarios de `generatedDefinition` y la prueba real.
- El test de §6.7 «over @data.title» esperaba el `.d.ts`; ahora espera la línea del `load`.
