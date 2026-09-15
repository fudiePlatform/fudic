# SDD-40 — Props de layout: el layout declara, la ruta le pasa

> **Estado:** `Listo`
> **Paquetes:** `@fudic/compiler` (las props de un layout, el `<html>` interpolado, el contrato) ·
> `@fudic/transport` (`RenderContext.layout`) · `@fudic/vite` (el envoltorio, el endpoint de
> datos, el prerender) · `@fudic/language-server` (el diagnóstico y la bombilla) ·
> `@fudic/example-basic` (la evidencia)
> **Depende de:** 12, 15, 19, 20, 21, 23, 24, 27, 36
> **Rango de diagnósticos:** `FUD0700`–`FUD0719`
> **Naturaleza:** emit + transporte + editor. No toca el runtime de hidratación.
>
> **Ordenar con [SDD-39](./SDD-39-rutas-reactivas.md).** Los dos tocan
> `packages/compiler/src/emit/layout.ts`. No comparten decisión ninguna, pero sí fichero: van en
> serie, no en paralelo.

---

## 1. Contexto y objetivo

Un layout es hoy markup mudo. Puede leer `data` —la del `load` de la ruta— y nada más. No tiene
forma de declarar qué necesita, así que cualquier cosa que dependa de la ruta acaba viajando
dentro de `data`, mezclada con lo que la ruta pinta en su propio template.

El caso que lo destapa es el `lang` del documento:

```html
<!-- _layout.fud -->
<html lang="es">
```

Está escrito a mano y en un solo idioma. Para que salga de la ruta hacen falta dos cosas que no
existen: que el layout pueda **declarar** que necesita una culture, y que la ruta pueda
**pasársela** sin arrastrarla por `data`.

Y hay una tercera, más pequeña y más fea, que hay que arreglar de paso: **el tag de apertura del
`<html>` se emite como texto literal**. `buildLayoutModule` lo toma con
`slice(source, doc.html.openSpan)` y lo mete en un `JSON.stringify`, así que lo que el autor
escriba en sus atributos sale al HTML tal cual, sin interpolar. Con eso, `lang` no puede depender
de nada aunque todo lo demás estuviera resuelto.

**El objetivo:** que un layout declare props como las declara cualquier otra cosa en este
framework, que la ruta las resuelva donde tiene la petición delante, y que las tres formas de
renderizar —`edge`, `sw` y `ssg`— produzcan el mismo HTML.

### 1.1. Lo que este SDD NO es

**No es reactividad en el layout.** Una prop de layout es un valor de render, y pasarle una
`signal` es un error de compilación (§4.3). El motivo es estructural y está en §4.3: admitirla
obligaría al markup del layout a aportar anclajes al chunk de la ruta, que es exactamente lo que
[SDD-39 §4.3](./SDD-39-rutas-reactivas.md) evita para que un chunk siga teniendo una sola entrada
en `sources`.

**Tampoco es reactividad en el `<head>`.** Lo que va en la cabecera lo leen máquinas en el
momento en que llega el documento —el rastreador, el parser, quien comparte el enlace—, y lo que
una máquina ya leyó no se des-lee. El único que alguien pide es el `<title>`, y sale por el
`effect` de la ruta con DOM plano (§7).

---

## 2. Dependencias

**SDD-21 — Layouts.** La cadena de layouts, la composición por módulo ES
(`layout(data, io, route)` con los cuatro huecos), `@RenderBody` / `@RenderHead` /
`@RenderSection`, y `<link rel="layout" href="…">` como forma de declarar la relación.

**SDD-12 — Semántica.** El contrato de props que ya resuelve `graphRegistry` / `propsOf`, y los
diagnósticos `FUD0197` (prop requerida que el host no pasa) y `FUD0198` (`.prop` que el hijo no
declara). Las props de un layout se contestan con el mismo mecanismo.

**SDD-15 / SDD-19 / SDD-20 / SDD-27 — Emit, build, SW y manifiesto.** El envoltorio generado
(`emitRenderChunk`) con sus dos variantes, el endpoint de datos generado por patrón, el prerender
y `RenderContext`.

**SDD-23 / SDD-24 — Emisor TS virtual y language server.** La proyección que hace que TypeScript
vea las props de un componente, y `provideCodeActions`.

**SDD-36 — El editor terminado.** La bombilla, con su regla escrita: **una voz por hecho**. Lo
que TypeScript ya reporta no se reporta otra vez; lo que hace falta añadir son las manos, porque
sobre la proyección TypeScript devuelve cero quick fixes. La acción de este SDD es la hermana de
*«Completar las props requeridas de `<tag>`»*.

