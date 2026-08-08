# SDD-30 — Tareas · Renders de bloque

> **SDD:** [SDD-30 — Renders de bloque](./SDD-30-renders-de-bloque.md)
> **Paquetes:** `@fudic/compiler` (emit de cliente, parser de la key)
> **Rama:** `sdd-30-renders-de-bloque`
> **Progreso:** 15 / 21

Convierte los cinco constructos de control —`@if`, `@switch`, `@for`, `@foreach`, `@while`— de
markup aplanado en `c`/`h` a **funciones de bloque** con vida propia. Va **antes** que los event
bindings: el `s()` de un bloque es donde se enganchan, y ese `s()` lo crea esta tanda.

Cada tarea es un paso cerrado: se implementa, se verifica y se marca. Ninguna depende de tareas
posteriores.

---

## Los tres hitos

**Hito A — la key entra en la gramática.** Sintaxis nueva (`key (…)` tras la cabecera),
obligatoria en los tres constructos que iteran, prohibida en los dos que no. Es lo único de esta
tanda que toca el **parser**; todo lo demás es emit.

**Hito B — un bloque es una función.** Firma `($parent, $anchor, …deps)`, interfaz
`{key, c, h, m, s, u, move, r}`, declarada dentro de la closure del factory. Con ella caen de
golpe los tres defectos de SDD-30 §1: captura por iteración, teardown incompleto y `u` que no
alcanza el interior de un bucle.

**Hito C — la reconciliación.** Crear, modificar, eliminar y reordenar por key, sin marcadores
en el DOM.

**Fuera de esta tanda:** event bindings y bus (van detrás, en su propio doc), `data-id` y los
cuatro mapas de página, `FUD0290`, y el recorte de dependencias por uso real.

---

## Fase 1 — La key en la gramática (4)

- [x] **1. Decisiones 91–95 en el doc de gramática.**
      Modificar `docs/gramar/gramatica-v1-decisiones.md`: la sección 6 (control de flujo) gana la
      key —dónde va, por qué no en el elemento raíz, por qué no dentro del paréntesis, en qué
      constructos es obligatoria y en cuáles es error— y el índice de decisiones al final gana
      sus cinco filas. Es el documento que fija la sintaxis; el SDD la implementa.
- [x] **2. `key (…)` en el parser de control de flujo.**
      Modificar SDD-06 (`packages/compiler/src/control/`): tras cerrar el `)` de la cabecera y
      antes del `{` del cuerpo, aceptar `key` seguido de un grupo balanceado. El contenido es un
      fragmento `expression` más, con su `Span`, registrado en el mismo `JsBatch`: **Oxc se sigue
      invocando una vez por fichero**. El nodo gana un campo `key?: RazorExpression`; los cinco
      tipos de nodo lo declaran, y los dos que no iteran lo declaran para poder diagnosticarlo.
- [x] **3. `FUD0540`, `FUD0541`, `FUD0542`.**
      Bucle con markup y sin key; key vacía, sin paréntesis o sin cerrar; key en `@if`/`@switch`.
      Los tres con el span de la cabecera y **sin abortar** —el emit no lanza (§5)—. El catálogo
      consolidado de SDD-12 gana el rango `FUD0540`–`FUD0569`.
      **`FUD0543` se movió a la tarea 6**: su regla —«la cabecera no declara ningún binding»— se
      decide sobre el `ObjectPattern`/`ArrayPattern` del AST de Oxc, que es exactamente lo que la
      tarea 6 construye. En el parser solo cabría como heurística sobre el texto del header.
- [x] **4. Tests del parser y de los diagnósticos.**
      Las tres formas (`@foreach`/`@for`/`@while`) con key, el `@for` clásico cuyo header lleva dos
      `;` y **no** se parte, la key con destructuring en la cabecera (`{ id, name }` → la key ve
      `id`), y los diagnósticos con su span exacto.

## Fase 2 — El bloque como función (6)

- [x] **5. Análisis de scope sobre los fragmentos de un bloque.**
      Nuevo `packages/compiler/src/emit/scope.ts`: dado el conjunto de fragmentos JS del cuerpo de
      un bloque, devolver sus **referencias libres**. Es análisis real sobre el AST de Oxc, no
      recolección de `Identifier`: hay que distinguir referencia de declaración y de clave de
      propiedad (`obj.a` no referencia `a`), y descender por los scopes que el propio fragmento
      abre (una arrow dentro de un handler declara sus parámetros). Nace al 100 % de cobertura.
- [x] **6. La lista de dependencias, y `FUD0543`.**
      Sobre lo anterior: restar lo que el bloque declara —el patrón de la cabecera, vía
      `ObjectPattern`/`ArrayPattern`, más lo que declare un `@{ … }` interno— y lo que **no puede
      cambiar de valor** —un binding `const` o `function` del `@code { @client }` sin ninguna
      asignación—. Orden determinista: cabecera primero en orden del patrón, externas después en
      orden de primera aparición. La regla puede pasar de más y **no puede quedarse corta**: es
      la propiedad que se testea, no el tamaño de la lista.
      Con los bindings de la cabecera en la mano cae `FUD0543`: un `@foreach`/`@for` que no
      declara ninguno, con el span de la cabecera (`@while` queda fuera, §3.5).
