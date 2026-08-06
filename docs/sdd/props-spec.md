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
HTML) y al emit cliente (donde una prop reactiva abre el canal `u`). La zona neutra
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
  el default vuelve a aplicarse, porque va en el propio patrón de reasignación de
  `u`: `[, , variant = 'default'] = $p`. Una actualización puede traer `undefined`
  otra vez, así que el fallback se repite en cada paso, no solo en el alta.

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
| `.value="@count"` (signal) | Reactiva | `u(props)` en el hijo + subscription en el padre. |

### Materialización en el hijo

**75.** Una prop **no reactiva** es `const` en el sentido que importa: nadie la
reescribe nunca. Su valor se resuelve en compile-time / SSR y se interpola
directamente en el HTML del shadow root, y el **padre no emite nada** por ella —ni
pase, ni suscripción—, que es lo que hace de ella una constante. El hijo tampoco
emite signal ni clase por esa prop.

> El destructuring del factory es uno solo y con `let`, porque `u` reasigna el array
> entero (BUG-12 §3.3). Eso no abre una superficie de escritura: `let` es una variable
> de la closure, alcanzable solo desde dentro, y quien la mueve es el padre llamando a
> `u` — cosa que para una prop constante no ocurre nunca.

**76. — DEROGADA** por [BUG-12](./bugs/BUG-12-sin-canal-de-update.md) §4.1.

> *Decía:* «Una prop **reactiva** no puede ser `const` (necesita reasignación). El hijo
> emite un **setter** que escribe el nodo del DOM directamente.»

Un setter por prop es incompatible con el diseño de closure de SDD-15: las props del
hijo son variables de la closure del factory, y un setter en la clase no las alcanza
sin un canal hacia el controlador — que es exactamente lo que habría que añadir. Y
multiplicaría la superficie pública por el número de props, obligando a nombrarlas en
el artefacto emitido, cuando el payload no lleva esquema: solo valores, en orden.

**El canal es `u`, y es uno solo.** El controlador expone
`u(props: readonly unknown[])`, y `FudicElement` el punto de entrada del mismo nombre
—el **tercero**, hermano de `h` y `c`, no un callback del navegador—. Reasigna los
bindings de prop desde el array posicional y reaplica las escrituras que dependen de
ellos. La parte de la 76 que sí valía sigue en pie: la prop reactiva **no es `const`**
(se declara con `let`, porque `u` la reasigna), la signal vive en el padre, y el hijo
no tiene signal interna ni reconciliación.

```js
// el hijo, en su factory
let [$dom, $shadow, value = 0] = $props;
u: ($p) => { [, , value = 0] = $p; $a(); },
```

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
subscription vuelve a escribir el valor en el hijo, llamando a su `u`.

```js
// En el $s() del padre, el punto donde create e hydrate convergen:
$n6.u([, , count.peek()]);                                  // valor inicial
$d.push(count.subscribe(($v) => { $n6.u([, , $v]); }));     // cambios
```

Cruza un número. La signal del padre se queda en el padre. Cada shadow root es una
isla, y por eso el hijo no puede suscribirse a nada: quien posee el valor es quien lo
vuelve a escribir. El array es el payload **entero** del hijo, en el orden en que él
destructura, porque su `u` reasigna todas las props que destructura — mandar solo la
que se movió devolvería las demás a su default.

Que esto no es una preferencia sino una restricción lo cierra SDD-17: el tramo de
props de una instancia hidratada viaja **serializado** en `fud-state`, y una signal es
una función con un `Set` vivo dentro. No sobrevive a la serialización, ni podría.

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

emitido — el hijo no expone nada por prop: `u` toma el array posicional entero y `$a()`
lo aplica. `$a` es la única función que escribe un valor en un nodo, y la llaman `c` y
`u`; `h` no, porque el servidor ya pintó ese texto:

```js
customElements.define('app-display', class extends FudicElement {
  static c($props) {
    let $n0;
    const $r = [], $d = [], $w = [];
    let [$dom, $shadow, value] = $props;

    const $m = () => { for (const $n of $r) $dom.append($shadow, $n); };
    const $s = () => {};
    const $a = () => {
      let $v;
      $v = String((value) ?? '');
      if ($v !== $w[0]) { $w[0] = $v; $dom.setText($n0, $v); }
    };

    return {
      c: () => { /* fabrica */ $a(); $m(); $s(); },
      h: () => { /* adopta  */ $s(); },
      u: ($p) => { [, , value] = $p; $a(); },
      r: () => { $n0 = $shadow = null; $d.forEach((d) => d()); },
    };
  }
});
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

emitido — el pase inicial y la suscripción viven en `$s()`, el punto donde create e
hydrate convergen, y el disposer en `$d`:

```js
const $s = () => {
  $n1.u([, , count.peek()]);                                  // valor inicial
  $d.push(count.subscribe(($v) => { $n1.u([, , $v]); }));      // cambios
};
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

emitido — el hijo destructura las dos, en orden, y `u` reasigna las dos. `label` sigue
siendo constante en el sentido que importa: nadie la mueve nunca, así que su escritura
en `$a()` no vuelve a tocar el DOM (la compara `$w` y sale igual):

```js
let [$dom, $shadow, label, value] = $props;
u: ($p) => { [, , label, value] = $p; $a(); },
```

**parent:**

```fud
<app-display label="Total" .value="@count"></app-display>
```

emitido — el padre manda el payload **entero** del hijo, `label` incluida. No es
redundancia: `u` reasigna todas las props que destructura, así que un array que solo
llevara `value` devolvería `label` a `undefined` y `$a()` borraría el texto que el
servidor pintó.

```js
$n1.u([, , "Total", count.peek()]);
$d.push(count.subscribe(($v) => { $n1.u([, , "Total", $v]); }));
```

Una prop que el host **no nombra** sí se queda como hueco: no hay valor que el padre
pueda mandar, y el default del hijo es exactamente el que ya tenía.

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
callback: baja el valor por `u`, sube el cambio por la función. La fuente de la
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

`name` vive siempre en el padre. Baja como valor por `u`, sube como argumento
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
| 76 | Props | ~~Prop reactiva → setter en el hijo~~ · **derogada**: el canal es `u(props)`, uno solo y posicional ([BUG-12](./bugs/BUG-12-sin-canal-de-update.md)) |
| 77 | Props | La declaración no fuerza el nivel |
| 78 | Props | Variante única por cierre de proyecto |
| 79 | Spread | `{...item}` expande a property bindings contra `T` |
| 80 | Spread | Filtro por claves de `T`, no de `item` |
| 81 | Spread | Reactividad de cada clave según lo que lleve `item` |
| 82 | Spread | Clave ausente en `item`: error si requerida, default si opcional |
| 83 | Two-way | Canal de vuelta por callback-prop, no por eventos |
| 84 | Two-way | Ninguna signal cruza el boundary; `bind:` es azúcar |
| 85 | Two-way | `bind:` exige prop de valor + prop callback declaradas |
