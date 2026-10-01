# SDD-32 — Abrir en el navegador: el arnés del banco de trabajo

**Estado:** `Pendiente` · **Rama:** `worktree-sdd-32-abrir-en-el-navegador` · **SDD:**
[SDD-32](./SDD-32-banco-de-trabajo.md)

Diecisiete tareas para un botón. Diez son el paquete nuevo —`@fudic/workbench`, que compila un
`.fud` suelto, monta una página con él, la sirve y la abre— y siete son cablearlo a la barra del
editor. **Ninguna toca el compilador, el emit ni el runtime**: este SDD es el primer consumidor
externo de `resolveComponents` + `emit*`, y si en algún momento hay que modificar
`@fudic/compiler` para que esto funcione, eso es el hallazgo, no la tarea.

**Lo que de verdad se está construyendo no es la ventana: es la frontera.** Tres documentos
—shell → iframe → componente—, un solo origen, y el documento del componente **byte a byte como
lo emitió el compilador**. Todo lo que el banco de trabajo llegue a hacer —el WebSocket que
graba los criterios, el panel, Lighthouse, CLS e INP— vive fuera de ese documento o no significa
nada. Esa topología es lo único de este SDD que no se puede añadir después, y por eso las tareas
5 y 8 existen antes de que haya nada que enchufar en ellas.

Tres hallazgos del terreno que explican por qué la fontanería no es trivial:

