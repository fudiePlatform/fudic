---
name: capitulo-web
description: Escribe o reescribe un capítulo de la documentación de la web pública de Fudic (web/apps/site/src/routes/docs) con su guía de estilo. Úsalo cuando Pedro pida hacer, revisar o rehacer un tema o capítulo de la web.
---

# Escribir un capítulo de la web pública

Argumento: el tema o capítulo (`Internacionalización`, `/docs/security`, `capítulo 9`…). Si no
viene, pregunta cuál. El índice de capítulos y su estado está en `docs/web/README.md` §5.2.

## Cómo se habla con Pedro

En español, corto y en lenguaje llano. Primera línea, el estado («hecho, build verde» o «está
roto»). Sin muros de tablas ni negritas por todas partes. Si hay dos caminos, propón uno.

## 1. Antes de escribir

1. **Lee el código, no la memoria.** El paquete que cubre el tema (`packages/<x>/src`), el
   compilador si hay sintaxis, la gramática del `.fudapi` (`packages/api`) si hay contrato, y los
   diagnósticos (`packages/diagnostics/src/codes`). Si el código y una página antigua no
   coinciden, **manda el código**.
2. **Lee dos capítulos ya reescritos** para coger el tono: `web/apps/site/src/routes/docs/styles.fud`
   y `web/apps/site/src/routes/docs/server.fud`.
3. **Propón el capítulo en notas breves en el chat**: las páginas, la idea de cada una en una
   frase y qué ejemplo lleva. **Espera a que Pedro responda** antes de escribir HTML. Nunca
   Markdown: se escribe directo el `.fud`.
4. **Nadie lee algo que use lo que aún no ha visto.** Si una página necesita un concepto de un
   capítulo posterior, o se cambia el orden o se enlaza; dilo en las notas.

## 2. Cómo se escribe: que se lea rápido y se entienda rápido

Es lo que Pedro aprobó al reescribir Estilos, Reactividad, `.fud`, Servidor, Rutas y Formularios.

- **Cada página abre con su idea, en una o dos frases.** Quien lee solo eso ya sabe de qué va.
- **Un ejemplo corto por concepto.** Solo las líneas que importan; `…` para el resto.
- **Poca negrita, pocos paréntesis, frases cortas.** La negrita solo para la primera palabra de
  un punto de lista, y no en todas las listas.
- **Sin justificaciones defensivas**: nada de «tiene una razón», «no es una limitación», «no es
  magia». Se dice qué hace y, si importa, por qué, en una frase.
- **Los casos límite y los códigos `FUDnnnn`** van a un `<h2 id="details">Detalles</h2>` al final,
  o fuera. Un código solo si el lector lo va a ver en su editor.
- **La referencia completa NO va en la página de guía.** La API entera (cada miembro, atributo,
  regla, status) vive en páginas de referencia aparte, que Pedro enlaza. Una tabla larga al
  final hace que el lector salga corriendo y no se mantiene.
- **Sin cifras internas ni `examples/basic`** en el texto: nadie lo conoce.
- **Sin marcadores ①②** en los ejemplos: se nombra cada parte por lo que se ve en el código.
- **Sin «capítulo N»**: se enlaza la página por su nombre (`<a href="/docs/forms">El formulario</a>`).
- **Sin introducciones ni cierres** («En este capítulo…», «Siguiente paso»). Es documentación,
  no un tutorial.

### El mensaje de fondo

- **El estándar primero.** HTML, CSS y TypeScript son «estándar», siempre con esa palabra. Lo
  que hace la plataforma se le atribuye a la plataforma y se enlaza a MDN; a Fudic, solo lo que
  añade. Lo que aún no es estándar se dice, con su propuesta (issue o explainer) y su polyfill.
- **Políglota, sin atarse a Node.** Hoy el servidor es Node, pero la vista y el `.fudapi` están
  diseñados para traducirse a C#, Java, Go, Rust y Python: cuando lleguen, se desplegará sin
  Node, en el backend que la empresa ya tiene. Muchas empresas no quieren Node en producción;
  donde el tema lo toque (servidor, vista, despliegue), se dice. En el navegador, siempre
  TypeScript. Nunca se vende como hecho: hoy está implementado TypeScript, el resto diseñado.
