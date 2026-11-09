# SDD-81 — Tareas

> **SDD:** [SDD-81 — Ficheros y servidor portable](./SDD-81-ficheros.md)
> **Paquetes:** `@fudic/api` · `@fudic/http` · `@fudic/server` (nuevo) · `@fudic/core` · `@fudic/forms` ·
> `@fudic/compiler` · `@fudic/config` · `@fudic/vite` · `@fudic/testing` · `@fudic/language-core` ·
> `@fudic/language-server` · `@fudic/vscode` · `@fudic/diagnostics` · `@fudic/mcp` · `examples/basic`
> **Rama:** `sdd-81-ficheros`, desde `worktree-pendiente`; al cerrar, merge `--no-ff` a `worktree-pendiente`.
> **Progreso:** 26 / 37 — `Listo` (enmendada el 2026-11-09).

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

## Relevo (2026-11-09, sesión de implementación `pendiente-6d`)

**Dónde está.** Rama `sdd-81-ficheros` (worktree `.claude/worktrees/pendiente`), fases 1–4 de
implementación comiteadas (último `bfd4d510`), `pnpm build` en verde, e2e del ejemplo 304/304 tras la
fase 2. La fase 5 **no ha empezado** (árbol limpio). Se mezcla a `worktree-pendiente` al cerrar.

**Cómo se trabaja.** Esta sesión implementa y comitea cada fase; la sesión de tests `pendiente-7b`
(rama `sdd-81-tests`, worktree `.claude/worktrees/tests-81`) escribe las tareas «Los tests de…». Al
comitear una fase se le manda por `SendMessage` qué cambió (ficheros, funciones, casos); no se la
espera. Si encuentra un defecto, lo arregla esta sesión en el código. Ya ha cerrado las tareas 1, 8 y
12 (api, http, config, server, diagnostics al 100 %) y tiene la 21 en curso; los tests rojos que
esperan la salida vieja (`Linkable` en los `.d.ts`, exportaciones de `./server`, `content-length` en
`testing`) se los pasé a ella.

**Lo que cambió al implementar (ya en la spec, §8.2.9–13).** `serve` (no `server`) en `fudic.json`;
preview firma el CSRF con un secreto propio si no hay `FUDIC_SECRET`; un texto suelto tras una regla
es su argumento `str` si falta (`ruleCall` de `api/src/rule-call.ts`); `file[]` en un form es control
propio (`FileListField`, factoría `files`); `file` con `required` llega como `File`; el código de fallo
del token es `csrfToken`; una página se sirve a cualquier `GET` (solo `notFound` mira `Accept`).

**Piezas que la fase 5 usa (ya hechas).**
- El `.fudapi` genera para un campo `file`: tipo de control `FileField`, factoría `file`, valor
  `File | null` (o `File` con `required`), inicial `null`; para `file[]`: `FileListField`, `files(...)`,
  `readonly File[]`. Las reglas bajo argumento importan `maxSize` y `accept` de `@fudic/forms/contract`
  (`VALIDATORS` de `api/src/emit/module.ts`). **Nada de esto existe aún en `@fudic/forms`**: es la tarea 22.
- `formTypes(form.$schema)` (`http/src/wire/schema.ts`, `tyOfSchema`) tiene que dar `'file'` y
  `{ list: 'file' }` para esos controles: sin eso, `files: true` no lleva ficheros de un form.
- `CallOptions.onProgress` y `Progress` (`http/src/types.ts`); `task.progress()` en `core`. `$progress()`
  del form debe pasar `onProgress` en el envío de `form:=`.
- `max-size n` (bytes; `2mb` ya se lee como número) y `accept types` (`str`, sintaxis del atributo
  HTML) van a `forms/fudapi/rules.fudapi` y a `forms/impl/browser/rules.ts`; tras tocar el `.fudapi`,
  regenerar con `FUDIC_UPDATE_GENERATED=1 pnpm --filter @fudic/api exec vitest run test/emit/built-ins.test.ts`.
  El texto `{n}` de `max-size` se pinta con unidad (`2 MB`).

