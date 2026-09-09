# BUG-28 — `@{ … }` se parseaba y no se emitía, y con él el `@while` no se podía escribir

**Estado:** `Hecho` · **Depende de** [SDD-15](../SDD-15-emit.md) y
[SDD-30](../SDD-30-renders-de-bloque.md) en `Hecho` ·
**Rama:** `worktree-reactividad-evidencias` · **Tareas:**
[BUG-28-Task.md](./BUG-28-Task.md)

> **Paquetes:** `compiler`
> **Corrige:** SDD-15 §4.1 · SDD-30 §3.3 · gramática 13, 16, 17, 91, y **añade la 116**
> **Rango de diagnósticos:** ninguno. El defecto no era una regla mal escrita: era una
> construcción de la gramática que el emit tiraba **en silencio**.

---

## 1. Contexto y síntoma

### Síntoma 1 — el bloque no corre

```razor
@code {
  let marca = 1;
}
…
@{ marca = 3; }
<p class="marca">marca = @marca</p>
```

Sale `marca = 1`. En las dos ramas: el HTML que sirve el servidor ya trae el `1`, y el árbol
que fabrica el cliente también. La sentencia se tokeniza, se parsea, viaja por el pipeline
entero y se descarta al final **sin un diagnóstico**. Escribir un `@{ … }` y no escribir nada
producen el mismo output.

El token existe desde [SDD-03](../SDD-03-tokenizer.md) y el nodo del AST desde
[SDD-05](../SDD-05-parser-html.md). Lo que faltaba era el último paso.

### Síntoma 2 — el `@while` no tiene forma de terminar

`@while` es el único bucle que no declara variable de iteración: su cursor vive **fuera** del
bloque y lo avanza el cuerpo. Así lo escribe el ejemplo canónico de la decisión 91:

```razor
@{ cur = lista; }
<ul>
  @while (cur !== null) key (cur.id) {
    <li>nodo @cur.n</li>
    @{ cur = cur.next; }
  }
</ul>
```

Con el `@{ … }` descartado nada avanza, la cabecera lee el mismo nodo para siempre y el
bucle fabrica un nodo del DOM por vuelta hasta que la pestaña muere. **No era un `@while` que
reconciliara mal: era un `@while` que nadie podía escribir.**

> **Nota de redacción.** «El `@while` no reconcilia» se anotó al principio de la sesión como
> un cuarto defecto y **no lo es**: es el síntoma de este. Con el bloque corriendo y el cursor
> en la closure, la reconciliación funciona. Son tres BUG, no cuatro.

---

## 2. Causa raíz

### 2.1 · Una tabla con una fila mal justificada

[`emit/markup.ts`](../../../packages/compiler/src/emit/markup.ts), `SERVER_ROLE`: la tabla
que BUG-19 introdujo precisamente para que ningún tipo de nodo pudiera colarse por un
`default` tenía a `'inline-code'` en `'none'`, con este motivo escrito al lado:

> *Author JS, not markup: `@{ … }` and `@code { … }` are hoisted by `module.ts`.*

Cierto de `@code`, **cuya región es el módulo**. Falso de este, que no se iza a ninguna parte
y por lo tanto no corría en ninguna. La rama de cliente
([`markup-client.ts`](../../../packages/compiler/src/emit/markup-client.ts), `#node`) lo
dejaba caer por el mismo argumento, en un comentario gemelo.

La tabla hizo su trabajo —el nodo estaba **nombrado**, no olvidado—; lo que falló es el
razonamiento que le puso el valor. Dos construcciones que comparten la palabra «código» no
comparten destino.

### 2.2 · El cursor era parámetro del bloque, y un parámetro se traga la escritura

[`emit/block.ts`](../../../packages/compiler/src/emit/block.ts): es parámetro todo nombre que
el cuerpo **consume**, no declara y puede cambiar de valor
([SDD-30 §3.3](../SDD-30-renders-de-bloque.md)). `cur` cumple las tres, así que se pasaba por
parámetro — y entonces `cur = cur.next` mueve **el parámetro**, la cabecera sigue leyendo la
variable de fuera, y el bucle no termina.

La regla de §3.3 restaba dos conjuntos: lo que el bloque declara y lo que no puede cambiar de
valor. Faltaba el tercero, y no es una excepción: es la otra mitad de la misma idea. Un
parámetro sirve para lo que `u` puede volver a traer; un nombre que el cuerpo **escribe** es
justo lo contrario — estado compartido con el scope de alrededor, que la decisión 17 dice que
el bloque ve.

### 2.3 · Y una vez corriendo, tenía que correr en las tres pasadas

Con el bloque emitido en `c` y en `h`, quedaba lo que ninguna de las dos enseña:

- **Un `@while` termina CONSUMIENDO estado.** En la segunda pasada ese estado está gastado:
  `while (cur !== null)` con `cur` ya en `null` da cero filas y retira todas las vivas. Por
  eso el cursor se **resiembra** en el template, delante del bucle, y la resiembra tiene que
  correr en la pasada de actualización.
- **Dentro del cuerpo, el avance no es un extra: es la iteración.** La reconciliación llega a
  cada fila por **una de dos puertas** —una key que ya tiene (`u()`) o una que no (`c()`)—.
  Un avance detrás de una sola hace que la cabecera lea el mismo cursor dos veces: el acierto
  que no movió nada hace que la vuelta siguiente falle la key que acaba de borrar, construya
  una fila duplicada y solo entonces avance. Tres nodos vuelven como cinco.

