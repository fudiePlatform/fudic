# BUG-11 — Tareas

> **BUG:** [BUG-11 — Un hijo que recibe un valor no tiene canal de actualización](./BUG-11-sin-canal-de-update.md)
> **Paquetes:** `@fudic/core` · `@fudic/compiler` · **Rama:** `fix/bug-11-update-de-props`
> **Progreso:** 0 / 18

Cada tarea es un paso cerrado: se implementa, se verifica y se marca. Ninguna depende de
tareas posteriores. Las rutas son relativas a la raíz del repo.

---

## Fase 0 — Rojo primero (5)

- [ ] **1. Test extremo a extremo del contador.**
      Con el arnés de `packages/compiler/test/emit/hydrate/_harness.ts`: dos fixtures nuevos
      —padre con `signal` + `@click`, hijo con `props<{ value: number }>()` y `.value="@count"`
      en el host— compilados, renderizados por SSR e hidratados sobre DOM real; un click cambia
      el texto dentro del shadow del hijo. **Verlo fallar** (§6.7). Es el test que define el BUG:
      si no falla hoy, el diagnóstico está mal.
- [ ] **2. Test de `u` en `FudicElement`.**
      En `packages/core/test/element.test.ts`: `u` reenvía el array al controlador tras `h` y
      tras `c`; no lanza sin alta previa; no lanza ni alcanza al controlador tras
      `disconnectedCallback`. **Verlo fallar** (§6.1, §6.2).
- [ ] **3. Test de forma del chunk emitido.**
      En `packages/compiler/test/emit/client.test.ts`: el chunk de un componente con prop
      interpolada declara `const $a = `, tiene entrada `u:`, `c` y `u` llaman a `$a()`, el cuerpo
      de `h` **no**; el patrón de asignación de `u` deja los dos primeros huecos vacíos y conserva
      los defaults. **Verlo fallar** (§6.3, §6.4).
- [ ] **4. Test del lado del padre.**
      Mismo fichero: un host de componente con `.value="@count"` sobre una signal emite en `$s()`
      el pase inicial con `peek()` y una suscripción que llama a `u`, con disposer en `$d`.
      **Verlo fallar** (§6.5).
- [ ] **5. Test de colisión de namespace.**
      Mismo fichero, con `inlineChunk`: un componente cuyo `@client` declara `const s = signal(0)`
      y `const m = 2` produce un chunk **parseable** (`new Function` sobre el cuerpo sin los
      `import`). **Verlo fallar** con `SyntaxError: Identifier 'm' has already been declared`
      (§6.10) — reproducido ya sobre `packages/compiler/dist`, y sin ningún diagnóstico.

## Fase 1 — El contrato en `@fudic/core` (2)

- [ ] **6. `Controller` gana `u`.**
      Modificar `packages/core/src/controller.ts` (§3.1): `u(props: readonly unknown[]): void`
      entre `h` y `r`. Sustituir el párrafo *«There is no `u` (update)…»* (líneas 18-20) por el
      porqué de que sí lo haya —el valor cruza, la signal no— con enlace a este BUG. El párrafo
      es la causa raíz escrita en el código: dejarlo sería dejar el defecto documentado como
      diseño.
- [ ] **7. `FudicElement` gana el punto de entrada.**
      Modificar `packages/core/src/element.ts` (§3.2): `u(props)` reenvía a `#controller`, con
      la guarda `null` de `disconnectedCallback`. Documentar que es el **tercer** punto de
      entrada externo (no un callback) y que la ausencia de buffer es deliberada: la cascada
      post-orden de SDD-17 §5 garantiza el subárbol upgradeado antes de que corra el handler
      del host. Verde en 2.

## Fase 2 — El factory emitido (4)

> Va **antes** que las fases 3-5 y en este orden: el renombrado toca las mismas líneas que la
> extracción de `$a()`, y hacerlo después obligaría a regenerar los goldens dos veces.

- [ ] **8. `m` → `$m`, `s` → `$s`.**
      Modificar `packages/compiler/src/emit/client.ts:75-78` y sus llamadas en los cuerpos de
      `c` y `h` (§2.5, §3.5). Es el arreglo de la colisión: mete los nombres del emit dentro de
      la reserva `$` de SDD-15 §4.7, en vez de reservarle al usuario tres letras más. Verde en 5.
- [ ] **9. `destructuring()` gana la forma de asignación.**
      Modificar `packages/compiler/src/emit/client.ts:34-37` (§3.3): sobre la misma lista de
      `Prop`, una segunda forma sin `let` y con los dos primeros huecos vacíos, defaults
      incluidos. Verde en la parte de 3 que mira el patrón.
