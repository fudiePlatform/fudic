# view

Lo que puede contener el markup de un `.fud`, y la parte de `@code` que evalúa el servidor: una lista cerrada que se traduce con el mismo significado a TypeScript, C#, Java, Go, Rust y Python.

## La regla

La vista rellena huecos; no programa. Todo lo que no esté en esta lista es un error, aunque sea JavaScript válido. "Funciona en JS" nunca es la prueba: la prueba es si el compilador puede traducirlo a todos los lenguajes de backend.

La lista se aplica a:

- `@(expr)`, el `@name` implícito, `@a.b`, `@count()` y `@raw(expr)`;
- todo valor de atributo, `.prop=`, `class:`, `style:`, `ref`, `control`, `error=`;
- las cabeceras de `@if`, `@switch`, `case`, `@foreach`, `@for`, `@while` y su `key ( … )`;
- los argumentos de `@render`;
- `@{ … }`;
- lo que la vista lee de `@code`, de forma transitiva (abajo).

**No** se aplica a los handlers de eventos (`@click=@(…)`, `bus:x=@f`) ni a una prop callback (`.onPick=@chosen`): eso es TypeScript normal que solo se ejecuta en el navegador. Pon ahí la lógica que solo es JS, o calcula los valores en un `computed`, en el `load()` de la página (tema `pages`) o en un pipe.

## Valores y nombres

- Literales: strings (`"active"`), números en cualquier notación de JS salvo `bigint` (`3.5`, `1e3`, `0x10`, `1_000`), `true`, `false`, `null`.
- `undefined` es el único global. `Math`, `JSON`, `Date`, `Intl`, `Number`, `String`, `Object`, `NaN`, `window`, `document`, `console` son `FUD0907`.
- Nombres: lo que declara la plantilla, lo que declara `@code`, y `data` en una página.
- `null` y `undefined` significan lo mismo: **ausente**. `x === null` y `x === undefined` preguntan ambos "¿falta?".
- Toda la aritmética es float de 64 bits, como en JS.

## Operadores

| Operador | Operandos |
|---|---|
| `+` | dos números (suma), o un string con un string o un número (concatenación) |
| `- * / %`, `-` unario | números; `%` conserva el signo del dividendo |
| `===`, `!==` | dos primitivos del mismo tipo, o un lado `null`/`undefined` |
| `<`, `<=`, `>`, `>=` | dos números, dos strings o dos fechas |
| `&&`, `\|\|`, `!` | solo booleanos |
| `a ?? b` | `a` puede estar ausente |
| `c ? a : b` | `c` es un booleano |
| `a \| pipe` | un pipe (abajo) |

No permitidos (`FUD1142`): `==`, `!=`, `typeof`, `instanceof`, `in`, `void`, `+` unario, `~`, `&`, `^`, `<<`, `>>`, `>>>`, `**`. La asignación, `++`, `--`, `delete` son `FUD0900` (solo `@{ }` reasigna). El operador coma es `FUD0906`. Un literal de regex es `FUD0919`.

**Sin truthiness.** Las condiciones, los operandos de `&&`, `||`, `!` y la arrow de `filter` son booleanos (`FUD1151`). Lo que cuenta como verdadero para `""`, `0` o una lista vacía cambia de un lenguaje a otro.

- `@if (name)` → `@if (name !== "")` o `@if (name !== null)`.
- `title || "Untitled"` → `title ?? "Untitled"`.
- `count && "…"` → `count > 0 ? "…" : ""`.
- "Nada que mostrar" → `@empty` (abajo).

**Strings y fechas se comparan con `<`.** Los strings se comparan por unidad de código UTF-16, como hace JS (`"Z" < "a"` es `true`); no hay orden de diccionario por idioma. Las fechas se comparan por instante. Nunca restes dos fechas: compáralas.

## Llamadas: solo lecturas reactivas

La única llamada que hace la vista es leer un valor reactivo, sin argumentos: una `signal`, un `computed`, un formulario o uno de sus controles (`count()`, `form.$valid()`, `field.errors()`, `field.pending()` mientras una regla remota no ha contestado: `@if (form.alias.pending()) { <small>Comprobando…</small> }`). Más `t("…")` de `@fudic/i18n`, solo como valor de una prop; el enlace de una función del servidor, `photo.url({ id: p.id })` (un objeto de campos simples, o `url()` sin argumentos), en cualquier sitio; y las cinco operaciones de colección.

