# SDD-60 — `.fudapi`: el contrato del servidor fuera del `.fud`

> **Estado:** `Listo` — [tareas](./SDD-60-Task.md).
> **Paquetes:** `@fudic/api` (nuevo: parser, índice, validador, formateador y emisor TS) ·
> `@fudic/diagnostics` · `@fudic/conventions` · `@fudic/config` · `@fudic/http` · `@fudic/forms` ·
> `@fudic/compiler` · `@fudic/vite` · `@fudic/language-core` · `@fudic/typecheck` ·
> `@fudic/language-server` · `@fudic/formatter` · `@fudic/cli` · `fudic-vscode` · `examples/*` ·
> `packages/testing`
> **Depende de:** 50 (diagnósticos), 52 (patrón de lenguaje propio y su servicio), 56 (funciones
> de servidor, cable, cadena), 35 (typecheck de dev y build), 20 (estrategia de ruta), 40
> (contrato de layout), 51 (resolución de nombres de la vista).
> **Rango de diagnósticos:** `FUD1060`–`FUD1139` (nuevo). Parser `1060`–`1079`, validador
> `1080`–`1109` (usa `1080`–`1091` y `1093`–`1101`), `.fud` `1110`–`1129` (usa `1110`–`1115`);
> el resto, reservado sin usar.
> **Origen:** [IDEA-06](./ideas/IDEA-06-lenguaje-de-contrato-fudapi.md) y la sesión del
> 2026-10-21 con Pedro, que cerró todas las preguntas de esta spec. Manda sobre IDEA-05 §3 e
> IDEA-06 donde los contradiga (el `implement` de IDEA-06 §10.4 y el 501 de §10.6 no existen).
>
> **Qué añade en una frase.** El servidor de una ruta o de un componente se declara en un
> `.fudapi` hermano; fudic genera de él el TS del contrato; el desarrollador escribe el handler en
> `src/server` y lo une con `.handle`; el `.fud` queda con un único `@code`, que es código de
> navegador.

---

## 1. Contexto y objetivo

Hoy el `.fud` mezcla tres cosas en su `@code`: la zona neutra, `@client` y `@server`. El `@server`
de `examples/basic/src/routes/usuarios.fud` lleva `load`, cinco funciones con sus middlewares, el
`strategy` y los imports de servicios, todo junto al markup. Esta spec lo saca:

```
src/routes/usuarios.fud          vista + @code (solo navegador)
src/routes/usuarios.fudapi       el contrato: load, funciones, tipos
src/server/usuarios.ts           el handler (cualquier nombre, cualquier subcarpeta)
```

```
# src/routes/usuarios.fudapi
# Per request: the list changes with every new person.
load ssr
  users  Person[]

get search
  q  str
  -> Person[]

put save
  use auth
  id      i32
  active  bool

type Person
  id      i32
  name    str
```

```ts
// src/server/usuarios.ts
import { inject } from '@fudic/di';
import { load, search, save, type SearchHandler } from 'fudic:routes/usuarios';
import { Users } from '../services/users';

export const buscar = ((ctx) => inject(Users).find(ctx.args.q)) satisfies SearchHandler;

load.handle(() => ({ users: inject(Users).all() }));
search.handle(buscar);
save.handle((ctx) => inject(Users).setActive(ctx.args.id, ctx.args.active));
```

```html
<link rel="server" href="./usuarios.fudapi">
```

Es producto, no un experimento: **`examples/basic` funciona exactamente igual que hoy** —mismas
URLs, mismos modos de ruta, mismo HTML, misma hidratación, mismas pruebas— sin una línea de
`@server` ni de `@client` en ningún `.fud` del repositorio.

### 1.1. Lo decidido (no se reabre)

1. **El `.fudapi` solo declara.** Funciones, `load`, `paths`, `layout`, tipos, enums, forms,
   reglas, middlewares, patrones, mensajes y la cadena. Nunca lleva código.
2. **Lo generado nunca importa código del usuario.** Lo generado exporta cada pieza «hasta el
   `.handle`»; el usuario la importa y le añade su implementación. Sin ciclos.
3. **El usuario exporta su implementación** si quiere (para tests unitarios) y la une con
   `.handle(fn)`, `.client(fn)`, `.server(fn)` o `.check(fn)`.
4. **Dos carpetas, configurables:** `src/server` (solo servidor) y `src/browser` (lo que tiene
   que correr en el navegador; el servidor también la carga). Valores por defecto en
   `@fudic/conventions`, sustituibles en el `fudic.json` de cada app o librería.
5. **Sin recorridos de código.** Ni dev ni build parsean TS para encontrar implementaciones: las
   dos carpetas se cargan con `import.meta.glob`.
6. **Una función sin implementar es un 404**, como una ruta que no existe en cualquier backend.
   En dev, el `detail` del `Problem` dice qué falta. No hay aviso en build.
7. **Una implementación mal escrita rompe `tsc`**: el typecheck de dev (overlay) y el de build
   (el build falla) incluyen `src/server` y `src/browser`. El bundle de servidor lleva sourcemaps.
8. **Los built-ins pasan por el mismo camino.** `@fudic/forms` y `@fudic/http` publican sus
   `.fudapi` y sus implementaciones; los builders y validadores de hoy dejan de ser API pública.
9. **Librerías:** un paquete publica sus `.fudapi` en `fudapi/` en su raíz. No se declara nada en
   ningún sitio: instalarlo como dependencia directa basta.
10. **Un único `@code`, código de navegador.** Para pintar, el SSR de Node y el Service Worker
    evalúan de él solo lo que el markup necesita (§4.8). Recortar lo que la vista puede evaluar
    (lista blanca, stdlib) es otra SDD.
11. **Autocompletado y LSP completos** para `.fudapi`, y el `.fud` tipado desde él.

## 2. Dependencias

| SDD | Qué aporta |
|---|---|
| 50 | `@fudic/diagnostics`: `Span`, `SourceDiagnostic`, un fichero por código. |
| 52 | El patrón de lenguaje propio: parser por líneas que no lanza, servicio aislado en el language server, gramática TextMate y wiring de VS Code (`packages/spec`, `language-server/src/fudspec/`). |
| 56 | `@fudic/http`: verbos, cadena de tres niveles, middlewares de dos mitades, `Problem`, formato de cable, `form:=`, despacho en `/_fudic/fn/`. |
| 35 | El typecheck de `vite dev` (`dev-typecheck.ts`) y el de `vite build` (`background-check.ts`). |
| 20 | `StrategyDecl` y la resolución de modo de ruta (`vite/src/mode.ts`). |
| 40 | El contrato de props de layout (`$LayoutProps`, `FUD0890`). |
| 51 | La resolución de nombres libres de la vista (`semantic/view-scope.ts`). |

## 3. Interfaz pública

### 3.1. El fichero

- Por líneas. Sangrado de **2 espacios por nivel**; un tabulador nunca es sangrado.
- `#` abre un comentario hasta fin de línea **solo si abre un token** (como en `.fudspec`), salvo
  en una línea `pattern`, donde nunca (§3.9). Las líneas `#` pegadas encima de una declaración
  son su **documentación** (hover).
