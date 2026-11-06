# components

Cómo escribir un componente `.fud`: el fichero, sus props y su estado, el uso de otros componentes, los eventos, las llamadas al servidor y los hábitos de React que no aplican.

## Créalo, nunca lo escribas desde cero

Llama a `fudic_generate { kind: "component", name: "card" }`. El prefijo del proyecto convierte el nombre en el tag (`app-card`; un nombre con guion se mantiene entero) y escribe cuatro ficheros en `src/components/app-card/`: `app-card.fud`, `app-card.test.ts`, `app-card.fudspec` y `app-card.fixture.ts`. Pasan tal como se generan. El `.fud` empieza como un `<style>` vacío y el tag alrededor de un template vacío; tú lo rellenas. Cuando añadas una prop obligatoria, dale un valor en `base` del `.fixture.ts` (`base: { title: "Card" }`), o el fixture deja de pasar la comprobación de tipos.

## La forma del fichero, en este orden

1. `<link rel="component" href="…">` por cada componente que usa, y `<link rel="server" href="./app-card.fudapi">` si llama al servidor.
2. Un bloque `@code { }` (un segundo es `FUD0154`). TypeScript.
3. `<head><style>…</style></head>`: un `<style>` (`FUD0159`), con scope al componente. Opcional.
4. El propio tag del componente envolviendo exactamente un `<template shadowrootmode="open">` (`FUD0156`, `FUD0157`). Todo lo que renderiza va dentro del template.
5. Declaraciones `@snippet name(args) { … }`, si las hay: markup reutilizable de este fichero, que se llama con `@render name(…)`.

Fuera de orden es `FUD0155`. Un componente puede no tener `@code` ni `<head>`.

```fud path=src/components/app-card/app-card.fud
@code {
  /**
   * A card with a heading. What is written between its tags fills the body; an element with
   * slot="meta" goes beside the heading. The body folds with a button.
   */
  const { title, variant = "default" } = props<{
    /** The heading of the card: one short line. */
    title: string;
    /** "highlight" draws the card with a strong border. */
    variant?: "default" | "highlight";
  }>();

  import { signal } from "@fudic/core";

  const open = signal(true);

  function toggle() {
    open.set(!open());
  }
}

<head>
  <style>
    :host { display: block; }
    .card { border: 1px solid #ddd; border-radius: 8px; padding: 1rem; }
    .card.highlight { border-color: #1a73e8; }
    ::slotted([slot="meta"]) { font-size: 0.8rem; }
  </style>
</head>

<app-card>
  <template shadowrootmode="open">
    <article class="card" class:highlight=@(variant === "highlight")>
      <header>
        @render heading(@title)
        <slot name="meta"></slot>
      </header>
      @if (open()) {
        <div class="body"><slot></slot></div>
      }
      <button type="button" @click=@toggle>
        @if (open()) { Fold } else { Unfold }
      </button>
    </article>
  </template>
</app-card>

@snippet heading(text: string) {
  <h2>@text</h2>
}
```

Estilos: `:host` es el propio tag del componente, `:host(:empty)` y similares funcionan, `::slotted(sel)` da estilo a lo que la página puso en un slot. Un `class:` en el propio tag del componente es `FUD0720`: ponlo en un elemento dentro del template. Los tokens y el CSS que acepta fudic: tema `html-css`. Expresiones, `@if`, `@foreach`, `@render`: tema `view`. Tests y criterios: tema `testing`; después de cada escritura, `fudic_check`.

## Props

