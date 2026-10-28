# SDD-68 — Llamadas sin fontanería: `task` y el repintado tras una mutación

> **Estado:** `Listo` — [tareas](./SDD-68-Task.md).
> **Paquetes:** `@fudic/core` · `@fudic/http` · `@fudic/conventions` · `@fudic/compiler` ·
> `examples/basic`
> **Depende de:** 31 (`signal`, `effect`), 15 (el controlador y sus `$d` de desmontaje), 39 (el
> chunk de la ruta y su `$data`), 56 (el stub de una función de servidor, `error-pages`,
> `invalidate`), 60 (el `.fudapi` y la pieza `load`), 67 (el cable de las llamadas en binario;
> el endpoint de datos sigue en JSON hasta SDD-70, que lo pasa a binario por tramas y actualiza
> `load.fetch`)
> **Rango de diagnósticos:** `FUD1280`–`FUD1299` (nuevo). No usa ninguno; queda reservado.
> **Decisiones de gramática:** ninguna.
> **Origen:** [IDEA-04](./ideas/IDEA-04-llamadas-de-cliente-sin-fontaneria.md) §2 y §3. Su §4 ya
> está resuelto: la mitad de cliente de un middleware es `auth.client(…)`.
> **Rama sugerida:** `sdd-68-llamadas-sin-fontaneria`
>
> **Qué añade en una frase.** Una función `task` de `@fudic/core` que envuelve cualquier llamada
> con su cancelación, su estado y su orden (en un `get` gana la última; en una mutación van una
> detrás de otra), que se para sola al quitar el componente; y que una mutación repinte la página
> con el `data` nuevo de su `load` sin `location.reload()`.

---

## 1. Contexto y objetivo

`examples/basic/src/routes/usuarios.fud` dedica 25 líneas a la búsqueda, y no por culpa del
ejemplo: es lo que escribirá cualquier autocompletado.

```ts
let busqueda: AbortController | undefined;

async function lanzar(llamada: (signal: AbortSignal) => Promise<readonly Person[]>) {
  busqueda?.abort();                       // 1. cancelar la anterior
  const propia = new AbortController();
  busqueda = propia;                       // 2. guardar la de ahora en una variable suelta
  estado.set("Buscando…");                 // 3. llevar el estado a mano
  try {
    found.set(await llamada(propia.signal));
    estado.set("");
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") estado.set("Búsqueda cancelada.");
    else throw err;                        // 4. distinguir cancelar de fallar
  }
}
```

Sin el paso 1 hay un error de verdad: se escribe «ana», la respuesta de «an» llega después y pisa
a la buena.

Las mutaciones tienen el problema contrario. Marcar y desmarcar «Activo» deprisa manda dos `save`:
`active: true` y `active: false`. Cancelar la primera no sirve: un abort solo hace que el
navegador deje de esperar, el servidor puede haberla recibido igual, y si le llegan al revés la
base de datos se queda con `true` mientras la pantalla enseña `false`. Hoy nadie lo resuelve.

Y las dos mutaciones del ejemplo acaban así:

```ts
async function activar(id: number, e: Event) {
  await save({ id, active: (e.target as HTMLInputElement).checked });
  location.reload();
}
```

`location.reload()` quiere decir «vuelve a pedir el `data` de la página». Recargar el documento
entero pierde el scroll, el foco y lo que se estaba escribiendo. La pieza que falta es pequeña:
el stub de la función ya invalida la caché del Service Worker para la página actual
(`http/src/contract/fn.ts:147-148`) y el endpoint de datos ya existe (`DATA_PREFIX`,
`vite/src/wrapper.ts:178-191`). Falta que la página lo pida y se repinte.

Hay además un hueco que esta spec necesita cerrar: hoy un `effect(…)` escrito en el `@code` de un
componente **no se para nunca**. Su desmontaje no entra en los `$d` del controlador
(`compiler/src/emit/client.ts:430`), así que el `setInterval` de `app-clock` sigue corriendo
después de quitar el reloj de la página. Una `task` que se cancela sola al desmontar necesita ese
mismo mecanismo, y el `effect` sale arreglado con ella.

