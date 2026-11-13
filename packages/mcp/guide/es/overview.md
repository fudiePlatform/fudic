# overview

Qué es fudic, los ficheros que contiene un proyecto, cómo se organizan una app, una librería y un
workspace, y qué temas de la guía existen.

## Qué es fudic

- **Un framework de UI sobre Declarative Shadow DOM.** Un componente es un custom element cuyo
  markup es su propio tag envolviendo un `<template shadowrootmode="open">`. El navegador adjunta
  el shadow root mientras parsea el HTML, antes de que se ejecute ningún script.
- **HTML primero.** Toda página se renderiza a HTML: prerenderizada en tiempo de build,
  renderizada por el servidor bajo petición, o por el Service Worker durante la navegación. Una
  página que no tiene nada interactivo no envía JavaScript propio; el runtime de hidratación solo
  se añade a una página que tiene algo que hidratar.
- **JavaScript solo donde hace falta.** Un componente se hidrata cuando tiene estado, eventos o
  props reactivas. Todo lo demás se queda en HTML y CSS planos.
- **fudic es un BFF, nunca el backend.** Un `.fudapi` declara lo que una vista necesita del
  servidor. Cada función tiene un handler en `src/server` que **traduce** entre ese contrato y
  el backend real: lo llama, convierte su respuesta al tipo del `.fudapi`, transforma sus errores
  en los fallos declarados. En un handler no va lógica de negocio ni persistencia; pertenecen al
  backend.
- **No es React, no es Vue.** No hay JSX, ni DOM virtual, ni `useState`. El markup es HTML
  estricto con construcciones `@`, y la vista es una lista cerrada de expresiones que el
  compilador comprueba. Nunca escribas fudic por analogía con otro framework: lee antes el tema.

## Los ficheros

| Fichero | Para qué sirve |
|---|---|
| `.fud` | Un componente, una página, una ruta, un layout o un fichero de snippets. HTML con construcciones `@`, un `<style>` con scope, un bloque `@code { … }` opcional. Ver `components` y `pages`. |
| `.fudapi` | El contrato de servidor de una ruta o componente: su `load`, sus funciones, sus tipos, sus formularios y reglas, con qué puede fallar cada uno. Sus handlers son TypeScript en `src/server`. Ver `fudapi`. |
| `.fudspec` | Criterios de aceptación de un componente, en pasos sencillos (`given`, `when`, `then`), ejecutados en un navegador real. El usuario los aprueba. Ver `fudspec`. |
| `.fixture.ts` | Conjuntos de props con nombre con los que los criterios montan el componente (`props base`). Tipados contra el `$Props` del componente. |
| `.test.ts` | Tests unitarios (Vitest, DOM en proceso): cada variante de prop, valores límite, detalles de eventos, funciones de servidor y sus fallos. Ver `testing`. |
| `.fudlog` | El historial de una pieza, junto a su `.fud`: aprobaciones, ejecuciones de tests y de criterios con su resultado, `done`. Solo crece. Lo escriben las herramientas, nunca a mano. |
| `fudic.json` | Lo que un proyecto declara sobre sí mismo: `kind` (`app` o `lib`), `id`, `prefix` de tag, `globalStyles`, `styles`, `locales`, y las carpetas `server` y `browser`. |
| `sw.json` | Lo que cachea el Service Worker. Bórralo para no tener Service Worker. |

Ficheros generados, nunca editados: `fudic-globals.d.ts`, `src/fudic-env.d.ts`, y todo lo que hay
bajo `.fudic/` (ignorado por git; los tipos generados a partir de cada `.fudapi` viven en `.fudic/api`).

El `fudic.json` de una app nueva llamada `app`:

```json path=fudic.json
{
  "id": "app",
  "kind": "app",
  "prefix": "app",
  "server": "src/server",
  "browser": "src/browser"
}
```

- `id` da nombre a las cachés del Service Worker. **No lo cambies nunca** una vez que la app se ha visitado.
- `prefix` convierte el nombre de un componente en su tag: `card` pasa a ser `<app-card>`.

## Una app independiente

Lo que crea `fudic_new { name: "app" }` (`fudic new app` en la línea de comandos):

