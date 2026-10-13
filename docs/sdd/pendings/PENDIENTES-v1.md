# Pendientes de v1 — CERRADO

> **2026-10-13: no queda nada abierto.** Los cuatro puntos de este documento se cerraron en
> [SDD-54](../SDD-54-pendientes-v1.md). Tres se implementaron y uno se anuló. Lo que sigue
> conserva qué faltaba y dice cómo quedó, para quien llegue aquí desde una referencia vieja.
>
> Redactado el 2026-08-15, al cerrar SDD-17. SDD-29 (snippets) iba por su cuenta y está `Hecho`.

---

## 1. `ref="@var"` — implementado

**Faltaba:** el parser lo reconocía y lo validaba (`FUD0094`, `ref` en bucle por SDD-12), pero el
emit lo ignoraba y la variable del usuario quedaba `undefined`.

**Quedó:** el `let` lo declara siempre el autor en `@client`. El compilador le asigna el nodo en
el enganche, que corre al crear y al hidratar, y lo devuelve a `null` al desmontar, también
dentro de un `@if`. Decisión 155 de la gramática.

## 2. `@raw(expr)` — implementado

**Faltaba:** el escape existía, el opt-out no, y tampoco el marcador `TrustedHTML`.

**Quedó:** `@raw` pinta el HTML de un valor marcado con `trustedHtml()` y escapa todo lo demás,
con la misma función (`htmlOf`) en servidor y navegador. Por decisión de Pedro es el **único
contenido de su elemento** (`FUD0990`), así que la hidratación nunca cuenta sus nodos. Un
`string` sin marca es un error de TypeScript en el editor y en el build. Decisión 154.

## 3. Spread de props — implementado, sin llaves

**Faltaba:** todo. No había token, nodo, clasificación ni emit.

**Quedó:** se escribe `<app-card ...item>`, sin llaves, por decisión de Pedro. Se expande contra
las props del hijo en servidor, cliente y editor; un `.prop` escrito a mano gana su clave, y si a
`item` le falta una prop requerida es un error de TypeScript sobre el objeto. Decisiones 146–149
de [props-spec](../props-spec.md) (antes 79–82), `FUD0991` y `FUD0992`.

## 4. Two-way binding `bind:` — anulado

**Faltaba:** todo, y además el convenio del nombre de la prop callback.

**Quedó:** anulado por decisión de Pedro. La decisión 153 (antes 86) ya pasa por referencia un
callback y una signal declarados en las props del hijo, como demuestra `examples/basic` en
`/signal-prop`. `bind:` no tiene nada que añadir. La 152 (antes 85) queda derogada.

---

## La deuda de documentación, saldada

- `props-spec.md` está en la tabla maestra de [INDEX.md](../INDEX.md).
- **Colisión de numeración resuelta:** la gramática conserva 75–86, y las de props pasan a
  142–153, con las referencias renumeradas en docs y código.
- **Rango de diagnósticos:** `FUD0990`–`FUD0999`, de SDD-54.