Todo lo demás es `FUD1140`: una función de `@code` (`@format(x)`), un import, un método de cualquier prototipo (`find`, `some`, `includes`, `join`, `sort`, `slice`, `toFixed`, `toUpperCase`, `toLocaleString`), una llamada con `?.()`. `new` es `FUD1141`. Una arrow en cualquier sitio salvo como argumento de una operación de colección, y un template etiquetado, son `FUD0905`. `as`, `satisfies`, `x!` y los argumentos de tipo son `FUD1144`. Un literal de objeto o de array es `FUD1143`.

## Acceso y texto

- `a.b`, `a?.b`: un campo de un objeto tipado (props, `data`, un tipo de `.fudapi`, un formulario).
- `xs[i]`, `xs?.[i]`: `i` es un número; fuera de rango es ausente.
- `m[k]`: `m` es un mapa (`Record`); una clave que falta es ausente. `post["title"]` sobre un objeto que no es un mapa es `FUD1153`.
- Templates sin etiqueta: `` `/blog/${post.slug}` ``; cada hueco un string o un número.
- `@(x)` pinta un string, un número, un booleano o nada (ausente). Una fecha solo se pinta a través de un pipe.

## Control

- `@if (c) { … } else if (c) { … } else { … }`, `c` booleano.
- `@switch (x) { case "a": … case "b": … default: … }`: `x` es un string, un número o una unión de literales; cada `case` es un literal (`FUD1148`).
- `@foreach (const x of xs) key (x.id) { … }`: `xs` es una lista; la key es un string o un número. La desestructuración funciona en la cabecera: `@foreach (const { id, title, author: { name: who }, featured = false } of posts) key (id)`.
- `@for (let i = 0; i < n; i++) key (i) { … }`: el paso solo escribe las variables que declara su cabecera.
- `@while (c) key (k) { … }`: su cuerpo debe escribir lo que lee `c` (`FUD0913`).
- Todo bucle necesita su `key ( … )` (`FUD0540`).
- `@empty { … }` va justo después de la llave de cierre de un bucle y se renderiza cuando el bucle no da ninguna vuelta (`FUD1149` en otro sitio o dos veces). No ve la variable del bucle.
- `@{ … }` contiene `const`/`let` (se admite desestructuración de objetos) y reasignaciones de una variable (`x = e`, `x += e`, `x++`). Sin `if`, bucles, llamadas ni escrituras en miembros (`FUD0908`, `FUD0900`). Un nombre que declara se ve después de él, en el mismo bloque.
- `@raw(html)` escribe markup y debe ser el único contenido de su elemento (`FUD0990`). Solo escribe elementos para un valor marcado con `trustedHtml(…)` en `@code`; cualquier otro string se escribe escapado.
- Desestructuración y rest: solo patrones de objeto (`FUD1146` para `[a, b]` o `{ [k]: v }`). Un `...rest` se lee por campo (`rest.title`), se propaga sobre un tag (`<input ...rest>`, `<app-card ...rest>`) o se vuelve a desestructurar; cualquier otra cosa es `FUD1147`.

## Colecciones: cinco piezas

`filter`, `map`, `reduce` (siempre con su valor inicial), `toSorted` y `.length`. Nunca modifican la lista. Cada una recibe una arrow con cuerpo de expresión y parámetros simples: `x` o `(x, i)` para `filter`/`map`, `(acc, x)` o `(acc, x, i)` para `reduce`, `(a, b)` para `toSorted`. Un cuerpo de bloque, un nombre de función (`xs.filter(isValid)`), un parámetro o argumento de más, o un `reduce` sin su valor inicial es `FUD1145`. `map` devuelve un valor o un campo, nunca un literal de objeto (`FUD1143`). `.length` funciona sobre una lista y sobre un string, no sobre un mapa (`FUD1153`).