- Cadenas entre comillas dobles, de una línea, con escapes `\"` y `\\`.
- Un `=` suelto fuera de comillas (no parte de `==`, `!=`, `<=`, `>=`) es siempre un token propio:
  `str=""` se lee como `str = ""`. Un valor que lleve `=` va entre comillas
  (`routes  403 "/entrar?x=1"`). *Decidido al implementar, a petición de Pedro.*
- Las líneas en blanco no cuentan. Valen `\n`, `\r\n` y `\r`.
- Un fichero es **de contrato** (`load`, `paths`, `layout`, funciones, `chain`, `form`, `type`,
  `enum`, `messages`) o **de extensiones** (`rule`, `middleware`, `pattern`, y los `type`/`enum`
  que usen). Mezclar los dos es `FUD1078`.

**Nombres.**

| Qué | Forma | En TS |
|---|---|---|
| `rule`, `middleware`, `pattern`, códigos de `fails`, códigos de `require` | kebab-case `[a-z][a-z0-9-]*` | camelCase (`nif-unique` → `nifUnique`) |
| funciones, campos, argumentos, forms | identificador `[A-Za-z_][A-Za-z0-9_]*` | tal cual |
| `type`, `enum` | PascalCase | tal cual |

Las palabras clave de cada contexto no valen como nombre de campo o argumento (`FUD1076`).

**Visibilidad.** `type`, `enum`, `form`, `rule`, `middleware`, `pattern` y `messages` son de
**proyecto**: los ve cualquier `.fudapi` de la app y de sus librerías, sin imports. Un nombre
repetido en el proyecto es `FUD1081`. Las funciones, `load`, `paths`, `layout` y `chain` son del
fichero.

### 3.2. Tipos

| Se escribe | Significa | TS |
|---|---|---|
| `str` `bool` | texto, booleano | `string`, `boolean` |
| `u8 i8 u16 i16 u32 i32 f32 f64` | número con ancho | `number` |
| `date` | fecha | `Date` |
| `uuid` | identificador UUID (forma textual de RFC 9562, `8-4-4-4-12` hex, sin distinguir mayúsculas) | `string` |
| `T[]` | lista | `readonly T[]` |
| `T?` | puede faltar | campo opcional (`x?: T`) |
| `map K V` | mapa; `K` es `str`, `uuid` o un entero | `Readonly<Record<…, V>>` |
| `Nombre` | un `type` o `enum` del proyecto | su interfaz o unión |

```
type Post
  slug      str
  title     str
  featured  bool
  tags      str[]
  author    Author?

enum Variant          # a union of literals
  default
  highlight
```

- Un `type` sin campos o un `enum` sin miembros es `FUD1073`. Un `type` que se contiene a sí mismo
  (directa o indirectamente, salvo a través de `[]`, `?` o `map`) es `FUD1088`.
- `number` no existe: es `FUD1080` con la lista de anchos.
- `enum` genera `type Variant = 'default' | 'highlight'`.
- **Los valores se comprueban al cruzar el cable**, en los dos lados, contra su tipo: un número
  fuera de su ancho, un `uuid` mal formado, una fecha inválida. En el servidor, `400` con
  `Problem` (el `detail` nombra el argumento); en el navegador, la llamada rechaza con ese mismo
  `Problem` sin enviar nada. `str` admite cualquier texto.

### 3.3. Funciones

```
<verbo> <nombre> [<ruta>] # get | post | put | patch | delete; ruta: /:id, /:id/lineas/:linea
  use <mw>+               # acumulativas, en orden
  skip <mw>+ | skip *
  form <form>             # excluye los argumentos de cuerpo
  invalidates <ruta>+     # /usuarios /blog/:slug
  compress <gzip|deflate|deflate-raw> [<min>] | compress off
  fails <código> <status> "<detail>"
  query <arg>  <tipo>     # argumento de query
  <arg>  <tipo>           # cero o más, en orden
  -> <tipo>               # sin él, la función no devuelve nada (204)
```

Cada cláusula es lo que hoy es el builder de `@fudic/http`: `use`/`skip` = `.use`/`.skip`,
`<arg> <tipo>` = `.args<T>()` con un objeto de esos campos, `form` = `.form(f)`, `invalidates`,
`compress`. `form` y argumentos de cuerpo a la vez es `FUD1072`. `-> T`, `form` y la ruta más de
una vez, `FUD1071`. `fails` declara un rechazo con nombre que el handler lanza (§3.12). Un status
fuera de `400`–`599` es `FUD1075`.

**Dónde viaja cada argumento.** Se decide por la declaración, nunca por el verbo del usuario:

| Argumento | Viaja en | Llega en |
|---|---|---|
| nombrado en la ruta de la función (`/:id` ↔ `id  uuid`) | la URL | `ctx.params`, junto a los de la página |
| `query <arg> <tipo>` | la query, una clave por argumento (`?notify=true`) | `ctx.query` |
| el resto | el cuerpo; en un `get`, la query como hoy (`?a=…`) | `ctx.args` |
| `form <f>` | el cuerpo | `ctx.form` |

- La ruta empieza por `/`; cada segmento es literal (`[a-z0-9-]+`) o `:arg`. Mal escrita,
  `FUD1068`. Un `:x` sin argumento `x`, `FUD1099`.
- Un argumento de ruta o de query es escalar (`str`, `bool`, numéricos, `date`, `uuid`, `enum`);
  de ruta, además, nunca `?`. Lo demás es `FUD1101`. La query admite `?`.
- Un argumento de ruta con el nombre de un parámetro de la página (`[slug]`) es `FUD1100`. La
  clave `a` de la query es del cable: un `query a` es `FUD1076`.
- La llamada desde el navegador sigue siendo una: `save({ id, notify, active })`. Lo generado
  reparte cada valor en su sitio y comprueba su tipo antes de enviar (§3.2). Con `form`, la
  llamada es `save(form)` si la función no tiene argumentos de ruta ni de query (como hoy, y así
  `form:=` no cambia), y `save({ id, notify, form })` si los tiene. *Decidido al implementar.*
- `ctx` del handler: `params` (página + ruta de la función), `query`, y `args` o `form`, todos
  tipados desde la declaración.

Un middleware con parámetros (§3.8) los recibe en líneas debajo de su `use`:

```
use error-pages
  routes  403 /entrar
```

### 3.4. `load`, `paths` y `layout`

```
load [ssg|ssr|sw] [ttl <dur>] [<policy>] [page <never|persist> [<dur>]]
  use … / skip … / fails …
  <campo>  <tipo>         # la forma de `data`
paths
layout
```

- La línea de `load` es `strategy({ … })` entera: modo, `data.ttl`, `data.policy`
  (`cache-first`, `network-first`, `stale-while-revalidate`, `network-only`) y `page`. Sin modo,
  la inferencia de hoy (SDD-20). Un valor mal escrito es `FUD1074`.
- Los campos de `load` son `data`. `load` es siempre GET y nunca se llama desde el cliente.
- `paths` enumera los valores del parámetro de la ruta (hoy `paths(): string[]`).
- `layout` resuelve las props del layout de la ruta (hoy `layout(ctx, data)`); su tipo sale del
  `<link rel="layout">` del `.fud` hermano, como hoy `$LayoutProps`.
- **Solo en el `.fudapi` hermano de una ruta**: `src/routes/blog/[slug].fudapi` junto a
  `[slug].fud`. Así los `params` de `ctx` salen de la ruta del propio fichero. En otro sitio,
  `FUD1090`. `paths` en una ruta sin parámetros o en `_error`, `FUD1091`.