- **Una sola llamada a `props<T>()`**, desestructurada: `const { title, variant = "default" } = props<{ … }>()`. La vista lee los nombres desestructurados (`@title`), nunca `props.x`.
- **Obligatoria** = una clave sin `?`. No pasarla es un error de TypeScript en el tag. Una prop desconocida es `TS2561`.
- **Opcional** = `?`. Su **valor por defecto** va en la desestructuración, y solo las props opcionales lo admiten. Una prop de valor sigue al padre: `.count=@n()` con un signal `n` repinta el hijo cuando `n` cambia.
- **JSDoc**: el primer `/** … */` del `@code` documenta el componente; un `/** … */` en cada clave de `T` documenta la prop. `fudic_describe` y el editor los muestran, y `fudic_status` cuenta lo que está documentado.
- **Rest**: `const { label, ...rest } = props<{ label: string; placeholder?: string; required?: boolean }>()` reúne las claves no nombradas; `<input ...rest>` las escribe como atributos. `T` debe ser un literal o un tipo declarado en el mismo `@code`.
- **Una prop signal**: `value: Signal<number>` (tipo de `@fudic/core`) recibe el propio signal del padre, de modo que el hijo puede leerlo, derivarlo y escribirlo. El padre pasa el nombre a secas: `.value=@count` (cualquier otra cosa es `FUD0200`).
- **Una prop callback**: `onPick: (option: string) => void`. El padre pasa el nombre a secas de una función de su `@code` (`.onPick=@chosen`, si no `FUD0201`), y el hijo debe llamarla desde un handler (`FUD0202` en caso contrario). Este es el camino de vuelta hacia un único padre.

## El estado y lo que puede hacer `@code`

`@code` es código de navegador. No hay región `@server` / `@client` (`FUD1110`): el servidor evalúa solo lo que lee la vista.

- `signal(v)`: lectura `n()`, escritura `n.set(v)`. `computed(() => expr)`: derivado y de solo lectura.
- `effect(fn)` se vuelve a ejecutar cuando cambia cualquier cosa que haya leído. `effect(fn, [a, () => user().id])` se vuelve a ejecutar solo cuando cambia una de esas fuentes, y nada más de lo que lee el cuerpo cuenta; `[]` se ejecuta una vez. Pasa fuentes, no valores: `[count()]` es un error de tipos. Una función devuelta es la limpieza, que se ejecuta antes de la siguiente ejecución y al eliminarlo.
- Los effects y tasks creados mientras se ejecuta `@code` se destruyen con el componente (el compilador envuelve el bloque en `owned`; nunca lo llames tú). Uno creado dentro de un handler vive tanto como la página.
- Lo que lee la vista debe ser algo que el servidor pueda evaluar: props, `signal(v)`, `computed(() => e)` cuyo `e` siga las reglas de la vista, un `const` de datos planos. Cualquier otra cosa que lea es `FUD1150`. La vista no llama a nada salvo lecturas reactivas (`FUD1140`).
- `now()` solo como inicializador completo de un signal: `signal(now())` (`FUD0912`).
- Los handlers y los cuerpos de los effects son TypeScript normal: APIs del DOM, `await`, lo que sea. Los nombres que empiezan por `$` están reservados (`FUD0290`).

## Usar otro componente

Enlázalo y luego escribe su tag. Un tag sin link es `FUD0191`; un link que nunca se usa es `FUD0721`. Antes de usar uno, llama a `fudic_describe { name: "app-card" }` para ver sus props, slots y eventos en lugar de abrir su fichero.

```fud path=src/components/app-badge/app-badge.fud
@code {
  /** A small rounded label. Its text is what is written between the tags. */
  const { tone = "neutral" } = props<{
    /** The colour: "neutral" grey or "success" green. */
    tone?: "neutral" | "success";
  }>();
}

<head>
  <style>
    .badge { padding: 0.15rem 0.5rem; border-radius: 999px; background: #f3f3f3; }
    .badge.success { background: #e6f4ea; }
  </style>
</head>

<app-badge>
  <template shadowrootmode="open">
    <span class="badge" class:success=@(tone === "success")><slot></slot></span>
  </template>
</app-badge>
```

