# SDD-34 — Formularios en el compilador: `control`, control-componentes y accesibilidad

> **Estado:** `Listo`
> **Paquetes:** `@fudic/compiler` (parser, semántica y emit del atributo `control`) ·
> `@fudic/forms` (el punto de entrada `./dom` y `FudicControlElement`) · `@fudic/core` (la lista
> `eager` del mapa de página) · `@fudic/vite` (el borrado de los validadores de servidor)
> **Depende de:** 33 (el modelo), 05 y 07 (parser HTML y bindings), 12 (semántica), 15 (emit y
> mapas de página), 17 (hidratación por gesto, que aquí gana **una** excepción), 19 (el plugin),
> 23 (la proyección TS, que es quien comprueba las rutas)
> **Rango de diagnósticos:** `FUD0590`–`FUD0619`
> **Decisiones de gramática:** 100–106 (nuevas)
> **Naturaleza:** gramática + emit + una capa de runtime que **solo** contiene lo que el emit
> invoca. Ningún escaneo del DOM, ninguna tabla de despacho.

---

## 1. Contexto y objetivo

SDD-33 deja un modelo de formulario reactivo que no sabe nada del DOM. Este SDD lo enchufa a la
página, y lo hace desde el único sitio desde el que fudic puede hacerlo bien: **el compilador ya
sabe, en tiempo de compilación, qué elemento es cada uno**.

Esa frase tiene consecuencias que se pueden medir. El prototipo (`docs/forms/bind.js`) hace, en
tiempo de ejecución, tres cosas que aquí desaparecen:

- **Escanea el DOM** (`querySelectorAll('[control:]')`) para encontrar qué enlazar. El emit lo sabe
  sin buscar.
- **Discrimina por tipo de elemento** (`if (type === 'checkbox') … if (type === 'number') …`). Esa
  cadena mantiene vivas las cinco coerciones en el bundle de una página que quizá solo tiene un
  campo de texto. El emit escribe la coerción concreta y las otras cuatro no se descargan.
- **Fabrica el hueco del error** con `insertAdjacentElement`. Eso significa que un formulario
  servido con sus errores por SSR y el mismo formulario ya hidratado tienen **marcado distinto**,
  y con él, accesibilidad distinta.

El tercero es el que decide la forma de este SDD. La regla que lo gobierna todo:

> **El cableado estático de accesibilidad se paga en el emit; el JavaScript solo compra lo
> dinámico.** La etiqueta, el hueco del error, el `aria-describedby` y el `aria-invalid` inicial
> están en el HTML que sale del servidor, sin una línea de JS. Lo que hidratar añade es el error
> que aparece *mientras* el usuario escribe, el foco que se mueve al primer campo inválido y el
> anuncio del resumen.

Y una excepción explícita a la filosofía de cero-JS, tomada a propósito: **un componente marcado
`formassociated` descarga y ejecuta su JavaScript al cargar la página, no en el primer gesto**
(§4.5). No hay forma declarativa de `static formAssociated = true`, y sin él el host no es
etiquetable: un `<label for>` de fuera apuntaría a un elemento que todavía no participa en nada.
Perder eso no es una optimización, es un fallo de accesibilidad.

### Lo que este SDD NO es

No es el envío. `control` sobre un `<form>` enlaza **estado** —tocado, foco, errores, resumen—, no
**acción**: quién manda los datos y por dónde es del autor (`@submit`, decisión 96) o del `<form>`
nativo, y el día que exista `@fudic/http` será suyo.

---

## 2. Dependencias

