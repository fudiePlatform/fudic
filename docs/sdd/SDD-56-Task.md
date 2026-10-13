# SDD-56 — Tareas

> **SDD:** [SDD-56 — Funciones de servidor y middlewares](./SDD-56-funciones-de-servidor.md)
> **Paquetes:** `@fudic/http` (nuevo) · `@fudic/compiler` · `@fudic/vite` · `@fudic/transport` ·
> `@fudic/di` · `@fudic/ssr` · `@fudic/forms` · `@fudic/conventions` · `@fudic/language-core` ·
> `@fudic/diagnostics`
> **Rama:** `sdd/http` (nace de `main`)
> **Progreso:** 2 / 50 — `En curso`.

**El orden manda en cinco puntos.**

- **El catálogo va antes que el código que lo usa.** Ningún `'FUD10nn'` provisional.
- **El runtime va antes que el compilador.** El stub que emite el compilador llama a `$fn`, y
  el módulo de servidor a `dispatch`: los dos tienen que existir y estar probados antes.
- **El cable de `@fudic/forms` va antes que las etapas.** `positional` y `binary` llaman a
  `$positional` y a `writeBinary`; el servidor, a `$set` posicional y a `readBinary`.
- **El ambiente de `@fudic/di` va antes que retirar `ctx.inject`.** Si se retira primero, los
  ejemplos dejan de construir.
- **El ejemplo va antes del cierre, y lo prueba Pedro en el navegador.** Los tests no sustituyen
  esa prueba.

`@fudic/http` es un paquete nuevo: nace con `thresholds` al 100 en las cuatro métricas y
`coverage.include: ['src/**/*.ts']`. Lo nuevo en el resto de paquetes también entra al 100.

---

## Mapa de dependencias

```
1 rango ──→ 2 códigos ─────────────────────────────────────────────┐
                                                                    │
3 paquete ──→ 4 tipos y errores ──→ 5 builders ──→ 6 composición ──┼──→ 7 csrf · 8 errorPages ──→ 9 tests núcleo
                                                                    │
10 di.setAmbient ──→ 11 ALS ──→ 12 $fresh ──→ 13 dispatch ──→ 14 load por la cadena ──→ 15 tests servidor
                                                                    │
6 ──→ 16 $fn ──→ 17 form en el cliente ──→ 18 invalidar ──→ 19 tests cliente
                                                                    │
20 $positional ──→ 21 wire binario ──→ 22 etapas ──→ 23 compress ──→ 24 decodificar ──→ 25 tests cuerpo
                                                                    ▼
2, 13, 16 ──→ 26 ServerFnTable ──→ 27 diagnósticos ──→ 28 stubs de ruta ──→ 29 componente ──→ 30 FUD0683
                                   ──→ 31 form:= ──→ 32 src/http.ts ──→ 33 tests compilador
                                                                    │
34 constantes ──→ 35 dev ──→ 36 borrar .server ──→ 37 _error ──→ 38 prerender ──→ 39 functions.mjs ──→ 40 tests plugin
                                                                    │
41 SW declina ──→ 42 error e invalidar ──→ 43 tests SW              │
44 tipos editor ──→ 45 inject a secas ──→ 46 tests editor           │
                                                                    ▼
                      47 migrar ejemplos ──→ 48 ejemplo nuevo ──→ 49 README y prueba de Pedro ──→ 50 cierre
```

---

## Fase 1 — catálogo (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **El rango.** `FUD1000`–`FUD1019` reservado en la fila de SDD-56 del `INDEX.md`, y la nota de que `FUD0683` queda quemado | — | `docs/sdd/INDEX.md` |
| [x] | 2 | 1 | **Los códigos.** `FUD1000`–`FUD1010` (§5): `.ts` con su función tipada (severidad `error`, mensaje en inglés), `.md` con la forma de SDD-50 §4.4 citando `SDD-56`, y su línea en `index.ts`. `@fudic/diagnostics` sigue al 100 %. *Al implementar:* la nota de retirado de `FUD0683` pasa a la tarea 30, porque un código retirado no tiene `.ts` (lo exige el barrido del catálogo) y el compilador lo emite hasta esa tarea | `diagnostics` | `src/codes/FUD1000`–`1010.{ts,md}` · `src/codes/FUD0683.md` · `src/index.ts` |

