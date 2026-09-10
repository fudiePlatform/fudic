# SDD-39 — Rutas reactivas: la mitad de cliente de una ruta

> **Estado:** `Listo`
> **Paquetes:** `@fudic/compiler` (el emisor de cliente de una ruta) · `@fudic/core` (el bloque
> `fud-route`, el camino de subida de la ruta) · `@fudic/ssr` (rellenar la rebanada de un host
> directo) · `@fudic/vite` (el chunk, su nombre, el `?client` de una ruta, el prerender que
> rompe el build) · `@fudic/example-basic` (las evidencias)
> **Depende de:** 15, 17, 19, 21, 27, 30, 31, 34
> **Rango de diagnósticos:** `FUD0620`–`FUD0639`
> **Naturaleza:** emit + runtime + build. No toca el parser ni la gramática.
>
> Cierra un hueco que ningún SDD posee: **una ruta no tiene mitad de cliente**. Su `@code` no
> llega a ninguna parte, sus `@evento` se evaporan sin diagnóstico y una `signal` declarada en
> ella tumba el prerender. Todo lo que este framework sabe hacer en el navegador está hoy
> encerrado en un componente.

---

## 1. Contexto y objetivo

### 1.1. Las evidencias

Están en `examples/basic` desde el commit `ac9ef66`, y son dos rutas escritas para contestar dos
preguntas distintas. Construyendo el ejemplo tal cual está hoy:

```
$ pnpm --filter @fudic/example-basic build
> [plugin fudic] [prerender] /ruta-reactiva: count is not defined
✓ built in 1.85s
```

**`/ruta-reactiva`** declara una `signal` en el `@code` de la ruta y la lee desde el markup. El
prerender falla, la página **no se genera** —no hay `dist/ruta-reactiva/index.html`, están las
otras once— y el build **sale en verde**.

**`/ruta-evento`** no declara nada: solo cuelga un `@click` de un botón. Se genera, y esto es lo
que hay en el HTML:

```html
<button class="sube">Súmame</button>
```

Sin `data-fud-id`, sin chunk, sin diagnóstico. El binding se evaporó en silencio.

### 1.2. Dónde está el hueco

Cuatro sitios lo dicen por escrito, y los cuatro dicen lo mismo:

| Fichero | Qué hace hoy |
|---|---|
| `packages/vite/src/transform.ts` (`transformFudClient`) | devuelve `null` si la entrada no es un componente: *«a page, a route and a layout are rendered, not hydrated»* |
| `packages/vite/src/server.ts` (`emitServerModule`) | el `?server` filtra **solo** `server-region`; la zona neutra y `@client` se tiran |
| `packages/compiler/src/emit/layout.ts` (`buildRouteModule`) y `module.ts` (`buildPageModule`) | no emiten el `@code` de la entrada: ningún nombre declarado por la ruta existe dentro de `page()` |
| `packages/compiler/src/emit/level.ts` (`hydratableTags`) | recorre solo componentes |

Y el motor de hidratación está indexado por **tag**: el capturador coge `host.localName`
(`capture.ts`), la URL sale de `resolveChunk(tag)`, y `fud-tree` / `fud-bus` / `fud-eager` son
todos `tag → tags`. Una ruta no tiene tag. Ese es el nudo que este SDD deshace.

### 1.3. El objetivo

**Una ruta se comporta como un componente.** Mismo reparto de `@code`, mismo chunk, mismo
capturador, mismas reglas de quién sube y cuándo. Lo único que cambia es su raíz: un componente
adopta su `shadowRoot`; una ruta adopta el `<body>`.

Y una consecuencia que no es opcional: **los formularios**. Escribir un `<form control>` directo
en la ruta, con componentes envolviendo los `input`, es lo que va a hacer cualquiera antes que
fabricar un componente para el formulario entero. Hoy eso no funciona y no avisa.

### 1.4. Lo que este SDD NO es

No es la mitad de cliente de un **layout**. Un layout tiene exactamente el mismo agujero y merece
su propia spec; aquí su markup se trata como estático. Está en §7 con su condición de reapertura.

