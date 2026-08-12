# Pendientes de v1 — lo que está especificado y NO está implementado

> Fecha: 2026-08-12. Excluye SDD-17 (hidratación) y SDD-29 (snippets), que van por su cuenta.
>
> **Para qué es este documento.** Los cuatro puntos de abajo viven repartidos entre la
> gramática, `props-spec.md` y comentarios del emit. Aquí están juntos, con la evidencia de
> que faltan, para no volver a buscarlos.

---

## 1. `ref="@var"` — se parsea, no se emite

**Spec:** gramática, decisiones 30 y 31.

**Estado:** el parser lo reconoce y lo valida (`binding/classify.ts`, `RefBinding`,
`FUD0094` si el valor no es un identificador simple; `ref` dentro de bucle es error por
SDD-12). **El emit lo ignora**: no hay ni un `case 'ref'` en `packages/compiler/src/emit/`.
Un `ref` escrito hoy no llega al chunk y la variable del usuario queda `undefined`.

**Qué falta:** asignar la referencia del nodo en el camino `c` y en el camino `h` del
factory (§4.6 de SDD-15), y anularla en `r()`. Decidir si el `let` de la variable lo declara
el emit o viene de `@client`.

---

## 2. `@raw(expr)` — se parsea, no se emite

**Spec:** gramática, decisión 18 (escape automático + opt-out explícito + marcador
`TrustedHTML`).

**Estado:** el emit lo dice con todas las letras — `emit/markup.ts:75` y `emit/runs.ts:69`:
*«`@raw(…)` is an interpolation that is not escaped (decision 18); the emit has no
consumer»*. Es decir: hoy **todo** se escapa y el opt-out no existe.

**Qué falta:** la rama sin escapar en las dos salidas (servidor y cliente), y el tipo
marcador `TrustedHTML` con su detección en compilación. Ojo a la simetría: el servidor
serializa y el cliente escribe DOM — `innerHTML` frente a `textContent` — y las dos tienen
que pintar lo mismo (es la lección de BUG-14).

---

## 3. Spread de props: `{...item}`

**Spec:** [props-spec.md](../props-spec.md) §5, decisiones 79–82.

**Estado:** cero código. No hay token, ni nodo de AST, ni clasificación, ni emit.

**La forma es con llaves** — `<app-card {...item}></app-card>` —, no `...item` desnudo
dentro de la lista de atributos.

**Qué falta, y las reglas que lo definen:**

- Expande a property bindings **contra `T`**, el tipo de props del hijo (79).
- **Filtro por las claves de `T`, no por las de `item`** (80): lo que sobra en `item` no
  cruza.
- La reactividad de cada clave la decide **lo que lleve `item`** en esa clave (81), igual
  que un `.prop` escrito a mano.
- Clave ausente en `item`: **error si la prop es requerida, default si es opcional** (82).

---

## 4. Two-way binding: `bind:`

**Spec:** [props-spec.md](../props-spec.md) §6, decisiones 83–85.

**Estado:** cero código. `BIND_PREFIX` no existe en ningún fichero del compilador.

**Qué falta:**

- El prefijo `bind:` como binding reservado, hermano de `class:` / `style:` / `bus:`
  (decisión 22 de la gramática).
- El desazucarado: **el canal de vuelta es una prop callback, no un evento** (83).
- **Ninguna signal cruza el shadow boundary** (84): `bind:` es azúcar sobre prop de valor +
  prop callback, y por eso exige que las dos estén declaradas (85).

**Hueco abierto que hay que cerrar antes de escribir código** (props-spec §7): el **nombre
de la prop callback**. `onChange` fijo, u `on<Prop>Change` derivado del nombre de la prop.
Sin ese convenio el desazucarado no tiene contra qué emitir.

---

## Deuda de documentación que arrastra esto

- `props-spec.md` **no está en la tabla maestra** de [INDEX.md](../INDEX.md): sus decisiones
  no aparecen en ninguna fila, y por eso estos dos puntos no se ven al leer el índice.
- **Colisión de numeración:** `props-spec.md` numera 67–85 y la gramática v1 usa 75–85 para
  documento y layouts. Los mismos números dicen cosas distintas en dos ficheros. Reconciliar
  antes de implementar, o la primera referencia cruzada que alguien escriba será ambigua.
- Ninguno de los cuatro puntos tiene rango de diagnósticos reservado. El spread (82) y el
  `bind:` (85) emiten errores, así que necesitan códigos `FUD` antes de empezar.
