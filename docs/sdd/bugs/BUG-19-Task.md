# BUG-19 — Tareas · Los tres constructos que el servidor no pinta

> **BUG:** [BUG-19 — Tres de los cinco constructos no existen en la rama de servidor](./BUG-19-tres-constructos-sin-servidor.md)
> **Paquetes:** `@fudic/compiler` (`emit/markup.ts`, `emit/constructs.ts`)
> **Rama:** `fix/bug-19-servidor-tres-constructos`
> **Progreso:** 5 / 10
> **No espera a nada.** [SDD-30](../SDD-30-renders-de-bloque.md) está `Hecho` y es lo que abarata
> la corrección; [SDD-31](../SDD-31-signals-derivadas.md), [BUG-18](./BUG-18-update-denso.md) y
> [SDD-15-Task-eventos-y-bus](../SDD-15-Task-eventos-y-bus.md) **no comparten un fichero** con esta
> tanda ([§2.5](./BUG-19-tres-constructos-sin-servidor.md))

El emit de servidor pinta `@if` y `@foreach`; `@switch`, `@for` y `@while` caen en un `default` que
los declara *«constructs with no server markup»* y no lo son. La corrección no es escribir tres
casos: es que el despacho **no pueda** volver a tragarse un tipo de nodo.

Cada tarea es un paso cerrado: se implementa, se verifica y se marca. Ninguna depende de tareas
posteriores.

---

## Los dos hitos

**Hito A — el mismo vocabulario en las dos ramas.** El cliente pregunta `isControlNode(...)` y
trabaja con `branchesOf`/`isLoop`; el servidor enumeraba dos nombres. Al terminar, la única
diferencia entre las dos ramas es lo que emiten, no lo que reconocen.

**Hito B — un despacho total.** Cada tipo de `HtmlContent` dice si el servidor lo pinta, y el que no
lo pinta dice por qué — el patrón que [BUG-14 §5](./BUG-14-texto-literal-no-sobrevive.md) dejó en
`runs.ts` y que a `markup.ts` no llegó. Es lo que convierte esto en la corrección de una clase y no
de tres instancias.

**Fuera de esta tanda:** la rama de cliente (emite los cinco desde SDD-30), las fixtures y los
goldens nuevos, y cualquier semántica de `key` en el servidor.

---

## Fase 1 — El vocabulario compartido (2)

