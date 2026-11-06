# pages

Rutas, layouts, los datos de una página (`load`), llamar al servidor desde una página, páginas de error y la sesión.

## Las rutas salen del sistema de ficheros

| Fichero | URL |
|---|---|
| `src/routes/index.fud` · `about.fud` · `blog/index.fud` | `/` · `/about` · `/blog` |
| `src/routes/blog/[slug].fud` | `/blog/:slug`, que se lee en el servidor como `ctx.params.slug` |
| `src/routes/_error.fud` | ninguna: la página de error |

- Un parámetro es `[name]`; los segmentos estáticos le ganan. Un layout o un componente bajo
  `src/routes` no es una ruta.
- Una **ruta** empieza con `<link rel="layout" href="…">` y no escribe `<!DOCTYPE>`, `<html>` ni
  `<body>`: un fragmento `<head>` opcional (su `<title>`), `@section`s y markup, en este orden:
  `<link rel="layout">`, `<link rel="component">` y `<link rel="server">`, `@code`, `<head>`,
  el resto (`FUD0421`). Un **documento de página** no tiene layout: un documento `<!DOCTYPE html>` completo
  con la forma del layout de abajo, su `<title>` en `<head>`, su markup en `<body>`.
- `fudic_generate { kind: "page" }`, dada la URL (`/products`, `blog/:slug`), escribe la
  ruta enlazada al `_layout.fud` más cercano (subiendo desde la página, y luego `src/layouts/_layout.fud`),
  una `@section` vacía por cada sección de ese layout y un test unitario; sin layout, un documento
  de página. `fudic_generate { kind: "api" }` añade después el `.fudapi` con un `load` y su handler.

## Layouts

Un documento completo con huecos, en `src/layouts`. `fudic_generate { kind: "layout" }` escribe uno.

```fud path=src/layouts/_layout.fud
<!DOCTYPE html>
<html lang="en">
  <head>
    @code {
      const { area = "Shop" } = props<{ area?: string }>();
    }
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta property="article:section" content="@area">
    @* Keep this line: fudic puts its scripts here. *@
    <script type="module" src="fudic:runtime"></script>
    @RenderHead()
  </head>
  <body>
    @RenderSection(nav)
    <main>@RenderBody()</main>
  </body>
</html>
```

- `@RenderBody()`: el markup de la ruta, exactamente una vez (`FUD0423`, `FUD0424`). `@RenderHead()`:
  el `<head>` de la ruta, dentro de `<head>` (`FUD0431`; si falta, `FUD0425`).
- `@RenderSection(name)`: lo rellena `@section name { … }`, si no queda vacío; con `required: true`
  hay que rellenarlo (`FUD0890`). Una `@section` que el layout no renderiza es `FUD0429`.
- Conserva el script `fudic:runtime`: sin él una página nunca reacciona a un clic. Un layout nunca
  enlaza otro layout (`FUD0439`) ni un `.fudapi` (`FUD1112`).
- Props: se declaran en un `@code` dentro de `<head>` que solo contiene `props<…>()` (`FUD0700`), y se leen solo
  en el head, nunca en `<body>` (`FUD0704`). Una ruta las resuelve en el `layout` de su `.fudapi`;
  una prop sin valor por defecto que la ruta omite es `FUD0702`.

## `load`: los datos de una página

`load` se declara en el `.fudapi` junto a la ruta (misma carpeta, mismo nombre; en otro sitio
`FUD1090`), se implementa en `src/server` y se lee en la vista como `data`. La ruta lo enlaza
con `<link rel="server" href="./x.fudapi">`. Solo se ejecuta en el servidor. Su línea es
`load [ssg|ssr|sw] [ttl <dur>] [<policy>] [page never|persist [<dur>]] [buffer <bytes>]`.

