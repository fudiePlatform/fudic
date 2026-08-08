# SDD-15 — Tareas · Event bindings, `Dom.event`/`Dom.bus` y el bus

> **SDD:** [SDD-15 — Emit (AST → runtime)](./SDD-15-emit.md)
> **Paquetes:** `@fudic/dom` (contrato + `browserDom`) · `@fudic/ssr` (`SsrDom`) ·
> `@fudic/compiler` (emit)
> **Rama:** `sdd-15-eventos-y-bus`
> **Progreso:** 4 / 22
> **Va DESPUÉS de:** [SDD-30 — Renders de bloque](./SDD-30-renders-de-bloque.md)
> ([tareas](./SDD-30-Task.md)). No es una preferencia de orden: ver *Por qué va detrás* abajo.

Segunda tanda de la rama de cliente de SDD-15. La primera
([`SDD-15-Task-fudic-element-y-emit-de-cliente.md`](./SDD-15-Task-fudic-element-y-emit-de-cliente.md),
22/22) dejó el factory completo salvo por una línea:

```js
const s = () => {};
```

Esa línea es toda esta tanda. `s()` es el punto donde create e hydrate convergen (§4.3), y
hoy no engancha nada porque no había con qué: `Dom.event` y `Dom.bus` (§3.8) **no existen en
ningún paquete** —tres documentos refundidos los daban por escritos y ninguno los escribió—,
y [`attrs.ts`](../../packages/compiler/src/emit/attrs.ts) descarta a propósito los bindings de
evento, bus, propiedad y ref con un comentario que dice exactamente por qué: son enganche, y
el enganche es del controlador.

El resultado observable hoy: `fixtures/app-button.fud` escribe `@click="@onClick"`, el
componente compila, el chunk se emite, y el botón no responde a un click. Al cerrar esta
tanda, responde.

Cada tarea es un paso cerrado: se implementa, se verifica y se marca. Ninguna depende de
tareas posteriores.

---

## Los tres hitos

**Hito A — el host sale del adapter.** Es el hueco que el SDD deja abierto sin darse cuenta:
§4.4 emite `$dom.bus($host, …)` y reescribe `emit('x', d)` a `emit.call($host, 'x', d)`, pero
`FudicElement.h/c` pasa `this.shadowRoot` y **nunca `this`**, así que no había ningún `$host` de
donde sacarlo. `Dom<N>` gana `host(shadow)`, y el factory materializa
`const $host = $dom.host($shadow);` **solo cuando el componente lo usa**.

Se descartó pasarlo por posición en `$props` (`[$dom, $shadow, $host, …]`) porque el shadow ya
lo lleva encima: `shadow.host` en el navegador, y en el árbol de SSR el enlace inverso ya existe
—`attachShadow` deja `shadow.parent = h`—, así que las dos implementaciones son una línea y
ninguna estructura cambia. Ampliar `$props` habría movido el destructuring horneado, los tres
goldens de cliente, `FudicElement` y el arnés de hidratación para no ganar nada: una posición
más en un contrato cuyo valor es ser el simétrico exacto de `Object.values` (§4.1/§4.2).

**Hito B — un event binding es una invocación.** §4.5, reescrita el 2026-08-06 (decisiones de
gramática 96–98). Lo que va a la derecha del `=` se llama **en el disparo**, con `$event` como
evento nativo y los datos que se escriban:

```razor
@click="@del($event, item.id)"      <!-- function del(ev, id) {…} -->
```

El handler se declara **plano**, como en Angular y en Vue. La forma *factory* que la versión
anterior de la spec derivaba de la decisión 26 —una `CallExpression` invocada **al suscribir**,
con handler curried `const del = (id) => (e) => {…}`— **se retira**: ahorraba un frame por
disparo a cambio de una sintaxis que ningún framework usa y que el developer paga en cada línea.
La referencia desnuda (`@click="@toggle"`) sigue valiendo y sigue siendo la de un solo frame.

**Hito C — el bus engancha, y `emit` recibe su host.** `bus:evt` desugariza en `s()` a un
listener sobre `document` con el host como contexto, y se da de baja en `r()` —un `bus:` sin
baja es una fuga: el listener vive en `document` y sobrevive al host—. Y `emit(name, detail)`
del cuerpo de `@client` se reescribe a `emit.call($host, name, detail)`, que es lo que hace que
la firma que el developer importa siga siendo honesta (`(name, detail?)`, sin host).

