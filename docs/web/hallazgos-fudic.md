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

- **Vuelto a comprobar (capítulo 11, Rendimiento).** El falso positivo de `FUD1552` del punto 3
  sigue saliendo en cada `pnpm build` de `web/apps/site` (worktree `web-publica`). Pedro no lo ve
  con build y preview en su copia: falta reproducirlo allí para saber qué lo dispara aquí. Se
  apuntó por error como nº 28.

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

- **Vuelto a comprobar (capítulo 13, Pruebas).** Sigue igual, y ahora un criterio lo caza: en
  `app-tabs` de `examples/basic`, `aria-selected=@(active() === 1)` pinta `aria-selected=""`, y
  `attribute role:tab/"Tab B" aria-selected "true"` falla con `actual aria-selected=""`. Con el
  ternario pasa en verde, y así lo escribe la página «El workbench». Se apuntó por error como nº 29.

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
- **Qué debería hacer.** Que `@@` sea `@` en cualquier atributo, también en el `<head>` (la misma
  raíz que la segunda parte del nº 3, con un `href` del `<head>` de un layout). Que una
  palabra reservada tras `@` (`@import`, `@class`, `@new`…) sea un diagnóstico con código y span
  en el `.fud`, como ya lo es `@sheet` con `FUD0907`, en vez de un error de Oxc sobre el código
  generado.

## 12. El arranque en Node del ejemplo sirve la página de error en vez de un fichero estático

- **Qué pasó.** Al documentar el capítulo Servidor y datos. Comprobado cargando la app construida.
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

- **Qué pasó.** Leído en el código al documentar el capítulo Service Worker; no reproducido.
  - `packages/vite/src/plugin.ts:926` se queda con `readSwConfig(…).config` y tira sus
    `.diagnostics`, y nadie más llama a `readSwConfig`.
  - Un `sw.json` mal escrito deja la app sin Service Worker sin decir nada (`FUD0390`).
  - Un `ttl` que no se entiende descarta su recurso en silencio (`FUD0392`).
- **Cómo se resolvió en la web.** La página «Configuración» lista los diagnósticos como deberían
  salir.
- **Qué debería hacer.** Reportarlos en el build y en dev, como los del resto de ficheros de la app.

## 14. El HTML de `page persist` no caduca nunca

- **Qué pasó.** Leído en el código (capítulo Service Worker); no reproducido.
  - La regla es que una ruta no tiene dos TTL: con `page persist`, el HTML caduca con sus datos
    (`FUD0396`, `packages/vite/src/manifest.ts:99-109`).
  - Pero `servePage` (`packages/transport/src/router.ts:272-280`) sirve desde su índice sin mirar la
    frescura, y nada en `transport/src` lee `page.ttl`.
  - El HTML guardado solo desaparece al invalidar o con un despliegue nuevo.
- **Cómo se resolvió en la web.** La página «Datos y páginas en caché» cuenta la regla como está
  diseñada.
- **Qué debería hacer.** Comprobar la edad del HTML guardado contra `page.ttl` antes de servirlo.

## 15. `"dev": "preview"` registra el Service Worker, pero nunca pinta

- **Qué pasó.** Leído en el código (capítulo Service Worker); no reproducido.
  - El manifiesto de desarrollo marca todas las rutas como `ssr` y sin `deps`
    (`packages/vite/src/dev.ts:94`), y el middleware de desarrollo no sirve `/sw/c/*`.
  - Con `"dev": "preview"`, el Service Worker se registra y deja pasar todas las navegaciones.
  - Lo mismo para el banco de trabajo, que fuerza `preview` (`plugin.ts:929`).
- **Cómo se resolvió en la web.** La página «Configuración» describe `preview` como lo que promete.
- **Qué debería hacer.** Lo que dice SDD-20 §4.11: en `preview`, rutas `sw` y chunks servidos en dev.

## 16. `paramFallback: 'notFound'` solo lo respeta el Service Worker

- **Qué pasó.** Leído en el código (capítulo Páginas y rutas); no reproducido.
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

