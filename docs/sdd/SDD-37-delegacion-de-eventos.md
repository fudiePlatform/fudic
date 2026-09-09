# SDD-37 — Delegación de eventos en bucles (`delegate:`)

> **Estado:** `Listo`
> **Paquetes:** `@fudic/compiler` (bindings, semántica, emit) · `@fudic/language-core` (el tipo
> de `$nombre`) · `@fudic/language-server` (completado del nombre)
> **Depende de:** 06 (bucles), 07 (bindings), 12 (semántica), 15 (emit de eventos), 23 (TS
> virtual), 30 (renders de bloque)
> **Rango de diagnósticos:** `FUD0660`–`FUD0679`
> **Decisiones de gramática:** 116–120 (nuevas)
> **Naturaleza:** sintaxis nueva + emit. **Cero runtime**: no añade una línea a `@fudic/dom`
> ni a `@fudic/core`.

---

## 1. Contexto y objetivo

Hoy un `@click` dentro de un `@foreach` emite un `addEventListener` **por fila**
([markup-client.ts:671](../../packages/compiler/src/emit/markup-client.ts#L671) escribe en el
`$s()` del bloque, y [browser.ts:50](../../packages/dom/src/browser.ts#L50) es
`addEventListener` pelado). Un calendario de 31 días en una página con 10 calendarios son 310
listeners, y —lo que de verdad se mide— cada alta y baja de fila en
[`#reconcile`](../../packages/compiler/src/emit/block.ts#L355) paga un `addEventListener` y un
`removeEventListener` en el hilo principal.

Es exactamente lo que hacen Vue y Angular. React delega en la raíz desde la 17, y Solid y
Svelte 5 delegan un conjunto de eventos, pero **ninguno de los cinco expone una primitiva
declarativa de delegación**: el modelo que le dan al desarrollador sigue siendo un handler por
elemento. Quien quiera delegar de verdad baja a lo mismo en los cinco:

```js
const cell = e.target.closest('[data-day]');
const day = cell && model[Number(cell.dataset.day)];   // ← el tipo se perdió al serializar
```

Ese `Number(...)` no es un descuido: es la consecuencia de que un atributo `data-*` solo guarda
strings. La identidad se destruye al escribirla en el DOM y se reconstruye a mano al leerla.

**El objetivo de este SDD es que fudic no serialice nada.** En el punto donde el emit escribe el
listener ya conoce, estáticamente, qué elemento es y qué variable de iteración le corresponde,
con su tipo. Basta con no tirar esa información.

### Lo que este SDD NO es

No es una optimización invisible. Solid y Svelte 5 delegan sin decírtelo; aquí la delegación se
**escribe**, se ve en el fuente y se enseña. Un `@click` sin `delegate:` sigue emitiendo su
listener por elemento, exactamente como hoy.

---

## 2. Dependencias

- **SDD-07** clasifica los atributos por prefijo (`bus:`, `class:`, `style:` —
  [nodes.ts:122](../../packages/compiler/src/binding/nodes.ts#L122)). `delegate:` entra en esa
  familia sin inventar forma nueva.
- **SDD-30** declara cada bloque como función en el `decls` del closure envolvente, así que un
  bloque anidado a cualquier profundidad **ve por scope léxico** las variables del ancestro.
  Esta spec vive de ese hecho.
- **SDD-15 §4.5** fija que un event binding es una invocación con `$event` inyectado
  (decisiones 96–98). `$nombre` es la hermana de `$event`.
- **SDD-12** aporta el contexto de bucle del walker, el mismo que usa
  [ref-in-loop.ts](../../packages/compiler/src/semantic/analyzers/ref-in-loop.ts).

---

## 3. Interfaz pública

### 3.1. La sintaxis

```razor
<div @click=@fn($event, $day)>
  @foreach (const day of days) key (day.id) {
    <div class="cell" delegate:day>@day.n</div>
    <button delegate:day>✎</button>
  }
</div>
```

Dos piezas:

- **`delegate:nombre`** — atributo **sin valor**, solo dentro del cuerpo de un
  `@foreach`/`@for`/`@while`. `nombre` es un binding declarado por la cabecera del bucle.
- **`$nombre`** — en la **lista de argumentos** de un event binding de un ancestro. Se resuelve
  en el dispatch al valor que tenía la fila del marcador que se pulsó.

### 3.2. La unión es por nombre, no por posición

`$day` ↔ `delegate:day`. Un marcador se ata al **ancestro más cercano cuyo handler mencione
`$day`**. Ni el orden ni la profundidad deciden nada: se lee el nombre y se busca.

### 3.3. Un handler con `$nombre` no se dispara fuera de una fila

Si el click nace donde no hay marcador —el padding del contenedor, un `<h2>` suelto— el handler
**no se invoca**. Ese es el precio de que `$day` sea `Day` y nunca `Day | undefined`: el
`if (!cell) return` no desaparece, se emite.

Un handler que **no** menciona ningún `$nombre` es un listener normal y no cambia en nada.

### 3.4. `delegate:` no deja rastro en el DOM

No emite atributo, ni en servidor ni en cliente. Es coherente con SDD-30, que ya decidió que ni
un marcador de fin de bloque ni un índice entran en el DOM. El HTML de la página es byte por
byte el de hoy.

---

## 4. Comportamiento

### 4.1. Lo que se emite

Una tabla `WeakMap` por nombre delegado, en el closure que **posee el ancestro**:

```js
const $t0 = new WeakMap();
```

El bloque de la fila, en `c()` y en `h()`, tras asignar el nodo marcado:

```js
$t0.set($n4, () => day);
```

**El valor es un getter, no el valor.** `day` es un parámetro del bloque que `u(...)` reasigna
en cada reconciliación; una clausura sobre él lee siempre el actual, así que el registro se
escribe **una vez** y no hay que cablearlo al camino de update. Un `$t0.set($n4, day)` directo
serviría el valor de la primera vuelta para siempre.

El listener del ancestro, en el `$s()` de su propio closure — el mismo cuerpo que hoy, con el
handler envuelto:

```js
$n0 && $d.push($dom.event($n0, "click", ($event) => {
  for (const $y of $event.composedPath()) {
    const $z = $t0.get($y);
    if ($z !== undefined) return fn($event, $z());
  }
}));
```

Con N nombres, una sola pasada acumulando y una guarda:

```js
($event) => {
  let $z0, $z1;
  for (const $y of $event.composedPath()) { $z0 ??= $t0.get($y); $z1 ??= $t1.get($y); }
  if ($z0 === undefined || $z1 === undefined) return;
  fn($event, $z0(), $z1());
}
```

Nombres reservados nuevos: `$tN` (tabla), `$y` (nodo del camino), `$zN` (getter). Ninguno choca
con los de SDD-30 (`$a`, `$b`, `$c`, `$d`, `$f`, `$g`, `$i`, `$j`, `$k`, `$m`, `$n`, `$p`, `$q`,
`$r`, `$s`, `$u`, `$v`, `$w`, `$x`).

### 4.2. Por qué `composedPath()` y no `closest()`

`closest()` necesita un selector, y un selector necesita un atributo en el DOM — que es lo que
§3.4 no quiere. `composedPath()` da el camino compuesto completo desde el target original, así
que **atraviesa shadow roots**: un `<app-card delegate:day>` funciona aunque el click nazca
dentro del shadow del hijo, porque el host está en el camino.

### 4.3. Baja

Ninguna. La tabla es `WeakMap`: cuando `r()` quita los nodos de la fila, sus entradas se van
solas. El único listener lo libera el `$d` del closure envolvente, como cualquier otro.

**Y esta es la ganancia que se mide:** `#reconcile` deja de tocar listeners. Un alta de fila es
un `WeakMap.set`; una baja, nada.

### 4.4. Eventos que no burbujean

La delegación es imposible sin burbujeo. Lista cerrada rechazada (`FUD0665`): `focus`, `blur`,
`mouseenter`, `mouseleave`, `pointerenter`, `pointerleave`, `load`, `error`, `abort`, `scroll`,
`resize`, `unload`. El mensaje sugiere el sustituto cuando existe (`focus`→`focusin`,
`blur`→`focusout`, `mouseenter`→`mouseover`).

### 4.5. El tipo de `$nombre`

En el TS virtual de SDD-23, el fragmento del handler del ancestro se emite dentro de un scope
sintético que declara los bindings de la cabecera del bucle bajo su nombre con `$`. Para
`@foreach (const { id } of rows)` con `delegate:id`, `$id` recibe el tipo del miembro
destructurado, no el de `rows`. Hover, completado y `fudic check` salen de ahí sin nada más.

**Los ocho diagnósticos de §5 no necesitan el checker.** Todos se resuelven sobre el AST:
nombres de la cabecera, contexto de bucle y un barrido del subárbol. TypeScript entra solo para
tipar, nunca para decidir si hay error. Es lo que mantiene la feature fuera del camino caliente
del language server.

---

## 5. Invariantes

1. Un `delegate:` no produce ningún byte de HTML.
2. Un handler sin `$nombre` emite exactamente lo que emite hoy. Los goldens de los componentes
   sin `delegate:` no se mueven.
3. Un bucle con delegación emite **un** listener por tipo de evento y ancestro, independiente
   del número de filas.
4. `$nombre` nunca es `undefined` dentro del handler.
5. El emit no lanza: cada diagnóstico degrada el binding y la página sigue emitiendo.

### Catálogo de diagnósticos (`FUD0660`–`FUD0679`)

| Código | Span | Regla |
|---|---|---|
| `FUD0660` | `$nombre` | Ningún descendiente declara `delegate:nombre`. |
| `FUD0661` | nombre del atributo | Ningún ancestro lee `$nombre`: marcador muerto. |
| `FUD0662` | nombre tras `:` | `nombre` no es un binding de la cabecera del bucle. |
| `FUD0663` | nombre del atributo | `delegate:` fuera de un bucle (hermana de la 31 y la 114). |
| `FUD0664` | 2.º marcador | Dos bucles declaran `delegate:nombre` bajo el mismo ancestro. |
| `FUD0665` | nombre del evento | El evento no burbujea (§4.4). |
| `FUD0666` | `$nombre` | `$nombre` fuera de la lista de argumentos de un event binding. |
| `FUD0667` | valor | `delegate:nombre` no admite valor. |

`FUD0664` es error **aunque los dos bucles iteren el mismo tipo**: si coinciden tampoco se puede
saber de qué bucle vino el click. Forzarlo así es lo que deja el check en el AST y fuera del
checker.

Un prefijo sin nombre (`delegate:`) lo cubre `FUD0099`, que ya existe.

---

## 6. Criterios de aceptación

1. `delegate:day` se clasifica como binding propio, con el span del nombre separado del span del
   atributo.
2. `<div delegate:day></div>` fuera de un bucle → `FUD0663`.
3. `delegate:dia` con cabecera `const day of days` → `FUD0662`, y el mensaje nombra `day`.
4. `delegate:day="x"` → `FUD0667`.
5. `@click=@fn($event, $day)` sin ningún `delegate:day` debajo → `FUD0660`.
6. `delegate:day` sin ancestro que lea `$day` → `FUD0661`.
7. Dos `@foreach` bajo el mismo ancestro, ambos con `delegate:item` → `FUD0664` en el segundo.
8. `@mouseenter=@fn($event, $day)` → `FUD0665`, con `mouseover` en el mensaje.
9. `class:on=@$day` y `@$day` en texto → `FUD0666`.
10. Los ocho diagnósticos se producen **sin** invocar a TypeScript: el test los obtiene del
    resultado semántico del compilador.
11. El HTML de servidor de un componente con `delegate:` es idéntico, byte por byte, al del
    mismo componente sin el atributo.
12. El golden de cliente declara **una** `WeakMap` y **un** `$dom.event` para un `@foreach` de N
    filas con `@click` delegado.
13. En el arnés de `test/emit/hydrate/`, un click en la celda de la fila `b` invoca el handler
    con el objeto `day` de `b` — no una copia, no un string: `toBe`, no `toEqual`.
14. Un click en el ancestro fuera de toda fila no invoca el handler.
15. Tras un `u(...)` que reordena las filas, un click en la celda que ahora ocupa la posición 0
    entrega el `day` **nuevo** (el getter, no el valor congelado — §4.1).
16. Un `<app-card delegate:day>` con click nacido dentro de su shadow entrega su `day`.
17. Retirar N filas no ejecuta ningún `removeEventListener`: espiado sobre el `Dom`.
18. Hover sobre `$day` en el editor muestra el tipo del elemento de `days`; con cabecera
    destructurada, el del miembro.
19. Completado tras `delegate:` ofrece los bindings de la cabecera del bucle.
20. Cobertura 100 % en las cuatro métricas para todo el código nuevo.

---

## 7. Fuera de alcance

- **Que el marcador diga qué función.** La variante `delegate:day=@edit`, que evitaría el
  `switch` dentro de `fn` cuando una fila tiene varias acciones, se deja para cuando duela. Hoy
  la fila entrega su identidad y el autor discrimina por `$event.target`.
- **Delegación implícita.** Que el compilador eleve solo los `@click` de un bucle sin que el
  autor escriba nada. Se descarta a propósito: la delegación aquí se ve (§1).
- **Delegar a la raíz del shadow** en vez de al ancestro del bucle. El ancestro es la unidad que
  hace trivial la baja.
- **`bus:` delegado.** Un `bus:` ya está en `document`; no tiene fila que resolver.
