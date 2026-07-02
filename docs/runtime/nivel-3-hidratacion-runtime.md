# Feature: Nivel 3 — señales, estado en cliente e hidratación (SSR/SSG + DOM)

> **Estado:** borrador en maduración.
> **Caso canónico:** `app-counter.fud` (nivel 3 — estado propio, señal, lifecycle).
> **Complementa:** `style-host-runtime.md` (nivel 2). Aquí se cubre lo que aquel deja fuera:
> estado en cliente, señales y `customElements.define`.
> **Decisiones de gramática que materializa:** 71–74 (ver §6).

---

## 1. Qué cambia respecto a nivel 2

La diferencia N2 → N3 es estructural, no incremental:

| | Nivel 2 | Nivel 3 |
|---|---|---|
| Clase | No existe | `customElements.define` + clase |
| Estado | Ninguno (handler puro sobre el evento) | Señales propias por instancia |
| Eventos | Listener delegado global en `document` | Listeners propios del componente |
| Shadow | DSD construido, inerte hasta interacción | DSD construido, **adoptado** por la clase al upgradear |
| "Hidratación" | Cargar el módulo del handler | Reconstruir señales y cablearlas al DOM ya pintado |

El punto central de N3: **el shadow ya existe** (lo construyó el DSD durante el stream), **pero
el estado no**. La clase no crea el shadow — lo adopta del DSD ya presente. Al upgradear,
reconstruye las señales y las cabla a los nodos ya pintados, sin volver a renderizar lo que el
servidor mandó. Eso es hidratación de verdad: el `connectedCallback` upgradea un árbol que ya
está en pantalla.

---

## 2. Identidad de nodos — el puente de la hidratación

Para cablear señales a un DOM ya pintado sin reconstruirlo, cada nodo con binding reactivo
lleva una **identidad estable** emitida por el compilador. Se hereda la idea del prototipo
previo (`__key` / `__instanceParentKey`): un marcador que permite a la clase, al hidratar,
localizar exactamente qué nodo corresponde a qué binding sin recorrer ni adivinar.

En el output toma la forma de un atributo data por nodo reactivo:

- `data-fud-b="<binding-id>"` — nodo con un binding reactivo (texto interpolado, atributo
  dinámico, clase condicional). El `binding-id` es estable por componente.

La clase mantiene un mapa `binding-id → nodo` resuelto en una sola pasada al hidratar, y a
partir de ahí cada cambio de señal escribe solo en su nodo, sin diffing de árbol.

---

## 3. Cruce de estado servidor → cliente (híbrido, DOM-first)

El estado inicial del servidor cruza al cliente por **dos vías, priorizando el DOM**:

- **Derivable del DOM** → se re-deriva leyendo el markup ya pintado. Un contador cuyo valor
  está en el texto, un toggle cuyo estado está en una clase o atributo: la señal se inicializa
  leyendo ese nodo. Cero bytes extra; el estado ya viaja en el HTML.
- **No reconstruible** → se serializa como JSON en `data-fud-s` en el host. Solo lo que no
  tiene representación visual o perdería precisión al re-derivarse (un objeto, una fecha con
  zona, un id no pintado).

El compilador **clasifica cada señal** en derivable vs no-reconstruible mediante análisis
estático: si la señal alimenta un binding que se pinta y es invertible (texto → número, clase →
booleano), es derivable; si no, va a `data-fud-s`. Esto se alinea con el principio
"comunicación server→client vía HTML, sin serialización paralela", y reserva el JSON para el
residuo irreducible.

---

## 4. Entrada — `app-counter.fud`

```fud
@code {
  @client {
    import { signal } from '@fudic/signals';

    const count = signal(0);

    function inc() { count.set(count.peek() + 1); }
    function dec() { count.set(count.peek() - 1); }
  }
}

<head>
  <style host="app-counter">
    :host { display: inline-flex; align-items: center; gap: 0.5rem; }
    .val { min-width: 2ch; text-align: center; font-variant-numeric: tabular-nums; }
    button { font: inherit; cursor: pointer; }
  </style>
</head>

<button @click="@dec">−</button>
<span class="val">@count</span>
<button @click="@inc">+</button>
```

`@count` es un binding reactivo (texto). El valor es **derivable del DOM**: vive en el texto de
`.val`. No necesita `data-fud-s`.