---

## 3. Interfaz pública

### 3.1. El layout declara

El `@code` de un layout admite **una sola cosa**: la declaración de sus props, en la zona neutra,
con la misma función que usa un componente. No hay vocabulario nuevo — es el mismo en los tres
papeles, ruta, componente y layout.

```ts
// _layout.fud
@code {
  const { culture, theme = "light" } = props<{ culture: string; theme?: string }>();
}
```
```html
<html lang="@culture">
  …
  <body data-theme="@theme">
```

Ni `@server`, ni `@client`, ni lógica suelta en la zona neutra: `FUD0700`.

**Esto retira `FUD0437`** —«un layout no tiene `@code`», decisión 82— que decía justo lo
contrario. Lo que queda de aquella regla es más estrecho y cambia de dueño: distinguir una
declaración de props de una sentencia suelta es una pregunta sobre JS, no sobre estructura,
así que la contesta el emit con `FUD0700` y `buildLayout` deja de rechazar el bloque. El
`@code` de un layout vive dentro de su `<head>`, como el de una página (decisión 60): un
layout tiene forma de página.

### 3.2. La ruta resuelve

Un tercer export reservado en `@code { @server }`, al lado de los dos que ya hay:

```ts
// una ruta
@code {
  @server {
    export async function paths()            { return await db.slugs(); }
    export async function load(ctx)          { return { post: await db.get(ctx.params.slug) }; }
    export async function layout(ctx, data)  { return { culture: post.lang }; }
  }
}
```

```ts
/** The layout props of one render. Runs after `load`, and receives what it resolved. */
export type LayoutResolver<D = unknown, P = unknown> = (
  ctx: RenderContext,
  data: D,
) => P | Promise<P>;
```

Recibe `data` porque si no solo puede leer del contexto y se queda a medias: la culture puede
salir tanto de una cabecera como de la fila que `load` acaba de traer.

### 3.3. El cable

```ts
export interface RenderContext {
  // …origin, url, params, mode, nonce, data
  /**
   * The layout props of this render, already resolved. Travels beside `data` and never
   * inside it: what a route paints and what its layout needs are two shapes, and mixing them
   * makes the second one an accident of the first.
   */
  readonly layout?: unknown;
}
```

El endpoint de datos generado devuelve las dos cosas —`{ data, layout }`— en una sola respuesta:
es una petición, no dos, y las dos salen del mismo instante de la misma petición.

Y por eso **una ruta que solo resuelve props de layout también tiene endpoint**: hasta ahora lo
tenía exactamente la que declaraba `@server load`, porque era lo único que había que servir. Con
dos mitades en una respuesta, `layout(ctx, data)` a solas basta — el SW no ejecuta ninguna de las
dos y sin endpoint no tendría por dónde recibirlas.

### 3.4. La composición

```ts
// el módulo de un layout
export function* layout(data, io, route, props) { … }
```

Un cuarto parámetro, y el módulo de la ruta se lo pasa desde `page`:

```ts
export function* page(data, io, layoutProps) {
  yield* layout(data, io, { head, body, section, blocks }, layoutProps);
}
```

Un layout anidado reenvía a su padre las suyas, que son las que **él** declara y no las de su
hijo (§4.8).

### 3.5. El editor

Una fila más en la segunda tabla de [SDD-36 §3.1](./SDD-36-editor-terminado.md) — las que no se
anclan en un diagnóstico propio sino en el contrato:

| Hecho | Título | Escribe |
|---|---|---|
| El layout declara props requeridas que la ruta no resuelve | `Completar las props requeridas del layout` | El `export async function layout(ctx, data)` entero si no existe, o los campos que faltan en su `return`, con un valor **del tipo de cada prop** |

---

## 4. Comportamiento

### 4.1. Un layout solo declara props

Y no es una restricción por prudencia: es lo que hace que el layout **no tenga mitad de cliente**
y que todo lo demás de este SDD se sostenga. Un `@server` en un layout sería un segundo `load`
sin ruta que lo llame; un `@client`, código que nadie va a descargar porque no hay chunk de
layout; lógica suelta en la zona neutra, código que corre en los dos renderizadores sin que nadie
pueda decir cuándo.

`FUD0700` sobre lo que sobre, y el resto del fichero se sigue emitiendo.

