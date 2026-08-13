# BUG-23 — el `@` es una válvula de escape, y el editor calla donde más se escribe

**Estado:** `Listo` · **Rama:** `worktree-bug-23` · **Tareas:**
[BUG-23-Task.md](./BUG-23-Task.md)

> **Paquetes:** `compiler` · `language-core` · `language-server` · `formatter` · `vscode` · `vite`
> **Corrige:** gramática 2, 8, 23, 29, 99 · SDD-23 §4.4 · SDD-24 §4.2 · SDD-26 §4.5 · props-spec 70–73

---

## 1. Contexto y síntoma

El compilador cerró BUG-22 con el editor sabiendo **dónde** está el cursor. Lo que este BUG
mide es lo que pasa **cuando ya lo sabe**: en las siete posiciones donde de verdad se escribe
un `.fud` —el punto de una prop, el `@data.` de una ruta, el valor de un atributo, el
manejador de un evento, el `@` de un nodo de texto, el nombre de un slot y el hueco de una
prop que falta— el editor no contesta, contesta de más, o contesta lo que no es.

El fichero que lo reproduce entero es este, y todos los síntomas se ven sobre él:

```fud
<link rel="layout" href="../layouts/_layout.fud">
<link rel="component" href="../components/app-circle.fud">

@code {
  type PageData = { title: string };

  @server {
    export async function load(): Promise<PageData> {
      return { title: 'Untitled' };
    }
  }
  @client {
    import { signal } from '@fudic/core';
    const items = [{ id: 1 }];
    const counter = signal({ id: 1 });
    function onClick(ev: PointerEvent) {}
  }
}

<h1>Home</h1>
<div>@(counter().id) @data.title</div>

<app-circle .name="@data.title"></app-circle>

@foreach (const item of items) key (item.id) {
  <div id="@item.id"></div>
  <div @mousedown="@onClick($event)">@data.title</div>
}

<div slot="PEPITO"></div>
```

Siete síntomas, en el orden en que los encontró Pedro:

| # | Síntoma | Lo que se esperaba |
|---|---|---|
| 1 | Tras `.` en `<app-circle .\|>` la lista trae `id`, `class`, `style`, `title`, `role`, `data-*`, `aria-*`… mezclados con las props | **Solo** las props del componente, y sin pulsar <kbd>Ctrl</kbd>+<kbd>Espacio</kbd> |
| 2 | En una ruta, `@data.\|` no ofrece nada: el punto no es del `@`, es texto | Los miembros de `PageData`, y solo esos |
| 3 | `.prop=@name` es `FUD0056` («el valor debe ir entrecomillado») y `@counter().id` no es una expresión: hay que escribir `.prop="@(counter().id)"` | `.prop=@name` y `.prop=@counter().id` legales dentro del tag |
| 4 | `@mousedown="@onClick($event)"` da **dos** errores de TypeScript: *no se encuentra el nombre `$event`* y *no se puede asignar un argumento de tipo `void` al parámetro `(ev: MouseEvent) => unknown`*. El compilador, en cambio, lo emite perfectamente | El editor tiene que decir lo mismo que emite el build |
| 5 | En texto, `@` ofrece solo los snippets (`@if`, `@foreach`, `@code`…) y ni `data`, ni las props, ni las signals | Los snippets **y** lo que hay en ámbito |
| 6 | `<div slot="PEPITO">` fuera de cualquier host no da error; `<div slot="p">` dentro de `<app-circle>` tampoco; y `slot="\|"` no completa | Error en los dos, y la lista de slots del padre al completar |
| 7 | `<app-circle></app-circle>` sin pasar `name` —una prop **requerida**— no da error ni en *Problems* ni en `pnpm build` | Error en los dos sitios |

Debajo de los siete hay una sola frase, y es la que da nombre al BUG: **`@( … )` se ha
convertido en la válvula de escape del compilador y del language server**. Todo lo que la
expresión implícita no admite —una llamada, un índice, un encadenamiento— obliga a escribir
paréntesis, y esos paréntesis son también el sitio donde el editor deja de entender lo que hay
dentro. Razor resuelve esto con un carácter y una regla de continuación; fudic tiene el
carácter y le falta la regla.

---

## 2. Causa raíz

Siete síntomas, **seis** causas: la 1 y la 7 comparten la misma línea.