- [x] **7. El emisor de bloques.**
      Nuevo `packages/compiler/src/emit/block.ts`: dado un nodo de control, escribir el
      `const $bN = ($parent, $anchor, …) => {…}` con sus seis cuerpos (`c`, `h`, `m`, `s`, `u`,
      `move`, `r`) y su `key`. Reutiliza el `ClientMarkupEmitter` para el markup del cuerpo —el
      cuerpo de un bloque es markup como cualquier otro— pero con **sus propias** variables de
      nodo, su `$d`, su `$w` y su `$a`.
- [x] **8. El cursor entra y sale.**
      `h(cursor)` recibe el cursor del nivel y devuelve el avanzado; un bloque que no pinta lo
      devuelve **sin tocar**. El padre lo encadena. Es lo que mantiene alineados los dos caminos
      cuando una condición cierra un bloque, y lo que hace que `@if`/`@foreach` dejen de emitirse
      dos veces (una en `fab`, otra en `adopt`) para pasar a emitirse **una** dentro de la función.
- [x] **9. El anchor estático.**
      El anchor de un bloque es la variable del siguiente nodo de su nivel, o `null` → `append`.
      Bloques consecutivos comparten anchor y el orden lo da el orden de inserción. `Dom<N>` no
      se toca: `before` y `append` ya existen.
      **Matiz que salió al implementarlo:** un bloque a nivel raíz se monta más tarde (`$m`),
      y su anchor es una variable que la travesía asigna *después* — leída durante `c` vale
      `undefined`. Por eso `m` admite el anchor de nuevo (`m($ref = $anchor)`) y el montaje
      diferido se lo pasa; §3.2 lo escribía como `m(): void`.
- [x] **10. El ancla del caso que la forma exige.**
      Detectar estáticamente el único caso que el anchor no resuelve —dos runs de texto
      **interpolados** separados solo por un bloque— y emitir ahí un comentario vacío. Es el hueco
      que la tarea 10 de la primera tanda de cliente dejó anotado sin resolver; se cierra aquí y
      **solo** aquí: en cualquier otra forma no se emite marcador ninguno.

## Fase 3 — El padre y la reconciliación (5)

- [x] **11. El registro de bloques vivos.**
      Por constructo, un `let $kN = []` en la closure del factory. Un `@if` lo usa con cero o un
      elemento: no hay dos mecanismos. `r()` del componente lo recorre —y es lo que arregla el
      teardown de las N−1 filas que hoy quedan colgadas.
- [x] **12. `c` y `h` del padre delegan.**
      En `c`: fabricar la instancia, `c()`, `m()`, `s()`, y guardarla. En `h`: fabricar la
      instancia con anchor `null`, encadenar el cursor por `h()`, `s()`, y guardarla. El markup
      del bloque desaparece de los cuerpos del padre.
- [x] **13. `$uN` — la reconciliación por key.**
      Los tres casos de §4.4: hit → `u` con las dependencias nuevas; miss → `c`+`m`+`s`; lo que
      sobra del mapa anterior → `r()`. Key duplicada: gana la primera aparición, la segunda es una
      fila nueva, sin diagnóstico (depende de los datos).
      **Bug corregido al ejecutarlo:** el índice no puede construirse con `new Map($kN.map(…))`.
      De dos keys iguales un `Map` se queda con la última —regla contraria a §4.4— y la instancia
      que pierde la plaza deja de estar en ninguna estructura, así que nadie llama a su `r()`:
      nodos y disposers se quedaban detrás, un juego por `u`. Se llena a mano y las repetidas van
      a la lista de retirados. §4.4 del SDD queda alineado con su propio párrafo.
- [x] **14. Reordenado con `move`.**
      De atrás hacia delante, cada bloque ante el que le sigue; `move` devuelve el **primer** nodo
      del bloque para encadenar, y un bloque que no pintó devuelve la referencia sin tocar. Cero
      marcadores: el ancla de cada paso es el nodo que se acaba de colocar.
- [x] **15. `@if` y `@switch`: cambio de rama.**
      Misma rama → `u` de la instancia viva. Rama distinta → `r()` de la vieja, `c`+`m`+`s` de la
      nueva. Cada rama es **su propio** bloque, con su función y su lista de dependencias: dos
      ramas no comparten ni nodos ni firma.

## Fase 4 — Lo que esto desbloquea (2)

