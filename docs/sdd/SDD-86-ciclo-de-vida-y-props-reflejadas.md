# SDD-86 — El ciclo de vida de un componente, y las props reflejadas en el host

> **Estado:** `Listo` (2026-11-16) — [tareas](./SDD-86-Task.md).
> **Paquetes:** `@fudic/diagnostics` · `@fudic/compiler` · `@fudic/core` · `@fudic/forms` ·
> `@fudic/language-core` · `@fudic/language-server` · `@fudic/vscode` · `@fudic/mcp` · `examples/basic`
> **Depende de:** 15 (`c` / `h` / `u` / `r` y `FudicElement`), 17 (la cascada de hidratación en
> postorden), 20 (navegar sustituye el documento), 28 (los snippets), 34 (`FudicControlElement`), 39
> (la mitad de cliente de una ruta), 68 (`owned` y la limpieza de `r`), 85 (crear clonando). SDD-85
> tiene que estar en `main` antes de empezar.
> **Rango de diagnósticos:** `FUD1560`–`FUD1569` (nuevo). Usados: `FUD1560`–`FUD1562`.
> **Decisiones de gramática:** ninguna. Los hooks son funciones intrínsecas de `@code`, como `props`.
> **Origen:** [IDEA-08](./ideas/IDEA-08-adelgazar-el-cliente.md) §4, y lo hablado con Pedro el
> 2026-11-16. Con esta SDD la IDEA-08 queda cerrada.
> **Rama sugerida:** `sdd-86-ciclo-de-vida`, desde `main`.
>
> **Qué cambia en una frase.** El `@code` de un componente, de una ruta, de una página o de un layout
> puede pedir que se ejecute código suyo en cada momento de su vida en el navegador (antes y después de
> hidratar, antes y después de crear, al conectarse, al desconectarse y al destruirse), y reflejar una prop en un atributo del
> host queda probado y documentado como lo que ya es: un atributo con una expresión en el propio tag.

---

## 1. Contexto y objetivo

### 1.1. Lo que hay hoy

- **El JS de un componente solo llega al navegador si hace falta.** Lo decide
  `isIntrinsicallyHydratable` ([level.ts](../../packages/compiler/src/emit/level.ts)): una señal o
  un `computed`, un evento, un `inject`, o una sentencia de nivel superior de `@code` que se ejecuta
  (`clientRuns`).
- **El `@code` se ejecuta una vez por instancia**, dentro de `static c($props)` y del `$owned` de
  SDD-68, antes de que `FudicElement` llame a `h` o a `c` del controlador. No sabe por cuál de los dos
  caminos va a ir ni tiene forma de ejecutar nada después.
- **`FudicElement` no tiene `connectedCallback`** ([element.ts](../../packages/core/src/element.ts)).
  Su único callback es `disconnectedCallback`, que suelta el controlador en una microtarea para que un
  movimiento de `@foreach` con clave no lo destruya.
- **`FudicControlElement`** ([forms/src/element.ts](../../packages/forms/src/element.ts)), la clase de
  un componente `formassociated`, hereda de `FudicElement`, sobrescribe `h`, `c`, `u` y
  `disconnectedCallback` llamando a `super`, y declara un `connectedCallback` propio (el relay de
  atributos) que no llama a `super`.
- **Un `effect` o un `task` creado en `@code` se limpia en `r`** (SDD-68). No hay una forma de que el
  autor limpie lo suyo.
- **Una ruta hidrata pero no se crea.** Su chunk de cliente es el de un componente sin `c`, con el
  `<body>` como `$root` ([route-client.ts](../../packages/compiler/src/emit/route-client.ts)). Navegar
  sustituye el documento (SDD-20), así que una ruta, su layout y una página se van cuando se va el
  documento: en `pagehide`. Si el navegador la guarda en la bfcache, vuelve con `pageshow` sin haberse
  destruido.