| Fuente | Aporta |
|---|---|
| SDD-33 | `form`/`group`/`control`, la lectura llamando, `errors`/`touched`/`dirty`, `$validate` con época, `$setErrors` por ruta, `$touch`. Este SDD **no añade nada al modelo**: solo lo invoca. |
| SDD-05 / SDD-07 | El parser HTML y la clasificación de atributos y bindings. `control` entra por la puerta de `ref` (decisión 30): atributo reservado con valor de expresión, no prefijo con nombre detrás como `class:`/`bus:`. |
| SDD-12 | La fase semántica, donde viven las reglas que no son de forma: el elemento sobre el que aparece `control`, el enlace duplicado, el bucle. |
| SDD-15 | El emit y los mapas de página. El de cliente gana las llamadas de enlace; el mapa de página gana la lista `eager` (§4.5). |
| SDD-17 | La hidratación por gesto y `resolveChunk`. Este SDD le añade **una** ruta más de entrada, acotada a los tags `formassociated`. |
| SDD-19 | El plugin de Vite, que es quien puede reescribir un módulo `.ts` compartido por los dos extremos: es donde se borra el validador de servidor (§4.7). |
| SDD-23 | La proyección TypeScript. Es quien comprueba que `@f.seo.description` existe y es un `Control<T>` — **no** el emit (§4.9). |

---

## 3. Interfaz pública

### 3.1. La gramática

```razor
<form control="@f">                                    <!-- el formulario  (decisión 101) -->
  <label>
    <span>Título</span>
    <input control="@f.title">                         <!-- un control     (decisión 101) -->
  </label>

  <fieldset control="@f.seo">                          <!-- un grupo       (decisión 101) -->
    <input control="@f.seo.description">
    <input type="url" control="@f.seo.canonical">
  </fieldset>

  <app-input control="@f.body"></app-input>            <!-- cruza el nodo  (decisión 104) -->
</form>
```

Un componente que **es** un control declara su template como control-componente:

```razor
<app-input>
  <template shadowrootmode="open" shadowrootdelegatesfocus formassociated>
    <div class="field">
      <slot name="icon-left"></slot>
      <input control="@ctrl">
      <slot name="icon-right"></slot>
    </div>
  </template>
</app-input>
```

### 3.2. `@fudic/forms/dom` — solo lo que el emit invoca

```ts
export type Cleanup = () => void;

/** Enlace de un control a un elemento. Una función por FORMA de elemento, no una con un switch. */
export function bindText(el: HTMLInputElement | HTMLTextAreaElement, c: Control<string>, err: ErrorSlot): Cleanup;
export function bindNumber(el: HTMLInputElement, c: Control<number | null>, err: ErrorSlot): Cleanup;
export function bindCheckbox(el: HTMLInputElement, c: Control<boolean>, err: ErrorSlot): Cleanup;
export function bindRadio(els: readonly HTMLInputElement[], c: Control<string>, err: ErrorSlot): Cleanup;
export function bindSelect(el: HTMLSelectElement, c: Control<string>, err: ErrorSlot): Cleanup;
export function bindSelectMultiple(el: HTMLSelectElement, c: Control<readonly string[]>, err: ErrorSlot): Cleanup;

/** El formulario: tocado en cascada, foco al primer inválido, resumen en la live region. */
export function bindForm(el: HTMLFormElement, f: AnyForm, sum: HTMLElement | null): Cleanup;

/** Un grupo: agrupa errores. `el` es el que el autor haya elegido (decisión 101). */
export function bindGroup(el: HTMLElement, g: AnyForm): Cleanup;

/** El hueco del error: el elemento que el emit ya dejó escrito. El runtime solo pone texto. */
export type ErrorSlot = HTMLElement;

/** El texto de un mapa de errores. Sustituible por el autor; sin él, el código de la regla. */
export function setMessages(m: Readonly<Record<string, (v: unknown) => string>>): void;
```

**Cada `bind*` es un módulo propio.** Una página con un solo campo de texto se lleva `bindText` y
nada más: ni el número, ni el checkbox, ni las dos formas de `select`.

### 3.3. `@fudic/forms/element` — la base de un control-componente

```ts
import { FudicElement } from '@fudic/core';

export abstract class FudicControlElement extends FudicElement {
  static readonly formAssociated = true;
  /** `ElementInternals`, creado en el constructor: es el único momento en que se puede. */
  protected readonly internals: ElementInternals;
  /** El nodo que el padre le pasó. Lo escribe el emit al construir. */
  protected control: Control<unknown> | null;
}
```

