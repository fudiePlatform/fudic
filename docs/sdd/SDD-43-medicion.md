# SDD-43 — La medición (§4.2)

> **Tarea 1 de [SDD-43-Task](./SDD-43-Task.md).** No es código: es el informe que decide qué
> queda por implementar y qué ya funciona.
> **Fecha:** 2026-09-17
> **Evidencia ejecutable:**
> [`packages/vite/test/lib-resolution-probe.test.ts`](../../packages/vite/test/lib-resolution-probe.test.ts)
> (build) y
> [`packages/language-server/test/acceptance/lib-contract-probe.test.ts`](../../packages/language-server/test/acceptance/lib-contract-probe.test.ts)
> (editor).

El caso es el de §4.2: un workspace con una app y una librería, la app enlazando un
componente de la librería. Se construye en un directorio temporal, con el paquete instalado
de las dos formas que existen —**enlazado**, como lo deja pnpm, y **copiado**, como lo deja
un `npm install` corriente— y se mide sobre el build real y sobre un servidor LSP real.

Un test marcado `it.fails` en esas dos sondas es una medición que salió negativa, no un test
roto: es el rojo-primero de la fase que lo arregla, y pasa a `it` cuando esa fase aterriza.

---

## Las cinco preguntas

### 1. ¿El build compone el componente de la librería?

**Funciona**, con `href` relativo. El componente se compone entero: su `<template
shadowrootmode>`, el valor de su prop y su contenido *slotted*. Su hoja de estilos se hoistea
al `<head>` de la página como la de cualquier componente del propio proyecto.

No hace falta nada: para el compilador un `.fud` de otro paquete es un fichero en una ruta, y
`ResolveIo.resolve` ya lo devuelve.

### 2. ¿El índice del LSP lo tiene?

**Depende de qué carpeta se abrió en el editor, y la spec no lo dice en ninguna parte.**

| carpeta abierta | ¿indexa el `.fud` de la librería? |
|---|---|
| la raíz del workspace | **sí** — es un fichero más bajo la raíz barrida, con su tag y sus props obligatorias |
| solo la app | **no** — desde ahí solo se llega por `node_modules`, y eso está podado |

El segundo caso no es silencio: el editor emite **`FUD0460`** («el `href` no apunta a ningún
fichero») sobre un enlace que funciona y sobre un paquete que está instalado. Es peor que no
decir nada, porque manda a arreglar algo que no está roto.

### 3. ¿`$Props` resuelve, o es `any`?

Medido como dice §4.2: pasando un número a una prop declarada `string`.

- **Raíz del workspace abierta: resuelve.** El editor marca el error de tipo. El contrato de
  la librería llega entero.
- **App abierta sola: es `any`.** No se marca nada. Es exactamente el síntoma de BUG-23,
  reintroducido por la puerta de las librerías, y es lo que §4.4 tiene que cerrar.

La pregunta 3 no es independiente de la 2: el contrato está en el `Program` si y solo si el
fichero está en el índice.

### 4. ¿Funciona con el `href` relativo? ¿Y con el specifier de paquete?

**Relativo: funciona.** Un `href` que cruza a otro paquete es una ruta del disco y siempre lo
fue.

**De paquete: no**, y falla de **dos** maneras distintas, que es el hallazgo de esta medición.

**Sin scope** (`acme-ui/ui-card.fud`): no hay resolución de paquetes, así que el specifier se
une al directorio del fichero como si fuera una ruta relativa y el build muere con un `ENOENT`
sobre `…/src/routes/acme-ui/ui-card.fud`. Es lo previsto por la spec y es lo que arregla la
fase 2.