- **Reflejar una prop en el host ya funciona.** El tag de identidad acepta atributos con expresión
  (BUG-32): `<app-card variant="@variant">`. Con una expresión sola, `true` escribe el atributo vacío,
  `false`, `null` y `undefined` lo quitan, y cualquier otro valor se escribe con `String(v)`
  ([attrs.ts](../../packages/compiler/src/emit/attrs.ts)). El editor ya exige que el valor sea un
  escalar (`$attr(v: $Scalar)` en [globals.ts](../../packages/language-core/src/globals.ts)). No hay
  ningún test que lo fije en el host, ni una línea en la guía.

### 1.2. Objetivo

1. El autor ejecuta código propio en cada momento de la vida de un componente en el navegador, sin
   tocar la clase del elemento, y en cada momento de la vida de una ruta, una página o un layout.
   Por ejemplo: leer de IndexedDB el estado de un store al hidratar la página y guardarlo al irse.
2. Lo que se crea en un hook se limpia con el mismo patrón que `effect`: devolviendo una función.
3. El servidor y el Service Worker no ejecutan ni ven ningún hook.
4. Funciona igual en un componente `formassociated`.
5. Un componente que no usa hooks emite exactamente el mismo código que hoy.
6. El editor ofrece cada hook como snippet dentro de `@code`.
7. Reflejar una prop en el host queda fijado por tests en los tres caminos del navegador y en el
   servidor, y explicado en la guía.

---

## 2. Dependencias

| SDD | Qué aporta |
|---|---|
| 15 | El controlador `{ c, h, u, r }`, `FudicElement.h()` / `c()` y su `disconnectedCallback` |
| 17 | La cascada de hidratación en postorden: los hijos se hidratan antes que el padre |
| 28 | El catálogo de snippets del language server, con su ámbito `code-block` y sus roles |
| 34 | `FudicControlElement` y su `connectedCallback` |
| 68 | `owned`, la lista de limpieza que ejecuta `r` |
| 85 | El `c` que clona una plantilla y la adopta |

Ninguna dependencia nueva.

---

## 3. Interfaz pública

### 3.1. Los hooks en `@code`

Siete funciones intrínsecas. Igual que `props`, no se importan: el compilador las reconoce por su
nombre y el editor las declara como globales.

```ts
beforeHydrate(fn: (host: HTMLElement) => void): void;
afterHydrate(fn: (host: HTMLElement) => void | (() => void)): void;
beforeCreate(fn: (host: HTMLElement) => void): void;
afterCreate(fn: (host: HTMLElement) => void | (() => void)): void;
onConnect(fn: (host: HTMLElement) => void | (() => void)): void;
onDisconnect(fn: (host: HTMLElement) => void): void;
onDispose(fn: (host: HTMLElement) => void): void;
```

- **`fn`** es la función del autor: lo que quiere que se ejecute en ese momento. Se la pasa al hook y
  fudic la llama cuando toca.
- **`host`** es el elemento del propio componente (`<app-card>`), el mismo para todos los hooks. En
  una ruta, una página o un layout es el `<body>`, su `$root`.
- **Lo que devuelve `fn`**, cuando el hook lo admite, es su limpieza:
  - la de `onConnect` se ejecuta en la siguiente desconexión;
  - la de `afterHydrate` y `afterCreate`, al destruirse el componente.

```ts
@code {
  const { variant = 'default' } = props<{ variant?: 'default' | 'highlight' }>();

  afterHydrate((host) => {
    console.log('adoptado lo que pintó el servidor', host);
  });

  onConnect((host) => {
    const ro = new ResizeObserver(() => { /* … */ });
    ro.observe(host);
    return () => ro.disconnect();
  });

  onDispose(() => {
    console.log('fuera');
  });
}
```

Se puede llamar al mismo hook varias veces: cada llamada añade una función, y se ejecutan en el orden
en que se escribieron.

### 3.2. Dónde se pueden escribir

