# SDD-72 — Los handlers reciben el dato: `fudic:result`, `fudic:error` y el bus, tipados y sin `detail`

> **Estado:** `Listo` — [tareas](./SDD-72-Task.md).
> **Paquetes:** `@fudic/compiler` · `@fudic/language-core` · `@fudic/dom` · `@fudic/forms` ·
> `@fudic/typecheck` · `examples/basic`
> **Depende de:** 15 (el emit de los event bindings y del `bus:`), 23 (la proyección TS de la
> vista), 56 (`form:=@save`, `fudic:result` y `fudic:error`), 60 (los stubs tipados del
> `.fudapi`), BUG-23 (la proyección suscribe la misma forma que el emit)
> **Rango de diagnósticos:** sin diagnósticos. Los errores de tipos son de TypeScript, en el sitio
> donde el autor se equivoca.
> **Decisiones de gramática:** 173 (enmienda la 98).
> **Origen:** conversación con Pedro del 2026-10-29, sobre `user-form.fud`, `usuarios.fud` y el bus
> de `hidratacion.fud`.
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
7. **Sin diagnósticos propios.** Los errores son de tipos y TypeScript los dice en el sitio
   correcto, mapeados al atributo o al `emit`.
