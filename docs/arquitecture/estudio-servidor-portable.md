# Estudio — el servidor de fudic, fuera de Vite (antes de SDD-81)

> 2026-11-09. Pedido por Pedro antes de implementar SDD-81: ¿el multipart, las cookies y el CSRF
> quedan atados al plugin de Vite? ¿Qué falta para que un adaptador (Node, Deno, Bun, Cloudflare)
> reutilice todo?

## 1. Respuesta corta

- **Las funciones de servidor ya son portables.** Todo lo que sirve una llamada vive en
  `@fudic/http` y habla `Request → Response | null`: `contractsHandler`, `serve`, `bodyArgs`,
  `valueResponse`, `problemResponse`, `setCookie`, `csrfServer`. El build deja
  `.fudic/edge/functions.mjs` con `handle(request)` para que un adaptador lo monte. El plugin solo
  traduce Node ↔ `Request` (`vite/src/functions.ts`: `toRequest`, `sendResponse`).
- **Las páginas no lo son.** El render de una ruta, su endpoint de datos, la redirección de idioma,
  la página de error, el nonce de la CSP y los `103` están escritos **dos veces** dentro de
  `plugin.ts` (dev ~250 líneas, preview ~200), sobre `IncomingMessage`/`ServerResponse` de Node.
  No hay un `handle(request)` de páginas que un adaptador pueda montar. Eso es lo que da miedo, y
  con razón.
- **SDD-81 puede nacer portable** si se escribe sobre `ReadableStream` en `@fudic/http/server` (la
  spec ya lo pide) y si lo único de Node —el `FileStore` a disco y el volcado de la respuesta— se
  **inyecta**, no se detecta. Hay tres huecos que corregir en la spec (§5).
- **Cookies y CSRF tienen fallos reales**, pero no los que parecen: el `"1"` no es un token y no
  pretende serlo (§4); lo grave es que ambos deciden mirando el `Host`/esquema de la petición, y
  detrás de un proxy eso se rompe en producción.

## 2. El mapa por capas

| Capa | Dónde está hoy | ¿Portable? |
|---|---|---|
| Despacho de funciones y reglas remotas (`/_fudic/fn`, `/_fudic/rule`) | `@fudic/http/contract/server` | Sí: `Request → Response` |
| Contexto, cookies, problema, CSRF, `load` | `@fudic/http/server`, `cookies.ts`, `csrf-*.ts` | Sí, con matices (§3, §4) |
| Contenedor por petición (`inject` sin `ctx`) | `http/server/request.ts`, `AsyncLocalStorage` de `node:async_hooks` | Node, Deno y Bun sí; Cloudflare solo con `nodejs_compat` |
| Node ↔ `Request`/`Response` | `vite/src/functions.ts` | No: atado a Node y escondido en Vite |
| Páginas: match, datos, idioma, error, CSP, `103`, streaming | `vite/src/plugin.ts` (dos copias) + `serve.ts` | No |
| Prerender | `vite/src/prerender.ts` | Es del build; no hace falta en un adaptador |

## 3. Cookies

Lo que hace hoy `serializeCookie`: `HttpOnly`, `SameSite=Lax`, `Path=/` y `Secure` **salvo cuando
el `Host` de la petición es `localhost`, `127.0.0.1` o `[::1]`** (SDD-69). Por eso en el navegador
se ven sin `Secure` en dev.

Problemas:

1. **Se decide por el `Host`, también en producción.** Un nginx con `proxy_pass http://localhost:3000`
   que no reescribe `Host` hace que la app crea estar en loopback: las cookies de sesión salen **sin
   `Secure`** en producción, sin aviso.
2. **El caso inverso rompe dev en el móvil.** `vite --host` y entrar por `http://192.168.1.20`: el
   host no es loopback, sale `Secure` sobre `http` y el navegador tira la cookie en silencio (el
   login «no funciona»).
3. **La excepción sobra en Chrome y Firefox**: tratan `http://localhost` como contexto seguro y
   aceptan `Secure`. Safari no lo ha hecho siempre igual; hay que probarlo antes de quitarla.
4. No hay soporte para el prefijo `__Host-`, que es lo recomendable para una cookie de sesión
   (obliga a `Secure`, `Path=/` y sin `Domain`).

**Propuesta.** `Secure` no se deduce de la petición: lo declara **quien monta el servidor**. Una
opción del handler (`cookies: { secure: boolean }`), `true` por defecto; el servidor de dev de Vite
la pone a `false` solo cuando escucha en loopback, y preview y cualquier adaptador la dejan en
`true`. `setCookie` la lee del contexto. Y `setCookie(ctx, '__Host-x', …)` comprueba lo que exige
el prefijo, como ya hace con `SameSite=None`.

## 4. CSRF

Lo que hace hoy: el cliente pone `x-fudic-csrf: 1`; el servidor, en todo lo que no es GET, exige esa
cabecera **y** que `Sec-Fetch-Site`, si viene, sea `same-origin`, **y** que `Origin`, si viene,
sea el de la URL.

