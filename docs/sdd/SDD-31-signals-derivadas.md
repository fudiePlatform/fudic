# SDD-31 — Signals derivadas: `computed`, `effect`, `batch` (`@fudic/core`)

> **Estado:** `Listo`
> **Paquete:** `@fudic/core` (runtime de cliente) · `@fudic/compiler` (el emit de §4.6–§4.8)
> **Depende de:** 14 (`signal`), 15 (la forma del factory y el `Set` de nombres de signal que
> el emit ya mantiene)
> **Rango de diagnósticos:** `FUD0570`–`FUD0589`
> **Naturaleza:** runtime + emit. No toca el parser.
>
> Cierra la carencia que [BUG-12 §7](./bugs/BUG-12-sin-canal-de-update.md) y
> [SDD-15 §7](./SDD-15-emit.md) llaman *«las suscripciones finas de las signals propias del
> componente»* y que ningún SDD posee. Y de paso **corrige la superficie de `signal`**: la
> cabecera de [`signal.ts`](../../packages/core/src/signal.ts) dice literalmente *«v1: no
> automatic tracking»*, así que `sig()` y `sig.peek()` son hoy **la misma función**, y
> `subscribe` es un método público que ningún autor de vistas debería ver. Las dos cosas se
> arreglan aquí (§3, §4.0), mientras el framework está en `0.0.1` y cambiar la API cuesta un
> `git commit` en vez de una migración.

---

## 1. Contexto y objetivo

`@fudic/core` tiene una primitiva reactiva y solo una: `signal<T>(initial)`, con `()`, `peek()`,
`set()` y `subscribe()`. Ni derivadas, ni efectos, ni agrupación. Eso deja tres huecos, y el
tercero es el que obliga a escribir esta spec ahora y no más tarde:

- **Nada deriva.** Un componente que quiera `total = precio * cantidad` con las dos reactivas
  tiene que escribir la multiplicación en cada sitio donde la use, o suscribirse a mano a las
  dos y mantener una tercera signal en sincronía. Es el trabajo que `computed` existe para no
  hacer.
- **El código del usuario no puede reaccionar a nada.** El único consumidor de una signal es el
  código **emitido** (`$a()` reaplica las escrituras de valor). El `@code { @client }` del autor
  no tiene forma de ejecutar algo cuando una signal se mueve. `subscribe` está exportada, pero
  entonces la baja es suya, y una baja olvidada es una fuga que sobrevive al componente.
- **Nada agrupa, y sin agrupar no se puede componer.** `signal.set` notifica **sincrónicamente**
  a su `Set` de suscriptores. Dos `set` seguidos en un handler ejecutan dos veces todo lo que
  dependa de ambos, la primera con un estado intermedio. Mientras el único suscriptor sea el
  `$a()` de BUG-12 —que compara contra `$w` y no escribe si nada cambió— el defecto es invisible.
  En cuanto un efecto del usuario tenga efectos de verdad, deja de serlo.

**El objetivo:** las tres primitivas que faltan, con el coste de memoria del modelo mirado de
frente. Un `computed` **no se suscribe a nada** y por tanto no tiene disposer ni puede tener
fuga; un `effect` sí, y devuelve su baja. Es la asimetría del diseño y está en §4.2.

**Y una decisión que este SDD deja atada por escrito:** `sig()` pasa a significar **lectura
rastreada** y es la **única** forma de leer. `peek()` desaparece y `subscribe` deja de ser un
método. El razonamiento entero está en §4.0; el resumen es que una signal con cuatro métodos le
enseña al autor de una vista dos formas de leer —una de ellas la que no debe usar— y un canal de
suscripción que es del compilador, no suyo.

### Lo que este SDD NO es

No es el paso de props a signals. Esa conversación queda anotada como decisión abierta en §7
con la condición bajo la que se reabre, y este SDD es exactamente la mitad que había que tener
antes para poder medirla.

---

## 2. Dependencias

