# BUG-28 — Tareas

> **BUG:** [BUG-28 — `@{ … }` se parseaba y no se emitía](./BUG-28-bloque-en-linea-nunca-emitido.md)
> **Paquetes:** `@fudic/compiler`
> **Rama:** `worktree-reactividad-evidencias` · **Depende de:** SDD-15 y SDD-30 en `Hecho`
> **Progreso:** 4 / 4 — `Hecho`

Cuatro tareas. Rutas relativas a la raíz del repo.

**El orden manda:** el **bloque antes que el bucle** (1 y 2 antes que 3). El `@while` de la
decisión 91 se apoya entero en que un `@{ … }` corra; al revés no se puede ni medir, porque el
bucle no termina y no hay nada que observar.

---

## Fase 1 — El bloque corre (2)

- [x] **1. La rama de servidor.**
      `SERVER_ROLE['inline-code']` deja de ser `'none'` en
      [`emit/markup.ts`](../../../packages/compiler/src/emit/markup.ts) y estrena su caso:
      las sentencias del autor, verbatim y en orden de documento. El motivo viejo —«lo iza
      `module.ts`»— era cierto de `@code` y falso de este; queda escrito el porqué, para que
      la fila no se pueda volver a rellenar por analogía.
- [x] **2. La rama de cliente, en las tres pasadas.**
      `#inlineCode` en
      [`emit/markup-client.ts`](../../../packages/compiler/src/emit/markup-client.ts): a `c`
      y a `h` porque el bloque deja el scope en el estado que lee el resto del recorrido, y a
      `u` porque una actualización también es un render. Dentro de un bloque, detrás de las
      **dos** puertas de la reconciliación.

## Fase 2 — El cursor vive en la closure (1)

- [x] **3. Un nombre que el cuerpo ASIGNA no es parámetro.**
      `assignedNames` en [`emit/scope.ts`](../../../packages/compiler/src/emit/scope.ts) —
      apoyado en el `collectAssigned` que ya existía— y la tercera resta en
      [`emit/block.ts`](../../../packages/compiler/src/emit/block.ts). Es la decisión **116**
      y la tercera resta de SDD-30 §3.3.

## Fase 3 — La evidencia (1)

- [x] **4. Los dos paneles.**
      `<signal-code>` —el bloque que corre antes de pintar— y `<signal-while>` —el recorrido
      de lista enlazada de la decisión 91, con la resiembra delante del bucle—, en
      [`/reactividad`](../../../examples/basic/src/routes/reactividad.fud) y en
      [`tests/reactividad.spec.ts`](../../../examples/basic/tests/reactividad.spec.ts). El
      botón de «tocar» mueve una signal que la lista **no lee**: lo que se mide es que la
      pasada de actualización reejecuta la cabecera entera y devuelve las mismas tres filas.

---

## Cierre

- [x] `pnpm typecheck` · `pnpm test` en verde en el workspace entero.
- [x] Validado por mutación: se deshace cada mitad y cae su test.
- [x] Decisión **116** escrita en la sección 6 y en el índice de
      [`gramatica-v1-decisiones.md`](../../gramar/gramatica-v1-decisiones.md).
- [x] Fila en [el índice de BUG](./INDEX.md) y registro en [INDEX.md](../INDEX.md).
