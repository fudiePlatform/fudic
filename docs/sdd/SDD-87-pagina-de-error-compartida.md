# SDD-87 — Una página de error compartida entre apps, y el `base` en el navegador

> **Estado:** `Listo` (2026-11-16) — [tareas](./SDD-87-Task.md).
> **Paquetes:** `@fudic/resolve` · `@fudic/http` · `@fudic/forms` · `@fudic/api` · `@fudic/server` ·
> `@fudic/vite` · `@fudic/testing` · `@fudic/language-core` · `@fudic/typecheck` ·
> `@fudic/language-server` · `@fudic/diagnostics` · `@fudic/cli` · `@fudic/mcp` · `examples/workspace` ·
> `examples/basic`
> **Depende de:** 43 (librerías y la cadena de dependencias), 44 (workspace, `g app`), 56 (`_error.fud`
> y `error-pages`), 58 (idiomas), 60 (el `.fudapi` y sus llamadas), 67 (reglas remotas), 73 (`back`
> desde el `Referer`), 77 (el MCP), 79 (la guía llega por la cadena).
> **Rango de diagnósticos:** `FUD1570`–`FUD1579` (nuevo). Usado: `FUD1570`.
> **Decisiones de gramática:** ninguna.
> **Origen:** [IDEA-08](./ideas/IDEA-08-adelgazar-el-cliente.md) §6 y §7, y lo hablado con Pedro el
> 2026-11-16. Con esta SDD la IDEA-08 queda cerrada del todo.
> **Rama sugerida:** `sdd-87-pagina-de-error`, desde `main`.
>
> **Qué cambia en una frase.** Una librería puede tener **un** `_error.fud`, y toda app que dependa de
> ella lo usa sin escribir nada; una app que quiere la suya la escribe en sus rutas, como hoy, y gana.
> Y una app publicada bajo un `base` (`/admin/`) deja de salirse de él en el navegador: sus llamadas,
> sus reglas remotas, sus errores y sus enlaces de la página de error se quedan en `/admin/`.

---

## 1. Contexto y objetivo

### 1.1. El problema, contado como lo vive un equipo

Un equipo arranca una aplicación grande. Crea la primera app y una librería `ui` con la guía de
estilos, y quiere que **todas** sus apps pinten los errores igual. Hoy no puede:

- La página de error es el fichero `src/routes/_error.fud` **de cada app**. No hay otra forma.
- Si la copia en cada app, a los quince días alguien crea otra app y nadie se acuerda de copiarla.
- Si la escribe en la librería, nadie la usa: el build solo la busca en las rutas de la app.

Y en cuanto ese equipo publica una app bajo un `base` (`admin` en `/admin/`, junto a `tienda` en `/`),
el navegador se sale de la app en cuatro sitios:

- **Las llamadas a funciones** van a `/_fudic/fn/…` en vez de a `/admin/_fudic/fn/…`. Las atiende
  `tienda`, o nadie.
- **Las reglas remotas** de un formulario preguntan a `/_fudic/rule/…`. La respuesta no es un 200,
  y el valor pasa la validación sin que el servidor lo haya mirado.
- **Los errores** van a `/_fudic/error/500`, y `routes 403 /entrar` va a `/entrar`: la página de
  error y la de entrar de **otra** app. Con una página compartida, ni se nota.
- **La página de error** no puede llevar a casa: `data.back` llega sin `/admin/`, y no hay nada que
  diga cuál es el inicio de la app.

### 1.2. Lo que hay hoy

- **El descubrimiento** ([discover.ts](../../packages/vite/src/discover.ts)) busca `_error.fud` en
  la raíz de `routesDir`. Si está, lo compila como una ruta bajo `/_fudic/error/:status`, una vez
  por idioma, fuera de la tabla de rutas. El build, dev, preview, el Service Worker y `@fudic/testing`
  usan todos ese resultado.
- **La guía de estilos ya llega por la cadena** (SDD-79): una librería con `"guide"` en su
  `fudic.json` se aplica a toda app que dependa de ella, directa o indirectamente. La cadena la da
  `dependencyChain` de `@fudic/resolve`, y `fudic g app` añade como dependencia toda librería del
  workspace que tenga guía (`withGuides`, [lib.ts](../../packages/cli/src/plans/lib.ts)).