| Necesidad | Escribe |
|---|---|
| contar todos | `tasks().length` |
| contar los que cumplen | `tasks().filter(t => t.priority === 1).length` |
| ¿alguno? (`some`) | `tasks().filter(t => t.priority === 1).length > 0` |
| ¿todos? (`every`) | `tasks().filter(t => !t.done).length === 0` |
| ¿contiene? (`includes`) | `tags.filter(t => t === "urgent").length > 0` |
| el primero que cumple (`find`) | `tasks().filter(t => t.id === selected())[0]` (ausente si no hay) |
| los tres primeros (`slice`) | `tasks().filter((t, i) => i < 3)` |
| un campo | `tasks().map(t => t.title)` |
| suma | `lines.reduce((s, l) => s + l.price * l.quantity, 0)` |
| máximo / mínimo | `notes.reduce((m, n) => n > m ? n : m, 0)` · `notes.reduce((m, n) => n < m ? n : m, 10)` |
| media | `notes.length > 0 ? notes.reduce((s, n) => s + n, 0) / notes.length : 0` |
| unir texto (`join`) | ``authors.reduce((s, a, i) => i === 0 ? a.name : `${s}, ${a.name}`, "")`` |
| ordenar por número | `tasks().toSorted((a, b) => a.priority - b.priority)`; al revés `b.price - a.price` |
| ordenar por texto o fecha | `xs.toSorted((a, b) => a.title < b.title ? -1 : a.title > b.title ? 1 : 0)` |
| encadenar | `lines.filter(l => !l.paid).map(l => l.price * l.quantity).reduce((s, x) => s + x, 0)` |
| caracteres restantes | `@(140 - text().length)` |

Un comparador debe devolver `0` para elementos iguales y signos opuestos cuando `a` y `b` se intercambian: `(a, b) => a.title < b.title ? -1 : 1` está mal. `toSorted` es estable. Agrupar, quitar duplicados, aplanar, invertir y concatenar construyen listas nuevas: hazlo en `load()` o en un handler.

## Lo que el servidor evalúa de `@code`

`@code` es código de navegador, pero el servidor evalúa cada declaración que lee la vista, de forma transitiva. Cada una debe tener una de estas formas (si no, `FUD1150`, sobre la declaración):

- `const { a, b = 1, ...rest } = props<T>()`;
- `const x = signal(v)` o `signal<T>(v)`, con `v` de esta lista, un literal de datos o `now()`;
- `const x = computed(() => e)`, con `e` de esta lista;
- `const x = e` o `let x = e`, con `e` de esta lista, un literal de datos o una llamada del catálogo: `signal`, `computed`, `props`, `inject(Token)`, `trustedUrl`, `trustedHtml`, los presets de pipe con opciones literales, `t()`, y un pipe propio llamado con parámetros literales;
- `import` del proyecto (un store de signals, un módulo cuyo `export default` es un literal de datos, un pipe), de `fudic:<id>` (un `.fudapi`), un nombre del catálogo de un paquete `@fudic/*`, o una librería fudic. Cualquier otro paquete es `FUD1150`.

Un literal de datos es una lista de primitivos (`["a", "b"]`) o un literal de objeto/array cuyo tipo tiene nombre: un `type` de un `.fudapi`, o las props de un componente. `now()` solo se permite como argumento completo de `signal(…)` (`FUD0912`): el servidor lo evalúa una vez por render, y el navegador que hidrata lee el mismo instante. Hazlo avanzar desde un handler: `shown.set(new Date())`.

Las funciones, `effect` y todo lo que la vista no lee no tienen restricciones.

## Tipos portables

Lo que leen la vista y esas declaraciones se tipa con: `string`, `number`, `boolean`, `Date`; uniones de literales de string; `T | null`, `T | undefined`, `x?: T`; `readonly T[]` y `T[]`; `Readonly<Record<string, V>>` (un mapa); un `type` o `enum` de un `.fudapi`; las props de un componente; `Signal<T>`, `Computed<T>`, un pipe, formularios y sus controles. Un tipo función solo para una prop callback. Un objeto anidado anónimo, una tupla, una clase, `Map`, `Set`, `any` o `unknown` es `FUD1153`. Declara los tipos de datos en el `.fudapi` del componente (tema `fudapi`).

## Un componente que usa la lista

```fudapi path=src/components/app-tasks/app-tasks.fudapi
# The tasks the list shows.
type Task
  id        i32
  title     str
  priority  i32
  done      bool
  created   date
```

