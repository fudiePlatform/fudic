# BUG-44 — Tareas

> **BUG:** [BUG-44 — Las props de un layout se escriben a ciegas](./BUG-44-las-props-del-layout-a-ciegas.md)
> **Paquetes:** `@fudic/language-core` · `@fudic/language-server` · `@fudic/compiler` ·
> `@fudic/vite` · `fudic-vscode` · `examples/basic`
> **Rama:** `worktree-BUG-44_layouts`, en el worktree `.claude/worktrees/BUG-44_layouts`, creada
> desde `main` (`83f4709`)
> **Forma de trabajo, por indicación de Pedro:** todo implementado primero y probado por él en el
> editor, sin tests ni documentación por el camino. Los tests los hace otra sesión a partir de la
> tarea 14.
> **Progreso:** 14 / 14

---

## Fase 1 — `ctx` y `data` con tipo

- [x] 1. `$LayoutContext<P>` en los globales. `routeParams(fudPath)` lee los params de la ruta
  bajo `routes/`. `LayoutResolver` gana `ctxAt`, `dataAt` y `async`. `emitServerVirtual`
  empalma los tres tipos (`bf1f153`, `fa41fca`).
- [x] 2. `$LayoutInject`, solo `inject`, tipado con `import('@fudic/di')`. El resolver vuelve a
  recibir el `ctx` con el contenedor en ejecución (`97897e3`, `6e43597`).
- [x] 3. Plan B textual cuando `@server` no parsea: `findLayoutResolverInText` y
  `exportsLoadInText` (`837767a`).

## Fase 2 — Ctrl+Space

- [x] 4. `<html>`, `<head>` y `<body>` de página y layout se proyectan con `emitElementBindings`
  (`fa41fca`).
- [x] 5. Retorno `$LayoutProps` o `Promise<$LayoutProps>` según `async`, sin unión (`fa41fca`).
- [x] 6. Un `@` en un layout ofrece solo sus props, fuera del `<body>` y sin `@()`:
  `templateScope`, las ramas de valor y de directiva de `ts-completion.ts` y `scopeItems` de
  `plugin.ts`. El layout deja de declarar `data` (`d08142c`).

## Fase 3 — Bombilla y snippets

- [x] 7. La bombilla escribe `layout(ctx, data)` sin `unknown`. Snippets `layout` (ruta), `@code` y
  `props` (layout) (`d95fb91`).
- [x] 8. `FudSnippet.zone`: zona de `@code` por snippet. Snippet `paths` nuevo. Ctrl+Space sin nada
  escrito en `@code`, solo al principio de línea (`457f4e3`, `837767a`).

## Fase 4 — `FUD0704` y el ejemplo

- [x] 9. `FUD0704` en el emit del layout (`9cbae45`).
- [x] 10. El analizador semántico `layout-prop-in-body` con el núcleo compartido
  `propReadsInBody`. El emit llama al mismo núcleo (`56b7965`).
- [x] 11. `examples/basic`: `seccion` al head como `article:section`, y la miga de pan a la
  `@section nav` de `blog/[slug].fud` (`9cbae45`, `8437ebe`).
- [x] 12. Build completo y `.vsix` reinstalado. Pedro lo prueba en el editor.

## Fase 5 — Tests y cierre

- [x] 13. **Documentación de cierre.**
  - [SDD-40](../SDD-40-props-de-layout.md): anotación cruzada en §3.2, §3.5, §4.7 y §6.12–§6.15.
    `ctx` y `data` con tipo, retorno sin unión, el `@()` de §6.13 es `null as unknown as T` y
    `FUD0704` en el catálogo. §6.15 sigue llamando «anidado» a `_layout-articulo.fud`, cosa que
    BUG-38 hizo imposible.
  - [SDD-12](../SDD-12-semantica.md): `FUD0704` en el catálogo consolidado.
  - Los comentarios de `examples/basic` que se quedaron viejos:
    - `_layout.fud:6-8` dice que la página cuyo idioma sale de sus datos le contesta. Esa página
      usa `_layout-articulo.fud`.
    - `blog/[slug].fud:29-31` dice que `culture` la declara «el layout de arriba».
    - `_layout-articulo.fud:14-15` sigue explicando la miga.
  - `INDEX.md` de bugs y el maestro: tabla y registro.
  - Sin tocar los ficheros de la plantilla del CLI, salvo que un test lo pida.