### 3.5. La cadena

```
chain
  use <mw>+ / skip … / compress …
```

Como mucho una por fichero (`FUD1079`). En `src/http.fudapi` (`HTTP_FILE`, que deja de ser
`src/http.ts`) es el nivel **global**; en cualquier otro fichero de contrato, el nivel de
fichero (hoy `export const http`). La composición global → fichero → función es la de SDD-56.

```
# src/http.fudapi
chain
  use log csrf
  use error-pages
    routes  403 /entrar
  compress gzip 200
```

### 3.6. Forms

```
form <nombre>
  validate-on <submit|blur|input>+
  validity <rules|interacted>
  catches <status>+

  <campo>  <tipo> [= <valor>]
    validate-on … / validity …
    range "<texto>"                       # texto del rango implícito del tipo
    <regla> <arg>* ["<texto>"]

  <campo>  group
    <campo> <tipo> …                      # un nivel más
    summary
      <regla de grupo> | require …

  summary
    <regla de form> ["<texto>"]
    require <código> <expresión> ["<texto>"] [on <campo>]
    when <expresión>
      require …
```

- Cada campo tiene tipo (§3.2, sin `map`). `str`, `bool`, los numéricos, `date`, `uuid`, `T[]`
  (hoy `arr`) y `group`. Sin `= valor`, el valor inicial es el de hoy (`''`, `false`, `null`,
  `[]`; `''` para `uuid`). Un valor que no casa con el tipo es `FUD1094`.
- Un campo `uuid` lleva su comprobación de formato implícita, como el rango de un número: código
  `uuid`, texto con `range "<texto>"`; el vacío pasa (lo rechaza `required`).
- Bajo un campo van sus opciones y sus reglas; bajo un form o un grupo, sus campos, sus opciones y
  su `summary`. Una línea se reconoce por su posición, nunca por adivinar el segundo token.
- `required` en un campo hace que el valor validado no sea nulo: el `ctx.form` de un handler lo
  tipa sin `null` (adiós al `age ?? 0`).
- El orden de los campos es el orden posicional del cable, como hoy.
- **`require`** es una regla que fudic genera en los dos lados. Expresión: rutas de campo
  (`acceso.clave`), literales, `== != < <= > >=`, `and or not`, `contains`, `valid c`,
  `empty c`, `length c`, paréntesis. El error es el código; `on campo` lo pinta en ese campo.
  Una ruta desconocida o una comparación de tipos incompatibles es `FUD1095`; una expresión mal
  formada, `FUD1069`.
- **Los textos son plantillas**: `{n}` (min, max, min-length, max-length), los parámetros de una
  regla propia, `{detail}` en un rechazo del servidor. Un `{x}` que la regla no da es `FUD1085`.

`userForm` de `examples/basic`, entero:

```
form userForm
  validate-on blur input
  validity interacted

  name  str = ""
    required              "Escribe tu nombre."
  alias  str = ""
    required              "Elige un alias."
    min-length 3          "El alias necesita al menos {n} caracteres."
    alias-taken           "Ese alias ya está cogido."
  email  str = ""
    required              "Escribe tu email."
    pattern email-loose   "Ese email no parece válido."
  web  str = ""
    pattern web-url       "La web empieza por http:// o https://."
  acceso  group
    clave  str = ""
      required            "Elige una contraseña."
      min-length 8        "Mínimo {n} caracteres."
    repetir  str = ""
      required            "Repite la contraseña."
    summary
      require mismatch  clave == repetir                  "Las contraseñas no coinciden."

  summary
    require same-as-name  empty alias or alias != name    "El alias no puede ser tu nombre."
    require key-has-name  empty name or not acceso.clave contains name
                          "La contraseña no puede contener tu nombre."
```

Una línea que sigue a otra con un sangrado mayor que el de sus hijos y empieza por cadena es
continuación de la anterior (el texto de la última línea).

### 3.7. Reglas

```
rule <nombre>
  on field <tipo>+ | on group | on form
  runs both | runs server
  async                         # su veredicto se espera (hoy asyncValidator)
  <param>  <tipo>               # cero o más
  fails <código> [<param>]+     # uno o más; los parámetros llegan al texto
```

- `runs both`: la implementación va en `src/browser` y corre en los dos lados (hoy `validator`).
  `runs server`: va en `src/server` y solo corre al recibir (hoy `serverValidator`). No hay
  `runs client`: el veredicto tiene que ser el mismo en los dos lados.
- En `on field`, `*` es cualquier tipo y `*[]` cualquier lista (`required` es `on field *`;
  `min-length`, `on field str *[]`). Un parámetro de regla de tipo `pattern` recibe el nombre de
  un `pattern` del proyecto (`pattern email-loose` bajo un campo). Ninguno de los dos vale fuera
  de una regla (`FUD1080`). *Decidido al implementar: §3.10 los necesita y no tenían forma.*
- Bajo un campo cuyo tipo no está en `on field`, `FUD1083`. Una regla de grupo bajo un campo o al
  revés, `FUD1098`. Número o tipo de argumentos mal, `FUD1084`.

### 3.8. Middlewares

```
middleware <nombre>
  client                       # tiene mitad de navegador
  server                       # tiene mitad de servidor
  <param>  <tipo>
  adds
    <campo>  <tipo>            # lo que añade a ctx
  fails <código> <status> ["<detail>"]
```

- Al menos una mitad (`FUD1073`). `log` de hoy (`SharedMiddleware`) pasa a tener las dos.
- `adds` tipa el `ctx` de todo handler con `use <nombre>`, en el servidor y en los middlewares
  que vienen detrás.
- `skip x` de un middleware que esa función no hereda es `FUD1086`. Parámetros que faltan, sobran
  o no casan, `FUD1087`.

### 3.9. Patrones y mensajes

```
pattern email-loose  [^@\s]+@[^@\s]+\.[^@\s]+
pattern web-url      https?://.+

messages
  required  "Este campo es obligatorio."
```

- El patrón es el resto de la línea, tal cual; `#` no es comentario. **Coincidencia completa
  implícita** (el emit lo ancla `^(?:…)$`) y el vacío pasa (lo rechaza `required`). Sintaxis de
  regex de JS sin flags; una regex que no compila es `FUD1077`.
- `messages` sustituye a `setMessages`: textos globales por código. Como mucho uno en el proyecto
  (`FUD1096`).

### 3.10. Librerías y built-ins

- Un paquete publica `fudapi/` en su raíz (configurable en su `fudic.json`). El índice lee los
  `.fudapi` de la app (`src/**`) y la carpeta `fudapi/` de **cada dependencia directa** del
  `package.json` de la app. Una comprobación de existencia por dependencia; `node_modules` no se
  recorre.
- Sus implementaciones, ya compiladas, van en `server/` y `browser/` del paquete (mismas
  convenciones, mismo `fudic.json`), y la raíz generada las carga igual que las de la app.
- **`@fudic/forms`** publica `fudapi/rules.fudapi`: `required`, `min`, `max`, `min-length`,
  `max-length` (texto y listas) y `pattern`, con los mismos códigos de error y argumentos de hoy
  (`{min: n}`…) y su `range` implícito por tipo; y `fudapi/patterns.fudapi` con `email` (la regex
  de `input type=email` de WHATWG).
