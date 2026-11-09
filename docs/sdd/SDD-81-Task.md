# SDD-81 — Tareas

> **SDD:** [SDD-81 — Ficheros y servidor portable](./SDD-81-ficheros.md)
> **Paquetes:** `@fudic/api` · `@fudic/http` · `@fudic/server` (nuevo) · `@fudic/core` · `@fudic/forms` ·
> `@fudic/compiler` · `@fudic/config` · `@fudic/vite` · `@fudic/testing` · `@fudic/language-core` ·
> `@fudic/language-server` · `@fudic/vscode` · `@fudic/diagnostics` · `@fudic/mcp` · `examples/basic`
> **Rama:** `sdd-81-ficheros`, desde `worktree-pendiente`; al cerrar, merge `--no-ff` a `worktree-pendiente`.
> **Progreso:** 1 / 37 — `Listo` (enmendada el 2026-11-09).

**Dos sesiones.** Una implementa y entrega cada fase con `pnpm typecheck` y `pnpm build`. La otra
escribe los tests de cada fase (las tareas «Los tests de…») contra los criterios de SDD §6, en su
propio worktree desde esta rama. Si un test destapa un defecto, se corrige el código, no el test.

**El orden manda en cuatro puntos.**

- **El servidor portable antes que el cable.** El lector de multipart, los límites y el `Spool`
  entran por las opciones de `createServer`; si el cable se escribe antes, se escribe dos veces.
- **El cable antes que nada que lo use.** Formularios, vista y ejemplo mandan ficheros; sin el sobre
  multipart en los dos lados, no hay con qué probarlos.
- **El lector antes que los límites.** Los límites se comprueban mientras se lee; sin lector en
  streaming no se pueden cortar a tiempo.
- **El editor antes de la prueba de Pedro.** La tarea 36 se hace con el `.vsix` de esta rama.

---

## Fase 1 — decisiones y diagnósticos

- [x] **1. Decisiones 181–182 y diagnósticos.**
  - La 181 (`file` en el `.fudapi`, dónde vale, `max-size`/`accept`, tamaños con unidad) y la 182
    (`<input type="file">`, `multiple`, `accept` escrito, `$value`) en sus secciones y en el índice.
  - La 178, con «enmendada por la 182».
  - `FUD1480`–`FUD1488`, cada uno con su función, su `.md` y su línea en `index.ts` (SDD §3.9).
  - *Depende de:* —.
  - *Paquetes:* docs, `diagnostics`.

## Fase 2 — el servidor portable

- [ ] **2. `@fudic/server`.**
  - Paquete nuevo con umbrales al 100 %. `createServer(app, options)`, `ServerApp`, `AppRoute`,
    `FudicServer` (SDD §3.10).
  - Lo que hoy está en el plugin, sin cambiar de comportamiento: el render en streaming, el endpoint
    de datos, la redirección de idioma, `_error.fud` y la página mínima, `pageOriginOf`, la CSP con
    nonce, `Referrer-Policy`, `Link`, `markPrivate` de lo que escribió `load`.
  - `earlyHints(request)` y `notFound(request)`.
  - *Depende de:* —.
  - *Paquetes:* `server`, `vite` (lo que se mueve sale de ahí).
- [ ] **3. `@fudic/server/node`.**
  - `toRequest`, `sendResponse` en streaming con cancelación, `nodeMiddleware` con el `103`,
    `staticPages`.
  - *Depende de:* 2.
  - *Paquete:* `server`.
- [ ] **4. Las cookies.**
  - `secureCookies` del servidor al `ctx` por símbolo registrado; fuera la detección por `Host`.
  - Prefijos `__Host-`/`__Secure-`; `deleteCookie` con `Secure` (SDD §3.11).
  - *Depende de:* 2.
  - *Paquetes:* `http`, `server`.
