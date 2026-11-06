# fudspec

El lenguaje `.fudspec`: los criterios de aceptación de un componente, escritos con las palabras del usuario, ejecutados en un navegador real, aprobados por el usuario junto con las props.

## Para qué sirve

Un `.fudspec` contiene lo que una persona comprobaría mirando el componente y tocándolo: qué se ve, qué dice, qué hace un clic o una tecla, adónde va el foco, qué se le dice a un lector de pantalla, qué tamaño tiene. **Una frase del usuario es un criterio** ("un botón deshabilitado no hace nada", "la segunda pestaña muestra su panel").

Las props (en el `.fud`) y los criterios (en el `.fudspec`, con su fixture) son lo que aprueba el usuario. Propónlos en la conversación en lenguaje llano, espera el sí del usuario y luego llama a `fudic_record { piece: "src/components/app-post/app-post.fud", event: "approved" }`. Nunca apruebes en nombre del usuario. Cambiar el `.fudspec` o su fixture después hace que la aprobación caduque, y `fudic_status` vuelve a pedirla.

Lo que el usuario no ve (cada variante de prop, valores límite, el `detail` de un evento, funciones de servidor, reglas de formulario) va en tests unitarios: topic `testing`.

## Crearlo

`fudic_generate { kind: "component", name: "post" }` ya escribe `app-post.fudspec` y `app-post.fixture.ts` con un criterio que pasa. Para un componente que no tiene: `fudic_generate { kind: "spec", name: "app-post" }`. Nunca escribas los ficheros desde cero.

```
src/components/app-post/app-post.fud
src/components/app-post/app-post.fudspec      the criteria
src/components/app-post/app-post.fixture.ts   the props each criterion mounts it with
fudic/terms/<block>/<name>.js                 terms of your own, at the project root
```

## La forma de un fichero

```
component <tag>

# A comment explains why the criterion exists.
criterion <slug>
  given
    props <fixture>
  when
    <term> <args>
  then
    <term> <args>
```

- La indentación es estructura: 0 espacios para `component` y `criterion`, 2 para `given`/`when`/`then`, 4 para un término. Tabuladores u otras anchuras son `FUD0921`.
- La primera línea es `component <tag>` (`FUD0922` si falta, `FUD0923` si está dos veces). El tag debe ser un componente del proyecto (`FUD0949`).
- `criterion <slug>`: un nombre en kebab-case, único en el fichero (`FUD0927`). Da nombre al criterio en todos los informes.
- Los bloques van en orden `given`, `when`, `then`, cada uno como mucho una vez (`FUD0930`). `given` y `when` son opcionales; `then` no (`FUD0933`). Un bloque vacío es `FUD0934`.
- `#` inicia un comentario hasta el final de la línea.
- Argumentos: un token suelto (`app-post`, `16`, `href`), un string entre comillas dobles en una línea (`"Tab B"`, `FUD0920` si no se cierra), o una referencia por rol.
- Si hay varias líneas `then`, se comprueban todas; una en rojo no detiene las demás.

## Objetivos: tag o rol con su nombre

Un término que recibe un elemento acepta:

- un tag: `app-post`, `article`, `time`;
- `role:<role>/"<name>"`: el elemento con ese rol ARIA y exactamente ese nombre accesible: `role:tab/"Tab B"`, `role:link/"Featured"`, `role:button/"Save"`;
- `role:<role>` solo, cuando solo hay uno: `role:tabpanel`.

Las referencias atraviesan los shadow roots. Una referencia debe coincidir con **exactamente un** elemento; más es un error que dice cuántos (`FUD1203`). Prefiere roles y nombres: son lo que perciben una persona y un lector de pantalla, y un criterio escrito con ellos también comprueba la accesibilidad. Si ningún rol con nombre encuentra el elemento, probablemente al componente le falta una etiqueta: arregla el componente, no el criterio.

## El fixture: los casos

Cada clave del `export default` del fixture es un caso: un conjunto de props con el que se monta el componente. `props <key>` en `given` lo elige.

- Un componente con props obligatorias necesita `props <key>` en cada criterio (`FUD0951`); no hay caso por defecto.
- `props` va en `given`, una vez (`FUD0952`), y nombra una clave existente (`FUD0950`). El fichero es `<tag>.fixture.ts` junto al `.fud` (`FUD0953`).
- Tipalo con `satisfies Fixtures<$Props>`: una prop obligatoria que falta es un error de tipos.
- `$content` es HTML que se coloca dentro del host como sus hijos: así se rellena un slot.
- Una prop `Signal` toma su valor inicial, que debe ser JSON plano (`FUD0974`).

