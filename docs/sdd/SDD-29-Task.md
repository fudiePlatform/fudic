# SDD-29 — Tareas

> **SDD:** [SDD-29 — Snippets de markup reutilizables (`@snippet` / `@render`)](./SDD-29-code-snippets.md)
> **Paquetes:** `@fudic/compiler` (el grueso) · `@fudic/language-core` · `@fudic/language-server` ·
> `@fudic/formatter` · `@fudic/vite` · `@fudic/cli` · `fudic-vscode`
> **Rama:** `SDD-29-code-snippets`
> **Rango de diagnósticos:** `FUD0820`–`FUD0849` (lo fija esta tanda; el SDD no reservaba ninguno)
> **Progreso:** 14 / 16
> **Bloqueado por:** nada. SDD-05, 06, 10, 11 y 12 están `Hecho`, y la resolución de
> specifiers de paquete que hereda el `<link rel="snippet">` la trajo
> [SDD-43](./SDD-43-librerias.md) §4.3 sin tocar `ResolveIo`.

Dieciséis tareas. La spec se redactó antes de que existieran SDD-30..45 y deja tres huecos que
estas tareas cierran por escrito, porque sin ellos no hay implementación posible:

- **De dónde saca el emit el texto de un cuerpo importado.** El emit corta cada expresión y
  cada atributo de **un único** texto fuente (`entrySource`, `ResolvedComponent.source`) y el
  source map tiene una sola entrada de `sources` (SDD-13 §4.3) — por eso los layouts se
  componen por módulo ES y nunca por texto. La expansión resuelve eso con una **fuente
  sintética**: el texto del llamante con cada `@render` sustituido **en su sitio** por el
  cuerpo del snippet, más una tabla de offsets que devuelve cada posición a su fichero. El
  árbol que sale es, byte a byte, el de ese markup escrito a mano —criterio 4 literal— y el
  resto del compilador no se entera de que existen los snippets. Es el patrón del buffer
  sintético con tabla de regiones que SDD-11 ya usa con Oxc.
- **Qué rol de documento es un fichero de snippets.** §4.9 dice que es un tipo de fichero del
  framework, y hoy un `.fud` sin host wrapper es `FUD0156`. Entra un quinto rol,
  `snippet-document`, junto a component, page, route y layout.
- **Quién comprueba una llamada.** La comprobación (§4.7) es **compartida**: la misma función
  la corre el build y el editor. Lo que el editor **no** hace es expandir — proyecta el
  `@snippet` como una función tipada y el `@render` como una llamada, y entonces los tipos, la
  aridad, el hover y el ir-a-la-definición los da TypeScript, que es lo que §7 delega en
  SDD-23.

El orden manda en tres puntos: la 1 antes que todo (sin nodos no hay nada que comprobar); la 8
—la comprobación— antes que la expansión, porque expandir una llamada mal formada es expandir
basura; y la 13 después de la 11, porque la proyección del consumidor importa de la del
declarante.

**Dónde vive cada cosa, ya construido.** El paquete se parte en dos módulos y no en uno, y la
frontera es la I/O: `src/snippet/` es gramática pura —nodos, parser, firma, reglas de cuerpo—
sin filesystem y sin conocer el documento; `src/expand/` es todo lo que necesita leer otros
ficheros —enlaces, ámbito, comprobación, expansión—. `document/` importa la primera, y la
segunda importa a las dos. Sin esa frontera hay ciclo: la estructura del documento necesita
las reglas de cuerpo, y el ámbito necesita la estructura.

---

## Mapa de dependencias

```
1 gramática ──→ 2 firma ──→ 3 argumentos
      │                          │
      ├──→ 4 rol snippet ──→ 5 cuerpo ──→ 6 <link rel="snippet"> ──→ 7 ámbito
      │                                                                 │
      └─────────────────────────────────→ 8 comprobación ←──────────────┘
                                               │
                    ┌──────────────────────────┴───────────┐
                    ▼                                      ▼
            9 fuente sintética               11 proyección TS ──→ 12 servidor
                    │                                      │        de lenguaje
            10 arrastre + enganche                 13 formateador y gramática
                    │                                      │
                    └──────────────→ 14 evidencia ←────────┘
                                          │
                                  15 cobertura ──→ 16 cierre
```

---

