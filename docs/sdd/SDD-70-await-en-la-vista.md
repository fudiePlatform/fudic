# SDD-70 — `@await` en la vista: el primer byte no espera al backend

> **Estado:** `Listo` — [tareas](./SDD-70-Task.md).
> **Paquetes:** `@fudic/api` (`later`) · `@fudic/compiler` (`@await`/`@catch`, emit por partes) ·
> `@fudic/diagnostics` · `@fudic/ssr` (partes y `FLUSH`) · `@fudic/core` (hidratación por partes) ·
> `@fudic/vite` (render en streaming, endpoint de datos) · `@fudic/transport` (el SW lee el `data`
> por partes) · `@fudic/language-core` · `@fudic/language-server` · `@fudic/formatter` ·
> `fudic-vscode` (gramáticas) · `examples/basic`.
> **Depende de:** 61 (la vista portable: lista blanca y `@empty`, que esta spec amplía con un
> constructo más), 67 (binario en todo: el endpoint de datos manda sus partes con ese codec), 68
> (`load.fetch`, que pasa a leer las tramas), 60
> (el `.fudapi` y su `load`), 56 (`@fudic/http`: `Problem`, `HttpError`), 39 (hidratación de la
> ruta y `fud-data`), 15 (hidratación y `fud-state`), 20 (el SW que pinta las navegaciones).
> **Rango de diagnósticos:** `FUD1320`–`FUD1339` (nuevo). Usa `FUD1320`–`FUD1324`.
> **Decisiones de gramática:** 168–170 (nuevas).
> **Origen:** conversación con Pedro del 2026-10-27 (IDEA-04 y lo que salió al revisarla).
> **Rama sugerida:** `sdd-70-await-en-la-vista`
>
> **Qué añade en una frase.** `load` puede devolver campos que llegan después; la página sale en
> cuanto `load` devuelve lo rápido, y cada `@await` de la vista pinta su trozo cuando su promesa
> se cumple, en orden, sin JS para colocarlo, con sus datos de hidratación delante y borrados
> en cuanto se leen.

---

## 1. Contexto y objetivo

Hoy el primer byte de una página espera al backend entero. El render que genera `@fudic/vite`
hace esto (`packages/vite/src/wrapper.ts`, `render`):

```js
const data = ctx.data !== undefined ? ctx.data : await withRequest($root, () => load($ctx));
const layout = ctx.layout !== undefined ? ctx.layout : await withRequest($root, () => layoutProps($ctx, data));
yield* page(data, io(ctx), $root, layout);
```

Hasta que `load` no resuelve **todo**, el navegador no recibe nada: ni el `<head>`, ni el CSS, ni
el menú. Un listado que tarda dos segundos en la base de datos son dos segundos de pantalla en
blanco.

Y aunque `load` fuera rápido, hay tres sitios más que retienen la página:

1. **El body se construye entero antes de mandarse.** `page` cede el `<head>` y después monta el
   body completo en un árbol y lo serializa de una vez (`packages/compiler/src/emit/module.ts`,
   `buildPageModule`; `emit/layout.ts` para una ruta con layout). Los datos de hidratación van en
   bloques al **final** del body (`emit/maps.ts`, `writeHydrationBlocks`): `fud-state`,
   `fud-tree`, `fud-bus`, `fud-eager`, `fud-route`, `fud-data`, `fud-ioc`, `fud-di`.
2. **El stream acumula hasta 8 KB antes de enviar** (`packages/ssr/src/stream.ts`,
   `htmlToByteStream`, `DEFAULT_HIGH_WATER_MARK`). Un `<head>` de 3 KB cedido pronto se queda en
   el búfer mientras el generador espera.
3. **El servidor de desarrollo y el de preview drenan el stream a un string** antes de responder
   (`packages/vite/src/serve.ts`, `drainStream`; `plugin.ts`, `renderRouteHtml` y
   `previewRender`). Aunque el render fuera por partes, el navegador lo recibiría todo junto.

Y el runtime de hidratación se carga con `<script type="module">` (`emit/parts.ts`,
`writeRuntimeTags`), que el navegador no ejecuta hasta que ha leído el documento entero.