Vive en `@fudic/forms`, no en `@fudic/core`, y por una razón de dirección de dependencias: la base
necesita el tipo `Control<T>`, así que `forms` depende de `core` y **nunca al revés**.

---

## 4. Comportamiento

### 4.1. `control` es un atributo reservado, y el elemento decide qué significa

**Decisión 100.** `control` es un **atributo reservado** cuyo valor es una expresión con `@`. Es
de la familia de `ref` (decisión 30), no de `class:`/`bus:` (22, 28.a): esos son prefijos porque
llevan un nombre detrás del `:`, y aquí no hay nada que nombrar — el nodo lo dice la expresión.
`control="title"`, sin `@`, es `FUD0590`; es además la forma que el prototipo usaba
(`control:="title"`), así que el diagnóstico enseña la migración.

**Decisión 101.** **El elemento decide qué se enlaza**, y son tres casos y no más:

| Elemento | Qué se espera | Qué se emite |
|---|---|---|
| `<form>` | un `Form<S>` | `bindForm` — tocado, foco, resumen, guarda del submit (§4.4) |
| `input` / `textarea` / `select` | un `Control<T>` | el `bind*` de **esa** forma de elemento (§4.2) |
| un tag de componente | un `Control<T>` o un `Form<S>` | cruza la referencia como prop (§4.6) |
| cualquier otro elemento | un `Form<S>` (un grupo) | `bindGroup` — agrupación de errores |

Que el nodo sea del tipo que el elemento espera **no lo comprueba el emit**: lo comprueba
TypeScript sobre la proyección de SDD-23, gratis, porque el código emitido pasa `@f.title` a una
función cuya firma pide `Control<string>` (§4.9).

Un grupo se enlaza a **lo que el autor quiera** —un `<fieldset>`, un `<div>`, una `<section>`—.
No hay elemento privilegiado: lo que el enlace aporta es semántica de agrupación de errores, y
dónde caiga es maquetación.

**Decisión 102.** **Un nodo se enlaza a un elemento y solo a uno dentro del mismo componente.**
Dos `control` con la misma expresión en el mismo fichero es `FUD0591`. Dos vistas del mismo valor
no es un caso de formulario: es un caso de interpolación, y para eso está `@f.title()`.

**La única excepción es `<input type="radio">`**, y no es una excepción del compilador sino del
elemento: un grupo de radios son N elementos que expresan **un** valor. Varios `control` con la
misma expresión son legítimos si **todos** son radios; mezclar un radio con cualquier otro
elemento vuelve a ser `FUD0591`. El emit los agrupa y emite una sola llamada a `bindRadio` con la
lista.

**Decisión 106.** `control` dentro de un bucle (`@foreach`, `@for`, `@while`) es error
(`FUD0594`). Es la decisión 31 aplicada por la misma razón que a `ref`: la expresión enlazaría N
elementos al mismo nodo. Las colecciones de controles (`FormArray`) están fuera de alcance en
SDD-33 §7, y cuando entren traerán su propia forma de nombrar la fila.

### 4.2. Qué emite un enlace de control: el `switch` se muda al compilador

Por cada `control` sobre un elemento que porta valor, el emit decide **en compilación** la forma
del elemento y escribe la llamada concreta:

| Elemento | Coerción | Función |
|---|---|---|
| `<input>` sin `type`, `text`, `search`, `url`, `tel`, `password`, `email`, `date`, `time`, `color` | string | `bindText` |
| `<textarea>` | string | `bindText` |
| `<input type="number">`, `type="range"` | `''` → `null`, si no `Number` | `bindNumber` |
| `<input type="checkbox">` | `checked` | `bindCheckbox` |
| `<input type="radio">` | valor del que está marcado | `bindRadio` |
| `<select>` | string | `bindSelect` |
| `<select multiple>` | array de strings | `bindSelectMultiple` |
| `<input type="file">`, `image`, `submit`, `reset`, `button` | — | `FUD0592` |

