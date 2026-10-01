# SDD-48 — Componentes y snippets en el layout, y huecos con slot

> **Estado:** `Hecho` — implementado, probado por Pedro en navegador y editor, y con sus
> criterios cubiertos por tests ([Task](./SDD-48-Task.md), 26 / 26).
> **Paquetes:** `@fudic/compiler` (directivas, contrato ruta↔layout, emit, argumentos de
> `@render`) · `@fudic/language-core` (proyección) · `@fudic/language-server` (diagnósticos,
> bombillas, autocompletado, colores) · `@fudic/formatter` (la `@` de los argumentos) ·
> `fudic-vscode` (la gramática, sin cambios; un test) · `@fudic/example-basic` (la evidencia)
> **Depende de:** 12, 15, 21, 24, 28, 29, 36, 39, 40, BUG-44
> **Rango de diagnósticos:** `FUD0440`–`FUD0445` (del rango reservado de SDD-21). Retira
> `FUD0704` y `FUD0833`; estrecha `FUD0705`. **Renumerados por SDD-50** (chocaban con la CLI,
> dueña de `FUD0440`–`0459`): `FUD0440`–`0445` son ahora **`FUD0890`–`FUD0895`**, en el mismo
> orden. El texto de abajo conserva los números antiguos.
> **Decisiones de gramática:** 133–135 (nuevas). Enmienda la 82 y la 85, y revoca la 13 de
> SDD-29.
> **Rama:** `worktree-SDD-48-componentes-layout`
>
> **Qué añade en una frase.** El body de un layout puede envolver su ruta en un componente
> —con las props del layout como bindings—, invocar snippets y ramificar; y cada hueco dice en
> qué slot de ese componente cae y si la ruta está obligada a rellenarlo.

---

## 1. Contexto y objetivo

### 1.1. Lo que había

Un layout ya declaraba `<link rel="component">` y `<link rel="snippet">` en su `<head>`, y el
emit renderizaba un componente escrito en su body. Lo que lo impedía en la práctica era
[BUG-44](./bugs/BUG-44-las-props-del-layout-a-ciegas.md): en el `<body>` de un layout **solo**
cabían el marcado, `@RenderBody()` y `@RenderSection()`.

- `FUD0704` prohibía leer una prop del layout en el body, así que
  `<app-marco .titulo=@titulo>` no se podía escribir.
- `FUD0705` prohibía cualquier otra construcción: control de flujo, expresiones, `@render`.

Con eso, dos layouts con la misma forma repiten su CSS y su rejilla: no hay forma de
encapsularlos en un componente que reciba lo que cambia.

Y había un segundo problema, el que motivó adoptar `@section` de Razor: para que varios
hermanos de una ruta caigan en el mismo **slot con nombre** del componente que los envuelve,
cada uno necesita su `slot="x"`, o hay que meterlos en un `<div slot="x">` que no pinta nada. La
ruta, además, tiene que acordarse de qué slots tiene un componente que ni siquiera usa.

Tampoco existía `required`: [SDD-24](./SDD-24-language-server.md) §4.4 pedía avisar de una
sección sin rellenar, [SDD-21](./SDD-21-layout.md) §4.2 decía «es el `required: false` de Razor
por defecto», y no había flag que leer.

### 1.2. El objetivo

- El body de un layout **es marcado como cualquier otro**: componentes, snippets, props como
  bindings, `@if` y bucles. Solo queda fuera `@{ }`.
- Cada hueco puede nombrar el slot del componente que lo rodea:
  `@RenderBody(slot: "contenido")`, `@RenderSection(lateral, slot: "lateral")`. La ruta escribe
  hermanos sueltos y cada raíz sale con su `slot=`.
- `@RenderSection(cabecera, required: true)` obliga a toda ruta del layout a declararla: error en
  el build y bombilla en el editor.
- El editor lo acompaña entero: qué ofrece un `@` en el body, qué ofrecen los paréntesis de un
  hueco, la bombilla de la sección obligatoria.
- De paso, y por uniformidad, los argumentos de un `@render` se escriben **como una prop**: el
  literal tal cual, lo que lee el scope con `@`.

---

## 2. Dependencias

