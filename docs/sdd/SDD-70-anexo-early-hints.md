# SDD-70 — Anexo: 103 Early Hints

> **Informativo.** Acompaña a [SDD-70](./SDD-70-await-en-la-vista.md) y **no cambia su alcance**.
> Recoge la conversación con Pedro del 2026-10-31 sobre cómo aprovechar el tiempo que el servidor
> pasa esperando a `load`, y el estudio de compatibilidad de navegadores y backends. Lo que aquí
> se propone necesita su propia spec antes de implementarse.

---

## E.1. El objetivo

Que cuando llegue el `<body>` de una página, su CSS ya esté descargado y compilado y su JS ya esté
en la tabla de módulos.

SDD-70 suelta el `<head>` en cuanto `load` devuelve lo rápido. Pero mientras `load` trabaja, el
navegador no tiene nada que hacer: no conoce aún ni un solo recurso de la página. Soltar el head
**antes** de `load` no es una salida:

- con el primer byte, el status queda fijado en `200`, y un `notFound()` o una redirección de
  `load` ya no se pueden dar (SDD-70 §3.4);
- el head puede leer `data` (el `<title>`, por ejemplo).

El **103 Early Hints** (RFC 8297) resuelve las dos cosas.

## E.2. Qué es el 103

Es una respuesta HTTP **provisional** que el servidor manda antes de la definitiva, con solo
cabeceras `Link`. No fija el status: después puede llegar un `200`, un `404` o una redirección.

```text
navegador                         servidor
   │ GET /hidratacion  ───────────▶ │
   │ ◀─────────── 103 + Link        │  (nada más llegar la petición)
   │  descarga CSS y JS             │  espera a load (backend)
   │ ◀─────────── 200 + <head>…     │  (cuando load devuelve)
   │  el head encuentra todo en caché
```

En Node se manda con `res.writeEarlyHints({ link: [...] })` y luego se espera a `load` como hoy.

Lo que el navegador hace con cada `rel`:

| `rel` | Qué adelanta |
|---|---|
| `preload; as=style` | La **descarga** del CSS. Se compila cuando aparece su `<link rel="stylesheet">`, ya desde caché. |
| `modulepreload` | La descarga **y** el análisis del módulo: queda en la tabla de módulos sin ejecutarse. |
| `preconnect` | Solo la conexión (DNS, TCP, TLS) con otro origen. |

## E.3. Qué saldría en el 103: la página `/hidratacion` de `examples/basic`

Su head hoy:

```html
<link rel="stylesheet" href="/assets/tokens-BqSaBSRF.css">
<script type="module" src="/fudic-boot-cb51c1b4.js"></script>
<script type="module" src="/fudic-main-257ec82c-cb51c1b4.js"></script>
```

`fudic-main-…` importa `transport/urls.js`, `core/hydrate.js` y `core/warm-sw.js`, y `hydrate.js`
importa `core/registry.js`. Hoy el navegador descubre esa cadena salto a salto: descarga el entry,
lo analiza, ve sus imports, los pide… Con el 103 se piden todos a la vez:

```http
HTTP/2 103
link: </assets/tokens-BqSaBSRF.css>; rel=preload; as=style
link: </fudic-boot-cb51c1b4.js>; rel=modulepreload
link: </fudic-main-257ec82c-cb51c1b4.js>; rel=modulepreload
link: </_fudic/0.0.1-c46cec10/core/hydrate.js>; rel=modulepreload
link: </_fudic/0.0.1-c46cec10/core/registry.js>; rel=modulepreload
link: </_fudic/0.0.1-c46cec10/core/warm-sw.js>; rel=modulepreload
link: </_fudic/0.0.1-464fcb3b/transport/urls.js>; rel=modulepreload
```

**Lo que no va:**

- **El CSS de los componentes**, mientras siga dentro de la página en `<style type="module"
  specifier>` con el polyfill (ver E.4).
- **Los chunks de cada componente.** Se piden al hidratarse, por visibilidad o al tocarlo.
  Precargarlos rompería la hidratación perezosa.

La lista sale entera del build: el compilador sabe qué CSS global y qué grafo de módulos de
arranque tiene cada ruta.

## E.4. El CSS de los componentes como fichero (opcional)

Hoy cada componente lleva su CSS dentro del HTML (`<style type="module" specifier="…">`) y un
polyfill de unas líneas lo adopta en cada shadow root. Así no hay FOUC, porque el estilo llega con
el markup, pero ese CSS se vuelve a descargar en **cada** página.