Un `type` **dinámico** (`type="@t"`) no se puede decidir en compilación: es `FUD0592` también, con
su mensaje propio. No se emite un despacho de runtime para rescatarlo; eso sería devolver al
bundle la tabla que este SDD quita.

Cada `bind*` hace lo mismo con distinta coerción, y nada más que esto:

1. **Elemento → control**, en `input` y en `change`: `c.set(coerción(el))`.
2. **`blur` → `c.touch()`**.
3. **Control → elemento**, con un `effect` (SDD-31): si el valor cambia por código —un `$patch`,
   un `reset`—, el elemento se actualiza. El efecto no escribe si el elemento ya tiene ese valor,
   por la misma razón que `$w` en BUG-12: escribir en un input enfocado mueve el cursor.
4. **Errores → accesibilidad**, con un segundo `effect`: `aria-invalid` en el elemento y el texto
   en el hueco del error, y **solo** si el control está `touched` — un campo obligatorio no está
   mal por estar todavía vacío.
5. Devuelve su `Cleanup`, que el factory del componente mete en `$d` como cualquier otro enganche.

La validación **no** la dispara el enlace en cada tecla: el enlace escribe el valor, y `$validate`
lo llama el autor o el enlace del `<form>` en el submit. Un formulario que valida contra el
servidor en cada pulsación es una decisión del que lo escribe, no del compilador.

### 4.3. El hueco del error existe antes que el JavaScript

Por cada control enlazado, el emit escribe **en el markup** —o sea, también en el HTML que sale de
SSR— dos cosas:

```html
<input id="…" aria-describedby="e3" aria-invalid="true" value="…">
<span id="e3" data-fud-err>obligatorio</span>
```

- El **id del hueco** es estable y lo deriva el compilador de la identidad del nodo, la misma que
  ya usa para la hidratación. No lo escribe el autor y no cambia entre SSR y cliente.
- El `aria-describedby` **está siempre**, apunte a un hueco vacío o no. Cambiar la referencia
  cuando aparece un error es lo que hace que algunos lectores no lo anuncien.
- Con errores presentes en el momento de renderizar —un 422 que el servidor pintó, §4.4— el texto
  y el `aria-invalid` **ya salen puestos**. Un formulario con errores es accesible **con cero JS**.

**Decisión 105.** El marcado del error lo emite el compilador y el runtime **solo escribe su
texto**. Es la invariante que hace que un formulario tenga la misma accesibilidad haya hidratado o
no, y es exactamente lo que el prototipo no podía cumplir fabricando el `<span>` al vuelo.

### 4.4. El `<form>`: estado, no acción

`bindForm` hace cuatro cosas, y ninguna es enviar:

- **Submit inválido:** `preventDefault()`, `$touch()` en cascada —para que los errores dejen de
  estar escondidos— y **el foco se mueve al primer control inválido**. Mover el foco es lo que
  anuncia el error sin depender de un IDREF: es la salida portable al hecho de que
  `aria-describedby` **no cruza la frontera de un shadow root** y el resumen del formulario vive
  en otro árbol que el campo que falla.
- **Resumen:** el `$summary()` se escribe en una live region (`aria-live="polite"`) que el emit
  deja al lado del `<form>`. Un texto que cambia dentro de una live region se anuncia; un texto
  que cambia fuera, no.
- **La decisión de submit es síncrona y con el último estado conocido.** `$validate` es asíncrono
  y `preventDefault` no lo es: si `$errors()` ya tiene algo, se para; si no, se deja pasar y se
  lanza la validación, cuyo resultado tardío **no puede des-enviar nada**. No es una renuncia
  vergonzante: el que decide es el servidor, y para eso existen los validadores de servidor y el
  422. El chequeo de cliente es una cortesía.
- **Errores del servidor:** si el autor recibe un 422, se lo pasa al formulario con `$setErrors`
  (SDD-33 §4.6) y el pintado ocurre por los mismos efectos de §4.2. El transporte no participa.