- **`@fudic/http`** publica `fudapi/middlewares.fudapi`: `csrf` (dos mitades, sin parámetros) y
  `error-pages` (cliente, `routes map u16 str`). Mismo comportamiento que hoy.
- **Lo que deja de ser API pública:** `get`/`post`/`put`/`patch`/`del`, `chain`, `middleware`,
  `SharedMiddleware` (`@fudic/http`); `validator`, `serverValidator`, `asyncValidator`,
  `required`, `min`, `max`, `minLength`, `maxLength`, `pattern`, los factories tipados, `form`,
  `group`, `control`, `setMessages`, `ValidateOn`, `Validity` (`@fudic/forms`). Pasan a una
  entrada interna, `@fudic/http/contract` y `@fudic/forms/contract`, que solo usa lo generado.
  Siguen públicos los errores (`HttpError`, `notFound`, `conflict`…), los tipos de `ctx` y
  `Problem`, el tipo `Form` y su API `$…`, y lo que el compilador enlaza (`./dom`, `./client`,
  `./server`).

### 3.11. Lo generado: el módulo `fudic:<id>`

`<id>` es la ruta del `.fudapi` dentro de `src/`, sin extensión (`routes/blog/[slug]`,
`components/user-form`, `rules/nif`). En una librería, `<paquete>/<ruta dentro de fudapi/>`
(`@fudic/forms/rules`). El mismo `<id>` es la URL de sus funciones:
`/_fudic/fn/<id>/<nombre><ruta>`. En la URL, cada parámetro de la página del `<id>` va con su valor
y la ruta de la función detrás, también con sus valores: `save /:id` de
`routes/blog/[slug]` es `/_fudic/fn/routes/blog/mi-post/save/42`.

Lo generado existe dos veces, con el mismo contenido de tipos:

- **`.fudic/api/<id>.d.ts`** en disco: `declare module 'fudic:<id>' { … }`. Lo lee el TypeScript
  de VS Code en los ficheros del usuario y el typecheck de fudic. Lo escriben el plugin de Vite
  (al arrancar, en build y al cambiar un `.fudapi`) y el language server (al guardar); solo si el
  contenido cambia. El tsconfig de la app incluye `.fudic/api/**/*.d.ts`.
- **El módulo virtual `fudic:<id>`**, que sirve el plugin de Vite: una variante de servidor y una
  de navegador.

Qué exporta, con `src/components/user-form.fudapi`:

```ts
declare module 'fudic:components/user-form' {
  export interface Saved { readonly id: number; readonly name: string }
  /** `form person`: el objeto que enlaza la vista. */
  export const person: Form<{ name: Str; nif: Str; email: Str; age: U8; active: Bool; notes: Str }>;
  /** `put save`, hasta `.handle`. */
  export const save: Contract<SaveCtx, Saved>;
  export type SaveHandler = (ctx: SaveCtx) => Saved | Promise<Saved>;
  /** Los `fails` de `save`: `throw SaveFails.reserved()`. */
  export const SaveFails: { reserved(): HttpError };
}
```

| Declaración | Exporta | El usuario escribe (carpeta) |
|---|---|---|
| función `f` | `f`, `FHandler`, `FFails` | `f.handle(fn)` (`server`) |
| `load` | `load`, `LoadHandler`, `LoadData` | `load.handle(fn)` (`server`) |
| `paths` | `paths`, `PathsHandler` | `paths.handle(fn)` (`server`) |
| `layout` | `layout`, `LayoutHandler` | `layout.handle(fn)` (`server`) |
| `form f` | `f` (el form) y `FValue` (su valor validado) | — |
| `type` / `enum` | la interfaz / la unión | — |
| `rule r` | `r`, `RCheck` | `r.check(fn)` (`browser` si `runs both`, `server` si no) |
| `middleware m` | `m`, `MClient`, `MServer`, `MFails` | `m.client(fn)` (`browser`) · `m.server(fn)` (`server`) |
| `pattern p` | `p` (la regex anclada) | — |

- `ctx` es el de SDD-56 (`ServerContext`): `params` tipados desde la página y la ruta de la
  función, `query` con los argumentos de query, `args` con los de cuerpo o `form` con el valor
  validado, más los `adds` de cada `use` (§3.3).
- `RCheck = (value, params) => boolean | Promise<boolean>`; con varios `fails`, devuelve `true` o
  el código que falla. El error y sus argumentos los monta lo generado.
- Lo generado importa `@fudic/*/contract` y otros `fudic:<id>`. **Nunca** importa `src/server`,
  `src/browser` ni nada del usuario.
- *Decidido al implementar:* el despacho del servidor vive en `@fudic/http/contract/server`, aparte,
  para que el navegador no lo cargue; el registro de implementaciones vive en
  `@fudic/forms/contract` (las reglas también registran) y `@fudic/http/contract` lo reexporta.
  `ApiContext.route` lleva además `pattern` (`/blog/:slug`), de donde el navegador lee los params
  de la página. Los `.d.ts` van en `.fudic/api` (`API_TYPES_DIR` de `@fudic/conventions`).
- *Decidido al implementar (Fase 8):* la raíz de cada lado se resuelve a un id con forma de
  fichero del proyecto (`<root>/fudic-root.<lado>.js`, nunca en disco), porque el
  `import.meta.glob` de un módulo sin carpeta no lo resuelve el servidor de dev. La variante de
  navegador de cada `fudic:<id>` importa la raíz de navegador. En una librería, `server/` y
  `browser/` son las carpetas por defecto (lo que publica está compilado). El registro recuerda
  su último rechazo (`takeRefusal`) para que la raíz lo relance: el ayudante de precarga del
  bundler tapa el error de un `import()` con uno suyo en el servidor. El pase edge sale siempre
  con sourcemaps, se los pida o no el cliente.

### 3.12. Lo que escribe el usuario

```ts
// src/server/alta-de-usuarios.ts
import { inject } from '@fudic/di';
import { save, SaveFails, type SaveHandler } from 'fudic:components/user-form';
import { Users } from '../services/users';

export const altaDeUsuario = ((ctx) => {
  const person = ctx.form.$value();
  if (person.name.trim().toLowerCase() === 'admin') throw SaveFails.reserved();
  return inject(Users).add(person);
}) satisfies SaveHandler;

save.handle(altaDeUsuario);
```

```ts
// src/browser/auth.ts
import { auth } from 'fudic:middlewares/auth';
export const TOKEN_KEY = 'fudic-token';
auth.client((ctx, next) => { /* … */ return next(ctx); });
```

- `.handle`, `.check`, `.client` y `.server` **registran** la implementación al evaluarse el
  módulo y no devuelven nada. `inject` y `publish` funcionan dentro como hoy (`withRequest`).
- **Dos implementaciones de la misma pieza** son un error al cargar las carpetas, con las dos
  rutas: `save of components/user-form is implemented twice: src/server/a.ts, src/server/b.ts`.
- **Una implementación en la carpeta equivocada** (un `runs server` o una mitad de servidor en
  `src/browser`, una mitad de cliente en `src/server`) es un error al cargar, con la ruta y la
  carpeta correcta. En el navegador, lo de servidor no tiene implementación posible: la variante
  de navegador del módulo lo hace fallar con ese mismo mensaje.
