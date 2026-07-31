# SDD-26 — Tareas

> **SDD:** [SDD-26 — Formateador](./SDD-26-formateador.md)
> **Paquete:** `@fudic/formatter` · **Rama:** `feat/sdd-26-formateador` (desde
> `feat/sdd-25-extension-vscode`, en el worktree `sdd-25-extension-vscode`: la fase 7
> vuelve sobre SDD-24 y SDD-25)
> **Progreso:** 35 / 35 · SDD `Hecho`

Cada tarea es un paso cerrado: se implementa, se verifica y se marca. Ninguna depende de
tareas posteriores. Los ficheros son relativos a `packages/formatter/` salvo cuando se diga
otra cosa.

---

## Notas de revisión (leer antes de empezar)

Seis puntos salieron de contrastar el SDD con el código ya escrito y con el estado real de
las dependencias. Las notas 1 y 3 piden decisión de Pedro; las demás son elecciones que las
tareas ya asumen.

1. **La API pública tiene que ser asíncrona.** §3 declara `format(source, opts): FormatResult`
   síncrono, pero ningún formateador de JS/CSS moderno lo es: `oxfmt.format()` devuelve
   `Promise<FormatResult>` y Prettier 3 eliminó su API síncrona. **Recomendación:**
   `Promise<FormatResult>` en `format` y `formatRange`. No contamina el diseño: el printer
   sigue siendo **síncrono y puro**, porque las hojas se formatean **antes**, en una única
   pasada concurrente, y el printer solo consulta una tabla ya resuelta (tarea 13). Los dos
   consumidores son asíncronos de todos modos — un handler LSP y una CLI.

2. **`oxfmt` está maduro y cubre las *dos* hojas.** Comprobado contra `oxfmt@0.61.0`
   (publicado el 2026-07-27), no supuesto: es NAPI **en proceso** (no un binario que haya
   que lanzar por pulsación), su API es `format(fileName, source, config)` — el nombre de
   fichero elige el lenguaje —, formatea **TS y CSS** con la misma llamada, devuelve
   `{ code, errors }` y ante entrada rota **devuelve el original** con un error, que es
   exactamente la degradación que pide §4.2. Consecuencia: **una sola dependencia** para las
   dos hojas, sin `peerDependency` de Prettier, y coherencia total con el toolchain (Oxc ya
   está dentro). Dos derivadas: `endOfLine: 'auto'` no existe en oxfmt (solo `lf|crlf|cr`),
   así que se resuelve en nuestra frontera (tarea 5); y es un binario nativo por plataforma
   igual que `oxc-parser`, así que el `.vsix` de SDD-25 tendrá que vendorizar también
   `@oxfmt/binding-*` (tarea 35).

3. **El criterio 3 no se puede cumplir «byte a byte» tal y como está escrito.** El emisor
   copia los nodos de texto **verbatim** — `emit/markup.ts` produce literalmente
   `$dom.text("\n    ")` —, así que *cualquier* reindentación cambia el HTML byte a byte y
   ningún formateador del mundo pasaría el criterio. La reformulación que sí es comprobable,
   y que además es más fuerte de lo que parece: comparar los dos HTML **tras colapsar cada
   run de espacio del contenido de texto a un solo espacio**. Un run reescrito casa; un run
   **creado** o **destruido** no casa, porque el vacío no colapsa a un espacio. Eso convierte
   el criterio en un invariante del printer:

   > *nunca crea ni destruye un run de espacio en contenido HTML; solo reescribe su contenido.*

   Ese invariante absorbe §4.5 entera: `@data.tag</app-badge>` no puede romperse porque
   romperlo **crea** un run donde no había. Y hace que la tabla de `display` deje de ser una
   cuestión de corrección para ser una cuestión estética — dónde queda bien romper un run que
   **ya existía** —, con lo que el test **no consulta la tabla del printer** y por tanto no es
   circular, que es el defecto que arruina la mayoría de las suites de formateadores. Dos
   exclusiones explícitas de la comparación: el cuerpo del `<style>` (formatear CSS sí crea y
   destruye espacio; su seguridad la mide el criterio 8) y el JS de `@code` (el criterio
   compara **HTML renderizado**, no el módulo emitido: se **ejecuta** el módulo, como ya hace
   `packages/compiler/test/emit/module.test.ts`, en vez de compararlo).

