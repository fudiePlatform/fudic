# SDD-72 — Los handlers reciben el dato: `fudic:result`, `fudic:error` y el bus, tipados y sin `detail`

> **Estado:** `Listo` — [tareas](./SDD-72-Task.md).
> **Paquetes:** `@fudic/compiler` · `@fudic/language-core` · `@fudic/dom` · `@fudic/forms` ·
> `@fudic/typecheck` · `@fudic/diagnostics` · `examples/basic`
> **Depende de:** 15 (el emit de los event bindings y del `bus:`), 23 (la proyección TS de la
> vista), 56 (`form:=@save`, `fudic:result` y `fudic:error`), 60 (los stubs tipados del
> `.fudapi`), BUG-23 (la proyección suscribe la misma forma que el emit)
> **Rango de diagnósticos:** `FUD1380`–`FUD1399` (nuevo, por la ampliación del 2026-11-01). Usa
> `FUD1380`–`FUD1383`; cambia el texto de `FUD0667`. Los errores de tipos del handler son de
> TypeScript, en el sitio donde el autor se equivoca.
> **Decisiones de gramática:** 173 (enmienda la 98), 176 (enmienda la 117), 177 (enmienda la 118).
> **Origen:** conversación con Pedro del 2026-10-29, sobre `user-form.fud`, `usuarios.fud` y el bus
> de `hidratacion.fud`. **Ampliada el 2026-11-01** (§3.4, §3.5, §4.7, §4.8, criterios 31–43): un
> evento dentro de un bucle avisa y sugiere delegar, el marcador dice a qué eventos sirve, la fila
> se lee por su nombre sin `$` (`@borrar(p)`), y la tabla de `usuarios.fud` pasa a delegación.
> **Rama sugerida:** `sdd-72-handlers-que-reciben-el-dato`
>
> **Qué añade en una frase.** En `@fudic:result`, `@fudic:error` y `bus:`, el handler escrito
> como referencia o como lambda recibe el dato del evento, no el `CustomEvent`. El editor lo tipa
> solo: el resultado, por lo que devuelve la función del formulario en su `.fudapi`; el error, como
> `Error`; el bus, por lo que declaran los receptores. El desarrollador escribe
> `function alta(persona: Person)` y nada más.

---

## 1. Contexto y objetivo

Un formulario enviado con `form:=@save` anuncia lo que devolvió el servidor con
`CustomEvent('fudic:result', { detail })` y lo que falló con `CustomEvent('fudic:error', { detail })`
(`forms/src/dom/bind-form.ts:131-143`). El bus es otro `CustomEvent`: `emit("alta", persona)` lo
lanza y `bus:alta` lo recibe. En los tres casos el dato está en `detail`, y hoy cada handler lo
desenvuelve y lo tipa a mano:

```fud
@* user-form.fud *@
function hecho(e: Event) {
  const persona = (e as CustomEvent<{ id: number; name: string }>).detail;   // cast a mano
  emit("alta", persona);
}
<form form:=@save @fudic:result=@hecho>

@* usuarios.fud *@
function alta(e: CustomEvent) { personas.set([...personas(), e.detail]); }    // detail: any
<div bus:alta=@alta($event)>

@* shopping-cart.fud, el bus de hidratacion.fud *@
function onCarrito(ev: CustomEvent) { total.set(total() + Number(ev.detail)); }
```

Hay tres problemas:

1. **El tipo se repite a mano**, y es un tipo que el `.fudapi` ya declara (`put save … -> Person`).
   Si el `.fudapi` cambia, el cast no se entera.
2. **El receptor del bus no comprueba nada.** La proyección escribe el `bus:` como
   `$on('alta' as never, h)` (`language-core/src/template/attrs.ts:728-737`), así que `$event` es
   `never` y `e.detail` es `any`. El emisor tampoco: `emit(name: string, detail?: unknown)`
   (`dom/src/emit.ts:29`). Si alguien emite un `string` donde el receptor espera una `Person`,
   el fallo sale en el navegador.
3. **Las funciones del dominio dependen del DOM.** `alta` no se puede probar sin fabricar un
   `CustomEvent`, y su firma (`e: CustomEvent`) no dice qué recibe.

**Objetivo.** El mismo código, sin fontanería:

```fud
@* user-form.fud *@
function hecho(persona: Person) {
  aviso.set(`Guardado: ${persona.name} (id ${String(persona.id)}).`);
  emit("alta", persona);
  personForm.$reset();
}
<form control=@personForm form:=@save @fudic:result=@hecho>

@* usuarios.fud *@
function alta(persona: Person) { personas.set([...personas(), persona]); }
<div class="panel" bus:alta=@alta>

@* shopping-cart.fud *@
function onCarrito(precio: number) { items.set(items() + 1); total.set(total() + precio); }
<p class="cart" bus:carrito=@onCarrito>
```

