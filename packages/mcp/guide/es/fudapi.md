# fudapi

El lenguaje `.fudapi`: el contrato de servidor de una ruta o de un componente, lo que fudic genera a partir de él y lo que escribes tú.

## Tres ficheros por pieza

- `src/routes/people.fud`: la vista. Enlaza su contrato con `<link rel="server" href="./people.fudapi">`.
- `src/routes/people.fudapi`: el contrato (`load`, funciones, tipos, formularios). Solo declara; nunca contiene código.
- `src/server/routes/people.ts`: los handlers, unidos con `.handle(...)`, en cualquier lugar bajo
  `src/server` (que nunca llega al navegador). fudic es un BFF: un handler traduce entre
  el contrato y tu backend; nunca es el backend. Las mitades de navegador van en `src/browser`.
- A partir de `src/<id>.fudapi` fudic genera el módulo `fudic:<id>` (`fudic:routes/people`,
  `fudic:routes/blog/[slug]`) y sus tipos en `.fudic/api/<id>.d.ts`; nunca los edites.
- Una función sin handler responde `404` (en dev, `detail` dice qué falta). Una pieza
  implementada dos veces o en la carpeta equivocada detiene el build; una firma incorrecta es un error de TS.

`fudic_generate { kind: "api" }` sobre una ruta o un componente existentes escribe el `.fudapi` (un
`load` con `title  str` para una ruta, `get hello  -> str` para un componente), su handler en
`src/server/<id>.ts`, el `<link rel="server">` en el `.fud`, y añade `@fudic/http` al
proyecto. `fudic_contract { id: "routes/people" }` lista lo que un contrato te pide implementar.

## La sintaxis

- Una declaración por línea, las cláusulas debajo, **2 espacios** por nivel (nunca tabuladores). Comentarios con `#`;
  las líneas `#` justo encima de una declaración la documentan. Strings: comillas dobles, en una línea.
- Funciones, campos, argumentos y formularios son identificadores (`searchJson`); `type` y `enum` van en
  PascalCase; reglas, middlewares, patterns y códigos de `fails` van en kebab-case (`email-taken`,
  `emailTaken` en TypeScript).
- `type`, `enum`, `form`, `rule`, `middleware`, `pattern` y `messages` pertenecen al proyecto:
  todo `.fudapi` los ve sin imports. Declarado dos veces es `FUD1081`; desconocido, `FUD1080`.
  Las funciones, `load`, `paths`, `layout` y `chain` pertenecen a su fichero.
- Un fichero es un contrato (`load`, `paths`, `layout`, funciones, `chain`, `form`, `type`, `enum`,
  `messages`) o extensiones (`rule`, `middleware`, `pattern` y los tipos que usan); mezclarlos es
  `FUD1078`.

## Tipos

| Escribe | TypeScript |
|---|---|
| `str`, `bool` | `string`, `boolean` |
| `u8 i8 u16 i16 u32 i32 f32 f64` | `number`, comprobado según su anchura |
| `date` / `uuid` / `html` | `Date` / `string` comprobado como UUID / `TrustedHTML` que viaja como texto |
| `T[]` / `T?` | `readonly T[]` / un campo opcional |
| `map K V` (`K`: `str`, `uuid` o un entero) | `Readonly<Record<K, V>>` |
| el nombre de un `type` o `enum` | su interfaz o su unión de literales |

`number` no existe (`FUD1080`). Un `type` o `enum` vacío es `FUD1073`. Los valores se comprueban
en ambos extremos: uno incorrecto es un `400` en el servidor y se rechaza en el navegador antes de enviarse.

## Un contrato

