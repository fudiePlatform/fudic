# Hallazgos del framework

Lo que la web encuentra en Fudic y no es de la CLI (esos van en
[hallazgos-cli.md](hallazgos-cli.md)): el compilador, el runtime, el servidor o la guía de
estilos. Mismo formato: qué pasó, cómo se resolvió en la web y qué debería hacer Fudic.

## 1. La preview no comprime

- **Qué pasó.** Lighthouse sobre la preview marca `uses-text-compression`: el HTML de
  `/docs/getting-started` sale en 38,7 KB sin comprimir (10,3 KB con gzip, 9 KB con brotli), y
  la CSS y los módulos JS igual. En `packages/server/src` no hay rastro de `gzip`, `brotli` ni
  `content-encoding`. Medido con un proxy brotli delante, la página pasa de 99 a 100 en móvil
  (FCP de 1,4 a 1,2 s).
- **Cómo se resolvió.** No se ha resuelto todavía. Está en el plan de antes del lanzamiento
  ([notas-lanzamiento.md](notas-lanzamiento.md)).
- **Qué debería hacer.** **Solo la preview**, para que medir en local refleje producción:
  comprimir al vuelo según `Accept-Encoding` con lo que trae Node (brotli y gzip en `zlib`, y
  zstd cuando deje de ser experimental), con `Vary: Accept-Encoding` y sin recomprimir woff2 ni
  imágenes.
- **Qué no debería hacer.** Precomprimir en la build (`.br`, `.gz`). La compresión es del
  transporte, se negocia petición a petición, y la hace el hosting: Cloudflare, Netlify, Vercel
  o un Caddy delante ya sirven brotli y zstd, y adoptan el siguiente formato sin esperar al
  framework. Precomprimir triplica ficheros, alarga la build y congela los formatos. La
  documentación lo dirá en una línea: la compresión la hace tu hosting; la preview comprime para
  que tus mediciones sean reales.

## 2. ~~Un componente que se hidrata al cargar entra en la cadena crítica~~ (descartado)

- **Qué pasó.** `ui-toc` usa `onConnect`, así que se hidrata al cargar, y la página lleva un
  `modulepreload` de prioridad alta por cada módulo del runtime que necesita (quince). La sospecha
  era que competían con el primer pintado.
- **Cómo se resolvió.** Medido: con **todo el JS bloqueado**, Lighthouse en móvil da lo mismo
  (92, FCP 2,6 s). Los preloads no pesan. La causa del 92 eran las fuentes (nº 4).
- **Qué debería hacer.** Nada.

## 3. Un `<link href>` no puede nombrar un fichero de otro paquete

- **Qué pasó.** El layout de la documentación precarga la fuente de la guía. Se intentó con
  `<link rel="preload" href="@web/guide/fonts/inter-tight-wght-400-600.woff2" …>`, igual que
  `<link rel="layout" href="@web/ui/…">`:
  - el compilador lee `@web` como una expresión y el prerender falla con `FUD0620` («web is not
    defined»), un mensaje que no apunta a la causa;
  - escapado como `@@web/…`, compila, pero el HTML sale con `@@web/…` literal: ni se desescapa a
    `@` ni se resuelve como fichero.
- **Cómo se resolvió.** Con la ruta relativa `../../../guide/fonts/…` en
  `web/libs/ui/src/layouts/docs.fud`. La build la reescribe al mismo `/assets/…-<hash>.woff2` que
  el `url()` del `@font-face`, pero cruza de `@web/ui` a `@web/guide` por disco y se salta los
  `exports` del paquete (lo mismo que el nº 6 de la CLI).
- **Qué debería hacer.** Resolver un `href` con nombre de paquete (`@scope/pkg/…`) en cualquier
  `<link>` del head, como ya hace con `rel="layout"`, `"snippet"` y `"component"`. Y que `@@`
  en un atributo produzca `@`. Va con la fase de las `@` de la gramática.

## 4. La guía no puede pedir que se precargue su fuente

