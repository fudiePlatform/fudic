# BUG-19 — Tres de los cinco constructos no existen en la rama de servidor

> **Estado:** `Listo` — causa raíz confirmada sobre el código, con fichero y línea
> **Corrige:** [SDD-15 §4.1](../SDD-15-emit.md) (el slice SSR del emit, marcado `Hecho`) ·
> [SDD-30 §6.17](../SDD-30-renders-de-bloque.md) (la equivalencia `c` ↔ `h` con bloques, que
> hoy solo se comprueba con dos de los cinco)
> **Paquetes:** `@fudic/compiler` (`emit/markup.ts`, y un helper que sube a `emit/constructs.ts`)
> **Rama sugerida:** `fix/bug-19-servidor-tres-constructos`
> **Depende de:** nada en curso. [SDD-30](../SDD-30-renders-de-bloque.md) está `Hecho` y es lo que
> deja el vocabulario compartido (`constructs.ts`, `marker.ts`) que la corrección reutiliza — no es
> una espera, es lo que la abarata (§2.5)
> **Va en paralelo a:** [SDD-31](../SDD-31-signals-derivadas.md),
> [BUG-18](./BUG-18-update-denso.md) y
> [SDD-15-Task-eventos-y-bus](../SDD-15-Task-eventos-y-bus.md). **No comparte un solo fichero con
> ninguna de las tres** (§2.5)
> **Reserva:** ningún código `FUD` nuevo (§3.3)

---

## 1. Contexto y síntoma

El parser produce cinco constructos de control (SDD-06): `@if`, `@switch`, `@foreach`, `@for` y
`@while`. La rama de **cliente** los emite los cinco —SDD-30 los convirtió en funciones con sus
nodos, su `u`, su `move` y su teardown—. La rama de **servidor** pinta **dos**:

```razor
<ul>@while (cur !== null) key (cur.id) { <li>@cur.label</li> }</ul>
```

```js
// lo que el servidor emite para ese <ul>:
const $n0 = $dom.element("ul");
$dom.append($n1, $n0);
```

Nada. El `<ul>` sale vacío, sin markup, **sin diagnóstico y sin traza**: el HTML no lleva un hueco
que alguien pueda ver, lleva un elemento correcto al que le falta todo dentro. Lo mismo con
`@switch` y con `@for`.

**Tres cosas hacen que esto no sea una laguna cosmética:**

- **Los dos árboles dejan de ser el mismo árbol.** El cliente fabrica el bloque completo —el
  `@while` compila a un `$bN` con su registro `$kN`, su reconciliación y su `s()`—, así que `h()`
  sale a adoptar nodos que el servidor nunca pintó. La hidratación no falla en voz alta: adopta lo
  que encuentra, el cursor se desalinea, y a partir de ahí las variables de nodo del nivel apuntan a
  quien no es. Es exactamente el invariante que SDD-15 §6.14 y SDD-30 §6.17 existen para sostener.