**Fuera de esta tanda**, y por una frontera de una sola frase — *esta tanda emite enganche; la
siguiente compone mapas*:

- §3.1 `data-id` y §3.3–§3.6 los cuatro mapas JSON, **`fud-bus` incluido**. Emitir el listener
  de `bus:` no necesita saber quién emite ese canal: el nombre se evalúa donde se suscribe. La
  relación `tag emisor → [tags receptores]` es un hecho de **página**, y sale de la pasada única
  de §3.2 junto a los otros cuatro artefactos.
- §4.7, la validación del prefijo `$` (`FUD0290`). Sigue fuera, y ahora **pesa más**: esta tanda
  mete `$host` en el mismo scope léxico donde se copia el cuerpo de `@client`. Un usuario que
  declare `const $host = …` hoy rompe su componente en silencio. Es la primera candidata para la
  tanda siguiente.
- Reactividad fina de signals (`s()` con suscripciones, no solo listeners) y todo SDD-17.

---

## Por qué va detrás de SDD-30

La primera versión de este documento llevaba una tarea 12 que era un parche, y la revisión con
Pedro la eliminó de raíz. Queda anotado el razonamiento porque explica el orden y porque el
parche era plausible:

§4.6 dibuja `s` como una closure única que lee las variables `$nX` con un guard (`$n2 && …`).
Eso es correcto fuera de un bucle —incluido dentro de un `@if`, que es justo lo que el guard
existe para cubrir—. Dentro de un `@foreach` no lo es: **la variable de nodo se reasigna en cada
iteración** y al salir solo sobrevive la última, así que una `s()` posterior engancharía N veces
sobre la última fila. El criterio §6.17 falla por construcción. Está comprobado sobre el emit
real, no razonado: `h()` de un `@foreach` con dos botones por fila reasigna `$n1`…`$n5` cada
vuelta y llama a `$s()` **después** del bucle.

El parche era emitir el enganche inline dentro del bucle, en los dos cuerpos. Habría funcionado
y se tira entero en cuanto los bloques sean funciones — y además no arreglaba lo que ya está
roto sin eventos: `r()` anula una referencia por variable, de modo que las N−1 filas anteriores
nunca se limpian.

**[SDD-30](./SDD-30-renders-de-bloque.md) convierte cada bloque en una función con sus nodos, su
`$d` y su `s()` propios.** Con eso, un `@click` dentro de un `@foreach` es un `$dom.event` en el
`s()` de la fila, sin ningún caso especial y sin nada que anotar. Por eso esta tanda va detrás:
no por comodidad, sino porque delante escribiría código para tirarlo.

## Lo que hay que decidir antes de escribir código

Dos puntos que el SDD no cierra. El primero se resuelve aquí, en su tarea; el segundo solo se
anota.

**1. `document` u `ownerDocument`.** §4.4 dice «el listener va sobre `document`». La
implementación de `browserDom.bus` usa `host.ownerDocument ?? document`: es el mismo nodo en
cualquier página real, y es el único que existe cuando el host vive en un documento que no es el
global —el arnés de tests, y cualquier render fuera del documento principal—. La semántica que el
SDD fija (ancestro común garantizado de la página) se conserva entera.

**2. SDD-12 §8.4 dice que el mapa de bus está fuera de v1**, mientras SDD-15 §3.5 y §4.4 lo dan
por resuelto en el `SemanticModel` —que hoy está literalmente vacío (`{ _empty?: never }`)—. No
bloquea esta tanda porque el mapa no se toca aquí. **Hay que reconciliar los dos SDD antes de
abrir la tanda de mapas de página**, y decidir en cuál vive la resolución estática del nombre
(decisión 28.c: literal, `const` local, `as const` importado — este último necesita el grafo de
módulos, que el `SemanticModel` de un fichero no tiene).

---

## Fase 1 — El host sale del adapter (4)

