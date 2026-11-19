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