| Dónde | Resultado |
|---|---|
| Sentencia de nivel superior del `@code` de un componente | Válido, los siete |
| Sentencia de nivel superior del `@code` de una ruta, una página o un layout | Válido, menos `beforeCreate` y `afterCreate` |
| Dentro de una función, un handler, un `if`, un bucle o un callback | `FUD1560` |
| `beforeCreate` o `afterCreate` en una ruta, una página o un layout | `FUD1561` |
| Una declaración o un import con el nombre de un hook | `FUD1562` |

### 3.3. Los diagnósticos

| Código | Severidad | Título | Cuándo |
|---|---|---|---|
| `FUD1560` | error | Lifecycle hook outside the top level of `@code` | La llamada no es una sentencia de nivel superior del `@code` |
| `FUD1561` | error | A create hook in a file that is never created | `beforeCreate` o `afterCreate` en una ruta, una página o un layout: siempre vienen del servidor |
| `FUD1562` | error | A declaration hides a lifecycle hook | El `@code` declara o importa un nombre que es el de un hook |

Cada uno es un fichero en `packages/diagnostics/src/codes/`, con su `.md` y su línea en `index.ts`,
como manda `CLAUDE.md`. `FUD1563`–`FUD1569` quedan libres.

### 3.4. El controlador

`Controller` ([controller.ts](../../packages/core/src/controller.ts)) gana dos métodos opcionales:

```ts
/** connect — the host is in a document and the component is alive. */
on?(): void;
/** disconnect — the host left the document; `r` may or may not follow. */
off?(): void;
```

Solo los emite un componente o una ruta que usa `onConnect` u `onDisconnect`. `c`, `h`, `u` y `r` no
cambian de firma.

### 3.5. `hooks` en `@fudic/core`

Un módulo nuevo, `core/src/lifecycle.ts`, exportado como `hooks` desde `@fudic/core`. Solo lo usa el
emit (como `owned`):

```ts
export type HookKind =
  | 'beforeHydrate' | 'afterHydrate' | 'beforeCreate' | 'afterCreate'
  | 'onConnect' | 'onDisconnect' | 'onDispose';

export interface Hooks {
  add(kind: HookKind, fn: (host: HTMLElement) => unknown): void;
  run(kind: 'beforeHydrate' | 'afterHydrate' | 'beforeCreate' | 'afterCreate', host: HTMLElement): void;
  on(host: HTMLElement): void;
  off(host: HTMLElement): void;
  dispose(host: HTMLElement): void;
}

export function hooks(): Hooks;
```

### 3.6. Las props reflejadas

No hay interfaz nueva. El autor escribe un atributo con una expresión en su propio tag de identidad:

```html
<app-card variant="@variant">
  <template shadowrootmode="open">…</template>
</app-card>
```

```css
:host([variant="highlight"]) .card { border-color: gold; }
```

Lo que se escribe es lo que ya hace el compilador con cualquier atributo de una sola expresión:

| Valor | Atributo en el host |
|---|---|
| `string`, `number`, `bigint` | `String(v)` |
| `true` | Presente y vacío |
| `false`, `null`, `undefined` | Ausente |
| Cualquier otro tipo | Error de tipos en el editor (`$Scalar`) |

---

## 4. Comportamiento

### 4.1. El orden de una vida

**Hidratar** (el componente viene pintado por el servidor):

1. El navegador mejora el elemento al definirse. Si ya está en el documento, `connectedCallback` llega
   sin controlador y no hace nada.
2. Se ejecuta el `@code` del componente (`static c($props)`); ahí se registran los hooks.
3. `beforeHydrate`: el shadow root tiene el DOM del servidor y nada está adoptado (los `ref` valen
   `null`).
4. El controlador adopta (`h`) y engancha (`$s()`): eventos, `bus:`, `ref`, formularios.
5. `afterHydrate`.
6. `onConnect`, porque el host ya está en el documento.

**Crear** (un bloque del padre lo fabrica en el navegador):

1. `live()` crea el host, y `raise` lo mejora y llama a `c` antes de insertarlo.
2. Se ejecuta el `@code` del componente.
3. `beforeCreate`: el shadow root está abierto y vacío.
4. El controlador clona su plantilla, la adopta, escribe los valores, abre sus bloques, levanta sus
   hijos y engancha (SDD-85 §4.2).
