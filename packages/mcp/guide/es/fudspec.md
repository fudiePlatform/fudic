# fudspec

El lenguaje `.fudspec`: los criterios de aceptación de un componente, de una página o de un flujo entre páginas, escritos con las palabras del usuario, ejecutados en un navegador real, aprobados por el usuario junto con las props.

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
- La primera línea dice de qué trata el fichero (`FUD0922` si falta, `FUD0923` si está dos veces): `component <tag>` (un componente del proyecto, `FUD0949`), `page <ruta>` (una ruta, escrita como en disco: `page /products`, `page /blog/[slug]`, `page /`; `FUD1500` si no existe) o `flow <nombre>` (un camino entre páginas, en `src/flows/<nombre>.fudspec`). Páginas y flujos tienen sus secciones más abajo.
- `criterion <slug>`: un nombre en kebab-case, único en el fichero (`FUD0927`). Da nombre al criterio en todos los informes.
- `given` va primero y como mucho una vez; después `when` y `then` se alternan tantas veces como pida la historia, y el criterio acaba en un `then` (`FUD0930` si `given` va detrás de otro bloque o hay dos bloques iguales seguidos, `FUD0933` si no acaba en `then`). `given` y `when` son opcionales. Un bloque vacío es `FUD0934`.
- Antes de cada `then` la página está quieta: ninguna petición en camino, ningún `setTimeout` que venza en menos de un segundo, ningún frame de animación pendiente (un `setInterval` no cuenta). Una página que nunca se queda quieta es `FUD1508`, con lo que seguía pendiente. Un `then` en positivo se reintenta hasta que se cumple o se acaba el tiempo (5 s); uno en negativo (`count … 0`, `hidden`, `unchecked`, `called … 0`, `not-reloaded`) se lee una vez, con la página quieta.
- `#` inicia un comentario hasta el final de la línea.
- Argumentos: un token suelto (`app-post`, `16`, `href`), un string entre comillas dobles en una línea (`"Tab B"`, `FUD0920` si no se cierra), o una referencia por rol.
- Si hay varias líneas `then`, se comprueban todas; una en rojo no detiene las demás.

## Objetivos: tag o rol con su nombre

Un término que recibe un elemento acepta:

- un tag: `app-post`, `article`, `time`;
- `role:<role>/"<name>"`: el elemento con ese rol ARIA y exactamente ese nombre accesible: `role:tab/"Tab B"`, `role:link/"Featured"`, `role:button/"Save"`;
- `role:<role>` solo, cuando solo hay uno: `role:tabpanel`;
- `role:<role>/~"<texto>"`: el nombre accesible contiene el texto: `role:row/~"Ana"`;
- pasos unidos por `>`, cada uno buscado dentro del anterior: `role:row/~"Luis">role:button/"Delete"` es el «Delete» de la fila de Luis, cuando cada fila tiene uno. Un `>` sin paso o un `~` sin texto es `FUD1509`.

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
| `given` | `cookie <name> "<value>"` | el navegador tiene esa cookie, para todo el sitio, antes de abrir |
| `given` | `locale <tag>` | la página en ese idioma: `Accept-Language` y `navigator.language` |
| `given` | `media <feature> <value>` | `prefers-color-scheme dark`, `prefers-reduced-motion reduce`, `forced-colors active`… |
| `given` | `viewport <width> <height>` | el tamaño de la ventana |
| `given` | `clock <instant>` | la hora, ISO 8601, en el navegador y en el servidor del criterio, parada hasta un `wait` |
| `given` · `when` | `offline` · `online` | sin red (una página ya visitada se abre igual desde el Service Worker) |
| `when` | `go <url>` · `back` · `forward` · `reload` | la barra de direcciones y el historial |
| `when` | `check <target>` · `uncheck <target>` | hace clic en una casilla, como una persona |
| `when` | `select <target> "<option>"` · `hover <target>` | elige una opción por su texto · pasa el ratón por encima |
| `when` | `upload <target> "<file>"` | elige ese fichero (relativo a la `.fudspec`, `FUD1511` si no existe) |
| `when` | `wait <ms>` | avanza el reloj ese tiempo (los dos relojes con `clock`; tiempo real sin él) |
| cualquiera | `as <who>` | lo que sigue lo hace otra persona: su propio navegador, con sus cookies; `as main` vuelve |
| `then` | `title "<expected>"` · `url <path>` | el `<title>` · dónde está la página, ruta y query |
| `then` | `status <code>` · `header <name> "<expected>"` | de la última respuesta de documento (un `_error.fud` responde su código) |
| `then` | `count <target> <n>` | cuántos elementos da la referencia (aquí puede dar más de uno) |
| `then` | `value <target> "<expected>"` · `checked` · `unchecked` · `enabled` · `disabled` | el estado de un control |
| `then` | `called <fn> <times>` · `sent <fn> <field> "<expected>"` | lo que la página pidió al servidor en el criterio: cuántas veces, y un campo de la última llamada (`user`, `docs.0`; un fichero vale su nombre) |
| `then` | `lists "<value>"` | el `paths()` de verdad de la ruta lo incluye |
| `then` | `not-reloaded` · `requests <n>` · `downloaded "<name>"` | durante el último bloque `when`: el mismo documento, cuántas peticiones salieron, un fichero que descargó |

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