```fud path=src/components/app-tasks/app-tasks.fud
<link rel="server" href="./app-tasks.fudapi">

@code {
  /** The tasks, by priority, with how many are done. Ticking one moves the counters. */
  import { computed, date, now, signal } from "@fudic/core";
  import type { Task } from "fudic:components/app-tasks/app-tasks";

  const { initial = [] } = props<{
    /** The tasks to start with. */
    initial?: readonly Task[];
  }>();

  const tasks = signal<readonly Task[]>(initial);
  const done = computed(() => tasks().filter(t => t.done).length);
  const pending = computed(() => tasks().filter(t => !t.done).length);
  const byPriority = computed(() => tasks().toSorted((a, b) => a.priority - b.priority));
  const shown = signal(now());
  const short = date({ dateStyle: "short", timeZone: "Europe/Madrid" });

  function toggle(t: Task) {
    tasks.set(tasks().map(x => x.id === t.id ? { ...x, done: !x.done } : x));
  }
}

<app-tasks>
  <template shadowrootmode="open">
    <p class="count">Done: @done() · Pending: @pending()</p>
    <ul @change=@toggle(t)>
      @foreach (const t of byPriority()) key (t.id) {
        <li>
          <label>
            <input type="checkbox" .checked=@t.done delegate:t="change">
            @t.title
            <small>@(t.created | short), @(t.created < shown() ? "past" : "upcoming")</small>
          </label>
        </li>
      } @empty {
        <li>No tasks.</li>
      }
    </ul>
    <button type="button" @click=@(() => tasks.set([]))>Clear</button>
    <p>Shown at @(shown() | short)</p>
  </template>
</app-tasks>
```

El servidor evalúa los dos `computed` y pinta los contadores; en el navegador, marcar una casilla ejecuta el handler (TypeScript libre: ahí `{ ...x }` está bien) y los contadores se repintan.

## Pipes: formateo

Un pipe formatea un valor como texto en el locale de la página (una app sin `"locales"` es `en`). Los presets vienen de `@fudic/core`: `date` (requiere `timeZone`), `number`, `currency`, `percent`, `relativeTime`, `list`. Fija sus opciones en `@code` con literales; la vista solo escribe `|`:

- `const euros = currency("EUR");` → `@(total() | euros)`
- `const twoDecimals = number({ minimumFractionDigits: 2, maximumFractionDigits: 2 });` → `@(price | twoDecimals)`
- `const long = date({ dateStyle: "long", timeZone: "Europe/Madrid" });` → `@(published | long)`

Sin paréntesis el pipe se aplica al valor: `@name|initials`.

Un pipe propio: `fudic_generate { kind: "pipe", name: "initials", on: "str" }` escribe su contrato, su única implementación y un test en `src/pipes`. El mismo fichero formatea en el servidor y en el navegador.

```fudapi path=src/pipes/initials.fudapi
# The initials of a name, upper case: "ada lovelace" → "AL".
pipe initials
  on str
```

```ts path=src/pipes/initials.ts
import { initials } from 'fudic:pipes/initials';

export default initials.implement((value, locale) =>
  value
    .split(/\s+/u)
    .filter((word) => word !== '')
    .map((word) => word.charAt(0).toLocaleUpperCase(locale))
    .join(''),
);
```

```fud path=src/components/app-author/app-author.fud
@code {
  /** The author of a post, with a round badge of their initials. */
  import initials from "../../pipes/initials";

  const { name } = props<{
    /** The author's full name. */
    name: string;
  }>();
}

<app-author>
  <template shadowrootmode="open">
    <p><abbr title=@name>@(name | initials)</abbr> @name</p>
  </template>
</app-author>
```

Un pipe declarado con parámetros (`max u32` bajo `on str`) se implementa como `(value, { max }, locale) => …`, y la vista lo usa configurado una vez en `@code`: `const short = truncate({ max: 40 });` → `@(summary | short)`.

## En lugar de… (costumbres de JS)

