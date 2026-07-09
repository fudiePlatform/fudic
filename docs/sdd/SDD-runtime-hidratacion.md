# SDD — Runtime de hidratación por interacción (`@fudic/core/dom`)

> **Estado:** `Listo`
> **Paquete:** `@fudic/core/dom` (runtime de cliente; ver SDD-00 §3.5)
> **Naturaleza:** runtime, no compilador. No implementa reglas de gramática; especifica
> el módulo de cliente que el emit del compilador presupone y contra el que emite.
> **Validado:** prototipo funcional servido por HTTP, medido en navegador
> (INP 20 ms en cache-hit; log de aceptación en §7).

---

## 1. Contexto y objetivo

Especificar el **único módulo JavaScript que una página Fudic descarga en la carga
inicial**: el capturador global de eventos que descarga, define e hidrata componentes
**bajo demanda, guiado por la interacción del usuario**. Mientras el usuario no
interactúa, no se descarga ni ejecuta ningún JavaScript de componente. La página
renderizada por SSR (HTML + CSS + Declarative Shadow DOM) es plenamente visible y
navegable sin este runtime; el runtime solo añade comportamiento cuando el usuario lo
provoca.

Este documento fija el contrato entre tres piezas que el compilador emite y este runtime
coordina:

1. El **payload SSR** (`data-id → estado`) que transporta el estado de cada componente.
2. Los **chunks de componente** (un módulo por tag, con `customElements.define`).
3. El **capturador global** (este runtime), que decide cuándo descargar e hidratar.

El objetivo es que la primera interacción con un componente aún no hidratado no se pierda,
que ninguna interacción se ejecute dos veces, y que el modelo natural de eventos del DOM
(`ev`, `stopPropagation`, `preventDefault`) quede intacto en el código del usuario.

---

## 2. Dependencias

- **SSR / emit del compilador** — produce el HTML con `<template shadowrootmode>` por
  instancia, el atributo `data-id` por host, el payload JSON, y un chunk por tag. El
  `data-id` es identidad de instancia asignada en el **emit de página** con alcance de
  unicidad de documento, en pasada determinista, co-emitida con el payload, y **solo para
  instancias N3 efectivas** (ver 3.1). Si el emit no garantiza esto (unicidad por página,
  determinismo, correspondencia atributo↔payload), el runtime rompe: es un contrato duro
  hacia el SDD de emit, no una preferencia.
- **Service Worker** (SDD de red, aparte) — sirve los chunks con estrategia
  network-first en la primera petición de un tag y cache-first en las siguientes. El
  runtime es agnóstico a esto: pide el chunk con `import()` y el SW decide el origen.
- **Polyfill `<style host>`** (SDD aparte) — adopta las hojas por tag en cada shadow
  root. Ortogonal a la hidratación; no interviene en el flujo de eventos.

Ninguna dependencia de parsing. Este runtime no conoce el compilador; conoce el
**contrato de emit**.

---

## 3. Contrato de emit (lo que el compilador debe producir)

### 3.1. Host por instancia

Cada instancia de componente se emite como un custom element con Declarative Shadow DOM
y un identificador único de página:

```html
<app-counter data-id="1">
  <template shadowrootmode="open">
    <!-- markup ya renderizado por SSR con el estado de #1 -->
  </template>
</app-counter>
```

- `data-id` es **identidad de instancia**, no un identificador que escriba el
  programador ni algo derivable del componente aislado. Un mismo componente aparece N
  veces en una página y cada instancia necesita un id distinto y **único en el
  documento**; el componente no conoce cuántas veces se le instancia. Por tanto el
  `data-id` **no puede** calcularse en el emit del `.fud` del componente.
- **Asignación (tema de compilación, emit de página).** El `data-id` se asigna en el
  **emit de la página**, tras resolver toda la composición (todos los
  `<link rel="component">`), en una pasada **determinista** que recorre el árbol de
  composición resultante en orden fijo (pre-orden) y asigna un id único por instancia.
  Esa **misma pasada** emite simultáneamente (a) el atributo `data-id` en el host y
  (b) la clave correspondiente en el payload (3.2): ambos salen del mismo recorrido para
  que coincidan por construcción. Si se calcularan por separado, divergirían.
  Determinismo requerido: mismo árbol de entrada ⇒ mismos ids, para que SSR y cualquier
  regeneración produzcan el mismo mapa.