- [x] **1. `host(shadow)` en el contrato y en `browserDom`.**
      Modificar `packages/dom/src/dom.ts` y `browser.ts`: `host(shadow: N): N` va en **`Dom<N>`**
      —no en `DomClient<N>`— porque el factory que lo llama es el mismo que corre contra el
      adapter de servidor (§6.14), y una llamada que solo existiera en el cliente rompería esa
      ejecución. En el navegador es `(shadow as ShadowRoot).host`.
- [x] **2. `SsrDom.host`.**
      Modificar `packages/ssr/src/ssr-dom.ts`: el enlace inverso **ya existe** —`attachShadow`
      deja `shadow.parent = h` (`tree.ts`)—, así que es devolver ese padre. No hay que tocar
      `SsrNodeImpl`: es exactamente la comprobación que hace que este hito no cueste nada.
- [x] **3. El factory lo materializa solo si lo usa.**
      En `packages/compiler/src/emit/client.ts`: cuando el componente tiene algún `bus:` o alguna
      llamada a `emit` reescrita, emitir `const $host = $dom.host($shadow);` en la cabecera de la
      closure y añadir `$host` a lo que `r()` anula. Cuando no, **no se emite nada**: el chunk de
      un componente sin bus no paga una línea por una referencia que nadie lee, y §3.7 sostiene
      el INP sobre chunks de menos de 1 kB tras minify+brotli. Es información que el emisor de
      markup ya tiene al terminar su pasada; no hace falta un análisis aparte.
- [x] **4. Tests y goldens.**
      `@fudic/dom` y `@fudic/ssr` siguen al 100 %: `host()` de vuelta al host en los dos
      adapters. Los tres `__golden__/*.client.mjs` actuales **no deben cambiar** —ninguno de los
      tres fixtures usa el bus todavía—: un golden que se mueva aquí es la señal de que la
      materialización no está condicionada como dice la tarea 3. `FudicElement`, el arnés de
      hidratación y `render($dom, $shadow, props)` de la rama de servidor no se tocan.

## Fase 2 — `Dom.event` y `Dom.bus` (§3.8) (4)

- [ ] **5. Los dos métodos en el contrato.**
      Modificar `packages/dom/src/dom.ts`: `event(node, type, cb): () => void` y `bus(host,
      name, cb): () => void` van en **`Dom<N>`**, no en `DomClient<N>`. Es lo que permite que el
      mismo factory corra contra los dos adapters (§3.8): el servidor fabrica y monta, y el
      enganche simplemente no hace nada. Documentar en el fichero la desviación consciente
      respecto al documento refundido `SDD-eventos-captura-contexto`, donde `event` era una
      función libre importada: como método del adapter no ata el código emitido al navegador y
      no obliga a un segundo emit para el SSR.
- [ ] **6. `browserDom`.**
      Modificar `packages/dom/src/browser.ts`: `event` es `addEventListener` y devuelve el
      `removeEventListener` con la **referencia idéntica** —no envuelve `cb`, no reordena
      argumentos: cualquier envoltorio añadiría el frame que §4.5 existe para no pagar—. `bus`
      suscribe sobre `host.ownerDocument ?? document` (punto 2 de arriba) y devuelve su baja.
- [ ] **7. `SsrDom` no-op.**
      Modificar `packages/ssr/src/ssr-dom.ts`: ambos métodos no hacen nada y devuelven un
      disposer no-op **compartido** (una constante del módulo, no una función nueva por llamada:
      un disposer que nadie distingue no necesita identidad). El criterio §6.14 exige además que
      no aparezcan en la salida: no tocan el árbol, luego `renderToString` no los ve.
- [ ] **8. Tests y cobertura de los dos paquetes.**
      `@fudic/dom` y `@fudic/ssr` están al 100 % en las cuatro métricas y siguen estándolo: el
      disposer no-op de SSR **hay que invocarlo** en su test —en producción no lo llama nadie, y
      esa es exactamente la rama que el 100 % obliga a escribir—. En `browserDom`: que la baja
      retire el listener, que `bus` enganche en el documento del host y no en el host, y que dos
      suscripciones al mismo tipo den dos bajas independientes.

## Fase 3 — Los event bindings en `s()` (§4.5) (4)