### 4.2. El orden de una petición, y qué corre cuándo

```
paths()                   ← UNA VEZ, al construir. Enumera el espacio de :param.
                            No se llama nunca en `edge` ni en el SW.

ctx.params                ← del casado de la URL con el patrón. No sale de ninguna función.
  ↓
load(ctx)        → data
  ↓
layout(ctx, data) → props del layout
```

`layout` va **después** de `load` y recibe lo que resolvió. Es la corrección que hace que la prop
pueda salir tanto del contexto como de la consulta.

### 4.3. Una prop de layout **no** puede ser reactiva

Pasarle una `signal` o un `computed` es `FUD0701`, error, y el valor se ignora.

El motivo es de mecanismo y no de gusto. El chunk de una ruta atraviesa el markup del layout con
llamadas al cursor y **sin aportar un solo anclaje**, y eso es lo que mantiene una sola entrada en
`sources` (SDD-39 §4.3, SDD-13 §4.3). Una prop reactiva obliga a lo contrario: el chunk tendría
que saber **qué nodos del layout** repintar, así que el layout pasaría a anclar. Se rompe el
invariante de source maps y aparece una mitad de cliente de layout que este SDD no tiene.

Lo que se pierde con ello es exactamente nada de lo que motivó la spec: una culture no cambia sin
recargar, y un `lang` que se mueve no es un caso, es un síntoma.

### 4.4. El `<html>` deja de emitirse por corte del fuente

Hoy:

```js
yield "<!DOCTYPE html><html lang=\"es\"><head>" + head + '</head>';
```

`slice(source, doc.html.openSpan)` dentro de un `JSON.stringify`: los atributos del `<html>` salen
literales, interpolación incluida. Pasa a emitirse por la maquinaria de atributos que ya usa
cualquier otro elemento.

**Y el `<body>` tenía la misma omisión, peor**: se construía con `$dom.element('body')` y sus
atributos se perdían enteros, interpolados o no. Es el mismo arreglo, y el ejemplo de §3.1 lo
necesita — `<body data-theme="@theme">`.

**No hace falta tocar el orden de emisión.** La línea está dentro de
`export function* layout(data, io, route, props)`, así que `data` y las props ya están resueltas
ahí y todavía no se ha emitido un byte. No es una restricción de streaming: era un atajo.

### 4.5. Los tres orígenes producen el mismo HTML

Es la propiedad que define este SDD, y la que decide la forma de §3.2 y §3.3.

| Origen | `data` | props del layout |
|---|---|---|
| `edge` | `load(ctx)` en proceso | `layout(ctx, data)` en proceso |
| `sw` | del endpoint de datos | del **mismo** endpoint, en la misma respuesta |
| `ssg` | `load(ctx)` al construir | `layout(ctx, data)` al construir |

El Service Worker **no ejecuta ninguna de las dos**, y no es una carencia: `@server` no puede
acabar en un bundle de cliente porque ahí hay claves y acceso a datos (BUG-09). El SW recibe los
dos resultados ya resueltos, por el mismo cable, y renderiza.

De ahí sale la regla que hace esto isomorfo: **una prop de layout es lo que
`layout(ctx, data)` devuelve, nunca un efecto lateral de `load`.** Un `load` que tocara algo por
el camino funcionaría en el servidor y no en el SW, y la misma ruta daría dos HTML distintos.

### 4.6. Nada de esto se serializa al cliente

Ni las props del layout van a un bloque JSON, ni el layout tiene chunk. El navegador recibe el
HTML ya resuelto y ahí acaba. La pregunta «cómo se serializa el layout al hidratar» no tiene
respuesta porque no tiene caso: solo el servidor lo escribe y solo el servidor lo lee.

### 4.7. Props requeridas: una voz, y las manos

Que una ruta no resuelva una prop requerida de su layout **es un error y no otra cosa**. Se
reparte igual que el contrato de un componente (SDD-36 §3.1):

- **En el build** (`vite`, `fudic check`): `FUD0702`, sobre el `<link rel="layout">` de la ruta,
  que es donde se declara la relación.
- **En el editor**: el hecho lo dice TypeScript sobre la proyección —el `return` de `layout` se
  comprueba contra el tipo de `props<{…}>()`— y **no se reporta dos veces**. Lo que el servidor
  añade es la bombilla de §3.5.

