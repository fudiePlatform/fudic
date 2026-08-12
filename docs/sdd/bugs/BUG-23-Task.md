# BUG-23 — Tareas

> **BUG:** [BUG-23 — el `@` es una válvula de escape](./BUG-23-arroba-valvula-de-escape.md)
> **Paquetes:** `@fudic/compiler` · `@fudic/language-core` · `@fudic/language-server` ·
> `@fudic/formatter` · `fudic-vscode` · `@fudic/vite`
> **Rama:** `worktree-bug-23`
> **Progreso:** 0 / 25

Veinticinco tareas. Las rutas son relativas a la raíz del repo, y cada tarea es un paso
cerrado: se puede parar después de cualquiera con el workspace verde.

**El orden manda en cuatro puntos.** La **1 antes que todo**: los siete síntomas se miden
contra el código de hoy antes de tocarlo, o los tests solo demuestran que el código nuevo hace
lo que hace. La **2 antes que la 4**: la cadena implícita cambia lo que es un nodo, y el valor
sin comillas se apoya en ella. La **7 antes que la 11**: la proyección no puede preguntar por la
forma de un handler hasta que alguien registre el fragmento. Y la **20 antes que la 21**: migrar
los `.fud` del repo a la forma sin comillas antes de que el formateador la imprima deja los
goldens comparables en un solo sentido.

---

## Mapa de dependencias

**Cuatro carriles arrancan a la vez.** La gramática no espera al editor, el reparto de
completados del servidor no espera a la gramática, y el build no espera a ninguno de los dos.

```
A · gramática (@fudic/compiler)
   2 cadena implícita ──┬──→ 4 valor sin comillas ──→ 5 región y spans
   3 punto colgante ────┘
   6 handlerShape ──→ 7 fragmentos de atributo en el batch

B · proyección (@fudic/language-core)                    [8..12]
   8 $props / $attrs ──→ 9 $required
   10 punto colgante copiado          [dep 3]
   11 handler como invocación         [dep 6, 7]
   12 slot contra el padre

C · servidor (@fudic/language-server)
   13 snippets al plugin aditivo (independiente, se puede hacer el primer día)
   14 el batch del servidor registra los valores   [dep 7]
   15 FUD0291 en Problems                          [dep 6]

D · build (@fudic/compiler + @fudic/vite)
   16 Prop.optional ──→ 17 registry.propsOf ──→ 18 FUD0197/0198/0199

E · herramientas                                   [dep 4]
   19 formateador ── 20 migración de los .fud ── 21 TextMate ── 22 snippets
   25 expansión del tag con las props requeridas   [dep 17, 20]

F · cierre
   23 documentación (gramática 100-104, SDD-23 §4.4, SDD-24 §4.2/§6.3, SDD-12) ──→ 24 verde
```

| carril | tareas | arranca | en paralelo con |
|---|---|---|---|
| **A** gramática | 2–7 | tras la 1 | C(13), D |
| **B** proyección | 8–12 | 8, 9, 12 ya; 10 tras 3; 11 tras 6+7 | C, D |
| **C** servidor | 13–15 | 13 ya | A, B, D |
| **D** build | 16–18 | ya | A, B, C |
| **E** herramientas | 19–22, 25 | tras 4; la 25 tras 17 | — |

Puntos de junta, y hay tres: **7** (nadie proyecta un handler sin AST), **18** (el build dice lo
que dice el editor) y **24** (verde y cerrado).

---

## Fase 1 — la medida: los siete síntomas en rojo (1)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 1 | — | **Rojo primero.** Un fichero de aceptación por síntoma, con el `.fud` de §1 del BUG y peticiones LSP **con `context`** (`triggerKind: 2` y el carácter recién tecleado), como las de BUG-16 §6.13. Los siete tienen que fallar hoy: el punto trayendo globales (§2.1), `@data.` sin miembros (§2.2), `FUD0056` sobre `.prop=@name` (§2.3), los dos errores de `$event` (§2.4), el `@` en texto sin `data` (§2.5), los tres casos de `slot` (§2.6) y el host sin props sin error (§2.7). **Anotar en esta tabla qué falla y cómo**, que es lo que después se compara | `language-server` · `compiler` | `test/acceptance/bug23-*.test.ts` *(nuevos)* · [test/acceptance/completion.test.ts](../../../packages/language-server/test/acceptance/completion.test.ts) *(patrón)* |

