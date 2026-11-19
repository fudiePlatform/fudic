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
