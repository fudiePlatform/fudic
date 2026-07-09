# SDD — Bus de eventos e hidratación dirigida (`bus:` + `emit`)

> **Estado:** `Listo`
> **Naturaleza:** transversal. Toca **gramática/parser** (binding `bus:`), **primitiva
> de runtime** (`emit` en `@fudic/dom`), **análisis semántico** (resolución del nombre de
> evento, composición del mapa de bus), **emit de página** (`<script id="fud-bus">`), y
> **runtime de hidratación** (camino 2 ampliado). Cada parte remite al SDD que la
> implementa; este documento es el contrato que las une.
> **Validado:** prototipo funcional servido por HTTP, medido en Chromium real. Cadena
> completa (emisor → pre-hidratación de receptor → receptor vivo → recepción) verde. Log
> de aceptación en §7.

---

## 1. Contexto y objetivo

Especificar la comunicación entre **componentes desacoplados** (emisor / suscriptor) vía
un evento de aplicación que burbujea, y la **hidratación dirigida** que garantiza que el
suscriptor esté vivo **antes** de que el emisor emita, sin sacrificar el modelo perezoso
(cero JS de componente hasta la primera interacción).

Caso canónico: una lista de productos (`product-list`) y un carrito (`shopping-cart`). El
usuario pulsa "añadir" en un item; el emisor emite `carrito` con el producto; el carrito
—que el usuario nunca toca— acumula total e importe. El emisor y el suscriptor **no se
conocen**: uno emite al aire, el otro escucha un nombre de evento. Es un microfrontend con
bus de eventos DOM.

El problema que resuelve este SDD: en la carga inicial ningún componente está hidratado.
La primera interacción es un click sobre el **emisor**. Si en ese momento el suscriptor no
está vivo, el primer `carrito` se pierde. El orden causal correcto es:

```
click en item
  → (camino 2 del runtime: emisor no definido)
  → PRE-HIDRATAR el suscriptor  (su listener queda vivo)
  → hidratar el emisor
  → replay del click
  → el handler del item corre → emit('carrito', p)
  → el suscriptor, ya vivo, lo recibe
```

---

## 2. Dependencias

| SDD | Aporta |
|---|---|
| SDD-05 (Parser HTML) | reconocimiento del atributo; base sobre la que se añade el binding `bus:`. |
| SDD-07 (Bindings) | `event_binding` (decisión 28) y `@(expr)` explícita; `bus:` es un binding hermano. |
| SDD-11 (Oxc) | AST de los fragmentos `@client`; base del walk que detecta `emit(...)`. |
| SDD-12 (Semántica) | resolución del nombre de evento a literal estático; composición del mapa `emisor → [receptores]`. |
| SDD-runtime-hidratación | camino 2, `Set` de hidratados, replay; este SDD lo amplía. |
| `@fudic/dom` (runtime) | aloja la primitiva `emit` y `signal`. |
| Emit de página | serializa `fud-state` y **`fud-bus`**. |

---

## 3. Sintaxis (contrato de lenguaje)

### 3.1. Emisor — primitiva `emit` (imperativa)

El emisor **no** usa `dispatchEvent` crudo para eventos de bus. Usa la primitiva del
framework, cuya firma es el punto de anclaje del análisis:

```
emit(nombre, detail)
```

- Importada de `@fudic/dom`. **El developer solo ve `emit(name, detail)`** — el host
  **no** aparece en la firma. El compilador lo inyecta oculto: reescribe `emit('x', d)`
  a `emit.call(host, 'x', d)`, de modo que el host llega como `this` (§5.1). Exponer el
  host (como parámetro o `this` visible) filtraría un asunto del compilador al código de
  usuario; por eso se borra del tipo público.
- La primitiva **fuerza** `bubbles: true` y `composed: true`. El developer no gestiona
  la propagación ni el cruce de shadow: son responsabilidad de `emit`, no suya.
