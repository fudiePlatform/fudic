# Empezar

## Qué es Fudic

Fudic es un framework para construir webs con
**[componentes web](https://developer.mozilla.org/en-US/docs/Web/API/Web_components)
estándar**, pintados desde el servidor. Cada componente se escribe en un fichero `.fud` con HTML,
CSS y, si hace falta, TypeScript, los tres estándar. El compilador lo convierte en lo que el
navegador ya sabe leer.

Los componentes web son la forma que tiene el propio navegador de crear etiquetas nuevas, como
`<mi-contador>`, con su markup, sus estilos y su comportamiento. No pertenecen a ningún framework:
forman parte de la plataforma web, igual que `<video>` o `<dialog>`, y funcionan en cualquier
página.

Tres ideas lo resumen:

- **El HTML llega ya pintado.** Cada componente sale del servidor como Declarative Shadow DOM (lo
  explicamos justo abajo): el navegador lo muestra mientras lee el HTML, antes de ejecutar ningún
  script.
- **El JavaScript llega cuando hace falta.** Un componente sin estado ni eventos se queda en HTML y
  CSS. El que sí los tiene se *hidrata* en su primera interacción, no al cargar la página. Y lo
  que pulsas mientras se hidrata no se pierde: se guarda y se reproduce.
- **Lo que escribes se comprueba.** Las expresiones de la vista son una lista cerrada que el
  compilador conoce, así que un error se ve en el editor, con su código y su explicación, antes de
  abrir el navegador.

> [!NOTE]
> Fudic no es Angular, ni React, ni Vue. No hay JSX, ni DOM virtual, ni `useState`, ni
> decoradores. El markup es HTML estándar, y lo que se mueve son *signals*. Si vienes de otro
> framework, lee los ejemplos antes de escribir por analogía: casi todo se parece, pero casi nada
> es igual.

### Qué es Declarative Shadow DOM

Un componente web necesita dos cosas: su propio markup y sus propios estilos, sin que la página
los pise ni él pise a la página. El estándar que lo resuelve es el
**[Shadow DOM](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM)**:
un árbol de elementos que cuelga del componente, separado del resto del documento. Lo que hay
dentro no se ve desde fuera, y el CSS de dentro no sale.

Durante años, la única forma de crear ese árbol era con JavaScript
([`attachShadow()`](https://developer.mozilla.org/en-US/docs/Web/API/Element/attachShadow)). Eso
obligaba a esperar a que se descargara y ejecutara el script para ver el componente: hasta
entonces, un hueco en blanco. Y un servidor no tenía forma de enviar un componente ya pintado.

**Declarative Shadow DOM** es la forma de escribir ese mismo árbol directamente en el HTML, con
un [`<template>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/template)
que lleva el atributo
[`shadowrootmode`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/template#shadowrootmode),
dentro del componente:

```html
<mi-saludo>
  <template shadowrootmode="open">
    <style>p { color: teal; }</style>
    <p>Hola</p>
  </template>
</mi-saludo>
```

El navegador encuentra el `<template>`, crea el shadow root y lo pinta mientras lee el HTML, sin
ejecutar una línea de JavaScript. El `color: teal` solo afecta al `<p>` de dentro: los demás `<p>`
de la página no se enteran.

Es HTML estándar y lo entienden todos los navegadores actuales (Chrome, Edge, Safari y Firefox)
desde 2024. Fudic se apoya en él: cada `.fud` se compila exactamente a esto.

> [!NOTE]
> Esto es lo que cambia las reglas. Con Declarative Shadow DOM, un componente web puede salir del
> servidor ya pintado, como cualquier otro HTML: lo ven el usuario, los buscadores y los lectores
> de pantalla, antes de que cargue ningún script. Fudic está construido para eso: sus componentes
> se pintan en el servidor siempre, y el JavaScript llega después y solo donde hace falta.

## Por qué existe Fudic

Cuando aparecieron los componentes web, prometían algo que ningún framework podía dar:
componentes del propio navegador, que no caducan cuando cambia la moda.

Pero al estándar le faltaban piezas. Un componente web no se podía pintar en el servidor, y
compartir estilos entre componentes era incómodo. Los frameworks cubrieron esas carencias por su
cuenta, cada uno a su manera, y los componentes web acabaron relegados a un formato de exportación
más.

Hoy esas piezas existen, y Fudic nace para usarlas. Sus compromisos son tres:

- **El estándar primero.** Lo que el navegador ya sabe hacer, Fudic no lo reinventa. Lo que
  todavía está en camino, lo cubre con un polyfill pequeño que sigue la propuesta oficial, y que
  sobrará el día que todos los navegadores la traigan.
- **Componentes web pintados en el servidor.** Siempre, no como opción avanzada.
- **100/100/100/100 en [Lighthouse](https://developer.chrome.com/docs/lighthouse/overview).**
  Rendimiento, accesibilidad, buenas prácticas y SEO. No es una meta a la que llegas
  optimizando al final: es lo que una app de Fudic saca de serie.

## Lo que necesitas

- **Node.js 22.12** o posterior.
- Un gestor de paquetes: **pnpm** (el que usa Fudic por defecto), npm o yarn.
- Un editor. Con la extensión de Fudic para VS Code tienes colores, autocompletado y los errores
  mientras escribes (capítulo 14).

## Crea tu app

```sh
npx @fudic/cli new mi-app --locale es
```

El comando crea la carpeta `mi-app`, instala las dependencias y hace el primer commit de git.
Cuando termina, arranca el servidor de desarrollo con la CLI de Fudic:

```sh
cd mi-app
npx fudic dev
```

Abre `http://localhost:5173/` y verás la página de inicio.

> [!TIP]
> Dentro del proyecto, la CLI es una dependencia más y se ejecuta con `npx fudic …`. Si la
> instalas global (`npm install -g @fudic/cli`), basta con `fudic …`, en cualquier carpeta.

> [!TIP]
> `--locale es` hace que la app nazca en español: el `<html lang="es">` del layout sale de ahí. Sin
> él, la app nace en inglés. Las opciones más útiles de `fudic new`:
>
> | Opción | Qué hace |
> |---|---|
> | `--locale <tag>` | El idioma de la app (`es`, `en`, `pt-BR`…). Por defecto, `en`. |
> | `--prefix <p>` | El prefijo de los tags de tus componentes. Por defecto, el nombre de la app. |
> | `--pm <pnpm\|npm\|yarn>` | El gestor de paquetes. Por defecto, pnpm. |
> | `--workspace` | Un repo con varias apps y librerías en vez de una app sola. |
> | `--no-sw` | Sin Service Worker. |
> | `--dry-run` | Enseña lo que crearía, sin escribir nada. |
>
> `fudic new --help` las lista todas.

## Qué hay dentro

```text
mi-app/
├── fudic.json          lo que la app dice de sí misma: su id y el prefijo de sus tags
├── package.json        las dependencias y los scripts
├── page.headers        las cabeceras de cada página, con su política de seguridad (CSP)
├── assets.headers      la caché de los ficheros estáticos
├── sw.json             qué guarda el Service Worker
├── sw.headers          las cabeceras del Service Worker
├── vite.config.ts      el plugin de Fudic; no hace falta configurar nada más
├── vitest.config.ts    los tests unitarios
└── src/
    ├── routes/
    │   ├── index.fud       la página de /
    │   └── index.test.ts   su test
    ├── layouts/
    │   ├── _layout.fud     el marco en el que se pinta cada página
    │   └── _layout.test.ts
    ├── guide/          la guía de estilos: tokens, modo oscuro, fuente y una hoja por elemento
    ├── server/         el código que se ejecuta en el servidor (vacío al empezar)
    └── browser/        el código que se ejecuta en el navegador (vacío al empezar)
```

Todo lo que ves es tuyo y se edita, salvo tres cosas que genera Fudic y que nunca se tocan a mano:
`fudic-globals.d.ts`, `src/fudic-env.d.ts` y la carpeta `.fudic/`.

> [!IMPORTANT]
> **No cambies nunca el `id` de `fudic.json`** cuando la app ya tenga visitas. El Service Worker
> nombra sus cachés con él. Si lo cambias, las cachés del id viejo se quedan para siempre en el
> navegador de todos los que la visitaron.

### La página y su layout

Una página es un `.fud` dentro de `src/routes/`, y su ruta en disco es su URL: `index.fud` es `/`,
y `blog/index.fud` sería `/blog`. La página de inicio que trae la app es esta:

```fud path=src/routes/index.fud
<link rel="layout" href="../layouts/_layout.fud">

<head>
  <title>Home</title>
</head>

<h1>Home</h1>
```

- El `<link rel="layout">` dice en qué marco se pinta. Toda página tiene uno.
- El `<head>` de la página se suma al del layout: aquí van su `<title>` y su descripción.
- El resto es el contenido, en HTML estándar.

El layout es el documento completo. `@RenderHead()` es donde entra el `<head>` de cada página, y
`@RenderBody()`, donde entra su contenido:

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
    <main>@RenderBody()</main>
  </body>
</html>
```

> [!NOTE]
> `@* … *@` es un comentario de Fudic: no llega al HTML que recibe el navegador. La línea de
> `fudic:runtime` sí hay que conservarla, porque es donde Fudic coloca sus scripts, y solo en las
> páginas que los necesitan.

## Tu primer componente

Los componentes no se empiezan a mano: los crea la CLI, con su test y sus criterios de aceptación.

```sh
npx fudic g component counter --in src/routes/index.fud
```

```text
Created <miapp-counter> in src/components/miapp-counter/

  miapp-counter.fud         the component
  miapp-counter.test.ts     unit test               pnpm test
  miapp-counter.fudspec     acceptance criteria     pnpm spec
  miapp-counter.fixture.ts  the props the criteria mount it with
  linked from src/routes/index.fud
```

El nombre `counter` se ha convertido en `<miapp-counter>`: el prefijo de la app más el nombre.
El estándar exige que el nombre de todo
[custom element](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements)
[lleve un guion](https://developer.mozilla.org/en-US/docs/Web/API/CustomElementRegistry/define#valid_custom_element_names),
para que nunca choque con una etiqueta futura de HTML, y el prefijo además evita choques con los
componentes de otros. `--in` lo ha enlazado ya desde la página de inicio.

### La forma de un componente

El `.fud` que acabas de crear es el esqueleto de cualquier componente:

```fud path=src/components/miapp-counter/miapp-counter.fud
<head>
  <style></style>
</head>

<miapp-counter>
  <template shadowrootmode="open">
  </template>
</miapp-counter>
```

- **El propio tag** del componente envuelve un `<template shadowrootmode="open">`. Es el
  Declarative Shadow DOM que acabas de ver, en HTML estándar: no es sintaxis de Fudic.
- **Todo lo que pinta** va dentro del template.
- **El `<style>` del `<head>`** son los estilos del componente. Fudic los lleva a su shadow root,
  y a partir de ahí es el estándar el que hace el resto: el shadow root
  [encapsula el CSS](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM#encapsulation_from_css).
  Una clase `.counter` de dentro no pisa otra `.counter` de la página, ni la de la página entra.

### Dale vida

Sustituye el contenido por este:

```fud path=src/components/miapp-counter/miapp-counter.fud
@code {
  /** A counter that starts where the page says. */
  import { signal } from "@fudic/core";

  const { start = 0 } = props<{
    /** The number it starts at. */
    start?: number;
  }>();

  const n = signal(start);

  function inc() {
    n.set(n() + 1);
  }
}

<head>
  <style>
    .counter {
      display: flex;
      gap: 0.75rem;
      align-items: center;
    }
  </style>
</head>

<miapp-counter>
  <template shadowrootmode="open" shadowrootadoptedstylesheets="button output">
    <div class="counter">
      <button @click=@inc>+1</button>
      <output>@n()</output>
    </div>
  </template>
</miapp-counter>
```

Línea a línea:

- **`@code { … }`** es TypeScript estándar. Es lo que el componente sabe hacer.
- **`props<…>()`** declara lo que recibe de fuera. `start` es opcional y, si no llega, vale `0`.
  Los comentarios `/** … */` no son decoración: el editor los muestra al usar el componente.
- **`signal(start)`** es un valor que, cuando cambia, repinta lo que lo lee. Se lee llamándolo,
  `n()`, y se cambia con `n.set(…)`. Viene de `@fudic/core`; los signals todavía no son parte de
  JavaScript, aunque hay una [propuesta para el estándar](https://github.com/tc39/proposal-signals).
- **`@click=@inc`** conecta el clic del botón con la función `inc`.
- **`@n()`** escribe el valor del signal, y se actualiza solo cada vez que cambia. Lo pinta dentro
  de un [`<output>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/output),
  el elemento de HTML para el resultado de una acción del usuario.
- **`shadowrootadoptedstylesheets="button output"`** hace que el botón y el `<output>` se vean como
  en el resto de la app: el shadow root
  [adopta](https://developer.mozilla.org/en-US/docs/Web/API/ShadowRoot/adoptedStyleSheets) las
  hojas `button` y `output` de la guía de estilos, que el navegador carga una sola vez para toda
  la página.

> [!NOTE]
> `shadowrootadoptedstylesheets` todavía no es estándar: es una
> [propuesta en discusión en el WHATWG](https://github.com/whatwg/html/issues/10673), el
> organismo que mantiene HTML. Mientras los navegadores no la traen, Fudic la cubre con un script
> pequeño en la página. Es el primer compromiso de la sección anterior, en la práctica.

> [!TIP]
> El shadow DOM aísla el componente también de los estilos de la página: un `<button>` dentro de
> un componente no hereda el aspecto que la guía da a los botones. Por eso se adoptan por nombre.
> Si se te olvida uno, Fudic te avisa al compilar:
>
> ```text
> warning FUD1440: <output> is styled by the guide's "output", which this component does not
> adopt: add it to shadowrootadoptedstylesheets to look like the page
> ```

### Úsalo en la página

`--in` ya ha añadido el enlace. Solo falta escribir el tag donde quieres el contador:

```fud path=src/routes/index.fud
<link rel="layout" href="../layouts/_layout.fud">
<link rel="component" href="../components/miapp-counter/miapp-counter.fud">

<head>
  <title>Inicio</title>
</head>

<h1>Inicio</h1>

<miapp-counter .start=10></miapp-counter>
```

- **`<link rel="component">`** es como se importa un componente. Un tag sin su enlace es un error,
  y un enlace que nada usa, un aviso.
- **`.start=10`** pasa la prop `start`. El punto delante es lo que distingue una prop de un
  atributo HTML estándar, como `id` o `class`.

> [!IMPORTANT]
> Fíjate en que el `<h1>` está en la página y no dentro del componente. **Los encabezados (`h1` a
> `h6`) nunca van dentro del shadow DOM de un componente**: el esquema de la página, el SEO y la
> navegación por encabezados de los lectores de pantalla dependen de que estén en el documento. Si
> un componente tiene que mostrar un encabezado, lo recibe por un `<slot>`. Lo verás en el
> capítulo 2.

### Lo que recibe el navegador

Guarda y mira la página. Este es el HTML que llega, simplificado:

```html
<main>
  <h1>Inicio</h1>
  <miapp-counter>
    <template shadowrootmode="open" shadowrootadoptedstylesheets="base button output miapp-counter">
      <div class="counter">
        <button>+1</button>
        <output>10</output>
      </div>
    </template>
  </miapp-counter>
</main>
<script type="application/json" id="fud-state">[[0,1],[10]]</script>
```

- **El contador ya marca 10.** Lo ha pintado el servidor: no hace falta JavaScript para verlo.
- **No queda nada de Fudic en el markup:** ni `@click`, ni `@n()`. Es HTML estándar.
- **`fud-state`** es el estado con el que se pintó. Cuando pulses el botón, el componente se
  hidrata a partir de ahí, en vez de volver a calcularlo todo.

> [!NOTE]
> Hasta el primer clic, el contador no ha descargado su código. Si lo pulsas mientras se descarga,
> el clic se guarda y se reproduce en cuanto el componente está listo: el 10 pasa a 11 igual.

## Comprueba que funciona

La CLI creó dos formas de probar el componente, y las dos se ejecutan ya.

**El test unitario** (`miapp-counter.test.ts`) monta el componente en memoria. Añade un caso que
pulse el botón:

```ts path=src/components/miapp-counter/miapp-counter.test.ts
import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as MiappCounter from './miapp-counter.fud';

test('renders', async () => {
  const t = await mount(MiappCounter);
  expect(t.host).toBeInTheDocument();
});

test('starts at the number it is given and counts up', async () => {
  const t = await mount(MiappCounter, { props: { start: 10 } });
  expect(t.query('output')).toHaveTextContent('10');
  await t.click(t.getByRole('button', { name: '+1' }));
  expect(t.query('output')).toHaveTextContent('11');
});
```

```sh
npx fudic test
```

**Los criterios de aceptación** (`miapp-counter.fudspec`) se escriben en pasos sencillos y se
ejecutan en un navegador de verdad:

```fudspec path=src/components/miapp-counter/miapp-counter.fudspec
component miapp-counter

criterion renders
  given
    props base
  then
    present miapp-counter
```

```sh
npx fudic spec
```

> [!TIP]
> Un test unitario comprueba el código; un criterio comprueba lo que ve quien usa la app. Los dos
> tienen su capítulo (capítulo 11).

## El estándar, en MDN

Lo que usa este capítulo, explicado por la referencia de la plataforma web:

- [Web Components](https://developer.mozilla.org/en-US/docs/Web/API/Web_components): la
  introducción a los tres estándares que los forman.
- [Using custom elements](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements):
  etiquetas propias con su comportamiento.
- [Using shadow DOM](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM),
  y en concreto
  [cómo declararlo en HTML](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM#declaratively_with_html).
- [`<template>` y su atributo `shadowrootmode`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/template#declarative_shadow_dom):
  Declarative Shadow DOM con ejemplos.
- [Using templates and slots](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_templates_and_slots):
  cómo recibe un componente contenido de la página. Lo verás en el capítulo 2.
- [`ShadowRoot.adoptedStyleSheets`](https://developer.mozilla.org/en-US/docs/Web/API/ShadowRoot/adoptedStyleSheets):
  hojas de estilo compartidas entre shadow roots.