Si `hecho` declara un tipo que no es el que devuelve `save`, el editor lo subraya. Si
`user-form` emite en `alta` algo que no es una `Person`, el editor subraya el `emit`. Y
`pnpm typecheck` dice lo mismo que el editor.

## 2. Dependencias

- **SDD-15 / decisiones 96–98.** Un event binding tiene cuatro formas, decididas sobre el nodo raíz
  de Oxc (`compiler/src/binding/handler.ts`): `reference`, `call`, `lambda` y `unsuitable`. El emit
  (`compiler/src/emit/events.ts`: `eventHandler`, `busHandler`) y la proyección (`emitHandler` en
  `attrs.ts`) usan la misma clasificación. Esta spec **no cambia la clasificación**: solo qué recibe
  el listener en dos formas y en tres eventos.
- **Decisión 28.** `bus:literal` y `bus:(expr)`; el listener va en `document` y se llama con el host
  como `this` (`f.call($host, …)`).
- **SDD-23.** El `@code` se proyecta al **nivel superior del módulo** virtual, antes de
  `function $tpl()` (`language-core/src/emit-client.ts:72`). Los bindings se proyectan dentro de
  `$tpl`. Las declaraciones globales de tipos de la proyección viven en `GLOBALS_DTS`
  (`language-core/src/globals.ts`).
- **SDD-56.** `form:=@save` se proyecta como `$formSend(save)` (`attrs.ts:782-788`). `save` es el
  stub tipado del `.fudapi`, así que `ReturnType<typeof save>` es `Promise<Person>`.
- **El programa TS incluye todos los `.fud`.** El `tsconfig.json` de una app incluye
  `src/**/*.fud` (`examples/basic/tsconfig.json`). Lo que la proyección de un `.fud` declara en
  `declare global` lo ve la de cualquier otro, tanto en el editor (Volar) como en el lote de
  `@fudic/typecheck`.

## 3. Interfaz pública

### 3.1. Qué recibe el handler (decisión 173)

En estos tres eventos, y solo en ellos, el listener recibe el **dato** del evento:

| Binding | Forma | Hoy recibe | Con esta spec recibe |
|---|---|---|---|
| `@fudic:result=@hecho` | referencia | el `CustomEvent` | `event.detail`: lo que devolvió la función |
| `@fudic:result=@(v => …)` | lambda | el `CustomEvent` | `event.detail` |
| `@fudic:error=@fallo` / lambda | igual | el `CustomEvent` | `event.detail`: un `Error` (§4.3) |
| `bus:alta=@alta` / lambda | igual | el `CustomEvent` | `event.detail`: lo que se pasó a `emit` |
| cualquiera de los tres, `@f(…)` | llamada | — | **sin cambios**: `$event` sigue siendo el `CustomEvent` |
| `@click`, `@input`, `@mi-evento`… | todas | — | **sin cambios** |

La forma de llamada es la **vía de escape**: `@fudic:result=@hecho($event.detail, item.id)` o
`bus:alta=@log($event)` siguen igual, porque `$event` es el evento (decisión 97). Todo lo que hoy se
escribe con llamada compila exactamente igual que antes.

### 3.2. Lo que ve el editor

**`fudic:result`.** Si el elemento que lleva el binding tiene también `form:=@fn`, el dato es
`Awaited<ReturnType<typeof fn>>`: `Person` para `put save … -> Person`, y `undefined` para una
función sin `->`. Si no lo tiene (un ancestro que escucha porque el evento burbujea), el dato es
`unknown`.

**`fudic:error`.** El dato es `Error`. Para leer el status:
`if (error instanceof HttpError) error.status`.

**`bus:`.** El dato de un nombre es la **intersección** de lo que declaran sus receptores en todo el
proyecto:

- Cada `bus:<literal>=@f` con forma de referencia, donde `f` está declarada en el nivel superior del
  `@code`, **registra** el tipo de su primer parámetro para ese nombre. Un handler sin parámetros
  registra `unknown`.
- `emit("alta", x)` exige que `x` cumpla todos los registros de `"alta"`. Si dos receptores piden
  `Person` y `{ name: string }`, el emisor tiene que mandar una `Person`. Si piden `Person` y
  `number`, ningún valor cumple y el `emit` se subraya.
- Un nombre que nadie registra acepta cualquier `detail`, y también ninguno, como hoy.
- Si todos los registros admiten `undefined`, el `detail` es opcional (`emit("ping")`).
- Una lambda o una llamada **no registran**. Una lambda recibe como tipo contextual lo que registran
  los demás, o `unknown` si nadie registra.
- `bus:(expr)` no registra, y su handler se comprueba como hoy: el dato es `any`.

El registro no se escribe a mano. Si un nombre se emite y no tiene receptor en el proyecto (por
ejemplo, lo escucha una librería), el autor **puede** registrarlo él mismo con la misma interfaz
(§3.3), pero no es obligatorio.