- `dispatchEvent` crudo sigue siendo válido en runtime (es DOM normal), pero **no
  participa** en hidratación dirigida: el compilador no lo reconoce como emisión de bus.
  Postura permisiva — no protegemos lo que no podemos ver.

`.fud` del emisor (canónico, verificado):

```fud
@code {
  type Producto = { id: string; nombre: string; precio: number };

  @client {
    import { emit } from '@fudic/dom';

    const productos: Producto[] = [
      { id: 'a', nombre: 'Café',  precio: 3.5 },
      { id: 'b', nombre: 'Té',    precio: 2.8 },
      { id: 'c', nombre: 'Leche', precio: 1.2 },
    ];

    function añadir(p: Producto) {
      emit('carrito', p);   // this === host; bubbles+composed los pone emit
    }
  }
}

<ul class="lista">
  @foreach (const p of productos) {
    <li>
      <span>@p.nombre</span>
      <span>@p.precio €</span>
      <button @click="@(() => añadir(p))">Añadir</button>
    </li>
  }
</ul>
```

### 3.2. Suscriptor — binding `bus:` (declarativo)

El suscriptor declara la escucha en el **template**, con un binding de prefijo dedicado:

```
bus:nombre="@handler(ev)"
bus:(expr)="@handler(ev)"
```

- `bus:carrito="@onCarrito(ev)"` — nombre **literal**.
- `bus:(EVENTOS.carrito)="@onCarrito(ev)"` — nombre como **expresión explícita** (para
  constante importada). Los paréntesis marcan expresión, igual que `@(expr)` en el resto
  de la gramática. Ambas formas son equivalentes y producen la misma entrada de bus si
  `expr` resuelve al mismo literal (ver 4.2).

`.fud` del suscriptor (canónico, verificado):

```fud
@code {
  @client {
    import { signal } from '@fudic/dom';

    const items = signal(0);
    const total = signal(0);

    function onCarrito(ev) {
      items.set(items.peek() + 1);
      total.set(total.peek() + ev.detail.precio);
    }
  }
}

<div class="carrito" bus:carrito="@onCarrito(ev)">
  <span class="badge">@items.value</span>
  <span class="importe">@total.value €</span>
</div>
```

### 3.3. `bus:` frente a `@evento` — distinción obligatoria

`@carrito="@fn(ev)"` (event_binding de host, decisión 28) y `bus:carrito="@fn(ev)"` son
**semánticamente opuestos** y el compilador **no puede inferir cuál se quería** mirando
solo el nombre:

- `@evento` → listener sobre el **host**. El host (o su shadow) es el objetivo del
  evento. Correcto para eventos que nacen en el propio componente.
- `bus:evento` → listener sobre el **ancestro común de página** (§4.3). Para eventos que
  nacen en un **emisor desacoplado** (típicamente un hermano). Un listener de host
  **nunca** dispararía, porque el evento burbujea por los ancestros del *emisor* y no
  entra en el suscriptor.

Por eso la intención es **declarada por sintaxis**, no inferida. `bus:` es opt-in
explícito a la semántica de bus, simétrico al `emit` del emisor.

### 3.4. `bus:` es prefijo reservado

A partir de este SDD, `bus:` en posición de nombre de atributo es un **prefijo de binding
reservado**, hermano de `class:` y `style:` (decisión 22). No se interpreta como atributo
con `:` literal (decisión 46, tipo `xlink:href`). No existe atributo HTML nativo con
prefijo `bus:`, por lo que el riesgo de colisión es nulo; aun así queda declarado
reservado.

---

## 4. Comportamiento

### 4.1. Detección en compilación (dos relaciones)

El compilador extrae dos relaciones de fuentes distintas:

- **`escucha: evento → [tags]`** — del **parser HTML** (SDD-05/07). Cada `bus:nombre` en
  el template de un componente registra que ese tag escucha `nombre`. No requiere Oxc: el
  nombre está en el markup.
- **`emite: tag → [eventos]`** — del **walk de Oxc** (SDD-12). Cada llamada a `emit`
  importada de `@fudic/dom`, con primer argumento resoluble a literal (§4.2), registra que
  ese tag emite ese evento.