Esta spec hace que una página pueda salir **por partes**:

```text
# usuarios.fudapi
load ssr
  title  str
  users  Person[]  later
  stats  Stats     later
```

```ts
// usuarios.ts — el handler
load.handle(async () => ({
  title: 'Usuarios',          // resuelto: sale con el primer byte
  users: db.listUsers(),      // promesa: se pinta cuando llegue
  stats: db.slowStats(),      // promesa: las dos arrancan a la vez
}));
```

```html
<h1>@data.title</h1>
@await data.users {
  <user-table .rows=@data.users></user-table>
} @catch (e) {
  <p>No se pudo cargar la lista (@e.status).</p>
}
@await data.stats {
  <p>@data.stats.total personas.</p>
}
```

El `<head>`, el `<h1>` y el menú del layout llegan en cuanto `load` devuelve el objeto. La tabla
llega cuando se cumple `users`, y se hidrata en ese momento aunque `stats` siga pendiente. Las
estadísticas llegan después, siempre detrás de la tabla.

## 2. Dependencias

| SDD | Qué aporta |
|---|---|
| 61 | La vista portable: la lista blanca de lo que se escribe en el markup, los analizadores sin tipos y el pase tipado, y `@empty`, el último constructo que se añadió (mismo camino: `at.ts` → `control.ts` → emit → proyección → formatter → gramática). |
| 67 | El codec binario de las llamadas. El endpoint de datos manda sus partes con él: una trama con lo resuelto y una trama por cada campo `later` cuando se cumple. |
| 68 | `load.fetch` (`packages/http/src/contract/page.ts`): con lo que una ruta pide su `data` nuevo tras una mutación. Hoy lee el JSON del endpoint; esta spec lo pasa a leer las tramas. |
| 60 | El `.fudapi`: `load` y sus campos (`packages/api/src/contract.ts`, `loadDecl`; `clauses.ts`, `typedField`) y los tipos que se generan (`emit/declarations.ts`, `LoadData`). |
| 56 | `@fudic/http`: `Problem` (`src/errors.ts`), `HttpError` y `problemOf` (`server/problem.ts`). |
| 39 | La ruta hidratable, `fud-route` y `fud-data`, y que la ruta reclama el `<body>` antes de leer el estado (`writeRouteClaim`). |
| 15 | La hidratación: `data-fud-id`, `fud-state` posicional por id (`ssr-dom.ts`, `hydrationState`) y su lectura (`core/src/hydrate/maps.ts`, `readPageMaps`). |
| 20 | El Service Worker que pinta la navegación: pide el `data` (`packages/transport/src/router.ts`, `fetchData`) y llama a `chunk.render(ctx)`. |

## 3. Interfaz pública

### 3.1. El campo que llega después (decisión 170)

En el `.fudapi`, un campo de `load` acaba opcionalmente con la palabra `later`:

```text
load ssr
  title  str
  users  Person[]  later
```

- Solo en los campos de `load`. En un `type`, en los argumentos o el retorno de una función, en
  un `form`, en `layout` o en las `adds` de un middleware: `FUD1324`.
- El tipo generado de ese campo es una promesa:

  ```ts
  export interface LoadData {
    readonly title: string;
    readonly users: Promise<readonly Person[]>;
  }
  ```

- El handler devuelve la promesa **sin esperarla**. Lo que hace dentro (consultas, llamadas) es
  cosa suya, y puede usar `ctx.signal` para dejar de trabajar si el navegador se va.
- Vale con cualquier modo de `load` (`ssg`, `ssr`, `sw`). En `ssg` el prerender espera a todo,
  así que la página prerenderizada tiene las mismas partes pero llegan todas juntas.

### 3.2. `@await` y `@catch` en la vista (decisiones 168 y 169)

```html
@await data.users {
  …lo que se pinta con el valor…
} @catch (e) {
  …lo que se pinta si la promesa falla…
}
```

- **Lo que va detrás de `@await`** es la lectura de un campo `later` de `data`, tal cual:
  `data.users`. Cualquier otra cosa (un campo resuelto, una señal, una llamada, una expresión)
  da `FUD1320`.