### 3.3. Tipos nuevos de `@fudic/dom`

```ts
declare global {
  /** One entry per typed `bus:` receiver of the project, written by the projection. */
  interface FudicBusReceivers {}
}
/** What `emit(name, detail)` must send: what every receiver of `name` accepts. */
export type BusDetail<K extends string> = /* intersection of the entries named K, or unknown */;
/** The detail a handler takes: its first parameter, or `unknown` if it takes none. */
export type BusParam<F> = /* … */;
export declare function emit<K extends string>(name: K, ...detail: BusArgs<K>): void;
```

`BusArgs<K>` es `[detail?: BusDetail<K>]` si `BusDetail<K>` admite `undefined`, y
`[detail: BusDetail<K>]` si no. La implementación de `emit` **no cambia**: solo su tipo. La
definición, probada con `tsc` al redactar:

```ts
type Entry = FudicBusReceivers[keyof FudicBusReceivers];
type Fns<K> = Entry extends infer E ? (E extends readonly [K, infer P] ? (x: P) => void : never) : never;
export type BusDetail<K extends string> =
  [Fns<K>] extends [never] ? unknown : Fns<K> extends (x: infer I) => void ? I : never;
export type BusParam<F> = F extends (...a: infer A) => unknown ? (A extends [] ? unknown : A[0]) : unknown;
```

Una entrada del registro es `'<ruta del .fud>#<n>': readonly ['<nombre>', BusParam<typeof f>]`. La
clave es única en el proyecto. El nombre va **dentro** del valor y no como clave, para que dos
receptores del mismo nombre se sumen en vez de chocar (TS2717).

### 3.4. El marcador dice a qué eventos sirve (decisión 176)

- `delegate:p` **sin valor**: como hoy. Lo lee todo handler de un ancestro que mencione `p`.
- `delegate:p="click"` o `delegate:p="change input"`: un texto literal con nombres de evento
  separados por espacios. El marcador solo lo leen los handlers de **esos** eventos que mencionan
  `p`.
- Para cada evento, el marcador va al ancestro más cercano que tenga un handler de ese evento y
  mencione `p` (la regla de la decisión 119, ahora por evento).
- Así una fila con una casilla y un botón no se cruzan:

  ```html
  <tbody @change=@activar(p, $event) @click=@borrar(p)>
    @foreach (const p of personas()) key (p.id) {
      <tr>
        <td><input type="checkbox" checked=@p.active delegate:p="change" aria-label="Activo"></td>
        <td><button delegate:p="click">Borrar</button></td>
      </tr>
    }
  </tbody>
  ```

  Un clic en la casilla no llama a `borrar`: su marcador solo sirve a `change`.
- `p` llega a la función con el tipo del elemento de la lista (`Person`), igual que hoy llega
  `$p` (SDD-37, `language-core/src/template/attrs.ts`). `function borrar(p: Person)` y
  `function activar(p: Person, e: Event)` comprueban sin ningún cast.

### 3.4.b. La fila se lee sin `$` (decisión 177)

- En los argumentos de un handler, un nombre suelto que coincide con un `delegate:<nombre>` de un
  descendiente es la fila de ese bucle: `@borrar(p)`, no `@borrar($p)`. `$event` no cambia.
- Lo demás de la delegación sigue igual: el emparejamiento por nombre (119, ahora por evento), el
  handler que no se llama fuera de una fila (120) y el marcador sin rastro en el DOM (121).
- **Choque de nombres.** Si en el sitio del handler ya hay algo que se llama igual (un nombre del
  nivel superior del `@code`, un import, el binding de un bucle que rodea al handler), es
  `FUD1382`. No se elige uno por el autor: se renombra el binding del bucle o la variable.
- **La forma vieja.** `$p` en un handler es `FUD1383`, con el arreglo: escribir `p`. Se migran
  `examples/basic/src/components/app-calendar.fud`, el texto de `routes/delegacion.fud`,
  `packages/compiler/fixtures/app-calendar.fud` y los tests de SDD-37.
- La proyección ya reabre la cabecera del bucle alrededor del handler (`for (const p of
  personas()) { … }`); ahora no declara un `$p` aparte: el handler lee el `p` de la cabecera.

### 3.5. Diagnósticos nuevos y cambiados