---

## 2. Dependencias

Todas en `Hecho`. Lo que cada una aporta y que aquí se da por disponible:

**SDD-15 — Emit.** La forma del chunk de cliente de un componente: `static c($props)` que
devuelve `{c, h, u, r}`, el camino de adopción por cursor de elementos, `data-fud-id` como
identidad de instancia, y los bloques `<script type="application/json">` al final del body
(`fud-state`, `fud-tree`, `fud-bus`) con su regla: **lo vacío no se emite**.

**SDD-17 — Hidratación.** El capturador (`createCapturer`), los tres caminos, la cascada en
post-orden (`prepareTag` / `prepareCells` / `attachAll`), el bus, el observador de warm
(`startWarmObserver`) y `readPageMaps`.

**SDD-19 / SDD-27 — Build y manifiesto.** El `transform` por `.fud`, los ids `?server` y
`?client`, el prerender, `createUrlResolver(base, build)` con `hydrateUrl(name)`, el directorio
`assets/h`, y `safeName(pattern)` — `/blog/:slug` → `blog-slug` — que ya nombra el chunk de
render de cada ruta y vive en `@fudic/transport` justo para que build y runtime no discrepen.

**SDD-21 — Layouts.** La composición **por módulo ES**: un módulo de ruta importa el de su
layout y le pasa cuatro huecos (`head`, `body`, `section`, `blocks`). En `blocks($dom, $parent)`,
`$parent` **es el nodo `<body>`**, porque solo el layout más externo sabe dónde acaba el cuerpo.

**SDD-30 — Renders de bloque.** Los cinco constructos como funciones con su registro. El emisor
de cliente los usa igual desde una ruta que desde un componente.

**SDD-31 — Signals derivadas.** `computed`, `effect` (que devuelve baja y admite limpieza por
vuelta), y **la rama de servidor §4.6**: los *stubs* inertes que hacen que el servidor pueda
pintar el valor inicial de una `signal` declarada en `@client` sin ejecutar nada del cliente.
`checkNeutralEffect` (`oxc-code.ts`) ya recorre el `@code` buscando llamadas a `effect`.

**SDD-34 — Formularios en el compilador.** `control`, `formassociated`, y `fud-eager`: la lista
de lo que sube **sin gesto**, con su motivo escrito (§4.5) — un elemento form-associated a medio
levantar no es etiquetable, no aporta a `FormData` y no tiene validez.

---

## 3. Interfaz pública

### 3.1. `@fudic/compiler`

```ts
/**
 * The client chunk of a route: its `@client` half, adopting the composed page from `<body>`.
 * `null` when the route declares no client half at all — the zero-JS base case.
 */
export function emitRouteClientModule(
  graph: DocumentGraph,
  options?: EmitOptions,
): string | null;

/** As `emitRouteClientModule`, plus the output↔source mappings and missing assets. */
export function emitRouteClientModuleMapped(
  graph: DocumentGraph,
  options?: EmitOptions,
): EmitOutput | null;

/** Whether a route has a client half at all — the one predicate the build asks. */
export function isReactiveRoute(graph: DocumentGraph): boolean;

/** How the route comes up: on a gesture, or at install (SDD-34 §4.5). */
export function routeHydration(graph: DocumentGraph): 'gesture' | 'eager';
```

`emitRouteModule` / `emitPageModule` pasan a emitir el `@code` de su entrada: la zona neutra
íntegra y los *stubs* inertes de los nombres de `@client`, exactamente como `emitComponentModule`.

### 3.2. `@fudic/ssr`

```ts
/**
 * Fill the slice of a host held DIRECTLY, rather than through the shadow it owns.
 *
 * `state(shadow, …)` reaches the host through `shadow.parent`, which is all a component's
 * `render` ever holds. A route holds the `<body>` itself, and there is no shadow to go
 * through. `state` delegates to this one, so there is a single implementation.
 */
stateOf(host: SsrNode, values: readonly unknown[], cells?: readonly CellDecl[]): void;
```

