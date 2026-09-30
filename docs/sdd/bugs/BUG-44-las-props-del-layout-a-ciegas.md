# BUG-44 · Las props de un layout se escriben a ciegas: `ctx` sin tipo, ni Ctrl+Space en el layout ni en la ruta, y una prop que se colaba en el `<body>`

> **Enmendado por [SDD-48](../SDD-48-componentes-en-layout.md).** La regla del `<body>` de §3.4
> ya no rige: el body de un layout admite componentes, snippets, expresiones y constructos, y lee
> sus props (`FUD0704` retirado); `FUD0705` queda solo para `@{ }`. `FUD0706` no cambia.
>
> **Estado:** `Hecho` — implementado y probado a mano por Pedro en el editor, y con sus tests
> (ver [BUG-44-Task.md](./BUG-44-Task.md)). Redactado y cerrado el 2026-09-28.
> **Corrige:** [SDD-40](../SDD-40-props-de-layout.md) §3.1, §3.2, §3.5, §4.4, §4.7 y §6.12–§6.15 ·
> [SDD-28](../SDD-28-snippets.md) (catálogo de snippets de `@code` y de los `@Render*`) ·
> [SDD-23](../SDD-23-emisor-ts-virtual.md) §4.2 (`data` en un layout) ·
> [SDD-12](../SDD-12-semantica.md) (catálogo)
> **Paquetes:** `@fudic/language-core` · `@fudic/language-server` · `@fudic/compiler` ·
> `@fudic/vite` · `@fudic/cli` (snapshot) · `fudic-vscode` (empaquetado) · `examples/basic`
> **Rango:** `FUD0704`–`FUD0706` (del rango `FUD0700`–`FUD0719` de SDD-40)

---

## 1. Síntoma

Trabajando con las props de layout de SDD-40 en `examples/basic`:

1. **`ctx` no tenía tipo.** En `export function layout(ctx, data)`, `ctx` era `any`, y la bombilla
   de SDD-40 escribía `layout(ctx: unknown, data: unknown)`. De ahí salió el `ctx: unknown` de
   `blog/[slug].fud`. En los dos casos `ctx.` no ofrecía nada, y nadie podía saber qué contiene.
2. **Ctrl+Space no ofrecía las props del layout.** Ni dentro del propio layout, en
   `<html lang="@|">`, ni en la ruta, dentro del `return { }` de `layout()`.
3. **La bombilla existía, pero no había snippet** para escribir el resolver ni para declarar las
   props en el layout.
4. **Las props se usaban en el `<body>`.** `_layout-articulo.fud` pintaba `@seccion` como miga de
   pan. La regla, en palabras de Pedro, es que las props de un layout son **bindings del head**.
   Lo que cambia por ruta en el body ya tiene su mecanismo, `@section`, como `site-nav`.

Y, durante la prueba en el editor:

5. En `lang="@"` la lista ofrecía `@culture`, **`@data`** y **`@()`**. En un layout solo caben sus
   props.
6. `FUD0704` salía en el build pero **no en el editor**.
7. Dentro de `@server`, un `@` ofrecía **`@client`** (`FUD0193`), y nada de lo que sí va ahí.
8. En cuanto se escribía `ctx.`, el editor **perdía los tipos**: la línea a medias rompía el
   parseo de `@server`.

Y al escribir los tests:

9. El build **no avisaba** de una prop leída en un atributo del propio `<body>`
   (`<body data-x="@culture">`); el editor sí.
10. Un bucle del body que declaraba una variable con el nombre de una prop daba un `FUD0704`
    falso. Pedro zanjó el fondo: en el `<body>` de un layout solo caben `@RenderBody()` y
    `@RenderSection()`. Ni control de flujo, ni `@RenderHead()`, que va en el head.
11. El HTML del blog llevaba `<meta property="article:section" content="@seccion">`, **literal**:
    el head de un layout no interpolaba sus atributos. La prop llegaba, pero no se pintaba.

## 2. Causa raíz

- **§2.1.** La proyección de SDD-40 solo añadía a `layout(ctx, data)` el **tipo de retorno**. Los
  parámetros quedaban como el autor los escribió, sin tipo.