- **Qué pasó.** Lighthouse en móvil daba **92** en `/docs/getting-started` (FCP 2,6 s) frente al
  100 de `examples/basic/hidratacion` (`preview:nosw`). Medido factor a factor, la causa eran las
  **cuatro fuentes** de la guía (192 KB): sin ellas, 99–100. Con `font-display: swap` la página
  no se bloquea en un móvil real, pero Lighthouse simula la red lenta con todo lo que llegó antes
  del primer pintado, y en local las fuentes llegan dentro del periodo de bloqueo de `swap`.
  Además, la fuente solo se descubre tras descargar la CSS, y `fudic.json` de una guía declara
  `sheet` e `icon` pero no tiene forma de declarar un `preload`.
- **Cómo se resolvió.** Una sola fuente, Inter Tight, recortada a pesos 400–600 y a Latin-1 más
  puntuación tipográfica (23 KB, con su `unicode-range`); la mono y la cursiva, del sistema.
  El layout la precarga a mano (ver el nº 3). Resultado: **99** en móvil (FCP 1,4 s), **100** con
  compresión. El recorte con fontTools está en `web/libs/guide/README.md`.
- **Qué debería hacer.** Que la guía declare sus fuentes críticas
  (`"guide": { "preload": ["fonts/…woff2"] }`) y Fudic escriba el
  `<link rel="preload" as="font" type="font/woff2" crossorigin>` y su Early Hint en cada página
  que enlaza la guía. Si la CLI llega a instalar fuentes (algo como `fudic add font`), que
  automatice el recorte: el usuario no debería tocar Python.

## 5. `assets.headers` no cubre los ficheros que Fudic emite, y no deja agrupar rutas

