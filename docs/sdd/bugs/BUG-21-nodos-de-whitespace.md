# BUG-21 — El árbol lleva un nodo de texto por cada salto de línea del autor

> **Estado:** `Bloqueado` — por [SDD-17](../SDD-17-hidratacion.md): la hidratación vista correr
> en un navegador (§2.8). El bloqueante era «el slice pendiente de SDD-15» hasta que
> [SDD-15](../SDD-15-emit.md) pasó a `Hecho` (2026-08-12); lo que falta no era el emit sino el
> runtime que lo consume, y ese es SDD-17. Sus dos bloqueantes anteriores,
> [BUG-18](./BUG-18-update-denso.md) y [BUG-19](./BUG-19-tres-constructos-sin-servidor.md), están
> en `Hecho` (§2.7)
> **Corrige:** [BUG-07 §4.5](./BUG-07-html-sin-minificar.md) (la regla *«se colapsa; no se
> elimina»*, que contestó una pregunta distinta) · [SDD-15 §4.4](../SDD-15-emit.md) (los runs de
> texto de las dos ramas) · [SDD-17 §6.22](../SDD-17-hidratacion.md) (el presupuesto del chunk)
> **Paquetes:** `@fudic/compiler` (`emit/runs.ts`, `emit/display.ts` **nuevo**, `emit/markup.ts`,
> `emit/markup-client.ts`, `emit/block.ts`, `emit/module.ts`, `emit/client.ts`, `emit/layout.ts`)
> **Rama sugerida:** `fix/bug-21-nodos-de-whitespace`
> **Reserva:** ningún código `FUD` nuevo (§3.4)

---

## 1. Contexto y síntoma

Un componente de seis nodos, de los cuales cuatro son el sangrado del autor. Es
[`app-badge.fud`](../../../packages/compiler/fixtures/app-badge.fud) entero, y su golden de
servidor ([`app-badge.mjs`](../../../packages/compiler/test/emit/__golden__/app-badge.mjs)):

```js
export function render($dom, $shadow, props) {
  const { tone = 'neutral' } = props ?? {};
  const $n0 = $dom.text(" "); $dom.append($shadow, $n0);      // el salto tras <template>
  const $n1 = $dom.element("span");
  $dom.setAttr($n1, 'class', [...].filter(Boolean).join(' '));
  const $n2 = $dom.text(" "); $dom.append($n1, $n2);          // el salto tras <span …>
  const $n3 = $dom.element("slot");
  $dom.append($n1, $n3);
  const $n4 = $dom.text(" "); $dom.append($n1, $n4);          // el salto antes de </span>
  $dom.append($shadow, $n1);
  const $n5 = $dom.text(" "); $dom.append($shadow, $n5);      // el salto antes de </template>
}
```

**Cuatro de seis nodos son formato del fuente.** No es una anomalía de esa fixture: es lo que sale
de escribir HTML indentado, que es todo el HTML.

| golden | nodos `$dom.text(" ")` |
|---|---|
| `app-badge.mjs` / `.client.mjs` | 4 y 4 |
| `app-button.mjs` / `.client.mjs` | 4 y 4 |
| `app-card.mjs` / `.client.mjs` | 14 y 14 |
| `app-actions.mjs` / `.client.mjs` | 14 y 14 |
| `app-list.mjs` / `.client.mjs` | 15 y 15 |
| `home.mjs` (página) | 14 |

**Y se paga tres veces, no una:**

- **En el servidor**, una llamada `$dom.text` y un `append` por cada uno, en cada render de cada
  instancia. El SSR es la ruta caliente de una petición.
- **En el cliente**, otra vez en `c()` — y en `h()` el precio es distinto y peor: cada nodo que el
  servidor pintó es un nodo que el árbol adoptado tiene que llevar, y los runs que sí tienen
  variable se localizan **desde el elemento de al lado** (`previousSibling` / `lastChild`), o sea
  atravesándolos.
- **En el chunk**, una sentencia de texto por nodo, contra un presupuesto de 1 kB tras
  minify+brotli (SDD-17 §6.22).

Y hay una cuarta, que es la que hace que esto sea un BUG y no una optimización: **la mitad del
árbol que la hidratación tiene que reconocer no dice nada.** Un `h()` que adopta doce nodos de los
que seis son espacios es más superficie de desalineación por exactamente cero pintado.

---

## 2. Causa raíz

### 2.1. La regla existe, es deliberada, y contestó una pregunta distinta

