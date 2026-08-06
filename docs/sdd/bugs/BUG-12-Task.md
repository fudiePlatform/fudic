# BUG-12 — Tareas

> **BUG:** [BUG-12 — Un hijo que recibe un valor no tiene canal de actualización](./BUG-12-sin-canal-de-update.md)
> **Paquetes:** `@fudic/core` · `@fudic/compiler` · **Rama:** `fix/bug-12-update-de-props`
> **Progreso:** 17 / 19

Cada tarea es un paso cerrado: se implementa, se verifica y se marca. Ninguna depende de
tareas posteriores. Las rutas son relativas a la raíz del repo.

**Tres cosas que la implementación cierra y la spec dejaba abiertas** (la Fase 4 las escribe
en el BUG):

1. **El padre manda el payload ENTERO del hijo**, no solo el hueco del `.prop` que se movió.
   `u` reasigna *todas* las props que destructura, así que un array parcial devolvería a su
   default las que no viajan y `$a()` las repintaría. El padre resuelve el orden de props del
   hijo desde su AST y rellena también los atributos estáticos del host.
2. **`$a()` cachea lo último que escribió** (`$w`) y no toca el DOM si el valor no cambió. Sin
   eso, un componente de diez props repinta diez nodos cada vez que se mueve una signal: el
   `Object.is` de la signal evita la *llamada*, no las escrituras. Es la tarea **10b**.
3. **El e2e dispara el click con un listener de `document`** declarado en el `@client` del
   fixture padre. Los event bindings no están emitidos —este BUG va antes que ellos— y un
   click dentro de un shadow root es `composed`, así que llega a `document`: la cadena que el
   test recorre sigue siendo código emitido de punta a punta.

---

## Fase 0 — Rojo primero (5)

- [x] **1. Test extremo a extremo del contador.**
      Con el arnés de `packages/compiler/test/emit/hydrate/_harness.ts`: dos fixtures nuevos
      —padre con `signal` + `@click`, hijo con `props<{ value: number }>()` y `.value="@count"`
      en el host— compilados, renderizados por SSR e hidratados sobre DOM real; un click cambia
      el texto dentro del shadow del hijo. **Verlo fallar** (§6.7). Es el test que define el BUG:
      si no falla hoy, el diagnóstico está mal.
      → `packages/compiler/test/emit/hydrate/update.test.ts`; los fixtures son en memoria, para
      no mover los goldens de `fixtures/`.
- [x] **2. Test de `u` en `FudicElement`.**
      En `packages/core/test/element.test.ts`: `u` reenvía el array al controlador tras `h` y
      tras `c`; no lanza sin alta previa; no lanza ni alcanza al controlador tras
      `disconnectedCallback`. **Verlo fallar** (§6.1, §6.2).
- [x] **3. Test de forma del chunk emitido.**
      En `packages/compiler/test/emit/client.test.ts`: el chunk de un componente con prop
      interpolada declara `const $a = `, tiene entrada `u:`, `c` y `u` llaman a `$a()`, el cuerpo
      de `h` **no**; el patrón de asignación de `u` deja los dos primeros huecos vacíos y conserva
      los defaults. **Verlo fallar** (§6.3, §6.4).
- [x] **4. Test del lado del padre.**
      Mismo fichero: un host de componente con `.value="@count"` sobre una signal emite en `$s()`
      el pase inicial con `peek()` y una suscripción que llama a `u`, con disposer en `$d`.
      **Verlo fallar** (§6.5).
- [x] **5. Test de colisión de namespace.**
      Mismo fichero, con `inlineChunk`: un componente cuyo `@client` declara `const s = signal(0)`
      y `const m = 2` produce un chunk **parseable** (`new Function` sobre el cuerpo sin los
      `import`). **Verlo fallar** con `SyntaxError: Identifier 'm' has already been declared`
      (§6.10) — reproducido ya sobre `packages/compiler/dist`, y sin ningún diagnóstico.

## Fase 1 — El contrato en `@fudic/core` (2)

- [x] **6. `Controller` gana `u`.**
      Modificar `packages/core/src/controller.ts` (§3.1): `u(props: readonly unknown[]): void`
      entre `h` y `r`. Sustituir el párrafo *«There is no `u` (update)…»* (líneas 18-20) por el
      porqué de que sí lo haya —el valor cruza, la signal no— con enlace a este BUG. El párrafo
      es la causa raíz escrita en el código: dejarlo sería dejar el defecto documentado como
      diseño.