- **Dentro del cuerpo**, `data.users` es el valor ya resuelto, con su tipo
  (`readonly Person[]`). Se lee como cualquier otro dato: `@foreach (const p of data.users)`,
  `.rows=@data.users`.
- **Fuera de un `@await` de ese campo**, leer `data.users` da `FUD1321`. Pasarlo entero a una
  prop o a un `@code` como promesa tampoco vale: la promesa es cosa de la vista.
- **`@catch (e)`** es opcional y va justo detrás de la llave de cierre, como `@else`. `e` es un
  `Problem` de `@fudic/http`: `status`, `title` y, solo en desarrollo, `detail`. Un `@catch`
  sin `@await` delante, o un segundo `@catch`, da `FUD1323`.
- **No hay rama «Cargando…».** Lo que va mientras tanto no se puede quitar sin JS, y la página
  va en orden: lo que no ha llegado, simplemente aún no está.
- **Dónde vale:** en la vista de una ruta o de una página, dentro del body o de una
  `@section`. **No** en el `<head>` (el head es lo primero que sale y no espera), **ni** en un
  componente, un layout o el cuerpo de un snippet. Ahí da `FUD1322`.
- **Se puede anidar** y se puede poner dentro de `@if`, `@foreach` o de los hijos de un
  componente. El mismo campo se puede esperar en más de un sitio.

### 3.3. El orden

- **Un `@await` espera al anterior.** La página se escribe en el orden del documento. Si el
  segundo campo se cumple antes que el primero, su trozo espera a que salga el del primero.
- **Las promesas no esperan unas a otras.** Las crea `load`, así que arrancan todas a la vez. El
  orden es solo de pintado.
- **Lo lento, abajo.** Un `@await` lento frena todo lo que viene detrás de él. Lo dice la
  documentación de `@await`.

### 3.4. Lo que decide el status va resuelto

Una vez sale el primer byte, la respuesta ya es `200`: no se puede cambiar a un `404`, a un
`500` ni a una redirección. Por eso:

- **Lo que decide si la página existe** (el usuario de `/sesion/:user` no está, no hay permiso,
  hay que redirigir) se resuelve en `load` antes de devolver el objeto, lanzando un `HttpError`
  como hoy. Eso sigue saliendo con su status y su página de error, porque `load` se espera antes
  del primer byte.
- **Lo que falla dentro de una promesa `later`** llega al `@catch` de su `@await` como `Problem`.
  Un `HttpError` conserva su status y su título; cualquier otro error es un `500` (la misma regla
  que `problemOf`). Una redirección lanzada ahí también llega al `@catch`, y en desarrollo el
  servidor avisa de que una redirección después del primer byte no se puede seguir.
- **Sin `@catch`**, el trozo no pinta nada, el error se notifica como cualquier error del
  servidor (`onError`; en desarrollo, el overlay) y la página sigue con lo que viene detrás.

### 3.5. Lo que viaja en el HTML

Una página **sin** `@await` sale byte a byte como hoy.

Una página **con** `@await` sale en partes. La parte 0 es el `<head>` y el body hasta el primer
`@await`; cada `@await` empieza una parte nueva. Cada parte lleva su bloque de datos **delante**
y una marca de fin **detrás**:

```html
<!DOCTYPE html><html><head>…<script type="module" async src="…"></script></head><body>
<script type="application/json" data-fud-part="0">{…}</script>
<site-nav>…</site-nav><main><h1>Usuarios</h1>
<!--fud-end-->
<script type="application/json" data-fud-part="1">{…}</script>
<user-table data-fud-id="3">…</user-table>
<!--fud-end-->
<script type="application/json" data-fud-part="2">{…}</script>
<p>12 personas.</p>
<!--fud-end-->
</main></body></html>
```

