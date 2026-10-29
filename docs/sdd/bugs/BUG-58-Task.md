# BUG-58 — Tareas

> **BUG:** [BUG-58 — El editor no encuentra el `.fudapi` si VS Code no está abierto en el proyecto](./BUG-58-fudapi-fuera-de-la-raiz-abierta.md)
> **Paquetes:** `@fudic/typecheck`
> **Rama:** `sdd-68-llamadas-sin-fontaneria` (a petición de Pedro: se cierra el producto aquí)
> **Progreso:** 2 / 2 — `Hecho`.

---

## Fase 1 — el proyecto del contrato

| ✓ | # | tarea | package | fichero |
|---|---|---|---|---|
| [x] | 1 | **El proyecto de un `.fudapi`** es el `package.json` más cercano dentro de la raíz barrida, o la raíz. Criterios 1–3 | `typecheck` | `src/fud-index.ts` · `test/implementations.test.ts` |

## Cierre

| ✓ | # | tarea |
|---|---|---|
| [x] | 2 | Prueba de Pedro en VS Code sobre `examples/basic`; BUG-58 a `Hecho` con su fila y su entrada en `bugs/INDEX.md` |