**Avisos.**
- No usar `perl -0pi` con `|` como delimitador si el reemplazo lleva `||`: dos veces escribió basura al
  principio del fichero. Para cambios con `||` o `${}`, la herramienta Edit.
- Un `pnpm build` completo tarda ~6 min; la comprobación de piezas del final falla si un módulo de un
  paquete con runtime (`http`, `forms`…) exporta algo que nadie importa.
- `pnpm test` de `vite` en paralelo da timeouts en los tests de build: correrlos aislados.
- Para parar servidores propios, por puerto (`Get-NetTCPConnection -LocalPort N`), nunca `taskkill node`.

## Relevo (2026-11-09, sesión de tests `pendiente-7b`)

**Dónde está.** Las tareas de tests 1, 8, 12 y 21 cerradas (fases 1–4), mezcladas en
`sdd-81-ficheros` desde `sdd-81-tests` (worktree `.claude/worktrees/tests-81`, que ya no hace falta).
La sesión de implementación se paró antes de acabar la fase 4; esta sesión cerró la 21 arreglando
lo que destapó. Lo siguiente es la fase 5 (tarea 22).

**Cobertura al cerrar.** Al 100 % en las cuatro métricas: `server` (127 tests), `http` (799), `api`
(697), `config` (99), `diagnostics`, `core` (364), `testing` (341). `vite`, sin bajar de su suelo.

**Dónde está cada criterio.**
- 1–5: `api/test/files.test.ts`. 6–16, 18–22, 24, 25, 49: `http/test/contract/files.test.ts` (stub →
  `contractsHandler` en un proceso), `http/test/wire/files.test.ts`, `http/test/server/multipart.test.ts`.
- 12 de extremo a extremo, 17, 23: `server/test/uploads.test.ts`, un servidor de Node real con
  `diskSpool` (temporal durante el handler y borrado después aunque lance; 200 MB arriba y abajo sin
  pasar de 100 MB de RSS; el `413` llega antes de que el cliente termine de subir).
- 24 (la mitad de `task`): `core/test/task.test.ts`. 34: `config/test/serve.test.ts`. 38–48:
  `server/test/*`, `http/test/csrf-token.test.ts`, `http/test/cookies.test.ts`, `vite/test/plugin.test.ts`
  (preview sobre un `server.mjs` generado), `examples/basic/src/node-server.test.ts` (41).

**Lo que queda de esos criterios para fases siguientes.**
- 15 completo y la mitad `form.$progress()` del 24: necesitan `max-size`/`accept` y los controles de
  fichero de `@fudic/forms` (fase 5). Hoy el 15 está probado con una regla que hace de `accept`.
- 22 (`<img src>` pintando) y la subida del 41: en el ejemplo, con Playwright (fase 7, tarea 32).
- 17 y 23 también se pueden repetir con el ejemplo (§4.6) cuando tenga sus funciones.

**Arreglos de código que hizo esta sesión.**
- `server/src/node/index.ts`: un cuerpo que el servidor dejó sin leer ya no lleva `connection: close`.
  Node destruía el socket con bytes del cliente sin leer, el RST tiraba el `413` y el cliente veía
  `ECONNRESET`. Ahora la conexión espera `LINGER_MS` (2 s) tras la respuesta y se cierra, o sigue
  abierta si el cliente termina a tiempo.
- `http`: tres ramas que ninguna entrada alcanzaba (`splitParams` siempre da cabecera; `encodeArgs`
  con argumentos siempre escribe; un `for … if` de una línea que el conversor de cobertura leía con
  cuenta negativa). `core/src/task.ts`: el JSDoc de `Callable` había quedado encima de `TaskProgress`.
- Antes (fases 2–3): `test/helpers.ts` de `api` lee el `rules.fudapi` real de `@fudic/forms`, en lugar
  de una copia que se había quedado atrás.
- La suite completa destapó dos huecos más, ya cerrados: `conventions/test/index.test.ts` no sabía de
  `CSRF_PATH` (fase 2), y FUD1481 no tenía su par en `diagnostics/fixtures/` (lo exige `cli`, porque
  su Fix trae un ejemplo): `fixtures/FUD1481/`.

