# BUG-24 — una signal no cruza el shadow boundary, y un callback no cruza en absoluto

**Estado:** `Listo` · **Bloqueado por:** [BUG-23](./BUG-23-arroba-valvula-de-escape.md) ·
**Rama:** `worktree-bug-24` · **Tareas:** [BUG-24-Task.md](./BUG-24-Task.md)

> **Paquetes:** `core` · `compiler` · `ssr` · `language-core`
> **Corrige:** decisión 84 · SDD-15 §3.3, §3.7, §4.3 · SDD-17 §3, §4.4 · SDD-31 §7 ·
> BUG-12 §3.4
> **Rango de diagnósticos:** `FUD0200`–`FUD0203` (del hueco `FUD0197`–`FUD0209` de SDD-12;
> BUG-23 ocupa `FUD0197`–`FUD0199`)

---

## 1. Contexto y síntoma

Por el shadow boundary cruza **un valor, siempre** (decisión 84). Eso deja dos cosas fuera
del framework, y las dos son necesidades, no adornos.

### Síntoma 1 — una signal cruza leída, así que el hijo no tiene reactividad

```fud
<!-- signal-counter.fud -->
@client { const count = signal(0); }
<signal-display .value=@count></signal-display>
```

```js
// lo que emite hoy: el padre lee, y le reescribe la casilla al hijo
$sub(count, (v) => $n0.u([, , v]));
```

El hijo recibe un `number`. **No puede derivar de él** (`computed(() => value() * 2)`), **no
puede reenviarlo a un nieto** como canal, y **no puede escribirlo**. Su única entrada es `u`,
que es una llamada del padre.

### Síntoma 2 — un callback no cruza de ninguna forma

```fud
<app-form .onSave=@save></app-form>
```

No hay salida. El servidor pinta `[object Object]` en el atributo y el cliente no tiene de
dónde sacar la función: el chunk del padre puede estar frío. Hoy la única vía hija→padre es
el bus, que es de `document` y por tanto global (SDD-17 §8: *scoping del bus por subárbol*
está fuera de v1).

### Síntoma 3 — la consecuencia de diseño

Todo estado compartido tiene que vivir en el ancestro común y **bajar nivel a nivel**. Un
árbol de cuatro niveles recompone cuatro payloads y ejecuta cuatro `u` para mover un número
que es el mismo número.

---

## 2. Causa raíz

Cinco líneas, y ninguna es un descuido: cada una es correcta por separado.

### 2.1 El cruce es la lectura, y está escrito en una función

