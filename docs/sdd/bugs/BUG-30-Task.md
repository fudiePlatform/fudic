# BUG-30 — Tareas

> **BUG:** [BUG-30 — Un `@client` escrito en un comentario es un error](./BUG-30-marcador-dentro-de-un-comentario.md)
> **Paquetes:** `@fudic/compiler`
> **Rama:** `worktree-bug-30-marcador-en-comentario` · **Depende de:** SDD-08 y SDD-12 en `Hecho`
> **Progreso:** 2 / 5 — `Listo`

Cinco tareas. Rutas relativas a la raíz del repo. Cada una deja el workspace verde, así que
se puede parar después de cualquiera.

**El orden manda en una cosa:** los tests **antes** que el arreglo (1 antes que 2–4). Los dos
falsos positivos se reproducen en tres líneas y hay que verlos en rojo; escritos después,
nadie sabe si pasan porque la corrección funciona o porque el test mira otra cosa.

---

## Mapa de dependencias

```
1 los cinco tests en rojo
      │
      ▼
2 el AST publica lo que el balanceador ya sabe  (code/nodes.ts + code/code.ts)
      │
      ├──▶ 3 el ayudante, en un módulo propio   (semantic/)
      │          │
      │          ├──▶ 4a code-region-nesting  (FUD0193)
      │          └──▶ 4b layout-load          (FUD0430)
      ▼
5 el ejemplo recupera su comentario
```

---

## Fase 1 — El rojo (1)

- [x] **1. Los falsos positivos, reproducidos.**
      En `packages/compiler/test/semantic/`: `@client` y `@server` nombrados en un comentario
      de línea, uno de bloque, una cadena y una plantilla —en la zona neutra **y** dentro de
      una región—, y `load` nombrado en un comentario y en una cadena del `@server` de un
      layout. Vistos fallar contra el código de hoy.
      Y en el mismo paso, los **verdaderos** positivos que no se pueden perder: región dentro
      de región, región en la neutra a profundidad > 0, y un `export function load` real.

## Fase 2 — Que el AST publique lo que ya sabe (1)

- [x] **2. `CodeBlockNode.regions`.**
      [`code/nodes.ts`](../../../packages/compiler/src/code/nodes.ts) gana el campo;
      [`code/code.ts`](../../../packages/compiler/src/code/code.ts) lo rellena con el
      `group.regions` que **ya tiene en la mano** en la línea 289 y hoy solo usa para el
      `BodySplitter` y para `razorCommentErrors`. Ni un lexado nuevo: es publicar un dato
      calculado.

## Fase 3 — Una regla, una función (2)

- [ ] **3. El ayudante.**
      Un módulo propio en `semantic/`, con **una** de las dos formas de §3 —`outsideOpaque`
      (el `RegionCursor` de `code.ts:94` extraído) o `maskOpaque` (enmascarado carácter por
      carácter, como `redactServerRegions`)—. Si sale `maskOpaque`, los dos analizadores se
      quedan casi como están y los spans no se mueven solos.
- [ ] **4. Los dos llamantes.**
      [`code-region-nesting.ts`](../../../packages/compiler/src/semantic/analyzers/code-region-nesting.ts)
      (`FUD0193`) y
      [`layout-load.ts`](../../../packages/compiler/src/semantic/analyzers/layout-load.ts)
      (`FUD0430`), los dos por la misma función. Y las dos cabeceras reescritas: la de hoy
      declara el falso positivo como precio aceptado, y deja de serlo.

## Fase 4 — La prosa que lo destapó (1)

- [ ] **5. El comentario del ejemplo, tal como se quería escribir.**
      [`examples/basic/src/routes/ruta-reactiva.fud`](../../../examples/basic/src/routes/ruta-reactiva.fud)
      dice hoy «la region de cliente» con el nombre roto a propósito para esquivar el
      diagnóstico. Vuelve a decir `@client`, que es lo que había que escribir.

---

## Cierre

- [ ] `pnpm typecheck` · `pnpm test` en verde en el workspace entero.
- [ ] Cobertura al **100 %** en las cuatro métricas del código nuevo; `@fudic/compiler` no
      baja.
- [ ] Validado por mutación: se deshace el salto de regiones y vuelven a caer los cinco
      tests de la fase 1.
- [ ] Fila en [el índice de BUG](./INDEX.md) y registro en [INDEX.md](../INDEX.md).