La alternativa, **opcional y por app**: cada componente pone un `<link rel="stylesheet">` en su
shadow root, apuntando a un fichero con hash, y el polyfill desaparece para esa app. Ese CSS
entra en el 103:

```http
link: </assets/theme-<hash>.css>; rel=preload; as=style
link: </assets/panel-<hash>.css>; rel=preload; as=style
link: </assets/site-nav-<hash>.css>; rel=preload; as=style
link: </assets/app-counter-<hash>.css>; rel=preload; as=style
```

- **Cuando el 103 llega**, el `<link>` de cada shadow root encuentra el CSS en caché y el
  navegador comparte la hoja ya compilada entre todas las instancias: el FOUC prácticamente
  desaparece.
- **Cuando no llega** (HTTP/1.1, Safari, un proxy que lo descarta), un `<link>` dentro de un shadow
  root no bloquea el pintado del documento: el contenido del componente se ve sin estilo hasta que
  baja su CSS. **Ese es el riesgo que asume quien activa la opción.**
- **Gana aunque no haya 103:** el CSS de los componentes se cachea una vez para todo el sitio en
  lugar de viajar en cada HTML.

Punto abierto: la CSP. Un `<link>` a un fichero del mismo origen no lleva nonce; hay que
comprobar que la política que genera fudic admite `style-src 'self'`.

## E.5. Compatibilidad de navegadores

Estado a 2026-10-31. Solo cuenta en **navegaciones de primer nivel** (no en iframes ni en
subrecursos).

| Navegador | `preconnect` | `preload` | `modulepreload` | Notas |
|---|---|---|---|---|
| Chrome / Edge | 103 | 103 | 103 | Solo HTTP/2 y HTTP/3. Ignora el segundo 103 y los siguientes. |
| Firefox | 120 | 123 | sin confirmar | En DevTools, el recurso sale como `cached` con la cabecera `X-Moz: early hint`. |
| Safari | 17 | **no** | **no** | WebKit dice que quiere soportar `preload`, pero requiere refactorizar. |

Reglas que se siguen de la tabla:

- **Un solo 103 por respuesta**, con todo dentro.
- **Mandarlo solo sobre HTTP/2 o HTTP/3** y solo cuando la petición trae
  `Sec-Fetch-Mode: navigate`. Es lo que recomienda Chrome, y evita a los clientes y proxies
  HTTP/1.1 viejos que no saben qué hacer con un 1xx.
- **Solo recursos cacheables**: lo que no se puede cachear se descarga dos veces. Los ficheros con
  hash de fudic ya lo son.
- **Si la respuesta final es una redirección a otro origen**, el navegador descarta lo
  precargado. Es solo trabajo perdido, nada se rompe.
- **El servidor de desarrollo de Vite va en HTTP/1.1**, así que en desarrollo Chrome no lo usa.
  Se prueba con preview sobre HTTP/2 o detrás de un proxy.

**El navegador no se puede detectar antes de mandarlo.** Ninguna cabecera de la petición dice
«entiendo el 103». Tampoco hace falta: un cliente que no lo entiende lo ignora. El filtro útil es
el de arriba (protocolo y `Sec-Fetch-Mode`), no el `User-Agent`.

## E.6. Compatibilidad de backends

El backend de fudic es políglota (SDD-61): Node, C#, Java, Go, Rust y Python. Que cada uno pueda
mandar el 103 depende de su servidor HTTP, no del lenguaje.

| Lenguaje | Servidor | ¿Manda 103? | Cómo / estado |
|---|---|---|---|
| Node | `http`, `http2` | **sí** | `res.writeEarlyHints()` desde Node 18.11. fudic exige ≥ 22.12. |
| Go | `net/http` | **sí** | `w.WriteHeader(103)` con `Link` en la cabecera, desde Go 1.19, en HTTP/1.1 y HTTP/2. |
| Java | Tomcat | **sí** | `sendError(103)` en versiones recientes. Tomcat 12 añade el método estándar de Servlet `HttpServletResponse.sendEarlyHints()`. |
| Java | Jetty 12 | **sí** | `sendEarlyHint()` en `Response`, y `sendError(103)`. |
| Java | Netty / Spring WebFlux | sin confirmar | — |
| C# | Kestrel (ASP.NET Core) | **no** | dotnet/aspnetcore#27851, abierto desde 2020, en el hito «.NET 12 Planning». |
| Rust | hyper (y axum, que va sobre él) | **no** | Sin API estable: hyperium/hyper#2426 abierto. Un PR para HTTP/2 (#3980) se cerró como duplicado en 2026-09. |
| Python | Hypercorn (ASGI) | **sí** | Extensión ASGI `http.response.early_hint`. |
| Python | Gunicorn (ASGI) | **sí** | Su guía de HTTP/2 lo soporta, con un mensaje `http.response.informational` distinto al de la extensión ASGI. |
| Python | Uvicorn / Granian | **no** encontrado | Granian: sin planes de soportar extensiones ASGI (issue antigua). |

