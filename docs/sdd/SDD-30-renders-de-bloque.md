# SDD-30 — Renders de bloque (`@if` · `@for` · `@foreach` · `@while` · `@switch`)

> **Estado:** `Listo`
> **Paquete:** `@fudic/compiler` (emit de cliente), contra `@fudic/dom`
> **Depende de:** 06, 11, 12, 13, 14, 15 · [BUG-12](./bugs/BUG-12-sin-canal-de-update.md)
> **Rango de diagnósticos:** `FUD0540`–`FUD0569`
> **Decisiones de gramática:** 91–95 (nuevas, esta spec) · 8–15 (control de flujo, intactas)
>
> Cierra por escrito lo que tres documentos delegan en «el SDD de control de flujo» sin que
> ese SDD exista: [SDD-15 §4.6](./SDD-15-emit.md) («es ahí, en los renders de bloque, donde
> `u` tiene trabajo real») y §7, y [BUG-12 §3.3.c y §7](./bugs/BUG-12-sin-canal-de-update.md)
> («una escritura dentro de un `@foreach` no sale a `$a()`… es el mismo hueco que §7 deja a
> los renders de bloque»). SDD-06 es el parser de estos constructos —produce `IfNode`,
> `ForeachNode`, `ForNode`, `WhileNode`, `SwitchNode`—; **este es su emit**.

---

## 1. Contexto y objetivo

La rama de cliente de SDD-15 emite hoy los cinco constructos de control **aplanados en línea**
dentro de `c()` y `h()`. Funciona para pintar markup y se quedó ahí porque ese era su hito:
paridad con `render()`. Deja de funcionar en cuanto algo tiene que vivir por iteración, y eso
ocurre con lo siguiente que toque el proyecto —eventos— pero también con lo que ya está.

Esto es lo que el emit produce hoy para un `@foreach` con dos botones por fila, tomado del
compilador, no de un razonamiento:

```js
h: () => {
  let $c0 = $dom.firstElementChild($shadow);
  $n0 = $c0; $c0 = $dom.nextElementSibling($c0);
  {
    let $c1 = $dom.firstElementChild($n0);
    for (const row of rows) {
      $n1 = $c1; $c1 = $dom.nextElementSibling($c1);      // ← se pisa cada vuelta
      {
        let $c2 = $dom.firstElementChild($n1);
        $n2 = $c2; $c2 = $dom.nextElementSibling($c2);
        $n3 = $dom.lastChild($n2);
        $n4 = $c2; $c2 = $dom.nextElementSibling($c2);
        $n5 = $c2; $c2 = $dom.nextElementSibling($c2);
      }
    }
  }
  $s();                                                    // ← aquí solo vive la última fila
},
```

Tres defectos, y ninguno es un descuido de implementación: son la consecuencia directa de que
un bloque no tenga identidad propia.

- **No hay captura por iteración.** `$n1`…`$n5` son variables del componente reasignadas en
  cada vuelta. Al salir del bucle solo sobrevive la última fila. Un `$s()` posterior engancharía
  N veces sobre los mismos nodos.
- **`r()` no limpia lo que creó.** `$n1 = $n2 = … = null` anula una referencia por variable: las
  N−1 filas anteriores no se tocan. Hoy es fuga de referencias; con listeners es fuga de
  listeners.
- **`u` no alcanza el interior de un bucle.** BUG-12 lo dejó anotado con precisión: la escritura
  de valor dentro de un `@foreach` se queda fusionada con la creación porque *no hay referencia
  estable que `$a` pueda reescribir*. Consecuencia observable: en el fixture, `@row.label` se
  pinta una vez y nunca vuelve a actualizarse, mientras que el `@rows.length` de fuera sí.

**El objetivo:** que cada bloque sea una **función**, con sus nodos, su teardown y su `u`
propios. Con eso los tres defectos desaparecen por construcción y no por cuidado — no hay que
acordarse de nada, porque la única forma de escribirlo ya es la correcta.