**Dónde vive el formulario, y por qué importa.** `const f = form(schema)` va en la **zona neutra**
de `@code`, no en `@client`: la zona neutra corre en los dos lados, así que el servidor pinta los
valores en el HTML y un formulario de edición se ve **sin JavaScript**. Declararlo en `@client`
compila y funciona, pero el primer render sale vacío — que para un formulario de alta es
exactamente lo correcto. Por eso es una regla documentada y no un diagnóstico.

### 4.5. `formassociated`: el marcador, la clase, y el JavaScript que sí se paga

**Decisión 103.** `<template shadowrootmode="open" formassociated>` marca el componente como
**control-componente**. El marcador es de compilación: el navegador nunca lo ve —un atributo
desconocido en un `<template>` es inerte— y el compilador lo consume. **No inventa nada del
estándar**: `static formAssociated` lo lee el navegador al *definir* la clase, así que ninguna
forma declarativa puede producirlo hoy, y este atributo no pretende que exista; solo dice de qué
clase hereda lo que se emite.

Lo que cambia en el componente marcado:

- hereda de `FudicControlElement` en vez de `FudicElement`, con `static formAssociated = true` y
  `attachInternals()` en el constructor;
- su shadow root se abre con `delegatesFocus: true`, y el `<template>` serializado lleva
  `shadowrootdelegatesfocus`. Sin eso, un `<label>` de fuera enfoca el host y no el `<input>` de
  dentro;
- `internals.setFormValue(...)` sigue al valor del control, para que un `<form>` **ajeno** —el de
  una aplicación que no es fudic— recoja el valor en su `FormData`;
- `internals.setValidity(...)` sigue a `errors`, que es lo que da `:invalid` de verdad;
- **su tag entra en la lista `eager` del mapa de página**: se define y se hidrata al instalar el
  runtime, antes de cualquier gesto.

Ese último punto es una excepción a SDD-17 y hay que decirla entera: **es la única forma de
hidratación que no la conduce el gesto del usuario**. Un componente form-associated a medio
levantar —definido pero sin estado, o sin definir— no es etiquetable, no aporta valor al
`FormData` y no tiene validez; y eso es peor que descargar unos kilobytes. La lista está acotada a
los tags marcados, se mide (§6.16) y ningún otro componente entra en ella.

### 4.6. Pasar un nodo a un componente: la referencia cruza, y por qué

**Decisión 104.** Sobre un tag de componente, `control="@f.title"` **cruza la referencia del
nodo** como prop. El hijo recibe el `Control<T>` y lo enlaza a su `<input>` interno con las mismas
reglas de §4.2.

Esto convive con la **decisión 84** —*ninguna signal cruza el shadow boundary*— y no la deroga,
porque lo que 84 prohíbe es que el **emit** construya un grafo reactivo implícito entre padre e
hijo: un prop es un valor, y si se mueve, el padre reenvía con `u`. Aquí lo que cruza no es estado
de render del padre: es el **modelo**, nombrado explícitamente por el autor en el punto de uso, y
el hijo se suscribe a él por su cuenta, con `@fudic/forms`, no por el canal `$sub` del emit. El
padre no re-renderiza porque el hijo escriba, y no se emite ningún `u` para este prop.

La alternativa —desazucarar a prop de valor más prop callback, como `bind:` (decisiones 83–85)—
se descarta con su motivo: haría falta cruzar además los errores, el `touched`, el `dirty` y la
orden de validar, o sea cuatro props más por campo, y el hijo seguiría sin poder llamar a
`touch()`. Un `Control<T>` es una referencia con identidad, igual que el `FormControl` que un
desarrollador de Angular ya conoce.

**La regla de accesibilidad que lo acompaña:** un componente que recibe un `Control<T>` y cuya
etiqueta puede estar **fuera** de su shadow root debe declararse `formassociated`. Es lo que lo
hace etiquetable. No se diagnostica —el compilador no puede saber dónde pondrá la etiqueta quien
lo use— y se anota en §7 como candidato a regla del LSP.

### 4.7. El validador de servidor no llega al navegador

`serverValidator(fn)` (SDD-33) marca un validador que solo corre con `{ server: true }`. Que no
**corra** en el cliente no basta: su cuerpo —una consulta, un import de la capa de datos— seguiría
en el bundle.