---

## 3. Interfaz pública

**`@fudic/compiler`**

- `ServerRole` gana `'inline-code'`, y `SERVER_ROLE['inline-code']` pasa de `'none'` a ese
  valor.
- [`emit/scope.ts`](../../../packages/compiler/src/emit/scope.ts) estrena
  `assignedNames(fragments)`: los nombres que un conjunto de fragmentos del template
  **asigna**. Se apoya en el `collectAssigned` que ya había.
- `ClientMarkupEmitter` gana `#inlineCode(node)`, privado.

Ninguna firma pública del paquete cambia de forma. Lo que cambia es el **texto emitido** de
un componente que escriba `@{ … }`, que antes no existía.

---

## 4. Comportamiento corregido

**4.1 · `@{ … }` corre en su sitio, verbatim.** La región es JS opaco que Oxc ya validó, y
el recorrido está dentro de la función de render, así que el scope que ven las sentencias es
el que promete la decisión 17: el bloque que las contiene. El servidor las escribe en orden
de documento — un bloque que corriera detrás de la interpolación pintaría el valor que fue
escrito para cambiar.

**4.2 · En las tres pasadas del cliente, y las tres por una razón distinta.**

- **`c`** — es una sentencia del cuerpo de render.
- **`h`** — porque no pinta ningún nodo: `h` no tiene nada que adoptar por él, pero sí tiene
  que dejar el scope de alrededor en el estado que lee el resto del recorrido. Una instancia
  que despertó hidratando tendría, si no, variables distintas de una creada, y las dos ramas
  dejarían de estar de acuerdo sobre lo que dice el template — que es el invariante entero
  de ese módulo.
- **`u`** — porque una actualización **también es un render**. Es lo que hace resembrable un
  `@while`.

**4.3 · Un nombre que el cuerpo ASIGNA no es parámetro del bloque.** Se lee y se escribe por
la closure. Es la tercera resta de [SDD-30 §3.3](../SDD-30-renders-de-bloque.md), y **decisión
116** de la gramática.

**4.4 · Dentro de un bloque, el `@{ … }` va detrás de las dos puertas de la
reconciliación**, `c()` y `u()`. No es duplicación: es que la iteración ocurre una vez por
fila y hay dos formas de llegar a una fila.

**4.5 · El `@while` canónico de la decisión 91 se puede escribir.** La resiembra la escribe
el autor, en el template y delante del bucle, que es donde el emit puede meterla en el cuerpo
de actualización. No hay magia del compilador: hay un sitio donde ponerla.

---

## 5. Invariantes

- **Nada del AST se descarta en silencio.** Un tipo de nodo que el emit no pinta tiene que
  decir por qué, y el motivo tiene que ser cierto **de ese nodo**, no de su vecino de tabla.
  BUG-19 puso la tabla; esto es la revisión de una de sus filas.
- **Las tres pasadas ven las mismas sentencias.** Lo que cambia entre `c`, `h` y `u` es de
  dónde salen los nodos, nunca qué código del autor corre.
- **Un parámetro es lo que `u` puede volver a traer.** Lo que el cuerpo escribe no lo es, y
  pasarlo por parámetro no es una ineficiencia: es un cambio de significado.
- **Una iteración se avanza una vez por fila**, entre por la puerta que entre.

---

## 6. Criterios de aceptación

`packages/compiler/test/emit/inline-code.test.ts`. Cada uno se vio fallar antes.

**El bloque**

1. **(rojo primero)** El **servidor** lo ejecuta, y lo hace **antes** del run que lo lee: el
   orden es el contrato entero.
2. **(rojo primero)** El **cliente** lo ejecuta al fabricar (`c`) y al adoptar (`h`).
3. Y otra vez en la pasada de actualización: `const $u = () => { $a(); marca = 3; };`.
4. Un template que no lleva ninguno no emite nada por él.

**El `@while` de la decisión 91**

5. **(rojo primero)** El recorrido del **servidor** avanza el cursor dentro del bucle.
6. **(rojo primero)** El cursor **no** es parámetro del bloque: la firma es
   `($parent, $anchor)` y no `($parent, $anchor, cur)`.
7. **(rojo primero)** El avance está detrás de **las dos** puertas de la reconciliación,
   `c()` y `u()`.
8. La resiembra corre por delante de la reconciliación:
   `u: () => { $a(); cur = lista; $u0(); },`.

**Navegador**

9. **En Chrome de verdad** (`examples/basic/tests/reactividad.spec.ts`): en `/reactividad`,
   `<signal-code>` pinta `marca = 3` —también en el HTML servido—, y la lista enlazada de
   `<signal-while>` mantiene sus tres nodos cuando se mueve una signal que la lista **no
   lee**, que es la pasada de actualización completa con la cabecera reejecutada.

---

## 7. Fuera de alcance

- **HTML dentro de `@{ … }`.** La decisión 16 lo deja fuera de v1 y sigue fuera: para markup
  condicional está `@if`.
- **`@break` / `@continue`** (decisión 13): siguen sin existir en sintaxis Razor.
- **Un diagnóstico para un `@while` cuyo cuerpo no avanza nada.** Se puede detectar en algunos
  casos y en otros no —el avance puede estar detrás de una llamada—, así que una regla a
  medias que a veces calla es peor que ninguna. Merece su propia discusión.
- **La deuda de cobertura de `@fudic/compiler`.** Su propia tanda.
