# SDD-37 — Tareas · Delegación de eventos en bucles

> **SDD:** [SDD-37 — Delegación de eventos en bucles](./SDD-37-delegacion-de-eventos.md)
> **Paquetes:** `@fudic/compiler` · `@fudic/language-core` · `@fudic/language-server` ·
> `fudic-vscode` · `@fudic/forms`
> **Rama:** `sdd-37-delegacion-de-eventos`
> **Progreso:** 18 / 24
> **No toca:** `@fudic/dom`, `@fudic/core`, `@fudic/ssr`. Cero runtime de delegación: la
> tabla y el dispatch los escribe el emit.

Cada tarea es un paso cerrado: se implementa, se verifica y se marca. Ninguna depende de tareas
posteriores.

---

## Los cinco hitos

**Hito A — la sintaxis existe.** `delegate:nombre` se lexa, se clasifica y se rechaza con valor.
Nada la consume todavía; el emit la ignora.

**Hito B — los ocho diagnósticos.** El analizador semántico ata `$nombre` con `delegate:nombre`
por nombre y emite `FUD0660`–`FUD0667`. Sin TypeScript en ningún punto — es la promesa de §4.5 y
lo que decide si esta feature duele o no en la extensión.

**Hito C — el emit.** `WeakMap` por nombre, `set` con getter en `c()` y `h()`, listener envuelto
en el `$s()` del ancestro. Es el único hito que mueve goldens.

**Hito D — se comporta.** El arnés de `test/emit/hydrate/` con clicks de verdad: identidad por
referencia, reordenación, shadow del hijo, y cero `removeEventListener` al retirar filas.

**Hito E — el editor.** `$day` tipado desde la cabecera del bucle y completado tras `delegate:`.

**Hito F — la extensión.** `delegate:` con el mismo trato que `class:` en el `.vsix`: resaltado,
cierre automático, tokens semánticos y completado del nombre. Un atributo del lenguaje que el
editor no colorea es un atributo que el autor no cree que exista.

**Hito G — los formularios.** La misma técnica aplicada a `@fudic/forms`: un formulario con N
controles deja de tener N×3 listeners y pasa a tener uno por tipo de evento en la raíz. Es el
mismo ahorro que los bucles, sobre el paquete donde más elementos vivos hay.

---

## Fase 1 — La sintaxis (3)

- [x] **1. El prefijo.**
      `DELEGATE_PREFIX = 'delegate:'` en `packages/compiler/src/binding/nodes.ts`, junto a
      `BUS_PREFIX`/`CLASS_PREFIX`/`STYLE_PREFIX`, y un `Binding` con `type: 'delegate'` que
      lleva el span del nombre **aparte** del span del atributo (criterio 1).

- [x] **2. La clasificación.**
      `classifyAttribute` reconoce el prefijo y emite `FUD0667` si trae valor. El prefijo sin
      nombre sigue cayendo en el `FUD0099` que ya existe — verificarlo, no duplicarlo.

- [x] **3. Tests de clasificación.**
      En `packages/compiler/test/binding/`: forma válida, con valor, sin nombre, y que el span
      del nombre apunta a los caracteres correctos.

## Fase 2 — La semántica (5)

- [x] **4. El recolector del subárbol.**
      Un paso sobre el AST que, para un elemento con event bindings, recoge los `delegate:` de su
      subárbol con el bucle que los contiene. Es la pieza que invierte el scope (el hijo declara,
      el ancestro consume) y de la que salen cinco de los ocho códigos.

- [x] **5. `FUD0663` y `FUD0662`.**
      Marcador fuera de bucle, y nombre que no es binding de la cabecera. El contexto de bucle es
      el del walker que ya usa [ref-in-loop.ts](../../packages/compiler/src/semantic/analyzers/ref-in-loop.ts);
      los bindings de la cabecera salen de `patternBindings`.
      El mensaje de `FUD0662` **nombra los bindings disponibles** (criterio 3).

- [x] **6. `FUD0660`, `FUD0661` y `FUD0664`.**
      Los tres del emparejamiento: `$nombre` sin marcador, marcador sin lector, y dos bucles con
      el mismo nombre bajo el mismo ancestro. La regla de atadura es §3.2 — ancestro más cercano
      que mencione `$nombre`.

- [x] **7. `FUD0665` y `FUD0666`.**
      Lista cerrada de eventos que no burbujean, con el sustituto en el mensaje; y `$nombre`
      fuera de la lista de argumentos de un event binding.

- [x] **8. Los ocho, sin checker.**
      Un test que obtiene los ocho del resultado semántico del compilador, con la aserción
      explícita de que no se invoca TypeScript (criterio 10). Si esta tarea obliga a mirar tipos,
      el diseño está mal y hay que volver a §5, no relajarla.

## Fase 3 — El emit (4)

- [x] **9. La tabla.**
      `const $tN = new WeakMap();` en el `decls` del closure que posee el ancestro, una por
      nombre delegado. Reservar `$t`, `$y` y `$z` junto a los nombres de SDD-30.