## Fase 1 — la gramática (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **(rojo primero)** **`@snippet` y `@render` son construcciones.** `classifyDirective` gana un segundo conjunto cerrado —`snippet`, `render`— resuelto como `{ kind: 'snippet-directive' }`, con su propio `parseSnippet?` en `AtConstructParser` (el de layout no los posee). Nuevo módulo `snippet/` con `SnippetDeclNode`, `SnippetParam`, `RenderCallNode`, `PositionalArg`, `NamedArg` — **span en todos**, más `signatureSpan` y `nameSpan` propios. El parser lee `@snippet IDENT ( … ) { html_block }` reutilizando el balanceador y `parseContentUntil`, exactamente como `@section`; nunca lanza: nombre ausente, paréntesis ausentes o `{` ausente degradan a nodo parcial con su diagnóstico. `FUD0820` (nombre ausente o con guión), `FUD0821` (firma sin cerrar). Los cinco hosts que construyen `atConstructs` lo inyectan. Criterio 1 | `compiler` | `src/at/at.ts` · `src/snippet/nodes.ts` · `src/snippet/parser.ts` · `src/snippet/index.ts` · `src/html/parser.ts` |
| [x] | 2 | 1 | **La firma la parsea Oxc.** `JsFragmentKind` gana `'params'`, envuelto como `function __fud(<firma>) {}`, y `snippetParams(decl, batch)` lee del AST el nombre, el `?`, la anotación de tipo y el valor por defecto de cada parámetro, con los spans mapeados de vuelta con `mapSpan`. Oxc se sigue invocando **una vez por fichero**. Un `function` en la firma sale como error de Oxc dentro de la firma (criterio 8), sin código propio. Criterios 5, 6, 8 | `compiler` | `src/oxc/batch.ts` · `src/snippet/signature.ts` |
| [x] | 3 | 1 | **Los argumentos de `@render`.** `@render (ns.)?name(args)` con posicionales y nominales `nombre: expr`, separados por comas al nivel del balanceador (una coma dentro de un string, de un objeto o de una llamada no separa). `FUD0832` posicional tras nominal, `FUD0833` un `@` dentro de la cabecera. Sin argumentos, paréntesis obligatorios. Criterios 9, 10, 13 | `compiler` | `src/snippet/parser.ts` |

---

## Fase 2 — el fichero de snippets (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 4 | 1 | **El quinto rol: `snippet-document`.** Un `.fud` sin doctype, sin `<link rel="layout">`, sin host wrapper y con al menos un `@snippet` es un documento de snippets, y no `FUD0156`. Lleva `links`, `snippets` y nada más. Los sitios que discriminan por `doc.type` lo contemplan —la exhaustividad de TS los enumera—: no se emite módulo por él (`@fudic/vite` devuelve vacío), no entra en el grafo de componentes, y el editor lo abre sin un error que no se puede curar. `@snippet` es top-level en **cualquier** rol y en **cualquier** posición: la decisión 53 no se extiende a él (§4.1). Criterio 32 | `compiler` · `vite` · `cli` | `src/document/nodes.ts` · `src/document/structure.ts` · `packages/vite/src/transform.ts` |
| [x] | 5 | 4 | **Lo que un cuerpo no puede llevar.** `FUD0822` `<style>`, `FUD0823` `@code`, `FUD0824` un `@snippet` anidado, `FUD0825` un `<head>`. Span en el nodo infractor, el cuerpo se conserva y el resto del fichero se sigue analizando. Criterios 28, 29, 30, 31 | `compiler` | `src/snippet/body-rules.ts` |
| [x] | 6 | 4 | **`<link rel="snippet">`.** Un `rel` más para el mismo resolutor: `href` verbatim (SDD-43 §4.3), relativo o specifier de paquete, `as` que significa **solo** namespace y nunca se infiere. Se consume: no aparece en el HTML de salida ni lo toca el `AssetLinker`. `FUD0836` cuando no resuelve o el fichero no declara ningún `@snippet`. Criterio 20 | `compiler` | `src/document/structure.ts` · `src/snippet/links.ts` |
| [x] | 7 | 6, 2 | **`SnippetScope`.** Los `@snippet` del propio fichero más los de cada `<link rel="snippet">`, transitivamente: `global` y `namespaced`. `FUD0834` cuando dos nombres colisionan en `global`, con span en el segundo `<link>` (o en la segunda declaración) y **span secundario** en el primero — `Diagnostic` gana `related`, que es lo que §4.4 pide y hoy no existe. Un namespace nunca colisiona. Un ciclo de importación entre ficheros de snippets se corta y no cuelga. Criterios 16, 17, 18, 19 | `compiler` | `src/snippet/scope.ts` · `src/types/diagnostic.ts` |

