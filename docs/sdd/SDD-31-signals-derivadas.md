# SDD-31 — Signals derivadas: `computed`, `effect`, `batch` (`@fudic/core`)

> **Estado:** `Listo`
> **Paquete:** `@fudic/core` (runtime de cliente) · `@fudic/compiler` (la mitad de emit de §4.7)
> **Depende de:** 14 (`signal`), 15 (la forma del factory y el `Set` de nombres de signal que
> el emit ya mantiene)
> **Rango de diagnósticos:** `FUD0570`–`FUD0589`
> **Naturaleza:** runtime + un enganche de emit. No toca el parser.
>
> Cierra la carencia que [BUG-12 §7](./bugs/BUG-12-sin-canal-de-update.md) y
> [SDD-15 §7](./SDD-15-emit.md) llaman *«las suscripciones finas de las signals propias del
> componente»* y que ningún SDD posee. Y da su significado a la mitad de la API de `signal`
> que hoy no lo tiene: la cabecera de
> [`signal.ts`](../../packages/core/src/signal.ts) dice literalmente *«v1: no automatic
> tracking»*, así que `sig()` y `sig.peek()` son hoy **la misma función**.

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
rastreada** y `sig.peek()` sigue siendo **lectura suelta**. Es lo que la interfaz ya decía que
iba a pasar, y el motivo de que hoy no rompa nada: **todo lo que el emit escribe usa `peek()` y
`subscribe()`**, nunca la forma de llamada (mírese cualquiera de los tres
[goldens de cliente](../../packages/compiler/test/emit/__golden__/)). El rastreo se lo estrena
el código del autor, no el emitido.

### Lo que este SDD NO es

No es el paso de props a signals. Esa conversación queda anotada como decisión abierta en §7
con la condición bajo la que se reabre, y este SDD es exactamente la mitad que había que tener
antes para poder medirla.

---

## 2. Dependencias

