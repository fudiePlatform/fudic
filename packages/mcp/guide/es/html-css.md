# html-css

El HTML que acepta fudic, el único `<style>` de un componente y cómo se le aplica el scope, los estilos compartidos por
todos los componentes, y los design tokens.

## Un subconjunto estricto de HTML

fudic parsea un subconjunto estricto de HTML. **No hace error recovery de HTML5**: no te cierra,
inserta ni descarta nada; cada error es un diagnóstico.

| Regla | Código si se incumple |
|---|---|
| Cierra cada elemento explícitamente: `<li>One</li>`, `<p>…</p>` | `FUD0052` |
| Ninguna etiqueta de cierre sin su etiqueta de apertura | `FUD0051` |
| Los elementos void no llevan etiqueta de cierre: `area`, `base`, `br`, `col`, `embed`, `hr`, `img`, `input`, `link`, `meta`, `source`, `track`, `wbr` | `FUD0053` |
| El autocierre se permite en cualquier elemento: `<div/>` es `<div></div>` | — |
| Pon comillas a todo valor de atributo: `class="card"` | `FUD0056` |
| Cierra todo valor entre comillas | `FUD0015` |
| Un atributo de cada nombre por elemento (distingue mayúsculas) | `FUD0190` |
| Referencias de carácter: solo `&lt;` `&gt;` `&amp;` `&quot;` `&apos;` y las numéricas (`&#160;`, `&#x2014;`). Cualquier otro carácter escríbelo tal cual: `é`, `…`, `—` | `FUD0057` |
| Un `<` literal en el texto es `&lt;`. Un `&` suelto (`Fish & Chips`) está bien | `FUD0013` |
| `@` siempre inicia una construcción de fudic. Una arroba literal es `@@` | `FUD0010` |
| `<![CDATA[ … ]]>` solo dentro de `<svg>` o `<math>` | `FUD0054` |

Dos valores pueden ir sin comillas, y solo estos dos:

- un valor que es **una** expresión `@`: `href=@url`, `@click=@save`, `class:on=@active`;
- el valor de una `.prop` que es un literal escalar: `.count=3`, `.open=true`, `.note=null`.

`id=main` es `FUD0056`. `.name=Hello` también es `FUD0056`: un nombre suelto no es un string.
`<!-- … -->` va a la salida tal como está escrito; un comentario de fudic `@* … *@` nunca se emite.
`<svg>` y `<math>` cambian a su propio modo: nombres que distinguen mayúsculas, etiquetas autocerradas al estilo XML.

### Elementos sin cerrar

```fud broken=FUD0052 path=src/components/app-steps/app-steps.fud
<app-steps>
  <template shadowrootmode="open">
    <ol>
      <li>Choose a table
      <li>Confirm the booking
    </ol>
  </template>
</app-steps>
```

### Valores sin comillas

```fud broken=FUD0056 path=src/components/app-note/app-note.fud
<app-note>
  <template shadowrootmode="open">
    <p class=note><slot></slot></p>
  </template>
</app-note>
```

### Referencias con nombre fuera del subconjunto

```fud broken=FUD0057 path=src/components/app-price/app-price.fud
<app-price>
  <template shadowrootmode="open">
    <p>Price&nbsp;list</p>
  </template>
</app-price>
```

Escribe `&#160;` para un espacio de no separación.

## Lo que el markup no puede contener

| Escrito | En su lugar | Código |
|---|---|---|
| `onclick="…"` o cualquier atributo `on*` | `@click=@save` | `FUD0909` |
| `className`, `htmlFor` | `class`, `for` | `FUD1160` |
| `value={x}` | `.value=@x`, `title="@x"`, `@click=@save` | `FUD1161` |
| `{items.map(…)}` o `{open && …}` en el markup | `@foreach (…) key (…) { … }`, `@if (…) { … }` | `FUD1162` |
| Un `<script>` con código en su cuerpo | `<script type="module" src="/app.js"></script>` | `FUD0161` |
| `href="javascript:…"`, `srcdoc`, un `style="…"` dinámico | una URL normal, un componente, `style:width=@w` | `FUD0915` |
| `.innerHTML=@html` | renderízalo con la plantilla; todo valor se escapa | `FUD0916` |
| `data-fud-id` y otros nombres `data-fud-*` | tu propio nombre `data-*` | `FUD0294` |

Un `<script>` cuyo cuerpo son datos se queda inline: `type="application/ld+json"` y `type="importmap"`.

## La forma de un componente

Un `.fud` de componente tiene un nivel superior fijo, en este orden (`FUD0155`):

1. `<link rel="component" href="…">` por cada componente que usa;
2. un `@code { … }`, si lo tiene;
3. un `<head>` que contiene **un** `<style>` (`FUD0159`);
4. el host: un elemento con el nombre del tag del componente (`FUD0156`), cuyo único hijo es
   `<template shadowrootmode="open">` (`FUD0157`; `closed` es `FUD0158`).