## 2. Dependencias

| SDD | Qué aporta |
|---|---|
| 31 | `signal`, `effect`, `untrack` y el seguimiento de dependencias (`tracking.ts`). |
| 15 | El controlador `{c, h, u, r}` y el array `$d` cuyos desmontajes ejecuta `r` cuando el navegador quita el componente. |
| 39 | El chunk de cliente de una ruta y su `$data`: lo que devolvió `load`, recortado a lo que la ruta lee. |
| 56 | El stub de una función (`stub`, `FnSpec.method`), `CallOptions.signal`, `errorPagesStep` y `invalidate`. |
| 60 | El `.fudapi`, la cláusula `invalidates` y la pieza `load` (`contract/page.ts`). |
| 67 | Las llamadas viajan en binario, con su decodificador por tipo. El endpoint de datos sigue en JSON: lo pasa a binario SDD-70, que también actualiza `load.fetch`. **Esta spec nace de `main` con SDD-67 en `Hecho`**. |

## 3. Interfaz pública

### 3.1. `task`

```ts
// @fudic/core
export type TaskState = 'idle' | 'pending' | 'done' | 'cancelled' | 'failed';
export type TaskMode = 'latest' | 'queue';

/** Anything that takes its arguments and an AbortSignal: a server function is one. */
export type Callable<A, R> = ((args: A, options: { readonly signal: AbortSignal }) => Promise<R>) & {
  /** The HTTP verb of a server function. Absent on any other callable. */
  readonly method?: string;
};

export interface TaskOptions<R> {
  /** Default: 'latest' for a GET or a callable without `method`, 'queue' for the rest. */
  readonly mode?: TaskMode;
  /** What value() returns before the first answer. */
  readonly initial?: R;
}

export interface Task<A, R, V = R | undefined> {
  /** The last answer that arrived, or `initial`. Kept while a new call is in flight. Tracked. */
  value(): V;
  /** Tracked. */
  state(): TaskState;
  /** `state() === 'pending'`. Tracked. */
  pending(): boolean;
  /** What the last failed call rejected with; `undefined` unless state() is 'failed'. Tracked. */
  error(): unknown;
  /** Starts a call by hand. Resolves with its answer, or `undefined` if it was cancelled, replaced or failed. Never rejects. */
  run(...args: A extends void ? [args?: A] : [args: A]): Promise<R | undefined>;
  /** Aborts the call in flight and drops the ones waiting. */
  cancel(): void;
}

export function task<A, R>(fn: Callable<A, R>, source?: () => A): Task<A, R>;
export function task<A, R>(fn: Callable<A, R>, source: (() => A) | undefined, options: TaskOptions<R> & { readonly initial: R }): Task<A, R, R>;
export function task<A, R>(fn: Callable<A, R>, source?: () => A, options?: TaskOptions<R>): Task<A, R>;
```

- **`fn`** es la función, no una llamada: `task(search, …)`, no `task(() => search(…))`. Así
  `task` pone el `AbortSignal` y lee el verbo.
- **`source`** son los argumentos que dependen de señales. Si cambia alguna, se lanza una
  llamada. Sin `source`, la tarea solo se lanza con `run`.
- Uso:

```ts
const texto = signal("");
const found = task(search, () => ({ q: texto() }), { initial: [] });  // a cada cambio de texto
const lenta = task(slowSearch);                                       // solo con lenta.run(…)
const guardar = task(save);                                           // 'queue': es un PUT
```

```html
<input type="search" @input=@escribir>
@if (found.pending()) { <span>Buscando…</span> }
@if (found.state() === "cancelled") { <span>Búsqueda cancelada.</span> }
@foreach (const p of found.value()) key (p.id) { <li>@p.name</li> }
```

### 3.2. El verbo en el stub

```ts
// @fudic/http — ServerFunction gains one field
export interface ServerFunction<A, R> {
  (...call: …): Promise<R>;
  /** 'GET', 'POST', 'PUT', 'PATCH' or 'DELETE'. */
  readonly method: Method;
}
```