```fudapi path=src/routes/people.fudapi
# Per request: the list changes with every new person.
load ssr
  people  Person[]

# Public. A longer text is refused in the browser, before it leaves.
get search
  q  str
    min-length 2
    max-length 80  "Search with 80 characters at most."
  -> Person[]

# Turns a person on or off. The id travels in the URL, notify in the query string.
put save /:id
  use auth
  catches 409
  fails locked 409 "An admin cannot be turned off."
  query notify  bool
  id      i32
  active  bool

# Removes a person. A 409 here is not caught: error-pages takes the page to _error.fud.
delete remove /:id
  use auth
  id  i32

# Signs a person up with personForm, which keeps its 400, 409 and 422 and paints them.
post create
  use auth
  form personForm
  fails reserved 409 "That name is reserved."
  invalidates /people
  -> Person

type Person
  id      i32
  name    str
  email   str
  age     u8
  active  bool
  role    Role

enum Role
  admin
  member
```

```fud path=src/routes/people.fud
<link rel="layout" href="../layouts/_layout.fud">
<link rel="server" href="./people.fudapi">

<h1>People</h1>
<ul>
  @foreach (const p of data.people) key (p.id) {
    <li>@p.name</li>
  }
</ul>
```

Una función es `get`, `post`, `put`, `patch` o `delete`, un nombre y una ruta opcional (`/:id`,
`/:id/lines/:line`). Sus líneas, en cualquier orden:

| Línea | Significado |
|---|---|
| `<arg>  <type>` | un argumento: en la URL cuando la ruta lo nombra (`ctx.params`), si no en el body (`ctx.args`; el query string en un `get`) |
| `query <arg>  <type>` | un argumento en el query string (`ctx.query`) |
| `form <form>` | el body es ese formulario (`ctx.form`); junto con argumentos de body, `FUD1072` |
| `-> <type>` | lo que devuelve; sin ella, nada (`204`) |
| `use <mw>+` / `skip <mw>+` / `skip *` | middlewares, más abajo |
| `catches <status>+` | estos status llegan al llamante en lugar de a `error-pages` |
| `fails <code> <status> "<text>"` | un fallo con nombre que lanza el handler |
| `invalidates <path>+` | páginas cuyos datos quedan obsoletos tras la llamada; la actual, si está entre ellas, se repinta |
| `compress <format> [<min>]` / `compress off` | compresión del body a partir de `<min>` bytes: `gzip`, `deflate`, `deflate-raw` |

- Los argumentos de ruta y de query son escalares (`FUD1101`); un `:x` sin argumento `x` es `FUD1099`.
  El navegador hace una sola llamada, `save({ id, notify, active })`; con solo un formulario, `create(form)`.
- Reglas bajo un argumento: `required`, `min`, `max`, `min-length`, `max-length`, `pattern`, cada una
  con un texto opcional. Son las reglas de `@fudic/forms`: un proyecto sin él da
  `FUD1080` (regla desconocida) hasta que se añade con `fudic_add { module: "forms" }`. Se comprueban en el navegador antes de enviar y de nuevo en el servidor: un `400`
  cuyo `detail` es el texto. Las reglas del proyecto son solo para formularios: comprueba el resto en el handler.
- `load`, `paths` y `layout` van solo en el `.fudapi` junto a una ruta (`FUD1090`): topic pages.

## Lo que escribes tú: handlers

```ts path=src/server/routes/people.ts
import { conflict, notFound } from '@fudic/http';
import { create, CreateFails, load, remove, save, SaveFails, search, type Person, type SearchHandler } from 'fudic:routes/people';

let people: readonly Person[] = [
  { id: 1, name: 'Ana', email: 'ana@example.com', age: 34, active: true, role: 'admin' },
  { id: 2, name: 'Luis', email: 'luis@example.com', age: 29, active: true, role: 'member' },
];

export const find = ((ctx) => people.filter((p) => p.name.includes(ctx.args.q))) satisfies SearchHandler;

load.handle(() => ({ people }));
search.handle(find);

save.handle((ctx) => {
  const person = people.find((p) => p.id === ctx.params.id);
  if (person === undefined) throw notFound(`Nobody has the id ${String(ctx.params.id)}.`);
  if (person.role === 'admin' && !ctx.args.active) throw SaveFails.locked();
  people = people.map((p) => (p.id === person.id ? { ...p, active: ctx.args.active } : p));
  if (ctx.query.notify) console.info(`[people] ${ctx.user.name} changed ${person.name}`);
});

remove.handle((ctx) => {
  if (people.some((p) => p.id === ctx.params.id && p.role === 'admin')) throw conflict('An admin cannot be removed.');
  people = people.filter((p) => p.id !== ctx.params.id);
});

create.handle((ctx) => {
  const value = ctx.form.$value();
  if (value.name.trim().toLowerCase() === 'admin') throw CreateFails.reserved();
  const person: Person = { id: people.length + 1, name: value.name, email: value.email, age: value.age, active: true, role: 'member' };
  people = [...people, person];
  return person;
});
```

