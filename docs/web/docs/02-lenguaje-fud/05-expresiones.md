# Expresiones y control de flujo

## Escribir un valor

`@` seguido de un nombre escribe su valor en el HTML:

```fud
<p>Hola, @user.name</p>
<p>Llevas @count() clics</p>
<p>Primer elemento: @items[0].title</p>
```

Tras la `@` se admite una cadena de accesos: `.campo`, `?.campo`, `[índice]` y la lectura de un
signal, `()`. La cadena termina en el primer carácter que no encaja, así que el punto final de una
frase no forma parte de ella: `Hola, @user.name.` escribe el nombre y luego el punto.

Para todo lo demás (operadores, ternarios, plantillas de texto) se usan paréntesis:

```fud
<p>@(price * quantity) €</p>
<p>@(stock > 0 ? "Disponible" : "Agotado")</p>
<p>@(`${user.name} (${user.role})`)</p>
```

Lo que se escribe así **siempre se escapa**: un `<` en el texto llega como texto, nunca como una
etiqueta. Para escribir HTML hay una vía aparte, `@raw` ([`ref` y `@raw`](08-ref-y-raw.md)).

Un valor escribe su texto si es un string o un número, `true` o `false` si es un booleano, y nada
si es `null` o `undefined`. Una fecha se escribe siempre a través de un pipe (abajo).

## Lo que puede escribirse en una expresión

