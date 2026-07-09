# Props — Especificación

Sistema de propiedades del compilador `.fud`. Cómo un componente declara su
interfaz pública, cómo un consumidor le pasa datos, y qué emite el compilador en
cada caso. Extiende `gramatica-v1-decisiones.md` con las decisiones **67–78**.

Convención de niveles (ya establecida): `nivel_efectivo = max(nivel_intrínseco,
nivel_inducido_por_props_entrantes)`. Este documento no redefine los niveles; fija
cómo las props participan en esa fórmula.

---

## 1. Declaración de props: `props<T>()`

Un componente declara su interfaz pública con una única llamada a `props<T>()`
dentro de `@code`, en la **zona neutra**.

```fud
@code {
  const { title, variant } = props<{ title: string; variant: 'a' | 'b' }>();
}

<span>@title</span>
```

### Naturaleza

`props<T>()` **no es una primitiva de runtime**. Es una marca que el compilador
reconoce por nombre en compile-time. El compilador:

1. Extrae `T` → la interfaz pública del componente.
2. Extrae los nombres del destructuring → los identificadores usables en el markup.
3. Extrae el tipo de cada prop desde `T` → para el LSP, la validación semántica y
   la coerción de atributos.
4. **Borra la línea.** En el `.js` emitido no existe `props`, ni la llamada, ni
   ningún import. No queda rastro en runtime.

### Tipo ambiental

Vive solo en los `.d.ts` del proyecto. Nunca se importa ni se ejecuta:

```ts
declare function props<T>(): T;
```

`props<T>()` devuelve `T` para que el destructuring tipe correctamente en el editor.
El compilador nunca ejecuta esta función: la intercepta y la elimina.

### Reglas

**67.** `props<T>()` se declara en la **zona neutra** de `@code`, no en `@client`
ni `@server`. Razón: la declaración es un **contrato de tipos**, no estado de
instancia. Sirve por igual al emit SSR (donde una prop constante se resuelve en el
HTML) y al emit cliente (donde una prop reactiva emite un setter). La zona neutra
—"tipos, constantes puras, se resuelve sin efectos"— es su lugar natural.

**68.** El destructuring debe cubrir **todas** las claves de `T`. `T` define la
interfaz; el destructuring solo nombra esas claves para usarlas en el markup. No se
permite destructurar un subconjunto: la interfaz pública y lo que el componente
puede referenciar son lo mismo.

