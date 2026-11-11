# SDD-82 — Specs de página y de flujo: la `.fudspec` sale del componente

> **Estado:** `Listo` (2026-11-08) — [tareas](./SDD-82-Task.md).
> **Paquetes:** `@fudic/spec` · `@fudic/terms` · `@fudic/workbench` · `@fudic/vite` · `@fudic/http` · `@fudic/api` ·
> `@fudic/testing` · `@fudic/language-server` · `@fudic/vscode` · `@fudic/cli` · `@fudic/mcp` ·
> `@fudic/diagnostics` · `examples/basic`
> **Depende de:** 32 (el banco), 52 y 53 (la `.fudspec` y su autoría), 57 (`@fudic/testing`: `visit`
> con `data`, servicios sustituidos), 66 (generadores), 68 (invalidar y repintar), 69 (sesión por
> cookie), 70 (`later` y `@await`), 77 y 78 (el MCP), 80 (reglas `remote`), 81 (ficheros). Todas en
> `Hecho` salvo 80 y 81, que tienen que estarlo antes de empezar.
> **Enmienda:** SDD-52 §3 (cabeceras, orden de bloques, referencias) y §8.3 (fixture por defecto).
> **Rango de diagnósticos:** `FUD1500`–`FUD1519` (nuevo).
> **Decisiones de gramática:** ninguna (la `.fudspec` es de SDD-52, no de la gramática del `.fud`).
> **Origen:** conversación con Pedro del 2026-11-08, sobre la nota 5 de `docs/PENDIENTE.md`.
> **Rama sugerida:** `sdd-82-specs-de-pagina-y-de-flujo`, desde `main` con SDD-81 ya mezclada.
>
> **Qué añade en una frase.** Una `.fudspec` puede ser de un componente, de una ruta (`page
> /usuarios`, con fixtures que sustituyen el `load`, las llamadas y `paths`, y el `layout` de verdad)
> o de un flujo entre páginas (`flow alta-de-usuario`, con el servidor de verdad y sus datos en
> memoria por criterio); `when` y `then` se alternan; el vocabulario cubre navegación, formularios,
> sesión, idioma, medios, reloj, red, varias personas a la vez, cabeceras, ficheros y el registro de
> llamadas; el banco espera a que la página esté quieta antes de cada `then`; y una ejecución contra
> el servidor real se puede grabar como fixture.

---

## 1. Contexto y objetivo

### 1.1. Lo que hay hoy

- **La cabecera solo es `component <tag>`** ([parse.ts:91-104](../../packages/spec/src/parse.ts)); sin
  ella, `FUD0922`.
- **Cada bloque una vez y en orden**: `FUD0930` si un bloque no va detrás del anterior
  ([parse.ts:131-133](../../packages/spec/src/parse.ts)). Un flujo no se puede escribir.
- **`given` no tiene ningún término**: `terms/given/` está vacío. La única línea es `props`, a mano
  en el validador. El `given route /playground/button` del ejemplo de SDD-52 nunca existió.
- **El banco solo monta componentes.** Escribe una página por criterio en
  `node_modules/.fudic-bench/<pid>/routes/<tag>/<slug>.fud` y arranca un solo Vite con ese
  `routesDir` y sin la configuración del usuario ([vite.ts](../../packages/workbench/src/vite.ts),
  [project.ts:43](../../packages/workbench/src/project.ts)).
- **«La página ha terminado» solo mira la hidratación**: `settled` espera `fud:hydrated` y un
  `requestAnimationFrame` ([settle.ts:33](../../packages/workbench/src/settle.ts)). Ni peticiones ni
  temporizadores. Un `then` en negativo («no hay ninguna fila») pasa antes de que llegue la respuesta.
- **Una referencia es un tag o un rol con nombre exacto** ([locate.ts:44](../../packages/terms/src/locate.ts)).
  En una tabla hay un «Borrar» por fila y no hay forma de decir «el de la fila de Ana».
- **Sin Service Worker en el banco**, sin cookies, sin idioma, sin reloj.
- **Lo que sí existe**, en `@fudic/testing` (SDD-57): `visit(url, { data })` sustituye el `load` y
  ejecuta el `layout` con esos datos; `ProviderOverride` sustituye servicios por DI en el servidor; el
  wrapper de una ruta ya hace `ctx.data ?? load` y `ctx.layout ?? layout`.

### 1.2. Lo que decidió la conversación

1. **Tres clases de spec**: componente (lo que hay), página y flujo.
2. **En una página, lo que nombra la fixture es falso y lo demás es de verdad**: el `layout` siempre
   de verdad; el `load` si no hay `data`; cada función que no está en `answers`; `paths()` si la
   fixture no trae `paths`.
3. **En un flujo, el servidor es de verdad** y la fixture solo sustituye dónde se guardan los datos
   (`services`), con una instancia por criterio.
4. **`when` y `then` se alternan.**
5. **No queda nada fuera** (§7).

### 1.3. El objetivo

Que se escriban los ejemplos de §4.9 —una página con su fixture, `paths` y `layout`, y un flujo de
alta—, que el editor ayude en cada línea, y que el banco, la CLI y el MCP los ejecuten.

---

## 2. Dependencias

| SDD | Qué aporta |
|---|---|
| 32 | El banco: `startProject`, `runCriterion`, `runPool`, `BenchExtension`, `TermHost`, el informe |
| 52, 53 | La `.fudspec`: líneas, bloques, términos por fichero, `props`, `<tag>.fixture.ts`, el servicio del editor, `fudic g spec`/`g term` |
| 57 | `visit` con `data`, `renderPage`, `ProviderOverride`, `serveOverrides` |
| 66 | Los generadores de fixtures (`fixtureModule`, `fixtureEntry`) |
| 68 | `invalidates`: la página pide su `data` otra vez |
| 69 | La sesión por cookie, `use auth` |
| 70 | `later`, `@await`, el endpoint de datos por frames |
| 77, 78 | `fudic_spec_run`, `fudic_render`, `fudic_preview`, la guía |
| 80 | Las reglas `runs remote` y su ruta `/_fudic/rule/…` |
| 81 | `file`, `-> file`, `url()` de una `get` (con su firma en `$sig`), el gesto `upload` de `@fudic/testing` y `$cancel()` de un formulario |

---

## 3. Interfaz pública

### 3.1. Las tres cabeceras

| Cabecera | Fichero | Qué monta |
|---|---|---|
| `component <tag>` | `<tag>.fudspec`, junto al `.fud` | El componente solo, como hoy |
| `page <ruta>` | `<ruta>.fudspec`, junto al `.fud` de la ruta | La ruta con su layout, por su URL |
| `flow <nombre>` | `src/flows/<nombre>.fudspec` | Nada: cada criterio empieza con `url` |

`<ruta>` se escribe como la ruta en disco, desde `routes/` y sin extensión: `page /usuarios`,
`page /blog/[slug]`, `page /` para `index.fud`. Una ruta que no existe es `FUD1500`. `FUD0922` pasa a
decir «falta la cabecera: `component`, `page` o `flow`».

### 3.2. El orden de los bloques

```
criterion <slug>
  given        # como mucho una vez, y la primera
  when
  then
  when         # when y then se alternan tantas veces como haga falta
  then         # el criterio acaba en then
```