**El `"1"` no es el fallo.** No es un token: es el patrón «cabecera propia». Un formulario de otro
sitio no puede poner cabeceras, y un `fetch` de otro sitio con una cabecera propia dispara un
preflight CORS que nadie contesta. El valor da igual a propósito. Junto con `Sec-Fetch-Site` y
`Origin` es la defensa que hoy recomiendan OWASP y la que adoptó la librería estándar de Go
(`CrossOriginProtection`, 2025): sin estado, sin token. Para llamadas desde una página fudic es
correcta.

Los fallos de verdad:

1. **Detrás de un proxy TLS, todo POST da 403.** `toRequest` arma la URL con `http` si el socket no
   es TLS, y no lee `X-Forwarded-Proto`/`Forwarded`. El navegador manda `Origin: https://app.com`,
   la URL dice `http://app.com`, no casan. Ningún adaptador lo resuelve sin una opción de «confío
   en el proxy» (`trustProxy`) que hoy no existe en ningún sitio.
2. **SDD-81 abre una puerta que hoy está cerrada sin que nadie lo sepa.** Hoy una función sin
   `use csrf` está protegida por accidente: un formulario de otro sitio no puede mandar
   `application/fud+bin` ni `application/json`, y el servidor responde 415. `multipart/form-data`
   **sí** lo puede mandar un `<form>` de cualquier web, sin preflight. Con SDD-81, toda función con
   `file` y sin `use csrf` en su cadena se puede llamar desde otro sitio con las cookies del
   usuario.
3. **El criterio 9 de SDD-81 choca con el CSRF.** `curl -F … ` contra una función con `use csrf`
   da 403 si no añade `-H 'x-fudic-csrf: 1'` (el ejemplo tiene `csrf` en la cadena global).
4. **No hay modo token.** Una app con sesión por cookie que quiera token sincronizado (en un
   `<meta>`, firmado con la sesión) o doble envío de cookie tiene que escribir su propio
   middleware, y además el servidor no tiene forma de poner un `<meta>` en el `<head>` de la página
   que renderiza. Es una carencia del producto, pero no de SDD-81.

**Propuesta.**
- Para SDD-81: **una llamada multipart de otro sitio se rechaza siempre**, lleve `use csrf` o no:
  `Sec-Fetch-Site: cross-site` o un `Origin` que no es el propio → 403. `curl` no manda ninguno de
  los dos, así que el criterio 9 sigue valiendo; y añadir a §3.3 que con `use csrf` hace falta la
  cabecera.
- Fuera de SDD-81, en su propia spec: `csrf` con estrategia (`fetch-metadata` por defecto, `token`
  con `<meta>` + cookie firmada) y `trustProxy` en el handler.

## 5. Qué cambiar en SDD-81 para que nazca portable

1. **`FileStore` inyectado, no detectado.** La spec dice «en Node a disco, fuera de Node en
   memoria». `@fudic/http/server` no debe preguntar en qué runtime está: exporta `memoryStore()`
   (portable) y `@fudic/http/node` exporta `diskStore()` (con `fs.openAsBlob`). Quien monta el
   handler elige; el plugin de Vite pasa `diskStore`, un futuro adaptador de Cloudflare pasa
   `memoryStore` o uno de R2. Sin esto, `@fudic/http/server` importaría `node:fs` y no cargaría en
   un worker.
2. **El pegamento Node sale de Vite.** `toRequest`, `sendResponse` (que SDD-81 obliga a reescribir
   en streaming) y `writeHeaders` pasan a `@fudic/http/node`. El plugin los importa; un adaptador
   Node (Express, `node:http`, Fastify) los reutiliza tal cual. Deno, Bun y Cloudflare no los
   necesitan: ya hablan `Request`/`Response`.
3. **`release()` sin depender del servidor.** «Al terminar la respuesta» no se puede saber desde un
   `Response` en un worker. Que el handler devuelva un `Response` cuyo cuerpo, al cerrarse o
   cancelarse, llama a `release()` (un `TransformStream` alrededor del cuerpo). Así funciona igual
   en Node, Deno, Bun y el borde.
4. **Límites y almacén entran por las opciones del handler** (`uploads`, `files`), como ya dice
   §3.5; el plugin los lee de `fudic.json` y los pasa. Nada en `@fudic/http` lee ficheros de
   configuración.
5. Las tres de §4 (multipart de otro sitio siempre 403, `curl` y la cabecera, nota en §3.3).

## 6. Lo que queda grande, y no es de SDD-81

Sacar las **páginas** del plugin: un `pagesHandler(request) → Response` en un paquete propio que
haga match, datos, idioma, error, CSP con nonce y streaming, con el cargador de módulos inyectado
(dev: `ssrLoadModule`; build: los chunks de `.fudic/edge`). Dev y preview pasan a ser dos
configuraciones del mismo handler en vez de dos copias, y un adaptador monta
`functions.handle` + `pages.handle` y nada más. Junto con `cookies.secure`, `trustProxy` y el
`csrf` con estrategias, es una spec de «contrato de adaptador» que conviene hacer **antes** de
escribir el primer adaptador, y no hace falta para SDD-81.