5. `afterCreate`.
6. El padre inserta el host: `connectedCallback` → `onConnect`.

**Desconectar y destruir:**

1. El host sale del documento: `disconnectedCallback` → `onDisconnect`, en ese mismo momento. Antes se
   ejecuta la limpieza que devolvió el último `onConnect`.
2. En la microtarea siguiente, si el host no ha vuelto a un documento, el controlador se suelta (`r`):
   primero `onDispose`, después las limpiezas de `afterHydrate` / `afterCreate`, todas en el orden en
   que se registraron, y después la limpieza de siempre (bloques, `effect`, `task`, nodos). Los `ref`
   siguen valiendo en `onDispose`.

**Mover** (una fila de `@foreach` con clave que se reordena): el host sale y vuelve a entrar en la
misma tarea. Se ejecutan `onDisconnect` y `onConnect`, en ese orden, y **no** `onDispose`. Así, lo que
depende de estar en el documento se limpia y se rehace, y lo que dura toda la vida del componente se
mantiene.

**Una ruta, una página o un layout.** Su `@code` y sus hooks viven en el chunk de la ruta, que es el
que hidrata el documento compuesto. Sus momentos son los del documento:

| Hook | Cuándo |
|---|---|
| `beforeHydrate` | Antes de que el controlador de la ruta adopte el `<body>` |
| `afterHydrate` | Después de adoptar y enganchar |
| `onConnect` | Justo después de `afterHydrate`, y otra vez en cada `pageshow` con `persisted === true` (la página vuelve de la bfcache) |
| `onDisconnect` | En cada `pagehide` |
| `onDispose` | En `pagehide` con `persisted === false`, después de `onDisconnect`: la página no va a volver |

La bfcache es a una página lo que un movimiento de `@foreach` a un componente: se va y vuelve sin
destruirse. Una ruta que se hidrata con el primer gesto (SDD-39) ejecuta sus hooks en ese momento; si
el usuario se va antes del gesto, ninguno se ha registrado y no se ejecuta ninguno.

El arranque de la ruta en `@fudic/core` ([install.ts](../../packages/core/src/hydrate/install.ts))
llama a `on()` del controlador justo después de `h()` y registra en `window` un listener de `pagehide`
(`off()`, y `r()` si `persisted === false`) y otro de `pageshow` (`on()` si `persisted === true`).
Solo los registra si el controlador tiene `on` / `off`, o si usa `onDispose`.

**Un trabajo asíncrono al irse.** En `pagehide` el navegador no espera a ninguna promesa. Una
transacción de IndexedDB o un `fetch` empezados en `onDisconnect` u `onDispose` de una ruta pueden no
terminar, sobre todo en móvil. Para un estado que no se puede perder, se guarda cuando cambia (un
`effect`) y el `onDisconnect` queda como último intento. La guía lo dice con el ejemplo de §4.9. En un
componente que sale de una página que sigue viva, ese límite no existe.

### 4.2. Conectar, sin repetir

`hooks().on` y `off` son idempotentes: `on` con el componente ya conectado no hace nada, y `off` con el
componente desconectado tampoco. `FudicElement` llama a `on` en dos sitios, y entre los dos cubren los
dos órdenes posibles sin disparar dos veces:

- al final de `h()` y de `c()`, si `this.isConnected`;
- en `connectedCallback`, si ya tiene controlador.

`disconnectedCallback` llama a `off` de forma síncrona y deja la microtarea de `r` como está.

### 4.3. Padres e hijos

Al hidratar, la cascada va en postorden (SDD-17): el `afterHydrate` de un hijo se ejecuta antes que el
del padre. Un componente que se hidrata por interacción o al entrar en el viewport ejecuta sus hooks
cuando se hidrata, no al cargar la página.

Al crear, cada hijo se levanta con `live()`, que espera a la definición de su tag. El `afterCreate` del
padre no espera a sus hijos: si un hijo ya estaba definido se crea en el paso 4 del padre, y si no,
cuando llega su definición.