## Fase 2 — núcleo de `@fudic/http` (7)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 3 | — | **El paquete.** `packages/http` con tres entradas: `.` (builders, middlewares, errores), `./client` (`$fn`) y `./server` (`dispatch`). `tsconfig` que extiende la base, `vitest.config.ts` con umbrales al 100 en las cuatro métricas e `include: ['src/**/*.ts']`. Versiones exactas | `http` | `package.json` · `tsconfig*.json` · `vitest.config.ts` · `src/index.ts` |
| [ ] | 4 | 3 | **Tipos y errores.** `Method`, `BaseContext`, `ClientContext`, `ServerContext`, `Next`, `Middleware`, `SharedMiddleware`, `AnyMiddleware` (§3.4). `HttpError`, `ValidationError`, `Redirect`, `Problem` y las seis factorías (§3.6). Un `HttpError` se construye desde un `Problem` y lo devuelve igual | `http` | `src/types.ts` · `src/errors.ts` |
| [ ] | 5 | 4 | **Builders.** `get`/`post`/`put`/`patch`/`del` → `FnBuilder` inmutable (§3.1), con el tipo de `ctx` que suma cada `.use`. `chain()` → `ChainBuilder` (§3.3). `middleware<Adds>()` → `MiddlewareBuilder` (§3.4). `.handle` devuelve el descriptor `ServerFn`. `.compress` en los dos builders, sin ejecutar nada todavía | `http` | `src/builder.ts` · `src/chain.ts` · `src/middleware.ts` |
| [ ] | 6 | 5 | **Composición.** `compose(levels, side)`: global → fichero → función, con `use`, `skip(x)` por identidad y `skip('*')` (§4.3). Devuelve la lista de pasos del lado pedido (§4.4) y el `compress` del nivel más interno que lo escriba. `run(steps, ctx, last)` con `next` que devuelve el valor y se puede llamar varias veces | `http` | `src/compose.ts` |
| [ ] | 7 | 6 | **`csrf`.** Las dos mitades de §4.11 | `http` | `src/csrf.ts` |
| [ ] | 8 | 6 | **`errorPages`.** La mitad de cliente de §4.8: `Redirect` navega, `ValidationError` y `AbortError` se relanzan, el resto navega a `/_fudic/error/<status>` | `http` | `src/error-pages.ts` |
| [ ] | 9 | 4–8 | **Tests del núcleo.** Criterios 1–6, la parte de runtime del 35 y la tabla de §4.8 para `errorPages`. Tipos con `expectTypeOf`: `ctx.user` tras `.use(auth)` y `ctx.form` tras `.form(f)` | `http` | `test/*.test.ts` |

## Fase 3 — servidor (6)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 10 | — | **El ambiente de `@fudic/di`.** `setAmbient(source)` (§3.8). `inject()` fuera de una factoría consulta el ambiente antes de lanzar, y `publish()` a secas escribe en la raíz del ambiente. Sin ambiente instalado, el error de hoy. `@fudic/di` no importa `node:*` | `di` | `src/ambient.ts` · `src/resolve.ts` · `src/seed.ts` · `src/index.ts` |
| [ ] | 11 | 10 | **`AsyncLocalStorage`.** `withRequest(container, fn)` en `@fudic/http/server`: instala el ambiente una vez y ejecuta `fn` dentro del store. Se retiran `withDi` y `DiContext` de `@fudic/ssr`, y el wrapper de vite deja de llamarlos | `http` · `ssr` · `vite` | `src/server/request.ts` · `packages/ssr/src/ioc.ts` · `packages/vite/src/wrapper.ts` |
| [ ] | 12 | — | **`$fresh()`.** En `FormApi` (§3.9): mismo schema, reglas y opciones, estado inicial. `@fudic/forms` sigue en su cobertura | `forms` | `src/types.ts` · `src/form.ts` · `test/fresh.test.ts` |
| [ ] | 13 | 6, 11, 12 | **`dispatch`.** De una `Request` a una `Response`: el contenedor, el `ctx` (§4.6 paso 2), la cadena de servidor, la validación de `.form` con `$fresh`, `handle`, y la respuesta de §4.2. Los errores, como §4.6 paso 6, con `dev` como opción. El cuerpo entra en JSON con claves; la tarea 24 añade el resto | `http` | `src/server/dispatch.ts` · `src/server/context.ts` |
| [ ] | 14 | 13 | **`load` por la cadena.** El `data(ctx)` y el `render(ctx)` del wrapper ejecutan `load` y `layout` dentro de `withRequest` y con la cadena de servidor del fichero. Un `load` fluent se reconoce igual que uno `function` | `vite` | `src/wrapper.ts` · `src/serve.ts` |
| [ ] | 15 | 10–14 | **Tests del servidor.** Criterios 14–20, con dos peticiones concurrentes reales para el 14 | `http` · `di` · `vite` | `test/server/*.test.ts` · `packages/di/test/ambient.test.ts` |