El borrado lo hace el plugin (SDD-19), no el compilador de `.fud`, porque el schema vive en un
`.ts` compartido y el compilador de `.fud` no lo mira. En el build de cliente, la transformación
reconoce la llamada por el **binding importado** de `@fudic/forms` y sustituye **su argumento**
por una función vacía:

```ts
// fuente                                   // bundle de cliente
serverValidator(async (v) => {              serverValidator(() => null);
  return (await db.slug(v)) ? {taken:1}:null;
});
```

Se sustituye el argumento y no la llamada entera para que **la forma del array de validadores no
cambie**: mismo número de elementos, mismo orden, mismo comportamiento en `$validate()`. Y con la
función original sin referencias, Rollup se lleva por delante lo que colgaba de ella —el import de
`db` incluido—, que es todo el punto.

### 4.8. Nivel: un formulario es N3

Un `control` cuenta como enganche de cliente, igual que un `@evento`: el componente que lo lleva
es N3 y todos los que componen el formulario van con él. No hay formulario N1. Es una decisión
tomada de frente: el enlace, el pintado del error y el foco son comportamiento, y fingir que un
formulario es HTML estático solo funciona hasta el primer error.

### 4.9. Lo que **no** es un diagnóstico del compilador

`control="@f.seo.descripcion"`, con la ruta mal escrita, **no** produce un `FUD`. Produce un error
de TypeScript, porque el código emitido escribe literalmente `f.seo.descripcion` contra la
proyección de SDD-23, y ahí `Form<S>` no tiene esa propiedad. Lo mismo con el tipo: pasar un
`Control<string>` a `bindCheckbox` no compila.

Es la división que este proyecto ya usa: el emit comprueba **formas** —qué elemento, cuántas
veces, dentro de qué— y los **tipos** los comprueba quien tiene los tipos. Escribir un análisis de
schema en el emit sería duplicar el chequeo y quedarse corto.

---

## 5. Invariantes

- **El compilador sabe el elemento; el bundle no lo redescubre.** Ni `querySelectorAll`, ni
  `switch (el.type)`, ni tabla de coerciones. Una página con un campo de texto trae una función de
  enlace, no cinco.
- **El marcado de accesibilidad lo escribe el emit y sale por SSR.** Hueco del error con id
  estable, `aria-describedby` siempre presente, `aria-invalid` y texto ya puestos si hay errores.
  El runtime **solo escribe texto**; no crea nodos.
- **Un formulario tiene la misma accesibilidad haya hidratado o no.** Es la consecuencia directa
  de la anterior y el criterio §6.10 la mide comparando el HTML de los dos caminos.
- **`formassociated` es un marcador de compilación, no una capacidad pedida al navegador.** No
  llega al DOM; decide clase base, `delegatesFocus` y pertenencia a `eager`.
- **La hidratación eager está acotada a los tags `formassociated`.** Es la única excepción a
  SDD-17, se lista en el mapa de página y se mide.
- **Un nodo, un elemento, por componente.** Enlace duplicado es `FUD0591`; dentro de un bucle,
  `FUD0594`.
- **`control` sobre un `<form>` enlaza estado, no acción.** Nada de este SDD envía nada.
- **Lo que cruza a un componente es el nodo, nombrado por el autor.** No hay grafo reactivo
  implícito entre padre e hijo (decisión 84 intacta), y no se emite `u` para ese prop.
- **El validador de servidor no llega al bundle de cliente, y el array no cambia de forma.**
- **Las rutas y los tipos los comprueba TypeScript, no el emit.**
- **El atributo `control` no sobrevive al HTML emitido.** Es sintaxis del compilador, como
  `class:` o `.prop`.

### Catálogo de diagnósticos (`FUD0590`–`FUD0619`)