4. **Rango de diagnósticos `FUD0480`–`FUD0499`.** El SDD no reserva ninguno, pero §4.3 pide
   emitir una nota cuando un placeholder de CSS se pierde. SDD-24 llega a `FUD0479`, así que
   el siguiente libre es `FUD0480`. Se anota en SDD-12 al cerrar.

5. **Qué diagnósticos bloquean el formateo y cuáles no.** §4.6 dice «si el parser produce
   diagnósticos». Se lee estrictamente: **solo los de parseo** — `parseDocument` +
   `structureDocument` — devuelven `ok: false`. Los semánticos de `analyze()` (SDD-12) y los
   de tipos **no** bloquean: un `TS2304` no impide disponer el código, y un formateador que se
   apaga ante un error de tipos se apaga casi siempre.

6. **El wrapper de expresión de §4.2 es `(<expr>);`, no `($<expr>);`.** El `$` de la tabla es
   metasintaxis; escrito literalmente prefijaría un `$` a la expresión del usuario. Los
   paréntesis **sí** hacen falta —sin ellos `@({ a: 1 })` se parsea como bloque— y oxfmt los
   retira solo cuando sobran (`(x);` → `x;`, `({ a: 1 });` → `({ a: 1 });`), que es justo el
   comportamiento que la desenvoltura quiere. Comprobado.

---

## Fase 0 — Andamiaje del paquete (3)

- [x] **1. Manifiesto del paquete.**
      Crear `package.json`: `@fudic/formatter`, dependencias de **runtime** `@fudic/compiler`
      y `oxfmt` (`0.61.0`, exacta); devDeps `@fudic/tsconfig`, `@fudic/ssr` (el criterio 3
      renderiza) y `@types/node`. Sin `prettier`: ver nota 2.
- [x] **2. Configuración de TS y tests.**
      Crear `tsconfig.json`, `tsconfig.build.json`, `README.md` y `vitest.config.ts` con
      `thresholds` al **100 %** en las cuatro métricas y `coverage.include: ['src/**/*.ts']`,
      con los alias de fuente a los paquetes hermanos (el patrón de `language-server`).
- [x] **3. Instalar y comprobar que el paquete vacío pasa.**
      `pnpm install` en la raíz (debe resolver el binding nativo de `@oxfmt/binding-*`);
      `pnpm --filter @fudic/formatter typecheck` en verde. `src/index.ts` nace con `VERSION` y
      `test/package.test.ts` lo cubre: un paquete que arranca al 100 % necesita algo que medir
      desde el primer commit.

## Fase 1 — Contratos, opciones y diagnósticos (4)

- [x] **4. Tipos públicos.**
      Crear `src/types.ts`: `FormatOptions` (las seis de §3 y ninguna más), `FormatResult`
      como unión discriminada, y `ResolvedOptions` con los defaults ya aplicados — con
      `exactOptionalPropertyTypes`, «`Partial` entra, resuelto circula» es la única forma de
      que ningún módulo interno tenga que preguntarse si un campo llegó.
- [x] **5. Resolución de opciones y fin de línea.**
      Crear `src/options.ts` y `src/eol.ts`: `resolveOptions(partial)`, y `endOfLine: 'auto'`
      decidido por el **primer** salto del origen (`\r\n` ⇒ crlf, si no lf). Todo el printer
      trabaja en `\n` y la conversión es **la última operación** sobre el texto de salida: un
      printer que arrastra dos terminadores pierde el determinismo de §5 en la primera
      concatenación. A oxfmt se le pasa siempre `lf` (nota 2).
- [x] **6. Catálogo de diagnósticos.**
      Crear `src/diagnostics.ts`: rango `FUD0480`–`FUD0499`. `FUD0480` = `<style>` dejado sin
      formatear porque un placeholder se perdió o se duplicó (§4.3); `FUD0481` = fragmento JS
      que no parsea, dejado tal cual (§4.2), severidad `info` — es una nota, no un error, y no
      cambia el `ok: true`. El resto, reservado.