| hallazgo | evidencia |
|---|---|
| `resolveComponents` llama a `io.read(path)` **sin guarda**: un `<link rel="component">` a un fichero inexistente sube el `ENOENT` de `readFileSync` hasta el llamante. Es el caso normal en un editor —el `<link>` escrito y el fichero todavía no— | [`resolve.ts:139` y `visitComponents`](../../packages/compiler/src/emit/resolve.ts#L139) · el `nodeIo` del plugin no guarda nada ([`io.ts`](../../packages/vite/src/io.ts)) |
| `emitPageModule` hace `graph.entry as PageDocument` sin preguntar: **no se le puede pasar un componente**. De ahí la página sintética de §4.1, no de una preferencia estética | [`module.ts:225`](../../packages/compiler/src/emit/module.ts#L225) |
| Con las opciones por defecto (`importExt: '.mjs'`, `linkAssets: false`) los módulos emitidos **no tienen ni un especificador bare**: solo importan hermanos relativos. Por eso Node los importa tal cual y este paquete no necesita bundler, alias ni import map | [`__golden__/home.mjs`](../../packages/compiler/test/emit/__golden__/home.mjs) · [`app-card.mjs`](../../packages/compiler/test/emit/__golden__/app-card.mjs) |

Y dos cosas que **no** trae esta rebanada y conviene tener delante: no hay hidratación (SDD-17
está `Listo`, no `Hecho`) y **no hay guía de estilos** — no existe SDD que la defina, así que el
componente se ve desnudo. La costura por la que entrará (`pageHead`, tarea 4) se deja puesta y
vacía; el análisis de lo que hace falta decidir está en [SDD-32 §4.8](./SDD-32-banco-de-trabajo.md).

`@fudic/workbench` nace con `thresholds` al 100 en las cuatro métricas y
`coverage.include: ['src/**/*.ts']`.

---

## Mapa de dependencias

**Dos carriles arrancan a la vez.** El paquete no espera a la extensión, y la extensión —que
habla con un binario por una línea de JSON— no espera al paquete: su doble de test son tres
líneas.

```
A · el paquete (@fudic/workbench, Vitest, sin navegador)
   1 andamiaje ─┬─→ 2 io que no lanza ─┐
                │                      ├─→ 4 plan (+ pageHead) ─┬─→ 6 escritura ─→ 7 render ─┐
                └─→ 3 ruta temporal ───┘                        │                            │
                                                                └─→ 5 página sintética       │
                    8 shell (iframe + diagnósticos) ────────────────────────────────────┐    │
                    9 servidor de sesión (upgrade libre) ──────────────────────────────┼────┤
                   10 puerto de navegador ───────────────────────────────────────────── ┴────┤
                                                                                             ▼
                                                                                     11 HITO (sesión)
B · la extensión (fudic-vscode)                                                              │
   13 puerto + adaptador ─→ 14 comando + manifiesto ─→ 15 ciclo de vida               12 binario
                                                             │                               │
                                                             └──────────┬────────────────────┘
                                                              16 fixture + README ─→ 17 cierre
```

| carril | tareas | arranca | puede ir en paralelo con |
|---|---|---|---|
| **A** el paquete | 1–12 | ya | B |
| **B** la extensión | 13, 14 ya (contra el doble); 15 tras 14; la verificación real tras 12 | ya | A |

Puntos de junta, y hay dos: **11** (el hito: el shell abierto en un Chrome de verdad y el shadow
DOM del iframe leído desde el padre) y **17** (verde y cerrado).

---

## Fase 1 — el paquete, y todo lo que se prueba sin tocar disco

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [ ] | 1 | — | Andamiaje de `@fudic/workbench`: `package.json` (deps `@fudic/compiler`, `@fudic/ssr`, `playwright@1.62.0`; **nada de `@fudic/vite`, `vite`, `@fudic/transport`, `@fudic/core`, `@fudic/dom`, `@fudic/conventions`, ni librería de WebSocket, ni `lighthouse`** — §2.1), `tsconfig`, `tsconfig.build.json`, `vitest.config.ts` con los cuatro umbrales al 100, y `bin` → `dist/bin.js` | `packages/workbench/*` *(nuevo)* |
| [ ] | 2 | 1 | `nodeRecordingIo()`: el `ResolveIo` que **no lanza**. Lectura fallida → `''` + `FUD0592` con la ruta; `resolve` = `resolve(dirname(from), href)`, que ya acierta con un `href` absoluto. Es el hallazgo 1, resuelto en el llamante y no en el compilador | `src/io.ts` |
| [ ] | 3 | 1 | `harnessDir(fudPath, outDir?)`: `<tmp>/fudic-workbench/<tag>-<sha256(realpath).slice(0,8)>`. Estable por fichero, distinta para dos ficheros con el mismo tag. Aquí solo el nombre; vaciarla es la 6 | `src/dir.ts` |
| [ ] | 4 | 2, 3 | `planHarness(fudPath, io, pageHead?)`: parsea el objetivo, rechaza lo que no sea componente (`FUD0590`) y lo ilegible (`FUD0591`), resuelve el grafo y devuelve el `Map` —`page.fud`, `page.mjs`, un `<tag>.mjs` por componente— más los diagnósticos del emit, que **no paran nada**. `pageHead` es la costura de la guía de estilos: entra en el `<head>` y en ningún otro sitio | `src/plan.ts` |
| [ ] | 5 | 4 | La página sintética: `<link rel="component">` con ruta **absoluta y barras hacia delante** (una `path.relative` entre `C:` y `D:` no existe), `<title>`, `<meta charset>`, `pageHead`, y `<tag></tag>` desnudo. Diez líneas de texto que son la razón de que «y sus dependencias» no haya que programarlo | `src/page.ts` |

Criterios que cierran la fase: **1–8**.

## Fase 2 — disco, render, shell y red

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [ ] | 6 | 4 | `writePlan(plan, dir)`: **vaciar** (`rm -rf` + `mkdir`) y escribir. Vaciar, no sobrescribir: un `<tag>.mjs` que ya nadie importa sigue en disco y engaña a quien mire la carpeta con `--keep` | `src/write.ts` |
| [ ] | 7 | 6 | `renderHarness(dir)`: `import(pathToFileURL(dir/page.mjs))`, ejecutar `page({}, io)` con el `io` real de `@fudic/ssr`, juntar el generador y escribir **`component.html`**. El `data` es `{}` porque la página sintética no interpola nada. **Lo que devuelve se escribe tal cual**: el invariante de §4.4 empieza aquí | `src/render.ts` |
| [ ] | 8 | 1 | `renderShell({ tag, componentPath, diagnostics })` → `shell.html`: la tira de diagnósticos (código `FUD` + mensaje; sin diagnósticos, sin tira) y el `<iframe src="/component.html">` a pantalla completa, **sin `sandbox`** —mismo origen a propósito: leer su shadow DOM es el artefacto de IDEA-01 §4.3—. Función pura, HTML y CSS, **cero JS**: el `<script>` del shell es lo primero que se añade el día del WebSocket, y se añade aquí | `src/shell.ts` |
| [ ] | 9 | 1 | `serveSession(roots, port)` sobre `node:http`: dos raíces en orden (la temporal, y el directorio del componente para sus assets vecinos), guarda de traversal —el resuelto tiene que seguir **dentro** de la raíz—, mapa corto de tipos, `/` → `shell.html`, 404 para todo lo demás, sin listados, puerto 0 por defecto. **Un `http.Server`, no un handler**: el `upgrade` queda libre para el canal de §4.7 | `src/server.ts` |
| [ ] | 10 | 1 | El puerto de navegador: `BrowserPort`/`BrowserHandle` y **el único fichero que importa `playwright`**. `chromium.launch({ headless, channel })` con `channel: 'chrome'` por defecto —el del sistema, la misma decisión que [`examples/basic/playwright.config.ts`](../../examples/basic/playwright.config.ts)— y `closed` como promesa del evento `close` | `src/browser.ts` |

Criterios que cierran la fase: **9–13**.

## Fase 3 — la sesión, el hito y la CLI

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [ ] | 11 | 4–10 | **HITO.** `openComponent(fudPath, options)`: plan → escritura → render → shell → servidor → navegador, en ese orden, cortando antes de escribir un byte si el plan falló. El navegador se abre en **`url` (el shell)**, nunca en `componentUrl`. `close()` idempotente que cierra los tres y borra la carpeta salvo `keepOutput`. El test de aceptación abre **Chrome de verdad**, headless, y desde el documento padre alcanza el `contentDocument` del iframe y lee el shadow root — que es, de paso, la prueba de que el mismo origen funciona | `src/session.ts` · `src/index.ts` |
| [ ] | 12 | 11 | El binario `fudic-workbench`: flags de §3.1, **una** línea JSON en `stdout` con `url`, **`componentUrl`**, `dir`, `tag` y `diagnostics`; proceso vivo hasta `close` del navegador, `SIGINT` o cierre de `stdin`; `{"error":…}` + código 1 ante `FUD0590`/`FUD0591`. `componentUrl` va desde el primer día aunque hoy no lo use nadie: es lo que un auditor externo necesita, y añadir un campo después obliga a versionar el protocolo | `src/bin.ts` |

Criterios que cierran la fase: **14–16**.

## Fase 4 — el botón

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 13 | — | `WorkbenchPort` (una operación: `open(fudPath)`) y su adaptador: resolver `node_modules/@fudic/workbench/dist/bin.js` desde la carpeta del workspace, `spawn(nodeBin, …)`, leer la primera línea de `stdout`. `EditorPort` gana `activeFudPath()` — el comando necesita una ruta, no una URI, y convertirla es cosa del adaptador | `vscode` | [ports.ts](../../packages/vscode/src/ports.ts) · `src/workbench.ts` *(nuevo)* |
| [ ] | 14 | 13 | El comando `fudic.openInBrowser`: handler, entrada en `COMMAND_IDS`, los tres mensajes de §4.9 en `messages.ts`, los tres ajustes en `settings.ts`, y el manifiesto —comando con icono `$(preview)`, `contributes.menus` con `editor/title` + `when: resourceExtname == .fud`, y las tres propiedades—. El test de manifiesto pasa a comprobar **seis** comandos | `vscode` | [commands/index.ts](../../packages/vscode/src/commands/index.ts) · `commands/open-in-browser.ts` *(nuevo)* · [messages.ts](../../packages/vscode/src/commands/messages.ts) · [settings.ts](../../packages/vscode/src/settings.ts) · [package.json](../../packages/vscode/package.json) |
| [ ] | 15 | 14 | Ciclo de vida: `Map<path, ChildProcess>`, un segundo click mata el hijo anterior, `deactivate` los mata todos. Un Chrome huérfano que sobreviva a la ventana del editor es el peor defecto que esta función puede tener | `vscode` | `src/workbench.ts` · [activate.ts](../../packages/vscode/src/activate.ts) |

Criterios que cierran la fase: **17–20**.

## Fase 5 — cierre

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 16 | 11 | Fixture propia y documentación corta **en inglés**: un componente con un hijo enlazado y un asset vecino (lo que ejercita las dos raíces del servidor), y un README que explique los **tres documentos** y por qué existen, qué **no** hay en la página (JS, SW, props, slots, guía de estilos), y cómo se usa el binario desde la terminal | `workbench` | `fixtures/*` *(nuevo)* · `README.md` *(nuevo)* |
| [ ] | 17 | todas | **Cierre.** `pnpm typecheck`, `pnpm test` y `pnpm build` verdes en el workspace entero; `@fudic/workbench` al 100 % en las cuatro métricas y `fudic-vscode` sin bajar del suyo; SDD-32 a `Hecho`, fila en la tabla maestra y registro de progreso; nota en IDEA-01 §8 diciendo que el paso 1 está entregado, con qué topología, y qué se quedó fuera | — | [INDEX.md](./INDEX.md) · [SDD-32](./SDD-32-banco-de-trabajo.md) · [IDEA-01](./ideas/IDEA-01-banco-de-trabajo-de-componentes.md) |

---

## Ficheros existentes que se tocan, y por qué

| fichero | qué cambia | por qué |
|---|---|---|
| [vscode/package.json](../../packages/vscode/package.json) | un comando con icono, `contributes.menus` (**la sección no existe todavía**) y tres propiedades de configuración | el botón vive en el manifiesto; sin la entrada de `editor/title` el comando solo estaría en la paleta, que no es lo que se pidió |
| [vscode/src/commands/index.ts](../../packages/vscode/src/commands/index.ts) | `COMMAND_IDS` y `createHandlers` ganan la sexta entrada | la simetría contribuido↔registrado es un test, y se comprueba desde los dos lados |
| [vscode/src/ports.ts](../../packages/vscode/src/ports.ts) | `WorkbenchPort` nuevo; `EditorPort` gana `activeFudPath()` | nada bajo `src/` importa `vscode`: una capacidad nueva del host es un puerto nuevo, no un import |
| [vscode/src/commands/deps.ts](../../packages/vscode/src/commands/deps.ts) | `CommandDeps` gana `workbench` | es lo que reciben todos los comandos; el nuevo no puede ser la excepción |
| [vscode/src/settings.ts](../../packages/vscode/src/settings.ts) | tres ajustes más, con los mismos `asBoolean`/`asPath` | un ajuste con el tipo equivocado no puede abortar la activación (SDD-25 §3.2) |
| [vscode/src/commands/messages.ts](../../packages/vscode/src/commands/messages.ts) | tres mensajes | los tres fallos de §4.9 que son del editor viven aquí |
| [docs/sdd/INDEX.md](./INDEX.md) | fila 32 en la tabla maestra y registro de progreso | el índice tiene que poder leerse y saber que existe un paquete más |
| [docs/sdd/ideas/IDEA-01](./ideas/IDEA-01-banco-de-trabajo-de-componentes.md) | nota de estado en §8 | el paso 1 del troceado deja de ser idea; los otros tres siguen siéndolo |

**Y lo que NO se toca:** `@fudic/compiler`, `@fudic/ssr`, `@fudic/vite`, `@fudic/core`,
`@fudic/dom`, `@fudic/transport` y `examples/basic`. Si una tarea empieza a pedir un cambio en
el compilador, para y anótalo: sería un defecto de la API pública del emit, y eso es un `BUG-NN`
propio, no un parche dentro de este SDD.

**Y lo que no se toca porque no existe:** la guía de estilos. La tarea 4 deja `pageHead` vacío y
la 16 lo dice en el README. Ninguna tarea de aquí puede inventarla — [SDD-32
§4.8](./SDD-32-banco-de-trabajo.md) tiene las cuatro preguntas que su SDD tendrá que contestar, y
la primera (¿tokens o reglas?) decide si es una línea en el `<head>` o maquinaria de emit.