La vista es una **lista cerrada**: lo que no está aquí es un error, aunque sea JavaScript válido.
Es lo que permite traducirla a cualquier lenguaje de servidor
([Vistas políglotas](01-sintaxis.md#vistas-políglotas)).

| Puedes escribir | Ejemplo |
|---|---|
| Literales | `"activo"`, `3.5`, `true`, `null` |
| Nombres de la plantilla, de `@code` y `data` | `post`, `count()`, `data.posts` |
| Acceso a campos y a listas | `post.author.name`, `post?.author`, `items[0]` |
| Aritmética | `+ - * / %` |
| Comparación | `===`, `!==`, `<`, `<=`, `>`, `>=` |
| Lógica, sobre booleanos | `&&`, `\|\|`, `!` |
| Valor por defecto | `title ?? "Sin título"` |
| Ternario | `ok ? "Sí" : "No"` |
| Plantilla de texto | `` `/blog/${post.slug}` `` |
| Lectura de un signal o un `computed` | `count()`, `total()` |
| Cinco operaciones de colección | `filter`, `map`, `reduce`, `toSorted`, `.length` |
| Un pipe | `price \| euros` |

No hay llamadas a funciones de `@code`, ni métodos como `find`, `join` o `toUpperCase`, ni `new`,
ni globales como `Math` o `Date`. Casi todo se escribe combinando las cinco operaciones de
colección (abajo), y un cálculo largo se nombra en `@code` con un `computed`:

```fud
@code {
  import { computed } from "@fudic/core";

  const names = computed(() =>
    authors().reduce((text, a, i) => i === 0 ? a.name : `${text}, ${a.name}`, ""));
}

<p>Por @names()</p>
```

El cuerpo de un `computed` que lee la vista sigue la misma lista, porque el servidor también lo
evalúa. Lo que necesite JavaScript completo se calcula en el servidor, con los datos de la página
(capítulo 5), en un pipe o en un handler.

### Sin «truthiness»

Una condición es siempre un booleano. `""`, `0` o una lista vacía no cuentan como falso, porque
cada lenguaje lo decide de una forma distinta:

| En lugar de… | Escribe |
|---|---|
| `@if (name)` | `@if (name !== "")` |
| `title \|\| "Sin título"` | `title ?? "Sin título"` |
| `count && "…"` | `count > 0 ? "…" : ""` |
| `@if (items.length)` | `@empty` (abajo) |

`null` y `undefined` significan lo mismo: **ausente**. `x === null` y `x === undefined` preguntan
las dos «¿falta?».

### Colecciones: cinco piezas

`filter`, `map`, `reduce` (siempre con su valor inicial), `toSorted` y `.length` cubren cualquier
cálculo sobre una lista. Ninguna modifica la lista original:

| Necesitas | Escribe |
|---|---|
| Contar los que cumplen | `tasks().filter(t => t.done).length` |
| ¿Hay alguno? | `tasks().filter(t => t.urgent).length > 0` |
| El primero que cumple | `tasks().filter(t => t.id === selected())[0]` |
| Los tres primeros | `tasks().filter((t, i) => i < 3)` |
| Sumar | `lines.reduce((sum, l) => sum + l.price * l.qty, 0)` |
| Ordenar | `tasks().toSorted((a, b) => a.priority - b.priority)` |

## Condiciones

```fud
@if (user === null) {
  <a href="/login">Entrar</a>
} else if (user.admin) {
  <a href="/admin">Panel</a>
} else {
  <span>Hola, @user.name</span>
}
```

Para elegir entre varios valores, `@switch`. Cada `case` es independiente, sin `break`:

```fud
@switch (order.status) {
  case "pending":
    <p>Lo estamos preparando.</p>
  case "sent":
    <p>Va de camino.</p>
  default:
    <p>Entregado.</p>
}
```

## Bucles

`@foreach` recorre una lista. **Todo bucle lleva su `key (…)`**, que identifica cada fila:

```fud
<ul>
  @foreach (const task of tasks()) key (task.id) {
    <li>@task.title</li>
  } @empty {
    <li>No hay tareas.</li>
  }
</ul>
```

- **La key** es un string o un número único por fila. Cuando la lista se reordena, cada fila
  conserva su estado (el foco, lo que había escrito, un componente hidratado), porque Fudic sabe
  cuál es cuál. Sin key no compila: no hay valor por defecto, porque el índice da un resultado
  equivocado en cuanto la lista cambia de orden.
- **`@empty`** va justo detrás del bucle y se pinta cuando no da ninguna vuelta.
- **La cabecera admite desestructuración**:
  `@foreach (const { id, title, done = false } of tasks()) key (id)`.

`@for` es el `for` con índice de siempre, y `@while` repite mientras se cumpla la condición. Los dos
llevan su key igual:

```fud
@for (let i = 1; i <= pages; i++) key (i) {
  <a href=@(`?page=${i}`)>@i</a>
}
```

## Variables en la plantilla: `@{ }`

Un bloque `@{ … }` declara variables para lo que sigue. Admite `const`, `let` y reasignaciones,
nada más:

```fud
@foreach (const line of lines) key (line.id) {
  @{ const subtotal = line.price * line.qty; }
  <tr>
    <td>@line.name</td>
    <td>@(subtotal | euros)</td>
  </tr>
}
```

## Pipes: dar formato

Un pipe convierte un valor en texto, en el idioma de la página. Se configura una vez en `@code` y
se aplica en la vista con `|`:

```fud
@code {
  import { currency, date } from "@fudic/core";

  const euros = currency("EUR");
  const longDate = date({ dateStyle: "long", timeZone: "Europe/Madrid" });
}

<p>Total: @(total() | euros)</p>
<p>Publicado el @(post.published | longDate)</p>
```

Fudic trae `date`, `number`, `currency`, `percent`, `relativeTime` y `list`, y puedes escribir los
tuyos. Los pipes formatean igual en el servidor y en el navegador (capítulo 7).

## Comentarios y caracteres especiales

```fud
@* Esto no llega al HTML. *@
<!-- Esto sí: es un comentario HTML estándar. -->

<p>Escríbenos a hola@ejemplo.com</p>   @* una @ pegada a una palabra es texto *@
<p>Síguenos en @@fudic</p>             @* @@ escribe una @ *@
```

Dentro del cuerpo de un `@if` o de un bucle, una `}` cierra el bloque. Para escribir una llave
literal, usa su entidad HTML: `&#123;` y `&#125;`.

## En lugar de…

Las costumbres de JavaScript que más se escriben, y su forma en la vista:

| En lugar de… | Escribe |
|---|---|
| `xs.find(x => x.id === id)` | `xs.filter(x => x.id === id)[0]` |
| `xs.some(x => x.ok)` | `xs.filter(x => x.ok).length > 0` |
| `xs.includes(v)` | `xs.filter(x => x === v).length > 0` |
| `xs.slice(0, 3)` | `xs.filter((x, i) => i < 3)` |
| `xs.sort(cmp)` | `xs.toSorted(cmp)` |
| `n.toFixed(2)`, `d.toLocaleDateString()` | un pipe `number` o `date` |
| `format(x)`, una función de `@code` | un `computed` o un pipe |
| `new Date()` | `const today = signal(now())` en `@code` |
| `a == b` | `a === b` |
| `{ a: 1 }` o `[1, 2]` en la plantilla | una `const` en `@code` |

Si escribes una de la columna izquierda, el editor la subraya con su código de error y su
explicación.