- **§2.2.** `templateContent` entra en el `<head>` y el `<body>` de una página o un layout, pero
  los atributos de `<html>`, `<head>` y `<body>` no se proyectaban. `@culture` en `<html lang>` no
  tenía programa detrás.
- **§2.3.** El tipo de retorno era `$LayoutProps | Promise<$LayoutProps>`. Como tipo contextual
  del `return { }`, TypeScript lista los miembros de todos los objetos de la unión: `then`,
  `catch` y `finally` junto a las props.
- **§2.4.** `interpolates()` y el comentario de los snippets de `@code` seguían diciendo que un
  layout no tiene `@code` (`FUD0437`, retirado por SDD-40). Por eso el layout no tenía ámbito
  propio, y lo que salía en `lang="@"` eran los locales de TypeScript más `@()`.
- **§2.5.** Nada comprobaba dónde se lee una prop de layout. Además, las reglas de layout viven en
  el emit, que el editor no ejecuta: el editor solo corre la fase semántica (`analyze`).
- **§2.6.** Los snippets de `@code` solo miraban si el cursor estaba dentro del bloque, no en qué
  zona.
- **§2.7.** El resolver se localizaba **solo por el AST**. Con la región sin parsear no había
  resolver, y sin resolver no había tipos.
- **§2.8.** El emit del layout registraba en su lote de Oxc los atributos de `<html>` y los hijos
  del `<body>`, pero no los atributos del `<body>`: la regla no tenía AST que leer ahí.
- **§2.9.** La regla leía las referencias libres de todos los fragmentos del body como si fueran
  uno, y un bucle abre y cierra su ámbito dentro de su propio fragmento. Pero el fondo era otro:
  nada decía qué puede escribir el `<body>` de un layout.
- **§2.10.** `writeHeadElements` escribe cada elemento del head **tal cual está en el fuente**,
  salvo el `<title>`. SDD-40 §4.4 arregló el `<html>` y el `<body>`, y el resto del head se quedó
  con el mismo atajo.

## 3. Qué cambia

### 3.1. La proyección tipa `layout(ctx, data)` — `language-core`

La proyección añade al servidor virtual los tipos que el autor no escribió. Lo que el autor ya
tipó se respeta:

```ts
export function layout(ctx: $LayoutContext<'slug'>, data: Awaited<ReturnType<typeof load>>): $LayoutProps { … }
```

| Parámetro | Tipo | De dónde sale |
|---|---|---|
| `ctx` | `$LayoutContext<P>` | `$LayoutContext` es global y estructural: `origin`, `url` y `params`, y nada más. `P` son los params de la ruta, leídos del nombre del fichero bajo `routes/` (`blog/[slug].fud` → `'slug'`; sin params, `never`) |
| `data` | `Awaited<ReturnType<typeof load>>` | Sin `load`: `Record<string, never>`, que es el `{}` que llega en ejecución |
| retorno | `$LayoutProps` si la función es normal, `Promise<$LayoutProps>` si es `async` | §2.3 |

- Solo se tipan los parámetros escritos «a pelo»: un nombre, `{…}` o `[…]`. Un valor por defecto
  o un rest se dejan como están.
- **Ni `inject` ni `publish`** (decisión de Pedro). Si las props necesitan un servicio, lo
  inyecta `load`, que es el límite de arriba, y llega al resolver en `data`. En ejecución el
  resolver recibe siempre el `ctx` desnudo, sin contenedor, en el borde y en el endpoint de datos
  por igual.
- **Ni `mode` ni `nonce`** (decisión de Pedro): son fontanería del framework, y las props de un
  layout no tienen uso para ninguno. El `ctx` sigue llevándolos en ejecución; el editor no los
  ofrece.
- **Mientras se escribe.** Si ninguna región `@server` da AST, el resolver se localiza en el
  **texto** de la región: la lista de parámetros hasta su `)`, y solo los nombres a pelo.
  `findLayoutResolverInText` y `exportsLoadInText`.

### 3.2. Ctrl+Space ofrece las props — `language-core` · `language-server`

- En el **layout**, los atributos de `<html>`, `<head>` y `<body>` se proyectan como los de
  cualquier otro elemento.
