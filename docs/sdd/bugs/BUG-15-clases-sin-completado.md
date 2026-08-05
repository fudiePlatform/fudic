# BUG-15 — El completado se detiene en el `:` de `class:`, y las clases del fichero no las ofrece nadie

> **Estado:** `Listo`
> **Corrige:** [SDD-24 — Language server](../SDD-24-language-server.md) §3.2, §4.2, y amplía
> [SDD-28 — Snippets y completado](../SDD-28-snippets.md) §4.3, §5.5
> **Paquete:** `@fudic/language-server`
> **Rama sugerida:** la del backlog de uso
> **Depende de:** nada

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

### 2.3. Alcance

Comparten la causa exacta —prefijo de binding cuyo nombre nadie ofrece— las otras dos directivas
de la decisión 22/28.a: `style:foo` y `bus:foo`. Ninguna se arregla aquí (§7): sus nombres no
salen del `<style>` de este fichero, y meterlas convertiría la corrección en un rediseño del
completado de atributos.

No comparte la causa el **valor**, `class:x="@(…)"`: eso ya funciona, lo contesta la proyección,
y este BUG no lo roza.

### 2.4. Por qué la cobertura al 100 % no lo vio

`language-server` está al 100 % en las cuatro métricas. No hay rama sin ejercitar: **es que no
hay rama**. La cobertura mide el código que existe, y un contexto que nadie escribió no aparece
en ningún denominador. Es el complemento exacto de lo que BUG-11 §2.4 anotó para `language-core`:
allí el código corría sin significar; aquí ni siquiera existe.

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

---

## 5. Invariantes

**Los que el bug violaba**

- *El editor sabe del fichero lo que el fichero dice.* Había una posición donde el conjunto de
  respuestas es finito, local y **ya parseado**, y el servidor no contestaba.
- *Lo que el parser construye se usa.* El `StyleNode` estaba ahí desde SDD-09 y el editor no lo
  miraba ni una vez.

**Los que la corrección añade**

- **Un nombre de clase se lee del preludio, nunca del texto.** La posición en la que aparece un
  `.foo` es la que decide si es un nombre; no hay lista de excepciones que mantener.
- **Una lista de completado no es una validación.** Ofrecer los nombres que existen no prohíbe
  los que no.

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

**Cobertura.** `language-server` no baja del 100 % en las cuatro métricas; `classes.ts` nace al
100 %.

---

## 7. Fuera de alcance

- **`style:foo` y `bus:foo`.** Comparten la causa (§2.3) y no la corrección: los nombres de
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