- Los dos errores salen en el overlay de dev y paran el build (§4.6).

### 3.13. El paquete `@fudic/api`

```ts
export const API_EXTENSION = '.fudapi';

export function parseApi(source: string): ParseResult<ApiFile>;
export function formatApi(source: string): string;

export interface ApiSource { readonly id: string; readonly path: string; readonly file: ApiFile;
                             readonly origin: 'app' | { readonly package: string } }
export function createApiIndex(sources: readonly ApiSource[]): ApiIndex;
export function validateApi(source: ApiSource, index: ApiIndex, ctx: ApiContext): readonly SourceDiagnostic[];

export function emitDeclarations(source: ApiSource, index: ApiIndex, ctx: ApiContext): string; // .d.ts
export function emitModule(source: ApiSource, index: ApiIndex, ctx: ApiContext,
                           side: 'server' | 'browser'): string;                              // virtual
```

- `ApiFile` es el árbol, con `Span` en cada nodo y la documentación de cada declaración:
  `TypeDecl`, `EnumDecl`, `FnDecl`, `LoadDecl`, `PathsDecl`, `LayoutDecl`, `ChainDecl`,
  `FormDecl` (con `FieldDecl`, `RuleUse`, `RequireRule`, `WhenBlock`, `Expr`), `RuleDecl`,
  `MiddlewareDecl`, `PatternDecl`, `MessagesDecl`, `TypeExpr`.
- `ApiIndex` resuelve un nombre de proyecto a su declaración y su `ApiSource`, lista por clase
  (las reglas aplicables a un tipo, los middlewares, los forms…) y da los candidatos de un nombre
  mal escrito.
- `ApiContext` lo pone el host: si el fichero es hermano de una ruta, sus parámetros y el tipo de
  las props de su layout.
- **Depende solo de `@fudic/diagnostics`.** Ni `@fudic/compiler` ni Oxc.

### 3.14. El `.fud`

```html
<link rel="server" href="./user-form.fudapi">
```

- Rutas y componentes, en el head, como los demás `<link>`. Varios valen. En un layout o un
  snippet, `FUD1112`. Un `href` que no existe o no es `.fudapi`, `FUD1111`.
- Lo que trae al `@code` y a la vista, sin importarlo: `data` (si es la ruta y declara `load`),
  cada función (como hoy los stubs: `search({ q })`), cada form del fichero por su nombre y los
  forms que sus funciones usan. Los tipos se importan: `import type { Person } from 'fudic:routes/usuarios'`.
- Dos `.fudapi` enlazados que dan el mismo nombre, o un nombre que choca con uno del `@code`,
  `FUD1113`. Un componente que enlaza un fichero con `load`, `paths` o `layout`, `FUD1114`. Una
  ruta que enlaza el `load` de otra ruta, `FUD1115`.
- `form:=@save` exige una función de un `.fudapi` enlazado (`FUD1005`, reescrito).
- `@server` o `@client` en el `@code` es `FUD1110`, con el texto de a dónde va cada cosa; su
  contenido se lee como si no tuviera envoltorio para no cascadear diagnósticos.

### 3.15. Configuración

```ts
// @fudic/conventions
export const SERVER_DIR = 'src/server';
export const BROWSER_DIR = 'src/browser';
export const API_DIR = 'fudapi';          // en una librería
export const HTTP_FILE = 'src/http.fudapi';
```

```json
{ "server": "src/backend", "browser": "src/front-halves" }
```

`readProjectConfig` lee `server` y `browser` (rutas relativas al proyecto, dentro de él) y da los
valores de `@fudic/conventions` cuando faltan. En una librería (`kind: lib`) son relativas al
paquete y se suma `api`. `fudic new` escribe las dos carpetas vacías con su línea en `fudic.json` y
el `include` de `.fudic/api/**/*.d.ts` en el tsconfig.

## 4. Comportamiento

### 4.1. El parser

- **Nunca lanza.** Devuelve siempre un `ApiFile`, parcial si la entrada está rota, y sus
  diagnósticos ordenados por posición.
- **Un error por sitio, sin cascada.** Una línea que no se puede colocar se avisa una vez y lo que
  cuelga de ella se salta sin diagnóstico propio (como `.fudspec` §4.1).
- **Sangrado malo:** `FUD1061` y la línea se coloca al nivel válido más cercano por debajo.
- **Contexto, no adivinanza:** qué palabras valen en una línea lo decide su padre (§3.3–§3.9). Una
  palabra que no vale ahí es `FUD1065`, con las que sí.
- **Mientras se escribe** (`ge` en vez de `get`), esa línea da un solo diagnóstico y lo que cuelga
  de ella se salta en silencio; el resto del fichero sigue en el árbol y no se pone en rojo. Dentro
  de una declaración (`us` en vez de `use`), sus hermanas siguen en el árbol de la declaración.
  *Precisado al implementar: colgar los hijos de `ge` del padre anterior los haría fallar allí,
  que es justo la cascada que esta regla evita.*

### 4.2. El validador

En este orden, cada uno sobre el nombre y con `related` a la declaración cuando la hay:

1. Nombres de proyecto: existen (`FUD1080`, con candidatos), no se repiten (`FUD1081`).
2. Nombres de fichero y de bloque: no se repiten (`FUD1082`).
3. Tipos: `map` (`FUD1089`), ciclos (`FUD1088`), valores iniciales (`FUD1094`).
4. Reglas: aplicables al tipo (`FUD1083`), en su sitio (`FUD1098`), aridad y tipos (`FUD1084`),
   plantillas (`FUD1085`), `require` (`FUD1095`).
5. Middlewares: `skip` heredado (`FUD1086`), parámetros (`FUD1087`).
6. Rutas: `load`/`paths`/`layout` en su sitio (`FUD1090`, `FUD1091`), `fails` (`FUD1093`).

### 4.3. El emisor TS

- Un form generado es **la misma declaración** que hoy escribiría `person.form.ts`, con sus
  mensajes como funciones de la plantilla: nunca comprobaciones a mano.
- Una regla `require` genera el mismo validador en los dos lados.
- Un `pattern` genera la regex anclada; `pattern email-loose` bajo un campo, `pattern(emailLoose)`.
- La variante de servidor de una función lleva su cadena y su despacho; la de navegador, el stub
  `$fn` con las mismas opciones que hoy (verbo, URL, cadena, etapas, `invalidates`). Las mitades
  de cliente de los middlewares y las reglas `runs both` se toman del registro que llenó
  `src/browser`.
- Determinista: mismo índice, mismos bytes. El `.d.ts` y el módulo virtual salen de la misma pasada.

### 4.4. La raíz generada y el despacho

El plugin de Vite escribe en memoria una raíz por lado:

```ts
// servidor
const browser = import.meta.glob('/src/browser/**/*.{ts,js}');
const server  = import.meta.glob('/src/server/**/*.{ts,js}');
// + las carpetas server/ y browser/ de cada librería con fudapi/
```

- Carga cada fichero **en secuencia**, marcando antes de qué carpeta viene, para que el registro
  detecte duplicados y carpetas equivocadas (§3.12). El navegador solo carga `browser`.
