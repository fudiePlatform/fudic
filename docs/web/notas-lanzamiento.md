# Notas para el lanzamiento

Lo que se habló el 2026-11-19, al investigar por qué la documentación daba 92 en Lighthouse:
cómo se explica Fudic, dónde está el riesgo de verdad y qué falta antes de lanzarlo.

> **Lo que aprendes con Fudic es la web, no Fudic.**

## 1. Qué es Fudic, en una frase

**HTML y CSS estándar, sin inventos, y Razor adaptado a TypeScript como lenguaje de las vistas.**

- Todo lo que no es la sintaxis de las vistas es la plataforma: HTML, CSS, Declarative Shadow
  DOM, adopted stylesheets, módulos ES, CSP. Quien aprende eso con Fudic se lo lleva a cualquier
  sitio. Con React se aprende React; con Angular, Angular.
- La única pieza propia es la sintaxis de las vistas, y es la más fácil de leer que hay.

### Por qué Razor

Pedro lo conoció en 2008 y sigue siendo, para él, la sintaxis más clara de cualquier framework.
Después vinieron AngularJS, Angular, JSX y Svelte. El resto obliga a elegir bando:

| Enfoque | Qué hace | El precio |
|---|---|---|
| **JSX** (React, y lo heredan Solid y Qwik) | Mete el HTML dentro del código. | El control de flujo se vuelve expresiones: `map`, ternarios, `&&`. Leer una vista es leer JavaScript que devuelve HTML. |
| **Angular, Vue** | Meten el código dentro del HTML. | Directivas en atributos (`*ngFor`, `v-if`) con su propio mini-lenguaje. Angular acabó acercándose a Razor con `@if`/`@for`. |
| **Svelte** | Un tercer lenguaje entre los dos. | `{#if}…{/if}`: cierre obligatorio en toda estructura de control. |
| **Razor** | No elige bando. | El código es código, el markup es markup, y el parser infiere la frontera. |

Un `@if` con llaves es un `if` de verdad, y dentro se escribe HTML sin ceremonia. No hay un
tercer lenguaje que aprender.

### La contrapartida

La sencillez de Razor para quien escribe **se paga en el parser**. Que infiera la frontera entre
código y markup es lo que hace bonita la sintaxis, y es también lo que hizo que
`href="@web/guide/…"` se leyera como código (hallazgo nº 3 de Fudic). ASP.NET tardó años en
pulirlo: correos detectados por el carácter de antes de la `@`, `@@`, `@:`, `<text>`. En
TypeScript hay además un frente que C# no tenía: `<` es genérico, comparación y etiqueta.

No es un argumento contra la elección: el núcleo es sencillo para el usuario precisamente porque
el compilador absorbe la complejidad. El trabajo sobre las `@` es la parte que hace que Razor
parezca sencillo.

## 2. El riesgo no está en el núcleo, está en los bordes

- **El núcleo** (compilador, renderizado, hidratación) es lo que Pedro controla: un sistema
  cerrado, con fixtures, tests y cobertura al 100 %. Sus fallos los encuentra él, antes que
  nadie.
- **Los bordes** son donde Fudic toca lo que nadie controla: el contenido que escribe la gente,
  el repo donde instala, el hosting donde publica. Las combinaciones no tienen fin y ningún
  fixture las cubre. Sus fallos los encuentra el usuario, y los encuentra primero.

No es dificultad técnica (cada solución está clara). Es **dónde se juzga el framework y quién
descubre los fallos**.

### Los primeros 30 minutos de quien evalúa

Nadie lee el compilador. Se hacen tres cosas, en este orden:

1. **Instalarlo en su repo**, no en una carpeta vacía: un monorepo con Nx, Turborepo o sus
   propias convenciones. *Borde de la CLI.* Si el primer comando escribe en otro proyecto o
   revienta por una carpeta ajena, la evaluación acaba ahí, antes de ver el DSD. Hallazgos 2, 5,
   6 y 8 de la CLI: una sola causa de fondo, la CLI no sabe vivir en un monorepo que no creó.
2. **Escribir su contenido**: un correo, un `@angular/core` citado, un `@media`, un usuario de
   redes. *Borde de la sintaxis.* Lo grave no es la colisión sino el mensaje: «web is not
   defined» no dice «esa `@` la he leído como código». El usuario concluye que el framework es
   frágil.
3. **Publicar y pasar Lighthouse.** *Último tramo.* Si Fudic promete rendimiento por estándares
   y la primera medición da 92, la promesa queda desmentida, aunque la culpa sea de unas fuentes o
   de un servidor sin compresión. Quien evalúa mide lo que el framework le dio.

**El núcleo es por qué alguien se queda; los bordes deciden si llega a verlo.**

### Riesgo, no deuda

Deuda es lo que se sabe y se paga cuando toca: el refactor del plugin y de la hidratación, o las
`@` en los `<link>`, son otra fase y están asumidos. Riesgo es lo que puede sorprender: los
hallazgos se conocen porque la web los ha sacado, pero habrá otros que solo aparecerán en el repo
o con el contenido de otro.

