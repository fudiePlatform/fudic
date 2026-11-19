# Rutas y layouts

Una **ruta** es una página. Un **layout** es el documento completo en el que se pinta: el
`<html>`, el `<head>`, la cabecera, el pie. Toda ruta enlaza exactamente un layout.

Aquí está su sintaxis. Las URLs con parámetros, los datos de cada página y el prerender tienen su
propio capítulo (capítulo 4).

## La ruta

Una ruta es un `.fud` dentro de `src/routes/`, y su ruta en disco es su URL:

| Fichero | URL |
|---|---|
| `src/routes/index.fud` | `/` |
| `src/routes/about.fud` | `/about` |
| `src/routes/blog/index.fud` | `/blog` |
| `src/routes/blog/[slug].fud` | `/blog/cualquier-cosa` |

Se crea con la CLI, que la enlaza al layout más cercano:

```sh
npx fudic g page blog/:slug
```

Sus partes van en este orden:

```fud path=src/routes/blog/index.fud
<link rel="layout" href="../../layouts/_layout.fud">           ①
<link rel="component" href="../../components/miapp-card/miapp-card.fud">
<link rel="server" href="./index.fudapi">

@code {                                                         ②
  import { signal } from "@fudic/core";

  const shown = signal(5);
}

<head>                                                          ③
  <title>Blog</title>
  <meta name="description" content="Lo último que hemos escrito.">
</head>

<h1>Blog</h1>                                                   ④
@foreach (const post of data.posts.filter((p, i) => i < shown())) key (post.slug) {
  <miapp-card>
    <h2 slot="title"><a href=@post.url>@post.title</a></h2>
    <p>@post.summary</p>
  </miapp-card>
}
<button type="button" @click=@(() => shown.set(shown() + 5))>Ver más</button>

@section aside {                                                ⑤
  <p>Escribimos cada dos semanas.</p>
}
```

1. **Los enlaces.** Primero el layout; después los componentes que usa y, si carga datos, su
   contrato con el servidor (`<link rel="server">`, capítulo 5).
2. **`@code`**, opcional. Como en un componente.
3. **El `<head>` de la ruta**, opcional: su `<title>`, su descripción, lo que solo necesita esta
   página. Se suma al `<head>` del layout.
4. **El contenido**, en HTML estándar. `data` son los datos que el servidor carga para la página.
5. **Las secciones** que rellena en el layout (abajo).

Una ruta nunca escribe `<!DOCTYPE>`, `<html>` ni `<body>`: eso es del layout.

## El layout

Un layout es un documento completo con **huecos**, en `src/layouts/`:

```sh
npx fudic g layout _layout --sections aside
```

```fud path=src/layouts/_layout.fud
<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    @* Keep this line: fudic puts its scripts here. *@
    <script type="module" src="fudic:runtime"></script>
    @RenderHead()
  </head>
  <body>
    <header><a href="/">Mi app</a></header>
    <main>@RenderBody()</main>
    <aside>@RenderSection(aside)</aside>
  </body>
</html>
```

Los huecos tienen los nombres de Razor:

| Hueco | Qué entra | Cuántos |
|---|---|---|
| `@RenderHead()` | el `<head>` de la ruta | uno como mucho, dentro de `<head>` |
| `@RenderBody()` | el contenido de la ruta | exactamente uno |
| `@RenderSection(nombre)` | lo que la ruta escribe en `@section nombre { … }` | los que quieras |

Una sección que la ruta no rellena se queda vacía. Si el layout no puede pintarse sin ella, la
marca como obligatoria, y una ruta que no la rellene es un error:

```fud
@RenderSection(hero, required: true)
```

El cuerpo de un layout es markup como cualquier otro: admite componentes, `@if`, bucles y
snippets. Lo que no puede es meter un hueco dentro de un `@if` o de un bucle, porque la ruta
saldría cero veces o varias.

> [!NOTE]
> Un layout no enlaza otro layout. La composición tiene un solo nivel, ruta y layout, y lo que se
> repite entre layouts se saca a un componente (abajo).

## Un layout que envuelve la ruta en un componente

Lo más habitual es que la maquetación de un layout (la rejilla, el lateral, el pie) sea un
componente, con sus estilos encapsulados. El layout lo escribe como su `<body>` y le dice a cada
hueco en qué slot del componente cae:

```fud path=src/components/miapp-frame/miapp-frame.fud
<head>
  <style>
    .frame { display: grid; grid-template-columns: 14rem 1fr; gap: 2rem; }
  </style>
</head>

<miapp-frame>
  <template shadowrootmode="open">
    <div class="frame">
      <header><slot name="header"></slot></header>
      <nav><slot name="nav"><p>Sin menú.</p></slot></nav>
      <main><slot name="content"></slot></main>
    </div>
  </template>
</miapp-frame>
```

```fud path=src/layouts/_layout-docs.fud
<!DOCTYPE html>
<html lang="es">
  <head>
    <link rel="component" href="../components/miapp-frame/miapp-frame.fud">
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <script type="module" src="fudic:runtime"></script>
    @RenderHead()
  </head>
  <body>
    <miapp-frame>
      @RenderSection(header, required: true, slot: "header")
      @RenderSection(nav, slot: "nav")
      @RenderBody(slot: "content")
    </miapp-frame>
  </body>
</html>
```

```fud path=src/routes/docs/index.fud
<link rel="layout" href="../../layouts/_layout-docs.fud">

@section header {
  <h1>Documentación</h1>
  <p>Todo lo que hace Fudic, explicado.</p>
}

<p>Empieza por el capítulo 1.</p>
```

`slot: "header"` hace que cada elemento que la ruta escribe en esa sección salga con
`slot="header"`. La ruta escribe hermanos sueltos, sin un `<div slot>` que los envuelva y sin saber
qué slots tiene el componente. El `<h1>` sigue en el documento, como debe, y el componente lo
coloca en su sitio.

## Las props de un layout

Un layout puede recibir valores de cada ruta, como un componente. Las declara en un `@code` dentro
de su `<head>`, y ese `@code` solo admite eso:

```fud
<head>
  @code {
    const { area = "Docs" } = props<{ area?: string }>();
  }
  <meta property="article:section" content=@area>
  …
</head>
```

La ruta le da sus valores desde el servidor, junto con sus datos (capítulo 4).

## El estándar, en MDN

- [`<head>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/head): lo que va
  en la cabecera de un documento.
- [`<slot>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/slot): el
  mecanismo que coloca cada sección en el componente del layout.