- [x] **1. `loopHead()` sube a `constructs.ts`.**
      Mover el método privado `#loopHead` de
      [`block.ts:460-463`](../../../packages/compiler/src/emit/block.ts#L460-L463) a
      `packages/compiler/src/emit/constructs.ts` como `loopHead(node: LoopNode, source: string)`, y
      hacer que el emisor de cliente lo consuma desde ahí. Que las dos ramas partan la cabecera con
      **la misma función** es lo que impide que un `@for` con un `;` inusual compile distinto a cada
      lado; es el mismo argumento por el que `marker.ts` es un módulo (SDD-30 §3.4). El chunk de
      cliente no puede cambiar ni un byte con esta tarea: los goldens `*.client.mjs` son el testigo.
- [x] **2. El despacho del servidor pasa a ser total.**
      Modificar `MarkupEmitter.#emit` en
      [`markup.ts:120-146`](../../../packages/compiler/src/emit/markup.ts#L120-L146): fuera el
      `default` que devuelve en silencio; cada miembro de `HtmlContent['type']` nombrado, al modo de
      `ROLE` en [`runs.ts:57-86`](../../../packages/compiler/src/emit/runs.ts#L57-L86). Los que
      **siguen** sin emitir markup —`comment`, `razor-comment`, `code`, `section` (la recoge SDD-21
      por otra puerta), `raw-expression` (espera al escape de SDD-07), los `render-*` sin `slots`—
      lo dicen por su nombre y con su motivo. Actualizar de paso la cabecera del fichero, que hoy
      afirma que los nodos de control son `@if`/`@foreach`
      ([`markup.ts:8-11`](../../../packages/compiler/src/emit/markup.ts#L8-L11)).

## Fase 2 — Los tres constructos (3)

- [x] **3. `@for` y `@while`.**
      Un solo método con `loopHead`: `for (…) { … }` y `while (…) { … }`, cabecera empalmada entera
      (decisión 93) y anclada con `mappedLine` como ya hace `#foreach`
      ([`markup.ts:204-210`](../../../packages/compiler/src/emit/markup.ts#L204-L210)). El cuerpo
      sale por `emitChildren` bajo el mismo `parent`: un bloque **no** es un nivel del DOM.
      Criterios §6.2, §6.3.
- [x] **4. `@switch`.**
      Una rama por `SwitchCase`, **con llaves y con `break` explícito en todas**, la última incluida
      —decisión 14: no hay caída, y sin `break` el emitido pintaría dos ramas—. El orden del fuente
      se respeta, `default` incluido: la semántica de JS es la misma elección que implementa el
      selector del cliente ([`block.ts:439-447`](../../../packages/compiler/src/emit/block.ts#L439-L447)).
      El discriminante y el test de cada `case` se anclan al source map. Criterios §6.1, §6.4, §6.7.
- [x] **5. La `key` no se evalúa, y hay que comprobarlo.**
      El servidor renderiza una vez y no reconcilia: la expresión de `key (…)` **no aparece** en el
      módulo emitido. Es media línea de código —no leerla— y un criterio propio, porque es la
      diferencia entre las dos ramas y el sitio donde alguien la «arreglaría» por simetría.
      Criterio §6.5.

## Fase 3 — Lo que el paseo arrastra (1)

- [ ] **6. Imports y assets, ahora alcanzables.**
      Sin tocar código: el cuerpo recorrido llena `#used`
      ([`markup.ts:163`](../../../packages/compiler/src/emit/markup.ts#L163)) y registra los assets
      en el `AssetLinker`, así que un `<app-x>` dentro de un `@switch` aporta su
      `import { render as … }` ([`module.ts:154`](../../../packages/compiler/src/emit/module.ts#L154))
      y un `<img>` que falta se reporta por `missingAssets` (`FUD0363`). Verificarlo con test: es lo
      que hay que **comprobar** al arreglar, no un arreglo aparte (§2.3). Criterios §6.8, §6.9.

## Fase 4 — Verificación (3)

- [ ] **7. Los criterios de forma, sobre el texto y sobre el HTML (§6.1–§6.7).**
      Con componentes **en memoria**, al modo de
      [`block.test.ts`](../../../packages/compiler/test/emit/block.test.ts) —que ya prueba estos
      mismos tres constructos, pero solo contra el chunk de cliente—. Nada de fixtures nuevas: es lo
      que mantiene la rama paralelizable con las tres tandas en vuelo (§2.5, §7).
- [ ] **8. Equivalencia SSR ↔ cliente, los tres constructos (§6.11–§6.14).**
      En [`hydrate/block-equivalence.test.ts`](../../../packages/compiler/test/emit/hydrate/block-equivalence.test.ts),
      con `adoptOnly`: si `h()` fabrica **un** nodo, las dos ramas ya divergieron. `@switch` con la
      rama `case`, con la `default` y **sin ninguna coincidencia**; `@for` con 0, 1 y N vueltas;
      `@while` con 0 y N. Y el criterio que solo se ha verificado con `@if` hasta hoy: un constructo
      que no pinta devuelve el cursor **intacto**, comprobado con un elemento hermano detrás.
      Este es el test que da sentido al BUG: es el que hoy falla y el que nadie escribió.
- [ ] **9. Goldens (§6.10).**
      `pnpm test` con los goldens sin regenerar: ni los `__golden__/*.mjs` de servidor ni los
      `*.client.mjs` pueden moverse un byte —ninguna fixture usa los tres constructos, y la tarea 1
      es una mudanza, no un cambio de salida—. Un golden que cambie aquí señala que se tocó la rama
      que no era.

## Fase 5 — Cierre (1)

- [ ] **10. Verde, cobertura e índices.**
      `pnpm typecheck`, `pnpm test` y `pnpm build` en la raíz —los ejemplos se construyen después de
      los paquetes: si `examples/basic` se rompe, el build falla—. Las líneas nuevas de `markup.ts` y
      el helper de `constructs.ts` al **100 %** en las cuatro métricas; `constructs.ts` está al 100 %
      y no baja. Nada de `/* v8 ignore */`. Anotar el avance en [bugs/INDEX.md](./INDEX.md) y en
      [../INDEX.md](../INDEX.md), y pasar BUG-19 a `Hecho` si los 14 criterios de §6 están verdes.

---

## Lo que esta tanda deja listo para la siguiente

**Una fixture con `@switch` deja de ser peligrosa.** Hoy, una demo que use cualquiera de los tres
constructos nace con el golden de servidor incompleto y con la hidratación desalineada; después de
esta tanda, es una fixture más. Es la condición que hay que cumplir antes de que
`examples/basic` o la fixture de eventos estrenen alguno de ellos.

## Enlaces

- Criterios de aceptación: los 14 de
  [BUG-19 §6](./BUG-19-tres-constructos-sin-servidor.md#6-criterios-de-aceptación).
- Corrige el slice SSR de [SDD-15](../SDD-15-emit.md) y completa la equivalencia que
  [SDD-30 §6.17](../SDD-30-renders-de-bloque.md) enuncia para los cinco constructos y hoy solo se
  verifica con dos.
- Mismo mecanismo que [BUG-14](./BUG-14-texto-literal-no-sobrevive.md): un tipo de nodo que nadie
  lee y del que nadie se queja. Aquella dejó la tabla total en `runs.ts`; esta la lleva a
  `markup.ts`.