```text
app/
├── fudic.json            id, kind, prefix, server and browser folders
├── package.json          scripts: dev, build, preview, test, spec
├── sw.json               Service Worker cache policy
├── vite.config.ts        the fudic() plugin; nothing else to configure
├── vitest.config.ts      unit tests
├── tsconfig.json
├── fudic-globals.d.ts    generated
├── .gitattributes        *.fudlog merge=union
├── .gitignore
├── README.md
└── src/
    ├── fudic-env.d.ts    generated
    ├── layouts/
    │   ├── _layout.fud       the frame every page renders into
    │   └── _layout.test.ts
    ├── routes/
    │   ├── index.fud         the page at /
    │   └── index.test.ts
    ├── server/           handlers of the .fudapi functions (empty)
    └── browser/          code that runs in the browser (empty)
```

Las piezas que añades con `fudic_generate` van aquí:

| Tipo | Dónde |
|---|---|
| `component` | `src/components/<tag>/`: `<tag>.fud`, `<tag>.test.ts`, `<tag>.fudspec`, `<tag>.fixture.ts` |
| `page` | `src/routes/<path>.fud` y su `.test.ts`. La ruta es la URL: `blog/:slug` |
| `layout` | `src/layouts/<name>.fud` y su `.test.ts` |
| `snippet` | `src/snippets/<file>.fud` y su test |
| `api` | `<piece>.fudapi` junto al `.fud`, su handler en `src/server`, y el `<link rel="server">` en el `.fud` |
| `style` | `<name>.css` en la raíz del proyecto, listado bajo `globalStyles` en `fudic.json` |
| `pipe` | `src/pipes/` |

La página de inicio con la que arranca una app nueva:

```fud path=src/routes/index.fud
<link rel="layout" href="../layouts/_layout.fud">

<head>
  <title>Home</title>
</head>

<h1>Home</h1>
```

## Dónde van los handlers de servidor

Un `.fudapi` tiene un `<id>`: su ruta dentro de `src/`, sin la extensión. Su handler es el fichero
TypeScript con el mismo id bajo la carpeta `server` de `fudic.json` (`src/server` por
defecto):

| `.fud` | `.fudapi` | Handler |
|---|---|---|
| `src/routes/about.fud` | `src/routes/about.fudapi` | `src/server/routes/about.ts` |
| `src/components/app-cart/app-cart.fud` | `src/components/app-cart/app-cart.fudapi` | `src/server/components/app-cart/app-cart.ts` |

Nunca crees estos tres ficheros a mano: `fudic_generate { kind: "api", … }` escribe el `.fudapi`,
el handler y el link a la vez. `fudic_contract { id }` te dice cada handler que queda por escribir,
con su firma TypeScript. El servidor de una librería todavía no se genera (`FUD1241`).

## Un componente

Una carpeta por componente, cuatro ficheros. Este es uno terminado, documentado:

```fud path=src/components/app-card/app-card.fud
@code {
  /**
   * A card with a title. Whatever is written inside the tag fills its default slot, under the
   * title.
   */
  const { title } = props<{
    /** The heading of the card: one short line. */
    title: string;
  }>();
}

<head>
  <style>
    .card {
      border: 1px solid #dcdcdc;
      border-radius: 10px;
      padding: 1rem 1.15rem;
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
      <h2>@title</h2>
      <slot></slot>
    </article>
  </template>
</app-card>
```

```ts path=src/components/app-card/app-card.fixture.ts
import type { Fixtures } from '@fudic/terms';
import type { $Props } from './app-card.fud';

export default {
  base: { title: 'A card' },
} satisfies Fixtures<$Props>;
```

```fudspec path=src/components/app-card/app-card.fudspec
component app-card

criterion renders
  given
    props base
  then
    present app-card
```

## Un workspace

Varias apps y las librerías que comparten, en un único repo pnpm. `fudic_new { name: "shop",
workspace: true, app: "web", lib: "ui" }` (`fudic new shop --workspace --app web --lib ui`):

```text
shop/
├── package.json          dev, preview, build, test, spec for every project
├── pnpm-workspace.yaml   apps/* and libs/*
├── tsconfig.base.json
├── fudic-globals.d.ts
├── .gitattributes
├── apps/
│   └── web/              an app, as above; package @shop/web, served at /
└── libs/
    └── ui/               a library; package @shop/ui, tag prefix ui-
```

- La primera app se sirve en `/`, todas las demás en `/<name>/`.
- Una librería vive en un workspace. Una app independiente no tiene ninguna a su lado.
- `fudic_add { module: "ui", project: "web" }` hace que una app use una librería del workspace.

## Una librería