`FUD0930` pasa a decir: `given` después de otro bloque, o dos bloques iguales seguidos. `FUD0933`
(falta `then`) pasa a «el criterio no acaba en `then`». Vale en las tres clases.

### 3.3. Las referencias

```
ref   := paso ( '>' paso )*
paso  := tag | 'role:' rol ( '/' nombre )?
nombre:= '"' texto '"'      # el nombre accesible exacto, como hoy
       | '~"' texto '"'     # el nombre accesible contiene el texto
```

`role:row/~"Luis">role:button/"Borrar"`: el botón «Borrar» dentro de la fila cuyo nombre contiene
«Luis». Cada paso busca dentro del anterior y atraviesa shadow roots. La regla de siempre: la
referencia entera tiene que dar un elemento. Un `>` sin paso o un `~` sin texto es `FUD1509`.

### 3.4. La fixture de una página

`<ruta>.fixture.ts`, junto a la ruta. El tipo lo genera el `.fudapi` de la ruta:

```ts
// routes/usuarios.fixture.ts
import type { Fixtures, Person } from 'fudic:routes/usuarios';
import { fails, later, redirects, file } from '@fudic/spec';

const ana: Person = { id: 1, name: 'Ana', email: 'ana@fudic.dev', age: 34, active: true, notes: '' };
const luis: Person = { id: 2, name: 'Luis', email: 'luis@fudic.dev', age: 41, active: true, notes: '' };

export default {
  data: {
    'dos-personas': { users: [ana, luis] },
    'con-ana-dentro': { users: [ana, luis], session: 'ana' },
    'nadie': { users: [] },
    'caido': fails(503, 'la base de datos no responde'),
    'sin-sesion': redirects('/entrar'),
  },
  calls: {
    'entra-ana': { login: undefined },
    'busca-luis': { search: [luis] },
    'buscando': { search: later.never() },
    'ana-no-se-desactiva': { save: fails('ana') },
    'luis-borrado': { remove: undefined },
    'sin-sesion': { remove: fails(401, 'sin sesión') },
    'csv': { exportar: file('./fixtures/personas.csv', { type: 'text/csv' }) },
  },
  services: {},
} satisfies Fixtures;
```

**El tipo `Fixtures` que genera el `.fudapi`** de una ruta (en `fudic:routes/<ruta>`):

```ts
export interface Fixtures {
  /** What load returns, by name; only when the route declares load. */
  readonly data?: Readonly<Record<string, FixtureOf<LoadData> | Failed | Redirected>>;
  /** What paths gives; only when the route declares paths. */
  readonly paths?: readonly string[];
  /** What each function or remote rule answers, by name. A function that is not here runs for real. */
  readonly calls?: Readonly<Record<string, {
    readonly save?: Answer<void, 'ana'>;
    readonly search?: Answer<readonly Person[]>;
    // …una entrada por función de la ruta y de los componentes que usa, y por regla remote…
  }>>;
  /** The services each criterion puts in place of the real ones, by name. */
  readonly services?: Readonly<Record<string, readonly ProviderOverride[]>>;
}
```

- `FixtureOf<T>` cambia cada `Promise<U>` (un campo `later`) por `U | Later<U>`.
- `Answer<R, C>` es `R | Later<R> | Failed<C> | Redirected`, y un `-> file` acepta `file(…)`.
- `fails(status, title)` y `fails(código)`; este último solo acepta los códigos del `fails` de esa
  función (`C`).
- `later(ms, v)`, `later.never()`, `later.fails(ms, status, title)` (SDD-70).
- `redirects(location, status = 303)`.
- `file(path, { type?, name? })`: un fichero junto a la fixture.
- Todos devuelven datos, no promesas (`{ $later: 2000, value: 10 }`): la fixture se serializa y el
  editor la lee sin ejecutarla, como hoy.
- Las reglas `remote` (SDD-80) se responden en `calls` por su nombre: `{ 'alias-taken': fails('alias-taken') }`.

### 3.5. La fixture de un flujo

`src/flows/<nombre>.fixture.ts`:

```ts
import type { FlowFixtures } from '@fudic/spec';
import type { Calls } from 'fudic:routes/usuarios';
import { fails } from '@fudic/spec';
import { Users } from '../services/users';
import { MemoryUsers } from '../services/memory-users';
import { ana, luis } from './people';

export default {
  services: {
    'dos-personas': [{ provide: Users, use: () => new MemoryUsers([ana, luis]) }],
    'vacio': [{ provide: Users, use: () => new MemoryUsers([]) }],
  },
  calls: {
    'save-sin-red': { save: fails(0, 'network') },
  },
} satisfies FlowFixtures;
```

- `services` es código: el banco lo ejecuta en su servidor. **Cada `use` se llama una vez por
  criterio**: lo que crea un criterio lo ven todas sus páginas y ningún otro criterio.
- `calls` en un flujo tipa contra la unión de las funciones del proyecto.
- `fails(0, …)` es un fallo de red: la petición no llega a tener respuesta.

### 3.6. Las líneas de fixture

Son del validador, como `props` hoy: no son módulos de término.

| Línea | En | Bloque | Qué hace |
|---|---|---|---|
| `props <nombre>` | componente | `given` | Como hoy |
| `data <nombre>+` | página | `given` | El `load` devuelve la primera; cada vez que la página pide su `data` otra vez (un `invalidates`), la siguiente; la última se repite |
| `answers <nombre>+` | página, flujo | `given` | Las respuestas de esos grupos de `calls`, juntas; si dos responden la misma función, gana la última |
| `services <nombre>` | página, flujo | `given` | Los servicios de ese grupo |
| `path <valor>` | página | `given` | La URL de la ruta con ese valor de `paths` de la fixture |
| `url <url>` | página, flujo | `given` | La URL con la que se abre (en una página, tiene que casar con su patrón) |

- Una línea en la clase que no le toca es `FUD1501`.
- Un nombre que la fixture no tiene es `FUD0950`, y sin fichero de fixture, `FUD0953`. Los dos se
  generalizan a cualquier línea de fixture.
- Repetida o fuera de `given`: `FUD0952`, también generalizado.
- `path` con un valor que no está en `paths`: `FUD1502`. `url` que no casa con el patrón: `FUD1503`.
- Una página cuya ruta tiene parámetros y el criterio no trae `path` ni `url`: `FUD1504`.
- En un flujo, la URL de `url` o de `go` que no casa con ninguna ruta: `FUD1505`, warning.

### 3.7. El vocabulario de `@fudic/terms`

Lo de hoy sigue. Lo nuevo, cada uno un módulo `.js` con su `meta`, como los de hoy:

**`given`**

| Término | Parámetros | Qué hace |
|---|---|---|
| `cookie` | `name:token` `value:string` | Pone la cookie antes de abrir |
| `locale` | `tag:token` | La página en ese idioma: `Accept-Language` y `navigator.language` |
| `media` | `feature:token` `value:token` | `prefers-color-scheme dark`, `prefers-reduced-motion reduce`, `forced-colors active`… |
| `viewport` | `width:number` `height:number` | El tamaño de la ventana |
| `clock` | `at:string` | La hora, ISO 8601, en el navegador y en el servidor del criterio |
| `offline` | — | Abre sin red (con el SW instalado antes por una visita) |

**`when`**