- **El bloque de una parte** es un objeto JSON con lo que hoy va en los bloques del final, pero
  solo lo que esa parte produjo:

  | Clave | Qué es | En qué parte |
  |---|---|---|
  | `state` | `[firstId, offsets, data]`: el trozo de `fud-state` de las instancias reclamadas en esta parte. Los ids siguen contando entre partes | todas |
  | `fields` | El resultado de los campos `later` que esta parte esperó: `{ "users": { "ok": … } }` o `{ "users": { "error": Problem } }`. Solo si la ruta es hidratable (si hoy publica `fud-data`) | las que esperan |
  | `di` | Las entradas de la semilla de servicios publicadas en esta parte (hoy `fud-di`) | las que publican |
  | `tree`, `bus`, `eager`, `route`, `data`, `ioc` | Los mapas estáticos y lo resuelto de `load` (hoy `fud-tree`, `fud-bus`, `fud-eager`, `fud-route`, `fud-data`, `fud-ioc`) | la 0 |

  Lo que estaría vacío no se escribe, como hoy.
- **La marca de fin** `<!--fud-end-->` dice que el parser ya ha leído la parte entera. Es un
  comentario: no se ve, no ocupa sitio y vale en cualquier contexto (dentro de una `<table>`, de
  una `<ul>`).
- **El runtime va con `async`** en una página con `@await`, para que arranque mientras el resto
  del documento sigue llegando. En una página sin `@await` la etiqueta no cambia.

### 3.6. `@fudic/ssr`: partes y vaciado del búfer

```ts
/** Yielded by a render: send everything buffered now, whatever its size. */
export const FLUSH: unique symbol;
export type HtmlPiece = string | typeof FLUSH;

/** Unchanged, except that a FLUSH empties the buffer before the next piece is awaited. */
export function htmlToByteStream(
  source: Iterable<HtmlPiece> | AsyncIterable<HtmlPiece>,
  options?: StreamOptions,
): ReadableStream<Uint8Array>;

/** Serializes a body that is still being built, one part at a time. */
export interface PartSerializer {
  /** What was appended since the last call; the elements still open stay open. */
  part(): Generator<string>;
  /** The rest, closing every element left open. */
  end(): Generator<string>;
}
export function partSerializer(root: SsrNode): PartSerializer;
```

Un nodo que ya salió en una parte no se vuelve a tocar: el emit solo añade nodos en el punto de
inserción actual después de un corte.

### 3.7. El endpoint de datos y el SW

- El endpoint de datos de **toda** ruta pasa a binario y responde **por tramas**, con el codec
  de SDD-67: primero `{ data, layout }` con lo resuelto; después, una trama por cada campo
  `later` **en el orden en que se cumplen**, con su nombre y su valor o su `Problem`. Una ruta
  sin campos `later` responde con una sola trama. Hasta esta spec el endpoint sigue en JSON
  (SDD-67 §7).
- `load.fetch` (la variante de navegador de la pieza `load`, SDD-68 §3.4, con la que una ruta
  repinta tras una mutación) lee esas tramas: resuelve con un `data` cuyos campos `later` son
  promesas que cumplen las tramas siguientes.
- El SW (`transport/src/router.ts`, `fetchData`) arma un `data` cuyos campos `later` son
  promesas que se cumplen con esas tramas, y llama a `chunk.render(ctx)` en cuanto tiene la
  primera. La navegación por el SW sale por partes igual que la del servidor.
- Con caché (`cache-first`, `stale-while-revalidate`…) se guarda la respuesta cuando está
  completa. Una respuesta guardada entrega todas sus tramas de golpe.

### 3.8. Los códigos nuevos

| Código | Severidad | Título (`.md`) | Cuándo | Span |
|---|---|---|---|---|
| `FUD1320` | error | `@await` needs a `later` field of `data` | Lo que sigue a `@await` no es `data.<campo>` con ese campo marcado `later` | la expresión |
| `FUD1321` | error | A `later` field read outside its `@await` | Se lee `data.<campo later>` fuera del cuerpo de un `@await` de ese campo | la lectura |
| `FUD1322` | error | `@await` outside the body of a route or a page | `@await` en el `<head>`, en un componente, en un layout o en el cuerpo de un snippet | `@await` |
| `FUD1323` | error | `@catch` without its `@await` | `@catch` que no sigue a la llave de cierre de un `@await`, o un segundo `@catch` | `@catch` |
| `FUD1324` | error | `later` outside the fields of `load` | `later` en un campo de `type`, `form`, `layout`, función o middleware | la palabra |

**Fix** de cada `.md`:

- `1320`: «mark the field `later` in the route's `.fudapi` (`users  Person[]  later`) and await it by name: `@await data.users { … }`».
- `1321`: «read it inside `@await data.users { … }`; everything that needs the value goes in that block».
- `1322`: «move the `@await` to the route's own view, below the `<head>`; a component receives the resolved value as a prop: `@await data.users { <user-table .rows=@data.users></user-table> }`».
- `1323`: «put `@catch (e) { … }` right after the closing brace of its `@await`».
- `1324`: «only a field of `load` can arrive later; resolve the value before returning it».

## 4. Comportamiento

### 4.1. El compilador

- **Parser.** `await` y `catch` entran en las palabras de control (`compiler/src/at/at.ts`,
  `CONTROL_KEYWORDS`). `control/control.ts` lee `@await <expr> { … }` y, tras la llave de cierre,
  un `@catch (<ident>) { … }` opcional, igual que hoy lee `@else` detrás de un `@if`. Nodo nuevo
  en `control/nodes.ts`: `{ type: 'await', span, expression, body, catch?: { name, body, span } }`.
  El parser no lanza: un `@catch` suelto es `FUD1323` y se sigue.
- **Semántica.** Un analizador nuevo comprueba `FUD1320`–`FUD1322` con lo que el compilador ya
  sabe del `.fudapi` de la ruta (`apiImports`, `PageAnalysis.api`). `FUD1321` mira las lecturas
  de `data.<campo>` que la lista blanca de SDD-61 ya recorre.
- **Proyección y editor.** `language-core` proyecta el cuerpo de un `@await` con
  `data.<campo>` del tipo `Awaited<…>` y `e` como `Problem`. Así el pase tipado, el hover y el
  completado ven el valor resuelto. `FUD1321` lo da el analizador, no un error de TypeScript.
- **Formatter y gramáticas.** `@await … { } @catch (e) { }` se formatea como `@if … { } @else { }`.
  `fudic.tmLanguage.json` resalta las dos palabras y `fudapi.tmLanguage.json` resalta `later`.

### 4.2. El render por partes en el servidor

- **El handler y el layout.** El wrapper espera a `load` y a `layoutProps` como hoy (de ahí
  salen el status, las redirecciones y las páginas de error). Con campos `later`, lo que
  devuelve `load` trae promesas, y no se esperan aquí.
- **Ninguna promesa queda sin manejar.** Antes de pintar, el wrapper engancha un manejador a
  cada promesa `later`. Una promesa que la vista no llega a esperar (está en una rama de `@if`
  que no se pinta) no provoca un rechazo sin manejar, y el render no la espera al acabar.
- **El emit.** Una ruta o página con algún `@await` emite `async function* page`. El body se
  construye como hoy hasta el `@await`. Ahí el emit:
  1. reúne el trozo de estado de las instancias reclamadas desde el último corte y escribe el
     bloque de la parte **delante** de lo construido;
  2. cede `partSerializer.part()`, la marca `<!--fud-end-->` y `FLUSH`;
  3. espera la promesa;
  4. construye el cuerpo (o el del `@catch`) en el punto de inserción, y sigue.

  Al final cede el bloque de la última parte, `end()` y la última marca.
- **La ruta hidratable** reclama el `<body>` en la parte 0 (`writeRouteClaim`), antes de leer su
  primer trozo de estado, como hoy.
- **Los layouts** se emiten siempre como `async function*`: un layout no sabe si la ruta que lo
  usa tendrá un `@await`. Una ruta sin `@await` produce los mismos bytes.
- **Una página sin `@await`** no cambia nada: `function*`, bloques al final del body, ni `FLUSH`
  ni marcas.
- **El stream.** `htmlToByteStream` vacía su búfer al recibir `FLUSH`. Un `FLUSH` con el búfer
  vacío no hace nada.

### 4.3. Desarrollo, preview y prerender

- **Desarrollo y preview** pasan a responder la página con el stream (`renderRouteHtml`,
  `previewRender`), sin drenarlo. Un error **antes** del primer byte sigue siendo su status y su
  página de error (`page-errors.ts`), porque `load` ya se ha esperado. Uno después ya solo
  puede ir a un `@catch` (§3.4).