- [x] 14. **Los tests.** Cada criterio del BUG con su test, `pnpm typecheck`, `pnpm test` y
  `pnpm build` en verde, y la cobertura. Primero hay que arreglar los tests existentes que este
  BUG rompe a propósito, **ajustando la expectativa y nunca el código**:
  - `language-core/test/layout-resolver.test.ts`: `ANNOTATION` era
    `: $LayoutProps | Promise<$LayoutProps>`. Ahora es `: $LayoutProps`, y `Promise<…>` si
    es `async`. Además, `ctx` y `data` salen tipados.
  - `language-server/test/acceptance/layout-props-action.test.ts` y el test de acciones que
    compruebe el texto de la bombilla: ya no hay `ctx: unknown, data: unknown`.
  - `language-server/test/services/snippets*.test.ts`: `@client`/`@server`/`props`/`load` dependen
    ahora de la zona. Hay un `@code` de layout nuevo.
  - `language-server/test/services/ts-completion.test.ts`, `plugin.test.ts` y el test de
    `template-scope`: en un layout, `@` ya no responde vacío. Responde sus props fuera del body.
  - Cualquier test de `language-core` que espere `declare const data` en un layout, o que no
    espere los atributos de `<html>`/`<body>` en la proyección.

  **Tests nuevos, por paquete:**

  *`@fudic/language-core`* — nacen al 100 %
  - `routeParams`: `routes/blog/[slug].fud` → `['slug']`; varios params; ninguno; ruta sin
    `routes/`; `[...rest]` o `[1x]` no cuentan; separadores `\`.
  - `findLayoutResolver`: `ctxAt`/`dataAt` en función y en flecha; parámetro ya tipado sin tocar;
    `{ params }` y `[a]` tipables; valor por defecto y rest no; `async` verdadero y falso; un solo
    parámetro (sin `dataAt`); retorno ya tipado (sin `annotateAt`, con los parámetros sí).
  - `exportsLoad`: función, flecha, `const` que no es función, sin `load`.
  - `findLayoutResolverInText` y `exportsLoadInText`: el caso de `ctx.` a medio escribir
    (criterio 2). `async function`, `const = async (`, parámetros vacíos, parámetro tipado, retorno
    ya tipado, región sin `layout`. Los offsets tienen que caer justo tras cada nombre: compruébalo
    contra la salida, no contra números.
  - `emitServerVirtual`: el texto exacto del criterio 1 con params, sin params (`never`), con `load`
    y sin `load`. `$LayoutInject` solo si hay `ctxAt`. El import de `$LayoutProps` solo si hay
    `annotateAt`.
  - `emitClientVirtual`: `<html lang="@culture">` y `<body data-x="@y">` de un layout se proyectan
    y mapean al `.fud`. En página también. Un layout no declara `data`.
  - Tipos de verdad (criterio 3): un test con el servicio de TypeScript sobre la proyección, que
    compruebe que `ctx.` lista `url`, `params`, `origin`, `mode`, `nonce` e `inject`, que
    `ctx.params.` lista `slug`, que `data.` lista las claves de `load` y que el `return { }` lista
    las props y no `then`.

  *`@fudic/language-server`* — nacen al 100 %
  - `templateScope` en un layout: props en el head y en `<html>`; nada en el `<body>` ni en sus
    atributos; nunca `data`.
  - Completado por LSP en un layout (criterio 5): `lang="@|"` → solo props, sin `@()` ni
    `@data`. `<title>@|` en el head → props. `@|` en el body → solo los `@Render*`.
  - Completado en la ruta (criterio 4): dentro de `return { | }` del resolver, las props del layout.
  - Snippets (criterio 7): `zone` para cada snippet de `@code`; `paths`; `@code` y `props` de
    layout. Ctrl+Space vacío al principio de línea en `@server` → `load`/`paths`/`layout`. Detrás
    de `ctx.`, en `return { | }` y a mitad de línea → ninguno. La palabra `lay` a principio de
    línea → `layout`.
  - La bombilla (criterio 8): el texto con `layout(ctx, data)`, en sus cuatro formas
    (`object` / `server` / `region` / documento entero).
  - `FUD0704` por `fudicDiagnostics` (criterio 6): interpolación y atributo en el body → sí. En
    `<html>` y en el head → no. `@(post.seccion)` → no.

  *`@fudic/compiler`* — `layout-prop-in-body.ts` nace al 100 %; el paquete no baja de su suelo
  - `propReadsInBody`: interpolación, atributo, atributo del propio `<body>`, cabecera de
    `@foreach`, miembro (`post.seccion`, no), nombre sombreado por una lambda (no), conjunto
    vacío.
  - El analizador `layout-prop-in-body`: destructuración con defaults, `...rest`, patrón de
    array, un `const` suelto (cuenta como declarado), un documento que no es layout.
  - `emit/layout.test.ts`: `FUD0704` en el emit con el mismo span que el analizador. El `<head>` y
    `<html>` no diagnostican. El layout se sigue emitiendo.

  *`@fudic/vite`*
  - `wrapper.test.ts`: con inyección de dependencias, el resolver recibe `withDi(ctx, $root)` como
    `load`. El comportamiento vuelve a ser el de `main`: confirma que ningún test cambió.

  *Extremo a extremo*
  - `pnpm build` de `examples/basic` (criterio 9): el HTML de `/blog/<slug>` lleva
    `<meta property="article:section" content="Blog">` y la miga dentro de la ruta. Si hay e2e de
    Playwright que miren la miga, que la busquen donde está ahora.

  **Cobertura:** mide el suelo de `compiler`, `transport` y `vite` en `main` antes de empezar
  (`pnpm --filter <pkg> coverage`), y compara contra ese suelo. `language-core` y
  `language-server` al 100/100/100/100.

  **Cómo se cerró** (`64c6dcc`, `e48701a`, `5784134`). Suelo en `main`: `compiler`
  99,37 / 98,53 / 99,55 / 99,77 y `vite` 96,88 / 92,52 / 97,5 / 96,85 (statements / branches /
  functions / lines). Al cerrar: `compiler` 99,39 / 98,54 / 99,63 / 99,78, `vite` igual,
  `transport` sin tocar; `language-core` y `language-server` al 100 en las cuatro.

  Los tests sacaron tres fallos de verdad, y Pedro decidió arreglarlos aquí y no en otro bug
  (BUG §1.9–§1.11, §3.4–§3.5):
  - El build no veía los atributos del `<body>`: el lote del emit no los registraba.
  - Un bucle del body que sombreaba una prop daba un `FUD0704` falso. El fondo lo zanjó Pedro:
    el `<body>` de un layout solo escribe marcado, `@RenderBody()` y `@RenderSection()`. Nace
    `FUD0705`, el analizador pasa a llamarse `layout-body` y su núcleo, `layoutBodyDiagnostics`,
    recorre el árbol del body y no los fragmentos. La asimetría del `@if` desaparece. El editor
    ofrece `@RenderHead` solo en el head y los dos huecos fuera.
  - El head del layout pintaba `@seccion` literal: ahora sus atributos interpolan como el
    `<html>`.

  Tests que cambiaron de expectativa porque leían una prop en el `<body>` de un layout, y ahora
  la leen en el head: `compiler/test/emit/layout-props.test.ts` (§6.4–§6.5),
  `vite/test/build-layout-props.test.ts`, el fixture `_layout.fud` de `language-core` y el layout
  de `layout-props-action.test.ts`. El snapshot de `cli` recoge el `$LayoutContext` global. La
  cabecera de `@foreach` ya no es `FUD0704`: el `@foreach` entero es `FUD0705`.

  **Las cuatro decisiones del cierre**, de Pedro, aplicadas después:
  - El resolver no inyecta: `$LayoutInject` desaparece de la proyección y el envoltorio le pasa
    el `ctx` desnudo también con inyección (`vite/test/wrapper.test.ts` cambia de expectativa).
  - `$LayoutContext` pierde `mode` y `nonce` (snapshot de `cli` actualizado).
  - Los atributos con `@` del head interpolan en los tres papeles: `writeOpenTag` pasa a
    `parts.ts` y lo usan el `<html>` del layout y todo elemento del head. La rama de
    `headElementExpr` que dejaba en paz un atributo interpolado ya no se alcanza y se quita.
  - `FUD0706`: un `@` en un `<style>` de layout, con su núcleo `layoutStyleDiagnostics`.

  Cobertura final: `compiler` 99,39 / 98,54 / 99,63 / 99,78 (por encima del suelo). `vite`
  96,88 / **92,51** / 97,5 / 96,85: una centésima por debajo en ramas, y no por código nuevo sin
  probar: la rama `hasDi ?` que elegía el `ctx` del resolver, que estaba cubierta, desaparece
  con la decisión, y el cociente baja. `wrapper.ts` sigue al 100 %.
