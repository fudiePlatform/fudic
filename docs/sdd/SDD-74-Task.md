# SDD-74 — Tareas

> **SDD:** [SDD-74 — Errores que se quedan en la página y una `task` que no miente](./SDD-74-errores-en-la-pagina.md)
> **Paquetes:** `@fudic/api` · `@fudic/http` · `@fudic/core` · `@fudic/compiler` · `@fudic/diagnostics` ·
> `@fudic/language-server` · `examples/basic` · `examples/fudapi-editor`
> **Rama:** `sdd-74-errores-en-la-pagina`. Nace de `main` **con SDD-72 en `Hecho`**.
> **Progreso:** 0 / 12 — `Listo`.

---

## Mapa de dependencias

```
1 catches en el parser ─→ 2 emit + ClientContext ─→ 3 errorPagesStep ─→ 4 tests
5 FUD1360 + fuera fails ─→ 6 migración ─→ 7 tests
8 task por llamada ─→ 9 tests
10 propiedades vivas ─→ 11 tests
4, 7, 9, 11 ─→ 12 ejemplo, completado y cierre
```

---

## Fase 1 — `catches` en las funciones (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 1 | — | **`catches` en una función.** Cláusula en `FnDecl`, con los diagnósticos de los formularios (`FUD1063`, `FUD1075`, `FUD1071`) (SDD §3.1) | `api` | `src/ast.ts` · `src/clauses.ts` · `src/parse.ts` |
| [ ] | 2 | 1 | **Lo generado.** El stub lleva `catches`; `ClientContext.catches`, `[]` por defecto (SDD §3.2) | `api` · `http` | `src/emit/module.ts` · `src/types.ts` · `src/contract/fn.ts` |
| [ ] | 3 | 2 | **`errorPagesStep`.** Relanza un status de `ctx.catches` o del form enviado (SDD §4.1) | `http` | `src/error-pages.ts` |
| [ ] | 4 | 3 | **Los tests de la fase.** Criterios 1, 2, 4, 5 | `api` · `http` | `test/**` |

## Fase 2 — fuera `fails` de funciones y `load` (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 5 | — | **`FUD1360`** y la línea descartada; sin `<Nombre>Fails` ni `LoadFails` en lo generado (SDD §3.1, §4.2) | `diagnostics` · `api` | `src/codes/FUD1360.ts` · `.md` · `src/parse.ts` · `src/emit/*.ts` |
| [ ] | 6 | 5 | **Migración** de ejemplos, experimento y tests a `conflict(…)` (SDD §4.2) | `examples` · `api` · `compiler` | ver SDD §4.2 |
| [ ] | 7 | 6 | **Los tests de la fase.** Criterios 3, 10 | `api` | `test/**` |

## Fase 3 — `task` por llamada (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 8 | — | **`TaskResult`**, `run()` con el resultado de su llamada, `error()` escrito por cada llamada (SDD §3.3, §4.3) | `core` | `src/task.ts` · `src/index.ts` |
| [ ] | 9 | 8 | **Los tests de la fase.** Criterios 6, 7 | `core` | `test/**` |

## Fase 4 — propiedades vivas (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 10 | — | **`checked`, `value`, `selected`** como propiedad comparada con el DOM en el navegador; SSR igual (SDD §4.4) | `compiler` | `src/emit/**` |
| [ ] | 11 | 10 | **Los tests de la fase.** Criterios 8, 9 | `compiler` | `test/**` |

## Fase 5 — ejemplo y cierre (1)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 12 | 4, 7, 9, 11 | **Completado** (`catches` sí, `fails` no en funciones); **`examples/basic`** según SDD §4.5; tests de los criterios 11–14; cobertura (15); prueba de Pedro; INDEX y estado | `language-server` · `examples/basic` | `src/fudapi/completion.ts` · `src/routes/usuarios.*` · `src/server/usuarios.ts` |
