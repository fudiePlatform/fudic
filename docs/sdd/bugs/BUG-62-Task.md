# BUG-62 — Tareas

> **BUG:** [BUG-62 — Cada página descargaba el cliente http entero, y una regla podía comprobarse antes de existir](./BUG-62-http-a-la-medida-de-la-pagina.md)
> **Paquetes:** `@fudic/http` · `@fudic/api` · `@fudic/diagnostics` · `@fudic/forms` · `@fudic/testing` · `examples/basic` · `examples/pieces-bench`
> **Rama:** `http-diet`, desde `main` con SDD-85 dentro (a petición de Pedro), para mergear las dos juntas.
> **Progreso:** 13 / 13 — `Hecho`.

---

## Fase 1 — http a la medida de la página

| ✓ | # | tarea | package | fichero |
|---|---|---|---|---|
| [x] | 1 | **`upload` y `download` salen de `stub`** a sus módulos; `stub` los recibe del `spec`. Criterio 2 | `http` | `src/client/upload.ts` · `src/client/download.ts` · `src/client/send.ts` · `src/client/codec.ts` · `src/contract/fn.ts` |
| [x] | 2 | **El emisor del navegador** pasa `upload: $upload` / `download: $download` solo a las funciones con ficheros. Criterio 2 | `api` | `src/emit/module.ts` |
| [x] | 3 | **Cinco piezas**: `contract`, `bin`, `files`, `json`, `registry`. Criterios 1 y 3 | `http` | `rolldown.config.ts` · `bundle/*.ts` |
| [x] | 4 | **Los argumentos de un `get` son claves del query**, como `query`, en cliente, `.url()` y servidor; fuera `?a=`, el base64url y la reserva de `a`; el compilador exige escalares (FUD1101). Criterio 4 | `http` · `api` · `diagnostics` | `src/contract/fn.ts` · `src/contract/server.ts` · `src/server/dispatch.ts` · `src/validate.ts` · `src/contract.ts` · `FUD1101.md` · `FUD1076.md` |
| [x] | 5 | **Fuera del navegador** `fn`, `contractsOf` y `credentials: 'same-origin'` | `http` | `bundle/contract.ts` · `src/contract/fn.ts` |
| [x] | 6 | Tests al día y `README` | `http` · `examples/basic` | `test/**` · `README.md` · `tests/usuarios.spec.ts` |

## Fase 2 — la regla espera a su implementación

| ✓ | # | tarea | package | fichero |
|---|---|---|---|---|
| [x] | 7 | **`loading()`** en el registro y **cada hueco es una señal**. Criterio 5 | `forms` | `src/contract/registry.ts` · `bundle/contract.ts` |
| [x] | 8 | **La regla espera a `settled()`** con una carga en marcha; vacía después, falla como antes. Tests de los tres casos. Criterio 5 | `forms` | `src/contract/rule.ts` · `test/contract/rule.test.ts` |
| [x] | 9 | **Un envío durante la carga** se detiene sin que nadie más lo oiga y se repite con las reglas dentro. Criterio 5 | `forms` | `src/dom/bind-form.ts` · `test/dom/bind-form-loading.test.ts` |

## Cierre

| ✓ | # | tarea |
|---|---|---|
| [x] | 10 | **`@fudic/testing`** pasa `upload` y `download` al stub de cada función |
| [x] | 11 | **Comprobación de piezas**: `fn`/`contractsOf` como mitad de servidor y `http/registry` como pieza pequeña a propósito. Criterio 6 |
| [x] | 12 | **e2e de la carrera**, salir de un campo y enviar vacío, comprobado que fallan sin el arreglo; `pnpm typecheck`, `pnpm test`, `pnpm build` y Playwright en verde. Criterios 5 y 6 |
| [x] | 13 | BUG-62 a `Hecho` con su fila y su entrada en `bugs/INDEX.md`; nota en SDD-67 §3.2 |