**Delante del backend**, cualquier lenguaje queda cubierto:

| Pieza | Qué hace |
|---|---|
| nginx, Apache (`mod_http2`), H2O | Mandan el 103 o reenvían el del backend. |
| Cloudflare | Genera el 103 por su cuenta a partir de las cabeceras `Link` de respuestas anteriores de esa URL. El backend no tiene que saber nada. |
| Fastly, Akamai | Soportan Early Hints en el borde. |

## E.7. Propuesta de diseño

1. **Un manifiesto por ruta, generado en el build.** Lista lo que va en el 103: CSS global, grafo
   de módulos de arranque y, con la opción de E.4, el CSS de los componentes. Es un fichero que
   cualquier backend lee: el contrato es el mismo en los seis lenguajes.
2. **La respuesta final lleva siempre esas cabeceras `Link`.** Funciona en todos los servidores y
   es lo que usa un CDN como Cloudflare para generar el 103 sin ayuda del backend.
3. **El 103, automático donde se pueda.** El adaptador de cada backend lo manda si su servidor
   sabe hacerlo, la conexión es HTTP/2 o HTTP/3 y la petición es una navegación. Sin flag: a quien
   no lo entiende no le hace nada. Una salida en `fudic.json` para apagarlo (`"earlyHints": false`)
   cubre el caso de un proxy que se porte mal.
4. **El CSS de componentes como fichero, opt-in.** Esta opción sí va con flag, por defecto `false`,
   porque cambia lo que el usuario ve (el FOUC de E.4). Nombre por decidir, p. ej.
   `"componentStyles": "link"` frente al `"inline"` de hoy.

## E.8. La tendencia

El 103 sustituye a HTTP/2 Server Push, que los navegadores ya no honran: Jakarta Faces, por
ejemplo, quitó el push de sus requisitos en 2026 y nombró el 103 como mecanismo. Chromium lo
soporta entero desde 2022, Firefox casi, y los servidores van llegando (Tomcat 12, la API de
Servlet, el trabajo abierto en hyper y en Kestrel). Lo lento es **Safari**, que solo acepta
`preconnect`, y **Kestrel y hyper**, que no lo mandan aún. En 2025 solo un 5 % de los sitios
grandes lo usaba (Web Almanac), así que es una ventaja real, todavía no la norma.

## E.9. Fuentes

- [Chrome for Developers — Early Hints](https://developer.chrome.com/docs/web-platform/early-hints)
- [Chromium — 103 Early Hints (docs)](https://chromium.googlesource.com/chromium/src/+/711ab9bc/docs/early-hints.md)
- [Blink — Intent to Ship: Early Hints preload/preconnect](https://groups.google.com/a/chromium.org/g/blink-dev/c/8iIvkmZNUhU/m/c6a7OBvFAgAJ)
- [WebKit — bug 253120 (preconnect vía Early Hints)](https://bugs.webkit.org/show_bug.cgi?id=253120)
- [Akamai — Early Hints](https://techdocs.akamai.com/property-mgr/docs/early-hints)
- [Fastly — Early Hints](https://www.fastly.com/documentation/reference/http/early-hints/)
- [Go — http2: allow sending 1xx responses](https://github.com/golang/net/pull/96)
- [Tomcat 12 — changelog (`sendEarlyHints`)](https://nightlies-he-fi.apache.org/tomcat/tomcat-12.0.x/docs/changelog.html)
- [Jetty 12 — `Response` (EE9)](https://javadoc.jetty.org/jetty-12/org/eclipse/jetty/ee9/nested/Response.html)
- [dotnet/aspnetcore#27851](https://github.com/dotnet/aspnetcore/issues/27851)
- [hyperium/hyper#2426](https://github.com/hyperium/hyper/issues/2426) · [hyperium/hyper#3980](https://github.com/hyperium/hyper/issues/3980)
- [ASGI — extensiones (`http.response.early_hint`)](https://asgi.readthedocs.io/en/latest/extensions.html)
- [Hypercorn#380](https://github.com/pgjones/hypercorn/issues/380)
- [Gunicorn — HTTP/2 y Early Hints](https://gunicorn.org/guides/http2/)
- [Granian#78](https://github.com/emmett-framework/granian/issues/78)
- [Jakarta Faces — PR 2174](https://github.com/jakartaee/faces/pull/2174)