| Código | Severidad | Cuándo | Mensaje |
|---|---|---|---|
| `FUD1380` | warning | Un `@evento` en un elemento dentro del cuerpo de un `@foreach`, `@for` o `@while`, a cualquier profundidad dentro de la misma plantilla. Span: el nombre del atributo. | ``an `@<evento>` inside a loop adds one listener per item. Delegate it: put the handler on an element outside the loop, pass it `<nombre>`, and mark this element with `delegate:<nombre>` `` |
| `FUD1381` | error | Un evento de la lista de un marcador para el que ningún ancestro tiene un handler de ese evento que lea `$<nombre>`. Span: el valor del atributo. | ``no ancestor `@<evento>` reads `<nombre>`: this marker serves an event nobody listens to`` |
| `FUD1382` | error | Un nombre de fila delegada que también existe en el sitio del handler. Span: el nombre en el handler. | ``` `<nombre>` is both the delegated row and a name in scope here: rename the loop binding or the variable``` |
| `FUD1383` | error | `$<nombre>` en un handler. Span: el `$<nombre>`. | ``a delegated row is read by its name: write `<nombre>`, not `$<nombre>` `` |
| `FUD0667` | error | Cambia: solo salta con un valor que no es un texto literal (`delegate:p=@x`) o con un texto vacío. | ``a `delegate:` marker takes no value, or the names of the events it serves: `delegate:<nombre>="click"` `` |

- En `FUD1380`, `<nombre>` es el binding de la cabecera del bucle más cercano cuando declara
  exactamente uno (`p` en `const p of personas()`). Si declara varios o ninguno, el mensaje dice
  `name` y `delegate:name`.
- `FUD1380` **no** salta con los eventos que no se pueden delegar, los que no tienen sustituto en
  `NON_BUBBLING` (`compiler/src/semantic/delegation.ts`): `load`, `error`, `abort`, `scroll`,
  `resize`, `unload`. Con `focus`, `blur`, `mouseenter`, `mouseleave`, `pointerenter` y
  `pointerleave` sí salta, y el mensaje añade el sustituto: ``(use `@focusin`)``.
- Un aviso no rompe el build ni `pnpm typecheck`.

## 4. Comportamiento

### 4.1. El emit del compilador

`eventHandler` necesita el nombre del evento. Para `fudic:result` y `fudic:error`:

| Forma | Hoy | Con esta spec |
|---|---|---|
| referencia | `hecho` | `($event) => hecho($event.detail)` |
| referencia a un callback (celda) | `($event) => cb()($event)` | `($event) => cb()($event.detail)` |
| lambda | `v => …` | `($event) => (v => …)($event.detail)` |
| llamada | `($event) => hecho(…)` | sin cambios |

`busHandler`, para todos los `bus:`:

| Forma | Hoy | Con esta spec |
|---|---|---|
| referencia | `($event) => f.call($host, $event)` | `($event) => f.call($host, $event.detail)` |
| lambda | `($event) => (l).call($host, $event)` | `($event) => (l).call($host, $event.detail)` |
| llamada | `($event) => f.call($host, …)` | sin cambios |

La delegación (SDD-37) solo trabaja con llamadas, así que no le afecta. El mapa de bus
(`fud-bus`), la pre-hidratación del receptor y el replay del capturador no miran el handler, así
que tampoco cambian.

### 4.2. La proyección de `fudic:result` y `fudic:error`

`GLOBALS_DTS` gana:

```ts
type $Result<F> = F extends (...a: never[]) => infer R ? Awaited<R> : unknown;
declare function $onResult<F>(fn: F, h: (value: $Result<F>) => unknown): void;
declare function $onResultEvent<F>(fn: F, h: (ev: CustomEvent<$Result<F>>) => unknown): void;
declare function $onError(h: (error: Error) => unknown): void;
declare function $onErrorEvent(h: (ev: CustomEvent<Error>) => unknown): void;
```

Y `$FudicEvents` pierde sus dos entradas, porque estos eventos ya no pasan por `$on`.

En la proyección del atributo (`attrs.ts`, caso `event`):

- `@fudic:result` busca un `form:=` **en el mismo elemento**. Si lo encuentra, su expresión se
  escribe como primer argumento. Si no, el primer argumento es `undefined`. Con forma de referencia
  o de lambda se usa `$onResult`; con llamada, `$onResultEvent`, cuyo `$event` es un
  `CustomEvent<R>` tipado.
- La expresión del `form:=` se copia como **andamiaje sin mapear**. Ya está proyectada en su
  `$formSend`, y mapearla dos veces daría dos respuestas al hover (lo mismo que hace la cabecera
  de un bucle en `emitHandler`).
- `@fudic:error` con referencia o lambda se proyecta como `$onError`, y con llamada como
  `$onErrorEvent`.

Con el handler tipado, el error de TypeScript se mapea al valor del atributo: subrayado en `@hecho`,
con el mensaje de TS (`Argument of type '(persona: number) => void' is not assignable…`).

### 4.3. `fudic:error` siempre lleva un `Error`

Hoy `detail` es lo que rechazó la llamada, sin más. En la práctica es casi siempre un `HttpError`
(cualquier status que el formulario no se queda: 401, 403, 404, 5xx, un `fails` con un status
fuera de `catches`) o un `TypeError` de red. Pero un paso de cliente puede rechazar con cualquier
cosa. Para que el tipo `Error` no mienta, `bindForm`:

- **Anuncia el rechazo tal cual si es un `Error`** (`HttpError`, `ValidationError`, `Redirect`,
  `TypeError`).