## Fase 4 — cliente (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 16 | 6 | **`$fn`.** El stub de §4.7: el `ClientContext`, la URL con los params (de la página o de `options.params`), la cadena de cliente, el `fetch` con `signal` y `credentials: 'same-origin'`, y la decodificación a valor o a `HttpError` / `ValidationError` / `Redirect`. Un `abort` sale como el `AbortError` del navegador. El cuerpo sale en JSON con claves; la tarea 22 mete el pipeline | `http` | `src/client/fn.ts` · `src/client/codec.ts` |
| [ ] | 17 | 16 | **Un formulario como argumento.** `$validate()` antes de la cadena. Si no valida, `ValidationError` sin red | `http` | `src/client/fn.ts` |
| [ ] | 18 | 16 | **Invalidar.** Tras una llamada correcta que no es GET: `location.pathname` más `.invalidates`. Un GET, solo `.invalidates`. Por `postMessage` al SW que controla la página, con `MessageChannel`, y la promesa espera la confirmación. Sin SW, no espera (§4.9) | `http` | `src/client/invalidate.ts` |
| [ ] | 19 | 16–18 | **Tests del cliente.** Criterios 21–25, con un `fetch` inyectado y un SW simulado para la espera de la confirmación | `http` | `test/client/*.test.ts` |

## Fase 5 — el cuerpo de subida (6)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 20 | — | **`$positional` y `$set` posicional.** El recorrido de §4.17 sobre `Object.keys(schema)` sin las claves `$`, con el `group` anidado. `$set` discrimina por forma: array por posición, objeto por clave. Aridad fija con `RangeError` y el formulario intacto. La normalización de `undefined` en profundidad, sin mutar y con el `TypeError` del ciclo | `forms` | `src/positional.ts` · `src/form.ts` · `src/types.ts` |
| [ ] | 21 | 20 | **El binario.** `@fudic/forms/wire` con `isTyped`, `writeBinary` y `readBinary` (§3.10): el mapa de nulos, el campo de bits de los `bool`, los anchos de la tabla de §4.18, `date` con signo en 48 bits, varint LEB128 para `str` y `arr`, y el `group` en línea. Un solo recorrido para los dos sentidos. Lo que no es representable lo dice una función aparte, que usa la etapa | `forms` | `src/wire/*.ts` · `package.json` (exports) |
| [ ] | 22 | 16, 21 | **Las etapas.** `Payload`, `Stage` y las cuatro de §4.17 (`positional`, `binary`, `json`, `compress`), con la regla de degradación. `$fn` pasa por ellas al final de la cadena de cliente; los middlewares siguen viendo `ctx.args` | `http` | `src/client/pipeline.ts` · `src/client/stages/*.ts` · `src/client/fn.ts` |
| [ ] | 23 | 22 | **`compress`.** La etapa con sus dos guardas (umbral y que el resultado sea menor), `min` por defecto 1000, el formato de `CompressOptions` en `content-encoding`. El nivel más interno gana (§3.3) | `http` | `src/client/stages/compress.ts` |
| [ ] | 24 | 13, 21 | **Decodificar en el servidor.** `dispatch` deshace el pipeline (§4.19): `DecompressionStream` según `content-encoding` (415 si no es de los tres), y `args` según `content-type`, con `readBinary` sobre el `$schema` de `.form`. Cuerpo posicional en una función sin `.form`: 400 | `http` | `src/server/body.ts` · `src/server/dispatch.ts` |
| [ ] | 25 | 20–24 | **Tests del cuerpo.** Criterios 41–52. El 47 imprime los tamaños de la línea de pedido y del ticket, y los compara con los de la spec de `docs/forms` más el mapa de nulos | `forms` · `http` | `packages/forms/test/wire/*.test.ts` · `test/body/*.test.ts` |