**Con scope** (`@acme/ui/ui-card.fud`): **el specifier nunca llega al resolutor.** El `@` abre
un `@`-construct de la gramática, así que el valor del atributo se parsea como la expresión
`@acme` seguida del texto `/ui/ui-card.fud`; `linkHref`
([`emit/resolve.ts:124`](../../packages/compiler/src/emit/resolve.ts#L124)) se queda solo con
las partes `attribute-text` y descarta las de expresión en silencio, de modo que lo que se
resuelve es `/ui/ui-card.fud` — raíz-absoluto — y el error nombra un fichero en la raíz del
disco sin mencionar el paquete.

Esto **no lo arregla resolver bare specifiers**: la cadena no llega entera. Y es el ejemplo de
cabecera de la spec, el de §1.3, §4.3 y el criterio 2. La decisión pendiente está al final de
este informe, y §4.3 de la spec la señala.

Lo que sí funciona hoy, sin tocar el parser: el escape de la propia gramática (decisión 1,
`@@` → `@` literal) entrega el specifier intacto. `href="@@acme/ui/ui-card.fud"` llega al
resolutor como `@acme/ui/ui-card.fud`.

### 5. ¿Cambia algo si el paquete está instalado de verdad en lugar de enlazado?

**Para el build, no.** Symlink y copia dan el mismo HTML.

**Para el índice lo es todo**, y por eso esta pregunta y la 2 son la misma: un paquete
enlazado por pnpm tiene sus ficheros bajo la raíz del workspace, donde el barrido los ve; uno
copiado los tiene dentro de `node_modules`, detrás de la poda. Que hoy «parezca funcionar» en
este repo es un accidente del layout de pnpm, no una propiedad del producto: la misma librería
publicada en npm e instalada por un usuario desaparece del editor.

---

## Qué queda, y qué no

| # | tarea del Task | veredicto |
|---|---|---|
| 2–3 | el resolutor y los tres hosts | **hace falta**, tal como está escrito |
| 4 | `FUD0760` | **hace falta**. El mensaje de hoy nombra un fichero que nunca existió |
| 5 | `FUD0763` | **hace falta**. No hay nada que mire el `kind` del paquete destino |
| 6–7 | `findLibraries`, índice y `Program` | **hace falta**, y es la mitad que de verdad importa: sin ella el editor pierde el contrato en cuanto la librería no está enlazada bajo la raíz |
| 8 | solo lectura | **hace falta**. Hoy los `.fud` de una librería enlazada se diagnostican y se formatean como propios |

Nada sale en verde entero. Lo que sí cambia la medición es **el orden de importancia**: la
rama del índice (6–8) no es la mitad cómoda de este SDD, es la que arregla un fallo que ya se
puede provocar hoy, con el `href` relativo que la spec dice que seguirá siendo legal.

---

## Apéndice — qué más puede llevar una librería (medido al cerrar)

La pregunta que sale en cuanto el primer componente funciona: *si una librería es un paquete de
fuentes, ¿puede llevar también un layout, una hoja, un asset o un `.js`?* Se midió igual que el
resto, con un build real, y la evidencia está en
[`packages/vite/test/lib-extras-probe.test.ts`](../../packages/vite/test/lib-extras-probe.test.ts).
**Las cuatro funcionan, y no hacía falta tocar nada.**

| Lo que lleva | Veredicto |
|---|---|
| **Un layout** (`<link rel="layout" href="@acme/ui/_layout.fud">`) | **Funciona.** Se compone como el propio: su `<head>`, `@RenderHead()` con lo que aporta la ruta, `@RenderBody()`. El marcador `fudic:runtime` se honra, así que la app sigue registrando su worker — el layout dice **dónde**, y qué va ahí lo decide el build del consumidor |
| **Una hoja enlazada** (`<link rel="stylesheet" href="./lib.css">` desde un `.fud` suyo) | **Funciona.** Se publica con hash y se le reescribe el `href`. Es el registro de nombres de [BUG-40](./bugs/BUG-40-una-hoja-que-no-se-puede-enlazar.md), que resuelve contra el fichero que la enlaza — y ese fichero está dentro de la librería |
| **Un asset** (`<img src>` en su layout y `url(…)` en el CSS de su componente) | **Funciona, y se publica una vez** para las dos referencias. Contesta lo que §7 dejó abierto: resolver assets desde un paquete no hace falta implementarlo |
| **Un `.js` propio** (`import { shout } from './format.js'` en su `@code`) | **Funciona.** Resuelve desde el directorio de la librería, corre en el render del servidor y viaja al bundle del consumidor como un chunk suyo — que es la ventaja de publicar fuente: la librería no arrastra bundle propio |

Lo único que conviene saber, y **no es de las librerías**: el marcador `fudic:runtime` solo se
honra dentro de `<head>`. Escrito en el `<body>` sale literal —`src="fudic:runtime"`— en una app
exactamente igual que en una librería.

Lo que una librería sigue **sin** poder llevar: rutas (no tiene `base` ni origen; `fudic g page`
sobre una `lib` es `FUD0783`) y paso de build propio (§4.1).

---

## La decisión, ya tomada

Un paquete npm con scope se llama `@acme/ui`, y `@` es el carácter de transición de la
gramática. Las tres salidas, y ninguna es del implementador:

1. **`href` literal.** El `href` de un `<link rel="component"|"layout">` deja de admitir
   `@`-constructs: es una referencia a un fichero que se resuelve en compilación, nunca una
   expresión. `linkHref` ya descarta las partes de expresión, así que no se pierde ningún
   significado que hoy exista. El autor escribe `@acme/ui/card.fud`, igual que en un `import`.
2. **El escape.** El autor escribe `@@acme/ui/card.fud`. Funciona hoy, sin tocar nada, pero el
   `href` deja de parecerse al nombre del paquete y eso es un `@@` que explicar en cada
   documento.
3. **Otra sintaxis para el specifier de paquete**, distinta de la de npm.

**Se eligió la 1**, y [§4.3](./SDD-43-librerias.md) la recoge: el `href` de un `<link>` se
lee verbatim, el autor escribe `@acme/ui/card.fud` y no hay nada que escapar. Es la única de
las tres que deja la spec escrita como estaba, y la fase 2 ya no está bloqueada.