- **Solo instancias hidratables (N3 efectivo) reciben `data-id`.** Los componentes N1 y
  N2 puros no se hidratan y **no llevan `data-id`** ni entrada en el payload. Un
  componente cuyo nivel efectivo es N3 —por nivel intrínseco o inducido por props
  reactivas entrantes— es el único que se serializa como instancia hidratable. El runtime
  solo encuentra `data-id` en hosts hidratables; los demás son inertes para él.
- El shadow es **declarativo**: el parser del navegador lo materializa en la carga. El
  componente se ve sin JavaScript.

### 3.2. Payload de estado

Un único `<script type="application/json">` por documento, mapeando cada `data-id` a su
**estado completo en el momento de serializar** — se pinte o no en el markup:

```html
<script type="application/json" id="fud-state">
{ "1": { "count": 3 }, "2": { "count": 10 }, "3": { "on": true } }
</script>
```

- **Estado completo, no proyección.** Si el render SSR solo pinta un subconjunto de los
  campos (p. ej. un `@if` que muestra `name` u `phone` según una condición), el payload
  igualmente contiene todos los campos. El DOM refleja la proyección; el payload es la
  preimagen. (La materialización del grafo raíz con identidad de referencias — objetos
  compartidos entre componentes — queda fuera de este SDD; ver §8.)
- **El payload es la autoridad de estado. El DOM es autoridad de posición.** El
  componente lee su estado inicial del payload por su `data-id`, **nunca reconstruyendo
  estado desde su propio DOM**. El DOM se usa solo para adoptar posicionalmente los nodos
  ya renderizados.

### 3.3. Chunk de componente

Un módulo por tag. Al ejecutarse, hace `customElements.define(tag, Clase)`. La clase:

- En `connectedCallback`: lee su estado inicial de `window.__fudState[data-id]`, adopta
  posicionalmente los nodos del shadow ya renderizado (sin `cloneNode`, sin `innerHTML`,
  sin recrear markup), y **registra sus propios listeners** sobre los elementos que el
  usuario marcó con `@click` (u otros eventos).
- El handler es un método de la clase y **recibe el `ev` real**. El usuario controla
  `ev.stopPropagation()` / `ev.preventDefault()` con semántica DOM normal.

El componente **no** expone métodos de acción al runtime ni delega su lógica de eventos
al capturador global. El listener es suyo; el runtime no intermedia eventos una vez el
componente está vivo.

---

## 4. Interfaz pública del runtime

El runtime es un módulo sin exports funcionales (efecto de instalación al importarse).
Su contrato observable:

```ts
// Estado global expuesto para que los chunks lean su estado inicial.
declare global {
  interface Window { __fudState: Record<string, unknown>; }
}

// Eventos de ciclo de vida emitidos en `document` (para instrumentación/telemetría):
//   'fud:ready'                          — runtime instalado, cero JS de componente aún.
//   'fud:hydrated'  detail: {
//       id: string;                      // data-id de la instancia hidratada
//       tag: string;                     // localName del componente
//       ms: string;                      // tiempo de resolución del chunk
//       from: 'downloaded' | 'shared-chunk';  // origen: descarga real o chunk ya definido
//   }
```

Convención de resolución de chunk (fija en este SDD, sustituible por manifest del emit):

```ts
function chunkURL(tag: string): string; // p. ej. `./components/${tag}.js`
```

> En producción el mapa `tag → URL de chunk` lo emite el compilador (con hashing de
> nombre para cacheado inmutable). La convención por ruta es el valor por defecto.

---

## 5. Comportamiento

### 5.1. Ejes independientes: hidratación por instancia, descarga por tag

La hidratación se controla **por instancia** (`data-id`). La descarga del chunk se
controla **por tag**. Son ejes ortogonales y confundirlos es un error (fue el defecto
detectado y corregido durante la validación):

- Un `Set` de `data-id` hidratados determina si el runtime debe intervenir en una
  instancia dada.
- La definición del custom element (`customElements.get(tag)`) determina si hace falta
  descargar el chunk.

Dos instancias del mismo tag comparten chunk (una sola descarga) pero **se hidratan cada
una en su propia primera interacción**.

