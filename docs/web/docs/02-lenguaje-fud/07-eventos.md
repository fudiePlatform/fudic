# Eventos

## Escuchar un evento

`@` delante del nombre de un evento conecta ese evento del elemento con una función:

```fud
<button type="button" @click=@save>Guardar</button>
```

A la derecha puede ir una de tres cosas:

| Forma | Ejemplo | Qué recibe la función |
|---|---|---|
| Una referencia | `@click=@save` | el evento del DOM |
| Una llamada | `@click=@remove(item.id)` | los argumentos que escribes |
| Una función flecha | `@click=@(() => count.set(0))` | lo que declare la flecha |

En una llamada, `$event` es el evento:

```fud
<input @keydown=@onKey($event, item.id)>
```

```ts
function onKey(event: KeyboardEvent, id: number) {
  if (event.key === "Enter") save(id);
}
```

Vale cualquier evento del DOM (`click`, `input`, `submit`, `keydown`, `pointerenter`…) y cualquier
evento propio con guion (`@item-picked`).

> [!NOTE]
> Los handlers son **TypeScript completo**: pueden usar cualquier API del navegador, `await`,
> imports… La lista cerrada de la vista no se les aplica, porque nunca se ejecutan en el servidor.

No hay modificadores como `.prevent` o `.stop`: el handler llama a
[`preventDefault()`](https://developer.mozilla.org/en-US/docs/Web/API/Event/preventDefault) o a
[`stopPropagation()`](https://developer.mozilla.org/en-US/docs/Web/API/Event/stopPropagation)
cuando lo necesita, como en cualquier código del DOM. Y los atributos `onclick="…"` de HTML no se
admiten: un handler siempre es una función de `@code`.

## `$value`: el valor del control

En un `<input>`, un `<select>` o un `<textarea>`, `$value` es su valor en el momento del evento, ya
con su tipo:

```fud
<input type="search" @input=@search($value)>          @* string *@
<input type="checkbox" @change=@setActive($value)>    @* boolean *@
<input type="number" @input=@setAge($value)>          @* number | null: empty is null *@
```

| Control | `$value` |
|---|---|
| `checkbox` | `boolean` |
| `number` | `number \| null` (vacío es `null`) |
| `range` | `number` |
| `file` | `File \| null`, o `readonly File[]` con `multiple` |
| `<select multiple>` | `string[]` |
| cualquier otro campo | `string` |

Así no hace falta escribir `(event.target as HTMLInputElement).checked` en cada handler.

## Dónde escucha cada handler

Un `@evento` escucha en el elemento donde está escrito. En un componente hay dos sitios
especiales:

- **El propio tag del componente**: escucha en el host, como un `@HostListener` de Angular.
- **El `<template shadowrootmode>`**: escucha en el shadow root, y oye todo lo que pasa dentro.

Qué oye cada uno, y cómo se combina con los atributos del host, está en
[El host: atributos y eventos del propio tag](02-componentes.md#el-host-atributos-y-eventos-del-propio-tag).

## Eventos en una lista: delegación

Un `@click` dentro de un `@foreach` añade un listener por fila: cien filas, cien listeners, y dos
más cada vez que entra una. Fudic lo avisa (`FUD1380`) y propone **delegar**: un solo listener en
un elemento que envuelve la lista, y una marca en cada fila.

```fud
@code {
  import { signal } from "@fudic/core";
  import type { Task } from "fudic:components/miapp-tasks/miapp-tasks";

  const tasks = signal<readonly Task[]>([]);

  function remove(task: Task) {
    tasks.set(tasks().filter(t => t.id !== task.id));
  }
}

<ul @click=@remove(task)>
  @foreach (const task of tasks()) key (task.id) {
    <li>
      @task.title
      <button type="button" delegate:task="click">Borrar</button>
    </li>
  }
</ul>
```

- **`delegate:task`** marca el botón como el que entrega la fila `task`. El nombre es el de la
  variable del bucle.
- **`@remove(task)`** en el `<ul>` recibe esa fila: el objeto, con su tipo, no un índice ni un
  `data-id`. También puedes pasar solo lo que necesitas: `@remove(task.id, task.title)`.
- **El handler solo se llama desde una fila marcada.** Un clic en el título o en el hueco entre
  filas no lo dispara.
- **`delegate:task="click"`** dice a qué eventos sirve la marca, separados por espacios. Sin valor,
  sirve a todos.

La marca no deja rastro en el HTML: no escribe ningún atributo. Y la lista puede crecer o
reordenarse sin añadir ni quitar un solo listener.

> [!NOTE]
> La delegación es un patrón clásico del DOM, posible porque los eventos
> [burbujean](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Event_bubbling)
> hasta sus ancestros. Lo que añade Fudic es la marca: sin ella, cada handler tendría que buscar la
> fila con `closest()` y reconstruirla desde un `data-*`.

### Dos botones con el mismo evento

Si una fila tiene dos botones, *Ver* y *Borrar*, los dos son un `click`. Para separarlos, cada
handler lleva un nombre detrás del evento, y cada botón pide el suyo:

```fud
<tbody @click.view=@view(user) @click.remove=@remove(user)>
  @foreach (const user of users()) key (user.id) {
    <tr>
      <td>@user.name</td>
      <td>
        <button type="button" delegate:user="click.view">Ver</button>
        <button type="button" delegate:user="click.remove">Borrar</button>
      </td>
    </tr>
  }
</tbody>
```

El `click` de *Ver* nunca llega a `remove`. Sigue habiendo un listener por handler en el
`<tbody>`, tenga las filas que tenga.

## Avisar desde un componente

Un componente avisa a quien lo usa de dos formas:

- **A su padre, y solo a él**: con una prop que es una función
  ([Componentes](02-componentes.md#una-prop-que-es-una-función)).
- **A cualquiera que escuche en la página**: con el bus de eventos.

## El bus de eventos

`emit(nombre, dato)`, de `@fudic/dom`, anuncia un evento desde el componente:

```fud path=src/components/miapp-products/miapp-products.fud
@code {
  import { emit } from "@fudic/dom";
  import type { Product } from "fudic:components/miapp-products/miapp-products";

  const { products = [] } = props<{ products?: readonly Product[] }>();

  function add(product: Product) {
    emit("cart-add", product);
  }
}

<miapp-products>
  <template shadowrootmode="open">
    <ul @click=@add(product)>
      @foreach (const product of products) key (product.id) {
        <li>@product.name <button type="button" delegate:product="click">Añadir</button></li>
      }
    </ul>
  </template>
</miapp-products>
```

Cualquier componente de la página lo recibe con `bus:nombre`, en cualquier elemento:

```fud path=src/components/miapp-cart/miapp-cart.fud
@code {
  import { signal } from "@fudic/core";
  import type { Product } from "fudic:components/miapp-products/miapp-products";

  const items = signal<readonly Product[]>([]);

  function added(product: Product) {
    items.set([...items(), product]);
  }
}

<miapp-cart>
  <template shadowrootmode="open">
    <span bus:cart-add=@added>Carrito (@items().length)</span>
  </template>
</miapp-cart>
```

- **El handler recibe el dato**, no el evento: `added` recibe el producto. Si necesitas el evento,
  `$event` sigue ahí: `bus:cart-add=@added($event.detail)`.
- **Está tipado.** El tipo del dato es el que declara el parámetro del receptor, y un `emit` que
  manda otra cosa se subraya en el editor.
- **Lo oyen todos los receptores** de la página: emisor y receptores no tienen que conocerse ni
  estar uno dentro del otro.
- **Ningún evento se pierde.** Si el componente que emite se despierta con ese mismo clic, Fudic
  hidrata antes a los que escuchan, así que el primer «Añadir» ya llega al carrito.
- **El receptor se da de baja** cuando su componente sale de la página.

Por debajo es el estándar: `emit` lanza un
[`CustomEvent`](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent) con `bubbles` y
`composed`, para que cruce los shadow roots hasta el documento, y `bus:` lo escucha ahí. Lo que
añade Fudic es el tipo, la baja automática y que el primer evento no se pierda.

## El estándar, en MDN

- [Introducción a los eventos](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Events):
  qué es un evento y cómo se escucha.
- [Burbujeo de eventos](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Event_bubbling),
  y en concreto la [delegación](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Event_bubbling#event_delegation).
- [`Event.composed`](https://developer.mozilla.org/en-US/docs/Web/API/Event/composed): qué eventos
  salen de un shadow root.
- [`CustomEvent`](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent): eventos propios con
  un dato.
- [`Event.preventDefault()`](https://developer.mozilla.org/en-US/docs/Web/API/Event/preventDefault):
  cancelar lo que el navegador haría por defecto.