Y lo que la bombilla escribe es **del tipo de la prop**, por la razón que SDD-36 ya dejó escrita:
una reparación que deja el fichero con un error de tipos que ella misma creó es peor que no
tener bombilla. Si la ruta no exporta `layout` en absoluto, la acción escribe la función entera
con su `return` completo.

**Cómo hace TypeScript de voz**, que es la parte que no era obvia: la proyección le pone a la
función del autor el **tipo de retorno** que él no escribió —`: $LayoutProps | Promise<…>`,
empalmado justo tras el `)` de sus parámetros— y con eso el `TS2739` cae sobre su propio
`return`. Escrito como una asignación sintética al lado, el error habría caído sobre la
asignación sintética, que es exactamente el fallo que SDD-36 describe para las props de un
componente. Un resolver que ya declara su tipo de retorno se deja tal cual: la anotación es lo
que el autor dice de su función.

Un valor sin forma obvia se escribe `null as unknown as <el tipo>` y no `@()`: el `return` de un
resolver es **código**, no un valor de atributo, y `@()` ahí no es gramática de nada.

### 4.8. Layouts anidados

Cada layout declara las suyas y recibe las suyas. El módulo de un layout anidado reenvía a su
padre **las del padre**, no las propias, exactamente como ya reenvía las secciones y los bloques.
Lo que `layout(ctx, data)` de la ruta devuelve es la unión de lo que declara la cadena; dos
layouts de la cadena que declaren el mismo nombre con tipos distintos es `FUD0703`.

**Dónde se ancla `FUD0703`:** sobre el `<link rel="layout">` del layout anidado — el único
span de la cadena que pertenece al fichero que se está emitiendo, y el mismo sitio donde
`FUD0702` cae en la ruta. Se comparan los **textos** de los tipos, no tipos resueltos: este
pase tiene un AST. Un tipo que ninguno de los dos escribe no se compara, igual que
`optional` no inventa un error sobre lo que no puede demostrar (BUG-23 §4.4).

---

## 5. Invariantes

- **Un vocabulario, tres papeles.** Una ruta, un componente y un layout declaran props con
  `props<{…}>()`. No hay una segunda forma, y este SDD no la introduce.
- **El layout no tiene mitad de cliente.** Ni chunk, ni bloque, ni anclaje en el chunk de la
  ruta. Es lo que mantiene en pie el invariante de source maps de SDD-13 §4.3.
- **`@server` no viaja.** El SW recibe resultados, nunca código de servidor.
- **Nada lanza.** Un layout con un `@code` indebido, una prop reactiva o una requerida sin
  resolver se anotan y el fichero se sigue emitiendo, degradado.
- **Una voz por hecho.** En el editor, lo que TypeScript reporta no lo reporta también el
  servidor; el servidor pone la reparación.
- **Spans universales.** Todo diagnóstico de este rango lleva su span: `FUD0700` sobre lo que
  sobra en el `@code`, `FUD0701` sobre el valor, `FUD0702` sobre el `<link rel="layout">`.

### Catálogo de diagnósticos (`FUD0700`–`FUD0719`)

| Código | Severidad | Qué dice |
|---|---|---|
| `FUD0700` | `error` | El `@code` de un layout contiene algo que no es su declaración de props. |
| `FUD0701` | `error` | Una prop de layout recibe un valor reactivo (`signal` / `computed`). Un layout no tiene mitad de cliente que pueda repintarlo. |
| `FUD0702` | `error` | La ruta no resuelve una prop **requerida** del layout — porque falta en el `return` de `layout(ctx, data)`, o porque la ruta no exporta esa función. Sobre el `<link rel="layout">`. Es el que ancla la bombilla. |
| `FUD0703` | `error` | Dos layouts de la misma cadena declaran la misma prop con tipos incompatibles. |
| `0704`–`0719` | | Reservados. |

---

## 6. Criterios de aceptación

Tests en `packages/compiler/test/emit/` (1–7), `packages/vite/test/` (8–11),
`packages/language-server/test/` (12–14) y la evidencia en `examples/basic` (15–17).

**El layout declara**

1. **(rojo primero)** Un layout con `const { culture } = props<{ culture: string }>()` y
   `<html lang="@culture">` emite el `lang` **interpolado**, no el texto `@culture`. Es el corte
   de fuente de §4.4, invertido.
2. El `@code` de un layout con un `@server`, un `@client` o una sentencia suelta emite `FUD0700`
   con su span, y el resto del layout se emite igual.
3. Una prop con default (`theme = "light"`) que la ruta no resuelve usa el default y **no**
   diagnostica; una sin default que la ruta no resuelve emite `FUD0702` sobre el
   `<link rel="layout">`.