### 3.3. `@fudic/core`

```ts
/** The block ids the render writes. Two more, and both may be absent. */
export const ROUTE_BLOCK = 'fud-route';
export const DATA_BLOCK = 'fud-data';

export interface PageMaps {
  // …tree, bus, eager, slice, count
  /**
   * The route's chunk name — `safeName(pattern)` — or `null` when this page has no client
   * half of its own. Absence is the base case: a zero-JS route publishes no block.
   */
  readonly route: string | null;
  /** What `load()` returned, trimmed to what the client half reads (§4.8). `{}` with none. */
  readonly data: unknown;
}
```

`HydrationOptions.resolveChunk` no cambia de firma: una ruta se resuelve con el mismo
`resolveChunk(name)` que un tag, porque `hydrateUrl` es aritmética sobre un nombre y no le
importa de dónde salió.

### 3.4. La forma del chunk de una ruta

Un módulo con una exportación por defecto, **no** un custom element: una ruta no se define, no
se instancia y no se fabrica nunca en caliente.

```js
// assets/h/ruta-reactiva-<build>.js
import { signal, subscribe as $sub } from '@fudic/core';

export default ([$dom, $root, $data, ...$props]) => {
  // the neutral zone and the `@client` body, verbatim
  const count = signal(1);
  // …blocks, $m, $s, $a, $u
  return {
    h: () => { /* adopt + hook up */ },
    u: ($p) => { /* value channel */ },
    r: () => { /* release */ },
  };
};
```

Tres diferencias con el de un componente, y ninguna más:

- **No hay `c`.** Un componente puede nacer en caliente porque su padre lo monta. Una ruta viene
  siempre del servidor.
- **`$root` es el `<body>`**, donde un componente recibe su `shadowRoot`.
- **`$data`** ocupa una posición fija antes de los props.

`$props` es la rebanada del payload resuelta por el runtime (`cells.resolve(id)`), igual que la
de un componente: es lo que permite que una signal de la ruta cruce por referencia a un hijo.

### 3.5. `@fudic/vite`

`transformFudClient` deja de devolver `null` para una entrada `route-document` o `page-document`
y delega en `emitRouteClientModuleMapped`. El chunk se nombra `assets/h/<safeName>` — el mismo
directorio y la misma aritmética que los de componente, y sin colisión posible porque un nombre
de ruta lleva guiones donde un tag lleva un guion obligatorio y un patrón nunca produce un tag
válido con la forma `a-b` por accidente; si aun así coincidieran, el diagnóstico es `FUD0622`.

---

## 4. Comportamiento

### 4.1. El `@code` de una ruta se parte como el de un componente

| Zona | Servidor | Cliente |
|---|---|---|
| `@server` | sí — sigue siendo el módulo `?server` con `load` / `paths` | nunca |
| neutra | sí | sí |
| `@client` | **stub inerte** (SDD-31 §4.6) | sí, verbatim |

El *stub* inerte es lo que arregla el `count is not defined` de §1.1: el servidor no ejecuta el
cuerpo de `@client`, pero declara sus nombres reactivos de forma que leerlos devuelva el valor
inicial. Es exactamente el mecanismo que un componente ya tiene, aplicado al módulo de la ruta.

Con eso, el fichero de §1.1 se escribe donde se tiene que escribir:

```html
@code {
  @client {
    import { signal } from "@fudic/core";
    const count = signal(1);
    function mas() { count.set(count() + 1); }
  }
}

<button @click=@mas>+1</button>
<output>@count()</output>
```

El servidor pinta `<output>1</output>`. El cliente sigue desde ahí.

### 4.2. La raíz es el `<body>`

Un componente tiene un elemento propio que envuelve todo lo suyo: su tag. Una ruta **no**, y no
se le puede fabricar uno: sería un custom element que la mayor parte de su vida está en
`:not(:defined)`, con lo que eso arrastra en CSS y en pintado.

Lo único garantizado es el `<body>`. Un layout puede no escribir un `<main>` —nada le obliga—,
pero no puede emitir una página sin `<body>`. Así que:

- El `<body>` lleva el `data-fud-id` de la ruta, y **solo cuando la ruta es reactiva**.
- Ese id es la clave del capturador (`state.hydrated`) y el índice de la rebanada del payload.
  No hay ninguna clave inventada.

Lo reclama el módulo de la ruta desde el hueco `blocks($dom, $parent)`, que es donde `$parent`
**es** ese nodo (SDD-21 §4.5). Rellena su rebanada con `stateOf` (§3.2).

**El id de la ruta es el último, no el primero.** `blocks()` corre al cerrar el cuerpo, así que
el `<body>` se lleva el id más alto de la página. `registry.ts` describe el orden de los ids como
pre-orden, y esto lo rompe. Se acepta a conciencia: nada depende de ese orden — `idOf` lee el
atributo, `fud-state` es posicional por id, las direcciones de celda son `[id, hueco]` y el orden
en que `allInstances` devuelve solo decide el orden de observación del warm. El criterio §6.7 lo
fija para que deje de ser una suposición.

### 4.3. La ruta adopta la **página compuesta**

El camino de adopción es un cursor de elementos: entra con `firstElementChild`, avanza con
`nextElementSibling`, nunca con `querySelector` ni con índices (SDD-15 §4.3). Arrancando en el
`<body>`, ese cursor se encuentra el markup del layout por delante del suyo:

```html
<body data-fud-id="7">
  <site-nav data-fud-id="0">…</site-nav>   ← @section nav   (de la ruta)
  <main>
    <button data-fud-id="…">+1</button>    ← cuerpo         (de la ruta)
    <output>1</output>                     ← cuerpo         (de la ruta)
  </main>
  <footer class="site">…</footer>          ←                (del layout)
</body>
```

Así que el emisor de cliente de una ruta camina **el markup del layout con el suyo empalmado**:
el cuerpo en el punto del `@RenderBody()`, cada sección en su `@RenderSection(nombre)`, y la
cadena entera cuando hay layouts anidados. La información está: `resolveDocument` ya sigue la
cadena y la deja en `graph.layouts`.

**Y no rompe el invariante de source maps.** SDD-13 §4.3 exige una sola entrada en `sources`, y
por eso la composición del servidor es por módulo y nunca por texto. Aquí se sostiene porque el
markup del layout **no aporta ni un anclaje**: atravesarlo son llamadas al cursor, sin una sola
porción verbatim del fuente. Todo lo que se ancla es de la ruta, y `sources` sigue teniendo un
elemento. El criterio §6.6 lo comprueba.

El `<head>` queda fuera del recorrido: en v1 no hay reactividad en la cabecera.

### 4.4. Las secciones no son un caso aparte

De §4.3 se sigue solo: una `@section` es otra posición del mismo recorrido. No necesita marca en
el HTML, ni raíz propia, ni una segunda entrada en ninguna parte. Un `@click` escrito dentro de
`@section nav { … }` se engancha con el mismo mecanismo que uno del cuerpo, aunque el layout
coloque esa sección en la otra punta del documento.

### 4.5. Quién es reactivo: la regla de `level.ts`, aplicada a la ruta

Una ruta tiene mitad de cliente cuando, mirando **su markup y sus secciones**:

- declara un reactivo (`signal` o `computed`) en su `@code`, **o**
- su `@code { @client }` tiene cuerpo, **o**
- alguno de sus bindings es enganche: `@evento`, `bus:` o `control`.

Es la misma sobreaproximación deliberada de `isIntrinsicallyHydratable`, con el mismo argumento:
hidratar de más cuesta un chunk que se iba a pedir de todas formas; hidratar de menos es una ruta
que no responde, y para eso no hay diagnóstico posible.

Lo que **no** la hace reactiva: renderizar componentes que sí lo son. Una ruta que solo compone
islas sigue en cero JS propio.

### 4.6. Cuándo sube: el gesto, y las dos excepciones que ya existían