- Cada declaración se exporta "hasta `.handle`": `x.handle(fn)` registra el handler y
  no devuelve nada. `<Name>Handler` es su tipo, `<Name>Fails` sus `fails`.
- `ctx` se tipa a partir de la declaración: `params` (los parámetros de la página y la ruta de la
  función), `query`, `args` o `form`, lo que cada middleware usado con `use` añade con `adds` (`ctx.user`), y
  `cookies`, `headers`, `url`, `signal`, `response` (`status`, `headers`).
- Para fallar, lanza `badRequest`, `unauthorized`, `forbidden`, `notFound`, `conflict` (cada uno con
  un `detail` opcional) o `redirect(location)` de `@fudic/http`, o un fallo declarado,
  `SaveFails.locked()`. El body es un problem (RFC 9457).
- Un `fails` envía su status y su código (y su texto de origen como `detail`, para un cliente que no
  es una página); una página fudic muestra el texto del `.fudapi` en su propio idioma. Sin `catches` un
  error va a `error-pages`; con él, al llamante: `task(save).message()` (topic pages).
  `inject` y `publish` de `@fudic/di` funcionan en cualquier handler sin `ctx`.

## Formularios

```fudapi path=src/forms/person.fudapi
# The sign-up form: validated in the browser, and again on the server before the handler.
form personForm
  validate-on blur input
  name  str = ""
    required             "Write the name."
  email  str = ""
    required             "Write the email."
    pattern email-loose  "That email does not look right."
    email-taken          "Somebody already uses that email."
  age  u8
    required             "Write the age."
    min 18               "At least {n} years."
  password  str = ""
    min-length 8         "At least {n} characters."
  repeat  str = ""
    required             "Repeat the password."

  summary
    require mismatch  password == repeat  "The passwords do not match."
```

- Un campo es `<name>  <type> [= <initial>]` con sus reglas debajo; `<name>  group` anida campos.
  Sin `= value` empieza en `""`, `false`, `null` o `[]`. `required` hace que el valor validado sea
  no nulo: `ctx.form.$value().age` es un `number`.
- Reglas incorporadas: `required`, `min n`, `max n`, `min-length n`, `max-length n`, `pattern <name>`,
  de `@fudic/forms` (`fudic_generate { kind: "form" }` lo añade). Los textos son plantillas (`{n}` es el parámetro). Una regla que no corresponde al tipo del campo es `FUD1083`.
- `summary` contiene las reglas propias del formulario: `require <code> <expression> "<text>"` con rutas de campos
  (`access.key`), literales, `== != < <= > >=`, `and or not`, `contains`, `valid f`, `empty f`,
  `length f` y paréntesis, ejecutadas en ambos lados; `when <expression>` agrupa `require`s. Opciones:
  `validate-on submit|blur|input`, `validity rules|interacted`, `catches` (por defecto 400 409 422).
- Un formulario llega a la vista de todo `.fud` que enlaza un `.fudapi` cuya función lo usa, por su
  nombre: `<form control=@personForm form:=@create>`. Enlazarlo es el topic view.

## Ficheros