- **Si no lo es, lo envuelve**: `new Error('fudic:error: the call was rejected with a non-Error value', { cause: x })`.
- **No anuncia un `AbortError`**, porque una llamada cancelada no es un fallo. Es lo mismo que hace
  `errorPagesStep` (`http/src/error-pages.ts`) y lo que hace `task` en SDD-68 (estado
  `cancelled`).

Con `use error-pages` en la cadena, lo que llega a `fudic:error` es solo lo que esa página no
gestiona. Esto ya pasa hoy y no cambia.

### 4.4. La proyección del bus

En `attrs.ts`, caso `bus`:

- **Con nombre literal**: con referencia o lambda, `$busOn('alta', h)`; con llamada,
  `$busEvent('alta', ($event) => …)`.
- **Con `bus:(expr)`**: `$busOnAny(h)` y `$busEvent(… as never, …)`. El dato es `any`, como hoy.

```ts
type $BusDetail<K extends string> = import('@fudic/dom').BusDetail<K>;
declare function $busOn<K extends string>(name: K, h: (detail: $BusDetail<K>) => unknown): void;
declare function $busEvent<K extends string>(name: K, h: (ev: CustomEvent<$BusDetail<K>>) => unknown): void;
declare function $busOnAny(h: (detail: any) => unknown): void;
```

`$BusDetail` reexporta el tipo de `@fudic/dom`, para que haya **una sola definición** que comparten
el emisor (TS real) y el receptor (proyección).

**El registro.** La proyección reúne los `bus:<literal>=@f` con forma de referencia cuyo `f` es un
identificador declarado en el nivel superior del `@code` (función, `const` o `let`). No cuentan una
prop, una celda de callback, una variable de un bucle ni un import. Al final del módulo, fuera de
`$tpl`, escribe una sola vez:

```ts
declare global {
  interface FudicBusReceivers {
    'src/routes/usuarios.fud#0': readonly ['alta', $BusParam<typeof alta>];
  }
}
export {};
```

El `export {}` hace falta porque `declare global` solo es válido en un módulo, y un `@code` sin
imports no lo es. Si el módulo ya exporta algo, sobra pero no molesta. La ruta es la del `.fud`
relativa a la raíz del proyecto, con `/`. `<n>` es el orden del binding en el fichero.

El receptor queda comprobado contra sí mismo: la intersección que recibe es un subtipo de su propio
parámetro. Un error de compatibilidad sale siempre **en el emisor**, que es quien manda el dato
equivocado.

### 4.5. El lote de `@fudic/typecheck`

`pnpm typecheck` de una app tiene que dar el mismo `TS2345` en el `emit` del emisor que el editor.
El lote ya usa la proyección de `language-core`. Lo que hay que comprobar, y arreglar si falta, es
que todos los `.fud` del `tsconfig` entran en el mismo programa, aunque el que se comprueba sea uno
solo.

### 4.6. La migración

Rompe solo lo escrito con **referencia o lambda** en `fudic:result`, `fudic:error` y `bus:`, cuyo
handler leía `e.detail`. Las llamadas (`@onCarrito($event)`) siguen compilando igual, pero el
ejemplo pasa a la forma nueva:

- `examples/basic`: `user-form.fud` (`hecho`), `usuarios.fud` (`alta`), `shopping-cart.fud`
  (`onCarrito`), `product-list.fud` (sin cambios de código: su `emit` queda tipado), `bus-log.fud`
  (`onPicked`), `bus-picker.fud` (igual que `product-list`).
- `packages/testing/test/app/src/components/x-alias.fud` (`@fudic:result=@done`).
- `packages/compiler/fixtures/app-actions.fud` **se queda** con `@onCleared($event)`: es el caso de
  la llamada, que tiene que seguir funcionando.
- Los tests del emit (`events.test.ts`, `hydrate/events.test.ts`, `bus-map.test.ts`…) y de la
  proyección cuyas expectativas escriben la forma vieja.

### 4.7. El aviso y el marcador con eventos

- `FUD1380` lo emite un analizador nuevo, `event-in-loop`, que recorre el documento como
  `ref-in-loop` (contador de bucles abiertos). Sale en el editor y en el build.
- La regla del marcador con eventos vive en `planDelegation`, la misma función que usan el
  analizador `delegation` y el emit: una sola regla para los dos.
- En el emit, la tabla de un nombre pasa a ser por nombre **y evento**: el envoltorio de cada
  listener delegado solo mira los marcadores que sirven a su evento. Un marcador sin valor entra en
  todas las tablas de su nombre, como hoy.
- Ni el marcador ni su valor dejan rastro en el DOM (decisión 121).

### 4.8. `usuarios.fud` delegado

- La tabla de personas queda como en §3.4: `@change` y `@click` en el `<tbody>`, `delegate:p` con
  su evento en la casilla y en el botón.