- **Qué pasó.** Leído en el código (capítulo Service Worker); no reproducido.
  - Si `stores.data.get` rechaza (sin conexión, con `network-first` o `network-only` y sin copia),
    no es un `DataUnavailable`.
  - La ruta queda marcada como muerta hasta que el Service Worker se reinicia, y la respuesta sale
    con `x-fudic-fallback: link-error` (`packages/transport/src/router.ts:361-374`).
  - El rescate por la red también falla, porque no hay conexión.
- **Qué debería hacer.** Distinguir un fallo de datos de uno de enlace: el primero no debe matar la
  ruta.

## 18. `network-only` guarda igualmente las respuestas `200`

- **Qué pasó.** Leído en el código (capítulo Service Worker).
  - `fromNetwork` guarda toda respuesta `200` no privada (`packages/transport/src/store.ts:211-213`),
    también la de `network-only`.
  - La copia no se lee nunca, pero ocupa espacio, y la guía del MCP dice «nunca se guarda».
  - SDD-69 §1 lo señaló, y solo se arregló el caso privado.
- **Qué debería hacer.** No escribir en la caché con `network-only`.

## 19. Una opción cualquiera en la línea de `load` anula los `defaults` del plugin

- **Qué pasó.** Leído en el código (capítulo Páginas y rutas).
  - `strategyOfLoad` cuenta cualquier opción como «declarada» (`packages/vite/src/strategy.ts:158`).
  - Un `load ttl 5m`, sin modo, hace que la ruta ignore su entrada de `defaults` y avise con
    `FUD0397`, aunque no declaró ningún modo (`mode.ts:99-110`).
  - Además, la opción `prerender` del plugin se resuelve (`options.ts:105`) y no la lee nadie.
- **Qué debería hacer.** Que solo un modo escrito cuente como declarado. Quitar `prerender` o hacer
  que funcione.

## 20. Los patrones de `sw.json` llevan el `base`, y la plantilla de `g app` no

- **Qué pasó.** Leído en el código (capítulo Service Worker).
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

- **Qué pasó.** Leído en el código (capítulo Páginas y rutas).
  - El prerender acepta en `paths` un texto para una ruta de un parámetro, o un objeto por nombre
    para varias (`packages/vite/src/prerender.ts:160-186`).
  - El tipo que genera el `.fudapi` es `() => readonly string[]`
    (`packages/api/src/emit/declarations.ts:208`).
  - Una ruta como `[lang]/docs/[page]` no puede enumerar sus valores sin saltarse el tipo.
- **Cómo se resolvió en la web.** «Los datos de la página» enseña `paths` con un solo parámetro.
- **Qué debería hacer.** Generar el tipo según los parámetros de la ruta: `string[]` con uno, y
  objetos con sus nombres con varios.

## 22. Textos de diagnósticos desfasados

- **Qué pasó.** Al contrastar los diagnósticos con el código (Servidor y datos, Páginas y rutas, Service Worker):
  - `FUD0397` y `FUD0398` hablan de `strategy()` y `paths()`, que ya no existen: el modo va en la
    línea de `load` y `paths` es una declaración del `.fudapi`. Además, `FUD0398` dice que la ruta
    «se pinta en el Service Worker», cuando sin Service Worker pasa a `ssr`.
  - `FUD1340` pone de ejemplo `on date i64`, y `i64` no es un tipo (da `FUD1080`).
  - `FUD1097` dice que una regla necesita `runs both` o `runs server`, y no cita `runs remote`.
  - El comentario de `packages/transport/src/bootstrap.ts:28` cita `FUD0721`, que hoy es `FUD0726`.
- **Vuelto a comprobar** el 2026-11-23, con el capítulo Plugin de Vite. Todo lo que aún habla de
  `strategy()`, para no tener que buscarlo otra vez:
  - `FUD0397` y `FUD0398` lo dicen también en el mensaje, no solo en el `.md`
    (`FUD0397.ts:6`, `FUD0398.ts:6`), y en el título de `catalog.generated.ts:81`.
  - `FUD0392`, que faltaba: el `.md` habla del `ttl` «in `strategy()`», y el mensaje y su variante
    se llaman `strategy().data.ttl` y `where: 'strategy'` (`FUD0392.ts:8,9,29`). Hoy el `ttl` va en
    la línea de `load`.
  - `FUD0393` y `FUD0394` están retirados y lo explican: esos están bien.
  - Comentarios de `@fudic/vite`: `mode.ts:8`, `options.ts:17` y `swconfig.ts:4`.
  - `@fudic/core` sigue exportando `strategy()` y sus tipos (`packages/core/src/strategy.ts`,
    `index.ts:62`), y el comentario de `element.ts:39` lo cita. Nadie lo lee ya: es API pública
    muerta.
  - El README de `@fudic/vite` contaba `strategy()`, la región `@server` y la opción `routes`.
    Este quedó arreglado en el mismo commit del capítulo.