### 5.2. Instalación

Un **único** listener, en **fase de captura**, sobre el elemento raíz del área de
aplicación:

```js
root.addEventListener('click', onCapture, true);
```

La captura garantiza que el runtime evalúa el evento **antes** que cualquier listener
propio de componente (que corre en burbujeo). Es lo que permite decidir si hay que
descargar antes de que el gesto se pierda.

> El conjunto de tipos de evento capturados se limita a los que **burbujean** (`click`,
> `input`, `change`, `submit`, `keydown`, `pointerdown`, `focusin`, …). Los eventos que
> no burbujean y las estrategias no basadas en interacción (`viewport` vía
> IntersectionObserver, `idle`, `eager`) quedan fuera de este SDD (§8). El prototipo
> valida `click`.

### 5.3. Los tres caminos del capturador

En cada evento capturado se localiza el host `[data-id]` más cercano recorriendo
`e.composedPath()` (atraviesa la frontera de shadow; `closest()` no sirve). Si no hay
host, se ignora. Con host, se decide por estado:

**Camino 1 — instancia ya hidratada** (`data-id ∈ hydrated`):
el runtime **se retira** inmediatamente. El listener propio de la instancia maneja el
evento con su `ev` real. Ninguna intervención del runtime. Es el cierre que impide el
doble disparo: no se cuenta “una vez”, se comprueba estado y se sale.

**Camino 2 — primera interacción, tag NO definido** (`!customElements.get(tag)`):
no existe todavía listener propio; el gesto se perdería. El runtime:
1. Marca la instancia como hidratada (antes de cualquier `await`, para que reentradas
   caigan en el camino 1).
2. `preventDefault()` + `stopImmediatePropagation()` sobre el evento original (el gesto
   “a medias” no debe surtir efecto sin componente).
3. Descarga+define el chunk (`import()` → `whenDefined`), upgradea el host.
4. **Replay**: re-emite el mismo tipo de evento sobre el target real. El listener propio,
   ya vivo, lo recibe con un `ev` normal.

**Camino 3 — primera interacción, tag YA definido** (otra instancia lo descargó antes):
el `connectedCallback` de esta instancia **ya corrió** al definirse el tag, por lo que su
listener propio ya existe y **ya recibió el evento original en burbujeo** (el runtime está
en captura, el listener en burbujeo, misma propagación). El runtime:
1. Marca la instancia como hidratada.
2. **No** descarga, **no** detiene, **no** hace replay. Emite `fud:hydrated`
   (`from: 'shared-chunk'`) y se retira.

### 5.4. Por qué el replay solo existe en el camino 2

El replay es la reparación de un gesto que ocurrió cuando no había quién lo manejara. Solo
el camino 2 tiene esa condición (tag no definido ⇒ sin listener propio). En el camino 3 el
listener propio existía en la misma propagación, así que el evento original ya se manejó;
un replay ahí produciría doble ejecución.

### 5.5. Reconstrucción del evento en el replay

El replay reconstruye el evento con su constructor original
(`new e.constructor(type, {...})`) con fallback a `Event`. Para `click` esto es completo.
Eventos que porten datos no reproducibles por el constructor (coordenadas exactas,
`dataTransfer`, etc.) quedan fuera del alcance validado; si se incorporan tipos así, el
replay deberá preservar esas propiedades explícitamente (§8).

---

## 6. Invariantes

- **Cero JS de componente hasta la interacción.** En la carga solo se descarga este
  runtime. Ningún chunk de componente se pide sin una interacción que lo dispare.
- **Una interacción = una ejecución.** Nunca dos. El cierre es el estado de instancia
  (`hydrated`), no un contador.
- **El listener propio del componente es la única vía permanente de manejo de eventos.**
  El runtime interviene como máximo una vez por instancia (su primera interacción) y solo
  para descargar/definir/reparar; después se retira por estado.
- **`ev` intacto para el usuario.** `stopPropagation` / `preventDefault` funcionan en el
  handler del usuario como en cualquier listener DOM. El runtime no envuelve ni
  reinterpreta la lógica de eventos del componente.
- **El payload es autoridad de estado; el DOM es autoridad de posición.** El componente
  no reconstruye estado desde su DOM. Estado completo serializado, se pinte o no.