- **Lo que ya funciona dentro de una librería**, sin tocar nada:
  - un layout y unos componentes de librería dentro de una página (medido en SDD-43);
  - el tipo de `data` de `_error.fud`: el editor y el typecheck lo deciden por el **nombre** del
    fichero, no por la carpeta;
  - `fudic translate` lee también los `.fud` de las librerías de las que depende la app.
- **`FUD0783`** es del CLI: impide que `fudic g page` escriba una ruta en una librería, porque esa
  página no tendría dirección. `_error.fud` no es una ruta: no tiene dirección propia ni `load`
  (`FUD1010`). La dirección `/_fudic/error/:status` es de la app que la sirve.
- **El `base` en el navegador:**
  - `stub` ([fn.ts](../../packages/http/src/contract/fn.ts)) sabe componer la URL con
    `spec.base`, pero el emit del `.fudapi` ([module.ts](../../packages/api/src/emit/module.ts))
    nunca se lo pasa. Vale `'/'` siempre.
  - El token CSRF se pide junto a la URL de la llamada
    ([csrf-client.ts](../../packages/http/src/csrf-client.ts)), así que se arregla solo cuando la
    llamada lleve el `base`.
  - `askRemote` ([remote.ts](../../packages/forms/src/contract/remote.ts)) compone
    `/_fudic/rule/<id>/<name>` sobre el origen, sin `base`.
  - `errorPagesStep` ([error-pages.ts](../../packages/http/src/error-pages.ts)) navega a
    `/_fudic/error/<status>` y a sus `routes` tal cual.
- **El `base` en el servidor ya está bien.** Quita el `base` antes de mirar la ruta, así que atiende
  `/admin/_fudic/fn/…`, `/admin/_fudic/rule/…` y `/admin/_fudic/error/500`. `back` se calcula del
  `Referer` y se le quita el `base` (`backOf`, [errors.ts](../../packages/server/src/errors.ts)).
- **No hay generador** de página de error, ni en una app ni en una librería.
- **El MCP** no sabe nada de páginas de error compartidas: su guía solo habla de
  `src/routes/_error.fud`, `fudic_generate` no tiene `error-page`, y `fudic_status` no dice qué página
  usa la app.

### 1.3. Objetivo

1. Una librería puede tener **un** `_error.fud`, en `src/_error.fud`.
2. Una app sin `_error.fud` propio usa el de la librería de su cadena que lo tenga, sin escribir nada.
3. Una app con `src/routes/_error.fud` usa el suyo, aunque su cadena tenga otro.
4. Si la cadena tiene dos librerías con `_error.fud` y la app no tiene el suyo, el build lo dice y no
   adivina.
5. El build, y el MCP, dicen qué página de error usa la app y de dónde sale.
6. `fudic g error-page` crea el fichero, en una app o en una librería. `fudic g app` hace que la app
   nueva dependa de las librerías del workspace que tienen página de error.
7. Una app con `base` no se sale de él en el navegador: llamadas, CSRF, reglas remotas, página de
   error y `routes`.
8. La página de error tiene `data.home` (el inicio de la app) y `data.back` sirve tal cual como
   `href`, con el `base`.
9. Un agente que trabaja por el MCP sabe todo esto sin leer el código.

---

## 2. Dependencias

| SDD | Qué aporta |
|---|---|
| 43 | `dependencyChain` de `@fudic/resolve`: la cadena de una app, librerías incluidas |
| 44 | El workspace, `fudic g app` / `g lib`, `--uses` y `withGuides` |
| 56 | `_error.fud`, su dirección `/_fudic/error/:status` y el middleware `error-pages` con sus `routes` |
| 58 | `_error.fud` una vez por idioma |
| 60 | El emit del `.fudapi` y `stub` / `FnSpec` en el navegador |
| 67 | Las reglas remotas y `askRemote` |
| 73 | `path` y `back` de `ErrorPage`; `back` leído del `Referer`, nunca de la URL |
| 77 | El MCP: `fudic_status`, `fudic_generate`, la guía |
| 79 | El precedente: una pieza de la librería que llega a la app por la cadena |