No es un descuido: está escrito, con su motivo, en dos sitios
([`space.ts:19-20`](../../../packages/compiler/src/emit/space.ts#L19-L20) y
[`markup.ts:113-115`](../../../packages/compiler/src/emit/markup.ts#L113-L115)), y viene de
[BUG-07 §4.5](./BUG-07-html-sin-minificar.md), que lo decidió así por tres riesgos reales —**slots**,
**`:empty`** y **espaciado inline entre custom elements**— y un dato:

> Y no compensa: eliminar paga **0,4 % gzip** sobre colapsar (tabla de §1).

**Ese dato mide bytes, y este BUG no va de bytes.** BUG-07 era la minificación del HTML servido, y
en esa pregunta gzip se come la indentación repetida y la respuesta es correcta. La pregunta de
aquí es **cuántos nodos existen en el DOM y cuánto código los fabrica**, y ahí gzip no ayuda: un
nodo colapsado a un espacio sigue siendo un nodo, sigue costando su `$dom.text` en las dos ramas y
sigue estando en medio del camino de `h()`. La causa raíz de este BUG es, literalmente, **una
decisión correcta aplicada a un coste que no medía**.

Los tres riesgos de BUG-07 §4.5, en cambio, siguen siendo ciertos y **no se discuten**: son las
tres guardas de §4.4.

### 2.2. Dónde está escrito

- **La decisión, una sola vez**: `emitItems` agrupa los hijos en items y **siempre** produce un
  `TextRun` por cada tirada de texto
  ([`runs.ts:97-118`](../../../packages/compiler/src/emit/runs.ts#L97-L118)). No hay ningún sitio en
  el que un run pueda no llegar a nodo: `flush()` empuja lo que haya.
- **La rama de servidor** lo escribe en
  [`markup.ts:111-117`](../../../packages/compiler/src/emit/markup.ts#L111-L117) — variable propia,
  `$dom.text`, `append`.
- **La rama de cliente** en
  [`markup-client.ts:475-499`](../../../packages/compiler/src/emit/markup-client.ts#L475-L499) —
  sin variable si nadie lo va a reescribir, pero con nodo igual.

Que la decisión esté en `runs.ts` es lo que hace este BUG barato **y** lo que lo hace peligroso si
se toca en otro sitio: es el módulo que las dos ramas comparten, y un nodo descartado en una rama y
no en la otra es exactamente la divergencia que `h()` no sobrevive (§4.5).

### 2.3. Lo que este compilador puede probar y un minificador no

El argumento de BUG-07 §4.5 contra la lista fija de tags es correcto y hay que repetirlo:

> Un custom element no está en esa lista y su `display` por defecto es `inline`: en una página
> fudic esa heurística no falla en el caso raro, falla en el caso normal.

**Y es justo el sitio donde este compilador tiene la información que a un minificador le falta.**
`<app-badge>` no es un tag desconocido: es un componente del grafo, su fichero está resuelto
([`resolve.ts`](../../../packages/compiler/src/emit/resolve.ts)), su `<style>` está parseado, y ese
`<style>` dice `:host { display: inline-block; }`. El `display` de un custom element —lo único que
ninguna herramienta externa puede saber— es **lo primero** que aquí se puede leer.

Eso invierte la conclusión sin invertir el razonamiento: no se descarta *por heurística de lista*,
se descarta *cuando el grafo lo demuestra*, y cuando no lo demuestra no se descarta. En
`app-card` esa misma lectura es la que **conserva** el espacio anterior a `<app-button>`: el hijo
declara `inline-block`, luego ese espacio se renderiza y se queda.

### 2.4. Alcance

- **Las dos ramas de todos los roles**: componente (servidor y cliente), página
  ([`module.ts:212-213`](../../../packages/compiler/src/emit/module.ts#L212-L213)), layout y ruta
  ([`layout.ts:91-93,216-228`](../../../packages/compiler/src/emit/layout.ts#L91-L93)), y el cuerpo
  de cada bloque ([`block.ts:198-209`](../../../packages/compiler/src/emit/block.ts#L198-L209)).
  Todos pasan por `emitItems`.
- **Todos los goldens**, los once. Descartar un run mueve el contador `$nN`, que es secuencial
  ([`markup.ts:148-150`](../../../packages/compiler/src/emit/markup.ts#L148-L150),
  [`markup-client.ts:144-147`](../../../packages/compiler/src/emit/markup-client.ts#L144-L147)), así
  que **renumeran enteros**. Es el coste real de esta tanda y es el motivo de §2.7.
- **Dos consumidores del item list que hay que revisar, no solo regenerar**:
  - **El marcador** (`marker.ts`). `markerSite` busca dos runs interpolados separados **solo** por
    constructos ([`marker.ts:62-75`](../../../packages/compiler/src/emit/marker.ts#L62-L75)). Un run
    de whitespace en medio hoy rompe esa forma y evita el comentario; si ese run se descarta, la
    forma aparece y el marcador **empieza a emitirse donde antes no**. Es correcto —y lo emiten las
    dos ramas, porque la regla vive en un módulo compartido—, pero es un cambio de salida que nadie
    espera al leer el diff.
  - **El anclaje de un constructo** (`#namesFor`). Un run estático recibe variable cuando un
    constructo delante lo necesita como ancla
    ([`markup-client.ts:418-437`](../../../packages/compiler/src/emit/markup-client.ts#L418-L437)).
    Si ese run desaparece, el bloque pasa al ancla siguiente, o a `null` —insertar al final—. La
    regla de §4.4 evita el caso frecuente (un run pegado a un constructo no es descartable), pero la
    interacción hay que probarla, no razonarla.

### 2.5. Lo que NO es la causa

- **No es `collapseSpace`.** Colapsar a un espacio es correcto y no se toca: es lo que el navegador
  iba a hacer. Lo que se decide aquí es si ese espacio **llega a ser un nodo**.
- **No es el parser.** Los `TextNode` llegan bien, con su span, y **siguen llegando**: esto es una
  decisión de emisión, no una poda del AST (§5).
- **No es el `$dom.text('')` del cliente.** En
  [`markup-client.ts:491`](../../../packages/compiler/src/emit/markup-client.ts#L491) un run
  **interpolado** se fabrica vacío y lo llena `$a()` acto seguido. Ese nodo sí existe en el DOM y
  tiene que existir: lo que se puede ahorrar es la segunda escritura, y eso exige sembrar `$w`, que
  es otra cosa y está en §7 con su condición. Un nodo que nace vacío para llenarse es distinto de un
  nodo que nace lleno de nada.

### 2.6. Los source maps: qué se mueve y qué no

Es la pregunta que hay que contestar antes de escribir una línea, y la respuesta es buena por
construcción — pero solo si el descarte se hace **donde se decide** y no **sobre el texto emitido**.

- **Un run de whitespace no ancla nada.** Un run sin interpolación produce `[JSON.stringify(...)]`:
  un `LinePart` que es un `string` pelado
  ([`runs.ts:145-147`](../../../packages/compiler/src/emit/runs.ts#L145-L147)). `toSegment` solo
  guarda `src` cuando la parte es un `MappedPart`
  ([`writer.ts:39-40`](../../../packages/compiler/src/emit/writer.ts#L39-L40)), y `mappings()` solo
  emite un par cuando `seg.src !== undefined`
  ([`writer.ts:112`](../../../packages/compiler/src/emit/writer.ts#L112)). **Descartar un run de
  whitespace elimina exactamente cero mappings**, porque nunca hubo ninguno que lo señalara.
- **Que la línea se escriba con `mappedLine` no significa que mapee.** `markup.ts:116` y
  `markup-client.ts:484,494` usan `mappedLine` para todo run porque uno interpolado sí lleva
  anclas. No hay nada que «preservar» al borrar uno estático, y conviene decirlo porque es
  justo lo que alguien intentaría hacer.
- **Todo lo que va detrás se desplaza, y eso se absorbe solo.** `mappings()` calcula los offsets
  generados sobre el layout **final**, recorriendo `#lines` con su indentación y sus `\n`
  ([`writer.ts:105-119`](../../../packages/compiler/src/emit/writer.ts#L105-L119)). Una línea que no
  se escribe no está en `#lines`, así que los offsets de las demás salen ya correctos. No hay
  reajuste que hacer.
- **La trampa, y es la única.** Si esto se implementara como una pasada sobre el texto generado —un
  regex que borre las líneas `const $nN = $dom.text(" "); …`—, `#lines` quedaría intacto y **todos**
  los mappings posteriores apuntarían desplazados los bytes borrados, en silencio. Es el mismo
  principio que [BUG-07 §4.1](./BUG-07-html-sin-minificar.md) fija para la minificación: se decide
  sobre el AST, donde están los hechos, nunca sobre la salida.
- **Aguas abajo, nada.** `emitComponentModuleMapped` / `emitPageModuleMapped` consumen los pares y
  no cambian; los mapas anidados de `@fudic/vite` ([BUG-05](./BUG-05-sourcemaps-builds-anidados.md))
  tampoco. Y el `LineMap` de [SDD-13](../SDD-13-source-maps.md) es del **fuente** —offset a
  línea/columna del `.fud`— y este BUG no toca ni un span.
- **Los tests de mapa no necesitan tocarse.**
  [`sourcemap.test.ts`](../../../packages/compiler/test/emit/sourcemap.test.ts) localiza el offset
  generado con `code.indexOf(...)` sobre el texto final y lo compara con el par del mapa, así que es
  inmune al desplazamiento **y** detectaría la trampa del punto anterior. Es el criterio §6.11 y
  vale exactamente porque ya existe y hoy está verde.

### 2.7. Por qué va detrás de BUG-18 y BUG-19

No es una dependencia de mecanismo —la regla se puede escribir hoy— sino de **ficheros y de
goldens**, que es el mismo motivo por el que [BUG-18 §2.5](./BUG-18-update-denso.md) va detrás de
SDD-30:

| Tanda | Ficheros | El roce |
|---|---|---|
| [BUG-18](./BUG-18-update-denso.md) | `emit/markup-client.ts`, `emit/client.ts` | **Los dos ficheros de la rama de cliente que este BUG toca**, y las dos tandas regeneran los cinco `*.client.mjs`. |
| [BUG-19](./BUG-19-tres-constructos-sin-servidor.md) | `emit/markup.ts`, `emit/constructs.ts` | `markup.ts` es el fichero de la rama de servidor que este BUG toca, y en el mismo despacho. |

Y hay un segundo motivo, que es el que decide el orden entre ellos dos y este: **BUG-19 estrena el
markup de servidor de `@switch`, `@for` y `@while`**, y ese markup pasa por `emitChildren`, o sea
por la decisión de §4. Delante, este BUG escribiría la regla para dos constructos y BUG-19 traería
tres cuerpos nuevos que no la conocen; detrás, la regla se aplica a los cinco de una vez.

**El coste de ir detrás es cero, y el de ir delante es el peor que hay aquí:** las tres tandas
regeneran los mismos goldens, y el valor entero de un golden byte a byte es que alguien lo lee. Un
conflicto entre dos regeneraciones se resuelve sin leer ninguna.

**Con SDD-31 no hay roce**: `core`, `oxc-code.ts` y `module.ts:172` (BUG-19 §2.5), y sus goldens de
servidor no se mueven. Pero SDD-31 termina antes que las dos anteriores por camino, así que la
observación es informativa.

### 2.8. Y ahora, por la hidratación vista correr

Las dos aristas de §2.7 están en `Hecho`, y el BUG **no** pasa a `Listo`: lo bloquea
[SDD-17](../SDD-17-hidratacion.md), y esta vez la razón sí es de mecanismo. (Escrito cuando el
bloqueante parecía ser SDD-15; ese cerró el 2026-08-12 y lo que falta es el runtime que lee lo
que el emit produce, no el emit.)

**La deducción de la caja solo es cerrada dentro del shadow root.** Ahí el único CSS que aplica es
el `<style>` del componente, y §4.3 se sostiene. En la página —el light DOM, el layout, la ruta— una
hoja global puede poner `display: flex` en cualquier clase y el compilador no la ve. Es el mismo
hueco que [BUG-07 §4.4](./BUG-07-html-sin-minificar.md) ya reconoció para `white-space`, y por el que
existe `data-fud-space`: cuando el CSSOM no está completo, se pregunta al autor en vez de adivinar.
La fuente (c) de §4.3 no lo cubre —envenena por el `<style>` propio, no por una hoja de fuera—, así
que **§4.3 y §4.2 se reabren**, no se dan por buenas.

**Y hay una alternativa sobre la mesa que no deduce nada:** descartar el whitespace-only que
contiene un salto de línea y conservar el que está escrito en la misma línea, que es lo que hace Vue
con `condense`. No prueba ninguna caja, es reversible por el autor sin sintaxis nueva —escribir dos
inline en la misma línea conserva su espacio— y da la respuesta intuitiva en los tres casos que hoy
son guardas: el sangrado desaparece, `:empty` casa cuando el autor no escribió nada, y un host
escrito en dos líneas queda de verdad vacío y enseña el fallback de su `<slot>`. Su precio es que
**decide por la forma del fuente**, que es justo lo que §4.4 rechaza; medirlo contra la regla de las
tres pruebas es la decisión que este BUG tiene pendiente.

**Por qué no se elige aquí.** Las dos reglas cambian el árbol que `h()` adopta, y ese árbol todavía
no se ha visto adoptar en un navegador con las fixtures reales: es SDD-17 entero.
Escribir la regla antes es escribirla contra un modelo que no ha corrido —y la experiencia de
`language-core` / `language-server` dice que ahí es donde aparece lo que ningún test previó—. Es el
mismo argumento de §2.7 con una vuelta más: allí era no mover los goldens dos veces, aquí es no
fijar la regla dos veces.

**Y lo que se lleva por delante:** los criterios §6.4, §6.5 y §6.6 —los tres que prueban el
`display`— y las tres guardas de §4.4, que con la regla del salto dejan de ser guardas y pasan a ser
el comportamiento. Las tres fixtures manuales de [`spaces/`](../../../spaces) son las que lo
enseñaron y quedan como el caso de prueba de la decisión.

---

## 3. Interfaz pública

### 3.1. `emitItems` toma un contexto, no un modo

```ts
// packages/compiler/src/emit/runs.ts — hoy
export function emitItems(source: string, children: readonly HtmlContent[], space: SpaceMode): EmitItem[];

// corregido
export function emitItems(source: string, children: readonly HtmlContent[], at: RunContext): EmitItem[];

/** Lo que hace falta saber para decidir si un run de whitespace llega a ser un nodo (§4.2). */
export interface RunContext {
  readonly space: SpaceMode;
  /**
   * El elemento cuyos hijos son estos, o `null` en la raíz de un shadow root / cuerpo de
   * página, donde el contenedor es el propio `:host` (o el `<body>`).
   */
  readonly parent: ElementNode | null;
  /** El `display` del contenedor, ya resuelto por quien sabe de quién es el `<style>`. */
  readonly container: Display;
  /** El `display` de un tag hermano — el grafo lo sabe para un componente (§2.3). */
  displayOf(tag: string): Display;
  /** Si estos hijos son LIGHT DOM de un host: whitespace asignable a un `<slot>` (§4.4). */
  readonly light: boolean;
}
```

Es la firma que obliga a que la decisión se tome una vez. Un `SpaceMode` suelto no bastaba porque
la pregunta ya no es *«¿se colapsa?»* sino *«¿en qué caja cae?»*, y eso es del padre y de los
vecinos, no del run.

### 3.2. `emit/display.ts` — un módulo nuevo, y por el mismo motivo que `marker.ts`

```ts
/** Lo que el emit puede afirmar del `display` de una caja. `unknown` es la respuesta por defecto. */
export type Display = 'block' | 'inline' | 'contents' | 'unknown';

/** El `display` declarado para `:host` en el `<style>` propio de un componente, si lo declara. */
export function hostDisplay(style: StyleNode | null): Display;

/** El `display` por defecto de un tag HTML conocido; `unknown` para un tag desconocido. */
export function tagDisplay(tag: string): Display;

/** Si el `<style>` declara algún `display` fuera de `:host`: sin árbol de reglas, envenena §4.3.c. */
export function hasForeignDisplay(style: StyleNode | null): boolean;
```

Vive fuera de `space.ts` porque `space.ts` contesta *cómo se emite el texto* y esto contesta *qué
caja lo contiene*; y vive en un módulo y no en un método por la razón exacta de
[`marker.ts:18-22`](../../../packages/compiler/src/emit/marker.ts#L18-L22): **las dos ramas tienen
que decidir idénticamente**, y un descarte en un lado y no en el otro es peor que no descartar,
porque los dos árboles dejan de ser el mismo árbol.

Lee el CSS como ya lo lee `spaceModeOf`: por **regex sobre las tiradas literales**, porque SDD-09
§7 dice que en v1 no hay árbol de reglas y `StyleNode` es deliberadamente plano
([`css/nodes.ts:1-8`](../../../packages/compiler/src/css/nodes.ts#L1-L8)). Eso es una limitación, y
es la que fija §4.3.c: lo que no se puede leer vale `unknown`, y `unknown` conserva.

### 3.3. El grafo llega al emisor

`MarkupEmitter` recibe hoy `isComponent: (tag) => boolean`
([`markup.ts:62-78`](../../../packages/compiler/src/emit/markup.ts#L62-L78)) y
`ClientMarkupEmitter` un `ClientScope.childProps(tag)`
([`markup-client.ts:210-213`](../../../packages/compiler/src/emit/markup-client.ts#L210-L213)). Los
dos ganan **una** capacidad, resuelta en `module.ts` / `client.ts` desde `graph.components`, que es
donde ya se resuelve `spaceModeOf(comp.tag, componentStyleNode(comp.doc))`
([`module.ts:138`](../../../packages/compiler/src/emit/module.ts#L138),
[`client.ts:75`](../../../packages/compiler/src/emit/client.ts#L75)):

```ts
/** El `display` de `:host` del componente de ese tag, `unknown` si no es del grafo o no lo declara. */
displayOf(tag: string): Display;
```

Y `block.ts` tiene que hacer llegar al cuerpo de un bloque el **elemento padre**, que hoy no viaja:
`BlockSite.level` lleva nombres de variable (`fab`, `dom`), no el nodo
([`markup-client.ts:57-71`](../../../packages/compiler/src/emit/markup-client.ts#L57-L71)). Es el
único cambio estructural de la corrección y está en §7 lo que **no** hace: mirar dentro de las ramas
de un constructo.

### 3.4. Sin códigos `FUD` nuevos

No hay nada que diagnosticar: el descarte es una decisión de emisión sobre markup legal, y quien
necesite el nodo tiene `data-fud-space="preserve"`, que ya existe y ya lo conserva todo
([`space.ts:38`](../../../packages/compiler/src/emit/space.ts#L38)). Mismo caso que BUG-16, BUG-17,
BUG-18 y BUG-19.

---

## 4. Comportamiento corregido

### 4.1. La regla

> **Un run de solo-whitespace se emite, salvo que el emit pueda probar que no pinta nada.**

La carga de la prueba está en descartar, no en conservar. `unknown` conserva, siempre, en todas las
preguntas de §4.3.

### 4.2. Las tres pruebas, y son cerradas

**Por qué la prueba es el `display` y no otra cosa.** La pregunta parece de formato del fuente
—«esto es sangrado, fuera»— y no lo es. Dos ficheros con **exactamente el mismo whitespace**:

```html
<div>a</div>
<div>b</div>     <!-- el salto NO se renderiza: entre dos cajas de bloque no hay línea donde caer -->

<span>a</span>
<span>b</span>   <!-- el salto SÍ se renderiza: es el espacio entre «a» y «b» -->
```

Misma tirada de caracteres, misma posición, resultado opuesto. **Lo único que las distingue es el
`display` de los vecinos**, y por eso no hay atajo: una regla que mire el salto de línea —que es lo
que hacen Vue con `whitespace: 'condense'` y Angular con `preserveWhitespaces: false`— borra el
segundo caso y junta las dos palabras. Eso no es un caso raro: escribir dos elementos inline en
líneas distintas es lo normal. Y en fudic es **peor que en cualquiera de los dos**, porque el
`display` por defecto de un custom element es `inline` y una página fudic es casi toda custom
elements — es el mismo argumento de [BUG-07 §4.5](./BUG-07-html-sin-minificar.md), solo que aquí se
usa para saber **cuándo sí** y no solo para no hacer nada.

Con eso dicho, un run de solo-whitespace se descarta si y solo si el modo es `collapse` y se cumple
**una**:

- **(a) El contenedor no genera caja para él.** En un contenedor `flex` o `grid`, una tirada de
  hijos de solo-whitespace **no se renderiza** — no es que colapse: no genera caja. Es la prueba
  más fuerte de las tres y no mira a los vecinos.
- **(b) Está al principio o al final de un contenedor de bloque.** El whitespace colapsable en el
  borde de una línea se elimina; en el borde de un contenedor de bloque siempre lo está. No depende
  de qué venga después: un `<slot>` detrás sigue siendo contenido de la misma línea.
- **(c) Está entre dos cajas de bloque.** Ninguna de las dos lo mete en una línea, así que no hay
  línea donde renderizarlo.

Las tres son del modelo de whitespace de CSS, no de una lista de tags: es la misma naturaleza de
argumento que BUG-07 §4.4 usó para colapsar —*render idéntico por construcción, no por
heurística*—, aplicada a la pregunta que aquella no medía.

### 4.3. De dónde sale un `display`, en este orden

- **(a) El `:host` del propio componente**, leído de su `<style>` — el mismo sitio del que ya sale
  el modo de whitespace. Es lo que hace descartable el whitespace de los bordes del shadow root, y
  solo cuando el autor **declaró** `:host { display: … }`: un componente que no lo declara es
  `inline` por defecto y se queda con sus dos nodos.
- **(b) El `:host` del componente HIJO, por el grafo** (§2.3). Es la única de las tres que ninguna
  herramienta externa puede tener, y en `app-card` es la que **conserva** el espacio de delante de
  `<app-button>`, porque el hijo declara `inline-block`.
- **(c) La tabla de `display` por defecto de HTML**, para un tag conocido, y **solo si el `<style>`
  que gobierna no declara ningún `display` fuera de `:host`**. Sin árbol de reglas (§3.2) no se
  puede saber a qué elemento apunta un `.card { display: flex }`, así que una declaración así
  **envenena la fuente (c) para todo el fichero** y todos los tags conocidos pasan a `unknown`.
  Es tosco y es la opción segura; §7 dice cuándo deja de serlo.
- **Todo lo demás es `unknown`**: un tag que no es del grafo ni de la tabla, un `<slot>` (su caja es
  la del contenido asignado) y **cualquier constructo** — el cuerpo de un `@if` puede empezar por un
  `<span>`, y este BUG no mira dentro (§7).

### 4.4. Lo que no se descarta nunca, y son las tres de BUG-07 §4.5

Las guardas se comprueban **antes** que las pruebas, y ninguna admite excepción:

- **Slots.** Un run en el LIGHT DOM de un host —los hijos de un `<app-x>`, y los hijos de un
  `<slot>`, que son su fallback— se conserva siempre. Un nodo de solo-whitespace **cuenta como
  contenido asignado**: descartarlo hace que un `<slot>` ocupado muestre su fallback. Es el riesgo
  que BUG-07 nombró primero y sigue intacto.
- **`:empty`.** Un run que es el único contenido de su elemento se conserva siempre: descartarlo
  deja el elemento sin hijos y `:empty` empieza a casar. La comprobación es sobre el resultado, no
  sobre la fuente — si todos los hermanos son descartables, el último no lo es.
- **`preserve`.** Un `<pre>`, un `<textarea>`, un `white-space` preservante en el `<style>` propio o
  un `data-fud-space="preserve"` conservan todo, como hoy. El modo se decide antes y no se toca.

Y **no** hay guarda de salto de línea, ni en un sentido ni en el otro. Un espacio escrito a mano
entre dos bloques tampoco se renderiza, y un salto entre dos `<span>` sí: el ejemplo de §4.2 es el
mismo whitespace con dos respuestas, y ninguna de las dos la da el salto. Condicionar la regla a
cómo se escribió sería meter la heurística por la puerta de atrás, justo la que este BUG demuestra
que no se sostiene.

### 4.5. Las dos ramas descartan lo mismo, o no descarta ninguna

La decisión vive en `emitItems`, que es el único sitio por el que pasan las dos
([`markup.ts:94`](../../../packages/compiler/src/emit/markup.ts#L94),
[`markup-client.ts:359`](../../../packages/compiler/src/emit/markup-client.ts#L359)), y la escribe
un módulo compartido. No es higiene: un nodo que el servidor pinta y el cliente no fabrica —o al
revés— es un árbol que `h()` adopta desalineado, y a partir de ahí las variables de nodo apuntan a
quien no es. Es el invariante de SDD-15 §6.14 y el mismo argumento por el que `marker.ts` no es un
método.

### 4.6. Lo que NO cambia

- **`collapseSpace` y los modos.** Un run que sobrevive sale exactamente igual que hoy.
- **El AST.** Los `TextNode` siguen ahí con su span: el formateador, `language-core` y el LSP
  siguen viendo el whitespace del autor. Se decide **no emitirlo**, no que no exista.
- **Los runs con contenido.** Un run que lleva un carácter que no es whitespace, o una
  interpolación, no entra en esta regla ni de lejos.
- **El marcador.** La regla de `marker.ts` no se toca; lo que cambia es la lista de items sobre la
  que se evalúa, y cambia **igual en las dos ramas** (§2.4).
- **La rama de servidor y la de cliente siguen escribiendo lo que escribían** para todo lo demás.

---

## 5. Invariantes

**Los que el bug violaba**

- ***Lo que el emit sabe en compilación no se hace en runtime.*** El emit sabe que ese espacio no
  pinta nada, y aun así emitía el código que lo fabrica, en las dos ramas, en cada render.
- ***El coste de un render es proporcional a lo que se ve*** — la mitad del árbol de un componente
  típico no se ve.
- ***Un custom element no es un tag desconocido para este compilador.*** La conclusión de BUG-07
  §4.5 se apoya en que nadie puede saber el `display` de `<app-badge>`; el grafo sí puede, y no se
  estaba preguntando.

**Los que la corrección añade**

- **Un run de solo-whitespace se emite salvo prueba en contrario, y las pruebas son tres y
  cerradas.** `unknown` conserva.
- **Las dos ramas descartan exactamente los mismos nodos**, porque lo decide el módulo que
  comparten y no cada emisor.
- **El descarte se decide sobre el AST, nunca sobre el texto emitido** — que es lo que mantiene los
  source maps correctos por construcción (§2.6).
- **Slots, `:empty` y `preserve` son guardas, no casos.** Se comprueban antes que cualquier prueba.

---

## 6. Criterios de aceptación

Tests en `packages/compiler/test/emit/` (`space.test.ts` y un `display.test.ts` nuevo, al modo de
aquél: nodos del parser real, nunca forjados) y en el arnés de `test/emit/hydrate/`.

**La decisión, unidad a unidad**

1. **(rojo primero)** `hostDisplay` lee `:host { display: block }`, `inline-block`, `flex`, `grid`,
   `contents` y `inline`; un `<style>` sin `:host { display }` da `unknown`; un `display`
   interpolado por Razor da `unknown` (mismo caso que `spaceModeOf` con `color: @(theme.fg)`).
2. **(rojo primero)** `hasForeignDisplay` es cierto con `.card { display: flex }` y falso con solo
   `:host { display: block }` — es lo que envenena la fuente (c) de §4.3.
3. `tagDisplay` da `block` para `div`/`article`/`header`/`p`/`h2`/`ul`/`li`, `inline` para
   `span`/`a`/`b`, `contents` para `slot`, y `unknown` para `app-badge` y para cualquier tag que no
   esté en la tabla.

**La regla, sobre el emitido de las dos ramas**

4. **(rojo primero)** El whitespace de los bordes del shadow root **se descarta** en un componente
   cuyo `<style>` declara `:host { display: block }`, y **se conserva** en uno que no declara
   ninguno. Es §4.3.a y su caso negativo, y son los dos primeros nodos de casi todo componente.
5. **(rojo primero)** El whitespace entre dos elementos de bloque se descarta; el que está junto a
   un `<span>` se conserva (§4.2.c).
6. **(rojo primero, y es el criterio de §2.3)** El whitespace pegado a un `<app-x>` cuyo `:host`
   declara `inline-block` **se conserva**, y el pegado a uno que declara `block` **se descarta**.
   Dos componentes en memoria que solo se diferencian en esa línea de CSS producen distinto número
   de nodos: es la prueba de que el grafo se está leyendo y de que no es una lista de tags.
7. **Slots.** El whitespace del light DOM de un host se conserva **siempre**, aunque las tres
   pruebas de §4.2 se cumplan. Comprobado también con los hijos de un `<slot>` (su fallback).
8. **`:empty`.** `<div>\n</div>` conserva su nodo. Y el caso que solo se ve al comprobar sobre el
   resultado: un elemento cuyos hijos son **todos** descartables conserva el último.
9. **`preserve`.** Un `<pre>`, un `<textarea>` y un `data-fud-space="preserve"` no pierden ni un
   nodo, y un componente con `:host { white-space: pre-wrap }` tampoco.
10. **El AST no se poda.** Tras emitir, los `TextNode` de whitespace siguen en el documento con su
    span intacto: lo comprueba un test sobre el árbol, no sobre el texto.

**Source maps (§2.6)**

11. **Los dos tests de [`sourcemap.test.ts`](../../../packages/compiler/test/emit/sourcemap.test.ts)
    siguen verdes sin tocarlos.** Localizan el offset generado con `code.indexOf` sobre el texto
    final, así que pasan si —y solo si— los pares se recalcularon sobre el layout nuevo. Es el
    criterio que detecta la trampa de la pasada sobre el texto.
12. **El número de mappings no baja por descartar runs.** Emitir `app-card` antes y después produce
    el **mismo conjunto de `sourceOffset`**: un run de whitespace no anclaba nada, así que ninguno
    puede desaparecer. Si alguno falta, se descartó un run interpolado.
13. **Un run interpolado pegado a uno descartado conserva su ancla.** Con `<div> @title </div>`, el
    par del `@title` sigue apuntando al `title` del `.fud`.

**Equivalencia SSR ↔ cliente** (arnés de `hydrate/`, con `adoptOnly`)

14. **(rojo primero si la regla se escribe en un solo emisor)** Para cada fixture, el árbol que
    `render` serializa y el que `c()` fabrica tienen **el mismo número de nodos**, y `h()` adopta
    sin fabricar ninguno. Es lo que impide que la corrección entre por una rama sola.
15. **Un constructo pegado a un run descartable.** `@if` con un run de whitespace delante y detrás:
    el bloque encuentra su ancla, inserta en el sitio, y el hermano de detrás sigue donde estaba
    (§2.4).
16. **El marcador.** Un nivel con la forma `@a @if (…) { … } @b` **con** whitespace entre medias y
    **sin** él: el comentario se emite —o no— igual en las dos ramas, y `h()` lo encuentra. Es el
    consumidor de §2.4 que cambia de respuesta al descartar.

**Goldens**

17. **Los once regenerados y leídos a mano.** Las únicas diferencias esperadas son nodos de
    whitespace que desaparecen y la **renumeración** de `$nN` que eso arrastra. Un `$dom.element`,
    un `setAttr` o una sentencia de valor que cambie de sitio no es renumeración: es otra cosa que
    se coló. Anotar en el commit cuántos nodos cayeron por fichero.
18. **El HTML de `examples/basic` sigue renderizando igual.** `pnpm build` y una comparación visual
    de la página construida: es el único sitio donde un espacio perdido se ve, y por eso está aquí y
    no en un test unitario.

**Cobertura.** `display.ts` nace al **100 %** en las cuatro métricas; `runs.ts`, `marker.ts` y
`space.ts` están al 100 % y no bajan. La deuda heredada de `@fudic/compiler` no rebaja el listón de
lo nuevo. Nada de `/* v8 ignore */`.

---

## 7. Fuera de alcance

- **Mirar dentro de un constructo.** Un `@if` cuyo cuerpo empieza y acaba por un `<div>` haría
  descartable el whitespace de alrededor, y `branchesOf` ya da las ramas. No entra: exige que **cada
  rama** empiece y acabe por bloque —incluida la ausente, que renderiza nada y deja a los vecinos
  pegados—, y ese razonamiento es un BUG propio con sus criterios. **Condición para abrirlo:** con
  esta regla en `Hecho` y sus goldens leídos, porque entonces se mide contra un antes conocido.
- **Un árbol de reglas CSS.** Es lo que quitaría el «envenenamiento» de §4.3.c y permitiría saber
  que `.card { display: flex }` apunta al `<article>`. Es [SDD-09 §7](../SDD-09-css-razor.md), que
  lo declara fuera de v1 con todas las letras, y no se abre por esto.
- **Sembrar `$w` para que un run interpolado nazca con su valor** (§2.5). Ahorra una escritura de
  DOM por run interpolado en `c()`, pero duplica la expresión en el chunk y toca la convergencia
  `c`/`u` que [BUG-12 §3.3](./BUG-12-sin-canal-de-update.md) fijó. **Condición:** su propio BUG, y
  medido — el ahorro es una escritura y el coste son bytes.
- **Descartar el `<slot>` cuando no hay contenido**, o cualquier otra poda de elementos. Esto va de
  nodos de texto que el autor no escribió.
- **La minificación del HTML servido.** Es [BUG-07](./BUG-07-html-sin-minificar.md) y está `Hecho`.
  Lo que se corrige aquí es la parte de su §4.5 que medía bytes; el resto de aquel BUG se queda.
- **`white-space` que cruza el shadow boundary.** Sigue siendo lo que `data-fud-space` contesta, y
  sigue sin poder deducirse.