| Qué contiene la ruta (o el componente) | Cuándo sube |
|---|---|
| `control` (formularios) | al instalar el runtime |
| `effect(...)` en `@client` | al instalar el runtime |
| todo lo demás | al primer gesto |

**El gesto** es el caso general, y funciona por el capturador tal cual está. El bucle de
`capture.ts` recorre `composedPath()` del objetivo hacia arriba y se queda con **el primero** que
lleve `data-fud-id`:

```
clic dentro de un componente
  [button, div, #shadow-root, app-counter, main, body, html, document]
                              ↑ sale aquí        ↑ nunca llega

clic en un botón de la ruta
  [button, main, body, html, document]
                 ↑ el primero con data-fud-id
```

El `<body>` es un **respaldo por construcción**, no un competidor: solo gana cuando por debajo no
hay ningún componente hidratable. Y cuando gana, se toma el camino 2 entero —`preventDefault`,
`stopImmediatePropagation`, descarga, y replay del gesto—, sin una rama nueva.

**`control` sube al instalar** por el motivo que SDD-34 §4.5 ya dejó escrito. Aplicado a una ruta
sale gratis: `outermostOwner` trepa al `[data-fud-id]` más externo, y con el id en el `<body>`
ese es la ruta. Un formulario escrito directo en la ruta levanta la ruta con sus controles
dentro, en post-orden.

**`effect` sube al instalar**, y esto es nuevo — vale igual para un componente y para una ruta.
Un `effect` es, por definición, lo que ocurre sin que nadie toque nada, así que un `effect` que
espera un gesto no es un `effect`. El ejemplo que lo demuestra está en §6.

Se detecta con la búsqueda que ya existe: `checkNeutralEffect` recorre el `@code` localizando
llamadas a `effect` para emitir `FUD0570`. Es la misma búsqueda, leída al revés — donde hoy dice
«esto está mal colocado», ahora también dice «esto no puede esperar».

### 4.7. El bloque `fud-route`, y de dónde sale la URL

La página dice su nombre en un bloque JSON, no en un atributo `data-*`. Es donde vive el resto de
esta información y `readPageMaps` ya lo lee así:

```html
<script type="application/json" id="fud-route">"blog-slug"</script>
```

El nombre es `safeName(patrón)` (`@fudic/transport`), que es **por patrón y no por URL**:
`/blog/uno` y `/blog/dos` son la misma ruta, el mismo chunk y el mismo nombre. La URL sale de la
misma aritmética que la de un componente:

```js
resolveChunk("blog-slug")  →  "/assets/h/blog-slug-e961c910.js"
```

No hay tabla nombre→URL, ni la va a haber, por el motivo escrito en `vite/src/client.ts`: sería
un segundo sitio donde vive el mismo dato, y expiraría por reglas distintas que el manifiesto.

Y sigue la regla de los otros bloques: **si la ruta no es reactiva, no hay bloque**. `route` es
`null`, el capturador no pregunta, y la página no paga ni un byte ni una rama.

### 4.8. `data`: solo lo que la mitad de cliente lee

Lo que `load()` devuelve vive hoy únicamente en el servidor. Como la mitad de cliente puede
leerlo, tiene que viajar — y viaja **recortado**:

```html
@code {
  @server { export async function load() { return { user: "pedro", secreto: "…" }; } }
  @client { function saluda() { alert(data.user); } }
}
```

```html
<script type="application/json" id="fud-data">{"user":"pedro"}</script>
```

El compilador tiene el AST de `@client`, así que recoge las **raíces** que se leen de `data` —
`data.user`, `data.items[0].id` → `user`, `items`— y serializa solo esas.

**Un acceso dinámico manda `data` entero, y no produce diagnóstico:**

```js
data[campo]     // no se sabe qué campo
manda(data)     // se lo lleva una función
```

No se puede legislar cómo escribe un desarrollador, y un diagnóstico aquí sería un aviso que
aparece por escribir JavaScript correcto. Se sobreaproxima y se calla.

Reglas del bloque:

- Si la mitad de cliente no lee `data`, **no se emite**. Un `data` que solo pinta el servidor no
  cuesta un byte.
