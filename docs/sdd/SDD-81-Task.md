# SDD-81 — Tareas

> **SDD:** [SDD-81 — Ficheros](./SDD-81-ficheros.md)
> **Paquetes:** `@fudic/api` · `@fudic/http` · `@fudic/core` · `@fudic/forms` · `@fudic/compiler` · `@fudic/config` ·
> `@fudic/vite` · `@fudic/testing` · `@fudic/language-core` · `@fudic/language-server` · `@fudic/vscode` ·
> `@fudic/diagnostics` · `@fudic/mcp` · `examples/basic`
> **Rama:** `sdd-81-ficheros`, desde `main` con SDD-80 ya mezclada.
> **Progreso:** 0 / 30 — `Listo`.

**Dos sesiones.** Una implementa y entrega cada fase con `pnpm typecheck` y `pnpm build`. La otra
escribe los tests de cada fase (las tareas «Los tests de…») contra los criterios de SDD §6, en su
propio worktree desde esta rama. Si un test destapa un defecto, se corrige el código, no el test.
Cada fase cerrada va a `origin`.

**El orden manda en tres puntos.**

- **El cable antes que nada que lo use.** Formularios, vista y ejemplo mandan ficheros; sin el sobre
  multipart en los dos lados, no hay con qué probarlos.
- **El lector antes que los límites.** Los límites se comprueban mientras se lee; sin lector en
  streaming no se pueden cortar a tiempo.
- **El editor antes de la prueba de Pedro.** La tarea 29 se hace con el `.vsix` de esta rama.

---

## Fase 1 — decisiones y diagnósticos

- [ ] **1. Decisiones 181–182 y diagnósticos.**
  - La 181 (`file` en el `.fudapi`, dónde vale, `max-size`/`accept`, tamaños con unidad) y la 182
    (`<input type="file">`, `multiple`, `accept` escrito, `$value`) en sus secciones y en el índice.
  - La 178, con «enmendada por la 182».
  - `FUD1480`–`FUD1488`, cada uno con su función, su `.md` y su línea en `index.ts` (SDD §3.9).
  - `FUD0592` sin el motivo `file`.
  - *Depende de:* —.
  - *Paquetes:* docs, `diagnostics`.
  - *Ficheros:* `docs/gramar/gramatica-v1-decisiones.md`, `src/codes/FUD148*.{ts,md}`,
    `src/codes/FUD0592.{ts,md}`, `src/index.ts`.

## Fase 2 — el `.fudapi`

- [ ] **2. El tipo y sus sitios.**
  - `file` en `PRIMITIVES`.
  - `FUD1480` en los argumentos de `get`, de ruta y de query (`scalar()`).
  - `FUD1481` en `load`, `layout`, `paths` y en los `type` que alcanzan, sobre el uso con `related`.
  - `FUD1482` en `initialFits`.
  - `FUD1483` en los parámetros de `rule` y `fails` (SDD §3.1).
  - *Depende de:* 1.
  - *Paquete:* `api`.
  - *Ficheros:* `src/types-check.ts`, `src/validate.ts`, `src/validate-form.ts`, `src/contract.ts`.
- [ ] **3. Tamaños y argumentos de texto en las reglas.**
  - `2mb`/`500kb`/`1.5gb` en un argumento numérico, en bytes, con `FUD1487`.
  - Un argumento `str` entre comillas, seguido del texto de la regla.
  - El formateador los respeta (SDD §3.2).
  - *Depende de:* 1.
  - *Paquete:* `api`.
  - *Ficheros:* `src/line.ts`, `src/parse.ts`, `src/validate-form.ts`, `src/format.ts`.
- [ ] **4. El módulo generado.**
  - `tsType` según el sitio (§3.1) y `descriptor` con `'file'`.
  - En los formularios: `controlType`, `valueType`, `initial`, `factory` con `FileField` y
    `FileListField`.
  - La etiqueta `file` en la firma canónica.
  - `max-size` y `accept` en `ARG_RULES`, con su texto (`{n}` con unidad).
  - El `FnSpec` dice si la firma puede llevar ficheros (`files: true`).
  - *Depende de:* 2, 3.
  - *Paquete:* `api`.
  - *Ficheros:* `src/emit/shared.ts`, `src/emit/form.ts`, `src/emit/signature.ts`,
    `src/emit/module.ts`, `src/emit/declarations.ts`.
- [ ] **5. Los tests de la fase.** Criterios 1–5.
  - *Depende de:* 2–4.
  - *Paquete:* `api`.
  - *Ficheros:* `test/**`.

## Fase 3 — el cable

- [ ] **6. `Ty` y los dos `Wire`.**
  - `'file'` en `Primitive`.
  - `fud-bin` y JSON saltan los huecos `file`, también su bit de nulo.
  - `conform` acepta `File` o `Blob` con nombre.
  - `splitFiles(types, value)` → `{ rest, files: [camino, File][] }` y `joinFiles(types, rest, partes)`,
    un solo recorrido para los dos sentidos, como `bin.ts`.
  - Los vectores existentes, sin cambios (SDD §3.3).
  - *Depende de:* 4.
  - *Paquete:* `http`.
  - *Ficheros:* `src/wire/ty.ts`, `src/wire/bin.ts`, `src/wire/json.ts`, `src/contract/wire.ts`,
    `src/wire/files.ts`.
