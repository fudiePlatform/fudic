# Sintaxis de plantillas

Un fichero `.fud` es HTML estándar con una sola marca añadida: la `@`. Donde aparece una `@`
entra código; donde no, todo es HTML y CSS tal cual los lee el navegador.

```fud
<ul>
  @foreach (const post of posts) key (post.id) {
    <li><a href=@post.url>@post.title</a></li>
  } @empty {
    <li>Todavía no hay entradas.</li>
  }
</ul>
```

Esta forma de escribir plantillas se llama **Razor**. Fudic la toma y la adapta a TypeScript.

## Por qué Razor

### Madurez

Razor no es un invento de Fudic. Microsoft lo presentó en 2010 con ASP.NET MVC 3 y desde
entonces es la forma de escribir vistas en ASP.NET Core y en Blazor: más de quince años de uso
en producción, en millones de páginas. Sus reglas ya están probadas, y sus casos raros, resueltos.

La idea de fondo también se ha extendido: Angular adoptó en 2023 bloques con `@` (`@if`, `@for`)
para su control de flujo, en lugar de las directivas en atributos que usaba.

Fudic conserva lo que funciona de Razor con su misma ortografía, para que nadie tenga que
aprenderlo dos veces:

| Razor | Fudic | Para qué |
|---|---|---|
| `@nombre`, `@(expr)` | igual | escribir un valor |
| `@if`, `@foreach`, `@for`, `@while`, `@switch` | igual | control de flujo |
| `@{ … }` | igual | declarar variables en la plantilla |
| `@* … *@` | igual | comentario que no llega al HTML |
| `@@` | igual | una `@` literal |
| `@code { … }` | igual (como en Blazor) | el código del componente |
| `@RenderBody()`, `@RenderSection()`, `@section` | igual | layouts |

### Claridad

Con Razor, el HTML sigue siendo HTML. Compáralo con las alternativas:

- **Directivas en atributos** (`v-if`, `*ngIf`, `x-for`): el control de flujo se esconde dentro de
  un atributo y parece una propiedad más del elemento.
- **JSX**: el HTML pasa a ser JavaScript. `class` se escribe `className`, `for` se escribe
  `htmlFor`, y un bucle es un `.map()` que devuelve markup.
- **Razor**: el control de flujo se ve como control de flujo, y el HTML se escribe como se
  escribe en cualquier página. La `@` marca exactamente dónde entra el código, y en ningún sitio
  más.

El compilador distingue cada caso mirando lo que sigue a la `@`. Una dirección como
`ana@ejemplo.com` sigue siendo texto, porque la `@` va pegada a una palabra. Si alguna vez
necesitas una `@` suelta, escribe `@@`.

### Adaptada a TypeScript

Razor nació para C#. Fudic cambia C# por **TypeScript** y conserva todo lo demás:

- Las expresiones y las cabeceras de los bucles son TypeScript: `@foreach (const x of xs)` es un
  `for…of`, y `@for (let i = 0; i < n; i++)` es el `for` de siempre.
- El bloque `@code { … }` es TypeScript estándar, con sus tipos y sus imports.
- El editor comprueba los tipos de la plantilla igual que los del código: una prop que no existe o
  un valor del tipo equivocado se subraya mientras escribes.

Y añade lo que un framework de componentes web necesita:

- **El componente es su propio tag**, envolviendo un `<template shadowrootmode>`: el
  Declarative Shadow DOM del estándar (capítulo 1).
- **Todo bucle lleva su `key (…)`**, para que una lista que se reordena no pegue el estado a la
  fila equivocada.
- **Prefijos para los bindings**: `.prop`, `@evento`, `class:`, `bus:`, `delegate:`.

## La `@`, de un vistazo

| Escribes | Qué es | Dónde se explica |
|---|---|---|
| `@post.title`, `@count()` | escribe un valor | [Expresiones](05-expresiones.md) |
| `@(a + b)` | escribe una expresión | [Expresiones](05-expresiones.md) |
| `@if`, `@foreach`, `@switch`… | control de flujo | [Expresiones](05-expresiones.md) |
| `title=@x`, `class:on=@x` | atributos | [Atributos y propiedades](06-atributos-y-propiedades.md) |
| `.title=@x` | una prop de un componente | [Atributos y propiedades](06-atributos-y-propiedades.md) |
| `...post` | pasa un objeto entero | [Atributos y propiedades](06-atributos-y-propiedades.md) |
| `@click=@save` | escucha un evento | [Eventos](07-eventos.md) |
| `delegate:row` | delega el evento de una fila | [Eventos](07-eventos.md) |
| `bus:picked=@heard` | escucha el bus de eventos | [Eventos](07-eventos.md) |
| `ref="@field"` | guarda el elemento en una variable | [`ref` y `@raw`](08-ref-y-raw.md) |
| `@raw(html)` | escribe HTML en vez de texto | [`ref` y `@raw`](08-ref-y-raw.md) |
| `@render card(…)` | expande un snippet | [Snippets](04-snippets.md) |
| `@RenderBody()` | el hueco de un layout | [Rutas y layouts](03-rutas-y-layouts.md) |

## Las piezas

