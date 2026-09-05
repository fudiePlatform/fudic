# BUG-24 — Tareas

> **BUG:** [BUG-24 — una signal no cruza el shadow boundary](./BUG-24-signal-y-callback-no-cruzan.md)
> **Paquetes:** `@fudic/core` · `@fudic/compiler` · `@fudic/ssr` · `@fudic/language-core`
> **Rama:** `worktree-bug-24` · **Bloqueado por:** BUG-23 en `Hecho`
> **Progreso:** 11 / 19

Diecinueve tareas. Rutas relativas a la raíz del repo; cada tarea es un paso cerrado y se
puede parar después de cualquiera con el workspace verde.

**Por qué espera a BUG-23, y no es cortesía.** Este BUG necesita dos cosas que aquel
construye: `propsOf(tag)` (tarea 17), que es lo único que le dice al padre qué declara el
hijo, y `crossing` con su `Crossing` (tarea 26), que es donde vive la decisión del modo. Sin
las dos, la regla del cruce volvería a tener dos implementaciones — que es el defecto que
BUG-23 §5 acaba de cerrar.

**El orden manda en cuatro puntos.** La **1 antes que todo**: la identidad se mide en rojo o
el test solo demuestra que el código nuevo hace lo que hace. La **4 antes que la 7**: el
servidor no puede serializar unas casillas que nadie ha decidido. La **9 antes que la 10**:
`attachAll` no resuelve marcadores sin registro. Y la **10 antes que la 12**: un callback es
una celda, así que primero tiene que haber celdas.

---

## Mapa de dependencias

```
A · compilación (@fudic/compiler)
   2 Prop.channel ──→ 3 crossing 'ref' ──→ 4 cellSlots ──┬──→ 5 emit del dueño
                                                          └──→ 6 emit del hijo

B · serialización (@fudic/ssr + emit)          [dep 4]
   7 state(values, cells) ──→ 8 el marcador en el tramo del hijo

C · runtime (@fudic/core)                      (arranca ya: 9 no depende del compilador)
   9 cells.ts ──→ 10 attachAll resuelve ──→ 11 celda vacía hidrata al dueño

D · callbacks                                  [dep 10, 11]
   12 el dueño llena la celda ──→ 13 el hijo la llama

E · diagnósticos                               [dep 2, 3]
   14 FUD0200–FUD0203

F · vida                                       [dep 9]
   15 cells.clear() en el router

G · editor                                     [dep 3]
   16 la proyección no lee lo que cruza por referencia

H · cierre
   17 examples/basic ──→ 18 documentación ──→ 19 verde
```

| carril | tareas | arranca | en paralelo con |
|---|---|---|---|
| **A** compilación | 2–6 | tras la 1 | C, F |
| **B** serialización | 7–8 | tras la 4 | C |
| **C** runtime | 9–11 | ya (la 9 no espera a nadie) | A, B |
| **D** callbacks | 12–13 | tras 10 y 11 | E, G |
| **E** diagnósticos | 14 | tras 3 | C, D |
| **G** editor | 16 | tras 3 | D, E |

Puntos de junta, y hay dos: **10** (nada se entrega resuelto antes) y **19** (verde y
cerrado).

---

## Fase 1 — la medida: la identidad en rojo (1)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **Rojo primero.** Un arnés de hidratación con padre → hijo → nieto y un callback, y cuatro aserciones que **hoy fallan**: `padre.count === hijo.value`, lo mismo con el nieto, `hijo.value.set(7)` con el padre frío, y `.onSave=@save` llamando al dueño correcto. Marcadas `it.fails` para que el workspace quede verde en cada commit y el paso a `it` sea la prueba de que la fase aterrizó. **Anotar en esta tabla qué falla y cómo** — del primero, si hoy es `undefined`, un `number` o dos objetos distintos | `core` · `compiler` | `packages/core/test/hydrate/cells.test.ts` *(nuevo)* · [packages/compiler/test/emit/hydrate/](../../../packages/compiler/test/emit/hydrate) *(patrón del arnés)* |