| Término | Parámetros | Qué hace |
|---|---|---|
| `go` | `url:string` | Escribe la URL en el navegador |
| `back`, `forward`, `reload` | — | Historial y recarga |
| `check`, `uncheck` | `target:element` | Marca o desmarca |
| `select` | `target:element` `option:string` | Elige por el texto de la opción |
| `hover` | `target:element` | Pasa el ratón |
| `upload` | `target:element` `file:string` | Elige ese fichero (ruta relativa a la `.fudspec`) en un `<input type="file">`; `FUD1511` si no existe |
| `wait` | `ms:number` | Avanza el reloj ese tiempo (el del navegador y el del servidor del criterio) |
| `offline`, `online` | — | Corta o devuelve la red |
| `as` | `who:token` | Lo que sigue lo hace otra persona: su propio navegador, con sus cookies y su SW, que se crea la primera vez que se nombra. `as main` vuelve a la primera |

`as` vale también en `given` y en `then`: es una línea del validador en cualquier bloque.

**`then`**

| Término | Parámetros | Qué comprueba |
|---|---|---|
| `title` | `expected:string` | El `<title>` del documento |
| `url` | `expected:string` | La ruta y la query donde está la página |
| `status` | `code:number` | El estado de la última respuesta de documento (un `_error.fud` con su código) |
| `count` | `target:element` `n:number` | Cuántos elementos da la referencia (aquí no se exige uno) |
| `value` | `target:element` `expected:string` | El valor de un control |
| `checked`, `unchecked` | `target:element` | El estado de una casilla |
| `enabled`, `disabled` | `target:element` | Si se puede usar |
| `called` | `fn:token` `times:number` | Cuántas veces se llamó a la función en el criterio |
| `sent` | `fn:token` `field:token` `expected:string` | En la última llamada a `fn`, el campo (con puntos: `user`, `docs.0`) valía eso. Un fichero vale su nombre |
| `lists` | `value:string` | El `paths()` de verdad incluye ese valor |
| `not-reloaded` | — | El documento es el mismo que antes del último `when` |
| `requests` | `n:number` | Peticiones que salieron durante el último `when` (documento, datos, funciones, reglas, recursos) |
| `header` | `name:token` `expected:string` | Cabecera de la última respuesta de documento |
| `downloaded` | `name:string` | El último `when` descargó un fichero con ese nombre |

`fn` en `called` y `sent` tiene que ser una función que la página o el flujo pueden llamar:
`FUD1506`. `field`, un argumento de esa función: `FUD1507`.

### 3.8. El banco

```ts
// @fudic/http/contract/server — lo que el servidor lee del banco, si está (§4.3, §8.2.13)
export interface BenchHooks {
  /** The criterion a request belongs to: from its cookie. */
  criterionOf(request: Request): string | undefined;
  /** The data of the next data request of the criterion for the route `<id>`; absent runs load. */
  data(criterion: string, route: string): Held | undefined;
  /** The answer of a call or a remote rule by its name; absent runs it. */
  answer(criterion: string, name: string, args: Readonly<Record<string, unknown>>): Held | undefined;
  /** A call is done, answered or not: the log of §4.4. */
  called(criterion: string, call: BenchCall): void;
  /** The criterion's services, put into the request's root container. */
  services(criterion: string): readonly ServiceOverride[];
  /** The criterion's clock, for the server's Date. */
  now(criterion: string): number | undefined;
  /** Resolves `ms` later on the criterion's clock: what a `later` of the fixture waits on. */
  after(criterion: string, ms: number): Promise<void>;
  /** What the real server answered, for `record` (§3.9, §8.2.35). */
  record?(criterion: string, entry: Recorded): void;
}
/** Present even when it holds `undefined`: the answer of a `void` function. */
export interface Held { readonly value: unknown }
```

- **Dos Vite por proyecto**: el de hoy para los componentes y otro, el de la app, para páginas y
  flujos, con la configuración del usuario (`vite.config`) y su `routesDir` real.
- **El criterio viaja en una cookie**, `fudic-bench=<ejecución>.<criterio>`, que el banco pone en el
  contexto de navegador de cada criterio. La llevan la navegación, las llamadas, el endpoint de datos,
  las reglas remotas y las peticiones del SW.
- **Un backend que no es el servidor TS de fudic** (IDEA-05) recibe esa misma cookie. El banco sirve
  `GET /__bench/criterion/<id>` → `{ services, answers, clock }` (los nombres): ese backend decide con
  ellos cómo sembrarse. Es el contrato.
- **El SW se instala** en páginas y flujos: el banco arranca el Vite de la app con `sw.json` en modo
  `"dev": "preview"`, que ya existe.

### 3.9. Grabar

```
fudic-workbench record routes/usuarios.fudspec --criterion entrar-como-ana
fudic-workbench record src/flows/alta-de-usuario.fudspec
```

Ejecuta los criterios contra el servidor de verdad, sin `data` ni `answers`, y escribe en la fixture:

- en una página, cada `data` que pidió la ruta, con el nombre `<criterio>` (y `<criterio>-2`, … si
  la pidió más de una vez), y cambia `data` en la `.fudspec` para nombrarlos;
- en los dos, cada respuesta de función en `calls['<criterio>']`, y añade `answers <criterio>`;
- un `File` recibido, como `file('./fixtures/<criterio>/<nombre>')`, con sus bytes al lado.

Un valor que no se puede escribir como literal es `FUD1515` y no se graba. Lo que ya existe con ese
nombre se sustituye. El MCP lo hace con `fudic_spec_run { record: true }`.

### 3.10. CLI, editor, MCP y testing

- **CLI**: `fudic g spec /usuarios` escribe la `.fudspec` de la página y su fixture con un `data`
  de ejemplo hecho con la forma de `LoadData`, `paths` si la ruta lo declara, y `calls` vacío.
  `fudic g flow <nombre>` escribe la del flujo y su fixture con `services` vacío.
  `fudic-workbench run` ejecuta las tres clases.
- **Editor**:
  - completado de las cabeceras (rutas en `page`) y de las líneas de fixture con los nombres de la
    fixture;
  - en `path`, los valores de `paths`; en `url`, `go` y `then url`, las rutas del proyecto;
  - en `called` y `sent`, las funciones que la página puede llamar y sus argumentos;
  - en `as`, los nombres ya usados;
  - hover e ir a la definición de cada nombre (a su clave en la fixture, a la función en el
    `.fudapi`, a la ruta);
  - bombillas: crear la fixture, añadir la entrada que falta, `FUD1504` → añadir `path` con el
    primero de `paths`;
  - la gramática TextMate con `page`, `flow`, las líneas nuevas, `>` y `~`.
- **MCP**:
  - `fudic_spec_run` acepta una ruta o un flujo, y `record`;
  - `fudic_render` y `fudic_preview` de una ruta aceptan `fixture: { data, answers }`;
  - la guía `fudspec.md` (y su copia en español) gana «Pages» y «Flows».
- **`@fudic/testing`**: `visit(url, { fixture: 'dos-personas', answers: ['busca-luis'] })` lee la
  fixture de la ruta y la aplica como el banco. Una fixture sirve a la spec, al test unitario y al
  MCP.

### 3.11. Los códigos