- **Qué pasó.** Lighthouse marcaba caché corta en `/docs/getting-started`. La plantilla de
  `assets.headers` solo da caché larga a `/assets/**`, pero la build escribe otros dos tipos de
  fichero con hash **fuera** de `/assets/`, que caen en `/**` (`no-cache`):
  - el runtime compartido, `/_fudic/<versión>-<hash>/core/…`, `/dom/…`, `/transport/…`;
  - el coordinador de cada ruta, `/fudic-main-<hash>-<build>.js`, en la raíz (con Service Worker
    también `/fudic-boot-<build>.js`).

  Al intentar darles la misma caché que a `/assets/**` sin repetir el bloque, aparecieron tres
  problemas, medidos con `parseHeaders` y `assetDecisionsFor` y con `vite preview`:

  1. **Un bloque admite una sola ruta, y equivocarse es silencioso.**
     - `/assets/**,/_fudic/**` se lee como **una** ruta literal con coma: no casa con nada y todo
       sigue en `no-cache`. Solo deja un `FUD1553` de nivel *hint*, que la build no imprime.
     - Dos rutas seguidas en columna 0 (`/assets/**` y debajo `/_fudic/**`) cierran la primera
       como un bloque **vacío**, sin aviso: `/_fudic/**` se lleva la cabecera y `/assets/**` se
       queda sin ella. Es la peor de las dos: rompe lo que ya funcionaba.
  2. **El patrón del main no es evidente.** `/fudic-main-*.js` funciona (`*` no cruza `/`, el main
     está en la raíz), y también `/fudic-main-*`, pero nada en la plantilla ni en la
     documentación dice que ese fichero existe ni dónde vive.
  3. **`FUD1552` da un falso positivo con `/_fudic/**`.** La build avisa «immutable on /_fudic/**
     keeps the old /_fudic/0.0.1-689426ec/core/effect.js in the browser: its name has no hash» y
     propone quitar `immutable`. Es falso: el hash está en el **directorio** (`0.0.1-689426ec`),
     y `isHashedName` (`packages/vite/src/headers.ts`) solo mira el nombre del fichero. El consejo
     del diagnóstico llevaría a servir el runtime sin caché.
- **Cómo se resolvió.** En `web/apps/site/assets.headers`, un bloque por ruta, la misma cabecera
  repetida tres veces: `/assets/**`, `/_fudic/**` y `/fudic-main-*.js`. Medido con `vite preview`:
  los tres salen con `public, max-age=31536000, immutable`; las páginas y `fudic-routes.json`,
  con `no-cache`. El `FUD1552` sigue saliendo en la build y se ignora.
- **Qué debería hacer.**
  - **La plantilla** (`HEADERS_TEMPLATES.assets` en `packages/config/src/headers/templates.ts`,
    que es a la vez lo que escribe `fudic new` y lo que vale un fichero ausente) debe nacer con
    caché larga para todo lo que la build emite con hash, no solo para `assetsDir`. Una app
    recién creada debería sacar el 100 en caché sin que su autor sepa qué es `_fudic`.
    Mejor aún: que esos ficheros sean **de Fudic**, como ya lo son `/fudic-sw.js` y
    `/fudic-routes.json` (`FUDIC_PATHS`): sus nombres los elige Fudic y siempre llevan hash, así
    que Fudic puede darles `immutable` por su cuenta y dejar `assets.headers` para lo del autor.
  - **Varias rutas por bloque**: varias líneas de ruta seguidas en columna 0 comparten las
    cabeceras de debajo. Es la lectura natural y no choca con nada de la sintaxis actual.
  - **Un bloque sin cabeceras es un error** con su span (`FUD1540` u otro código), nunca un
    bloque vacío en silencio. Y una ruta con `,` merece una pista que diga que la coma no separa
    rutas.
  - **`isHashedName`** debe contar como con hash un fichero bajo un directorio con hash
    (`/_fudic/<versión>-<hash>/…`), o `checkAssets` debe saber que `_fudic/` es de Fudic.

## 6. No hay forma de escribir un estilo en línea que cambie

- **Qué pasó.** Al documentar el capítulo 2 (atributos y propiedades), comprobado con un build
  real de la web con componentes de prueba. Las dos vías fallan:
  - **`style=@expr` es un error** (`FUD0915`): la guarda trata un `style` dinámico como un
    atributo que carga recursos (un `url()` puede pedir lo que quiera), y el mensaje propone
    `style:prop`.
  - **`style:prop=@x` se acepta pero no se emite.** La decisión 22 de la gramática lo define
    como hermano de `class:`, y el parser, la proyección del editor, el resaltado y la superficie
    de CSS lo reconocen (`StyleBinding` en `packages/compiler/src/binding/nodes.ts`). Pero
    compilado `<p style:color=@c() @click=@f>x</p>`, ni el módulo de servidor ni el chunk de
    cliente contienen `color` ni `style`: el binding desaparece sin diagnóstico. Ningún ejemplo
    de `examples/basic` lo usa, así que nadie lo había visto.

  El resultado es que una barra de progreso (`width`), un color elegido por el usuario o una
  propiedad personalizada (`--color`) no se pueden escribir desde la plantilla.
- **Cómo se resolvió en la web.** El capítulo 2 no documenta `style:` ni `style=@expr`: para lo
  que cambia con el estado propone `class:`.
- **Qué debería hacer.** Emitir `style:` como `class:`: en el servidor, sumarlo al atributo
  `style`; en el cliente, `el.style.setProperty(prop, v)` al cambiar, y `removeProperty` con
  `null` o `undefined`, conservando lo que otros hayan puesto en `style` (igual que `class:`
  conserva las clases ajenas). Admitir propiedades personalizadas (`style:--color=@x`), que es la
  forma limpia de pasar un dato al CSS. Mientras no se emita, `style:` debería ser un error con
  código, no un silencio, y `FUD0915` no debería proponerlo.

- **Vuelto a comprobar (capítulo 4, Estilos).** Sigue igual: `style:color=@c()` no deja nada en
  el HTML ni en el chunk. Y el mensaje de `FUD0132` (Razor dentro de `<style>`) también propone
  `style:` como salida (`Write what changes in the markup (style=, style:, class:)`), igual que
  `FUD0915`: dos errores que mandan al autor a una sintaxis que se pierde en silencio. El
  `style="…"` **estático** sí funciona, en el light DOM y dentro de un componente, y es lo que
  documenta el capítulo 4, con su nota sobre `style-src-attr`.

## 7. Un handler delegado que llama directamente a una prop función no compila

- **Qué pasó.** En un componente que recibe `onPick: (option: string) => void`, el handler
  `<div @click=@onPick(option)>` con las filas marcadas `delegate:option="click"` rompe el chunk
  de cliente: el emit escribe `return onPick($z0()on);` (sustituye `opti` por la fila y deja
  `on`), y Oxc falla con `PARSE_ERROR`. Huele a un desfase de offsets al reescribir la llamada
  cuando su destino es una prop. Con una función intermedia del `@code`
  (`function pick(option) { onPick(option); }` y `@click=@pick(option)`) compila y funciona.
- **Cómo se resolvió en la web.** El ejemplo del capítulo 2 usa la función intermedia.
- **Qué debería hacer.** Compilar `@onPick(option)` delegado igual que `@pick(option)`. Es la
  forma natural de escribirlo, y `FUD0202` la propone tal cual para un callback.

## 8. Una ruta no puede pasar una prop función a un componente

- **Qué pasó.** Una ruta con `function chosen(option: string) { … }` en su `@code` y
  `<site-choice .onPick=@chosen>` en su markup falla al prerenderizar:
  `FUD0620: /probe failed to prerender: chosen is not defined`. El render de servidor nombra la
  función, pero las funciones del `@code` no están en el corte de servidor. El mismo uso dentro de
  un componente padre funciona, y una prop `Signal` (`.value=@quantity`) desde una ruta también.
- **Cómo se resolvió en la web.** El capítulo 2 enseña la prop función desde un componente.
- **Qué debería hacer.** Lo mismo que en un componente: en el servidor una prop función no se
  evalúa (no hay nada que pintar con ella), y en el navegador cruza por referencia.

## 9. Un booleano en un atributo `aria-*` sale como atributo booleano de HTML

- **Qué pasó.** Al documentar el host en el capítulo 2, con un build real. Un atributo con
  expresión sigue la regla de los atributos booleanos de HTML: `true` escribe el atributo vacío y
  `false` lo quita. En `aria-*` eso está mal: los estados de ARIA son enumerados, `"true"` o
  `"false"`. `<site-toggle role="switch" aria-checked=@on()>` sale sin `aria-checked` mientras está
  apagado (un lector de pantalla no anuncia «desactivado», sino un switch sin estado), y
  `aria-disabled=@disabled` con `true` sale `aria-disabled=""`, que ARIA lee como ausente.
- **Cómo se resolvió en la web.** El capítulo 2 escribe el texto a mano:
  `aria-checked=@(on() ? "true" : "false")`, y lo explica.
- **Qué debería hacer.** Para un atributo `aria-*`, serializar el booleano como `"true"` o
  `"false"`, y quitar el atributo solo con `null` o `undefined`. Mientras tanto, un aviso con código
  al pasar un `boolean` a un `aria-*`, con la bombilla que escribe el ternario.

## 10. Un `@evento` en el tag de un hijo recibe el `CustomEvent` de `emit`, y los tipos no lo ven

- **Qué pasó.** Comprobado con un build real. El hijo hace `emit("picked", option)` y el padre
  escucha en su tag: `<site-choice @picked=@onPicked>`, con `function onPicked(option: string)`.
  Compila sin errores, pero el chunk registra `$dom.event(host, "picked", onPicked)`: `onPicked`
  recibe el `CustomEvent` entero, y `answer.set(e)` guarda un objeto `Event` en un signal de
  `string`. Es lo que dice SDD-72 (el dato llega solo a `bus:`, `@fudic:result` y `@fudic:error`;
  `@mi-evento`, «sin cambios»), pero la proyección no tipa el parámetro: un handler que pide un
  `string` acepta un evento sin que el editor diga nada.
- **Cómo se resolvió en la web.** Pendiente de Pedro. El capítulo 2 no documenta escuchar un
  `emit` con `@evento` en el tag del hijo; enseña `bus:` y la prop función.
- **Qué debería hacer.** Dos piezas, y la segunda no depende de la primera:
  1. Extender la decisión 173 a un `@evento` en el tag de un componente cuyo nombre emite ese
     componente (el contrato de SDD-63 ya sabe qué nombres emite y con qué `detail`): la
     referencia y la lambda reciben el dato, y la llamada sigue con `$event` como vía de escape.
     Así `emit` se escucha igual con `bus:` que en el tag, sin `detail`.
  2. Tipar el handler en la proyección: hoy un `@picked=@f` con `f(option: string)` no da error
     aunque reciba un `CustomEvent`. Con la pieza 1, el tipo es el `detail` del contrato; sin
     ella, `CustomEvent<detail>`.

## 11. Una `@` en un atributo del `<head>` de una página: ni se escapa ni se diagnostica

- **Qué pasó.** Al escribir las metas del capítulo 4, comprobado con un build real de la web:
  - `<meta name="description" content="… @import aplanado …">` en el `<head>` de una ruta tumba
    el build con un `PARSE_ERROR` de Oxc sobre el `.fud.ts` sintético (`Unexpected token`): el
    compilador toma `@import` por una expresión implícita y genera `(import)`. No sale ningún
    `FUD`, y el error apunta a una línea del TypeScript generado, no al `.fud`.
  - Con un nombre que no es palabra reservada el diagnóstico sí es bueno: `@sheet` en el mismo
    sitio da `FUD0907` (el nombre no está disponible en la vista), con su línea en el `.fud`.
  - Y el escape no funciona ahí: `content="… @@import …"` llega al navegador como `@@import`, con
    las dos arrobas. En el cuerpo de la página, `href="…/At-rules/@@font-face"` sí sale como
    `@font-face`. En el `<head>` no hay forma de escribir una `@` literal con la sintaxis del
    lenguaje.
- **Cómo se resolvió en la web.** Con la entidad HTML: `&#64;import`, `&#64;sheet`.
- **Qué debería hacer.** Que `@@` sea `@` en cualquier atributo, también en el `<head>`. Que una
  palabra reservada tras `@` (`@import`, `@class`, `@new`…) sea un diagnóstico con código y span
  en el `.fud`, como ya lo es `@sheet` con `FUD0907`, en vez de un error de Oxc sobre el código
  generado.

## 12. El arranque en Node del ejemplo sirve la página de error en vez de un fichero estático

- **Qué pasó.** Al documentar el servidor (capítulo 5). Comprobado cargando la app construida.
  - `examples/basic/node-server.mjs` y el ejemplo de `packages/server/README.md` montan
    `nodeMiddleware(…, { notFound: true })` **delante** de `staticFiles`.
  - `notFound` pinta un `404` para todo `GET` cuyo `Accept` incluya `text/html`
    (`packages/server/src/server.ts:311-319`).
  - Por eso una navegación directa a un fichero (`/logo.svg` o `/fudic-routes.json` abiertos en una
    pestaña) recibe la página de error. Un `<img>` o un `<script>` no lo notan, porque no piden HTML.
  - La opción está documentada para «el último middleware de la cadena, después de los ficheros del
    host» (`packages/server/src/node/index.ts:180-184`), y la preview lo hace bien
    (`packages/vite/src/plugin.ts:1268-1272`).
- **Cómo se resolvió en la web.** La página «El servidor» explica las piezas y el orden correcto
  (la app, los ficheros, la página de error), sin copiar el código del ejemplo.
- **Qué debería hacer.** Corregir el orden en el ejemplo y en el README. Mejor aún, una función de
  `@fudic/server/node` que monte las tres piezas en su orden, para que nadie tenga que acertarlo.

## 13. Los diagnósticos de `sw.json` no salen nunca

- **Qué pasó.** Leído en el código al documentar el Service Worker (capítulo 7); no reproducido.
  - `packages/vite/src/plugin.ts:926` se queda con `readSwConfig(…).config` y tira sus
    `.diagnostics`, y nadie más llama a `readSwConfig`.
  - Un `sw.json` mal escrito deja la app sin Service Worker sin decir nada (`FUD0390`).
  - Un `ttl` que no se entiende descarta su recurso en silencio (`FUD0392`).
- **Cómo se resolvió en la web.** La página «Configuración» lista los diagnósticos como deberían
  salir.
- **Qué debería hacer.** Reportarlos en el build y en dev, como los del resto de ficheros de la app.

## 14. El HTML de `page persist` no caduca nunca

- **Qué pasó.** Leído en el código (capítulo 7); no reproducido.
  - La regla es que una ruta no tiene dos TTL: con `page persist`, el HTML caduca con sus datos
    (`FUD0396`, `packages/vite/src/manifest.ts:99-109`).
  - Pero `servePage` (`packages/transport/src/router.ts:272-280`) sirve desde su índice sin mirar la
    frescura, y nada en `transport/src` lee `page.ttl`.
  - El HTML guardado solo desaparece al invalidar o con un despliegue nuevo.
- **Cómo se resolvió en la web.** La página «Datos y páginas en caché» cuenta la regla como está
  diseñada.
- **Qué debería hacer.** Comprobar la edad del HTML guardado contra `page.ttl` antes de servirlo.

## 15. `"dev": "preview"` registra el Service Worker, pero nunca pinta

- **Qué pasó.** Leído en el código (capítulo 7); no reproducido.
  - El manifiesto de desarrollo marca todas las rutas como `ssr` y sin `deps`
    (`packages/vite/src/dev.ts:94`), y el middleware de desarrollo no sirve `/sw/c/*`.
  - Con `"dev": "preview"`, el Service Worker se registra y deja pasar todas las navegaciones.
  - Lo mismo para el banco de trabajo, que fuerza `preview` (`plugin.ts:929`).
- **Cómo se resolvió en la web.** La página «Configuración» describe `preview` como lo que promete.
- **Qué debería hacer.** Lo que dice SDD-20 §4.11: en `preview`, rutas `sw` y chunks servidos en dev.

## 16. `paramFallback: 'notFound'` solo lo respeta el Service Worker

- **Qué pasó.** Leído en el código (capítulo 6); no reproducido.
  - El pase edge construye toda ruta no excluida (`packages/vite/src/edge.ts:196`).
  - El servidor pinta cualquier valor sin fichero prerenderizado
    (`packages/server/src/server.ts:229-240`).
  - Con `notFound`, un slug que `paths` no dio sigue pintándose bajo demanda en el servidor; solo
    el Service Worker se niega.
- **Cómo se resolvió en la web.** «Los modos» solo cuenta el comportamiento por defecto (`lazy`) y
  remite la opción al capítulo del plugin de Vite.
- **Qué debería hacer.** Que el servidor responda `404` para un valor fuera de `paths` cuando la
  opción lo pide.

## 17. Sin red, unos datos que no llegan marcan la ruta como rota hasta reiniciar

- **Qué pasó.** Leído en el código (capítulo 7); no reproducido.
  - Si `stores.data.get` rechaza (sin conexión, con `network-first` o `network-only` y sin copia),
    no es un `DataUnavailable`.
  - La ruta queda marcada como muerta hasta que el Service Worker se reinicia, y la respuesta sale
    con `x-fudic-fallback: link-error` (`packages/transport/src/router.ts:361-374`).
  - El rescate por la red también falla, porque no hay conexión.
- **Qué debería hacer.** Distinguir un fallo de datos de uno de enlace: el primero no debe matar la
  ruta.

## 18. `network-only` guarda igualmente las respuestas `200`

- **Qué pasó.** Leído en el código (capítulo 7).
  - `fromNetwork` guarda toda respuesta `200` no privada (`packages/transport/src/store.ts:211-213`),
    también la de `network-only`.
  - La copia no se lee nunca, pero ocupa espacio, y la guía del MCP dice «nunca se guarda».
  - SDD-69 §1 lo señaló, y solo se arregló el caso privado.
- **Qué debería hacer.** No escribir en la caché con `network-only`.

## 19. Una opción cualquiera en la línea de `load` anula los `defaults` del plugin

- **Qué pasó.** Leído en el código (capítulo 6).
  - `strategyOfLoad` cuenta cualquier opción como «declarada» (`packages/vite/src/strategy.ts:158`).
  - Un `load ttl 5m`, sin modo, hace que la ruta ignore su entrada de `defaults` y avise con
    `FUD0397`, aunque no declaró ningún modo (`mode.ts:99-110`).
  - Además, la opción `prerender` del plugin se resuelve (`options.ts:105`) y no la lee nadie.
- **Qué debería hacer.** Que solo un modo escrito cuente como declarado. Quitar `prerender` o hacer
  que funcione.

## 20. Los patrones de `sw.json` llevan el `base`, y la plantilla de `g app` no

- **Qué pasó.** Leído en el código (capítulo 7).
  - El router compara el patrón con la ruta entera, con el `base`
    (`packages/transport/src/router.ts:387-394`). Así lo hace
    `examples/workspace/apps/admin/sw.json` (`/admin/assets/**`).
  - La guía del MCP (`packages/mcp/guide/config.md:53`) dice que se escriben sin `base`.
  - `fudic g app`, cuyo `base` por defecto es `/<nombre>/`, escribe `"/assets/**"`
    (`packages/cli/src/plans/scaffold.ts:207`), que en esa app no casa con nada.
- **Cómo se resolvió en la web.** La página «Configuración» cuenta lo que hace el router: con `base`.
- **Qué debería hacer.** Decidir una regla. Sin `base` sería coherente con `assets.headers`, que va
  «by path without the base».

## 21. `paths` solo admite textos en su tipo, aunque el prerender acepta objetos

- **Qué pasó.** Leído en el código (capítulo 6).
  - El prerender acepta en `paths` un texto para una ruta de un parámetro, o un objeto por nombre
    para varias (`packages/vite/src/prerender.ts:160-186`).
  - El tipo que genera el `.fudapi` es `() => readonly string[]`
    (`packages/api/src/emit/declarations.ts:208`).
  - Una ruta como `[lang]/docs/[page]` no puede enumerar sus valores sin saltarse el tipo.
- **Cómo se resolvió en la web.** «Los datos de la página» enseña `paths` con un solo parámetro.
- **Qué debería hacer.** Generar el tipo según los parámetros de la ruta: `string[]` con uno, y
  objetos con sus nombres con varios.

## 22. Textos de diagnósticos desfasados

- **Qué pasó.** Al contrastar los diagnósticos con el código (capítulos 5 a 7):
  - `FUD0397` y `FUD0398` hablan de `strategy()` y `paths()`, que ya no existen: el modo va en la
    línea de `load` y `paths` es una declaración del `.fudapi`. Además, `FUD0398` dice que la ruta
    «se pinta en el Service Worker», cuando sin Service Worker pasa a `ssr`.
  - `FUD1340` pone de ejemplo `on date i64`, y `i64` no es un tipo (da `FUD1080`).
  - `FUD1097` dice que una regla necesita `runs both` o `runs server`, y no cita `runs remote`.
  - El comentario de `packages/transport/src/bootstrap.ts:28` cita `FUD0721`, que hoy es `FUD0726`.
- **Qué debería hacer.** Actualizar los `.md` y los mensajes.

## 23. Nombres de parámetro y palabras clave en el `.fudapi`

- **Qué pasó.** Comprobado con el validador (capítulo 5):
  - Un parámetro de middleware en kebab-case (`per-minute  u16`) da en la declaración un `FUD1065`
    («no es válido aquí»), que no dice por qué. En el `use`, el mismo nombre da `FUD1070`, que sí lo
    explica.
  - Un argumento llamado como una cláusula (`use  str`) se lee como la cláusula y da
    `FUD1080 unknown middleware 'str'`, en vez del `FUD1076` que promete SDD-60 §3.1.
- **Cómo se resolvió en la web.** «Middlewares y cadena» dice que los parámetros van en camelCase.
- **Qué debería hacer.** `FUD1070` también en la declaración, y `FUD1076` para un argumento que se
  llama como una cláusula.

## 24. SDD con texto superado y sin nota de corrección

- **Qué pasó.** Al documentar los capítulos 5 a 7, varios SDD dicen lo contrario que el código y no
  llevan la nota «Corregido por…»:
  - SDD-56 §3.1 y §3.5: la API de builders (`put().use().handle`), y un `data` de `_error.fud` sin
    `path`, `back` ni `home`.
  - SDD-60 §3.2, §3.7, §3.8 y §3.10: no hay `file`, solo `runs both|server`, un middleware sin
    mitades es un error y hay seis reglas de serie. Hoy son ocho, y `csrf` tiene `token`.
  - SDD-68 §3.1, §4.2 y §4.5: `run()` devuelve `R | undefined`; hoy devuelve `TaskResult`.
  - SDD-68 §4.8 da a entender que toda mutación refresca la página. Solo lo hacen las rutas de
    `invalidates`.
  - SDD-69 §4.1: `Secure` se quita en `localhost`. Hoy lo decide `secureCookies`, nunca el `Host`.
  - SDD-20 §3 y §4.2: el manifiesto ya no lleva `chunk`, `data`, `html` ni `csp`, y las cachés
    llevan el id de la app.
- **Qué debería hacer.** Anotar cada uno con la SDD que lo corrige, como ya se hace en otros.