- [ ] **7. El lector de multipart.**
  - En streaming, con Boyer-Moore-Horspool sobre ventana.
  - Cabeceras de parte (`name`, `filename`, `filename*`, `content-type`).
  - Cada cuerpo como `ReadableStream`, uno detrás de otro.
  - `400 multipart body:` ante cualquier forma mala (SDD §4.4).
  - *Depende de:* —.
  - *Paquete:* `http`.
  - *Fichero:* `src/server/multipart.ts`.
- [ ] **8. El servidor.**
  - `serve()` exige `multipart/form-data` si `files`.
  - `$args` primero y hasta `maxArgs`.
  - Cada fichero pasa por `FileStore.put` contando bytes contra `max-size`/`maxFileSize`.
  - `maxFiles`.
  - `413` con el límite y el campo, sin leer más.
  - Un camino desconocido es `400`.
  - `release()` al terminar, vaya bien o mal.
  - `UploadLimits`, `FileStore` y `HandlerOptions.uploads/files` (SDD §3.5, §4.2).
  - *Depende de:* 6, 7.
  - *Paquete:* `http`.
  - *Ficheros:* `src/server/body.ts`, `src/contract/server.ts`, `src/server/dispatch.ts`,
    `src/server/files.ts`.
- [ ] **9. Los `FileStore`.**
  - El de Node: temporal en `os.tmpdir()`, `fs.openAsBlob`, borrado en `release`.
  - El de memoria, para el borde.
  - El handler elige el de Node si hay `node:fs`.
  - *Depende de:* 8.
  - *Paquete:* `http`.
  - *Ficheros:* `src/server/file-store-node.ts`, `src/server/file-store-memory.ts`.
- [ ] **10. La vuelta.**
  - `-> file` con `stream()` y sus cabeceras; `-> file?` ausente, `204`.
  - Un valor con ficheros, en multipart con `$value`.
  - En el cliente: `decode` construye el `File` o lee `formData()` y recompone (SDD §3.3, §4.3).
  - *Depende de:* 6.
  - *Paquete:* `http`.
  - *Ficheros:* `src/server/dispatch.ts`, `src/client/codec.ts`.
- [ ] **11. El cliente sube.**
  - `encode` separa los ficheros y arma el `FormData`; `compress` no aplica.
  - La llamada multipart sale por `XMLHttpRequest`, con `abort` por la señal.
  - `progress` de subida y de bajada.
  - `url(args)` en todo stub de `get` (SDD §3.4, §4.1).
  - *Depende de:* 6, 10.
  - *Paquete:* `http`.
  - *Ficheros:* `src/client/stages/encode.ts`, `src/client/stages/compress.ts`,
    `src/client/xhr.ts`, `src/contract/fn.ts`.
- [ ] **12. `progress()` en `task`.**
  - La señal que alimenta el stub, a `null` al terminar o cancelar.
  - *Depende de:* 11.
  - *Paquete:* `core`.
  - *Fichero:* `src/task.ts`.
- [ ] **13. Vite y `fudic.json`.**
  - `uploads` en `@fudic/config` con `FUD1488`.
  - El plugin lo pasa a `handler` en dev, preview y build.
  - `toRequest` sigue en streaming; `sendResponse` vuelca por partes.
  - `@fudic/testing` deja de juntar el cuerpo en `call.ts`.
  - *Depende de:* 8, 10.
  - *Paquetes:* `config`, `vite`, `testing`.
  - *Ficheros:* `config/src/project.ts`, `vite/src/functions.ts`, `vite/src/plugin.ts`,
    `testing/src/call.ts`.
- [ ] **14. Los tests de la fase.**
  - Criterios 6–25, con un servidor en memoria y uno de Node real para los de memoria residual (17, 23).
  - *Depende de:* 6–13.
  - *Paquetes:* `http`, `core`, `config`, `vite`, `testing`.
  - *Ficheros:* `test/**`.

## Fase 4 — formularios y vista

- [ ] **15. Los controles de fichero.**
  - `TypeTag` `'file'`/`'file[]'`; `FileField`, `FileListField`.
  - Valor `null`/`[]` y `$reset`.
  - `set` con `File`.
  - `$progress()` en `FormApi`.
  - `max-size` y `accept` en `rules.fudapi` y en `impl/browser/rules.ts` (SDD §3.6).
  - *Depende de:* 4, 11.
  - *Paquete:* `forms`.
  - *Ficheros:* `src/types.ts`, `src/typed/file.ts`, `src/contract/form.ts`, `src/contract/index.ts`,
    `src/form.ts`, `fudapi/rules.fudapi`, `impl/browser/rules.ts`, `src/validators/`.
- [ ] **16. `bindFile`.**
  - Elegir → `set`; `$set` → `DataTransfer`; `null` vacía.
  - En `bind-by-type.ts` y en su trozo de `rolldown.config.ts`.
  - *Depende de:* 15.
  - *Paquete:* `forms`.
  - *Ficheros:* `src/dom/bind-file.ts`, `src/dom/bind-by-type.ts`, `src/dom/index.ts`,
    `rolldown.config.ts`.