`stub(spec)` lo copia de `spec.method`. Con ese campo, una función de servidor es un `Callable`
sin que `@fudic/core` importe nada de `@fudic/http`.

### 3.3. El aviso «este `data` ya no vale»

```ts
// @fudic/conventions
/** page: "the data of these paths is stale". Dispatched on `document` after a call invalidates. */
export const DATA_STALE_EVENT = 'fudic:data-stale';

// the detail of that CustomEvent
export interface DataStaleDetail {
  readonly paths: readonly string[];          // what the call invalidated, `base` included
  wait(done: Promise<void>): void;            // a listener hands the work the call must wait for
}
```

### 3.4. Pedir al servidor el `data` de `load`

`load` se ejecuta siempre en el servidor; no se traslada al navegador. Lo que el navegador gana es
una forma de **pedirle al servidor** el resultado de `load` para una ruta: la misma dirección del
endpoint de datos que ya usa el Service Worker al navegar.

```ts
// @fudic/http/contract — what the browser module of a route exposes for its `load`: a request
// to the server, never `load` itself
export interface BrowserLoadPiece<D> {
  /** GET DATA_PREFIX + path: the JSON the endpoint serves today (SDD-70 moves it to binary frames). */
  fetch(path: string, signal?: AbortSignal): Promise<D>;
}
```

### 3.5. El desmontaje de lo que crea el `@code`

```ts
// @fudic/core — for the emit only; the author never writes it
export function owned<T>(fn: () => T): readonly [T, readonly (() => void)[]];
```

Mientras corre `fn`, cada `effect(…)` y cada `task(…)` creados ahí dejan su desmontaje en la
lista. El emit envuelve con `owned` el `@code` de un componente y de una ruta, y vuelca la lista en
`$d`.

## 4. Comportamiento

### 4.1. Cuándo se lanza

- **Con `source`:** al crearse, la tarea lee `source()` para saber de qué señales depende,
  **pero no llama**. Llama cada vez que cambia alguna. Es lo que hace hoy el ejemplo: la lista
  empieza vacía y la primera búsqueda sale con la primera tecla.
- **Con `run(args)`:** llama con esos argumentos. Una tarea con `source` también acepta `run`.
- **La llamada no se sigue.** Lo que lea `fn` por dentro no hace que la tarea dependa de ello;
  solo cuenta lo que lee `source`.
- **El dato inicial lo da `load`.** Una tarea no se lanza al arrancar. Si la página necesita datos
  al cargarse, salen del `load` y se le pasan con `initial`.

### 4.2. `latest`: gana la última

Es el modo de un `get` y de cualquier `Callable` sin `method`.

- Una llamada nueva **aborta la que está en vuelo** y empieza.
- Una respuesta que llega de una llamada abortada **no se escribe nunca**, aunque `fn` haya
  ignorado el `AbortSignal`: la tarea numera sus llamadas y solo escribe la de la última.
- La promesa de `run` de la llamada sustituida se resuelve con `undefined`.
- `state()` sigue en `'pending'` mientras haya una llamada en vuelo.

### 4.3. `queue`: una detrás de otra

Es el modo de `post`, `put`, `patch` y `delete`.

- Si hay una llamada en vuelo, la nueva **espera** a que acabe la anterior, salga como salga, y
  luego se manda. Nada se descarta.
- Cada respuesta se escribe en `value()` en el orden de llegada. Como van en orden, la última que
  queda es la de la última llamada.
- `state()` está en `'pending'` mientras quede alguna en vuelo o esperando.

Ejemplo: marcar, desmarcar y marcar «Activo» deprisa manda los tres `save` en ese orden, uno tras
otro. El servidor acaba con el último.

### 4.4. Estado, valor y error