- Lo que viaja tiene que ser JSON. Un `Date` o una función en `load()` ya está cubierto por la
  serialización del payload y no abre caso nuevo.
- Una ruta que lee `data` en `@client` y no declara `load` recibe **`FUD0621`** (warning): lo que
  va a encontrar ahí es `undefined`, siempre, y eso se sabe en compilación.

### 4.9. La ruta queda fuera del warm

`startWarmObserver` observa `allInstances(root)`, que es «todo lo que lleve `data-fud-id`». Con
el id en el `<body>`, la ruta entraría — y el `<body>` está en el viewport desde el primer frame,
así que su chunk se depositaría en caché **al cargar**.

No es lo que se quiere: aunque un depósito no evalúa nada, es tráfico sin interacción, y el caso
general de una ruta es el gesto. **El `<body>` se excluye del observador.**

Una ruta **ansiosa** (§4.6) tampoco lo necesita: sube al instalar, así que su chunk se pide de
verdad, no se anticipa.

### 4.10. Lo que la ruta levanta antes de levantarse ella

La cascada existe porque el padre entrega valores a los hijos que monta, así que un hijo tiene
que estar vivo antes que él. Para una ruta hacen falta dos cosas:

**Su entrada en `fud-tree`.** La clave es el nombre de la ruta, y los hijos son los tags
hidratables de **su propio markup a los que la ruta le pasa una prop**. Es más estricto que la
regla de un componente, que lista todos los hijos hidratables que renderiza, y es a propósito:
`$s()` entrega valores a los hijos a los que se los pasa, y a nadie más, así que un componente
que no recibe ninguna prop de la ruta no puede recibir un `u is not a function`. Con la regla
laxa, un clic en un botón suelto de la ruta levantaría **todas** las islas de la página, que es
justo lo contrario de lo que hace este framework.

**Que la cascada baje por la luz.** `visit` solo desciende si `host.shadowRoot !== null`. La raíz
de una ruta es el `<body>`, que no tiene shadow: desciende por el propio nodo cuando no lo hay.

### 4.11. El build se entera de un prerender roto

Hoy una ruta puede fallar al prerenderizar, quedarse fuera de `dist` y no impedir que el build
termine bien (§1.1). Eso es entregable a producción con una página menos y CI en verde.

A partir de aquí, un prerender fallido es **`FUD0620`** y **rompe el build**. No lleva span: es
un error del build, no del fichero, como los `CliError` de SDD-22.

### 4.12. En `dev`

`pnpm dev` no construye nada: el bootstrap resuelve los chunks con `CHUNKS + tag + '.js'` sobre
un prefijo estable. Una ruta usa el mismo prefijo con su `safeName`, y el servidor de desarrollo
publica el módulo `?client` de la ruta en esa URL. La derivación sigue siendo una, y sigue
eligiéndose al emitir el bootstrap, no en el runtime.

---

## 5. Invariantes

- **Spans universales.** Todo anclaje que el emisor de cliente de una ruta produzca lleva su
  offset en el `.fud` de la ruta. El markup del layout no ancla nada (§4.3).
- **El parser no se toca.** Este SDD no añade gramática, no añade token y no añade regla de
  transición del `@`. Una ruta ya se parsea entera; lo que faltaba era emitirla.
- **Nada lanza.** Un `@code` que no parsea, una `data` no serializable o un layout inalcanzable
  se anotan y el fichero se sigue emitiendo, degradado. La única excepción deliberada es
  `FUD0620`, que es del build y no del fichero.
- **Lo vacío no se emite.** Ni `fud-route`, ni `fud-data`, ni `data-fud-id` en el `<body>`, ni
  chunk. Una ruta de nivel 1 sigue costando exactamente cero bytes de JavaScript.
- **Una sola aritmética de URL.** `safeName` y `createUrlResolver` siguen siendo la única
  implementación, compartida por build y runtime.
- **El `$` es del compilador.** El cuerpo de `@client` se copia verbatim al mismo ámbito donde el
  emit escribe sus nombres privados, así que la reserva de SDD-15 §4.7 rige igual en una ruta.

