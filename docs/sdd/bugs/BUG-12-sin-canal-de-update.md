# BUG-12 — Un hijo que recibe un valor no tiene canal de actualización

> **Estado:** `Hecho`
> **Corrige:** [SDD-15 — Emit](../SDD-15-emit.md) §3.7, §4.7, §7 ·
> [props-spec](../props-spec.md) decisión 76
> **Y de paso:** la colisión de namespace de `m`/`s` en la closure del factory (§2.5). No es un
> BUG aparte porque la corrección de §3.3 **añade una tercera función** a esa misma closure:
> separarlo sería publicar a sabiendas un nombre desprotegido más.
> **Paquetes:** `@fudic/core` · `@fudic/compiler`
> **Rama:** `fix/bug-12-update-de-props`
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

### 2.5. El namespace del factory está reservado a medias, y este BUG lo empeora

El cuerpo de `@code { @client }` se copia **verbatim** a la closure del factory
([`client.ts:73`](../../../packages/compiler/src/emit/client.ts#L73)), y dos líneas después
el emit declara ahí mismo `const m` y `const s`
([:75](../../../packages/compiler/src/emit/client.ts#L75),
[:78](../../../packages/compiler/src/emit/client.ts#L78)). Mismo bloque, mismo scope léxico.

[SDD-15 §4.7](../SDD-15-emit.md) reserva el prefijo **`$`** para el compilador y sanciona con
`FUD0290` al usuario que lo invada. `$dom`, `$shadow`, `$r`, `$d`, `$n0` están dentro de esa
reserva. **`m` y `s` no.** Y son dos de los nombres de una letra más plausibles que existe.

Medido sobre `packages/compiler/dist`, con un `@client` que declara `const s = signal(0)` y
`const m = 2`:

```js
    let [$dom, $shadow] = $props;
    const s = signal(0);            // ← del usuario
    const m = 2;                    // ← del usuario

    const m = () => { for (const $n of $r) $dom.append($shadow, $n); };
    const s = () => {};
```
```
SyntaxError: Identifier 'm' has already been declared
```

**El compilador no emite ni un diagnóstico**: entrega un chunk que el navegador no puede ni
parsear, y `FUD0290` —que tampoco existe todavía en `packages/compiler/src`— no lo cubriría,
porque el identificador del usuario es legal según la regla escrita.

Esto entra en **este** BUG y no en uno aparte por un motivo que no es de comodidad: la
corrección de §3.3 añade una **tercera** función a esa closure, `a`. Arreglarlo en otro sitio
significaría publicar a sabiendas un nombre desprotegido más.

### 2.6. Alcance

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

### 3.3. El factory emitido gana `u`, y las escrituras de valor salen a `$a()`

```js
static c($props) {
  let $n0, $n3;
  const $r = [], $d = [];
  let [$dom, $shadow, title, variant = 'default'] = $props;

  const $m = () => { … };                      // montar (privada, solo c)
  const $s = () => { … };                      // enganchar (privada, c y h)
  const $a = () => {                           // aplicar valores (privada, c y u)
    $dom.setText($n3, String((title) ?? ''));
    $dom.setAttr($n0, 'class', [...].filter(Boolean).join(' '));
  };

  return {
    c: () => { /* fabricar */ $a(); $m(); $s(); },
    h: () => { /* adoptar  */ $s(); },
    u: ($p) => { [, , title, variant = 'default'] = $p; $a(); },
    r: () => { … },
  };
}
```

- `$a()` es **la única** función que escribe un valor en un nodo. `c` la llama tras fabricar;
  `u` tras reasignar; `h` **no** la llama (§4.3).
- Las tres son `$m`, `$s` y `$a`, **no** `m`, `s` y `a`: entran en la reserva de namespace de
  SDD-15 §4.7, que es lo que impide que un `@client` del usuario las machaque (§2.5, §3.5).
- El patrón de asignación de `u` es el mismo que el del destructuring, con los **dos primeros
  huecos vacíos**: `$dom` y `$shadow` no se reasignan nunca. Los defaults se repiten, porque una
  actualización puede volver a traer `undefined`.
- `destructuring()` ([`client.ts:34`](../../../packages/compiler/src/emit/client.ts#L34)) pasa a
  tener dos formas —declaración y asignación— sobre la misma lista de props.

#### 3.3.b. `$a()` no escribe lo que no ha cambiado

`u` reaplica **todas** las props, porque el array llega entero (§4.2). Con diez props, una
signal que se mueve dispararía diez escrituras de DOM para cambiar una. El filtro va, por
tanto, en **cada escritura**, no en la llamada: `$w` guarda lo último que esa escritura aplicó.

```js
const $w = [];                                 // lo último aplicado, por escritura
const $a = () => {
  let $v;
  $v = ["card", (variant === 'highlight') && "highlight"].filter(Boolean).join(' ');
  if ($v !== $w[0]) { $w[0] = $v; $dom.setAttr($n0, 'class', $v); }
  $v = String((title) ?? '');
  if ($v !== $w[1]) { $w[1] = $v; $dom.setText($n3, $v); }
};
```

Una comparación de strings por escritura, y lo que ahorra es una mutación del DOM. El
`Object.is` de [`signal.ts:27`](../../../packages/core/src/signal.ts#L27) evita la *llamada*;
`$w` evita las *escrituras*, que es lo que cuesta.

`h` sigue sin llamar a `$a()` (§4.3), así que tras hidratar `$w` está vacío y el **primer** `u`
repinta todo una vez. Es intencional y es una sola vez por instancia: cebar `$w` en `h`
significaría calcular cada valor dentro del gesto, que es justo lo que §4.3 evita, y ese primer
repaso hace además de red de seguridad si el servidor pintó desde un estado distinto.

#### 3.3.c. Una escritura dentro de un `@foreach` no sale a `$a()`

La variable de un nodo creado en un bucle guarda solo el **último** nodo del turno, así que no
hay referencia estable que `$a` pueda reescribir: la escritura se queda fusionada con la
creación, como hasta ahora. Es el mismo hueco que §7 deja a los renders de bloque. Un `@if`, en
cambio, **sí** replica su condición en `$a()`: sus nodos son estables, solo puede que no
existan.

### 3.4. El lado del padre: pase inicial y suscripción

En un host de componente con `PropertyBinding`, `markup-client.ts` deja de saltar los atributos
y emite en `$s()`:

```js
$n6.u([, , count.peek()]);                                    // valor inicial
$d.push(count.subscribe(($v) => { $n6.u([, , $v]); }));       // cambios
```

Un `PropertyBinding` cuyo valor **no** es una signal (literal o expresión constante) no emite
nada: cruza una vez, ya está en el HTML que el servidor pintó, y `const` es su semántica exacta
(decisión 75, intacta).

**El array es el payload entero del hijo, no el hueco que se movió.** El `u` del hijo reasigna
*todas* las props que destructura, así que mandar solo la que cambió devolvería las demás a su
default y `$a()` las repintaría. El padre resuelve el orden de props del hijo desde su AST y
rellena cada hueco que conoce —los `.prop` y también los atributos planos del host, que son los
mismos valores que `componentPropsExpr` manda por SSR—; los que no nombra se quedan vacíos, y
los finales ni se escriben:

```js
// hijo: props<{ label: string; value?: number }>  ·  <app-x label="Hola" .value="@count">
$n6.u([, , "Hola", count.peek()]);
$d.push(count.subscribe(($v) => { $n6.u([, , "Hola", $v]); }));
```

Con varias signals sale **una suscripción por signal**, y cada una recompone el array entero: la
que notifica pone el valor que le dan, las demás se leen con `peek()`.

El parámetro del callback es `$v`, no `v`: el array que lo rodea es código del autor, y un `v`
suyo quedaría sombreado. Es el mismo invariante de §5 que obliga a `$m`/`$s`/`$a`.

Leer el orden de props del hijo obliga a leer su `@code`, así que `client.ts` memoiza
`extractCode` en un `WeakMap` sobre el `ResolvedComponent`: Oxc sigue invocándose exactamente
una vez por fichero.

### 3.5. Las funciones privadas del factory entran en la reserva `$`

`m` → **`$m`**, `s` → **`$s`**, y la nueva nace ya como **`$a`**. Es el arreglo de §2.5, y es
un renombrado del **código emitido**, no de la interfaz: siguen siendo closures privadas, no
salen en `{c, h, u, r}` y nadie fuera del chunk las nombra. `$r`, `$d`, `$dom`, `$shadow` y
`$nN` ya estaban dentro.

No se toca `FUD0290` ni se reserva ninguna letra nueva al usuario: el arreglo consiste
precisamente en **no ocupar** nombres que son suyos.

### 3.6. Sin cambios

- `h`, `r`, `data-adopt` y el hoisting de estilos.
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
de prop y llama a `$a()`. El coste es proporcional al número de **escrituras de valor** del
componente, no al tamaño de su árbol.

Reaplica **todas** las props, no la que cambió: son posicionales y el array llega entero. Eso
deja el trabajo proporcional al número de props, no al de las que se movieron, así que el
filtro va por **escritura**: `$w` guarda lo último aplicado y `$a()` no toca el DOM si el valor
sale igual (§3.3.b). El `Object.is` de
[`signal.ts:27`](../../../packages/core/src/signal.ts#L27) evita la llamada; `$w` evita las
escrituras.

### 4.3. `h` no llama a `$a()`, y es deliberado

El servidor ya pintó esos valores. Reaplicarlos en la hidratación sería reescribir cada
`textContent` del subárbol con el string que ya tiene: trabajo dentro del gesto del usuario,
justo donde se mide el INP, para no cambiar ni un byte. Y rompería la separación que sostiene
todo el modelo — *el payload es autoridad de estado, el DOM es autoridad de posición*: `h`
**adopta** posiciones, no reimprime estado.

La equivalencia SSR↔cliente que ya está testeada es la comprobación de que esto es seguro: si
`$a()` produjera algo distinto de lo que pintó el servidor, ese test lo diría.

### 4.4. `u` sobre una instancia sin controlador es un no-op

Misma razón que `disconnectedCallback` ([`element.ts:65-70`](../../../packages/core/src/element.ts#L65-L70)):
`define` upgradea **todas** las instancias del tag a la vez, incluidas las que el runtime nunca
hidrata. Un `u` sobre una de ellas no debe fallar. Tras `r()`, el controlador ya es `null` y
`u` vuelve a ser no-op sin caso especial.

Esto **no** es el buffer de props que §2.6 descarta: no guarda nada ni lo aplica después. Es la
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
- ***El prefijo `$` está reservado al código emitido*** ([SDD-15 §4.7](../SDD-15-emit.md)) — y el
  propio emit se salía de él con `m` y `s` (§2.5). Una reserva que el reservador no respeta.
- ***El compilador no emite código roto en silencio.*** Un `@client` con `const m` produce hoy un
  chunk con un `SyntaxError`, sin diagnóstico.

**Los que la corrección añade**

- **`u` es la única superficie de escritura de un componente.** No hay setters, ni atributos
  observados, ni propiedades públicas: un solo método, posicional, con el mismo orden que el
  payload.
- **`$a()` es el único sitio donde un valor llega a un nodo.** Create y update convergen ahí, así
  que no pueden divergir. Verificable por forma sobre el chunk emitido.
- **Una escritura que no cambia nada no toca el DOM.** El coste de un `u` es proporcional a las
  props que se movieron, no a las que tiene el componente.
- **`h` nunca reescribe lo que el servidor pintó.**
- **Todo identificador que el emit introduce en la closure del factory empieza por `$`.** Sin
  excepciones que recordar: la regla se comprueba mirando el chunk.

---

## 6. Criterios de aceptación

Tests en `packages/core/test/` y `packages/compiler/test/emit/`.

1. **(rojo primero)** `FudicElement.u(props)` reenvía al `u` del controlador, con el array tal
   cual, tras una alta por `h` y tras una alta por `c`.
2. **(rojo primero)** `u` sobre una instancia que nunca recibió props no lanza y no crea
   controlador; `u` después de `disconnectedCallback` no lanza y no llega al controlador.
3. **(rojo primero)** El chunk de un componente con una prop interpolada declara `const $a = ` y
   tiene una entrada `u:`; `c` invoca `$a()`, `u` invoca `$a()`, y el cuerpo de `h` **no**
   contiene ninguna llamada a `$a()`.
4. **(rojo primero)** El patrón de asignación de `u` deja vacíos los dos primeros huecos y
   conserva los defaults: `[, , title, variant = 'default'] = $p`.
5. **(rojo primero)** Un host de componente con `.value="@count"`, siendo `count` una signal del
   padre, emite en `$s()` el pase inicial con `peek()` y una suscripción que llama a `u`, con el
   disposer en `$d`.
6. Un `PropertyBinding` cuyo valor no es una signal **no** emite ni pase ni suscripción (decisión
   75 intacta).
7. **(rojo primero, extremo a extremo)** Con el arnés de `test/emit/hydrate/`: padre y hijo
   compilados, servidos por SSR e hidratados sobre un DOM real; un click en el botón del padre
   cambia el texto dentro del shadow root del hijo. **Es el criterio que define el BUG.**
   El `@click="@inc"` de §1 no cablea nada todavía —los event bindings van *después* de este
   BUG—, así que el `@client` del fixture padre escucha en `document`: un click dentro de un
   shadow root es `composed` y llega hasta allí. La cadena que el test recorre sigue siendo
   código emitido de punta a punta, sin andamiaje en el test.
8. La equivalencia SSR↔cliente (`equivalence.test.ts`) sigue verde sin tocarla: `h` no reimprime.
9. `r()` sigue liberando; un `u` posterior a `r` no resucita ningún nodo.
10. **(rojo primero)** Un componente cuyo `@client` declara `const s` y `const m` produce un
    chunk que **parsea y ejecuta**. Hoy no: `SyntaxError: Identifier 'm' has already been
    declared`, sin ningún diagnóstico del compilador (§2.5).
11. Goldens regenerados y **revisados a mano**, los tres: las únicas diferencias esperadas son
    el renombrado `m`/`s` → `$m`/`$s`, la salida de las escrituras de valor a `$a()` (con su
    `$w`) y la nueva entrada `u`. Y una más en el golden de **servidor** `app-button.mjs`: el
    temporal `const $a` de los atributos interpolados pasa a `$v`, porque si no sombrearía a la
    closure `$a` dentro de su propio cuerpo.
12. **(rojo primero)** Una escritura cuyo valor no cambia no llega al DOM: `$a()` compara contra
    `$w` antes de escribir (§3.3.b). Verificable por forma sobre el chunk.
13. Un `PropertyBinding` sobre un hijo de varias props manda el array **entero** —los `.prop` y
    los atributos planos del host, en el orden del hijo—, con hueco donde el host no pasa nada
    (§3.4).

**Cobertura.** `@fudic/core` está al **100 %** en las cuatro métricas y no baja. `client.ts` y
`markup-client.ts` nacieron al 100 % y no bajan.

---

## 7. Fuera de alcance

- **`u` con recomposición estructural** (`@if`, `@foreach`, reconciliación, decisión existencial).
  Sigue siendo de los renders de bloque, en sus SDD ([SDD-15 §4.6](../SDD-15-emit.md)). Este BUG
  añade `u` **de valor**: reasignar y reaplicar escrituras sobre nodos que ya existen. Corolario:
  una escritura dentro de un `@foreach` se queda fusionada con la creación de su nodo (§3.3.c).
- **`bind:` y las props callback** (decisiones 83-85). El canal ascendente es otro documento;
  este cierra el descendente.
- **El spread `{...item}`** (decisiones 79-82).
- **La validación semántica de props contra `T`** (decisiones 70-73, 82): prop requerida que
  falta, clave no declarada, default en prop requerida. Es del SDD de props, con su rango `FUD`.
- **`.prop` sobre un elemento HTML nativo** (`<input .value="@x">`). Comparte el
  `PropertyBinding` sin lector, pero su destino es `setProp`, no `u`, y no cruza ningún shadow
  boundary.
- **Las suscripciones finas de las signals propias del componente** (`$s` con trabajo
  estructural). Siguen siendo tarea pendiente de SDD-15; este BUG solo cablea el host de un hijo.
- **El pase inicial de props a un hijo fabricado en runtime** por un `@if`/`@foreach` del padre.
  Necesita el render de bloque que aún no existe; cuando exista, su canal de alta es `c` y el de
  actualización es el `u` que este BUG deja hecho.
- **Implementar `FUD0290`.** El diagnóstico de SDD-15 §4.7 no existe en `packages/compiler/src`:
  hoy nada impide que un `@client` declare `$dom`. Es tarea pendiente de SDD-15 y sigue siéndolo.
  Este BUG hace lo contrario y suficiente: mete **sus propios** nombres dentro de la reserva, para
  que cuando el diagnóstico llegue no haya que ampliarlo con excepciones.