### 4.4. Errores

Cada función se ejecuta por separado. Si una lanza, el error se reporta con `reportError` y se
ejecutan las demás; el componente sigue vivo. Un error en un hook nunca deja un componente a medio
hidratar.

### 4.5. Lo que emite el compilador

**Cliente.** Si el `@code` usa algún hook:

- dentro del `$owned`, antes del código del autor: `const $hk = $hooks();`
- cada llamada `afterHydrate(fn)` se reescribe como `$hk.add("afterHydrate", fn)`, con el mapa de
  fuentes apuntando a la llamada original;
- `h`: `$hk.run("beforeHydrate", $shadow.host)` al principio y `$hk.run("afterHydrate", …)` al final,
  después de `$s()`;
- `c`: lo mismo con `beforeCreate` / `afterCreate`;
- `r`: `$hk.dispose(…)` como primera línea, antes de soltar los bloques y los nodos;
- `on` / `off`, solo si usa `onConnect` u `onDisconnect`: `on: () => $hk.on(host)`,
  `off: () => $hk.off(host)`. El `host` se guarda al principio de la factoría, porque `r` deja
  `$shadow` a `null`.

`hooks` se importa como `$hooks`, con la reserva `$` del emisor, igual que `$owned`.

Si el `@code` no usa ningún hook, el emit no cambia en ningún byte.

**Rutas, páginas y layouts.** Lo mismo en su chunk de cliente
([route-client.ts](../../packages/compiler/src/emit/route-client.ts)), sin `c` y con `$root` como host.
El `@code` del layout y el de la ruta comparten el controlador de la ruta: sus hooks se registran en el
mismo `$hk`, primero los del layout y después los de la ruta.

**Servidor y Service Worker.** Las sentencias que llaman a un hook se quitan de su salida, enteras,
con su argumento: lo que hay dentro suele leer el DOM o APIs del navegador, que allí no existen.

**Nivel.** Una llamada a un hook es una sentencia de nivel superior que se ejecuta, así que
`clientRuns` ya hace que el componente hidrate, y que la ruta lleve chunk de cliente. No hace falta
tocar la regla; se fija con un test para los dos.

### 4.6. `FudicElement` y `FudicControlElement`

- `FudicElement` gana `connectedCallback(): void { this.#controller?.on?.(); }`, y llama a `on` al final
  de `h()` y de `c()` como dice §4.2. Su `disconnectedCallback` llama a `controller.off?.()` antes de
  programar la microtarea.
- El comentario de cabecera de `element.ts` («There is no `connectedCallback`…») se reescribe: ahora
  existe, y solo reenvía al controlador.
- `FudicControlElement.connectedCallback` pasa a ser `override` y llama primero a
  `super.connectedCallback()` y después a su relay. Con eso, `onConnect` funciona igual en un
  componente `formassociated`, y su `disconnectedCallback`, que ya llama a `super`, llega a `off`.

### 4.7. El editor

- **Tipos.** `globals.ts` de `@fudic/language-core` declara los siete hooks con las firmas de §3.1, junto
  a `props`. Una `fn` con una firma que no encaja, o una limpieza que no es una función, es un error de
  TypeScript, como cualquier otro.
- **Snippets.** Siete entradas nuevas en el catálogo de SDD-28
  ([snippets.ts](../../packages/language-server/src/services/snippets.ts)), con ámbito `code-block`, una
  por hook. `beforeCreate` y `afterCreate` llevan el rol `component`; las otras cinco, los roles
  `component`, `route`, `page` y `layout`. Su etiqueta es el nombre del hook:

| Snippet | Escribe |
|---|---|
| `beforeHydrate`, `afterHydrate`, `beforeCreate`, `afterCreate`, `onDisconnect`, `onDispose` | `nombre((host) => {\n  $0\n});` |
| `onConnect` | `onConnect((host) => {\n  $1\n  return () => {\n    $0\n  };\n});` |

- **El README de la extensión** añade la tabla de estos snippets junto a la de los `<link>`.