- [ ] **5. El proxy.**
  - `trustProxy`: `Forwarded` y `X-Forwarded-*` reescriben la URL pública antes de nada (SDD §3.12).
  - *Depende de:* 2.
  - *Paquete:* `server`.
- [ ] **6. El CSRF con token.**
  - `token bool?` y `fails csrf-token` en el `middleware csrf`.
  - `GET /_fudic/csrf` en el handler de funciones.
  - Cookie y HMAC con `crypto.subtle`; el secreto por las opciones.
  - La mitad de cliente pide, guarda y reintenta una vez (SDD §3.13).
  - *Depende de:* 4, 5.
  - *Paquetes:* `http`, `conventions`, `server`.
- [ ] **7. El build y el plugin sobre `createServer`.**
  - `.fudic/edge/server.mjs` (`createApp`, `config`); `functions.mjs` exporta además `handler`.
  - `server` en `fudic.json` (`trustProxy`) con `FUD1488`.
  - Preview = `nodeMiddleware(createServer(createApp(staticPages(…))))`.
  - Dev = `createServer` con su `ServerApp` sobre `ssrLoadModule`, `prepare`, `transformHtml`,
    `onError`.
  - `plugin.ts` sin lógica de páginas; `secureCookies` según `https`; `FUDIC_SECRET` del entorno.
  - *Depende de:* 2–6.
  - *Paquetes:* `vite`, `config`, `server`.
- [ ] **8. Los tests de la fase.** Criterios 38–48, y las e2e del ejemplo en dev y preview sin cambios.
  - *Depende de:* 2–7.
  - *Paquetes:* `server`, `http`, `config`, `vite`, `examples/basic`.

## Fase 3 — el `.fudapi`

- [ ] **9. El tipo y sus sitios.**
  - `file` en `PRIMITIVES`.
  - `FUD1480` en los argumentos de `get`, de ruta y de query (`scalar()`).
  - `FUD1481` en `load`, `layout`, `paths` y en los `type` que alcanzan, sobre el uso con `related`.
  - `FUD1482` en `initialFits`.
  - `FUD1483` en los parámetros de `rule` y `fails` (SDD §3.1).
  - *Depende de:* 1.
  - *Paquete:* `api`.
- [ ] **10. Tamaños y argumentos de texto en las reglas.**
  - `2mb`/`500kb`/`1.5gb` en un argumento numérico, en bytes, con `FUD1487`.
  - Un argumento `str` entre comillas, seguido del texto de la regla.
  - El formateador los respeta (SDD §3.2).
  - *Depende de:* 1.
  - *Paquete:* `api`.
- [ ] **11. El módulo generado.**
  - `tsType` según el sitio (§3.1) y `descriptor` con `'file'`.
  - En los formularios: `controlType`, `valueType`, `initial`, `factory` con `FileField` y
    `FileListField`.
  - La etiqueta `file` en la firma canónica.
  - `max-size` y `accept` en `ARG_RULES`, con su texto (`{n}` con unidad).
  - El `FnSpec` dice si la firma puede llevar ficheros (`files: true`).
  - *Depende de:* 9, 10.
  - *Paquete:* `api`.
- [ ] **12. Los tests de la fase.** Criterios 1–5.
  - *Depende de:* 9–11.
  - *Paquete:* `api`.

## Fase 4 — el cable

- [ ] **13. `Ty` y los dos `Wire`.**
  - `'file'` en `Primitive`.
  - `fud-bin` y JSON saltan los huecos `file`, también su bit de nulo.
  - `conform` acepta `File` o `Blob` con nombre.
  - `splitFiles` / `joinFiles`, un solo recorrido para los dos sentidos.
  - Los vectores existentes, sin cambios (SDD §3.3).
  - *Depende de:* 11.
  - *Paquete:* `http`.