| SDD | Qué aporta |
|---|---|
| [21](./SDD-21-layout.md) | Los roles ruta y layout, las cuatro directivas, `resolveDocument`, la composición por módulos (`layout(data, io, route, …)`). |
| [40](./SDD-40-props-de-layout.md) · [BUG-44](./bugs/BUG-44-las-props-del-layout-a-ciegas.md) | Las props del layout (`props<T>()`), `FUD0700`–`FUD0706`, la proyección del layout. |
| [39](./SDD-39-rutas-reactivas.md) | El chunk de cliente de una ruta, que cruza el markup del layout con un cursor de elementos y sin anclarlo (§4.3). |
| [29](./SDD-29-code-snippets.md) | `@snippet` / `@render`, la expansión, la proyección de un snippet como función. |
| [12](./SDD-12-semantica.md) | El analizador `slot-name` (`FUD0199`) y el registro `slotsOf`. |
| [24](./SDD-24-language-server.md) · [28](./SDD-28-snippets.md) · [36](./SDD-36-editor-terminado.md) | Índice del workspace, catálogo de snippets, bombillas ancladas en diagnóstico. |
| [15](./SDD-15-emisor.md) | `MarkupEmitter`, el payload de hidratación de un componente. |

---

## 3. Interfaz pública

### 3.1. Los argumentos de los huecos

```ts
/** `slot: "name"` — the named slot of the component that wraps a hole. */
export interface SlotArgument {
  readonly name: string;   // without its quotes
  readonly span: Span;     // the literal, quotes included
}

export interface RenderDirectiveNode extends Node {
  readonly type: 'render-body' | 'render-head';
  readonly keywordSpan: Span;
  readonly slot?: SlotArgument;          // only on `@RenderBody`
}

export interface RenderSectionNode extends Node {
  readonly type: 'render-section';
  readonly name: string;
  readonly nameSpan: Span;
  readonly keywordSpan: Span;
  readonly required: boolean;            // `required: true`
  readonly slot?: SlotArgument;
}
```

Gramática (decisión 134):

```
@RenderBody()                     @RenderBody(slot: "x")
@RenderHead()
@RenderSection(nombre)            @RenderSection(nombre, required: true, slot: "x")
```

El nombre de la sección sigue siendo un identificador desnudo (decisión 85). Tras él, argumentos
con nombre separados por comas, cada uno a lo sumo una vez, en cualquier orden: `required` toma
`true` o `false`, `slot` un literal de string sin escapes. `@RenderHead()` no toma ninguno.

### 3.2. El contrato ruta↔layout

```ts
/** What a route needs to know about its layout's holes. A `LayoutDocument` is one. */
export type LayoutHoles = Pick<LayoutDocument, 'renderBody' | 'renderSections'>;

export function missingRequiredSections(route: RouteDocument, layout: LayoutHoles): readonly RenderSectionNode[];
export function holeContractDiagnostics(route: RouteDocument, layout: LayoutHoles): readonly Diagnostic[];
```

Puro sobre los dos documentos, sin disco: lo llaman `resolveDocument` en el build y el índice
del workspace en el editor. `packages/compiler/src/layout/contract.ts`.

### 3.3. El emit

```ts
class MarkupEmitter {
  /** As `emitChildren`, stamping `slot="<slot>"` on every element appended under `parent`. */
  emitSlotted(children: readonly HtmlContent[], parent: string, slot: string): void;
}

interface MarkupOptions {
  /** Each outermost construct is followed by a `LAYOUT_ANCHOR` comment — a layout's body. */
  readonly anchors?: boolean;
}

/** The comment a layout leaves behind each outermost construct of its body. */
export const LAYOUT_ANCHOR = 'fud:l';
```

El contrato `layout(data, io, route, $ioc, props)` y `page(data, io, $ioc, props)` **no cambia**:
el slot lo sella el módulo de la ruta, que ya conoce su layout por el grafo.

### 3.4. Los argumentos de `@render` (decisión 135)

```
@render ficha("Primera", tono: "success")          ← literales tal cual
@render pie(@seccion)                              ← lo que lee el scope, con @
@render ficha(@post.titulo, tono: @(a ? "x" : "y")) ← una expresión, con @( … )
```

Es la regla de las props: `.tone="info"` frente a `.tone=@tono`. `PositionalArg.value` y
`NamedArg.value` son **el JS sin la `@`**, así que la expansión, la comprobación de aridad y
tipos y la proyección leen lo mismo que antes.

### 3.5. El editor

- `IndexEntry` gana `holes: LayoutHoles` y `snippets: readonly SnippetSignature[]`.
- `TemplateContext.host` admite `null`: la raíz de un cuerpo de `@snippet`, cuyo componente es el
  de quien lo invoca.
- `COMPLETION_TRIGGER_CHARACTERS` gana `(` y `,` (`HOLE_TRIGGER_CHARACTERS`), que solo abren
  lista dentro de los paréntesis de un hueco o de un `@render`.