- **Qué debería hacer.** Actualizar los `.md` y los mensajes. Quitar `strategy()` de
  `@fudic/core` o marcarlo como retirado.
- **Vuelto a comprobar (Referencia), el 2026-11-23.** Sigue igual. Además, el TSDoc de
  `StrategyDecl.page` dice que no tiene `ttl` propio y el tipo lo tiene (`strategy.ts:24`), y
  `RouteMode` y `CachePolicy` están repetidos en `@fudic/transport`, de donde los toma el plugin.
  La referencia de `@fudic/core` no documenta `strategy()`.

## 23. Nombres de parámetro y palabras clave en el `.fudapi`

- **Qué pasó.** Comprobado con el validador (capítulo Servidor y datos):
  - Un parámetro de middleware en kebab-case (`per-minute  u16`) da en la declaración un `FUD1065`
    («no es válido aquí»), que no dice por qué. En el `use`, el mismo nombre da `FUD1070`, que sí lo
    explica.
  - Un argumento llamado como una cláusula (`use  str`) se lee como la cláusula y da
    `FUD1080 unknown middleware 'str'`, en vez del `FUD1076` que promete SDD-60 §3.1.
- **Cómo se resolvió en la web.** «Middlewares y cadena» dice que los parámetros van en camelCase.
- **Qué debería hacer.** `FUD1070` también en la declaración, y `FUD1076` para un argumento que se
  llama como una cláusula.

## 24. SDD con texto superado y sin nota de corrección

- **Qué pasó.** Al documentar Servidor y datos, Páginas y rutas y Service Worker, varios SDD dicen lo contrario que el código y no
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

## 25. Un control-componente entrega a un `<form>` ajeno el valor convertido en texto

- **Qué pasó.** Revisando `FudicControlElement` (capítulo Formularios): `#wire` hace
  `internals.setFormValue(String(value))` con cualquier valor del control
  (`packages/forms/src/element.ts`). Un `<form>` que no es de Fudic, con un `app-input` para un
  campo `file`, recibe en su `FormData` el texto `"[object File]"` en vez del fichero. Un `str[]`
  llega como `"a,b"` en una sola entrada, y un `bool` en `false` envía `"false"`, cuando una casilla
  nativa sin marcar no envía nada.
- **Qué debería hacer.** Lo que admite `setFormValue`: el `File` tal cual, un `FormData` con una
  entrada por elemento para las listas, y `null` para un `bool` en `false`.

## 26. Un formulario con `form:=` no envía nada sin JavaScript

- **Qué pasó.** El `<form>` de `/entrar` sale del servidor como `<form novalidate="">`, y sus
  campos sin `name` (`examples/basic/dist/entrar/index.html`). Sin JavaScript, enviarlo hace un
  `GET` a la misma página sin ningún dato. El formulario se lee y es accesible sin JavaScript, pero
  solo funciona con él.
- **Cómo se resolvió en la web.** La página «Enviar al servidor» lo dice tal cual.
- **Qué debería hacer.** Decidir si `form:=` debe tener un respaldo sin JavaScript (`method`,
  `action` hacia la función y `name` en cada campo) o documentar que no lo tiene.

## 27. Textos desfasados en `/formularios` y en el README de `@fudic/forms`

- **Qué pasó.** `examples/basic/src/routes/formularios.fud` dice que el formulario «vive en su
  propio `.ts`» (hoy es un `.fudapi`), cita `Validity.Interacted` y `Validity.Rules` (hoy
  `validity interacted | rules`) y se titula «5 · Formularios». El README de `@fudic/forms` habla de
  las reglas de un grupo como «its second argument», del API de builders que ya no es pública.
- **Qué debería hacer.** Ponerlos al día con el `.fudapi`.

## 28. ~~`FUD1552` sobre el runtime, que lleva la versión en la URL~~ (duplicado del nº 5)