| Fuente | Aporta |
|---|---|
| SDD-14 | `signal<T>` y su contrato: `()`, `peek()`, `set()` (con `Object.is`), `subscribe()`. Este SDD **le recorta la superficie** (§4.0): quedan `()` y `set()`. El comportamiento no cambia; cambia qué se ve. |
| SDD-15 | La forma del factory (`$s`/`$a`/`$d`), el pase inicial y la suscripción por prop cruzada, y —lo que de verdad hace falta— el `Set<string>` de nombres declarados con `signal(...)` que `ClientScope.signals` mantiene ([`markup-client.ts:131`](../../packages/compiler/src/emit/markup-client.ts#L131)) y que `crossingExpr` consulta para decidir si un `.prop` cruza un valor o una referencia (decisión 84). §4.7 lo amplía; §4.8 reescribe las dos líneas que emite. |
| SDD-16 / módulo de servidor | `buildComponentModule` emite hoy una **signal inerte** por declaración ([`module.ts:172`](../../packages/compiler/src/emit/module.ts#L172)). §4.6 le añade las dos formas nuevas y corrige la forma del stub. |
| BUG-12 | `$a()` como único punto de escritura de valor, y `$w` como filtro por escritura. §4.3 se apoya en `$w` para justificar una renuncia deliberada. |

Ninguna dependencia de parsing. Ningún SDD del editor.

---

## 3. Interfaz pública

```ts
// packages/core/src/signal.ts
export interface Signal<T> {
  /** Lectura: RASTREADA dentro de un `effect` o un `computed`, suelta fuera. */
  (): T;
  /** Escritura; notifica solo si el valor cambia (`Object.is`). */
  set(v: T): void;
}
export function signal<T>(initial: T): Signal<T>;

// packages/core/src/computed.ts
/** Un derivado es exactamente una lectura: no hay nada más que hacer con una vista. */
export interface Computed<T> {
  (): T;
}
export function computed<T>(fn: () => T): Computed<T>;

/** Lo que se puede leer de forma rastreada, sea signal o derivado. */
export type Readable<T> = () => T;

// packages/core/src/effect.ts
/** Lo que un efecto puede devolver para deshacer lo que acaba de hacer. */
export type Cleanup = () => void;
/**
 * Ejecuta `fn`, rastrea lo que lee, y lo vuelve a ejecutar cuando algo de eso cambia.
 * Si `fn` devuelve una función, esa es su limpieza: corre antes de cada reejecución y
 * al dar de baja el efecto. Devuelve la baja.
 */
export function effect(fn: () => void | Cleanup): () => void;

/** Agrupa: dentro de `fn` nada notifica; al salir, cada efecto afectado corre UNA vez. */
export function batch<T>(fn: () => T): T;

/** Ejecuta `fn` sin rastrear ninguna lectura. Es la lectura suelta que `peek` era. */
export function untrack<T>(fn: () => T): T;

// packages/core/src/subscribe.ts — el canal del EMIT, no de la vista
/** Llama a `fn` con el valor nuevo cada vez que `source` se mueve. Devuelve la baja. */
export function subscribe<T>(source: Readable<T>, fn: (v: T) => void): () => void;
```

Cuatro cosas de la firma que son decisiones, no notación:

- **Una signal tiene dos operaciones: leerla y escribirla.** `peek()` se va (§4.0) y `subscribe`
  deja de ser un método. Lo que el autocompletado ofrece tras `count.` es `set`, y punto.
- **`Computed<T>` es solo la llamada.** No es una `Signal` a la que le falten métodos: es una
  **vista**. Que no sea asignable a `Signal<T>` es deseable — el sitio que pida una `Signal` es un
  sitio que va a escribir. Al revés sí: una `Signal<T>` es un `Readable<T>`.
- **`effect` devuelve la baja y no toma dependencias.** El array de dependencias explícito
  (`effect([a, b], fn)`) se descartó: es el modelo que el desarrollador olvida actualizar, y el
  rastreo cuesta quince líneas (§4.1).
- **La limpieza es el valor de retorno de `fn`, no un segundo parámetro.** Un efecto que hace
  `window.addEventListener(...)` tiene que poder quitarlo, y tiene que quitarlo **también entre
  vuelta y vuelta**, no solo al morir el componente: si las dependencias se recalculan en cada
  ejecución, lo que la ejecución montó se desmonta con ellas. Devolverla desde el cuerpo la deja
  escrita a dos líneas del alta, que es donde se lee (§4.3).
- **`batch` devuelve lo que devuelva `fn`.** Así envuelve una expresión sin obligar a partirla en
  dos sentencias, que es como se usa dentro de un handler.

### 3.1. Lo que `@fudic/core` exporta

`index.ts` gana `computed`, `effect`, `batch`, `untrack`, `subscribe` y los tipos `Computed` y
`Readable`. `signal` y `Signal` siguen, con la firma recortada de arriba.

`subscribe` es **función suelta y sigue siendo pública** porque el código emitido la importa
(§4.8), y un `effect` no la sustituye ahí: el emit sabe exactamente a qué se suscribe, y el pase
inicial ya lo hace `$s`/`$a` fuera de todo contexto de rastreo (BUG-12 §3.4). Pero sacarla del
tipo `Signal` cambia lo que importa: **deja de aparecer en el IntelliSense de una vista**. Quien
escribe una vista tiene `effect`; quien escribe el compilador tiene `subscribe`.

---

## 4. Comportamiento

### 4.0. La superficie de `signal`: dos operaciones, no cuatro

Hoy `signal` expone `()`, `peek()`, `set()` y `subscribe()`. Este SDD deja `()` y `set()`.

**Por qué se va `peek()`.** Existía porque `()` no rastreaba: eran la misma función y una de las
dos sobraba desde el primer día. Con el rastreo de §4.1, `()` **solo** registra dependencia si hay
un consumidor activo, y fuera de un `effect`/`computed` no hay ninguno — que es donde vive casi
todo el código: los handlers, el `h()` del factory, el `@code { @client }` de arranque. Así que
para el 95 % de las lecturas `count()` y `count.peek()` habrían hecho exactamente lo mismo, y el
autor habría tenido que elegir entre dos formas idénticas. Para el 5 % restante —leer **dentro**
de un efecto sin depender— está `untrack(() => count())`, que dice en voz alta lo que hace, justo
donde importa. Una API con una sola forma de leer no tiene forma incorrecta de leer.

**Por qué `subscribe` deja de ser un método.** No es una operación de la vista: es el canal por el
que el **código emitido** empuja un valor cruzado a un hijo (BUG-12 §3.4). Un autor que lo
encuentre en el autocompletado y lo use se lleva la baja a su cargo, y una baja olvidada es una
fuga que sobrevive al componente — exactamente el problema que `effect` resuelve devolviendo su
disposer. Sigue exportada como función (§3.1), porque el emit la necesita; simplemente ya no está
en el sitio donde un autor tropieza con ella.

**Lo que esto cuesta, dicho entero.** Es un cambio **incompatible** de la API. Se paga en tres
sitios y en ninguno más: el emit escribe `x()` donde escribía `x.peek()` (§4.8), los goldens se
mueven en consecuencia —y por eso este SDD **no** puede decir «ningún golden se mueve»; lo que
dice es §6.14 reescrito—, y los `.fud` de `examples/basic` cambian `count.peek()` por `count()`.
Se hace ahora, en `0.0.1`, porque el precio solo sube.

### 4.1. El rastreo: una pila de módulo, y nada más

```ts
let $active: Consumer | null = null;   // el effect o computed que está corriendo ahora
```

Una lectura (`sig()`) consulta `$active`; si hay alguien, se apunta como fuente suya, y si no hay
nadie —el caso normal: un handler, `h()`, el cuerpo de `@client`— no pasa nada en absoluto.
`untrack(fn)` guarda `$active`, lo pone a `null`, ejecuta y lo restaura: es la lectura suelta que
`peek()` era, escrita donde de verdad hace falta.

Es todo el mecanismo. No hay grafo global, no hay planificador, no hay identificadores de nodo.
La pila es una variable de módulo porque el rastreo es **dinámico y reentrante**: un `computed`
leído dentro de un `effect` corre con su propio `$active` y lo devuelve al salir.

**Cada `signal` gana un contador de versión**, incrementado en cada `set` que pase el `Object.is`.
Es lo que hace posible §4.2, y cuesta un entero por signal — no un `Set` más.

### 4.2. `computed` es **pull**, y por eso no tiene baja

Un `computed` **no se suscribe a sus fuentes**. Guarda, de su última ejecución, la lista de
fuentes y la versión que cada una tenía. Al leerlo:

```
si no hay caché  → ejecutar, guardar valor + (fuente, versión)*
si la hay        → recorrer las fuentes; si todas las versiones coinciden, devolver la caché;
                   si alguna se movió, ejecutar otra vez
```

Tres consecuencias, y las tres importan:

- **No hay disposer, y no puede haber fuga.** Un `computed` que nadie lee no está en el `Set` de
  suscriptores de nadie; se recoge con su closure cuando el componente muere. Es la diferencia
  con un modelo push, donde un derivado vivo mantiene vivas a sus fuentes y hay que darlo de baja.
- **No hay *glitch* posible.** Un derivado nunca se observa con un valor a medias, porque solo se
  calcula **en el momento de leerlo** y entonces lee lo que sus fuentes valen ahora. El problema
  de consistencia se traslada íntegro a los efectos, donde `batch` lo resuelve (§4.4).
- **Coste por lectura: recorrer las fuentes y comparar enteros.** Con una fuente son dos
  comparaciones; el caso caro sería un derivado con decenas de fuentes leído en un bucle, y ahí
  el mismo derivado en modelo push tampoco sería gratis.

**Un `computed` anidado funciona sin caso especial:** su fuente es otro `computed`, que también
lleva versión —la incrementa cuando su recómputo produce un valor distinto por `Object.is`—, así
que la comparación es la misma. Es lo único que el modelo pull necesita para la cascada.

### 4.3. `effect` es **push**, y se suscribe a las hojas

Un `effect` corre, se apunta como `$active`, y todo lo que se lea rastreado durante su ejecución
queda como fuente suya. Se suscribe a esas fuentes. Cuando alguna notifica, se limpia y vuelve a
correr, **rastreando de nuevo** — las dependencias de una ejecución no tienen por qué ser las de
la anterior (un `if` dentro del efecto cambia lo que lee).

**Las fuentes de un efecto son las signals hoja, no los computed que atraviesa.** Un `computed`
leído dentro de un efecto recomputa en **su propio** contexto —tiene que hacerlo, o no podría
guardar sus pares (fuente, versión) y la cascada de §4.2 no cortaría—, y acto seguido entrega al
efecto **las hojas** que hay detrás, no a sí mismo. Un derivado sobre otro derivado se atraviesa
igual, recursivamente, hasta las signals del fondo. Es la asimetría entera del diseño: un
`computed` se apunta lo que lee, un `effect` se apunta a qué puede suscribirse.

> **La renuncia, dicha entera:** eso significa que **no hay corte por igualdad en la frontera del
> derivado**. Con `total = computed(() => a() + b())`, mover `a` de 1 a 2 y `b` de 2 a 1 deja
> `total` en 3 y **aun así vuelve a ejecutar el efecto**. Se acepta, y no por descuido: en fudic
> el consumidor final de un efecto es una escritura en el DOM, y ahí ya está `$w` de BUG-12,
> que compara el string calculado y no toca el nodo si sale igual. Poner un segundo corte en el
> derivado costaría que el `computed` mantenga suscriptores —y con ellos disposer, y con él la
> fuga que §4.2 no tiene—. El corte se paga donde se cobra.

**Limpieza por vuelta.** Si `fn` devuelve una función, es su limpieza, y corre **antes de la
siguiente ejecución** y **al dar de baja el efecto** — en ese orden y en ningún otro momento.
Corre siempre `untrack`eada: deshacer algo no es leer estado del que depender. El caso que la
obliga es el más común que hay:

```ts
effect(() => {
  const onKey = (e) => cerrar(e);
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
});
```

Sin ella, un efecto que reacciona a una signal registra un listener más en cada vuelta. Con ella,
el alta y la baja se leen juntas y el efecto no puede acumular nada.

**Baja.** `effect` devuelve un disposer idempotente que ejecuta la limpieza pendiente y retira las
suscripciones. En un componente va a `$d`, como cualquier otro enganche, y `r()` lo ejecuta.

**Reentrada.** Un efecto que escribe una signal que él mismo lee es un bucle. Se acota con un
contador de ejecuciones encadenadas; pasado el límite, `effect` **lanza un `Error`** con el
mensaje que nombra el problema. No es un `Diagnostic`: es un error de programación en runtime, y
el runtime de fudic no diagnostica (SDD-17 §Naturaleza). El compilador no puede verlo.

### 4.4. `batch`: lo que hace que dos escrituras sean una

Sin agrupar, `a.set(1); b.set(2)` ejecuta dos veces cada efecto que dependa de las dos, y la
primera vez lo hace con `b` todavía en su valor viejo. Dentro de `batch`:

- `set` actualiza el valor y la versión **inmediatamente** —una lectura dentro del batch ve lo
  nuevo, que es lo que espera cualquiera que escriba dos líneas seguidas—,
- pero **no notifica**: apunta los suscriptores afectados en un conjunto,
- al salir del batch, cada uno corre **una vez**.

Anidar batches no anida flushes: solo el más externo vacía.

**Quién llama a `batch`.** Hoy, el autor. El emit podría envolver `u` y los handlers de evento, y
sería la envoltura correcta —un `u` que mueve tres props debería ser una pasada—, pero eso es emit
y vive en SDD-15; aquí se deja la primitiva y se anota el consumidor (§7).

### 4.5. Lo que cambia y lo que no

**Cambia la superficie, no el comportamiento.** `set` sigue filtrando con `Object.is` y sigue
notificando **sincrónicamente**; la suscripción sigue siendo síncrona y en el mismo orden; el pase
inicial de un prop cruzado lo sigue haciendo `$s`/`$a`, fuera de todo contexto de rastreo. Lo
único que se retira son dos nombres de la interfaz (§4.0).

**Los goldens se mueven, y exactamente en tres formas.** `x.peek()` pasa a `x()`, la suscripción
pasa de método a `$sub(x, …)` con su `import`, y el stub inerte del servidor pasa a ser una
función (§4.6). **No hay ningún cuarto cambio**: la estructura del chunk, el orden de las líneas,
los identificadores `$`, los ids de nodo y el HTML producido son idénticos. Eso es lo que
comprueba §6.14, y es la diferencia entre recortar una API y rediseñar el emit.

### 4.6. La rama de servidor: derivadas inertes, efectos que no existen

[`module.ts:172`](../../packages/compiler/src/emit/module.ts#L172) emite hoy, por cada `signal`
declarada, un stub inerte que aporta el valor inicial y nada más. Las dos formas nuevas entran por
la misma puerta y con la misma regla —**el servidor pinta el estado inicial**—:

- **`computed(fn)` → stub inerte que evalúa `fn`.** El SSR renderiza una vez, así que un derivado
  es su valor y punto.
- **`effect(fn)` → no se emite.** Un efecto es, por definición, lo que ocurre **después** del
  primer render. Ejecutarlo en el servidor sería pintar desde un estado que el cliente no va a
  reconstruir, y rompería la equivalencia SSR↔cliente de SDD-15 §6.14.
- **`batch(fn)` → `fn()`**, sin más: en el servidor nadie notifica.

**Y el arreglo que esta spec obliga a hacer:** el stub inerte de hoy es `{ peek: () => (init) }`,
o sea **no invocable**. Con `()` como única forma de leer, un `@client` que lea `expanded()`
compilaría en cliente y reventaría en el prerender con `expanded is not a function`. El stub pasa
a ser lo que el cliente tiene, que ahora es más simple que antes: **una función**.

```js
const expanded = () => (false);          // inert signal (SSR)
const total = () => (precio() * 2);      // inert computed: se evalúa al leerlo
```

El derivado inerte **evalúa su `fn` al leerlo**, no al declararlo: así una derivada que el
servidor nunca pinta no cuesta nada, y una que sí pinta ve las signals inertes ya declaradas sin
depender del orden. `effect` no se emite y `batch(fn)` se queda en `fn()`.

### 4.7. El enganche de emit: un `computed` también es reactivo

Es la mitad sin la cual este SDD no entrega nada usable, y es pequeña.

El emit mantiene `ClientScope.signals`, el conjunto de nombres que el `@code` declara con
`signal(...)`, extraído por `extractCode`
([`oxc-code.ts`](../../packages/compiler/src/emit/oxc-code.ts)). Ese conjunto es lo que
`crossingExpr` consulta para decidir **si un `.prop` cruza un valor o una referencia** (decisión
84, y el defecto (b) que BUG-16 tuvo que arreglar cuando el servidor vio los props por primera
vez) y lo que `markup-client.ts` usa para decidir si un host de hijo emite suscripción o no
(BUG-12 §3.4).

Con `computed` en el lenguaje, **un nombre declarado con `computed(...)` tiene que entrar en ese
mismo conjunto**. Si no:

```fud
@client { const total = computed(() => precio() * cantidad()); }
<app-total .value="@total"></app-total>
```

…cruzaría el objeto derivado en vez de su valor —`[object Object]` en el HTML, exactamente el
síntoma de BUG-16 (b)— y el padre no emitiría ninguna suscripción, así que el hijo se quedaría
congelado. Es una entrada más en la extracción, no un análisis nuevo.

**Lo que sigue fuera:** que el emit sepa que `total` **deriva de** `precio` y `cantidad`. No hace
falta: el padre se suscribe al derivado y el derivado ya sabe recomputarse. La forma emitida es la
que BUG-12 §3.4 ya fija, con `total` donde antes iba una signal.

### 4.8. Las tres líneas del emit que cambian de forma

La lectura de un nombre reactivo y la suscripción a él son literales de string en dos ficheros.
Con §4.0 pasan a ser:

| Dónde | Hoy | Con este SDD |
|---|---|---|
| [`attrs.ts:101`](../../packages/compiler/src/emit/attrs.ts#L101) — un `.prop` que cruza el valor de un nombre reactivo | `count.peek()` | `count()` |
| [`markup-client.ts:595`](../../packages/compiler/src/emit/markup-client.ts#L595) — el pase inicial de `u` | `count.peek()` | `count()` |
| [`markup-client.ts:600`](../../packages/compiler/src/emit/markup-client.ts#L600) — la suscripción por fuente | `count.subscribe(($v) => …)` | `$sub(count, ($v) => …)` |

Que la suscripción deje de ser un método obliga a **importarla**. El chunk de cliente ya emite una
línea de import propia (`FudicElement`); gana una segunda, y **solo cuando hay al menos una
suscripción**, para no meter un import muerto en un componente sin estado:

```js
import { FudicElement, subscribe as $sub } from '@fudic/core';
```

El alias `$sub` no es cosmético: `$` es la reserva del emit (SDD-15 §4.7), así que un autor que
declare su propio `subscribe` en `@client` no colisiona con la maquinaria.

**`$sub` funciona igual sobre una signal que sobre un `computed`**, y eso es lo que cierra §4.7:
sobre una signal se suscribe a la hoja directamente, y sobre un derivado monta un `effect` cuya
primera pasada no notifica —el pase inicial ya lo hizo `$s`— y cuya llamada al callback va
`untrack`eada, para que lo que el callback lea no se convierta en dependencia. El emit no tiene
que saber cuál de las dos cosas le han dado, que es justo lo que §4.7 pide.

---

## 5. Invariantes

- **Una sola forma de leer: `()`.** Rastrea si hay un consumidor activo y no hace nada si no lo
  hay. La lectura suelta dentro de un consumidor es `untrack`, escrita a la vista.
- **`subscribe` no es un método.** Una signal expone leer y escribir; el canal de suscripción es
  del emit y se importa (§4.8).
- **Un `computed` no tiene baja porque no se suscribe a nada.** Pull con versión. Un derivado que
  nadie lee no cuesta nada y no retiene nada.
- **Un `effect` siempre devuelve su baja, y en un componente esa baja vive en `$d`.** Un efecto
  sin baja es una fuga que sobrevive al host, igual que un `bus:` sin baja (SDD-15 §4.4).
- **Las dependencias se recalculan en cada ejecución.** Un efecto no acumula fuentes de
  ejecuciones anteriores; si un `if` dejó de leer algo, deja de depender de ello.
- **Y lo que una ejecución montó, se desmonta con ella.** La limpieza que `fn` devuelve corre
  antes de la siguiente vuelta y al dar de baja. Un efecto no puede acumular listeners.
- **Dentro de un `batch` se lee lo nuevo y no notifica nadie.** Salir del batch más externo
  ejecuta cada efecto afectado exactamente una vez.
- **El servidor pinta el estado inicial.** Las derivadas se evalúan una vez y los efectos no
  existen. Ninguna primitiva de este SDD puede cambiar el HTML que SSR produce respecto al que el
  cliente adopta.
- **El runtime no diagnostica.** El único fallo que este módulo puede señalar —un efecto que se
  realimenta— es un `Error` de runtime, no un `Diagnostic`.
- **Recorte de API, no rediseño del emit:** los goldens se mueven **solo** en las tres formas de
  §4.5 —`x.peek()` → `x()`, la suscripción a `$sub(...)` con su import, y el stub inerte—. Todo lo
  demás del chunk sale idéntico, y el HTML producido no cambia ni un byte.

### Catálogo de diagnósticos (`FUD0570`–`FUD0589`)

| Código | Regla |
|---|---|
| `FUD0570` | `effect(...)` declarado fuera de `@code { @client }` (§4.6). Un efecto en la zona neutra tendría que correr también en el servidor, y en el servidor no hay «después del primer render». |
| `FUD0571`–`FUD0589` | Reservados. |

`computed` y `batch` **no** reciben diagnóstico: los dos tienen semántica de servidor bien definida
(evaluar una vez / ejecutar) y prohibirlos en la zona neutra sería prohibir una constante derivada.

---

## 6. Criterios de aceptación

Tests en `packages/core/test/` (1–13, 18–19, 21) y `packages/compiler/test/emit/` (14–17, 20).

**Rastreo y derivadas**

1. **(rojo primero)** `computed(() => a() * 2)` devuelve el valor derivado, y **no** recomputa si
   se vuelve a leer sin que `a` se mueva: un contador dentro de `fn` sube una vez tras dos
   lecturas.
2. Mover `a` hace que la siguiente lectura recompute, y **solo la siguiente**: el contador sube
   una vez por movimiento observado, no una por lectura.
3. `untrack(() => c())` usa la misma caché y **no** registra dependencia: leer el derivado así
   dentro de un efecto no hace que ese efecto se reejecute cuando la fuente se mueva.
4. **Anidamiento.** `c2 = computed(() => c1() + 1)` sobre `c1 = computed(() => a() * 2)` propaga:
   mover `a` cambia `c2`. Y si el recómputo de `c1` produce el **mismo** valor, `c2` no recomputa
   (la versión de `c1` no se movió).
5. **Un derivado que nadie lee no ejecuta su `fn` nunca.** Crearlo y tirarlo no cuesta ninguna
   ejecución — es la propiedad que hace que `computed` sea pull.

**Efectos**

6. **(rojo primero)** `effect(fn)` ejecuta `fn` **una vez al crearse**, y otra vez por cada cambio
   de una signal que leyó de forma rastreada.
7. **Dependencias dinámicas.** Un efecto con `if (flag()) x(); else y();` deja de reejecutarse por
   `x` en cuanto `flag` pasa a `false`, y empieza a hacerlo por `y`.
8. **La baja.** El disposer retira las suscripciones; tras llamarlo, mover cualquier fuente no
   ejecuta nada. Llamarlo dos veces no lanza.
9. **`untrack`.** Una lectura dentro de `untrack` no crea dependencia, aunque use la forma de
   llamada.
10. **Realimentación acotada.** Un efecto que escribe una signal que lee **lanza** un `Error` con
    un mensaje que nombra el problema, y lo hace tras un número acotado de vueltas — no cuelga el
    hilo.
21. **Limpieza por vuelta.** La función que `fn` devuelve corre **antes** de cada reejecución y
    **una vez** al dar de baja, nunca después de la baja, y va `untrack`eada: lo que lea dentro no
    crea dependencia. Un efecto que da de alta un listener y devuelve su baja acaba con exactamente
    un listener vivo tras N movimientos de su fuente, y con ninguno tras el disposer.

**Agrupación**

11. **(rojo primero)** `batch(() => { a.set(1); b.set(2); })` ejecuta **una** vez el efecto que
    depende de las dos, y con los dos valores nuevos. Sin `batch`, ejecuta dos y la primera ve `b`
    viejo: el mismo test escrito de las dos formas es lo que demuestra para qué sirve.
12. Dentro del batch, una lectura ve el valor **nuevo** ya escrito.
13. Batches anidados: solo el más externo vacía; el interno no ejecuta ningún efecto.

**El canal del emit (`subscribe`)**

18. **(rojo primero)** `subscribe(sig, fn)` llama a `fn` con el valor nuevo en cada movimiento y
    **no** en el momento de suscribirse; el disposer corta la entrega y llamarlo dos veces no
    lanza. Es el contrato que el método `sig.subscribe` tenía, palabra por palabra.
19. **Sobre un derivado.** `subscribe(total, fn)` con `total = computed(() => a() * 2)` entrega el
    valor nuevo cuando `a` se mueve, tampoco entrega nada al suscribirse, y lo que `fn` lea dentro
    **no** se convierte en dependencia (va `untrack`eado, §4.8).

**Emit**

14. **Los goldens se mueven, y solo donde deben.** Los tres `__golden__/*.client.mjs` y los `*.mjs`
    de servidor difieren de los de `main` **únicamente** en las tres formas de §4.5: `x.peek()` →
    `x()`, la línea de suscripción → `$sub(x, …)` más su `import`, y el stub inerte del servidor.
    Se revisa el diff a mano; una cuarta clase de cambio es la señal de que algo se ha colado.
15. **(rojo primero)** Un `@client` con `const total = computed(() => a() * 2)` y un host
    `<app-x .value="@total">` emite el pase inicial con `total()` y la suscripción con
    `$sub(total, …)`, exactamente igual que con una `signal` — el nombre entró en
    `ClientScope.signals` (§4.7). Hoy cruzaría el objeto y no emitiría suscripción.
16. **(rojo primero)** El stub inerte del servidor es **invocable**: un `@client` que lea
    `expanded()` en una interpolación prerenderiza sin lanzar, y produce el mismo HTML que la rama
    de cliente adopta (§4.6). Y un `computed` en `@client` prerenderiza su valor.
17. `effect(...)` en la zona neutra de `@code` produce **`FUD0570`** con su span, y el resto del
    fichero se sigue emitiendo (el emit no lanza).
20. **El import se emite solo si hace falta.** Un componente con suscripciones trae
    `import { FudicElement, subscribe as $sub } from '@fudic/core';`; uno sin ellas sigue trayendo
    solo `FudicElement`, sin import muerto.

**Cobertura.** `tracking.ts`, `computed.ts`, `effect.ts`, `batch.ts` y `subscribe.ts` nacen al
**100 %** en las cuatro métricas. `@fudic/core` está al 100 % y no baja. Nada de
`/* v8 ignore */` para llegar al número.

---

## 7. Fuera de alcance

- **Props como signals.** Es la conversación que originó este SDD y queda **abierta**, no
  descartada. Hoy una prop es un `let` de la closure que `u` reasigna (BUG-12); convertirla en
  signal movería el coste de construcción del grafo a `h()`, es decir **dentro del gesto donde se
  mide el INP**, que es justo lo que `h` no llama a `$a()` para evitar. **La condición para
  reabrirlo:** con este SDD implementado y [BUG-18](./bugs/BUG-18-update-denso.md) cerrado, la
  pregunta pasa a ser medible en el arnés de `test/emit/hydrate/` con N instancias en vez de
  opinable. Y si se reabre, la vía que hay que evaluar primero **no es el upgrade perezoso en
  `requestIdleCallback`** —que deja dos caminos vivos en cada chunk y una ventana en la que el
  primer `u` llega en modo denso— sino el **corte estático**: el compilador ve si el `@client` de
  un componente reacciona a una prop, así que los que sí pueden nacer reactivos y los que solo
  pintan quedarse con `$a()`. Un solo modo por componente, decidido en compilación.
- **Que el emit envuelva `u` y los handlers en `batch`.** Es la envoltura correcta —un `u` que
  mueve tres props debería ser una pasada— pero es emit, y vive en SDD-15. Aquí se entrega la
  primitiva.
- **Un diagnóstico para el `.peek()` que ya no existe.** Un `@code` que escriba `count.peek()`
  compila y revienta en runtime, sin `FUD` que lo avise. No se añade: en `0.0.1` no hay código
  ajeno que migrar, y el día que lo haya el sitio de esa comprobación es el chequeo de tipos del
  LSP (SDD-24), no una regla del emit.
- **Corte por igualdad en la frontera del `computed`.** Renuncia deliberada de §4.3, con su
  razonamiento. Reconsiderable si aparece un caso medido donde el trabajo entre el derivado y el
  DOM sea caro y `$w` no lo absorba.
- **Planificación asíncrona de efectos** (microtask, `requestAnimationFrame`, prioridades). El
  modelo de este SDD es **síncrono**, como el `subscribe` que ya existe y del que dependen BUG-12
  y SDD-30. Cambiarlo sería cambiarles el contrato debajo.
- **`computed` escribible** (writable derived, el `WritableComputedRef` de Vue). No hay caso de uso
  en el repo y abre la puerta a un ciclo que §4.3 acota lanzando.
- **Rastreo del `@server`.** Las primitivas son de cliente; la zona `@server` es otro mundo y
  SDD-08 la posee.
- **Que el LSP ofrezca `computed`/`effect` en el completado de `@client`.** Es SDD-28 (snippets) y
  SDD-24; entra cuando las primitivas existan.