```fudapi path=src/components/app-photo/app-photo.fudapi
# A photo: up with a form, back as a link an <img> paints.
put upload
  form photoForm
  -> Photo

get photo
  id  i32
  -> file?

form photoForm
  title  str = ""
  photo  file
    required                        "Choose a photo."
    accept "image/png, image/jpeg"  "A PNG or a JPEG."
    max-size 2mb                    "At most {n}."

type Photo
  id     i32
  title  str
```

```ts path=src/server/components/app-photo/app-photo.ts
import { photo, upload } from 'fudic:components/app-photo/app-photo';

const photos = new Map<number, File>();

upload.handle(async (ctx) => {
  // A File, its type and size already checked. It lives while the handler runs: keep its bytes.
  const { title, photo: chosen } = ctx.form.$value();
  const id = photos.size + 1;
  photos.set(id, new File([await chosen.arrayBuffer()], chosen.name, { type: chosen.type }));
  return { id, title };
});

photo.handle((ctx) => photos.get(ctx.args.id));
```

```fud path=src/components/app-photo/app-photo.fud
<link rel="server" href="./app-photo.fudapi">

@code {
  /** Uploads a photo with its bar, and shows it once saved. */
  import { signal } from "@fudic/core";
  import type { Photo } from "fudic:components/app-photo/app-photo";

  const saved = signal<Photo[]>([]);

  function done(p: Photo) {
    saved.set([p]);
    photoForm.$reset();
  }

  function cancel() {
    photoForm.$cancel();
  }
}

<app-photo>
  <template shadowrootmode="open">
    <form control=@photoForm form:=@upload @fudic:result=@done>
      <label for="title">Title</label>
      <input id="title" control=@photoForm.title>
      <label for="photo">Photo</label>
      <input id="photo" type="file" control=@photoForm.photo>
      <small error=@photoForm.photo></small>
      @if (photoForm.$progress() !== null) {
        <progress aria-label="Uploading" value=@(photoForm.$progress()?.loaded) max=@(photoForm.$progress()?.total)></progress>
        <button type="button" @click=@cancel>Cancel</button>
      }
      <button>Upload</button>
    </form>
    @foreach (const p of saved()) key (p.id) {
      <img src=@photo.url({ id: p.id }) alt=@p.title>
    }
  </template>
</app-photo>
```

- `file`, `file?` y `file[]` son el `File` de la plataforma: `File`, `File | undefined`,
  `readonly File[]`; en un formulario `File | null` (`File` con `required`) y `readonly File[]`.
- Dónde: un argumento de cuerpo de `post`, `put`, `patch`, `delete`; un campo de formulario; el
  `->` de cualquier función; un `type` que solo se usa ahí. En los argumentos de una `get` (viajan
  en la URL) es `FUD1480`; en `load`, `layout` o `paths`, `FUD1481`; `= valor` en él, `FUD1482`;
  un parámetro de `rule` o de `fails`, `FUD1483`.
- Reglas: `max-size n` con `kb`, `mb`, `gb` (base 1024; en un `file[]`, cada fichero) y
  `accept "<tipos>"` con la sintaxis del atributo HTML (`image/png`, `image/*`, `.pdf`). En un
  `file[]`, `min-length` / `max-length` cuentan ficheros y `required` rechaza `[]`. Corren en el
  navegador al elegir, y otra vez en el servidor mientras lee.
- En el cable, una función que puede llevar un fichero es siempre `multipart/form-data`: primero
  `$args`, el resto de argumentos en el formato de la función, y luego cada fichero con su camino
  por nombre (`photo`, `docs.0`, `doc.attachment`). Desde fuera, contra una función `use json`:
  `curl -X PUT -H 'x-fudic-csrf: 1' -F '$args=@args.json;type=application/json' -F photo=@yo.png <url>`
  (la cabecera solo si su cadena usa `csrf`). Una llamada multipart de otro sitio es un `403`.