- **Qué ofrece un `@` en un layout:** solo sus props, las que declara su zona neutra. Solo fuera
  del `<body>`, y sin `@()` ni locales de TypeScript. `templateScope` responde así a un
  `layout-document`, e `interpolates` pasa a significar «interpola libremente», que en un layout
  es falso.
- El layout **deja de declarar `data`** en su proyección, así que leerlo ahí es un error de tipos.
- En la **ruta**, el `return { }` del resolver ofrece las props del layout: las requeridas y las
  opcionales, con su tipo. Viene del tipo de retorno de §3.1, sin nada propio.

### 3.3. La bombilla y los snippets — `language-server`

- La bombilla *«Completar las props requeridas del layout»* escribe `layout(ctx, data)` **sin
  tipos**, para que los ponga la proyección. Antes escribía `unknown`.
- Snippets nuevos:

| Snippet | Dónde | Escribe |
|---|---|---|
| `layout` | ruta, dentro de `@server` | `export function layout(ctx, data) { return { $0 }; }` y abre la lista de props |
| `paths` | ruta y página, dentro de `@server` | `export async function paths(): Promise<string[]> { return [$0]; }` |
| `@code` | layout, dentro de `<head>`, si no hay `@code` | el `@code` con `type Props` y `props<Props>()` |
| `props` | layout, zona neutra de `@code` | `type Props` y `props<Props>()` |

- **Cada snippet de `@code` declara su zona** (`FudSnippet.zone`). `@server`, `@client` y `props`
  van en la zona neutra; `load`, `paths` y `layout`, en `@server`. Dentro de `@server` un `@` ya no
  ofrece `@client`.
- Se ofrecen **solo donde empieza una declaración**, lo primero de su línea, incluido Ctrl+Space
  sin nada escrito. Detrás de `ctx.` o dentro de `return { }` no salen.

### 3.4. El `<body>` de un layout: `FUD0704` y `FUD0705` — `compiler` · `language-server`

La regla, en palabras de Pedro: **en el `<body>` de un layout solo se escriben `@RenderBody()` y
`@RenderSection()`**, además del marcado. Lo que cambia de una ruta a otra lo escribe la ruta, en
un `@section`.

- **`FUD0704`**, error: una prop de layout leída en el `<body>`, atributos del propio `<body>`
  incluidos. Salta sobre el nombre. Se detecta por **referencias libres**, no por texto: un
  nombre que declara una lambda es suyo, y un miembro que se llama igual no es la prop.
- **`FUD0705`**, error: cualquier otra construcción en el `<body>`. Control de flujo (`@if`,
  `@foreach`, `@for`, `@while`, `@switch`), un `@{ }`, un `@render` o un `@snippet`, sobre su
  `@palabra` y sin mirar dentro. Una expresión que no lee ninguna prop (`@(post.seccion)`), sobre
  la expresión entera. `@RenderHead()` y `@section` en el body no pasan por aquí: ya tienen su
  diagnóstico (`FUD0431`, `FUD0427`).
- En `<html>`, en `<head>` y en todo lo que hay dentro del head, las props se leen libremente.
- **Una sola regla con dos llamadores.** El núcleo es `layoutBodyDiagnostics`, que recorre el
  árbol del `<body>` y pide el AST de cada expresión. El analizador semántico `layout-body` lo
  sirve al editor con el lote del servidor de lenguaje, y el emit del layout con el suyo. El lote
  del emit registra ahora también los atributos del `<body>` (§2.8). Como la regla recorre el
  árbol y no los fragmentos del lote, la asimetría del `@if` que había (el build lo veía y el
  editor no) desaparece: el `@if` es `FUD0705` en los dos, por lo que es y no por lo que lee.
- **`FUD0706`**, error (decisión de Pedro): un `@` dentro de cualquier `<style>` del layout, en
  el head o en el body. El CSS de un layout es el del shell, igual para todas las rutas. Salta
  sobre cada `@`, y es la única voz sobre un `<style>` del body: §3.4 no mira dentro de él.
- **El editor lo acompaña:** `@RenderHead` solo se ofrece en el head, y `@RenderBody` y
  `@RenderSection` fuera de él. El control de flujo ya no se ofrecía en un layout.