| Código | Regla |
|---|---|
| `FUD0590` | El valor de `control` no es una expresión `@` (decisión 100). Cubre el `control="title"` del prototipo. |
| `FUD0591` | Dos elementos del mismo componente enlazan el mismo nodo (decisión 102), salvo que **todos** sean `<input type="radio">`. |
| `FUD0592` | `control` sobre un `<input>` cuyo `type` no porta valor de usuario (`submit`, `reset`, `button`, `image`), no está soportado (`file`, SDD-33 §7) o es **dinámico** y no se puede decidir en compilación. |
| `FUD0593` | `formassociated` fuera del `<template shadowrootmode>` raíz de un componente — en un template anidado o en modo página (decisión 103). |
| `FUD0594` | `control` dentro de un bucle (decisión 106, hermana de la 31). |
| `FUD0595`–`FUD0619` | Reservados. |

Ninguno de los cinco lanza: el emit anota el diagnóstico con su span, omite **ese** enlace y sigue
emitiendo el fichero (regla de oro del proyecto).

---

## 6. Criterios de aceptación

Tests en `packages/compiler/test/` (1–9, 13–15), `packages/forms/test/dom/` (10–12, 17),
`packages/vite/test/` (14) y el arnés de Chrome real de `test/emit/hydrate/` (16, 18).

**Gramática y semántica**

1. **(rojo primero)** `<input control="@f.title">` produce un nodo de enlace con su span, la
   expresión parseada y el elemento resuelto; `control="title"` produce `FUD0590` y el resto del
   fichero se emite.
2. `control` sobre `<form>`, sobre `<input>`, sobre `<fieldset>` y sobre `<app-input>` clasifican
   en los cuatro casos de la decisión 101, y el clasificado se ve en el AST.
3. Dos `control="@f.title"` en el mismo fichero → `FUD0591` en el **segundo**, con su span. Tres
   `<input type="radio" control="@f.tone">` → **sin diagnóstico** y una sola llamada a `bindRadio`
   con los tres; los mismos tres más un `<input type="text">` sobre el mismo nodo → `FUD0591`.
4. `control` dentro de un `@foreach` → `FUD0594`.
5. `<input type="file" control="@f.doc">`, `type="submit"` y `type="@t"` → `FUD0592`, cada uno con
   su mensaje.
6. `formassociated` en un `<template>` anidado y en una página → `FUD0593`.

**Emit**

7. **(rojo primero)** Las formas de elemento de la tabla de §4.2 emiten **seis funciones
   distintas**. El golden de un componente con un solo `<input type="text">` **no contiene**
   `bindCheckbox`, `bindNumber`, `bindRadio`, `bindSelect` ni `bindSelectMultiple`, ni el nombre
   de sus módulos.
8. El HTML emitido **no contiene** el atributo `control`, y sí contiene el hueco del error con id
   estable y el `aria-describedby` que lo apunta, en SSR y en el markup que el cliente adopta.
9. Un componente con `formassociated` emite una clase que extiende `FudicControlElement`, abre su
   shadow con `delegatesFocus`, serializa `shadowrootdelegatesfocus` en el `<template>`, y **su
   tag aparece en la lista `eager` del mapa de página**. Sin el marcador, no aparece en `eager` y
   extiende `FudicElement`.

**Runtime de enlace**

10. **La invariante de accesibilidad, medida.** El mismo formulario con los mismos errores se
    renderiza por dos caminos —SSR con `$setErrors` aplicado antes de renderizar, y cliente
    hidratado que recibe los mismos errores— y el HTML resultante es **idéntico** en id del hueco,
    `aria-describedby`, `aria-invalid` y texto. Es el criterio que el prototipo no podía pasar.
11. `bindText` escribe en el control en `input` y en `change`, marca `touched` en `blur`, y un
    cambio del control por código (`$patch`) actualiza el elemento **sin** mover el cursor cuando
    el valor ya coincide. `bindCheckbox`, `bindNumber` (con `''` → `null`) y `bindSelectMultiple`
    (array) tienen cada uno su test de coerción en los dos sentidos.
12. Un error **no se pinta** mientras el control no esté `touched`, y aparece en cuanto lo está,
    con `aria-invalid="true"`. Al desaparecer el error, los dos se retiran.