- Cada criterio de un componente tiene su propia página que monta el componente **solo**: sin layout, sin la hoja de estilos que enlaza el layout, sin navegación. No hagas clic en un enlace que salga de la página; no dependas de un token que define el layout. Una página o un flujo es la app misma (abajo).
- Un componente aún no hidratado atiende igualmente su primer gesto: un `when` espera hasta que la página lo haya atendido, hidratación incluida, de modo que el `then` que le sigue lee el nuevo estado.
- Los criterios se ejecutan en paralelo, cada uno con 30 s para cargar.

## Páginas

`page <ruta>` comprueba una ruta con su layout de verdad, abierta por su URL en la app con el `vite.config` del usuario. **Lo que la fixture nombra es falso y lo demás es de verdad**: el `layout` siempre corre; el `load` corre salvo que el criterio diga `data`; una función corre salvo que la responda un grupo de `answers`; `paths()` corre salvo que la fixture traiga `paths`. `fudic_generate { kind: "spec", name: "/shop" }` escribe `shop.fudspec` y `shop.fixture.ts` junto a la ruta, con la fixture tipada por el `Fixtures` que da su `.fudapi`.

```ts path=src/services/items.ts
import { Service } from '@fudic/di';

/** Where the shop keeps its items: a flow puts one of its own in its place. */
export class Items {
  readonly #list: string[];

  constructor(list: readonly string[] = ['Coffee', 'Tea']) {
    this.#list = [...list];
  }

  all(): readonly string[] {
    return this.#list;
  }

  add(name: string): void {
    this.#list.push(name);
  }
}
Service(Items);
```

```fudapi path=src/routes/shop.fudapi
load ssr
  items    str[]
  session  str?

post login
  invalidates /shop
  user  str

post add
  invalidates /shop
  name  str
```

```ts path=src/server/routes/shop.ts
import { inject } from '@fudic/di';
import { setCookie } from '@fudic/http';
import { add, load, login } from 'fudic:routes/shop';
import { Items } from '../../services/items';

load.handle((ctx) => {
  const session = ctx.cookies.get('sid');
  return { items: [...inject(Items).all()], ...(session !== undefined ? { session } : {}) };
});

login.handle((ctx) => setCookie(ctx, 'sid', ctx.args.user));

add.handle((ctx) => inject(Items).add(ctx.args.name));
```

```fud path=src/routes/shop.fud
<link rel="layout" href="../layouts/_layout.fud">
<link rel="server" href="./shop.fudapi">

@code {
  async function signIn() {
    await login({ user: "ana" });
  }

  async function addMilk() {
    await add({ name: "Milk" });
  }
}

<head>
  <title>Shop</title>
</head>

<h1>Shop</h1>
<p>Signed in: @(data.session === undefined ? "nobody" : data.session)</p>
<button @click=@signIn>Sign in as Ana</button>
<button @click=@addMilk>Add milk</button>
<ul>
  @foreach (const item of data.items) key (item) {
    <li>@item</li>
  }
</ul>
```