### 4.8. Las props reflejadas

El comportamiento de §3.6 ya existe; lo que se añade son sus tests y su documentación:

- **Servidor:** escribe el atributo en el tag del host.
- **`h`:** no lo reescribe al hidratar.
- **`u`:** lo actualiza, lo vacía con `true` y lo quita con `false`, `null` o `undefined`.
- **`c` (SDD-85):** un componente creado en el navegador tiene en su host los atributos literales y
  los interpolados de su tag de identidad, igual que el servidor.
- **Editor:** un objeto en `variant="@obj"` sobre el tag de identidad es un error de tipos.

La guía explica que el nombre del atributo lo elige el autor y que un atributo nativo tiene efectos:
reflejar en `title` pone un tooltip en todo el componente, y `hidden`, `id`, `lang`, `dir` o `role`
cambian cómo se comporta el host. Para una variante de estilo, el nombre propio (`variant`) o un
`data-*`.

### 4.9. La guía y el ejemplo

- `packages/mcp/guide/components.md` y `packages/mcp/guide/es/components.md` ganan dos secciones: el
  ciclo de vida, con la tabla de §3.1, el orden de §4.1 y el ejemplo de `ResizeObserver`; y las props
  reflejadas, con §3.6 y la nota de §4.8.
- `packages/mcp/guide/pages.md` y `packages/mcp/guide/es/pages.md` ganan la sección del ciclo de vida
  de una ruta, con la tabla de §4.1, la bfcache, el límite de lo asíncrono en `pagehide` y el ejemplo
  del store en IndexedDB:

```ts
// stores/carrito.ts
export const items = signal<Item[]>([]);
```

```ts
@code {
  import { effect } from '@fudic/core';
  import { items } from '../stores/carrito';

  afterHydrate(async () => {
    items.set(await leer('carrito'));
    effect(() => guardar('carrito', items()));
  });

  onDisconnect(() => {
    guardar('carrito', items());
  });
}
```
- `examples/basic` gana el componente `ciclo-demo` y la ruta `/ciclo`. El componente usa los siete
  hooks y escribe en una lista visible qué hook se ejecutó y en qué orden, y refleja su prop `estado`
  en el host (`estado="@estado"`), con un `:host([estado="activo"])` que cambia el borde. La ruta lo
  pinta una vez desde el servidor y otra dentro de un `@if`, con botones para abrir y cerrar el `@if`,
  cambiar `estado` y reordenar dos instancias en un `@foreach` con clave.
- La ruta `/ciclo` usa también sus propios hooks con el store del ejemplo de arriba: un contador cuyo
  valor se lee de IndexedDB en `afterHydrate`, se guarda con un `effect` y otra vez en `onDisconnect`.
  Recargar la página lo conserva.
- IDEA-08 queda cerrada: su §4 apunta a esta SDD.

---

## 5. Invariantes

- **Un componente sin hooks emite lo mismo que hoy.** Ningún golden de un componente sin hooks cambia.
- **El servidor no ve un hook.** Ninguna salida de servidor ni de Service Worker contiene una llamada
  a un hook ni el código de su argumento.
- **Un hook solo se registra en el nivel superior de un `@code`.** Cualquier otro sitio es un
  diagnóstico, y `beforeCreate` / `afterCreate` solo en un componente.
- **La página sigue entrando en la bfcache.** El framework escucha `pagehide` y `pageshow`, que son los
  eventos compatibles con ella, y nunca `unload` ni `beforeunload`. Y solo los escucha en una ruta que
  usa `onConnect`, `onDisconnect` u `onDispose`.
- **`onConnect` y `onDisconnect` se alternan.** Nunca hay dos `onConnect` sin un `onDisconnect` entre
  ellos, ni al revés.
- **`onDispose` se ejecuta una vez**, y nunca en un movimiento.
- **Un hook que lanza no rompe a los demás** ni deja el componente a medio hidratar o crear.
- **Las dos clases base se comportan igual.** `FudicControlElement` llega a los mismos hooks, en el
  mismo orden, que `FudicElement`.