- **El prerender** drena como hoy: espera a todas las partes y guarda el documento entero.
- **El endpoint de datos** (`plugin.ts`, `serve.ts`, `loadRouteData`) responde por tramas
  en binario (§3.7): una trama por campo `later`, o una sola cuando la ruta no tiene ninguno.

### 4.4. La hidratación por partes en el navegador

- **Un lector de partes.** Un módulo nuevo de `core/src/hydrate` (`parts.ts`) sustituye la
  lectura única de `readPageMaps` en las páginas con `@await`. Si el documento aún se está
  cargando, observa con un `MutationObserver` la llegada de bloques `data-fud-part` y de marcas
  `<!--fud-end-->`. Si el documento ya está completo, lee todo lo que hay de una vez.
- **Una parte está lista cuando llega su marca de fin.** Entonces el lector:
  1. añade su bloque a los mapas en memoria (estado, campos, semilla);
  2. **borra** el bloque y la marca del DOM;
  3. deja que los anfitriones de esa parte se hidraten con las reglas de siempre: los `eager`
     enseguida, el resto con su disparador (visibilidad, interacción). La captura y la
     repetición de gestos (`capture.ts`, `replay.ts`) cubren el rato entre que se ve y que se
     hidrata, como hoy.
- **Los mapas viven en memoria**, no en el DOM. Un componente que se hidrata tarde (al tocarlo,
  minutos después) lee su trozo de memoria aunque el bloque ya no exista. El barrido de celdas de
  BUG-24 (`cells.ts`) se hace parte a parte, al llegar cada una.
- **La ruta hidratable se levanta al final**, cuando ha llegado la última parte, porque su vista
  abarca todas. Los componentes de cada parte no la esperan: una celda que comparten con la ruta
  se resuelve igual, se hidrate antes quien se hidrate (BUG-24).
- **Todas las páginas borran sus bloques.** También una página sin `@await`: el runtime lee los
  bloques del final a memoria y quita los nodos. Lo que hoy los lee del DOM más tarde pasa a
  leerlos de memoria.
- **El constructo en el cliente.** Cuando la ruta se hidrata, `@await` pinta su cuerpo con el
  valor de `fields` o su `@catch` con el `Problem`, que ya llegaron con el HTML. Si algún día
  recibe una promesa pendiente (un `data` nuevo que llega al cliente), conserva lo que hay
  pintado hasta que se cumpla y entonces repinta.

### 4.5. Lo que pesa

- El lector de partes es una pieza del runtime aparte, que solo pide una ruta que tenga
  `@await` (`io.runtime.pieces`, como el resto de piezas por ruta). Una página sin `@await`
  descarga lo mismo que hoy.
- El borrado de bloques en las páginas sin `@await` son unas líneas dentro del lector que ya
  existe (`readPageMaps`).

## 5. Invariantes

- **Sin `@await`, los mismos bytes.** Una página sin `@await` sale igual que antes de esta
  spec. Lo prueban los goldens que ya existen, sin regenerarlos.
- **En orden.** El HTML sale en el orden del documento; ningún trozo se recoloca con JS.
- **El status lo decide `load` antes del primer byte.** Nada de lo que pasa después lo cambia.
- **Datos delante, marca detrás, y los dos se borran.** Ningún bloque de hidratación queda en el
  DOM después de leerse.
- **Nada lanza en el compilador.** Los errores nuevos son diagnósticos con span.
- **Cobertura:** lo nuevo al 100 % en las cuatro métricas. `@fudic/ssr`, `@fudic/core`,
  `@fudic/api` y `@fudic/diagnostics` no bajan de donde están; `compiler`, `vite` y `transport`
  tampoco bajan de su suelo heredado.

## 6. Criterios de aceptación

**El `.fudapi`**

1. `users  Person[]  later` en `load` genera `readonly users: Promise<readonly Person[]>` en
   `LoadData`. Un handler que devuelve la lista ya resuelta en ese campo es un error de tipos en
   el build.
2. `later` en un `type`, un `form`, un `layout`, un argumento o el retorno de una función da
   `FUD1324` sobre la palabra.

**La vista**

3. `@await data.users { … } @catch (e) { … }` compila. Dentro, `data.users` tiene el tipo
   resuelto (hover y completado lo enseñan) y `e` es `Problem`.
