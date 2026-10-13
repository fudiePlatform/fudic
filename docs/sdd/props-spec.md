# Props — Especificación

Sistema de propiedades del compilador `.fud`. Cómo un componente declara su
interfaz pública, cómo un consumidor le pasa datos, y qué emite el compilador en
cada caso. Extiende `gramatica-v1-decisiones.md` con las decisiones **67–74** y **142–153**.

> **Numeración (2026-10-13, SDD-54).** Este documento numeraba 67–86, y 75–86 eran también
> decisiones de la gramática (identidad DSD, `}` crudo, layouts): dos ficheros decían cosas
> distintas con el mismo número. La gramática conserva 75–86, y las de aquí pasan a
> **142–153**, en el mismo orden: 75→142, 76→143, 77→144, 78→145, 79→146, 80→147, 81→148,
> 82→149, 83→150, 84→151, 85→152, 86→153. Las 67–74 no chocaban y no cambian.

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

**156.** **Un resto reúne las claves que el patrón no nombra** (SDD-55).
`const { label, ...resto } = props<T>()` cumple la 68: lo que no se nombra lo cubre `resto`.
Cada clave reunida es una prop como cualquier otra para quien la pasa —tiene su hueco y el padre
la escribe con `.`—, y el componente las lee juntas como un objeto, en el servidor y en el
cliente. Requiere un `T` que el fichero pueda leer (un literal, o un `type`/`interface` del mismo
`@code`): con uno importado no hay claves que reunir. Una clave reunida `Signal<T>` es reactiva
igual que una nombrada.

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

**Quién lo comprueba, y dónde.** Los dos, con la misma definición de «requerida» —la clave de
`T` **sin `?`**, no la ausencia de default— porque si difirieran el editor y el build dirían
cosas distintas de la misma línea:

- **En el editor**, TypeScript sobre la proyección: `$required<$Props, 'las que se pasaron'>`
  con `$Missing` (SDD-23 §3.3). Comprueba el tipo de verdad, así que también dice *qué* tipo
  esperaba, y el error se ancla sobre el **nombre del tag**.
- **En el build**, el pase semántico: `FUD0197` (requerida no pasada), `FUD0198` (`.prop` que
  el hijo no declara) y `FUD0199` (`slot=` que el padre no declara). Ahí no hay TypeScript, así
  que solo se comprueban nombres, y solo cuando el grafo resolvió al hijo: el
  `ComponentRegistry` contesta `propsOf`/`slotsOf`, y `undefined` significa «no lo puedo saber»
  — un build no inventa un error que no puede demostrar (BUG-23 §4.4).

Por eso el language server **no** sirve esas dos preguntas: allí la comprobación ya la hace
TypeScript, con más información, y servirlas duplicaría cada error. Y por eso `props<Foo>()`
—un tipo con nombre, no un literal— no produce ninguno de los tres en el build: el `?` vive en
`T` y ahí no se puede leer.

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

**142.** Una prop **no reactiva** es `const` en el sentido que importa: nadie la
reescribe nunca. Su valor se resuelve en compile-time / SSR y se interpola
directamente en el HTML del shadow root, y el **padre no emite nada** por ella —ni
pase, ni suscripción—, que es lo que hace de ella una constante. El hijo tampoco
emite signal ni clase por esa prop.

> El destructuring del factory es uno solo y con `let`, porque `u` reasigna el array
> entero (BUG-12 §3.3). Eso no abre una superficie de escritura: `let` es una variable
> de la closure, alcanzable solo desde dentro, y quien la mueve es el padre llamando a
> `u` — cosa que para una prop constante no ocurre nunca.

**143. — DEROGADA** por [BUG-12](./bugs/BUG-12-sin-canal-de-update.md) §4.1.

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
ellos. La parte de la 143 que sí valía sigue en pie: la prop reactiva **no es `const`**
(se declara con `let`, porque `u` la reasigna), la signal vive en el padre, y el hijo
no tiene signal interna ni reconciliación.

```js
// el hijo, en su factory
let [$dom, $shadow, value = 0] = $props;
u: ($p) => { [, , value = 0] = $p; $a(); },
```

**144.** **La declaración no fuerza el nivel.** `props<T>()` fija el contrato; el
nivel lo sigue decidiendo `nivel_efectivo`. Tener props no convierte un componente
en clase. Solo recibir una prop **reactiva** (o un consumo interno que induzca nivel,
p. ej. `@if`/`@foreach` sobre la prop) eleva el nivel.