## Fase 6 — compilador (8)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 26 | 2 | **`ServerFnTable`.** Del AST de Oxc del `@server` (el mismo lote de hoy): cada `export const X = <verbo>()…handle(…)`, la base guardada en una `const` y continuada, el `export const http`, y un `load` fluent o `function`. Las referencias de cada middleware con su import resuelto, el `.compress` y el `.invalidates` como literales (§3.11) | `compiler` | `src/emit/server-fns.ts` · `src/emit/oxc-code.ts` |
| [ ] | 27 | 26 | **Diagnósticos.** `FUD1000`–`FUD1004`, `FUD1007`, `FUD1009` y `FUD1010`, cada uno con su span. Ninguno detiene el emit del resto | `compiler` | `src/emit/server-fns.ts` |
| [ ] | 28 | 16, 26 | **Stubs de una ruta.** El chunk de cliente declara un `const X = $fn({…})` por función (§4.5), con su `compress` y si tiene `.form`, y las imports de `@fudic/http/client`, de `src/http.ts` y de cada middleware importado. Visibles en el `@client` y en las expresiones de evento. Ningún stub para `load` | `compiler` | `src/emit/client-fns.ts` · `src/emit/module.ts` |
| [ ] | 29 | 26 | **Funciones de un componente.** Su URL por tag (§4.1). Las imports del `@server` y las declaraciones de función van al módulo `?server` del componente. Sin la reescritura de `inject` dentro de esas declaraciones. `FUD1008` (§4.13) | `compiler` · `vite` | `src/emit/oxc-code.ts` · `src/emit/module.ts` · `packages/vite/src/server.ts` |
| [ ] | 30 | 26 | **Se retira `FUD0683`.** `inject` y `publish` a secas en el `@server` de una ruta no diagnostican. `FUD0683.ts` se borra y su `.md` pasa a `retired` (viene de la tarea 2) | `compiler` · `diagnostics` | `src/emit/di-diagnostics.ts` · `packages/diagnostics/src/codes/FUD0683.*` |
| [ ] | 31 | 28 | **`form:=`.** Lo clasifica el binding de `control` (SDD-34) en un `<form>` con `control=`. El emit pasa la función a `bindForm`, que la llama en el submit válido: un 422 va a `$setErrors` con el foco al resumen, y el resto emite `fudic:result` / `fudic:error` (§4.7). `FUD1005` y `FUD1006` | `compiler` · `forms` | `src/binding/control.ts` · `src/emit/controls.ts` · `packages/forms/src/dom/bind-form.ts` |
| [ ] | 32 | 28 | **`src/http.ts`.** La convención en `@fudic/conventions` (`HTTP_FILE`). El stub la importa si existe; si no, la cadena global es vacía | `conventions` · `compiler` | `src/index.ts` · `src/emit/client-fns.ts` |
| [ ] | 33 | 26–32 | **Tests del compilador.** Criterios 10–13 y la parte de compilación del 26. El compilador no baja de su suelo de `main` y lo nuevo entra al 100 | `compiler` | `test/server-fns*.test.ts` |

## Fase 7 — plugin (7)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 34 | — | **Constantes.** `FN_PREFIX = '/_fudic/fn'`, `ERROR_PREFIX = '/_fudic/error'` y `DATA_PREFIX` en `@fudic/conventions`. Vite y transport dejan su copia de `DATA_PREFIX` | `conventions` · `vite` · `transport` | `src/index.ts` · `packages/vite/src/constants.ts` · `packages/transport/src/urls.ts` |
| [ ] | 35 | 13, 34 | **Dev.** Un middleware para `/_fudic/fn/**` con cualquier método: resuelve ruta o componente, carga su `?server` con `ssrLoadModule` y llama a `dispatch`. El endpoint de datos pasa por `dispatch` con la cadena de `load` | `vite` | `src/plugin.ts` · `src/serve.ts` |
| [ ] | 36 | — | **Borrar `.server(…)` en el build de cliente.** Por el mismo camino que `eraseServerValidators`: el argumento de `.server(` de un `middleware()` se sustituye y Rollup se lleva sus imports (§4.5) | `vite` | `src/server-validators.ts` · `src/plugin.ts` |
| [ ] | 37 | 13 | **`_error.fud`.** Fuera de la tabla de rutas. `/_fudic/error/:status` lo pinta con su `data`. Un `load`/`layout` que lanza al navegar responde según la tabla de §4.8, con la página mínima si no hay `_error.fud`. En dev, lo que no es `HttpError` también va al overlay | `vite` | `src/discover.ts` · `src/routing.ts` · `src/plugin.ts` · `src/serve.ts` |
| [ ] | 38 | 14 | **Prerender.** `load` con la cadena de servidor y el `ctx` sin petición de §4.14. Lo que lance para un path de `paths()` hace fallar el build con la URL y el status | `vite` | `src/prerender.ts` |
| [ ] | 39 | 13, 29 | **`functions.mjs` y `preview`.** El build escribe en `.fudic/edge/` la tabla de §4.15, y `vite preview` sirve `/_fudic/fn/**` desde ella | `vite` | `src/edge.ts` · `src/plugin.ts` |
| [ ] | 40 | 34–39 | **Tests del plugin.** Criterios 7, 8, 9, 27, 28, 29, 36, 37 y 38 | `vite` | `test/http-*.test.ts` |