| Código | Sev. | Título (`.md`) | Cuándo |
|---|---|---|---|
| `FUD1500` | error | The page does not exist | `page /x` sin ruta |
| `FUD1501` | error | A line for another kind of spec | `data` en un componente, `props` en una página… |
| `FUD1502` | error | A path the fixture does not list | `path x` sin `x` en `paths` |
| `FUD1503` | error | A URL of another route | `url` que no casa con el patrón de la página |
| `FUD1504` | error | The route needs its params | Ruta con parámetros, criterio sin `path` ni `url` |
| `FUD1505` | warning | A URL no route answers | `url` o `go` de un flujo que no casa con ninguna ruta |
| `FUD1506` | error | A function the page cannot call | `called`/`sent` con una función fuera de su alcance |
| `FUD1507` | error | Not an argument of that function | `sent` con un campo que la función no tiene |
| `FUD1508` | error | The page did not settle | El banco: la página no se quedó quieta a tiempo (§4.5) |
| `FUD1509` | error | A reference that does not parse | `>` sin paso, `~` sin texto |
| `FUD1510` | error | A fixture value the editor cannot read | Una entrada de `data`/`calls` que no es un literal (spread, llamada a otra cosa) |
| `FUD1511` | error | The file to upload does not exist | `upload` con una ruta que no existe |
| `FUD1512` | error | Two people, one name | `as` con un nombre que choca con un término |
| `FUD1513` | error | No paths to list | `lists` en una ruta sin `paths` |
| `FUD1514` | error | A fixture answer of the wrong kind | El banco: `answers` responde con un fichero una función sin `-> file`, o al revés |
| `FUD1515` | warning | A value that cannot be recorded | `record` con un valor que no se escribe como literal |
| `FUD1516` | error | A name the route's fixture does not have | `fudic_render`/`fudic_preview` con un nombre que la fixture de la ruta no tiene (§8.2.46) |
| `FUD1517` | error | The route has no fixture | `fudic_render`/`fudic_preview` con `fixture` y sin `<ruta>.fixture.ts` (§8.2.46) |

`FUD0922`, `FUD0930`, `FUD0933`, `FUD0950`, `FUD0952` y `FUD0953` cambian de texto (§3.1, §3.2,
§3.6).

---

## 4. Comportamiento

### 4.1. El parser y el validador

- `levelOf` reconoce `page` y `flow` a nivel 0. `ComponentDecl` pasa a `HeaderDecl` con
  `kind: 'component' | 'page' | 'flow'` y su argumento.
- El orden de bloques de §3.2 sustituye al índice creciente.
- `role:` con `~` y `>`: el parser lo deja en `RoleArg` con `steps`, cada uno con su modo de nombre.
- `SpecContext` gana `page(route)` (la ruta, su patrón, su `.fudapi`, su fixture leída sin ejecutar) y
  `functions(scope)` (lo que la página o el proyecto pueden llamar, con sus argumentos). El editor,
  el banco y el `check` del proyecto lo construyen igual (`specContextOf`).
- `readFixtures` lee las claves de `data`, `paths`, `calls` y `services` (y la forma de hoy, para un
  componente). `paths` se lee como lista de literales; si no lo es, `FUD1510`.

### 4.2. Montar un criterio de página

1. Contexto de navegador nuevo con la cookie `fudic-bench`, y las de `cookie`, `locale`, `media`,
   `viewport` y `clock` del `given`.
2. `goto` a la URL (`path`, `url` o el patrón sin parámetros).
3. Cada petición con la cookie pasa por los `BenchHooks`:
   - el render de la ruta y el endpoint de datos piden `data(criterio, ruta, n)`: con fixture, el
     wrapper recibe `ctx.data` (los `later` se vuelven promesas que se cumplen a su tiempo);
     `Failed` lanza su `HttpError` y `Redirected` su redirección; sin fixture, `load` de verdad;
   - el `layout` se ejecuta siempre de verdad, con la `data` que haya;
   - cada llamada y cada regla `remote` piden `answer(…)`: con respuesta, se responde en el formato
     de la función sin ejecutar el handler (ni sus middlewares); sin ella, de verdad. Las dos quedan
     en el registro del criterio;
   - el contenedor raíz de la petición recibe `services(criterio)`.
4. Un prerender no se usa: con la cookie, la ruta se pinta siempre a demanda.

### 4.3. Montar un criterio de flujo

Igual, sin `data`. La instancia de cada servicio de `services` se crea al empezar el criterio y vive
hasta que acaba. `as <nombre>` abre otro contexto de navegador con la misma cookie de criterio (es la
misma ejecución y los mismos servicios) y sin las demás cookies.

### 4.4. El registro de llamadas

Por criterio, en orden: nombre, argumentos decodificados (los ficheros, por su nombre), si se
respondió con la fixture o de verdad, y el estado. `called` y `sent` lo leen. El informe del banco lo
enseña en cada paso, y `fudic_spec_run` lo devuelve.

### 4.5. La página quieta

Un script de inicio cuenta, en cada documento y en el SW, las peticiones en vuelo (`fetch`, XHR,
navegación, `EventSource` abierto no cuenta), los `setTimeout` pendientes que vencen en menos de un
segundo y los `requestAnimationFrame`. Después de cada `when` y antes de cada `then`, el banco espera
a que los tres estén a cero y siga así durante un frame, con el tiempo límite de llamada (5 s). Si no
llega, `FUD1508` con lo que seguía pendiente. Un `setInterval` no cuenta: un reloj en la página no la
deja nunca quieta.

Además, un `then` en positivo reintenta hasta el mismo tiempo límite (un `later(2000, …)` llega a los
dos segundos); uno en negativo (`count … 0`, `hidden`, `unchecked`…) se evalúa una vez, con la página
quieta.

### 4.6. El reloj

`clock` instala el reloj falso de Playwright en el navegador y pone la hora de `now(criterio)` en el
servidor; los `later` de la fixture cuentan con ese reloj. `wait <ms>` avanza los dos. Los dos están
parados entre un `wait` y otro, y la página quieta no espera a lo que solo el reloj puede mover
(§8.2.27–28).

### 4.7. Sin red

`when offline` pone el contexto sin red (`context.setOffline(true)`); las peticiones que el SW sirve
de su caché siguen funcionando, las demás fallan como en un navegador. `given offline` hace primero
una visita con red para instalar el SW y después corta.

Un criterio con `offline` corre contra la app construida y servida con `vite preview` (en dev el SW
no pinta ninguna ruta): el build del banco, que respeta las fixtures como dev (§8.2.24–25).

### 4.8. Componentes

Una spec de componente no cambia, salvo que también puede alternar bloques, usar las referencias
nuevas y el vocabulario nuevo que tenga sentido sin servidor (`check`, `select`, `hover`, `upload`,
`value`, `count`, `media`, `viewport`, `clock`, `wait`…).

### 4.9. Los ejemplos

En `examples/basic`, que gana `/entrar` con un formulario que lleva a `/` («Hola, Ana»),
`/usuarios/nuevo` (el alta en su propia página) y `MemoryUsers`.

**`routes/usuarios.fudspec`**

