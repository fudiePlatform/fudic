# SDD-47 — Eventos en el host y en el shadow root, y un capturador que oye gestos

> **Estado:** `Hecho` — los 15 criterios de §6 verdes, verificado por Pedro en navegador y
> editor; [Task](./SDD-47-Task.md) 16 / 16.
> **Paquetes:** `@fudic/compiler` (listeners en el shadow root) · `@fudic/core` (el
> capturador) · `@fudic/language-core` (la proyección del `<template>`) ·
> `@fudic/example-basic` (la evidencia)
> **Depende de:** 15, 17, 24, 45, BUG-32
> **Rango de diagnósticos:** ninguno. No se añade ni se retira ningún diagnóstico.
> **Naturaleza:** emit + runtime + editor. No toca el parser ni la gramática.
>
> Un componente puede escuchar en dos sitios: en su host y en su shadow root. Y el
> capturador global de la hidratación deja de oír solo `click`.

---

## 1. Contexto y objetivo

### 1.1. Lo que hay hoy

[BUG-32](./bugs/BUG-32-bindings-en-el-host.md) hizo que un `@evento` en el tag propio del
componente —la identidad de la decisión 75— llegue al chunk de cliente como listener en el
**host**. El `<template shadowrootmode>` no admite nada parecido: un `@evento` escrito ahí no
se registra en el lote de Oxc, no se emite y el editor no lo proyecta.

El capturador de [SDD-17](./SDD-17-hidratacion.md) escucha en captura sobre `document` y
despierta un componente frío con el primer gesto. Su lista es `['click']`. Además:

- la reproducción del gesto reconstruye el evento solo con `{ bubbles, cancelable, composed }`:
  un `keydown` reproducido llega sin `key` y un `input` sin `inputType`;
- el camino 2 hace `preventDefault()` siempre: en un campo de texto eso se come la tecla, y un
  evento sintético no la vuelve a escribir;
- un gesto que llega mientras el camino 2 de esa instancia está en vuelo cae en el camino 1
  —la instancia ya está marcada— sin listener que lo reciba, y se pierde.

### 1.2. Qué cruza el shadow root

Lo decide el flag `composed` del evento, no quién lo escucha:

- **Cruzan** (`composed: true`): `click`, `dblclick`, `auxclick`, `contextmenu`, `mouse*`,
  `pointer*`, `touch*`, `wheel`, `keydown`, `keyup`, `input`, `beforeinput`, `focus`, `blur`,
  `focusin`, `focusout`, `composition*`, `drag*`, `copy`, `cut`, `paste`. Fuera, `target` se
  retargetea al host.
- **No cruzan:** `change`, `submit`, `reset`, `formdata`, `invalid`, `select`, `toggle`,
  `load`, `error`, `scroll`, `slotchange` y todo `CustomEvent` sin `composed: true`.

Un listener en el **shadow root** oye todo lo que burbujea dentro, cruce o no, y lo del light
DOM proyectado en sus slots. Uno en el **host** oye lo que cruza, lo de sus hijos light y lo que
se despacha sobre él.

### 1.3. El objetivo

- `@evento` en el `<template shadowrootmode>` = listener en el shadow root. Mismas reglas y
  mismo editor que en el host.
- El capturador oye los gestos discretos, reproduce el evento con sus datos, no cancela donde
  el usuario escribe y encola lo que llega durante la hidratación.

Que un evento puesto en el host no llegue porque no cruza **no es asunto del framework**: es la
plataforma, y ni se diagnostica ni se avisa.

---

## 2. Dependencias

**SDD-15.** El chunk de cliente: `$dom.event(nodo, tipo, handler)` dentro de `$s()`, `$shadow`
en la intake del factory, y las tres formas de handler (referencia, llamada, lambda).

**SDD-17.** El capturador en captura sobre `root`, los tres caminos, `replayer` y la marca
`hydrated` antes de cualquier `await`.