```fud path=src/components/app-feed/app-feed.fud
<link rel="component" href="../app-card/app-card.fud">
<link rel="component" href="../app-badge/app-badge.fud">

@code {
  /** The list of posts, one card each, the featured ones highlighted. */
  type Post = { id: string; title: string; tag: string; summary: string; featured: boolean };

  const { posts = [] } = props<{
    /** The posts to show, in order. */
    posts?: readonly Post[];
  }>();
}

<app-feed>
  <template shadowrootmode="open">
    @foreach (const post of posts) key (post.id) {
      <app-card ...post .variant=@(post.featured ? "highlight" : "default")>
        <app-badge slot="meta" .tone=@(post.featured ? "success" : "neutral")>@post.tag</app-badge>
        @post.summary
      </app-card>
    } @empty {
      <p>No posts yet.</p>
    }
  </template>
</app-feed>
```

- **`.prop=` pasa una prop**: `.title="Hello"` (un string), `.count=3`, `.open=true`, `.title=@post.title`, `.variant=@(expr)`. Es la única forma de pasar una prop.
- **Un atributo normal es HTML** en el host: `id`, `class`, `role`, `data-*`, `aria-*`. `tone="info"` en un componente es un error de TypeScript, no una prop.
- **`class:name=@cond`** activa o desactiva una clase del `<style>` de este fichero en el tag del hijo o en cualquier elemento.
- **`@event=@handler`** escucha en ese elemento (ver Eventos).
- **Slots**: el hijo declara `<slot></slot>` (por defecto) y `<slot name="meta"></slot>`; el padre escribe contenido entre los tags, y `slot="meta"` en un elemento lo envía al slot con nombre. Un `<slot>` puede contener contenido de fallback.
- **Spread**: `...post` pasa una prop por cada clave que declara el hijo, leída de `post`; las claves de más se ignoran, una clave opcional que falta toma su valor por defecto. Un `.prop` en el mismo tag gana su clave. Tras los puntos solo va un nombre o una ruta (`FUD0991`); no en el propio tag ni en el template del componente (`FUD0992`).
- **`control=@form.field`** en un componente form-associated llega a su prop `ctrl` (ver Formularios).

## Eventos

Un handler, en cualquier elemento, es una referencia (`@click=@save`: `save` recibe el evento DOM), una llamada (`@click=@remove(item.id)`, `@keydown=@onKey($event, item.id)`: los argumentos que escribes, siendo `$event` el evento) o una lambda (`@click=@(() => count.set(0))`). Cualquier otra cosa es `FUD0291`; `onclick="…"` es `FUD0909`.

`ref="@field"` asigna el elemento a una variable que declaras, `let field: HTMLInputElement | null = null;`: `null` hasta que se renderiza y mientras un `@if` lo oculta. Un único identificador (`FUD0094`), nunca dentro de un bucle (`FUD0192`). Úsalo desde handlers y effects (ver `app-search` más abajo).

**`emit(name, detail)`** de `@fudic/dom` anuncia un evento desde el componente; burbujea fuera del shadow root hasta la página. **`bus:name=@handler`** en cualquier elemento de cualquier componente lo recibe, con el detail como argumento, tipado por el parámetro del receptor: `emit("picked", 5)` cuando un receptor recibe un `string` se subraya en el `emit`. Todos los receptores de la página lo oyen; para un único padre, usa una prop callback.

**Eventos dentro de un bucle: delega.** Un `@event` dentro de `@foreach` añade un listener por fila (`FUD1380`, un warning). Pon el handler en un elemento fuera del bucle, pásale la fila por su nombre en el bucle, y marca el elemento de la fila con `delegate:name="click"` (los eventos a los que sirve, separados por espacios; sin valor los sirve todos). La fila llega tipada, también dentro de un argumento (`@remove(p.id, p.name)`). `$p` es `FUD1383`; un marcador que ningún handler lee para ese evento es `FUD1381`; fuera de un bucle, `FUD0663`.