### 2.1 El punto ofrece el vocabulario de HTML porque el literal es uno solo (síntomas 1 y 7)

[`globals.ts:52`](../../../packages/language-core/src/globals.ts#L52) declara
`$attrs<T>(a: T & $GlobalAttrs)`, y
[`attrs.ts:147-158`](../../../packages/language-core/src/template/attrs.ts#L147-L158) proyecta
**un** literal por host de componente con las props dentro. El tipo contextual del ancla del
punto es por tanto `$C0 & $GlobalAttrs`, y esa intersección **es** la lista que el editor
enseña: las props del componente y las once claves globales, más los índices `data-*`/`aria-*`.

La misma línea explica el síntoma 7. Cuando falta una prop requerida, TypeScript reporta
`TS2739` sobre el **argumento entero** —desde la `{` hasta la `}`—, y ese rango empieza y
acaba en tramos de andamiaje (`ctx.w.scaffold('>({')`, `SCAFFOLD_CAPS`). Volar solo mapea un
rango de vuelta cuando **sus dos extremos caen en un mismo tramo** que lleva `verification`
—es la lección del `@section` de SDD-24 y del `slot=` de BUG-11—, así que el error se produce
y no llega a nadie. No es que no se compruebe: es que se comprueba y se tira.

**Alcance.** Todo host de componente. Y el hueco (`<app-badge |>`) hereda la misma lista, que
es correcta por accidente: ahí sí caben los globales, pero también ofrece props que en esa
posición no se pueden escribir (desde BUG-16 §41.c, sobre un componente `.prop` es la única
vía).

### 2.2 El punto colgante no es del `@` (síntoma 2)

[`at.ts:195-200`](../../../packages/compiler/src/at/at.ts#L195-L200): un `.` solo continúa el
camino si detrás hay un identificador de verdad. Es la decisión 2, y para el **emit** es la
correcta: `@name.` en prosa es una interpolación seguida de un punto literal.

Para el **editor** es fatal, porque el instante en que se pide el completado es exactamente ese:
`@data.` tiene el punto escrito y el nombre sin escribir. Como el punto no pertenece al nodo,
la proyección escribe `$text(data);` y el offset del cursor cae **fuera** de la copia — no hay
posición desde la que preguntar por los miembros de `$Data`.

**Alcance.** Los mismos: `@item.`, `@props.`, `@counter.`, en contenido y en valor de atributo.
Es la razón por la que hoy hay que escribir `@(data.title)` para que el punto complete: dentro
del paréntesis el texto es JS copiado y ahí TypeScript sí contesta. La válvula de escape.

### 2.3 Un valor sin comillas es texto, y la llamada solo vale al final de un evento (síntoma 3)

Dos líneas, una detrás de otra:

- [`lexer.ts:541`](../../../packages/compiler/src/lexer/lexer.ts#L541) →
  [`lexer.ts:576`](../../../packages/compiler/src/lexer/lexer.ts#L576): tras un `=`, todo lo
  que no abra comillas se escanea como **`text`**, hasta el primer blanco o `>`. El `@` no se
  mira. [`parser.ts:580-591`](../../../packages/compiler/src/html/parser.ts#L580-L591) lo
  convierte en `attribute-text` y emite `FUD0056`.
- [`at.ts:204`](../../../packages/compiler/src/at/at.ts#L204): el sufijo de llamada
  (decisión 99) se admite **solo** con `options.call`, que el parser activa únicamente en el
  valor de un `@evento`/`bus:`
  ([`parser.ts:491`](../../../packages/compiler/src/html/parser.ts#L491)), y **solo como
  sufijo final**: `@counter()` es una expresión, `@counter().id` es la expresión `counter()`
  seguida del texto literal `.id`.

De ahí las dos formas que Pedro quiere retirar: `.prop="@name"` en vez de `.prop=@name`, y
`.prop="@(counter().id)"` en vez de `.prop=@counter().id`.

**Alcance.** Todos los bindings: `.prop`, `@evento`, `class:`, `style:`, `bus:`, `ref`, y el
atributo plano interpolado.

### 2.4 La proyección no sabe que una llamada es una invocación diferida (síntoma 4)

[`events.ts:92`](../../../packages/compiler/src/emit/events.ts#L92) es la regla del compilador:
si la raíz del valor es un `CallExpression`, lo emitido es `($event) => del(…)` — la llamada se
evalúa **en el dispatch**, con `$event` como parámetro del arrow (decisiones 96–98).

[`attrs.ts:277-283`](../../../packages/language-core/src/template/attrs.ts#L277-L283) no conoce
esa regla: copia el valor tal cual dentro de `$on('mousedown', onClick($event))`. De ahí los dos
errores que Pedro pegó, y son consecuencia mecánica de esa línea:

- `$event` no está declarado en ninguna parte de la proyección → *no se encuentra el nombre*;
- `onClick($event)` es `void`, y `$on` pide `(ev: MouseEvent) => unknown` → `TS2345`.

Hay una razón por la que no lo sabe: **la proyección no tiene AST del valor**.
[`js-batch.ts:52-56`](../../../packages/language-server/src/js-batch.ts#L52-L56) registra en el
batch de Oxc solo las interpolaciones de **contenido**; los valores de atributo no se registran,
así que `language-core` no puede preguntar «¿la raíz de esto es una llamada?». Distinguirlo por
texto no vale: `@(x ? a : b)()` y `@(f)` no se separan con una expresión regular.

**Alcance.** `@evento` y `bus:`, en las dos formas (implícita con sufijo y explícita
`@(f(x))`). Y de paso: **`FUD0291`** —valor de evento cuya raíz no es referencia / lambda /
función / llamada— vive en el emit, así que hoy el editor no lo enseña nunca; solo aparece en
`pnpm build`.

### 2.5 El `@` en texto lo contesta el servidor, y contestar es callar a los demás (síntoma 5)

[`plugin.ts:490-494`](../../../packages/language-server/src/services/plugin.ts#L490-L494)
devuelve la lista de snippets desde `createFudicService`, que **no** es
`isAdditionalCompletion`. En Volar el primer plugin que devuelve items no-vacíos con una
capacidad de completado no-adicional fija `mainCompletionUri` y **salta a todos los demás** —es
exactamente lo que BUG-15 §4.6 documentó para el `<` y resolvió con un segundo plugin.

Así que en `@|` y en `@fore|` los cuatro snippets tapan a TypeScript, que en esa misma posición
tiene `data`, `items`, `counter`, las props destructuradas y todo lo importado en `@client`.

**Alcance.** Solo la rama de la directiva. Las otras cuatro (href, `@section`, `class:`, y el
par punto/arroba) son exactas y contestar solas ahí es lo correcto.

### 2.6 El `slot` se comprueba contra el tag equivocado, y solo si el tag es un componente (síntoma 6)

[`attrs.ts:169-170`](../../../packages/language-core/src/template/attrs.ts#L169-L170):
`emitIntoSlot` se llama **desde `emitProps`**, y `emitProps` solo corre en tags con guion. Un
`<div slot="p">` pasa por `emitNativeAttrs`, que ignora todo lo que no sea una interpolación:
no se comprueba nada.

Y cuando sí se llama, [`attrs.ts:222`](../../../packages/language-core/src/template/attrs.ts#L222)
pide `slotsAliasOf(el.name)` — el `$Slots` **del elemento que lleva el `slot=`**, cuando la
ranura la declara su **padre**. Que hoy funcione en `<app-badge slot="meta">` dentro de
`<app-card>` es una coincidencia: solo acierta si los dos declaran la misma ranura.

La tercera mitad del síntoma es el perfil:
[`attrs.ts:231`](../../../packages/language-core/src/template/attrs.ts#L231) proyecta el nombre
con `DIAGNOSTIC_ONLY_CAPS`, que tiene `completion: false`. Por eso `slot="|"` no ofrece nada,
mientras que `@|` sí ofrece los eventos —ese usa `LITERAL_NAME_CAPS`, el perfil que BUG-16 §6
tuvo que inventar justo para esto.

**Alcance.** Todo `slot=`, en elemento nativo y en componente.

### 2.7 El build no sabe qué props tiene el hijo (síntoma 7, la mitad del `build`)

[`oxc-code.ts:21-24`](../../../packages/compiler/src/emit/oxc-code.ts#L21-L24): `Prop` es
`{ name, def? }`. El emit sabe **cómo se llaman** las props del hijo y **qué default** tienen,
y no si son requeridas: el `?` vive en el argumento de tipo de `props<T>()`, que hoy nadie lee.

[`model.ts:30-32`](../../../packages/compiler/src/semantic/model.ts#L30-L32): la
`ComponentRegistry` del pase semántico solo contesta `has(tag)`. No hay ningún sitio donde
preguntar «¿qué props declara `app-circle` y cuáles son obligatorias?», así que
[`markup.ts:266`](../../../packages/compiler/src/emit/markup.ts#L266) llama al `render` del hijo
con el literal que sea, y `pnpm build` sale verde.

---

## 3. Interfaz pública

### 3.1 `@fudic/compiler`

```ts
// at/at.ts — la expresión implícita pasa a ser una CADENA (decisiones 100-102)
export interface RazorExpression extends Node {
  readonly type: 'razor-expression';
  readonly kind: RazorExpressionKind;
  readonly span: Span;
  readonly expr: Span;
  readonly regions: readonly LexRegion[];
  /**
   * El `.` (o `?.`) escrito sin nombre detrás, con el que la cadena se cortó. NO forma
   * parte de `span` ni de `expr`: para el emit sigue siendo texto literal (decisión 2).
   * Es el editor quien lo necesita, y por eso viaja aparte.
   */
  readonly dangling?: Span;
}

// `ImplicitOptions.call` DESAPARECE: la cadena admite llamadas en cualquier posición.
export function scanImplicitExpression(source: string, atOffset: number): ParseResult<RazorExpression>;

// binding/handler.ts (NUEVO) — la regla de decisión 96-98, extraída del emit
export type HandlerShape = 'reference' | 'call' | 'lambda' | 'unsuitable';
export function handlerShape(root: OxcNode | undefined): HandlerShape;

// semantic/walk.ts — el visitor llega por fin a los valores de atributo
export interface TreeVisitor {
  /** Toda expresión Razor en valor de atributo, con el atributo que la lleva. */
  binding?(expr: RazorExpression, attr: Attribute, el: ElementNode): void;
}

// semantic/model.ts — la registry contesta una pregunta más
export interface ComponentDeclaredProps {
  readonly name: string;
  readonly required: boolean;
}
export interface ComponentRegistry {
  has(tag: string): boolean;
  /** Las props declaradas por el tag, o `undefined` cuando no se pueden conocer. */
  propsOf?(tag: string): readonly ComponentDeclaredProps[] | undefined;
}

// emit/oxc-code.ts
export interface Prop {
  readonly name: string;
  readonly def?: string;
  /** `false` cuando la clave de `T` no lleva `?`. `true` también cuando `T` no es legible. */
  readonly optional: boolean;
}
```

### 3.2 `@fudic/language-core`

```ts
// globals.ts — dos globales nuevos, y `$on` sin tocar
declare function $props<T>(p: T): void;                     // el literal del PUNTO: sin $GlobalAttrs
declare function $required<T, K extends PropertyKey>(rest: $Missing<T, K>): void;

// emit.ts — el batch que se recibe deja de ser solo el de la zona neutra
export interface EmitJs {
  readonly result: JsBatchResult;
  readonly neutral: readonly FragmentId[];
  /** El AST del fragmento registrado en ese span, para preguntar por la forma de un handler. */
  ast?(at: Span): FragmentAst;
}
```

### 3.3 `@fudic/language-server`

Sin firmas nuevas. Dos cambios de reparto:

- los snippets de directiva se sirven desde el plugin **adicional** (`createFudicTagService`,
  que pasa a llamarse `createFudicAdditiveService`);
- `batchDocumentJs` registra también los valores de atributo, y `DocumentJs` expone
  `ast(span)`.

### 3.4 `@fudic/formatter` y `fudic-vscode`

El formateador imprime **sin comillas** un valor que sea una sola expresión Razor
(`.prop=@name`), y conserva las comillas en todo lo demás. La gramática TextMate gana el caso
del valor sin comillas.

---

## 4. Comportamiento corregido

### 4.0 Tres decisiones, y una hay que confirmarla

**(a) La cadena implícita, ¿en todas partes o solo dentro del tag?** Recomendada: **en todas
partes** (paridad Razor). `@counter().id` significa lo mismo en texto y en un valor, y es lo que
retira `@( … )` como válvula. El precio es el de Razor: un paréntesis literal detrás de una
interpolación (`@precio(IVA incluido)`) pasa a leerse como llamada, y se escapa con `@@` o se
escribe `@(precio)`. La alternativa conservadora —cadena solo en valor de atributo, contenido
como hoy— deja `@(counter().id)` vivo en los nodos de texto, que es justo lo que el síntoma 5
señala. **Se implementa (a) salvo indicación en contra.**

**(b) El hueco del tag abierto ofrece globales, no props.** `<app-badge |>` pasa a completar
contra `{} & $GlobalAttrs`, y las props se alcanzan con el punto. Es lo coherente con la
decisión 41.c —sobre un componente `.prop` es la única vía—, y **cambia el §6.3 de SDD-24**,
que hoy fija lo contrario.

> **Y el punto es lo único que hace falta enseñar.** No se inventan ítems sintéticos con el
> punto ya puesto en el hueco: una regla que el usuario aprende una vez —«las props van con
> `.`»— vale más que una lista que se lo recuerda a medias en dos sitios distintos. La única
> excepción es la expansión del tag, abajo, donde no hay nada que pulsar todavía.

**(b.2) Al expandir el tag se insertan las props REQUERIDAS, y ninguna más.** `app-button` +
<kbd>Tab</kbd> escribe `<app-button .label="$1" .href="$2">$0</app-button>`: las requeridas son
exactamente las que el usuario no puede olvidar —son las que reporta `FUD0197`— y las
opcionales se alcanzan con el punto como todo lo demás. Un componente de doce props se expande
con dos tabstops, no con doce. Con `propsOf` ausente (tarea 17), el snippet es el de hoy.

**(c) El formateador normaliza a la forma sin comillas.** Un valor que es una sola expresión se
imprime `=@expr`. No es opción configurable: el formateador ya tiene opinión sobre las comillas
de todo lo demás.

### 4.1 Gramática: decisiones 100–104

**100. La expresión implícita es una cadena, no un camino.** Detrás del identificador inicial se
admiten, repetidos y en cualquier orden: `.nombre`, `?.nombre`, `( … )` balanceado y `[ … ]`
balanceado. Se corta —en silencio, como hasta hoy— ante cualquier otra cosa. Retira la
decisión 99 (el sufijo único al final de un evento) y precisa la 29.

**101. La adyacencia manda.** La cadena nunca cruza un blanco: `@del (x)` es el camino `del`
seguido del texto ` (x)`. Es la regla que `@raw(` ya seguía.

**102. El `.` colgante se anota, no se consume.** `@data.` sigue siendo la expresión `data` más
un punto literal en la salida (decisión 2 intacta), pero el nodo recuerda dónde estaba ese punto
para que el editor pueda preguntar por los miembros. Un `?.` colgante igual.

**103. Un valor de atributo puede ir sin comillas si es una sola expresión `@`.** `.prop=@name`,
`@click=@onClick($event)`, `class:on=@active`. Termina donde la cadena termina, y `FUD0056` sigue
vivo para todo lo demás: `id=foo` sigue siendo un error. Es una excepción **a la decisión 8**, no
su derogación.

**104. `@( … )` es para expresiones que no son cadenas.** Operadores, literales, `new`,
ternarios, `await`: `@(1 + 1)`, `@(new Date().toISOString())`, `@(a ? b : c)`. Con las 100–103
deja de ser la vía de escape y pasa a ser lo que su nombre dice.

### 4.2 La proyección: cinco reglas

1. **Dos literales por host, repartidos por la sintaxis.** `.prop` va a
   `$props<$C0>({ … })` —sin `$GlobalAttrs`, así que el punto ofrece **solo** el contrato—; el
   atributo plano va a `$attrs<{}>({ … })`, que ahora se emite **siempre**, porque es donde
   viven las anclas de hueco (decisión (b)).
2. **La completitud se comprueba aparte, sobre un ancla de un solo tramo.**
   `$required<$C0, 'name' | 'tone'>(⟨{} sobre el nombre del tag⟩)`, donde `K` es la unión de las
   props escritas. Si no falta ninguna, el parámetro es `{}` y no hay error; si falta `name`, el
   parámetro es `{ name: string }` y el `TS2345` cae **sobre el nombre del tag**, con el nombre
   de la prop que falta en el mensaje.
3. **Un handler que es una llamada se proyecta como invocación diferida.**
   `$on('mousedown', ($event) => onClick($event))`. `$event` no se declara en ningún `.d.ts`: es
   el parámetro del arrow, y su tipo lo da contextualmente `$on` — `MouseEvent` en `@mousedown`,
   `never` en un evento con guion o en un `bus:`. Las otras tres formas (referencia, lambda,
   función) se copian como hoy.
4. **El punto colgante se copia bajo `COMPLETION_ONLY_CAPS`.** `$text(data.);` es sintaxis
   incompleta a propósito: TypeScript se recupera y contesta la lista de miembros, y el
   «Identifier expected» cae en un tramo sin `verification` y no llega a nadie.
5. **El `slot` se comprueba contra el `$Slots` del PADRE.** Sin padre componente, contra `never`.
   El nombre se proyecta 1:1 con `LITERAL_NAME_CAPS` —completado **y** diagnóstico— y `slot=""`
   recibe el ancla de dos caracteres que `@|` ya usa.

### 4.3 El servidor

La rama de la directiva deja de ser exclusiva: sus snippets se sirven desde el plugin adicional,
así que en `@|` conviven los cuatro snippets y lo que TypeScript ve en ámbito. Las otras cuatro
ramas exactas no se tocan.

### 4.4 El build

`Prop` gana `optional`, leído del argumento de tipo de `props<T>()` cuando es un literal de tipo
—que es la forma canónica, porque la decisión 68 obliga al destructuring a cubrir todas las
claves de `T`—. Con eso, en el punto donde el emit compone el `render` del hijo
([`markup.ts:266`](../../../packages/compiler/src/emit/markup.ts#L266)):

- **`FUD0197`** — prop requerida no pasada, sobre el tag de apertura del host;
- **`FUD0198`** — `.prop` que el hijo no declara, sobre el nombre de la prop;
- **`FUD0199`** — `slot="x"` cuyo padre no declara la ranura `x` (o no es un host), sobre el valor.

Cuando `T` no es un literal de tipo (`props<Foo>()`), no hay información y **no se emite nada**:
el editor sigue cubriéndolo con TypeScript de verdad. Un build no puede inventarse un error que
no puede demostrar.

---

## 5. Invariantes

- **El parser nunca lanza.** `.prop=@` sin nada detrás, `@data.` al final del fichero y
  `@f(` sin cerrar degradan con diagnóstico y siguen.
- **Spans universales.** `dangling` es un `Span` como todo lo demás, y no entra en `span`.
- **Oxc una vez por fichero.** Registrar los valores de atributo **amplía** el batch que ya
  existe; no abre uno segundo. `EmitJs.ast` es el mismo resultado, consultado.
- **Ningún texto emitido sin `Mapping`, y ningún tramo mudo con diagnóstico.** El ancla de
  `$required` es `DIAGNOSTIC_ONLY_CAPS`; el punto colgante, `COMPLETION_ONLY_CAPS`.
- **Editor y build dicen lo mismo.** La forma del handler la decide **una** función
  (`handlerShape`), que usan el emit y la proyección.
- **La salida de nivel 1 no se mueve.** Migrar `.prop="@x"` a `.prop=@x` no cambia un byte de
  los goldens: el AST es el mismo.

---

## 6. Criterios de aceptación

Cada uno se escribe **en rojo primero**, contra el código de hoy.

**Gramática (compiler)**

1. `@counter().id` en contenido y en valor es **una** expresión, con `span` desde el `@` hasta la
   `d` final.
2. `@a?.b[0].c(x)` es una expresión; `@del (x)` es el camino `del` y el texto ` (x)`.
3. `@data.` da la expresión `data` con `dangling` sobre el punto, y el punto **sigue saliendo**
   como texto literal en la salida de nivel 1.
4. `.prop=@name`, `@click=@onClick($event)` y `class:on=@active` parsean sin `FUD0056`;
   `id=foo` lo sigue dando; `.prop=@` degrada con diagnóstico y sin excepción.
5. `handlerShape` clasifica las cuatro formas, y `emit/events.ts` sigue emitiendo byte a byte lo
   mismo que antes de la extracción.

**Proyección (language-core)**

6. En `<app-circle .|>` la lista trae `name` y **no** trae `id`, `class`, `role`, `data-*`.
7. En `<app-circle |>` la lista trae los globales y **no** trae `name`.
8. `<app-circle></app-circle>` con `name` requerida reporta un error **sobre el nombre del tag**,
   con `name` en el mensaje. Con `name` pasada, silencio. Con `name?` opcional, silencio.
9. `@click="@onClick($event)"` y `@click=@onClick($event)` no reportan **nada**, y hover sobre
   `$event` dice `MouseEvent`. Con `@mousedown` dice `MouseEvent`; con `@my-event`, `never`.
10. `@click=@onClick` sigue comprobando la firma: un handler que pide `(n: number)` reporta.
11. `@data.|` ofrece los miembros de `PageData` y ninguno más; el fichero no gana ningún
    diagnóstico por el punto.
12. `<div slot="p">` dentro de `<app-circle>` (que declara `PEPITO`) reporta sobre `p`;
    `<div slot="PEPITO">` sin padre componente reporta; `slot="|"` ofrece `PEPITO`.

**Servidor**

13. En `@|` en markup la lista trae `@if`/`@foreach` **y** `data`, `items`, `counter`.
14. En `@fore|` sigue trayendo `@foreach` (SDD-28 §5.4 intacto).
15. Las cinco medidas de BUG-16 §6.13–§6.14 siguen verdes: `.` sin rango de reemplazo, `.ton`
    con rango sobre `ton`, `@cli` → `click`, `@` → eventos y no `@if`, y `@fore` fuera del tag.
16. `FUD0291` aparece en *Problems* con un valor de evento imposible (`@click=@1`).

**Build**

17. `pnpm build` falla con `FUD0197` en un host al que le falta una prop requerida, y pasa
    cuando se le pasa.
18. `FUD0198` sobre una `.prop` que el hijo no declara; `FUD0199` sobre un `slot` que el padre
    no declara.
19. `props<Foo>()` (tipo con nombre, no literal) no produce ninguno de los tres.

**Herramientas**

20. `fudic fmt` sobre `.prop="@name"` escribe `.prop=@name`, y es idempotente. Sobre
    `title="a @b c"` conserva las comillas.
21. La gramática TextMate colorea `.prop=@counter().id` como expresión, no como texto.
21.b `app-button` + <kbd>Tab</kbd> inserta un tabstop por prop **requerida** y ninguno por las
    opcionales; un componente sin requeridas se expande como hoy.
22. `pnpm typecheck`, `pnpm test` y `pnpm build` verdes; `language-core` y `language-server` al
    **100 %** en las cuatro métricas; `compiler` no baja de donde estaba.

---

## 7. Fuera de alcance

- **`bind:`, `{...spread}`, `ref` y `@raw`** — los cuatro puntos de `PENDIENTES-v1.md` siguen
  donde están. Este BUG no los implementa aunque toque el fichero donde vivirán.
- **`!` de TypeScript y el genérico `<T>` en la cadena implícita.** Las decisiones 4 y 5 siguen
  en pie: `@a!` y `@a<b>` cortan.
- **Reordenar `$event`.** El compilador ya copia la lista de argumentos verbatim; aquí solo se
  proyecta lo mismo.
- **La indentación de TypeScript dentro de `@code`** — sigue anotada en BUG-22 fila 5 y sigue
  siendo del formateador.
- **Completar nombres de prop *sin* el punto en el hueco del tag.** La decisión (b) dice que ahí
  van los globales; ofrecer props con inserción automática del punto es otra conversación.
- **Cambiar la reserva `$`.** `$event` sigue siendo del compilador; lo nuevo es que la
  proyección lo declara donde el emit lo declara.

### Y lo que queda DESPUÉS de este BUG

Cinco cosas que este documento no arregla porque no son suyas, y que están escritas para que no
se pierdan en [IDEA-02 — lo que le falta al editor (y al build) para ser un 10](../ideas/IDEA-02-lo-que-le-falta-para-un-10.md):

1. **`fudic check`** — TypeScript sobre los ficheros virtuales en CI. Hoy toda la comprobación
   de props, eventos y slots vive **solo** dentro de VS Code, y por eso este BUG tiene que
   añadir `FUD0197`–`FUD0199` al compilador. Con el comando, esas tres reglas pasan a ser un
   atajo y no la única red.
2. **Una code action por diagnóstico** — `provideCodeActions` ya existe con el caso del `href`.
3. **Renombrar cruzando ficheros** — medir primero cuánto hace ya la proyección de `$Props`.
4. **Hover con el contrato del componente** — sale del `propsOf` de la tarea 17.
5. **El banco de trabajo** — [IDEA-01](../ideas/IDEA-01-banco-de-trabajo-de-componentes.md).