- Caps `USER_UNCOLOURED_CAPS`: código del autor cuyo color no da TypeScript.

---

## 4. Comportamiento

### 4.1. El body de un layout es marcado (decisión 133)

Se admiten componentes, `@render`, expresiones, `@if`, `@switch` y bucles, y las props del layout
se leen en cualquier sitio. `FUD0704` se retira. `FUD0705` se queda solo para `@{ }`, en
cualquier profundidad del body: un layout declara sus props y ninguna lógica propia (SDD-40
§4.1), y un bloque de sentencias sería esa lógica escrita un nivel más abajo. `FUD0706` (un `@`
en un `<style>` del layout) no cambia. Las props siguen sin poder ser reactivas (`FUD0701`).

Los `<link>` del `<head>` del layout no llegan al HTML, como antes.

### 4.2. Un hueco nunca vive dentro de un constructo (`FUD0443`)

Un `@RenderBody()` o `@RenderSection()` dentro de un `@if`, un `@switch` o un bucle del layout es
error: una rama que no corre se come la ruta, un bucle la escribe N veces, y en los dos casos el
chunk de la ruta ya no encuentra sus nodos. Se reporta una vez por hueco, desde el constructo más
externo.

### 4.3. Un constructo del layout deja un ancla

El chunk de cliente de una ruta cruza el markup del layout **contando elementos** (SDD-39 §4.3).
Un constructo del layout escribe un número de elementos que no se sabe hasta que corre. Por eso
el servidor, en el body de un layout, escribe `<!--fud:l-->` detrás de cada constructo **más
externo**, y el plan del cliente (`composePage`) convierte ese constructo en un paso `anchor`: el
cursor se coloca en el primer elemento tras la N-ésima ancla de ese nivel, en vez de avanzar a
ciegas. Solo el más externo, porque el ancla de uno interno caería entre los hermanos de la
salida del externo. Nada de esto ancla código fuente del layout en el chunk: sigue habiendo una
sola entrada en `sources`.

### 4.4. Un layout se reconoce por cualquier hueco (enmienda la 82)

Un documento con doctype es layout si tiene **cualquier** `@RenderBody()`, `@RenderHead()` o
`@RenderSection()`. Sin ninguno es una página. Un layout sin `@RenderBody()` es `FUD0423` en su
propio fichero, sobre el `<body>`. Antes, borrar el `@RenderBody()` para reescribirlo convertía el
fichero en página a mitad de edición, y el editor pasaba a ofrecer `data` y `@()` y a dejar de
ofrecer los huecos.

### 4.5. El slot de un hueco

Con `slot: "x"`, el módulo de la ruta escribe `$dom.setAttr(el, 'slot', "x")` en cada elemento
que cuelga directamente del padre del hueco, **también los que escribe un `@if` o un bucle** de la
ruta en esa raíz. El chunk de cliente hace lo mismo con los elementos que crea al re-renderizar
uno de esos constructos: si no, la raíz nueva caería en el slot por defecto. Dos cosas lo rompen, y las dos son del contrato (§4.6): texto en la raíz
(`FUD0441`: un nodo de texto no lleva atributos y caería en el slot por defecto) y una raíz que ya
escribe su propio `slot=` (`FUD0442`).

El `slot:` se valida contra el componente que rodea el hueco, igual que un `slot=`: en el build
con `FUD0199` (el analizador `slot-name` recibe los huecos por un callback nuevo del recorrido,
`hole`), en el editor con `$intoSlot<$Slots>` sobre la proyección, que además da la lista de
nombres.

### 4.6. El contrato ruta↔layout

`holeContractDiagnostics(route, layout)`:

| Código | Qué | Dónde |
|---|---|---|
| `FUD0440` | La ruta no declara una sección `required: true`. Un solo diagnóstico que nombra todas. | El `<link rel="layout">` de la ruta, como `FUD0702`. |
| `FUD0441` | Texto o una expresión en la raíz de un hueco con slot, constructos atravesados. | El nodo. |
| `FUD0442` | Una raíz de un hueco con slot que escribe su propio `slot=`. | El atributo. |

En el build lo emite `resolveDocument` (que ya emitía `FUD0429`); en el editor, el servicio de
diagnósticos con el layout que da el índice. **Una sola función, dos llamadores.**

La bombilla de `FUD0440` escribe **todas** las secciones que faltan, vacías, tras la última
`@section` de la ruta o al final del fichero: *«Añadir las secciones requeridas del layout
(cabecera, pie)»*.