[`crossingExpr`](../../../packages/compiler/src/emit/attrs.ts#L121) consulta los nombres
reactivos de `ClientScope.signals` y, si el valor es el nombre desnudo de uno, cruza
`nombre()`. Dos llamantes: la `.prop` de un componente
([attrs.ts:170](../../../packages/compiler/src/emit/attrs.ts#L170)) y el atributo plano
interpolado ([attrs.ts:282](../../../packages/compiler/src/emit/attrs.ts#L282)).

### 2.2 El payload es JSON, y solo JSON

[`state()`](../../../packages/ssr/src/ssr-dom.ts#L75) guarda lo que el `render` del hijo
destructuró, y [`writeHydrationBlocks`](../../../packages/compiler/src/emit/maps.ts#L193) lo
serializa con `JSON.stringify`. Una signal es una función con un `Set` de suscriptores vivo;
una función no tiene representación. **Esta línea no se toca: el payload sigue siendo JSON.**

### 2.3 El objeto lo construye el chunk, no el runtime

El usuario escribe `const n = signal(start)` y eso llega al chunk verbatim
([client.ts:79](../../../packages/compiler/src/emit/client.ts#L79)). El runtime solo entrega
el tramo crudo ([cascade.ts:78](../../../packages/core/src/hydrate/cascade.ts#L78)):

```js
(host as HydratableHost).h(maps.slice(id));
```

Dos instancias que quisieran compartir una signal construirían **dos objetos**. No hay ningún
sitio donde una identidad pueda ser única.

### 2.4 Y el orden lo impediría aunque se quisiera

Por post-orden (SDD-17 §4.4, [cascade.ts:95-108](../../../packages/core/src/hydrate/cascade.ts#L95-L108))
el padre hidrata **el último**. Cuando el hijo recibe su tramo, el `count` del padre todavía
no existe: nadie puede pasarle una referencia a algo aún no construido.

### 2.5 Los callbacks no tienen ni marcador ni dependencia

`fud-bus` es `tag → tags` y resuelve eventos. Una prop de función es una arista
**instancia → instancia** (el hijo necesita que corra *ese* dueño), y esa relación no existe
en ninguno de los tres bloques de la página.

---

## 3. Interfaz pública

### 3.1 `@fudic/core`

```ts
// hydrate/cells.ts (NUEVO)

/** La dirección de una celda: instancia dueña + índice DENTRO de su tramo. */
export type CellRef = readonly [owner: number, slot: number];

/** El marcador que viaja en `fud-state`. Dos formas, y la diferencia es la urgencia. */
export interface CellMark {
  /** Celda CON valor serializado en `data[offsets[owner] + slot]`. */
  readonly $?: CellRef;
  /** Celda SIN valor serializable (una función). Obliga a hidratar al dueño antes. */
  readonly $f?: CellRef;
}

/** El registro de celdas de la página. Una clave `owner:slot` → una `Signal`, para siempre. */
export interface Cells {
  /** La celda de esa dirección, materializada la primera vez que se pide. */
  get(ref: CellRef): Signal<unknown>;
  /** Las direcciones `$f` de las que depende esa instancia — las que exigen hidratar al dueño. */
  eager(id: number): readonly CellRef[];
  /** El tramo de esa instancia con sus celdas puestas. Devuelve un tramo nuevo. */
  resolve(id: number): readonly unknown[];
  /** Vacía el registro. Lo llama el router al navegar (SDD-20). */
  clear(): void;
}

export function createCells(maps: PageMaps): Cells;
```

> **Por id, no por tramo — y el `init` no viaja.** Un tramo suelto no basta para resolverlo.
> La casilla del **dueño** lleva su valor y no un marcador (§4.2, criterio 5), así que su
> dirección solo está escrita en los marcadores de sus consumidores: `resolve` necesita saber
> de quién es el tramo para reconocerla, y el registro barre el payload una vez al crearse
> para saber cuáles son. Sin eso, un dueño que hidratara **primero** encontraría un `0` en su
> casilla y `$p3 ?? signal(start)` le devolvería el número. Por lo mismo el valor inicial no
> es un argumento: sale siempre de `maps.slice(owner)[slot]`, que es una sola lectura y no
> depende de quién pregunte antes. `PageMaps` gana un `count` para poder recorrerlo.

```ts
// hydrate/cascade.ts — `attachAll` deja de entregar el tramo crudo
export interface CascadeConfig {
  // …
  readonly cells: Cells;
}
```

`@fudic/core` exporta además `isCellMark(v): v is CellMark`, que es lo único que el emit del
lado cliente necesita para el fallback de §4.4.

### 3.2 `@fudic/compiler`

```ts
// binding/crossing.ts — el tipo que BUG-23 deja preparado, ahora con su segundo caso vivo
export type Crossing =
  | { readonly kind: 'value'; readonly name: string }   // `titulo()` — decisión 84
  | { readonly kind: 'ref';   readonly name: string };  // la celda   — decisión 86 de props-spec

// emit/oxc-code.ts — una prop dice si pide un canal
export interface Prop {
  readonly name: string;
  readonly def?: string;
  readonly optional: boolean;      // BUG-23 tarea 16
  /** `'signal'` si su tipo es `Signal<T>`, `'fn'` si es una firma de función, si no ausente. */
  readonly channel?: 'signal' | 'fn';
}

// emit/state.ts (NUEVO) — las celdas que un componente publica
export interface CellSlot {
  /** El nombre reactivo (o la función) del `@client` que ocupa la casilla. */
  readonly name: string;
  /** Índice dentro del tramo del dueño, DESPUÉS de sus props. */
  readonly slot: number;
  readonly kind: 'signal' | 'fn';
}
export function cellSlots(comp: ResolvedComponent, graph: ComponentGraph): readonly CellSlot[];
```

### 3.3 `@fudic/ssr`

```ts
// El tramo de una instancia deja de ser solo sus props.
state(shadow: SsrNode, values: readonly unknown[], cells?: readonly unknown[]): void;
```

### 3.4 `@fudic/language-core`

Sin firmas nuevas. `emitValue` deja de proyectar la lectura cuando `crossing` devuelve
`'ref'`: ahí lo que TypeScript comprueba es el **objeto**, que es lo que el hijo declara.

---

## 4. Comportamiento corregido

### 4.0 La regla, en una frase

> **La celda la crea el runtime; el chunk la recibe.** Padre e hijo obtienen el **mismo**
> objeto porque nadie lo construye dos veces.

Es lo que cierra §2.3 y §2.4 a la vez: si el objeto no lo construye el código de nadie, el
orden en que corre el código de cada uno deja de importar.

### 4.1 Decisión 86 de props-spec — una prop declarada `Signal<T>` cruza por referencia

Lo que decide el modo es **lo que declara el hijo**, leído en compilación con `propsOf`
(BUG-23 tarea 17). No hay sintaxis nueva en el padre:

| el hijo declara | `.value=@count` cruza | por qué |
|---|---|---|
| `value?: number` | `count()` — el valor | decisión 84, byte a byte lo de hoy |
| `value: Signal<number>` | `count` — la celda | decisión 86 de props-spec |
| `onSave: () => void` | la celda de `save` | §4.6 |

```fud
<!-- el hijo, que ahora SÍ puede derivar y reenviar -->
@code {
  const { value } = props<{ value: Signal<number> }>();
  @client {
    const doble = computed(() => value() * 2);
  }
}
<p>@value() · @doble()</p>
<app-nieto .value=@value></app-nieto>
```

### 4.2 Qué se serializa: el tramo del dueño gana casillas

Una signal que cruza deja de ser local: **se serializa en el tramo de su dueño**, detrás de
sus props y en orden de declaración. Las props no se mueven de sitio, así que ningún índice
existente cambia.

```
tramo del dueño = [ ...props, ...celdas ]
```

Y la casilla del hijo lleva el **marcador**, no el valor:

```jsonc
<script id="fud-state">[[0,2,3],[ 0, 0, {"$":[0,1]} ]]</script>
//  instancia 0 (signal-counter): [ start=0, count=0 ]
//                                          └── celda (0,1)
//  instancia 1 (signal-display): [ {"$":[0,1]} ]  → «mi casilla es esa celda»
```

**El marcador apunta siempre hacia atrás.** `claim()` numera en pre-orden
([ssr-dom.ts:61](../../../packages/ssr/src/ssr-dom.ts#L61)): el dueño se reserva su id antes
de descender a su shadow, así que `owner < id` siempre y una sola pasada basta.

### 4.3 El reparto: el runtime resuelve antes de entregar

```js
// cascade.ts — attachAll
host.h(cells.resolve(id));
```

```js
// hydrate/cells.ts
const key = ([o, s]) => `${o}:${s}`;
get(ref) {
  const k = key(ref);
  let cell = map.get(k);
  if (cell === undefined) { cell = signal(maps.slice(ref[0])[ref[1]]); map.set(k, cell); }
  return cell;                       // misma dirección → mismo objeto, pida quien pida
}
```

El valor inicial sale del tramo **del dueño**, que el runtime ya sabe leer:
`maps.slice(owner)[slot]`. Quien pida primero la materializa; el segundo recibe la misma.
**El componente sigue sin conocer su `data-fud-id`** (SDD-17 §3): la sustitución la hace el
runtime, y el chunk solo ve una `Signal` donde antes veía un `number`.

### 4.4 El chunk recibe, y sigue teniendo un solo camino

El emit del dueño deja de construir incondicionalmente:

```js
// antes                          // ahora — una expresión, no dos ramas
const n = signal(start);          const n = $p3 ?? signal(start);
```

`$p3` es la casilla de la celda. Viene llena por `h` (instancia de SSR) y vacía por `c`
(instancia creada por el padre en runtime, que no tiene payload) — y en ese segundo caso el
inicializador del autor corre como siempre. **Un solo modo por chunk**, que es justo la
objeción que SDD-31 §7 le hacía al upgrade perezoso: no hay dos caminos vivos ni ventana en
la que el primer `u` llegue en otro formato.

### 4.5 En el hijo, una prop `Signal<T>` es un nombre reactivo más

Es la unificación que hace que no haya reglas nuevas de render: la prop entra en el
`ClientScope.signals` del hijo, así que **todo lo que ya existe se le aplica sin tocarlo**:

- el `$sub(name, $u)` de [client.ts:139](../../../packages/compiler/src/emit/client.ts#L139)
  la suscribe como a cualquier signal propia — el hijo repinta **solo** por sus escrituras;
- `crossingExpr` la cruza correctamente al nieto (cruza el objeto, porque el nieto también
  declara `Signal<T>`);
- `@value` en su plantilla se emite `value()`, igual que cualquier reactivo.

**Y `u` deja de escribir esa casilla.** El `$sub(count, v => $n0.u([, , v]))` del padre
desaparece para las props que cruzan por referencia: no hay nada que reenviar. `u` sigue
existiendo, íntegro, para las props que cruzan por valor (BUG-12, BUG-18).

### 4.6 Callbacks: la misma celda, sin valor inicial

Una función no tiene valor serializable, así que su celda **nace vacía** y esa ausencia es la
instrucción:

```jsonc
[[0,2,3],[ 0, null, {"$f":[0,1]} ]]
//              └── casilla reservada, sin valor
```

1. El dueño reserva la casilla igual que para una signal; el servidor escribe `null`.
2. La celda del hijo llega **vacía**, así que el runtime hidrata primero a la instancia dueña
   —es un ancestro, `allInstances` ya la alcanza— y solo después entrega el tramo.
3. El dueño, al enganchar, llena la celda: `$fill(k, save)`, que es `cell.set(save)`.
4. El hijo la lee al llamar: `onSave()` se emite `(props.onSave())(…)` → la función viva.

Una celda es **siempre** una signal; lo único que distingue `$f` de `$` es que no hay valor
que serializar y por tanto hay que hidratar al dueño antes. Un mecanismo, dos casos.

> **Por qué no basta con `fud-bus`.** El bus es `tag → tags` y escucha en `document`
> (SDD-17 §4.4). Una prop de función es una arista instancia→instancia: dos `<app-form>` de
> la misma página tienen dueños distintos y un bus no los distingue.

### 4.7 El servidor pinta valores, siempre

El marcador es **de cliente**. En SSR el padre pasa el objeto vivo a `render` del hijo, el
hijo lo lee (`value()`) y pinta el número. Nada del HTML visible cambia, y el nivel 1 no se
mueve un byte.

Y por eso el mismo `.value=@count` tiene dos emisiones distintas y correctas:

```js
// servidor: el objeto, porque ahí el hijo es una llamada a función en el mismo proceso
render_signal_display($dom, $s, { value: count });
// cliente, en el payload: el marcador, porque ahí hay un cable de por medio
```

### 4.8 La vida de la celda

El registro es **de página**. Sobrevive a los dos extremos —que es justo lo que se quiere: un
hijo puede `.set()` con el dueño todavía frío, y el dueño al despertar se suscribe y pinta el
valor correcto— y muere con la página. El router de SDD-20 llama a `cells.clear()` en cada
navegación; sin eso, una SPA acumula una celda por instancia y por ruta visitada.

### 4.9 Diagnósticos

| código | cuándo | dónde |
|---|---|---|
| `FUD0200` | una prop `Signal<T>` recibe algo que no es el nombre desnudo de un `signal`/`computed` | sobre el valor |
| `FUD0201` | una prop de función recibe algo que no es el nombre desnudo de una función de `@client` | sobre el valor |
| `FUD0202` | una prop `Signal<T>` o de función cruza hacia un componente **no hidratable** (N1/N2), que nunca podrá recibir la celda | sobre el nombre de la prop |
| `FUD0203` | un `computed` cruza a una prop cuyo hijo la escribe (`.set`) — un derivado no es escribible (SDD-31 §4.3) | sobre el valor |

Los cuatro se preguntan en ese orden, y el orden es parte de la regla: primero **qué se ha
escrito** y solo después **a quién**. Una página no tiene reactivos —las primitivas son de
cliente (SDD-31 §8)— así que lo suyo es `FUD0200`, no un reproche sobre el nivel del hijo.

`FUD0202` acaba siendo el de los **callbacks**, y por una razón que conviene dejar escrita: una
signal que cruza vuelve hidratable al hijo ella sola —es el *property drilling* que `level.ts`
ya propaga—, así que para una `Signal<T>` el caso no existe. Una función no mueve nada ni lee
nada, de modo que un hijo que solo la recibe se queda en nivel 1: ese cruce no llegaría a
ninguna parte, y es justo el que hoy se descubriría en runtime.

**Dónde viven.** No en `ANALYZERS`: los cuatro necesitan cuatro cosas que solo contesta quien
tiene el grafo resuelto —qué declara el hijo, si hidrata, si escribe la prop, y qué puede
cruzar cada nombre de este componente—, y el editor no tiene ninguna. Allí TypeScript ya
rechaza los mismos valores sobre la proyección, con el tipo real y con más que decir. Es el
mismo reparto que BUG-23 §4.4 dejó para `FUD0197`–`FUD0199`: una voz por hecho.

---

## 5. Invariantes

- **`fud-state` sigue siendo JSON.** El marcador es un objeto JSON; lo que no se serializa
  nunca es la signal.
- **Un objeto por celda, para toda la página.** `owner:slot` → una `Signal`. Materializarla
  dos veces es el bug que este BUG existe para no cometer.
- **El componente no conoce su `data-fud-id`** (SDD-17 §3). La resolución del marcador la
  hace el runtime, no el chunk.
- **El orden de hidratación deja de importar para el estado compartido.** Post-orden sigue
  vigente para el montaje (SDD-17 §5); la celda es independiente de él.
- **Un solo modo por chunk.** `$p3 ?? signal(start)` es una expresión, no dos caminos.
- **Una prop reactiva es un nombre reactivo más.** No hay reglas de render nuevas: entra en
  `ClientScope.signals` y hereda todas las existentes.
- **`u` no desaparece: se reparte.** Las props por valor siguen usándolo exactamente como
  BUG-12 y BUG-18 lo dejaron; las de referencia dejan de generarlo.
- **El HTML visible no cambia.** SSR pinta valores; los goldens de nivel 1 y de servidor no
  se mueven.
- **El marcador apunta hacia atrás.** `owner < id` por el pre-orden de `claim()`; una pasada
  resuelve el payload entero.
- **Una celda vacía es una dependencia de hidratación.** `$f` obliga a levantar al dueño
  antes de entregar el tramo, y eso es lo único que la distingue.

---

## 6. Criterios de aceptación

Cada uno se escribe **en rojo primero**. La página de aceptación extiende
`examples/basic/src/routes/signal-prop.fud` con un nieto y un formulario con callback.

**Compilación**

1. `crossing` devuelve `'ref'` cuando el hijo declara `Signal<T>` y `'value'` cuando declara
   `number`. Con `propsOf` ausente, siempre `'value'`.
2. `Prop.channel` vale `'signal'` para `value: Signal<number>`, `'fn'` para `onSave: () => void`
   y está ausente para `value?: number`.
3. `cellSlots` coloca las celdas **detrás** de las props y en orden de declaración; los
   índices de las props existentes no se mueven, y los goldens de las páginas sin celdas no
   cambian un byte.
4. El dueño emite `const n = $p3 ?? signal(start)`; el hijo emite `value()` donde su plantilla
   escribe `@value`, y **no** emite `$sub(count, v => $n0.u(…))` para la prop que cruza por
   referencia.

**Serialización**

5. La página de aceptación publica `[[0,2,3],[0,0,{"$":[0,1]}]]`: la celda en el tramo del
   dueño, el marcador en el del hijo.
6. `owner < id` en todos los marcadores de la página.
7. El HTML visible es idéntico al de antes del cambio (golden de nivel 1 y de servidor).

**Runtime — la identidad, que es el criterio central**

8. **Mismo objeto.** Tras hidratar padre e hijo, `padre.count === hijo.value`. Es el test que
   falla con cualquier diseño de espejo y pasa con la celda.
9. **Orden irrelevante.** El mismo criterio 8, hidratando primero el hijo (click dentro de su
   shadow) y primero el padre (click en su botón). Los dos dan el mismo objeto.
10. **El nieto también.** `padre.count === nieto.value` en una cadena de tres niveles, con
    **un** solo `$sub` por consumidor y ningún reenvío por `u`.
11. **Escritura desde abajo.** `hijo.value.set(7)` con el padre **frío**: al hidratar el
    padre después, pinta `7`. Hoy es imposible.
12. **Grano fino.** Mover la signal repinta solo los nodos que la leen; el `u` del hijo no se
    llama ni una vez.

**Callbacks**

13. `.onSave=@save` con el dueño frío: al pulsar dentro del hijo, el runtime hidrata primero
    al dueño y `save` corre **en ese mismo primer click** (replay, SDD-17 §4.4).
14. Dos `<app-form>` con dueños distintos llaman **cada uno al suyo**. Es el test que un bus
    no puede pasar.
15. La traza de `fud:hydrated` muestra al dueño antes que al hijo, con `from: 'subtree'`.

**Vida y límites**

16. `cells.clear()` en la navegación del router: dos visitas a la misma ruta no acumulan
    celdas, y la segunda arranca del payload nuevo.
17. Una instancia creada en runtime (`c`, sin payload) recibe la signal del padre **por
    referencia directa** y cumple el criterio 8 igual.

**Diagnósticos**

18. `FUD0200` con `.value=@42` contra `value: Signal<number>`; `FUD0201` con `.onSave=@notAFn`;
    `FUD0202` pasando una signal a un componente N1; `FUD0203` con un `computed` que el hijo
    escribe. Los cuatro en *Problems* y en `pnpm build`.
19. `props<Foo>()` (tipo con nombre, no literal) no produce ninguno: sin información no hay
    diagnóstico, igual que en BUG-23 §4.4.

**Editor**

20. `.value=@count` contra `value: Signal<number>` **no reporta nada**, y el hover sobre
    `count` dice `Signal<number>` — el editor comprueba el objeto porque es lo que cruza.
    Contra `value?: number` sigue comprobando la lectura (BUG-23 §4.2 regla 6, intacta).

**Cierre**

21. `pnpm typecheck`, `pnpm test` y `pnpm build` verdes. `@fudic/core` al **100 %** en las
    cuatro métricas; `compiler` y `ssr` no bajan.
22. La página `signal-prop` de `examples/basic` reescrita: el hijo deriva, el nieto recibe el
    mismo objeto y el formulario avisa al padre. Verificada en Chrome real en los tres modos
    (dev, build sin SW, build con SW), como exige SDD-17.

---

## 7. Fuera de alcance

- **Signals de estado no serializable.** Una celda con un nodo DOM o un closure dentro no
  sobrevive a una carga fría. Se documenta como límite; detectarlo es chequeo de tipos, y sin
  `fudic check` (IDEA-02 §1) no hay dónde ponerlo.
- **`bind:` / two-way.** Que el hijo escriba la celda ya es posible con este BUG; azúcar
  sintáctico para declararlo sigue en `PENDIENTES-v1.md`.
- **Scoping del bus por subárbol.** Sigue en SDD-17 §8. Este BUG no lo necesita ni lo acerca:
  una prop de función es una arista, un bus es una difusión.
- **Materialización del grafo raíz con identidad de referencias** (SDD-17 §8, el
  `@server load() → data`). Este BUG comparte **una signal**, no un objeto de dominio con
  `===` preservado a través de varias instancias. Son problemas hermanos y la celda es una
  pieza reutilizable, pero el alcance aquí es la prop.
- **Reactividad en `@server`.** Las primitivas son de cliente (SDD-31 §8).
- **Cambiar `u`.** Sigue tal cual para las props por valor. Este BUG le quita trabajo; no le
  cambia el contrato.
- **La regla del cruce en un nodo de TEXTO.** `@titulo` en prosa sigue como lo dejó BUG-23
  §7: fuera, y pendiente de decisión de gramática.
