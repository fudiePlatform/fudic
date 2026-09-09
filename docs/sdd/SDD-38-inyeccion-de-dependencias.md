# SDD-38 — Inyección de dependencias (`@fudic/di`)

> **Estado:** `Listo`
> **Paquetes:** `@fudic/di` — **paquete nuevo**, dos puntos de entrada: `.` (el inyector, runtime
> puro) y `./page` (la reconstrucción del árbol de contenedores en el navegador). Además:
> `@fudic/compiler` (extracción, emit y mapa), `@fudic/ssr` (la semilla publicada) y
> `@fudic/vite` (el módulo IoC de la ruta y los diagnósticos de build).
> **Depende de:** 08 (regiones `@code`), 10 (documento), 11 (Oxc), 12 (semántica), 14 (runtime),
> 15 (emit y mapas de página), 17 (cascada de hidratación), 19 (plugin), 20 (wrapper de ruta),
> 23 (TS virtual)
> **Rango de diagnósticos:** `FUD0680`–`FUD0699`
> **Decisiones de gramática:** 120–126 (nuevas) + precisión a 33.c
> **Naturaleza:** un paquete nuevo sin DOM y sin dependencias, más el cableado que lo hace vivir
> en los dos extremos. Una página sin una sola inyección **no descarga un byte de este SDD**.
>
> Formaliza la evidencia ejecutable de [`docs/di/index.html`](../di/index.html), que Pedro
> construyó con Claude Web: un inyector completo —registro, contenedores encadenados, resolución
> por dueño, ciclos, `transient` y el error de vida— funcionando en el navegador. Lo que aquí se
> añade es lo que la evidencia no podía saber: dónde vive cada contenedor en fudic, cómo cruza el
> SSR y por qué el árbol de contenedores **no puede salir del HTML**.

---

## 1. Contexto y objetivo

fudic no tiene forma de compartir estado entre componentes que no se ven. Un carrito que la
cabecera lee y el listado escribe, un cliente HTTP con la sesión dentro, un formateador de fechas
con la locale de la petición: hoy todo eso o se pasa por props a través de cada nivel, o vive en un
módulo con estado global —que en el servidor significa que dos peticiones lo comparten.

El objetivo es un inyector con estas cinco propiedades, y las cinco son restricciones duras:

1. **Sin inyección por constructor.** Se inyecta en posición de declaración: en el `@code` de un
   componente, o en un campo de clase de un servicio. Nadie escribe un constructor con parámetros
   y nadie mantiene el orden de esos parámetros.
2. **Varios niveles.** `@Service` registra en la raíz. Un componente que declara `provide(X, …)` se
   convierte en el dueño de `X` **para todo su subárbol**: un descendiente que inyecte `X` recibe la
   instancia de ese ancestro, no la global. Es el modelo de inyectores de elemento de Angular, sin
   la inyección por constructor.
3. **Escribir un provider no hidrata.** Un componente que declara providers y no inyecta nada
   **sigue siendo N1** y no descarga chunk. Lo único que promueve a N3 es `inject`, y lo hace por
   las reglas de hidratación que el proyecto ya tiene.
4. **El mismo contenedor a los dos lados.** El código que escribe el autor es idéntico en servidor
   y en cliente; lo que cambia es quién crea la raíz.
5. **Podable.** Funciones, `sideEffects: false`, y una ruta sin `inject` sin una línea de DI en su
   bundle. fudic parte de cero JS por naturaleza y esto no lo cambia.

### Lo que este SDD NO es

No es `@fudic/http`, ni interceptores, ni servicios asíncronos, ni `multi:` providers, ni el
reemplazo de un provider en tests. No es tampoco el contenedor por navegación: hoy la raíz es la
ruta y muere con el documento, porque SDD-20 navega reemplazándolo (§7).

---

## 2. Dependencias