- [x] **10. El registro de la fila.**
      `$tN.set($nX, () => nombre)` en `c()` y en `h()` de `markup-client.ts`, tras la asignación
      del nodo marcado. **Getter, no valor** — §4.1. Nada en el camino de update.

- [x] **11. El listener envuelto.**
      En `#listeners`: cuando el handler menciona `$nombre`, envolver como §4.1 —una pasada por
      `composedPath()`, guarda, invocación—. Un handler sin `$nombre` no cambia una coma.

- [x] **12. Goldens.**
      Fixture nueva `fixtures/app-calendar.fud` con un `@foreach` delegado, y su golden de
      cliente. Verificar que los goldens **existentes** no se mueven (invariante 2) y que el HTML
      de servidor es idéntico al del mismo componente sin el marcador (criterio 11).

## Fase 4 — Se comporta (3)

- [x] **13. Identidad por referencia.**
      En `test/emit/hydrate/`: click en la fila `b` entrega el objeto `day` de `b` con `toBe`.
      Y click en el ancestro fuera de fila no invoca nada (criterios 13, 14).

- [x] **14. Reordenación e hidratación.**
      Tras un `u(...)` que reordena, la celda de la posición 0 entrega el `day` nuevo. Y el mismo
      caso sobre una instancia **adoptada**, no fabricada (criterios 15, 12 en su rama `h`).

- [x] **15. Cero churn de listeners.**
      Espiar el `Dom`: retirar N filas no ejecuta ningún `removeEventListener`, y montar N filas
      ejecuta un solo `event()` (criterios 17, 12). Es el criterio que justifica el SDD.

- [x] **16. A través del shadow del hijo.**
      `<app-card delegate:day>` con click nacido dentro del shadow del hijo (criterio 16).

## Fase 5 — El editor (2)

- [x] **17. El tipo de `$nombre`.**
      En `@fudic/language-core`, el fragmento del handler del ancestro se emite en un scope
      sintético con los bindings de la cabecera bajo su nombre con `$`. Caso destructurado
      incluido (criterio 18).

- [x] **18. Completado tras `delegate:`.**
      En `@fudic/language-server`, ofrecer los bindings de la cabecera del bucle que contiene el
      atributo (criterio 19). Es lo que convierte `FUD0662` de error en typo evitado.

## Fase 6 — La extensión (3)

- [ ] **19. El resaltado.**
      `delegate:day` en `packages/vscode/syntaxes/fudic.tmLanguage.json`, con la misma forma
      que `binding-class-style`: el prefijo y el nombre como binding, los dos puntos como
      puntuación. Con test en `packages/vscode/test/`, como el resto de reglas.

- [ ] **20. El cierre automático y el hueco.**
      Lo que `class:` tiene en `auto-close.ts` y en `empty-value.ts` y este atributo necesita
      **al revés**: `delegate:` no lleva `=@`, así que la extensión no debe ofrecérselo.

- [ ] **21. Tokens semánticos.**
      El prefijo entra en `semantic-tokens.ts` junto a `CLASS_PREFIX`, para que el nombre se
      pinte con el color del binding y no con el del atributo HTML.

## Fase 7 — Los formularios (3)

- [ ] **22. La raíz delegada.**
      En `@fudic/forms`, un registro por formulario —`WeakMap` de elemento a manejador— y un
      listener por tipo de evento en la raíz, en lugar de `on(el, …)` por control.
      `blur` no burbujea: se delega como `focusout`, que es la sustitución que ya nombra
      `FUD0665`.

- [ ] **23. Las seis `bind*` sobre el registro.**
      `bind-text`, `bind-number`, `bind-checkbox`, `bind-radio`, `bind-select` y
      `bind-select-multiple` registran su manejador en vez de suscribirlo. La baja sigue
      siendo el mismo `Cleanup`.

- [ ] **24. Se mide.**
      Un test que espía `addEventListener` sobre un formulario de N controles: el número de
      listeners no depende de N. Y los tests de comportamiento existentes de `@fudic/forms`
      siguen verdes sin tocarlos — es la prueba de que la delegación no se nota.

---

## Cierre

- Cobertura 100 % en las cuatro métricas para el código nuevo (criterio 20). No se cierra por
  debajo.
- Decisiones 116–120 en [`gramatica-v1-decisiones.md`](../gramar/gramatica-v1-decisiones.md),
  sección 7.
- Fila en [`INDEX.md`](./INDEX.md) y entrada en el registro de progreso.

## Enlaces

- Criterios de aceptación: los 20 de
  [SDD-37 §6](./SDD-37-delegacion-de-eventos.md#6-criterios-de-aceptación).
- Hermano de [SDD-30](./SDD-30-renders-de-bloque.md): esta spec vive de que un bloque sea una
  función declarada en el closure envolvente. Sin eso no hay dónde poner la tabla.
- La variante `delegate:day=@edit` queda anotada en
  [§7](./SDD-37-delegacion-de-eventos.md#7-fuera-de-alcance) para cuando una fila con varias
  acciones haga doler el `switch`.