- En dev, la raíz de servidor se carga la primera vez que la necesita una petición (página,
  `load`, función) y el HMR de Vite la invalida al cambiar un fichero. Ningún recorrido propio.
- **El despacho** (`/_fudic/fn/<id>/<nombre><ruta>`) casa la URL contra los `<id>` del índice y
  la ruta de cada función (los segmentos `[x]` y `:x` con su valor), comprueba los tipos de ruta
  y query (§3.2) y busca la implementación en el registro. Sin implementación:
  `404` con `Problem`; en dev, `detail: "save of components/user-form has no implementation in
  src/server"`. Lo mismo para `load` (la página responde 404) y `paths`/`layout` (error de build
  en el prerender, como hoy cuando falta el export).
- Desaparecen el módulo `<f>.fud?server`, los prefijos `r/` y `c/` y el `<f>.fud?server` del
  wrapper: el wrapper toma `load`, `paths` y `layout` del registro por el `<id>` del `.fudapi`
  enlazado.
- Desaparecen también las borradoras de `vite/src/server-validators.ts` y `server-halves.ts`: el
  bundle de cliente nunca ve `src/server`.

### 4.5. Modo de ruta y estrategia

`vite/src/analyze.ts` deja de leer `@server`: `hasLoad`, `hasPaths`, `hasLayout` y la estrategia
salen del `.fudapi` enlazado (parser de `@fudic/api`, sin Oxc). `FUD0393` y `FUD0394` se retiran
(la estrategia ya no es una llamada); `FUD0397` y `FUD0398` siguen, con el mismo sentido.

### 4.6. Typecheck y sourcemaps

- El project checker de dev y el de build incluyen `SERVER_DIR`, `BROWSER_DIR` y
  `.fudic/api/**/*.d.ts`. Un handler con la firma mal (argumento, retorno contra `-> T`, `ctx`
  sin el `adds` que lee) da su error con fichero y línea del `.ts`: en dev, terminal y overlay; en
  build, el build falla.
- Cambiar un `.fudapi` regenera su `.d.ts` y el checker vivo vuelve a comprobar lo afectado.
- El build carga una vez la raíz de servidor tras empaquetar (la carga que hace el prerender
  cuando hay rutas `ssg`, o una carga propia cuando no): duplicados y carpetas equivocadas paran
  el build.
- El bundle de servidor sale con sourcemaps y el proceso los activa: un error en un handler da en
  la traza el `.ts` del usuario y su línea.

### 4.7. El `.fud` en el editor

- `language-core` deja de emitir `<f>.fud.server.ts`. `data`, las funciones y los forms se
  declaran en el virtual de cliente desde `fudic:<id>`
  (`declare const data: import('fudic:routes/usuarios').LoadData`).
- `<link rel="server">` entra en las piezas de `rel` y `href` del completado (solo `.fudapi`) y en
  el índice de enlaces de `typecheck`.
- Se retiran los snippets, completados y acciones de `@server`/`@client` y el arreglo que escribía
  `layout()` en el `@server`: ahora la bombilla de `FUD0702` añade `layout` al `.fudapi` hermano
  (creándolo si no existe).

### 4.8. Un único `@code`: qué evalúa el servidor

- El `@code` es código de navegador. El compilador calcula el **corte de servidor**: lo que el
  markup lee, transitivamente a través de los inicializadores — props, señales y `computed`
  (inertes, como hoy), declaraciones `const`/`let`/`function`, sus imports y sus `inject` —,
  más las llamadas `provide` de nivel superior. El SSR y el Service Worker evalúan **solo** ese
  corte; nada más del `@code` corre fuera del navegador.
- `effect` nunca está en el corte. Desaparece `FUD0570`: `effect` vale en cualquier sitio del
  `@code`.
- *Precisado al implementar:* lo que lee un enlace diferido (`@evento`, `bus:`, `ref=`) no
  siembra el corte, ni el nombre pelado de una función pasado a una prop (cruza como celda, con
  su stub en el servidor, como hoy); `props<T>()` está siempre en el corte. Un layout no tiene
  corte: su `@code` solo declara props. Sin regiones, hidrata lo que hoy hidrataba más un
  `@code` con una sentencia de nivel superior que se ejecuta al cargar (`document.title = …`,
  `setInterval(…)`); una declaración que el markup no lee no hace hidratar.
- El cliente ejecuta el `@code` entero, como hoy ejecuta neutro + `@client`.
- **El nivel de hidratación no cambia** para ningún componente ni ruta del repositorio: lo que hoy
  era neutro y no forzaba hidratar sigue sin forzarlo (§6, criterio 33).
- Lo que dependía de zonas se redefine sin zonas: `FUD0201` (una función del `@code`), `FUD0290`
  (todo el `@code`), `FUD0907` (pierde el caso «nombre de `@client`»), `FUD0901` (texto), `FUD0430`
  y `FUD0700` (un layout no enlaza `.fudapi` y su `@code` solo lleva props), `FUD0621` (sin
  `.fudapi` con `load`), `FUD1003`–`FUD1009` (ver catálogo). Se retiran `FUD0111`, `FUD0193`,
  `FUD0194`, `FUD0196`, `FUD0570`, `FUD0681`, `FUD0682`, `FUD1000`–`FUD1004`, `FUD1007`–`FUD1009`
  (su `.ts` se borra y su `.md` queda como `retired` con su sustituto).

### 4.9. El language server para `.fudapi`

Un `LanguagePlugin` que solo reconoce `.fudapi` (`languageId: 'fudapi'`) y un servicio que solo
responde ahí, como el de `.fudspec`.

| Función | Comportamiento |
|---|---|
| Diagnósticos | Parser + validador, en cada cambio, contra el índice del proyecto. |
| Completado | Palabras clave según el padre y el sangrado. Tipos tras un campo o argumento. `use ▌`: middlewares, con su `adds`. `skip ▌`: solo los heredados. Bajo un campo: las reglas aplicables a su tipo. `pattern ▌`: los patrones. `form ▌`: los forms. Argumentos de un `use` con parámetros. Dentro de un texto, tras `{`: los parámetros de la regla. En `require`: las rutas de campo. Modos, políticas y verbos. |
| Hover | Firma de la declaración, su documentación (`#` encima) y su origen (fichero o paquete). |
| Ir a la definición | Cualquier nombre → su declaración, también dentro de una librería. |
| Semantic tokens | Palabras clave, tipos, nombres de proyecto que existen frente a los que no. |
| Formato | `formatApi`: sangrado de 2, un espacio entre tokens, columnas de tipos y textos alineadas por bloque, una línea en blanco entre declaraciones. No toca un fichero con una comilla sin cerrar. |
| Generación | Al guardar un `.fudapi`, escribe su `.d.ts` (y el de quien dependa de lo que cambió). Al arrancar, los que falten o estén viejos. |
| Invalidación | Un cambio en cualquier `.fudapi` (o en el `package.json` de la app) revalida los abiertos y los `.fud` que los enlazan. |

### 4.10. VS Code

- `contributes.languages` `fudapi` (`.fudapi`, configuración, icono), `contributes.grammars`
  `source.fudapi`, `configurationDefaults` `[fudapi]` con `tabSize: 2`,
  `workspaceContains:**/*.fudapi`, `documentSelector` y `FILE_EVENTS` con `**/*.fudapi`.