La composición de ambas da el mapa de hidratación **`emisor → [receptores]`**: para cada
evento `e`, todos los tags que lo `emite`n dependen de todos los tags que lo `escucha`n.

### 4.2. Resolución del nombre de evento (semántica, SDD-12)

El nombre de evento —en `emit(X, …)` y en `bus:X` / `bus:(X)`— **participa en hidratación
dirigida si y solo si `X` resuelve estáticamente a un string literal**:

- Literal directo (`'carrito'`, `bus:carrito`).
- Referencia a `const` / objeto `as const`, local o importado, resoluble siguiendo el
  binding hasta su declaración (constant folding de una sola rama).

Si `X` requiere **cómputo** (indexación dinámica `EVENTOS[k]`, template literal con
interpolación, valor de retorno de una llamada): **no es error**. El binding funciona como
listener DOM normal en runtime, pero el evento **no participa** en hidratación dirigida.

El **matching** emisor↔suscriptor es **por valor de string resuelto**, mecanismo único.
`bus:carrito` (literal) y `bus:(EVENTOS.carrito)` que resuelve a `'carrito'` producen la
**misma** entrada. No hay matching por identidad de símbolo: todo se resuelve a literal y
se casa por valor. Consecuencia deseable: un junior con literal y un senior con constante
importada **convergen** en la misma entrada del mapa.

La resolubilidad **no** se comprueba en el parser: es análisis semántico (SDD-12). El
parser solo distingue las dos formas (`bus:nombre` vs `bus:(expr)`) y guarda el span.

### 4.3. Ancestro común = `document` (desugaring del suscriptor)

**Hallazgo estructural verificado.** Emisor y suscriptor son **hermanos** (no
padre/hijo). Un `CustomEvent` que burbujea desde el emisor sube por **sus** ancestros
(`emisor → #app → body → document`) y **nunca entra** en el suscriptor. Registrar el
listener sobre el host del suscriptor no dispara jamás.

Por tanto `bus:carrito="@onCarrito(ev)"` **desugariza a**:

```js
document.addEventListener('carrito', ev => onCarrito.call(host, ev));
```

- El listener va sobre **`document`** (ancestro común garantizado de toda la página),
  no sobre el host.
- El **contexto** del handler es el host (para que `onCarrito` acceda a las signals de
  su instancia).
- Se registra en `connectedCallback` del suscriptor. **Por eso** el runtime debe
  pre-hidratar el suscriptor antes que el emisor.

`document` es fijo en v1. Scoping por subárbol (un bus por región) es ampliación futura,
fuera de alcance (§8).

### 4.4. Mapa `fud-bus` (emit de página)

El emit de página serializa el mapa `emisor → [receptores]` como un único
`<script type="application/json">`, junto al `fud-state`:

```html
<script type="application/json" id="fud-bus">
{ "product-list": ["shopping-cart"] }
</script>
```

- **Clave:** tag **emisor**. **Valor:** tags que deben estar vivos **antes** de hidratarlo.
- El nombre del evento **no aparece**: ya se resolvió en compilación a una relación
  tag→tags. El runtime nunca razona sobre nombres de evento.

### 4.5. Runtime — camino 2 ampliado (`@fudic/core/dom`)

Amplía el camino 2 del SDD-runtime-hidratación. Antes de hidratar el emisor, el runtime
consulta `fud-bus[tag]` y **pre-hidrata los receptores en secuencia**:

```
camino 2 (tag emisor no definido):
  1. marcar la instancia como hidratada (antes de cualquier await)
  2. preventDefault + stopImmediatePropagation sobre el evento original
  3. preHydrateBus(tag):
       para cada receptor r en fud-bus[tag], EN SECUENCIA (no Promise.all):
         si r no está definido:
           import(chunk r) + whenDefined(r)
           upgrade de todas las instancias r[data-id] presentes
           marcar esas instancias como hidratadas
  4. import(chunk emisor) + whenDefined + upgrade del host emisor
  5. replay: re-emitir UNA vez el evento original sobre el target real
```