```fud path=src/components/app-post/app-post.fud
@code {
  /** A post in a list: its title links to it; what is written inside is the summary. */
  const { title, href, variant = "default" } = props<{
    /** The title, one line or two. */
    title: string;
    /** Where the title links to. */
    href: string;
    /** "highlight" draws the card with the brand border. */
    variant?: "default" | "highlight";
  }>();
}

<head>
  <style>
    .card {
      border: 1px solid #dcdcdc;
      border-radius: 10px;
      padding: 1rem 1.15rem;
      background: white;
      h2 {
        margin: 0 0 0.35rem;
        font-size: 1.05rem;
      }
      a {
        color: inherit;
      }
    }
    .card.highlight {
      border-color: #1a73e8;
    }
  </style>
</head>

<app-post>
  <template shadowrootmode="open">
    <article class="card" class:highlight=@(variant === "highlight")>
      <header>
        <h2><a href=@href>@title</a></h2>
        <slot name="meta"></slot>
      </header>
      <div class="body">
        <slot></slot>
      </div>
    </article>
  </template>
</app-post>
```

```ts path=src/components/app-post/app-post.fixture.ts
import type { Fixtures } from '@fudic/terms';
import type { $Props } from './app-post.fud';

// The props each criterion of app-post.fudspec mounts the card with (`props <name>`).
export default {
  base: { title: 'A', href: '/' },
  'long-title': {
    title: 'A title long enough that it has to wrap onto a second line inside the card',
    href: '/blog/long',
  },
  featured: { title: 'Featured', href: '/blog/featured', variant: 'highlight' },
  dated: { title: 'Dated', href: '/blog/dated', $content: '<time slot="meta">May 2026</time>' },
} satisfies Fixtures<$Props>;
```

```fudspec path=src/components/app-post/app-post.fudspec
component app-post

# A card never collapses, whatever its title. It is mounted without the app's layout,
# so 16px is one line of title.
criterion min-height
  given
    props base
  then
    min-height app-post 16

criterion long-title-visible
  given
    props long-title
  then
    visible app-post
    text app-post "A title long enough"

# The link is not clicked: it would navigate away from the card.
criterion title-links-to-post
  given
    props featured
  then
    visible role:link/"Featured"
    attribute role:link/"Featured" href "/blog/featured"

criterion featured-is-highlighted
  given
    props featured
  then
    has-class article highlight

criterion date-beside-title
  given
    props dated
  then
    slotted time meta
    text app-post "May 2026"
```

## Los términos de serie

Vienen con `@fudic/terms`; no hay ningún fichero que escribir.

| Bloque | Término | Pasa cuando / hace |
|---|---|---|
| `given` | `props <fixture>` | monta con ese caso |
| `when` | `click <target>` | hace clic en él y espera hasta que la página haya atendido el clic |
| `when` | `press <target> "<key>"` | le da el foco y pulsa `x`, `Enter`, `Shift+Tab`… |
| `when` | `type <target> "<text>"` | escribe en él, tecla a tecla |
| `when` | `focus <target>` | le da el foco |
| `when` | `set-attribute <target> <attribute> "<value>"` | establece el atributo |
| `then` | `present <target>` | está en la página, aunque esté vacío y no ocupe espacio |
| `then` | `visible <target>` | está en pantalla, con tamaño |
| `then` | `hidden <target>` | no es visible |
| `then` | `text <target> "<expected>"` | el texto que una persona ve en él, a través de shadow roots y slots, lo contiene |
| `then` | `attribute <target> <attribute> "<expected>"` | el atributo tiene exactamente ese valor |
| `then` | `focused <target>` | tiene el foco, seguido a través de cada shadow root |
| `then` | `slotted <target> <slot>` | fue a ese slot de su host (`default` es el que no tiene nombre) |
| `then` | `min-height <target> <px>` · `min-width <target> <px>` | mide al menos eso |

Un término desconocido es `FUD0940` (el mensaje lista los que tiene el bloque); un número incorrecto de argumentos, `FUD0947`; un argumento con la forma incorrecta, `FUD0948`.

```fud path=src/components/app-tabs/app-tabs.fud
@code {
  /** Two tabs; the first is open when the page loads. */
  import { signal } from "@fudic/core";

  const active = signal(0);

  function pickA() {
    active.set(0);
  }

  function pickB() {
    active.set(1);
  }
}

<app-tabs>
  <template shadowrootmode="open">
    <div role="tablist">
      <button role="tab" @click=@pickA>Tab A</button>
      <button role="tab" @click=@pickB>Tab B</button>
    </div>
    <p role="tabpanel">@(active() === 0 ? "panel A" : "panel B")</p>
  </template>
</app-tabs>
```