**145.** **Variante única por cierre de proyecto.** El mismo componente puede ser N1
en una página (todas sus props constantes) y N2/N3 en otra (recibe alguna reactiva).
El compilador examina **todos** los sitios de uso del proyecto y emite **una sola
variante**, la del nivel máximo alcanzado en cualquier sitio (consistente con la
decisión de cierre ya tomada para N1/N2/N3).

### Lo que cruza lo decide el hijo (decisión 153)

**La 151 ya no dice «cruza un valor, siempre»; dice «cruza lo que el hijo declara».** El padre
escribe lo mismo en los tres casos —el identificador desnudo—, y la forma del cruce sale del
`props<T>()` del hijo:

| el hijo declara | `.value=@count` cruza | por qué |
|---|---|---|
| `value?: number` | `count()` — el valor | decisión 151, byte a byte lo que sigue abajo |
| `value: Signal<number>` | `count` — la **celda** | decisión 153: el hijo puede derivar, reenviar y escribir |
| `onSave: (n) => void` | `save` — la celda de una función | decisión 153: una arista instancia → instancia |

Que la signal cruce no contradice lo que sigue, lo **precisa**: por el cable sigue sin viajar
un objeto vivo. Lo que viaja es un **marcador** —`{"$":[owner, slot]}`, la dirección de una
casilla del tramo del dueño— y la celda la crea el **runtime** al repartir el estado, una sola
vez por dirección. Padre e hijo acaban con el mismo objeto porque nadie lo construye dos veces,
y por eso el orden en que despierta cada uno deja de importar. El detalle está en
[BUG-24](./bugs/BUG-24-signal-y-callback-no-cruzan.md); `fud-state` sigue siendo JSON.

Con `propsOf` ausente —el editor, un build que no puede leer al hijo— **no se marca ningún
canal** y todo cruza por valor, que es lo que describe el resto de esta sección.

### El valor cruza, la signal no

**Cuando el hijo declara un valor** —y es el caso por defecto— a través del shadow boundary
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

**Esta regla la lee ahora un segundo lector: el editor.** Cuando el valor de una `.prop` es
exactamente el nombre de algo declarado con `signal(...)` o `computed(...)`, lo que cruza es su
**lectura** —`titulo()`—, y hasta BUG-23 la proyección copiaba la expresión tal cual: el build
cruzaba el valor y el editor comprobaba el objeto `Signal<string>` contra el `name: string` del
hijo. Cada uno miraba una expresión distinta de la misma línea. La regla vive ahora en **una**
función del compilador (`crossing`, en `binding/crossing.ts`) que usan el emit y la proyección,
y el `()` que el editor añade es andamiaje sin mapping: ir a definición, renombrar y el hover
siguen llegando al `const titulo` del `@client`.

Se aplica en los **dos** sitios donde el emit la aplica —la `.prop` de un componente y el
atributo plano interpolado— y **no** en el texto: `<div>@titulo</div>` no pasa por el cruce, así
que emit y editor coinciden ahí en mirar el objeto. Qué *debería* hacer el texto queda abierto
(BUG-23 §7).

> **Y esto vale para las props que el hijo declara como valor.** Las que declara `Signal<T>` —o
> como una firma de función— cruzan por referencia desde [BUG-24](./bugs/BUG-24-signal-y-callback-no-cruzan.md)
> (decisión 153, arriba): ahí no hay `u` que renovar nada, porque los dos extremos tienen el
> mismo objeto. El editor aplica la misma regla y por el mismo camino — `crossing` sigue siendo
> una sola función, y la proyección le pasa a TypeScript el tipo que el hijo declaró.

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

## 5. Spread de props: `...item`

Azúcar para pasar varias props desde un objeto, filtrando por `T`. Se escribe **sin llaves**,
como un atributo más: `...` seguido del objeto, que es un nombre o un camino de nombres
(`...item`, `...fila.datos`). Implementado en [SDD-54](./SDD-54-pendientes-v1.md).

```fud
@foreach (const item of items) key (item.id) {
  <app-card ...item></app-card>
}
```

Donde `app-card` declara:

```fud
const { id, title, price, tag } = props<{
  id: string; title: string; price: number; tag: string
}>();
```

### Reglas

**146.** `...item` se expande en compile-time a un property binding por cada clave
de **`T`**, tomada de `item`. Es equivalente exacto a:

```fud
<app-card .id="@item.id" .title="@item.title"
          .price="@item.price" .tag="@item.tag"></app-card>
```