| Fuente | Aporta |
|---|---|
| SDD-08 | Las tres zonas de `@code`: neutra, `@server`, `@client`, con sus spans y sus reglas de unicidad (33.a/33.b/33.d). |
| SDD-11 | Oxc, invocado **una sola vez por fichero**. La extracción de este SDD entra en el mismo recorrido que ya lee `props<T>()`, `signal(…)` y `emit(…)`. |
| SDD-15 | El emit de los dos módulos por componente, la reescritura de llamadas por offset (`emit(…)` → `emit.call($host, …)`) y los mapas de página. |
| SDD-17 | La cascada de hidratación: por **tag**, en post-orden, y el reparto de la porción del payload por instancia. Es el hecho del que sale la restricción central de §4.2. |
| SDD-19 / SDD-20 | El wrapper de ruta (`render(ctx)` / `data(ctx)`) y el `?server`: el único punto donde nace una petición. |
| SDD-23 | El TS virtual, para que `inject(Cart)` tenga tipo `Cart` en el editor. |

`@fudic/di` declara **cero dependencias de runtime**. Ni `@fudic/core`, ni `@fudic/dom`. Un
`import` desde este paquete hacia cualquier otra cosa es un fallo de arquitectura.

---

## 3. Interfaz pública

### 3.1. `@fudic/di` — el inyector

```ts
// packages/di/src/types.ts

declare const TYPE: unique symbol;

/**
 * A token for a value that is not a class: a request, an env, a locale. The phantom type
 * parameter is why this is an object and not a bare `symbol` — a symbol cannot carry `T`,
 * and without `T` every `inject(TOK)` would come back `unknown`.
 */
export interface Token<T> {
  readonly name: string;
  readonly [TYPE]?: T;
}

/** What `inject` asks for: a class, or a token. Both are compared by identity. */
export type Provider<T> = (abstract new (...args: never[]) => T) | Token<T>;

export interface ProvideOptions {
  /** Never cached. A new instance per resolution, in the container that resolved it. */
  readonly transient?: true;
}

export interface InjectOptions {
  /** Missing registration returns `undefined` instead of throwing. */
  readonly optional?: true;
}

/** A container. Opaque: nothing outside this package reads its fields. */
export interface Container {
  readonly label: string;
}
```

```ts
// packages/di/src/index.ts — the entry point

export function token<T>(name: string): Token<T>;

/**
 * Standard (stage-3) class decorator. Registers the class in the ROOT registry with
 * `() => new C()` as its factory. Returns the class untouched.
 */
export function Service<T extends abstract new (...args: never[]) => unknown>(
  target: T,
  context: ClassDecoratorContext,
): T;

/** Register in the ROOT registry. The non-decorator form of `@Service`: takes a factory. */
export function provide<T>(
  provider: Provider<T>,
  factory: () => T,
  options?: ProvideOptions,
): void;

/** Register in ONE container. This is what a component's `provide(…)` compiles to. */
export function provideIn<T>(
  container: Container,
  provider: Provider<T>,
  factory: () => T,
  options?: ProvideOptions,
): void;

/**
 * Resolve from the AMBIENT container. Legal in exactly one place: a field initializer or
 * the constructor of a service, which run inside the factory `injectFrom` is executing.
 * Anywhere else it throws — there is no ambient container outside a factory (§4.4).
 */
export function inject<T>(provider: Provider<T>): T;
export function inject<T>(provider: Provider<T>, options: InjectOptions): T | undefined;

/** Resolve from ONE container. This is what a component's `inject(…)` compiles to. */
export function injectFrom<T>(container: Container, provider: Provider<T>): T;
export function injectFrom<T>(
  container: Container,
  provider: Provider<T>,
  options: InjectOptions,
): T | undefined;

/** The route container. `seed` is what the server published, by token name (§4.8). */
export function createRoot(seed?: Readonly<Record<string, unknown>>): Container;

/** A child container. `label` is for messages only; it takes no part in resolution. */
export function createChild(parent: Container, label: string): Container;

/** Release a container's instances. Idempotent. */
export function destroy(container: Container): void;
```

### 3.2. `@fudic/di/page` — reconstruir el árbol en el navegador