**SDD-24.** La proyección de cliente del editor: `$on(tipo, handler)` tipado contra
`HTMLElementEventMap`, el ancla de un `@` a medio escribir.

**SDD-45.** El coordinador por ruta llama a `installHydration({ root: document, … })`; la lista
de tipos vive en el runtime publicado, no en el coordinador.

**BUG-32.** `collectAttributeJs`, `emitHost` en los dos emisores y `emitHostBindings` en el
editor: el patrón que este SDD repite para el `<template>`.

---

## 3. Interfaz pública

### 3.1. Sintaxis

```html
<app-boton @click=@enHost @keydown=@anota("host", $event)>
  <template shadowrootmode="open" @click=@enShadow @change=@anota("shadow", $event)>
    …
  </template>
</app-boton>
```

Las tres formas de handler valen en los dos sitios. `bus:` en el `<template>` es lo mismo que
en el host: su listener va en `document` con el host como contexto.

### 3.2. `@fudic/compiler`

- `ClientMarkupEmitter.emitShadow(template: ElementNode): void` — solo los listeners del
  template, sobre `$shadow`. Ninguna escritura de atributo: el template no es un elemento de la
  salida.
- `collectFragments` registra los atributos del `<template>` después de los del host y antes
  que su contenido (orden de fuente).
- `hasHookup(comp)` mira desde el host hacia abajo: un evento en el host o en el template es
  enganche, igual que uno dentro.

### 3.3. `@fudic/core`

- `CAPTURED_TYPES` = `click`, `dblclick`, `auxclick`, `contextmenu`, `keydown`, `keyup`,
  `beforeinput`, `input`, `focusin`, `focusout`.
- `replayer(event, target)` copia del original los miembros de init de `UIEvent`, `MouseEvent`,
  `PointerEvent`, `KeyboardEvent`, `InputEvent` y `FocusEvent`, solo los que el original tiene.
- `createCapturer` mantiene una cola por instancia mientras su camino 2 está en vuelo.

### 3.4. `@fudic/language-core`

- `emitShadowBindings(ctx, template)` — proyecta los eventos (y los `bus:`) del template por el
  mismo `$on` que el host, incluido el `@` a medio escribir. Los atributos del DSD
  (`shadowrootmode`, `shadowrootadoptedstylesheets`) no se proyectan.

---

## 4. Comportamiento

### 4.1. El listener del template

El factory ya tiene `$shadow`. El template emite
`$shadow && $d.push($dom.event($shadow, "tipo", handler));` en `$s()`, después de los del host
y antes que los de su contenido. El servidor no escribe nada: el `<template>` que serializa no
lleva los `@evento` del fuente.

### 4.2. Qué captura el main

Un listener en captura sobre `document` oye todo lo que cruza, burbujee o no. La lista la
decide qué es un **gesto**: puntero discreto, teclado, edición y foco. `focusin`/`focusout` en
vez de `focus`/`blur`, porque son el mismo momento y basta un par.

Fuera a propósito:

- los continuos (`mousemove`, `pointermove`, `mouseover`, `wheel`, `touchmove`, `scroll`): se
  disparan cientos de veces por segundo, y anticipar la descarga es trabajo del viewport;
- los que no cruzan (`change`, `submit`, `invalid`, `toggle`): desde dentro de un componente no
  llegan a `document`, y un formulario ya está levantado en la instalación (`fud-eager`).

### 4.3. Cancelar y reproducir

- **Destino editable** —`input` de texto, `textarea`, `select`, `contenteditable`—: no hay
  `preventDefault()`. La acción por defecto (escribir) ocurre, y el handler recibe la
  reproducción después. Un `input` de tipo `checkbox`, `radio`, `button`, `submit`, `reset`,
  `image`, `file`, `color`, `range` o `hidden` no es editable.