---

## 5. Resultado en SSR / SSG (servidor)

El servidor renderiza el estado inicial (`count = 0`) directamente en el markup. La señal no
viaja serializada: su valor está en el texto pintado.

### 5.1. Hoja única (igual que nivel 2)

```html
<style host="app-counter">
  :host { display: inline-flex; align-items: center; gap: 0.5rem; }
  .val { min-width: 2ch; text-align: center; font-variant-numeric: tabular-nums; }
  button { font: inherit; cursor: pointer; }
</style>
```

### 5.2. Instancia

```html
<app-counter data-fud-c="app-counter">
  <template shadowrootmode="open">
    <button data-fud-e="app-counter:dec">−</button>
    <span class="val" data-fud-b="count">0</span>
    <button data-fud-e="app-counter:inc">+</button>
  </template>
</app-counter>
```

- `@count` se pinta como `0` dentro de `<span class="val" data-fud-b="count">`. El
  `data-fud-b="count"` es la identidad del nodo reactivo (§2): la clase lo localizará al
  hidratar.
- El estado inicial **no se serializa aparte**: el `0` del texto *es* el estado. Hidratación
  DOM-first (§3).
- Sin `data-fud-s`: no hay estado no-reconstruible en este componente.
- `data-fud-c="app-counter"` marca el host para el upgrade lazy.

El shadow se construye durante el stream, como en N2. La diferencia es que este host *será*
upgradeado por una clase, no servido por delegación global.

---

## 6. Resultado en DOM (navegador)

### 6.1. Señales — implementación mínima inline

Emitida una vez, compartida por la app (~20 líneas, sin librería externa). Modelo
pull con suscripción explícita:

```js
// fud-signals.js — compartido por toda la app
export function signal(initial) {
  let value = initial;
  const subs = new Set();
  return {
    peek: () => value,                       // lee sin suscribir
    get: () => value,                        // lee (en contexto de efecto, suscribiría)
    set: (next) => {
      if (next === value) return;
      value = next;
      for (const fn of subs) fn(value);      // notifica
    },
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
  };
}
```

### 6.2. Clase del componente — hidratación

El `@client` se compila a una clase. El `connectedCallback` **adopta el shadow ya existente**
(no lo crea), localiza los nodos por identidad, rehidrata las señales desde el DOM, y cabla las
suscripciones:

```js
// app-counter.js — emitido desde el @client de app-counter.fud
import { signal } from './fud-signals.js';

class AppCounter extends HTMLElement {
  static sheet;
  #count;

  connectedCallback() {
    const root = this.shadowRoot;            // shadow del DSD, ya presente

    // 1. adopción de la hoja <style host> (misma referencia compartida)
    AppCounter.sheet ??= document.querySelector('style[host="app-counter"]').sheet;
    if (!root.adoptedStyleSheets.includes(AppCounter.sheet)) {
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, AppCounter.sheet];
    }

    // 2. localizar nodos reactivos por identidad (§2)
    const valNode = root.querySelector('[data-fud-b="count"]');

    // 3. rehidratar la señal desde el DOM (DOM-first, §3)
    this.#count = signal(Number(valNode.textContent));

    // 4. cablear: cada cambio escribe solo en su nodo, sin diffing
    this.#count.subscribe((v) => { valNode.textContent = String(v); });

    // 5. listeners propios del componente
    root.querySelector('[data-fud-e="app-counter:inc"]')
        .addEventListener('click', () => this.#count.set(this.#count.peek() + 1));
    root.querySelector('[data-fud-e="app-counter:dec"]')
        .addEventListener('click', () => this.#count.set(this.#count.peek() - 1));
  }
}
```

Notas:

- La señal arranca con `Number(valNode.textContent)` → `0`. **No se reconstruyó el DOM**; se
  leyó. El servidor ya pintó `0`; la clase lo adopta como valor inicial.
- La adopción de `<style host>` ocurre aquí, en el lifecycle, porque un N3 puede instanciarse
  dinámicamente (host nacido después del paint inicial). Para los presentes en el render
  estático, el script de adopción de pasada única ya los cubrió; el `includes` evita doble
  adopción.
- Los listeners son **propios del componente**, no delegados en `document` como en N2. N3 tiene
  clase, así que cada instancia gestiona sus propios eventos.