- [ ] **10. `$a()`: las escrituras de valor salen del cuerpo de fabricación.**
      Modificar `packages/compiler/src/emit/markup-client.ts` para llevar a un tercer
      `CodeWriter` cada escritura que dependa de una expresión —`setText` de un run interpolado,
      `setAttr` de un atributo con interpolación o `class:`—, dejando en el cuerpo de `c` la
      creación del nodo. Emitir `const $a = () => { … }` en `client.ts` junto a `$m` y `$s`, y
      llamarla desde `c` **antes** de `$m()`.
- [ ] **11. La entrada `u` del objeto devuelto.**
      En `client.ts`: `u: ($p) => { <asignación>; $a(); },` entre `h` y `r`. `h` **no** llama a
      `$a()` (§4.3) — el servidor ya pintó esos valores y reimprimirlos gasta INP dentro del
      gesto para no cambiar un byte. Verde en 3.

## Fase 3 — El lado del padre (2)

- [ ] **12. Consumir `PropertyBinding` en un host de componente.**
      Modificar `packages/compiler/src/emit/markup-client.ts:233-238`: la rama de componente deja
      de saltar los atributos y clasifica los suyos. Por cada `PropertyBinding` cuyo valor sea
      una signal del padre, emitir en `$s()` el pase inicial y la suscripción de §3.4, con el
      disposer en `$d`. Es el primer lector de `PropertyBinding`
      (`packages/compiler/src/binding/nodes.ts:46`): hoy no lo consume ningún emisor.
- [ ] **13. Distinguir signal de valor constante.**
      La discriminación no es heurística: `extractCode` ya devuelve `signals` con los nombres de
      cada `const x = signal(...)` del componente (`packages/compiler/src/emit/oxc-code.ts`). Un
      valor que es `Identifier` y está en esa lista → canal reactivo; cualquier otra cosa → no
      emite nada, la prop es constante y vive en el HTML (decisión 75 intacta). Verde en 4 y §6.6.

## Fase 4 — Las specs que decían lo contrario (3)

- [ ] **14. SDD-15 §3.7 y §7.**
      Modificar `docs/sdd/SDD-15-emit.md`: el párrafo *«No hay `u` (update) en esta interfaz»*
      (línea 296) pasa a describir `u` **de valor** —reasignar y reaplicar— y a mantener fuera
      solo `u` con recomposición estructural; el bullet correspondiente de §7 se ajusta igual.
      Actualizar el bloque de código de la interfaz `Controller`.
- [ ] **15. SDD-15 §4.6 y §4.7 — el namespace.**
      Mismo fichero: el ejemplo del factory de §4.6 pasa a `$m`/`$s`/`$a`, y §4.7 deja escrito
      que la reserva `$` obliga **también al emit**, con la colisión de §2.5 como el porqué. Es
      la mitad de la corrección que impide que vuelva a pasar: sin esto, la próxima función
      privada nace otra vez sin prefijo.
- [ ] **16. Derogar la decisión 76 de props-spec.**
      Modificar `docs/sdd/props-spec.md`: la 76 (*«prop reactiva → setter en el hijo»*) queda
      **derogada** por `u`, con el porqué (§4.1) y enlace a este BUG; ajustar los ejemplos
      emitidos de §4.1, §4.2 y la fila de la tabla del índice de decisiones. Las 74, 75, 77, 78
      y 84 se quedan como están — este BUG las **cumple**, no las cambia.

## Fase 5 — Cierre técnico (2)

- [ ] **17. Goldens regenerados y revisados a mano.**
      `packages/compiler/test/emit/__golden__/{app-badge,app-card,app-button}.client.mjs`. Las
      únicas diferencias esperadas son el renombrado `$m`/`$s`, la salida de las escrituras de
      valor a `$a()` y la entrada `u`. Cualquier otra es un fallo de la Fase 2, no un golden que
      actualizar (§6.11).
- [ ] **18. Regresiones y cobertura.**
      `equivalence.test.ts` verde **sin tocarlo** (§6.8) y un `u` posterior a `r()` que no
      resucita nodos (§6.9). `@fudic/core` sigue al 100 % en las cuatro métricas; `client.ts` y
      `markup-client.ts` no bajan de ramas.

---

## Cierre del BUG

- [ ] `pnpm typecheck`, `pnpm test` y `pnpm build` en verde.
- [ ] El criterio §6.7 —el click del padre cambiando el texto del hijo— verde sobre DOM real.
- [ ] Marcar BUG-11 como `Hecho` en [INDEX.md](./INDEX.md) (tabla + registro de progreso).
- [ ] Anotar en [SDD-15-Task](../SDD-15-Task-fudic-element-y-emit-de-cliente.md) que el contrato
      del controlador cambió antes de las tareas pendientes de event bindings, y que las closures
      privadas se llaman `$m`/`$s`/`$a`.