### 3.5. El head interpola sus atributos — `compiler`

Un elemento del head cuyos atributos llevan `@` pasa por la misma maquinaria de atributos que el
`<html>` (SDD-40 §4.4): escapado igual, y omitido si el valor es nulo (decisión 21). Un elemento
sin `@` sigue saliendo tal cual. En los tres papeles, por decisión de Pedro: el head del layout
(`<meta content="@seccion">`), el que aporta una ruta y el de una página
(`<meta name="description" content="@data.summary">`). El escritor, `writeOpenTag`, es uno y lo
comparten el `<html>` del layout y todo elemento del head.

### 3.6. El ejemplo — `examples/basic`

- `blog/[slug].fud`: `layout(ctx, data)` sin `unknown`. La miga de pan pasa a su
  `@section nav`.
- `_layout-articulo.fud`: `seccion` deja el `<body>` y va al head, como
  `<meta property="article:section" content="@seccion">`, que ahora sí sale con su valor
  (§3.5). Sigue siendo la prop requerida que enseña la bombilla.
- Un e2e comprueba en las tres formas (preview, dev y build sin SW) que el blog lleva su `<meta>`
  con `Blog` y la miga fuera del `<main>`.

## 4. Fuera de alcance

- **`ctx.inject` en un `load` sin inyección en el grafo.** En ejecución, el `ctx` de `load` solo
  lleva `inject` si algún componente de la página usa inyección de dependencias
  (`hasDependencyInjection`). Ya pasaba antes de este bug, y ya no toca al resolver (§3.1).

Las cuatro decisiones pendientes al cerrar las tomó Pedro y están aplicadas: el resolver sin
`inject` y sin `mode`/`nonce` (§3.1), los atributos con `@` del head en los tres papeles (§3.5) y
ningún binding en un `<style>` de layout (`FUD0706`, §3.4).

## 5. Criterios de aceptación

1. En el servidor virtual de una ruta, `layout(ctx, data)` sin tipos sale con
   `ctx: $LayoutContext<'slug'>`, `data: Awaited<ReturnType<typeof load>>` y
   `: $LayoutProps`. Sin `load`, `data: Record<string, never>`. Con `async`, `Promise<$LayoutProps>`.
   Lo que el autor tipó no se toca.
2. Con `ctx.` a medio escribir, la región no parsea y los tres tipos siguen ahí.
3. `ctx.` ofrece `url`, `params` y `origin`, y nada más; `ctx.params.` ofrece `slug`. `data.`
   ofrece lo que devuelve `load`. En ejecución el resolver recibe el `ctx` sin contenedor.
4. En `return { | }` del resolver se ofrecen las props del layout, y no `then`/`catch`/`finally`.
5. En un layout, `<html lang="@|">` ofrece solo sus props: ni `@data` ni `@()`. En el `<body>`, ni
   eso.
6. Una prop de layout leída en el `<body>`, atributos del `<body>` incluidos, es `FUD0704` en el
   build (`vite`, `fudic check`) y en el editor. En `<html>` y en el head no lo es. Cualquier
   otra construcción en el `<body>` que no sea `@RenderBody()` ni `@RenderSection()` es
   `FUD0705`, en los dos. Un `@` en un `<style>` del layout es `FUD0706`, en los dos. El editor
   ofrece `@RenderHead` solo en el head y los dos huecos fuera.
6b. Un atributo con `@` en el head de un layout, de una ruta o de una página sale interpolado.
7. Dentro de `@server`, Ctrl+Space al principio de línea ofrece `load`, `paths` y `layout`, y no
   `@client`/`@server`/`props`. En la zona neutra es al revés. Detrás de `ctx.` no sale ninguno.
8. La bombilla escribe `layout(ctx, data)` sin `unknown`.
9. `examples/basic` compila, y el HTML del blog lleva su `<meta property="article:section"
   content="Blog">` —interpolado, no `@seccion`— y la miga dentro de la ruta.
10. Cobertura: lo nuevo al 100 % en las cuatro métricas. `@fudic/compiler` y `@fudic/vite` no
    bajan de su suelo.