```
page /usuarios

criterion lista-las-personas
  given
    data dos-personas
  then
    title "Usuarios — fudic"
    count role:button/"Borrar" 2
    text role:row/~"Ana" "ana@fudic.dev"

criterion sin-nadie-la-tabla-queda-vacia
  given
    data nadie
  then
    count role:button/"Borrar" 0

criterion entrar-como-ana
  given
    data dos-personas con-ana-dentro
    answers entra-ana
  when
    click role:button/"Entrar como Ana"
  then
    sent login user "ana"
    text body "Sesión: ana"

criterion mientras-busca-lo-dice
  given
    data dos-personas
    answers buscando
  when
    type role:searchbox/"Buscar por nombre" "lu"
  then
    text role:status "Buscando…"

criterion a-ana-no-se-la-desactiva
  given
    data dos-personas
    answers ana-no-se-desactiva
  when
    uncheck role:row/~"Ana">role:checkbox/"Activo"
  then
    checked role:row/~"Ana">role:checkbox/"Activo"
    text role:alert "A Ana no se la puede desactivar."
    url /usuarios

criterion borrar-a-luis-no-recarga
  given
    data dos-personas
    answers luis-borrado
  when
    click role:row/~"Luis">role:button/"Borrar"
  then
    not-reloaded
    count role:button/"Borrar" 1
    sent remove id "2"

criterion borrar-sin-sesion-lleva-al-error
  given
    data dos-personas
    answers sin-sesion
  when
    click role:row/~"Luis">role:button/"Borrar"
  then
    status 401

criterion exportar
  given
    data dos-personas
    answers csv
  when
    click role:link/"Exportar CSV"
  then
    downloaded "personas.csv"

criterion de-verdad-con-cookie
  given
    cookie fudic-session ana
  then
    text body "Sesión: ana"
    header cache-control "private, no-store"
```

**`routes/blog/[slug].fudspec`**

```
page /blog/[slug]

criterion un-articulo-en-ingles-cambia-el-idioma
  given
    path dsd-in-depth
    data en-ingles
  then
    attribute html lang "en"
    title "DSD in depth — fudic"

criterion un-slug-fuera-de-paths
  given
    url /blog/no-lo-conozco
    data no-existe
  then
    text h1 "Artículo no encontrado"

criterion paths-enumera-el-primero
  given
    path hola-fudic
  then
    lists hola-fudic
```

**`src/flows/alta-de-usuario.fudspec`**

```
flow alta-de-usuario

criterion entrar-lleva-al-inicio
  given
    services dos-personas
    url /entrar
  when
    type role:textbox/"Usuario" "ana"
    click role:button/"Entrar"
  then
    url /
    text body "Hola, Ana"

criterion lo-que-se-crea-se-encuentra
  given
    services dos-personas
    url /entrar
  when
    type role:textbox/"Usuario" "ana"
    click role:button/"Entrar"
    go /usuarios/nuevo
    type role:textbox/"Nombre" "Marta"
    type role:textbox/"Email" "marta@fudic.dev"
    type role:spinbutton/"Edad" "29"
    upload role:button/"Foto" "./fixtures/marta.png"
    click role:button/"Guardar"
  then
    text role:status "Guardado"
    sent save avatar "marta.png"
  when
    go /usuarios
    type role:searchbox/"Buscar por nombre" "mar"
  then
    count role:listitem 1
    text role:listitem "Marta — marta@fudic.dev"

criterion un-nombre-reservado-no-aparece
  given
    services dos-personas
    cookie fudic-session ana
    url /usuarios/nuevo
  when
    type role:textbox/"Nombre" "admin"
    type role:textbox/"Email" "admin@fudic.dev"
    type role:spinbutton/"Edad" "40"
    click role:button/"Guardar"
  then
    text role:alert "Ese nombre está reservado."
  when
    go /usuarios
    type role:searchbox/"Buscar por nombre" "admin"
  then
    count role:listitem 0

criterion luis-no-ve-lo-de-ana
  given
    services dos-personas
    url /entrar
  when
    type role:textbox/"Usuario" "ana"
    click role:button/"Entrar"
    go /cuenta
    as luis
    go /cuenta
  then
    text body "Nadie ha entrado"
    as main
    text body "Ana"

criterion abre-sin-red
  given
    services dos-personas
    url /about
    offline
  then
    status 200
```

---

## 5. Invariantes

- **Una spec de componente que hoy pasa, sigue pasando** sin tocarla.
- **Lo que la fixture no nombra se ejecuta de verdad.** Ningún modo falsea algo por su cuenta.
- **Un criterio no ve nada de otro**: ni cookies, ni SW, ni servicios, ni registro de llamadas, aunque
  corran a la vez sobre el mismo Vite.
- **El editor no ejecuta la fixture**: la lee con Oxc, como hoy.
- **Un `then` en negativo no pasa con la página a medio cargar** (§4.5).
- **Una fixture sirve a la spec, al banco, al test unitario y al MCP**, con el mismo significado.
- **Diagnósticos con span** sobre la línea, el nombre o el paso de la referencia que fallan.
- **Cobertura.** Todo fichero nuevo nace al 100 % en las cuatro métricas; `spec`, `terms`,
  `workbench`, `testing`, `mcp` y `language-server` siguen al 100 %; `vite` con umbral por fichero.

---

## 6. Criterios de aceptación

**La `.fudspec`**

1. `page /usuarios`, `page /blog/[slug]`, `page /` y `flow alta` se leen; `page /nada` da `FUD1500`;
   sin cabecera, `FUD0922` con el texto nuevo.
2. `given`/`when`/`then`/`when`/`then` se lee; `given` tras `when` y `when` tras `when` dan `FUD0930`;
   acabar en `when` da `FUD0933`.
3. `role:row/~"Luis">role:button/"Borrar"` se lee en pasos; `role:row/~>` y `a>` dan `FUD1509`.
4. `data` en un componente y `props` en una página dan `FUD1501`; `data x` sin `x`, `FUD0950`; sin
   fixture, `FUD0953`; dos `data`, `FUD0952`.
5. `path x` fuera de `paths`, `FUD1502`; `url /otra` en `page /usuarios`, `FUD1503`; `page
   /blog/[slug]` sin `path` ni `url`, `FUD1504`; `go /nada` en un flujo, `FUD1505`.
6. `sent borrar id "1"` sin función `borrar` al alcance, `FUD1506`; `sent remove nombre "x"`,
   `FUD1507`; `lists x` en una ruta sin `paths`, `FUD1513`; `upload … "./no.png"`, `FUD1511`.
7. Un `component` de hoy, sin cambios, se valida igual que antes.

**La fixture**

8. El `.d.ts` de una ruta exporta `Fixtures`: un `later` en un campo que no es `later` es error de TS;
   `fails('x')` con un código que la función no declara, también; un `-> file` acepta `file(…)`.
9. `readFixtures` da los nombres de `data`, `calls`, `services` y los valores de `paths`; un
   `paths` que no es literal da `FUD1510`.

**El banco: páginas**

10. `data dos-personas` pinta la tabla con dos filas sin ejecutar el `load`; sin `data`, el `load` de
    verdad.
11. `data dos-personas con-ana-dentro` + `login` que invalida: la página se repinta con la segunda.
12. `data caido` da `status 503` con `_error.fud`; `data sin-sesion`, la redirección y `url /entrar`.
13. `answers busca-luis`: la búsqueda pinta a Luis sin ejecutar `search`; una función sin respuesta va
    al servidor; las dos quedan en el registro y `called`/`sent` las ven.
14. `answers buscando` (`later.never()`): `role:status` dice «Buscando…» y sigue diciéndolo.
15. `answers` de una regla `remote` responde a la regla mientras se escribe.
16. El `layout` se ejecuta con la `data` de la fixture: `attribute html lang "en"` pasa con `en-ingles`.
17. `lists hola-fudic` ejecuta el `paths()` de verdad.
18. `downloaded "personas.csv"` con `answers csv`.