### Catálogo de diagnósticos (`FUD0620`–`FUD0639`)

| Código | Severidad | Qué dice |
|---|---|---|
| `FUD0620` | `error` (build) | El prerender de una ruta falló. La página no se genera **y el build falla**. Sin span: es del build. |
| `FUD0621` | `warning` | La mitad de cliente lee `data` y la ruta no declara `load`: ahí siempre habrá `undefined`. |
| `FUD0622` | `error` | El nombre de chunk de una ruta (`safeName`) colisiona con el tag de un componente del build: dos ficheros distintos se llamarían igual. |
| `0623`–`0639` | | Reservados. |

Un acceso dinámico a `data` **no** produce diagnóstico (§4.8), y es una omisión deliberada.

---

## 6. Criterios de aceptación

Tests en `packages/compiler/test/emit/` (1–8), `packages/core/test/hydrate/` (9–13),
`packages/vite/test/` (14–17) y las evidencias en `examples/basic` (18–21).

**El reparto del `@code`**

1. **(rojo primero)** Una ruta con `@code { @client { const count = signal(1); } }` y `@count()`
   en el markup **prerenderiza** y pinta el valor inicial. Es el `count is not defined` de §1.1,
   invertido.
2. La zona neutra de una ruta aparece en **los dos** módulos —el de render y el chunk— y en el
   mismo orden en que se escribió; `@server` no aparece en el chunk **en ninguna forma**, ni sus
   imports.
3. Una ruta sin `@code { @client }` y sin ningún binding de enganche emite `null` por chunk: no
   hay fichero, no hay bloque `fud-route` y el `<body>` no lleva `data-fud-id`.

**El recorrido y las secciones**

4. Con el layout de `examples/basic` —`@RenderSection(nav)` suelto en el `<body>` y
   `@RenderBody()` dentro de un `<main>`— el chunk adopta el `<output>` del cuerpo **y** el botón
   de la sección, y no toca el `<footer>` del layout.
5. Una cadena de dos layouts anidados produce el mismo enganche que uno solo: lo que cambia es la
   profundidad del recorrido, no lo que se engancha.
6. **Source maps.** El chunk de una ruta con layout tiene **una** entrada en `sources`, y es el
   `.fud` de la ruta. Ni un anclaje apunta al layout.
7. **El id del `<body>`.** Es el más alto de la página, su rebanada se rellena con `stateOf`, y
   una signal de la ruta que cruza a un componente por prop llega como **la misma** celda: el
   hijo y la ruta comparten objeto.

**Nivel y cascada**

8. `fud-tree` lista bajo el nombre de la ruta **solo** los componentes a los que la ruta pasa una
   prop. Una página donde la ruta renderiza tres islas y solo le pasa algo a una lista **una**.
9. La cascada desciende por la luz cuando la raíz no tiene shadow, en el mismo post-orden.

**El capturador**

10. **(rojo primero)** Un clic en un botón de la ruta, sin ningún componente por debajo, descarga
    el chunk de la ruta, la levanta y **repite el gesto** una sola vez.
11. Un clic dentro de un componente hidratable levanta **el componente** y no la ruta, aunque el
    `<body>` lleve `data-fud-id`: el capturador se queda con el primero del `composedPath`.
12. Una página sin bloque `fud-route` no pregunta por ninguna ruta: `route` es `null` y el clic
    en cualquier sitio no dispara ninguna descarga.
13. **El warm no ve el `<body>`.** Con una ruta reactiva en pantalla, el observador no ordena su
    chunk; con un componente en pantalla, sí ordena el suyo.

**Build**

14. El chunk de `/blog/:slug` se emite como `assets/h/blog-slug-<build>.js`, y `/blog/uno` y
    `/blog/dos` publican el **mismo** nombre en `fud-route`.
15. `fud-data` lleva **solo** las raíces que `@client` lee; un `load` que devuelve tres campos y
    un cliente que lee uno publica un objeto de un campo.
