# BUG-15 — Tareas

> **BUG:** [BUG-15 — Dentro de un tag abierto no contesta nadie](./BUG-15-clases-sin-completado.md)
> **Paquete:** `@fudic/language-server`
> **Rama:** la del backlog de uso
> **Depende de:** nada
> **Progreso:** 3 / 10

Cada tarea es un paso cerrado. Las rutas son relativas a la raíz del repo.

El orden manda en dos puntos. **La 1 antes que todo**: hay que ver el completado venir vacío en
`app-badge.fud` antes de que exista nada, o el test solo demostraría que el arreglo hace lo que
hace. Y **la 3 antes que la 4**: el contexto sin nombres que ofrecer es una rama que se cae a
Emmet y no se distingue de no haberla escrito.

---

## Fase 1 — Rojo primero (1)

- [x] **1. El ejemplo del repo no ofrece sus propias clases.**
      En `packages/language-server/test/acceptance/completion.test.ts`, pedir completado en
      `class:|` sobre `examples/basic/components/app-badge.fud` y afirmar `badge`, `success`,
      `info`. **Verlo fallar hoy**: hoy contesta Emmet, o nada (§6.1).

## Fase 2 — Los nombres, desde el AST (2)

- [x] **2. `styleClassNames`.**
      `packages/language-server/src/services/classes.ts` (nuevo). Recorre `document.head` y el
      árbol del `<template>`, toma el hijo `style-content` de cada `<style>` y escanea **solo**
      las partes `CssText`: nada de `source.slice(...)` teniendo el nodo delante (§4.1). Nombres
      sin punto, deduplicados, en orden de aparición.
- [x] **3. El escáner de preludios.**
      La regla única de §4.2: un `.nombre` cuenta solo entre el principio del cuerpo / `{` / `}` /
      `;` y el siguiente `{`. Con ella caen solos los decimales, los strings y los `url(...)`.
      Más: un `.` seguido de dígito no abre nada, los comentarios CSS se saltan, y un `.ident`
      que muere en el borde de una parte seguida de un átomo Razor se descarta (§6.4-§6.8).

## Fase 3 — El quinto contexto (2)

- [ ] **4. `classContextAt`.**
      `packages/language-server/src/services/position.ts`: el `PartialName` tras `class:`, con el
      prefijo **fuera** del span — se queda, es lo que abre el contexto (§3). No reconoce
      `style:`, ni un `class:` dentro de un valor entrecomillado, ni uno en texto de markup
      (§6.2). `wordContextAt` y su guarda de `insideOpenTag` no se tocan.
- [ ] **5. La rama en `completions()`.**
      `packages/language-server/src/services/plugin.ts`: contexto exacto, contesta solo, antes de
      Emmet — y **solo si tiene algo**, calcado de la condición que la rama de `@` ya usa
      (§4.3, §6.10). `:` ya es trigger character (`capabilities.ts`), así que no se toca.
      Verde en 1.

## Fase 4 — Lo que no se puede romper (2)

- [ ] **6. Los otros cuatro contextos, intactos.**
      `href`, `@section `, `<tag` y `@directiva` contestan lo mismo, y una palabra suelta sigue
      fusionando con Emmet en vez de reemplazarlo (§6.11).
- [ ] **7. Ofrecer no es validar.**
      Una clase que no está en ningún `<style>` se queda escrita y **no** produce diagnóstico:
      ni uno nuevo, ni uno de los que ya existen (§4.4, §6.12).

## Fase 5 — El interior del tag vuelve a contestar (3)

Estas tres salen de §2.3 y §2.4, y **todas se piden con el `context` que manda un editor**: sin
él ninguna falla contra el código de hoy, que es exactamente cómo se colaron.

- [ ] **8. Rojo primero, con el contexto puesto.**
      En `packages/language-server/test/acceptance/completion.test.ts`, pedir completado en
      `<div rol|>` y en `<app-badge |>` con `context: { triggerKind: 2, triggerCharacter: ' ' }`.
      **Verlo devolver cero ítems hoy** (§6.13, §6.14).
- [ ] **9. Fuera el espacio de los caracteres de disparo.**
      `packages/language-server/src/capabilities.ts`: sale `' '` de
      `COMPLETION_TRIGGER_CHARACTERS`; el `@`, el `<`, el `:` y los de Emmet se quedan. Es un
      cambio de contrato con el cliente y está en §3 por eso (§4.5, §6.15). Verde en 8.
- [ ] **10. La rama de tag fusiona.**
      `packages/language-server/src/services/plugin.ts`: `tagContextAt` deja de contestar con un
      `return` que apaga al servicio HTML — sus ítems son una voz más, ordenados delante por
      `sortText`. Los contextos exactos (`href`, `@section `, `class:`) **siguen** siendo
      exclusivos (§4.6, §6.16, §6.17).

---

## Cierre del BUG

- [ ] `pnpm typecheck` y `pnpm test` en verde en `@fudic/language-server`.
- [ ] `language-server` sigue al **100 %** en las cuatro métricas; `classes.ts` nace al 100 %.
- [ ] Marcar BUG-15 como `Hecho` en [INDEX.md](./INDEX.md) (tabla + registro de progreso).
- [ ] Anotar en [SDD-24 §4.2](../SDD-24-language-server.md) el quinto contexto, con enlace a este
      BUG, y dejar `style:` y `bus:` apuntados como lo que viene después.