- [ ] **17. El compilador.**
  - `file` deja de ser `unsupported` y pasa a `bindFile`.
  - `FUD1484`–`FUD1486`.
  - `accept` escrito desde la regla si el `<input>` no lo tiene.
  - `$value` de un `<input type="file">` (SDD §3.7).
  - *Depende de:* 1, 16.
  - *Paquete:* `compiler`.
  - *Ficheros:* `src/binding/control.ts`, `src/semantic/analyzers/control-element.ts`,
    `src/semantic/value-argument.ts`, `src/emit/controls.ts`, `src/emit/markup-client.ts`.
- [ ] **18. La proyección.**
  - `$value` tipado como `File | null` / `readonly File[]`.
  - El hover de `:=`.
  - *Depende de:* 17.
  - *Paquete:* `language-core`.
  - *Ficheros:* `src/template/attrs.ts`, `src/globals.ts`.
- [ ] **19. Los tests de la fase.** Criterios 26–32 (el DOM en happy-dom; `DataTransfer` en Playwright).
  - *Depende de:* 15–18.
  - *Paquetes:* `forms`, `compiler`, `language-core`.
  - *Ficheros:* `test/**`.

## Fase 5 — el editor

- [ ] **20. El editor del `.fudapi`.**
  - `file` en `PRIMITIVES` de completado y de `refs`.
  - `max-size`/`accept` solo en un campo `file`, con unidades y tipos MIME dentro de las comillas.
  - Hover.
  - Snippets `argumento de fichero` y `campo de fichero`.
  - Arreglos de `FUD1480` (a `post`) y `FUD1482` (quitar el valor).
  - *Depende de:* 2, 3.
  - *Paquete:* `language-server`.
  - *Ficheros:* `src/fudapi/completion.ts`, `src/fudapi/refs.ts`, `src/fudapi/snippets.ts`,
    `src/fudapi/service.ts`, `src/fudapi/actions.ts`.
- [ ] **21. El editor del `.fud`.**
  - Arreglos de `FUD1484`–`FUD1486` (poner o quitar `multiple`).
  - `control` ofrecido en un `<input type="file">`.
  - *Depende de:* 17, 18.
  - *Paquete:* `language-server`.
  - *Ficheros:* `src/services/forms.ts`, `src/services/plugin.ts`.
- [ ] **22. Gramáticas TextMate.** `file` y `html` en los primitivos del `.fudapi`.
  - *Depende de:* —.
  - *Paquete:* `vscode`.
  - *Fichero:* `syntaxes/fudapi.tmLanguage.json`.
- [ ] **23. Los tests de la fase.** Criterio 33 por el plugin del language server; criterios 29 y 34 en el editor.
  - *Depende de:* 20–22.
  - *Paquetes:* `language-server`, `vscode`.
  - *Ficheros:* `test/**`.

## Fase 6 — ejemplo, guía y cierre

- [ ] **24. El ejemplo.**
  - `user-form` con `avatar file?` y `<progress>`.
  - El servicio `Avatars`.
  - `get avatar` y `get exportar` en `/usuarios`, con `<img src>` y el enlace de descarga.
  - `put adjuntar` con `docs file[]` en `/formularios` (SDD §4.5).
  - *Depende de:* 13, 17.
  - *Paquete:* `examples/basic`.
  - *Ficheros:* `src/components/user-form.{fud,fudapi}`, `src/server/user-form.ts`,
    `src/services/avatars.ts`, `src/routes/usuarios.{fud,fudapi}`, `src/server/usuarios.ts`,
    `src/routes/formularios.{fud,fudapi}`.
- [ ] **25. Los tests del ejemplo.** Las pruebas de §4.6 con Playwright, en dev y en preview; criterio 35.
  - *Depende de:* 24.
  - *Paquete:* `examples/basic`.
  - *Ficheros:* `e2e/ficheros.spec.ts`.
- [ ] **26. La guía del MCP y los README.**
  - `fudapi.md`, `components.md` y `testing.md`, con sus copias en español.
  - `api`, `http` y `forms/README.md` (criterio 36).
  - *Depende de:* 24.
  - *Paquetes:* `mcp`, `api`, `http`, `forms`.
  - *Ficheros:* `guide/**`, `README.md`.
- [ ] **27. El `.vsix` de la rama.**
  - *Depende de:* 23.
  - *Paquete:* `vscode`.
- [ ] **28. `docs/PENDIENTE.md` e INDEX.** El estado, el registro de progreso y la nota 5.
  - *Depende de:* 25, 26.
  - *Paquete:* docs.
- [ ] **29. La prueba de Pedro.** SDD §6.1, con el `.vsix` de la rama.
  - *Depende de:* 27, 28.
- [ ] **30. Cierre.**
  - `pnpm typecheck`, `pnpm test`, `pnpm build` en verde (criterio 37).
  - Cobertura de los ficheros nuevos al 100 %.
  - Estado `Hecho` y merge `--no-ff` a `main`.
  - *Depende de:* 29.