### 6.3. Upgrade lazy — `interaction` por defecto

El `customElements.define` se difiere hasta la primera interacción sobre el host. Antes de eso
el componente es DSD pintado e inerte; el estado inicial ya es visible (servido por el
servidor). La interacción dispara el `define`, que upgradea e hidrata, y re-dispara el evento:

```js
// arranque de la página — estrategia interaction
const PENDING_DEFINE = new Map([
  ['app-counter', () => import('./app-counter.js').then(m => {
    customElements.define('app-counter', m.AppCounter);
  })],
]);

document.addEventListener('click', async (e) => {
  for (const node of e.composedPath()) {
    const host = node?.closest?.('[data-fud-c]');
    const name = host?.getAttribute?.('data-fud-c');
    if (name && PENDING_DEFINE.has(name)) {
      await PENDING_DEFINE.get(name)();        // define → upgrade → connectedCallback hidrata
      PENDING_DEFINE.delete(name);
      node.dispatchEvent(new e.constructor(e.type, e)); // re-dispara para no perder el click
      return;
    }
  }
}, true);
```

Estrategias opt-in (declaradas por componente):

- `eager` — `define` en cuanto carga el módulo (componentes que reaccionan sin interacción).
- `viewport` — `define` al entrar en viewport (`IntersectionObserver`).
- `idle` — `define` en `requestIdleCallback`.

El JS de estado no se descarga hasta que la estrategia lo dispara. Antes, DSD pintado con el
estado inicial del servidor visible.

---

## 7. Síntesis del flujo end-to-end (N3)

El servidor renderiza el estado inicial **dentro del markup** (el valor de la señal es el texto
pintado) y construye el shadow vía DSD durante el stream, con cada nodo reactivo marcado por
identidad. El estado derivable del DOM no se serializa; solo el residuo no-reconstruible viaja
en `data-fud-s`. En cliente, la estrategia de hidratación (por defecto `interaction`) dispara
el `customElements.define`; la clase **adopta el shadow ya existente**, adopta la hoja
`<style host>` compartida, localiza los nodos por identidad, **rehidrata las señales leyendo el
DOM**, y cabla suscripciones que escriben solo en su nodo sin diffing de árbol. No se
reconstruye nada que el servidor ya mandó: se upgradea en sitio.

---

## 8. Decisiones de gramática (71–74)

**71.** Identidad de nodos reactivos: cada nodo con binding reactivo lleva `data-fud-b="<id>"`,
identidad estable por componente emitida por el compilador. Es el puente que permite a la clase
N3 localizar nodos al hidratar sin reconstruir el árbol. (Hereda la idea de `__key` del
prototipo previo.)

**72.** Cruce de estado servidor→cliente híbrido **DOM-first**: el estado derivable del markup
ya pintado se rehidrata leyendo el DOM; solo el estado no-reconstruible se serializa como JSON
en `data-fud-s` en el host. El compilador clasifica cada señal por análisis estático. Alinea
con "comunicación server→client vía HTML, sin serialización paralela".

**73.** La clase N3 **adopta** el shadow root construido por DSD (no lo crea). El
`connectedCallback` localiza nodos por identidad (71), rehidrata señales (72), adopta la hoja
`<style host>` compartida y cabla suscripciones. Cada cambio de señal escribe solo en su nodo,
sin diffing.

**74.** Estrategia de hidratación por defecto: `interaction` (el `customElements.define` se
difiere hasta la primera interacción sobre el host). Opt-in por componente: `eager`,
`viewport`, `idle`. Antes del upgrade, el componente es DSD pintado con el estado inicial del
servidor visible e inerte.

---

## 9. Frontera N2 / N3 (recordatorio de inferencia)

- **Sin `@code` ejecutable** → N1 (DSD inline, cero JS).
- **`@code` con handlers puros** (sin `signal()`, sin lifecycle no trivial) → N2 (delegación
  global, cero clase por instancia). Cubierto en `style-host-runtime.md`.
- **`signal()`, lifecycle real** → N3 (clase + `customElements.define` + hidratación). Este
  documento.

`app-button` (handler que despacha un evento, sin estado) es N2. `app-counter` (señal +
mutación de estado) es N3. La presencia de `signal()` es la línea divisoria.