Un fichero que empieza con `<!DOCTYPE html>` es una página o un layout, no un componente: un
documento completo con `<html>`, `<head>` y `<body>` (`FUD0150`, `FUD0151`). Mira `pages`.

## El `<style>` del componente

El `<style>` del `<head>` de un componente es su propia hoja de estilos, adoptada en su shadow
root. Es **CSS normal**:

- el nesting, `@media`, `@container`, `@supports`, `@layer`, `@keyframes` y las demás at-rules
  de CSS funcionan como en cualquier hoja de estilos;
- ninguna construcción de fudic dentro: cualquier otro `@` es `FUD0132`;
- sin `@import` (`FUD0855`); las llaves deben estar equilibradas (`FUD0131`).

Lo que cambia con el estado va en el markup, nunca en el CSS: una clase que va y viene es
`class:highlight=@(variant === 'highlight')`, una propiedad es `style:width=@width`. `class:` va
en un elemento dentro de la plantilla, nunca en el tag host (`FUD0720`).

```fud broken=FUD0132 path=src/components/app-meter/app-meter.fud
<head>
  <style>
    .bar { width: @width; }
  </style>
</head>

<app-meter>
  <template shadowrootmode="open">
    <div class="bar"></div>
  </template>
</app-meter>
```

```fud broken=FUD0159 path=src/components/app-tag/app-tag.fud
<head>
  <style>
    .tag { font-size: 0.75rem; }
  </style>
  <style>
    .tag { color: #444; }
  </style>
</head>

<app-tag>
  <template shadowrootmode="open">
    <span class="tag"><slot></slot></span>
  </template>
</app-tag>
```

## Scope, `:host`, `::slotted()`, parts

El shadow DOM aplica scope a la hoja de estilos: un selector del `<style>` de un componente solo casa dentro
del shadow root de ese componente. El CSS de la página no entra, y el CSS de un componente no se
escapa hacia fuera. Las propiedades heredadas (`color`, `font`) y las custom properties sí cruzan la frontera.

- **`:host`** es el propio tag del componente. Un custom element es `display: inline` salvo que digas
  otra cosa: dale `display: block` o `inline-block`.
- **`::slotted(selector)`** da estilo a los elementos de primer nivel que el usuario metió en un slot. Viven
  en la página, no en el shadow root.
- **`part="name"`** en un elemento de la plantilla lo expone. Quien usa el componente le da estilo
  desde fuera con `app-card::part(title) { … }`. `fudic_describe` lista los parts de un componente.

```fud path=src/components/app-card/app-card.fud
@code {
  /** A card with a title. Whatever is written inside the tag fills it, under the title. */
  const { title } = props<{
    /** The heading of the card: one short line. */
    title: string;
  }>();
}

<head>
  <style>
    :host {
      display: block;
    }
    .card {
      border: 1px solid var(--app-color-line);
      border-left: 3px solid var(--app-color-accent);
      border-radius: var(--app-radius);
      padding: var(--app-pad);
      h2 {
        margin: 0 0 0.35rem;
        font-size: 1.05rem;
      }
    }
  </style>
</head>

<app-card>
  <template shadowrootmode="open">
    <article class="card">
      <h2 part="title">@title</h2>
      <slot></slot>
    </article>
  </template>
</app-card>
```

```fud path=src/components/app-label/app-label.fud
<head>
  <style>
    ::slotted(label) { font-weight: 500; }
  </style>
</head>

<app-label>
  <template shadowrootmode="open">
    <slot></slot>
  </template>
</app-label>
```

## Estilos compartidos por todos los componentes

Una hoja de estilos listada en `fudic.json` se adopta en los shadow roots de los componentes del
proyecto. Crea una con `fudic_generate { kind: "style", name: "theme" }`: escribe
`theme.css` en la raíz del proyecto y la lista bajo `globalStyles`.

```json path=fudic.json
{
  "id": "app",
  "kind": "app",
  "prefix": "app",
  "server": "src/server",
  "browser": "src/browser",
  "globalStyles": {
    "theme": "theme.css"
  }
}
```

- **`globalStyles`**: la adoptan **todos** los componentes del proyecto.
- **`styles`**: la adopta solo un componente que la nombra en su plantilla:
  `<template shadowrootmode="open" shadowrootadoptedstylesheets="panel">`, con
  `"styles": { "panel": "src/styles/panel.css" }` en `fudic.json`. Un nombre que no esté declarado
  ahí es `FUD0744`; los nombres son texto plano, nunca una expresión `@` (`FUD0745`).

El orden es la cascada: los estilos globales de las librerías que usa el proyecto (en orden de
dependencias), luego los `globalStyles` del proyecto, luego los `styles` que nombra el componente, y luego el
`<style>` propio del componente. La guía define, el componente ajusta.