- **Secuencial, no `Promise.all`.** Garantiza orden receptor→emisor incluso si un receptor
  emitiera algo en su propio `connectedCallback`. Con `Promise.all` habría carrera.
- **Un solo replay**, el del gesto original (el click). `carrito` **no** se replay-ea:
  nace natural del handler del item cuando corre en el replay, y el receptor ya vivo lo
  recibe en su propia propagación.
- El runtime **no conoce** nombres de evento. Solo consume "para levantar A, levanta antes
  B (y C…)".

Caminos 1 y 3 del SDD-runtime-hidratación **no cambian**.

---

## 5. Interfaz pública

### 5.1. `@fudic/dom` — primitivas del developer

```ts
// signal: estado reactivo fine-grained.
export function signal<T>(initial: T): {
  (): T;
  peek(): T;
  set(next: T): void;
  subscribe(fn: (v: T) => void): () => void;
};

// emit: único punto de emisión de eventos de bus. Fuerza bubbles + composed.
// La superficie del developer es SOLO (name, detail): el host NO aparece en el tipo.
// El compilador inyecta el host de forma invisible reescribiendo `emit('x', d)` a
// `emit.call(host, 'x', d)`; el host llega como `this`, borrado del tipo público.
export const emit: (name: string, detail?: unknown) => void;
```

`set` itera `for (const fn of subs)` sobre el `Set` vivo (no `[...subs]`): desuscribir a
mitad de notificación surte efecto en la misma ronda.

### 5.2. `fud-bus` — contrato de emit de página

```ts
// <script type="application/json" id="fud-bus">
type FudBus = Record<string /* tag emisor */, string[] /* tags receptores */>;
```

### 5.3. Runtime — eventos de ciclo de vida (además de los del SDD base)

```
'fud:hydrated' detail: { id, tag, ms, from: 'downloaded' | 'shared-chunk' }
```

La pre-hidratación de receptores emite `fud:hydrated` por cada receptor levantado, con su
`from` correspondiente.

---

## 6. Invariantes

- **Intención declarada, no inferida.** `emit` marca emisión de bus; `bus:` marca
  suscripción de bus. El compilador nunca adivina si un `@evento` es de bus.
- **`bus:` escucha en `document`, nunca en el host.** Emisor y suscriptor son hermanos; el
  evento no entra en el host del suscriptor.
- **Nombre de evento resoluble a literal estático** o no participa (permisivo). Matching
  por valor resuelto, mecanismo único; literal y constante importada convergen.
- **Receptor vivo antes que emisor.** Pre-hidratación en secuencia en el camino 2, antes de
  hidratar el emisor y antes del replay.
- **Un gesto = una ejecución.** Un solo replay (el click). `carrito` nace natural del
  handler, no se replay-ea. Sin doble disparo.
- **`emit` fuerza `bubbles`+`composed`.** El developer no gestiona propagación ni cruce de
  shadow.
- **El runtime no conoce nombres de evento.** `fud-bus` es tag→tags, resuelto en
  compilación. El runtime consume dependencias de hidratación, no eventos.
- **`dispatchEvent` crudo y `@evento` de host siguen siendo válidos**, pero fuera del bus:
  no participan en hidratación dirigida.
- **Payload: toda instancia hidratable lleva estado completo**, leído por `data-id`
  (incluido el emisor, p. ej. la lista `productos`).

---

## 7. Criterios de aceptación

Servido por HTTP (el runtime hace `import()` de chunks; no arranca en `file://`). Página
con un emisor (`product-list #list-1`, estado `productos`) y un suscriptor
(`shopping-cart #cart-1`, estado `{items:0,total:0}`). `fud-bus`:
`{ "product-list": ["shopping-cart"] }`.

1. **Carga inicial.** En Network (filtro JS) solo `runtime.js`. Ningún `components/*.js`.
   `document.querySelectorAll(':not(:defined)')` lista `shopping-cart` y `product-list`.

