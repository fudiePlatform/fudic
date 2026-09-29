# Declarative CSS Modules

Estado de las propuestas para compartir hojas de estilo en Declarative Shadow DOM sin
JavaScript, y qué implica para el polyfill de fudic. Investigación a fecha **2026-09-29**.

## Qué hace fudic hoy

- La página emite cada hoja compartida como `<style type="module" specifier="<componente>">`,
  con `nonce` para cumplir la CSP (incluidos los temas de `fudic.json`).
- Un script bloqueante (el polyfill) recorre los componentes marcados con
  `data-fudic-adopt`, construye un `CSSStyleSheet`, llama a `replaceSync` y lo adopta.

## Cronología

| Fecha | Hito |
|---|---|
| 2021-08 | [WICG/webcomponents#939](https://github.com/WICG/webcomponents/issues/939) plantea el problema: DSD no puede compartir hojas sin script. |
| 2024-10 | [whatwg/html#10673](https://github.com/whatwg/html/issues/10673): Kurt Catti-Schmidt (Microsoft) propone `<style type="module" specifier>` + `shadowrootadoptedstylesheets`. |
| 2026-03 | [Intent to Experiment](http://www.mail-archive.com/blink-dev@chromium.org/msg16211.html): origin trial en Chrome/Edge 148–153 (feature `DeclarativeCSSModules`). Mozilla y WebKit sin señal. |
| 2026-06 | **Cambio incompatible en el trial**: desde la 151, `<style type="module">` sale del trial "para rediseñarlo". Solo queda `shadowrootadoptedstylesheets`. |
| 2026-08-05 | Houdini Task Force: *"RESOLVED: we should use `<link>` tag for this proposal."* Se abandona el atributo en `<template>`. |
| 2026-08-28 | [whatwg/html#12860](https://github.com/whatwg/html/pull/12860) (abierto): `<link rel="stylesheet" import="foo" href="fallback.css">`. Bugs abiertos en Chromium, Gecko y WebKit; solo Chromium ha mostrado interés. |
| 2026-09-10/14 | Lea Verou se opone al atributo `import` y pide `type=module` (también en `<style>`); queda abierto qué hace `@import` dentro de un módulo. **La sintaxis del `<link>` no está cerrada.** |

La prueba en Chrome 155 con flags experimentales (`shadowrootadoptedstylesheets` + import
map) cuadra con el estado del trial tras la 151: funciona, pero es justo la forma que se ha
descartado.

```html
<script type="importmap">
  { "imports": { "foo": "https://example.com/foo.css" } }
</script>
<my-element>
  <template shadowrootmode="open" shadowrootadoptedstylesheets="foo">
    <p>Inside Shadow DOM</p>
  </template>
</my-element>
```

## Las tres líneas de trabajo

### 1. Consumir la hoja dentro del shadow root — línea viva

Candidato actual ([explainer](https://github.com/MicrosoftEdge/MSEdgeExplainers/blob/main/ShadowDOM/explainer.md),
[whatwg/html#12860](https://github.com/whatwg/html/pull/12860)):

```html
<my-element>
  <template shadowrootmode="open">
    <link rel="stylesheet" import="foo" href="foo.css">
    <p>Inside Shadow DOM</p>
  </template>
</my-element>
```

- `import` se resuelve como especificador de módulo (con import map, o como URL relativa).
- Todas las instancias que resuelven a la misma URL comparten **el mismo** `CSSStyleSheet`
  de la entrada del mapa de módulos; no hay segunda descarga.
- La hoja aparece en `styleSheets` (solo lectura), **no** en `adoptedStyleSheets`: el orden
  lo marca el DOM.
- `href` es el respaldo: un navegador sin soporte lo trata como un `<link>` clásico.
- Aplican `nonce`, `load` y `error` como en cualquier `<link>`.
- El nombre del atributo puede acabar siendo `type=module` en vez de `import`.

Diferencias con una hoja clásica que hay que tener presentes:

- **`@import` no está soportado** en módulos CSS; `ownerNode` es `null`, lo que afecta a la
  raíz de `@scope`.
- `media` decide si la hoja aplica en ese `<link>` sin tocar el `media` de la hoja; `title` se
  ignora.
- La petición es de módulo: modo `cors` (lo cross-origin necesita CORS) y siempre UTF-8.

Descartado dentro de esta línea: `shadowrootadoptedstylesheets` (sin eventos `load`/`error`
y con un orden desligado del DOM) y cambiar las claves del mapa de módulos.

#### Dónde se coloca

El `<link>` va **dentro del shadow root**, en cada instancia, como primer hijo del
`<template shadowrootmode>`. El import map va **una sola vez** en el `<head>`.

```html
<head>
  <script type="importmap" nonce="…">
    { "imports": { "fud-card": "/assets/fud-card.css" } }
  </script>
</head>
<body>
  <fud-card>
    <template shadowrootmode="open">
      <link rel="stylesheet" import="fud-card" href="/assets/fud-card.css">
      <p>…</p>
    </template>
  </fud-card>

  <fud-card>
    <template shadowrootmode="open">
      <link rel="stylesheet" import="fud-card" href="/assets/fud-card.css">
      <p>…</p>
    </template>
  </fud-card>
</body>
```

- La primera instancia resuelve el especificador y descarga la hoja como módulo CSS.
- Las siguientes reciben **el mismo** `CSSStyleSheet` de la entrada del mapa de módulos.
- Un navegador sin soporte ignora `import` y usa `href` como `<link>` clásico, una vez por
  instancia (la caché HTTP evita la segunda descarga, pero no comparte el objeto).
- El import map es opcional: `import="./fud-card.css"` se resuelve como URL relativa.
- En el light DOM aplica al documento, como un `<link>` normal.
- Lo único en discusión es el nombre del atributo (`import` o `type=module`), no la
  colocación.

El especificador tiene que apuntar a algo descargable: la definición inline está fuera de
esta propuesta. Quedan un `.css` externo (petición de red) o `data:text/css,…` en el import
map (el CSS pasa a un `<script>`).

#### Estado de `shadowrootadoptedstylesheets`

- **Estándar**: abandonado. El Houdini TF resolvió usar `<link>` (2026-08-05) y el explainer
  propio se fusionó el 2026-08-19 en el general, que lo lista como alternativa descartada.
- **Chrome**: sobrevive solo tras *Experimental Web Platform Features*. El trial (148–153)
  terminó; [web-features#4148](https://github.com/web-platform-dx/web-features/issues/4148)
  hablaba de lanzarlo en la 152 y en la 155 sigue tras flag, lo que indica que el plan se
  paró. No hay aviso formal de retirada.
- **fudic**: no emitirlo; nacería muerto.

### 2. Definir la hoja inline — la más débil

`<style type="module" specifier="foo">`, que es lo que emite fudic.

- Fuera del origin trial desde la 151.
- [whatwg/html#11687](https://github.com/whatwg/html/pull/11687) sigue abierto con objeciones:
  - **`noamr`** (Noam Rosenthal; afiliación sin verificar, **no** consta como posición de
    WebKit), mayo 2026, lo califica de *blocker*: un `<style>` dentro de un shadow root
    escribiría en el import map global, compartido con scripts; `<style specifier="app.js">`
    podría hacer fallar un script esquivando `script-src`. Alternativa: compartir por
    instancia, clase o registro sin pasar por el ámbito global —
    `<style type=module scope=instance|class|registry id=foo>` + `import style from "module:foo"`.
  - **CSP**: `style-src` y `script-src` no coinciden. Kurt propuso evaluar con la más
    restrictiva de las dos, o solo `script-src`. `<script type="css-module">` lo resolvería,
    pero se descartó (CSS dentro de `<script>`, sin tooling).
  - Anne van Kesteren cuestiona la coherencia con `<script>` y la IDL.
- El explainer nuevo lo declara *non-goal*: "se desarrolla aparte".

Parche recomendado mientras se rediseña: import map con `data:`.

```html
<script type="importmap">
  { "imports": { "foo": "data:text/css,span{color:blue;}" } }
</script>
```

### 3. `@sheet` — otro problema

[Explainer](https://github.com/MicrosoftEdge/MSEdgeExplainers/blob/main/AtSheet/explainer.md),
[csswg-drafts#11509](https://github.com/w3c/csswg-drafts/issues/11509). Empaqueta varias
hojas con nombre en un único `.css`:

```css
@sheet foo { div { color: red; } }
@sheet bar { div { font-family: sans-serif; } }
```

```html
<link rel="stylesheet" href="sheet.css" sheet="foo">
<style> @import foo from "sheet.css"; </style>
```

Para uso inline depende de las
[referencias locales](https://github.com/MicrosoftEdge/MSEdgeExplainers/blob/main/LocalReferenceLinkRel/explainer.md)
(`<link href="#id">`). Un ID del light DOM es referenciable desde cualquier shadow root (no al
revés), así que las definiciones en el `<head>` sirven para DSD en streaming.

**Estado**: parado. El explainer no se toca desde 2025-04 y
[csswg-drafts#11509](https://github.com/w3c/csswg-drafts/issues/11509) desde 2025-05. Sin
origin trial ni flag conocidos. Es la mejor línea para fudic (ver abajo) y la de menos
movimiento.

## Qué implica para fudic

- **Lo estable es el modelo, no la sintaxis**: especificador en el mapa de módulos, resuelto
  por import map, que da un único `CSSStyleSheet` compartido. El `specifier` que ya emite
  fudic encaja con eso.
- **Dos piezas de la sintaxis actual van a cambiar**:
  - El `<style type="module" specifier>` de la página, que ya no es nativo en Chrome.
  - Cualquier referencia en el `<template>`: el destino es un `<link>` dentro del shadow root.
- **Recomendación**: no seguir al `<link import>`.
  - Mantener el polyfill `data-fudic-adopt` como la vía que funciona.
  - Que la emisión de la hoja compartida salga de un único punto del compilador.
  - Dirección preferida: `@sheet` como formato de emisión (ver
    [Propuesta para fudic](#propuesta-para-fudic-sheet-como-formato-de-emisión)).

## Conclusión: ninguna propuesta viva evita el FOUC

- **La única vía sin red era la definición inline** (`<style type="module" specifier>`): el
  especificador ya estaba en el mapa de módulos al parsear, y la hoja se aplicaba sin
  esperar. Es justo la pieza que salió del trial en la 151 y que el explainer nuevo declara
  *non-goal*.
- **El parche `data:` no lo garantiza.** Un import de módulo pasa siempre por un *fetch*,
  aunque sea de un `data:`, y según la especificación eso es asíncrono. Sin medir en Chrome.
- **Un `.css` externo depende de la red**, y no está claro que un `<link>` dentro de un
  shadow root bloquee el render como uno en el `<head>`; el explainer no lo define.

Las propuestas piensan en *streaming* y en no repetir CSS por instancia, donde red y caché
les resultan aceptables. Un primer render SSR sin FOUC no está cubierto. Lo que hoy lo cubre
es lo que ya hace fudic: CSS inline en la página + script bloqueante que construye y adopta
la hoja antes de pintar. **El polyfill no es un puente hasta el estándar: cubre un caso que
el estándar ha dejado fuera.**

Dónde influir: [whatwg/html#11687](https://github.com/whatwg/html/pull/11687), donde vive la
definición inline. Un caso concreto de SSR con CSP/nonce que exige inline, sin red y sin
FOUC es el argumento que le falta frente a la objeción de encapsulado y CSP.

## Propuesta para fudic: `@sheet` como formato de emisión

### El modelo

Hojas globales y de componente definidas como bloques `@sheet`; cada shadow root elige cuáles
aplica y en qué orden, la propia la última.

```html
<head>
  <style id="fudic" nonce="…">
    @sheet reset      { … }
    @sheet theme      { … }
    @sheet app-button { … }
  </style>
</head>

<app-button>
  <template shadowrootmode="open">
    <link rel="stylesheet" href="#fudic" sheet="reset">
    <link rel="stylesheet" href="#fudic" sheet="app-button">
    …
  </template>
</app-button>
```

Frente al `<link import>`:

- **Sin red ni FOUC** en la variante inline: el `<style>` ya está parseado cuando llega el
  shadow root.
- **Sin import map**: no toca el ámbito global ni mezcla `style-src` con `script-src`; esquiva
  la objeción de encapsulado. Un `<style>` normal con nonce.
- **El orden de los `<link>` fija la cascada**, como decida el desarrollador.

Tokens: las custom properties de `:root` **ya se heredan** a través del shadow boundary; no
hace falta importarlas. Además `:root` no casa con nada dentro de un shadow root (sería
`:host`). Lo que no atraviesa y sí se beneficia de esto son las reglas con selector: reset,
utilidades, tema de elementos.

### El formato separa la definición de la entrega

El compilador emite siempre el mismo CSS con `@sheet`; cómo llega es decisión de despliegue.
Solo cambia el `href`: `#id` o URL.

| Entrega | Referencia en el shadow root | Red | FOUC |
|---|---|---|---|
| `<style id>` inline en la página | `<link href="#fudic" sheet="x">` | ninguna | no |
| Fichero `.css` por página (build) | `<link href="/p/home.css" sheet="x">` | 1.ª visita | 1.ª visita, luego caché |
| Fichero + Service Worker | igual | ninguna tras instalar | no tras instalar |

Con el `<link import>` esto no es posible: siempre es un módulo resuelto por import map, y la
definición inline está fuera de la propuesta.

### Critical CSS sin heurística

Las herramientas clásicas (Critical, Penthouse) adivinan el CSS de la primera pantalla con
un navegador headless. Fudic no adivina: en el prerender **sabe qué componentes aparecen en
el HTML de cada página**.

- **Inline** (`<style id>`): los `@sheet` de los componentes presentes en la página y los
  globales de `fudic.json`.
- **Fichero**: el resto (componentes creados en cliente, rutas siguientes, carga diferida);
  sin bloquear, cacheable, servible por SW.

Recortar además por viewport no compensa: la hoja de un componente es pequeña y partirla
rompe su unidad.

Lo inline se repite por página y no aprovecha la caché entre páginas; el fichero sí. El
híbrido da primer render sin FOUC y caché para la navegación. Como la sintaxis es la misma,
el reparto es un detalle del compilador, no del lenguaje.

### Adelantar la red en la variante de fichero

- `<link rel="preload" as="style" href="/p/home.css">` en el `<head>`: la descarga arranca en
  paralelo con el HTML.
- `103 Early Hints`: el preload sale antes que el HTML (Chrome, Firefox); encaja con SSR en
  streaming.
- `<link rel="stylesheet">` en el `<head>` bloquea el render (explícito con
  `blocking="render"`): sin FOUC, a cambio de la latencia.

### Configuración y polyfill

- `fudic.json` elige la entrega (inline, fichero o híbrido); el compilador cambia destino y
  `href`.
- El polyfill es el mismo en todos los casos: obtiene el texto (de un `<style>` o con
  `fetch`), parte los bloques `@sheet` por llaves —`replaceSync` descartaría `@sheet` como
  at-rule desconocida—, llama a `replaceSync` y adopta.
- El polyfill es un compilador de CSS en el navegador haciendo lo que el parser haría de
  forma nativa. Emitiendo `@sheet`, fudic genera ya el HTML del futuro: con soporte nativo el
  polyfill se desactiva sin tocar el compilador.
- El Service Worker es una capa opcional sobre la variante de fichero, no del compilador.

## Preguntas abiertas

- ¿Comparten todas las instancias **el mismo** `CSSStyleSheet` al referenciar `#fudic` con
  `sheet=`, o cada `<link>` construye su copia? **Sin verificar**.
- ¿Reutiliza el `<link href="home.css" sheet="x">` de cada shadow root la descarga del
  preload, sin repetir la petición? **Sin verificar**.
- ¿Funcionan las referencias locales (`<link href="#id">`) tras algún flag en Chrome 155?
  **Sin verificar**.
- ¿Duplican hoy los componentes de fudic los tokens? Si es así, revisar por qué: la herencia
  de custom properties ya los lleva al shadow root.
- Con el parche `data:` el CSS pasa a un `<script type="importmap">`, que necesita nonce de
  `script-src`. **Sin verificar**: si el `data:` exige además permiso en `style-src`.
- Si en Chrome 155 el `<style type="module" specifier>` lo resuelve el flag experimental o
  solo el polyfill. **Sin verificar**.
- Cómo se comporta el `<link import>` en streaming: si una instancia posterior encuentra la
  entrada ya cargada, sin FOUC. El explainer no fija semántica de bloqueo.

## Fuentes

- [Explainer actual — Declarative Shadow DOM Style Sharing](https://github.com/MicrosoftEdge/MSEdgeExplainers/blob/main/ShadowDOM/explainer.md)
- [Explainer `@sheet`](https://github.com/MicrosoftEdge/MSEdgeExplainers/blob/main/AtSheet/explainer.md)
- [whatwg/html#10673](https://github.com/whatwg/html/issues/10673)
- [whatwg/html#11687 — Declarative CSS Modules](https://github.com/whatwg/html/pull/11687)
- [whatwg/html#12860 — Module Stylesheet `<link>`](https://github.com/whatwg/html/pull/12860)
- [Intent to Experiment (blink-dev)](http://www.mail-archive.com/blink-dev@chromium.org/msg16211.html)
- [ChromeStatus](https://chromestatus.com/feature/4790543041298432)
- [web-features#4148 — `shadowrootadoptedstylesheets`](https://github.com/web-platform-dx/web-features/issues/4148)
- [WICG/webcomponents#939](https://github.com/WICG/webcomponents/issues/939)
- [TAG review #1000](https://tag-github-bot.w3.org/gh/w3ctag/design-reviews/1000)
- [csswg-drafts#11509 — `@sheet`](https://github.com/w3c/csswg-drafts/issues/11509)