Estas hojas viven dentro de shadow roots, así que:

- escribe `:host`, nunca `body`, `html` ni `:root` (`FUD0743`);
- sin `@import` (`FUD0854`): lista cada fichero en `fudic.json` en su lugar;
- si aún no hay ningún componente, `FUD0742` avisa de que nadie las adopta.

**Las hojas de una app solo llegan a los componentes que define esa app.** Un componente de librería se ve
igual en todas las apps; una app solo puede cambiar las custom properties que lee.

El light DOM de una página (el markup de rutas y layouts, fuera de todo componente) se estiliza
con una hoja de estilos que el layout enlaza en su `<head>`: `<link rel="stylesheet" href="../styles/main.css">`.

## Design tokens

Un token es una custom property declarada directamente en una regla `:host` o `:root` (también dentro de
`@layer`) de una hoja listada en `globalStyles` o `styles`, o importada por la guía de estilos, del
proyecto o de una librería que usa. Una custom property declarada en cualquier otra regla es local a
esa regla, no un token. Los tokens de la guía están en `:root`, en la página: las custom properties
atraviesan todos los shadow roots.

Documenta cada token como se documenta una prop: un `/** … */` justo encima de su declaración.
Nómbralo `--<prefix>-<group>-<name>`: el segundo segmento es su grupo (`color`, `space`).

```css path=theme.css
/* Adopted inside every component of app: write :host, not body. */
:host {
  /** Body text. Use it for anything read, never for a border. */
  --app-color-ink: #1c1c1e;
  /** Hairlines and borders that separate, without drawing attention. */
  --app-color-line: #dcdcdc;
  /** The one colour that marks what matters: a link, an active item, a card's edge. */
  --app-color-accent: #0b5fff;
  /** Corner radius of a surface. Smaller elements inside it use none. */
  --app-radius: 10px;
  /** Padding inside a surface, block then inline. */
  --app-pad: 1rem 1.15rem;
}
```

- **Antes de escribir cualquier estilo, llama a `fudic_symbols { kind: "tokens" }`** y usa solo esos
  nombres. Cada entrada tiene su `value`, `group`, `doc` y de dónde viene. `fudic_describe`
  recibe un nombre de token.
- Ningún color, radio o espaciado literal cuando un token lo expresa; pregunta al usuario antes de añadir uno.

## La guía de estilos

Todo proyecto nace con una: una app suelta la tiene en `src/guide/`, un workspace en `libs/guide`,
y toda app y librería que crea el workspace depende de ella. `fudic_generate { kind: "guide" }`
crea una donde no la hay. Se nombra en `fudic.json`:

```json path=libs/guide/fudic.json
{
  "kind": "lib",
  "globalStyles": { "base": "base.css" },
  "guide": { "sheet": "guide.css", "icon": "logo.svg" }
}
```

`guide.css` son solo `@import`: `tokens.css` (los tokens en `:root`, la fuente), `document.css`
(`html` y `body`), `base.css`, y después **un trozo por elemento**: `h1.css`, `button.css`,
`input.css`, `table.css`…

- **La página recibe la guía entera.** Toda página de un proyecto cuya cadena la contiene la
  enlaza, podada a lo que la página usa, antes que las hojas de su layout. Ningún `<link>` que
  escribir: depender de la librería basta. Su `icon` es el favicon de toda página cuyo `<head>` no
  tiene uno.
- **Un componente recibe solo los trozos que nombra**, por nombre de fichero, en su template raíz:

```html
<template shadowrootmode="open" shadowrootadoptedstylesheets="button input">
```

- **El atributo es la verdad**: el build adopta exactamente lo que dice. Cuando escribas un
  elemento que pinta un trozo, añade el trozo. `FUD1440` avisa de un trozo que falta para un
  elemento del template, y su arreglo lo añade — `fudic_fix` lo aplica. `FUD1441` avisa de un trozo
  adoptado que no pinta nada en el template. **Nunca quites un trozo por tu cuenta**: un script
  puede crear lo que pinta. Su arreglo lo acepta el usuario; `fudic_fix` no lo toca.
- Qué trozo pinta qué elemento se lee de sus selectores: una regla cuyo sujeto es el tipo del
  elemento (`:where(button)`). Un trozo que pinta por clase o atributo (`popover`) se adopta a mano.
- Cada color es `light-dark(claro, oscuro)` y la página sigue al sistema. Una zona fuerza un modo
  con `color-scheme: dark`, y los componentes de dentro la siguen.
- La guía se edita donde está: un token en `tokens.css`, un trozo en su fichero. Retocar una zona
  o un componente de la app es poner un token sobre él, en una hoja que enlaza el layout:
  `.promo { --guide-accent: #0f7b3f; }`.