- [ ] **9. El valor del binding entra en el batch de Oxc.**
      Ampliar `extractCode` (`packages/compiler/src/emit/oxc-code.ts`) para registrar también,
      como fragmentos `expression`, el valor de cada `EventBinding` y `BusBinding` del template
      —un recorrido del árbol que los recoja antes de `batch.parse()`—. **Regla de oro: Oxc se
      invoca exactamente una vez por fichero**, así que no se abre un `JsBatch` nuevo: se añaden
      al que ya existe. Lo que la extracción devuelve es un mapa del `Span` del valor a **el
      tipo del nodo raíz** (`node.type`), que es lo único que la tabla de §4.5 necesita: el
      compilador no interpreta la semántica del fragmento, solo mira su forma.
- [ ] **10. La tabla de formas.**
      Nuevo `packages/compiler/src/emit/events.ts`: dado el tipo de nodo raíz y el texto del
      valor, devuelve la expresión que se suscribe.
      | Nodo raíz | Emitido | Frames |
      |---|---|---|
      | `Identifier` (`@toggle`) | `$dom.event($n, 'click', toggle)` | 1 |
      | `CallExpression` (`@del($event, x)`) | `$dom.event($n, 'click', ($event) => del($event, x))` | 2 |
      | `ArrowFunctionExpression` / `FunctionExpression` | `$dom.event($n, 'click', e => …)` | 2 |
      | cualquier otro | — | `FUD0291` |
      La `CallExpression` se evalúa **en el disparo**, no al suscribir: el emit la envuelve en una
      arrow cuyo parámetro se llama literalmente `$event`, de modo que la sustitución es copiar el
      texto del argumento tal cual. El emit **no reordena** la lista: `@del(item.id, $event)`
      llega como `(id, ev)`.
      Con esto desaparecen dos cosas de la versión anterior: el contrato de usuario que el
      compilador no podía validar («si escribes `@f(x)`, `f` **debe** devolver el listener») y su
      error más probable —escribir `@del(item.id)` esperando que se llame en el click, que era
      justo lo que no hacía—. Ahora hace lo que parece.
- [ ] **11. El tercer cuerpo del emisor de markup de cliente.**
      `ClientMarkupEmitter` (`markup-client.ts`) escribe hoy dos cuerpos en una sola pasada
      —fabricar y adoptar— por la razón que su cabecera explica: calcularlos por separado los
      desalinea. El enganche es el tercero, y entra por la misma puerta. Por cada elemento, tras
      obtener su variable, escribir sus bindings de evento en el cuerpo `hook`, con el guard
      `$nX && …` de §4.6 (un nodo puede no existir: proyección de un `@if`). `attrs.ts` sigue
      sin tocarlos — el reparto atributo/enganche que su cabecera describe no cambia, solo deja
      de tener un lado vacío.
      **Dentro de un bloque, el cuerpo `hook` es el del bloque.** Con SDD-30 hecho, un elemento
      dentro de un `@if`/`@foreach` pertenece a la función de ese bloque, y su enganche va al
      `s()` de esa función, con sus variables de nodo y su `$d`. No hay caso especial que
      escribir: el emisor de bloques ya lleva el enganche donde toca, y el criterio §6.17
      —cada handler recibe el valor de **su** fila, disparando en orden no secuencial— sale del
      scope, no de una regla de este emisor.
- [ ] **12. `FUD0291` y el canal de diagnósticos del emit.**
      `EmitOutput` (`module.ts`) tiene hoy `missingAssets`, un canal de hechos que el plugin de
      Vite eleva a `FUD0363` sin tumbar el build. Añadir junto a él `diagnostics: readonly
      Diagnostic[]` —el `Diagnostic` con span de `types/diagnostic.ts`, `errorDiag`— y emitir
      ahí `FUD0291` con el span del valor. **El emit no lanza** (§5): un binding no suscribible
      no aborta la página, se omite su enganche y el resto se emite. El canal es genérico a
      propósito: `FUD0290`, `FUD0292` y `FUD0293` entran por él sin volver a tocar la firma.

## Fase 4 — El bus (§4.4) (4)