Lo que sigue a `...` es el objeto y nada más: un nombre o un camino de nombres, y el atributo no
lleva valor. Cualquier otra forma (`...`, `...a-b`, `...item="x"`) es `FUD0991`. Sobre un
elemento nativo el spread escribe atributos (157). Sobre el propio host del componente o su
`<template shadowrootmode>` es `FUD0992`: ninguno es un elemento en el que la vista escriba
(precisada en SDD-55; en SDD-54 también lo era sobre un nativo).

Un `.prop` escrito en el mismo host **gana** su clave, esté antes o después del spread: es la
afirmación más concreta de las dos. Con dos spreads en un host gana el último en las claves que
tenga, y «tenerla» es no ser `undefined`, que es también lo que el destructuring del hijo lee
como ausente.

**147.** El filtro es por las claves de **`T`**, no por las de `item`. Si `item` tiene
10 atributos y `T` declara 4, se pasan solo esas 4; las otras 6 se ignoran.

**148.** Cada prop expandida es reactiva o constante según lo que `item` lleve
(decisión 74). Si `item` viene de un `@foreach` sobre datos SSR no reactivos, todas
las claves son **valores constantes** → el hijo las resuelve como `const` en el HTML,
**N1, cero JS**, aunque la sintaxis expandida use `.prop`. Si el objeto lee algo que se mueve,
el hijo hidrata y recibe las props de nuevo cuando ese algo cambia. Una fila de un `@foreach`
con `key` que conserva su clave y cambia sus datos se las vuelve a dar a su hijo; esto vale
igual para un `.prop="@item.x"` escrito a mano (SDD-54).

**149.** Si `item` **no** tiene una clave que `T` declara: error de compilación si la
prop es requerida; se usa el default si es opcional (consistente con decisiones
71–73). El error lo da TypeScript, en el editor y en el build: la proyección comprueba el
objeto contra `T` menos lo que el host escribe a mano, y el error cae sobre el objeto. Una clave
de tipo equivocado también es error; una clave de más no lo es (147).

**157.** **Sobre un elemento nativo, el spread escribe atributos** (SDD-55).
`<input ...resto>` escribe cada clave escalar del objeto: un texto o un número como su texto,
`true` como atributo booleano vacío; `false`, `null` y `undefined` lo dejan fuera, como
`attr=@valor`. Un objeto, una función o un `symbol` no es un atributo y se salta, salvo un
`trustedUrl(…)` en un atributo URL. Nunca escribe un `on*` (139) ni un nombre que no sea de
atributo, y un atributo URL pasa por el mismo guardia (140). Lo que el elemento escribe a mano
gana su nombre esté donde esté el spread; con dos spreads gana el posterior en lo que escribe. Es
una única función pura en servidor y navegador; al actualizar, quita los atributos que el objeto
ya no escribe.

---

## 6. Two-way binding: `bind:` — ANULADO

> **Anulado por decisión de Pedro el 2026-10-13 ([SDD-54](./SDD-54-pendientes-v1.md)).**
> `bind:` iba a ser azúcar sobre una prop de valor más una prop callback, y la decisión 153 ya
> da las dos cosas sin sintaxis nueva: un hijo que declara `onSave: (n: number) => void` recibe
> la función del padre y la llama, y uno que declara `value: Signal<number>` recibe la signal
> del padre y puede escribirla. `examples/basic`, ruta `/signal-prop`, lo demuestra en el
> navegador con las dos. Con eso no queda nada que desazucarar, ni un nombre de callback que
> fijar, ni una 152 que comprobar.

```fud
<!-- el padre: el canal de vuelta es una prop como cualquier otra -->
<signal-form .onSave=@sumar></signal-form>
<signal-display .value=@count></signal-display>
```

Lo que sigue en pie de esta sección son las dos reglas que no dependían de `bind:`.

### El canal de vuelta es una prop, no un evento

**150.** El canal de vuelta se implementa como un **callback pasado como prop**
(modelo React `onChange`), **no** con `dispatchEvent` / `addEventListener` entre
padre e hijo. El padre pasa una función por property binding; el hijo la invoca. Es
una llamada directa a una referencia de función: **no cruza el shadow boundary como
evento, no hay listener entre componentes, no hay problema de propagación de shadow.**
Desde la anulación de `bind:` no hay azúcar encima: la prop callback se escribe a mano, y
cruza por referencia (153).