Es el punto 3 del nº 5. Lo que añadía, que en la copia de Pedro no sale, está allí, en «Vuelto a
comprobar». El número se conserva porque el registro de `README.md` lo cita.

## 29. ~~Un booleano en un atributo `aria-*` sale vacío~~ (duplicado del nº 9)

Es el nº 9. La comprobación con un criterio del workbench está allí, en «Vuelto a comprobar».

## 30. `fudic spec`, `fudic test` y el workbench no apuntan nada en el `.fudlog`

- **Qué pasó.** El README de `@fudic/history` dice que el `.fudlog` guarda «every run of its tests
  and criteria», pero solo lo escriben las herramientas `fudic_test` y `fudic_spec_run` del servidor
  MCP (`packages/mcp/src/runs.ts`). Quien trabaja sin agente aprueba con `fudic approve`, pero
  `fudic history` le dirá siempre `tests not run · spec not run`.
- **Cómo se resolvió en la web.** «Historial y aprobación» dice que las ejecuciones las apunta el
  servidor MCP.
- **Qué debería hacer.** Que `fudic spec` y `fudic test` (y quizá el workbench, al ejecutar todos)
  apunten su ejecución, o decir en el README quién la apunta.

## 31. El workbench se queda con un `.fudspec` a medio escribir

- **Qué pasó.** Al reescribir `app-tabs.fudspec` con `cat > fichero` (que primero lo vacía y luego
  escribe), el workbench enseñó `FUD0922 the header is missing` y no volvió a ejecutar cuando el
  fichero quedó completo. Un `touch` después lo arregló. Un editor guarda de una vez, así que es raro
  que pase trabajando, pero sí con herramientas o agentes que escriben por partes.
- **Qué debería hacer.** Volver a leer el fichero tras el último evento del watcher, o esperar a que
  deje de cambiar antes de ejecutar.

## 32. La regla de `img` de la guía hace que Chrome avise de cada imagen con `loading="lazy"`

- **Qué pasó.** Al poner la captura del workbench (capítulo Pruebas), Chrome 157 da en DevTools
  `LazyLoadImageIssue` («specifies loading="lazy" without explicit width and height dimensions or
  aspect ratio styling»), aunque el `<img>` lleva `width="760" height="564"`. Aislado con páginas
  mínimas: lo provoca `height: auto` de `:where(img)` (`img.css` de la guía, la misma regla en la
  plantilla `packages/cli/templates/guide/img.css`). Sin esa línea no avisa, y sin `loading="lazy"`
  tampoco. Es un falso positivo: el navegador sí reserva el hueco (`aspect-ratio` calculado
  `auto 760 / 564`), así que no hay salto de layout. Pero cualquier app hecha con `fudic new` que
  use `loading="lazy"` verá el aviso.
- **Lo que no sirve.** `aspect-ratio: auto attr(width type(<number>)) / …` sigue avisando, y sin
  `auto` lo calla, pero `attr()` con tipo no está en Baseline (`FUD1526` en el build) y deforma una
  imagen cuyos atributos no sean su proporción real.
- **Cómo se resolvió en la web.** La imagen lleva `style="aspect-ratio: 760 / 564"`, además de
  `width` y `height`. Comprobado por el protocolo de DevTools: sin aviso.
- **Qué debería hacer.** Decidir. O el compilador escribe esa `aspect-ratio` en un `<img>` con
  `loading="lazy"` y `width`/`height` literales, o se documenta que Chrome avisa y no hay salto.
  Cuando `attr()` con tipo entre en Baseline, la guía puede ponerlo en `img.css`.

## 33. El snippet `load` del `.fudapi` ofrece un modo que no existe

- **Qué pasó.** Leído en el código (capítulo Editores). El snippet `load` ofrece a elegir
  `ssr`, `ssg` o `isr` (`packages/language-server/src/fudapi/snippets.ts:32`). `isr` no es un modo:
  los tres son `ssg`, `ssr` y `sw`. Elegirlo deja una línea de `load` que el parser rechaza. Es la
  única aparición de `isr` en los paquetes.
- **Qué debería hacer.** Ofrecer `ssg`, `ssr` y `sw`. Mejor aún, que no proponga ninguno por
  defecto, porque sin modo se deduce.