- [x] **7. API pública del paquete.**
      Crear `src/index.ts` reexportando `format`, `formatRange`, los tipos y el catálogo, con
      su test. La firma es la de la nota 1: `Promise<FormatResult>`.

## Fase 2 — El IR de documento y su printer (3)

- [x] **8. Constructores del `Doc`.**
      Crear `src/doc/builders.ts`: `text`, `concat`, `group`, `indent`, `align`, `line`,
      `softline`, `hardline`, `literalline`, `fill` y `breakParent`. Estructuras inmutables y
      **sin una sola noción de HTML**: este módulo no sabe qué es un atributo, y esa ignorancia
      es lo que hace que el printer se pueda probar entero sin parsear nada.
- [x] **9. El algoritmo de impresión.**
      Crear `src/doc/printer.ts`: `printDoc(doc, options): string` — la máquina de dos modos
      (`flat` / `break`) con `fits` sobre el ancho restante, propagación de `breakParent` a los
      grupos que lo contienen, y `fill` para secuencias que se rellenan hasta el margen.
      Síncrono y puro. `literalline` es lo que hace posible §4.4: reinicia la indentación a
      cero, que es la única forma de meter una región opaca dentro de un `indent` sin tocarla.
- [x] **10. Tests del printer.**
      Crear `test/doc/builders.test.ts` y `test/doc/printer.test.ts`: un grupo que cabe se
      imprime plano y roto si no cabe, `indent` anidado, `fill` con el corte en el elemento
      exacto, `breakParent` que rompe al abuelo, y `literalline` que ignora el nivel. Con
      `printWidth` pequeño, que es donde se ven las decisiones.

## Fase 3 — Las hojas delegadas (4)

- [x] **11. Centinelas de JS/TS.**
      Crear `src/leaf/js.ts`: para cada clase de fragmento de §4.2, envolver → `oxfmt.format`
      → desenvolver, con la tabla de la nota 6. La desenvoltura recorta el `;` y el salto final
      que oxfmt añade siempre, y de una cabecera extrae lo que hay entre el `(` y el `) {}`.
      Si `errors.length > 0`, se devuelve el fragmento **tal cual** y una nota `FUD0481`:
      un fragmento roto no impide formatear el resto del fichero.
- [x] **12. CSS con placeholders.**
      Crear `src/leaf/css.ts`: cada región Razor del `StyleNode` → un placeholder **único**;
      formatear como `.css`; reponer buscando el placeholder en la salida. Los placeholders son
      **en minúsculas** (`__fud_p0__`) — comprobado: en posición de nombre de propiedad, CSS
      normaliza a minúsculas y un placeholder con mayúsculas vuelve mutado y ya no se
      encuentra. Es el criterio de §4.3 (unicidad, no longitud: aquí el texto **sí** se mueve)
      con una condición más que la spec no podía anticipar. Si tras formatear falta alguno o
      aparece duplicado, el `<style>` se deja intacto y se emite `FUD0480`.
- [x] **13. Recolección y formateo concurrente de hojas.**
      Crear `src/leaf/collect.ts`: un recorrido del AST que reúne **todos** los fragmentos
      delegables del fichero (interpolaciones, valores de binding, cabeceras de control,
      discriminantes, `@code`/`@server`/`@client`/`@{ }`, cuerpos de `<style>`) y los formatea
      en **una sola pasada** con `Promise.all`, devolviendo una tabla `span → texto formateado`.
      Es la pieza de la nota 1: a partir de aquí el printer es síncrono, y además el coste de
      las hojas deja de ser secuencial.
- [x] **14. Tests de las hojas.**
      Crear `test/leaf/js.test.ts` y `test/leaf/css.test.ts`: cada envoltorio con su
      desenvoltura, el fragmento roto que sale igual que entró, el `@media (min-width: @bp.tablet)`
      repuesto exacto, un placeholder en las cinco posiciones léxicas (valor, parámetro de
      at-rule, nombre de propiedad, selector, comentario) y la degradación `FUD0480`.