**151.** **Una prop declarada como VALOR cruza su valor, nunca el objeto signal.** La
fuente de la verdad permanece en el padre. Se preserva el aislamiento de islas (principio de
las decisiones 74 y 142–145).

> **151 dejó de ser «cruza un valor, siempre»: hoy lo decide el hijo (decisión 153).** El
> enunciado de arriba describe el caso por defecto y sigue siendo lo que se emite para una prop
> declarada `value?: number`. Una declarada `Signal<T>` —o como una firma de función— cruza por
> **referencia, con identidad real**, mediante un marcador `{"$":[owner, slot]}` en la casilla
> del hijo y una celda única que el runtime materializa al repartir el estado
> ([BUG-24](./bugs/BUG-24-signal-y-callback-no-cruzan.md)). Padre e hijo tienen el mismo objeto,
> así que el hijo puede derivar de ella, reenviarla a un nieto y escribirla — y un callback es
> el mismo marcador con la celda vacía. El aislamiento de islas no se rompe: la fuente de la
> verdad sigue siendo **una**, y precisamente por eso deja de haber espejo que se retrase un
> salto por nivel. La firma con la que la regla distingue las dos formas la dejó
> [BUG-23 §3.1](./bugs/BUG-23-arroba-valvula-de-escape.md) — `crossing` devolviendo `Crossing`.

**152. — DEROGADA** con `bind:` (SDD-54).

> *Decía:* «`bind:value` exige que el hijo declare la prop de valor (`value`) **y** la prop
> callback correspondiente. Si el hijo no declara el callback, `bind:` no tiene canal de vuelta
> que enganchar → error de compilación.»

Sin `bind:` no hay nada que exigir: una prop callback que el hijo no declara es la misma prop de
más que cualquier otra, y la dice TypeScript.

---

## 7. Decisiones abiertas

- Formalización EBNF de `props<T>()` y de `...item` en `gramatica-v1-decisiones.md`.

Las otras dos se cerraron con la anulación de `bind:` (SDD-54): no hay nombre de callback que
fijar ni `bind:` que meter en un spread.

---

## Índice de decisiones (67–74, 142–153, 156–157)

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
| 142 | Props | Prop no reactiva → `const`, resuelta en SSR, cero JS (antes 75) |
| 143 | Props | ~~Prop reactiva → setter en el hijo~~ · **derogada**: el canal es `u(props)`, uno solo y posicional ([BUG-12](./bugs/BUG-12-sin-canal-de-update.md)) (antes 76) |
| 144 | Props | La declaración no fuerza el nivel (antes 77) |
| 145 | Props | Variante única por cierre de proyecto (antes 78) |
| 146 | Spread | `...item`, sin llaves, expande a property bindings contra `T`; un `.prop` explícito gana su clave; `FUD0991`, `FUD0992` (antes 79; SDD-54). **Precisada por la 157** |
| 147 | Spread | Filtro por claves de `T`, no de `item` (antes 80) |
| 148 | Spread | Reactividad de cada clave según lo que lleve `item`; una fila que cambia de datos las vuelve a dar (antes 81; SDD-54) |
| 149 | Spread | Clave ausente en `item`: error si requerida (TypeScript, sobre el objeto), default si opcional (antes 82) |
| 150 | Callback | Canal de vuelta por callback-prop, no por eventos; sin azúcar desde la anulación de `bind:` (antes 83) |
| 151 | Props | Una prop declarada **como valor** cruza su valor, nunca el objeto signal. Reescrita por la 153: dejó de ser «siempre» (antes 84) |
| 152 | Two-way | ~~`bind:` exige prop de valor + prop callback declaradas~~ · **derogada** con `bind:` (antes 85; SDD-54) |
| 153 | Props | **Lo que cruza lo decide el hijo**: `Signal<T>` o una firma de función cruzan por **referencia** —una celda que crea el runtime—, lo demás cruza su valor ([BUG-24](./bugs/BUG-24-signal-y-callback-no-cruzan.md)). Sin poder leer al hijo no se marca canal alguno. Hace innecesario `bind:` (antes 86) |
| 156 | Props | Un resto `...resto` reúne las claves de `T` que el patrón no nombra; cada una es una prop con su hueco, y el componente las lee como un objeto (SDD-55) |
| 157 | Spread | Sobre un elemento nativo, `...obj` escribe sus escalares como atributos (sin `on*`, URL guardadas, lo explícito gana) y quita los que deja de escribir (SDD-55). Precisa la 146 |