2. **Primer click en un item (camino 2 con bus).** Click en "Café":
   - Se pre-hidrata `shopping-cart` **antes** que `product-list` (traza `bus:` precede a
     `emisor <product-list> vivo`).
   - Se hidrata `product-list`.
   - Replay del click → `emit('carrito', {Café})` → el carrito, ya vivo, recibe.
   - El badge pasa a `1` y el importe a `3.50 €` **en ese mismo primer click**. `carrito`
     no se pierde.

3. **Clicks siguientes (camino 1).** Añadir "Té" y "Leche": cada click = un incremento,
   sin doble. Badge `3`, importe `7.50 €`.

4. **Solo el suscriptor escucha en document.** Un `@carrito` de host (si existiera) no
   recibiría; el listener vive en `document`.

5. **Estado del emisor desde el payload.** `product-list` pinta su lista leyendo
   `productos` de `fud-state['list-1']`, no de una constante embebida en el chunk.

6. **Todo definido al final.** Tras interactuar, `:not(:defined)` está vacío.

**Log de referencia (validación real, Chromium servido por HTTP):**

```
runtime cargado. cero JS de componente aún.
camino 2: click en <product-list> #list-1, tag no definido
bus: pre-hidratar receptor <shopping-cart> ANTES del emisor <product-list>
bus: <shopping-cart> vivo [27.6ms]
emisor <product-list> #list-1 vivo [12.2ms]
fud:hydrated <product-list> #list-1 (downloaded, 12.2ms)
replay del click sobre el item real
carrito recibido: Café (+3.50€) → items=1 total=3.50€
```

Verificación de invariantes (todos verdes):
`carrito no perdido en 1er click` · `3 items sin doble` · `total 7.50€` ·
`receptor pre-hidratado antes que emisor` · `solo runtime en carga` ·
`todo definido al final`.

---

## 8. Reparto por SDD (qué toca dónde)

| Pieza | SDD que la implementa |
|---|---|
| Binding `bus:nombre` y `bus:(expr)` en el parser; prefijo reservado; spans | SDD-05 / SDD-07 (extiende decisión 28) |
| `@(expr)` en posición de nombre bajo `bus:` (delegación al balanceador) | SDD-07 |
| Detección `emit(...)` por walk de Oxc; resolución de nombre a literal | SDD-12 |
| Composición del mapa `emisor → [receptores]` | SDD-12 |
| Serialización `<script id="fud-bus">` | SDD de emit de página |
| Desugaring de `bus:` a `document.addEventListener` con host como contexto | SDD de emit de componente |
| Camino 2 ampliado (`preHydrateBus`, secuencial) | Ampliación del SDD-runtime-hidratación (§8, punto nuevo) |
| Primitiva `emit` (firma, `bubbles`+`composed`) y `signal` | SDD de `@fudic/dom` |

---

## 9. Fuera de alcance

- **Scoping del bus por subárbol.** v1 fija `document` como ancestro común único. Un bus
  por región (varios `#app`, buses anidados) es ampliación futura.
- **Warning del LSP para `@evento` crudo que colisiona con un evento de bus.** Deseable
  ("‘carrito’ se emite como bus; ¿querías `bus:carrito`?"), pero es tarea del language
  server, no del compilador batch. Fuera de este SDD.
- **Nombre de evento por cómputo** (no resoluble a literal): funciona como listener DOM,
  no participa en hidratación dirigida. No se intenta data-flow.
- **Eventos de bus que no burbujean** o con carga no reproducible en replay: el alcance
  validado es un `CustomEvent` que burbujea con `detail` serializable.
- **Materialización del grafo raíz con identidad de referencias** (objetos compartidos
  entre componentes preservando `===`): sigue siendo la decisión pendiente de
  `@server load() → data`, fuera de este SDD. El payload aquí es estado por instancia.
- **Emisión hacia el interior del propio componente** (`@evento` de host): DOM normal, sin
  cambios, no es bus.