**El banco: flujos**

19. `services dos-personas`: lo que crea `lo-que-se-crea-se-encuentra` aparece en `/usuarios` y no en
    otro criterio que corre a la vez.
20. Login de verdad con su cookie, y `url /` después.
21. `as luis` tiene sus propias cookies; `as main` vuelve.
22. `offline` + `go` a una página visitada la abre desde el SW; a una no visitada, falla como el
    navegador.
23. `fails(0, 'network')` en un flujo hace que la llamada falle sin respuesta.

**El vocabulario**

24. Cada término de §3.7 tiene su test con su caso que pasa y su caso que falla, con evidencia
    legible (`expected`/`actual`).
25. `locale en` pide la página en inglés; `media prefers-color-scheme dark` la pinta en oscuro;
    `viewport 375 812` cambia el tamaño.
26. `clock 2026-11-08T10:00:00Z` fija la hora en navegador y servidor; `wait 2000` hace llegar un
    `later(2000, …)`.
27. `not-reloaded` falla si el `when` recargó; `requests 1` cuenta las del último `when`.
28. `header cache-control "private, no-cache"` contra el servidor de verdad.

**La página quieta**

29. Una búsqueda con `debounce 300` que no pinta nada hasta los 300 ms: `count role:listitem 0` tras
    `type` falla si la respuesta trae resultados (hoy pasaría).
30. Una página con `setInterval` cada segundo se queda quieta igual.
31. Una página que nunca deja de pedir da `FUD1508` con lo pendiente.

**Grabar**

32. `record` de `entrar-como-ana` contra el servidor escribe `data` y `calls` con el nombre del
    criterio, cambia la `.fudspec` para nombrarlos, y el criterio pasa después sin servidor.
33. Un `File` recibido se graba como `file(…)` con sus bytes; un valor con una función da `FUD1515`.

**Backend que no es TS**

34. Una petición del criterio lleva la cookie `fudic-bench`; `GET /__bench/criterion/<id>` da sus
    `services`, `answers` y `clock`.

**CLI, editor, MCP, testing**

35. `fudic g spec /usuarios` escribe la spec y la fixture con un `data` que compila contra `Fixtures`;
    `fudic g flow alta` escribe las dos del flujo; `fudic-workbench run` ejecuta las tres clases.
36. El editor completa rutas en `page`, nombres en las líneas de fixture, valores en `path`, rutas en
    `url`/`go`, funciones y argumentos en `called`/`sent`; hover e ir a la definición a la fixture, al
    `.fudapi` y a la ruta; las bombillas de §3.10; la gramática TextMate colorea lo nuevo.
37. `fudic_spec_run` ejecuta una página y un flujo y devuelve el registro de llamadas; con `record`,
    graba; `fudic_render`/`fudic_preview` de `/usuarios` con `fixture: { data: 'nadie' }` pintan la
    tabla vacía.
38. `visit('/usuarios', { fixture: 'dos-personas', answers: ['busca-luis'] })` aplica la fixture en un
    test unitario.

**Ejemplo y cierre**

39. Los ejemplos de §4.9 en verde con `fudic-workbench run`.
40. La guía del MCP (`fudspec.md` y su copia en español) y el README de `@fudic/spec`, `@fudic/terms`
    y `@fudic/workbench` explican páginas, flujos, fixtures, el vocabulario y grabar.
41. `pnpm typecheck`, `pnpm test`, `pnpm build` en verde; los paquetes al 100 % de §5.

### 6.1. La prueba de Pedro

Abrir el banco sobre `routes/usuarios.fudspec` y `src/flows/alta-de-usuario.fudspec`; ver pasar y
fallar criterios cambiando un texto de la vista; grabar `entrar-como-ana` y ejecutarlo después con el
servidor parado; escribir un criterio nuevo con el editor ayudando en cada línea; pedir al MCP que
ejecute el flujo y que enseñe `/usuarios` con la fixture `nadie`.

---

## 7. Fuera de alcance

Nada.

---

## 8. Decisiones

### 8.1. Tomadas al redactar

1. **`page /ruta` en la cabecera**, no `given route` en cada criterio: el fichero tiene un dueño y la
   ruta no se repite.
2. **La ruta se escribe como en disco** (`[slug]`), que es lo que el usuario ve en el árbol de
   ficheros y lo que el editor completa.
3. **Las líneas de fixture son del validador**, no módulos de término, como `props`: dependen de la
   fixture y del `.fudapi`, que un término no ve.
4. **Lo que la fixture no nombra va de verdad**: el usuario decide hasta dónde falsea, línea a línea.
5. **El `layout` siempre de verdad**: es una función de la `data`, y probarlo con la `data` falsa es
   justo lo que interesa.
6. **`Fixtures` lo genera el `.fudapi`**, que ya tiene `LoadData`, las funciones y sus `fails`. El
   `$Data` proyectado de la nota no hace falta.
7. **`data` con varios nombres** para la `data` que llega tras un `invalidates`, en lugar de otra
   línea: se lee en orden, como pasa.
8. **El criterio en una cookie**: la llevan la navegación, `fetch`, el endpoint de datos y el SW sin
   tocar nada; una cabecera no la manda una navegación.
9. **Los hooks del banco en `globalThis[Symbol.for('fudic.bench')]`**, que el plugin lee si existen:
   así el Vite de la app arranca con la configuración del usuario sin sustituir su `fudic()`.
10. **Vite en dev con el SW en modo preview** (`"dev": "preview"`), no un build por ejecución: el SW
    funciona y no hay que construir en cada guardado.
11. **`as`** abre navegadores con nombre bajo el mismo criterio: comparten servidor y servicios, no
    cookies.
12. **La página quieta cuenta temporizadores cortos y no los intervalos**: lo primero es lo que hace un
    `debounce`, lo segundo es un reloj.
13. **Grabar sustituye**, no fusiona: un nombre es un caso, y volver a grabarlo lo pone al día.
14. **El backend que no es TS lee la cookie y pregunta al banco**: el banco no puede inyectar clases
    en otro lenguaje, pero sí decir qué caso toca.

### 8.2. Tomadas al implementar

1. **`FUD0923` también cambia de texto**: con tres cabeceras, «el componente ya está declarado» pasa a
   «la cabecera ya está escrita».
2. **`FUD0950`, `FUD0952` y `FUD0953` llevan la línea o el fichero en sus parámetros** (`line`,
   `fixture`): el mismo código sirve a `props`, `data`, `answers`, `services`, `path` y `url`.
3. **`FUD1508`, `FUD1514` y `FUD1515` son de fichero** (la `.fudspec` o la fixture, con span si lo
   hay): los emite el banco, no el validador.
4. **`FUD0924`, `FUD0925`, `FUD0926` y `FUD0928` también hablan de las tres cabeceras.**
5. **Los tipos de la fixture viven en `@fudic/http/contract`** (`Answer`, `Failed`, `Later`,
   `Redirected`, `FileAnswer`, `FixtureOf`, `ServiceOverride`) y `@fudic/spec` los reexporta junto
   a sus ayudantes. El `.d.ts` de una ruta solo importa del contrato (la regla de SDD-60), y el
   servidor del banco lee esas mismas marcas.
6. **El `.d.ts` de una ruta exporta también `Calls`**, el tipo de un grupo de `calls`, que es lo
   que importa la fixture de un flujo del ejemplo.