| Pasa | `state()` | `value()` | `error()` |
|---|---|---|---|
| Se crea | `'idle'` | `initial` o `undefined` | `undefined` |
| Sale una llamada | `'pending'` | el anterior, sin tocar | `undefined` |
| Llega la respuesta (y no queda ninguna) | `'done'` | la respuesta | `undefined` |
| Falla (y no queda ninguna) | `'failed'` | el anterior, sin tocar | el error |
| `cancel()` con algo en vuelo | `'cancelled'` | el anterior, sin tocar | `undefined` |
| `cancel()` sin nada en vuelo | sin cambio | sin cambio | sin cambio |

- **Un abort nunca es un error.** Una llamada abortada no llega a `error()`.
- **`run` no rechaza nunca.** El error está en `error()`. Así un `@click=@guardar.run(…)` no deja
  una promesa rechazada suelta.
- **`error-pages` actúa antes.** Es un paso de la cadena de la llamada (`http/src/error-pages.ts`):
  un 401, un 403 o un 500 que él atiende navega a su página y la llamada no termina nunca. La tarea
  se queda en `'pending'` mientras el navegador se va. A `error()` solo llega lo que `error-pages`
  deja pasar: un 422 o un estado que un form se queda. Sin `error-pages` en la cadena, llega todo.
- Las lecturas son reactivas: la vista se repinta cuando cambian.

### 4.5. `cancel()`

- Aborta la llamada en vuelo con su `AbortController`.
- En `queue`, descarta también las que esperaban: no se mandan y su `run` se resuelve con
  `undefined`.
- Si había algo en vuelo, `state()` pasa a `'cancelled'`.
- Cancelar no deshace nada en el servidor. En una mutación, lo que ya salió puede haberse aplicado.

### 4.6. Se para sola al quitar el componente

- El emit envuelve el `@code` de un componente y de una ruta con `owned` (§3.5) y mete la lista en
  `$d`. Cuando el navegador quita el componente, `r` ejecuta `$d`, como hoy.
- Una tarea desmontada **cancela lo que tenga** y deja de escuchar sus señales. A partir de ahí su
  `run` no hace nada y se resuelve con `undefined`.
- **Lo mismo vale para `effect`**: un `effect(…)` del `@code` se desmonta con su componente. El
  `setInterval` de `app-clock` se para al quitar el reloj.
- Solo cuenta lo creado **al ejecutar el `@code`**. Una tarea creada dentro de un handler no tiene
  dueño y vive hasta que se descarga la página. Se documenta.

### 4.7. En el servidor

`task` existe también en el servidor, porque la vista la lee (`@if (found.pending())`). Allí nadie
escribe una señal y nadie pulsa un botón, así que nunca llama: `state()` es `'idle'` y `value()`
es `initial`. El navegador hidrata desde el mismo punto.

### 4.8. Una mutación repinta la página

1. **El stub avisa.** Después de `invalidate(…)` (`fn.ts:147-148`), si la página actual está entre
   las rutas invalidadas (concreta o por patrón, con la misma comparación que usa el Service
   Worker), el stub lanza `DATA_STALE_EVENT` sobre `document`. Espera lo que los oyentes entreguen
   con `wait` y solo después resuelve la llamada. Un `get` sin `invalidates` no avisa.
2. **La ruta escucha.** El chunk de cliente de una ruta con `load` registra un oyente. Este pide el
   `data` nuevo con `load.fetch(location.pathname)` (§3.4), lo sustituye y repinta.
3. **El `data` del cliente se puede refrescar.** En una ruta con `load` y chunk de cliente, el emit
   escribe `let data = $data` en lugar de `const`, y cada lectura de `data` en la vista depende de
   un contador de versión. Un refresco cambia `data` y sube el contador: los `@foreach`, `@if` e
   interpolaciones que leen `data` se actualizan, con sus claves (un `@foreach` con `key` conserva
   las filas que siguen). Un handler que lee `data` ve el nuevo, porque lee la misma variable.
4. **Si el refresco falla** (red caída, 401 porque el `load` lleva `use auth`…), el oyente hace
   `location.reload()`: el servidor pinta lo que diga su regla.
