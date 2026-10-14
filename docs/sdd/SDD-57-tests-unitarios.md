# SDD-57 — Tests unitarios de componentes, rutas, layouts y snippets: `@fudic/testing`

> **Estado:** `Listo` — [tareas](./SDD-57-Task.md), 20 / 30.
> **Paquetes:** `@fudic/testing` (nuevo) · `@fudic/vite` · `@fudic/core` · `@fudic/http` ·
> `@fudic/example-basic`
> **Depende de:** 17 (hidratación), 19 (plugin, routing y dev server), 20 (Service Worker),
> 33 y 34 (formularios), 38 (inyección), 40 (props de layout), 52 (`.fudspec` y fixtures),
> 56 (funciones de servidor)
> **Rango de diagnósticos:** ninguno. Los errores de esta spec los ve quien escribe un test, y
> son excepciones del harness, no diagnósticos de un fichero.
> **Rama sugerida:** `sdd-57-tests-unitarios`
>
> **Qué añade en una frase.** Un `*.test.ts` de vitest monta un componente, visita una ruta,
> pinta un layout o expande un snippet en happy-dom, con el mismo HTML que da el servidor y la
> misma hidratación que hace el navegador. Las funciones de servidor que el test llama las
> atiende un servidor en memoria con la cadena entera, sin mockear la función ni la red.

---

## 1. Contexto y objetivo

Hoy un `.fud` se prueba de dos formas: con Playwright contra la app construida
(`examples/basic/tests/*.spec.ts`) o con una `.fudspec` en el banco de trabajo. Las dos
necesitan un navegador y un build. No hay forma de escribir un test rápido, en vitest, para
el componente que se está escribiendo. Ningún `vitest.config` del repo carga el plugin
`fudic()`, así que ningún test puede importar un `.fud`.

Esta spec añade esa capa. Es lo que el desarrollador escribe:

```ts
// src/components/app-counter.test.ts
import { mount } from '@fudic/testing';
import * as AppCounter from './app-counter.fud';

test('suma al pulsar', async () => {
  const t = await mount(AppCounter, { props: { start: 2 } });

  await t.click(t.getByRole('button', { name: '+' }));

  expect(t.getByRole('status')).toHaveTextContent('3');
});
```

```ts
// src/components/user-form.test.ts
import { mount } from '@fudic/testing';
import * as UserForm from './user-form.fud';

vi.mock('../data/aliases', () => ({ aliasTaken: async (a: string) => a === 'admin' }));

test('alias ocupado: lo dice el servidor', async () => {
  const t = await mount(UserForm);

  await t.type(t.getByLabelText('Alias'), 'admin');
  await t.submit();

  // validate cliente → csrf.client → codec → fetch → dispatch → csrf.server
  // → serverValidator(aliasTaken mockeado) → 422 → fromProblem → slot de error
  expect(t.errorOf('Alias')).toBe('Ese alias ya existe');
});
```

### 1.1. La frontera con `.fudspec`

| Va a vitest (esta spec) | Va a `.fudspec` en navegador (SDD-52, SDD-32) |
|---|---|
| Estructura del markup, texto, atributos | Medidas (`min-height`), `visible`, layout |
| Estado, señales, props, eventos | El foco real (`delegatesFocus` en acción) |
| Funciones de servidor, middlewares, errores | La resolución ARIA a través de `referenceTarget` |
| Formularios, validación, slots de error | Lo que depende del motor de CSS |
| Las opciones con las que nace cada shadow root | |

happy-dom no hace layout ni resuelve referencias ARIA entre shadow roots. Un test unitario
que lo intentara pasaría en verde sin probar nada.

### 1.2. Por qué no se mockea la función ni el `fetch`

Mockear `save` dejaría sin ejecutar la validación del formulario, la cadena de middlewares,
los codificadores del cuerpo, el servidor y la decodificación del error. Mockear `fetch` con
una respuesta escrita a mano obliga al test a escribir el formato del cable y deja sin
ejecutar el servidor. Esta spec hace que **todo corra**: el `fetch` que lanza `$fn` lo atiende
un servidor en memoria con el `dispatch` real, y el test mockea solo en el borde de los
datos (`vi.mock` del módulo que lee la base de datos).

## 2. Dependencias

