# BUG-15 — Dentro de un tag abierto no contesta nadie: ni las clases de `class:`, ni los atributos de HTML

> **Estado:** `Listo`
> **Corrige:** [SDD-24 — Language server](../SDD-24-language-server.md) §3.2, §4.1, §4.2, y amplía
> [SDD-28 — Snippets y completado](../SDD-28-snippets.md) §4.3, §5.5
> **Paquete:** `@fudic/language-server`
> **Rama sugerida:** la del backlog de uso
> **Depende de:** nada
> **Hermano:** [BUG-16](./BUG-16-props-con-punto.md), que se lleva el `.` y el `@` dentro del tag
> porque los dos dependen de un cambio de gramática

---

## 1. Contexto y síntoma

Abrir [`examples/basic/components/app-badge.fud`](../../../examples/basic/components/app-badge.fud),
poner el cursor tras los dos puntos y pedir completado:

```html
<span class="badge" class:|
```

El editor no ofrece nada útil. Y sin embargo el propio fichero, treinta líneas más arriba,
declara exactamente tres nombres y no hay un cuarto posible:

```css
.badge { … }
.badge.success { … }
.badge.info { … }
```

El componente compila y funciona: las dos directivas de
[`app-badge.fud:39-40`](../../../examples/basic/components/app-badge.fud#L39-L40) son correctas.
Lo único roto es el editor — que es exactamente lo que SDD-24 existe para no romper.

El caso es el de una **lista finita, local y ya parseada**: los tres contextos exactos que el
servidor ya sirve —un `href`, un nombre tras `@section `, un tag tras `<`— tienen esa misma
forma, y en los tres el servidor contesta.

### 1.1. Y no es solo `class:`: dentro de un tag abierto no contesta nadie

Al ir a reproducirlo se vieron dos síntomas más, que el usuario describe como uno solo —«en un
`.fud` no sale el IntelliSense de HTML que sí sale en un `.html`»— y que están **medidos** contra
el servidor vivo, no supuestos:

| Petición | Ítems | Quién contesta |
|---|---|---|
| `<div rol\|>` invocada (`triggerKind: 1`) | **151** | el servicio HTML: `role`, `class`, `aria-label`… con el rango correcto sobre `rol` |
| `<div rol\|>` con `triggerCharacter: ' '` | **0** | nadie |
| `<app-badge \|>` invocada | 12 | TypeScript: `tone?`, `role?`, `id?`… |
| `<app-badge \|>` con `triggerCharacter: ' '` | **0** | nadie |
| `<di\|` invocada | 2 | solo los componentes fudic: **ningún tag nativo**, ni `div` |

Las dos primeras filas son la misma posición y el mismo servidor: lo único que cambia es el
`context` que manda el editor. Y el editor manda **siempre** ese contexto — teclear el espacio
que abre la zona de atributos es exactamente lo que hace un desarrollador antes de escribir
`role`. La cuarta fila es la peor: ahí se apaga el criterio §6.3 de SDD-24, los props de un
componente, que es una función que sí existe y hoy se pierde por el camino.

La quinta es un defecto distinto y visible por sí solo: tras `<di` el editor ofrece los dos
componentes del workspace y **ninguno** de los tags nativos, cuando SDD-24 §4.1 dice
explícitamente de dónde salen los nativos.

---

## 2. Causa raíz

### 2.1. La línea

`completions()` ([`plugin.ts:353-417`](../../../packages/language-server/src/services/plugin.ts#L353-L417))
tiene cuatro contextos y **ninguno es la posición de nombre de atributo**: `hrefContextAt`,
`sectionContextAt`, `tagContextAt` y `directiveContextAt`. Después de los cuatro, la función cae
a Emmet y a la palabra suelta.

En `class:|` no responde ninguno:

- `directiveContextAt` no aplica: no hay `@`.
- `wordContextAt` devuelve `undefined` **a propósito**, por su segunda guarda
  ([`position.ts:123`](../../../packages/language-server/src/services/position.ts#L123)): una
  palabra dentro de un tag abierto es un nombre de atributo, *«and attributes are answered by
  the projection (SDD-23)»*.

Esa guarda es correcta y no se toca. Lo que dice el comentario, sin embargo, solo es verdad para
la **mitad** del vocabulario de atributos: la proyección contesta los nombres de props, y para
eso BUG-11 dejó un ancla de completado por hueco del tag. Pero `class:success` no es un hueco: es
un atributo ya empezado, y el ancla no cubre su nombre.

### 2.2. La otra mitad: el nombre de la clase se tira

Aunque hubiera un contexto que lo pidiera, no habría contra qué contestar. La proyección de
`class:` descarta el nombre
([`attrs.ts:221-225`](../../../packages/language-core/src/template/attrs.ts#L221-L225)):

```ts
case 'class':
  ctx.w.scaffold('$cls(', attr.span);
  copyExpression(ctx, binding.value.expr);   // ← solo el valor
  ctx.w.scaffold(');\n');
```

`$cls(v: boolean)` comprueba la **condición**; el nombre no viaja. Es literalmente la mitad §2.3
de BUG-11 —*«el nombre del slot se tira»*— repetida en otra directiva.

La diferencia, y es la que decide el diseño de este BUG, es que **aquí no hay que darle
contrato**. El nombre de una ranura pertenece a otro fichero, así que tenía que ser un tipo.
El nombre de una clase pertenece al `<style>` de **este** fichero, y quien lo tiene delante es
el servidor, no TypeScript.

### 2.3. El espacio es un carácter de disparo, y dispara para apagar

`COMPLETION_TRIGGER_CHARACTERS`
([`capabilities.ts:66-68`](../../../packages/language-server/src/capabilities.ts#L66-L68))
anuncia el espacio, junto al `@`, el `<` y los de Emmet. Anunciar un carácter tiene una
consecuencia que no está escrita en ningún sitio de SDD-24: cuando el editor pide completado
**por ese carácter**, Volar recorre los plugins y **salta todo el que no lo declare**
(`provideCompletionItems.js:128-131`). El servicio HTML declara `. : < " = /`. Los de TypeScript,
los suyos. Ninguno de los dos declara el espacio.

De modo que el espacio deja en la sala a un solo plugin —el nuestro— y el nuestro, en la zona de
atributos, no tiene nada que decir: `wordContextAt` se aparta (§2.1) y Emmet tampoco contesta
dentro de un tag. Resultado medido: **cero ítems**. No es que la lista salga peor; es que no sale.

Lo que hace de esto la causa principal y no una más: **apaga también lo que funciona**. Los props
de un componente los contesta la proyección desde SDD-23 y el ancla de BUG-11; el espacio los
tira igual que tira los atributos de HTML. Un carácter de disparo declarado de más no añade una
respuesta: quita todas las demás.

### 2.4. La rama de tag reclama la posición y deja fuera al servicio HTML

Para `<di|` la causa es otra, y está en el reparto de Volar. El primer plugin que devuelve
**ítems no vacíos** con capacidad de completado *no adicional* fija `mainCompletionUri`, y a
partir de ahí todo plugin no adicional del mismo documento se salta
(`provideCompletionItems.js:132-150`). El mapping del root es `identityMapping`, cuyo
`completion` es `true` a secas —no el `{ isAdditional: true }` que SDD-28 §5.5 puso en
`USER_CAPS`—, y nuestro servicio va **antes** que el HTML en la lista de plugins
([`server.ts:152-160`](../../../packages/language-server/src/server.ts#L152-L160)).

Así que `tagContextAt` no es solo el primero que contesta: es el último. Devuelve los componentes
del workspace con un `return` temprano ([`plugin.ts:387-391`](../../../packages/language-server/src/services/plugin.ts#L387-L391))
y con eso apaga al servicio que tiene los ciento y pico tags de HTML. La misma mecánica que
SDD-28 §5.5 descubrió entre documentos embebidos, ocurriendo aquí entre plugins del mismo
documento.

### 2.5. Alcance

Comparten la causa exacta —prefijo de binding cuyo nombre nadie ofrece— las otras dos directivas
de la decisión 22/28.a: `style:foo` y `bus:foo`. Ninguna se arregla aquí (§7): sus nombres no
salen del `<style>` de este fichero, y meterlas convertiría la corrección en un rediseño del
completado de atributos.

No comparte la causa el **valor**, `class:x="@(…)"`: eso ya funciona, lo contesta la proyección,
y este BUG no lo roza.

Tampoco lo comparten `.prop` ni `@evento` dentro del tag, aunque el usuario los viva como el
mismo hueco: los dos dependen de que la gramática deje **una** forma de pasar props, y eso es
[BUG-16](./BUG-16-props-con-punto.md). Aquí se arregla que la zona conteste; allí, quién contesta
tras un punto.

### 2.6. Por qué la cobertura al 100 % no lo vio

`language-server` está al 100 % en las cuatro métricas. Para `class:` no hay rama sin ejercitar:
**es que no hay rama**. La cobertura mide el código que existe, y un contexto que nadie escribió
no aparece en ningún denominador. Es el complemento exacto de lo que BUG-11 §2.4 anotó para
`language-core`: allí el código corría sin significar; aquí ni siquiera existe.

Para §2.3 y §2.4 la explicación es otra, y es más incómoda: **el código sí existe y los tests sí
lo cubren — con una petición que ningún editor manda nunca**. Los criterios de SDD-24 y SDD-28
piden completado **sin `context`**, y el defecto del espacio solo aparece con `context`. Un
arnés que habla el protocolo a medias mide un cliente que no existe, que es exactamente lo que
SDD-28 ya se encontró con `snippetSupport: false`. La cobertura no puede ver eso: un parámetro
que nadie manda no es una rama muerta, es una pregunta sin hacer.

---

## 3. Interfaz pública

**Ningún contrato publicado cambia.** No hay `.d.ts` nuevo, ninguna global de `GLOBALS_DTS` se
toca, ninguna firma de `@fudic/compiler` ni de `@fudic/language-core` se mueve, y no se reserva
ningún código `FUD` — este BUG **no emite diagnósticos**, solo ofrece (§4.4).

Dos funciones nuevas, internas a `@fudic/language-server`:

```ts
// src/services/position.ts — el quinto contexto exacto
export function classContextAt(source: string, offset: number): PartialName | undefined;

// src/services/classes.ts — nuevo
export function styleClassNames(document: CachedDocument): readonly string[];
```

`classContextAt` devuelve el `PartialName` que ya usan los otros cuatro contextos: el span a
reemplazar y el texto escrito hasta ahora. El span **no** incluye el `class:`, al revés que
`directiveContextAt` con su `@`: aquí el prefijo se queda, es lo que abre el contexto.

`styleClassNames` devuelve los nombres **sin el punto**, deduplicados, en orden de aparición en
el fuente.

**Lo único publicado que cambia es la lista de caracteres de disparo** que el servidor anuncia
en `initialize` (`COMPLETION_TRIGGER_CHARACTERS`, y con ella `SERVER_CAPABILITIES` y el
`completionProvider` del servicio): **sale el espacio** (§4.5). Es un cambio de contrato con el
cliente y por eso está aquí y no en §4: un editor que hoy pide completado al pulsar espacio
dejará de pedirlo, que es precisamente lo que se busca.

---

## 4. Comportamiento corregido

### 4.1. De dónde salen los nombres: de todo `<style>` que el fichero alcanza

Dos sitios, y son los dos que la gramática permite:

- el `<style>` del `<head>`-fragment, a lo sumo uno (decisión 76);
- los `<style>` de dentro del `<template>`, que quedan inline en el shadow (decisión 77).

Los dos aplican al **mismo shadow root**, así que ofrecer uno y no el otro sería arbitrario. Se
recorre `document.head` y el árbol del `<template>`, y de cada `<style>` se toma su hijo
`style-content`: el parser ya corrió `parseStyle` sobre el cuerpo (SDD-09), y volver al
`source.slice(...)` teniendo el nodo delante es la señal que BUG-08 §3.1 dejó anotada.

### 4.2. Se leen los **preludios**, no las declaraciones

El `StyleNode` es deliberadamente plano —`CssPart[]`, sin árbol de reglas en v1 (SDD-09 §7)—, así
que el escáner es propio. La regla es una y resuelve sola todos los falsos positivos:

> Un `.nombre` cuenta **solo en posición de selector**: el tramo de texto que va desde el
> principio del cuerpo, un `{`, un `}` o un `;` hasta el siguiente `{`.

Lo que eso descarta, sin una sola guarda dedicada a cada caso:

| Escrito | Por qué no es una clase |
|---|---|
| `padding: 0.18rem` · `font-size: .72rem` | está en una declaración, no en un preludio |
| `content: ".foo"` | íd. — y además un ident CSS no empieza por comilla |
| `background: url(a.png)` | íd. |

Y lo que **sí** conserva, porque el preludio es exactamente donde vive: `.badge.success` (dos
nombres), `.a > .b`, `.a:hover`, `:not(.foo)`, `.a, .b`, las reglas anidadas de la decisión 42.e
(un preludio anidado sigue siendo un preludio) y `@scope (.card)`, que es un preludio de at-rule
con clases de verdad dentro.

Dos precisiones más:

- **Un `.` seguido de dígito no abre nada.** Un ident CSS no empieza por dígito, así que `.5s` en
  un preludio —`@supports (x: .5)`— no produce el nombre `5`.
- **Solo se escanean las partes `CssText`.** Un `RazorExpression`, un `AtEscapeNode` o un
  `RazorCommentNode` se saltan enteros: un nombre interpolado no es un nombre. Y un `.ident` que
  termina **justo** en el borde de una parte seguida de un átomo Razor se descarta, porque es un
  prefijo y no un nombre: `.item-@(n)` no ofrece `item-`.
- **Los comentarios CSS se saltan.** `/* .obsoleta { } */` no declara nada.

### 4.3. El quinto contexto, y contesta solo

`class:` es un contexto **exacto**, de los que responden sin fusionar: tras esos dos puntos una
palabra no puede ser una abreviatura de Emmet ni un tag, igual que pasa dentro de un `href`.
Entra en `completions()` antes de la rama de Emmet.

Con una condición que copia la que la rama de `@` ya tiene (SDD-28 §5.4): **solo gana si tiene
algo**. Un fichero sin `<style>` devuelve una lista vacía, y una lista vacía silenciaría a Emmet
sin poner nada en su lugar; en ese caso se cae a la cadena de siempre.

### 4.4. Ofrecer no es validar

La lista **no es cerrada** y no se convierte en ninguna comprobación. El usuario puede escribir
una clase que no está en el `<style>` de este fichero —una global que llega por
`<link rel="stylesheet">`, una que pinta un ancestro, una que aún no ha escrito— y eso es
correcto, se queda tal cual y **no produce diagnóstico**. Por eso este BUG no reserva ningún
código `FUD`: lo que añade es una lista, no una regla.

### 4.5. El espacio deja de disparar, y la zona de atributos vuelve a ser de HTML

Sale el espacio de los caracteres de disparo. Lo que queda entonces es lo que pasa en un `.html`
y lo que el usuario espera: se pulsa espacio, no se pide nada, y en cuanto se teclea la primera
letra el editor pide completado **invocado** —sin `triggerCharacter`— con todos los plugins
vivos. Ahí contestan el servicio HTML con los atributos nativos y TypeScript con los props del
componente, que es lo que ya hacían.

La regla que queda escrita, y es la que el usuario formuló: **una palabra dentro de un tag
abierto es HTML, y la contesta quien sabe de HTML.** El servidor no la disputa — su guarda de
[`position.ts:123`](../../../packages/language-server/src/services/position.ts#L123) ya decía
eso; lo que faltaba era no callar a los demás antes de que hablen.

Por qué **quitarlo** y no declararlo en los otros servicios: los otros servicios no son nuestros.
`createHtmlService` y los de TypeScript declaran sus caracteres, y envolverlos para añadirles uno
es sostener un parche sobre dos dependencias para conservar un disparo que no aporta nada — nadie
pidió que el espacio abriera la lista. Y el precio de quitarlo está acotado: el espacio solo
entró para el hueco de atributos, que es justo la posición donde hoy devuelve cero.

### 4.6. La rama de tag fusiona, no reclama

`tagContextAt` deja de contestar con un `return` que apaga al resto. Sus ítems son **una voz
más** en el hueco de después del `<`: los componentes del workspace, ordenados delante por su
`sortText` como ya lo están (§6.4 de SDD-24), y detrás los tags nativos que pone el servicio
HTML. Es la misma decisión que SDD-28 §5.5 tomó entre documentos, aplicada entre plugins: el
servidor sabe cosas que el servicio HTML no sabe, y ninguna de ellas es motivo para tapar las
que sí sabe.

Los otros contextos exactos **no** cambian: un `href`, un `@section ` y un `class:` siguen
contestando solos, porque ahí una respuesta de HTML no es una voz más — es ruido sobre una
posición cuyo conjunto de respuestas es cerrado y local.

---

## 5. Invariantes

**Los que el bug violaba**

- *El editor sabe del fichero lo que el fichero dice.* Había una posición donde el conjunto de
  respuestas es finito, local y **ya parseado**, y el servidor no contestaba.
- *Lo que el parser construye se usa.* El `StyleNode` estaba ahí desde SDD-09 y el editor no lo
  miraba ni una vez.
- *Un `.fud` es HTML con cosas dentro.* En la mitad del vocabulario que es HTML puro, el editor
  daba menos que un `.html` — y no por no saber, sino por callar a quien sabía.

**Los que la corrección añade**

- **Un nombre de clase se lee del preludio, nunca del texto.** La posición en la que aparece un
  `.foo` es la que decide si es un nombre; no hay lista de excepciones que mantener.
- **Una lista de completado no es una validación.** Ofrecer los nombres que existen no prohíbe
  los que no.
- **Un carácter de disparo se declara solo si este servidor tiene algo que decir al pulsarlo.**
  Declararlo excluye a todos los demás servicios: no es una invitación, es una exclusiva.
- **Donde el servidor sabe *además*, fusiona; donde sabe *en exclusiva*, contesta solo.** Un tag
  y una palabra suelta son lo primero; un `href`, un `@section` y un `class:`, lo segundo.
- **Un criterio de completado se pide como lo pide un editor.** Con su `context`: sin él, el test
  mide un cliente que no existe.

---

## 6. Criterios de aceptación

Tests en `packages/language-server/test/`.

1. **(rojo primero)** Sobre
   [`examples/basic/components/app-badge.fud`](../../../examples/basic/components/app-badge.fud),
   pedir completado en `class:|` ofrece `badge`, `success` e `info`. Contra el código anterior no
   ofrece ninguno, que es lo que hace de este el test del BUG.
2. `classContextAt` reconoce `class:` y `class:suc` (span = lo escrito tras los dos puntos, sin
   el prefijo), y **no** reconoce: `style:`, `class="…"`, un `class:` dentro de un valor de
   atributo entrecomillado, ni un `class:` en texto de markup fuera de un tag.
3. El nombre completado **reemplaza** lo ya escrito: en `class:suc|` el `textEdit` cubre `suc` y
   no duplica.
4. `.badge.success` produce **dos** nombres, `badge` y `success`; `.a > .b`, `.a, .b`, `.a:hover`
   y `:not(.foo)` producen los suyos.
5. Cero falsos positivos desde las declaraciones: `padding: 0.18rem`, `font-size: .72rem`,
   `content: ".foo"` y `background: url(a.png)` no aportan ningún nombre.
6. Una regla anidada (decisión 42.e) y un `@media` con clases dentro aportan las suyas;
   `@scope (.card) to (.content)` aporta `card` y `content`.
7. Un comentario CSS no aporta nada: `/* .obsoleta { color: red } */` → cero nombres.
8. Razor dentro del CSS: `.item-@(n) { … }` **no** ofrece `item-`, y el `.item` de una regla
   vecina sigue ofreciéndose.
9. Los `<style>` inline del `<template>` (decisión 77) aportan sus clases igual que el del
   `<head>`, y los nombres repetidos entre los dos aparecen **una sola vez**, en orden de
   aparición.
10. Un fichero sin `<style>` no rompe nada: la lista es vacía y el completado **cae a Emmet**, que
    sigue respondiendo lo de siempre.
11. Los otros cuatro contextos no se degradan: `href`, `@section `, `<tag` y `@directiva` siguen
    contestando lo mismo, y una palabra suelta sigue fusionando con Emmet.
12. Escribir una clase que no está en ningún `<style>` no produce **ningún** diagnóstico nuevo.

Los cinco siguientes son de §2.3 y §2.4, y **todos se piden con el `context` que manda un
editor** — sin él, ninguno falla contra el código de hoy:

13. **(rojo primero)** `<div rol|>` con `context: { triggerKind: 2, triggerCharacter: ' ' }`
    ofrece los atributos de HTML —`role` entre ellos—. Contra el código anterior devuelve **cero
    ítems**, que es lo que hace de este el test del defecto.
14. **(rojo primero)** `<app-badge |>` con ese mismo contexto ofrece los props del componente
    (`tone?`). Es el criterio §6.3 de SDD-24, pedido como lo pide el editor.
15. El espacio **no** está entre los caracteres de disparo que anuncia `initialize`, y el `@`,
    el `<` y los de Emmet **sí** siguen estando.
16. **(rojo primero)** `<di|` ofrece `app-badge` y también `div`: los componentes primero por
    `sortText`, los nativos detrás. Contra el código anterior no hay un solo tag nativo.
17. Los contextos exactos siguen siendo exclusivos con el contexto puesto: en `href="|"` y en
    `@section |` la lista sigue siendo solo la del servidor.

**Cobertura.** `language-server` no baja del 100 % en las cuatro métricas; `classes.ts` nace al
100 %.

---

## 7. Fuera de alcance

- **La segunda forma de pasar props, y el completado tras `.` y tras `@`.** Que un componente
  acepte `tone="success"` *y* `.tone="@(t)"` es un problema de **gramática**, no de editor, y
  el completado de props tras el punto solo tiene sentido cuando esa forma es la única. Los dos
  van juntos en [BUG-16](./BUG-16-props-con-punto.md), que toca `compiler` y `language-core`
  además de este paquete. Aquí se arregla que la zona conteste; allí, con qué.
- **`style:foo` y `bus:foo`.** Comparten la causa (§2.5) y no la corrección: los nombres de
  propiedad CSS son una tabla estática y los del bus son un `emit()` de otro fichero, resuelto por
  valor (decisión 28.c). Cada uno es su propio trabajo.
- **Completar el **prefijo** —ofrecer `class:` / `style:` / `bus:` / `ref` en un hueco del tag—.
  Es la otra mitad del completado de atributos y toca el ancla que BUG-11 acaba de rehacer.
- **Las clases de una hoja externa** (`<link rel="stylesheet">`, una global del layout). Exigen
  leer CSS de fuera del `.fud` y un índice que hoy no existe. Es justamente el caso que §4.4
  protege dejando la lista abierta.
- **Las clases de un `class="…"` estático** del propio fichero. Son uso, no definición; ofrecer
  lo que alguien escribió una vez es propagar erratas.
- **Navegar (F12) desde `class:success` hasta su regla CSS**, y renombrar. Piden llevar el span de
  cada nombre y decidir qué es «la definición» cuando hay tres reglas: es la continuación natural
  de este BUG, no parte de él.
- **Diagnosticar una clase que no existe.** Explícitamente descartado en §4.4, no aplazado.
- **La proyección de `@fudic/language-core`** no se toca: `$cls(v: boolean)` sigue igual y el
  nombre sigue sin viajar, porque quien lo tiene delante es el servidor.
