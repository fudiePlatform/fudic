# BUG-11 — Un hijo que recibe un valor no tiene canal de actualización

> **Estado:** `Listo`
> **Corrige:** [SDD-15 — Emit](../SDD-15-emit.md) §3.7, §7 ·
> [props-spec](../props-spec.md) decisión 76
> **Paquetes:** `@fudic/core` · `@fudic/compiler`
> **Rama sugerida:** `fix/bug-11-update-de-props`
> **Depende de:** nada. Va **antes** que el resto de la rama de cliente de SDD-15 (event
> bindings, suscripciones finas): esas tareas se escriben contra el contrato del controlador,
> y el contrato es justo lo que está mal.

---

## 1. Contexto y síntoma

Dos componentes, el caso más pequeño que existe:

```fud
@* app-display.fud — el hijo *@
@code {
  const { value } = props<{ value: number }>();
}
<span class="val">@value</span>
```

```fud
@* app-counter.fud — el padre *@
@code {
  @client {
    const count = signal(0);
    function inc() { count.set(count.peek() + 1); }
  }
}
<button @click="@inc">+</button>
<app-display .value="@count"></app-display>
```

El padre incrementa su signal. El hijo **no se entera, y no puede enterarse**: no hay ninguna
función, propiedad ni atributo —ni en el artefacto emitido, ni en `FudicElement`, ni en el
runtime— capaz de escribir `value` en una instancia viva de `app-display`.

No es que el canal esté mal implementado: **no existe**, y §3.7 de SDD-15 dice por escrito que
no debe existir.

### Lo que sí se ve hoy