**Y aplica a los cinco constructos, no solo a `@foreach`.** `@if`, `@switch`, `@for`, `@while`
y `@foreach` comparten exactamente el mismo problema y la misma solución: un cuerpo de markup
que puede existir o no, aparecer N veces, y consumir variables del scope que lo rodea. Lo que
los distingue es solo **cuántas instancias** puede haber vivas a la vez y **cómo se decide** —
existencia en `@if`/`@switch`, lista con identidad en los tres que iteran— y eso cambia el `u`,
no la forma del bloque.

---

## 2. Dependencias

| Fuente | Aporta |
|---|---|
| SDD-06 | `IfNode`, `ForeachNode`, `ForNode`, `WhileNode`, `SwitchNode` y sus cabeceras opacas. Este SDD **no toca el parser**, salvo por la key (§3.5), que es sintaxis nueva. |
| SDD-11 | El AST de Oxc por fragmento, y —lo que este SDD estrena— el **análisis de scope** sobre él: qué identificadores de un fragmento son declaración y cuáles referencia libre (§3.3). Oxc se sigue invocando **una vez por fichero**. |
| SDD-12 | `SemanticModel` y el catálogo de componentes, para el pase de props a un hijo N3 creado dentro de un bloque (§4.6). |
| SDD-13 | `SourceMapBuilder`: la cabecera y la key de cada bloque se anclan a su origen. |
| SDD-14 | `Dom<N>` — `append`, `before`, `remove`, y la travesía de `DomClient<N>`. **No añade métodos**: `before`/`append` ya son todo lo que el anchor necesita. |
| SDD-15 | La forma del factory (`$m`/`$s`/`$a`/`$w`/`$d`/`$r`), el cursor de elementos de `markup-client.ts` y la reserva del prefijo `$` (§4.7). |
| BUG-12 | `Controller = {c, h, u, r}` y `$a()`/`$w` como único punto de escritura de valor. El bloque **replica esa misma forma a su escala**, y cerrar §3.3.c de ese BUG es criterio de este SDD. |

---

## 3. Interfaz pública

### 3.1. Un bloque es una función declarada en la closure del factory

```js
const $b0 = ($parent, $anchor, /* …dependencias… */) => { … };
```

- **`$parent`** — el nodo bajo el que el bloque crea. Un bloque **no es un nivel del DOM**: sus
  hijos son hijos del mismo padre que el resto del nivel donde está escrito.
- **`$anchor`** — el nodo ante el cual insertar, o `null` para añadir al final (§3.4).
- **Las dependencias** — todo lo que el cuerpo consume y no declara él mismo (§3.3).

**Se declara DENTRO de la closure del factory**, junto a `$m`/`$s`/`$a`, y no a nivel de módulo.
Es lo que le da acceso léxico a lo estable —`$dom`, las funciones y constantes del
`@code { @client }`, los `$nN` del componente— sin tener que enumerarlo. Lo que entra por
parámetro es solo lo que puede cambiar de una invocación a otra, que es exactamente lo que `u`
tendrá que volver a entregarle.

### 3.2. Lo que devuelve

```ts
interface BlockInstance {
  /** Identidad de la instancia dentro de su lista. `undefined` en @if / @switch. */
  readonly key?: unknown;
  c(): void;                    // fabricar los nodos
  h(cursor: unknown): unknown;  // adoptar; recibe el cursor del nivel y devuelve el avanzado
  m(): void;                    // insertar en $parent, ante $anchor
  s(): void;                    // enganchar listeners y suscripciones
  u(...deps: unknown[]): void;  // reasignar dependencias y reaplicar escrituras
  /** Reinsertar ante `ref` (reordenado, §4.4). Devuelve su PRIMER nodo, para encadenar. */
  move(ref: unknown): unknown;
  r(): void;                    // teardown: disposers, hijos, y retirar los nodos del DOM
}
```

Es **la misma forma que el controlador de un componente** (BUG-12 §3.1) con tres diferencias que
salen de que un bloque no es un custom element: `m` es pública —el padre decide cuándo montar,
porque el orden entre bloques hermanos lo fija él—, `h` recibe y devuelve el cursor, y existe
`move`, porque a un componente nadie lo reordena dentro de una lista.

`move` devuelve el **primer** nodo del bloque y no el último: el reordenado camina de atrás hacia
delante, y lo que cada paso necesita como referencia es dónde empieza el bloque que acaba de
colocar. Un bloque que no pintó nada devuelve `ref` sin tocar, con lo que la cadena no se rompe.