- Límites: 10 MB por fichero salvo que su campo diga `max-size`, 20 ficheros, 1 MB de `$args`; se
  cambian en `fudic.json`: `"serve": { "uploads": { "maxFileSize": "50mb", "maxFiles": 10, "maxArgs": "1mb" } }`.
  Pasado uno, un `413` que nombra el campo, antes de leer el resto.
- `-> file` responde con el fichero como cuerpo: su tipo, su nombre, su tamaño. Un `-> file?` que
  devuelve `undefined` es un `204`. Un `type` que lleva ficheros vuelve entero como multipart.
- Toda `get` tiene `url(args)`, para un `href` o un `src`: `<img src=@photo.url({ id: p.id })>`,
  `<a href=@report.url() download>`. El navegador la pide sin script.

## Reglas y patterns

```fudapi path=src/rules/people.fudapi
# The email belongs to somebody already. Only on the server: it reads the people table.
rule email-taken
  on field str
  runs server
  async
  fails email-taken

# Something, an at sign, something, a dot and something.
pattern email-loose  [^@\s]+@[^@\s]+\.[^@\s]+
```

```ts path=src/server/rules.ts
import { emailTaken } from 'fudic:rules/people';
const taken = new Set(['ana@example.com']);
emailTaken.check(async (value) => !taken.has(value));
```

- `on field <type>+` (`*` cualquier tipo, `*[]` cualquier lista), `on group` u `on form`; parámetros como
  líneas `<name>  <type>`; uno o más `fails <code> [<param>]+`. `runs server`: `.check` va en
  `src/server`; `runs both`: en `src/browser`, ejecutada en ambos lados. `.check` devuelve `true` para un
  valor válido (con varios `fails`, `true` o el código que falla).
- `pattern <name>  <regex>`: el resto de la línea (`#` incluido), que debe coincidir entero; `""` pasa. `email` viene incorporado.

```fudapi path=src/rules/aliases.fudapi
# The alias is taken. The browser asks the server while the user types; the submit checks it again.
rule alias-taken
  on field str
  runs remote
  debounce 300
  fails alias-taken
```

- `runs remote`: `.check` va en `src/server`, como con `runs server`, y el navegador la pregunta
  mientras se escribe — `POST /_fudic/rule/<id>/<name>` con el valor que la regla vigila y los
  parámetros de ese uso, nunca el formulario entero; en binario, en JSON con `use json`.
  `debounce <ms>` (300 si no se escribe) es la espera tras el último cambio; `async` va implícito.
  Una pregunta que falla (red, 401, 429, 500) pasa como válida: el envío vuelve a ejecutar la regla
  en el servidor. En la vista, `personForm.alias.pending()` (y `$pending()` del formulario) es
  `true` hasta que contesta.
- Una regla `runs server` o `runs remote` admite `use` y `skip` como una función (`FUD1461` en una
  `runs both`). Corren alrededor de su check al enviar y al preguntar, y su `.check` recibe un
  tercer argumento, `ctx`, con lo que añaden: `(value, params, ctx) => …` lee `ctx.user` tras
  `use auth`.
- **Ojo con lo que cuenta una regla remota.** Un endpoint que contesta «¿existe este email?» le dice
  a cualquiera quién está registrado. Si importa, ponle un middleware (`use rate-limit`, escrito por
  ti).

## Middlewares y la cadena

```fudapi path=src/middlewares/auth.fudapi
# Who is calling. The session travels in a cookie the browser sends on its own: no client half.
middleware auth
  server
  adds
    user  User

type User
  name  str
```

```ts path=src/server/auth.ts
import { unauthorized } from '@fudic/http';
import { auth } from 'fudic:middlewares/auth';

auth.server((ctx, next) => {
  const session = ctx.cookies.get('sid');
  if (session === undefined || session === '') throw unauthorized('no session');
  return next(Object.assign(ctx, { user: { name: session } }));
});
```

```fudapi path=src/http.fudapi
# The global chain: every function of the app walks it, load included.
chain
  use csrf
  use error-pages
    routes  401 /
```