7. **«Los componentes que usa» son los que la ruta enlaza con `<link rel="component">` por una ruta
   relativa de la app**, leídos del texto de su `.fud`, como ya se lee su `layout`. El componente de
   un paquete no aporta funciones. Las reglas `remote` que alcanza son todas las del proyecto (su
   nombre es único en él).
8. **`page /x` es `routes/x.fud` o `routes/x/index.fud`**; `/x/index` también vale. Un fichero
   que empieza por `_` no es una página. Las páginas se leen del disco, sin compilarlas: un
   componente guardado bajo `routes/` cuenta como página.
9. **Lo que alcanza una página y si declara `paths` lo da el anfitrión** (`SpecIo.reach`,
   `SpecIo.functions`), que lee el `.fudapi`. Sin él es «desconocido», como hoy los props requeridos
   de un componente sin tipo, y `FUD1506`, `FUD1507` y `FUD1513` no se comprueban.
10. **`FUD1510` sale en la línea de la `.fudspec` que nombra el grupo ilegible**, con el sitio en la
    fixture como relacionado, igual que el error de un módulo de término. El valor de cada entrada
    no se exige literal: solo el grupo (`data`, `calls`, `services`) y `paths`.
11. **Una referencia viaja al término en una forma canónica** (`argText`), con `\"` y `\\`
    escapados; antes un nombre con comillas se rompía al pasar al banco.
12. **Un `url` fuera de `given` es el término `then url`**: una línea de fixture solo lo es en
    `given`, o donde no hay un término con su nombre.
13. **`BenchHooks` queda así** (en `@fudic/http/contract/server`, y por forma en `@fudic/vite`):
    `data(criterio, ruta)` cuenta él mismo la enésima petición; `answer` devuelve `{ value }` o
    nada, porque `undefined` es una respuesta válida de una función `void`; `called(criterio,
    llamada)` registra cada llamada al acabar, con su estado; `after(criterio, ms)` es el reloj
    del criterio para los `later`; `now` sigue. La implementación es `createBench()` de
    `@fudic/vite`, que el banco instala con `installBench()`.
14. **El módulo de servidor de una función lleva `codes`** (`{ ana: [409, 'detalle'] }`): con él
    `fails('ana')` de la fixture responde con el estado y el código que la función declara.
15. **Los servicios del render los pone `benchRoot` de `@fudic/ssr`**, no de `@fudic/http`: una
    ruta con DI y sin `.fudapi` no depende de `@fudic/http`. Las funciones y las reglas usan el de
    `@fudic/http`. Solo en dev: el wrapper de un build no lo escribe.
16. **`fails(0, …)` es `Response.error()`**, y el adaptador de Node corta la conexión: el
    navegador ve un fallo de red, sin respuesta.
17. **El `Date` del servidor lo cambia `installBench`** con un `AsyncLocalStorage` guardado en
    `globalThis`: el plugin que abre el ámbito de cada petición puede ser otra copia del paquete.
18. **Con el banco instalado, el plugin sirve el SW en modo preview** aunque `sw.json` diga
    `"dev": "off"`. Solo en dev, y solo en el Vite que arranca con el banco ya instalado.
19. **El id de un criterio es `<ejecución>-<n>.<slug>`**: el mismo criterio ejecutado dos veces
    no comparte servicios ni registro.
20. **Una persona nueva (`as`) abre la URL del criterio** en su propio contexto: un `go` relativo
    necesita una página de la app desde la que resolverse.
21. **La página quieta cuenta las peticiones desde el contexto del navegador** (documentos y SW),
    no desde un script; una respuesta `later.never()` que el banco retiene no cuenta; la página de
    error del navegador (sin red) no cuenta; una navegación en curso bajo la mirada es algo
    pendiente.
22. **Un `then` en negativo lo dice su término**: `meta.negative`, `true` o una función de sus
    argumentos (`count … 0`). Los demás se reintentan hasta el tiempo límite.
23. **El Vite de la app escucha en su propio puerto**; `/__bench/criterion/<id>` lo sirven los dos
    servidores. Una página que responde un 4xx/5xx no corta el criterio: lo lee `then status`.
24. **Los criterios sin red corren contra un build** (era §8.3.1, decidido por Pedro el
    2026-11-11, camino b). En dev todas las rutas son `ssr` y el SW no pinta ninguna, así que un
    criterio con `offline` (en `given` o en `when`) se ejecuta contra la app construida y servida
    con `vite preview`, en su propio puerto. Solo esos: los demás criterios, del mismo fichero y de
    la misma ejecución, siguen en dev. El build se hace la primera vez que un criterio sin red lo
    pide, en `node_modules/.fudic-bench/<pid>/app/dist`, y se rehace en la siguiente petición si
    cambió algún fichero de la app. Un build que falla deja en error esos criterios, diciendo por
    qué (`FUD1207`); los demás corren.
25. **El build del banco respeta las fixtures; ningún otro.** Es el que se hace o se sirve con el
    banco ya instalado en el proceso (la regla de §8.2.18). Sus wrappers leen el banco como los de
    dev, su `server.mjs` exporta `bench = true`, y `createServer` recibe `bench: true` (con sus
    funciones y sus reglas): una petición con criterio recibe la `data`, las respuestas, los
    servicios y el reloj de la fixture, y se pinta a demanda, nunca con el fichero prerenderizado.
    Su `edge` va junto a su `outDir`, no donde lee la vista previa de la app. Un `vite build` de
    cualquier otro nunca tiene el banco instalado, y un build sin `bench` ignora la cookie aunque
    lo sirva un proceso con el banco. `@fudic/server` lee los hooks por su símbolo, como
    `@fudic/ssr`: importarlos traería `async_hooks` a un servidor que corre en cualquier sitio.
26. **`given` corre antes de abrir.** Sus términos (`cookie`, `locale`, `media`, `viewport`,
    `clock`, `offline`) preparan el navegador; después, cada persona nombrada hasta ese momento
    abre la URL del criterio, `main` primero. Un `as` en `given` crea la persona sin abrirla.
27. **El reloj se para.** `clock` instala el de Playwright y lo pausa en el instante, como el del
    servidor del criterio: los dos solo avanzan con `wait`. Una persona que llega después empieza
    donde está el del servidor. Sin `clock`, `wait` espera de verdad.
28. **Con reloj, la página quieta no espera al tiempo.** Los temporizadores y los frames de la
    página no cuentan (solo avanzan con `wait`), y un `later` de la fixture que espera al reloj
    cuenta como retenido, igual que `later.never()` (`held` suma los dos). Por lo mismo, con reloj
    la página se abre al llegar la respuesta del documento y se lee cuando está quieta: un `later`
    del `load` deja el documento abierto hasta el `wait`.
29. **Los términos de navegación vuelven al llegar la respuesta** (`go`, `back`, `forward`,
    `reload`): el banco ya espera a la página quieta tras cada `when`. `go` a una página que el
    navegador no puede abrir (sin red) no es un error del paso: lo dice su evidencia, y `then
    status` lee «no response».
30. **El `ctx` de un término sabe del criterio** (`CriterionRecord` en `@fudic/terms`): `url`,
    `resolve(path)` (relativo a la `.fudspec`), `quiet()`, `clock()` y `advance()`, `calls()`,
    `response()` (la última respuesta de documento), `lastWhen()` (peticiones y descargas del
    último bloque `when`), `reloaded()` y `paths()` (el `paths()` de verdad, cada entrada como la
    escribe `path`). En un componente, `calls()` está vacío y `paths()` es null.