**Lo que se vio fallar** (`packages/core/test/hydrate/cells.test.ts`, las cuatro en `it.fails`):

| # | aserción | lo que dice hoy |
|---|---|---|
| 1 | `padre.count === hijo.value` | `expected +0 to be { $: [ 0, 1 ] }` — el hijo tiene el **marcador**, un objeto JSON; el padre tiene el `0` que había en su casilla, porque `$p1 ?? signal(start)` devuelve el número |
| 2 | `padre.count === nieto.value` | la misma lectura, un nivel más abajo: el nieto tiene una segunda copia del marcador |
| 3 | `hijo.value.set(7)` con el padre frío | `TypeError: child.value.set is not a function` |
| 4 | `.onSave=@save` al dueño correcto | `TypeError: this.onSave is not a function` — un marcador tampoco es llamable |

## Fase 2 — compilación: quién cruza por referencia (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 2 | 1 | **`Prop.channel`.** Leer el argumento de tipo de `props<T>()` un paso más allá de lo que BUG-23 tarea 16 dejó: un miembro cuyo tipo sea `Signal<…>` marca `channel: 'signal'`, una firma de función marca `'fn'`, lo demás no marca nada. Como en BUG-23, si `T` no es un literal de tipo **no se marca nada** y todo sigue cruzando por valor: un build no inventa lo que no puede demostrar | `compiler` | [src/emit/oxc-code.ts `Prop`, `readProps`](../../../packages/compiler/src/emit/oxc-code.ts#L20-L24) |
| [x] | 3 | 2 | **`crossing` devuelve `'ref'` (decisión 105).** El `target` que BUG-23 dejó preparado pasa a decidir: `channel` presente en la prop del hijo → `{kind:'ref'}`, si no → `{kind:'value'}` como hoy. `crossingExpr` cruza el **nombre desnudo** en el caso `'ref'`. Los goldens de una página sin props reactivas no se mueven un byte, y ese es el test | `compiler` | [src/binding/crossing.ts](../../../packages/compiler/src/binding/crossing.ts) *(de BUG-23 t.26)* · [src/emit/attrs.ts `crossingExpr`](../../../packages/compiler/src/emit/attrs.ts#L121) |
| [x] | 4 | 3 | **`cellSlots`: las casillas que un componente publica.** Un módulo nuevo que, dado un componente y el grafo, devuelve los nombres de su `@client` que cruzan por referencia hacia algún hijo, con su índice. **Detrás de las props y en orden de declaración**, para que ningún índice existente se mueva. Es la única fuente de esos índices: emit de cliente, emit de servidor y marcador tienen que sacarlos de aquí o dejarán de cuadrar | `compiler` | `src/emit/state.ts` *(nuevo)* · [src/emit/resolve.ts](../../../packages/compiler/src/emit/resolve.ts) · [src/emit/level.ts](../../../packages/compiler/src/emit/level.ts#L164) |
| [x] | 5 | 4 | **El dueño recibe, con un solo camino.** Donde el autor escribió `const n = signal(start)` y `n` ocupa una celda, el emit de cliente escribe `const n = $pK ?? signal(start)`: llena por `h` (instancia de SSR), vacía por `c` (creada en runtime, sin payload). **Una expresión, no dos ramas** — es la objeción que SDD-31 §7 le hacía al upgrade perezoso y hay que dejarla contestada en el comentario del emit | `compiler` | [src/emit/client.ts](../../../packages/compiler/src/emit/client.ts#L79-L128) · [src/emit/markup-client.ts](../../../packages/compiler/src/emit/markup-client.ts#L214-L226) |
| [x] | 6 | 4 | **En el hijo, la prop reactiva es un nombre reactivo más.** Una prop con `channel: 'signal'` entra en `ClientScope.signals` del hijo. Con eso, y **sin ninguna regla nueva**, hereda el `$sub(name, $u)` de [client.ts:139](../../../packages/compiler/src/emit/client.ts#L139), la lectura `value()` en su plantilla y el cruce correcto hacia el nieto. Y **se retira** el `$sub(count, v => $n0.u([, , v]))` del padre para esa casilla: no hay nada que reenviar | `compiler` | [src/emit/client.ts](../../../packages/compiler/src/emit/client.ts#L86-L96) · [src/emit/markup-client.ts](../../../packages/compiler/src/emit/markup-client.ts#L755-L770) |

## Fase 3 — serialización: la celda en el payload (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 7 | 4 | **El tramo del dueño gana casillas.** `state(shadow, values, cells?)` concatena las celdas detrás de las props, y el emit de servidor le pasa el valor **leído** de cada signal (`n()`) — en el servidor la signal existe, es donde el `@client` se evalúa para pintar. Una celda de función se serializa `null`. La reserva de `claim()` no cambia: los ids siguen siendo pre-orden y por eso el marcador apunta siempre hacia atrás | `ssr` · `compiler` | [packages/ssr/src/ssr-dom.ts `state`](../../../packages/ssr/src/ssr-dom.ts#L75) · [src/emit/markup.ts](../../../packages/compiler/src/emit/markup.ts#L266) |
| [x] | 8 | 7 | **El marcador en el tramo del hijo.** Donde `crossing` dice `'ref'`, lo que va al payload del hijo no es el valor sino `{"$":[owner,slot]}` —o `{"$f":[owner,slot]}` si la celda es de función—. El `owner` es el `data-fud-id` que `claim()` acaba de dar al host, que el emisor de servidor tiene delante. Un golden fija la página entera: `[[0,2,3],[0,0,{"$":[0,1]}]]` | `compiler` · `ssr` | [src/emit/markup.ts `componentPropsExpr`](../../../packages/compiler/src/emit/markup.ts#L266) · [src/emit/attrs.ts](../../../packages/compiler/src/emit/attrs.ts#L294-L320) |

## Fase 4 — runtime: las celdas (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 9 | — | **`cells.ts`.** El registro: `Map<"owner:slot", Signal>`, `get(ref, init)` que materializa la primera vez y devuelve la misma después, `resolve(slice)` que sustituye marcadores, `eager(slice)` que lista las direcciones `$f`, y `clear()`. **No depende del compilador**: se puede escribir el primer día contra un payload a mano. Es donde vive la identidad, así que sus tests son los del criterio 8 | `core` | `src/hydrate/cells.ts` *(nuevo)* · [src/hydrate/maps.ts](../../../packages/core/src/hydrate/maps.ts) *(le presta `slice`)* · [src/index.ts](../../../packages/core/src/index.ts) *(`isCellMark`)* |
| [x] | 10 | 9 | **`attachAll` entrega resuelto.** `host.h(maps.slice(id))` pasa a `host.h(cells.resolve(maps.slice(id)))`. `Cells` entra en `CascadeConfig` como puerto inyectado, igual que `registry` y `loader`, para que el runtime siga siendo verificable sin DOM. **El componente sigue sin conocer su id** (SDD-17 §3): eso es exactamente lo que esta línea preserva | `core` | [src/hydrate/cascade.ts `attachAll`](../../../packages/core/src/hydrate/cascade.ts#L67-L79) · [src/hydrate/install.ts](../../../packages/core/src/hydrate/install.ts#L115) |
| [x] | 11 | 10 | **Una celda vacía hidrata al dueño.** Antes de entregar un tramo, `cells.eager(slice)` da las direcciones sin valor serializado; por cada una, el runtime levanta la instancia dueña —`allInstances` ya la alcanza a través de shadow roots— y **después** entrega. Va **antes** del `attachAll` del hijo, en el mismo sitio del camino 2 donde el bus va antes de la cascada (SDD-17 §4.4), y reporta `fud:hydrated` con `from: 'subtree'` | `core` | [src/hydrate/cascade.ts](../../../packages/core/src/hydrate/cascade.ts#L84-L112) · [src/hydrate/registry.ts `allInstances`](../../../packages/core/src/hydrate/registry.ts) |

## Fase 5 — callbacks (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 12 | 11 | **El dueño llena su celda.** Una función de `@client` que cruza como prop reserva casilla (tarea 4, `kind: 'fn'`) y el dueño la llena al enganchar: `$fill($pK, save)`, que es `cell.set(save)`. En una instancia creada por `c` no hay celda y la función cruza directa, como cualquier valor | `compiler` | `src/emit/state.ts` · [src/emit/client.ts](../../../packages/compiler/src/emit/client.ts#L128-L140) |
| [ ] | 13 | 12 | **El hijo la llama.** Una prop con `channel: 'fn'` se lee al invocar: `onSave(x)` se emite `onSave()(x)`. La garantía de que la celda está llena es la tarea 11 —el dueño se hidrató antes de que este tramo se entregara—, así que aquí **no** hay guarda defensiva: si estuviera vacía sería un fallo del runtime y taparlo lo volvería silencioso | `compiler` | [src/emit/markup-client.ts](../../../packages/compiler/src/emit/markup-client.ts) · [src/emit/events.ts](../../../packages/compiler/src/emit/events.ts#L86-L121) |

## Fase 6 — diagnósticos y editor (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 14 | 3 | **Cuatro diagnósticos, en el pase semántico.** `FUD0200` prop `Signal<T>` mal alimentada, `FUD0201` prop de función mal alimentada, `FUD0202` celda hacia un componente **no hidratable** (N1/N2, que nunca podrá recibirla), `FUD0203` un `computed` a una prop que el hijo escribe. Analizador propio, no una rama del emit: así el editor los enseña con los demás. Con `propsOf` ausente, **ninguno** | `compiler` | `src/semantic/analyzers/prop-channel.ts` *(nuevo)* · [src/semantic/analyze.ts](../../../packages/compiler/src/semantic/analyze.ts) · [SDD-12](../SDD-12-semantica.md) *(reserva)* |
| [ ] | 15 | 9 | **La celda muere con la página.** El router de SDD-20 llama a `cells.clear()` en cada navegación. Sin esto una SPA acumula una celda por instancia y por ruta visitada, y la segunda visita a la misma ruta arrancaría con el estado de la primera — que es una fuga *y* un bug de corrección | `core` · `transport` | [src/hydrate/install.ts](../../../packages/core/src/hydrate/install.ts) · `packages/transport/src/router/` |
| [ ] | 16 | 3 | **El editor comprueba el objeto donde el build cruza el objeto.** `emitValue` deja de proyectar `(titulo())` cuando `crossing` devuelve `'ref'`: ahí se copia `titulo` tal cual, porque `Signal<T>` es lo que el hijo declara. La regla 6 de BUG-23 §4.2 **no se retira**, se condiciona — y sigue teniendo una sola implementación | `language-core` | [src/template/attrs.ts `emitValue`](../../../packages/language-core/src/template/attrs.ts#L381-L401) · [src/template/context.ts](../../../packages/language-core/src/template/context.ts) |

## Fase 7 — cierre (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 17 | 13, 16 | **La página que lo demuestra.** `signal-prop.fud` se reescribe: el hijo **deriva** (`computed`), lo **reenvía** a un nieto, y un formulario avisa al padre con un callback. Y se corrige su prosa, que hoy explica por qué la signal *no* cruza. Verificada en Chrome real en los tres modos —`pnpm dev`, build sin `sw.json`, build con SW—, como exige SDD-17 | `examples` | [examples/basic/src/routes/signal-prop.fud](../../../examples/basic/src/routes/signal-prop.fud) · `examples/basic/src/components/signal-*.fud` |
| [ ] | 18 | todas | **La documentación, que aquí es contrato.** **Decisión 105** en la gramática, con la 84 reescrita (deja de ser «cruza un valor, siempre» y pasa a «cruza lo que el hijo declara»); **SDD-15 §3.3** (`fud-state` admite marcadores) y **§3.7/§4.3** (el tramo llega resuelto); **SDD-17 §3** (el runtime resuelve antes de entregar) y **§4.4** (la celda vacía como dependencia de hidratación); **SDD-31 §7** de `abierta` a `Hecho`, con el mecanismo; **SDD-12** con `FUD0200`–`FUD0203`; **props-spec** con la tabla de los tres modos de cruce | — | [docs/gramar/gramatica-v1-decisiones.md](../../gramar/gramatica-v1-decisiones.md) · [SDD-15](../SDD-15-emit.md) · [SDD-17](../SDD-17-hidratacion.md) · [SDD-31](../SDD-31-signals-derivadas.md) · [SDD-12](../SDD-12-semantica.md) · [props-spec.md](../props-spec.md) |
| [ ] | 19 | 18 | **Cierre.** `pnpm typecheck`, `pnpm test` y `pnpm build` verdes en el workspace entero. `@fudic/core` al **100 %** en las cuatro métricas; `compiler` y `ssr` no bajan. Los 22 criterios de §6 verdes, y las cuatro aserciones de la tarea 1 —las que se vieron fallar— en verde. BUG-24 a `Hecho` en [INDEX.md](./INDEX.md), tabla y grafo | — | [INDEX.md](./INDEX.md) · [BUG-24](./BUG-24-signal-y-callback-no-cruzan.md) |

---

## Ficheros existentes que se tocan, y por qué

| fichero | qué cambia | por qué |
|---|---|---|
| [core/src/hydrate/cascade.ts](../../../packages/core/src/hydrate/cascade.ts) | `attachAll` entrega el tramo **resuelto**; la celda vacía hidrata al dueño | es la línea donde el estado pasa del payload al componente: el único sitio donde una identidad puede hacerse única |
| [core/src/hydrate/maps.ts](../../../packages/core/src/hydrate/maps.ts) | `slice` la consume también el registro de celdas | el valor inicial de una celda sale del tramo de su dueño |
| [ssr/src/ssr-dom.ts](../../../packages/ssr/src/ssr-dom.ts) | `state(shadow, values, cells)` | una signal compartida deja de ser local: se serializa en el tramo del dueño |
| [compiler/src/emit/oxc-code.ts](../../../packages/compiler/src/emit/oxc-code.ts) | `Prop.channel` | lo que decide el modo de cruce es lo que declara el hijo, y el `Signal<T>` está en `T` |
| [compiler/src/binding/crossing.ts](../../../packages/compiler/src/binding/crossing.ts) | `'ref'` pasa a emitirse | BUG-23 dejó el tipo con su segundo caso muerto; aquí se enciende |
| [compiler/src/emit/attrs.ts](../../../packages/compiler/src/emit/attrs.ts) | `crossingExpr` cruza el nombre desnudo en `'ref'`; el marcador al payload | es el único punto por el que pasa un valor hacia un hijo |
| [compiler/src/emit/client.ts](../../../packages/compiler/src/emit/client.ts) | el dueño recibe la celda; la prop reactiva entra en `signals`; se retira el `$sub → u` | la reactividad del hijo no es una regla nueva: es la que ya existe, aplicada a un nombre más |
| [compiler/src/emit/markup.ts](../../../packages/compiler/src/emit/markup.ts) | el servidor pasa el objeto y serializa el marcador | en el servidor no hay cable: el hijo es una llamada a función en el mismo proceso |
| [language-core/src/template/attrs.ts](../../../packages/language-core/src/template/attrs.ts) | `emitValue` no lee cuando el cruce es `'ref'` | editor y build tienen que mirar la misma expresión — el invariante que BUG-23 §5 estrenó |
| [examples/basic/src/routes/signal-prop.fud](../../../examples/basic/src/routes/signal-prop.fud) | la página y su prosa | hoy documenta la limitación como si fuera el diseño |