- La gramática de `.fud` pierde la regla de `@server`/`@client`.
- `fudic fmt` formatea `.fudapi`; `fudic check` incluye sus diagnósticos.

### 4.11. Migración

Todo el repositorio queda sin `@server` ni `@client`:

- **`examples/basic`:** las 9 rutas y componentes con `@server` y los 43 `.fud` con `@client`;
  `src/forms/*.ts` → `.fudapi` (`person`, `userForm`, `wideForm`); `src/middlewares/*.ts` →
  `middlewares/*.fudapi` + mitades en `src/browser` y `src/server`; `src/http.ts` →
  `src/http.fudapi`; reglas `email-taken` y `alias-taken` (`runs server`). Los tests del ejemplo
  (`user-form.test.ts` y el que comprueba que `aliases.ts` no llega al cliente) siguen en verde,
  adaptados solo en lo que nombran.
- **`examples/i18n`, `examples/vista-errores`** y los demás ejemplos con regiones.
- **Fixtures** de `packages/compiler`, `packages/formatter`, `packages/testing`,
  `packages/language-core`, `packages/language-server`, `packages/vscode` y `packages/workbench`.
- **Tests** que escriben regiones: se reescriben al modelo nuevo, sin perder el caso que probaban.
- `experiments/` no se toca.

## 5. Invariantes

- **Spans en todo**, en el árbol y en cada diagnóstico.
- **Ni el parser ni el validador ni el emisor lanzan.**
- **Lo generado nunca importa código del usuario.**
- **Ningún recorrido de código del usuario** en dev ni en build para encontrar implementaciones.
- **El bundle de navegador nunca contiene `src/server`** ni la carpeta `server/` de una librería.
- **Ningún código escrito a mano:** cada error llama a la función de su código.
- **`@fudic/api` no depende de `@fudic/compiler` ni de Oxc.**
- **Cobertura al 100 %** en las cuatro métricas en `@fudic/api` desde su primer commit; ningún
  paquete tocado baja su umbral.

### Catálogo de diagnósticos

Todos son `error` salvo que se diga.

| Código | Cuándo |
|---|---|
| `FUD1060` | Comilla sin cerrar en su línea. |
| `FUD1061` | Sangrado que no es múltiplo de 2, con tabulador o que salta más de un nivel. |
| `FUD1062` | Palabra desconocida a nivel 0. |
| `FUD1063` | Declaración sin nombre. |
| `FUD1064` | Texto de más al final de una línea. |
| `FUD1065` | Palabra que no vale bajo ese padre (con las que sí). |
| `FUD1066` | Línea sangrada sin padre. |
| `FUD1067` | Tipo mal escrito (`str[`, `map str`, `?` doble). |
| `FUD1068` | Literal mal escrito (valor inicial, argumento, status). |
| `FUD1069` | Expresión de `require`/`when` mal formada. |
| `FUD1070` | Nombre con la forma equivocada para su clase (§3.1). |
| `FUD1071` | Cláusula repetida donde solo cabe una (`->`, `form`, `compress`, opciones). |
| `FUD1072` | Función con `form` y argumentos de cuerpo. |
| `FUD1073` | Bloque que no puede estar vacío (`type`, `enum`, `form`, `group`, middleware sin mitades). |
| `FUD1074` | Opción de `load` mal escrita (modo, duración, política, `page`). |
| `FUD1075` | Status fuera de rango o `compress` mal escrito. |
| `FUD1076` | Palabra clave usada como nombre de campo o argumento. |
| `FUD1077` | Regex que no compila. |
| `FUD1078` | Fichero que mezcla contrato y extensiones. |
| `FUD1079` | Más de un `chain` en un fichero. |
| `FUD1080` | Nombre que no existe (con candidatos), incluido `number`. |
| `FUD1081` | Nombre de proyecto repetido (con `related`). |
| `FUD1082` | Nombre repetido en el fichero o en el bloque. |
| `FUD1083` | Regla no aplicable al tipo del campo. |
| `FUD1084` | Regla con argumentos de más, de menos o de tipo equivocado. |
| `FUD1085` | `{x}` que la regla no da. |
| `FUD1086` | `skip` de un middleware no heredado. |
| `FUD1087` | Parámetros de middleware que faltan, sobran o no casan. |
| `FUD1088` | `type` que se contiene a sí mismo. |
| `FUD1089` | Clave de `map` que no es `str`, `uuid` ni entera. |
| `FUD1090` | `load`, `paths` o `layout` fuera del hermano de una ruta. |
| `FUD1091` | `paths` en una ruta sin parámetros o en `_error`. |
| `FUD1093` | `fails` repetido en una declaración. |
| `FUD1094` | Valor inicial que no casa con el tipo. |
| `FUD1095` | `require` con un campo desconocido o tipos incompatibles. |
| `FUD1096` | Más de un `messages` en el proyecto. |
| `FUD1097` | Regla sin `runs`, sin `on` o sin `fails`. |
| `FUD1098` | Regla de grupo/form bajo un campo, o de campo en un `summary`. |
| `FUD1099` | `:x` en la ruta de una función sin argumento `x`. |
| `FUD1100` | Argumento de ruta con el nombre de un parámetro de la página. |
| `FUD1101` | Argumento de ruta o de query que no es escalar, o de ruta con `?`. |
| `FUD1110` | `@server` o `@client` en un `@code` (dice a dónde va cada cosa). |
| `FUD1111` | `<link rel="server">` sin `.fudapi` en su `href`. |
| `FUD1112` | `<link rel="server">` en un layout o un snippet. |
| `FUD1113` | Nombre que dan dos `.fudapi` enlazados, o que choca con el `@code`. |
| `FUD1114` | Componente que enlaza un `.fudapi` con `load`, `paths` o `layout`. |
| `FUD1115` | Ruta que enlaza el `.fudapi` de otra ruta con `load`. |

Reescritos (mismo código, texto nuevo): `FUD0201`, `FUD0290`, `FUD0430`, `FUD0621`, `FUD0700`,
`FUD0901`, `FUD0907`, `FUD1005`, `FUD1006`, `FUD1010` (pasa a ser «`_error` con `load`» en el
`.fudapi`). Retirados: §4.8.

## 6. Criterios de aceptación

**Parser y formato**

1. **Ficheros canónicos.** Los de §1, §3.5, §3.6 (`userForm`) y los built-ins de §3.10 dan cero
   diagnósticos y el árbol esperado (snapshot), con la documentación de cada declaración.
2. **Spans.** Para cada nodo de los canónicos, `source.slice(span)` es su texto exacto.
3. **Saltos de línea.** `\r\n` y `\r` dan el mismo árbol (salvo offsets) y cero diagnósticos.
4. **Cada código del parser** (`FUD1060`–`FUD1079`) con una entrada mínima, sobre el span exacto.
5. **Recuperación.** Un sangrado de 3, una palabra a medio escribir y una cláusula desconocida dan
   un diagnóstico cada una y el resto del fichero queda en el árbol sin más diagnósticos.
6. **Nunca lanza.** Barrido de prefijos de cada canónico, sangrados de 0–8, comillas sueltas,
   tabuladores y `\r` sueltos: nunca lanza y todo span cumple `0 <= start <= end <= length`.
7. **Formato.** `formatApi` es idempotente, solo mueve blancos y deja intacto un fichero con una
   comilla sin cerrar.