4. `@await data.title` (un campo sin `later`), `@await signal()` y `@await fetchX()` dan
   `FUD1320`.
5. `@data.users` fuera de un `@await` de `users`, y `.rows=@data.users` en un componente fuera
   de él, dan `FUD1321`.
6. `@await` en el `<head>`, en un componente, en un layout o en el cuerpo de un snippet da
   `FUD1322`. En una `@section` de la ruta compila.
7. Un `@catch` suelto y un segundo `@catch` dan `FUD1323`, y el parser sigue (el resto del
   fichero da sus diagnósticos).
8. El formatter deja `@await … { } @catch (e) { }` con la misma forma que `@if … { } @else { }`, y
   es idempotente.

**El servidor**

9. **El primer byte no espera.** Con una promesa `later` que se cumple a los 2 s, el primer
   trozo del `ReadableStream` de `render` (el `<head>` y la parte 0) llega antes de que se
   cumpla, aunque pese menos de 8 KB (test con promesas controladas, sin temporizadores reales).
10. **En orden.** Con dos `@await` cuyos campos se cumplen al revés, el HTML sale con la parte del
    primero antes que la del segundo.
11. **A la vez.** Las dos promesas arrancan al llamar a `load`: el render de dos campos de 2 s
    tarda unos 2 s, no 4 (test con promesas controladas).
12. **El formato.** Cada parte sale con su bloque `data-fud-part` delante y `<!--fud-end-->`
    detrás. El bloque solo lleva el estado de las instancias de esa parte, y los ids siguen
    contando entre partes.
13. **Los errores.** Una promesa que rechaza con `notFound()` pinta el `@catch` con
    `e.status === 404` y la respuesta sigue siendo `200`. Una que rechaza con un `Error` pinta el
    `@catch` con `500`, y `detail` solo en desarrollo. Sin `@catch`, el trozo queda vacío, el
    error llega a `onError` y lo que viene detrás se pinta.
14. **Lo que decide el status.** Un `load` que lanza `notFound()` antes de devolver sigue
    respondiendo `404` con su página de error.
15. **Sin rechazos sueltos.** Una promesa `later` que rechaza dentro de una rama de `@if` que no
    se pinta no produce un `unhandledRejection`.
16. **Sin `@await`, nada cambia.** Los goldens de `packages/compiler` y las páginas de
    `examples/*` sin `@await` salen byte a byte iguales, y su runtime va sin `async`.
17. **Desarrollo y preview hacen streaming.** `vite dev` y `vite preview` entregan la parte 0
    antes de que se cumpla la promesa (test contra el servidor en proceso).

**El navegador**

18. **El lector.** En un documento que llega por partes (test de `core` con un DOM que recibe
    nodos poco a poco), un anfitrión `eager` de la parte 1 se hidrata al llegar la marca de la
    parte 1, con la parte 2 aún sin llegar. Después de leer cada parte, ni su bloque ni su marca
    están en el DOM.
19. **Hidratación tardía.** Un componente de la parte 1 que se hidrata al tocarlo, cuando ya no
    queda ningún bloque en el DOM, recibe su estado.
20. **Todas las páginas.** En una página sin `@await` con componentes N3, después de hidratar no
    queda ningún `script[type="application/json"]` de fudic en el DOM.
21. **El SW.** Una navegación servida por el SW a una ruta con campos `later` pinta la parte 0
    antes de que llegue la trama del campo. Con la respuesta en caché, sale entera de golpe.

**Prueba en el navegador (la hace Pedro)**

22. Una ruta nueva de `examples/basic`, `espera.fud`, con `title` resuelto, un campo `later` de
    2 s con un contador N3 dentro de su `@await` y otro campo `later` de 5 s debajo:
    - el título y el menú se ven enseguida;
    - a los 2 s aparece el contador y responde a los clics mientras el segundo trozo sigue sin
      llegar;
    - a los 5 s aparece el segundo trozo;
    - al acabar, en Elements no hay ningún bloque `data-fud-part` ni ninguna marca `fud-end`;
    - un tercer `@await` cuyo campo rechaza enseña su `@catch`.