- `activar(p: Person, e: Event)` y `borrar(p: Person)` reciben la persona, no su `id`.
- `usuarios.fud` sale sin `FUD1380`.
- `examples/basic` no tiene ningún `FUD1380` salvo en `app-calendar-plain.fud`, que se escribe
  sin delegar a propósito para comparar en `/delegacion`. Cualquier otro sitio que lo dé se pasa a
  delegación en esta misma spec.
- El texto de la página dice en una frase que la tabla usa un listener por evento, tenga las filas
  que tenga.

## 5. Invariantes

- **Una sola clasificación.** La forma del handler la decide `handlerShape` para el emit y para la
  proyección; esta spec solo añade qué dato pasa cada forma en tres eventos.
- **La llamada no cambia.** Todo `@f(…)` compila carácter por carácter igual que antes, y `$event`
  sigue siendo el evento.
- **Ningún nombre reservado nuevo.** No hay `$detail`: el dato llega como argumento, y la vía de
  escape es `$event.detail`.
- **Una definición de `BusDetail`**, en `@fudic/dom`, que comparten el emisor y la proyección.
- **El runtime de navegador no crece**: `emit` y `$dom.bus` no cambian; el emit escribe
  `$event.detail` donde antes escribía `$event`.
- **Cobertura:** lo nuevo al 100 % en las cuatro métricas; ningún umbral baja.

## 6. Criterios de aceptación

**El emit**

1. `<form form:=@save @fudic:result=@hecho>` emite `$dom.event(…, "fudic:result", ($event) => hecho($event.detail))`;
   con `@fudic:error=@fallo`, lo mismo con `fudic:error`.
2. `@fudic:result=@(v => f(v))` emite `($event) => (v => f(v))($event.detail)`. Una referencia a
   una celda de callback emite `($event) => cb()($event.detail)`.
3. `@fudic:result=@hecho($event.detail, 1)` emite lo mismo que hoy (`($event) => hecho($event.detail, 1)`).
4. `bus:alta=@alta` emite `($event) => alta.call($host, $event.detail)`; una lambda,
   `($event) => (l).call($host, $event.detail)`; `bus:alta=@alta($event)`, lo mismo que hoy.
5. `@click=@toggle` y `@mi-evento=@f` emiten lo mismo que hoy.
6. En el DOM (happy-dom), un componente con `bus:alta=@alta` cuyo `alta` guarda su argumento recibe
   el objeto que se pasó a `emit("alta", obj)` (el mismo objeto, no una copia), y su `this` sigue
   siendo el host.

**`fudic:error`**

7. Un `send` que rechaza con un `HttpError` de status 500 lanza `fudic:error` con ese mismo
   `HttpError` en `detail`; con un `TypeError`, con ese `TypeError`.
8. Uno que rechaza con `{ status: 500 }` (no es un `Error`) lanza `fudic:error` con un `Error` cuyo
   `cause` es ese objeto.
9. Uno que rechaza con `new DOMException('', 'AbortError')` no lanza nada.

**La proyección de los eventos del formulario**

10. Sobre `user-form.fud` migrado, el editor no da ningún error; el hover sobre `persona` dentro de
    `hecho` dice `Person`.
11. Si `hecho` declara `(persona: number)`, hay un error de TS cuyo rango es el valor `@hecho` del
    atributo. Si se cambia `-> Person` por `-> number` en el `.fudapi`, el error desaparece:
    el tipo sale del `.fudapi`, no de una copia.
12. `@fudic:result=@(p => p.name)` sobre ese `<form>` no da error, y `p` es `Person`.
13. `@fudic:result=@hecho($event.detail)` sobre ese `<form>`: `$event.detail` es `Person`.
14. Un `@fudic:result=@f` en un `<div>` sin `form:=`, con `f(v: Person)`, da error; con `f(v: unknown)`,
    no.
15. `@fudic:error=@fallo` con `fallo(e: Error)` no da error; con `fallo(e: HttpError)`, sí.
16. El hover sobre `save` en `form:=@save` lleva a su definición una sola vez, no dos.

**La proyección del bus**

17. Con `usuarios.fud` (`alta(persona: Person)`) y `user-form.fud` migrados, sin ningún registro
    escrito a mano: `emit("alta", persona)` no da error, y `emit("alta", "x")` da `TS2345` en el
    `"x"` de `user-form.fud`.
18. Añadiendo un segundo receptor `bus:alta=@otro` con `otro(p: { name: string })`, el `emit` de
    `Person` sigue sin error, y uno de `{ name: "a" }` da error porque falta `id`.
19. Con un receptor `otro(n: number)`, el `emit` de `Person` da error en el emisor; ningún receptor
    da TS2717.
20. Un receptor sin parámetros (`bus:ping=@onPing`, `onPing()`): `emit("ping")` y `emit("ping", 3)`
    no dan error.