## Fase 4 — Espacio en blanco (3)

- [x] **15. Tabla de `display`.**
      Crear `src/space/display.ts`: cada tag nativo clasificado en `inline`, `block` o
      `inline-block`; **todo lo demás — custom elements incluidos — es `inline`**, el supuesto
      conservador de §4.5. Es una tabla, no una heurística, y vive aquí sola porque es lo único
      del paquete que caduca con el estándar.
- [x] **16. El invariante de los runs.**
      Crear `src/space/runs.ts`: leer el espacio entre dos piezas de contenido como un
      `Run { present: boolean; blankLines: number }` y reimprimirlo. Es la traducción mecánica
      de la nota 3: un run presente se reescribe (espacio, `line` o `hardline`, según la tabla),
      uno ausente **no puede aparecer**, y ninguno puede desaparecer. Las líneas en blanco se
      colapsan a un máximo de una y se eliminan al principio y al final de cada bloque — que es
      reescribir el run, no destruirlo.
- [x] **17. Tests del espacio.**
      Crear `test/space/*.test.ts`: la tabla sobre tags nativos y custom, y la propiedad
      central en forma de test — para toda pareja de piezas contiguas, `present` antes ⇔
      `present` después.

## Fase 5 — El printer de markup (7)

- [x] **18. Contexto de impresión y contenido.**
      Crear `src/print/context.ts` y `src/print/content.ts`: el contexto (origen, tabla de
      hojas, opciones, `display` del contenedor) y el bucle que imprime una lista de
      `HtmlContent` intercalando los runs de la tarea 16. Aquí vive la regla del **token inline
      pegajoso**: un `at_construct` dentro de un contenedor inline no admite ruptura interna
      aunque se pase de `printWidth`.
- [x] **19. Elementos y atributos.**
      Crear `src/print/element.ts`: etiqueta de apertura como un `group` — con más de un
      atributo y sin caber, **uno por línea** y el `>` pegado al último (o solo en su línea si
      el elemento no tiene hijos); los bindings no se parten nunca por dentro; `void`,
      `self-closing` y cierre según `ElementKind`; comillas según `quote`, respetando que el
      valor ya las contenga.
- [x] **20. Regiones opacas.**
      Crear `src/print/opaque.ts`: `<script>` (`RawTextNode`), `<pre>` y `<textarea>` copiados
      **byte a byte** desde el origen con `literalline`, incluida su indentación original, sin
      reindentar aunque el contenedor cambie de nivel.
- [x] **21. Control de flujo y rescate de trivia.**
      Crear `src/print/control.ts`: `@if` / `else if` / `else` con el `{` en la misma línea y
      el `} else {` canónico, `@foreach`, `@for`, `@while` y `@switch` con sus `case`. Y el
      **rescate de trivia por span** que §2 exige: cortar el hueco entre el `}` de una rama y su
      `else`, y los huecos de dentro de un `@switch` (entre el `{` y la primera etiqueta, y
      entre etiquetas), y reimprimir lo que contenga un `@* … *@`. Cortar por span no es un
      detalle de implementación: es la única razón por la que esos comentarios no se pierden.
- [x] **22. `@code`, código inline y directivas de layout.**
      Crear `src/print/code.ts`: `@code { }` con sus regiones `@server` / `@client`
      —cada una delegada por separado y reindentada dentro del `Doc`—, `@{ … }`, y las
      directivas de SDD-21 (`@section n { }`, `@RenderBody()`, `@RenderHead()`,
      `@RenderSection(n)`).
- [x] **23. `<style>` y comentarios Razor sueltos.**
      Crear `src/print/style.ts`: el cuerpo del `<style>` desde la tabla de hojas, reindentado
      al nivel del elemento; y la impresión de `RazorCommentNode`, `AtEscapeNode` y
      `RawExpressionNode` como contenido, que son los nodos que quedan sin dueño.