### 4.7. Los argumentos de `@render` (decisión 135, revoca la 13 de SDD-29)

El parser clasifica cada valor:

- **Literal** — string (`"…"`, `'…'`, o una plantilla sin `${`), número, `true`, `false`,
  `null` — va tal cual.
- **`@nombre`** o un camino — `@a.b`, `@a?.b`, `@count()` — con la `@` quitada del valor.
- **`@( … )`** — el grupo entero es el valor; lo que venga detrás es `FUD0445`.
- **Cualquier otra cosa** es `FUD0444`, y su JS se conserva: la llamada degradada se expande
  como estaba escrita.

`FUD0833` («sin `@` en la cabecera de un `@render`») se retira. La bombilla de `FUD0444` escribe
`@nombre` si es un nombre o un camino, y `@( … )` si no.

El formateador vuelve a poner la `@` —la lee del fuente justo antes del valor— y deja
`@( … )` tal como está escrito: el formateador de hojas leería `(a ? b : c)` como una expresión
entre paréntesis y los quitaría.

### 4.8. Un snippet no conoce su componente

La raíz del cuerpo de un `@snippet` acaba donde se invoque, así que un `slot=` ahí nombra un slot
de un componente que ese fichero no ve. Ni la proyección (`host: null`) ni `FUD0199` lo comprueban
en el fichero del snippet; se comprueba en el consumidor, tras la expansión.

### 4.9. El editor

**Un `@` en el body de un layout** ofrece los huecos, `@render` (si el fichero tiene snippets),
las props del layout y el control de flujo. Nunca `@data` ni `@()`. Al aceptar `@RenderBody` el
cursor queda dentro del paréntesis y se abre la lista.

**Dentro de los paréntesis de un hueco**, por texto y no por AST (se está escribiendo):

| Posición | Ofrece |
|---|---|
| `@RenderBody(|)`, `@RenderSection(nav, |)` | los argumentos que faltan: `required: true` y cada slot del componente que rodea el hueco, ya escrito como `slot: "x"` |
| `slot:|` | cada slot entre comillas |
| `slot: "|"` | los nombres solos |
| `required:|` | `true`, `false` |
| el nombre de la sección | nada |

Los slots salen del contrato del componente en el índice. `(` y `,` abren la lista solos; fuera
de un hueco o de un `@render` no abren nada.

**`@render`:** tras `@render ` salen los snippets locales, los importados (con su firma en el
detalle) y cada espacio de nombres; tras `campos.`, los de ese fichero. Dentro de los paréntesis,
los valores de la vista con su `@` —solo lo que esa vista ve— y los parámetros que la llamada no
ha dado aún, como `texto:`. Tras `nombre:`, solo valores.

**Colores:** el nombre de un `@render` se proyecta como `$Sn0.nombre`, y TypeScript lo pintaba como
propiedad. La proyección no le cede ese color (`USER_UNCOLOURED_CAPS`) y el servidor lo pinta como
`function` (y el espacio de nombres como `namespace`).

---

## 5. Invariantes

- **El parser nunca lanza.** Un argumento que no se entiende es `FUD0433` y el nodo se produce
  con lo leído; un argumento de `@render` sin `@` conserva su JS.
- **Spans universales.** `SlotArgument` lleva el span del literal; los seis códigos nuevos,
  el suyo.
- **Una sola regla, dos llamadores.** El contrato de los huecos y la regla del body son la misma
  función en el build y en el editor.
- **Una fuente por módulo.** El chunk de la ruta cruza el layout con llamadas al cursor y anclas
  por posición; ni un byte del layout llega a su source map.
- **Contrato aguas abajo intacto.** `page(data, io, …)` y `layout(data, io, route, …)` no cambian
  de forma.

### Catálogo de diagnósticos

| Código | Nivel | Regla |
|---|---|---|
| `FUD0440` | error | Sección `required: true` del layout que la ruta no declara. Con bombilla. |
| `FUD0441` | error | Texto o expresión en la raíz de un hueco con slot. |
| `FUD0442` | error | Raíz de un hueco con slot con su propio `slot=`. |
| `FUD0443` | error | Hueco dentro de un `@if`, `@switch` o bucle del layout. |
| `FUD0444` | error | Argumento de `@render` que lee el scope sin `@`. Con bombilla. |
| `FUD0445` | error | `@` de un argumento seguida de algo que no es un camino, o `@( … )` con algo detrás. |
| `FUD0423` | error | *Ampliado:* también lo emite la pasada de estructura, en el propio layout sin `@RenderBody()`. |
| `FUD0705` | error | *Estrechado:* solo `@{ }` en el body de un layout. |
| `FUD0704` | — | **Retirado.** Leer una prop del layout en el body es justo para lo que sirve envolver la ruta en un componente. No se reutiliza. |
| `FUD0833` | — | **Retirado.** La regla es la contraria (decisión 135). No se reutiliza. |
| `FUD0446`–`FUD0449` | — | Reservados. |