- [x] **7. `FudicElement` gana el punto de entrada.**
      Modificar `packages/core/src/element.ts` (§3.2): `u(props)` reenvía a `#controller`, con
      la guarda `null` de `disconnectedCallback`. Documentar que es el **tercer** punto de
      entrada externo (no un callback) y que la ausencia de buffer es deliberada: la cascada
      post-orden de SDD-17 §5 garantiza el subárbol upgradeado antes de que corra el handler
      del host. Verde en 2.

## Fase 2 — El factory emitido (5)

> Va **antes** que las fases 3-5 y en este orden: el renombrado toca las mismas líneas que la
> extracción de `$a()`, y hacerlo después obligaría a regenerar los goldens dos veces.

- [x] **8. `m` → `$m`, `s` → `$s`.**
      Modificar `packages/compiler/src/emit/client.ts:75-78` y sus llamadas en los cuerpos de
      `c` y `h` (§2.5, §3.5). Es el arreglo de la colisión: mete los nombres del emit dentro de
      la reserva `$` de SDD-15 §4.7, en vez de reservarle al usuario tres letras más. Verde en 5.
- [x] **9. `destructuring()` gana la forma de asignación.**
      Modificar `packages/compiler/src/emit/client.ts:34-37` (§3.3): sobre la misma lista de
      `Prop`, una segunda forma sin `let` y con los dos primeros huecos vacíos, defaults
      incluidos. Verde en la parte de 3 que mira el patrón.
- [x] **10. `$a()`: las escrituras de valor salen del cuerpo de fabricación.**
      Modificar `packages/compiler/src/emit/markup-client.ts` para llevar a un tercer
      `CodeWriter` cada escritura que dependa de una expresión —`setText` de un run interpolado,
      `setAttr` de un atributo con interpolación o `class:`—, dejando en el cuerpo de `c` la
      creación del nodo. Emitir `const $a = () => { … }` en `client.ts` junto a `$m` y `$s`, y
      llamarla desde `c` **antes** de `$m()`.
      → Dos cosas que la tarea no decía y el código pedía: (a) un `@if` que envuelve una
      escritura replica su condición en `$a()`, porque el nodo no existe si la rama no pintó;
      (b) dentro de un `@foreach` la escritura se queda **fusionada** con la creación del nodo,
      porque la variable del bucle solo guarda el último nodo del turno — actualizar un bucle
      necesita el render de bloque que §7 deja fuera. El reparto fijo/valor vive en `attrs.ts`
      (`ValueSink`), compartido con el servidor para que las dos ramas no se separen.
      → Y el temporal `const $a` de los atributos interpolados pasa a `$v`: dejarlo habría
      sombreado a la closure `$a` dentro de su propio cuerpo. Toca el golden **de servidor**
      `app-button.mjs` (única diferencia ahí).
- [x] **10b. El cache de escritura `$w`.**
      En el mismo `$a()`: cada escritura calcula su valor en `$v`, lo compara con `$w[k]` —lo
      último que esa escritura aplicó— y solo toca el DOM si difiere. `u` reaplica *todas* las
      props porque el array llega entero, así que el filtro tiene que estar por **escritura**:
      sin él, un componente de diez props repinta diez nodos cada vez que se mueve una signal.
      El `Object.is` de `signal.ts:27` evita la llamada, no las escrituras. `$w` y el `let $v`
      solo se emiten cuando hay al menos una escritura.
- [x] **11. La entrada `u` del objeto devuelto.**
      En `client.ts`: `u: ($p) => { <asignación>; $a(); },` entre `h` y `r`. `h` **no** llama a
      `$a()` (§4.3) — el servidor ya pintó esos valores y reimprimirlos gasta INP dentro del
      gesto para no cambiar un byte. Verde en 3.

## Fase 3 — El lado del padre (2)

- [x] **12. Consumir `PropertyBinding` en un host de componente.**
      Modificar `packages/compiler/src/emit/markup-client.ts:233-238`: la rama de componente deja
      de saltar los atributos y clasifica los suyos. Por cada `PropertyBinding` cuyo valor sea
      una signal del padre, emitir en `$s()` el pase inicial y la suscripción de §3.4, con el
      disposer en `$d`. Es el primer lector de `PropertyBinding`
      (`packages/compiler/src/binding/nodes.ts:46`): hoy no lo consume ningún emisor.
      → El array es el payload **entero** del hijo, en el orden en que él destructura: los
      `.prop` y también los atributos planos del host, que es lo mismo que `componentPropsExpr`
      manda por SSR. Los huecos que el padre no nombra se quedan vacíos y los finales ni se
      escriben. Con varias signals sale una suscripción por signal, y cada una recompone el
      array entero: la que notifica pone el valor que le dan, las demás se leen con `peek()`.
      → El parámetro del callback es `$v`, no `v` como en §3.4: el array que lo rodea es código
      del autor, y un `v` suyo quedaría sombreado. Cumple el invariante de §5.
      → El orden de props del hijo obliga a leer su `@code`; `client.ts` memoiza `extractCode`
      en un `WeakMap` sobre el `ResolvedComponent` para que Oxc siga siendo uno por fichero.