**Entrega**

23. Los cinco códigos tienen `.ts`, `.md` y su línea en `index.ts`. `pnpm typecheck`, `pnpm test`
    y `pnpm build` en verde; lo nuevo al 100 % en las cuatro métricas; ningún umbral baja.
    `examples/` sigue sin diagnósticos. Guía de `@await` en el README del compilador: dónde va,
    que lo lento va abajo y que lo que decide el status no es una promesa.

## 7. Fuera de alcance

- **Pintar fuera de orden** (que el segundo trozo salga antes que el primero y se coloque con
  JS). Decidido que no: un `@await` espera al anterior.
- **Una rama «Cargando…»**: necesitaría JS para quitarla.
- **El binario de las llamadas** y su codec: SDD-67. Aquí solo se usa para las tramas del
  endpoint de datos.
- **Las llamadas desde el cliente** (cancelar, esperar a la anterior, repintar con un `data`
  nuevo sin `location.reload()`): SDD-68. Esta spec solo deja el constructo de cliente
  preparado para recibir una promesa pendiente.
- **La sesión por cookie**: SDD-69.
- **`@await` en componentes y en layouts.** Un componente recibe el valor ya resuelto como prop.
  Un layout recibe sus props de `layout`, que se resuelven antes del primer byte.
- **Plazos de espera.** Ni `@await` ni el render ponen un límite de tiempo, igual que las
  llamadas de `@fudic/http`. Si el navegador se va, el stream se cancela y `ctx.signal` avisa a
  `load`.

## 8. Decisiones

### 8.1. Tomadas al redactar

1. **`later` va detrás del tipo.** `users  Person[]  later` se lee como «una lista de personas
   que llega después». Va en el mismo sitio que el valor por defecto de un campo de form
   (`= ""`), y `readType` no tiene que distinguir una palabra suelta de un nombre de tipo.
2. **Dentro de `@await`, el mismo nombre.** El cuerpo lee `data.users`, ya resuelto, en lugar
   de declarar una variable nueva (`@await (const users = …)`). Es la sintaxis que propuso Pedro,
   y es como TypeScript estrecha un tipo dentro de un `if`.
3. **`e` es un `Problem`, no un `Error`.** Es lo que viaja al cliente en el bloque y lo que la
   página de error ya pinta. Un `Error` cualquiera no se serializa igual en los dos lados.
4. **Solo en la vista de una ruta o una página.** `data` solo existe ahí. Un componente recibe
   el valor resuelto como prop, y el `<head>` es lo primero que sale.
5. **La marca de fin es un comentario.** Hace falta saber cuándo el parser ha terminado una
   parte, porque un `MutationObserver` ve el elemento antes que su contenido. Un comentario no se
   pinta y vale dentro de cualquier elemento.
6. **Un solo bloque por parte, con claves.** En lugar de repetir `fud-state`, `fud-di`… por
   parte, cada parte lleva un objeto. Los ids `fud-*` no pueden repetirse en un documento.
7. **Sin `@await`, los bloques siguen al final y los bytes no cambian.** Con una sola parte, el
   runtime corre cuando el documento ya está completo, y moverlos delante no aporta nada. El
   borrado sí se aplica a todas las páginas, porque es del runtime y no cambia los bytes.
8. **La ruta hidratable se levanta al final.** Su vista abarca todas las partes. Levantarla
   antes obligaría a hidratar una vista a medias.
9. **Los layouts, siempre `async function*`.** Un layout no sabe qué ruta lo usa. El coste es
   ninguno en bytes y un `await` sin espera.
10. **Sin `@catch`, el trozo queda vacío y la página sigue.** Pararla dejaría al usuario con
    media página por un fallo de una parte. No se diagnostica la falta de `@catch`: no rompe
    nada (la decisión la toma quien escribe).
11. **Las tramas del endpoint de datos llegan en el orden en que se cumplen.** El orden de
    pintado lo pone el render, así que el endpoint no tiene que retener nada.
12. **Los bloques de hidratación siguen en JSON.** Van dentro del HTML y se leen con
    `JSON.parse`, como hoy. El binario de SDD-67 es para lo que viaja por `fetch`.