21. Un nombre sin receptores: `emit("nadie", 42)` y `emit("nadie")` no dan error.
22. `bus:alta=@(p => p.name)` no registra nada; con `usuarios.fud` en el proyecto, `p` es `Person`;
    sin él, `p.name` da error (`unknown`).
23. `bus:(NOMBRE)=@f`, con `f(x: Person)`, no da error y no registra nada.
24. Un `.fud` cuyo `@code` no tiene imports y tiene un `bus:` tipado se proyecta sin errores
    (el `export {}`).
25. `bus:alta=@alta` dentro de un `@foreach` cuya variable de bucle se llama `alta` no registra (no
    está en el nivel superior del `@code`) y no da `Cannot find name`.

**El lote**

26. `pnpm --filter @fudic/example-basic typecheck` (o el comando que use el ejemplo) da el error del
    criterio 17 si se introduce el `emit("alta", "x")`, y pasa en verde sin él.

**El ejemplo, como lo usaría alguien**

27. `grep` de `detail` y de `CustomEvent` en `examples/basic/src` no encuentra nada.
28. **En el navegador** (`pnpm --filter @fudic/example-basic dev`, y otra vez en `preview`):
    - `/usuarios`: dar de alta a alguien añade la fila a la tabla sin recargar, y el aviso dice
      «Guardado: <nombre> (id <n>).».
    - Un email repetido sigue pintándose en el formulario, sin `fudic:error`.
    - `/hidratacion`: el primer clic en un producto ya suma al carrito, y el total es la suma de los
      precios.
    - La página del bus picker/log pinta el último elegido.
29. `tests/hydration.spec.ts` y los tests de `usuarios`/`user-form` pasan sin cambios en lo que
    comprueban.

**Entrega**

30. La decisión 173 está escrita en `gramatica-v1-decisiones.md` y en su índice, y la 98 lleva la
    nota «enmendada por la 173». Los README de `@fudic/dom` (bus) y de `@fudic/forms`
    (`fudic:result`/`fudic:error`) enseñan la forma nueva. `pnpm typecheck`, `pnpm test` y
    `pnpm build` en verde; lo nuevo al 100 %; ningún umbral baja.

**La delegación (ampliación del 2026-11-01)**

31. **`FUD1380`.** `@click` en un `<button>` dentro de un `@foreach (const p of ps)` da el aviso, con
    span en `@click` y el texto con `p` y `delegate:p`. También dentro de un `@for` y de un
    `@while`, y a varios niveles de profundidad dentro del bucle.
32. **Sin aviso.** El mismo `@click` fuera de todo bucle; `@load` y `@scroll` dentro de un bucle;
    `@if` y `@switch` no cuentan como bucle.
33. **Sustituto.** `@focus` dentro de un bucle avisa y el mensaje sugiere `@focusin`.
34. **Varios bindings.** Con `@foreach (const [k, v] of m)`, el mensaje dice `name` y
    `delegate:name`.
35. **Marcador con eventos.** En la tabla de §3.4, un `click` en la casilla no llama a `borrar`, un
    `change` en la casilla llama a `activar` con su persona, y un `click` en el botón llama a
    `borrar` con su persona. Probado en el emit y en el navegador.
36. **Sin valor, igual que antes.** Los tests de delegación de SDD-37 pasan sin cambios.
37. **`FUD1381`.** `delegate:p="input"` sin ningún `@input` de un ancestro que lea `p` da `FUD1381`
    sobre el valor.
38. **`FUD0667`.** `delegate:p=@x` y `delegate:p=""` lo dan con el texto nuevo; `delegate:p="click"`
    no.
39. **Tipos.** En `usuarios.fud`, `borrar(p: Person)` comprueba limpio en el editor y en
    `pnpm typecheck`. Con `borrar(p: number)` sale el error de TypeScript sobre la `p` del handler.
40. **Ejemplo.** `usuarios.fud` sin `FUD1380`; en `examples/basic` solo `app-calendar-plain.fud`
    lo da. En `/usuarios`, con el contador de listeners de `/delegacion` (`probe-listeners.js`),
    añadir 7 personas no añade ningún listener; marcar, desmarcar y borrar funcionan como antes.
41. **Sin `$`.** `<div @click=@pick(day)>` con `delegate:day` dentro llama a `pick` con la fila, y el
    hover sobre `day` en el handler enseña su tipo.
42. **`FUD1382`.** Con `const day = …` en el `@code` y `@pick(day)` sobre un `delegate:day`, error en
    el `day` del handler. Igual con un bucle exterior que declara `day`.
43. **`FUD1383`.** `@pick($day)` da el error con el arreglo; el calendario de `/delegacion` y su
    fixture, migrados, compilan limpios.

## 7. Fuera de alcance

- **Los eventos propios de un componente** (`@mi-evento`, con guion): siguen recibiendo el evento.
  El `detail` de cada evento de un componente es de SDD-63 (el contrato).