- **Todo lo demás del compilador sí ve esos cuerpos.** El análisis semántico desciende por los cinco
  ([`semantic/walk.ts:80-92`](../../../packages/compiler/src/semantic/walk.ts#L80-L92)), la recogida
  de layout también ([`layout/collect.ts:109-118`](../../../packages/compiler/src/layout/collect.ts#L109-L118)),
  el emisor de cliente también, el formateador y `language-core` también. El servidor es **el único
  sitio** donde el cuerpo de un `@switch` no existe, y por eso el autor recibe los diagnósticos de
  su interior con normalidad —y ni un aviso de que no se va a pintar—.
- **Nada lo prueba, y por eso ha sobrevivido.** El arnés de equivalencia
  ([`hydrate/block-equivalence.test.ts`](../../../packages/compiler/test/emit/hydrate/block-equivalence.test.ts))
  cubre `@if` y `@foreach`; ninguna fixture usa los otros tres —`block.test.ts` los ejercita, pero
  **solo contra el chunk de cliente**—. Los tests miran donde la implementación mira.

**Es anterior a SDD-30** y no entraba en su alcance, que era la rama de cliente. Lo que aquella
tanda cambia es la magnitud: antes los cinco constructos estaban aplanados en línea y el defecto era
«falta markup»; ahora el cliente construye para tres de ellos un bloque con estado, `u` propio y
teardown por instancia, contra un servidor que para esos mismos tres no pinta nada.

---

## 2. Causa raíz

### 2.1. Un `default:` que dice «constructos sin markup de servidor» y no es verdad

`MarkupEmitter.#emit` despacha por discriminante y tiene exactamente dos casos de control:

```ts
// packages/compiler/src/emit/markup.ts:120-146
switch (node.type) {
  case 'element':        …
  case 'if':             this.#if(asIf(node), parent); return;
  case 'foreach':        this.#foreach(asForeach(node), parent); return;
  case 'render-body':    …
  case 'render-section': …
  default:
    return; // comments, @code, and constructs with no server markup
}
```

La causa raíz es esa última línea
([`markup.ts:143-145`](../../../packages/compiler/src/emit/markup.ts#L143-L145)): un `default` que
**absorbe en silencio** tres nodos que sí tienen markup de servidor, y un comentario que los declara
sin markup, con lo que el defecto queda escrito en el fichero **con forma de decisión**. La cabecera
del módulo dice lo mismo un poco más arriba —*«Control-flow nodes (`@if`/`@foreach`)…»*
([`markup.ts:8-11`](../../../packages/compiler/src/emit/markup.ts#L8-L11))— y solo existen dos casts
de recuperación, `asIf` y `asForeach`
([`markup.ts:35-36`](../../../packages/compiler/src/emit/markup.ts#L35-L36)).

Es el mismo mecanismo que [BUG-14 §5](./BUG-14-texto-literal-no-sobrevive.md) diagnosticó para
`at-escape` —*«fue descartado en silencio de todas las salidas porque nada en el emit lo leía, y
nada en ninguna parte se quejó»*— y cuya conclusión fue una **tabla total** sobre
`HtmlContent['type']` ([`runs.ts:57-86`](../../../packages/compiler/src/emit/runs.ts#L57-L86)),
justo para que el siguiente tipo de nodo no pudiera colarse. El `#emit` del servidor es esa misma
laguna, en el fichero de al lado, y la corrección tiene que cerrar la **clase**, no las tres
instancias.

### 2.2. La rama de cliente no comparte este código, y por eso divergió sin avisar

El emisor de cliente no tiene la lista de dos: pregunta `isControlNode(item.node)`
([`markup-client.ts:41,46,389`](../../../packages/compiler/src/emit/markup-client.ts#L389)) sobre el
conjunto cerrado que declara `marker.ts`
([`marker.ts:29`](../../../packages/compiler/src/emit/marker.ts#L29) — los cinco), y entrega el nodo
al `BlockEmitter`, que trabaja con `branchesOf`/`isLoop` de `constructs.ts` y por tanto no distingue
entre constructos. **Las dos ramas ya no deciden lo mismo con el mismo vocabulario:** una pregunta
«¿es un constructo?» y la otra enumera dos nombres.

Ese vocabulario compartido existe desde SDD-30 y está a mano: `branchesOf`, `isLoop` y el conjunto
`CONTROL_TYPES`. Lo único que el servidor necesita y hoy no está compartido es cómo se parte la
cabecera de un bucle, que vive privado en el emisor de cliente
([`block.ts:460-463`](../../../packages/compiler/src/emit/block.ts#L460-L463)).

### 2.3. Alcance: dos consecuencias más que salen del mismo paseo que no ocurre

El cuerpo de esos tres constructos no se recorre, así que **nadie de los que dependen del paseo lo
ve**:

- **Los imports del módulo de servidor.** `MarkupEmitter.#used` solo se llena en `#element`
  ([`markup.ts:163`](../../../packages/compiler/src/emit/markup.ts#L163)), y es lo que
  `buildComponentModule` recorre para emitir los `import { render as … }`
  ([`module.ts:154`](../../../packages/compiler/src/emit/module.ts#L154)). Un `<app-x>` que solo
  aparezca dentro de un `@switch` no aporta su import. Hoy es coherente —tampoco se emite la llamada—
  y por eso no revienta; en cuanto el cuerpo se emita, el import tiene que aparecer con él.
- **El enlazado de assets y `FUD0363`.** `writeElementAttrs` es quien registra los assets en el
  `AssetLinker` ([`markup.ts:212-215`](../../../packages/compiler/src/emit/markup.ts#L212-L215)). Un
  `<img src="./falta.png">` dentro de un `@while` **no se enlaza y no se reporta como ausente** en la
  rama de servidor, mientras que la de cliente sí lo hace: dos ramas con distinta lista de assets
  para el mismo fichero.

Ninguna de las dos es un bug aparte: son la misma causa vista desde otro consumidor, y se cierran
con el mismo paseo. Van con criterio propio (§6.8, §6.9) porque son lo que hay que **comprobar** al
arreglar, no lo que hay que arreglar aparte.

### 2.4. Lo que NO es la causa

- **No es el parser.** Los cinco nodos llegan completos, con cabecera, cuerpo y `key`.
- **No es el marcador de §3.4.** `markerSite` ya cuenta los cinco como constructos y lo hace desde
  un módulo que las dos ramas comparten
  ([`marker.ts`](../../../packages/compiler/src/emit/marker.ts)) — precisamente el patrón que este
  BUG extiende al despacho.
- **No es la `key`.** El servidor pinta una vez; la identidad de fila es del cliente. La `key` no
  entra en esta corrección más que para decir que **no se evalúa** (§4.4).

### 2.5. Relación con las tres tandas en curso: ninguna lo bloquea, y él no bloquea a ninguna

Es la pregunta que abrió este documento, y la respuesta se sostiene sobre los ficheros:

| Tanda | Ficheros que toca | Contacto con este BUG |
|---|---|---|
| [SDD-31](../SDD-31-signals-derivadas.md) — signals derivadas | `@fudic/core` (`computed.ts`, `effect.ts`, `index.ts`) · `emit/oxc-code.ts` · `emit/module.ts:172` | **Ninguno.** Ni un fichero en común: este BUG vive en `emit/markup.ts`. |
| [BUG-18](./BUG-18-update-denso.md) — update disperso | `emit/client.ts` · `emit/markup-client.ts` · comentarios de `@fudic/core` | **Ninguno.** Son las dos mitades del emit —él la de cliente, este la de servidor— y no se cruzan. |
| [SDD-15-Task-eventos-y-bus](../SDD-15-Task-eventos-y-bus.md) (en curso) | `@fudic/dom` · `@fudic/ssr` · `emit/oxc-code.ts` · `emit/events.ts` (nuevo) · `emit/markup-client.ts` · `emit/client.ts` · `emit/module.ts` · fixtures y goldens | **Ninguno en el código.** El único roce posible sería el directorio de goldens, y este BUG **no añade fixtures** (§7), justo para no tenerlo. |

Y hay una coincidencia que conviene decir en positivo, porque hace que las cuatro puedan convivir
sin pisarse el oráculo: **las cuatro dejan los `__golden__/*.mjs` de servidor byte a byte idénticos**
—SDD-31 §6.14 y BUG-18 §6.13 lo declaran, y este BUG lo cumple porque ninguna fixture usa los tres
constructos (§6.10)—. Un `.mjs` de servidor que se mueva mientras las cuatro están en vuelo señala
inequívocamente a este BUG, y solo a este.

**Lo que sí conviene ordenar, y no es bloqueo:** si alguna de las tres tandas acabara añadiendo una
fixture con `@switch`, `@for` o `@while`, ese golden nacería con el hueco. Ninguna lo prevé —la
fixture nueva de la tanda de eventos usa `@foreach` (tarea 17)—, pero es la única forma en que se
tocarían, y por eso queda escrito aquí en vez de descubrirse en un conflicto.

---

## 3. Interfaz pública

### 3.1. No cambia ninguna firma

`MarkupEmitter` conserva su constructor, su `emitChildren` y su `used`. Los tres constructos entran
por métodos privados, exactamente como `#if` y `#foreach`. `module.ts`, `layout.ts` y `parts.ts` no
se enteran.

### 3.2. Un helper sube de `block.ts` a `constructs.ts`

```ts
// packages/compiler/src/emit/constructs.ts
/** `for (…)` / `while (…)` — the author's header, spliced whole (decision 93). */
export function loopHead(node: LoopNode, source: string): string;
```

Hoy es un método privado del emisor de cliente
([`block.ts:460`](../../../packages/compiler/src/emit/block.ts#L460)). Que las dos ramas partan la
cabecera con **la misma función** no es higiene: es la única forma de que un `@for` con un `;` raro
o un `@while` con un operador de coma no puedan compilar distinto a cada lado. Es el mismo argumento
por el que `marker.ts` es un módulo y no un método (SDD-30 §3.4).

### 3.3. Sin códigos `FUD` nuevos

No hay nada que diagnosticar: los tres constructos son legales, están parseados y están
diagnosticados semánticamente. Lo que faltaba era emitirlos. Mismo caso que BUG-16, BUG-17 y BUG-18.

---

## 4. Comportamiento corregido

### 4.1. El despacho deja de tener un `default` que traga nodos

La regla, y es la que cierra la clase en vez de las tres instancias:

> **Un tipo de nodo nuevo no puede desaparecer sin que alguien lo escriba.**

`#emit` pasa a decidir sobre una **tabla total** de `HtmlContent['type']`, al modo de `ROLE` en
[`runs.ts:57-86`](../../../packages/compiler/src/emit/runs.ts#L57-L86): cada tipo dice si el
servidor lo pinta, y el que no lo pinta lo dice **por su nombre y con su motivo**. `comment`,
`razor-comment`, `code`, `section` —la recoge SDD-21 por otra puerta— y `raw-expression` —que espera
a la semántica de escape de SDD-07— siguen sin emitir nada, pero ahora eso está **escrito**, no
heredado de un `default`. Añadir un sexto constructo al AST obliga a decidir, que es justo lo que
BUG-14 §5 pedía y este fichero no llegó a recibir.

### 4.2. `@for` y `@while` son el mismo bucle que `@foreach`

```js
for (let i = 0; i < n; i++) { …cuerpo… }
while (cur !== null)        { …cuerpo… }
```

La cabecera se **empalma entera** desde el fuente (decisión 93), anclada al source map igual que la
de `@foreach` ([`markup.ts:204-210`](../../../packages/compiler/src/emit/markup.ts#L204-L210)). Las
variables de nodo del cuerpo son `const` dentro del bloque del bucle, así que cada vuelta declara las
suyas y no hay nada más que hacer: el servidor construye y serializa, no reconcilia.

### 4.3. `@switch` es un `switch` con una rama por `case`, y sin caída

```js
switch (kind) {
  case 'a': { …cuerpo…; break; }
  case 'b': { …cuerpo…; break; }
  default:  { …cuerpo…; }
}
```

Tres decisiones dentro de esa forma:

- **`break` explícito en cada rama, la última incluida.** La decisión 14 dice que no hay caída, y en
  el AST cada `SwitchCase` tiene su cuerpo independiente. Sin `break` el emitido pintaría dos ramas.
- **Llaves por rama.** El cuerpo declara `const $nN`, y el scope léxico de un `case` sin llaves es
  **todo el `switch`**. Los identificadores son únicos por emisor, así que hoy no colisionarían — las
  llaves están para que no dependa de eso, y porque cada rama es un bloque (SDD-30 §4.1).
- **El orden del fuente se respeta, `default` incluido.** Un `default` escrito en medio se emite en
  medio: la semántica de JS —`default` solo se elige si no casa ningún `case`— es exactamente la que
  el selector del cliente implementa, que también es un `switch`
  ([`block.ts:439-447`](../../../packages/compiler/src/emit/block.ts#L439-L447)). Dos formas
  distintas de escribirlo, la misma elección de rama.

### 4.4. El servidor no evalúa la `key`

La `key` es identidad de fila para la reconciliación del cliente (SDD-30 §3.5). El SSR renderiza una
vez y no reconcilia nada, así que la expresión **no aparece en el emitido de servidor**. No es un
descuido a documentar: es la diferencia entre las dos ramas dicha una vez.

### 4.5. Un `@while` en SSR se ejecuta de verdad

Hoy un `@while` cuya condición no termine nunca no cuelga el prerender, porque no se emite. Después
de esta corrección, sí — igual que un `@for` mal escrito, que ya podía colgarlo. El cambio es de
**silencio a error observable**, y es la dirección correcta; queda escrito porque es la única
consecuencia de esta corrección que un autor puede notar como «antes no pasaba».

### 4.6. Lo que NO cambia

- **La rama de cliente.** No se toca una línea: SDD-30 ya emite los cinco.
- **El marcador de §3.4.** `markerSite` ya contaba los cinco; el comentario ancla se sigue pintando
  donde se pintaba, en las dos ramas.
- **Los goldens.** Ninguna fixture usa los tres constructos, así que ni los `.mjs` de servidor ni los
  `.client.mjs` se mueven (§6.10). Los `$nN` del emisor son un contador por emisión: los cuerpos
  nuevos consumen ids **dentro** de ellos, y las fixtures que no los tienen numeran igual que ayer.
- **La `key` en el editor.** Es [BUG-17](./BUG-17-key-sin-editor.md) y sigue donde estaba.

---

## 5. Invariantes

**Los que el bug violaba**

- ***El HTML que la rama SSR serializa es byte-idéntico al que `h` adopta sin mover un nodo***
  (SDD-15 §6.14, SDD-30 §6.17). Con tres de los cinco constructos es falso, y el arnés no lo veía
  porque solo probaba los otros dos.
- ***Una tabla total no puede dejar fuera al siguiente*** (BUG-14 §5). El `default` de `#emit` es la
  negación de esa frase, y en el fichero de al lado.
- ***Lo que el parser produce, el emit lo consume o lo diagnostica.*** Aquí no hacía ninguna de las
  dos: lo tiraba, y el `Diagnostic` que habría avisado no existe porque el constructo es legal.

**Los que la corrección añade**

- **Las dos ramas deciden qué es un constructo con el mismo vocabulario**, y parten la cabecera de un
  bucle con la misma función. Un constructo que una emite y la otra no deja de ser expresable sin
  tocar los dos ficheros.
- **El servidor no evalúa nunca la `key`**: reconciliar es del cliente.
- **Todo tipo de `HtmlContent` está nombrado en el despacho del servidor**, y el que no pinta dice
  por qué.

---

## 6. Criterios de aceptación

Tests en `packages/compiler/test/emit/` y en el arnés de `test/emit/hydrate/`. Los tres primeros son
**rojo primero**: hoy pasan si se escriben al revés, porque hoy no se emite nada.

**Forma del emitido**

1. **(rojo primero)** Un componente con `@switch (kind) { case 'a': <p>…</p> default: <i>…</i> }`
   emite un `switch` con una rama por `case`, cada una con sus `$dom.element` y su `break`. El HTML
   renderizado con `kind === 'a'` contiene el `<p>` y **no** el `<i>`.
2. **(rojo primero)** `@while (…) { … }` emite `while (<cabecera empalmada entera>) { … }` y produce
   N nodos para N vueltas.
3. **(rojo primero)** `@for (let i = 0; i < n; i++) { … }` emite `for (…) { … }` con la cabecera sin
   partir por `;` — el mismo empalme que ya recibe `@foreach`.
4. **Sin caída.** Dos `case` consecutivos, el primero con markup: solo se pinta el suyo (decisión 14).
5. **La `key` no se evalúa.** Con `key (r.id)` escrita, el texto del módulo de servidor no contiene
   la expresión de la key.
6. **Anidamiento en los dos sentidos.** Un `@switch` dentro de un `@foreach` y un `@foreach` dentro
   de un `case` producen el markup de las dos vueltas.
7. **La cabecera se ancla.** El source map lleva la cabecera de los tres constructos —y el test de
   cada `case`— a su offset del `.fud`, como ya hace `@if`/`@foreach`.

**Lo que el paseo arrastra (§2.3)**

8. Un `<app-x>` que solo aparece dentro de un `@switch`/`@for`/`@while` aporta su
   `import { render as renderAppX }` al módulo de servidor y su llamada en el sitio.
9. Un asset dentro de esos tres se enlaza, y uno que falta se reporta por el canal de
   `missingAssets` (`FUD0363`) — igual que si estuviera dentro de un `@if`.

**Equivalencia SSR ↔ cliente** (arnés de `hydrate/block-equivalence.test.ts`, con `adoptOnly`: si
`h()` fabrica un solo nodo, las dos ramas ya divergieron)

10. **Los goldens no se mueven.** Ni un byte en los `__golden__/*.mjs` de servidor ni en los
    `*.client.mjs`: ninguna fixture usa los tres constructos. Un golden que cambie aquí significa que
    la corrección tocó una rama que no era la suya.
11. **`@switch`**, con la rama `case` tomada, con la `default` tomada y sin ninguna coincidencia (el
    constructo no pinta nada y el cursor tiene que volver intacto).
12. **`@for`** con 0, 1 y N vueltas.
13. **`@while`** con 0 y N vueltas.
14. **Un bloque que no pinta no mueve el cursor**, comprobado con un elemento hermano detrás de cada
    uno de los tres: es el mismo criterio que SDD-30 §4.3 fija y que hasta ahora solo se verificaba
    con `@if`.

**Cobertura.** Las líneas nuevas de `markup.ts` y el helper que sube a `constructs.ts` nacen al
**100 %** en las cuatro métricas —`constructs.ts` está al 100 % y no baja—. La deuda heredada de
`@fudic/compiler` no rebaja el listón de lo nuevo. Nada de `/* v8 ignore */`.

---

## 7. Fuera de alcance

- **La rama de cliente.** Emite los cinco desde SDD-30 y no se toca. Este BUG es de una sola
  dirección: que el servidor alcance al cliente.
- **Fixtures y goldens nuevos.** Deliberado, y es lo que mantiene la rama paralelizable con las tres
  tandas de §2.5: los criterios se verifican con componentes en memoria, que es como
  [`block.test.ts`](../../../packages/compiler/test/emit/block.test.ts) ya prueba estos mismos tres
  constructos en el cliente. Cuando alguna fixture los estrene —una demo de `@switch` en
  `examples/basic`, por ejemplo— será en su propia tanda y con los goldens de una sola rama.
- **Diagnosticar un `@while` que no termina.** Depende de los datos; el compilador no puede verlo.
  Mismo caso que la key duplicada de SDD-30 §4.4.
- **Reconciliación en el servidor.** El SSR pinta una vez. La `key` no tiene semántica ahí (§4.4).
- **`@section`, `@code`, `raw-expression` y los comentarios.** Siguen sin emitir markup de servidor.
  Lo que cambia es que la tabla total los nombra con su motivo (§4.1), no que empiecen a pintar.
- **`@snippet` / `@render`.** Es [SDD-29](../SDD-29-code-snippets.md), y entra por la tabla del
  §4.1 cuando exista — que es exactamente el efecto que se busca al hacerla total.