5. **Sin oyente no pasa nada.** Una página sin ruta refrescable no escucha; la llamada se resuelve
   igual que hoy.
6. **Solo el `data` de la ruta.** Las props del layout no se refrescan (§7).

Con eso el ejemplo queda así:

```ts
const guardar = task(save);
function activar(id: number, e: Event) {
  void guardar.run({ id, active: (e.target as HTMLInputElement).checked });
}
```

Y la tabla de `@foreach (const p of data.users)` se repinta sola.

### 4.9. Se poda lo que no se usa

- `task` vive en su propio módulo de `@fudic/core`. Quien no la importa no la descarga.
- `owned` es una función pequeña. Cuando no hay nada que desmontar, la lista sale vacía.
- El oyente de §4.8 lo importa solo el chunk de una ruta con `load`. El stub solo despacha un
  evento, sin importar nada de la ruta.

## 5. Invariantes

- **En `latest` gana la última llamada**, aunque `fn` ignore el `AbortSignal`.
- **En `queue` nada se descarta y nada se adelanta**: las llamadas salen en el orden de `run`.
- **Un abort nunca es un error**, y `run` nunca rechaza.
- **`error-pages` decide primero**: la tarea no se queda nada que él atienda.
- **Lo que crea el `@code` se desmonta con su componente**: `effect` y `task`.
- **`@fudic/core` no importa `@fudic/http`**, ni al revés: el verbo es un campo y el aviso es un
  evento.
- **Cobertura:** lo nuevo de `@fudic/core` y `@fudic/http` al 100 % en las cuatro métricas;
  `@fudic/compiler` no baja.

## 6. Criterios de aceptación

**`task`, `latest`**

1. Con una `fn` falsa que resuelve cuando se le dice: `run('an')` y luego `run('ana')`. La primera
   recibe su `AbortSignal` abortado. Si la primera resuelve después de la segunda, `value()` es el
   resultado de `'ana'`, y la promesa de `run('an')` se resuelve con `undefined`.
2. La misma prueba con una `fn` que **ignora** el `AbortSignal`: el resultado es el mismo.
3. Con `source = () => ({ q: texto() })`: crear la tarea no llama; `texto.set('a')` llama una vez
   con `{ q: 'a' }`. Una señal leída solo dentro de `fn` no relanza nada.
4. `initial: []` → `value()` es `[]` antes de la primera respuesta y sigue siendo el valor anterior
   mientras hay una llamada en vuelo.

**`task`, `queue`**

5. Con una `fn` que tiene `method: 'PUT'`, tres `run` seguidos: la segunda llamada no sale hasta
   que acaba la primera, y la tercera no sale hasta que acaba la segunda. Ninguna recibe un abort.
   `value()` acaba siendo la respuesta de la tercera.
6. Si la primera falla, la segunda sale igual. `state()` acaba en `'done'` si la última respondió
   bien.
7. `mode: 'latest'` sobre una `fn` con `method: 'PUT'` cambia el comportamiento al de §4.2, y
   `mode: 'queue'` sobre un `get`, al de §4.3.

**Estado, error y cancelar**

8. La tabla de §4.4, fila a fila, con una `fn` controlada.
9. `cancel()` en vuelo → `state()` es `'cancelled'`, la `fn` ve su señal abortada y `error()` sigue
   en `undefined`. En `queue`, las que esperaban no se llaman nunca y sus `run` se resuelven con
   `undefined`. `cancel()` en `'idle'` no cambia nada.
10. Un rechazo que no es abort → `state()` es `'failed'` y `error()` es ese rechazo, y la promesa
    de `run` se resuelve con `undefined`. No hay ningún `unhandledrejection`.
11. **Con `error-pages`:** una función real con `error-pages` en la cadena y un servidor que
    responde 500. La página navega a `_error.fud` y la tarea nunca pasa a `'failed'`. Con un 422 sin
    form, la tarea sí pasa a `'failed'` con ese `ValidationError`.

**Desmontaje**