- Un middleware tiene `client` (`.client` en `src/browser`), `server` (`.server` en `src/server`)
  o ambos; parámetros como líneas `<name>  <type>`; `adds` tipa el `ctx` de todo handler que
  lo usa; `fails` como en una función. Una mitad llama a `next(ctx)` para continuar.
- Tres niveles, de fuera hacia dentro: `chain` en `src/http.fudapi` (la app), `chain` en otro fichero de
  contrato (ese fichero), `use` / `skip` en una función. Un `chain` por fichero. `skip x` de un middleware
  que la función no hereda es `FUD1086`. Los parámetros van en líneas bajo el `use`
  (`FUD1087`): `routes  401 /` envía un 401 a `/`.
- Incorporados con `@fudic/http`: `csrf` (rechaza una llamada que la página de otro sitio hace con las
  cookies del usuario), `error-pages` (un error que nadie capturó va a `_error.fud`, o a sus `routes`) y
  `json`. `fudic add http` escribe un `src/http.fudapi` con `use csrf`.
- Las llamadas viajan en binario. `use json` hace que una función hable JSON (`application/json`) para un
  cliente que no es una página fudic; en un `chain`, `skip json` donde se quiera binario.

## Las funciones de un componente

```fudapi path=src/components/app-hello.fudapi
# The server functions of the component: their handlers are in src/server/components/app-hello.ts.
get hello
  -> str
```

```ts path=src/server/components/app-hello.ts
import { hello } from 'fudic:components/app-hello';
hello.handle(() => 'Hello from the server');
```

- `<link rel="server" href="./app-hello.fudapi">` va al principio del componente o de la ruta,
  antes de `@code`; se admiten varios. Un fichero que no existe es `FUD1111`; en un layout o un snippet,
  `FUD1112`. Un componente no puede enlazar un fichero con `load`, `paths` o `layout` (`FUD1114`), ni una
  ruta el `load` de otra ruta (`FUD1115`). `@server` / `@client` en `@code` es `FUD1110`.
- Un enlace trae a `@code` y a la vista, sin importar: `data` (el `load` de una ruta), cada función por
  su nombre (`await hello()`, `task(hello)`) y los formularios. Los tipos se importan: `import type { Person }
  from "fudic:routes/people"`.

## Pipes

```fudapi path=src/pipes/truncate.fudapi
# Cuts a text at `max` characters.
pipe truncate
  on str
  max u32
```

```ts path=src/pipes/truncate.ts
import { truncate } from 'fudic:pipes/truncate';
export default truncate.implement((value, { max }) => (value.length <= max ? value : `${value.slice(0, max)}…`));
```

Un pipe formatea un valor como texto y vive en `src/pipes`. `on` nombra el tipo o los tipos que acepta
(sin él, `FUD1340`); las líneas de debajo son sus parámetros. Una vista importa el `.ts`, fija los
parámetros en `@code` (`const short = truncate({ max: 40 });`) y escribe `@(post.summary | short)`.

## Mensajes y traducción

```fudapi path=src/forms/messages.fudapi
# The texts of the project, by error code.
messages
  required  "This field is required."
```

Un `messages` por proyecto (`FUD1096`), un `<code>  "<text>"` por línea. Con varios locales,
`fudic translate` extrae los textos del `.fudapi` bajo los campos de formulario, de `require`, de `range` y
de cada `fails`, con clave por posición (`personForm.age.min`, `save.locked`), y el módulo de cada locale
lleva los suyos. Un bloque `messages` no se extrae: escribe los textos bajo cada campo.

```fudapi broken=FUD1360 path=src/routes/people.fudapi
load ssr
  fails missing 404 "Nobody here."
  people  Person[]
```

`fails` nunca va bajo `load`: lanza desde su handler. Comprueba un contrato con `fudic_check`;
`fudic_symbols` y `fudic_describe` dicen qué es un nombre. Topics: pages, view, components, testing.