**69.** Cero o una llamada a `props<T>()` por componente (consistente con "cero o un
`@code`", decisión 33.d). Un componente sin `props<T>()` no expone interfaz de
entrada.

**70.** **Solo lo declarado es visible para el consumidor.** Un consumidor que pase
una clave ausente de `T` es error de compilación (semántico). Esto es el modelo
Svelte: la interfaz es explícita y cerrada.

---

## 2. Requerido, opcional y valores por defecto

Requerido vs opcional lo expresa **`T`** con el modificador `?` de TypeScript. No
hay sintaxis adicional.

```fud
@code {
  const { variant = 'default', value } = props<{
    variant?: 'default' | 'highlight';   // opcional
    value: number;                        // requerida
  }>();
}
```

### Reglas

**71.** Prop **requerida** = clave sin `?` en `T`. Si el consumidor no la pasa →
error de compilación (semántico).

**72.** Prop **opcional** = clave con `?` en `T`. El consumidor puede omitirla.

**73.** **Valor por defecto** = valor en el destructuring (`variant = 'default'`).
Aplica cuando el consumidor no pasa la prop. Solo tiene sentido en props opcionales;
un default en una prop requerida es contradicción (el semántico lo señala).

- Si el default se usa porque el consumidor no pasa nada → la prop es **constante**
  y se resuelve en SSR (ver §3), cero JS.
- Si el consumidor pasa una fuente **reactiva** cuyo valor inicial es `undefined` →
  el setter aplica el fallback: `set variant(v) { apply(v ?? 'default'); }`.

---

## 3. Reactividad: la decide el consumidor, no la declaración

La misma declaración `props<T>()` sirve para un consumo constante o reactivo. **Es
el punto de instanciación (el padre) quien determina si una prop es reactiva.** El
componente hijo no lo decide por sí mismo.

### Regla base

**74.** Una prop es **no reactiva** cuando el valor que cruza es constante (atributo
literal o expresión que evalúa a un valor). Es **reactiva** cuando lo que el padre
pasa es una fuente reactiva (una signal), por el canal de property binding.

| Cómo pasa el padre la prop | Reactividad | Materialización en el hijo |
|---|---|---|
| `label="Total"` (atributo literal) | No reactiva | `const`, resuelta en SSR, en el HTML. Cero JS. |
| `.value="@(x)"` que evalúa a valor | No reactiva | `const`, resuelta en SSR. Cero JS. |
| `.value="@count"` (signal) | Reactiva | Setter en el hijo + subscription en el padre. |

### Materialización en el hijo

**75.** Una prop **no reactiva** se compila como `const` en el hijo. Su valor se
resuelve en compile-time / SSR y se interpola directamente en el HTML del shadow
root. El hijo **no emite setter, ni signal, ni clase** por esa prop. Un `const a =
"x"` no se puede modificar: es exactamente la semántica de una prop que no cambia.

**76.** Una prop **reactiva** no puede ser `const` (necesita reasignación). El hijo
emite un **setter** que escribe el nodo del DOM directamente. Esto es N2: nodo vivo
+ setter, **sin signal interna, sin lifecycle de reconciliación**. La signal vive en
el padre; el hijo solo expone el punto de escritura.

**77.** **La declaración no fuerza el nivel.** `props<T>()` fija el contrato; el
nivel lo sigue decidiendo `nivel_efectivo`. Tener props no convierte un componente
en clase. Solo recibir una prop **reactiva** (o un consumo interno que induzca nivel,
p. ej. `@if`/`@foreach` sobre la prop) eleva el nivel.

**78.** **Variante única por cierre de proyecto.** El mismo componente puede ser N1
en una página (todas sus props constantes) y N2/N3 en otra (recibe alguna reactiva).
El compilador examina **todos** los sitios de uso del proyecto y emite **una sola
variante**, la del nivel máximo alcanzado en cualquier sitio (consistente con la
decisión de cierre ya tomada para N1/N2/N3).

### El valor cruza, la signal no

**Principio transversal (ya fijado, reafirmado aquí):** a través del shadow boundary
cruza un **valor**, nunca el objeto signal. El padre conserva su signal; en su propia
subscription reescribe la prop del hijo por el setter.

```js
// En el connectedCallback del padre (N3, posee ctx.count):
this.#display.value = this.#count.peek();                 // valor inicial
this.#unsub = this.#count.subscribe(v => { this.#display.value = v; });
```

Cruza un número (`this.#display.value = v`). La signal del padre se queda en el
padre. Cada shadow root es una isla.

---

## 4. Ejemplos canónicos

### 4.1 Una prop reactiva (N2)

**child — `app-display.fud`**

```fud
@code {
  const { value } = props<{ value: number }>();
}

<span class="val">@value</span>
```

emitido:

```js
class AppDisplay extends HTMLElement {
  #val;
  connectedCallback() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    this.#val = root.childNodes[1];        // [0]=<style>, [1]=<span>
  }
  set value(v) { if (this.#val) this.#val.textContent = String(v); }
}
customElements.define('app-display', AppDisplay);
```

**parent — `app-counter.fud`**

```fud
@code {
  @client {
    const count = signal(0);
    function inc() { count.set(count.peek() + 1); }
  }
}

<button @click="@inc">+</button>
<app-display .value="@count"></app-display>
```

emitido:

```js
class AppCounter extends HTMLElement {
  #count = signal(0);
  #btn; #display; #unsub;

  connectedCallback() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    this.#btn = root.childNodes[1];
    this.#display = root.childNodes[2];

    this.#btn.addEventListener('click', () => this.#count.set(this.#count.peek() + 1));

    this.#display.value = this.#count.peek();                 // set inicial
    this.#unsub = this.#count.subscribe(v => { this.#display.value = v; });
  }
  disconnectedCallback() { this.#unsub?.(); }
}
customElements.define('app-counter', AppCounter);
```

### 4.2 Dos props: una constante, una reactiva

**child — `app-display.fud`**

```fud
@code {
  const { label, value } = props<{ label: string; value: number }>();
}

<span class="lbl">@label</span>
<span class="val">@value</span>
```

emitido — `label` es constante (llega literal), va al HTML en SSR y **no emite
setter**; solo `value` (reactiva) lo emite:

```js
class AppDisplay extends HTMLElement {
  #val;
  connectedCallback() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    this.#val = root.childNodes[2];        // [1]=<span.lbl> ya tiene el texto del SSR
  }
  set value(v) { if (this.#val) this.#val.textContent = String(v); }
}
customElements.define('app-display', AppDisplay);
```

**parent:**

```fud
<app-display label="Total" .value="@count"></app-display>
```

emitido — `label` no se asigna (ya está en el HTML del hijo); solo `value`:

```js
this.#display.value = this.#count.peek();
this.#unsub = this.#count.subscribe(v => { this.#display.value = v; });
```

### 4.3 Valor inicial constante que siembra una signal propia del hijo

El padre pasa un valor **constante** como semilla. El hijo lo usa para inicializar
**su propia** signal y la muta libremente. **No hay canal de vuelta; el padre no se
entera de los cambios del hijo.** Están desacoplados.

**child — `app-counter.fud`**

```fud
@code {
  const { start } = props<{ start: number }>();

  @client {
    const count = signal(start);          // la prop const siembra la signal propia
    function inc() { count.set(count.peek() + 1); }
  }
}

<button @click="@inc">@count</button>
```

**parent:**

```fud
<app-counter .start="@10"></app-counter>
```

`start` cruza una vez como valor (constante). `count` es del hijo, la muta el hijo.
El hijo aquí es **N3** por su propia signal, no por la prop. La prop es solo el seed.

---

## 5. Spread de props: `{...item}`

Azúcar para pasar varias props desde un objeto, filtrando por `T`.

```fud
@foreach (const item of items) {
  <app-card {...item}></app-card>
}
```

Donde `app-card` declara:

```fud
const { id, title, price, tag } = props<{
  id: string; title: string; price: number; tag: string
}>();
```

### Reglas

**79.** `{...item}` se expande en compile-time a un property binding por cada clave
de **`T`**, tomada de `item`. Es equivalente exacto a:

```fud
<app-card .id="@item.id" .title="@item.title"
          .price="@item.price" .tag="@item.tag"></app-card>
```

**80.** El filtro es por las claves de **`T`**, no por las de `item`. Si `item` tiene
10 atributos y `T` declara 4, se pasan solo esas 4; las otras 6 se ignoran.

**81.** Cada prop expandida es reactiva o constante según lo que `item` lleve
(decisión 74). Si `item` viene de un `@foreach` sobre datos SSR no reactivos, todas
las claves son **valores constantes** → el hijo las resuelve como `const` en el HTML,
**N1, cero JS**, aunque la sintaxis expandida use `.prop`.

**82.** Si `item` **no** tiene una clave que `T` declara: error de compilación si la
prop es requerida; se usa el default si es opcional (consistente con decisiones
71–73).

---

## 6. Two-way binding: `bind:`

Sintaxis distinta para semántica distinta:

- `.value="@x"` → **one-way**. El valor baja del padre al hijo. El hijo no puede
  cambiar la fuente del padre.
- `bind:value="@x"` → **two-way**. El valor baja **y** el hijo puede actualizar la
  fuente del padre.

La distinción es necesaria porque el compilador debe saber si emitir solo el canal
descendente o también el ascendente. `bind:` encaja con la notación de directivas ya
existente (`class:`, `style:`, decisión 22).

### Mecanismo: callback como prop (no eventos)

**83.** El canal de vuelta se implementa como un **callback pasado como prop**
(modelo React `onChange`), **no** con `dispatchEvent` / `addEventListener` entre
padre e hijo. El padre pasa una función por property binding; el hijo la invoca. Es
una llamada directa a una referencia de función: **no cruza el shadow boundary como
evento, no hay listener entre componentes, no hay problema de propagación de shadow.**

**84.** **Ninguna signal cruza el boundary.** `bind:` es azúcar sobre one-way +
callback: baja el valor por el setter, sube el cambio por la función. La fuente de la
verdad permanece en el padre. Se preserva el aislamiento de islas (principio de la
decisión 74–78).

### Desazucarado

`bind:value="@name"` en el padre se compila a dos property bindings: `.value` (baja)
+ un callback (sube).

**child — `app-input.fud`**

```fud
@code {
  const { value, onChange } = props<{
    value: string;
    onChange: (v: string) => void;
  }>();

  @client {
    function onInput(e) { onChange(e.target.value); }
  }
}

<input .value="@value" @input="@onInput">
```

emitido:

```js
class AppInput extends HTMLElement {
  #input; #onChange;
  connectedCallback() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    this.#input = root.childNodes[1];
    this.#input.addEventListener('input', e => this.#onChange?.(e.target.value));
  }
  set value(v) { if (this.#input) this.#input.value = String(v); }
  set onChange(fn) { this.#onChange = fn; }
}
customElements.define('app-input', AppInput);
```

> El `addEventListener` del `<input>` es DOM interno del hijo sobre su propio nodo;
> **no** cruza ningún boundary. Lo que se elimina frente a la solución de eventos es
> el `dispatchEvent` / listener **entre** padre e hijo.

**parent — `app-form.fud`**

```fud
@code {
  @client {
    const name = signal('');
    function setName(v) { name.set(v); }
  }
}

<app-input bind:value="@name"></app-input>
<p>Hola @name</p>
```

emitido — `bind:value` se desazucara a `.value` (baja) + `.onChange` (sube):

```js
class AppForm extends HTMLElement {
  #name = signal('');
  #input; #p; #unsub;

  connectedCallback() {
    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    this.#input = root.childNodes[1];
    this.#p = root.childNodes[2];

    // bind:value  →  baja el valor + sube por callback
    this.#input.value = this.#name.peek();
    this.#unsub = this.#name.subscribe(v => { this.#input.value = v; });
    this.#input.onChange = v => this.#name.set(v);

    // <p>Hola @name</p>
    this.#p.childNodes[1].textContent = this.#name.peek();
    this.#name.subscribe(v => { this.#p.childNodes[1].textContent = v; });
  }
  disconnectedCallback() { this.#unsub?.(); }
}
customElements.define('app-form', AppForm);
```

Las tres líneas del `bind:`:

```js
this.#input.value = this.#name.peek();                                // baja: inicial
this.#unsub = this.#name.subscribe(v => { this.#input.value = v; });  // baja: cambios del padre
this.#input.onChange = v => this.#name.set(v);                        // sube: cambios del hijo
```

`name` vive siempre en el padre. Baja como valor por el setter, sube como argumento
por el callback. La signal nunca cruza.

### Requisito semántico

**85.** `bind:value` exige que el hijo declare la prop de valor (`value`) **y** la
prop callback correspondiente. Si el hijo no declara el callback, `bind:` no tiene
canal de vuelta que enganchar → error de compilación.

---

## 7. Decisiones abiertas (no cerradas en esta sesión)

- **Nombre de la prop callback en `bind:`.** El desazucarado necesita un nombre fijo
  para el callback (`onChange`, u `on<Prop>Change` derivado del nombre de la prop).
  Pendiente de fijar el convenio.
- Formalización EBNF de `props<T>()`, `{...item}` y `bind:` en
  `gramatica-v1-decisiones.md`.
- Interacción del spread con `bind:` (¿`bind:` dentro de un spread? probablemente
  no).

---

## Índice de decisiones (67–85)

| # | Sección | Resumen |
|---|---------|---------|
| 67 | Props | `props<T>()` en zona neutra (contrato, no estado) |
| 68 | Props | El destructuring cubre todas las claves de `T` |
| 69 | Props | Cero o una `props<T>()` por componente |
| 70 | Props | Solo lo declarado es visible al consumidor |
| 71 | Props | Requerida = clave sin `?`; omitirla es error |
| 72 | Props | Opcional = clave con `?` |
| 73 | Props | Default = valor en el destructuring |
| 74 | Props | La reactividad la decide el consumidor, no la declaración |
| 75 | Props | Prop no reactiva → `const`, resuelta en SSR, cero JS |
| 76 | Props | Prop reactiva → setter en el hijo, sin signal interna (N2) |
| 77 | Props | La declaración no fuerza el nivel |
| 78 | Props | Variante única por cierre de proyecto |
| 79 | Spread | `{...item}` expande a property bindings contra `T` |
| 80 | Spread | Filtro por claves de `T`, no de `item` |
| 81 | Spread | Reactividad de cada clave según lo que lleve `item` |
| 82 | Spread | Clave ausente en `item`: error si requerida, default si opcional |
| 83 | Two-way | Canal de vuelta por callback-prop, no por eventos |
| 84 | Two-way | Ninguna signal cruza el boundary; `bind:` es azúcar |
| 85 | Two-way | `bind:` exige prop de valor + prop callback declaradas |
