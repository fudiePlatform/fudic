# BUG-44 · Las props de un layout se escriben a ciegas: `ctx` sin tipo, ni Ctrl+Space en el layout ni en la ruta, y una prop que se colaba en el `<body>`

> **Estado:** `En curso` — implementado y probado a mano por Pedro en el editor; faltan los tests
> y el cierre (ver [BUG-44-Task.md](./BUG-44-Task.md), fase 5). Redactado el 2026-09-28.
> **Corrige:** [SDD-40](../SDD-40-props-de-layout.md) §3.2, §3.5, §4.7 y §6.12–§6.15 ·
> [SDD-28](../SDD-28-snippets.md) (catálogo de snippets de `@code`) ·
> [SDD-23](../SDD-23-emisor-ts-virtual.md) §4.2 (`data` en un layout)
> **Paquetes:** `@fudic/language-core` · `@fudic/language-server` · `@fudic/compiler` ·
> `@fudic/vite` (solo comentario) · `fudic-vscode` (empaquetado) · `examples/basic`
> **Rango:** `FUD0704` (del rango `FUD0700`–`FUD0719` de SDD-40)

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

## 3. Qué cambia

### 3.1. La proyección tipa `layout(ctx, data)` — `language-core`

La proyección añade al servidor virtual los tipos que el autor no escribió. Lo que el autor ya
tipó se respeta:

```ts
export function layout(ctx: $LayoutContext<'slug'> & $LayoutInject, data: Awaited<ReturnType<typeof load>>): $LayoutProps { … }
```

| Parámetro | Tipo | De dónde sale |
|---|---|---|
| `ctx` | `$LayoutContext<P> & $LayoutInject` | `$LayoutContext` es global y estructural: `origin`, `url`, `params`, `mode`, `nonce`. `P` son los params de la ruta, leídos del nombre del fichero bajo `routes/` (`blog/[slug].fud` → `'slug'`; sin params, `never`). `$LayoutInject` solo tiene `inject`, tipado con `import('@fudic/di')` |
| `data` | `Awaited<ReturnType<typeof load>>` | Sin `load`: `Record<string, never>`, que es el `{}` que llega en ejecución |
| retorno | `$LayoutProps` si la función es normal, `Promise<$LayoutProps>` si es `async` | §2.3 |

- Solo se tipan los parámetros escritos «a pelo»: un nombre, `{…}` o `[…]`. Un valor por defecto
  o un rest se dejan como están.
- **`inject` sí, `publish` no.** La culture puede salir de un servicio, así que el resolver puede
  pedirlo. Pero publicar no tiene sentido: lo que resuelve son bindings del head y nunca viajan al
  navegador como estado. En ejecución, el `ctx` del resolver es el mismo que recibe `load`: con
  el contenedor encima cuando la página usa inyección de dependencias.
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

### 3.4. `FUD0704` — una prop de layout leída en el `<body>` — `compiler`

- Error. Salta sobre el nombre, en cualquier lectura dentro del `<body>`, incluidos sus propios
  atributos. En `<html>`, en `<head>` y en todo lo que hay dentro del head está permitida.
- Se detecta por **referencias libres**, no por texto: `@(post.seccion)` lee `post`.
- Una sola regla con dos llamadores. El analizador semántico `layout-prop-in-body` la sirve al
  editor. El emit del layout llama al mismo núcleo, `propReadsInBody`, porque el build lee de ahí
  los diagnósticos de un layout.
- **Asimetría conocida:** el servidor de lenguaje registra en su lote las interpolaciones, los
  valores de atributo y las cabeceras de `@foreach`/`@for`, pero no las condiciones de `@if` ni el
  `@{ }`. Un `@if (seccion)` en el body lo diagnostica el build y no el editor.

### 3.5. El ejemplo — `examples/basic`

- `blog/[slug].fud`: `layout(ctx, data)` sin `unknown`. La miga de pan pasa a su
  `@section nav`.
- `_layout-articulo.fud`: `seccion` deja el `<body>` y va al head, como
  `<meta property="article:section" content="@seccion">`. Sigue siendo la prop requerida que
  enseña la bombilla.

## 4. Fuera de alcance

- **`ctx.inject` sin inyección en el grafo.** En ejecución, el `ctx` solo lleva `inject` si algún
  componente de la página usa inyección de dependencias (`hasDependencyInjection`). Una ruta cuyo
  único uso sea `ctx.inject` en `layout()` o en `load()` recibiría un `ctx` sin él. Ya pasaba con
  `load`. Queda propuesto que cuente como uso de inyección, pendiente de que Pedro lo decida.
- **`nonce` y `mode` en `$LayoutContext`.** Son fontanería del framework. Se quedan hasta que
  Pedro decida.
- **`@if` / `@{ }` en el editor para `FUD0704`:** §3.4.

## 5. Criterios de aceptación

1. En el servidor virtual de una ruta, `layout(ctx, data)` sin tipos sale con
   `ctx: $LayoutContext<'slug'> & $LayoutInject`, `data: Awaited<ReturnType<typeof load>>` y
   `: $LayoutProps`. Sin `load`, `data: Record<string, never>`. Con `async`, `Promise<$LayoutProps>`.
   Lo que el autor tipó no se toca.
2. Con `ctx.` a medio escribir, la región no parsea y los tres tipos siguen ahí.
3. `ctx.` ofrece `url`, `params`, `origin`, `mode`, `nonce` e `inject`, y `ctx.params.` ofrece
   `slug`. `data.` ofrece lo que devuelve `load`.
4. En `return { | }` del resolver se ofrecen las props del layout, y no `then`/`catch`/`finally`.
5. En un layout, `<html lang="@|">` ofrece solo sus props: ni `@data` ni `@()`. En el `<body>`, ni
   eso.
6. Una prop de layout leída en el `<body>` es `FUD0704` en el build (`vite`, `fudic check`) y en el
   editor. En `<html>` y en el head no lo es.
7. Dentro de `@server`, Ctrl+Space al principio de línea ofrece `load`, `paths` y `layout`, y no
   `@client`/`@server`/`props`. En la zona neutra es al revés. Detrás de `ctx.` no sale ninguno.
8. La bombilla escribe `layout(ctx, data)` sin `unknown`.
9. `examples/basic` compila, y el HTML del blog lleva su `<meta property="article:section">` y
   la miga dentro de la ruta.
10. Cobertura: lo nuevo al 100 % en las cuatro métricas. `@fudic/compiler` y `@fudic/vite` no
    bajan de su suelo.