## 34. Quitar la orden «Fudic: Toggle Comment» de la extensión

- **Qué pasó.** La extensión registra `fudic.toggleComment` con `Ctrl+/` (`Cmd+/`) en un `.fud`,
  que escribe `@* … *@`. Comentar es estándar y la gente sabe hacerlo; el capítulo de la sintaxis
  ya explica cómo se comenta HTML, JS y CSS, y que `@* *@` es el comentario que no llega al
  navegador. Una orden propia para eso sobra. Decisión de Pedro, 2026-11-23: se quita.
- **Cómo se resolvió en la web.** Editores no la nombra; el README de la extensión, tampoco.
- **Qué hay que quitar.**
  - `packages/vscode/package.json`: la orden (línea 151) y su atajo (línea 186).
  - `packages/vscode/src/comment.ts` y `src/commands/comment.ts`, y su registro en
    `src/commands/index.ts`, `src/commands/deps.ts`, `src/extension.ts`, `src/ports.ts` y
    `src/vscode-shape.ts` (lo que solo exista para ella).
  - Sus tests: `test/comment.test.ts`, `test/commands/comment.test.ts` y lo que la nombra en
    `test/commands/commands.test.ts`, `test/commands/_deps.ts`, `test/extension.test.ts`,
    `test/manifest.test.ts`, `test/vscode-shape.test.ts` y `test/acceptance/criteria.test.ts`.
  - Comprobar que `language-configuration.json` sigue dando a `Ctrl+/` el comentario de VS Code.

## 35. Los diez tests end-to-end de `/ciclo` fallan

- **Qué pasó.** Al pasar a inglés `ciclo-demo` de `examples/basic` (2026-11-23), se ejecutó
  `tests/ciclo.spec.ts` tras `vite build` y el build sin Service Worker: fallan los diez, también
  con el código anterior al cambio (comprobado con `git stash`). Todos se paran en `open`
  (`tests/ciclo.spec.ts:36`): la ruta nunca escribe en el registro su `afterHydrate` ni su
  `onConnect`, y el registro sigue vacío a los 5 s. El test unitario de `ciclo-demo` (`mount`) sí
  pasa.
- **Qué debería hacer.** Averiguar por qué la ruta `/ciclo` no hidrata al cargar en la preview
  (su `effect` de nivel superior), o, si cambió a propósito, poner al día el test.

## 36. `fudic spec` no ejecuta nada en `examples/basic`

- **Qué pasó.** En `examples/basic`, `fudic spec` responde «no project here has a "spec" script —
  nothing to run» (2026-11-23). El `package.json` del ejemplo no tiene el script `spec`
  (`fudic-workbench run --pass-with-no-specs`) que sí deja `fudic new`. Con
  `pnpm exec fudic-workbench run` los 29 criterios pasan.
- **Qué debería hacer.** Añadir el script `spec` al ejemplo, para que se pruebe como cualquier app.

## 37. `load` no ve la query string de una página `ssr`

- **Qué pasó.** Al hacer la página de diagnósticos de Referencia (2026-11-23), una página
  `load ssr` que lee `ctx.url.searchParams.get('code')`. Con `/docs/reference/diagnostics?code=FUD0010`,
  `ctx.url` llega como `http://localhost/docs/reference/diagnostics`, sin la query: en la preview
  y en `visit` de `@fudic/testing`. `server.ts` pasa a `renderPage` solo el `pathname`, y
  `withRequest` monta la URL con él (`packages/server/src/render.ts`). Un test lo fija a
  propósito (`packages/server/test/server.test.ts`, «rendered as it comes»), con el comentario
  «`load` reads the query from `ctx.request`»; pero `request` no está en el tipo del `ctx` de
  `load` (`PageContext`, `ServerContext` de `@fudic/http`), así que solo se llega con un cast.
  `visit` también quita la query antes de pintar (`pathnameOf` en `packages/testing/src/visit.ts`).
- **Dónde lo dice la web.** Los datos de la página (`/docs/routing/data#ctx`): «Además de
  `params`, trae `url` (con su query string)».
- **Qué debería hacer.** Que `ctx.url` de `load` lleve la query de la petición, o que `request`
  esté en el tipo de su `ctx`.