## Fase 8 — Service Worker (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 41 | 34 | **El SW no toca las funciones.** `handle` y `respond` salen sin `respondWith` para `/_fudic/fn/**`, antes de evaluar el shell y las reglas de `sw.json` (§4.10) | `transport` | `src/router.ts` |
| [ ] | 42 | 41 | **Error de datos e invalidación.** Un endpoint de datos que no responde 2xx va a la red sin marcar la ruta como muerta (§4.8). `invalidatePattern(pattern)` borra los datos de todas las URLs en caché de ese patrón. El SW atiende el mensaje de invalidación de §4.9 y contesta por el puerto cuando ha borrado | `transport` · `vite` | `src/router.ts` · `src/messages.ts` · `packages/vite/src/bootstrap.ts` |
| [ ] | 43 | 41, 42 | **Tests del SW.** Criterios 30–34 | `transport` | `test/router-fn.test.ts` |

## Fase 9 — editor (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 44 | 26 | **Tipos.** La proyección declara en el `@client` y en las expresiones de evento cada función como `ServerFunction<A, R>`, con `A` y `R` del builder. `ctx` de un `load(ctx)` sin anotar es `ServerContext` con los params del fichero. Ir a la definición lleva al `export const` (§4.16) | `language-core` | `src/emit-server.ts` · `src/emit-client.ts` |
| [ ] | 45 | 30 | **`inject` a secas en el editor.** El `@server` de una ruta ve `inject` y `publish` de `@fudic/di` sin diagnóstico | `language-core` | `src/emit-server.ts` |
| [ ] | 46 | 44, 45 | **Tests del editor.** Criterios 39 y 40 | `language-core` | `test/server-fns.test.ts` |

## Fase 10 — ejemplo (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 47 | 11, 30 | **Migrar.** `examples/basic` deja `ctx.inject`, `ctx.publish` y `DiContext` (`di.fud`, `sesion/[user].fud` y los demás que los usen). Criterio 53 | `example-basic` | `src/routes/*.fud` |
| [ ] | 48 | 35–42 | **Ejemplo nuevo.** La ruta de §1 con `search`, `save` y `remove`, un `user-form` con su `save`, `src/http.ts` con `csrf`, `errorPages` y `compress`, un `auth` de dos mitades, `_error.fud` y un formulario con todos sus controles tipados. Criterio 54 | `example-basic` | `src/routes/usuarios.fud` · `src/components/user-form.fud` · `src/http.ts` · `src/middlewares/*.ts` · `src/forms/*.ts` · `src/routes/_error.fud` |
| [ ] | 49 | 48 | **README y prueba.** README de `@fudic/http` en inglés, corto y sin citas a SDD. Pedro prueba el ejemplo en el navegador: buscar, guardar con errores del servidor, borrar, un 500 que navega a la página de error, abortar una búsqueda, y ver en Network el cuerpo posicional, el binario y el comprimido | `http` · `example-basic` | `packages/http/README.md` |

## Fase 11 — entrega (1)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 50 | 1–49 | **Cierre.** `pnpm typecheck`, `pnpm test` y `pnpm build` en verde. `@fudic/http` al 100 % en las cuatro métricas y ningún paquete por debajo de su suelo de `main`. Estado `Hecho` en la SDD, en este fichero y en el `INDEX.md`, con su entrada en el registro de progreso | — | `docs/sdd/SDD-56-*.md` · `docs/sdd/INDEX.md` |