**Verificación al cerrar.** `pnpm build`, `pnpm typecheck` y `pnpm test` completo (todos los paquetes,
sin parar en el primer fallo) en verde, con esos dos arreglos dentro.

**Avisos.**
- El criterio 10 dice «409» y la firma vieja da `412` (el de SDD-67): el test fija `412`. Hay que
  corregir el texto del criterio, no el código.
- `testing`: una ejecución cortada (un `timeout`) deja `test/*-project/.fudic/render/<uuid>.test.ts`, y
  todos los tests de «nothing left behind» fallan después. Borrarlos antes de volver a ejecutar.
- `api` lee `@fudic/diagnostics` desde su `dist`: tras cambiar un diagnóstico, reconstruir diagnostics.
- `pnpm test` en la raíz ya lleva `--no-bail`; no se le añade otro (le llega a vitest y falla todo).

## Relevo (2026-11-09, fase 5)

**Hecha en esta rama, sin worktree aparte**, tareas 22–26 con sus tests (criterios 26–32, el 15
completo y la mitad `form.$progress()` del 24). Lo que cambió va en la spec, §8.2.14–20: `:=` era
`control=`; `required` rechaza `[]`; el `{n}` de `max-size` sale con unidad desde el emit; el
compilador sabe el tipo de cada campo por `LinkedApi.fields`; `accept` se escribe en los
componentes, donde ya se escriben `novalidate` y `aria-describedby`.

**Para la fase 6.** `FUD1484`–`FUD1486` salen de `apiDiagnostics` (grafo), no del análisis
semántico: el language server los verá cuando pase por ahí. `controlWants` ya ofrece `control` en un
`<input type="file">` (es `controlTarget`). El completado de reglas bajo un argumento ofrece ya `max-size` y `accept` en cualquier tipo (`arg-rules.test.ts` lo fija así): la tarea 27 los deja solo en un campo `file`.

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

- [x] **2. `@fudic/server`.**
  - Paquete nuevo con umbrales al 100 %. `createServer(app, options)`, `ServerApp`, `AppRoute`,
    `FudicServer` (SDD §3.10).
  - Lo que hoy está en el plugin, sin cambiar de comportamiento: el render en streaming, el endpoint
    de datos, la redirección de idioma, `_error.fud` y la página mínima, `pageOriginOf`, la CSP con
    nonce, `Referrer-Policy`, `Link`, `markPrivate` de lo que escribió `load`.
  - `earlyHints(request)` y `notFound(request)`.
  - *Depende de:* —.
  - *Paquetes:* `server`, `vite` (lo que se mueve sale de ahí).
- [x] **3. `@fudic/server/node`.**
  - `toRequest`, `sendResponse` en streaming con cancelación, `nodeMiddleware` con el `103`,
    `staticPages`.
  - *Depende de:* 2.
  - *Paquete:* `server`.
- [x] **4. Las cookies.**
  - `secureCookies` del servidor al `ctx` por símbolo registrado; fuera la detección por `Host`.
  - Prefijos `__Host-`/`__Secure-`; `deleteCookie` con `Secure` (SDD §3.11).
  - *Depende de:* 2.
  - *Paquetes:* `http`, `server`.
- [x] **5. El proxy.**
  - `trustProxy`: `Forwarded` y `X-Forwarded-*` reescriben la URL pública antes de nada (SDD §3.12).
  - *Depende de:* 2.
  - *Paquete:* `server`.
- [x] **6. El CSRF con token.**
  - `token bool?` y `fails csrf-token` en el `middleware csrf`.
  - `GET /_fudic/csrf` en el handler de funciones.
  - Cookie y HMAC con `crypto.subtle`; el secreto por las opciones.
  - La mitad de cliente pide, guarda y reintenta una vez (SDD §3.13).
  - *Depende de:* 4, 5.
  - *Paquetes:* `http`, `conventions`, `server`.