- **Resuelto el 2026-11-23**, con el visto bueno de Pedro: `withRequest` toma la query de la
  petición cuando el contexto se hizo solo con la ruta, y `visit` pasa la query a la página. Un
  test en cada paquete; los dos siguen al 100 %. Lo que dice la web pasa a ser verdad.

## 38. TSDoc que no dice lo que hace el código

- **Qué pasó.** Al escribir la Referencia (2026-11-23), contrastando cada export con su código:
  - `date` (`packages/core/src/pipes/date.ts:3-5`) cita `FUD0912` para el `timeZone` obligatorio;
    `FUD0912` es «`now()` outside a signal's initializer». Ningún diagnóstico lo comprueba: solo el
    tipo.
  - `packages/core/src/tracking.ts` aún explica `sig.peek()`, que ya no existe (`signal.ts:8`).
  - `emit` (`packages/dom/src/emit.ts:9`) habla de un «`@client` compilado»; hoy vale en cualquier
    `@code` que lo importe.
  - `Task.progress` dice «`null` when no call is in flight» (`task.ts:77-80`); ver el hallazgo 39.
  - `Control.dirty` (`packages/forms/src/types.ts:63`) dice «differs from the initial one»; compara
    con el valor de partida, que mueven `$set` y `reset(v)` (`control.ts:136-141`).
  - `Validator` (`types.ts:149-157`) dice que lo escribe el autor; desde SDD-60 las reglas se
    declaran en el `.fudapi` y se implementan con `check`.
  - `token()` (`packages/di/src/token.ts:4`) dice que la identidad es el objeto y nunca el nombre;
    lo publicado con `publish` se guarda por nombre (`seed.ts:24`, `resolve.ts:126-130`), y dos
    tokens con el mismo nombre chocan.
  - `CookieOptions.secure` dice «true unless it said otherwise»: es así con `createServer`, pero
    `fudic dev` y `fudic preview` sin HTTPS lo ponen a `false` (`packages/vite/src/plugin.ts:584-591`).
- **Cómo se resolvió en la web.** La Referencia dice lo que hace el código.
- **Qué debería hacer.** Poner al día cada TSDoc.

## 39. `Task.progress` no vuelve a `null` al terminar una llamada

- **Qué pasó.** En `packages/core/src/task.ts`, solo `cancel()` o una llamada sustituida ponen
  `progress` a `null`. Al terminar una llamada, se queda con su último valor salvo que la propia
  función mande `onProgress(null)`, como hace la llamada de `@fudic/http` (`client/send.ts`). Una
  función propia que no lo haga deja la barra llena.
- **Cómo se resolvió en la web.** La Referencia dice «o `null`» sin precisar cuándo.
- **Qué debería hacer.** Ponerlo a `null` al terminar cualquier llamada, como dice su TSDoc.

## 40. El tipo `html` del `.fudapi` no se puede pintar como HTML

- **Qué pasó.** `html` sale en TypeScript como `TrustedHTML`, pero la marca de confianza es un
  símbolo y no viaja en el formato de los datos (`packages/dom/src/html.ts:16-20`): `@raw` lo
  escapa. `examples/basic/src/components/raw-demo.fud` lo enseña a propósito. No hay forma de pintar
  como HTML un contenido que llega del servidor, como un artículo de un CMS o un Markdown ya
  convertido.
- **Cómo se resolvió en la web.** `ref` y `@raw`, Trusted Types y Tipos decían que `@raw` pinta el
  HTML que llega del servidor, con el ejemplo de un CMS. Se corrigieron: la marca se pone en el
  `@code` y no viaja. La página de Diagnósticos parte el texto en trozos en vez de usar `@raw`.
- **Qué debería hacer.** Decidir si un campo `html` del contrato llega marcado, porque el servidor
  responde de él, o quitar el tipo y decir cómo se pinta HTML del servidor.

## 41. Tipos de `@fudic/forms` que se usan y no se exportan

- **Qué pasó.** `Progress`, el tipo de `$progress()`, y `Patch<S>`, el parámetro de `$patch`, no
  salen de `@fudic/forms` (`src/index.ts:34-57`): no se pueden nombrar. `ValidateOn`, `Validity` y
  `setMessages` solo salen de `./contract`, que es interno.