| Fuente | Aporta |
|---|---|
| SDD-14 | `signal<T>` y su contrato: `()`, `peek()`, `set()` (con `Object.is`), `subscribe()`. Este SDD lo **amplía sin romperlo**: la firma pública no pierde nada. |
| SDD-15 | La forma del factory (`$s`/`$a`/`$d`) y —lo que de verdad hace falta— el `Set<string>` de nombres declarados con `signal(...)` que `ClientScope.signals` mantiene ([`markup-client.ts:131`](../../packages/compiler/src/emit/markup-client.ts#L131)) y que `crossingExpr` consulta para decidir si un `.prop` cruza un valor o una referencia (decisión 84). §4.7 lo amplía. |
| SDD-16 / módulo de servidor | `buildComponentModule` emite hoy una **signal inerte** por declaración ([`module.ts:172`](../../packages/compiler/src/emit/module.ts#L172)). §4.6 le añade las dos formas nuevas y corrige la forma del stub. |
| BUG-12 | `$a()` como único punto de escritura de valor, y `$w` como filtro por escritura. §4.3 se apoya en `$w` para justificar una renuncia deliberada. |

Ninguna dependencia de parsing. Ningún SDD del editor.

---

## 3. Interfaz pública

```ts
// packages/core/src/signal.ts — la que ya existe, sin cambios de firma
export interface Signal<T> {
  /** Lectura RASTREADA: dentro de un `effect` o un `computed`, registra la dependencia. */
  (): T;
  /** Lectura suelta: nunca registra nada. */
  peek(): T;
  set(v: T): void;
  subscribe(fn: (v: T) => void): () => void;
}

// packages/core/src/computed.ts
export interface Computed<T> {
  /** Lectura rastreada del valor derivado; recomputa solo si alguna fuente se movió. */
  (): T;
  /** Lectura suelta, con la misma caché. */
  peek(): T;
}
export function computed<T>(fn: () => T): Computed<T>;

// packages/core/src/effect.ts
/** Ejecuta `fn`, rastrea lo que lee, y lo vuelve a ejecutar cuando algo de eso cambia. */
export function effect(fn: () => void): () => void;

/** Agrupa: dentro de `fn` nada notifica; al salir, cada efecto afectado corre UNA vez. */
export function batch<T>(fn: () => T): T;

/** Ejecuta `fn` sin rastrear ninguna lectura. */
export function untrack<T>(fn: () => T): T;
```

Tres cosas de la firma que son decisiones, no notación:

- **`Computed<T>` no tiene `set` ni `subscribe`.** No es una `Signal` a la que le falten métodos:
  es una **vista**, y la única operación de una vista es leerla. Que no sea asignable a
  `Signal<T>` es deseable — el sitio que pida una `Signal` es un sitio que va a escribir.
- **`effect` devuelve la baja y no toma dependencias.** El array de dependencias explícito
  (`effect([a, b], fn)`) se descartó: es el modelo que el desarrollador olvida actualizar, y el
  rastreo cuesta quince líneas (§4.1).
- **`batch` devuelve lo que devuelva `fn`.** Así envuelve una expresión sin obligar a partirla en
  dos sentencias, que es como se usa dentro de un handler.

### 3.1. Lo que `@fudic/core` exporta de más

`index.ts` gana `computed`, `effect`, `batch`, `untrack` y el tipo `Computed`. Nada se retira:
`subscribe` sigue siendo pública porque el **código emitido** la usa (BUG-12 §3.4), y un efecto no
la sustituye ahí — el emit sabe exactamente a qué se suscribe y no necesita rastreo.

---

## 4. Comportamiento

### 4.1. El rastreo: una pila de módulo, y nada más

```ts
let $active: Consumer | null = null;   // el effect o computed que está corriendo ahora
```

Una lectura rastreada (`sig()`) consulta `$active`; si hay alguien, se apunta como fuente suya.
`peek()` no lo consulta nunca. `untrack(fn)` guarda `$active`, lo pone a `null`, ejecuta y lo
restaura.

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

**Las fuentes de un efecto son las signals hoja, no los computed que atraviesa.** Si el efecto
lee un `computed`, el recómputo de ese derivado corre **dentro** del contexto de rastreo del
efecto, así que lo que queda apuntado son las signals del fondo.

> **La renuncia, dicha entera:** eso significa que **no hay corte por igualdad en la frontera del
> derivado**. Con `total = computed(() => a() + b())`, mover `a` de 1 a 2 y `b` de 2 a 1 deja
> `total` en 3 y **aun así vuelve a ejecutar el efecto**. Se acepta, y no por descuido: en fudic
> el consumidor final de un efecto es una escritura en el DOM, y ahí ya está `$w` de BUG-12,
> que compara el string calculado y no toca el nodo si sale igual. Poner un segundo corte en el
> derivado costaría que el `computed` mantenga suscriptores —y con ellos disposer, y con él la
> fuga que §4.2 no tiene—. El corte se paga donde se cobra.

**Baja.** `effect` devuelve un disposer idempotente que retira las suscripciones. En un componente
va a `$d`, como cualquier otro enganche, y `r()` lo ejecuta.

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

### 4.5. Lo que NO cambia

`signal` conserva su firma entera. `subscribe` sigue siendo pública y sincrónica, `peek` sigue sin
rastrear, y `set` sigue filtrando con `Object.is`. **Ningún golden se mueve por este SDD**: el
código emitido de hoy no llama a `sig()` en ninguna de sus tres formas de salida, y un fixture que
no use las primitivas nuevas compila byte a byte igual. Es la comprobación de §6.14 y es el
criterio que separa una ampliación de un rediseño.

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

**Y un arreglo que esta spec obliga a hacer:** el stub inerte de hoy es `{ peek: () => (init) }`,
o sea **no invocable**. Mientras `sig()` y `sig.peek()` fueran la misma función daba igual, porque
nadie escribía la primera. Con `()` significando lectura rastreada, un `@client` que lea
`expanded()` compila en cliente y revienta en el prerender con `expanded is not a function`. El
stub pasa a ser **una función con `.peek`**, que es la forma que el cliente tiene:

```js
const expanded = Object.assign(() => (false), { peek: () => (false) }); // inert signal
```

Es una línea y cierra un fallo que hoy no se puede provocar y mañana sí.

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

---

## 5. Invariantes

- **`peek()` nunca rastrea; `()` rastrea si hay un consumidor activo.** Es la única distinción
  entre las dos, y es la que el tipo ya anunciaba.
- **Un `computed` no tiene baja porque no se suscribe a nada.** Pull con versión. Un derivado que
  nadie lee no cuesta nada y no retiene nada.
- **Un `effect` siempre devuelve su baja, y en un componente esa baja vive en `$d`.** Un efecto
  sin baja es una fuga que sobrevive al host, igual que un `bus:` sin baja (SDD-15 §4.4).
- **Las dependencias se recalculan en cada ejecución.** Un efecto no acumula fuentes de
  ejecuciones anteriores; si un `if` dejó de leer algo, deja de depender de ello.
- **Dentro de un `batch` se lee lo nuevo y no notifica nadie.** Salir del batch más externo
  ejecuta cada efecto afectado exactamente una vez.
- **El servidor pinta el estado inicial.** Las derivadas se evalúan una vez y los efectos no
  existen. Ninguna primitiva de este SDD puede cambiar el HTML que SSR produce respecto al que el
  cliente adopta.
- **El runtime no diagnostica.** El único fallo que este módulo puede señalar —un efecto que se
  realimenta— es un `Error` de runtime, no un `Diagnostic`.
- **Ampliación, no rediseño:** ningún golden se mueve, ninguna firma existente cambia, y un
  componente que no use las primitivas nuevas compila byte a byte igual que hoy.

### Catálogo de diagnósticos (`FUD0570`–`FUD0589`)

| Código | Regla |
|---|---|
| `FUD0570` | `effect(...)` declarado fuera de `@code { @client }` (§4.6). Un efecto en la zona neutra tendría que correr también en el servidor, y en el servidor no hay «después del primer render». |
| `FUD0571`–`FUD0589` | Reservados. |

`computed` y `batch` **no** reciben diagnóstico: los dos tienen semántica de servidor bien definida
(evaluar una vez / ejecutar) y prohibirlos en la zona neutra sería prohibir una constante derivada.

---

## 6. Criterios de aceptación

Tests en `packages/core/test/` (1–13) y `packages/compiler/test/emit/` (14–16).

**Rastreo y derivadas**

1. **(rojo primero)** `computed(() => a() * 2)` devuelve el valor derivado, y **no** recomputa si
   se vuelve a leer sin que `a` se mueva: un contador dentro de `fn` sube una vez tras dos
   lecturas.
2. Mover `a` hace que la siguiente lectura recompute, y **solo la siguiente**: el contador sube
   una vez por movimiento observado, no una por lectura.
3. `peek()` sobre el derivado usa la misma caché y **no** registra dependencia: leerlo dentro de un
   efecto con `peek` no hace que ese efecto se reejecute cuando la fuente se mueva.
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

**Agrupación**

11. **(rojo primero)** `batch(() => { a.set(1); b.set(2); })` ejecuta **una** vez el efecto que
    depende de las dos, y con los dos valores nuevos. Sin `batch`, ejecuta dos y la primera ve `b`
    viejo: el mismo test escrito de las dos formas es lo que demuestra para qué sirve.
12. Dentro del batch, una lectura ve el valor **nuevo** ya escrito.
13. Batches anidados: solo el más externo vacía; el interno no ejecuta ningún efecto.

**Emit**

14. **Nada se mueve.** Los tres `__golden__/*.client.mjs` y los `*.mjs` de servidor salen **byte a
    byte idénticos** a los de `main`. Es el criterio que dice que esto es una ampliación.
15. **(rojo primero)** Un `@client` con `const total = computed(() => a() * 2)` y un host
    `<app-x .value="@total">` emite el pase inicial con `peek()` y la suscripción, exactamente
    igual que con una `signal` — el nombre entró en `ClientScope.signals` (§4.7). Hoy cruzaría el
    objeto y no emitiría suscripción.
16. **(rojo primero)** El stub inerte del servidor es **invocable**: un `@client` que lea
    `expanded()` en una interpolación prerenderiza sin lanzar, y produce el mismo HTML que la rama
    de cliente adopta (§4.6). Hoy da `expanded is not a function`.
17. `effect(...)` en la zona neutra de `@code` produce **`FUD0570`** con su span, y el resto del
    fichero se sigue emitiendo (el emit no lanza).

**Cobertura.** `computed.ts` y `effect.ts` nacen al **100 %** en las cuatro métricas. `@fudic/core`
está al 100 % y no baja. Nada de `/* v8 ignore */` para llegar al número.

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
