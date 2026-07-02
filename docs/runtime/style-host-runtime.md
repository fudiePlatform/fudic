# Feature: `<style host>` — runtime targets (SSR/SSG + DOM)

> **Estado:** borrador en maduración.
> **Caso canónico:** `app-button.fud` (nivel 2 — handler sin estado por instancia, sin `signal()` ni lifecycle).
> **Decisiones de gramática que materializa:** 67–70 (ver §6).

---

## 1. Qué es la feature

`<style host>` resuelve un hueco arquitectónico real: el CSS de un componente con shadow
encapsulado se duplica una vez por instancia cuando se serializa inline. En una página con
50 `<app-button>`, el HTML lleva 50 copias del mismo bloque de estilo.

La feature emite **una sola hoja** en el documento y la **adopta por referencia** en el
`adoptedStyleSheets` de cada shadow root cuyo host matchee el selector. Una copia del CSS en
memoria, parseada una vez por el navegador, referenciada N veces. La encapsulación la da el
límite de shadow (la hoja vive *dentro* de cada shadow root adoptado), no la posición del
`<style>` en el documento.

Invariantes que la atraviesan:

- **Todos los shadow roots emitidos por Fudic son inspeccionables y adoptables desde el
  documento.** Esto es lo que hace la feature posible sin runtime de framework: el script de
  adopción puede recorrer el documento y tocar cada shadow directamente.
- **Fuente CSSOM, no reconstrucción.** El polyfill toma `styleEl.sheet` —la hoja que el
  navegador ya parseó al encontrar el `<style host>`— y adopta esa referencia. No hay
  `new CSSStyleSheet()` + `replaceSync`, no hay copia de reglas. Reutiliza el parseo del
  navegador.
- **Una sola hoja, N adopciones.** Adoptar la *referencia* deduplica de verdad; copiar las
  reglas en cada shadow movería el problema sin resolverlo. La feature adopta referencia.

---

## 2. Entrada — `app-button.fud`

```fud
@code {
  type Variant = 'primary' | 'ghost';

  @client {
    function onClick(e: MouseEvent) {
      const host = (e.currentTarget as HTMLElement).closest('app-button');
      host?.dispatchEvent(new CustomEvent('press', { bubbles: true }));
    }
  }
}

<head>
  <style host="app-button">
    :host { display: inline-block; }
    .btn {
      font: inherit;
      padding: 0.5rem 1rem;
      border: 1px solid currentColor;
      border-radius: 6px;
      cursor: pointer;
      background: transparent;
    }
    .btn.primary { background: #1a73e8; color: white; border-color: #1a73e8; }
    .btn.ghost { color: #1a73e8; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  </style>
</head>

<button
  class="btn"
  class:primary="@(variant === 'primary')"
  class:ghost="@(variant === 'ghost')"
  disabled="@disabled"
  @click="@onClick">
  <slot></slot>
</button>
```

---

## 3. Resultado en SSR / SSG (servidor)

Idéntico en SSG estático, en SSR clásico y en streaming desde un Worker / Service Worker. El
servidor emite **texto HTML con DSD**, sin runtime de framework, streameable chunk a chunk.

### 3.1. Hoja única elevada al documento

Emitida **una sola vez** en el `<head>` de la página, independientemente del número de instancias:

```html
<style host="app-button">
  :host { display: inline-block; }
  .btn { font: inherit; padding: 0.5rem 1rem; border: 1px solid currentColor; border-radius: 6px; cursor: pointer; background: transparent; }
  .btn.primary { background: #1a73e8; color: white; border-color: #1a73e8; }
  .btn.ghost { color: #1a73e8; }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
```

### 3.2. Cada instancia

Para `<app-button variant="primary">Guardar</app-button>`, el shadow no lleva `<style>` dentro
— solo el markup:

```html
<app-button variant="primary" data-fud-c="app-button">
  <template shadowrootmode="open">
    <button class="btn primary" data-fud-e="app-button:onClick">
      <slot></slot>
    </button>
  </template>
  Guardar
</app-button>
```

Transformaciones aplicadas en el servidor:

- `class:primary="@(variant === 'primary')"` se **resuelve en el servidor**: `variant` es
  `'primary'` → la clase `primary` se concatena estáticamente en `class="btn primary"`. La
  expresión no viaja al cliente. `ghost` evaluó `false` → omitida.
- `disabled="@disabled"` con `disabled` falsy → atributo omitido (atributos booleanos: falsy
  omite, truthy emite sin valor). Si fuera truthy: `... class="btn primary" disabled ...`.
- `@click="@onClick"` **no emite `onclick` inline**. Emite el marcador
  `data-fud-e="app-button:onClick"` que el runtime delegado lee. El handler vive en el módulo
  de cliente, no en el atributo.