`@fudic/mcp` gana la dependencia `@fudic/resolve` (del workspace). Ninguna otra.

---

## 3. Interfaz pública

### 3.1. Dónde vive la página de error

| Proyecto | Fichero |
|---|---|
| App | `src/routes/_error.fud` (como hoy) |
| Librería | `src/_error.fud` |

Es una convención de nombre y de sitio, igual que en la app. **No** hay clave nueva en `fudic.json`.
Un `_error.fud` de librería en cualquier otro sitio no es la página de error de nadie.

### 3.2. Qué página usa una app

En este orden, y gana la primera que exista:

1. el `src/routes/_error.fud` de la app;
2. el `src/_error.fud` de la **única** librería de su cadena que lo tiene;
3. la página mínima de hoy (el código y el título, sin diseño).

La cadena es la de SDD-43: las librerías de las que la app depende, directa o indirectamente. Si
tiene **dos o más** librerías con `src/_error.fud` y la app no tiene el suyo, es `FUD1570` (§3.8).

### 3.3. `errorPageOf` en `@fudic/resolve`

La regla de §3.2 vive en **un** sitio. La usan el plugin, el CLI y el MCP.

```ts
/** Where the error page of a project comes from (SDD-87 §3.2). */
export type ErrorPageSource =
  | { readonly kind: 'own'; readonly file: string }
  | { readonly kind: 'library'; readonly file: string; readonly package: string }
  | { readonly kind: 'ambiguous'; readonly libraries: readonly { readonly file: string; readonly package: string }[] }
  | { readonly kind: 'none' };

/**
 * The error page `projectRoot` paints with: its own `<routesDir>/_error.fud`, else the
 * `src/_error.fud` of the one library of its chain that has one. Files are absolute, POSIX.
 */
export function errorPageOf(projectRoot: string, routesDir: string, io: PackageFs): ErrorPageSource;

/** The error page a LIBRARY offers to the apps that depend on it: `src/_error.fud`. */
export const LIBRARY_ERROR_FILE = 'src/_error.fud';
```

- **Una librería** no tiene `routesDir`: para ella, `errorPageOf` devuelve `own` si tiene
  `src/_error.fud`, y `none` si no. Nunca mira su cadena: una librería no pinta errores, los ofrece.
- **`ambiguous`** lista las librerías en el orden de `dependencyChain`.
- **Que un fichero existe** se sabe con `io.readFile(…) !== undefined`, como el resto del paquete.

### 3.4. `ErrorPage`: `home`, y `back` con el `base`

```ts
export interface ErrorPage {
  readonly status: number;
  readonly title: string;
  readonly detail?: string;
  /** The path that was asked for and failed, without the origin or the `base`: `/usuarios/99`. */
  readonly path: string;
  /**
   * Where the user came from, when it is of this app, ready for an `href`: `/admin/usuarios`.
   * Read from the `Referer`, never from the URL; absent when there is none, or it is another
   * app's or another origin's.
   */
  readonly back?: string;
  /** The home of the app that paints the page, ready for an `href`: its `base`, `/admin/`. */
  readonly home: string;
}
```

- **`home`** es nuevo: el `base` de la app (`/` sin `base`).
- **`back`** pasa a llevar el `base`. En una app sin `base` no cambia nada.
- **`path`** no cambia: es para mostrar, sin el `base`.

`PageOrigin` de `@fudic/server` gana `home` igual, y la declaración de `data` que escribe el editor
(`ERROR_DATA` de `@fudic/language-core`) se actualiza con los mismos comentarios.

### 3.5. El `base` en el navegador

**El emit del `.fudapi`.** `emitModule` cambia su quinto parámetro por unas opciones:

```ts
export interface EmitModuleOptions {
  readonly i18n?: ApiLocale;
  /** The app's `base`, as Vite resolved it: `/admin/`. Only the browser side writes it. */
  readonly base?: string;
}
export function emitModule(source: ApiSource, index: ApiIndex, api: ApiContext, side: Side, options?: EmitModuleOptions): string;
```