`r()` de un bloque hace algo que el de un componente no hace: **retira sus nodos del DOM**
(`$dom.remove`). Un componente lo desmonta el navegador; un bloque lo desmonta su padre.

### 3.3. Los parámetros: qué es dependencia y qué no

**La regla:** es parámetro todo identificador que el cuerpo del bloque **consume** y **no
declara**, salvo lo que no puede cambiar de valor.

Se calcula sobre los fragmentos JS del cuerpo —interpolaciones, valores de atributo, valores de
binding, cabeceras de bloques anidados— con **análisis de scope real** sobre el AST de Oxc: hay
que distinguir una referencia de una declaración y de una clave de propiedad (`obj.a` no
referencia ninguna `a`). No es recolectar `Identifier`.

Se restan dos conjuntos:

1. **Lo que el propio bloque declara** — el patrón de la cabecera (`{ id, name }` de
   `@foreach (const { id, name } of rows)` declara `id` y `name`, y sale del `ObjectPattern`, no
   de suponer un identificador simple), más lo que declare un `@{ … }` dentro del cuerpo.
2. **Lo que no puede cambiar de valor** — un binding `const` o una `function` del
   `@code { @client }` que nadie reasigna. Entra por closure: `u` nunca tendría nada nuevo que
   entregarle, así que un parámetro solo sería ruido en la firma. Lo decide el AST (¿hay alguna
   asignación a ese binding?), no una heurística.

Lo que queda —props, `let` del `@client`, y las variables de iteración de cualquier bloque
ancestro— **son los parámetros, y son los mismos que recibe `u`**.

```razor
@code {
  const { rows } = props<{ rows: { id: string; name: string }[] }>();
  @client {
    let a = 'Hello';
    const pick = (id) => (e) => { console.log(id); };
  }
}
…
@foreach (const { id, name } of rows) key (id) {
  <li>
    <span data-a="@a">@name</span>
    <button @click="@pick(id)">elegir</button>
  </li>
}
```

```js
// id, name: los declara la cabecera.  a: `let` externa consumida → parámetro.
// pick: `const` nunca reasignado → closure.  rows: lo consume la cabecera, que corre en el padre.
const $b0 = ($parent, $anchor, id, name, a) => { … };
```

**Puede pasar de más y nunca de menos**, y eso es deliberado: sobra un parámetro que nadie lee
—coste cero en ejecución— a cambio de que la lista no pueda quedarse corta. Recortarla con el
uso real por rama es una optimización posterior, no una condición de corrección.

**Determinismo del orden** (invariante de SDD-15 §5): primero lo que declara la cabecera, en el
orden del patrón; después las externas, en orden de primera aparición en el cuerpo. El mismo AST
produce siempre la misma firma.

### 3.4. El anchor es estático: no se emiten marcadores

El anchor de un bloque es **el siguiente nodo de su nivel que el emit ya conoce**: si tras el
`@foreach` viene un `<li class="total">`, el anchor es su variable; si no le sigue nada, es
`null` y se hace `append`. Por eso no hacen falta comentarios `<!---->` ni ningún marcador en el
DOM para saber dónde insertar.

Si a un bloque le siguen otros bloques, **todos comparten el mismo anchor** y el orden lo da el
orden de inserción: A inserta antes del anchor, B inserta después ante el mismo anchor y queda
detrás de A. Correcto por construcción, sin nodos extra.

`Dom<N>` ya tiene `before(anchor, node)` y `append(parent, child)`: no se añade nada al contrato.

**La única excepción, y hay que emitirla:** dos runs de texto **interpolados** separados solo por
un bloque (`@a @if (x) { } @b`). Es el hueco que la primera tanda de cliente dejó anotado sin
resolver, y no lo cierra el anchor: si el bloque no pinta, los dos runs son **un solo nodo de
texto** al volver del HTML y ninguna travesía los distingue. Ahí —y solo ahí, porque es
detectable estáticamente— el bloque emite un **comentario vacío** como ancla real. Cero
marcadores en el caso general; uno donde la forma lo exige.

