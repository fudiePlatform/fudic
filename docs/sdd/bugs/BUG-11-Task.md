# BUG-11 — Tareas

> **BUG:** [BUG-11 — `slot=` viaja en el literal de props, y con él todo atributo global de HTML](./BUG-11-slot-como-prop.md)
> **Paquete:** `@fudic/language-core` (roza `@fudic/cli` por `GLOBALS_DTS`)
> **Rama:** la del backlog de uso
> **Depende de:** nada
> **Progreso:** 8 / 8

Cada tarea es un paso cerrado. Las rutas son relativas a la raíz del repo.

El orden manda en dos puntos. **La 1 antes que todo**: el virtual del ejemplo tiene que verse
fallar con el `TS2353` literal, o el test solo demostraría que el arreglo hace lo que hace. Y
**la 3 antes que la 5**: sin `$Slots` emitido no hay nada contra lo que comprobar un `slot=`,
y apartarlo del literal sin comprobarlo cambia un error por un silencio.

---

## Fase 1 — Rojo primero (1)

- [x] **1. El ejemplo del repo falla al typechequear.**
      En `packages/language-core/test/`, llevar el virtual de
      `examples/basic/routes/blog/index.fud` al checker con el `typecheck.ts` que ya existe, y
      afirmar cero `TS2353`. **Verlo fallar hoy** con
      `'slot' does not exist in type '{ tone?: Tone }'` (§6.1).

## Fase 2 — Los atributos globales, por tipos (1)

- [x] **2. `$GlobalAttrs` y la firma de `$attrs`.**
      `packages/language-core/src/globals.ts`: el tipo de §3.1 y
      `declare function $attrs<T>(a: T & $GlobalAttrs): void`. Ni una rama en el emisor — el
      emisor no sabe que `id` o `data-*` existen (§4.1).
      Verde en 1 para todo salvo `slot`. **Ojo:** `GLOBALS_DTS` lo escribe también `fudic new`,
      así que el test de `@fudic/cli` que compara los dos textos entra aquí (§6.10).

## Fase 3 — El contrato de ranuras (2)

- [x] **3. `export type $Slots` en el virtual de cliente.**
      `packages/language-core/src/template/sections.ts`: `emitSlotsContract`, calcado de
      `emitSectionsContract` (líneas 55-73), copiando cada `name` **desde su span** para que F12
      funcione (§4.3). `never` cuando no hay ninguno. Llamado desde
      `emit-client.ts` junto a `emitSectionsContract` (§6.2, §6.3).
- [x] **4. El import y el alias `$S<n>`.**
      `packages/language-core/src/imports.ts`: `$Slots as $S0` en la misma línea de `import
      type` que `$Props as $C0`, con el mismo contador, y `slotsAliasOf(tag)` en `Aliases`.
      `undefined` para un tag sin `<link>` (§4.4).

## Fase 4 — `slot=` fuera del literal (1)

- [x] **5. `$intoSlot<$S0>('meta')`.**
      `packages/language-core/src/template/attrs.ts`: `slot` sale del filtro de `emitProps` y se
      proyecta aparte. El literal del nombre, **un solo tramo** con comillas bajo
      `DIAGNOSTIC_ONLY_CAPS` — la razón está escrita en `emitSection` y vale igual aquí (§4.2).
      Sin `$intoSlot` para un tag no registrado (§4.4, §6.8).
      Verde en 1.

## Fase 5 — Lo que no se puede romper (2)

- [x] **6. El contrato sigue siendo estricto.**
      Prop mal escrita ⇒ `TS2561` **con la sugerencia**; valor de tipo equivocado ⇒ `TS2322`.
      La intersección era el riesgo del enfoque y esto es lo que lo cierra (§6.7).
- [x] **7. Los globales, en bloque.**
      `id`, `part`, `exportparts`, `role`, `hidden`, `tabindex`, `lang`, `dir`, `title`, un
      `class` estático, un `style` estático, un `data-*` y un `aria-*` sobre un componente:
      cero diagnósticos (§6.6).

## Fase 6 — Que el error aterrice donde el usuario mira (1)

- [x] **8. El mapping del nombre.**
      `verification` activo y `sourceLength` igual al span del `name`: el `TS2345` de
      `slot="noexiste"` cae sobre lo que se escribió, no sobre andamiaje (§6.9, §6.5).

---

## Cierre del BUG

- [x] `pnpm typecheck` y `pnpm test` en verde en `@fudic/language-core` y en `@fudic/cli`.
- [x] `language-core` sigue al **100 %** en las cuatro métricas.
- [x] Marcar BUG-11 como `Hecho` en [INDEX.md](./INDEX.md) (tabla + registro de progreso).
- [x] Anotar en [SDD-23 §7](../SDD-23-emisor-ts-virtual.md) que `<slot>` ya tiene contrato, con
      enlace a este BUG, y dejar «sin slots, sin hijos» apuntado como lo que viene después.
