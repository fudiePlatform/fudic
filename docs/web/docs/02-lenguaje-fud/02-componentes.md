# Componentes

Un componente es un
[custom element](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements):
una etiqueta propia, como `<miapp-card>`, con su markup, sus estilos y su comportamiento. Se crea
con la CLI:

```sh
npx fudic g component card
```

## La forma del fichero

Un componente tiene hasta cinco partes, siempre en este orden:

```fud path=src/components/miapp-card/miapp-card.fud
<link rel="component" href="../miapp-badge/miapp-badge.fud">   ①

@code {                                                        ②
  const { tone = "neutral" } = props<{ tone?: "neutral" | "new" }>();
}

<head>                                                         ③
  <style>
    .card { border: 1px solid var(--line); padding: 1rem; }
  </style>
</head>

<miapp-card>                                                   ④
  <template shadowrootmode="open">
    <article class="card">
      <slot name="title"></slot>
      @render tag(@tone)
      <slot></slot>
    </article>
  </template>
</miapp-card>

@snippet tag(tone: string) {                                   ⑤
  <miapp-badge .tone=@tone>@tone</miapp-badge>
}
```

1. **Los `<link rel="component">`** de los componentes que usa.
2. **Un bloque `@code`**, TypeScript estándar. Opcional, y solo uno.
3. **El `<head>` con un `<style>`**: los estilos del componente. Opcional.
4. **El propio tag del componente** envolviendo un `<template shadowrootmode="open">`. Todo lo que
   pinta va dentro del template.
5. **Los snippets** que solo usa este componente, si los hay ([Snippets](04-snippets.md)).

Un componente puede ser solo la parte 4: HTML y CSS, sin una línea de JavaScript.