Y lo emiten **las dos ramas**: el HTML que pinta el servidor lleva ese comentario igual que el
árbol que fabrica el cliente. Un marcador en un solo lado es peor que ninguno — los dos árboles
difieren en un nodo y la hidratación adopta uno que no reconoce—, así que la regla se decide una
sola vez, sobre los mismos ítems que las dos ramas ya recorren, y ninguna tiene opinión propia.

### 3.5. `key` es obligatoria en los tres constructos que iteran

```razor
@foreach (const { id, name } of rows) key (id) { … }
@for (let i = 0; i < n; i++)          key (i)  { … }
@while (cur !== null)                 key (cur.id) { … }
```

**Va después del paréntesis de la cabecera y antes del cuerpo** (decisión 91). Tres razones, y
la primera es la que descarta la alternativa evidente:

- **No obliga a un elemento envoltorio.** La `key` como atributo del raíz del bloque —la vía de
  React— exige que el bloque *tenga* un raíz único, y un cuerpo con dos `<div>` hermanos ya no lo
  tiene. En la cabecera el cuerpo puede ser lo que quiera: dos elementos, ninguno, texto suelto.
- **No toca la cabecera JS.** El header se sigue mandando a Oxc tal cual. La vía Angular
  (`; track expr` dentro del paréntesis) obligaría a partir el header antes de parsearlo, y en
  `@for (let i = 0; i < n; i++)` el `;` ya está tomado por el `for` clásico: habría que contar
  separadores según el constructo.
- **La misma forma vale para los tres.** `key (…)` es un fragmento `expression` más, evaluado en
  el scope del cuerpo (ve las variables de la cabecera).

**Sin `key` el compilador para: `FUD0540`.** No hay default silencioso —ni el índice, ni la
identidad de objeto— porque un default aquí es una reconciliación incorrecta que nadie ve hasta
que la lista se reordena, y entonces se manifiesta como estado pegado a la fila equivocada.

`@if` y `@switch` **no llevan key** y escribirla es `FUD0542`: no iteran, su instancia es una o
ninguna, y su identidad es la rama tomada.

> `@while` merece una nota. No declara variable de iteración, así que su key sale de lo que el
> cuerpo mute (`cur.id`). Es expresable y se le exige igual; si no hay expresión estable que dar,
> ese bucle no es reconciliable y el autor tiene que reescribirlo como `@foreach`. La spec no
> añade un caso especial para él: prefiere un error que el autor entiende a una reconciliación
> que no puede ser correcta.

### 3.6. El padre lleva el registro de bloques vivos

Por cada constructo, una variable de la closure del factory:

```js
let $k0 = [];   // instancias vivas de $b0, en orden de documento
```

Es lo que `r()` del componente recorre, lo que `u` reconcilia, y lo que hace que el teardown deje
de tener el agujero de §1. Un `@if` usa la misma variable con cero o un elemento: no hay dos
mecanismos.

---

## 4. Comportamiento

### 4.1. Los cinco constructos, en dos familias

| Constructo | Instancias vivas | Qué decide `u` | Key |
|---|---|---|---|
| `@if` / `@else if` / `@else` | 0 o 1 | Qué rama toca ahora: si es la misma, `u` de la instancia; si cambia, `r` de la vieja y `c`+`m`+`s` de la nueva | no |
| `@switch` | 0 o 1 | Igual que `@if`, con la rama del `case` que resuelva | no |
| `@foreach` / `@for` / `@while` | 0..N | Reconciliación por key (§4.4) | **sí** |

Una rama de `@if` y un `case` de `@switch` son **cada uno su propio bloque**, con su propia
función y su propia lista de dependencias: dos ramas no comparten nodos ni firma. Lo que el
componente guarda es cuál está viva.

### 4.2. Las seis fases del bloque

```
c():  fabrica sus nodos            →  m() los inserta ante $anchor  →  s() engancha
h():  adopta desde el cursor       →                                   s() engancha
u():  reasigna deps                →  $a() reaplica escrituras       →  u() de sus hijos
r():  disposers  →  r() de sus bloques hijos  →  retira sus nodos del DOM
```

Es el mismo reparto que SDD-15 §4.3 fija para el componente, y por la misma razón: `c` y `h`
divergen en cómo obtienen las referencias y convergen en `s`, que vive una sola vez.