- **Descarga por tag, hidratación por instancia.** Un chunk por tag; cada instancia se
  hidrata en su primera interacción.
- **`data-id` es identidad de instancia con alcance de página, solo para N3 efectivo.**
  Asignado en el emit de página (no por el programador, no por el componente aislado), en
  pasada determinista, co-emitido con el payload. Los N1/N2 puros no lo llevan.

---

## 7. Criterios de aceptación

Servido por HTTP (el SW no arranca en `file://`). Página con dos instancias del mismo tag
(`app-counter` #1 con estado `{count:3}`, #2 con `{count:10}`) y una de otro tag
(`app-toggle` #3 con `{on:true}`).

1. **Carga inicial.** En Network (filtro JS) solo se descarga `runtime.js`. Ningún
   `components/*.js`. En consola,
   `document.querySelectorAll(':not(:defined)')` lista los tres tags.

2. **Primera interacción, tag no definido (camino 2).** Click en #1 → se descarga
   `components/app-counter.js` (network-first, cacheado por el SW), el tag desaparece de
   `:not(:defined)`, y el contador incrementa en ese mismo primer click (replay).

3. **Primera interacción, tag ya definido (camino 3).** Click en #2 → **no** se
   redescarga el chunk; #2 incrementa en su primer click; se emite `fud:hydrated` con
   `from: 'shared-chunk'` y `ms: 0.0`.

4. **Interacciones siguientes (camino 1).** Clicks sucesivos en #1 y #2 los maneja el
   listener propio de cada instancia; **cada click = un incremento**, sin doble.

5. **Estado independiente por instancia.** #1 y #2 mantienen contadores separados
   (leídos de su propio `data-id`); modificar uno no altera el otro.

6. **Segundo tag.** Click en #3 → descarga `components/app-toggle.js` y togglea.

7. **Cache-first en revisita.** Tras cachear, recargar y volver a interactuar sirve el
   chunk desde el Service Worker, no desde la red (cabecera de origen del SW).

8. **INP.** En cache-hit, el INP de la interacción se mantiene muy por debajo del umbral
   “bueno” (medido: 20 ms). El INP en cache-miss (primera descarga) es el techo a vigilar.

**Log de referencia (validación real):**

```
service worker registrado
runtime cargado. cero JS de componente aún.
hidrata <app-counter> #1  [3.7ms]   (from: downloaded)
  cambio #1 → count=4
hidrata <app-counter> #2  [0.0ms]   (from: shared-chunk)
  cambio #2 → count=11
  cambio #1 → count=5
  cambio #1 → count=6
  cambio #1 → count=7
  cambio #2 → count=12
  cambio #2 → count=13
  cambio #2 → count=14
hidrata <app-toggle> #3  [3.8ms]    (from: downloaded)
  cambio #3 → OFF
```

Verificación: #1 descarga e incrementa en el primer click; #2 se hidrata sin descarga e
incrementa en el primer click; los clicks posteriores de ambos incrementan de uno en uno
sin doble; #3 descarga en su primer click.

---

## 8. Fuera de alcance

- **Estrategias de hidratación no interactivas:** `viewport` (IntersectionObserver),
  `idle` (requestIdleCallback), `eager`. Este SDD cubre solo `interaction` por evento que
  burbujea.
- **Disparo temprano por `pointerdown`** para reducir INP en cache-miss. Decidido no
  optimizar de momento; se reconsiderará con datos del INP en miss.
- **Rutas y descarga incremental por navegación.** Aquí es una sola página. La
  intercepción de navegación y el cacheo por ruta viven en el SDD de red/SW.
- **Manifest `tag → chunk` real con hashing de nombre.** Aquí es convención por ruta; el
  emit del compilador lo sustituye.
- **Materialización del grafo raíz con identidad de referencias.** El payload actual es
  estado por instancia; objetos compartidos entre componentes preservando `===` es la
  decisión pendiente de la convención `@server load() → data`. Este SDD asume estado por
  instancia sin compartición.
- **Replay de eventos con carga no reproducible** por el constructor (coordenadas,
  `dataTransfer`, etc.). El alcance validado es `click`.
- **Eventos que no burbujean** (`focus`/`blur`, `scroll`, `mouseenter`…): no delegables
  desde un capturador global; requieren otro mecanismo.
```