- En el lado `browser`, con un `base` distinto de `/`, cada `stub({ … })` lleva `base: "/admin/"`, y
  cada regla remota también.
- Con `base` `/` o sin `base`, el módulo sale **byte a byte** como hoy.
- El plugin pasa el `base` que resolvió Vite, en build y en dev.

**`ClientContext.base`.**

```ts
export interface ClientContext<A = unknown> extends BaseContext<A> {
  readonly side: 'client';
  readonly catches: readonly number[];
  /** The `base` of the app that makes the call: `/admin/`, or `/`. */
  readonly base: string;
}
```

Lo rellenan `stub` (con `spec.base ?? '/'`, el mismo que ya usa para la URL) y `ruleSend`. Este
gana un tercer parámetro opcional `base` (por defecto `/`), que el emit escribe con el mismo criterio
que el de `stub`. Solo sirve para el contexto: la URL de la regla ya le llega hecha.

**Las reglas remotas.** `Question` de `@fudic/forms` gana `readonly base?: string`, que llega de la
regla emitida como llega `sig`. `askRemote` compone `join(base ?? '/', '/_fudic/rule/<id>/<name>')`.

**`errorPagesStep`:**

- **sin ruta:** navega a `join(ctx.base, '/_fudic/error/<status>')` → `/admin/_fudic/error/500`;
- **con ruta que empieza por `/`:** es una ruta de la app, y navega a `join(ctx.base, ruta)` →
  `routes 403 /entrar` lleva a `/admin/entrar`;
- **con ruta que no empieza por `/`** (`https://login.ejemplo.com/`): navega a ella tal cual;
- **un `Redirect`:** no cambia, navega a su `location`.

### 3.6. `fudic g error-page`

```
fudic g error-page [--project <name>] [--force]
```

| Dónde | Escribe |
|---|---|
| App | `src/routes/_error.fud` |
| Librería | `src/_error.fud` |

- **Un solo fichero.** Sin componente, sin test, sin `.fudapi`.
- **Un documento entero** (`<!DOCTYPE html>`), sin layout. Pinta `@data.status · @data.title`, el
  `detail` si lo hay, un enlace a `@data.back` si lo hay y, si no, uno a `@data.home`. El `<html lang>`
  es el del proyecto, como en `g page`. Un comentario `@* … *@` dice qué trae `data` y cómo enlazar un
  layout (`<link rel="layout" href="…">`).
- **No pasa por `FUD0783`** en una librería: no es `g page`.
- **Si el fichero existe**, se niega como cualquier generador, salvo con `--force`.
- **El informe**, con `errorPageOf`, dice el fichero creado y:
  - en una librería: «toda app que dependa de `<paquete>` y no tenga su `_error.fud` usará esta»;
  - en una app cuya cadena ya trae una: «esta sustituye a la de `<paquete>` en esta app».

`fudic g app` añade como dependencia de la app nueva, además de las librerías con guía, las que
tienen `src/_error.fud`. `fudic g lib` no cambia: una librería no pinta errores.

### 3.7. El MCP

- **`fudic_generate`** acepta `error-page` (`GENERATE_KINDS`), con su descripción actualizada.
- **`fudic_status`**, en el bloque `project` de una app o de una librería, gana `errorPage`, sacado
  de `errorPageOf`:

  | Caso | `errorPage` |
  |---|---|
  | La propia | `{ "from": "own", "file": "src/routes/_error.fud" }` |
  | De una librería | `{ "from": "@acme/ui", "file": "libs/ui/src/_error.fud" }` |
  | Dos librerías | `{ "from": "ambiguous", "libraries": ["@acme/ui", "@acme/marketing"] }` |
  | Ninguna | `{ "from": "none" }` |

  Los ficheros, relativos a la raíz del proyecto en el que arrancó el MCP. En un workspace, el bloque
  no cambia (no es una app).