- [ ] **16. `$a()` dentro de un bloque: cerrar BUG-12 §3.3.c.**
      Los nodos de una instancia de bloque **sí** son estables, así que la escritura de valor
      dentro de un bucle sale a `$a()` con su `$w`, como fuera. `h` sigue sin llamar a `$a()`
      (BUG-12 §4.3). Marcar el §3.3.c de
      [BUG-12](./bugs/BUG-12-sin-canal-de-update.md) como resuelto por este SDD.
- [ ] **17. Props a un hijo N3 creado dentro de un bloque.**
      El `s()` del bloque emite el pase inicial y la suscripción con la forma de BUG-12 §3.4, y su
      `r()` da de baja el disposer. Cierra el pendiente que BUG-12 §7 dejó con nombre: *«necesita
      el render de bloque que aún no existe»*.

## Fase 5 — Verificación (3)

- [ ] **18. Los criterios de forma (§6.1–§6.6) sobre el texto emitido.**
      Una función por bloque con la interfaz completa; la firma exacta del ejemplo de §3.3
      (`pick` fuera por `const`, `rows` fuera por ser de la cabecera); orden determinista al
      recompilar; anidamiento heredando las variables de todos los ancestros; ningún marcador
      salvo el de §3.4; y la reserva `$` respetada salvo en los parámetros de dependencia, que
      son nombres del autor.
- [ ] **19. Los criterios de comportamiento (§6.11–§6.19) en el arnés.**
      Sobre DOM real, en `test/emit/hydrate/`: captura por iteración disparando en orden **no
      secuencial** (el test que hoy falla y motiva el SDD); teardown de las N filas, no de la
      última; `u` que escribe en una fila y solo en esa; los tres casos de reconciliación;
      **estado que sobrevive al reordenado** —un `<input>` escrito a mano conserva su valor—;
      cambio de rama de `@if`; equivalencia SSR↔cliente con `@if` cerrado, abierto y `@foreach`
      de 0, 1 y N; y el caso del ancla de §3.4 con la condición en los dos valores.
- [ ] **20. Fixtures y goldens.**
      El `@foreach` del repo vive hoy en `home.fud` (una página) y ninguno de los tres componentes
      tiene uno, así que ningún golden de cliente muestra un bloque. Añadir un fixture de
      componente con `@foreach` + key, `@if`/`else` y un `@foreach` anidado; regenerar los
      goldens y **leerlos a mano**. El `@foreach` de `home.fud` necesita su key: es el primer
      sitio donde `FUD0540` se dispara sobre código existente.

## Fase 6 — Cierre (1)

- [ ] **21. Verde, cobertura e índice.**
      `pnpm typecheck`, `pnpm test` y `pnpm build` en la raíz. `scope.ts`, `block.ts` y todo lo
      nuevo al **100 %** en las cuatro métricas; `markup-client.ts` y `client.ts` nacieron al
      100 % y no bajan. Nada de `/* v8 ignore */` para llegar al número. Anotar el avance en
      [INDEX.md](./INDEX.md) y pasar SDD-30 a `Hecho` si los 19 criterios de §6 están verdes.

---

## Lo que esta tanda deja listo para la siguiente

El `s()` de un bloque. Es la razón de que los event bindings vayan **detrás** y no delante: con
los constructos aplanados, el enganche de un `@foreach` no tenía dónde vivir —las variables de
nodo se pisan cada vuelta— y la tanda de eventos habría tenido que inventarse un parche que este
SDD tira entero. Con el bloque como función, un `@click` dentro de un bucle es un `$dom.event`
en el `s()` de la fila, sin ningún caso especial.

## Notas de implementación

- **La key es sintaxis, así que sale del compilador.** Un `.fud` con un bucle sin key deja de
  parsear limpio en TODO el repo, no solo en el emit de cliente: los seis `.fud` con `@foreach`
  (fixtures del compilador, del formateador y `examples/basic`) llevan ya su key.
- **El formateador la imprime** (`printLoop` / `printWhile`) y la manda a formatear como un
  fragmento más. Sin eso, `fudic fmt` borraría la cláusula: un documento con diagnósticos no se
  formatea (SDD-26 §4.6), así que solo llega al printer la key de un bucle **válido**.
- **`@fudic/language-core` la proyecta** como primera sentencia del cuerpo del bucle: es donde
  la key se evalúa (decisión 91), y es lo que le da completado y diagnóstico propios.

## Enlaces

- Criterios de aceptación: los 19 de [SDD-30 §6](./SDD-30-renders-de-bloque.md#6-criterios-de-aceptación).
- Cierra: [BUG-12 §3.3.c y §7](./bugs/BUG-12-sin-canal-de-update.md), y el hueco de anclaje que
  la tarea 10 de
  [SDD-15-Task-fudic-element-y-emit-de-cliente](./SDD-15-Task-fudic-element-y-emit-de-cliente.md)
  dejó documentado.
- Va **antes** de [SDD-15-Task-eventos-y-bus](./SDD-15-Task-eventos-y-bus.md).