- [x] **7. El build y el plugin sobre `createServer`.**
  - `.fudic/edge/server.mjs` (`createApp`, `config`); `functions.mjs` exporta además `handler`.
  - `serve` en `fudic.json` (`trustProxy`) con `FUD1488`.
  - Preview = `nodeMiddleware(createServer(createApp(staticPages(…))))`.
  - Dev = `createServer` con su `ServerApp` sobre `ssrLoadModule`, `prepare`, `transformHtml`,
    `onError`.
  - `plugin.ts` sin lógica de páginas; `secureCookies` según `https`; `FUDIC_SECRET` del entorno.
  - *Depende de:* 2–6.
  - *Paquetes:* `vite`, `config`, `server`.
- [x] **8. Los tests de la fase.** Criterios 38–48, y las e2e del ejemplo en dev y preview sin cambios.
  - **Lo que hereda de la implementación.** Los tests unitarios de preview de `vite/test/plugin.test.ts`
    (`configurePreviewServer middleware`) y uno de `http-units.test.ts` probaban la lógica que preview
    tenía dentro; ahora preview monta `server.mjs` y esos casos se reescriben contra `@fudic/server`
    (con un `ServerApp` de prueba) y contra el `server.mjs` de un build. Los de `toRequest`/`sendResponse`
    de `vite/test/http-functions.test.ts` pasan a `server/test`. `vite/test/early-hints.test.ts` se borró
    con su módulo: el `103` es de `@fudic/server/node`. `@fudic/server` no tiene tests aún (umbral 100).
  - *Depende de:* 2–7.
  - *Paquetes:* `server`, `http`, `config`, `vite`, `examples/basic`.

## Fase 3 — el `.fudapi`

- [x] **9. El tipo y sus sitios.**
  - `file` en `PRIMITIVES`.
  - `FUD1480` en los argumentos de `get`, de ruta y de query (`scalar()`).
  - `FUD1481` en `load`, `layout`, `paths` y en los `type` que alcanzan, sobre el uso con `related`.
  - `FUD1482` en `initialFits`.
  - `FUD1483` en los parámetros de `rule` y `fails` (SDD §3.1).
  - *Depende de:* 1.
  - *Paquete:* `api`.
- [x] **10. Tamaños y argumentos de texto en las reglas.**
  - `2mb`/`500kb`/`1.5gb` en un argumento numérico, en bytes, con `FUD1487`.
  - Un argumento `str` entre comillas, seguido del texto de la regla.
  - El formateador los respeta (SDD §3.2).
  - *Depende de:* 1.
  - *Paquete:* `api`.
- [x] **11. El módulo generado.**
  - `tsType` según el sitio (§3.1) y `descriptor` con `'file'`.
  - En los formularios: `controlType`, `valueType`, `initial`, `factory` con `FileField` y
    `FileListField`.
  - La etiqueta `file` en la firma canónica.
  - `max-size` y `accept` en `ARG_RULES`, con su texto (`{n}` con unidad).
  - El `FnSpec` dice si la firma puede llevar ficheros (`files: true`).
  - *Depende de:* 9, 10.
  - *Paquete:* `api`.
- [x] **12. Los tests de la fase.** Criterios 1–5.
  - *Depende de:* 9–11.
  - *Paquete:* `api`.

## Fase 4 — el cable

- [x] **13. `Ty` y los dos `Wire`.**
  - `'file'` en `Primitive`.
  - `fud-bin` y JSON saltan los huecos `file`, también su bit de nulo.
  - `conform` acepta `File` o `Blob` con nombre.
  - `splitFiles` / `joinFiles`, un solo recorrido para los dos sentidos.
  - Los vectores existentes, sin cambios (SDD §3.3).
  - *Depende de:* 11.
  - *Paquete:* `http`.
- [x] **14. El lector de multipart.**
  - En streaming, con Boyer-Moore-Horspool sobre ventana.
  - Cabeceras de parte (`name`, `filename`, `filename*`, `content-type`).
  - Cada cuerpo como `ReadableStream`, uno detrás de otro.
  - `400 multipart body:` ante cualquier forma mala (SDD §4.4).
  - *Depende de:* —.
  - *Paquete:* `http`.