---

## 6. Criterios de aceptación

**Compilador**

1. `@RenderBody(slot: "x")` y `@RenderSection(n, required: true, slot: "x")` producen sus campos;
   el orden de los argumentos da igual; clave desconocida, repetida, sin `:`, valor de tipo
   equivocado o `@RenderHead(slot: …)` son `FUD0433` con span.
2. En el body de un layout, componentes con props del layout, `@render`, expresiones y
   constructos no dan diagnóstico; `@{ }` es `FUD0705`, a cualquier profundidad.
3. Un hueco dentro de un constructo es `FUD0443`, una vez.
4. Un documento con doctype y solo `@RenderHead()` es layout con `FUD0423`; sin ningún hueco,
   página.
5. La ruta sella `slot="x"` en cada raíz del cuerpo y de la sección con slot, las de un `@if` o un
   bucle incluidas, y en nada más. **También en el cliente:** una raíz que el chunk de la ruta crea
   al re-renderizar un `@if` o un bucle reactivo sale con su `slot=`.
6. `FUD0440` sobre el `<link rel="layout">` nombrando todas las que faltan; `FUD0441` y `FUD0442`
   sobre su nodo; nada cuando se cumple.
7. `slot:` que el componente de alrededor no declara es `FUD0199` en el build; fuera de un
   componente, también.
8. Un constructo del body del layout escribe `<!--fud:l-->` detrás, solo el más externo, y el
   chunk de una ruta reactiva salta al ancla: el botón de la ruta responde con un `@foreach` del
   layout delante del hueco.
9. `@render` acepta literales tal cual y `@nombre`, `@a.b`, `@f()`, `@( … )` quitando la `@`;
   una referencia sin `@` es `FUD0444` y conserva su JS; `@a + b` o `@(a) b` son `FUD0445`.
10. El formateador conserva la `@` y deja `@( … )` tal cual; idempotente sobre el fixture.
11. Un `slot=` en la raíz de un `@snippet` no es `FUD0199` en el fichero del snippet.

**Editor**

12. Un `@` en el body de un layout ofrece `@RenderBody`, `@RenderSection`, `@render`, las props y
    el control de flujo, y no `@data` ni `@()`; también sin `@RenderBody()` escrito.
13. Dentro de los paréntesis de un hueco, las tablas de §4.9; `(` y `,` abren solos, y fuera de un
    hueco o un `@render` no abren nada.
14. `FUD0440` llega al editor y su bombilla escribe las secciones.
15. Tras `@render ` salen los snippets locales, importados y espacios de nombres; entre sus
    paréntesis, los valores de la vista con `@` y los parámetros; `FUD0444` tiene bombilla.
16. `slot: "x"` en un hueco se comprueba contra el componente de alrededor sobre la proyección; en
    un snippet, un `slot=` en la raíz no es `TS2345`.
17. El nombre de un `@render` sale como token `function`.

**Evidencia en `examples/basic`**

18. `_layout-marco.fud` envuelve su ruta en `app-marco` —la rejilla y su CSS—, le pasa una prop,
    invoca un snippet con otra, tiene un contador interactivo cuyo `start` es otra prop y un
    `@foreach` sobre una cuarta delante de los huecos. `/marco` y `/marco-sin-lateral` rellenan
    sus secciones con hermanos sueltos; la segunda no declara `lateral` y ve el contenido por
    defecto del slot. `/snippets` pasa valores del scope con `@`.
19. Verificado por Pedro en el navegador y en el editor.
20. **Cobertura.** Los ficheros nuevos al 100 % en las cuatro métricas; ningún paquete por debajo
    de su suelo en `main`.

---

## 7. Fuera de alcance

- **Hidratar un componente del layout con props reactivas.** Las props del layout siguen siendo
  valores de render (`FUD0701`); un componente interactivo del layout se hidrata con su payload
  normal, que es lo que hace el contador del ejemplo.
- **Secciones en componentes.** La decisión 90 no cambia: en un componente la proyección es
  `<slot>`.