### 4.3. El cursor entra y sale

Un bloque comparte nivel con sus hermanos, así que comparte su cursor de elementos. `h` lo recibe
como parámetro y devuelve el avanzado; el padre lo encadena:

```js
h: () => {
  let $c0 = $dom.firstElementChild($n3);
  for (const { id, name } of rows) {
    const $i = $b0($n3, null, id, name, a);
    $c0 = $i.h($c0);
    $i.s();
    $k0.push($i);
  }
  $n4 = $c0;              // lo que sigue al bloque, justo donde el cursor quedó
},
```

Un bloque que no pinta nada devuelve el cursor **sin tocar**, que es lo que mantiene alineados
los dos caminos: la misma condición toma la misma rama con el mismo estado inicial, así que el
cursor avanza en paralelo (SDD-15 §3.3, el payload es completo y no proyección).

En `h` el anchor es `null`: no se inserta nada, se adopta lo que el servidor ya puso.

### 4.4. Reconciliación por key: crear, modificar, eliminar, reordenar

```js
const $u0 = () => {
  const $prev = new Map();
  const $gone = [];
  // El índice se llena a mano, y a propósito: gana la PRIMERA de dos keys iguales, y la que
  // pierde la plaza va derecha a la lista de retirados en vez de quedarse sin dueño.
  for (const $i of $k0) { if ($prev.has($i.key)) $gone.push($i); else $prev.set($i.key, $i); }
  const $next = [];
  for (const { id, name } of rows) {
    const $hit = $prev.get(id);
    if ($hit !== undefined) { $prev.delete(id); $hit.u(id, name, a); $next.push($hit); }
    else { const $i = $b0($n3, $n4, id, name, a); $i.c(); $i.m(); $i.s(); $next.push($i); }
  }
  for (const $i of $prev.values()) $gone.push($i);
  for (const $i of $gone) $i.r();
  // reordenar: de atrás hacia delante, cada bloque ante el que le sigue
  for (let $j = $next.length - 1, $ref = $n4; $j >= 0; $j -= 1) $ref = $next[$j].move($ref);
  $k0 = $next;
};
```

Tres casos cerrados y ninguna heurística: la key dice si la fila es la misma. El reordenado es
la única parte con coste, y tampoco necesita marcadores — el ancla de cada paso es el nodo del
bloque que se acaba de colocar.

**Una key duplicada es un error del autor que el compilador no puede ver** (depende de los
datos). El comportamiento es determinista y documentado: gana la primera aparición y la segunda
se trata como una fila nueva. No se emite diagnóstico en batch; en dev, el runtime puede
avisarlo (fuera de alcance, §7).

Y de ahí que el índice **no** se construya con `new Map($k0.map(…))`. Un `Map` hecho de pares se
queda con la última, que es la regla contraria; y lo grave no es el orden, es que la instancia
que pierde la plaza deja de estar en ninguna estructura, así que **nadie llama a su `r()`**: sus
nodos y sus disposers se quedan detrás. Es la misma fuga que §1 existe para cerrar, reaparecida
por el camino de atrás. Con dos filas de key igual y un `u`, la lista crece.

### 4.5. `$a()` dentro de un bloque: se cierra BUG-12 §3.3.c

Un bloque tiene sus propios `$w` y `$a`, y sus nodos **sí son estables** durante la vida de la
instancia. Por tanto la escritura de valor dentro de un bucle deja de estar fusionada con la
creación y pasa a ser reaplicable, exactamente igual que fuera:

```js
const $a = () => {
  let $v;
  $v = String(name ?? '');
  if ($v !== $w[0]) { $w[0] = $v; $dom.setText($n1, $v); }
  $v = String(a);
  if ($v !== $w[1]) { $w[1] = $v; $dom.setAttr($n0, 'data-a', $v); }
};
```

`h` **no** llama a `$a()`, por la misma razón que en el componente (BUG-12 §4.3): el servidor ya
pintó esos valores y reescribirlos dentro del gesto es trabajo puro para no cambiar un byte.

### 4.6. Un hijo N3 creado dentro de un bloque recibe sus props