- **Cobertura.** `core/src/lifecycle.ts` y el analizador nuevo, al 100 % en las cuatro métricas.
  `@fudic/core`, `@fudic/forms`, `@fudic/diagnostics` y `@fudic/language-server` siguen al 100 %.

---

## 6. Criterios de aceptación

**La prueba de Pedro**

1. `examples/basic` en `vite preview`, ruta `/ciclo`. La instancia del servidor lista
   `beforeHydrate`, `afterHydrate`, `onConnect`. Abrir el `@if` lista `beforeCreate`, `afterCreate`,
   `onConnect` en la instancia nueva; cerrarlo lista `onDisconnect`, `onDispose`. Reordenar las filas
   lista `onDisconnect`, `onConnect` y ningún `onDispose`. Cambiar `estado` cambia el atributo del
   host y el borde. El contador de la ruta, recargando, conserva su valor. La consola, sin errores.

**Los hooks**

2. Un componente hidratado ejecuta, en este orden: el código de nivel superior, `beforeHydrate`,
   `afterHydrate`, `onConnect`.
3. En `beforeHydrate` un `ref` vale `null`; en `afterHydrate` vale su elemento.
4. Un componente creado en el navegador ejecuta `beforeCreate` (con el shadow root vacío),
   `afterCreate`, y `onConnect` solo cuando el padre lo inserta.
5. Quitar un componente ejecuta `onDisconnect` en el acto, y en la microtarea siguiente `onDispose`
   y después las limpiezas de `afterHydrate` / `afterCreate`. En `onDispose`, los `ref` siguen valiendo.
6. Mover una fila de `@foreach` con clave ejecuta la limpieza de `onConnect`, `onDisconnect` y
   `onConnect`, y no `onDispose`.
7. Tres llamadas a `afterHydrate` se ejecutan en el orden del fuente.
8. Un `afterHydrate` que lanza: el error llega a `reportError`, el siguiente `afterHydrate` se
   ejecuta, y el componente responde a sus eventos.
9. `fn` recibe el host del componente en los siete hooks.
10. Un hijo hidratado ejecuta su `afterHydrate` antes que su padre.
11. Un componente que se hidrata por interacción no ejecuta ningún hook hasta la interacción.
12. Un componente `formassociated` ejecuta los siete hooks en el mismo orden, y su relay de
    atributos sigue funcionando.
13. `mount` de `@fudic/testing` ejecuta los hooks de hidratar (`via: 'ssr'`) y los de crear
    (`via: 'client'`); `unmount` ejecuta `onDisconnect` y `onDispose`.

**El compilador**

14. Un componente cuyo `@code` solo tiene `afterHydrate(() => {})` hidrata y tiene chunk de cliente.
15. Un componente sin hooks emite el mismo código, byte a byte, antes y después de esta SDD.
16. Un componente con hooks no tiene ninguna llamada a un hook en su salida de servidor ni de Service
    Worker, y se pinta igual que sin ellos.
17. Un componente que solo usa `afterHydrate` no emite `on` ni `off`.
18. `FUD1560` con un hook dentro de una función, de un handler y de un `if`, con el span en la llamada.
19. `FUD1561` con `beforeCreate` y con `afterCreate` en una ruta, una página y un layout; ningún
    diagnóstico con los otros cinco hooks en esos tres ficheros.
20. `FUD1562` con `const afterHydrate = …` y con `import { onConnect } from '…'`.

**El editor**

21. `afterHydrate((host) => host.dataset.x = '1')` no da errores de tipos; `afterHydrate(42)` sí;
    `onConnect(() => 42)` sí.
22. Dentro del `@code` de un componente se ofrecen los siete snippets; en el de una ruta, una página o
    un layout, los cinco que no son de crear; fuera de `@code`, ninguno.

**Las props reflejadas**

23. `variant="@variant"` en el tag de identidad: el servidor escribe `variant="highlight"` en el host;
    hidratar no lo escribe; `u` con `'default'` lo cambia; con `true` queda vacío; con `false`, `null`
    y `undefined` desaparece; con `0` vale `"0"`.
