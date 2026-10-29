# BUG-61 — Tareas

> **BUG:** [BUG-61 — El primer repintado tras hidratar mueve filas que no han cambiado de sitio](./BUG-61-filas-movidas-al-repintar.md)
> **Paquetes:** `@fudic/compiler`
> **Rama:** `bug-61-filas-movidas-al-repintar`, desde `sdd-69-sesion-por-cookie` y mergeada en ella (a petición de Pedro).
> **Progreso:** 4 / 4 — `Hecho`.

---

## Fase 1 — el arreglo

| ✓ | # | tarea | package | fichero |
|---|---|---|---|---|
| [x] | 1 | **Un nodo ajeno ya en su sitio es la referencia**, y sigue sin moverse. Criterio 1 | `compiler` | `src/emit/block.ts` |
| [x] | 2 | **El test que faltaba**: una ruta con espacios entre filas, sin movimientos en la primera pasada; se comprobó que falla sin el arreglo. Ficheros de referencia al día. Criterios 1 y 3 | `compiler` | `test/emit/hydrate/refresh.test.ts` · `test/emit/__golden__/*.client.mjs` |

## Cierre

| ✓ | # | tarea |
|---|---|---|
| [x] | 3 | `pnpm --filter @fudic/compiler test` en verde (salvo la tabla de hidratación, que cambia por el ejemplo de SDD-69 y se actualiza allí); el test de `/usuarios` del ejemplo pasa. Criterio 2 |
| [x] | 4 | BUG-61 a `Hecho` con su fila y su entrada en `bugs/INDEX.md` |