```fudspec path=src/components/app-tabs/app-tabs.fudspec
component app-tabs

# The first tab is the one open when the page loads.
criterion starts-on-a
  then
    text role:tabpanel "panel A"

# One click on the second tab shows its panel, even on a component not yet hydrated.
criterion switches-tab
  when
    click role:tab/"Tab B"
  then
    text role:tabpanel "panel B"
```

`app-tabs` no tiene props obligatorias, así que sus criterios no necesitan `given`.

## Dónde se ejecuta

- Cada criterio tiene su propia página que monta el componente **solo**: sin layout, sin la hoja de estilos que enlaza el layout, sin navegación. No hagas clic en un enlace que salga de la página; no dependas de un token que define el layout.
- Un componente aún no hidratado atiende igualmente su primer gesto: un `when` espera hasta que la página lo haya atendido, hidratación incluida, de modo que el `then` que le sigue lee el nuevo estado.
- Los criterios se ejecutan en paralelo, cada uno con 30 s para cargar.

## Términos propios

Cuando ningún término de serie lo dice, escribe uno: `fudic_generate { kind: "term", name: "has-class", block: "then", params: ["target:element", "name:token"] }` escribe `fudic/terms/then/has-class.js`. Tipos de parámetro: `element`, `number`, `string`, `token` (`FUD0962` en otro caso). Un término del proyecto sustituye a un término de serie con el mismo nombre.

```js path=fudic/terms/then/has-class.js
export const meta = {
  name: 'has-class',
  block: 'then',
  params: [
    { name: 'target', type: 'element' },
    { name: 'name', type: 'token' },
  ],
};

/** @type {import('@fudic/terms').Term['run']} */
export async function run(ctx, { target, name }) {
  const classes = await ctx.locate(String(target)).evaluate((el) => [...el.classList]);
  return {
    pass: classes.includes(String(name)),
    evidence: { expected: `class "${name}"`, actual: `classes "${classes.join(' ')}"` },
  };
}

export const selfTest = [{ args: { target: 'article', name: 'highlight' }, expect: 'pass' }];
```

- `meta` se lee sin ejecutar el módulo: `name`, `block` y `params` son literales (`FUD0941`), `name` es el nombre del fichero (`FUD0942`) y `block` su carpeta (`FUD0943`).
- `run(ctx, args)` recibe los argumentos por nombre de parámetro (un `number` llega como número). Un `then` devuelve `{ pass, evidence: { expected, actual } }`, ambos como texto que lee una persona; es lo que muestra un informe en rojo. Un `when` o un `given` devuelve una frase con lo que hizo.
- `ctx.page` es la página de Playwright; `ctx.locate(ref)`, un locator que debe coincidir con un elemento; `ctx.act(target, gesture)` ejecuta un gesto y espera hasta que la página lo haya atendido (todo `when` que toca la página pasa por él); `ctx.text(target)`, el texto que ve una persona.
- Un término del proyecto exporta `selfTest` (`FUD0946`) y `run` (`FUD0945`).

## Ejecutarlo

`fudic_spec_run { spec: "app-post" }` ejecuta los criterios de un componente (un tag o una ruta); sin `spec`, todos los `.fudspec`. `criteria: ["min-height"]` ejecuta algunos; `failing: true`, solo los que no pasaron la última vez.

Solo se detalla lo que no pasó: el criterio y su posición en el `.fudspec`, el paso en rojo con lo que esperaba y lo que obtuvo, el elemento que localizó, de vuelta en el `.fud` (`source`, `quote`), una captura en `.fudic/runs/` y los errores de la página.

- **pass**: todos los `then` pasaron.
- **fail**: un `then` dijo que no. Antes de que exista la vista, este es el rojo correcto: el criterio se ejecuta y no encuentra nada (`actual: not there`).
- **error**: el criterio no pudo llegar a un veredicto: la página no cargó (`FUD1200`), un término desconocido (`FUD1201`), un paso fuera de tiempo (`FUD1202`), una referencia que coincide con varios elementos (`FUD1203`), un término que lanzó (`FUD1204`), un error en la página (`FUD1205`), `fudic/bench.js` falló (`FUD1206`), cualquier otra cosa (`FUD1207`). Un error nunca es el rojo correcto: arréglalo antes de seguir.

Un `.fudspec` con diagnósticos no ejecuta nada; `fudic_check` los informa como en cualquier otro fichero. Tras editar el `.fud`, ejecuta primero `fudic_test` (milisegundos) y después `fudic_spec_run` para confirmar (segundos).