24. El mismo componente creado en el navegador desde un `@foreach` tiene en su host `role="group"`
    (literal del tag de identidad) y `variant` con el valor de la prop, como el servidor.
25. `variant="@obj"` con un objeto, en el tag de identidad, es un error de tipos en el editor.

**Rutas, páginas y layouts**

26. Una ruta con hooks ejecuta, en este orden: el código de nivel superior (el del layout y luego el
    suyo), `beforeHydrate`, `afterHydrate`, `onConnect`. `host` es el `<body>`.
27. Navegar a otra página ejecuta `onDisconnect` y, si la página no entra en la bfcache, `onDispose`.
28. Ir a otra página y volver atrás restaura la página desde la bfcache (`pageshow` con
    `persisted === true`), ejecuta `onDisconnect` al irse y `onConnect` al volver, ningún `onDispose`, y
    el estado de sus signals es el que tenía.
29. Una ruta sin hooks de salida no registra ningún listener de `pagehide` ni de `pageshow`, y una ruta
    con ellos no registra nunca `unload` ni `beforeunload`.
30. Una ruta con un `@code` que solo tiene `afterHydrate(() => {})` lleva chunk de cliente.

**Cierre**

31. `pnpm typecheck`, `pnpm build`, la cobertura de los paquetes tocados al 100 % en lo nuevo, y los e2e
    de `examples/basic` en verde.

---

## 7. Fuera de alcance

Nada.

---

## 8. Decisiones

### 8.1. Tomadas al redactar

1. **Los hooks son intrínsecos, como `props`.** No se importan, el compilador los ve por
   sintaxis, y por eso puede quitarlos del servidor y comprobar dónde se escriben.
2. **Siete momentos**: antes y después de hidratar, antes y después de crear, conectar, desconectar y
   destruir. Antes de hidratar y antes de crear tienen sentido aunque el código de nivel superior se
   ejecute justo antes: ahí el autor sabe ya qué camino se va a tomar.
3. **`onDisconnect` y `onDispose` son dos hooks.** fudic trata un movimiento como quitar y volver a
   insertar (SDD-15). Si solo hubiera uno, quien limpia ahí rompería las filas que se reordenan.
4. **La limpieza se devuelve**, como en `effect`. Lo de `onConnect` se limpia al desconectar; lo de
   `afterHydrate` / `afterCreate`, al destruir.
5. **`fn` recibe el host.** El `@code` no tenía otra forma de llegar a su propio elemento.
6. **También en rutas, páginas y layouts** (Pedro, con el caso del store en IndexedDB). No tienen host
   ni `connectedCallback`, pero hidratan y se van: sus momentos son los del documento. Solo
   `beforeCreate` y `afterCreate` les están prohibidos, porque una ruta siempre viene del servidor.
7. **`on` y `off` solo se emiten si hacen falta.** Un componente sin `onConnect` ni `onDisconnect` no
   paga nada por ellos.
8. **`FudicControlElement` llama a `super.connectedCallback()` primero**, como ya hace en
   `disconnectedCallback`.
9. **Las props reflejadas no llevan sintaxis nueva** (Pedro). Ya existe: un atributo con una expresión
   en el tag de identidad. El atributo lo puede escribir el autor del componente y cualquiera que lo
   use; no hay una regla de quién lo escribe.
10. **El nombre del atributo reflejado lo elige el autor.** Los efectos de un atributo nativo se
    explican en la guía, sin diagnóstico.
11. **`pagehide` y `pageshow`, nunca `unload` ni `beforeunload`.** Los dos primeros son los eventos
    compatibles con la bfcache; `unload` la desactiva en Chrome y Safari. Un `pagehide` con
    `persisted === true` es un movimiento (sale y volverá); con `false`, la destrucción.
12. **Lo asíncrono al irse no se promete.** El navegador no espera a nadie en `pagehide`. El framework
    no intenta alargar la vida de la página: la guía enseña a guardar cuando el dato cambia.