---

## Fase 3 — la comprobación (1)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 8 | 3, 7 | **`checkRenderCalls`, la misma para el build y para el editor.** Por cada `RenderCall`: resolución del nombre (`FUD0826`) y del namespace (`FUD0827`); ligado de argumentos a parámetros —posicionales por orden, nominales por nombre, defaults y `?` para los ausentes—; `FUD0828` aridad insuficiente con span en la llamada, `FUD0829` argumentos de más con span en el primer sobrante, `FUD0830` nominal que no corresponde a ningún parámetro, `FUD0831` parámetro asignado dos veces con span primario en el nominal y secundario en el posicional; y `FUD0835` recursión directa o indirecta, con el **ciclo entero** en el mensaje (`card → row → card`), detectada por pila de expansión. **Nada lanza y nada cuelga.** El resultado es el ligado, que la expansión reutiliza en vez de recalcularlo. Criterios 7, 9, 10, 11, 12, 25, 26, 27 | `compiler` | `src/snippet/check.ts` |

---

## Fase 4 — la expansión (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 9 | 8 | **La fuente sintética.** `expandSnippets(source, doc, scope, io)` devuelve un texto nuevo —el del llamante con cada `@render` sustituido **en su sitio** por el cuerpo del snippet— y una tabla de offsets. El cuerpo se copia verbatim salvo en las referencias a un parámetro, que se sustituyen por el texto del argumento entre paréntesis: las referencias las da Oxc (`freeReferences` sobre cada fragmento del cuerpo, mapeado con `mapSpan`), nunca un regex, porque `obj.title` no nombra ningún `title`. Una expresión implícita cuya cabeza se sustituye se reescribe a la forma explícita `@( … )`, que es lo único que mantiene el átomo parseable. Expansión recursiva con la misma pila de la tarea 8. El documento se **reparsea una vez** desde el texto resultante: lo que sale no contiene ni un `SnippetDecl` ni un `RenderCall`, y es nodo a nodo el del markup escrito a mano. Criterios 2, 3, 4, 14, 15, 24, 31 | `compiler` | `src/snippet/expand.ts` · `src/snippet/offsets.ts` |
| [x] | 10 | 9 | **Cada diagnóstico en su fichero.** La tabla de offsets devuelve una posición sintética a su origen: al fichero del llamante cuando cae en su texto o en un argumento, y al **fichero del snippet** cuando cae dentro de un cuerpo expandido — con el `RenderCall` que lo provocó como span relacionado (§5, criterio 34). Se aplica a los diagnósticos de todas las fases posteriores y al `SourceMapBuilder`, que sigue con una sola entrada de `sources`: una posición de cuerpo expandido se ancla en la llamada. Criterio 34 | `compiler` | `src/snippet/offsets.ts` · `src/sourcemap/sourcemap.ts` |
| [x] | 11 | 9 | **El arrastre, y el enganche.** Los `<link rel="component">` del fichero de un snippet **invocado** se resuelven contra *ese* fichero y entran en el grafo del llamante, deduplicados por ruta resuelta; solo los de los snippets efectivamente invocados, y dentro de ellos solo los tags que su cuerpo usa. `resolveDocument` expande antes de estructurar el grafo, y `ComponentGraph` publica `snippetFiles` para que `@fudic/vite` los vigile y el HMR invalide a los consumidores. La validación «custom element sin `<link rel="component">`» (decisión 41) se evalúa **después**. Criterios 21, 22, 23 | `compiler` · `vite` | `src/emit/resolve.ts` · `packages/vite/src/transform.ts` |

---