```fud path=src/components/app-choice/app-choice.fud
@code {
  /** A row of buttons, one per option. Picking one calls `onPick` and announces `picked`. */
  const { options = [], onPick } = props<{
    /** The texts of the buttons, in order. */
    options?: readonly string[];
    /** Called with the option the user picked. */
    onPick: (option: string) => void;
  }>();

  import { emit } from "@fudic/dom";

  function pick(option: string) {
    onPick(option);
    emit("picked", option);
  }
}

<app-choice>
  <template shadowrootmode="open">
    <div @click=@pick(option)>
      @foreach (const option of options) key (option) {
        <button type="button" delegate:option="click">@option</button>
      }
    </div>
  </template>
</app-choice>
```

```fud path=src/components/app-survey/app-survey.fud
<link rel="component" href="../app-choice/app-choice.fud">

@code {
  /** Asks one question and shows the answer. */
  import { signal } from "@fudic/core";

  const options = ["Yes", "No", "Later"];
  const answer = signal("");

  function chosen(option: string) {
    answer.set(option);
  }
}

<app-survey>
  <template shadowrootmode="open">
    <app-choice .options=@options .onPick=@chosen></app-choice>
    <p role="status">@answer()</p>
  </template>
</app-survey>
```

Cualquier otro componente de la página oye el mismo `emit` con `<p bus:picked=@heard>Last: @last()</p>` y `function heard(option: string) { last.set(option); }`.

## Llamar al servidor

Las funciones de servidor de un componente viven en un `.fudapi` junto a él: `fudic_generate { kind: "api", name: "src/components/app-search" }` lo escribe, junto con su handler en `src/server` y el `<link rel="server">`. Cómo declarar funciones: tema `fudapi`. En `@code` las funciones están en ámbito por su nombre; envuélvelas en `task` de `@fudic/core`:

- `task(fn)` llama solo en `run(args)`; `task(fn, () => ({ q: text() }), { initial: [] })` llama en cada cambio de lo que lee la fuente, nunca al crearse. Pasa la función, no una llamada.
- Un GET se ejecuta como `latest` (una llamada nueva aborta la que está en curso); POST, PUT, PATCH, DELETE como `queue` (una detrás de otra, en orden).
- Lee en la vista o en el código: `value()` (la última respuesta, o `initial`), `pending()`, `state()` (`"idle"`, `"pending"`, `"done"`, `"failed"`, `"cancelled"`), `error()`, `message()` (el mensaje del error, o `""`). `cancel()` aborta la llamada en curso.
- `run(args)` nunca rechaza: `const saved = await save.run({ id: p.id, active }); if (saved.ok) { … saved.value … }`. `ok: false` es `status: "failed"` (con `error`) o `"cancelled"`.
- En el servidor una task nunca llama: los primeros datos vienen de la página (tema `pages`) o de una prop.

```fudapi path=src/components/app-search/app-search.fudapi
# The server functions of the component: their handlers are in src/server/components/app-search/app-search.ts.
get search
  q  str
  -> Hit[]

type Hit
  id    i32
  name  str
```

```ts path=src/server/components/app-search/app-search.ts
import { search } from 'fudic:components/app-search/app-search';

search.handle((ctx) => [{ id: 1, name: ctx.args.q }]);
```

```fud path=src/components/app-search/app-search.fud
<link rel="server" href="./app-search.fudapi">

@code {
  /** A search box that lists the matching names as the user types. */
  import { effect, signal, task } from "@fudic/core";

  let field: HTMLInputElement | null = null;
  const text = signal("");
  const found = task(search, () => ({ q: text() }), { initial: [] });

  effect(() => {
    sessionStorage.setItem("app-search", text());
  }, [text]);

  function typed(e: Event) {
    text.set((e.target as HTMLInputElement).value);
  }

  function clear() {
    text.set("");
    field?.focus();
  }
}

<app-search>
  <template shadowrootmode="open">
    <input type="search" aria-label="Name" ref="@field" value=@text() @input=@typed>
    <button type="button" @click=@clear>Clear</button>
    @if (found.pending()) { <span role="status">Searching…</span> }
    @if (found.message() !== "") { <p role="alert">@found.message()</p> }
    <ul>
      @foreach (const hit of found.value()) key (hit.id) {
        <li>@hit.name</li>
      }
    </ul>
  </template>
</app-search>
```