BUG-12 §7 lo dejó pendiente con nombre y apellidos: *«el pase inicial de props a un hijo
fabricado en runtime por un `@if`/`@foreach` del padre necesita el render de bloque que aún no
existe; cuando exista, su canal de alta es `c` y el de actualización es el `u` que este BUG deja
hecho»*. Aquí existe.

El `s()` del bloque emite el pase inicial y la suscripción con la misma forma que BUG-12 §3.4, y
su `r()` da de baja el disposer. Un hijo dentro de un bucle recibe, por fila, su propio array
posicional.

### 4.7. El namespace `$` cubre también lo del bloque

`$b0`, `$k0`, `$u0`, y dentro del bloque `$n…`, `$d`, `$w`, `$a`, `$v`. Todo lo que el emit
introduce empieza por `$` (SDD-15 §4.7, y el arreglo de BUG-12 §3.5). Los parámetros de
dependencia son la **única** excepción y no pueden serlo de otra manera: son los nombres del
autor, porque el cuerpo del bloque es su código.

---

## 5. Invariantes

- **Un bloque es una unidad de vida completa.** Nodos, teardown, escrituras y bloques hijos son
  suyos. No hay estado de bloque en la closure del componente salvo la lista de instancias vivas.
- **Determinismo.** Mismo AST ⇒ misma firma, mismo orden de parámetros, mismo código en `c` y en
  `h`. Requisito para que SSR y cliente adopten sin desalinearse.
- **Cero marcadores en el DOM**, salvo el ancla del caso de §3.4 que la forma exige.
- **El emit no lanza.** Un bucle sin key emite `FUD0540` con su span y sigue: el resto de la
  página se emite.
- **La lista de dependencias nunca se queda corta.** Puede sobrar; no puede faltar.
- **`c` y `h` convergen en `s`**, y `s` vive una sola vez por bloque.

### Catálogo de diagnósticos (`FUD0540`–`FUD0569`)

| Código | Regla |
|---|---|
| `FUD0540` | Bucle (`@for`/`@foreach`/`@while`) con markup y sin `key` (§3.5). |
| `FUD0541` | `key (…)` vacía o cuya expresión no parsea. |
| `FUD0542` | `key (…)` en un constructo que no itera (`@if`, `@switch`). |
| `FUD0543` | Cabecera de bucle cuyo patrón no declara ningún binding y cuya key no puede referirse a nada del cuerpo. |
| `FUD0544`–`FUD0569` | Reservados. |

---

## 6. Criterios de aceptación

**Forma del emitido** (verificable sobre el texto, sin navegador):

1. **Un bloque, una función.** Cada `@if`, rama `else if`, `else`, `case`, `@for`, `@foreach` y
   `@while` con markup produce un `const $bN = ($parent, $anchor, …) => {…}` declarado dentro de
   `static c($props)`, y el objeto que devuelve expone `key`, `c`, `h`, `m`, `s`, `u`, `r`.
2. **Los parámetros son las dependencias.** Para el ejemplo de §3.3, la firma es exactamente
   `($parent, $anchor, id, name, a)`: `pick` no aparece (es `const` no reasignado) y `rows`
   tampoco (lo consume la cabecera, que corre en el padre).
3. **Orden determinista.** Recompilar el mismo fichero produce la misma firma; una cabecera con
   destructuring (`{ id, name }`) aporta sus bindings en el orden del patrón.
4. **Anidamiento.** Un `@foreach` dentro de otro recibe las variables de iteración de ambos; un
   `@if` dentro de los dos, que no declara nada, hereda las de los dos.
5. **Ningún marcador.** El HTML emitido no contiene comentarios de anclaje, salvo en el caso de
   §3.4 (dos runs interpolados separados por un bloque), donde sí aparece exactamente uno.
6. **La reserva `$`.** Todo identificador que el emit introduce empieza por `$`, salvo los
   parámetros de dependencia, que son nombres del autor.

**Key:**

7. **Obligatoria.** `@foreach (const r of rows) { <li>@r.n</li> }` sin key produce `FUD0540` con
   el span de la cabecera, y el resto de la página se sigue emitiendo.
8. **Las tres formas.** `key (id)` compila igual tras `@foreach`, `@for` y `@while`; la expresión
   ve las variables que declara la cabecera.
