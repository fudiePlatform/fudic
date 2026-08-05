# BUG-11 — `slot=` viaja en el literal de props, y con él todo atributo global de HTML

> **Estado:** `Hecho`
> **Corrige:** [SDD-23 — Emisor de TS virtual](../SDD-23-emisor-ts-virtual.md) §4.4, y amplía §7
> **Paquete:** `@fudic/language-core`
> **Rama sugerida:** la del backlog de uso; no comparte fichero con ningún BUG abierto
> **Depende de:** nada

---

## 1. Contexto y síntoma

Abrir [`examples/basic/routes/blog/index.fud`](../../../examples/basic/routes/blog/index.fud) y
poner el cursor sobre `slot`:

```
El literal de objeto solo puede especificar propiedades conocidas
y 'slot' no existe en el tipo '{ tone?: Tone | undefined; }'.  ts(2353)
```

La línea es [`index.fud:48`](../../../examples/basic/routes/blog/index.fud#L48):

```html
<app-badge slot="meta" tone="@(post.featured ? 'success' : 'neutral')">@post.tag</app-badge>
```

y el componente es [`app-badge.fud`](../../../examples/basic/components/app-badge.fud), cuyo
`@code` declara `props<{ tone?: Tone }>()`. **El error está en el ejemplo del propio
repositorio**, y `slot` no es una prop de nadie: es un atributo global de HTML, el mecanismo
estándar con el que un hijo elige la ranura del shadow root que lo va a alojar.

El fichero compila y se renderiza sin problema. Lo único roto es el editor — que es
exactamente lo que SDD-23 existe para no romper.

---

## 2. Causa raíz

### 2.1. La línea

`emitProps` mete en el literal de objeto **todo binding de tipo `attr` o `property`**
([`attrs.ts:74`](../../../packages/language-core/src/template/attrs.ts#L74)):

```ts
const props = bindings.filter((b) => b.binding.type === 'attr' || b.binding.type === 'property');
```

y ese literal se comprueba contra el contrato del componente
([`attrs.ts:76-96`](../../../packages/language-core/src/template/attrs.ts#L76-L96)):

```ts
$attrs<$C0>({ slot: "meta", tone: (post.featured ? 'success' : 'neutral') });
//            ^^^^ TS2353: no existe en `{ tone?: Tone }`
```

El filtro solo aparta los bindings de **comportamiento** —`event`, `bus`, `class`, `style`,
`ref`—. No existe en ninguna parte la noción de «atributo que el elemento entiende por ser un
elemento, y no por ser este componente».

### 2.2. Alcance: no es `slot`, es la mitad del vocabulario de HTML

Caen exactamente igual, sobre cualquier componente:

| Grupo | Atributos |
|---|---|
| Identidad y estilo | `id`, `class`, `style`, `title` |
| Shadow DOM | `slot`, `part`, `exportparts` |
| Internacionalización | `lang`, `dir` |
| Interacción | `hidden`, `tabindex`, `role` |
| Prefijos | `data-*`, `aria-*` |

`class` y `style` **estáticos** caen; los dinámicos se salvan por accidente, porque
`class:algo="@(…)"` y `style:algo="@(…)"` se clasifican como bindings de comportamiento y el
filtro sí los aparta. Que un `class="x"` falle y un `class:x="@(y)"` no es la señal de que el
criterio del filtro no es el correcto.

### 2.3. La otra mitad: el nombre del slot se tira

Aunque `slot` saliera del literal, no habría nada contra lo que comprobarlo.
`<slot name="meta">` proyecta `$slot();` y nada más
([`template/sections.ts:39-42`](../../../packages/language-core/src/template/sections.ts#L39-L42)),
con el propio código diciéndolo: *«a marker with no type of its own, for now (SDD-23 §7)»*. El
`name` no llega a la proyección, así que hoy **ningún fichero del sistema sabe qué ranuras
declara un componente**.

Por eso este BUG no se arregla apartando `slot` y ya: se arregla dándole un contrato, que es lo
que además convierte un error en una función.

### 2.4. Por qué la cobertura al 100 % no lo vio

`language-core` está al 100 % en las cuatro métricas. La rama que produce el fallo está
**ejercitada** —hay tests de `emitProps` con atributos— pero ninguno **typechequea** el virtual
resultante contra el contrato del componente: se afirma el texto emitido, no lo que TypeScript
dice de él. La cobertura mide qué código corre, no qué significa lo que escribe.

---

## 3. Interfaz pública

### 3.1. Dos globales nuevas en `GLOBALS_DTS`

`GLOBALS_DTS` ([`globals.ts`](../../../packages/language-core/src/globals.ts)) tiene **dos**
consumidores: el servidor lo monta en memoria y la CLI lo escribe en `fudic-globals.d.ts`. Un
global nuevo cruza a `@fudic/cli` y a sus tests.

```ts
/** Los atributos que un elemento entiende por SER un elemento, no por ser este componente. */
type $GlobalAttrs = {
  id?: $Scalar; class?: $Scalar; style?: $Scalar; title?: $Scalar;
  lang?: $Scalar; dir?: $Scalar; hidden?: $Scalar; tabindex?: $Scalar;
  part?: $Scalar; exportparts?: $Scalar; role?: $Scalar;
} & { [k: `data-${string}`]: $Scalar } & { [k: `aria-${string}`]: $Scalar };

declare function $attrs<T>(a: T & $GlobalAttrs): void;   // ← la firma cambia
declare function $intoSlot<T extends string>(name: T): void;
```

`$slot(): void` no cambia: sigue siendo el marcador de `<slot>` dentro del componente.
`$intoSlot` es lo contrario y por eso es otro nombre — dice qué hace un hijo **desde fuera**:
«este elemento va a la ranura `meta`».

### 3.2. Un contrato nuevo en el virtual de cliente

Igual que un layout exporta `$Sections`, un componente exporta sus ranuras:

```ts
export type $Slots = 'meta' | 'footer';   // `never` cuando no declara ninguna
```

### 3.3. Un import y un alias más

```ts
import type { $Props as $C0, $Slots as $S0 } from './app-badge.fud';
```

El alias se numera con el mismo contador que `$C`, así que `$C0` y `$S0` son siempre el mismo
componente.

---

## 4. Comportamiento corregido

### 4.1. Los atributos globales se aceptan por TIPOS, no por una lista negra en el emisor

El literal se comprueba contra `$C0 & $GlobalAttrs`. No hay ninguna rama nueva en el emisor
para `id`, `part` o `data-*`: **el emisor no sabe que existen**. La lista del vocabulario de
HTML vive en un `.d.ts`, que es donde vive todo lo demás que HTML define.

Y sigue siendo estricta. Verificado con `tsc` antes de escribir una línea de emisor:

```
$attrs<$C0>({ id: 'x', part: 'body', 'data-x': 1, 'aria-label': 'a', tone: 'success' })  ✓
$attrs<$C0>({ tonee: 'success' })   TS2561 … Did you mean to write 'tone'?               ✓
$attrs<$C0>({ tone: 'nope' })       TS2322 '"nope"' is not assignable to 'Tone'          ✓
```

La sugerencia del nombre mal escrito **sobrevive a la intersección**, que era el riesgo real de
este enfoque y la razón de medirlo antes.

### 4.2. `slot=` se comprueba contra las ranuras del componente

`slot` sale del literal y se proyecta aparte, con la forma que `@section` ya usa:

```html
<app-card>
  <app-badge slot="meta">…</app-badge>
</app-card>
```
```ts
$attrs<$C0>({});
$intoSlot<$S0>('meta');
```

- Un nombre que el componente no declara ⇒ `TS2345` **sobre el nombre que se escribió**.
- Un componente sin `<slot name>` ⇒ `$Slots = never` ⇒ cualquier `slot=` falla.
- **Completado gratis**: en `slot="|"` TypeScript está completando una unión de literales, que
  es la misma razón por la que ya funciona tras `@section `.

> **Corregido al implementar.** Este párrafo decía «sugiriendo los que sí existen». No es así:
> el mensaje nombra el **alias** (`$S0`), no expande la unión, porque el tipo llega por un
> `import type`. Es exactamente lo que `$Sections` lleva haciendo desde SDD-23 y sus tests solo
> afirman código y span por la misma razón. Quien enseña los nombres válidos es el completado y
> el hover, no el texto del error.

El literal del nombre se emite como **un solo tramo** bajo `DIAGNOSTIC_ONLY_CAPS`, comillas
incluidas, por la razón que `emitSection` ya documenta: TypeScript reporta el `TS2345` sobre
`'meta'` **con** sus comillas, y un rango solo mapea de vuelta cuando sus dos extremos caen en
un tramo con `verification`. Escrito como scaffold + copy + scaffold, el error no llegaría a
nadie.

### 4.3. El nombre del slot se copia desde su span

`export type $Slots` copia cada `name` desde el span del `<slot>`, no lo reescribe. Eso da
**F12 desde el consumidor hasta el `<slot>` del componente** sin escribir una sola línea de
navegación, exactamente como pasa con las secciones y su layout.

### 4.4. Un tag sin `<link>` no gana un segundo error

Un tag no registrado ya falla con `TS2304` sobre el nombre (decisión 41). Para ése **no** se
emite `$intoSlot`: su `$Slots` no existe, y un segundo error sobre el mismo tag no añade
información, solo ruido.

---

## 5. Invariantes

**Los que el bug violaba**

- *El editor no inventa errores.* `slot=` es HTML válido, correcto y necesario; marcarlo en rojo
  enseña a desconfiar de los diagnósticos, que es peor que no tenerlos.
- *La proyección comprueba lo que el usuario escribió contra lo que significa.* Comprobar un
  atributo global contra el contrato de props es compararlo con algo que no lo describe.

**Los que la corrección añade**

- **Lo que HTML define vive en el `.d.ts`, no en una rama del emisor.** Un atributo global nuevo
  es una línea de tipos, nunca un `if`.
- **Toda ranura tiene nombre en la proyección.** `<slot name>` deja de ser texto que se tira.

---

## 6. Criterios de aceptación

Tests en `packages/language-core/test/`, más el `typecheck.ts` que ya existe para llevar un
virtual al checker de verdad.

1. **(rojo primero)** El virtual de
   [`examples/basic/routes/blog/index.fud`](../../../examples/basic/routes/blog/index.fud)
   typechequea **sin ningún `TS2353`**. Contra el código anterior falla, que es lo que hace de
   este el test del BUG.
2. Un componente con `<slot name="meta">` y `<slot name="footer">` emite
   `export type $Slots = 'meta' | 'footer';`, en orden de aparición.
3. Un componente sin `<slot name>` —incluido el que tiene un `<slot>` por defecto— emite
   `export type $Slots = never;`.
4. `slot="meta"` sobre un componente emite `$intoSlot<$S0>('meta')` y **no** aparece en el
   literal de `$attrs`.
5. `slot="noexiste"` produce `TS2345` **sobre el nombre escrito**. El mensaje nombra el alias,
   no la unión (ver la nota de §4.2); los nombres válidos los da el completado.
6. `id`, `part`, `exportparts`, `role`, `hidden`, `tabindex`, `lang`, `dir`, `title`, un
   `class` estático, un `style` estático, un `data-*` y un `aria-*` sobre un componente:
   **cero diagnósticos**.
7. Una prop mal escrita sigue dando `TS2561` **con la sugerencia**, y un valor de tipo
   equivocado sigue dando `TS2322`. La intersección no relaja el contrato.
8. Un tag sin `<link>` da `TS2304` sobre el tag y **exactamente uno**: no se emite `$intoSlot`
   para él.
9. El mapping del nombre del slot lleva `verification` y `sourceLength` igual al span del
   `name`: el `TS2345` aterriza sobre lo que el usuario escribió.
10. `GLOBALS_DTS` y el `fudic-globals.d.ts` que escribe `fudic new` siguen siendo **el mismo
    texto** (el test que ya existe en `@fudic/cli`).

**Cobertura.** `language-core` no baja del 100 % en las cuatro métricas.

---

## 7. Fuera de alcance

- **«Sin slots, sin hijos».** Prohibir contenido dentro de un componente que no declara ninguna
  ranura pide un `$children<T>()` que no existe y no tiene precedente en el emisor. Es la
  continuación natural de este BUG, no parte de él.
- **`slot=` sobre un elemento NATIVO dentro de un componente** (`<div slot="meta">`). Necesita
  el contexto del componente padre, que hoy no viaja por el emisor; y no es el síntoma de este
  BUG, porque un tag nativo no proyecta literal de props y por tanto no da `TS2353`.
- **Validar el `name` de un `<slot>` duplicado dentro del componente.** Es una regla semántica
  (SDD-12), no del emisor.
- **Los atributos globales que HTML define pero fudic no puede tipar mejor que `$Scalar`**
  —`draggable`, `spellcheck`, `contenteditable`, `enterkeyhint`, `inputmode`…—. Se añaden
  cuando alguien los use; la lista es una línea cada uno.
- **`$attr` y la ruta de los tags nativos** no se tocan.
