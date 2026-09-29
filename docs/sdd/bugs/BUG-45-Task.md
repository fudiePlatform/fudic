# BUG-45 — Tareas

> **BUG:** [BUG-45 — Un componente que nace en el navegador no adopta sus hojas](./BUG-45-la-hoja-que-nadie-adopta.md)
> **Paquetes:** `@fudic/core` · `@fudic/compiler` · `examples/basic`
> **Rama:** `BUG-45-adopt-style-sheet-runtime`, en el worktree
> `.claude/worktrees/BUG-45-adopt-style-sheet-runtime`, creada desde `main` (`59b54fa`)
> **Forma de trabajo, por indicación de Pedro:** primero el arreglo, probado por él en el
> navegador; después la documentación y los tests.
> **Progreso:** 5 / 6

---

## Fase 1 — El arreglo

- [x] 1. `core/src/adopt-sheets.ts`: `adoptSheets(host, shadow)` lee `data-fud-adopt`, construye
  cada hoja una vez con `replaceSync` a partir de su `<style type="module" specifier>` y la
  adopta. Aislado para borrarlo sin tocar nada más (`1f6710e`).
- [x] 2. `FudicElement.c()` llama a `adoptSheets` tras `attachShadow`: una sola línea (`1f6710e`).
- [x] 3. `route-client.ts`: los nodos del layout (`$lpN`) se declaran a nivel de closure, se
  asignan en `h` y se liberan en `r` (`1f6710e`).

## Fase 2 — La evidencia

- [x] 4. `routes/vivo.fud` con un `@if` directamente en el hueco, un componente en cada rama, y
  `components/vivo-otro.fud` nuevo. Pedro lo prueba en el navegador: el `@foreach` y las dos
  ramas llegan con su estilo (`1f6710e`).

## Fase 3 — Documentación, tests y cierre

- [x] 5. El BUG y sus tareas. `INDEX.md` de bugs y el maestro.
- [ ] 6. **Los tests.** Cada criterio del BUG con su test, y `pnpm typecheck`, `pnpm test` y
  `pnpm build` en verde.
  - Primero, ajustar la expectativa de los dos tests de `compiler/test/emit/route-client.test.ts`
    que comprueban `const $lp0 = $lc0;` (criterio 6), sin tocar el código.
  - `core/test/adopt-sheets.test.ts`: los criterios 1 a 4.
  - `core/test/element.test.ts`: `c()` adopta y `h()` no toca `adoptedStyleSheets`.
  - `compiler/test/emit/route-client.test.ts`: un `@if` directamente en un hueco (criterio 5).
  - Cobertura: `@fudic/core` al 100/100/100/100, y `@fudic/compiler` comparado con su suelo en
    `main`.