- [x] **24. La puerta: `format` y `formatRange`.**
      Crear `src/format.ts`: parsear (`parseDocument` + `structureDocument`, el mismo cableado
      que usa el emisor); si hay diagnósticos de parseo, `{ ok: false, diagnostics }` y se acaba
      (nota 5); si no, hojas → `Doc` → `printDoc` → fin de línea. `formatRange` acota al **nodo
      completo más pequeño que contenga el rango** y devuelve el fichero con solo ese tramo
      sustituido. **No lanza nunca**: el envoltorio que convierte cualquier excepción en
      `ok: false` es de este módulo, y es el invariante de §5 hecho mecánico.

## Fase 6 — Criterios de aceptación del SDD (7)

- [x] **25. Corpus y arnés.**
      Crear `fixtures/**` y `test/acceptance/_harness.ts`: los tres canónicos + la página
      (`app-badge`, `app-button`, `app-card`, `home`), los cuatro del LSP (`blog/[slug]`,
      `layouts/_layout`, `components/site-nav`, `components/app-badge`), las páginas reales de
      Fudie (copia de `examples/basic`) y un juego de ficheros **deliberadamente rotos**. Copia
      propia, como hicieron `language-server` y `vscode`: un paquete no lee las fixtures de otro.
      El arnés expone `forEachFixture` y el comparador de la tarea 28.
- [x] **26. Criterios 1, 4 y 5 — idempotencia, estabilidad y ficheros rotos.**
      Crear `test/acceptance/stability.test.ts`: `fmt(fmt(x)) === fmt(x)` byte a byte en todo el
      corpus; sobre un fichero ya formateado, salida idéntica; y sobre cada fichero roto,
      `ok: false`, cero excepciones y ningún efecto sobre el disco.
- [x] **27. Criterio 2 — round-trip de AST.**
      Crear `test/acceptance/roundtrip.test.ts` y el comparador `test/acceptance/_ast-eq.ts`:
      `parse(fmt(x))` ≡ `parse(x)` **módulo posiciones** — se comparan tipos, estructura y los
      textos que el nodo posee, nunca los spans. El formateador no cambia el programa.
- [x] **28. Criterio 3 — equivalencia de emit. El test duro.**
      Crear `test/acceptance/emit-equivalence.test.ts`: emitir los módulos de `x` y de `fmt(x)`,
      importarlos y renderizar con `@fudic/ssr` inyectando los mismos datos; comparar los dos
      HTML tras **colapsar cada run de espacio a un solo espacio**, con el cuerpo del `<style>`
      fuera de la comparación (nota 3). Es el único sitio donde cae un bug de espacio sensible:
      ni el round-trip ni la idempotencia lo ven, porque el AST puede ser el mismo y el render
      distinto.
- [x] **29. Criterios 6 y 7 — regiones opacas y comentarios Razor.**
      Crear `test/acceptance/opaque.test.ts`: `<script>`, `<pre>` y `<textarea>` byte a byte
      iguales incluso cambiando el nivel del contenedor; y ningún `@* … *@` desaparece,
      **incluidos** los dos huecos de trivia — entre `}` y `else`, y dentro de un `@switch`.
- [x] **30. Criterios 8, 9 y 10 — CSS, adyacencia y atributos.**
      Crear `test/acceptance/layout.test.ts`: el `<style>` con `@media (min-width: @bp.tablet)`
      formateado y sus regiones repuestas exactas; el `<app-badge tone="…">@data.tag</app-badge>`
      real sin saltos internos aunque la línea exceda `printWidth`; y el `<span>` de
      `app-badge.fud`, con sus tres atributos ya uno por línea, estable y sin colapsar a una
      línea de 120 columnas.
- [x] **31. Criterio 12 — formateo de rango.**
      Crear `test/acceptance/range.test.ts`: seleccionar media cabecera de `@if` formatea el
      `@if` entero; un rango dentro de un `<style>` formatea el `<style>`; un rango vacío no
      cambia nada.

## Fase 7 — Los dos consumidores (4)

- [x] **32. `fudic fmt` (toca `@fudic/cli`, SDD-22).**
      Modificar `packages/cli/{package.json, src/args.ts, src/run.ts, src/index.ts}` y crear
      `src/plans/fmt.ts`: `fudic fmt [ruta…]` y `fudic fmt --check`, con `walkFud` para la
      recursión y el mismo `plan → apply` que el resto de comandos, de modo que `--dry-run` y
      `--json` sigan significando lo mismo. `--check` sale con código distinto de cero si algún
      fichero cambiaría; un fichero que no parsea se reporta y **no** se escribe. Mantener el
      paquete en su cobertura.