- **La guía**, `pages.md` en inglés y en español, sección «Páginas de error»:
  - el ejemplo usa `data.home` en lugar de `"/"`, y `data.back` como `href`;
  - un párrafo nuevo, con su ejemplo `fud path=src/_error.fud` de librería: una librería puede tener
    `src/_error.fud`; la usa toda app que dependa de ella sin `_error.fud` propio; la propia gana;
    dos en la cadena es `FUD1570`; se crea con `fudic_generate { kind: "error-page" }`; y
    `fudic_status` dice cuál usa cada app.
- **`config.md`** (inglés y español): en `page.headers`, «cada `_error`» incluye la de una librería.
- **`workflow.md`** (inglés y español), en lo que se hace al crear un workspace: si las apps van a
  compartir la página de error, crearla en la librería antes de la segunda app.

### 3.8. El diagnóstico

| Código | Severidad | Título | Cuándo |
|---|---|---|---|
| `FUD1570` | error | Two error pages in the chain | La app no tiene `src/routes/_error.fud` y dos o más librerías de su cadena tienen `src/_error.fud`. El mensaje nombra los paquetes y sus ficheros. Arreglo: escribir la de la app (`fudic g error-page`) |

Lo emite el plugin, sobre el `fudic.json` de la app, en build y en dev (en el overlay).

### 3.9. Lo que dice el build

Cuando la página de error de la app sale de una librería, el build y el arranque de dev escriben
una línea informativa:

```
fudic: error page from @acme/ui (libs/ui/src/_error.fud)
```

Con la página propia, o sin página, no se dice nada.

### 3.10. `DiscoverResult`

```ts
export interface DiscoverResult {
  // … lo de hoy …
  /** The package `errorPage` comes from, when it is a library's: `@acme/ui`. Absent for the app's own. */
  readonly errorPageFrom?: string;
}
```

`discoverRoutes` gana un parámetro opcional `packages?: PackageFs` (por defecto
`nodePackageFs()`) y busca con `errorPageOf`. El `RouteBuild` de una página de librería es igual que
el de la app: `route.file` es `_error.fud`, el patrón `/_fudic/error/:status`, y `absPath` el fichero
de la librería.

---

## 4. Comportamiento

### 4.1. Buscar la página

`errorPageOf` (§3.3):

1. Si existe `<raíz>/<routesDir>/_error.fud`, es `own`. No se mira la cadena.
2. Si no, recorre `dependencyChain(raíz)` sin la propia app, y de cada librería (`kind: "lib"`) mira
   si existe `<raíz de la librería>/src/_error.fud`.
3. Una: `library`. Ninguna: `none`. Dos o más: `ambiguous`.

En dev el descubrimiento ya se repite en cada petición, así que crear o borrar el `_error.fud` de una
librería se nota en la siguiente, sin reiniciar.

### 4.2. Compilar la página de una librería

Exactamente como la de la app: un idioma por compilación, su `.fud` leído por el mismo io traducido,
sus layouts y componentes resueltos desde su propia carpeta. Los componentes que use son los de la
librería y adoptan la guía de la cadena de la **librería** (SDD-43 §4.6), como cualquier componente
suyo. Las mismas reglas de `FUD1010`: no tiene `load`, ni `paths`, ni funciones.

### 4.3. El editor y el typecheck

- El `data` de `src/_error.fud` de una librería ya está tipado (por el nombre). Se fija con un test.
- Un `src/_error.fudapi` al lado, en una librería, es el `.fudapi` de una página de error:
  `FUD1010` si declara `load`, `paths` o funciones, igual que en una app. Para eso, el contexto de un
  `.fudapi` (`apiContextOf` en `@fudic/typecheck` y su gemelo en `@fudic/language-server`) reconoce
  también `src/_error.fud` de una librería, con `route: { params: [], error: true }`.

### 4.4. El `base` en el servidor: `home` y `back`

- `pageOriginOf(request, base, fromCall)` devuelve `home: base`.
- `backOf` comprueba como hoy que el `Referer` es del mismo origen y está bajo el `base`, y devuelve
  su ruta **con** el `base` y su `search`.
- `path` se sigue calculando sin el `base`.
- `visit` de `@fudic/testing`, que no tiene `Referer`, pasa `{ path, home: base }`.