**Validador e índice**

8. **Cada código del validador** (`FUD1080`–`FUD1098`) con una entrada mínima, sobre el nombre y
   con su `related`.
9. **Índice.** Un nombre de la app y uno de una librería (su `fudapi/`) se resuelven sin imports;
   una dependencia sin `fudapi/` no aporta nada; una carpeta `fudapi/` de una dependencia
   indirecta no se lee.
10. **Candidatos.** `requird` bajo un campo da `FUD1080` con `required` como candidato.

**Emisor**

11. **Contrato TS.** Para cada canónico, el `.d.ts` y las dos variantes del módulo son las del
    snapshot; los `.d.ts` compilan con `tsc` estricto.
12. **Forms equivalentes.** `person`, `userForm` y `wideForm` generados dan los mismos veredictos,
    mensajes, `$issues()`, orden posicional y bytes binarios que los `.ts` de hoy, sobre la misma
    batería de valores (incluidos `required` en un grupo, el `summary` de `userForm` y un número
    fuera de rango). *Precisado al implementar:* los bytes se comparan en `person`, que ya viaja en
    binario; `userForm` y `wideForm` son hoy controles sin tipo (JSON) y los generados tienen tipo,
    así que pasan a binario y se compara su valor, no sus bytes.
13. **Patrón anclado.** `pattern web-url` rechaza `xhttp://a` y acepta `http://a`; el vacío pasa.
14. **Sin imports del usuario.** Ningún módulo generado importa nada fuera de `@fudic/*` y
    `fudic:*`.

**Implementaciones y despacho**

15. **Registro.** `save.handle(fn)` en `src/server` hace que `PUT /_fudic/fn/components/user-form/save`
    llegue a `fn` con `ctx.user` (de `auth`) y `ctx.form` validado y sin `null` en `age`.
16. **404.** Sin `save.handle`, la llamada da `404` con `Problem`; en dev, el `detail` nombra la
    función, el `<id>` y la carpeta; en producción, no.
17. **Duplicado y carpeta equivocada.** Dos `save.handle` dan el error de §3.12 con las dos rutas;
    un `nifUnique.check` en `src/browser` da el error de carpeta. Los dos paran `vite build` y
    salen en el overlay de dev.
18. **Typecheck.** Un `satisfies SaveHandler` sobre una función que devuelve `string` hace fallar
    `vite build` con la línea del `.ts`, y en dev sale en el overlay sin parar el servidor.
19. **Sourcemaps.** Un `throw` en un handler da en la traza el fichero `.ts` de `src/server` y su
    línea.
20. **Sin recorridos.** Ni el arranque de dev ni el build invocan Oxc sobre `src/server` ni
    `src/browser` (espía sobre el parser).
21. **Navegador limpio.** El bundle de cliente de `examples/basic` no contiene nada de
    `src/server` (el marcador de `data/aliases.ts` no aparece).
22. **Configurable.** Con `"server": "src/backend"` en `fudic.json`, los handlers de esa carpeta
    responden y los de `src/server` no se cargan.
23. **Built-ins.** `required`, `min`, `max`, `min-length`, `max-length`, `pattern`, `csrf` y
    `error-pages` se comportan como hoy (los tests de `@fudic/forms` y `@fudic/http` sobre esas
    piezas siguen en verde, reescritos sobre lo generado).
36. **Ruta, query y cuerpo.** `put save /:id` con `query notify bool` y `active bool`, en la ruta
    `blog/[slug]`: `save({ id, notify, active })` desde el navegador llega al handler con
    `ctx.params` = `{ slug, id }`, `ctx.query.notify` y `ctx.args.active`, cada uno con su tipo; la
    URL es la de §3.11. Lo mismo con `form` en lugar de `active`.
37. **`uuid`.** Un `id uuid` acepta cualquier UUID (mayúsculas o minúsculas) y un `id str` acepta
    `abc`; un `id uuid` o un `id i32` con `abc` dan `400` con `Problem` en el servidor, y en el
    navegador rechazan sin enviar. Un campo `uuid` de un form da su error `uuid` y deja pasar el
    vacío.

**El `.fud`**

24. **Enlace.** `<link rel="server">` en una ruta da `data` tipado, las funciones y los forms en la
    vista y en el `@code`; `FUD1111`–`FUD1115` con una entrada mínima cada uno.
25. **Regiones.** `@server { }` y `@client { }` dan `FUD1110` y un único diagnóstico por región.
26. **Modo de ruta.** Las rutas de `examples/basic` salen con el mismo modo y la misma estrategia
    que hoy (`blog` en `sw` con `5m cache-first`, `di` y `mapas` en `ssg`, `usuarios` y
    `sesion/[user]` en `ssr`, `blog/[slug]` en `ssg` con sus `paths`).

**Editor**

27. **Diagnósticos en vivo.** Abrir un `.fudapi` publica los del parser y el validador; corregir
    la línea los retira; tocar el `.fudapi` de una regla revalida el que la usa.
28. **Completado.** Cada fila de la tabla de §4.9 con un caso.
29. **Hover y definición.** Sobre `use auth`: firma, `adds` y documentación; ir a la definición
    abre `middlewares/auth.fudapi`; sobre `required`, abre el de `@fudic/forms`.
30. **Generación al guardar.** Guardar un `.fudapi` actualiza su `.d.ts` y el TS server del
    fichero de `src/server` que lo importa ve el cambio.
31. **Aislamiento.** Ningún servicio del `.fud` responde en un `.fudapi`; la suite del language
    server sigue verde.

**Producto**

32. **`examples/basic` igual que hoy.** Sin `@server` ni `@client`. `pnpm dev`, `pnpm build` y
    `pnpm preview`: mismas rutas, mismo HTML de cada página prerenderizada (comparado contra el
    build de `main`, salvo nombres de chunk y URLs de funciones), mismas pruebas del ejemplo en
    verde, y en el navegador `usuarios` (buscar, cancelar, activar, borrar, `crash`, sesión) y el
    alta de `user-form` (letra del NIF, email cogido, 409 de `admin`) se comportan igual.
33. **Hidratación igual.** El nivel de hidratación de cada componente y ruta del repositorio es
    el mismo antes y después (tabla comparada en un test).
34. **Repositorio sin regiones.** Ningún `.fud` fuera de `experiments/` contiene `@server` ni
    `@client`.
35. **Entrega.** `pnpm typecheck`, `pnpm test` y `pnpm build` en verde; `@fudic/api` al 100 % en
    las cuatro métricas sin `v8 ignore`; ningún umbral baja.

## 7. Fuera de alcance

- **Otros backends** (C#, Java, Go, Rust…), su emisión y su suite de conformidad.
- **La lista blanca de la vista y el recorte de la stdlib** (enmienda de SDD-51): el corte de
  servidor de §4.8 evalúa TS completo.
- **Traducir regex por destino** y prohibir lookaround/backreferences.
- **El fake y el preview** (IDEA-05 §8), **partial views** (IDEA-06 §10.7).
- **i18n de los textos de los forms** (nota 3 de IDEA-06): los textos se quedan donde están hoy.
- **Enteros de 64 bits.**
- **Ejemplos en la declaración de una regla** (`ok`/`ko`, IDEA-06 §6.4).
- **Una acción «crear implementación»** en el editor.