16. Un acceso dinámico (`data[k]`) publica `data` entero **y no emite diagnóstico**.
17. **(rojo primero)** Una ruta cuyo prerender falla emite `FUD0620` y el build **termina con
    error**. Es el `✓ built` de §1.1, invertido.

**Las evidencias, en `examples/basic`**

18. **`/ruta-evento`** — el `@click` de la ruta funciona en Chrome real: el número sube. En el
    HTML el botón lleva `data-fud-id` y el chunk existe.
19. **`/ruta-reactiva`** — la página **se genera**, y en el navegador el `+1` mueve el contador,
    cambia la rama del `@if` y añade una fila al `@foreach`. El panel de control
    `<signal-control>` sigue comportándose igual: la comparación queda en una sola variable.
20. **`app-clock`** — el reloj del §6.21, añadido a `examples/basic` como componente **y** usado
    directo en una ruta. En las dos formas: el servidor pinta su hora, el cliente sigue desde la
    del navegador, y avanza un segundo por segundo **sin que nadie toque nada**. Al navegar fuera,
    el `clearInterval` corre.
21. El fichero, que es la evidencia de por qué `effect` no puede esperar a un gesto:

```html
@code {
  @client {
    import { signal, computed, effect } from "@fudic/core";

    const ahora = signal(new Date());

    const hora = computed(() =>
      ahora().toLocaleTimeString("es-ES", { hour12: false }),
    );

    const fecha = computed(() =>
      ahora().toLocaleDateString("es-ES", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    );

    effect(() => {
      const id = setInterval(() => ahora.set(new Date()), 1000);
      return () => clearInterval(id);
    });
  }
}

<head>
  <style>
    :host { display: block; padding: 1rem 1.25rem; background: #e6e6e6; }
    .hora {
      font-size: 2.6rem;
      font-weight: 300;
      font-variant-numeric: tabular-nums;
      line-height: 1.1;
      color: #202124;
    }
    .fecha { margin-top: 0.35rem; font-size: 0.9rem; color: #1a5fb4; }
  </style>
</head>

<app-clock>
  <template shadowrootmode="open">
    <time class="hora">@hora()</time>
    <p class="fecha">@fecha()</p>
  </template>
</app-clock>
```

Sin hidratar, esto pinta la hora del servidor y se queda congelado para siempre. **No es que
funcione peor: no funciona.** Ese es el criterio, y por eso `effect` entra en `fud-eager`.

22. **Cobertura.** El código nuevo de `@fudic/core` nace al **100 %** en las cuatro métricas. El
    de `@fudic/compiler` y `@fudic/vite` no baja el número que esos paquetes tienen al empezar.

---

## 7. Fuera de alcance

- **La mitad de cliente de un layout.** Un `@code { @client }` en un layout tiene exactamente el
  mismo agujero, y aquí su markup se trata como estático. Se reabre cuando alguien quiera un nav
  con estado propio que sobreviva a la navegación — que es también cuando habrá que decidir si un
  layout es un ámbito reactivo o un componente disfrazado.
- **Reactividad en el `<head>`.** Un `<title>` que se mueve con una signal. El recorrido de §4.3
  se queda en el `<body>`.
- **La ruta que cambia en sitio.** Hoy se navega reemplazando el documento (SDD-20), así que el
  chunk de la ruta muere con la página. El día que una navegación no recargue, hace falta llamar
  a `r()` y a `cells.clear()` — el gancho ya existe (BUG-24 §4.8).
- **`data` que se mueve.** El bloque `fud-data` es una foto del render. Una `data` reactiva —que
  se refresque sin navegar— es otra cosa y necesita el canal de datos, no este bloque.
- **Que un `setInterval` suelto en `@client` haga ansioso a nadie.** La regla de §4.6 es sobre
  `effect(...)`, que es detectable y tiene significado declarado. Detectar «código que se mueve
  solo» en general es análisis de flujo, y su sitio es el language server.
- **La deuda de cobertura** de `@fudic/compiler`, `@fudic/transport` y `@fudic/vite`. Se salda en
  su propia tanda.