Todo en Fudic es un fichero `.fud`, y hay cuatro clases. El compilador sabe cuál es cada uno por
su forma, no por su nombre ni por su carpeta:

| Pieza | Su forma | Para qué |
|---|---|---|
| **Componente** | Su tag envolviendo un `<template shadowrootmode>` | Una etiqueta propia, con su markup, sus estilos y su comportamiento. |
| **Ruta** | Empieza con `<link rel="layout">` | Una página: la URL sale de dónde está el fichero. |
| **Layout** | Empieza con `<!DOCTYPE html>` | El documento completo en el que se pinta cada ruta. |
| **Snippet** | Declaraciones `@snippet nombre(…) { … }` | Un trozo de markup que se repite, sin JavaScript ni shadow DOM. |

```fud path=src/components/miapp-badge/miapp-badge.fud
<miapp-badge>
  <template shadowrootmode="open">
    <span class="badge"><slot></slot></span>
  </template>
</miapp-badge>
```

```fud path=src/routes/about.fud
<link rel="layout" href="../layouts/_layout.fud">

<h1>Quiénes somos</h1>
```

```fud path=src/layouts/_layout.fud
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <script type="module" src="fudic:runtime"></script>
    @RenderHead()
  </head>
  <body>@RenderBody()</body>
</html>
```

```fud path=src/snippets/ui.fud
@snippet field(name: string, label: string) {
  <label>@label <input name=@name></label>
}
```

Cada pieza tiene su página: [Componentes](02-componentes.md), [Rutas y layouts](03-rutas-y-layouts.md)
y [Snippets](04-snippets.md).

## La vista rellena huecos, no programa

Lo que escribes en la plantilla (las expresiones, las condiciones, los bucles, los valores de los
atributos) es una **lista cerrada** de construcciones. Una vista puede leer valores, compararlos,
combinarlos y recorrer listas, pero no puede llamar a cualquier función ni usar cualquier método
de JavaScript:

```fud
<p>@(items().filter(i => i.done).length) de @items().length hechas</p>   ✓
<p>@items().find(i => i.done).title</p>                                  ✗ FUD1140
```

La lógica vive donde se puede probar: en el `@code` del componente, en un `computed`, en los
datos que trae la página del servidor o en un pipe. La vista solo rellena los huecos.

Los handlers de eventos no tienen esta limitación: son TypeScript completo, porque solo se
ejecutan en el navegador. La lista entera está en [Expresiones](05-expresiones.md).

Hay dos razones para la lista cerrada. La primera es la claridad: una plantilla que no programa
se lee de un vistazo. La segunda es la portabilidad.

## Vistas políglotas

Una página de Fudic se pinta en el servidor. Hoy ese servidor es Node, con TypeScript. Pero muchos
equipos ya tienen su backend en otro lenguaje, y no quieren montar un servidor de Node solo para
pintar HTML.

Por eso la vista de Fudic está pensada para **traducirse**. Cada construcción de la lista tiene
su equivalente exacto en seis lenguajes de servidor:

| Lenguaje | Estado |
|---|---|
| **TypeScript** (Node) | Implementado. |
| **C#** | Diseñado. |
| **Java** | Diseñado. |
| **Go** | Diseñado. |
| **Rust** | Diseñado. |
| **Python** | Diseñado. |

El criterio para que algo entre en la vista no es que exista en JavaScript, sino que el
compilador pueda traducirlo a los seis lenguajes **con el mismo resultado**. Por eso `filter`,
`map`, `reduce`, `toSorted` y `.length` sí están (tienen equivalente directo en todos) y `find` o
`toFixed` no. Lo que no existe igual en todos (formatear una fecha, un número o una moneda) lo
pone el catálogo de Fudic, escrito una vez para cada lenguaje.

Esta vista:

```fud
@code {
  import { computed, signal } from "@fudic/core";

  const tasks = signal<readonly Task[]>(data.tasks);
  const done = computed(() => tasks().filter(t => t.done).length);
}

<p>Hechas: @done() de @tasks().length</p>
```

se traducirá así en el servidor de cada lenguaje (ilustrativo, del diseño):

```csharp
var done = (double) tasks.Where(t => t.Done).ToList().Count;
```

```go
done := float64(len(fud.Filter(tasks, func(t Task) bool { return t.Done })))
```

```python
done = float(len([t for t in tasks if t.done]))
```

Los seis tienen que pintar exactamente los mismos bytes de HTML, y una suite de conformidad común
lo comprueba fila a fila.

> [!IMPORTANT]
> **Solo se traduce el código de servidor.** Lo que pinta la vista se traduce; lo que reacciona
> en el navegador no. Los handlers, los signals que cambian y la hidratación son siempre
> TypeScript, porque se ejecutan en el navegador. Quien escribe la vista no cambia de lenguaje:
> cambia el servidor que la pinta.

> [!NOTE]
> La regla vale también para Node: una vista que compila para un backend compila para todos. Si
> mañana el equipo cambia de servidor, la vista no se toca.

## El estándar, en MDN

- [`<template>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/template):
  el elemento que envuelve el shadow DOM de cada componente.
- [Using custom elements](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements):
  por qué el tag de un componente lleva guion.