- [x] **33. El handler del servidor (toca `@fudic/language-server`, SDD-24).**
      Modificar `packages/language-server/src/services/plugin.ts` y su `package.json`:
      `provideDocumentFormattingEdits` y `provideDocumentRangeFormattingEdits` llamando a
      `@fudic/formatter` — un solo `TextEdit` sobre el documento entero, que es lo que hace que
      no haya dos caminos de código. Y el formateo al teclear de §4.7 (reindentar la línea
      actual tras `}` o `>`), que exige **declarar `documentOnTypeFormattingProvider`** en
      `src/capabilities.ts`: hoy solo están los dos de documento y rango. Mantener el paquete en
      su **100 %**.
- [x] **34. Criterio 11 — paridad editor/CLI.**
      Crear `packages/language-server/test/acceptance/formatting.test.ts` sobre el arnés LSP en
      proceso que ya existe: para cada fichero del corpus, aplicar los `TextEdit` que devuelve
      el servidor y comprobar que el resultado es **idéntico** al de `fudic fmt`. Es la
      comprobación de que el invariante «un solo formateador» se sostiene, y solo se puede
      hacer aquí, donde viven los dos caminos.
- [x] **35. El `.vsix` lleva su propio formateador (toca `fudic-vscode`, SDD-25).**
      Modificar `packages/vscode/{package.json, scripts/*, .vscodeignore}`: vendorizar
      `oxfmt` y el `@oxfmt/binding-*` de la plataforma junto al de `oxc-parser`, y extender
      `verify-vsix` en los dos sentidos. El `.vsix` es específico de plataforma desde SDD-25;
      esta tarea añade un binario nativo más, no un problema nuevo.

---

## Cierre de la SDD

- [x] `pnpm typecheck`, `pnpm test` y `pnpm build` en verde (incluidas las vueltas a
      `@fudic/cli`, `@fudic/language-server` y `fudic-vscode` de la fase 7).
- [x] Cobertura **100 %** en las cuatro métricas de `@fudic/formatter`, con
      `coverage.include` sobre `src/**`, y los tres paquetes tocados en la suya.
- [x] `fudic fmt --check` sobre `examples/basic` sale con cero: las páginas reales del ejemplo
      quedan formateadas por el formateador, que es la única prueba que no envejece.
- [x] Anotar `FUD0480`–`FUD0499` en el catálogo de SDD-12.
- [x] Marcar SDD-26 como `Hecho` y anotarlo en [INDEX.md](./INDEX.md) (tabla + registro de
      progreso).

---

## Desviaciones respecto a este documento

- **El código de la CLI es `FUD0450`, no `FUD0446`.** La tarea 32 nombraba `FUD0446`, que ya
  estaba ocupado por «sección pedida que el layout no declara» (SDD-22). El fichero que no
  parsea se rechaza con `FUD0450`, dentro del rango de la CLI: es un error de `fudic fmt`, no
  del formateador, y su sitio no es `FUD0480`–`0499`.
- **`format` mira solo los diagnósticos de `parseDocument`.** Los de `structureDocument` — el
  envoltorio host de la decisión 75 — no bloquean: un componente a medio escribir todavía no
  lo tiene, y ese es justo el momento en que se pide formatear.
- **Los handlers del servidor devuelven `[]`, nunca `undefined`.** Una respuesta nula hace que
  Volar siga camino hasta el servicio de HTML, que reformatea el `.fud` como si `@if` no
  existiera. Y el mapping identidad del código raíz debe llevar `format: true` o el fichero
  nunca llega a nuestro handler.
- **`oxfmt` rechaza un `printWidth` mayor que 320** y devuelve ese rechazo como error, que este
  paquete lee como «no parsea». El ancho se acota; el corpus se comprueba además **sin una sola
  nota**, que es lo único que distingue una hoja mal configurada de una hoja rota.