## Fase 2 — la gramática: el `@` deja de necesitar paréntesis (6)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 2 | 1 | **La cadena implícita (decisiones 100–101).** `scanImplicitExpression` deja de ser un camino de identificadores y pasa a un bucle de sufijos: `.nombre`, `?.nombre`, `( … )` y `[ … ]` balanceados por el balanceador —que ya devuelve sus `regions`, así que un `)` dentro de una cadena no cierra nada— y corta ante cualquier otra cosa. `ImplicitOptions` y su `call` **se borran**, y con ellos la decisión 99: la llamada ya no es un caso especial del valor de un evento | `compiler` | [src/at/at.ts `scanImplicitExpression`](../../../packages/compiler/src/at/at.ts#L173) · [src/html/parser.ts `#attributeAtom`](../../../packages/compiler/src/html/parser.ts#L551) *(pierde el parámetro `call`)* · [src/html/parser.ts `isHandlerName`](../../../packages/compiler/src/html/parser.ts) *(se retira)* |
| [ ] | 3 | 1 | **El punto colgante (decisión 102).** Donde el bucle corta por un `.` o un `?.` sin nombre detrás, el nodo se lleva `dangling: Span` con ese punto. **Fuera de `span` y fuera de `expr`**: el emit no ve nada nuevo y la decisión 2 sigue intacta —`@name.` sigue imprimiendo el punto como texto—. Un test de golden lo fija | `compiler` | [src/at/at.ts](../../../packages/compiler/src/at/at.ts#L195-L200) *(el bucle del punto)* · `src/at/at.ts` `RazorExpression` *(campo nuevo)* |
| [ ] | 4 | 2 | **El valor sin comillas (decisión 103).** Tras un `=`, si el carácter es un `@` que no es `@@`, el lexer emite un `at-trigger` en vez de `text`; el parser resuelve el átomo, lo mete como única parte del valor y **no** emite `FUD0056`. Todo lo demás sigue dando `FUD0056` (`id=foo`), y `.prop=@` sin nada detrás degrada con diagnóstico. Ojo al `>`: la cadena corta ahí sola, así que `<x .p=@a.b>` cierra el tag donde debe | `compiler` | [src/lexer/lexer.ts `#scanUnquotedValue`](../../../packages/compiler/src/lexer/lexer.ts#L576) y [`lexer.ts:541`](../../../packages/compiler/src/lexer/lexer.ts#L541) · [src/html/parser.ts `#parseUnquotedValue`](../../../packages/compiler/src/html/parser.ts#L580) |
| [ ] | 5 | 4 | **Los spans que leen comillas.** `attributeValueSpan` ya tiene la rama sin comillas —hay que comprobarla con un valor `@`— y `regionAt` tiene que devolver `expression` dentro de él, no `tag`: es lo que hace que el completado dentro de `.p=@da\|` sea el de TypeScript y no el de los nombres de atributo | `compiler` | [src/region/region.ts `attributeValueSpan`](../../../packages/compiler/src/region/region.ts#L89) · [`tagRegion`](../../../packages/compiler/src/region/region.ts#L174) |
| [ ] | 6 | 1 | **`handlerShape`, una sola fuente de verdad.** La clasificación de decisión 96–98 —referencia / llamada / lambda / imposible— sale de `emit/events.ts` a un módulo que `language-core` pueda importar **sin depender del emit**. `eventHandler` y `busHandler` pasan a consumirla; su salida no cambia un byte | `compiler` | `src/binding/handler.ts` *(nuevo)* · [src/emit/events.ts](../../../packages/compiler/src/emit/events.ts#L86-L121) · [src/binding/index.ts](../../../packages/compiler/src/binding/index.ts) |
| [ ] | 7 | — | **Los valores de atributo entran en el walk.** `TreeVisitor` gana `binding(expr, attr, el)`, que dispara por cada `RazorExpression` en valor de atributo —incluido el nombre expresión de `bus:(…)`—. Es lo que permite que un batch registre esos fragmentos sin duplicar la travesía, y de paso lo que cualquier analizador futuro necesita para mirar un valor | `compiler` | [src/semantic/walk.ts](../../../packages/compiler/src/semantic/walk.ts#L25-L45) |

## Fase 3 — la proyección: props, eventos y slots (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 8 | 1 | **El punto ofrece solo el contrato.** Global nuevo `declare function $props<T>(p: T): void;` —sin `$GlobalAttrs`—, y `emitProps` reparte: los `property` a `$props<$C0>({…})`, los planos a `$attrs<{}>({…})`. El segundo se emite **siempre**, porque las anclas de hueco se mudan a él (decisión (b) del BUG §4.0). El ancla del `.` vacío y la de `emitKey` no cambian de forma, solo de literal | `language-core` | [src/globals.ts](../../../packages/language-core/src/globals.ts#L50-L60) · [src/template/attrs.ts `emitProps`](../../../packages/language-core/src/template/attrs.ts#L131-L171) |
| [ ] | 9 | 8 | **La prop que falta, sobre el nombre del tag.** `type $Missing<T, K>` = las claves requeridas de `T` que `K` no nombra, y `declare function $required<T, K extends PropertyKey>(rest: $Missing<T, K>): void;`. Por host se emite `$required<$C0, 'a' \| 'b'>(⟨{}⟩)`, con el `{}` como **un solo tramo** `DIAGNOSTIC_ONLY_CAPS` sobre el span del nombre del tag — que es lo único que hace que el error mapee de vuelta (§2.1). Sin props escritas, `K` es `never` | `language-core` | [src/globals.ts](../../../packages/language-core/src/globals.ts) · [src/template/attrs.ts](../../../packages/language-core/src/template/attrs.ts#L131) *(`tagSpan` ya existe)* |
| [ ] | 10 | 3 | **El punto colgante se copia.** Donde un `RazorExpression` traiga `dangling`, la copia de la expresión se alarga con ese punto bajo `COMPLETION_ONLY_CAPS`. `$text(data.);` es sintaxis incompleta a propósito: TypeScript se recupera, contesta los miembros, y el «Identifier expected» cae en un tramo sin `verification`. Vale igual en contenido y en valor de atributo, porque las dos pasan por aquí | `language-core` | [src/template/expr.ts `copyExpression`](../../../packages/language-core/src/template/expr.ts#L21) |
| [ ] | 11 | 6, 7 | **El handler que es una llamada.** `EmitJs` gana `ast(at)`; `ownBatch` registra los valores de binding con el walk de la 7, y el servidor le pasa el suyo (tarea 14). Con eso, `emitBehaviour` pregunta `handlerShape` y proyecta `$on('click', ($event) => onClick($event))` para la llamada, y copia tal cual las otras tres formas. `$event` **no se declara en ningún `.d.ts`**: es el parámetro del arrow y su tipo lo pone `$on` — con `as never` en el evento con guion y en `bus:`, ahí `$event` es `never` y sigue sin dar error | `language-core` | [src/emit.ts `EmitJs`, `ownBatch`](../../../packages/language-core/src/emit.ts#L35-L107) · [src/template/attrs.ts `emitBehaviour`](../../../packages/language-core/src/template/attrs.ts#L254-L319) · [src/template/context.ts](../../../packages/language-core/src/template/context.ts) *(el contexto lleva el `ast`)* |
| [ ] | 12 | — | **El `slot` es del padre.** `emitIntoSlot` sale de `emitProps` y pasa a mirarse en **todo** elemento, con el tag del padre: `$intoSlot<$S_padre>('meta')`, y `never` cuando no hay padre componente. El nombre se proyecta 1:1 con `LITERAL_NAME_CAPS` —comillas como andamiaje— y `slot=""` recibe el ancla de dos caracteres de `emitEventName`. `emitContent`/`emitElement` pasan a llevar el tag del host | `language-core` | [src/template/attrs.ts `emitIntoSlot`, `isSlot`](../../../packages/language-core/src/template/attrs.ts#L198-L233) · [src/emit-client.ts `emitContent`, `emitElement`](../../../packages/language-core/src/emit-client.ts#L121-L163) |

## Fase 4 — el servidor: quién contesta y quién acompaña (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 13 | 1 | **El `@` en texto deja de tapar a TypeScript.** La rama de `directiveContextAt` se muda al plugin **adicional** —el de BUG-15 §4.6, que pasa a llamarse `createFudicAdditiveService` y ya trae `isAdditionalCompletion` en la instancia—, así que en `@\|` conviven los cuatro snippets y los identificadores en ámbito. Las cuatro ramas exactas (href, `@section`, `class:`, punto/arroba) **no se tocan**: ahí contestar solo es lo correcto | `language-server` | [src/services/plugin.ts `completions`](../../../packages/language-server/src/services/plugin.ts#L490-L494) y [`createFudicTagService`](../../../packages/language-server/src/services/plugin.ts#L158) |
| [ ] | 14 | 7, 11 | **El batch del servidor registra los valores.** `batchDocumentJs` usa el `binding` del walk además de `interpolation`, expone `ast(span)` y se lo pasa al emisor por `EmitJs`. Sin esto el servidor abriría un segundo batch —que es la regla de oro rota justo en el proceso que más teclea | `language-server` | [src/js-batch.ts](../../../packages/language-server/src/js-batch.ts#L46-L76) · [src/virtual-code.ts](../../../packages/language-server/src/virtual-code.ts) *(donde se arma `EmitJs`)* |
| [ ] | 15 | 6 | **`FUD0291` en Problems.** El valor de evento imposible solo lo ve el build, porque la regla vive en el emit. Con `handlerShape` extraída, un analizador la aplica en el pase semántico y el editor lo enseña donde el usuario está escribiendo | `compiler` · `language-server` | `src/semantic/analyzers/event-handler-shape.ts` *(nuevo)* · [src/semantic/analyze.ts](../../../packages/compiler/src/semantic/analyze.ts) · [services/compiler-diagnostics.ts](../../../packages/language-server/src/services/compiler-diagnostics.ts) |

## Fase 5 — el build: los mismos errores sin editor (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 16 | — | **`Prop.optional`.** Leer el argumento de tipo de `props<T>()`: si es un literal de tipo, cada miembro dice si lleva `?`. Si no lo es (`props<Foo>()`), todas se marcan `optional: true` — no se puede demostrar lo contrario, y un build no inventa errores. La decisión 68 hace que el literal sea la forma canónica, así que el caso cubierto es el que se escribe | `compiler` | [src/emit/oxc-code.ts `Prop`, `codeOf`](../../../packages/compiler/src/emit/oxc-code.ts#L20-L24) |
| [ ] | 17 | 16 | **La registry contesta por las props.** `ComponentRegistry` gana `propsOf(tag)` opcional. En el build lo sirve el `ComponentGraph` —que ya tiene el `ResolvedComponent` del hijo y su `codeOf`—; en el servidor, el índice de workspace, o nada: `undefined` es una respuesta legítima y significa «no lo puedo saber» | `compiler` · `vite` · `language-server` | [src/semantic/model.ts](../../../packages/compiler/src/semantic/model.ts#L30-L32) · [src/emit/resolve.ts](../../../packages/compiler/src/emit/resolve.ts) · [src/emit/parts.ts](../../../packages/compiler/src/emit/parts.ts#L41) · [services/compiler-diagnostics.ts `registryOf`](../../../packages/language-server/src/services/compiler-diagnostics.ts#L20) |
| [ ] | 18 | 17 | **Tres diagnósticos nuevos.** `FUD0197` prop requerida no pasada (sobre el tag de apertura), `FUD0198` `.prop` que el hijo no declara (sobre el nombre), `FUD0199` `slot=` que el padre no declara (sobre el valor). Analizador propio, no una rama dentro del emit: el pase semántico es donde vive una regla, y así el editor los enseña con los otros. Reservados en el hueco `FUD0197`–`FUD0209` que SDD-12 dejó libre | `compiler` | `src/semantic/analyzers/component-props.ts` *(nuevo)* · `src/semantic/analyzers/slot-name.ts` *(nuevo)* · [src/semantic/analyze.ts](../../../packages/compiler/src/semantic/analyze.ts) |

## Fase 6 — herramientas: que la forma nueva se escriba sola (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 19 | 4 | **El formateador imprime sin comillas** un valor que es **una sola** expresión Razor: `.prop=@name`, `@click=@onClick($event)`. Todo lo demás conserva sus comillas —una concatenación, un literal, un valor vacío—, y el atributo sin partes se sigue copiando verbatim. Idempotente, y con un test de ida y vuelta sobre las fixtures | `formatter` | [src/print/tag.ts `printAttribute`, `quoteFor`](../../../packages/formatter/src/print/tag.ts#L17-L56) |
| [ ] | 20 | 4 | **Los `.fud` del repo, migrados.** `examples/basic`, las fixtures de `compiler`, las de `language-server` y las de `vscode`, y las plantillas del CLI, pasan a `.prop=@x` y a `@evento=@h($event)`. **Los goldens de nivel 1 no se mueven un byte**: el AST es el mismo. Va antes que la 19 en el tiempo aunque no dependa de ella — migrar después de que el formateador imprima deja los diffs mezclados | `examples` · `compiler` · `language-server` · `vscode` · `cli` | `examples/basic/src/**/*.fud` · `packages/compiler/fixtures/*.fud` · `packages/language-server/test/**` · `packages/vscode/fixtures/**` · `packages/cli/templates/*.fud` |
| [ ] | 21 | 4 | **El resaltado.** La gramática TextMate colorea hoy el valor de atributo como cadena entre comillas; con la 4 hay valores que no las llevan. Regla nueva para `=@` seguido de cadena implícita, y la llamada dentro de ella como expresión | `vscode` | [syntaxes/fudic.tmLanguage.json](../../../packages/vscode/syntaxes/fudic.tmLanguage.json) · `test/` *(el runner de tmLanguage ya existe)* |
| [ ] | 25 | 17, 20 | **El tag se expande con sus props requeridas.** `tagItems` deja de escribir `<app-button>$0</app-button>` y escribe un tabstop por prop **requerida**, en el orden en que el hijo las declara: `<app-button .label="$1">$0</app-button>`. Las opcionales no entran —doce tabstops es peor que ninguno— y se alcanzan con el punto. Sin `propsOf` (componente fuera del índice, o `props<Foo>()` con tipo con nombre), el cuerpo es el de hoy: degradar es no ofrecer de más | `language-server` | [src/services/tags.ts `componentTags`](../../../packages/language-server/src/services/tags.ts) · [src/services/plugin.ts `tagItems`](../../../packages/language-server/src/services/plugin.ts#L522) · [src/workspace-index.ts](../../../packages/language-server/src/workspace-index.ts) |
| [ ] | 22 | 20 | **Los snippets, a la forma nueva.** Los cuerpos que insertan bindings pasan a `=@…`, y el snippet de evento a `@click=@${1:handler}($event)`. Un snippet que inserta la forma vieja enseña la forma vieja | `language-server` | [src/services/snippets.ts](../../../packages/language-server/src/services/snippets.ts#L247-L360) |

## Fase 7 — cierre (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 23 | todas | **La documentación, que aquí es contrato.** Decisiones **100–104** en la gramática, con la 99 retirada, la 29 precisada y la 8 con su excepción; SDD-23 §4.4 con los dos literales, el `$required`, el punto colgante y el handler diferido; SDD-24 §4.2 con el reparto nuevo de completados y **§6.3 corregido** (el hueco ofrece globales, no props); SDD-12 con `FUD0197`–`FUD0199`; props-spec §2 con quién comprueba lo requerido y dónde | — | [docs/gramar/gramatica-v1-decisiones.md](../../gramar/gramatica-v1-decisiones.md) · [SDD-23](../SDD-23-emisor-ts-virtual.md) · [SDD-24](../SDD-24-language-server.md) · [SDD-12](../SDD-12-semantica.md) · [props-spec.md](../props-spec.md) |
| [ ] | 24 | 23 | **Cierre.** `pnpm typecheck`, `pnpm test` y `pnpm build` verdes en el workspace entero, con el `.vsix` y los E2E de Playwright sobre el `dist` prerenderizado. `language-core` y `language-server` al **100 %** en las cuatro métricas; `compiler` no baja. Los 22 criterios de §6 verdes, y los siete tests de la tarea 1 —los que se vieron fallar— en verde. BUG-23 a `Hecho` en [INDEX.md](./INDEX.md), tabla y grafo | — | [INDEX.md](./INDEX.md) · [BUG-23](./BUG-23-arroba-valvula-de-escape.md) |

---

## Ficheros existentes que se tocan, y por qué

| fichero | qué cambia | por qué |
|---|---|---|
| [compiler/src/at/at.ts](../../../packages/compiler/src/at/at.ts) | la expresión implícita pasa a cadena; `dangling`; `ImplicitOptions` se borra | es **la** línea del BUG: sin cadena, `@( … )` sigue siendo la válvula de escape |
| [compiler/src/lexer/lexer.ts](../../../packages/compiler/src/lexer/lexer.ts) | tras `=`, un `@` abre un átomo en vez de texto | `FUD0056` se comía `.prop=@name` antes de que nadie lo mirara |
| [compiler/src/html/parser.ts](../../../packages/compiler/src/html/parser.ts) | `#parseUnquotedValue` acepta el átomo; `#attributeAtom` pierde `call` | la decisión 99 desaparece dentro de la 100 |
| [compiler/src/emit/events.ts](../../../packages/compiler/src/emit/events.ts) | delega la clasificación en `handlerShape` | editor y build tienen que decidir la forma con la misma función, o vuelven a discrepar |
| [compiler/src/semantic/walk.ts](../../../packages/compiler/src/semantic/walk.ts) | visitor `binding` | los valores de atributo no eran alcanzables sin recorrer el árbol otra vez |
| [compiler/src/semantic/model.ts](../../../packages/compiler/src/semantic/model.ts) | `propsOf(tag)` | `has(tag)` no basta para saber si falta una prop requerida |
| [compiler/src/emit/oxc-code.ts](../../../packages/compiler/src/emit/oxc-code.ts) | `Prop.optional` | el `?` está en `T` y hasta hoy no lo leía nadie |
| [language-core/src/globals.ts](../../../packages/language-core/src/globals.ts) | `$props`, `$required`, `$Missing` | el punto ofrecía el vocabulario de HTML porque el literal era uno solo |
| [language-core/src/template/attrs.ts](../../../packages/language-core/src/template/attrs.ts) | dos literales, el ancla de completitud, el handler diferido, el slot del padre | cuatro de los siete síntomas viven en este fichero |
| [language-core/src/template/expr.ts](../../../packages/language-core/src/template/expr.ts) | copia el punto colgante | es el único sitio por donde pasan todas las expresiones |
| [language-core/src/emit-client.ts](../../../packages/language-core/src/emit-client.ts) | el recorrido lleva el tag del host | una ranura la declara el padre, y el emisor no sabía quién era |
| [language-core/src/emit.ts](../../../packages/language-core/src/emit.ts) | `EmitJs.ast` | preguntar la forma de un handler exige AST, y el batch ya existe |
| [language-server/src/js-batch.ts](../../../packages/language-server/src/js-batch.ts) | registra los valores de binding | dos batches por pulsación es la regla de oro rota donde más duele |
| [language-server/src/services/plugin.ts](../../../packages/language-server/src/services/plugin.ts) | la directiva se muda al plugin aditivo | una lista no vacía en un plugin exclusivo silencia a TypeScript |
| [formatter/src/print/tag.ts](../../../packages/formatter/src/print/tag.ts) | valor de una sola expresión, sin comillas | el formateador reponía las comillas que el autor acaba de quitar |
| [vscode/syntaxes/fudic.tmLanguage.json](../../../packages/vscode/syntaxes/fudic.tmLanguage.json) | valor sin comillas | sin regla, la forma nueva se ve como texto plano |