- **Qué debería hacer.** Exportar `Progress` y `Patch` desde la entrada pública.

## 42. `ClientStep` y `ServerStep` se exportan y nadie los usa

- **Qué pasó.** `@fudic/http` exporta `ClientStep` y `ServerStep` (`types.ts:41-47`), sin el
  tercer argumento con los parámetros del `use`. Las mitades de un middleware son `ClientHalf` y
  `ServerHalf` de `./contract`, y el módulo generado exporta `<Name>Client` y `<Name>Server`.
- **Cómo se resolvió en la web.** La Referencia recomienda `<Name>Server` y `<Name>Client`.
- **Qué debería hacer.** Quitarlos, o que sean los tipos de las mitades.

## 43. Detalles del `.fudapi`

- **Qué pasó.** Comprobado con el validador (Referencia, 2026-11-23):
  - `validate-on` o `validity` sin valor dan `FUD1063` (`packages/api/src/form.ts:53,70`), cuyo
    `.md` solo habla de una declaración sin nombre.
  - Un sufijo de tamaño vale en cualquier número: `max-length 80kb` es válido y vale 81920.
- **Qué debería hacer.** Un código propio, o ampliar el `.md` de `FUD1063`. Aceptar `kb`, `mb` y
  `gb` solo donde se espera un tamaño.

## 44. `destroy` de `@fudic/di` no alcanza a los hijos

- **Qué pasó.** `destroy(container)` vacía sus instancias y lo marca muerto, pero no a sus hijos.
  `inject()` y `publishIn` no miran si está vivo; solo `injectFrom` lanza
  (`packages/di/src/container.ts:89`, `resolve.ts`).
- **Qué debería hacer.** Que `destroy` llegue a los hijos, y que todas las entradas lo comprueben.

## 45. `selfTest` se exige y nadie lo ejecuta

- **Qué pasó.** Al escribir el capítulo Términos propios (2026-11-23). Un término del proyecto tiene
  que exportar `selfTest` (`FUD0946`, `packages/spec/src/term-module.ts:100`), pero ni el workbench,
  ni `fudic spec`, ni el editor lo ejecutan: solo se busca el nombre. Su forma (`[{ args, expect:
  'pass' }]`) solo sale en el README de `@fudic/terms`, en `examples/basic` y en la guía del MCP;
  ningún código la define. SDD-32 y SDD-59 dejan ejecutarlo fuera de alcance.
- **Cómo se resolvió en la web.** Cómo funciona un término dice que se exige y que hoy solo se
  comprueba que exista. La página propia que se había propuesto no se escribió.
- **Qué debería hacer.** Ejecutarlo (`fudic spec`, o el workbench al guardar el término) o dejar de
  exigirlo.

## 46. Detalles de los términos y del workbench

- **Qué pasó.** Al escribir el capítulo Términos propios (2026-11-23):
  - Guardar `fudic/bench.js` no vuelve a ejecutar nada (`packages/workbench/src/rerun.ts:31-38`):
    se lee en la siguiente recarga. Guardar un término sí, pero ejecuta todos los criterios abiertos,
    no solo los que lo usan.
  - Un `given` o un `when` que devuelve `pass: false` no hace fallar el criterio
    (`packages/workbench/src/engine.ts:466`): para pararlo, el término tiene que lanzar.
  - El comentario de `examples/basic/fudic/terms/given/route.js` dice que el workbench nunca
    navega; desde los criterios de página y de flujo, sí.
  - El README de `@fudic/terms` dice que el `ctx` «tiene cuatro cosas» y lista más.
- **Cómo se resolvió en la web.** Cómo funciona un término y Ampliar el `ctx` dicen lo que hace el
  código.
- **Qué debería hacer.** Volver a ejecutar al guardar `bench.js`; decidir si un `when` con
  `pass: false` debe parar el criterio; poner al día el comentario y el README.

## 47. Detalles del MCP, de una conversación real