- [ ] **14. El lector de multipart.**
  - En streaming, con Boyer-Moore-Horspool sobre ventana.
  - Cabeceras de parte (`name`, `filename`, `filename*`, `content-type`).
  - Cada cuerpo como `ReadableStream`, uno detrás de otro.
  - `400 multipart body:` ante cualquier forma mala (SDD §4.4).
  - *Depende de:* —.
  - *Paquete:* `http`.
- [ ] **15. El servidor recibe.**
  - `serve()` exige `multipart/form-data` si `files`; multipart de otro sitio, `403` (SDD §3.13).
  - `$args` primero y hasta `maxArgs`.
  - Cada fichero pasa por `Spool.put` contando bytes contra `max-size`/`maxFileSize`; `maxFiles`.
  - `413` con el límite y el campo, sin leer más. Un camino desconocido es `400`.
  - `release()` cuando el cuerpo de la respuesta termina o se cancela.
  - `UploadLimits`, `Spool`, `memorySpool` y las opciones `uploads`/`spool` (SDD §3.5, §4.2).
  - *Depende de:* 13, 14.
  - *Paquete:* `http`.
- [ ] **16. `diskSpool`.**
  - Temporal en `os.tmpdir()`, `fs.openAsBlob`, borrado en `release`.
  - *Depende de:* 15, 3.
  - *Paquete:* `server` (`/node`).
- [ ] **17. La vuelta.**
  - `-> file` con `stream()` y sus cabeceras; `-> file?` ausente, `204`.
  - Un valor con ficheros, en multipart con `$value`.
  - En el cliente: `decode` construye el `File` o lee `formData()` y recompone (SDD §3.3, §4.3).
  - *Depende de:* 13.
  - *Paquete:* `http`.
- [ ] **18. El cliente sube.**
  - `encode` separa los ficheros y arma el `FormData`; `compress` no aplica.
  - La llamada multipart sale por `XMLHttpRequest`, con `abort` por la señal.
  - `progress` de subida y de bajada.
  - `url(args)` en todo stub de `get` (SDD §3.4, §4.1).
  - *Depende de:* 13, 17.
  - *Paquete:* `http`.
- [ ] **19. `progress()` en `task`.**
  - La señal que alimenta el stub, a `null` al terminar o cancelar.
  - *Depende de:* 18.
  - *Paquete:* `core`.
- [ ] **20. `fudic.json`, Vite y testing.**
  - `server.uploads` en `@fudic/config` con `FUD1488`.
  - El plugin lo pasa en dev; el build lo deja en `config` de `server.mjs`; preview y dev con `diskSpool`.
  - `@fudic/testing` deja de juntar el cuerpo en `call.ts`.
  - *Depende de:* 7, 15, 16, 17.
  - *Paquetes:* `config`, `vite`, `testing`.
- [ ] **21. Los tests de la fase.**
  - Criterios 6–25 y 49, con un servidor en memoria y uno de Node real para los de memoria residual (17, 23).
  - *Depende de:* 13–20.
  - *Paquetes:* `http`, `server`, `core`, `config`, `vite`, `testing`.

## Fase 5 — formularios y vista

- [ ] **22. Los controles de fichero.**
  - `TypeTag` `'file'`/`'file[]'`; `FileField`, `FileListField`.
  - Valor `null`/`[]` y `$reset`. `set` con `File`. `$progress()` en `FormApi`.
  - `max-size` y `accept` en `rules.fudapi` y en `impl/browser/rules.ts` (SDD §3.6).
  - *Depende de:* 11, 18.
  - *Paquete:* `forms`.
- [ ] **23. `bindFile`.**
  - Elegir → `set`; `$set` → `DataTransfer`; `null` vacía.
  - En `bind-by-type.ts` y en su trozo de `rolldown.config.ts`.
  - *Depende de:* 22.
  - *Paquete:* `forms`.