Componentes que usan otros proyectos. No se sirve: sin rutas, sin layout, sin `vite.config.ts`,
sin `sw.json`, sin `id`.

```text
libs/ui/
├── fudic.json            { "kind": "lib", "prefix": "ui" }
├── package.json          exports the .fud sources, not a build
├── tsconfig.json
├── vitest.config.ts
├── README.md
└── src/
    ├── fudic-env.d.ts
    └── components/       one folder per component, as in an app
```

Una app enlaza un componente de una librería por nombre de paquete:
`<link rel="component" href="@shop/ui/ui-card.fud">`. Antes de usar uno, llama a `fudic_describe`
con su tag; nunca abras su fichero.

Una **librería de estilos** (`fudic_generate { kind: "lib", name: "tokens", stylesOnly: true }`)
contiene un único `tokens.css` y nada más: design tokens que adopta cada componente de quienes la
usan. Ver `html-css`.

## Diagnósticos

`fudic.json` decide cómo informa el proyecto de cada código; `fudic_check` ya responde con eso
aplicado, y una severidad cambiada lo dice: «(warning by default; error in this project)».

```jsonc
"diagnostics": { "FUD1380": "off", "FUD1022": "error", "warnings": "error" }
```

- El nivel de un código es `off`, `hint`, `info`, `warning` o `error`. Un código manda sobre `warnings`.
- Un error nunca se baja ni se silencia: eso es `FUD1521`, y el error sigue.
- Para silenciar un sitio, escribe un comentario con su código Y su motivo, en el comentario que ya
  tiene el lenguaje: `@* fud-disable-next-line FUD1380: why *@` en el marcado, `/* … */` en un
  `<style>`, `// …` en `@code`, `# …` en un `.fudapi` o un `.fudspec`. `fud-disable FUDnnnn: why`
  vale para todo el fichero. Sin código o sin motivo es `FUD1522`; un comentario que no silencia
  nada es `FUD1523`: quítalo.
- Silencia solo lo que has comprobado que está bien, y di por qué. Primero arregla el código.

## Baseline

fudic avisa (`FUD1524`) cuando el HTML, el CSS o el TS del proyecto usa algo del navegador más nuevo
que su Baseline: `"widely"` si `fudic.json` no dice nada.

```jsonc
"baseline": "widely"                                // o "newly", o un año: 2024
"baseline": { "target": "widely", "allow": ["popover"] }
```

Qué hacer con un `FUD1524`, en este orden:

1. CSS: ponlo bajo `@supports` en una regla aparte, detrás de una alternativa que funcione sin él:
   `textarea { resize: none; } @supports (field-sizing: content) { textarea { field-sizing: content; } }`.
   Un selector: `@supports selector(:state(open)) { … }`.
2. TS: compruébalo antes de usarlo: `if ('showPopover' in el) el.showPopover();`, `el.showPopover?.()`,
   `typeof URLPattern === 'function'`.
3. Si el proyecto lo usa a sabiendas, añade su id de web-features (el del enlace a webstatus.dev
   del mensaje) a `allow`. Nunca bajes el nivel para callarlo.

Lo que emite fudic nunca avisa. `FUD1525` dice que el nivel es más viejo de lo que fudic necesita:
súbelo. `FUD1526` es una librería que usa features que la app no acepta; `FUD1527`, un id de
`allow` que no es una feature o que se ha movido; `FUD1528`, un id que nada usa.

## Los temas de la guía

Llama a `fudic_guide { topic }` antes de escribir un tipo de fichero por primera vez.

| Tema | Léelo antes de |
|---|---|
| `overview` | cualquier cosa: esta página |
| `workflow` | empezar cualquier pieza: las fases, quién aprueba qué, el bucle de comprobar y corregir |
| `components` | escribir el `.fud` de un componente: su forma, props, slots, eventos, formularios |
| `pages` | escribir una ruta, una página o un layout: params, `load`, layouts, secciones, sesiones |
| `view` | escribir cualquier expresión `@`, condición o bucle: lo que la vista puede escribir |
| `fudapi` | escribir un `.fudapi` o sus handlers |
| `fudspec` | escribir criterios y fixtures |
| `testing` | escribir un `.test.ts` |
| `html-css` | escribir markup o estilos: el subset de HTML, el scoping, los tokens |
| `FUD0540` (cualquier código) | corregir ese diagnóstico: qué está mal y cómo arreglarlo |