- **Qué pasó.** Para la página «Una conversación de principio a fin» de la sección MCP
  (2026-11-23), un Claude Code nuevo construyó un botón con el MCP en un proyecto de prueba,
  instalado desde el Verdaccio local. La pieza llegó a `done`, pero:
  - **El diff de una aprobación caducada sale vacío** si los ficheros aprobados nunca se
    commitearon. `diffSince` (`packages/mcp/src/status.ts:86-89`) hace `git diff` contra el
    commit de la aprobación, y en ese commit los ficheros no existían. `next` pide igualmente
    «Show the user the diff in "expired"», y el agente tuvo que componer el diff él.
  - **`fudic_spec_run` en verde responde un `next` que habla de criterios.** Con `pass 9/9` y dos
    tests unitarios en rojo, `next` decía «Make the view of … pass these criteria. Do not change
    the .fudspec.» (`packages/mcp/src/runs.ts:270`). La pieza seguía en `view` por los tests, no
    por los criterios.
  - **Una ejecución parcial pasa por el estado de la pieza.** Tras ejecutar un solo criterio,
    `fudic_status` dice `spec: "fail 0/1"` para una pieza que tiene nueve.
  - **El agente no acordó los tokens con la persona**, aunque la guía (`workflow`) lo pide antes
    del primer componente: llamó a `fudic_symbols { kind: "tokens" }`, vio que la guía de estilos
    ya los tenía y los dio por buenos. `next` no lo recordó: su primer `fudic_status` apuntaba a
    los criterios de la ruta `/`, no a los tokens.
- **Cómo se resolvió en la web.** La página cuenta la conversación tal como fue, y «Cuando el
  modelo se desvía» usa el último punto como ejemplo.
- **Qué debería hacer.** Comparar con lo aprobado aunque no esté en git (o decir en `expired` que
  no hay diff y por qué); que el `next` de `fudic_spec_run` nombre lo que falta de verdad; decidir
  si una ejecución parcial cuenta para el estado; y que `next` pida acordar los tokens antes del
  primer componente si nadie los ha aprobado.

## 48. El aspecto aprobado no caduca al cambiar la guía de estilos

- **Qué pasó.** Al escribir «Aprobar, caducar y reabrir» de la sección MCP (2026-11-23), se
  calcularon con `lookFiles` (`packages/mcp/src/look-hash.ts:46-51`) los ficheros del aspecto de
  `<tienda-button>`, en el proyecto de la conversación grabada. Salen el `.fud`, el `.fudapi`, el
  fixture y `src/guide/base.css`, la única hoja de `globalStyles`. No salen `src/guide/tokens.css`
  ni `src/guide/button.css`, la pieza de la guía que el botón adopta. Cambiar un color de los
  tokens o la regla de `button` cambia cómo se ve el botón, y su aspecto aprobado sigue valiendo.
  - De paso: salen también `src/components/tienda-button/@fudic/terms` y `…/@fudic/testing`. Son
    los imports de paquete del fixture resueltos como rutas relativas; no existen y el hash los
    salta.
- **Cómo se resolvió en la web.** La página dice qué entra en el hash (la vista, lo que enlaza e
  importa, las hojas globales) sin prometer nada de los tokens.
- **Qué debería hacer.** Meter en el hash las piezas de la guía que el componente adopta
  (`shadowrootadoptedstylesheets`) y la hoja de tokens, y no resolver como ruta un import de
  paquete.

## 49. `fudic-mcp` solo encuentra el proyecto por la carpeta en la que arranca

- **Qué pasó.** Al escribir «Desde un agente» de la sección MCP (2026-11-24). `fudic-mcp` toma
  como proyecto su carpeta de trabajo (`main.ts`, `deps.cwd`) y no tiene una opción para darle
  otra. Codex, Gemini CLI y Antigravity documentan una clave `cwd`, pero en un fichero que se
  commitea obliga a escribir una ruta absoluta de una máquina. Cursor y Windsurf no documentan en
  qué carpeta arrancan un servidor. Claude Code tampoco: lo que garantiza es la variable
  `CLAUDE_PROJECT_DIR`, con la raíz del proyecto, en el entorno del servidor.
- **Cómo se resolvió en la web.** La página pone `cwd` donde existe, con la ruta del proyecto, y
  pide comprobar con `fudic_status` que `project.name` es el del proyecto.
- **Qué debería hacer.** Aceptar la carpeta del proyecto como argumento y, sin él, leer
  `CLAUDE_PROJECT_DIR` antes que la carpeta de trabajo. Y si en la carpeta no hay un proyecto, que
  `fudic_status` lo diga con la ruta que ha mirado.

