# SDD-56 — Funciones de servidor y middlewares: `@fudic/http`

> **Estado:** `En curso` — [tareas](./SDD-56-Task.md), 9 / 50.
> **Paquetes:** `@fudic/http` (nuevo) · `@fudic/compiler` · `@fudic/vite` · `@fudic/transport` ·
> `@fudic/di` · `@fudic/ssr` · `@fudic/forms` · `@fudic/conventions` · `@fudic/language-core` ·
> `@fudic/diagnostics`
> **Depende de:** 19 (plugin y endpoint de datos), 20 (Service Worker), 33 y 34 (formularios),
> 38 (inyección), 40 (props de layout), 45 (runtime publicado y podable), 50 (diagnósticos)
> **Rango de diagnósticos:** `FUD1000`–`FUD1019` (nuevo). Retira `FUD0683`, que queda quemado.
>
> **Qué añade en una frase.** Una ruta o un componente exporta funciones de servidor con nombre
> (`export const save = put().use(auth).handle(…)`), el cliente las llama por ese nombre
> (`await save(userForm)`) sin escribir un `fetch`, y las dos mitades pasan por una sola cadena
> de middlewares que el desarrollador compone en tres niveles: global, fichero y función. Un
> formulario sube sin claves (posicional), en binario si todos sus controles tienen tipo, y
> comprimido si el desarrollador lo pide y compensa.

---

## 1. Contexto y objetivo

Hoy una página solo sabe **leer**. `load` trae los datos y la página se pinta, pero nada en
fudic recibe una petición que no sea GET:

- el dev server y `vite preview` dejan pasar todo lo demás con `next()`
  ([plugin.ts:610](../../packages/vite/src/plugin.ts#L610), [plugin.ts:699](../../packages/vite/src/plugin.ts#L699));
- el Service Worker solo atiende GET ([router.ts:521](../../packages/transport/src/router.ts#L521));
- `bindForm` valida y para, pero no envía nada. Su propio comentario dice que el envío será de
  `@fudic/http` ([bind-form.ts:4](../../packages/forms/src/dom/bind-form.ts#L4)), y SDD-34 §7 lo
  aparcó junto con `form:="@Put"`.

Con esta spec, esto es **todo** lo que escribe el desarrollador:

```ts
// src/http.ts: la cadena global, una vez por aplicación
import { chain, csrf, errorPages } from "@fudic/http";
import { log } from "./middlewares/log";

export default chain().use(log, csrf, errorPages);
```

```ts
// src/middlewares/auth.ts: un middleware con sus dos mitades
import { middleware, unauthorized } from "@fudic/http";
import { Tokens } from "../services/tokens";

export const auth = middleware<{ user: User }>()
  .client((ctx, next) => {
    ctx.headers.set("authorization", `Bearer ${localStorage.getItem("token")}`);
    return next(ctx);
  })
  .server(async (ctx, next) => {
    const token = ctx.headers.get("authorization")?.slice(7);
    if (!token) throw unauthorized();
    return next(Object.assign(ctx, { user: await inject(Tokens).verify(token) }));
  });
```

```html
<!-- src/routes/usuarios.fud -->
@code {
  import { userForm } from "../forms/user.form";

  @server {
    import { get, put, del } from "@fudic/http";
    import { auth } from "../middlewares/auth";
    import { audit } from "../middlewares/audit";
    import { Users } from "../services/users";

    export async function load() {
      return { users: await inject(Users).all() };
    }

    export const search = get()
      .args<{ q: string }>()
      .handle((ctx) => inject(Users).find(ctx.args.q));

    export const save = put()
      .use(auth)
      .form(userForm)
      .handle(async (ctx) => {
        await inject(Users).save(ctx.user, ctx.form.$value());
      });

    export const remove = del()
      .use(auth, audit)
      .args<{ id: number }>()
      .handle((ctx) => inject(Users).remove(ctx.args.id));
  }

  @client {
    import { signal } from "@fudic/core";
    const found = signal<User[]>([]);

    async function find(e: Event) {
      found.set(await search({ q: (e.target as HTMLInputElement).value }));
    }
  }
}

<input @input=@find>
<form control=@userForm form:="@save"> … </form>
<button @click=@(() => remove({ id: 7 }))>Borrar</button>
```

```html
<!-- src/routes/_error.fud: la página de error, una vez por aplicación -->
<h1>@data.status</h1>
<p>@data.title</p>
```

El cliente no construye URLs, ni cabeceras, ni `JSON.stringify`, ni `fetch`. El código de
`handle` no llega nunca al navegador. Y los tipos cruzan solos: `found` es `User[]` porque
`search` devuelve lo que devuelve `inject(Users).find`.

**Y el formulario sube sin pagar lo que el servidor ya sabe.** Los dos extremos importan el
mismo `user.form.ts`, así que el nombre de cada campo sobra en el cable: `save(userForm)` envía
`["Pedro","pedro@x.es"]` y no `{"name":"Pedro","email":"pedro@x.es"}`. Si además todos los
controles declaran su tipo (`u16`, `bool`…), sobran también las longitudes y viaja en binario. Y
si el cuerpo pasa del umbral, se comprime. Nada de esto lo escribe el desarrollador, salvo pedir
la compresión. Es lo que diseñaron y midieron las dos specs de
[`docs/forms/`](../forms/SDD-forms-posicional.md), que aquí se implementan.

## 2. Dependencias

| SDD | Qué aporta |
|---|---|
| 19 | El plugin. `analyzePage()` detecta `load`, `paths` y `layout` en el `@server` ([analyze.ts:98](../../packages/vite/src/analyze.ts#L98)). `emitServerModule` copia el `@server` de una ruta tal cual al módulo `?server` ([server.ts:27](../../packages/vite/src/server.ts#L27)). El endpoint de datos `/_fudic/data<patrón>` lo sirve en dev un middleware ([plugin.ts:609](../../packages/vite/src/plugin.ts#L609)) que llama a `loadRouteData` ([serve.ts:130](../../packages/vite/src/serve.ts#L130)). Los chunks de servidor van a `.fudic/edge/`, fuera de `outDir` ([constants.ts:185](../../packages/vite/src/constants.ts#L185)). `eraseServerValidators` borra en el build de cliente el argumento de `serverValidator` ([plugin.ts:1146](../../packages/vite/src/plugin.ts#L1146)). |
| 20 | El Service Worker. `fetchData` pide `{ data, layout }` al endpoint ([router.ts:248](../../packages/transport/src/router.ts#L248)) y nunca ejecuta `load`. `Router.invalidate(pathname)` borra la página y los datos de una URL concreta ([router.ts:615](../../packages/transport/src/router.ts#L615)). El bus de control `BroadcastChannel('fudic')` ya admite `invalidate` ([messages.ts:19](../../packages/transport/src/messages.ts#L19)), pero ninguna página lo envía. |
| 33, 34 | `@fudic/forms`. `FormApi` con `$value`, `$set`, `$validate({ server })`, `$setErrors(errors, summary)` para un 422, `$schema` y `$reset` ([types.ts:224](../../packages/forms/src/types.ts#L224)). `<form control=@f>` emite `bindForm`, que valida en el submit y para con el foco en el resumen ([bind-form.ts:46](../../packages/forms/src/dom/bind-form.ts#L46)). `serverValidator` marca una regla que solo corre en el servidor. Los controles tipados (`u8`…`f64`, `bool`, `date`, `str`, `arr`) ya existen: cada uno lleva su etiqueta `type` («contrato para un transporte») y un chequeo de rango como primera regla ([typed.ts](../../packages/forms/src/typed/typed.ts)). No existen ni `$positional` ni ningún codificador. |
| — | La evidencia de [`docs/forms/`](../forms/): [SDD-forms-posicional](../forms/SDD-forms-posicional.md) (`Listo`: el array posicional, la normalización de `undefined`, la aridad fija, el pipeline de etapas que se saltan y la compresión con umbral de 1 KB, medida) y [SDD-forms-typed-binary](../forms/SDD-forms-typed-binary.md) (el binario tipado, medido). Esta spec las implementa, con la compresión configurada en la cadena (§4.17) y el formato binario cerrado (§4.18). |
| 38 | `@fudic/di`. `inject`/`provide` se reescriben por offset a `injectFrom($ioc, …)` / `provideIn($own, …)` ([oxc-code.ts:1360](../../packages/compiler/src/emit/oxc-code.ts#L1360)). El `@server` de un **componente** se emite dentro de su `render()` ([module.ts:467](../../packages/compiler/src/emit/module.ts#L467)). En el `@server` de una **ruta**, `inject` es `FUD0683` y `load` resuelve con `ctx.inject` ([ioc.ts:100](../../packages/ssr/src/ioc.ts#L100)). |
| 40 | `export function layout(ctx, data)`: el tercer export reservado. El endpoint de datos responde `{ data, layout }` en una sola respuesta. |
| 45 | El runtime se publica en piezas y se descarga por ruta: lo que una página no usa no se descarga. |
| 50 | Un código es un fichero en `packages/diagnostics/src/codes/` con su función tipada y su `.md` en inglés. |

## 3. Interfaz pública

### 3.1. Una función de servidor

Se declara en el `@server` de una ruta o de un componente. **Abre** con el verbo, **se
configura** en el orden en que se escribe y **se cierra** con `.handle`.

```ts
// @fudic/http
export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export function get(): FnBuilder<void, {}>;
export function post(): FnBuilder<void, {}>;
export function put(): FnBuilder<void, {}>;
export function patch(): FnBuilder<void, {}>;
/** `delete` is a reserved word: it cannot be the binding of an import. */
export function del(): FnBuilder<void, {}>;

export interface FnBuilder<A, C extends object> {
  /** Appends middlewares to this function's chain, in this order. */
  use<const M extends readonly AnyMiddleware[]>(...mws: M): FnBuilder<A, C & AddsOf<M>>;
  /** Removes inherited middlewares, by identity. `'*'` removes every inherited one. */
  skip(...mws: readonly AnyMiddleware[]): FnBuilder<A, C>;
  skip(all: '*'): FnBuilder<A, C>;
  /** Declares the type of the arguments the client passes. */
  args<T>(): FnBuilder<T, C>;
  /** The client passes this form; the server validates a fresh copy of it (§4.6). */
  form<F extends Form<Schema>>(form: F): FnBuilder<F, C & { readonly form: F }>;
  /** Concrete paths or route patterns whose cached data this call leaves stale (§4.9). */
  invalidates(...paths: readonly string[]): FnBuilder<A, C>;
  /** Compresses the uploaded body (§4.17). `false` turns off what it inherited. */
  compress(options: CompressOptions | false): FnBuilder<A, C>;
  /** Closes the builder. Without `.handle` there is no function. */
  handle<R>(fn: (ctx: ServerContext<A> & C) => R | Promise<R>): ServerFn<A, Awaited<R>>;
}
```

**Cada llamada devuelve un builder nuevo.** Un builder no se muta, así que se puede guardar una
base y reutilizarla:

```ts
const secured = put().use(auth, audit);

export const save   = secured.form(userForm).handle(async (ctx) => { … });
export const rename = secured.args<{ name: string }>().handle(async (ctx) => { … });
```

`ServerFn<A, R>` es lo que vale el nombre **en el servidor**: un descriptor que no se puede
llamar. En el cliente, el mismo nombre vale `ServerFunction<A, R>` (§3.5).

### 3.2. `load`

`load` es la carga de la página. Se escribe de dos formas, y las dos pasan por la cadena:

```ts
export async function load(ctx) { … }                          // global + fichero
export const load = get().use(auth).handle(async (ctx) => …);  // global + fichero + la suya
```

`load` es siempre GET (`FUD1002`). No se llama desde el cliente: la piden el navegador al
navegar y el Service Worker al endpoint de datos (§4.4). `paths` y `layout` no cambian.

### 3.3. Los tres niveles de la cadena

```ts
// 1. Global: src/http.ts. Si no existe, la cadena global está vacía.
export default chain().use(log, csrf, errorPages);

// 2. Fichero: un export reservado del @server de una ruta o un componente.
//    Afecta a todas sus funciones, `load` incluida.
export const http = chain().skip('*').use(apiKey);

// 3. Función: lo que se escribe en su builder.
export const save = put().use(audit).handle(…);
```

```ts
export function chain(): ChainBuilder;

export interface ChainBuilder {
  use(...mws: readonly AnyMiddleware[]): ChainBuilder;
  skip(...mws: readonly AnyMiddleware[]): ChainBuilder;
  skip(all: '*'): ChainBuilder;
  compress(options: CompressOptions | false): ChainBuilder;
}
```

`compress` no es un paso de la cadena sino un ajuste: en cada función gana el nivel **más
interno** que lo escriba. Sin ninguno, la subida va sin comprimir.

### 3.4. Un middleware

```ts
/** What both sides see. */
export interface BaseContext<A = unknown> {
  readonly side: 'client' | 'server';
  readonly method: Method;
  /** The exported name: `save`, or `load`. */
  readonly name: string;
  readonly url: URL;
  /** Mutable on the client (what is sent); the request's own on the server. */
  readonly headers: Headers;
  readonly args: A;
  readonly signal: AbortSignal;
}

export interface ClientContext<A = unknown> extends BaseContext<A> {
  readonly side: 'client';
}

export interface ServerContext<A = unknown> extends BaseContext<A> {
  readonly side: 'server';
  readonly params: Readonly<Record<string, string>>;
  readonly cookies: ReadonlyMap<string, string>;
  /** What the response carries besides the value: its status and headers (Set-Cookie…). */
  readonly response: { status: number; readonly headers: Headers };
}

export type Next<C> = (ctx: C) => Promise<unknown>;

/**
 * A middleware with its halves, built only by `middleware()`. Opaque: its halves are not
 * fields anyone reads. A missing half does not run on that side.
 */
export interface Middleware<Adds extends object = {}> {
  /** Phantom: what it leaves in `ctx`. Never present at runtime. */
  readonly '~adds'?: Adds;
}

/** A plain function is a middleware that runs on BOTH sides. */
export type SharedMiddleware = (
  ctx: ClientContext | ServerContext,
  next: Next<ClientContext | ServerContext>,
) => unknown;

export type AnyMiddleware = Middleware<object> | SharedMiddleware;

export function middleware<Adds extends object = {}>(): MiddlewareBuilder<Adds>;

export interface MiddlewareBuilder<Adds extends object> extends Middleware<Adds> {
  client(step: (ctx: ClientContext, next: Next<ClientContext>) => unknown): MiddlewareBuilder<Adds>;
  server(step: (ctx: ServerContext, next: Next<ServerContext & Adds>) => unknown): MiddlewareBuilder<Adds>;
}
```

**El middleware es opaco** (decidido al implementar, 2026-10-13). La primera redacción hacía de
`client` y `server` a la vez las mitades (`Middleware`) y los métodos del builder que lo
hereda, y un nombre no puede ser las dos cosas. Un `Middleware` solo se construye con
`middleware()`; `csrf` y `errorPages` también. Cada builder es inmutable, como el de una
función.

**La mitad `.server` nunca sale del servidor.** Es una regla de seguridad, no de tamaño: el
build de cliente borra el argumento de cada `.server(…)` y Rollup se lleva lo que solo él
importaba (§4.5), así que en el navegador `.server` recibe nada y su mitad no existe. Una
función a secas es la única forma de escribir código que corre en los dos lados, y es una
elección explícita del desarrollador.

**`Adds` es lo que el middleware deja en `ctx` para los que vienen detrás.** `auth` declara
`{ user: User }`, su mitad de servidor llama a `next(Object.assign(ctx, { user }))`, y en el
`handle` de una función con `.use(auth)`, `ctx.user` es `User`.

### 3.5. Llamar desde el cliente

En el `@client` y en las expresiones de evento de la plantilla, el nombre de cada función de
servidor del mismo fichero es una función:

```ts
export interface ServerFunction<A, R> {
  (args: A, options?: CallOptions): Promise<R>;
}

export interface CallOptions {
  /** The caller's own cancel. There is no timeout of any kind. */
  readonly signal?: AbortSignal;
  /** A route function's params. Default: the params of the page the browser is on. */
  readonly params?: Readonly<Record<string, string>>;
}
```

Con `A = void` se llama sin argumentos: `await list()`.

**El envío declarativo de un formulario.** `form:=` en un `<form>` que ya tiene `control=`:

```html
<form control=@userForm form:="@save">
```

El submit hace lo que hace hoy `bindForm` (validar, y parar con el foco en el resumen si hay
errores). Si el formulario es válido, llama a `save(userForm)`. Al terminar, el `<form>` emite
uno de dos eventos, que se escuchan como cualquier otro (`@fudic:result=@done`):

| Evento | Cuándo | `detail` |
|---|---|---|
| `fudic:result` | La llamada terminó bien | El valor devuelto |
| `fudic:error` | La llamada lanzó algo que no es un 422 | El error |

Un 422 no emite nada: sus errores van al formulario con `$setErrors` (§4.6).

### 3.6. Errores

```ts
export class HttpError extends Error {
  readonly status: number;
  /** The problem body (RFC 9457) as it came from the server, or as it will go. */
  readonly problem: Problem;
}

export class ValidationError extends HttpError {   // 422
  readonly errors: ErrorMap | null;
  readonly summary: Errors | null;
}

export class Redirect extends HttpError {           // 3xx
  readonly location: string;
}

export interface Problem {
  readonly status: number;
  readonly title: string;
  readonly detail?: string;
  readonly errors?: ErrorMap | null;
  readonly summary?: Errors | null;
  readonly location?: string;
}

export function badRequest(detail?: string): HttpError;      // 400
export function unauthorized(detail?: string): HttpError;    // 401
export function forbidden(detail?: string): HttpError;       // 403
export function notFound(detail?: string): HttpError;        // 404
export function conflict(detail?: string): HttpError;        // 409
export function redirect(location: string, status?: 301 | 302 | 303 | 307 | 308): Redirect; // 303
```

Se **lanzan**: `throw notFound()`. Y se capturan donde el desarrollador decida: con un
`try/catch` alrededor de la llamada, o en un middleware alrededor de `next(ctx)`.

**`errorPages`** es el middleware que fudic trae para el caso general. Lo pone el desarrollador
en la cadena que quiera, o no lo pone (§4.8).

**`_error.fud`** es la página de error: un fichero de `src/routes/` que no tiene URL propia. Su
`data` es `{ status: number; title: string; detail?: string }`.

### 3.7. CSRF

```ts
export const csrf: Middleware;
```

Un middleware más, con sus dos mitades (§4.11). fudic no lo pone en ninguna cadena por su cuenta.

### 3.8. `inject` y `publish` a secas en el servidor

```ts
@server {
  export async function load() {
    publish(LINES, lines);                  // antes: ctx.publish(LINES, lines)
    return { users: await inject(Users).all() };   // antes: ctx.inject(Users)
  }
}
```

`inject` y `publish` funcionan sin `ctx` en todo el código de servidor que corre durante una
petición: `load`, `layout`, un `handle`, la mitad `.server` de un middleware y cualquier función
que estos llamen. **Se retiran `ctx.inject` y `ctx.publish`, el tipo `DiContext` y `FUD0683`.**

```ts
// @fudic/di: the hook the server runtime installs, never the user
export function setAmbient(source: () => Container | undefined): void;
```

### 3.9. Un formulario nuevo con la misma definición

```ts
// @fudic/forms, FormApi<S>
/** A new form with this one's schema, rules and options, in its initial state. */
$fresh(): Form<S>;
```

El servidor no puede validar sobre el `userForm` que exporta el módulo: es uno solo para todas
las peticiones a la vez. `.form(userForm)` usa `userForm.$fresh()` en cada petición.

### 3.10. El cuerpo de subida

**En `@fudic/forms`**, un formulario sabe emitirse y leerse sin claves:

```ts
// FormApi<S>
/** The value without keys: declaration order, a group as its own nested array (§4.17). Tracked. */
readonly $positional: Readable<Positional<S>>;
/** `$set` takes both shapes: an object assigns by key, an array by position. */
$set(v: Value<S> | Positional<S>): void;
```

```ts
// @fudic/forms/wire: one walk over the schema, in both directions
/** Whether every control of the schema declares its type, so the form can travel in binary. */
export function isTyped(schema: Schema): boolean;
export function writeBinary<S extends Schema>(schema: S, value: Positional<S>): Uint8Array;
export function readBinary<S extends Schema>(schema: S, bytes: Uint8Array): Positional<S>;
```

**En `@fudic/http`:**

```ts
export interface CompressOptions {
  readonly format: 'gzip' | 'deflate' | 'deflate-raw';
  /** Bytes of encoded body from which compression is attempted. Default: 1000. */
  readonly min?: number;
}

/** What crosses the pipeline: each stage takes one and returns another (§4.17). */
export interface Payload {
  /** The form, then the array, then the string or the bytes. */
  readonly value: unknown;
  readonly headers: Readonly<Record<string, string>>;
}

export interface Stage {
  readonly name: string;
  /** Runtime capability, evaluated once per process. `false`: the stage does not exist here. */
  supported(): boolean;
  /** Policy, with the concrete payload in front. No side effects. */
  applies(p: Payload, call: { readonly method: Method; readonly compress: CompressOptions | false }): boolean;
  /** Only called when `supported() && applies(…)`. Returning `p` untouched is legitimate. */
  apply(p: Payload): Payload | Promise<Payload>;
}
```

| `content-type` | Cuerpo |
|---|---|
| `application/json` | Unos argumentos que no son un formulario, con sus claves |
| `application/fud` | Un formulario posicional, en JSON |
| `application/fud+bin` | Un formulario posicional, en binario |

Y `content-encoding: gzip | deflate | deflate-raw` cuando se comprimió.

### 3.11. El contrato entre compilador y plugin

Lo que el compilador lee de cada función de servidor, sin ejecutar nada:

```ts
// @fudic/compiler
export interface ServerFnMeta {
  readonly name: string;                 // 'save' | 'load'
  readonly method: Method;
  readonly owner: { readonly kind: 'route'; readonly pattern: string }
               | { readonly kind: 'component'; readonly tag: string };
  /** The function's own chain, in order, as written. */
  readonly steps: readonly ChainStep[];
  /** The identifier given to `.form(…)`, with its import. */
  readonly form?: MiddlewareRef;
  readonly invalidates: readonly string[];
  /** Its own `.compress(…)`, read as a literal; absent when it does not write one. */
  readonly compress?: CompressOptions | false;
  readonly span: Span;
}

export type ChainStep =
  | { readonly kind: 'use'; readonly refs: readonly MiddlewareRef[] }
  | { readonly kind: 'skip'; readonly refs: readonly MiddlewareRef[] }
  | { readonly kind: 'skip-all' };

export interface MiddlewareRef {
  readonly local: string;                // the identifier as written
  /** The module it is imported from, resolved; absent when declared in this `@server`. */
  readonly from?: string;
  readonly imported?: string;
  readonly span: Span;
}

/** One file: its `http` chain and its functions. */
export interface ServerFnTable {
  readonly file: readonly ChainStep[];
  readonly fileCompress?: CompressOptions | false;
  readonly fns: readonly ServerFnMeta[];
}
```

## 4. Comportamiento

### 4.1. La URL de cada función

El desarrollador no la escribe ni la ve. La deriva el compilador:

| Dueño | URL |
|---|---|
| Ruta `/blog/:slug`, función `save` | `/_fudic/fn/r/blog/:slug/save` |
| Componente `user-form`, función `save` | `/_fudic/fn/c/user-form/save` |

La de una ruta lleva los params rellenos: los de la página donde está el navegador, o los de
`options.params`. La de un componente no lleva params, porque el mismo componente vive en muchas
páginas. Un componente que necesita saber de qué recurso se trata lo recibe en los argumentos o
en el formulario; quién es el usuario, en una cookie o en una cabecera.

`/_fudic/fn` es una constante de `@fudic/conventions`, junto a `/_fudic/data`, que hoy está
duplicada en vite y en transport.

### 4.2. Lo que viaja

| | Formato |
|---|---|
| Argumentos de un GET | `?a=` + el JSON de `args`, codificado. Sin argumentos no hay `?a=` |
| Argumentos del resto | El body que sale del pipeline de §4.17: un formulario va posicional, en binario o en JSON; otros argumentos, en JSON con claves. Comprimido si toca |
| Respuesta correcta | 200 con el JSON del valor, o 204 si el valor es `undefined` |
| Respuesta de error | El status, `content-type: application/problem+json` y el `Problem` |

El pipeline solo trabaja en la **subida**. La respuesta va siempre en JSON y sin comprimir desde
fudic; comprimirla es del servidor que la sirve (§7).

### 4.3. La cadena de cada función

Se monta **de fuera hacia dentro**: global, fichero, función. Cada nivel aplica sus pasos en el
orden en que se escribieron:

- **`use(a, b)`** añade al final.
- **`skip(a)`** quita `a` de lo que hay hasta ese punto, por identidad. Si `a` no estaba, no pasa
  nada.
- **`skip('*')`** quita todo lo que hay hasta ese punto.

```ts
// src/http.ts
export default chain().use(log, auth);
// el @server
export const http = chain().skip(auth).use(apiKey);
export const search = get().skip('*').handle(…);
export const save   = put().use(audit).handle(…);
```

| Función | Cadena |
|---|---|
| `search` | (nada) |
| `save` | `log` → `apiKey` → `audit` |
| `load` | `log` → `apiKey` |

**`next(ctx)` devuelve el valor** que devolvió lo de más adentro, y **un error es una
excepción**. Un middleware puede leer el resultado, atrapar el error, cambiarlo, o llamar a
`next` más de una vez. Lo que haga es asunto suyo.

### 4.4. Qué mitad corre en cada lado

Una llamada desde el cliente recorre **la misma cadena** dos veces: las mitades `.client` en el
navegador y las `.server` en el servidor.

```
navegador: log → auth.client → csrf.client → [ red ]
servidor:                                     [ red ] → log → auth.server → csrf.server → audit → handle
```

| Middleware | Navegador | Servidor |
|---|---|---|
| `middleware().client(f)` | `f` | — |
| `middleware().server(g)` | — | `g` |
| `middleware().client(f).server(g)` | `f` | `g` |
| Función a secas | sí | sí |

**`load` solo recorre las mitades de servidor.** Su petición nunca la hace código del usuario:
la hace el navegador al navegar (un documento) o el Service Worker al endpoint de datos. Una
página que exige login lo comprueba por cookie, no por una cabecera que ponga una mitad
`.client`.

### 4.5. El compilador lee la cadena

La cadena se lee **en compilación**, porque el cliente tiene que saber qué mitades `.client`
importar sin ejecutar el `@server`.

- **Lo que se lee.** Un `export const X = <verbo>()…handle(…)`, con cualquier número de `.use`,
  `.skip`, `.args`, `.form`, `.invalidates` y `.compress`. También una base guardada en una
  `const` del mismo `@server` (`const secured = put().use(auth)`) que luego se continúa. Y el
  `export const http`.
- **Lo que no se lee es `FUD1000`.** Un argumento de `.use` que no es un identificador, un
  `.invalidates` que no son strings literales, un `.compress` que no es `false` ni un objeto
  literal, un verbo elegido con un `if` o una cadena que llega de otro módulo. El `.compress` de
  `src/http.ts` no tiene esta restricción: ese fichero lo ejecutan los dos lados.
- **De dónde sale cada middleware.** Si está importado, el cliente importa el mismo módulo. Si
  está declarado en el propio `@server`, es solo de servidor. Declararlo ahí con una mitad
  `.client` es `FUD1007`, porque esa mitad no llegaría nunca al navegador.
- **El build de cliente borra el argumento de `.server(…)`**, igual que ya hace con
  `serverValidator`. Un fichero de middleware puede importar algo de servidor que solo use su
  mitad `.server`, y Rollup se lo lleva del bundle.

Con eso, el chunk de cliente de `usuarios.fud` recibe un stub por función y nada más:

```js
// emitido: nunca lo escribe el desarrollador
import { $fn } from '@fudic/http/client';
import global from '/src/http.ts';
import { auth } from '/src/middlewares/auth.ts';
const save = $fn({ name: 'save', method: 'PUT', url: '/_fudic/fn/r/usuarios/save',
                   chain: [global, [auth]], form: true, invalidates: [] });
```

### 4.6. El servidor

Una petición a `/_fudic/fn/**` o al endpoint de datos se resuelve así:

1. **El contenedor.** Se crea la raíz de inyección de esta petición y todo lo que sigue corre
   dentro de un `AsyncLocalStorage` que la guarda. `inject()` y `publish()` a secas la leen de
   ahí (§3.8). Las dos peticiones concurrentes que motivaron `ctx.inject` en SDD-38 §4.7 tienen
   cada una la suya, aunque haya un `await` de por medio. El Service Worker nunca ejecuta código
   de servidor ([router.ts:245](../../packages/transport/src/router.ts#L245)), así que no
   necesita nada equivalente.
2. **El `ctx`.** `method`, `name`, `url`, `params` (de la URL), `headers`, `cookies` (de la
   cabecera `Cookie`), `args` (el body decodificado según §4.19), `signal` (se aborta si el
   cliente corta) y `response`.
3. **La cadena** (§4.3), con las mitades `.server`.
4. **La validación de `.form(f)`**, justo antes de `handle`:
   1. `const copy = f.$fresh()`;
   2. `copy.$set(args)`, con claves o posicional. Si los argumentos no tienen la forma del
      schema (un campo que falta, una aridad distinta), `$set` lanza y la respuesta es 400;
   3. `await copy.$validate({ server: true })`;
   4. si no valida, la respuesta es `ValidationError`: 422 con `errors` y `summary`;
   5. si valida, `ctx.form` es `copy`.
5. **`handle`.** Su valor es la respuesta (§4.2).
6. **Un error** en cualquier punto:
   - un `HttpError` sale con su status y su `Problem`;
   - cualquier otro sale como 500 con `title: "Internal Server Error"`. En dev además lleva
     el mensaje en `detail` y va al overlay de Vite. En build nunca sale el mensaje.

### 4.7. El cliente

El stub `$fn` hace esto en cada llamada:

1. **Si el argumento es un formulario,** lo valida en el navegador con `$validate()`. Si no
   valida, lanza `ValidationError` sin tocar la red. En el envío declarativo esto ya lo ha hecho
   `bindForm`.
2. **Construye el `ClientContext`:** `url` es la de §4.1 con los params rellenos, `headers` va
   vacío y `signal` es el de `options.signal` o uno que nunca aborta.
3. **Recorre la cadena** con las mitades `.client`. Al final de la cadena está el pipeline del
   cuerpo (§4.17) y después la red: un `fetch` con `ctx.method`, `ctx.headers` más las que
   añadió el pipeline, `ctx.signal`, `credentials: 'same-origin'` y el body que salió del
   pipeline. Los middlewares no ven el cuerpo codificado: ven `ctx.args`.
4. **Decodifica la respuesta.** Un 2xx devuelve el valor. Cualquier otro status lanza
   `HttpError`, `ValidationError` o `Redirect` con el `Problem` que llegó. Un `abort` lanza el
   `AbortError` del navegador, sin envolver.
5. **Invalida** (§4.9) antes de resolver la promesa.

**El envío declarativo.** `form:="@save"` cambia lo que `bindForm` hace cuando el formulario es
válido: en lugar de nada, llama a `save(form)`.

- Un `ValidationError` va a `form.$setErrors(errors, summary)`, con el mismo foco al resumen que
  un error de cliente.
- Cualquier otro error emite `fudic:error`; el éxito emite `fudic:result` (§3.5).

Un `<form>` con `form:=` ya es N3 por SDD-34, así que esto no cambia ninguna promoción.

### 4.8. Errores que llegan a una página

**Al navegar** (documento o endpoint de datos), si `load` o `layout` lanzan:

| Lanzan | Respuesta |
|---|---|
| `Redirect` | El status y la cabecera `Location` |
| `HttpError` | Se pinta `_error.fud` con ese status y su `data`. Sin `_error.fud`, una página mínima con el status y el título |
| Cualquier otro | Igual que un `HttpError` 500. En dev, además, el overlay de Vite |

En el Service Worker, un endpoint de datos que responde con error **no** marca la ruta como
muerta (hoy el `catch` de `render` sí lo hace, [router.ts:313](../../packages/transport/src/router.ts#L313)).
El SW deja la navegación a la red, y el servidor responde con la tabla de arriba.

**En una llamada**, el error lo recibe quien llamó (§4.7). **`errorPages`** es un middleware de
cliente que trae fudic para no repetir lo de siempre:

| Error | `errorPages` |
|---|---|
| `Redirect` | `location.assign(location)` |
| `ValidationError` | Lo relanza: es del formulario |
| `AbortError` | Lo relanza: lo pidió el usuario |
| Otro `HttpError` | `location.assign('/_fudic/error/<status>')`, que el servidor pinta con `_error.fud` |
| Cualquier otro | Igual, con 500 |

`/_fudic/error/:status` lo sirve el mismo servidor que sirve las páginas. Es la única URL de
`_error.fud`: el fichero no entra en la tabla de rutas.

### 4.9. Invalidación de la caché

Después de una llamada correcta que **no** es GET, el stub invalida en el Service Worker:

- la URL de la página donde está el navegador (`location.pathname`), siempre;
- cada entrada de `.invalidates(…)`. Una URL concreta (`/blog`) se invalida tal cual. Un patrón
  (`/blog/:slug`) invalida **todas** las URLs de ese patrón que estén en caché.

Un GET invalida solo lo que diga su `.invalidates`.

**La promesa no resuelve hasta que el SW confirma.** La invalidación viaja por `postMessage` al
SW que controla la página, con un `MessageChannel` de vuelta. Sin esa espera, un
`await save(); location.assign('/usuarios')` podría llegar antes que el borrado y pintar el dato
viejo. Si la página no tiene SW, no hay nada que invalidar y no se espera.

### 4.10. El Service Worker no toca las funciones

Toda petición a `/_fudic/fn/**`, GET incluido, sale del SW sin `respondWith`: no se cachea y no
se intercepta. Una regla de `sw.json` que la capture no aplica. Que el resultado de una llamada
sea cacheable lo decide el desarrollador en sus middlewares.

### 4.11. CSRF

`csrf` cierra el caso de una web ajena que dispara una petición con las cookies del usuario.

- **Mitad `.client`:** pone la cabecera `x-fudic-csrf: 1`.
- **Mitad `.server`:** en todo lo que no es GET, responde 403 si falta esa cabecera, si
  `Sec-Fetch-Site` existe y no es `same-origin`, o si `Origin` existe y no es el del servidor.

Un formulario HTML de otra web no puede poner cabeceras propias, y un `fetch` de otro origen con
una cabecera propia necesita un preflight CORS que el servidor no concede. Por eso basta con la
cabecera: no hay tokens que guardar ni que rotar.

### 4.12. Cancelar

`options.signal` llega a `ctx.signal` en el cliente y de ahí al `fetch`. En el servidor,
`ctx.signal` se aborta cuando el cliente corta la conexión. Un middleware o un `handle` que
quiera dejar de trabajar lo escucha.

**No hay timeouts.** Ni por defecto ni configurables en fudic. Quien quiera uno compone
`AbortSignal.timeout(ms)` en su propio `signal`.

### 4.13. Funciones de servidor en un componente

- **Lo que se emite.** El compilador emite las imports del `@server` y las declaraciones
  `export const X = <verbo>()…` en un módulo `?server` del componente, que hoy está vacío
  ([server.ts:29](../../packages/vite/src/server.ts#L29)). El resto de sentencias del `@server`
  siguen en `render()`, como manda SDD-38.
- **Lo que no puede leer.** Una función de servidor no tiene instancia: no puede leer una
  variable del `@server` que no sea una import u otra función de servidor (`FUD1008`).
- **La inyección.** Resuelve desde la raíz de la petición: los `@Service`. Los `provide` de los
  componentes viven en un render, y una llamada no es un render.
- **Dentro de la declaración** de una función de servidor, el compilador **no** reescribe
  `inject` a `injectFrom($ioc, …)`: usa el ambiente de §4.6. Fuera de ellas, en el `@server` de
  un componente, la reescritura de SDD-38 sigue igual.

### 4.14. Prerender

En el build, `load` recorre su cadena de servidor con un `ctx` sin petición: `GET`, sin
cabeceras, sin cookies y un `signal` que nunca aborta.

Si algo lanza para una URL que `paths()` enumeró, **el build falla** nombrando la URL y el
status. Un sitio estático no tiene cómo servir un 404 ni un `Location`, así que no se escribe una
página que finja serlo. Un `load` con `auth` en una ruta prerenderizada falla por eso mismo, y la
solución es del desarrollador: `.skip(auth)` o no prerenderizar esa ruta.

### 4.15. Lo que deja el build

`.fudic/edge/functions.mjs` exporta la tabla de funciones: URL, método y una función que
recibe una `Request` y devuelve una `Response`, con la cadena ya montada. `vite preview` la
sirve, y es lo que un adaptador montará en producción (§7).

### 4.16. El editor

- **En el `@client` y en las expresiones de evento,** cada función de servidor del fichero tiene
  tipo `ServerFunction<A, R>`, con `A` y `R` tomados de su builder. Ir a la definición lleva a
  su `export const`.
- **En `load(ctx)` sin anotar,** `ctx` es `ServerContext`, con los `params` tipados por el
  nombre del fichero, igual que hoy `$LayoutContext`.
- **En `handle`,** `ctx` es `ServerContext<A> & C`: lo que añadieron sus `.use` y `ctx.form`. Sus
  `params` son `Record<string, string>`; tiparlos desde el nombre del fichero queda fuera (§7).
- **`inject` a secas en el `@server` de una ruta deja de ser un error** en el editor y en el
  build.

### 4.17. El pipeline del cuerpo (cliente)

Lo que hacen las etapas son **transformaciones sucesivas del cuerpo, no middlewares**. Un
middleware decide sobre la petición entera (cabeceras, auth, reintentos); una etapa transforma
la carga y se la pasa a la siguiente. Por eso el pipeline corre **después** de la cadena de
cliente, y ningún middleware necesita saber cómo viaja el cuerpo.

```
ctx.args ─→ positional ─→ binary ─→ json ─→ compress ─→ fetch
```

| Etapa | `supported()` | `applies()` | `apply()` |
|---|---|---|---|
| `positional` | siempre | El verbo lleva body, la función tiene `.form` y el argumento es un formulario | `value` = `$positional()` |
| `binary` | siempre | El valor es posicional, `isTyped($schema)` y el valor es representable (§4.18) | `value` = `writeBinary(…)`, `application/fud+bin` |
| `json` | siempre | El valor no son ya bytes | `value` = `JSON.stringify(…)`: `application/fud` si es posicional, `application/json` si no |
| `compress` | `typeof CompressionStream === 'function'` | `compress` no es `false` y el cuerpo mide al menos `min` bytes | Comprime entero a bytes. Si el resultado **no es menor**, devuelve la carga sin tocar. Si lo es, pone `content-encoding` |

**Regla de degradación.** Una etapa que no puede aplicarse **se salta** y la carga sigue
intacta a la siguiente. Nunca falla la petición ni cambia lo que recibe el `handle`: solo cambia
cuántos bytes viajan. Un navegador sin `CompressionStream`, un cuerpo por debajo del umbral y una
compresión que no gana son la misma rama.

**Cuándo un formulario viaja sin claves:** cuando la función declara `.form`. Es lo que garantiza
que el servidor lo lee con el mismo schema; sin `.form`, el formulario sale como JSON con claves.

**La compresión se pide en la cadena** (`chain().compress(…)` o `.compress(…)` en la función).
Gana el nivel más interno (§3.3), y está apagada si nadie la pide. Con
`{ format: 'deflate-raw', min: 1000 }` se reproduce la decisión medida en `docs/forms`: un
formulario típico (158 B) sale en claro, y uno de 1 550 B sale comprimido. `deflate` es zlib
(RFC 1950), no deflate crudo, y `deflate-raw` vale porque el otro extremo siempre es el nuestro.

**Las normas del posicional**, las de la evidencia sin cambios:

- **Orden de declaración.** `$positional` recorre `Object.keys(schema)` sin las claves `$`. Un
  `control()` es su valor tal cual; un `group()` es un array anidado en su posición.
- **Aridad fija.** Un `false`, un `''` o un `null` ocupan su hueco. Una longitud distinta de la
  del schema en `$set` es `RangeError` y el formulario queda intacto.
- **`undefined` no cruza.** `undefined`, una función o un símbolo pasan a `null` a cualquier
  profundidad, sin mutar el valor del usuario. Una referencia circular es `TypeError` con
  mensaje propio. Lo que no es objeto plano ni array (un `Date`) pasa tal cual. `Map` y `Set` no
  están soportados.

### 4.18. El formato binario

Es el de [SDD-forms-typed-binary](../forms/SDD-forms-typed-binary.md) §3.1, con lo que aquella
spec dejó sin cerrar:

**Cada nivel** (el formulario y cada `group`) se escribe en línea, en su posición, así:

1. **El mapa de nulos.** Un bit por cada control que admite `null` (`u8`…`f64`, `date`, `arr`),
   en orden de declaración, en `⌈k/8⌉` bytes. No existe si el nivel no tiene ninguno. Un bit a 1
   es `null`, y ese control no escribe nada más.
2. **El campo de bits de los `bool`.** Uno por cada `bool`, en orden, en `⌈b/8⌉` bytes. `bool`
   no admite `null`.
3. **Los valores.** Cada control que no es `bool` ni es `null`, en orden de declaración:

| Tipo | Bytes |
|---|---|
| `u8` `i8` · `u16` `i16` · `u32` `i32` | 1 · 2 · 4, little-endian, complemento a dos los `i` |
| `f32` `f64` | 4 · 8, IEEE 754, little-endian |
| `date` | 6: milisegundos desde la época como entero **con signo** de 48 bits (±4 459 años) |
| `str` | Longitud en bytes UTF-8 como varint LEB128, y los bytes |
| `arr` | Número de elementos como varint LEB128, y cada elemento con el ancho de su tipo. Los `bool` de un `arr`, empaquetados de 8 en 8 |
| `group` | Su propio nivel, recursivamente |

**Cuándo no es representable**, y la carga sigue por `json`:

- algún control del schema no tiene tipo;
- un `arr` tiene un `null` entre sus elementos;
- una fecha cae fuera de los 48 bits.

Los rangos de los enteros no se comprueban aquí: un `u8` con 300 ya no pasa la validación de
cliente (su primera regla es su rango), así que nunca llega al pipeline.

**Simetría estricta.** `writeBinary` y `readBinary` son el mismo recorrido en dos sentidos y
viven juntos en `@fudic/forms/wire`. Tocar uno sin el otro es un bug.

### 4.19. El cuerpo en el servidor

`dispatch` deshace el pipeline antes de la cadena de servidor:

1. **`content-encoding`.** Si lo hay, se descomprime con `DecompressionStream`. Un formato que no
   es de los tres de `CompressOptions` responde 415.
2. **`content-type`.**

| `content-type` | `args` |
|---|---|
| `application/json` | `JSON.parse` del body |
| `application/fud` | `JSON.parse` del body: un array posicional |
| `application/fud+bin` | `readBinary(form.$schema, body)`: un array posicional |
| Otro, o un cuerpo posicional en una función sin `.form` | 415 o 400 |

3. **La validación de `.form`** (§4.6 paso 4) recibe ese `args`, y `$set` lo asigna por clave o
   por posición. El `handle` recibe `ctx.form` igual llegue como llegue: **el formato del cable no
   toca la validación**.

## 5. Invariantes

- **El código de `handle` no llega al navegador.** Ni su cuerpo, ni sus imports, ni el
  argumento de una mitad `.server`.
- **Una sola cadena por función,** leída en compilación. El cliente y el servidor ejecutan
  mitades de la misma lista y en el mismo orden.
- **fudic no decide por el desarrollador.** Ningún middleware entra en una cadena si él no lo
  escribe, ni siquiera `csrf` o `errorPages`. Todo lo heredado se puede quitar con `skip`.
- **Un error es una excepción, en los dos lados.** No hay códigos de retorno ni objetos
  `{ ok, error }`.
- **Sin timeouts implícitos.** La única cancelación es la del `signal` del usuario.
- **El estado de una petición no se cruza con el de otra.** El contenedor es por petición y
  viaja en el `AsyncLocalStorage`, nunca en una variable de módulo.
- **El schema es el contrato del cable: orden y tipo.** Nada viaja describiéndose a sí mismo,
  y los dos extremos lo leen del mismo módulo. Reordenar campos o cambiar un tipo es un cambio de
  protocolo; el despliegue conjunto (decisión 13) es lo que lo hace seguro.
- **El cuerpo se transforma, el resultado no cambia.** Una etapa que no aplica se salta, nunca
  falla la petición, y `handle` recibe el mismo `ctx.form` llegue con claves, posicional,
  binario o comprimido. Los middlewares no conocen el formato.
- **Solo la subida.** La respuesta no pasa por el pipeline.
- **El runtime se poda por ruta** (SDD-45). Una página sin funciones de servidor no descarga
  `@fudic/http/client`. Una función sin `.form` no arrastra la validación.
- **El parser no lanza.** Cada regla de §4.5 es un diagnóstico con su span, y el resto del
  fichero se emite.

### Catálogo de diagnósticos

| Código | Cuándo |
|---|---|
| `FUD1000` | La cadena de una función o de `http` no se puede leer en compilación: un `.use` que no es un identificador, un `.invalidates` que no son strings literales, un `.compress` que no es `false` ni un objeto literal (§4.5) |
| `FUD1001` | Un builder de función exportado sin `.handle(…)` |
| `FUD1002` | `load` declarado con un verbo que no es `get()` |
| `FUD1003` | Una función de servidor llamada `paths`, `layout` o `http` |
| `FUD1004` | `export const http` que no es un `chain()…`, o que acaba en `.handle` |
| `FUD1005` | `form:=` nombra algo que no es una función de servidor del fichero |
| `FUD1006` | `form:=` en un elemento que no es un `<form>` con `control=` |
| `FUD1007` | Un middleware declarado en el `@server` con mitad `.client` |
| `FUD1008` | Una función de servidor de un componente lee una variable del `@server` que no es una import ni otra función |
| `FUD1009` | Una función de servidor y una variable del `@client` o de la zona neutra con el mismo nombre |
| `FUD1010` | `_error.fud` declara `load`, `paths` o funciones de servidor |

`FUD1011`–`FUD1019` quedan reservados. `FUD0683` se retira y su número no se reutiliza.

## 6. Criterios de aceptación

**La cadena**

1. `get().use(a).use(b).handle(f)` produce la cadena `a → b → f`, y `chain().use(a, b)` la
   misma que `chain().use(a).use(b)`.
2. Global `use(log, auth)`, fichero `skip(auth).use(apiKey)`, función `use(audit)`: la cadena
   es `log → apiKey → audit`. Con la función `skip('*')`: vacía.
3. `skip(x)` con `x` no heredado no cambia la cadena ni da diagnóstico.
4. Un builder guardado y continuado dos veces da dos funciones independientes: lo que añade una
   no aparece en la otra.
5. `next(ctx)` devuelve el valor de `handle`. Un middleware que lo envuelve en `try/catch` atrapa
   un `notFound()` lanzado en `handle`. Un middleware que llama a `next` dos veces ejecuta
   `handle` dos veces.

**Los dos lados**

6. `middleware().client(f).server(g)` en una función: `f` corre en el navegador y no en el
   servidor; `g` al revés. Una función a secas corre en los dos.
7. El chunk de cliente de una ruta con `save` no contiene el cuerpo de `handle`, ni las imports
   que solo usa `handle`, ni el argumento de ningún `.server(…)`. Se comprueba buscando un
   literal marcado de cada uno en el bundle.
8. Un fichero de middleware que importa `node:crypto` solo dentro de `.server(…)` construye para
   cliente sin ese import.
9. Para `load`, ninguna mitad `.client` se ejecuta: ni al navegar ni en el endpoint de datos.

**El compilador**

10. `ServerFnTable` de un `@server` con `search`, `save`, `remove`, `load` y `http` lista las
    cinco con su método, sus pasos en orden y sus spans.
11. `const secured = put().use(auth); export const save = secured.use(audit).handle(f)` da
    `save` con `use(auth)` y `use(audit)`.
12. Cada `FUD1000`–`FUD1010` del catálogo, con un fichero mínimo que lo provoca, su span y el
    resto del fichero emitido.
13. `inject(Users)` en el `@server` de una ruta no produce ningún diagnóstico, en build ni en
    el editor.

**El servidor**

14. Dos peticiones concurrentes a un `load` con `await` entre dos `inject(Cart)` reciben cada
    una su contenedor. Y lo que publica cada una aparece solo en su respuesta.
15. `ctx.cookies` lee `Cookie: a=1; b=2`. `ctx.response.headers.append('set-cookie', …)` llega a
    la respuesta.
16. `.form(userForm)` con un body válido entrega en `ctx.form` un formulario distinto de
    `userForm`, con el valor enviado. Dos peticiones a la vez no comparten instancia.
17. `.form(userForm)` con un body que no pasa un `serverValidator`: 422, `problem+json`, y
    `errors` con la clave del campo.
18. `.form(userForm)` con un body que no tiene la forma del schema: 400.
19. `throw notFound("x")` en `handle`: 404 con `{ status: 404, title: "Not Found", detail: "x" }`.
    `throw new Error("secreto")` en build: 500 sin `secreto` en el cuerpo. En dev: con él.
20. `handle` que devuelve `undefined`: 204. Que devuelve `{ a: 1 }`: 200 con `{"a":1}`.

**El cliente**

21. `await search({ q: "ana" })` hace `GET /_fudic/fn/r/usuarios/search?a=…` y devuelve lo que
    devolvió `handle`.
22. `await save(form)` con el formulario inválido lanza `ValidationError` sin ninguna petición.
23. Una respuesta 404 rechaza con `HttpError` de status 404, un 422 con `ValidationError` y sus
    `errors`, y un 303 con `Redirect` y su `location`.
24. Abortar el `signal` pasado en `options` rechaza con `AbortError` y aborta el `fetch`. En el
    servidor, `ctx.signal.aborted` pasa a `true`.
25. Una función de ruta sin `options.params` usa los params de la página; con
    `options.params`, esos.
26. `<form control=@userForm form:="@save">`: el submit válido hace un PUT y emite
    `fudic:result` con el valor. Un 422 pinta los errores del servidor en sus campos y en el
    resumen. Un 500 emite `fudic:error`.

**Errores en la página**

27. Un `load` que lanza `notFound()` pinta `_error.fud` con status 404 y `data.status === 404`.
    Sin `_error.fud`, la página mínima con 404.
28. Un `load` que lanza `redirect("/login")` responde 303 con `Location: /login`.
29. Con `errorPages` en la cadena, una llamada que recibe 500 navega a `/_fudic/error/500`, que
    pinta `_error.fud`. Una que recibe 422 o se aborta no navega.
30. En el SW, un endpoint de datos que responde 404 no marca la ruta como muerta: la siguiente
    navegación a otra URL del mismo patrón la renderiza el SW.

**Caché, CSRF y SW**

31. `await save(form)` en `/usuarios`, con los datos de `/usuarios` en caché: al resolver la
    promesa ya no están en caché.
32. `.invalidates('/blog/:slug')` borra los datos de `/blog/a` y `/blog/b`, que estaban en
    caché.
33. Un GET sin `.invalidates` no borra nada.
34. Una petición a `/_fudic/fn/**` no pasa por `respondWith`, aunque haya una regla de `sw.json`
    que la capture.
35. Con `csrf`: un PUT sin `x-fudic-csrf` da 403; con `Sec-Fetch-Site: cross-site`, 403; con
    `Origin` de otro host, 403. Un GET sin cabecera pasa. Una llamada desde el stub pasa.

**Componentes y build**

36. `user-form` con `save` en su `@server`, usado en dos páginas: las dos llaman a
    `/_fudic/fn/c/user-form/save`, y el `handle` resuelve `inject(Users)` desde la raíz.
37. Prerender de una ruta cuyo `load` lanza `notFound()` para un path de `paths()`: el build
    falla nombrando la URL y el 404.
38. `vite preview` sirve las funciones desde `.fudic/edge/functions.mjs`, con los criterios 21,
    23 y 35 repetidos contra él.

**Editor**

39. En el `@client`, `search` tiene el tipo `ServerFunction<{ q: string }, User[]>`, y
    `await search({ q: 1 })` es un error de tipos.
40. En `handle` de una función con `.use(auth)`, `ctx.user` es `User`; sin `.use(auth)`, no
    existe.

**El cuerpo de subida**

41. **Posicional.** `save(postForm)` con `.form(postForm)` y el formulario de blog de
    `docs/forms`: `content-type: application/fud`, el array de
    [SDD-forms-posicional §4.1](../forms/SDD-forms-posicional.md) y ni una clave en el cable. El
    mismo formulario a una función sin `.form` sale como `application/json` con claves.
42. **Ida y vuelta.** Con claves, posicional y binario, `ctx.form.$value()` en el `handle` es
    idéntico al `$value()` que se envió.
43. **Aridad y `undefined`.** Un array posicional con un hueco de menos responde 400 y no llama a
    `handle`. Un control en `undefined` viaja como `null`, a cualquier profundidad, sin mutar el
    valor del usuario. Una referencia circular lanza `TypeError` antes de la red.
44. **Binario por tipo.** Cada tipo de §4.18 sobrevive `writeBinary` → `readBinary`, también
    los extremos de su rango, el `null` de los que lo admiten, una fecha anterior a 1970 y un
    `str` con caracteres fuera del plano básico.
45. **Bits.** 9 `bool` ocupan 2 bytes y el noveno se lee bien. Un nivel con 3 controles que
    admiten `null` paga 1 byte de mapa de nulos, y uno sin ninguno, 0.
46. **Degradación del binario.** Un schema con un control sin tipo, un `arr` con un `null` dentro
    y una fecha fuera de 48 bits salen como `application/fud`, y la llamada termina igual.
47. **La medida.** La línea de pedido y el ticket de 50 líneas de
    [SDD-forms-typed-binary §2](../forms/SDD-forms-typed-binary.md) salen en binario con el
    tamaño medido allí más su mapa de nulos. El test escribe los dos números.
48. **Compresión.** Con `compress({ format: 'deflate-raw', min: 1000 })`, el formulario de 158 B
    sale en claro y sin `content-encoding`; el de 1 550 B sale comprimido y el servidor lo lee
    igual. Un cuerpo de más de `min` que no comprime sale en claro.
49. **Niveles de la compresión.** Global con `compress(…)` y una función con `.compress(false)`:
    esa función sube en claro y las demás comprimidas. Solo en la función: solo ella comprime.
50. **Sin `CompressionStream`.** Con la API borrada del entorno, la llamada sale en claro y
    termina igual.
51. **El servidor.** Un `content-encoding: br` responde 415. Un `application/fud` a una función
    sin `.form` responde 400.
52. **Los middlewares no ven el cuerpo.** Un middleware de cliente lee `ctx.args` como el
    formulario y nunca bytes, comprima o no la subida.

**Migración**

53. `examples/basic` deja de usar `ctx.inject`, `ctx.publish` y `DiContext`, y sigue
    funcionando igual en el navegador.
54. `examples/basic` tiene una ruta con `search`, `save` y `remove`, un `user-form` con su
    `save`, `src/http.ts` con `csrf` y `errorPages`, y `_error.fud`. Un formulario con todos sus
    controles tipados sube en binario, y Pedro lo ve en la pestaña Network. Pedro prueba todo en
    el navegador.

## 7. Fuera de alcance

- **Adaptadores de producción** (Node, edge…). Esta spec deja `functions.mjs`, y montarlo en un
  servidor real es la siguiente.
- **La respuesta.** No pasa por el pipeline: va en JSON, y comprimirla es del servidor que la
  sirve.
- **Ficheros (`File`) y streaming.** Un `File` no es JSON ni cabe en el binario; necesita
  `multipart/form-data` y es otra spec.
- **Sustituir el pipeline** por uno propio o añadirle etapas (cifrado, otros formatos).
- **`Map` y `Set`** como valor de un control. `Date` en un `control()` sin tipo pasa por su
  `toJSON`, y su ida y vuelta es del desarrollador; con `date()` viaja tipado.
- **Sin conexión:** encolar llamadas cuando no hay red. Otra fase.
- **Llamar a la función de otro fichero** (`import { put } from "../blog/[slug].fud"`).
- **Pasar una función de servidor como prop** a un componente (`<user-form .send=@save>`).
- **Llamar a una función de servidor desde el servidor.** Descartado: para compartir lógica entre
  `load` y una función, se escribe una función normal que llaman las dos.
- **Tipar los `params` dentro de `handle`** desde el nombre del fichero.
- **Versiones distintas de cliente y servidor.** El build los saca juntos.

## 8. Decisiones

Tomadas con Pedro el 2026-10-13, antes de redactar:

1. **Funciones con nombre, el verbo como builder.** Varias funciones del mismo verbo en un
   fichero obligan a separar nombre y verbo. El cliente las llama por el nombre.
2. **Fluent en el servidor**, no un callback con un objeto de opciones.
3. **`load` queda reservado para la carga y pasa por la cadena.**
4. **Middlewares con dos mitades**, una sola cadena leída en compilación, y tres niveles con
   `use` y `skip` en todos. `skip` se queda: quitar es tan del desarrollador como poner.
5. **Opt-in.** Nada global por defecto; si el desarrollador olvida un `use`, es suyo.
6. **Una llamada que falla lanza,** y el desarrollador decide dónde lo atrapa.
7. **`.use` amplía el tipo de `ctx`.**
8. **Leer la respuesta después de `next` es del desarrollador.** fudic garantiza que `next`
   devuelve el valor y que el error se propaga.
9. **Una mutación invalida la caché.**
10. **`csrf` se implementa,** como middleware que el desarrollador pone.
11. **Cancelación por `AbortSignal` del usuario,** sin timeouts.
12. **`inject` y `publish` sin `ctx`.**
13. **Fuera:** llamadas servidor → servidor, versiones y sin conexión. Cliente y servidor salen
    del mismo build.
14. **El posicional y el binario entran en esta spec,** como diseñaron y midieron las specs de
    `docs/forms/`.
15. **La compresión es solo de subida** (así se pensó, para el cliente) **y se configura en los
    tres niveles.**
16. **El binario cierra lo que su spec dejó abierto** (§4.18): un mapa de nulos por nivel para los
    controles que admiten `null` (1 byte por cada 8), `date` con signo en 48 bits para que quepan
    fechas anteriores a 1970, y varint LEB128 para las longitudes de `str` y `arr`.

### 8.1. Tomadas al redactar

Aceptadas por Pedro sin cambios el 2026-10-13:

1. **`AsyncLocalStorage` para `inject` a secas** (§4.6). Reescribir en compilación con el
   contenedor como parámetro oculto no cubriría una función auxiliar del `@server` que llama a
   `inject` fuera de `load` (`const find = (q) => inject(Users).find(q)`); el ambiente sí. Node,
   Deno, Bun y Cloudflare tienen `AsyncLocalStorage`.
2. **`.args<T>()`** para tipar los argumentos. Sin él, `ctx.args` es `unknown`.
3. **`form:=` y los eventos `fudic:result` / `fudic:error`** (§3.5). `form:=` es el nombre que
   SDD-34 §7 aparcó. Los eventos son lo mínimo para que la vista sepa que el envío terminó.
4. **`$fresh()` en `@fudic/forms`** (§3.9): el servidor necesita una instancia por petición.
5. **`_error.fud` en `src/routes/`, con `/_fudic/error/:status` como su única URL** (§4.8).
6. **El prerender falla** si `load` lanza para un path de `paths()` (§4.14).
7. **La invalidación espera la confirmación del SW** (§4.9).
8. **`csrf` sin tokens,** con cabecera propia más `Sec-Fetch-Site` y `Origin` (§4.11).
9. **`load` solo recorre mitades de servidor** (§4.4). Es un hecho más que una decisión: la
   petición de `load` nunca la hace código del usuario, así que la auth de una página va por
   cookie.