El servidor no cambia en nada más: ya atiende todo bajo el `base`.

### 4.5. Los ejemplos

**`examples/workspace`:**

- **`libs/ui`** gana `src/_error.fud`: un documento entero con el diseño de `ui` (que ya adopta la
  guía `guia`).
- **`admin`** (`base: '/admin/'`) **no** tiene `_error.fud`: usa el de `ui`. Gana:
  - `src/http.fudapi` con `use error-pages`, `routes 403 /entrar` y `use csrf`;
  - una ruta `/fallos` con su `.fudapi` y tres botones: uno llama a una función que responde bien
    (pinta lo que devuelve), otro a una que lanza un `Error` (500), y otro a una que lanza
    `forbidden()` (403);
  - un formulario en `/fallos` con una regla remota (un nombre que el servidor da por ocupado);
  - una ruta `/entrar`.
- **`tienda`** (`base: '/'`) tiene su propio `src/routes/_error.fud`, distinto del de `ui`, aunque
  depende de `ui`.
- **Los e2e de errores** (`tests/errores.spec.ts`) corren cada app con `vite preview`, cada una en
  su puerto (dos `webServer` más en `playwright.config.ts`). `serve.mjs` es un servidor estático a
  propósito (prueba `CacheStorage` en un origen) y no pinta páginas ni atiende funciones. Los e2e de
  caches siguen con `serve.mjs`.

**`examples/basic`:** su `_error.fud` cambia `href="/"` por `href=@data.home`.

---

## 5. Invariantes

- **La página propia de la app gana siempre.** Con `src/routes/_error.fud`, la cadena ni se mira.
- **Nunca se adivina.** Dos librerías con página de error y ninguna en la app es `FUD1570`, no un
  orden.
- **Una regla, un sitio.** El plugin, el CLI y el MCP preguntan a `errorPageOf`; ninguno la repite.
- **Una app sin `base` no cambia.** Mismos módulos del `.fudapi` byte a byte, mismas URLs, mismo
  `back`, mismo HTML; `home` vale `/`.
- **Una app sin `_error.fud` en su cadena no cambia.** Sigue pintando la página mínima.
- **`FUD0783` no cambia.** Una librería sigue sin poder tener rutas.
- **Una app con `base` no se sale de él en el navegador.** Ni sus llamadas, ni el CSRF, ni sus
  reglas remotas, ni su página de error, ni sus `routes`, ni `back`, ni `home`.
- **Cobertura.** Lo nuevo, al 100 % en las cuatro métricas. Los paquetes que hoy están al 100
  (`@fudic/resolve`, `@fudic/http`, `@fudic/server`, `@fudic/diagnostics`, `@fudic/language-core`,
  `@fudic/typecheck`, `@fudic/language-server`, `@fudic/testing`, `@fudic/mcp`) siguen al 100.
  `@fudic/vite`, `@fudic/cli`, `@fudic/api` y `@fudic/forms` no bajan.

---

## 6. Criterios de aceptación

**La prueba de Pedro**

1. `examples/workspace`: `admin` no tiene `_error.fud` y depende de `ui`.
   - `/admin/no-existe` responde 404 con la página de `ui`. Su «Ir al inicio» lleva a `/admin/`.
   - En `/admin/fallos`, el botón que responde bien pinta su resultado: la llamada fue a
     `/admin/_fudic/fn/…`.
   - El botón del 500 lleva a `/admin/_fudic/error/500`, con la página de `ui` y un «Volver» a
     `/admin/fallos`.
   - El botón del 403 lleva a `/admin/entrar`.
   - El nombre ocupado en el formulario muestra el error de la regla remota: la pregunta fue a
     `/admin/_fudic/rule/…`.
   - `tienda`, que también depende de `ui`, pinta `/no-existe` con **su** página, no con la de `ui`.
2. Un agente que llama a `fudic_status` en `admin` lee `errorPage: { from: "@fudic/example-ui", … }`,
   y en `tienda`, `errorPage: { from: "own", … }`.

**El `base` en el navegador**