El chunk emitido de un componente con props ([`app-card.client.mjs:9`](../../../packages/compiler/test/emit/__golden__/app-card.client.mjs#L9)):

```js
let [$dom, $shadow, title, variant = 'default'] = $props;
```

Una línea, dentro de `static c($props)`, ejecutada **una vez** al construir el controlador.
`title` es una variable local de esa closure. El objeto que el factory devuelve es `{c, h, r}`:
ninguno de los tres la toca.

Y el host de un hijo, en el cuerpo de fabricación del padre
([`app-card.client.mjs:45-46`](../../../packages/compiler/test/emit/__golden__/app-card.client.mjs#L45-L46)):

```js
$n6 = $dom.element("app-button");
$dom.setAttr($n6, 'data-adopt', "app-button");
```

El elemento y el specifier de estilo. **Ninguna prop.**

### El caso que parecía salvarlo, y no lo hace

La objeción natural es que si el padre pasa la **signal** por referencia el hijo se enlaza solo
y no hace falta nada más. No es una opción del diseño:

- [props-spec, decisión 84](../props-spec.md): *«Ninguna signal cruza el boundary»*, y §3 del
  mismo documento: *«a través del shadow boundary cruza un valor, nunca el objeto signal»*.
- [SDD-17 §5](../SDD-17-hidratacion.md#L394): *«El payload es autoridad de estado»*. El tramo
  de props de una instancia hidratada viaja **serializado** en `fud-state`. Una signal es una
  función con un `Set` vivo dentro: no sobrevive a la serialización, ni podría — el runtime
  reparte tramos por tag sin saber qué componente los mira.

Luego para **todo** hijo venido de SSR —que son todos los que la primera carga pinta— lo único
que cruza es un valor. El canal de escritura no es una optimización para un caso raro: es el
único mecanismo posible para el caso normal.

---

## 2. Causa raíz

### 2.1. La premisa de SDD-15 §3.7 es falsa, y la conclusión cuelga de ella

[SDD-15 §3.7](../SDD-15-emit.md#L296), literal:

> **No hay `u` (update) en esta interfaz.** Un componente N3 no expone getter/setter: signals,
> props y nodos viven exclusivamente en la closure del controlador. No existe superficie de
> escritura externa que dispare una recomposición, luego no hay quién invoque un `update` ni
> qué haría. Las mutaciones son internas: un signal que cambia notifica **directamente** a la
> suscripción fina que `s` registró.

Las dos primeras frases son correctas y son, precisamente, la descripción del defecto. La
tercera —*«luego no hay quién invoque un update ni qué haría»*— solo se sigue si **toda** prop
reactiva llega al hijo como signal, porque entonces la notificación nace dentro de la closure.
Decisión 84 lo prohíbe y SDD-17 lo hace imposible. Con un valor cruzando, hay perfectamente
quién invoca (el padre, en su suscripción) y qué hacer (reasignar el binding y reaplicar las
escrituras que dependen de él).

El texto se copió a la implementación tal cual, y hoy es el comentario de cabecera de la
interfaz: [`controller.ts:18-20`](../../../packages/core/src/controller.ts#L18-L20).

### 2.2. El binding posicional se ejecuta una vez y no se expone

[`client.ts:34-37`](../../../packages/compiler/src/emit/client.ts#L34-L37) construye la línea, y
[`client.ts:72`](../../../packages/compiler/src/emit/client.ts#L72) la escribe dentro de
`static c($props)`, **antes** del `return`. Los nombres de prop son `let` de la closure; el
objeto devuelto ([`client.ts:80-97`](../../../packages/compiler/src/emit/client.ts#L80-L97))
expone `c`, `h` y `r`, y ninguno vuelve a mirar `$props`.

La consecuencia es de forma, no de lógica: **no hay expresión válida de JavaScript, desde fuera
del chunk, que asigne a `title`**. Añadir el canal no es abrir una puerta que estaba cerrada;
es que la pared no tiene puerta.

### 2.3. `FudicElement` tampoco tiene por dónde

[`element.ts`](../../../packages/core/src/element.ts) expone `h(props)`
([:38](../../../packages/core/src/element.ts#L38)), `c(props)`
([:49](../../../packages/core/src/element.ts#L49)) y `disconnectedCallback`
([:65](../../../packages/core/src/element.ts#L65)). `h` y `c` son de **alta**: cada uno
construye un controlador nuevo. Llamar a `c` dos veces no actualiza nada — abre un segundo
shadow root y tira el estado.

### 2.4. `PropertyBinding` está clasificado y no lo consume nadie

El parser ya distingue `.prop`:
[`binding/nodes.ts:46`](../../../packages/compiler/src/binding/nodes.ts#L46) y
[`binding/nodes.ts:124`](../../../packages/compiler/src/binding/nodes.ts#L124)
(`PROPERTY_PREFIX = '.'`). Pero:

```sh
grep -rn "PropertyBinding" packages/compiler/src --include=*.ts | grep -v "binding/"
#=> (vacío)
```

**Ningún emisor lo lee.** En un host de componente el emit de cliente ni siquiera entra en los
atributos: [`markup-client.ts:233-238`](../../../packages/compiler/src/emit/markup-client.ts#L233-L238)
pone `data-adopt` y salta `writeElementAttrs` entero. `.value="@count"` se parsea, se clasifica
y se descarta.

### 2.5. Alcance

- **Toda prop que no sea una signal**, es decir —por decisión 84— toda prop, en cualquier
  componente, en cualquier página.
- **Los dos caminos**: el hijo hidratado desde SSR (recibe su tramo del payload y ahí se acaba)
  y el hijo fabricado en runtime por el padre (hoy no recibe ni el pase inicial, §2.4).
- **Los tres chunks del fixture** están afectados por igual; no hay ninguno que hoy funcione.
- **[props-spec decisión 76](../props-spec.md)** propone la solución contraria —un **setter por
  prop** en el hijo— y es incompatible con el diseño de closure de SDD-15: un setter en la clase
  no alcanza las variables del factory sin un canal hacia el controlador, que es exactamente lo
  que se está añadiendo. Hay que **derogarla**, no implementarla; si no, quedan dos contratos
  para el mismo canal.
- **El timing NO forma parte del alcance.** No hay ventana en la que el padre pueda llamar a un
  hijo aún no upgradeado:
  [SDD-17 §5](../SDD-17-hidratacion.md#L400) — *«Post-orden estricto en la cascada. Descendiente
  más profundo primero; el host disparador el último. El handler del host no corre hasta que
  todos sus descendientes hidratables están definidos y upgradeados»*. Cuando el `inc` del padre
  se ejecuta, el subárbol entero está vivo. Ni buffer de props, ni cola, ni encolado en el
  runtime: sería andamiaje para un caso que la cascada ya cierra.

---

## 3. Interfaz pública

### 3.1. El controlador gana `u`

```ts
// packages/core/src/controller.ts
export interface Controller {
  /** create — fabricate the nodes, mount the structure and hook up. */
  c(): void;
  /** hydrate — adopt the SSR nodes by positional traversal and hook up. */
  h(): void;
  /** update — take a fresh positional payload and re-apply the values it carries. */
  u(props: readonly unknown[]): void;
  /** remove — symmetric teardown. */
  r(): void;
}
```

El párrafo *«There is no `u`»* ([:18-20](../../../packages/core/src/controller.ts#L18-L20)) se
sustituye por el porqué de que sí lo haya: el valor cruza, la signal no.

### 3.2. `FudicElement` gana el punto de entrada

```ts
// packages/core/src/element.ts
export abstract class FudicElement extends HTMLElement {
  h(props: readonly unknown[]): void;
  c(props: readonly unknown[]): void;
  /** Entry point 3 — the owner of the value writes it again. No-op before h/c and after r. */
  u(props: readonly unknown[]): void;
  disconnectedCallback(): void;
}
```

Es el **tercer** punto de entrada invocado desde fuera, hermano de `h` y `c`, no un callback del
navegador. Su llamador es el padre, que es quien posee la signal.

### 3.3. El factory emitido gana `u`, y las escrituras de valor salen a `a()`

```js
static c($props) {
  let $n0, $n3;
  const $r = [], $d = [];
  let [$dom, $shadow, title, variant = 'default'] = $props;

  const m = () => { … };                       // montar (privada, solo c)
  const s = () => { … };                       // enganchar (privada, c y h)
  const a = () => {                            // aplicar valores (privada, c y u)
    $dom.setText($n3, String((title) ?? ''));
    $dom.setAttr($n0, 'class', [...].filter(Boolean).join(' '));
  };

  return {
    c: () => { /* fabricar */ a(); m(); s(); },
    h: () => { /* adoptar  */ s(); },
    u: ($p) => { [, , title, variant = 'default'] = $p; a(); },
    r: () => { … },
  };
}
```

- `a()` es **la única** función que escribe un valor en un nodo. `c` la llama tras fabricar;
  `u` tras reasignar; `h` **no** la llama (§4.3).
- El patrón de asignación de `u` es el mismo que el del destructuring, con los **dos primeros
  huecos vacíos**: `$dom` y `$shadow` no se reasignan nunca. Los defaults se repiten, porque una
  actualización puede volver a traer `undefined`.
- `destructuring()` ([`client.ts:34`](../../../packages/compiler/src/emit/client.ts#L34)) pasa a
  tener dos formas —declaración y asignación— sobre la misma lista de props.

### 3.4. El lado del padre: pase inicial y suscripción

En un host de componente con `PropertyBinding`, `markup-client.ts` deja de saltar los atributos
y emite en `s()`:

```js
$n6.u([, , count.peek()]);                                   // valor inicial
$d.push(count.subscribe((v) => { $n6.u([, , v]); }));         // cambios
```

Un `PropertyBinding` cuyo valor **no** es una signal (literal o expresión constante) no emite
nada: cruza una vez, ya está en el HTML que el servidor pintó, y `const` es su semántica exacta
(decisión 75, intacta).

### 3.5. Sin cambios

- `h`, `r`, `m`, `s`, `data-adopt` y el hoisting de estilos.
- El reparto de tramos por tag del runtime (SDD-17 §4.4): `u` no es un camino de hidratación.
- La forma del payload: mismo array posicional, mismo orden, sin esquema.
- `Dom<N>`: `setText` y `setAttr` ya existen
  ([`dom.ts:42`](../../../packages/dom/src/dom.ts#L42), [:24](../../../packages/dom/src/dom.ts#L24)).

---

## 4. Comportamiento corregido

### 4.1. Un valor que cruzó una vez puede volver a cruzar

La regla, y es la que hay que poder repetir sin mirar el código: **la propiedad de una signal es
del padre; el hijo recibe valores, y recibirlos otra vez es una llamada, no una propiedad.**

`u` es el **único** canal descendente. No hay setters por prop (deroga la decisión 76): un
setter multiplicaría la superficie pública por el número de props, obligaría a nombrarlas en el
artefacto emitido —hoy el payload no lleva esquema, solo valores— y necesitaría igualmente
llegar al controlador. Un solo método posicional cierra el canal con una entrada.

### 4.2. `u` reasigna y reaplica; no reconstruye

`u` no toca la estructura: no crea nodos, no monta, no vuelve a suscribir. Reasigna los bindings
de prop y llama a `a()`. El coste es proporcional al número de **escrituras de valor** del
componente, no al tamaño de su árbol.

Reaplica **todas** las props, no la que cambió: son posicionales y el array llega entero. El
filtro que evita trabajo ya está donde debe, en la signal —`Object.is` en
[`signal.ts:27`](../../../packages/core/src/signal.ts#L27)—, que no notifica si el valor no
cambió.

### 4.3. `h` no llama a `a()`, y es deliberado

El servidor ya pintó esos valores. Reaplicarlos en la hidratación sería reescribir cada
`textContent` del subárbol con el string que ya tiene: trabajo dentro del gesto del usuario,
justo donde se mide el INP, para no cambiar ni un byte. Y rompería la separación que sostiene
todo el modelo — *el payload es autoridad de estado, el DOM es autoridad de posición*: `h`
**adopta** posiciones, no reimprime estado.

La equivalencia SSR↔cliente que ya está testeada es la comprobación de que esto es seguro: si
`a()` produjera algo distinto de lo que pintó el servidor, ese test lo diría.

### 4.4. `u` sobre una instancia sin controlador es un no-op

Misma razón que `disconnectedCallback` ([`element.ts:65-70`](../../../packages/core/src/element.ts#L65-L70)):
`define` upgradea **todas** las instancias del tag a la vez, incluidas las que el runtime nunca
hidrata. Un `u` sobre una de ellas no debe fallar. Tras `r()`, el controlador ya es `null` y
`u` vuelve a ser no-op sin caso especial.

Esto **no** es el buffer de props que §2.5 descarta: no guarda nada ni lo aplica después. Es la
tolerancia mínima que exige el modelo de upgrade del navegador.

---

## 5. Invariantes

**Los que el bug violaba**

- ***«Cruza un valor, nunca la signal»*** (decisión 84) — enunciado, y sin ningún medio de que
  el valor cruzara más de una vez. Una regla que solo se cumple porque el canal no existe.
- ***Un componente hidratado es un componente vivo*** (SDD-17). Un hijo cuyas props vienen del
  padre queda congelado en el valor con el que se pintó, se hidrate o no.
- ***El emit consume lo que el parser clasifica.*** `PropertyBinding` existe en el AST desde
  SDD-07 y no tiene lector (§2.4): sintaxis aceptada que no produce nada.

**Los que la corrección añade**

- **`u` es la única superficie de escritura de un componente.** No hay setters, ni atributos
  observados, ni propiedades públicas: un solo método, posicional, con el mismo orden que el
  payload.
- **`a()` es el único sitio donde un valor llega a un nodo.** Create y update convergen ahí, así
  que no pueden divergir. Verificable por forma sobre el chunk emitido.
- **`h` nunca reescribe lo que el servidor pintó.**

---

## 6. Criterios de aceptación

Tests en `packages/core/test/` y `packages/compiler/test/emit/`.

1. **(rojo primero)** `FudicElement.u(props)` reenvía al `u` del controlador, con el array tal
   cual, tras una alta por `h` y tras una alta por `c`.
2. **(rojo primero)** `u` sobre una instancia que nunca recibió props no lanza y no crea
   controlador; `u` después de `disconnectedCallback` no lanza y no llega al controlador.
3. **(rojo primero)** El chunk de un componente con una prop interpolada contiene `a: `/`const a
   = ` y una entrada `u:`; `c` invoca `a()`, `u` invoca `a()`, y el cuerpo de `h` **no** contiene
   ninguna llamada a `a()`.
4. **(rojo primero)** El patrón de asignación de `u` deja vacíos los dos primeros huecos y
   conserva los defaults: `[, , title, variant = 'default'] = $p`.
5. **(rojo primero)** Un host de componente con `.value="@count"`, siendo `count` una signal del
   padre, emite en `s()` el pase inicial con `peek()` y una suscripción que llama a `u`, con el
   disposer en `$d`.
6. Un `PropertyBinding` cuyo valor no es una signal **no** emite ni pase ni suscripción (decisión
   75 intacta).
7. **(rojo primero, extremo a extremo)** Con el arnés de `test/emit/hydrate/`: padre y hijo
   compilados, servidos por SSR e hidratados sobre un DOM real; un click en el botón del padre
   cambia el texto dentro del shadow root del hijo. **Es el criterio que define el BUG.**
8. La equivalencia SSR↔cliente (`equivalence.test.ts`) sigue verde sin tocarla: `h` no reimprime.
9. `r()` sigue liberando; un `u` posterior a `r` no resucita ningún nodo.
10. Goldens regenerados y **revisados a mano**, los tres: la única diferencia esperada es la
    salida de las escrituras de valor a `a()` y la nueva entrada `u`.

**Cobertura.** `@fudic/core` está al **100 %** en las cuatro métricas y no baja. `client.ts` y
`markup-client.ts` nacieron al 100 % y no bajan.

---

## 7. Fuera de alcance

- **`u` con recomposición estructural** (`@if`, `@foreach`, reconciliación, decisión existencial).
  Sigue siendo de los renders de bloque, en sus SDD ([SDD-15 §4.6](../SDD-15-emit.md)). Este BUG
  añade `u` **de valor**: reasignar y reaplicar escrituras sobre nodos que ya existen.
- **`bind:` y las props callback** (decisiones 83-85). El canal ascendente es otro documento;
  este cierra el descendente.
- **El spread `{...item}`** (decisiones 79-82).
- **La validación semántica de props contra `T`** (decisiones 70-73, 82): prop requerida que
  falta, clave no declarada, default en prop requerida. Es del SDD de props, con su rango `FUD`.
- **`.prop` sobre un elemento HTML nativo** (`<input .value="@x">`). Comparte el
  `PropertyBinding` sin lector, pero su destino es `setProp`, no `u`, y no cruza ningún shadow
  boundary.
- **Las suscripciones finas de las signals propias del componente** (`s` con trabajo
  estructural). Siguen siendo tarea pendiente de SDD-15; este BUG solo cablea el host de un hijo.
- **El pase inicial de props a un hijo fabricado en runtime** por un `@if`/`@foreach` del padre.
  Necesita el render de bloque que aún no existe; cuando exista, su canal de alta es `c` y el de
  actualización es el `u` que este BUG deja hecho.

**Hallazgo preexistente, fuera de alcance.** `m`, `s` —y el `a` que se añade— **no llevan `$`**,
así que la reserva de namespace de [SDD-15 §4.7](../SDD-15-emit.md) (`FUD0290`, prefijo `$`) no
los protege: un `@client` que declare `const s = …` machaca la función de enganche del propio
componente. No lo causa este BUG y no lo arregla —renombrar toca los tres goldens y el
formateador—: candidato a BUG propio.