- [ ] **24. El compilador.**
  - `file` deja de ser `unsupported` y pasa a `bindFile`; `FUD0592` pierde el motivo `file` (se
    mueve aquí desde la tarea 1: quitarlo antes dejaría el compilador sin nada que decir de un
    `<input type="file">`).
  - `FUD1484`–`FUD1486`.
  - `accept` escrito desde la regla si el `<input>` no lo tiene.
  - `$value` de un `<input type="file">` (SDD §3.7).
  - *Depende de:* 1, 23.
  - *Paquete:* `compiler`.
- [ ] **25. La proyección.**
  - `$value` tipado como `File | null` / `readonly File[]`. El hover de `:=`.
  - *Depende de:* 24.
  - *Paquete:* `language-core`.
- [ ] **26. Los tests de la fase.** Criterios 26–32.
  - *Depende de:* 22–25.
  - *Paquetes:* `forms`, `compiler`, `language-core`.

## Fase 6 — el editor

- [ ] **27. El editor del `.fudapi`.**
  - `file` en `PRIMITIVES` de completado y de `refs`.
  - `max-size`/`accept` solo en un campo `file`, con unidades y tipos MIME dentro de las comillas.
  - Hover. Snippets `argumento de fichero` y `campo de fichero`.
  - Arreglos de `FUD1480` (a `post`) y `FUD1482` (quitar el valor).
  - *Depende de:* 9, 10.
  - *Paquete:* `language-server`.
- [ ] **28. El editor del `.fud`.**
  - Arreglos de `FUD1484`–`FUD1486` (poner o quitar `multiple`).
  - `control` ofrecido en un `<input type="file">`.
  - *Depende de:* 24, 25.
  - *Paquete:* `language-server`.
- [ ] **29. Gramáticas TextMate.** `file` y `html` en los primitivos del `.fudapi`.
  - *Depende de:* —.
  - *Paquete:* `vscode`.
- [ ] **30. Los tests de la fase.** Criterio 33 por el plugin del language server; criterios 29 y 34 en el editor.
  - *Depende de:* 27–29.
  - *Paquetes:* `language-server`, `vscode`.

## Fase 7 — ejemplo, guía y cierre

- [ ] **31. El ejemplo.**
  - `user-form` con `avatar file?` y `<progress>`.
  - El servicio `Avatars`.
  - `get avatar` y `get exportar` en `/usuarios`, con `<img src>` y el enlace de descarga.
  - `put adjuntar` con `docs file[]` en `/formularios` (SDD §4.5).
  - El script de Node del criterio 41.
  - *Depende de:* 20, 24.
  - *Paquete:* `examples/basic`.
- [ ] **32. Los tests del ejemplo.** Las pruebas de §4.6 con Playwright, en dev y en preview; criterios 35 y 41.
  - *Depende de:* 31.
  - *Paquete:* `examples/basic`.
- [ ] **33. La guía del MCP y los README.**
  - `fudapi.md`, `components.md` y `testing.md`, con sus copias en español: `file`, reglas, progreso,
    `url()`, límites, cookies, `trustProxy`, `csrf` con token, cómo montar `server.mjs`.
  - `api`, `http`, `server` y `forms/README.md` (criterio 36).
  - *Depende de:* 31.
  - *Paquetes:* `mcp`, `api`, `http`, `server`, `forms`.
- [ ] **34. El `.vsix` de la rama.**
  - *Depende de:* 30.
  - *Paquete:* `vscode`.
- [ ] **35. `docs/PENDIENTE.md` e INDEX.** El estado, el registro de progreso y la nota 5.
  - *Depende de:* 32, 33.
  - *Paquete:* docs.
- [ ] **36. La prueba de Pedro.** SDD §6.1, con el `.vsix` de la rama.
  - *Depende de:* 34, 35.
- [ ] **37. Cierre.**
  - `pnpm typecheck`, `pnpm test`, `pnpm build` en verde (criterio 37).
  - Cobertura de los ficheros nuevos al 100 %.
  - Estado `Hecho` y merge `--no-ff` a `worktree-pendiente`.
  - *Depende de:* 36.