```ts path=src/routes/shop.fixture.ts
import type { Fixtures } from 'fudic:routes/shop';
import { fails } from '@fudic/spec';

export default {
  data: {
    two: { items: ['Coffee', 'Tea'] },
    'two-signed-in': { items: ['Coffee', 'Tea'], session: 'ana' },
    none: { items: [] },
    down: fails(503, 'the database does not answer'),
  },
  calls: {
    'ana-in': { login: undefined },
  },
} satisfies Fixtures;
```

```fudspec path=src/routes/shop.fudspec
page /shop

# The list comes from the fixture: load does not run.
criterion lists-the-items
  given
    data two
  then
    title "Shop"
    count role:listitem 2

# login answers from the fixture, and names the page in `invalidates`: the page asks for its
# data again, and gets the next name of `data`.
criterion signing-in-says-who
  given
    data two two-signed-in
    answers ana-in
  when
    click role:button/"Sign in as Ana"
  then
    sent login user "ana"
    text main "Signed in: ana"

criterion a-failing-load-is-the-error-page
  given
    data down
  then
    status 503
```

Las líneas del `given` de una página (se leen contra la fixture; no son términos):

| Línea | Hace |
|---|---|
| `data <name>+` | lo que devuelve el `load`: el primer nombre, y el siguiente cada vez que la página pide su data otra vez (un `invalidates`); el último se repite |
| `answers <name>+` | esos grupos de `calls`, juntos; si dos responden la misma función, gana el último |
| `services <name>` | los servicios de ese grupo, en lugar de los de verdad |
| `path <value>` | abre la ruta con ese valor de los `paths` de la fixture (`FUD1502` si no está) |
| `url <url>` | abre esa URL, que tiene que casar con la ruta (`FUD1503`) |

Una ruta con parámetros necesita `path` o `url` (`FUD1504`). Un nombre que la fixture no tiene es `FUD0950`; sin fichero de fixture, `FUD0953`; una línea de otra clase de spec (`props` en una página, `data` en un componente), `FUD1501`. `called` y `sent` nombran funciones que la página puede llamar (`FUD1506`) y sus argumentos (`FUD1507`).

Los ayudantes de `@fudic/spec` devuelven datos, nunca promesas, así que el editor lee la fixture sin ejecutarla: `fails(status, title)` o `fails('code')` (solo los códigos que declara el `fails` de la función), `redirects('/login')`, `later(2000, value)`, `later.never()`, `later.fails(ms, status, title)`, `file('./fixtures/list.csv', { type: 'text/csv' })` para una función `-> file`. Un `later` espera al reloj del criterio: con `clock` llega en el `wait` que lo alcanza.

## Flujos

`flow <nombre>` sigue a una persona por varias páginas con **el servidor de verdad**: login, cookies, redirecciones y cada función corren de verdad. La fixture solo dice dónde viven los datos (`services`), y cada `use` se llama una vez por criterio: lo que crea un criterio lo ven todas sus páginas y ningún otro criterio, aunque corran a la vez. `fudic_generate { kind: "flow", name: "checkout" }` escribe `src/flows/checkout.fudspec` y su fixture.

```ts path=src/flows/checkout.fixture.ts
import type { FlowFixtures } from '@fudic/spec';
import { fails } from '@fudic/spec';
import { Items } from '../services/items';

export default {
  services: {
    empty: [{ provide: Items, use: () => new Items([]) }],
  },
  calls: {
    'no-network': { add: fails(0, 'network') },
  },
} satisfies FlowFixtures;
```