**Construir la web con la propia CLI es la forma de llegar a los bordes antes que los usuarios.**
No es solo una web: es el banco de pruebas del borde. En una mañana sacó problemas reales que
ningún test unitario habría encontrado.

### Qué hacer con eso

- La web sigue siendo el filtro: ningún hallazgo se apaña en la web sin dejarlo anotado.
- **Antes de anunciar Fudic, repetir el recorrido de un desconocido:** instalar en un repo
  ajeno, escribir contenido con `@`, publicar en un hosting estándar y medir.

## 3. Qué se hace antes del lanzamiento

1. **Compresión en la preview** (hallazgo nº 1 de Fudic). Solo en la preview, para que medir en
   local refleje producción. **No precomprimir en la build**: la compresión es del transporte y
   la hace el hosting (en Cloudflare, un clic; brotli y zstd sin que el framework haga nada).
   Precomprimir sería un no acabar: hoy `.br` y `.gz`, mañana zstd.
2. **Una web font instalada por la guía, explicada en el capítulo 9** (*Estilos y
   rendimiento*). Orden:
   1. Primero el hallazgo nº 4: que la guía declare su fuente crítica en `fudic.json` y Fudic
      escriba el `preload` y su Early Hint. Si no, el capítulo enseñaría el `preload` a mano con
      la ruta relativa del nº 3, justo lo que nadie debería copiar.
   2. Después el capítulo, con los números reales de abajo como ejemplo. Debe explicar:
      - por qué `font-display: swap` no basta para Lighthouse;
      - qué es recortar el eje de peso y el juego de caracteres, y qué hace `unicode-range`;
      - por qué el fallback con `size-adjust` deja el CLS en 0;
      - cuándo compensa directamente la fuente del sistema.
   3. Si la CLI instala fuentes, que automatice el recorte con fontTools que hoy documenta
      `web/libs/guide/README.md`.
3. **Volver a medir** con la preview comprimida y la fuente instalada por la guía: el 100 tiene
   que salir sin proxy ni apaños.

## 4. Los números de Lighthouse

Lighthouse 12.8.2 en local, contra las previews de producción. Referencia:
`examples/basic/hidratacion` con `preview:nosw`, que da 100 en móvil (FCP 1,2 s, LCP 1,5 s) y en
escritorio.

`/docs/getting-started` en móvil, factor a factor:

| Variante | Nota | FCP | LCP |
|---|---|---|---|
| Cuatro fuentes (192 KB), sin compresión | 92 | 2,6 s | 2,7 s |
| Bloqueando **todo** el JS | 92 | 2,6 s | 2,7 s |
| Solo brotli | 95 | 2,4 s | 2,5 s |
| Brotli, sin la italic | 97 | 2,1 s | 2,2 s |
| Brotli, solo la fuente del cuerpo (45 KB) | 98 | 1,8 s | 1,9 s |
| Sin fuentes, sin compresión | 99 | 1,5 s | 1,6 s |
| Sin fuentes, brotli | 100 | 1,4 s | 1,4 s |
| **Una fuente recortada (23 KB) con preload** | **99** | 1,4 s | 1,7 s |
| **Lo mismo, con brotli** | **100** | 1,2 s | 1,5 s |

Lo que enseñan:

- **El JS no pesa:** bloquearlo entero no cambia nada.
- **Las fuentes eran el factor principal:** cada fichero de ~50 KB costaba unos 0,3 s de FCP en
  la simulación de móvil.
- **La compresión es el último punto.**
- **El CLS de 0,001 venía del cambio de fuente:** con una sola fuente y su fallback métrico, 0.
- En escritorio la página ya daba 100: la red simulada es rápida.

Cómo medirlo otra vez: Lighthouse instalado aparte (`npm i lighthouse`), la app servida con
`vite preview`, y cada factor aislado con `--blocked-url-patterns` o con un proxy brotli delante.

## 5. Lo que está bien y lo que queda

**Lo que ya convence:**

- La salida: HTML con DSD que se pinta sin JS, hidratación por componente en módulos de ~1 KB,
  TBT 0 en todas las mediciones.
- Seguridad por defecto: CSP con nonce y `strict-dynamic`, Trusted Types, COOP y HSTS desde
  `fudic new`.
- Decisiones medidas y escritas en el código: sin `modulepreload` cuando hay Service Worker,
  nombres de assets por contenido para que coincidan las tres pasadas del build, fallbacks de
  fuente con métricas Capsize.
- Diagnósticos con código, ficha y enlace; la build falla si una página no se prerenderiza.

**Lo que queda, ya asumido:**

- Las `@` en los `href` de `<link>`, y que `@@` produzca `@` (fase de la gramática).
- La CLI dentro de un monorepo ajeno (hallazgos 2, 5, 6 y 8 de la CLI): un arreglo de fondo, no
  cuatro parches.
- El refactor del plugin de Vite (`plugin.ts` pasa de 2.300 líneas; cada `.fud` se compila en
  tres pasadas) y de la hidratación: otra fase.
- El peso del DSD: el markup de cada componente va en cada página (29 shadow roots y 38,7 KB de
  HTML en la de docs, 9 KB comprimido). Vigilarlo con una página grande de verdad.