```ts
// packages/di/src/page.ts

/** One owning node of the emitted map: its parent, or `-1` for the root. */
export type IocNodes = readonly number[];

/**
 * Build the container tree of a route from the EMITTED map, in memory.
 *
 * `nodes[i]` is the parent index of node `i`; node 0 is the root. `register` is the
 * route's IoC module: it puts each node's factories into the container it owns them in.
 * Nothing here reads the DOM, and that is the whole point (§4.2).
 */
export function buildTree(
  nodes: IocNodes,
  register: (node: number, container: Container) => void,
  seed?: Readonly<Record<string, unknown>>,
): readonly Container[];
```

### 3.3. Lo que añade `@fudic/ssr`

```ts
// packages/ssr/src/index.ts

/**
 * Publish a value so the CLIENT can build the same service from it (§4.8).
 *
 * The only thing that crosses the wire. A value seeded with `provide`/`provideIn` on the
 * server and not published here stays on the server — which is what makes a `@server`
 * region safe to inject from.
 */
export function publish<T>(token: Token<T>, value: T): void;

/** The `<script type="application/json" id="fud-di">` block, or `''` when nothing was published. */
export function seedBlock(): string;
```

### 3.4. Lo que el compilador extrae

```ts
// packages/compiler/src/emit/oxc-code.ts

/** One `inject(...)` or `provide(...)` written in a `@code`, in SOURCE coordinates. */
export interface DiCall {
  readonly kind: 'inject' | 'provide';
  /** The zone it was written in — the zone decides where it runs (§4.1). */
  readonly zone: 'neutral' | 'server' | 'client';
  /** The provider expression's source, verbatim: `Cart`, `LOCALE`. */
  readonly provider: string;
  /** Start of the callee identifier, and of the `(` after it: the rewrite is a prefix splice. */
  readonly at: number;
  readonly open: number;
}

export interface ExtractedCode {
  // … props, signals, client, template, mutable, clientNames, …
  /** Every `inject`/`provide` of this `@code`, in source order. */
  readonly di: readonly DiCall[];
  /** The `@server` region's top-level statements — emitted for the first time (§4.1). */
  readonly server: ServerCode;
}
```

El componente emitido en servidor pasa a tener un cuarto parámetro:

```ts
export function render($dom, $shadow, props, $ioc) { … }
```

---

## 4. Comportamiento

### 4.1. La zona decide dónde corre la inyección

`inject` y `provide` son legales en las tres zonas de `@code`, y la zona es la respuesta a dónde
corre la línea. No hay sintaxis nueva y no hay restricción: es responsabilidad de quien escribe.

| Zona | Dónde corre | ¿Promueve a N3? | Para qué |
|---|---|---|---|
| neutra | servidor **y** cliente | **sí**, si hay `inject` | servicios isomorfos: carrito, i18n, formateo |
| `@server` | solo servidor | **no** | lo que no puede viajar: DB, tokens, URLs internas |
| `@client` | solo cliente | **sí**, si hay `inject` | lo que solo existe en el navegador: storage, historial |

```razor
@code {
  import { inject, provide } from '@fudic/di';
  import { Cart } from '../services/cart';

  provide(Cart, () => new Cart());     // neutra: este componente es el DUEÑO de Cart
  const cart = inject(Cart);           // neutra: y también lo usa

  @server {
    import { Db } from '../services/db';
    const db = inject(Db);             // solo servidor: Db no baja al navegador
  }
}
```

**El `@server` de un componente se emite por primera vez.** Hoy no llega a ninguna parte: el
`?server` solo se genera para rutas ([server.ts:22](../../packages/vite/src/server.ts#L22):
`if (!isRoute) return EMPTY`) y `ExtractedCode` no tiene campo `server`. Este SDD lo mete en el
`render(…)` del `.mjs`, y lo mantiene fuera del chunk de cliente por el mismo camino que ya lo
mantiene fuera de los source maps (`redactServerRegions`).

**Precisión a la decisión 33.c.** «En zona neutra solo imports compartidos (módulos puros sin side
effects)». Un módulo de servicio tiene exactamente un efecto al cargarse: inscribirse en el
registro raíz. Eso no es lo que 33.c prohíbe —IO, estado global ajeno, orden de carga
observable—: es determinista, idempotente y acotado a su propia clase. Un módulo de servicio
cumple 33.c.

### 4.2. El árbol de contenedores no sale del HTML, y esto es la decisión central

Un componente puede declarar providers y **seguir siendo N1**. No inyecta, luego no hidrata, luego
no tiene chunk, luego **nunca ejecuta una línea de JavaScript en el navegador**. Su elemento está
en el DOM; su contenedor, si dependiera de ejecutarse, no existiría.

Por eso queda **prohibido** derivar la jerarquía de contenedores del árbol de elementos. Nada de
`host.getRootNode().host`, nada de `closest`, nada de leer el shadow. Hay dos razones y cada una
basta:

1. **El ancestro dueño puede ser N1.** Trepar el DOM encontraría su elemento y no encontraría
   contenedor, porque nadie lo creó. La resolución fallaría —o peor, subiría un nivel de más y
   devolvería la instancia global donde debía devolver la del ancestro.
2. **La cascada de hidratación sube por tag y en post-orden** (SDD-17 §4.4), no por posición en el
   árbol. Cuando `h()` corre en una instancia, ni su padre ni su ancestro dueño tienen por qué
   estar vivos. Una jerarquía que se leyera en ese momento leería un árbol a medio levantar.

**El árbol de contenedores es código emitido, igual que lo es la página.** El servidor lo
construye léxicamente mientras renderiza, le da identidad numérica, y la publica. El cliente la
reconstruye en memoria a partir de esa publicación, y en ningún momento pregunta al DOM quién es
el padre de quién.

### 4.3. Quién crea un contenedor, y quién no

**Solo crea contenedor el componente que declara al menos un `provide`.** Es un hecho estático,
sabido por tag en tiempo de compilación. Un componente que solo inyecta no crea nada: resuelve
desde el contenedor de su ancestro dueño más cercano. Un componente que no hace ninguna de las dos
cosas reenvía el que recibió, intacto.

En el servidor eso es léxico y exacto:

```js
// app-a.mjs — declara un provider: crea contenedor
export function render($dom, $shadow, props, $ioc) {
  const $own = $ioc.child("app-a");
  provideIn($own, Cart, () => new Cart());
  …
  renderAppB($dom, $n3, { … }, $own);      // el hijo hereda el de A
}

// app-mid.mjs — ni declara ni inyecta: reenvía
export function render($dom, $shadow, props, $ioc) {
  …
  renderAppB($dom, $n1, { … }, $ioc);
}
```

En el cliente, un componente creado en tiempo de ejecución por su padre (la vía `c()`) recibe el
contenedor por el mismo camino léxico, porque el padre lo tiene en su cierre. Un componente
**hidratado** (la vía `h()`) lo recibe en su porción del payload: §4.5.

### 4.4. Resolución: el primer contenedor de la cadena que tenga registro

```
inject(X) desde el contenedor C
  → ¿C tiene registro de X?      sí → C es el dueño
  → sube a C.parent, repite
  → la raíz es el último eslabón: ahí están los @Service
  → nadie lo tiene → FUD0680 en build, y en runtime un Error nombrando el token
```

Tres reglas más, las tres tomadas de la evidencia sin cambiarlas:

- **La factoría corre en el contenedor DUEÑO, no en el que pidió.** De ahí sale gratis el
  invariante de vida: nadie puede depender de algo que vive menos que él. Un servicio de raíz que
  inyecta algo declarado por un componente no encuentra el registro y falla, en vez de capturar
  una instancia que morirá antes que él.
- **`transient` no cachea nunca.** Se construye en el contenedor que resolvió.
- **Los ciclos se detectan con una pila y el error nombra la cadena entera**
  (`Roto -> Panel -> Cart -> Roto`).

**El ambiente existe en un solo sitio.** `injectFrom` entra en el contenedor dueño con
`try/finally` alrededor de la llamada a la factoría, y solo ahí `inject()` a secas funciona — que
es lo que hace legal `log = inject(Logger)` como campo de una clase de servicio. Fuera de una
factoría no hay contenedor ambiente y `inject()` lanza. El código que escribe el autor en un
`@code` **nunca** usa el ambiente: el compilador lo reescribe (§4.6).

### 4.5. El mapa `fud-ioc`, y por qué no crece con las instancias

`fud-tree` y `fud-bus` son tag→tags y su peso no depende de cuántas instancias haya. `fud-ioc` no
puede ser tag→tags —dos instancias del mismo ancestro son dos dueños distintos— pero se acerca todo
lo posible con una poda:

**Solo entran en el mapa los contenedores que POSEEN providers.** Un componente que solo inyecta no
tiene nodo: apunta directamente al ancestro dueño más cercano. Si nadie declara providers y todo
es `@Service`, el mapa va **vacío** y cada instancia que inyecta apunta al 0, que es la raíz.

```html
<script type="application/json" id="fud-ioc">[-1,0,0,1]</script>
```

`nodes[i]` es el padre del nodo `i`; el nodo `0` es la raíz y su padre es `-1`. Y **la porción del
payload de una instancia que inyecta lleva su nodo en el último hueco**, detrás de las props y de
las celdas —al final y no al principio, porque un `u` parcial indexa por posición y un hueco
delante desplazaría cada prop (BUG-18 §3.1).

El módulo IoC de la ruta es lo que pone las factorías en cada nodo:

```js
// home.ioc.js — emitido por el plugin
import { provideIn } from '@fudic/di';
import { Cart } from '../services/cart.js';

export const NODES = [-1, 0, 0, 1];
export function register(node, c) {
  if (node === 1 || node === 2) provideIn(c, Cart, () => new Cart());
}
```

Y aquí es donde **el provider se extrae fuera del componente**: el ancestro dueño puede ser N1 y no
tener chunk, así que su factoría no puede vivir dentro de él. Vive en el módulo IoC de la ruta, que
se descarga solo si algún componente de esa ruta inyecta.

**La unidad de poda es la ruta.** El módulo IoC importa únicamente los tokens que alguien inyecta
en el lado cliente de esa ruta; un provider que solo se usa en `@server`, o cuyo token nadie inyecta
desde el navegador, no se emite. Una ruta sin `inject` no tiene módulo IoC en absoluto.

### 4.6. El compilador reescribe la llamada; el autor no ve el contenedor

El mismo mecanismo que ya convierte `emit(name, detail)` en `emit.call($host, name, detail)`
(SDD-15 §4.4): un empalme por offset sobre el prefijo de la llamada, con los argumentos intactos.

| El autor escribe | El emit escribe |
|---|---|
| `inject(Cart)` | `injectFrom($ioc, Cart)` |
| `inject(Cart, { optional: true })` | `injectFrom($ioc, Cart, { optional: true })` |
| `provide(Cart, () => new Cart())` | `provideIn($own, Cart, () => new Cart())` |

Por offset y nunca por texto, porque el cuerpo de `@client` se copia verbatim y un `inject` dentro
de una cadena o de un comentario no es una llamada. `$ioc` y `$own` están en la reserva `$` de
SDD-15 §4.7, así que el autor no puede colisionar con ellos.

Consecuencia buscada: **no hay variable ambiente en nada que escriba el autor**, y por tanto no hay
ninguna forma de perder el contenedor entre dos sentencias, ni de que una excepción a mitad del
`@code` deje el ambiente colgando para el siguiente componente.

### 4.7. La raíz es la ruta, y `load(ctx)` resuelve explícito

fudic es SSR/SSG por definición y la SPA es una SPA enmascarada bajo el Service Worker: cada
navegación vuelve a crear el documento, y con él el contenedor. No hay dos niveles `app` y `route`:
**el contenedor raíz es la ruta**, una petición en el servidor y una página en el cliente, y muere
con ella.

En el servidor la raíz nace en el wrapper que ya existe:

```js
export function render(ctx) {
  return htmlToByteStream((async function* () {
    const $root = createRoot();
    const data = ctx.data !== undefined ? ctx.data : await load(withDi(ctx, $root));
    yield* page(data, io(ctx), $root);
  })());
}
```

`load(ctx)` es **la única función `async` del sistema** —todo el render es un walk síncrono dentro
de un generador— y por eso resuelve por `ctx` y no por ambiente:

```razor
@server {
  export async function load(ctx) {
    const db = ctx.inject(Db);
    const items = await db.query('…');
    const log = ctx.inject(Logger);        // válido: no hay ambiente que perder
    return { items };
  }
}
```

Un contenedor ambiente aquí no sería un error visible: sería contaminación silenciosa entre
peticiones concurrentes en dev y en prerender, y no hay `AsyncLocalStorage` en el Service Worker
con el que taparlo solo en un extremo.

### 4.8. Lo que cruza el cable son valores, nunca instancias

Un `inject` en la zona neutra corre en los dos lados y construye **dos** instancias: la del
servidor pintó el markup y la del cliente nace vacía. Sin nada más, la primera reejecución de `$a`
—que llega con el primer `set`, no al hidratar— sustituiría lo pintado por lo que ve la instancia
vacía.

La solución es la `semilla` que la evidencia ya tiene en `createRoot(semilla)`, llevada al cable:
lo que cruza son **valores bajo `token()`**, y los servicios se reconstruyen a partir de ellos.

```ts
export const LINEAS = token<string[]>('lineas');

@Service
export class Cart {
  lineas = inject(LINEAS, { optional: true }) ?? [];
}
```

```razor
@server { publish(LINEAS, await db.lineas(ctx.params.id)); }
```

```html
<script type="application/json" id="fud-di">{"lineas":["a","b","c"]}</script>
```

El bootstrap de la página hace `createRoot(<ese objeto>)`, y el `Cart` del cliente nace del mismo
valor que el del servidor. **Solo `publish` cruza**: un valor sembrado con `provide`/`provideIn` en
el servidor y no publicado se queda en el servidor, que es lo que hace seguro inyectar desde
`@server`. Los nombres de token son la clave del bloque y por tanto han de ser únicos por ruta.

### 4.9. Qué promueve a N3, exactamente

**Un `provide` no promueve. Un `inject` sí**, y solo en las zonas que corren en el navegador.

```ts
// packages/compiler/src/emit/level.ts
export function isIntrinsicallyHydratable(comp: ResolvedComponent): boolean {
  const code = codeOf(comp);
  return (
    code.signals.length > 0 ||
    code.client.body.length > 0 ||
    code.di.some((d) => d.kind === 'inject' && d.zone !== 'server') ||
    hasHookup(comp)
  );
}
```

Un término más en el `||` que ya está escrito, y **ninguna regla nueva de hidratación**: la
propagación transitiva por props reactivas, la cascada por tag, el post-orden y el reparto del
payload siguen exactamente como están. Un componente que declara providers y no inyecta es N1, no
aparece en `fud-tree`, no tiene `data-fud-id` y no descarga chunk — y su provider llega al
navegador, si hace falta, por el módulo IoC de la ruta (§4.5), que no es su chunk.

### 4.10. Cómo se escribe este paquete

- **Funciones sueltas, ni una clase.** El inyector de la evidencia ya es así. Un `Container` es un
  objeto de datos, no un objeto con métodos: `createChild`, `destroy` y `injectFrom` son funciones
  que lo toman como primer argumento, y quien no use `destroy` no lo descarga.
- **`sideEffects: false`** y exports nombrados sueltos. Sin namespaces colgados, sin tablas de
  despacho, sin `export default`.
- **Dos puntos de entrada.** `.` no nombra `document` ni `window` en ninguna rama: la suite corre
  entera en Node. `./page` es lo único que toca el navegador, y solo lee el bloque JSON.
- **El registro raíz es el único estado de módulo**, y lo pagan únicamente quienes importan
  `provide`, `Service` o `injectFrom` — que es todo el que usa DI, y nadie más.

---

## 5. Invariantes

- **La jerarquía de contenedores no se deriva NUNCA del DOM.** Ni `getRootNode`, ni `host`, ni
  `closest`, ni `parentElement`, en ninguna rama de ningún paquete. Es código emitido y un mapa
  publicado. Un test lo comprueba por búsqueda de texto sobre el emit y sobre `@fudic/di` (§6.14).
- **Escribir un provider no cambia el nivel de un componente.** Solo `inject` promueve, y solo en
  la zona neutra o en `@client`.
- **Las reglas de hidratación no se tocan.** Este SDD no añade un orden, ni un evento, ni una
  excepción a la cascada de SDD-17.
- **El dueño es el primer contenedor de la cadena con registro**, y la raíz es el último eslabón.
- **La factoría corre en el contenedor dueño.** De ahí sale, sin comprobación alguna, que nada
  pueda depender de algo que vive menos.
- **Solo tiene contenedor propio quien declara un provider.** Los demás reenvían.
- **No hay contenedor ambiente en el código del autor.** El ambiente vive dentro de una factoría,
  entre `try` y `finally`, y en ningún otro sitio.
- **Lo que cruza el cable son valores publicados, nunca instancias.** Es la decisión 84 aplicada al
  contenedor.
- **Una ruta sin `inject` no descarga una línea de DI.** Ni módulo IoC, ni `@fudic/di`, ni bloque
  JSON.
- **`@fudic/di` no importa nada.** Cero dependencias de runtime.
- **El runtime no diagnostica.** Lo que falla en `@fudic/di` es un `Error` con el nombre del token;
  los `FUD` los emite el compilador.
- **Cobertura al 100 % en las cuatro métricas** desde el primer commit, `coverage.include:
  ['src/**/*.ts']`.

---

## 6. Criterios de aceptación

Tests en `packages/di/test/` (Node, sin DOM), `packages/compiler/test/emit/` y
`packages/vite/test/`.

**El inyector**

1. **(rojo primero)** `@Service class Logger {}` + `injectFrom(root, Logger)` devuelve siempre la
   misma instancia; desde un hijo y desde un nieto, la misma. Es el caso `Logger` de la evidencia.
2. Un componente dueño: `provideIn(cA, Cart, f)`; `injectFrom(cB, Cart)` con `cB` descendiente de
   `cA` devuelve la instancia de `cA`, **no** la de la raíz, aunque `Cart` esté también
   registrado con `@Service`. Es la propiedad 2 de §1 y el test que la define.
3. Dos hermanos bajo dueños distintos reciben instancias distintas; dos descendientes del mismo
   dueño, la misma.
4. `transient` devuelve una instancia nueva por resolución y no deja nada en ningún contenedor.
5. Un ciclo `A → B → A` lanza nombrando la cadena entera, y la pila queda limpia para la siguiente
   resolución.
6. **El invariante de vida.** Un servicio de raíz que inyecta un token que solo un componente
   declara falla nombrando el token, porque su factoría corre en la raíz. Es la clase `Roto` de la
   evidencia.
7. `inject(X, { optional: true })` sin registro devuelve `undefined`; sin la opción, lanza con el
   nombre de `X`.
8. `destroy(c)` suelta las instancias, es idempotente, y un `injectFrom` posterior sobre un
   contenedor destruido lanza.
9. `createRoot({ lineas: [...] })` sirve el valor a `injectFrom(root, LINEAS)` sin registro
   ninguno, y `token('x') !== token('x')`: la identidad es del objeto, el nombre es para mensajes.
10. **`inject()` ambiente.** Un campo de clase `log = inject(Logger)` resuelve cuando la clase se
    construye a través de una factoría, y `inject()` llamado fuera de toda factoría lanza.

**El árbol reconstruido**

11. `buildTree([-1,0,0,1], register)` produce cuatro contenedores con la cadena correcta, llama a
    `register` una vez por nodo, y `injectFrom(t[3], Cart)` sube por `1` hasta el dueño. Sin
    `document` en el test.
12. Un mapa vacío (`[-1]`) produce solo la raíz, y todo resuelve global.

**El emit**

13. **(rojo primero)** Un componente con `provide` en la zona neutra y **sin** `inject`:
    `hydratableTags` **no** lo contiene, no aparece en `fud-tree`, su markup no lleva
    `data-fud-id` y su chunk de cliente no cambia respecto al golden actual. Es el criterio que
    protege la propiedad 3 de §1.
14. **Ninguna rama del emit ni de `@fudic/di` nombra `getRootNode`, `closest`, `parentElement` ni
    `.host` para resolver un contenedor.** Búsqueda de texto sobre `packages/di/src` y sobre el
    emit, con la lista de excepciones vacía.
15. Un componente con `inject` en la zona neutra: es N3, su `.mjs` declara `$ioc` como cuarto
    parámetro y su chunk destructura el nodo en el **último** hueco de la porción; los índices de
    `updateGuards` no se mueven ni un número respecto al golden.
16. `inject(Cart)` en `@code` se reescribe a `injectFrom($ioc, Cart)` **por offset**: un
    `"inject(" ` dentro de una cadena y un `// inject(` dentro de un comentario quedan intactos.
17. `provide(Cart, f)` en un componente emite `const $own = $ioc.child("app-a")` y
    `provideIn($own, …)`, y sus hijos reciben `$own`; un componente sin `provide` reenvía `$ioc`
    sin crear nada.
18. El `@server` de un **componente** aparece en su `.mjs` y **no** en su chunk de cliente, ni en
    el `sourcesContent` del mapa.
19. `fud-ioc` sale vacío cuando nadie declara providers, y con un nodo por dueño cuando los hay —
    dos instancias del mismo tag dueño producen dos nodos.
20. El módulo IoC de una ruta importa **solo** los tokens que alguien inyecta en el lado cliente de
    esa ruta; una ruta sin `inject` no produce módulo IoC y su bootstrap no importa `@fudic/di`.

**Los diagnósticos**

21. **(rojo primero)** `FUD0680`: `inject(X)` donde `X` se importa de un módulo que ni lo decora
    con `@Service` ni lo registra con `provide`, y ningún ancestro lo declara. Un salto de import,
    el que el `.fud` ya escribe; si el módulo no se puede resolver o leer, **no hay diagnóstico**.
22. `FUD0681`: un binding del template lee un nombre inyectado en `@server` y el componente
    hidrata por otra razón. Sin él, el chunk referencia un nombre que no existe y falla en el
    primer `set`.
23. `FUD0682`: `inject(X)` en `@client` cuando el único `provide(X)` del fichero está en
    `@server`, y el simétrico.
24. `FUD0683`: `inject(...)` dentro del `@server` de una **ruta** — ahí va `ctx.inject(...)`.
25. `FUD0684`: dos `provide` del mismo token en el mismo `@code`.
26. Los cinco llevan su span exacto, el emit **no se detiene** por ninguno y el módulo se escribe
    degradado. Ningún diagnóstico se inventa cuando la información no está.

**Extremo a extremo**

27. Una página de `examples/` con un ancestro **N1** que declara `provide(Cart)`, un descendiente
    N3 que lo inyecta y un `@Service Logger` global: el SSR pinta con la instancia del ancestro,
    el cliente hidrata y `inject` devuelve **la misma** —reconstruida desde la semilla—, y el
    `Logger` es único en la página. Verificado en Chrome real.
28. La misma página sin DI: `dist` no contiene `@fudic/di` ni `fud-ioc` ni `fud-di`, y el número
    de ficheros no cambia.

---

## 7. Fuera de alcance

- **`@fudic/http`, interceptores y servicios asíncronos.** `inject` es síncrono y devuelve un
  valor construido; un servicio que necesita red la pide él, cuando le toca.
- **Contenedores del usuario.** `createChild` queda en la superficie pública porque el emit lo
  usa, pero fudic no ofrece todavía forma de que un autor abra el suyo —un diálogo, una tabla— con
  su propio ciclo de vida.
- **El contenedor por navegación.** Hoy la raíz es la ruta y muere con el documento. El día que
  exista navegación en sitio habrá un segundo dueño de ciclos de vida, y el hueco ya está previsto
  (`clear()` de BUG-24 §4.8).
- **`multi:` providers, `useExisting`, `useValue` y el reemplazo en tests.** Un token, una
  factoría.
- **Serialización de instancias.** Cruzan valores; los servicios se reconstruyen.
- **`fudic g service` en el CLI** y los snippets del editor.
- **Comprobar el registro más allá de un salto de import.** Un servicio registrado en un módulo
  que el `.fud` no importa directamente no produce diagnóstico: produce el `Error` del runtime,
  con el nombre del token.
