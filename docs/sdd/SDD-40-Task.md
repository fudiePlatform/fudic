# SDD-40 — Tareas · Props de layout

> **SDD:** [SDD-40 — Props de layout](./SDD-40-props-de-layout.md)
> **Paquetes:** `@fudic/compiler` (props del layout, el `<html>` interpolado, el contrato) ·
> `@fudic/transport` (`RenderContext.layout`) · `@fudic/vite` (envoltorio, endpoint, prerender) ·
> `@fudic/language-server` (la bombilla) · `@fudic/example-basic` (la evidencia)
> **Rama:** `worktree-sdd-40-props-de-layout`
> **Progreso:** 7 / 14
> **Después de SDD-39**, no en paralelo: los dos tocan
> `packages/compiler/src/emit/layout.ts`. No comparten ninguna decisión, solo el fichero.

Un layout declara props con `props<{…}>()` —el mismo vocabulario de una ruta y un componente— y
la ruta las resuelve en un tercer export de `@server`, después de `load` y con lo que `load`
devolvió. Nada de esto es reactivo y nada de esto viaja al cliente.

Cada tarea es un paso cerrado: se implementa, se verifica y se marca.

---

## Los cuatro hitos

**Hito A — el layout puede declarar, y el `<html>` puede interpolar.** Las dos son de la misma
tanda porque sin la segunda la primera no se puede demostrar: el caso que motiva la spec es un
`lang` que hoy sale como texto literal.

**Hito B — la ruta resuelve.** El export `layout(ctx, data)`, su orden respecto a `load`, y la
composición hasta el módulo del layout.

**Hito C — los tres orígenes.** El cable: `RenderContext.layout`, el endpoint que devuelve las dos
cosas y el envoltorio en sus dos variantes. La propiedad a demostrar es que `edge`, `sw` y `ssg`
producen el mismo HTML.

**Hito D — el contrato y la bombilla.** `FUD0702` en el build, la acción de código en el editor, y
la regla de una voz por hecho que SDD-36 ya fijó.

**Fuera de esta tanda:** reactividad en el layout o en el `<head>`, cabeceras en `RenderContext`,
un `load` propio del layout (§7).

---

## Fase 1 — El layout declara (4)

- [x] **1. `props<{…}>()` en un layout.**
      El `@code` de un layout se extrae como el de un componente, pero **solo** para sus props: la
      misma llamada, el mismo desestructurado, los mismos defaults. Es el vocabulario que ya
      existe; no se añade ninguno.
- [x] **2. `FUD0700` — lo que sobra en el `@code` de un layout.**
      Un `@server`, un `@client` o una sentencia suelta. Con su span, sin lanzar, y el layout se
      sigue emitiendo. Criterio §6.2.
- [x] **3. El `<html>` se emite por la maquinaria de atributos.**
      Retirar el `slice(source, doc.html.openSpan)` metido en un `JSON.stringify`
      ([layout.ts:165](../../packages/compiler/src/emit/layout.ts)) y emitir el tag de apertura
      como cualquier otro elemento. No toca el orden de emisión: `data` y las props ya están
      resueltas ahí y no se ha emitido un byte. Criterio §6.1.
- [x] **4. `FUD0701` — una prop de layout no puede ser reactiva.**
      El emit ya sabe qué nombres se mueven (`movingNames`). Sobre el valor, error, y el valor se
      ignora. En el mensaje va el motivo, que es lo que evita que alguien lo lea como una
      limitación arbitraria: un layout no tiene mitad de cliente que pueda repintarlo.
      Criterio §6.4.

## Fase 2 — La ruta resuelve (3)

- [x] **5. El export `layout(ctx, data)`.**
      Tercer nombre reservado del `?server`, junto a `load` y `paths`. El módulo `?server` ya
      lleva la región verbatim, así que la tarea es reconocerlo, tipar `LayoutResolver` y que el
      envoltorio lo vea.
- [x] **6. El orden por render.**
      `load` y después `layout`, con `data` ya resuelto en la mano. `paths()` sigue siendo de
      build y no lo llama ninguna de las dos variantes del envoltorio. Criterios §6.8 y §6.9.
- [x] **7. La composición hasta el layout.**
      `page(data, io, layoutProps)` y `layout(data, io, route, props)`, con el desestructurado
      arriba del todo del módulo del layout. Un layout anidado reenvía a su padre **las del
      padre**, como ya reenvía secciones y bloques. `FUD0703` cuando dos de la cadena declaran el
      mismo nombre con tipos incompatibles. Criterios §6.5 y §6.6.

## Fase 3 — El cable, y que los tres coincidan (3)

- [ ] **8. `RenderContext.layout`.**
      Un campo más, al lado de `data` y nunca dentro. `@fudic/transport` nace al 100 % en lo
      nuevo.
- [ ] **9. El endpoint devuelve las dos cosas.**
      `{ data, layout }` en **una** respuesta: es una petición, no dos, y las dos salen del mismo
      instante de la misma. El envoltorio del borde llama a las dos funciones en proceso; el del
      SW no importa ninguna. Criterio §6.10.
- [ ] **10. El test que define el SDD.**
      La misma ruta renderizada en `edge`, en `sw` y en `ssg` produce el **mismo** `<html lang>`,
      comparado byte a byte. Si esto no está verde, lo demás da igual. Criterio §6.11.

## Fase 4 — El contrato y la bombilla (4)

- [ ] **11. `FUD0702` en el build.**
      Prop requerida del layout que la ruta no resuelve —falta en el `return`, o no hay
      `layout`—, sobre el `<link rel="layout">` de la ruta, que es donde se declara la relación.
      En `vite` y en `fudic check`. Criterio §6.3.
- [ ] **12. La proyección ve las props del layout.**
      El `return` de `layout(ctx, data)` se comprueba contra el tipo de `props<{…}>()` del layout.
      Es lo que hace que en el editor **la voz sea de TypeScript** y no se reporte dos veces
      (SDD-36 §3.1). Criterio §6.12.
- [ ] **13. La acción de código.**
      *«Completar las props requeridas del layout»*: los campos que falten en el `return`, o la
      función entera si no existe —creando el `@server` si tampoco lo hay—. Con un valor **del
      tipo de cada prop**, por la razón de SDD-36: una reparación que deja errores de tipos que
      ella misma creó es peor que no tener bombilla. Criterios §6.13 y §6.14.
- [ ] **14. La evidencia, en `examples/basic`.**
      `_layout.fud` declara `culture` requerida y su `<html lang="@culture">` sale con lo que cada
      ruta resuelve. Una ruta con `:param` la deriva de lo que `load` trajo. Verificado en Chrome
      real en las tres formas: `pnpm dev`, build sin SW y build con SW. Criterios §6.15–§6.17.

---

## Verificación final

- `pnpm typecheck` y `pnpm test` en verde en todo el workspace.
- Los 18 criterios de §6, y el §6.11 —los tres orígenes byte a byte— antes que ninguno.
- El §6.7 sigue verde: el chunk de una ruta con layout **no ancla nada** del layout. Este SDD no
  puede romper el invariante de SDD-39.
- `@fudic/transport` y `@fudic/language-server` no por debajo de donde empezaron; lo nuevo del
  language server, al 100 %.