- [x] **15. El servidor recibe.**
  - `serve()` exige `multipart/form-data` si `files`; multipart de otro sitio, `403` (SDD §3.13).
  - `$args` primero y hasta `maxArgs`.
  - Cada fichero pasa por `Spool.put` contando bytes contra `max-size`/`maxFileSize`; `maxFiles`.
  - `413` con el límite y el campo, sin leer más. Un camino desconocido es `400`.
  - `release()` cuando el cuerpo de la respuesta termina o se cancela.
  - `UploadLimits`, `Spool`, `memorySpool` y las opciones `uploads`/`spool` (SDD §3.5, §4.2).
  - *Depende de:* 13, 14.
  - *Paquete:* `http`.
- [x] **16. `diskSpool`.**
  - Temporal en `os.tmpdir()`, `fs.openAsBlob`, borrado en `release`.
  - *Depende de:* 15, 3.
  - *Paquete:* `server` (`/node`).
- [x] **17. La vuelta.**
  - `-> file` con `stream()` y sus cabeceras; `-> file?` ausente, `204`.
  - Un valor con ficheros, en multipart con `$value`.
  - En el cliente: `decode` construye el `File` o lee `formData()` y recompone (SDD §3.3, §4.3).
  - *Depende de:* 13.
  - *Paquete:* `http`.
- [x] **18. El cliente sube.**
  - `encode` separa los ficheros y arma el `FormData`; `compress` no aplica.
  - La llamada multipart sale por `XMLHttpRequest`, con `abort` por la señal.
  - `progress` de subida y de bajada.
  - `url(args)` en todo stub de `get` (SDD §3.4, §4.1).
  - *Depende de:* 13, 17.
  - *Paquete:* `http`.
- [x] **19. `progress()` en `task`.**
  - La señal que alimenta el stub, a `null` al terminar o cancelar.
  - *Depende de:* 18.
  - *Paquete:* `core`.
- [x] **20. `fudic.json`, Vite y testing.**
  - `serve.uploads` en `@fudic/config` con `FUD1488`.
  - El plugin lo pasa en dev; el build lo deja en `config` de `server.mjs`; preview y dev con `diskSpool`.
  - `@fudic/testing` deja de juntar el cuerpo en `call.ts`.
  - *Depende de:* 7, 15, 16, 17.
  - *Paquetes:* `config`, `vite`, `testing`.
- [x] **21. Los tests de la fase.**
  - Criterios 6–25 y 49, con un servidor en memoria y uno de Node real para los de memoria residual (17, 23).
  - *Depende de:* 13–20.
  - *Paquetes:* `http`, `server`, `core`, `config`, `vite`, `testing`.

## Fase 5 — formularios y vista

- [x] **22. Los controles de fichero.**
  - `TypeTag` `'file'`/`'file[]'`; `FileField`, `FileListField`.
  - Valor `null`/`[]` y `$reset`. `set` con `File`. `$progress()` en `FormApi`.
  - `max-size` y `accept` en `rules.fudapi` y en `impl/browser/rules.ts` (SDD §3.6).
  - *Depende de:* 11, 18.
  - *Paquete:* `forms`.
- [x] **23. `bindFile`.**
  - Elegir → `set`; `$set` → `DataTransfer`; `null` vacía.
  - En `bind-by-type.ts` y en su trozo de `rolldown.config.ts`.
  - *Depende de:* 22.
  - *Paquete:* `forms`.
- [x] **24. El compilador.**
  - `file` deja de ser `unsupported` y pasa a `bindFile`; `FUD0592` pierde el motivo `file` (se
    mueve aquí desde la tarea 1: quitarlo antes dejaría el compilador sin nada que decir de un
    `<input type="file">`).
  - `FUD1484`–`FUD1486`.
  - `accept` escrito desde la regla si el `<input>` no lo tiene.
  - `$value` de un `<input type="file">` (SDD §3.7).
  - *Depende de:* 1, 23.
  - *Paquete:* `compiler`.
- [x] **25. La proyección.**
  - `$value` tipado como `File | null` / `readonly File[]`. El hover del nodo de `control=`.
  - *Depende de:* 24.
  - *Paquete:* `language-core`.
- [x] **26. Los tests de la fase.** Criterios 26–32.
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