| En lugar de… | Escribe | Código |
|---|---|---|
| `xs.find(x => x.id === id)` | `xs.filter(x => x.id === id)[0]` | `FUD1140` |
| `xs.some(x => x.ok)` | `xs.filter(x => x.ok).length > 0` | `FUD1140` |
| `xs.every(x => x.ok)` | `xs.filter(x => !x.ok).length === 0` | `FUD1140` |
| `xs.includes(v)` | `xs.filter(x => x === v).length > 0` | `FUD1140` |
| `names.join(", ")` | ``names.reduce((s, n, i) => i === 0 ? n : `${s}, ${n}`, "")`` | `FUD1140` |
| `xs.sort(cmp)` | `xs.toSorted(cmp)` | `FUD1140` |
| `xs.slice(0, 3)` | `xs.filter((x, i) => i < 3)` | `FUD1140` |
| `n.toFixed(2)`, `d.toLocaleDateString()` | un pipe `number` o `date` | `FUD1140` |
| `s.toUpperCase()`, `String(n)` | un pipe propio; `@n` pinta un número | `FUD1140` |
| `format(x)` (una función de `@code`) | `computed(() => …)` con la lista, o un pipe | `FUD1140` |
| `new Date()` | `const shown = signal(now())` en `@code` | `FUD1141` |
| `Math.max(a, b)`, `JSON.stringify(x)`, `window.innerWidth` | `a > b ? a : b`; calcula el resto en un handler o en `load()` | `FUD0907` |
| `@if (name)`, `@if (items.length)` | `@if (name !== "")`, `@empty` | `FUD1151` |
| `title \|\| "Untitled"` | `title ?? "Untitled"` | `FUD1151` |
| `ok && "Saved"` | `ok ? "Saved" : ""` | `FUD1151` |
| `a == b`, `a != b` | `a === b`, `a !== b`; presencia `x === null` | `FUD1142` |
| `typeof x === "string"` | un valor tipado desde el `.fudapi` | `FUD1142` |
| `x ** 2` | `x * x` | `FUD1142` |
| `{ a: 1 }` o `[1, 2]` en el markup | una `const` en `@code` con un tipo con nombre | `FUD1143` |
| `x as string`, `x!` | típalo donde se declara | `FUD1144` |
| `xs.reduce((a, b) => a + b)` | `xs.reduce((a, b) => a + b, 0)` | `FUD1145` |
| `xs.filter(isValid)` | `xs.filter(x => x.valid)` | `FUD1145` |
| `const [first, second] = pair` | un patrón de objeto | `FUD1146` |
| `i++`, `x = 1` en una expresión | `@{ x = 1; }` | `FUD0900` |
| un template etiquetado, una arrow fuera de una operación de colección | markup con `@x`; la arrow en un handler | `FUD0905` |
| `/\d+/.test(s)` | calcúlalo en `load()` | `FUD0919`, `FUD1140` |

Los ternarios y los template literals sin etiqueta están permitidos, siempre que la condición sea un booleano y cada hueco sea un string o un número.

```fud broken=FUD1140 path=src/components/app-authors/app-authors.fud
@code {
  const { authors = [] } = props<{ authors?: readonly string[] }>();
}

<app-authors>
  <template shadowrootmode="open">
    <p>By @(authors.join(", "))</p>
  </template>
</app-authors>
```

Corregido: `<p>By @(authors.reduce((s, a, i) => i === 0 ? a : `${s}, ${a}`, ""))</p>`.

```fud broken=FUD1151 path=src/components/app-greeting/app-greeting.fud
@code {
  const { name = "" } = props<{ name?: string }>();
}

<app-greeting>
  <template shadowrootmode="open">
    @if (name) {
      <p>Hello, @name</p>
    }
  </template>
</app-greeting>
```

Corregido: `@if (name !== "") { … }`.

```fud broken=FUD1141 path=src/components/app-due/app-due.fud
@code {
  const { due } = props<{ due: Date }>();
}

<app-due>
  <template shadowrootmode="open">
    <p>@(new Date() > due ? "Late" : "On time")</p>
  </template>
</app-due>
```

Corregido: `import { now, signal } from "@fudic/core"; const today = signal(now());` en `@code`, y después `@(today() > due ? "Late" : "On time")`.

Después de cada escritura, `fudic_check`; ante un código que no entiendas, `fudic_guide { topic: "FUD1140" }`.