```fudspec path=src/flows/checkout.fudspec
flow checkout

# What one criterion adds, its pages see; the next criterion starts empty again.
criterion what-is-added-is-in-the-list
  given
    services empty
    url /shop
  when
    click role:button/"Add milk"
    go /shop
  then
    count role:listitem 1
    text role:listitem "Milk"

# Luis has a browser of his own: Ana's cookie is not his.
criterion another-person-is-not-signed-in
  given
    services empty
    url /shop
  when
    click role:button/"Sign in as Ana"
    as luis
    go /shop
  then
    text main "Signed in: nobody"
    as main
    text main "Signed in: ana"

criterion without-network-nothing-is-added
  given
    services empty
    answers no-network
    url /shop
  when
    click role:button/"Add milk"
  then
    called add 1
    count role:listitem 0
```

Cada criterio empieza en su `url`; `go` sigue desde ahí (`FUD1505`, un aviso, para una URL que ninguna ruta responde). `fails(0, …)` es un fallo de red: la llamada no llega a tener respuesta. Un criterio con `offline` corre contra la app construida y servida con `vite preview`, el único sitio donde el Service Worker pinta una página.

Un backend que no es el servidor TypeScript de fudic recibe la misma cookie, `fudic-bench=<criterio>`, en cada petición del criterio, y pide al banco `GET /__bench/criterion/<id>` los nombres `{ services, answers, clock }` para sembrarse.

## Grabar una fixture

`fudic_spec_run { spec: "/shop", record: true }` ejecuta los criterios de una página o de un flujo contra el servidor de verdad, sin `data` ni `answers`, y escribe en la fixture lo que respondió, con el nombre del criterio: cada `data` que pidió la ruta (`<criterio>`, `<criterio>-2`…), cada respuesta de una función en `calls['<criterio>']`, un fichero recibido como `file(…)` con sus bytes al lado. Las líneas de la `.fudspec` se reescriben para nombrarlos, así que el criterio corre después con el servidor parado. Solo se graba un criterio que pasa; un valor que no se puede escribir como literal es `FUD1515` y se deja fuera. Volver a grabar sustituye lo que tenía ese nombre.

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

`fudic_spec_run { spec: "app-post" }` ejecuta los criterios de un componente (un tag o una ruta de fichero), de una página (`/shop`, `/blog/[slug]`) o de un flujo (`checkout`); sin `spec`, todos los `.fudspec`. `criteria: ["min-height"]` ejecuta algunos; `failing: true`, solo los que no pasaron la última vez. Una página o un flujo responde además `calls`: por criterio, cada llamada que hizo, con sus argumentos, si la respondió la fixture (`faked`) y su estado.

`fudic_render { route: "/shop", fixture: { data: "none" } }` y `fudic_preview` con el mismo `fixture: { data, answers, services }` enseñan una ruta como la abre un criterio (`FUD1516` con un nombre que la fixture no tiene, `FUD1517` sin fixture).

Solo se detalla lo que no pasó: el criterio y su posición en el `.fudspec`, el paso en rojo con lo que esperaba y lo que obtuvo, el elemento que localizó, de vuelta en el `.fud` (`source`, `quote`), una captura en `.fudic/runs/` y los errores de la página.

- **pass**: todos los `then` pasaron.
- **fail**: un `then` dijo que no. Antes de que exista la vista, este es el rojo correcto: el criterio se ejecuta y no encuentra nada (`actual: not there`).
- **error**: el criterio no pudo llegar a un veredicto: la página no cargó (`FUD1200`), un término desconocido (`FUD1201`), un paso fuera de tiempo (`FUD1202`), una referencia que coincide con varios elementos (`FUD1203`), un término que lanzó (`FUD1204`), un error en la página (`FUD1205`), `fudic/bench.js` falló (`FUD1206`), cualquier otra cosa (`FUD1207`). Un error nunca es el rojo correcto: arréglalo antes de seguir.

Un `.fudspec` con diagnósticos no ejecuta nada; `fudic_check` los informa como en cualquier otro fichero. Tras editar el `.fud`, ejecuta primero `fudic_test` (milisegundos) y después `fudic_spec_run` para confirmar (segundos).