- **`fudic:data-stale`** y cualquier otro evento interno de fudic: no son de formulario ni de bus.
- **Tipar `fudic:result` en un ancestro** buscando el `<form form:=>` de dentro: aquí es `unknown`
  (§8.1.5).
- **Distinguir los `fails` por su nombre** en `fudic:error`: el cliente solo tiene el status y el
  `detail` del problema.
- **Inferir el tipo del bus desde el emisor**: el contrato lo pone quien recibe (§8.1.3).
- **Un nombre de bus que no sea literal** (`bus:(expr)`, `emit(variable, …)`): sin tipos, como hoy.

## 8. Decisiones

### 8.1. Tomadas al redactar

1. **El dato, en referencia y lambda; el evento, en la llamada.** Es lo que pide el desarrollador
   (Pedro, 2026-10-29: «que tanto una función como la otra recibiesen persona»). La llamada se
   queda con `$event` como vía de escape y porque así nada de lo escrito con llamada se rompe.
2. **Lista cerrada de tres eventos.** Son los que fudic lanza con un `detail` que es *el* dato. En un
   evento nativo, el evento es el dato; en un evento de componente, su contrato es de SDD-63. Se
   descartó un nombre reservado `$detail`: sería un segundo nombre mágico para algo que el
   argumento ya resuelve.
3. **El tipo del bus lo declara quien recibe.** El receptor ya tiene que tipar su parámetro (el
   modo estricto lo exige); usarlo como contrato hace que no haya que escribir nada más. Inferirlo
   del emisor no se puede expresar con `typeof` (el argumento de una llamada no tiene nombre), y
   dos emisores distintos lo dejarían ambiguo.
4. **Intersección, no una propiedad por nombre.** Una propiedad `alta: T` por receptor choca con
   TS2717 en cuanto dos receptores difieren, aunque sean compatibles, y un receptor sin parámetros
   chocaría con todos. Con la intersección, el emisor tiene que satisfacer a todos, que es justo lo
   que pasa en tiempo de ejecución: todos reciben el mismo objeto. Probado con `tsc` al redactar.
5. **`fudic:result` en un ancestro es `unknown`.** El evento burbujea, pero el ancestro no sabe qué
   formulario lo lanzó. Buscar un único `<form form:=>` dentro se puede hacer más adelante sin
   romper nada.
6. **`fudic:error` siempre es un `Error`; un `AbortError` no se anuncia.** Así `Error` es un tipo
   verdadero, `instanceof HttpError` es la forma de leer el status, y una cancelación se trata igual
   que en `error-pages` y en `task`.
7. **Sin diagnósticos propios para los handlers.** Los errores son de tipos y TypeScript los dice en
   el sitio correcto, mapeados al atributo o al `emit`. Los diagnósticos de la ampliación (§3.5) son
   de la delegación, no de los handlers.
8. **Un evento en un bucle es un aviso, no un error** (Pedro, 2026-11-01: «yo no voy a prohibir
   nada»). Hay casos legítimos, como el calendario sin delegar de `/delegacion`.
9. **El marcador dice a qué eventos sirve.** Sin eso, una fila con una casilla y un botón no se
   puede delegar: el `click` de la casilla llegaría al handler de borrar. La alternativa de que el
   handler mirase `$event.target` a mano se descartó: deja la regla en cada página.
10. **`$FudicEvents` conserva sus dos nombres** (al implementar, corrige §4.2). Un binding ya
    escrito de `fudic:result` o `fudic:error` no pasa por `$on`, como dice §4.2. Pero un nombre a
    medio escribir (`@fudic:r`) sí, y esa lista es la que lo autocompleta y la que subraya
    `@fudic:resul`. Quitar las entradas rompía las dos cosas sin ganar nada.
11. **La clave del registro lleva la ruta que recibe la proyección** (al implementar, corrige
    §3.3 y §4.4). `language-core` no conoce la raíz del proyecto: recibe la ruta del `.fud` tal
    cual (absoluta en el editor y en el lote), con `\` pasado a `/`. La clave solo tiene que ser
    única en el programa, y lo es igual.
12. **`bus:(expr)` sigue proyectando su expresión** (al implementar, corrige §4.4). `$busOnAny`
    y `$busEventAny` reciben el nombre como primer argumento (`unknown`), para que `NOMBRE` siga
    comprobado y con hover y definición; el dato es `any`, como dice §3.2.
13. **El criterio 27 se lee como «ningún handler desenvuelve el dato»** (al implementar). El
    `grep` literal encuentra usos que no son de estos eventos y que se quedan: los
    `new CustomEvent(…)` de `app-eventos.fud` (eventos de componente, §7), el `detail` del
    problema en `_error.fud` y la etiqueta `<details>`. Ningún handler de `fudic:result`,
    `fudic:error` ni `bus:` lee ya `detail` ni tipa un `CustomEvent`.