- [x] **13. Distinguir signal de valor constante.**
      La discriminación no es heurística: `extractCode` ya devuelve `signals` con los nombres de
      cada `const x = signal(...)` del componente (`packages/compiler/src/emit/oxc-code.ts`). Un
      valor que es `Identifier` y está en esa lista → canal reactivo; cualquier otra cosa → no
      emite nada, la prop es constante y vive en el HTML (decisión 75 intacta). Verde en 4 y §6.6.

## Fase 4 — Las specs que decían lo contrario (3)

- [x] **14. SDD-15 §3.7 y §7.**
      Modificar `docs/sdd/SDD-15-emit.md`: el párrafo *«No hay `u` (update) en esta interfaz»*
      (línea 296) pasa a describir `u` **de valor** —reasignar y reaplicar— y a mantener fuera
      solo `u` con recomposición estructural; el bullet correspondiente de §7 se ajusta igual.
      Actualizar el bloque de código de la interfaz `Controller`.
- [x] **15. SDD-15 §4.6 y §4.7 — el namespace.**
      Mismo fichero: el ejemplo del factory de §4.6 pasa a `$m`/`$s`/`$a`, y §4.7 deja escrito
      que la reserva `$` obliga **también al emit**, con la colisión de §2.5 como el porqué. Es
      la mitad de la corrección que impide que vuelva a pasar: sin esto, la próxima función
      privada nace otra vez sin prefijo.
- [x] **16. Derogar la decisión 76 de props-spec.**
      Modificar `docs/sdd/props-spec.md`: la 76 (*«prop reactiva → setter en el hijo»*) queda
      **derogada** por `u`, con el porqué (§4.1) y enlace a este BUG; ajustar los ejemplos
      emitidos de §4.1, §4.2 y la fila de la tabla del índice de decisiones. Las 74, 75, 77, 78
      y 84 se quedan como están — este BUG las **cumple**, no las cambia.
      → De la 75 se conserva la decisión y se precisa el enunciado: «constante» significa que el
      **padre no emite nada** por ella, no que el hijo la declare `const` — el destructuring del
      factory es uno solo y con `let`, porque `u` reasigna el array entero. Y donde la 84 y §4.4
      decían «baja el valor por el setter» ahora dicen «por `u`»: mismo contrato, el nombre del
      canal que ya no existe.
      → Este BUG también se actualiza a sí mismo: §3.3.b (`$w`), §3.3.c (`@foreach`), §3.4 (el
      payload entero) y §6.12-13 no estaban escritos.

## Fase 5 — Cierre técnico (2)

- [ ] **17. Goldens regenerados y revisados a mano.**
      `packages/compiler/test/emit/__golden__/{app-badge,app-card,app-button}.client.mjs`. Las
      únicas diferencias esperadas son el renombrado `$m`/`$s`, la salida de las escrituras de
      valor a `$a()` (con su `$w`) y la entrada `u`. Cualquier otra es un fallo de la Fase 2, no
      un golden que actualizar (§6.11). Más una en el golden de **servidor** `app-button.mjs`:
      el temporal `$a` de los atributos interpolados pasa a `$v` (tarea 10).
      → Regenerados ya en la Fase 2, donde nació el cambio; aquí solo se confirma que no se ha
      movido nada más.
- [ ] **18. Regresiones y cobertura.**
      `equivalence.test.ts` verde **sin tocarlo** (§6.8) y un `u` posterior a `r()` que no
      resucita nodos (§6.9). `@fudic/core` sigue al 100 % en las cuatro métricas; `client.ts` y
      `markup-client.ts` no bajan de ramas.

---

## Cierre del BUG

- [ ] `pnpm typecheck`, `pnpm test` y `pnpm build` en verde.
- [ ] El criterio §6.7 —el click del padre cambiando el texto del hijo— verde sobre DOM real.
- [ ] Marcar BUG-12 como `Hecho` en [INDEX.md](./INDEX.md) (tabla + registro de progreso).
- [ ] Anotar en [SDD-15-Task](../SDD-15-Task-fudic-element-y-emit-de-cliente.md) que el contrato
      del controlador cambió antes de las tareas pendientes de event bindings, y que las closures
      privadas se llaman `$m`/`$s`/`$a`.