31. **«El último `when»` es el último bloque `when`**, no el último paso: `requests`, `downloaded`
    y `not-reloaded` cuentan desde que empezó. `check`/`uncheck` hacen clic, como una persona, y
    no pelean con una página que vuelve a marcar la casilla: eso lo lee el `then`. `upload` usa el
    `<input type="file">` o el selector que abre el clic. `checked`, `unchecked` y `value` sobre un
    elemento sin ese estado fallan diciéndolo («not a checkbox», «not a control»).
32. **Los ejemplos de §4.9 se ajustan a lo que hace el framework.** `abre-sin-red` visita con red
    la página que abre después sin ella (`given offline` sobre su URL): una página nunca vista no
    se abre desde el SW, que es el criterio 22. `de-verdad-con-cookie` lee `private, no-store`, la
    cabecera que fudic pone a una página que lee la sesión (SDD-69), salvo que la ruta escriba la
    suya; el criterio 28 se prueba con una ruta que escribe `private, no-cache`.

33. **Un `then` que choca con una navegación lee otra vez.** Si el documento se va mientras el
    término lee (una recarga o una navegación que la página empezó sola, después de parecer
    quieta), el banco espera a la página quieta y lee una vez más; si vuelve a pasar, es un error
    del paso. Otro error del término no se reintenta.
34. **El banco del servidor no es una pieza del navegador.** Los hooks de `@fudic/http`
    (`contract/bench.ts`) entran en la excepción de la mitad de servidor de la comprobación de
    piezas, con `contract/server.ts`.

35. **El servidor le cuenta al banco lo que responde de verdad** con un hook opcional más,
    `record?(criterio, entrada)` en `BenchHooks`: la `data` de un `load` que corrió (una promesa
    con sus campos `later` ya resueltos; uno que falló es `later.fails(0, …)`) y lo que respondió
    una función o una regla `remote` cuyo handler corrió. Un fallo llega como su marca:
    `redirects(…)`, `fails(código)` si el error lleva código, `fails(estado, título)` si no, y lo
    que no es un `HttpError` es el 500 que vio el cliente. Una regla que pasa es `undefined`. Lo
    que respondió la fixture no se graba. `createBench()` solo lo guarda en un criterio empezado
    con `record: true`, y lo da `recorded(criterio)`.
36. **Solo se graba un criterio que pasa** contra el servidor de verdad: uno que falla congelaría
    lo que está mal. El resto se informa como «no grabado» con el motivo, y la orden sale con 1.
37. **Una función llamada varias veces se graba con su última respuesta**: un grupo de `calls`
    da un valor por nombre, y la última es como `answers` resuelve dos respuestas a lo mismo.
38. **Al grabar, la línea que no nombra nada se quita.** Si la ruta no pidió `data`, o ninguna
    llamada se pudo grabar, la línea `data` o `answers` del criterio desaparece: el criterio se
    ejecutó así y así seguirá. Una `data` que no se puede escribir corta la lista ahí (las
    siguientes se nombran en orden); una llamada que no se puede escribir solo se deja fuera.
    Una respuesta de `load` que no llega en el tiempo de llamada también es `FUD1515`.
39. **Grabar no exige que existan los nombres de `data` y `answers`** ni la fixture: los
    `FUD0950`/`FUD0953` de esas dos líneas no paran el criterio, porque es justo lo que se va a
    escribir. Sin fixture se crea una, tipada con `Fixtures` de la ruta o con `FlowFixtures`.
    `services`, `path`, `url` y `clock` siguen valiendo.
40. **La orden es `fudic-workbench record [<ruta>…] [--criterion <id>]… [--browser <b>]
    [--json]`**, y sin rutas graba todas las páginas y flujos de la carpeta. Una spec de
    componente no se graba: `FUD1207` y error. `runSpecs({ record: true })` hace lo mismo y
    devuelve `recording` (grabados, no grabados y diagnósticos), que es lo que usará el MCP.
41. **El reloj del navegador se instala un minuto antes del instante y se para en él** (corrige
    §8.2.27). Instalado, el de Playwright corre a velocidad real hasta que se para, y pararlo en
    un instante que ya pasó es «avanzar al pasado»: en una máquina cargada, `clock` daba error.
    Instalado antes, la pausa siempre avanza, sobre una página en blanco.
42. **`fudic g spec /<ruta>` no crea la página**: la busca con las mismas reglas que la cabecera
    `page` (§8.2.8) y, si no está, `FUD1500` sobre la carpeta de rutas (el código acepta también
    la forma de fichero, sin span). Qué layout y qué secciones lleva es de `fudic g page`. Una
    página sin `.fudapi` recibe solo su `.fudspec`: no tiene `Fixtures` con que tipar una fixture
    ni nada que falsear. El esqueleto comentado abre con `data base` si hay `load`, y con `path
    <value>` o `url <url>` si la ruta tiene parámetros (según declare `paths` o no).
43. **El `data` de ejemplo sale del `.fudapi`, no de TypeScript** (`loadFields` de
    `@fudic/typecheck/api`, que usarán también las bombillas del editor): un campo `later` por lo
    que resuelve; un `date`, un `html`, un `file` o un tipo no declarado no tienen literal y se
    dejan fuera, como hace la fixture de un componente con lo que no se puede escribir. Un nombre de
    flujo es kebab-case (`FUD0448`, variante `flow-name`).
44. **`visit` aplica la fixture con el banco del workbench**, no con una copia de su significado:
    cada `visit` con `fixture`, `answers` o `services` es un criterio de un banco instalado en el
    proceso del test, con su cookie en la jarra de la página. El wrapper de los tests se escribe con
    `bench: true` (sin banco o sin cookie, nada cambia) y el render recibe la petición. Al acabar
    cada test, los criterios terminan y el banco se desinstala. `fixture` acepta varios nombres,
    como `data a b`, y `services` existe también: un grupo de la fixture que el test no pudiera
    aplicar sería un fleco.
45. **`fudic_spec_run`** acepta una ruta por su patrón o como la escribe la cabecera
    (`/blog/:slug`, `/blog/[slug]`) y un flujo por su nombre; devuelve `calls` (por criterio, cada
    llamada con `fn`, `args`, `faked` y `status`) y, con `record`, `recording`. Una grabación no se
    escribe en el historial de las piezas: corre sin sus fixtures.
46. **`fudic_render` y `fudic_preview` de una ruta aceptan `fixture: { data, answers, services }`**
    (en `fudic_render`, un nombre suelto es `data`). Los nombres se comprueban leyendo la fixture
    sin ejecutarla: `FUD1516` y `FUD1517`. `fudic_render` lo pasa a `visit`; un `load` falseado no
    cuenta como llamada. `fudic_preview` abre la fixture como un criterio del banco en el proceso
    del servidor de desarrollo (la fixture se carga por su grafo de módulos, así sus servicios son
    las clases que inyecta el servidor), y la URL pasa antes por `/_fudic/preview-fixture/<id>`,
    que pone la cookie y redirige. Cada vista previa termina las fixtures anteriores: un navegador
    con la cookie vieja ve la app real.

### 8.3. Pendiente de decidir

Nada.