12. Un componente cuyo `@code` crea una tarea con una llamada en vuelo y un `effect` con un
    `setInterval`: al quitarlo del DOM, la llamada recibe su abort y el intervalo deja de correr.
    Un `run` posterior se resuelve con `undefined` sin llamar a `fn`.
13. `app-clock` quitado de la página deja de actualizar su señal.

**Servidor**

14. Una ruta que lee `found.pending()` y `found.value()` en la vista se pinta en el servidor sin
    llamar a `fn`, con `initial`, y se hidrata sin diferencias.

**Repintado**

15. En `usuarios`: desmarcar «Activo» manda el `save`, pide `DATA_PREFIX + '/usuarios'` una vez y
    actualiza la fila sin recargar el documento. El foco y el scroll siguen donde estaban, y la
    promesa de `run` se resuelve después del repintado.
16. Borrar una fila la quita de la tabla sin recargar. Las demás filas son los mismos nodos que
    antes (`key (p.id)`).
17. Con el endpoint de datos respondiendo 500, el oyente recarga el documento.
18. Una llamada desde una página sin `load` no despacha ningún refresco que alguien atienda, y se
    resuelve como hoy. Un `get` sin `invalidates` no despacha `DATA_STALE_EVENT`.

**El ejemplo y la entrega**

19. `usuarios.fud` queda sin `lanzar`, `buscar`, `busqueda`, `AbortController` ni
    `location.reload()`. La búsqueda usa `task(search, …)`; la búsqueda lenta, su propia tarea con
    su botón «Cancelar»; «Activo» y «Borrar», `task(save)` y `task(remove)`. Lo que enseña la
    página (cancelar en Network, el estado «Buscando…» y «Búsqueda cancelada.») sigue visible.
20. `pnpm typecheck`, `pnpm test` y `pnpm build` en verde; lo nuevo al 100 % en las cuatro
    métricas; ningún umbral baja. `examples/` sigue sin diagnósticos. El README de `@fudic/core`
    documenta `task`, sus dos modos y qué pasa al desmontar.

## 7. Fuera de alcance

- **El cable en binario** y las reglas de los argumentos: SDD-67.
- **La sesión por cookie**: SDD-69. El ejemplo sigue con su token mientras tanto.
- **`@await` y la página por trozos**: SDD-70. Una tarea es del navegador y no participa del
  streaming.
- **Refrescar las props del layout** tras una mutación. Si una mutación cambia lo que enseña el
  layout (el nombre del usuario en la cabecera), por ahora hay que navegar.
- **Esperar entre teclas** (debounce). Con «gana la última» el resultado ya es correcto; esperar
  solo ahorra peticiones, y quien lo quiera lo pone en su `source` o en su handler.
- **Reintentos** y caché propia de la tarea. La caché es la del Service Worker.

## 8. Decisiones

### 8.1. Tomadas al redactar

1. **Se llama `task`.** `query` no vale por dos motivos: en el `.fudapi`, `query` es una cláusula
   (un argumento que va en la URL), y esta función también sirve para mutaciones, que no son
   consultas. `resource` (Angular) también suena a lectura, y `call` se confunde con
   `Function.prototype.call`. `task` cubre leer y escribir, y es el nombre que usa
   ember-concurrency para esto mismo, con sus modos `restartable` y `enqueue`.
2. **Se pasa la función, no una llamada.** `task(search, () => ({ q: texto() }))` permite que
   `task` ponga el `AbortSignal` y lea el verbo. Con `task(() => search(…))`, `task` no podría
   saber ni lo uno ni lo otro.
3. **El modo sale del verbo, y se puede cambiar.** `get` → `latest`; `post`, `put`, `patch` y
   `delete` → `queue`; una función que no es de servidor → `latest`. `mode` lo cambia: quien
   escribe decide.
4. **En `queue` se mandan todas, en orden.** Quedarse solo con la última de las que esperan
   ahorraría peticiones, pero una sola tarea `guardar` sirve para todas las filas de la tabla, y
   tirar el `save` de la fila 1 porque llegó el de la fila 2 sería perder datos.