| Modo | Qué pasa |
|---|---|
| `ssg` | El build ejecuta `load` y escribe el HTML. Con parámetros necesita `paths` (`FUD0398`). |
| `ssr` | El servidor la renderiza en cada petición. Escríbelo para todo lo que dependa de quién pregunta. |
| `sw` | La renderiza el Service Worker, con sus datos de un endpoint que genera fudic. |
| ninguno escrito | Sin parámetros: `sw` (una página sin `load` es `ssg`). Con parámetros: `ssg` con `paths`, y los valores que no lista se renderizan bajo demanda; `sw` sin él. `ssr` nunca se infiere. |

- Sin `sw.json` en la raíz del proyecto (`fudic new` escribe uno salvo con `--no-sw`): no hay Service Worker,
  y el servidor sirve todas las páginas.
- `ttl 5m` (`s`, `m`, `h`, `d`) y una política (`cache-first`, `network-first`,
  `stale-while-revalidate`, `network-only`): cómo guarda los datos el Service Worker. `page
  persist [<dur>]` guarda también el HTML renderizado de una página `sw` (por defecto `never`).
- `buffer`: bytes que retiene el stream de la página antes de enviar; `0` envía cada trozo en cuanto está, `16k`
  agrupa hasta 16384, por defecto 8192 (`FUD1325`). Una opción incorrecta es `FUD1074`.
- `load` admite `use` / `skip`, nunca `fails` (`FUD1360`). Un `load` que lanza `notFound()` o
  `forbidden()` responde con ese estado y pinta `_error.fud`; `redirect("/")` redirige.

```fudapi path=src/routes/blog/[slug].fudapi
# Prerendered once per slug that paths gives; another slug is rendered on demand.
load
  title  str
  body   str

# Every slug the build prerenders.
paths

# The props of _layout.fud, resolved after load.
layout
```

```ts path=src/server/routes/blog/[slug].ts
import { notFound } from '@fudic/http';
import { layout, load, paths } from 'fudic:routes/blog/[slug]';

const posts = [{ slug: 'hello', title: 'Hello', body: 'The first post.' }];

load.handle((ctx) => {
  const post = posts.find((p) => p.slug === ctx.params.slug);
  if (post === undefined) throw notFound(`There is no post called "${ctx.params.slug}".`);
  return { title: post.title, body: post.body };
});

paths.handle(() => posts.map((p) => p.slug));

layout.handle(() => ({ area: 'Blog' }));
```

```fud path=src/routes/blog/[slug].fud
<link rel="layout" href="../../layouts/_layout.fud">
<link rel="server" href="./[slug].fudapi">

<head>
  <title>@data.title</title>
</head>

<h1>@data.title</h1>
<p>@data.body</p>
```

`paths` devuelve los valores del parámetro de la ruta y solo existe en una ruta con parámetros
(`FUD1091`). El handler de `layout` recibe `(ctx, data)`, siendo `data` lo que devolvió `load`.

## Campos `later` y `@await … @catch`

Un campo de `load` que termina en `later` es una promesa que el handler devuelve sin esperar: la página sale
sin él y la vista lo pinta dentro de `@await data.<field>`. Solo campos de `load` (`FUD1324`).

```fudapi path=src/routes/dashboard.fudapi
# The title comes with the first byte; each later field when its promise settles.
load ssr
  title    str
  summary  Summary  later
  alerts   str  later

type Summary
  total   i32
  active  i32
```

```ts path=src/server/routes/dashboard.ts
import { notFound } from '@fudic/http';
import { load } from 'fudic:routes/dashboard';

const after = <T>(ms: number, value: T): Promise<T> => new Promise((resolve) => setTimeout(() => resolve(value), ms));

load.handle(() => ({
  title: 'Dashboard',
  summary: after(2000, { total: 12, active: 9 }),
  alerts: after(3000, null).then(() => {
    throw notFound('the alerts service does not answer');
  }),
}));
```

```fud path=src/routes/dashboard.fud
<link rel="layout" href="../layouts/_layout.fud">
<link rel="server" href="./dashboard.fudapi">

<h1>@data.title</h1>

@await data.summary {
  <p>@data.summary.active of @data.summary.total are active.</p>
}

@await data.alerts {
  <p>@data.alerts</p>
} @catch (e) {
  <p>Could not load the alerts (@e.status @e.title).</p>
}
```