## Formularios: un control form-associated

Los formularios se declaran en un `.fudapi` (`fudic_generate { kind: "form" }`); el autor de un componente solo necesita esto. El control importa `@fudic/forms`: un proyecto que todavía no tiene ningún formulario lo añade antes con `fudic_add { module: "forms" }`. Un componente que es un control de formulario marca su template con `formassociated`, conecta las labels con su elemento interno mediante `shadowrootreferencetarget="<id>"` (un id estático de ese template, `FUD0605`), declara una prop `ctrl: Control<…>` y la enlaza con `control=@ctrl`:

```fud path=src/components/app-input/app-input.fud
@code {
  /** A text field a form binds with control=. */
  import type { Control } from "@fudic/forms";

  const { ctrl, type } = props<{
    /** The form control the page binds. */
    ctrl: Control<unknown>;
    /** The input type: text, email, number… */
    type?: string;
  }>();
}

<app-input>
  <template shadowrootmode="open" formassociated shadowrootreferencetarget="field">
    <input id="field" type=@type control=@ctrl>
  </template>
</app-input>
```

La página escribe su propia label y su marcador de error como para un input nativo: `<label for="email">Email</label>`, `<app-input id="email" .type="email" control=@signup.email></app-input>`, `<small error=@signup.email></small>`. Una `<label>` dentro de un shadow root no puede apuntar fuera de él.

## En lugar de… (hábitos de React)

| En lugar de… | Escribe | Código |
|---|---|---|
| `className="card"` | `class="card"`; una que cambia, `class:active=@on` | `FUD1160` |
| `htmlFor="email"` | `for="email"` | `FUD1160` |
| `onClick={save}` | `@click=@save` | `FUD0909` + `FUD1161` |
| `value={name}`, `title={x}` | `.value=@name` (propiedad), `title=@x` (atributo) | `FUD1161` |
| `onclick="save()"` | `@click=@save` | `FUD0909` |
| `{open && <p>…</p>}` | `@if (open) { <p>…</p> }` | `FUD1162` |
| `{items.map(i => <li>…</li>)}` | `@foreach (const i of items) key (i.id) { <li>…</li> }` | `FUD1162` |
| `key={i.id}` en la fila | `key (i.id)` tras la cabecera del bucle | `FUD0540` si falta |
| `props.title` | `const { title } = props<…>()`, y luego `@title` | `FUD0907` |
| `children` | `<slot></slot>`, y `<slot name="x">` para más | `FUD0907` |
| `import Card from "./Card"` | `<link rel="component" href="…">`, y luego `<app-card>` | `FUD0191` |
| `<Card {...item} />` | `<app-card ...item></app-card>` | — |
| `useState(0)`, `setN(n + 1)` | `const n = signal(0)`, `n.set(n() + 1)` | — |
| `useMemo(() => …, [a])` | `computed(() => …)` | — |
| `useEffect(fn, [a])` | `effect(fn, [a])`: fuentes, no valores | — |
| `useRef(null)` | `let el: HTMLElement \| null = null` y `ref="@el"` | — |
| prop `onChange` | una prop callback `.onChange=@fn`, o `emit` + `bus:` | — |
| `fetch` en un effect | una función de servidor en el `.fudapi`, llamada a través de `task` | — |
| `@if (name)` por truthiness | `@if (name !== "")` | `FUD1151` |
| `.innerHTML=@html` | renderiza el contenido con el template | `FUD0916` |

```fud broken=FUD1162 path=src/components/app-tags/app-tags.fud
@code {
  const { tags = [] } = props<{ tags?: readonly string[] }>();
}

<app-tags>
  <template shadowrootmode="open">
    <ul>{tags.map(t => <li>{t}</li>)}</ul>
  </template>
</app-tags>
```