5. **No se lanza al arrancar; el dato inicial lo da `load`.** Así es hoy el ejemplo, la página
   pintada en el servidor coincide con la hidratada, y en el servidor la tarea no hace nada sin
   comprobar en qué lado está.
6. **`run` nunca rechaza; el error se lee en `error()`.** Un `@click` que llama a `run` no tiene a
   nadie que capture un rechazo. `error-pages` sigue actuando antes, porque va dentro de la
   llamada.
7. **El estado «cancelada» es un valor de `state()`.** Es lo que pinta hoy el ejemplo («Búsqueda
   cancelada.»), y con solo `pending()` no se podría.
8. **La búsqueda lenta pasa a ser su propia tarea.** En el ejemplo comparte la cancelación con la
   rápida. Con una tarea por función, cada una tiene su botón «Cancelar» y se ve mejor lo que
   enseña.
9. **`owned` arregla también `effect`.** El desmontaje de la tarea necesita saber quién la creó, y
   el mismo mecanismo deja de dejar sueltos los `effect` del `@code`. Es un error de hoy (el reloj
   sigue corriendo) y se arregla aquí.
10. **El aviso es un evento del DOM.** `@fudic/http` no puede importar el chunk de la ruta, y la
    ruta no debe cargar `@fudic/http` solo para escuchar. Un evento sobre `document` con `wait` los
    deja sin depender el uno del otro y permite que la llamada espere al repintado.
11. **La llamada se resuelve después del repintado.** Igual que hoy espera a que el Service Worker
    confirme la invalidación: el código que va tras el `await` ve la página ya al día.
12. **Si el refresco falla, se recarga el documento.** Es lo mismo que hace hoy el ejemplo, pero
    solo cuando hace falta, y deja que el servidor aplique su regla (página de error, redirección a
    `/entrar`).
13. **`data` es refrescable en toda ruta con `load` y chunk de cliente.** Distinguir qué rutas
    llaman a mutaciones exigiría seguir las funciones de todos sus componentes. El precio es el
    código que actualiza lo que lee `data`, y solo lo paga una ruta que ya se hidrata.
14. **Sin códigos nuevos.** Crear una tarea fuera del `@code` es legítimo (vive con la página) y
    no rompe nada. Se documenta, no se diagnostica.

### 8.2. Tomadas al implementar

15. **`owned` envuelve el cuerpo entero de la factoría, no solo el `@code`.** Los nombres del
    autor los leen por ámbito léxico los handlers y bloques que el emit declara detrás, así que
    el `@code` no puede ir en un cierre propio. Dentro solo corre la construcción: `h`, `u` y `r`
    corren después, fuera del dueño. Una factoría sin código del autor sale igual que antes.
16. **Lo creado por el `@code` se desmonta después de `$d`.** `r` vacía primero las
    suscripciones de la vista y luego la lista de `owned`. Al revés, una tarea que cancela (o la
    limpieza de un `effect` que escribe una señal) repintaría sobre nodos ya liberados.
17. **La vista se suscribe a una tarea.** Un `const x = task(…)` del nivel superior es un nombre
    que se mueve, como una señal, y el paso de repintado se suscribe a `x.value()` y `x.state()`.
    Se reconoce por el nombre de la llamada, igual que `effect`.
18. **El «contador de versión» es el propio paso de repintado.** El refresco cambia `data` y
    ejecuta una pasada: como `data` es un nombre que se mueve, cada lectura suya en la vista es
    una escritura que la pasada vuelve a aplicar, y el `@foreach` reconcilia por clave.
19. **Solo escucha la ruta cuyo lado de cliente lee `data`.** Si el cliente nunca nombra
    `data`, un `data` nuevo no cambiaría nada: no hay oyente.
20. **La comparación de rutas vive en `@fudic/conventions` (`coversPath`).** La usan el Service
    Worker, para olvidar, y el stub, para avisar: una sola copia.
21. **Dos avisos seguidos: gana el último refresco.** El anterior se aborta y su respuesta no se
    aplica, así que un refresco lento no pinta encima de uno nuevo.