3. El módulo de navegador de un `.fudapi` con `base: '/admin/'` lleva `base: "/admin/"` en cada
   `stub` y en cada regla remota. Con `base: '/'` sale byte a byte como antes de esta SDD.
4. Una llamada con `spec.base = '/admin/'` va a `/admin/_fudic/fn/…`, pide su token CSRF a
   `/admin/_fudic/csrf`, y llega a los pasos de cliente con `ctx.base === '/admin/'`.
5. Una regla remota con `base: '/admin/'` pregunta a `/admin/_fudic/rule/<id>/<name>`; sin `base`,
   a `/_fudic/rule/<id>/<name>`, como hoy.
6. `errorPagesStep` con `ctx.base = '/admin/'` y un 500 navega a `/admin/_fudic/error/500`; con
   `base = '/'`, a `/_fudic/error/500`.
7. `routes { 403: '/entrar' }` con `base = '/admin/'` navega a `/admin/entrar`;
   `{ 401: 'https://login.ejemplo.com/' }` navega a esa URL tal cual.
8. Un `Redirect` navega a su `location` sin tocarla; un 422, un `catches` y una llamada cancelada
   siguen sin navegar.

**El `base` en la página de error**

9. El servidor de una app con `base: '/admin/'`:
   - pinta `/admin/_fudic/error/500` con `home: '/admin/'`;
   - con un `Referer` de `/admin/fallos?x=1`, da `back: '/admin/fallos?x=1'` y `path: '/fallos'`;
   - con un `Referer` de `/otra/`, no da `back`.
10. Sin `base`, `back`, `path` y el HTML de la página de error son los de hoy (los tests existentes
    solo cambian por `home`).
11. `visit` de `@fudic/testing` en una app con `base` pinta la página de error con `home` igual al
    `base`.

**Qué página usa una app**

12. `errorPageOf`:
    - con `src/routes/_error.fud` en la app y otro en una librería de la cadena: `own`;
    - sin el de la app y con uno en una librería: `library`, con el nombre de su paquete;
    - con la librería a dos saltos (app → `ui` → `base-ui`): `library`;
    - con un `_error.fud` de librería fuera de `src/` (`src/components/_error.fud`): `none`;
    - con dos librerías: `ambiguous`, en el orden de la cadena;
    - en una librería con `src/_error.fud`: `own`, sin mirar su cadena.
13. `discoverRoutes` compila la página que da `errorPageOf`: con `library`, `errorPageFrom` es el
    paquete; con `own`, no existe; con `ambiguous`, `FUD1570` con los paquetes y sus ficheros en el
    mensaje, y ninguna página.
14. Con `locales: ['es', 'en']`, la página de la librería se compila una vez por idioma, y sus textos
    están en lo que extrae `fudic translate` de la app.
15. En dev, crear `src/_error.fud` en la librería hace que la siguiente URL inexistente lo pinte, sin
    reiniciar.
16. El build de una app con la página de una librería escribe
    `fudic: error page from <paquete> (<fichero>)`; con la suya o sin ninguna, no escribe esa línea.

**El editor**

17. En `src/_error.fud` de una librería, `data.status` es `number`, `data.home` es `string`, y
    `data.foo` es un error de tipos.
18. Un `src/_error.fudapi` de una librería con `load` da `FUD1010`, en el editor y en `fudic check`.

**El CLI**

19. `fudic g error-page --project ui` en una librería escribe `src/_error.fud` y nada más, sin
    `FUD0783`. En una app escribe `src/routes/_error.fud`.
20. El fichero generado compila sin diagnósticos, y renderizado con `{ status: 404, title: 'Not Found',
    path: '/x', home: '/admin/' }` tiene un enlace a `/admin/`; con `back: '/admin/y'`, a `/admin/y`.
21. Con el fichero ya escrito, `g error-page` se niega; con `--force`, lo reescribe.
22. En una app cuya cadena ya tiene una página de error, el informe dice que la nueva la sustituye; en
    una librería, que la usarán las apps que dependan de ella.
23. `fudic g app pedidos` en un workspace con una librería con `src/_error.fud` (y sin guía) añade esa
    librería a las dependencias de `pedidos`.