- Dentro de `@await` el campo es el valor; leído en otro sitio (`<p>@data.summary.total</p>` fuera
  del bloque) es `FUD1321`. `@await` sobre cualquier cosa que no sea un campo `later` de `data` es `FUD1320`.
- Solo en el cuerpo de una ruta o de un documento de página, o en una `@section`; nunca en `<head>`, un componente
  ni un layout (`FUD1322`): pasa el valor resuelto a un componente como prop.
- `@catch (e)` es opcional, justo después de la llave (`FUD1323`); `e` tiene `status` y `title`. No hay
  rama de carga. Cada `@await` espera al anterior: pon los lentos al final.
- Si la página existe se decide en `load` antes de que devuelva: después del primer byte, `200`.

## Páginas de error

`_error.fud` no tiene URL ni `load`. Se pinta cuando un `load` lanza, cuando ninguna ruta coincide
y cuando una llamada falla y el middleware `error-pages` (tema fudapi) manda allí al navegador.
Su `data` es `ErrorPage` de `@fudic/http`: `status`, `title`, `path`, y `detail` y `back`
cuando se conocen.

```fud path=src/routes/_error.fud
<link rel="layout" href="../layouts/_layout.fud">

<head>
  <title>Error @data.status</title>
</head>

<h1>@data.status · @data.title</h1>
@if (data.detail !== undefined) {
  <p>@data.detail</p>
}
```

## Llamar al servidor: `task`

Las funciones de un `.fudapi` enlazado están en el `@code` y en la vista por su nombre, sin importarlas:
`await login({ user })`. `task` de `@fudic/core` añade estado, cancelación y orden.

```fudapi path=src/routes/products.fudapi
# Per request: the list changes, and `session` is read from the session cookie.
load ssr
  products  Product[]
  session   str?

# Sets the session cookie; the page asks for its data again, which says who is in.
post login
  invalidates /products
  user  str

get search
  q  str
    max-length 80
  -> Product[]

# A 409 is the page's to paint: `catches` keeps it here.
put save
  catches 409
  fails locked 409 "That product is locked."
  id      i32
  active  bool

type Product
  id      i32
  name    str
  active  bool
```

```ts path=src/server/routes/products.ts
import { setCookie } from '@fudic/http';
import { load, login, save, SaveFails, search, type Product } from 'fudic:routes/products';

let products: readonly Product[] = [{ id: 1, name: 'Coffee', active: true }];

load.handle((ctx) => {
  const session = ctx.cookies.get('sid');
  return { products, ...(session !== undefined ? { session } : {}) };
});

login.handle((ctx) => setCookie(ctx, 'sid', ctx.args.user));

search.handle((ctx) => products.filter((p) => p.name.includes(ctx.args.q)));

save.handle((ctx) => {
  if (ctx.args.id === 1 && !ctx.args.active) throw SaveFails.locked();
  products = products.map((p) => (p.id === ctx.args.id ? { ...p, active: ctx.args.active } : p));
});
```

```fud path=src/routes/products.fud
<link rel="layout" href="../layouts/_layout.fud">
<link rel="server" href="./products.fudapi">

@code {
  import { signal, task } from "@fudic/core";

  const text = signal("");
  const found = task(search, () => ({ q: text() }), { initial: [] });
  const saving = task(save);

  function edit(e: Event) {
    text.set((e.target as HTMLInputElement).value);
  }

  async function turnOff() {
    const result = await saving.run({ id: 1, active: false });
    if (result.ok) text.set("");
  }

  async function signIn() {
    await login({ user: "ana" });
  }
}

<h1>Products</h1>
<p>Signed in: @(data.session === undefined ? "nobody" : data.session)</p>
<button @click=@signIn>Sign in as Ana</button>
<button @click=@turnOff>Turn Coffee off</button>
<ul>
  @foreach (const p of data.products) key (p.id) {
    <li>@p.name</li>
  }
</ul>
<input type="search" aria-label="Search" @input=@edit>
<span role="status">@(found.pending() ? "Searching…" : "")</span>
@foreach (const p of found.value()) key (p.id) {
  <p>Found: @p.name</p>
}
@if (saving.message() !== "") {
  <p role="alert">@saving.message()</p>
}
```