- [ ] **13. `bus:` desugariza a `document`, con el host como contexto.**
      En el cuerpo `hook`, un `BusBinding` produce:
      ```js
      $d.push($dom.bus($host, 'carrito', ($event) => onCarrito.call($host, $event)));
      ```
      El listener va sobre el documento —lo resuelve `browserDom.bus`, no el emitido—, y el
      contexto es el host, para que el handler alcance las signals de **su** instancia. El
      hallazgo estructural que lo obliga: emisor y suscriptor son **hermanos**, no padre/hijo, y
      un `CustomEvent` que burbujea desde el emisor sube por *sus* ancestros y no entra nunca en
      el suscriptor. Un listener sobre el host no dispararía jamás.
- [ ] **14. El nombre del canal: literal o expresión, sin resolución estática.**
      `bus:carrito` emite el string; `bus:(EVENTOS.carrito)` emite la expresión, evaluada en
      `s()` donde se suscribe. Las dos producen un listener que funciona. La **resolución
      estática** del nombre (decisión 28.c) no se hace aquí porque lo único que decide es quién
      entra en `fud-bus`, y `fud-bus` es de página: §6.21 y §6.22 se cierran en la tanda
      siguiente. Lo que sí se verifica aquí es la mitad de §6.22 que sí es de esta tanda: un
      nombre no resoluble **no es error** y **sigue emitiendo el listener** — postura permisiva,
      no protegemos lo que no podemos ver.
- [ ] **15. `emit(…)` recibe su host.**
      Reescribir, en el cuerpo copiado de `@code { @client }`, cada `CallExpression` cuyo callee
      sea el binding local de `emit` importado de `@fudic/dom`, a `emit.call($host, …)`. Tres
      cosas que hacen que esto no sea un `replace` de texto:
      - el binding local se lee del `ImportDeclaration` (`import { emit as fire }` es legal, y
        entonces lo que se reescribe es `fire`); sin ese import no se reescribe nada;
      - los parches se aplican **por span de nodo Oxc**, en orden descendente de offset, sobre
        el slice del cuerpo — nunca por expresión regular sobre el texto;
      - `host.dispatchEvent(...)` crudo se deja intacto: sigue siendo DOM válido y **no
        participa** en hidratación dirigida, que es justo la distinción que `emit` compra.
      El developer nunca ve el host: exponerlo en la firma filtraría un asunto del compilador al
      código de usuario, y por eso el tipo exportado en `@fudic/dom` miente por omisión a
      propósito.
      **Por qué el host es una elección segura y no una decisión de diseño delicada:** `emit`
      fuerza `composed: true`, y un evento composed se **retargetea al host** en cuanto sale del
      shadow. Da igual desde qué nodo interno se despache —un `<button>` de dentro serviría—
      porque lo que el suscriptor ve como `e.target` es el host de todas formas. El host es
      simplemente el nodo que el controlador ya tiene a mano y el que no depende de dónde esté
      escrito el binding.
- [ ] **16. Teardown (§6.13).**
      `r()` recorre `$d` y anula referencias; con eventos, eso pasa a ser comprobable: tras
      `r()`, el nodo no responde al evento **y** el listener de `bus:` deja de recibir. El
      segundo es el que importa —el de `document` sobrevive al host si nadie lo retira— y es el
      test que faltaba por no haber nada que dar de baja.

## Fase 5 — Fixtures, goldens y equivalencia (5)

- [ ] **17. El fixture que ejercita los cuatro casos.**
      `fixtures/app-button.fud` ya escribe `@click="@onClick"` (referencia desnuda) y su handler
      se busca el host a mano con `closest('app-button')` para lanzar un `CustomEvent` — que es
      literalmente lo que `emit` existe para no tener que escribir. Pasarlo a `emit('press')` y
      quedarse ahí: ese fixture cubre la referencia desnuda + `emit`. Para el resto hace falta un
      fixture nuevo con `@foreach` (con su `key`, SDD-30) y los cuatro casos de §4.5 —`@del()`,
      `@del($event)`, `@del(item.id)`, `@del($event, item.id)`— más un `bus:` y **un handler
      declarado plano en los cuatro**, que es lo que el fixture tiene que demostrar. Enlazarlo
      desde `home.fud` para que entre en el hito de cierre §6.28.