9. **Prohibida donde no itera.** `@if (x) key (1) { … }` → `FUD0542`.
10. **La cabecera JS no se toca.** El header sigue llegando a Oxc tal cual: un
    `@for (let i = 0; i < n; i++) key (i)` parsea sin partir el header por `;`.

**Comportamiento, sobre DOM real** (arnés de `test/emit/hydrate/`):

11. **Captura por iteración.** En un `@foreach` de N filas con un `@click` por fila, disparando
    en orden **no secuencial**, cada handler recibe el valor de **su** fila. Es el test que falla
    hoy y el que motiva el SDD.
12. **Teardown completo.** Tras `r()` del componente, las N filas están retiradas del DOM y **los
    N disposers** ejecutados — no solo los de la última.
13. **`u` dentro de un bucle escribe.** Cambiar un valor consumido por el cuerpo actualiza el
    texto de la fila correspondiente y **solo** de esa. Cierra BUG-12 §3.3.c.
14. **Reconciliación, los tres casos.** Sobre una lista de tres filas: reordenarlas no destruye
    ningún bloque (las mismas instancias, movidas); quitar una llama a su `r()` y a ningún otro;
    añadir una crea un bloque y lo monta en su posición.
15. **Estado que sobrevive al reordenado.** Una fila con estado propio (un `<input>` escrito a
    mano, o una signal del hijo) conserva su valor al reordenar la lista. Es lo que la key compra
    y lo que un default por índice rompería.
16. **`@if` que cambia de rama.** Pasar de la rama A a la B ejecuta `r()` de A y `c`+`m`+`s` de
    B; volver a A construye una instancia nueva. Permanecer en A llama a su `u`, no la reconstruye.
17. **Equivalencia `c` ↔ `h` con bloques.** El markup que la rama SSR serializa es byte-idéntico
    al que `h` adopta sin mover un nodo, con `@if` cerrado, `@if` abierto y `@foreach` de 0, 1 y
    N elementos.
18. **Un hijo N3 dentro de un bloque recibe props.** Pase inicial en el `s()` del bloque y
    suscripción con disposer en su `$d`; al retirar la fila, el disposer se ejecuta (§4.6).
19. **El caso del ancla.** `@a @if (x) { <b>…</b> } @b` con ambos runs interpolados hidrata
    correctamente con la condición falsa y con la condición verdadera.

**Cobertura.** Los ficheros nuevos nacen al **100 %** en las cuatro métricas.
`markup-client.ts` y `client.ts` nacieron al 100 % y no bajan.

---

## 7. Fuera de alcance

- **Los event bindings y el bus.** Son [SDD-15-Task-eventos-y-bus](./SDD-15-Task-eventos-y-bus.md)
  y van **después** de este SDD: el `s()` de un bloque es donde se enganchan, y ese `s()` lo crea
  esta spec. Aquí `s()` se emite con lo que ya existe (el pase de props de BUG-12) y vacío para
  lo demás.
- **`data-id` y los cuatro mapas de página** (SDD-15 §3.1, §3.3–§3.6). Un bloque no tiene
  identidad de página: sus instancias no llevan `data-id` ni tramo en `fud-state`. Lo que sí se
  cierra aquí es el **canal** por el que un hijo creado en runtime recibe sus props (§4.6).
- **Diagnóstico de key duplicada en runtime.** Depende de los datos; el comportamiento queda
  fijado en §4.4 y el aviso en dev es del runtime (SDD-17), no del compilador.
- **Recortar la lista de dependencias por uso real por rama.** Optimización, no corrección
  (§3.3).
- **`FUD0290`** (prefijo `$` en `@client`). Sigue siendo tarea pendiente de SDD-15 §4.7 y este
  SDD hace lo mismo que BUG-12: mete **sus propios** nombres dentro de la reserva para que cuando
  el diagnóstico llegue no haya que ampliarlo con excepciones.
- **Reactividad fina de las signals propias del componente.** El `s()` con suscripciones sigue
  siendo del SDD de signals; aquí se fija dónde vive el enganche de un bloque, no qué se suscribe.
- **`@foreach` sobre un iterable infinito o perezoso.** La reconciliación materializa la lista.