4. Una prop de layout alimentada con una `signal` emite `FUD0701` y el valor se ignora.

**La composición**

5. `page(data, io, layoutProps)` pasa las props al módulo del layout, y el layout las
   desestructura arriba del todo, antes de su primer `yield`.
6. **Anidados.** Con dos layouts en cadena, cada uno recibe **las suyas** y reenvía las del padre.
   Dos que declaran el mismo nombre con tipos incompatibles emiten `FUD0703`.
7. El chunk de cliente de una ruta con layout **sigue sin anclar nada** del layout: una entrada en
   `sources`, y ningún mapeo al `.fud` del layout. Es el criterio de SDD-39 §6.6, que este SDD no
   puede romper.

**El cable y los tres orígenes**

8. **(rojo primero)** El orden por render es `load` y después `layout`, y `layout` recibe lo que
   `load` devolvió: una prop derivada de `data` llega resuelta.
9. `paths()` corre **solo** al construir. Ni el envoltorio del borde ni el del SW lo llaman.
10. El endpoint de datos de un patrón devuelve `{ data, layout }` en **una** respuesta.
11. **La propiedad que define el SDD.** La misma ruta renderizada en `edge`, en `sw` y en `ssg`
    produce **el mismo `<html lang>`**. Un test que compara los tres bytes a bytes.

**El editor**

12. Con una prop requerida sin resolver, `provideCodeActions` ofrece *«Completar las props
    requeridas del layout»* y **no** un diagnóstico propio: la voz es de TypeScript sobre la
    proyección.
13. Lo que la acción escribe es del tipo de cada prop —`""`, `0`, `false`, `@()` para lo que no
    tiene valor obvio—, y el fichero resultante **no tiene errores de tipos nuevos**.
14. Si la ruta no exporta `layout` en absoluto, la acción escribe la función entera con su `return`
    completo, dentro del `@server` que ya existe — y lo crea si no lo hay.

**La evidencia, en `examples/basic`**

15. `_layout.fud` declara `culture` como requerida, y su `<html lang="@culture">` sale con el valor
    que cada ruta resuelve.
16. Una ruta con `:param` —`/blog/:slug`— resuelve la culture a partir de lo que `load` trajo, y el
    HTML prerenderizado de dos slugs distintos sale con `lang` distinto si sus posts lo son.
17. Verificado en las tres formas en Chrome real: `pnpm dev`, build sin SW y build con SW. El
    `lang` del documento es el mismo en las tres.
18. **Cobertura.** `@fudic/transport` y `@fudic/language-server` no bajan del número que tienen al
    empezar; el código nuevo de `@fudic/language-server` nace al 100 %.

**Lo que costó la prop requerida, anotado porque se ve en el ejemplo.** `culture` sin default
obliga a las **diecisiete** rutas de `examples/basic` a escribir su `export function layout()`,
aunque dieciséis contesten lo mismo. Es lo que §6.15 pide y es lo que le da dientes al
contrato —sin ello ni `FUD0702` ni la bombilla tendrían evidencia—, pero la ceremonia es real y
la alternativa está escrita en la propia spec: un default (`culture = "es"`) la habría dejado en
una sola ruta. Queda como observación, no como cambio.

---

## 7. Fuera de alcance

- **Reactividad en el layout.** Con su condición de reapertura: hará falta el día que alguien
  quiera un layout con estado propio que sobreviva a la navegación, y entonces habrá que decidir
  antes si un layout es un ámbito reactivo o un componente disfrazado. Hoy la respuesta es que no
  lo es, y `FUD0701` lo dice.
- **Reactividad en el `<head>`.** El `<title>` que se mueve se escribe con `document.title` dentro
  de un `effect` del `@client` de la ruta (SDD-39), que además hace ansiosa a la ruta, así que se
  aplica solo.
- **Cabeceras en `RenderContext`.** No están, y no es un olvido: en `ssg` no hay petición, así que
  una página prerenderizada no puede negociar un `Accept-Language` que nadie envió. Lo que salga
  de una cabecera sale por `load` o por `layout`, y esa ruta no puede ser `ssg`.
- **Que un layout tenga su propio `load`.** Sería un segundo origen de datos por página con su
  propio momento y su propia caché. Si algún día hace falta, es una spec entera.
- **Slots de layout más allá de `@RenderSection`.** SDD-21 los tiene y no se tocan aquí.