13. `bindForm` con el formulario inválido: `preventDefault`, `$touch()` en cascada, foco en el
    **primer** control inválido en orden de documento, y el `$summary()` escrito en la live region.
    Con el formulario válido, **no** llama a `preventDefault` y el handler del autor corre.

**El bundle**

14. **(rojo primero)** El build de cliente de un schema con `serverValidator(fn)` **no contiene**
    el cuerpo de `fn` ni lo que `fn` importaba, y el array de validadores conserva la misma
    longitud y el mismo orden. El build de servidor lo conserva entero.
15. **Presupuesto por ruta, medido sobre el chunk.** Una ruta sin formularios no arrastra ni un
    byte de `@fudic/forms`. Una ruta con un formulario de tres campos de texto y un validador
    arrastra el núcleo, `bindText` y ese validador, y **no** las otras cuatro funciones de enlace
    ni los validadores que no usa. Se comprueba por presencia de identificadores en el chunk
    emitido, no a ojo.

**En navegador de verdad** (`test/emit/hydrate/`, Chrome real)

16. Un tag `formassociated` está **definido y hidratado antes del primer gesto**; un componente
    normal de la misma página **no** tiene JavaScript hasta que se le toca. Los dos hechos, en la
    misma página y en la misma medición.
17. Un `<label for>` **fuera** del componente enfoca el `<input>` **de dentro** de su shadow root,
    y el lector obtiene el nombre accesible. Sin `formassociated` y sin `delegatesFocus`, el mismo
    test falla — se deja escrito como el contraste que justifica el JS eager.
18. Un `<form>` ajeno que contiene un `<app-input>` recoge su valor en `FormData`
    (`setFormValue`), y un control inválido pone el host en `:invalid` (`setValidity`).

**Cobertura.** El punto de entrada `./dom` y `./element` de `@fudic/forms` nacen al **100 %** en
las cuatro métricas, como el núcleo. En `@fudic/compiler` y `@fudic/vite` el código nuevo llega al
100 % aunque el paquete arrastre deuda previa; la deuda no se cita como precedente.

---

## 7. Fuera de alcance

- **El envío.** `@fudic/http`, las factorías por verbo, el middleware `validate`, el envío
  posicional y su compresión. Todo aparcado con su prototipo medido en `docs/forms/`. Este SDD
  llega hasta `$setErrors` y ni un paso más.
- **`form:="@Put"`** o cualquier azúcar que ate el submit a una llamada. Nace muerto sin el punto
  anterior.
- **Colecciones de controles** (`FormArray`, filas que se añaden y se quitan). SDD-33 §7 las deja
  fuera y aquí se sigue: `control` en un bucle es `FUD0594` hasta que exista la forma de nombrar
  la fila.
- **Subida de ficheros.** `<input type="file">` es `FUD0592`: exige `multipart/form-data` y un
  modelo de valor que no es JSON-serializable.
- **`bind:` (decisiones 83–85).** Sigue pendiente y no se toca: `control` no lo implementa, no lo
  presupone y no lo bloquea. Son dos mecanismos distintos y el hueco abierto de `bind:` —el nombre
  de la prop callback— sigue abierto donde estaba.
- **Que el hueco del error lo escriba el autor** en un sitio elegido por él. En v1 lo emite el
  compilador siempre, justo detrás del elemento, y la maquetación se resuelve con CSS. Extensión
  natural si aparece un caso que el CSS no cubra.
- **Mensajes de error internacionalizados.** `setMessages` acepta el mapa; de dónde salgan los
  textos es de la aplicación.
- **Que el LSP exija `formassociated`** en un componente que recibe un `Control<T>` (§4.6), y que
  complete `control` con las rutas del schema. Es SDD-24/28 y entra cuando esto exista.
- **`Reference Target`** (`shadowrootreferencetarget`) para que un `aria-describedby` cruce la
  frontera del shadow. Es la respuesta buena del estándar y no está disponible; mientras tanto, el
  foco y la live region hacen el trabajo (§4.4). Se revisa cuando embarque.