- **Cualquier otro destino:** `preventDefault()` como hasta ahora.
- En los dos: `stopImmediatePropagation()`.
- La reproducción lleva `bubbles: true`, `cancelable: true`, el `composed` original y los
  miembros de init del §3.3.

### 4.4. La cola

El primer gesto sobre una instancia fría abre su cola y lanza el camino 2. Cada gesto que llega
a esa instancia antes de que termine se retiene (§4.3) y se encola. Al terminar, la cola se
cierra **antes** de reproducir, y los gestos se reproducen en orden de llegada: cada uno entra
en el capturador como camino 1. El caso que la obliga: pulsar un botón da `focusin` antes que
`click`, y el foco empieza la hidratación.

### 4.5. El editor

El template proyecta `$on('tipo', handler)` igual que el host: la misma lista de nombres al
escribir `@`, el mismo tipo de evento en el handler, el mismo error si no casa, y las
expresiones del template tienen AST porque `documentRoots` ya las recorre.

---

## 5. Invariantes

- El host oye lo que la plataforma deja salir del shadow; el shadow root, lo de dentro. Ningún
  diagnóstico dice qué evento llega a dónde.
- Un componente sin eventos en el template emite los mismos bytes que antes.
- Un gesto se reproduce una vez, y solo en el camino 2.
- Nada de lo que el usuario escribe en un campo se pierde por la hidratación.

---

## 6. Criterios de aceptación

**Compilador**

1. Un `@evento` en el `<template>` sale en el chunk de cliente como
   `$dom.event($shadow, "evento", …)`.
2. Las tres formas de handler (referencia, llamada con valores y `$event`, lambda) funcionan en
   el template igual que en el host.
3. El render de servidor no cambia por un `@evento` en el template.
4. Un componente cuyo único enganche es un evento en el host o en el template hidrata (nivel 3).
5. Un componente sin eventos en el template emite los mismos bytes que antes.

**Runtime**

6. `installHydration` registra en captura sobre `root` exactamente los diez tipos del §3.3.
7. La reproducción conserva `key`, `code`, `inputType`, `data`, coordenadas y `relatedTarget`
   del original, y no inventa miembros que el original no tiene.
8. Sobre un destino editable el camino 2 no llama a `preventDefault()`; sobre uno no editable,
   sí. Los tipos de `input` no editables del §4.3 se tratan como no editables.
9. Un gesto que llega durante el camino 2 se retiene y se reproduce después del primero, en
   orden; tras reproducirse, un gesto nuevo es camino 1.

**Editor**

10. Los eventos del template se proyectan como `$on(…)`; `shadowrootmode` y
    `shadowrootadoptedstylesheets` no se proyectan.
11. Un `@` a medio escribir en el template ofrece los nombres de evento.
12. Un handler cuyo tipo de evento no casa da el mismo error en el template que en el host.

**Evidencia**

13. `/ruta-evento` en `examples/basic`: el primer clic sobre un componente frío lo oyen shadow y
    host; ninguna tecla se pierde; `change` y `aviso-dentro` solo los oye el shadow;
    `aviso-fuera` los dos; las llamadas con valores anotan su nota. Verificado por Pedro.
14. `examples/basic` lleva `tsconfig.json`: sin él el editor aplicaba su proyecto implícito
    (`strictNullChecks` sí, `noImplicitAny` no) y `const more = []` era `never[]` en los dos
    calendarios. Sin `TS2345` en el editor.
15. `pnpm test` verde; los ficheros con código nuevo, ese código al 100 % en las cuatro
    métricas, y ningún paquete por debajo de su suelo.

---

## 7. Fuera de alcance

- Diagnosticar un evento que no cruza puesto en el host.
- Capturar solo los tipos que la página usa (publicarlos desde el compilador en los mapas).
- Listeners en captura por shadow root para eventos que no cruzan antes de hidratar.
- Hidratar al pasar el ratón.
- `class:`, `style:` o atributos de autor en el `<template>`.