- [ ] **18. Goldens.**
      Regenerar los `.client.mjs` y añadir el del fixture nuevo. Byte a byte, como los de
      servidor: es lo que hace que un refactor del codegen falle en voz alta en vez de derivar
      en silencio. Comprobar de paso que los goldens **de servidor** no cambian salvo por el
      fixture nuevo — el enganche no existe en SSR, y si aparece en un `.mjs` de servidor es que
      algo se emitió en la rama equivocada.
- [ ] **19. Criterios §6.15, §6.16 y §6.17 en el arnés.**
      Nuevo `test/emit/hydrate/events.test.ts`, sobre el DOM real que el arnés ya monta:
      `$event` es el evento nativo (`type`, `isTrusted`, `preventDefault()` surte efecto); los
      **cuatro casos** llegan al cuerpo como `()`, `(ev)`, `(id)` y `(ev, id)` con la función
      declarada plana; y en un `@foreach` de N filas cada handler recibe el valor de su fila,
      disparando en orden no secuencial.
- [ ] **20. Criterios §6.18, §6.19, §6.20 y §6.20.b.**
      §6.18 —el orden de los argumentos es el escrito— con `@del(item.id, $event)` llegando como
      `(id, ev)`: es lo que impide que alguien meta una convención de reordenamiento implícito.
      §6.19 —la invocación ocurre **en el disparo**, no al suscribir— con un contador dentro de
      `del` que sigue a cero tras montar y sube una vez por click; es el criterio que separa
      esta regla de la forma factory retirada, que hacía lo contrario. §6.20 —la distinción por
      AST— sobre el **texto emitido**, más el caso `FUD0291`. §6.20.b —`$event` fuera de un
      event binding no se sustituye—, que es lo que mantiene honesta la reserva `$`.
- [ ] **21. §6.7 y §6.14 siguen verdes con enganche.**
      Los dos criterios que la tanda anterior cerró vuelven a comprobarse ahora que `s()` hace
      trabajo: `c()` y `h()` producen el mismo listener funcional difiriendo solo en cómo
      obtienen las referencias (§6.7, la convergencia en `s` deja de ser una afirmación sobre una
      función vacía), y el HTML que la rama SSR serializa sigue siendo byte-idéntico al que `h`
      adopta sin mover un nodo (§6.14, con `$dom.event`/`$dom.bus` no-op y ausentes de la
      salida).

## Fase 6 — Cierre (1)

- [ ] **22. Verde y cobertura.**
      `pnpm typecheck`, `pnpm test` y `pnpm build` en la raíz —los ejemplos se construyen
      después de los paquetes: si `examples/basic` se rompe, el build falla—. `@fudic/dom` y
      `@fudic/ssr` al **100 %** en las cuatro métricas, y `events.ts` nace al
      100 %: la deuda heredada de `@fudic/compiler` no rebaja el listón de lo nuevo. Nada de
      `/* v8 ignore */` para llegar al número. Anotar el avance en
      [INDEX.md](./INDEX.md) (registro de progreso); SDD-15 **no** pasa a `Hecho` aquí: quedan
      `data-id`, los cuatro mapas de página y `FUD0290`.

---

## Enlaces

- Criterios de aceptación cubiertos: §6.13, §6.15–§6.20, §6.20.b, §6.23, §6.24 y la mitad de
  §6.22 que no es de página, de
  [SDD-15](./SDD-15-emit.md#6-criterios-de-aceptación). Se revalidan §6.7 y §6.14.
  El antiguo §6.18 —conteo de frames, no medible de forma determinista con `new Error().stack`—
  desapareció al reescribirse §4.5: con la forma factory retirada ya no hay dos formas cuyo
  coste comparar, y el criterio 18 es ahora el orden de los argumentos.
- Criterios que esta tanda **deja abiertos** y por qué: §6.21 y la otra mitad de §6.22
  (`fud-bus` es de página), §6.1–§6.6 y §6.25–§6.27 (mapas de página), §6.28 (necesita SDD-17
  instalado).
- Tanda anterior: [`SDD-15-Task-fudic-element-y-emit-de-cliente.md`](./SDD-15-Task-fudic-element-y-emit-de-cliente.md).