**El MCP**

24. `fudic_generate { kind: "error-page" }` hace lo mismo que el CLI (criterio 19).
25. `fudic_status` da `errorPage` en los cuatro casos de §3.7, en una app y en una librería.
26. La guía (`pages.md`, `config.md`, `workflow.md`, en inglés y en español) explica la página
    compartida como dice §3.7, y `guide-examples.test.ts` pasa con el ejemplo nuevo.

**Cierre**

27. `pnpm typecheck`, `pnpm build`, la cobertura de §5, y los e2e de `examples/workspace` y
    `examples/basic` en verde.

---

## 7. Fuera de alcance

Nada. Lo que la IDEA-08 dejaba descartado (declarar en `fudic.json` el `_error.fud` de otro paquete)
lo sustituye la cadena, y el componente `error-view` que proponía la IDEA no se hace: la página es un
solo fichero (§8.1, decisión 4).

---

## 8. Decisiones

### 8.1. Tomadas al redactar

1. **La página llega por la cadena, como la guía** (Pedro: «a los quince días nadie se acuerda de
   añadir la línea»). Nada que escribir en la app, y `fudic g app` añade la dependencia sola.
2. **Sin clave en `fudic.json`.** Un fichero en un sitio fijo, como en la app. No hay un sitio más
   donde se diga lo mismo.
3. **La de la app gana**, sin diagnóstico. Es el mecanismo para el caso concreto, no un conflicto.
4. **Un solo fichero** (Pedro). Ni componente `error-view`, ni test. Lo que una app suele querer
   reutilizar es el diseño, y ese llega por el layout y la guía.
5. **Dos librerías con página es un error, no un orden.** Es raro, y elegir por la profundidad o por
   el orden del `package.json` haría que añadir una dependencia cambiara páginas sin avisar.
6. **`FUD0783` se queda como está.** `_error.fud` no es una ruta: no tiene dirección propia, y la que
   usa es de la app que la sirve.
7. **El bug del `base` va en esta SDD, no en un BUG aparte** (Pedro). Al redactar apareció que no era
   solo `error-pages`: las llamadas, el CSRF y las reglas remotas tampoco llevaban el `base` en el
   navegador. Es el mismo fallo, y con una página compartida se vuelve invisible.
8. **Las `routes` de `error-pages` son rutas de la app.** Una que empieza por `/` lleva el `base`;
   una URL entera (`https://…`) va tal cual.
9. **`back` con el `base`, y `home` nuevo.** Una página que sirve a varias apps no sabe su `base`;
   el servidor sí. `path` se queda sin `base` porque es para mostrar.
10. **El `base` se escribe en el emit solo si no es `/`.** Así una app sin `base` emite lo mismo que
    hoy, byte a byte.
11. **`errorPageOf` vive en `@fudic/resolve`**, junto a `dependencyChain`. Lo preguntan tres
    paquetes, y una segunda copia sería una segunda respuesta el día que una se quede atrás.
12. **El generador escribe un documento entero, sin layout.** Una página de error no debe depender de
    un layout cuyas props quizá no se puedan resolver sin `load`. El comentario dice cómo enlazar uno.
13. **El build y el MCP dicen de dónde sale la página.** Una página que llega sin que nadie la nombre
    tiene que decirse en algún sitio, y el agente tiene que verlo sin leer el código (Pedro: «el MCP
    se tiene que enterar»).
14. **Los e2e de errores con `vite preview`.** `serve.mjs` es estático a propósito (prueba
    `CacheStorage`), y no pinta páginas de error ni atiende funciones.

### 8.2. Tomadas al implementar

1. **La línea del build nombra el fichero relativo a la app** (`../../libs/ui/src/_error.fud`), no al
   workspace: el plugin no sabe dónde está la raíz del workspace, y relativo a la app es un camino
   que se puede abrir desde donde corre el build.
2. **Dev no añade nada al watcher.** El descubrimiento ya se repite en cada petición, así que el
   `_error.fud` de una librería, creado o borrado, se nota en la siguiente sin vigilar su carpeta.
   `FUD1570` va al overlay en cada petición mientras dure.