- **Fudic** con mayúscula en la prosa; en minúscula solo el código (`fudic dev`, `@fudic/core`).
- Al citar frameworks, **Angular va con React y Vue**.
- **Los conceptos clave se explican**, no se dan por sabidos.
- Comandos con la CLI de Fudic: `fudic dev`, `fudic test`, `fudic spec`, nunca `pnpm dev`.
- **Encabezados `h1`–`h6` nunca dentro de un componente**, ni en los ejemplos: van en la página
  y el componente los recibe por `<slot>`.

## 3. La forma de una página

La página se crea con la CLI (`fudic g page docs/<tema>/<pagina>` desde `web/apps/site`): la web
es también prueba de la CLI, y lo que no se pueda crear con ella se anota en
`docs/web/hallazgos-cli.md`. Después se rellena con este esqueleto:

```
<link rel="layout" href="@web/ui/layouts/docs.fud">
<link rel="snippet" href="@web/ui/snippets/site.fud">
<link rel="component" href="@web/ui/ui-code.fud">
<link rel="component" href="@web/ui/ui-note.fud">   (solo si usa <ui-note>)
<link rel="component" href="@web/ui/ui-toc.fud">

<head>
  <title>Nombre de la página · Fudic</title>
  <meta name="description" content="…">
  <link rel="canonical" href="https://fudic.dev/docs/…">
  <meta property="og:type" content="article">
  <meta property="og:title" content="…">
  <meta property="og:description" content="…">
  <meta property="og:url" content="https://fudic.dev/docs/…">
  <meta property="og:site_name" content="Fudic">
</head>

@section nav { @render docsNav("<id-de-la-pagina>") }
@section toc { <ui-toc><details><summary>En esta página</summary><ul>…</ul></details></ui-toc> }

<h1>…</h1>          ← el mismo texto que su enlace en el menú
<h2 id="…">…</h2>   ← ids en inglés, en kebab-case
…
<h2 id="mdn">El estándar, en MDN</h2>   ← tres o cuatro enlaces, cada uno con una frase
```

- **Ejemplos**: `<ui-code .path="src/…">` con `<pre><code>…</code></pre>`. `<ui-note>` para una nota;
  `.kind="tip"` o `.kind="important"` si hace falta. `<ol class="flow">` para pasos numerados.
- **Escapes en un `.fud`**: `@` del texto o de un ejemplo se escribe `@@`. Dentro de un atributo
  del `<head>` (`content="…"`), `&#64;`: una `@` suelta ahí rompe el build (`FUD0010`). Las
  llaves de un ejemplo dentro de `<pre>`, `&#123;` y `&#125;`; `<` y `>`, `&lt;` y `&gt;`.
- **Enlaces externos**: siempre `target="_blank" rel="noopener"`. MDN en inglés (`en-US`).
- **Textos de enlace descriptivos**: nunca «aquí», «más», «empezar»… (Lighthouse `link-text`).
- **URLs en inglés** aunque el texto esté en español.
- **El código de los ejemplos, en inglés** (identificadores y comentarios); la prosa, en español.
- **Un `<link rel="component">` que la página no usa** da un aviso (`FUD0721`): quítalo.

Una página nueva se añade al menú en `web/libs/ui/src/snippets/site.fud`, en su capítulo.

## 4. Antes de entregar

1. `pnpm build` en `web/apps/site`. Tiene que acabar en `✓ built`, sin errores ni avisos
   nuevos (`FUD1552` de `assets.headers` es antiguo).
2. Enlaces internos con ancla:
   `node .claude/skills/capitulo-web/scripts/anchors.cjs web` desde la raíz del repo. Tiene que
   decir `broken: 0`. Si renombras o quitas un `id`, busca antes quién lo enlaza.
3. Cada URL externa nueva, con `curl` (200).
4. Cada fragmento de `.fudapi` que no salga del código, con el validador real.
5. Una línea en el registro de `docs/web/README.md` §8, y el estado del capítulo en §5.2.
6. Commit y push en la rama `web-publica`, con el mensaje en inglés, solo asunto y cuerpo, sin
   trailers de atribución. Ejemplo: `docs(web): chapter 9, internationalization, for review`.

Al entregar, di a Pedro en pocas líneas qué páginas hay, qué idea abre cada una y qué has dejado
fuera.