> [!NOTE]
> El `<style>` del `<head>` es CSS estándar, sin construcciones `@`. Lo que cambia con el estado
> se expresa en la plantilla: el `<style>` define las variantes y `class:` elige cuál se aplica
> ([Atributos y propiedades](06-atributos-y-propiedades.md#clases)).

## Props

Las props son lo que el componente recibe de quien lo usa. Se declaran con **una sola llamada** a
`props<T>()`, desestructurada:

```fud path=src/components/miapp-alert/miapp-alert.fud
@code {
  /** A message that stands out from the text around it. */
  const { text, tone = "info" } = props<{
    /** What the alert says. */
    text: string;
    /** Its colour: "info" blue, "danger" red. */
    tone?: "info" | "danger";
  }>();
}

<miapp-alert>
  <template shadowrootmode="open">
    <p class=@tone>@text</p>
  </template>
</miapp-alert>
```

- **Obligatoria**: una clave sin `?`, como `text`. Usar el componente sin pasarla es un error de
  tipos.
- **Opcional**: una clave con `?`. Su valor por defecto va en la desestructuración
  (`tone = "info"`).
- **Documentada**: el primer `/** … */` del `@code` describe el componente, y el de cada clave
  describe la prop. El editor los enseña al escribir el tag.
- **Leída por su nombre**: en la plantilla se escribe `@text`, nunca `props.text`.

Quien usa el componente pasa cada prop con un punto delante:

```fud
<miapp-alert .text="Guardado" .tone="info"></miapp-alert>
<miapp-alert .text=@message .tone="danger"></miapp-alert>
```

El punto es lo que distingue una prop de un atributo HTML estándar. Sin punto, `id`, `class`,
`role` o `aria-label` son atributos del tag, como en cualquier elemento; y un nombre sin punto que
no es de HTML, como `tone="info"`, es un error. Todas las formas de escribir el valor están en
[Atributos y propiedades](06-atributos-y-propiedades.md).

### Una prop que sigue al padre

Si el padre pasa un valor reactivo, el hijo se repinta cuando cambia:

```fud
<miapp-alert .text=@status()></miapp-alert>
```

Cada vez que el signal `status` del padre cambia, el hijo recibe el texto nuevo.

### Una prop que es un signal

A veces el hijo no solo necesita leer el valor: también tiene que cambiarlo. Entonces declara la
prop como `Signal<T>`, y recibe **el propio signal** del padre:

```fud path=src/components/miapp-stepper/miapp-stepper.fud
@code {
  import type { Signal } from "@fudic/core";

  const { value } = props<{
    /** The number the stepper moves. It belongs to whoever uses the stepper. */
    value: Signal<number>;
  }>();

  function down() {
    value.set(value() - 1);
  }

  function up() {
    value.set(value() + 1);
  }
}

<miapp-stepper>
  <template shadowrootmode="open">
    <button type="button" @click=@down>−</button>
    <output>@value()</output>
    <button type="button" @click=@up>+</button>
  </template>
</miapp-stepper>
```

El padre pasa el nombre del signal, sin llamarlo:

```fud
<miapp-stepper .value=@quantity></miapp-stepper>
<p>Total: @(quantity() * price) €</p>
```

Padre e hijo leen el mismo objeto: cuando el stepper lo cambia, el total del padre se repinta.

### Una prop que es una función

Para que el hijo avise a su padre, el padre le pasa una función:

```fud path=src/components/miapp-choice/miapp-choice.fud
@code {
  /** A row of buttons, one per option. */
  const { options = [], onPick } = props<{
    /** The texts of the buttons. */
    options?: readonly string[];
    /** Called with the option the user picked. */
    onPick: (option: string) => void;
  }>();

  function pick(option: string) {
    onPick(option);
  }
}

<miapp-choice>
  <template shadowrootmode="open">
    <div @click=@pick(option)>
      @foreach (const option of options) key (option) {
        <button type="button" delegate:option="click">@option</button>
      }
    </div>
  </template>
</miapp-choice>
```

```fud
<miapp-choice .options=@answers .onPick=@chosen></miapp-choice>
```

El padre escribe el nombre de una función de su `@code`, sin llamarla, y el hijo la llama desde
un handler. Es el camino de vuelta hacia **un** padre concreto. Para avisar a cualquiera que escuche en la
página, está el bus de eventos ([Eventos](07-eventos.md)).

## Slots: contenido de quien usa el componente

Un componente recibe markup de la página con
[`<slot>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/slot), el
mecanismo estándar del shadow DOM. Fudic no añade nada: es la plataforma la que coloca cada
elemento en su hueco.

```fud path=src/components/miapp-card/miapp-card.fud
<head>
  <style>
    ::slotted([slot="title"]) { margin: 0; font-size: 1.1rem; }
  </style>
</head>

<miapp-card>
  <template shadowrootmode="open">
    <article class="card">
      <header><slot name="title"></slot></header>
      <slot></slot>
      <footer>
        <slot name="actions"><a href="/">Volver</a></slot>
      </footer>
    </article>
  </template>
</miapp-card>
```

```fud
<miapp-card>
  <h2 slot="title">Plan básico</h2>
  <p>Todo lo que necesitas para empezar.</p>
  <button slot="actions">Elegir</button>
</miapp-card>
```

- **El slot sin nombre** recibe todo lo que no lleva `slot="…"`: aquí, el párrafo.
- **Un slot con nombre** recibe los elementos con ese `slot`: el `<h2>` va a `title` y el botón a
  `actions`.
- **Lo que hay dentro de un `<slot>`** es su contenido por defecto: se ve si nadie lo rellena.
- **[`::slotted()`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/::slotted)** da estilo, desde
  el componente, a lo que la página colocó en sus slots.

> [!IMPORTANT]
> **Los encabezados (`h1` a `h6`) nunca van dentro del shadow DOM de un componente.** Fíjate en que
> el `<h2>` lo escribe la página, no la tarjeta: el componente le deja un slot. Así el encabezado
> sigue en el documento, donde lo encuentran el esquema de la página, los buscadores y la
> navegación por encabezados de los lectores de pantalla.

## El propio tag: `:host`

Dentro del `<style>`, el selector
[`:host`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/:host) es el tag del componente. Para
dar estilo al host según una prop, escribe un atributo con una expresión en el propio tag:

```fud path=src/components/miapp-tile/miapp-tile.fud
@code {
  const { variant = "default" } = props<{ variant?: "default" | "highlight" }>();
}

<head>
  <style>
    :host { display: block; border: 1px solid var(--line); }
    :host([variant="highlight"]) { border-color: var(--accent); }
  </style>
</head>

<miapp-tile variant=@variant>
  <template shadowrootmode="open">
    <slot></slot>
  </template>
</miapp-tile>
```

El servidor escribe el atributo, y se reescribe cuando la prop cambia. Un texto o un número se
escribe tal cual; `true` escribe el atributo vacío; `false`, `null` y `undefined` lo quitan.

## Usar otro componente

Un componente se importa con `<link rel="component">` y se usa escribiendo su tag:

```fud
<link rel="component" href="../miapp-card/miapp-card.fud">
<link rel="component" href="@shop/ui/ui-button.fud">
```

El segundo viene de una librería del workspace y se enlaza por el nombre del paquete. Un tag sin
su enlace es un error, y un enlace que nada usa, un aviso.

## El estándar, en MDN

- [Using custom elements](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements):
  qué es un custom element y por qué su nombre lleva guion.
- [Using templates and slots](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_templates_and_slots):
  cómo recibe un componente el contenido de la página.
- [`<slot>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/slot): slots con
  nombre y contenido por defecto.
- [`:host`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/:host) y
  [`::slotted()`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/::slotted): dar estilo al
  propio componente y a lo que recibe.