- `data-fud-c="app-button"` marca el host para descubrimiento / registro lazy.
- El `<slot>` queda en el shadow; el light DOM (`Guardar`) queda como hijo directo del host,
  listo para proyección nativa.

### 3.3. Streaming desde Service Worker / Worker

Como la salida es texto plano sin runtime, un Service Worker la genera y la sirve por stream
directamente. La hoja única (`STYLE_CHUNK`) es constante y cacheable; el resto es función de
los props:

```js
async function render(props) {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(
        `<app-button variant="${props.variant}" data-fud-c="app-button">` +
        `<template shadowrootmode="open">`
      ));
      controller.enqueue(enc.encode(
        `<button class="btn ${cls(props)}" data-fud-e="app-button:onClick"><slot></slot></button>`
      ));
      controller.enqueue(enc.encode(`</template>`));
      controller.enqueue(enc.encode(escapeHtml(props.children)));
      controller.enqueue(enc.encode(`</app-button>`));
      controller.close();
    }
  });
  return new Response(stream, { headers: { 'content-type': 'text/html;charset=utf-8' } });
}
```

El shadow se construye **a medida que llega el stream**: el navegador materializa cada shadow
root en cuanto cierra `</template>`, sin esperar al cierre del documento. No hay paso de
hidratación que bloquee la pintura.

> **Nota sobre la hoja única y el FOUC.** La hoja elevada no estiliza nada por sí misma: hace
> falta la adopción en cliente (§4.2). Para componentes críticos *above-the-fold* que no
> toleran ninguna ventana de FOUC, existe el escape **DSD-inline**: emitir el `<style>` dentro
> de cada `<template>` (CSS encapsulado en el mismo chunk, sin script, sin adopción, a cambio
> de duplicación que la compresión absorbe). La feature `<style host>` aplica al caso general y
> *below-the-fold*; DSD-inline es el opt-out para lo que no puede parpadear.

---

## 4. Resultado en DOM (navegador)

Para nivel 2 el cliente recibe **un runtime delegado compartido diminuto** + **un módulo de
handler por componente** + **un script de adopción de hojas**. Cero clase por instancia, cero
constructor por instancia.

### 4.1. Adopción de la hoja `<style host>`

Un único script de adopción por documento (no uno por componente). Toma la hoja del CSSOM y la
adopta por referencia en cada shadow root cuyo host matchee el selector. Pasada única,
síncrona, antes del primer paint:

```js
// fud-style-host.js — uno por documento, ~300 bytes, bloqueante al final del <body>
for (const styleEl of document.querySelectorAll('style[host]')) {
  const selector = styleEl.getAttribute('host');
  const sheet = styleEl.sheet; // hoja ya parseada por el navegador — sin reparseo

  for (const host of document.querySelectorAll(selector)) {
    const root = host.shadowRoot; // accesible: todos los shadows son inspeccionables
    if (root) {
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet]; // misma referencia, N veces
    }
  }
}
```

Propiedades:

- **Una sola hoja en memoria**, compartida por las N instancias. Deduplicación real.
- **Sin reparseo**: se reutiliza `styleEl.sheet`.
- **Un solo script bloqueante constante** para toda la página — no escala con el número de
  componentes. Corre antes del paint → cierra la ventana de FOUC para el render estático.
- Para hosts añadidos dinámicamente después del render inicial (nivel 3 con instanciación en
  cliente), la adopción se hace en el `connectedCallback` de esa instancia; afecta solo a su
  propio árbol, sin FOUC de página.

### 4.2. Runtime delegado de eventos (nivel 2)

Un único listener por tipo de evento en `document`, que resuelve `data-fud-e` y llama al
handler registrado. `composedPath()` cruza los límites de shadow:

```js
// fud-runtime-n2.js — compartido por toda la app
const HANDLERS = new Map();

export function register(id, fn) {
  HANDLERS.set(id, fn);
}

document.addEventListener('click', (e) => {
  for (const node of e.composedPath()) {
    if (node instanceof Element && node.hasAttribute?.('data-fud-e')) {
      const spec = node.getAttribute('data-fud-e'); // "app-button:onClick"
      const fn = HANDLERS.get(spec);
      if (fn) fn(node, e); // el nodo que matcheó se pasa explícito (ver §4.3)
      return;
    }
  }
}, true);
```

### 4.3. Módulo de handler del componente

El `@client { function onClick(e) {...} }` se compila a un registro contra el runtime. El
cuerpo del handler es el código del usuario, sin envoltura de framework. En delegación global
`e.currentTarget` es `document`, no el `<button>`; el compilador pasa el nodo que matcheó
`data-fud-e` como primer parámetro sintético y reescribe las referencias a `currentTarget`
hacia ese nodo:

```js
// app-button.client.js — emitido desde el @client de app-button.fud
import { register } from './fud-runtime-n2.js';

register('app-button:onClick', function onClick(node, e) {
  const host = node.closest('app-button'); // currentTarget reescrito → node
  host?.dispatchEvent(new CustomEvent('press', { bubbles: true }));
});
```

### 4.4. Registro lazy (estrategia `interaction`, por defecto)

Para nivel 2 no hay `customElements.define` (no hay clase). El "registro" es cargar el módulo
del handler la primera vez que se necesita. Antes de eso, la página es DSD encapsulado,
funcional y pintado:

```js
// arranque mínimo de la página
const PENDING = new Map([
  ['app-button:onClick', () => import('./app-button.client.js')],
]);

document.addEventListener('click', async (e) => {
  for (const node of e.composedPath()) {
    const spec = node?.getAttribute?.('data-fud-e');
    if (spec && PENDING.has(spec)) {
      await PENDING.get(spec)();                  // carga el handler real
      PENDING.delete(spec);
      node.dispatchEvent(new e.constructor(e.type, e)); // re-dispara el primer evento
      return;
    }
  }
}, true);
```

El JS del handler no se descarga hasta la primera interacción. La primera pulsación paga el
import del módulo y re-dispara el evento para no perder esa interacción.

---

## 5. Síntesis del flujo end-to-end

El servidor (incluido Service Worker) emite **texto HTML con DSD**, streameable chunk a chunk,
encapsulado por shadow nativo, sin runtime. El navegador construye los shadow roots durante el
propio stream. El CSS se eleva como **una hoja única** en el documento. En cliente, un **script
de adopción constante** la inserta por referencia en cada shadow (CSSOM, sin reparseo, sin
copia), cerrando el FOUC con una sola pasada pre-paint. Los eventos los gestiona un **runtime
delegado compartido** + **un módulo de handler por componente** cargado lazy en la primera
interacción. `app-button` no genera ninguna clase ni constructor: es DSD + una entrada en un
`Map` de handlers + una hoja adoptada. La suma es la suma.

---

## 6. Decisiones de gramática (67–70)

**67.** `<style host>`: la fuente de la hoja es el CSSOM (`styleEl.sheet`), ya parseado por el
navegador. Se adopta **por referencia** en `adoptedStyleSheets` de cada shadow root cuyo host
matchee el selector. Nunca se copian reglas ni se reconstruye la hoja. Una hoja, N adopciones.

**68.** Todos los shadow roots emitidos por Fudic son **inspeccionables y adoptables desde el
documento**. Es la precondición que hace `<style host>` posible sin runtime: el script de
adopción recorre el documento y toca cada shadow directamente. La inferencia de niveles no
necesita considerar el modo del shadow; nivel 1 y nivel 2 conservan "cero clase por instancia".

**69.** La adopción de `<style host>` usa el acceso directo al shadow root desde el documento.
No requiere `ElementInternals` para el estilo. `ElementInternals.shadowRoot` se reserva para
hidratación de estado en nivel 3 cuando la clase lo requiera por otras razones, no como puente
de adopción de CSS.

**70.** La adopción se emite como un **script bloqueante constante por documento** (no uno por
componente): pasada única, síncrona, pre-paint, sobre los shadows ya presentes. Cierra el FOUC
sin escalar con el número de componentes. Para hosts dinámicos (nivel 3 instanciado en
cliente), la adopción cae en el `connectedCallback` de la instancia. **DSD-inline** (`<style>`
dentro del `<template>`) queda como escape *above-the-fold* para cero-script absoluto, a costa
de duplicación que la compresión absorbe.

---

## 7. Argumento para la especificación (WICG)

`<style host>` no pide al navegador ninguna capacidad nueva ni ninguna concesión de seguridad:

- El **mecanismo ya existe** (`adoptedStyleSheets`).
- La **información ya es accesible**: sobre shadow roots inspeccionables, el navegador ya puede
  ver todos los que matchean el selector. La operación "adopta esta hoja en cada shadow cuyo
  host matchee `app-button`" está bien definida y no expone nada nuevo.
- El **único hueco es el punto de entrada declarativo**: hoy esa operación obliga a JS
  imperativo y a una pasada post-paint (de ahí el FOUC del polyfill). `<style host>` es el
  atajo serializable a algo que ya se puede hacer, pero sin runtime y sin ventana de FOUC,
  porque la primitiva nativa adoptaría la hoja al construir cada shadow durante el parse del
  stream.

Esto cubre el hueco que ni Constructable Stylesheets (no serializable) ni DSD (no compartible
entre hosts) cierran hoy: **encapsulación y deduplicación no son incompatibles; solo falta el
punto de entrada declarativo que las una**.

El polyfill de referencia (CSSOM + adopción por referencia, §4.1) es isomorfo con la futura
primitiva: el día que `<style host>` sea nativo, el código de consumo no cambia, solo
desaparece el script de adopción.