| SDD | Qué aporta |
|---|---|
| 17 | `installHydration(options)` ([install.ts:177](../../packages/core/src/hydrate/install.ts#L177)) acepta `resolveChunk`, `importModule` y `document`. Con ellos el harness carga el chunk `?client` de vitest en vez de por URL. |
| 19 | El plugin `fudic()` ([plugin.ts:216](../../packages/vite/src/plugin.ts#L216)). Su `transform` ([plugin.ts:1377](../../packages/vite/src/plugin.ts#L1377)) distingue el `.fud` a secas (`render`, `tag`, `css`), `?client` (el `customElements.define`), `?server` (`emitServerModule`) e `?ioc`. En el camino de cliente (`ssr !== true`) borra el argumento de `serverValidator` y las mitades `.server` de un `.ts` ([plugin.ts:1384-1393](../../packages/vite/src/plugin.ts#L1384-L1393)). El wrapper de una ruta lo escribe `emitRenderChunk` ([wrapper.ts:65](../../packages/vite/src/wrapper.ts#L65)), y `renderRouteHtml` lo drena a HTML ([serve.ts:118](../../packages/vite/src/serve.ts#L118)). Un fichero de snippets emite un módulo vacío ([transform.ts:521](../../packages/vite/src/transform.ts#L521)): sus snippets se expanden en compilación dentro de quien los llama. |
| 20 | El Service Worker invalida cuando recibe `{ type: INVALIDATE_MESSAGE, paths }` por `postMessage` y contesta por el `MessageChannel` ([invalidate.ts](../../packages/http/src/client/invalidate.ts)). |
| 14, 15 | Un componente compilado exporta `render($dom, $shadow, props, $ioc)`, `tag` y `css` ([module.ts:391](../../packages/compiler/src/emit/module.ts#L391)). Un layout exporta `layout(data, io, route, $ioc, PROPS)`, donde `route` lleva `head`, `body` y las secciones como closures ([layout.ts:195](../../packages/compiler/src/emit/layout.ts#L195)). `renderToString` serializa un `SsrDom` ([serialize.ts:42](../../packages/ssr/src/serialize.ts#L42)). |
| — | El `<template>`: `shadowrootmode` tiene que ser `"open"` (`FUD0158`). `shadowrootdelegatesfocus` lo emite el compilador en un componente form-associated ([markup.ts:498](../../packages/compiler/src/emit/markup.ts#L498)). `shadowrootreferencetarget` lo escribe el autor y el cliente lo copia a `static referenceTarget` ([client.ts:421](../../packages/compiler/src/emit/client.ts#L421)). `shadowrootadoptedstylesheets` se proyecta al host como `data-fud-adopt`, y `adoptSheets` lo resuelve ([adopt-sheets.ts:39](../../packages/core/src/adopt-sheets.ts#L39)). En cliente, `FudicElement.c()` hace `attachShadow(this.shadowInit())` ([element.ts:73](../../packages/core/src/element.ts#L73)). |
| 33, 34 | Un formulario es un objeto `.ts` (`form(…)`) con `$set`, `$validate({ server })` y `$errors`. El slot de error de un control lo deja el emit: el elemento de `error=@…` recibe un `id` (`fud-e-<form>-<campo>`) y el control, el `aria-describedby` que lo apunta. |
| 38 | `createRoot`, `createChild` y `provide` de `@fudic/di`. Un componente resuelve contra el contenedor de su ancestro. |
| 52 | Las fixtures `<tag>.fixture.ts`: un `export default` con un objeto de props por nombre. |
| 56 | `functionsHandler(source, options)` ([functions.ts:58](../../packages/http/src/server/functions.ts#L58)) recibe un `Request` y devuelve `Response \| null`. `devSource(modules)` ([vite/functions.ts:96](../../packages/vite/src/functions.ts#L96)) arma la tabla de funciones leyendo `<path>?server`. `$fn` llama a `fetch` global ([fn.ts:112](../../packages/http/src/client/fn.ts#L112)) y a `invalidate` al terminar. |

## 3. Interfaz pública

### 3.1. Configurar vitest

```ts
// vitest.config.ts del proyecto
import { defineConfig } from 'vitest/config';
import { fudicTest } from '@fudic/testing/config';

export default defineConfig({
  plugins: [fudicTest()],
});
```

`fudicTest(options?)` devuelve el plugin `fudic()` del proyecto (lee su `fudic.json` y su
`src/http.ts` como `vite dev`) y fija en vitest el entorno `fudic` (§4.1) y la URL base
`http://localhost/`. No hace falta nada más. `options` acepta lo mismo que `fudic()`.

### 3.2. `mount`: un componente

```ts
mount<P>(component: FudModule<P>, options?: MountOptions<P>): Promise<Mounted>;

interface MountOptions<P> {
  props?: P;
  /** `'ssr'` (por defecto): HTML del servidor + DSD + hidratación. `'client'`: createElement. */
  via?: 'ssr' | 'client';
  /** La URL de la página donde vive. Por defecto `/`. Los params de una función de ruta salen de aquí. */
  url?: string;
  /** Proveedores que sustituyen a los del árbol, en cliente y en servidor. */
  providers?: readonly { provide: Provider<unknown>; use: () => unknown }[];
  /** Sustituye al servidor en memoria para las peticiones de este test (§3.5). */
  fetch?: (request: Request) => Response | Promise<Response>;
  /** Simula un Service Worker que controla la página (§3.6). */
  sw?: boolean;
}
```

`component` es el namespace que da `import * as X from './x.fud'`: `FudModule` es `tag`, `css`
y `render` (`layout` en un layout). Un `.fud` compilado no tiene `export default`. En el entorno
`fudic`, y solo ahí, el plugin `fudic:test` le añade `$file`, la ruta del `.fud`, para que la
página anfitriona de §4.2 pueda enlazarlo. Las props se pueden sacar de la fixture de la
`.fudspec`:

```ts
import fixtures from './app-card.fixture';
const t = await mount(AppCard, { props: fixtures.destacada });
```

Con `via: 'ssr'` (el valor por defecto) **las props tienen que ser JSON**: viajan como
el `data` de la página anfitriona y las pinta el servidor, y lo que el servidor pinta viaja por el
estado de hidratación. Una prop que no lo es (`undefined`, una función, una fecha, una señal)
hace que `mount` lance un `Error` que nombra la prop y propone `via: 'client'`, donde las props
se asignan como las asigna un padre y pueden ser cualquier valor. Una prop que el componente no
declara también lanza, por los dos caminos.

Un `.fud` con errores no llega a `mount`: importarlo rechaza con los diagnósticos pintados como
los pinta el build (`ruta:línea:col - error FUDnnnn: mensaje`). Una expresión rota (`@(`) también:
sale su diagnóstico FUD, no el error de Oxc sobre el módulo generado, en el test y en `vite dev`.

### 3.3. `Mounted`: lo que devuelve

```ts
interface Mounted {
  readonly host: HTMLElement;        // el elemento del componente
  readonly root: ShadowRoot;         // su shadow root
  readonly invalidated: readonly string[];   // §3.6

  // Consultas: buscan dentro de `root` y bajan a los shadow roots de los hijos.
  getByRole(role: string, options?: ByRoleOptions): HTMLElement;
  getByLabelText(text: string | RegExp): HTMLElement;
  getByText(text: string | RegExp): HTMLElement;
  queryByRole(role: string, options?: ByRoleOptions): HTMLElement | null;
  query(selector: string): Element | null;       // CSS, también bajando por shadow roots
  /** El texto del slot de error del control con esa etiqueta (el que nombra su `aria-describedby`), o `null` si está vacío. */
  errorOf(label: string | RegExp): string | null;

  // Gestos: cada uno espera a que todo lo que dispara termine (§4.6).
  click(target: Element): Promise<void>;
  type(target: Element, text: string): Promise<void>;
  clear(target: Element): Promise<void>;
  blur(target: Element): Promise<void>;
  submit(form?: Element): Promise<void>;
  /** Cambia props, como haría el padre, y espera al repintado. */
  props(next: Partial<P>): Promise<void>;
  /** Espera a que no quede nada pendiente: peticiones, chunks, microtareas. */
  settled(): Promise<void>;

  unmount(): void;
}
```

Las consultas y los gestos son los de Testing Library (`@testing-library/dom`,
`@testing-library/user-event`), con dos diferencias: bajan por los shadow roots y esperan a
que el gesto termine. Los matchers de `@testing-library/jest-dom` quedan registrados.

### 3.4. Las opciones de un shadow root

```ts
shadowOf(host: Element): ShadowShape;

interface ShadowShape {
  mode: 'open';
  delegatesFocus: boolean;
  clonable: boolean;
  serializable: boolean;
  referenceTarget: string | null;
  /** Los specifiers de las hojas adoptadas, en orden. La propia del componente es `'self'`. */
  adoptedStyleSheets: readonly string[];
}
```

Es lo que tiene que comprobar un test de las variantes del `<template>`, con una matriz de
los dos caminos por los que nace un shadow root:

```ts
describe.each(['ssr', 'client'] as const)('app-input vía %s', (via) => {
  test('shadow root', async () => {
    const t = await mount(AppInput, { via });
    expect(shadowOf(t.host)).toEqual({
      mode: 'open',
      delegatesFocus: true,
      clonable: false,
      serializable: false,
      referenceTarget: 'campo',
      adoptedStyleSheets: ['self'],
    });
  });
});
```

Y el contrato del HTML del servidor, sin DOM:

```ts
const html = await renderToHtml(AppInput, { props });
expect(html).toContainTemplate({ shadowrootmode: 'open', shadowrootreferencetarget: 'campo' });
```

`toContainTemplate(attrs)` comprueba que el `<template>` del host tiene **exactamente** esos
atributos `shadowroot*`: uno de más o uno de menos falla.

### 3.5. Las funciones de servidor

No hay API: el test llama a la función como lo hace la vista, y el servidor en memoria la
atiende (§4.5). Se mockea en el borde de los datos:

```ts
vi.mock('../data/users', () => ({ findUser: async () => ({ id: 7, name: 'Pedro' }) }));
```

Para lo que el servidor real no provoca, `fetch` sustituye al servidor en ese test:

```ts
const t = await mount(UserForm, { fetch: () => { throw new TypeError('Failed to fetch'); } });
const t = await mount(UserForm, { fetch: () => new Response(null, { status: 500 }) });
```

Una petición fuera de `/_fudic/fn/` sin `fetch` en las opciones es un error del test: el
harness lanza nombrando la URL, en vez de dejarla salir a la red.

### 3.6. El Service Worker

```ts
test('guardar invalida la lista', async () => {
  const t = await mount(UserForm, { sw: true });
  await t.type(t.getByLabelText('Nombre'), 'Pedro');
  await t.submit();
  expect(t.invalidated).toEqual(['/usuarios']);
});
```

Con `sw: true`, `navigator.serviceWorker.controller` es un worker simulado que apunta cada
`paths` recibido en `t.invalidated` y contesta por el `MessageChannel`. Sin `sw`, no hay
controller y `t.invalidated` queda vacío.

### 3.7. `visit`: una ruta

```ts
visit(url: string, options?: VisitOptions): Promise<Visited>;

interface VisitOptions {
  /** Sustituye a lo que devuelve `load`. `layout(ctx, data)` corre igual, con este `data`. */
  data?: unknown;
  providers?: readonly { provide: Provider<unknown>; use: () => unknown }[];
  fetch?: (request: Request) => Response | Promise<Response>;
  sw?: boolean;
}

interface Visited extends Omit<Mounted, 'host' | 'root' | 'props'> {
  readonly document: Document;   // la página entera: <html>, <head>, <body>
  readonly status: number;
}
```

```ts
vi.mock('../data/posts', () => ({ findPost: async () => undefined, listSlugs: async () => [] }));

test('slug inexistente', async () => {
  const page = await visit('/blog/nope');
  expect(page.document.title).toBe('Artículo no encontrado — fudic');
});

test('el lang sale del dato, vía layout()', async () => {
  const page = await visit('/blog/x', { data: { title: 'X', tag: 'a', body: '', found: true, lang: 'en' } });
  expect(page.document.documentElement.lang).toBe('en');
});
```

La URL se resuelve con el routing del plugin, igual que en `vite dev`: params, `base` y
`_error.fud` incluidos.

### 3.8. `renderLayout`: un layout sin ruta

```ts
renderLayout(layout: FudModule, options?: {
  props?: Record<string, unknown>;
  body?: string;                        // HTML
  sections?: Record<string, string>;    // HTML por sección
  head?: string;
}): Promise<Visited>;
```

```ts
import * as Layout from '../layouts/_layout.fud';

test('culture por defecto', async () => {
  const page = await renderLayout(Layout, { body: '<p>cuerpo</p>', sections: { nav: '<a href="/">Inicio</a>' } });
  expect(page.document.documentElement.lang).toBe('es');
  expect(page.getByText('cuerpo')).toBeInTheDocument();
});
```

### 3.9. `renderSnippet`: un snippet

```ts
renderSnippet(file: string, call: string, options?: { scope?: Record<string, unknown> }): Promise<Mounted>;
```

`file` va relativo al test. `call` es lo que se escribe tras `@render`, en sintaxis `.fud`.
`scope` da nombre a los valores que no son literales:

```ts
test('ficha con tono', async () => {
  const t = await renderSnippet('../snippets/ui.fud', 'ficha("Hola", tono: "info")');
  expect(t.getByRole('heading')).toHaveTextContent('Hola');
  expect(t.query('app-badge')).toHaveProperty('tone', 'info');
});

test('con un objeto', async () => {
  const t = await renderSnippet('./campos.fud', 'fila(item)', { scope: { item: { id: 1, name: 'A' } } });
});
```

### 3.10. Lo que se ve que corre en el navegador

```ts
clientGraphOf(component: FudModule): Promise<ClientGraph>;

expect(await clientGraphOf(UserForm)).not.toReach('src/data/aliases.ts');
```

Recorre los imports del chunk `?client` con la transformación de **cliente** del plugin (la
que borra `serverValidator` y las mitades `.server`) y sin ejecutar nada. `toReach(path)`
falla si algún módulo del recorrido es ese fichero, relativo a la raíz del proyecto.

## 4. Comportamiento

### 4.1. Un solo grafo de módulos

`vi.mock` solo actúa sobre el grafo de módulos de vitest. Si el servidor en memoria cargase
sus módulos por otro lado (un `createServer` de Vite aparte), el mock del test no le llegaría.
Por eso el test, el cliente y el servidor viven en el **mismo** grafo:

- El entorno `fudic` pone los globals de happy-dom, como el entorno `happy-dom` de vitest,
  pero transforma los módulos por el camino **SSR** del plugin (`viteEnvironment: 'ssr'`).
- En ese camino el plugin no borra nada: un `.ts` llega entero, con sus dos mitades de
  middleware y su `serverValidator`. Cada mitad corre solo en su lado porque la cadena se
  compone por lado (`compose(levels, 'client')` en `$fn`, `'server'` en `dispatch`), no porque
  la otra mitad falte.
- Lo que se borra para el navegador se comprueba aparte y sin ejecutar: `clientGraphOf`
  (§3.10).

La diferencia con producción es una, y es conocida: un módulo con estado (una variable de
módulo, una señal global) es la **misma instancia** para el lado servidor y el lado cliente
del test. En producción son dos. Un test que dependa de que no se compartan va a `.fudspec`.

### 4.2. `via: 'ssr'`: el DSD lo aplica el harness

1. Una **página anfitriona virtual** instancia el componente: un documento de página que lo
   enlaza con `<link rel="component">` y lo escribe con cada prop leída de su `data`
   (`<x-tag .prop=@(data["prop"])>`, decisión 8.1.14). Se pinta como `vite dev` pinta una ruta,
   con las props como `data`: el wrapper de `emitRenderChunk` y el drenado de `renderRouteHtml`, importados por el grafo de vitest. Así
   el host (`claim`, `data-fud-adopt`, las opciones de su shadow root), los mapas de hidratación
   (`fud-state`, `fud-tree`…) y las hojas `<style type="module">` del `<head>` los escribe el
   compilador, no el harness: el `render` de un componente no los escribe, los escribe quien lo
   instancia y la página que lo contiene (decisión 8.1.9). La página y su wrapper se escriben en
   `node_modules/.fudic-test/` del proyecto, nombrados por su contenido.
2. El HTML entra en el documento: los atributos de `<html>` y el `<head>` tal cual, y el
   contenido del `<body>` por un `<template>` (sin DSD: `innerHTML` no lo aplica), importado al
   documento, en un `<body>` nuevo que sustituye al anterior.
3. Por cada `<template shadowrootmode>`, del más interno al más externo, el harness hace
   `host.attachShadow(init)` con `init` sacado de sus atributos (`shadowrootdelegatesfocus`,
   `shadowrootclonable`, `shadowrootserializable`, `shadowrootreferencetarget`), adopta las hojas
   que nombra `shadowrootadoptedstylesheets`, mueve el contenido y quita el `<template>`. No
   depende del parser de happy-dom, que solo conoce `shadowrootmode` y `shadowrootserializable`.
4. Instala la hidratación como la instala `fudic:runtime` (§4.5), con la escucha de captura en
   ese `<body>` nuevo: la del test anterior muere con el suyo.

### 4.3. `via: 'client'`: lo crea el runtime

`document.createElement(tag)` con el chunk `?client` ya definido, las props asignadas como
las asigna un padre, y al `body`. Como `live()` cuando un padre fabrica un hijo: `c([props])`
con las props en el orden en que el componente las declara (el mismo `propsOf` del registro del
compilador que lee el padre). `t.props(next)` llama a `u()` con el array disperso, como un padre.
El shadow root lo crea `FudicElement.c()` con `shadowInit()`. Aquí las props pueden ser
cualquier valor.

### 4.4. `shadowOf`: lo que de verdad se pidió

happy-dom guarda `delegatesFocus` y `clonable`, pero no `referenceTarget`. El harness envuelve
`Element.prototype.attachShadow` mientras el entorno vive y apunta en un `WeakMap` el `init`
de cada llamada, venga del §4.2 o del §4.3. `shadowOf` lee ese `init` y las hojas de
`root.adoptedStyleSheets`, cada una con el specifier del que salió (`'self'` para la del
`<style>` del componente).

**Los dos caminos tienen que dar el mismo `ShadowShape`.** Si no lo dan, es un bug del
compilador o del runtime, y se arregla en esta spec (tarea 23).

### 4.5. La hidratación

`installHydration` con `document` del entorno, `root` el `<body>` de la página,
`resolveChunk` que da el id `?client` de cada tag del grafo de la página anfitriona,
`importModule` que lo importa por el grafo de vitest e `importDeferred` que entrega el
adaptador DOM y la señal de ese mismo grafo. Un gesto sobre un componente sin hidratar lo
levanta igual que en el navegador, por el camino 2: el primer clic cuenta.

happy-dom no hace el upgrade de un custom element en su sitio: al definir un tag **sustituye**
cada instancia conectada por un elemento nuevo y el shadow root se queda con el viejo. Mientras
el entorno vive, el harness envuelve `customElements.define`, retira esas sustituciones y hace
el upgrade en el sitio, como el algoritmo estándar: el constructor de la clase sobre el mismo
elemento (decisión 8.1.10).

### 4.6. El servidor en memoria

Mientras el entorno vive, `globalThis.fetch` es una función del harness:

1. Si el test pasó `fetch`, la llama a ella y nada más.
2. Si la URL empieza por `/_fudic/fn/`, la pasa a `functionsHandler` con una tabla armada
   como la de `devSource`, pero leyendo cada `?server` por el grafo de vitest (§4.1). Las
   cookies y cabeceras del `Request` llegan tal cual: `csrf.server` ve la cabecera que puso
   `csrf.client`, y `Sec-Fetch-Site: same-origin`.
3. Cualquier otra URL lanza (§3.5).

El `ServerContext` corre dentro del `AsyncLocalStorage` de `dispatch`, así que `inject` a
secas en el servidor resuelve como en producción, con los `providers` del test encima.

### 4.7. Esperar a que termine

Un gesto (`click`, `type`, `submit`…) no resuelve hasta que no queda nada pendiente: las
peticiones al servidor en memoria, los chunks que la hidratación está importando y las
microtareas de las señales. `settled()` es esa misma espera, para lo que el test dispara a
mano. Nunca hay un `setTimeout` de espera fija.

### 4.8. Aislamiento entre tests

Tras cada test (`afterEach` que registra el entorno): se vacía el `document`, se desinstala la
hidratación, se restaura `fetch`, se quita el worker simulado y se olvidan los `init`
apuntados. Un `customElements.define` no se puede deshacer, y el chunk de un componente se
importa una vez por fichero de test. Para que eso no se note, cada página instalada ve un tag
como definido solo cuando su propio cargador lo ha pedido (decisión 8.1.12): la siguiente página
del mismo fichero levanta sus instancias por el camino 2, como una página recién cargada.

### 4.9. Rutas y layouts

`visit(url)` resuelve la URL con el routing del plugin, escribe el wrapper con
`emitRenderChunk` y lo drena como `renderRouteHtml`, con `load` cargado por el grafo de vitest.
Con `data` el wrapper recibe ese valor en vez de llamar a `load`, y `layout(ctx, data)` corre
igual. El HTML resultante sustituye al `document` entero, y desde ahí siguen los pasos 3 y 4
del §4.2.

`renderLayout` llama a `layout(data, io, route, $ioc, props)` con un `route` cuyos closures
escriben el HTML de `head`, `body` y cada sección.

### 4.10. Snippets

Un snippet no existe en runtime. `renderSnippet` escribe un componente anfitrión virtual
(`\0fudic-test-snippet:<n>.fud`), como el anfitrión del banco de trabajo
([host.ts:41](../../packages/workbench/src/host.ts#L41)): enlaza `file` con
`<link rel="snippet">`, declara cada clave de `scope` en su `@code` con su valor como literal y
escribe `@render <call>` en su plantilla. Luego lo monta como §3.2. Los componentes que el
snippet instancia llegan con él, igual que en una página.

## 5. Invariantes

- **Todo corre.** Ni la función de servidor, ni la cadena, ni el cable, ni el `dispatch` se
  sustituyen en un test que no lo pide con `fetch`.
- **El HTML es el del servidor.** `via: 'ssr'` y `visit` pintan con el mismo `render` que
  `vite dev`, nunca con una plantilla del harness.
- **El harness no inventa platform.** Lo que happy-dom no hace (layout, foco delegado, ARIA
  entre shadow roots) no se simula: va a `.fudspec`.
- **Sin esperas fijas.** Todo lo que se espera tiene un final observable.
- **Un test no ve el estado de otro** (§4.8).
- **El runtime de producción no cambia por los tests.** Lo que el harness necesita entra por
  las opciones que ya existen (`installHydration`, `functionsHandler`) o por el plugin en el
  entorno `fudic`. Ni un `if (test)` en `@fudic/core` ni en `@fudic/http`.

## 6. Criterios de aceptación

**Configuración**

1. Un proyecto con `fudicTest()` en su `vitest.config.ts` importa un `.fud` desde un
   `*.test.ts` y `pnpm test` lo ejecuta en el entorno `fudic`.
2. Importar un `.fud` con errores rechaza con el diagnóstico pintado
   (`ruta:línea:col - error FUDnnnn`), con un error semántico (`FUD0158`) y con una expresión
   rota.

**Componentes**

3. `mount(X, { props })` de un componente N1 da un `host` con su `root` y el texto de las
   props.
4. Un componente N3: `click` sobre un botón sin hidratar lo levanta y el clic cuenta.
5. `t.props({ … })` repinta lo que depende de esa prop.
6. Las consultas encuentran un elemento dentro del shadow root de un hijo.
7. Una fixture de `.fudspec` sirve como `props`.
8. `providers` sustituye un servicio inyectado: el componente pinta lo del falso.

**Variantes del `<template>`**

9. Para cinco componentes de prueba (sin atributos, `shadowrootdelegatesfocus`,
   `shadowrootreferencetarget`, `shadowrootadoptedstylesheets` y los cuatro juntos),
   `shadowOf` da el mismo `ShadowShape` con `via: 'ssr'` y con `via: 'client'`, y es el que
   piden sus atributos.
10. `shadowrootclonable` y `shadowrootserializable` cumplen el criterio 9.
11. `toContainTemplate` falla con un atributo de más y con uno de menos.

**Funciones de servidor**

12. Un componente que llama a su función de servidor recibe el valor que devuelve `handle`,
    con `handle` ejecutado de verdad.
13. Un middleware de dos mitades: la mitad `.client` corre en el lado del test que monta y la
    `.server` en el servidor en memoria, una vez cada una. Una función a secas corre en los
    dos.
14. `csrf` en la cadena global: la llamada pasa. Quitando su mitad `.client` del ejemplo de
    prueba, la llamada da 403.
15. Un `serverValidator` cuyo módulo de datos está mockeado con `vi.mock` hace que el servidor
    conteste 422, y el error llega a `errorOf`.
16. `fetch` en las opciones: un `TypeError` y un 500 llegan a la vista como en el navegador.
17. Una petición a otra URL sin `fetch` lanza nombrando la URL.
18. `clientGraphOf` de un componente cuyo `serverValidator` importa un módulo de datos no
    alcanza ese módulo; sin el borrado del plugin, sí.

**Service Worker**

19. Con `sw: true`, una función con `.invalidates('/usuarios')` deja `['/usuarios']` en
    `t.invalidated`, y la llamada no resuelve antes de que el worker simulado conteste.
20. Sin `sw`, la misma llamada resuelve y `t.invalidated` queda vacío.

**Rutas y layouts**

21. `visit('/blog/x')` pasa `{ slug: 'x' }` a `load` y pinta su `data`.
22. `visit` con `data` no llama a `load` y sí a `layout(ctx, data)`.
23. `visit` de una ruta cuya `load` lanza `notFound()` pinta `_error.fud` con `status` 404.
24. `renderLayout` pinta `body`, cada sección y el default de una prop del layout.

**Snippets**

25. `renderSnippet` con argumentos posicionales y con nombre pinta el snippet, y los
    componentes que instancia están definidos.
26. `scope` lleva un objeto al snippet.

**Aislamiento y espera**

27. Dos tests seguidos del mismo fichero: el segundo no ve el DOM, el `fetch`, el worker ni
    los `init` del primero.
28. Ningún fichero de `src/` de `@fudic/testing` usa `setTimeout` para esperar.

**Ejemplo**

29. `examples/basic` tiene tests unitarios de un componente N1, uno N3, la matriz de
    `app-input`, `user-form` con su servidor, `/blog/[slug]`, `_layout.fud` y `ui.fud`, y
    `pnpm --filter @fudic/example-basic test` los pasa.

## 7. Fuera de alcance

- **jsdom.** El entorno es happy-dom, por velocidad. Cambiarlo no cambia la API.
- **Layout, foco real y ARIA entre shadow roots.** Son de `.fudspec` (§1.1).
- **Separar el estado de módulo entre los dos lados** (§4.1). Necesitaría dos grafos y
  perdería `vi.mock`.
- **`shadowrootmode="closed"`.** Ya es `FUD0158`: no hay componente cerrado que montar.
- **Navegar de una ruta a otra dentro de un test.** `visit` pinta una URL; seguir un enlace es
  un test de navegador.
- **Snapshots del HTML.** Vitest ya los tiene: `expect(html).toMatchSnapshot()` funciona sin
  nada de esta spec.
- **Generar tests** (`fudic g test`) y el editor (CodeLens para correr un test).
- **Tipar las props en `pnpm typecheck`.** Fuera del editor, un `.fud` importado es `any`
  (la declaración ambiental de SDD-52). En el editor, Volar las tipa.

## 8. Decisiones

Tomadas con Pedro el 2026-10-14, antes de redactar:

1. **happy-dom, no jsdom.** Es mucho más rápido, y ya lo usan `core`, `dom`, `ssr` y `forms`.
   Ninguno de los dos aplica los atributos `shadowroot*` que importan, así que el harness
   aplica el DSD él mismo en cualquier caso.
2. **Frontera con `.fudspec`** como dice §1.1.
3. **No se mockea la función ni el `fetch`.** Un servidor en memoria con el `dispatch` real
   atiende las llamadas, y el mock va en el borde de los datos. Así corre todo el código.
4. **Las dos mitades de cada middleware corren, cada una en su lado**, y `serverValidator`
   corre en el servidor.
5. **Service Worker simulado con `sw: true`** y los paths invalidados en `t.invalidated`.
6. **Matriz `via: 'ssr' | 'client'`** para las variantes del `<template>`, más el contrato
   sobre el HTML.

### 8.1. Tomadas al redactar

1. **Un solo grafo, por el camino SSR** (§4.1). Es lo que permite que `vi.mock` llegue al
   servidor. El coste es que un módulo con estado se comparte entre los dos lados del test.
   Dos grafos dejarían `vi.mock` sin efecto en el servidor. La tarea 2 lo mide primero.
2. **Lo que el plugin borra para el navegador se comprueba sin ejecutarlo**, con
   `clientGraphOf`. En el entorno `fudic` no se borra nada (consecuencia de la 1).
3. **Testing Library para consultas, gestos y matchers**, con consultas que bajan por shadow
   roots. Escribir el cálculo de roles y nombres accesibles a mano es otra spec entera.
4. **Las consultas bajan por los shadow roots de los hijos.** Es lo que ve el usuario, y
   `t.root.querySelector` sigue a mano para quien quiera solo el de fuera.
5. **Una diferencia entre `ssr` y `client` se arregla en esta spec** (tarea 23), no en un BUG
   aparte. La matriz existe para encontrarlas.
6. **`renderSnippet` recibe la llamada como texto `.fud`**, lo que el desarrollador escribe tras
   `@render`, en vez de un objeto de argumentos que no distingue posicionales y con nombre.
7. **Un `.fud` con errores lo rechaza el import, no `mount`** (2026-10-14). `mount` recibe el
   módulo ya importado, así que un import estático de un `.fud` roto tumba el fichero de test
   antes de llegar a él. El import rechaza con los diagnósticos pintados como en el build. Una
   expresión rota (`@(`) acababa en el `PARSE_ERROR` de Oxc sobre el `.fud.ts` generado: se
   arregla en `@fudic/vite` para que salga el diagnóstico FUD, también en `vite dev` (tarea 4).
8. **Un `.fud` se importa como namespace** (2026-10-14): `import * as X from './x.fud'`. Un
   `.fud` compilado exporta `tag`, `css` y `render` (`layout` en un layout) y ningún `export
   default`. `FudModule` es ese namespace. El compilador no cambia.
9. **`mount` con `via: 'ssr'` pinta una página anfitriona virtual** (2026-10-14). El `render` de
   un componente no da el HTML que el servidor manda por él: el host —si se reclama para
   hidratar, las hojas que adopta, las opciones de su shadow root— lo escribe quien lo
   instancia, y los mapas de hidratación (`fud-state`, `fud-tree`…) y las hojas del `<head>` los
   escribe la página. Una página que instancia el componente con sus props como literales, pintada
   como `vite dev` pinta una ruta, deja todo eso al compilador (§4.2). Consecuencia: en `ssr` las
   props son JSON (§3.2). El generador del anfitrión es uno y lo comparte `renderSnippet`
   (§4.10); el pintado de una página por el grafo de vitest es un módulo propio que reutiliza
   `visit` (§4.9).
10. **El harness hace el upgrade de custom elements en su sitio** (2026-10-14). happy-dom
    sustituye cada instancia conectada al definir su tag, y el shadow root se queda con el
    elemento viejo; el runtime, además, toma la foto de las instancias al empezar el gesto y
    define el tag después, así que entregaría su estado a un elemento que ya no está en la página.
    Definir los tags antes de pintar no vale: el runtime tomaría el camino 3 en vez del 2 y el
    primer clic se perdería. El harness envuelve `customElements.define` mientras el entorno vive
    y hace lo que el algoritmo estándar: el constructor de la clase sobre el mismo elemento
    (§4.5). Depende de dos detalles internos de happy-dom 20.10.6 —la lista `callbacks` del
    registro y el nombre del callback que sustituye—, y se revisa al subir happy-dom. Si no
    están donde se esperan, el entorno lanza un `Error` que nombra la versión esperada.
11. **`providers` son pares `{ provide, use }`** (2026-10-14). Un `Provider` de `@fudic/di` es
    solo la clave; sin la implementación no hay con qué sustituir. Se registran con `provideIn`
    en el contenedor raíz del árbol de la página —el que levanta el coordinador desde
    `fud-ioc` y `fud-di`, o una raíz sola si la página no imprimió árbol—, así que ganan a un
    `@Service` y a un `provide` global. Lo que un componente propietario provee en su subárbol
    sigue ganando ahí: así resuelve `@fudic/di`, y no se toca.
12. **Cada página ve definidos solo los tags que su cargador pidió** (2026-10-14). Un tag
    definido por un test anterior del mismo fichero hacía que el runtime tomara el camino 3
    («el chunk ya estaba, la instancia ya se levantó») y no levantara la instancia de la página
    nueva: el primer clic se perdía. `installHydration` recibe un `registry` por página que
    responde «no definido» hasta que su propio cargador importa el chunk. Es la opción que el
    runtime ya tenía; `@fudic/core` no cambia.
13. **`fudicTest()` apaga la comprobación de tipos en vivo** (2026-10-14). `fudic()` arrancaba
    en vitest la comprobación de tipos de todo el proyecto que `vite dev` usa para el overlay:
    TypeScript cargado en cada ejecución y la consola llena con los errores de cualquier
    `.fud` roto a propósito. `@fudic/vite` gana la opción `liveCheck` (por defecto `true`, así
    que `vite dev` no cambia) y `fudicTest()` la pone a `false`.
14. **La página anfitriona recibe las props por `data`** (2026-10-14). Con las props como
    literales, cada juego de valores era una página nueva que compilar (~40 ms por `mount`).
    La página escribe `.prop=@(data["prop"])` y el harness pasa las props como el `data` del
    render, igual que el wrapper recibe el `data` ya resuelto: una página por componente y
    juego de nombres, compilada una vez. La regla de §3.2 (props JSON en `ssr`) no cambia: es
    lo que viaja en el estado de hidratación.
15. **El slot de error es el que nombra el `aria-describedby`** (2026-10-14). El emit no marca
    el slot con `data-fud-err`: le da un `id` y el control lo apunta con `aria-describedby`.
    `errorOf` sigue ese enlace, que es el mismo que sigue un lector de pantalla, y lanza si el
    control no tiene slot.
16. **`submit()` pulsa el botón de envío** (2026-10-14). Un `submit` no cruza el shadow root,
    así que la hidratación no oye un envío lanzado sobre un formulario que nadie ha tocado; el
    clic sí, levanta el componente y lo repite. Sin botón, `requestSubmit()`, como Enter.
17. **`clear()` selecciona y borra** (2026-10-14). `user.clear` comprueba el foco contra
    `document.activeElement`, que es el host cuando el control vive en un shadow root, y se
    rinde. `type` con toda la selección y un `{Backspace}` es el mismo gesto.
18. **Arranque por fichero de test** (2026-10-14). El setup leía constantes de `config.ts`, que
    carga el plugin entero, y cada fichero de test volvía a evaluar `@fudic/vite` y
    `@fudic/compiler` por el grafo de vitest. Las constantes viven en un módulo sin imports, y
    `fudicTest()` entrega esos dos paquetes a Node (`server.deps.external`): se cargan una vez
    por worker. Instalados ya viven en `node_modules`; la regla cubre también un workspace. El
    setup por fichero bajó de ~4,5 s a ~0,3 s. `user-event` se prepara en el primer gesto.
19. **El paquete se prueba con dos proyectos de vitest** (2026-10-14). Uno, el propio paquete
    con sus componentes de prueba junto a los tests, sin `src/http.ts` ni rutas. Otro, una app
    pequeña en `test/app/` —su `src/http.ts`, sus rutas, sus componentes y sus datos— con los
    tests de servidor, rutas y layouts dentro. Las dos con `fudicTest()`, como un proyecto real;
    la app no podía vivir en la raíz del paquete, donde `src/` es el código del harness.
20. **El entorno conserva el `Request`, `Response` y `Headers` de Node** (2026-10-14). El
    servidor en memoria corre en el mismo ámbito que la página, y el `Response` de happy-dom
    descarta `Set-Cookie` como hace un navegador con una respuesta que construye un script:
    ninguna cookie que fijara una función de servidor llegaba al test. Con los de Node el
    servidor responde como en producción; el cliente no lee esa cabecera.
21. **Dos aberturas mínimas para el harness** (2026-10-14). `@fudic/vite/harness` expone el
    wrapper, el contexto y el drenado de `vite dev`, la tabla de funciones (`devSource`, que ya
    recibía su cargador), el routing y el io, sin cargar Vite: el harness corre en cada worker.
    `@fudic/http` gana `container` en las opciones de `dispatch` (por defecto, una raíz nueva,
    como hasta ahora): es por donde entran los `providers` del test en el servidor. En la página
    que pinta, el harness pasa la raíz que abre el wrapper por esos mismos overrides.
22. **El `fetch` del harness envía lo que envía un navegador** (2026-10-14): las cookies de la
    página, `Origin` y `Sec-Fetch-Site: same-origin`, y guarda las cookies que fija la
    respuesta. `csrf.server` ve lo mismo que en producción. Entre tests se vacía también el bote
    de cookies (§4.8).
23. **`clientGraphOf` poda como el bundler** (2026-10-14). La transformación de cliente borra el
    cuerpo de un `serverValidator`, pero el `import` de lo que leía se queda en el módulo hasta
    que el bundler lo elimina por no usarse. El recorrido sigue solo los imports cuyos nombres
    se usan tras la transformación (más los imports desnudos y los `export … from`), que es lo
    que llega al navegador. La transformación la hace un Vite propio del worker, creado en la
    primera llamada y cerrado al acabar el fichero: unos 0,5 s la primera vez.
