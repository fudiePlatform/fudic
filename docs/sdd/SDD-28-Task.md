# SDD-28 — Tareas

> **SDD:** [SDD-28 — Snippets y andamiaje en el editor](./SDD-28-snippets.md)
> **Paquete:** `@fudic/language-server` (más una mudanza a `@fudic/compiler`)
> **Rama:** `feat/sdd-28-snippets`, dentro del worktree `sdd-25-pendientes`
> **Progreso:** 22 / 22 — hecho, cierre incluido.

Cada tarea es un paso cerrado: se implementa, se verifica y se marca. Ninguna depende de
tareas posteriores. Salvo donde se diga otra cosa, los ficheros son relativos a
`packages/language-server/`.

**El orden importa dentro de cada fase.** La fase 0 va primero porque las fases 4 y 5 escriben
contra la firma que deja; la 1 antes que la 2 porque el catálogo no se puede probar sin las
puertas; y la 5 (la cadena de `completions`) al final, porque es el único punto donde una
regresión no rompe un test propio sino uno ajeno —el de Emmet—.

---

## Fase 0 — La mudanza del ancla (3)

- [x] **1. `componentLinkAnchor` en el compilador.**
      Crear `packages/compiler/src/document/anchor.ts` con `LinkAnchor`,
      `componentLinkAnchor(source, doc)` y `componentLinkTag(href)`, movidas literalmente desde
      [`cli/src/wire.ts:23-76`](../../packages/cli/src/wire.ts#L23-L76) —incluido `lineIndent`—,
      y exportarlas en `packages/compiler/src/index.ts`. Puras, sin I/O.
      **Hecho.** Una sola cosa no se movió literal: `lineIndent` usaba `match?.[0] ?? ''` sobre
      `^[ \t]*`, que **siempre** casa, así que el `??` era una rama que ningún test podía tomar
      —invisible en un paquete con deuda, inaceptable en un fichero nuevo al 100 %—. Se escanea.
      `anchor.ts` nace en **100/100/100/100** (13 sentencias, 9 ramas, 3 funciones).
- [x] **2. La CLI importa desde el compilador.**
      Modificar `packages/cli/src/wire.ts`: `alreadyLinked` y `wireComponentLink` **se quedan**;
      `anchorFor` y `componentLinkTag` pasan a reexportarse desde `@fudic/compiler` para no
      romper `src/index.ts`. `pnpm --filter @fudic/cli test` en verde **sin tocar sus tests**:
      si alguno cambia, la mudanza no fue mecánica.
      **Hecho.** 80 tests de `cli` en verde sin tocar ni una línea de `test/`.
- [x] **3. Anotar SDD-22 §4.4.**
      Modificar [`SDD-22-fudic-cli.md`](./SDD-22-fudic-cli.md) §4.4: el ancla vive ahora en el
      compilador y por qué (una regla, dos consumidores).

## Fase 1 — Las puertas (3)

- [x] **4. Contextos de texto.**
      Modificar `src/services/position.ts`: `isEmptyDocument(source)`, `wordContextAt` (palabra
      en markup **sin** `<`) y `directiveContextAt` (`@` + identificador parcial, con el span
      **incluyendo el `@`**).
      **Hecho, con dos guardas que la spec no detallaba.** `wordContextAt` calla dentro de un
      tag abierto —ahí una palabra es un **atributo**, y los atributos los contesta la
      proyección de SDD-23—, leído retrocediendo hasta un `<` antes que un `>`; un `>` dentro
      de un valor de atributo lo engaña, y el coste de que lo engañe es una sugerencia de más
      en una lista, nunca una edición equivocada. Y `directiveContextAt` calla tras `@@`, que
      es el escape de la decisión 1, y tras un carácter de palabra (`hola@ejemplo.com`).
- [x] **5. Tests de los contextos.**
      Modificar `test/services/position.test.ts`: palabra a medias, palabra pegada a `<` (que
      sigue siendo `tagContextAt`), `@` solo, `@Ren` a medias, y el fichero de solo espacios.
- [x] **6. Resolución de scope.**
      Crear `src/services/snippets.ts` con `SnippetScope` y la función que decide el scope de un
      offset: `empty-document` por `isEmptyDocument`, `code-block` por el span de
      `document.code`, `markup` por `isMarkupOffset`. Tests de los tres y del cuarto caso —el
      cuerpo de un `<style>`, que no es ninguno—.
      **Hecho.** El cuarto caso son dos: el cuerpo de un `<style>` y el interior de una
      interpolación. `scopeAt` devuelve `undefined` en los dos.

## Fase 2 — El catálogo (5)

- [x] **7. Tipos y esqueletos de documento.**
      Modificar `src/services/snippets.ts`: `FudSnippet`, `SNIPPETS` y los cuatro cuerpos de
      `component`, `route`, `page` y `layout` (§5.1.a), como constantes.
- [x] **8. Control de flujo.**
      Añadir los seis de §5.1.c: `@if`, `@if else`, `@foreach`, `@for`, `@while` y `@switch`,
      este último con `case`/`default` y sin llaves por caso (decisión 14).
- [x] **9. Bloque `@code` por rol.**
      Añadir los de §5.1.b con `requiresNoCodeBlock`: `props` + `@client` en un componente,
      `@server load` en ruta y página, y `@code { }` a secas en un layout —**un layout no
      declara `load`** (`FUD0430`)—.
- [x] **10. Directivas y zonas.**
      Añadir los de §5.1.d: `@RenderBody`, `@RenderHead`, `@RenderSection` y `@section` en
      markup por rol; `props`, `load`, `@server` y `@client` dentro del `@code`.
- [x] **11. `snippetsAt` y sus puertas.**
      Implementar el filtro por scope, rol y `requiresNoCodeBlock`, y probarlo: ningún control
      de flujo dentro de `@code`, ningún `@RenderBody` en una ruta, ningún `@client` fuera de un
      componente, y el `@code` que desaparece en cuanto el documento ya tiene uno.
      **Hecho.** 21 entradas. Tres comparten el label `@code` sobre roles **disjuntos**, que es
      lo que permite que un componente reciba `props` y una ruta reciba `load` sin que el
      catálogo tenga una rama. Un detalle que el test destapó y que se queda como está: un
      fichero con **solo un comentario** ya no es vacío, así que pierde los esqueletos y gana
      markup — un comentario es contenido, y `@* … *@` es markup.

## Fase 3 — Que el catálogo no mienta (3)

- [x] **12. Equivalencia con las plantillas de la CLI** (criterio 2).
      Crear `test/services/snippets-templates.test.ts`: para los cuatro esqueletos, comparar
      **byte a byte** el cuerpo del catálogo con `renderTemplate(file, vars)` de `@fudic/cli`,
      pasando los tabstops como valores. Comprobado que muerde: cambiar un espacio del catálogo
      lo pone en rojo.
      **Hecho.** Los *block builders* (`codeBlock`, `serverCodeBlock`, `styleBlock`, `indent`,
      `sectionBlocks`, `renderSectionBlocks`) no estaban en el `index.ts` de la CLI, así que
      pasan a estarlo: un segundo consumidor materializa las mismas plantillas y necesita las
      mismas piezas.
- [x] **13. Todo cuerpo parsea** (criterios 3 y 6).
      Crear `test/services/snippets-parse.test.ts`: sustituir cada tabstop por su valor por
      defecto y pasar el resultado por `parseFud` —los esqueletos, cada uno con su rol y **cero
      diagnósticos**; los de markup, insertados en un componente mínimo—.
      **Hecho, y el test destapó un hueco del catálogo antes de estar acabado.** Un `@code` es
      un nodo **top-level** en un componente y en una ruta (decisiones 53, 83) y vive **dentro
      de `<head>`** en una página y en un layout (59); un `@section` es top-level de su ruta.
      Ofrecerlos en medio del cuerpo andamiaba un fichero en rojo —`FUD0153`/`FUD0155`—, así
      que `FudSnippet` gana `placement: 'top-level' | 'in-head'` y la entrada de `@code` se
      parte en cuatro, una por rol. Un elemento **sin tag de cierre** (`<meta>`, `<link>`) no
      tiene contenido y por tanto nunca es aquello en cuyo interior está el cursor.
      *El primer rojo fue del propio test*, no del catálogo: `\$\{?\d+\}?` se comía la llave de
      cierre de `@client {$0}`. Las tres formas de tabstop se sustituyen con tres expresiones.
- [x] **14. Escapes.**
      Test que afirma que todo `$` de un cuerpo pertenece a un tabstop declarado, y que ningún
      cuerpo lleva `\` suelto. Un `$` sin escapar es un cuerpo que se inserta mutilado y ningún
      otro test lo vería.

## Fase 4 — Tags y auto-enlace (4)

- [x] **15. Los componentes que este fichero PUEDE escribir.**
      Modificar `src/services/tags.ts`: `TagCompletion` gana `linked`, y `componentTags` une los
      enlazados (orden de `<link>`) con los del workspace vía `index.byRole('component')`,
      excluyendo el propio fichero y calculando su `href` con `relativeHref`. `declaredTags` y
      `tagDefinitionAt` **no se tocan** (criterio 15).
      **Hecho.** Una exclusión más de la que pedía la tarea: un componente del workspace cuyo
      **tag ya está en scope** tampoco se ofrece. Dos ficheros que definen el mismo tag son un
      conflicto, y ofrecer el segundo sería ofrecer crearlo. Enlazados en orden de `<link>`;
      los demás alfabéticos, porque nada en el workspace sugiere otro orden.
- [x] **16. La edición que enlaza.**
      Añadir `linkInsertionFor(document, href)` sobre `componentLinkAnchor`: devuelve el `Span`
      vacío y el texto a insertar, o nada si `alreadyLinked` (criterio 14).
      **Hecho, y `alreadyLinked` se muda también al compilador.** Es la misma regla de la
      fase 0 con el mismo argumento: dos consumidores. Se lleva consigo su lector estricto de
      atributos —un `href="./@(x).fud"` **no** es una ruta que nadie pueda comparar, así que no
      cuenta como enlace—, que es justo donde `linkHref` habría dado otra respuesta.
- [x] **17. Tests de tags.**
      Modificar `test/services/tags.test.ts`: los dos grupos, el orden, el fichero propio
      ausente, la idempotencia y que F12 sigue sin resolver un tag no enlazado.
- [x] **18. El ancla es la misma que la de la CLI** (criterio 13).
      Crear `test/acceptance/wiring.test.ts`: sobre un corpus con los cuatro roles, con y sin
      links previos, aplicar el `TextEdit` del servidor y comparar con `wireComponentLink` de
      `@fudic/cli`. Mismo patrón que
      [`acceptance/formatting.test.ts`](../../packages/language-server/test/acceptance/formatting.test.ts).
      **Hecho.** Compartida ya la regla, lo que este test guarda es la otra mitad: las dos
      **aplicaciones** de ella, una inserción LSP y un splice sobre string. Seis casos y la
      idempotencia; cada uno afirma además que el enlace se escribió de verdad, para que dos
      caminos no puedan coincidir en no hacer nada.

> **Anotado, no es de esta fase.** Corriendo la cobertura completa cayó una vez
> `§6.14 — cancellation > a burst of edits leaves exactly one request completed` (4 en vez de
> 1), y volvió a pasar en aislado y en la siguiente pasada completa. Es la fragilidad bajo
> carga que el cierre de T-12 en [SDD-25-Task-Claude](./SDD-25-Task-Claude.md) ya dejó abierta
> y que merece tarea propia; no la toca nada de SDD-28.

## Fase 5 — La cadena de `completions` (4)

- [x] **19. La rama de directivas.**
      Modificar `src/services/plugin.ts`: tras `href` y `@section`, un contexto `@` que devuelve
      los snippets de markup del rol, con `textEdit` sobre el span que incluye el `@`. Va
      **antes** de Emmet.
      **Hecho, con una condición que no estaba prevista: solo gana si tiene algo que decir.**
      Dentro de un `<style>` un `@` es una **at-rule de CSS**, y contestar con una lista vacía
      ahí tapa al servicio de CSS —que es de quien es ese `@media`—. La rama devuelve solo
      cuando el catálogo aporta algo.
- [x] **20. Fusión con Emmet** (invariante §5.3).
      Modificar `completions()`: la rama de palabra-sin-`<` **añade** sus ítems a los de Emmet en
      vez de retornar; la lista conserva `isIncomplete` si Emmet lo puso. La rama **con** `<`
      sigue devolviendo la lista sola.
- [x] **21. La forma de los ítems.**
      `insertTextFormat: Snippet` en todo lo de este SDD, `sortText` `0_` para lo enlazado y `1_`
      para lo que aún no lo está, `labelDetails.description` distinto en cada grupo, y
      `additionalTextEdits` solo cuando falta el `<link>`.
      **Hecho.** El `newText` del tag depende del contexto: con `<` ya escrito se completa
      **hacia dentro** (`app-badge>$0</app-badge>`), y sin él se escribe el tag entero.
- [x] **22. El test que impide la regresión** (criterio 11).
      Modificar `test/services/plugin.test.ts`: en la misma posición y en la **misma respuesta**,
      los ítems de Emmet (`div` → `<div>$0</div>`) y los nuestros. **Comprobar que muerde**
      contra la implementación que retorna en vez de fusionar.
      **Hecho, y la puerta del esqueleto estaba mal.** El test de fichero vacío falló y tenía
      razón: `isEmptyDocument` exigía un fichero **sin nada**, pero nadie completa sin teclear
      antes, y al teclear `rou` el fichero deja de estar vacío — una puerta que se cierra con
      una sola pulsación es una puerta por la que no pasa nadie. Ahora vale también «nada más
      que la palabra que se está escribiendo». Y la aserción de Emmet acabó siendo mejor de lo
      escrito: sobre `app`, Emmet no expande `<app>` sino **`applet`**, que es lo que de verdad
      demuestra que su lista sigue entera.

---

## Cierre de la SDD

- [x] Aceptación sobre la conexión LSP viva: crear `test/acceptance/snippets.test.ts` con los
      criterios 1, 5, 7, 8, 9, 10 y 12 contra el workspace de fixtures, como hace
      [`acceptance/completion.test.ts`](../../packages/language-server/test/acceptance/completion.test.ts).
      **Hecho, y es lo que ha justificado el paso.** Cuatro de sus casos fallaron y ninguno era
      culpa del test: **parte del catálogo no llegaba al editor**. Volar reparte cada posición
      al **primer** documento embebido que la contesta y descarta al resto, y la raíz se visita
      **la última**, así que allí donde TypeScript responde —dentro de `@code`, y sobre un `@`
      con letras ya escritas, que proyecta como interpolación— lo nuestro se calculaba y se
      tiraba. Medido antes de tocar nada: `@code { pro| }` 1082 ítems, **0 nuestros**; `@co|`
      1195, **0 nuestros**. Se cierra con `USER_CAPS.completion = { isAdditional: true }`
      —Volar deja de considerar exclusiva la respuesta de la proyección—, y eso destapa la
      duplicación que el reparto tapaba: la zona neutra vive en los **dos** virtuales y
      TypeScript pasaba a contestar dos veces (2164 donde había 1082). `USER_ECHO_CAPS` le da
      un solo dueño, el virtual de cliente, que es la misma regla que ya rige sus diagnósticos
      duplicados. Detalle final: el arnés declaraba `snippetSupport: false`, así que el
      protocolo degradaba **todo** snippet a texto plano — declaraba un cliente que no existe.
      Todo esto es §5.6 de la spec y los criterios 17–19.
- [x] `pnpm typecheck`, `pnpm test` y `pnpm build` en verde en todo el workspace.
      **2469 tests**, build incluido `examples/basic` y el `.vsix`.
- [x] Cobertura **100 %** en las cuatro métricas en `@fudic/language-server`, y sin bajar en
      `@fudic/compiler` ni en `@fudic/cli` tras la mudanza.
      **Hecho.** `language-server` 790/454/221/673 al 100 %; `language-core` sigue al 100 % tras
      `USER_ECHO_CAPS`; `anchor.ts` del compilador nace al 100 %.
- [x] Marcar SDD-28 como `Hecho` y anotarlo en [INDEX.md](./INDEX.md) (tabla + registro de
      progreso), más el estado de T-13/T-14 en
      [SDD-25-Task-Claude.md](./SDD-25-Task-Claude.md).

> **Queda abierto, y no es de esta SDD.** `§6.14 — cancellation` volvió a caer bajo carga dos
> veces durante estas fases (4 peticiones completadas en vez de 1) y pasa siempre en aislado
> —tres de tres—. Es la fragilidad que el cierre de T-12 dejó anotada; la sospecha de partida
> es que `resume(BURST*3−1)` garantiza que las cancelaciones han **llegado**, no que se hayan
> **procesado**. Merece tarea propia.
