# BUG-26 — Tareas

> **BUG:** [BUG-26 — Al hidratar, un bloque reclama el ancla del nivel](./BUG-26-ancla-compartida-al-hidratar.md)
> **Paquetes:** `@fudic/compiler`
> **Rama:** `worktree-reactividad-evidencias` · **Depende de:** SDD-30 y SDD-17 en `Hecho`
> **Progreso:** 3 / 3 — `Hecho`

Tres tareas. Rutas relativas a la raíz del repo.

**El orden manda en una cosa:** el test va **antes** que el arreglo, y con el fixture
correcto. Un fixture sin contexto `grid` ni nivel en línea pasa contra el emit roto —BUG-21
poda el blanco y el defecto deja de ser alcanzable—, así que el primer paso no es escribir un
test: es escribir uno que **falle**.

---

## Fase 1 — El caso que nadie ejecutaba (1)

- [x] **1. Hidratar y luego actualizar.**
      [`test/emit/hydrate/reconcile-after-hydrate.test.ts`](../../../packages/compiler/test/emit/hydrate/reconcile-after-hydrate.test.ts):
      renderizar en el servidor, montar como DSD, hidratar y **conducir `u`**. Cuatro
      fixtures —`@if` en `grid`, `@if` en línea, `@switch`, `@foreach`—, y las props al
      servidor como **objeto** y al factory de cliente **posicionales**, que es como las toma
      cada lado; dárselas cruzadas deja todo `undefined` y el test sigue pareciendo verde.
      Visto fallar contra el emit anterior.

## Fase 2 — La propiedad del nodo (1)

- [x] **2. Un run estático de frontera se adopta como referencia.**
      `#shared` en
      [`emit/markup-client.ts`](../../../packages/compiler/src/emit/markup-client.ts), con
      sus dos condiciones: `$dom.lastChild($parent)` —la frontera de atrás, que es el ancla
      del nivel— y `$dom.previousSibling($cN)` siendo el **primer** ítem del nivel —la de
      delante, que es la prosa del autor—. `#run` recibe `first` para poder distinguir un run
      de frontera de uno interior.

## Fase 3 — La evidencia (1)

- [x] **3. La página y la suite de navegador.**
      `<signal-control>` con los cuatro constructos leyendo **una** signal en su cabecera, la
      ruta [`/reactividad`](../../../examples/basic/src/routes/reactividad.fud) y
      [`tests/reactividad.spec.ts`](../../../examples/basic/tests/reactividad.spec.ts). La
      hidratación es **por gesto**, así que no hay paso de «esperar a hidratado»: el primer
      clic despierta y se reproduce, y `expect` reintenta.

---

## Cierre

- [x] `pnpm typecheck` · `pnpm test` en verde en el workspace entero.
- [x] Los tres goldens regenerados, con el diff revisado a mano: **nueve** `$r.push(...)`
      borradas de las pasadas `h` y cero cambios más.
- [x] Validado por mutación, las dos mitades del ancla por separado.
- [x] Fila en [el índice de BUG](./INDEX.md) y registro en [INDEX.md](../INDEX.md).