`task(fn, source?, { initial?, mode? })` recibe la función, no una llamada:

- Con `source` llama en cada cambio de las signals que lee `source`; sin él, solo en
  `run(args)`. Nunca al crearse (ni nunca en el servidor): los primeros datos son los de `load`, vía `initial`.
- Un `get` se queda con la última llamada y aborta la que está en curso; los demás verbos hacen cola. `mode: "latest"
  | "queue"` lo cambia.
- Lecturas reactivas: `value()` (la última respuesta, o `initial`), `state()` (`idle`, `pending`, `done`,
  `failed`, `cancelled`), `pending()`, `error()`, `message()` (el texto de `error()`, o `""`).
- `run(args)` nunca rechaza: `{ ok: true, value }`, `{ ok: false, status: "failed", error }` o
  `{ ok: false, status: "cancelled" }`. `cancel()` aborta y descarta lo que espera.
- Un estado que está en el `catches` de la función, o un 422, llega a quien llama (`error()`, `ok: false`).
  Con `error-pages` en la cadena cualquier otro fallo navega fuera (`_error.fud`, o sus
  `routes`) y la task se queda en `pending`. Un texto de `fails` es el del `.fudapi`, en el locale de la página.

## Repintar tras una mutación

Una página solo se repinta cuando su path está en el `invalidates` de la función que llamó (`login`
arriba): el navegador vuelve a pedir `data` al servidor, la página se repinta (filas con key, scroll y
foco conservados, una `signal(data.x)` sembrada de nuevo) y entonces la llamada se resuelve. Si no, nada
se recarga: actualiza tus signals con lo que devolvió la llamada. Una llamada que no es un `get` también descarta
los datos del Service Worker de la página actual. Los paths pueden ser patrones: `invalidates /blog/:slug`.

## La sesión: una cookie

Una cookie `HttpOnly` que solo escribe el código de servidor, como hace `login` arriba; léela con
`ctx.cookies.get(name)` en un `load`, un handler o un middleware.

- `setCookie(ctx, name, value, options?)` escribe `Path=/; HttpOnly; Secure; SameSite=Lax`
  (sin `Secure` en localhost); opciones `maxAge`, `expires`, `path`, `domain`, `sameSite`,
  `secure`, `httpOnly`, `partitioned`. `deleteCookie(ctx, name)` la borra. Las dos funcionan también en un
  `load`, incluso justo antes de un `throw`.
- Una respuesta que leyó la sesión (`ctx.cookies`, o la cabecera `cookie` o `authorization`)
  sale con `Cache-Control: private, no-store` salvo que el handler haya puesto la suya, y el Service
  Worker nunca la guarda: la página cacheada de un usuario nunca le llega a otro.
- Una página prerenderizada cuyo `load` o `layout` lee la sesión es `FUD1300`: escribe `load ssr`.

## Traducciones, en breve

`"locales": ["en", "es"]` y `"site": "https://example.com"` en `fudic.json` construyen cada página
por locale, bajo `/en/…` y `/es/…`; el primero es el idioma del código. Los nodos de texto y
atributos como `title`, `alt` no necesitan marca; un texto dentro de un valor (una prop, un módulo `.ts`)
va en `t()` de `@fudic/i18n`: `.title=@t("About")`. `fudic translate` escribe
`src/locales/<locale>/…json`, textos de `.fudapi` incluidos; rellena cada `translation`.

Comprueba con `fudic_check`. Temas relacionados: view, components, fudapi, testing.