## Fase 5 — el editor (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 12 | 8 | **La proyección: un snippet es una función.** El fichero virtual de un `.fud` exporta cada `@snippet` como `export function card(title: string, variant: 'a'\|'b' = 'a') { … }` con el cuerpo proyectado por el mismo proyector de plantilla que ya existe, y los parámetros mapeados a su span. En el consumidor, un `<link rel="snippet">` es un `import`: sin `as`, nombrado; con `as`, `import * as form`. Un `@render form.card(x)` se proyecta como `form.card(x)`. De ahí salen **gratis** el chequeo de tipos de los argumentos (§7), la aridad, el hover con la firma completa y el ir-a-la-definición cruzando ficheros. Criterios 33, 35 | `language-core` | `src/template/snippets.ts` · `src/emit-client.ts` · `src/imports.ts` |
| [x] | 13 | 12 | **La misma sensación que con cualquier `.fud`.** Un fichero de snippets se abre sin errores (rol nuevo en `mode.ts`); el `href` de un `<link rel="snippet">` completa rutas y va a la definición como el de `rel="component"`; tras `@render ` se completan los nombres del ámbito, con su firma en el detalle; `@snippet` y `@render` colorean como palabra clave —tokens semánticos y gramática de VS Code—; los diagnósticos de la tarea 8 llegan al editor por el canal que ya existe; y modificar un fichero de snippets reparsea a sus consumidores. Criterios 33, 34, 35 | `language-server` · `vscode` | `src/mode.ts` · `src/services/href.ts` · `src/services/snippets.ts` · `syntaxes/fudic.tmLanguage.json` |
| [x] | 14 | 1 | **El formateador no se come nada.** `@snippet name(firma) { … }` y `@render name(args)` se imprimen y se sangran como un `@section` y una directiva: el cuerpo es un `html_block` y no tiene reglas propias (§7). Ida y vuelta idempotente sobre el fixture | `formatter` | `src/format.ts` |

---

## Dónde está esto ahora — para quien lo recoja

Fases 1 a 5 **cerradas y commiteadas**, cinco commits en la rama, con
`pnpm typecheck`, `pnpm test` y `pnpm build` en verde después de cada una. `src/snippet/` y
`src/expand/` están al **100 %** en las cuatro métricas.

Lo que queda:

- **Tarea 15 — la evidencia.** Sin empezar. El fixture canónico y el ejemplo que construye de
  verdad, verificado en Chrome. El andamiaje está: `packages/vite/test/transform-snippets.test.ts`
  ya compone un componente arrastrado extremo a extremo con ficheros reales.
- **Tarea 16 — cierre.** Los 35 criterios de §6 repasados uno a uno, cobertura, e `INDEX.md`.

Dos decisiones tomadas por el camino que conviene no deshacer sin leer el porqué:

1. **El editor no corre `checkRenderCalls`.** TypeScript ya reporta el nombre, la aridad y los
   tipos sobre la proyección, y con mejores mensajes; duplicarlo es lo que BUG-23 enseñó a no
   hacer. El build sí lo corre entero, porque allí no hay TypeScript. Queda un hueco conocido:
   `FUD0834` entre dos ficheros importados sin `as` solo se ve en el build.
2. **`src/snippet/` es gramática pura y `src/expand/` es todo lo que lee ficheros.** La
   frontera evita un ciclo real entre `document/` y el ámbito.

---

## Fase 6 — la evidencia y el cierre (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 15 | 11, 13, 14 | **La evidencia.** Un fixture canónico `.fud` con los cuatro casos —declaración local, importación sin `as`, importación con `as`, y un snippet que instancia un componente que el llamante no declara— y el ejemplo que lo construye de verdad: `pnpm build` en verde y el markup expandido en el HTML, indistinguible del escrito a mano. Verificado en Chrome real, como pide el repo para todo lo que se ve. Criterios 21, 22, 23 | `compiler` · `examples` | `packages/compiler/fixtures/*.fud` · `examples/` |
| [ ] | 16 | todas | **Cobertura y cierre.** `pnpm typecheck`, `pnpm test` y `pnpm build` en verde y los 35 criterios de §6 verdes, con el «rojo primero» de la tarea 1 visto fallar antes. Todo fichero nuevo al **100 %** en las cuatro métricas; ningún paquete tocado por debajo del suelo medido al empezar. SDD-29 a `Hecho` en [INDEX.md](./INDEX.md), tabla y registro de progreso, y el rango `FUD0820`–`FUD0849` anotado en el catálogo | — | [INDEX.md](./INDEX.md) |
