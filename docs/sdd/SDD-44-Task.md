# SDD-44 — Tareas

> **SDD:** [SDD-44 — CLI de workspace: N apps, N libs](./SDD-44-cli-de-workspace.md)
> **Paquetes:** `@fudic/cli` (consume `@fudic/config`, que no cambia)
> **Rama:** `sdd-44-cli-de-workspace`
> **Progreso:** 7 / 12
> **Bloqueado por:** [SDD-41](./SDD-41-configuracion-de-aplicacion.md) entera — este SDD escribe
> el `fudic.json` que aquella define y descubre proyectos buscándolo. Y por la **decisión** de
> [SDD-43](./SDD-43-librerias.md) §4.1 —qué publica una librería—, que es lo único que hace falta
> de allí: su fontanería puede ir en paralelo.

Doce tareas. El orden manda en dos puntos:

- **La 1 antes que todo.** El descubrimiento es la pieza que los nueve comandos comparten;
  escribir cualquier generador antes obliga a inventar un destino a mano y a quitarlo después.
- **La 8 después de la 5.** `--project` no se puede probar contra un workspace que todavía no
  tiene dos proyectos que distinguir.

De la 2 a la 7 el orden es el natural —raíz, app, lib— pero no es obligatorio: las tres son
planes independientes sobre plantillas distintas.

---

## Mapa de dependencias

```
1 descubrimiento ──┬──→ 2 raíz ──→ 3 new --workspace ──→ 4 compat
                   │                     │
                   ├──→ 5 g app ─────────┤
                   ├──→ 6 g lib ─────────┤
                   │        └──→ 7 --uses┤
                   │                     │
                   └──→ 8 destino ──→ 9 prefijo por proyecto ──→ 10 lib sin rutas
                                                                      │
                                                      11 el workspace que construye
                                                                      │
                                                                      └→ 12 cierre
```

---

## Fase 1 — el descubrimiento (1)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **`findProjects` y `targetProject`.** Un directorio es un proyecto si tiene `fudic.json`; el barrido poda `node_modules` y `dist` como ya hace `walkFud`. `targetProject` resuelve `--project` primero y el `fudic.json` más cercano **subiendo** desde `cwd` después; **no hay defecto** — sin respuesta, `null`. Un `fudic.json` roto excluye a ese proyecto con su `FUD0720` y no tumba el barrido. Criterio 3 | `cli` | `src/workspace/discover.ts` · `test/workspace/discover.test.ts` |

---

## Fase 2 — la raíz del workspace (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 2 | 1 | **Las plantillas de raíz.** `package.json` privado sin dependencias de producción, `pnpm-workspace.yaml` con `apps/*` y `libs/*`, `tsconfig.base.json` con la config estricta, `.gitignore`, y `fudic-globals.d.ts` **una sola vez** (§4.6). `apps`/`libs` son literales de la CLI y **no** bajan a `@fudic/conventions` | `cli` | `templates/workspace/*` |
| [x] | 3 | 2 | **(rojo primero)** **`fudic new <n> --workspace`.** `planWorkspace` escribe la raíz **y** `apps/<app>/` con el árbol completo que `planNew` ya sabe hacer, más su `fudic.json`. `--app` cambia el nombre de esa primera app. Hoy el flag no existe: se ve fallar. Criterio 1 | `cli` | `src/plans/workspace.ts` · `src/args.ts` · `src/run.ts` |
| [x] | 4 | 3 | **La compatibilidad, afirmada.** `fudic new tienda` **sin** `--workspace` produce **byte a byte** el golden anterior más el `fudic.json` de SDD-41. Es el test que impide que este SDD se lleve por delante el arranque de un solo comando. Y `findProjects` sobre el workspace recién creado devuelve **uno**: la raíz no es un proyecto. Criterios 2, 3 | `cli` | `test/workspace/new-compat.test.ts` |

---

## Fase 3 — apps y librerías (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 5 | 1 | **`fudic g app`.** `planApp` bajo `--dir` (defecto `apps`), con `vite.config.ts`, `sw.json` salvo `--no-sw`, y `fudic.json` con `kind: "app"`, el `--id` **escrito y no derivado** (§4.4) y el `--prefix`. `FUD0780` fuera de un workspace; `FUD0784` si el directorio ya existe. Criterio 4 | `cli` | `src/plans/app.ts` · `templates/` |
| [x] | 6 | 1 | **`fudic g lib`.** `planLib` con `package.json` cuyos `exports` y `files` apuntan a los **`.fud` fuente** (SDD-43 §4.1), `fudic.json` con `kind: "lib"` y **sin `id`**, `tsconfig.json` extendiendo el de la raíz, y `src/components/` vacío. **No** escribe `vite.config.ts`, `sw.json`, `src/routes/` ni layout. `--prefix` es **opcional**: sin él la librería se escribe igual, con un `fudic.json` sin ese campo (§4.5). Criterios 5, 6 | `cli` | `src/plans/lib.ts` · `templates/lib/*` |
| [x] | 7 | 5, 6 | **`--uses`.** Añade `"<scope>/<lib>": "workspace:*"` a las dependencias del proyecto, y **ni un `<link rel="component">`** (§4.7). `FUD0785` cuando nombra algo que no existe o que es una app. Criterio 12 | `cli` | `src/plans/app.ts` · `src/plans/lib.ts` · `src/workspace/uses.ts` |

---

## Fase 4 — el destino de una pieza (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 8 | 5, 6 | **`--project` en los tres generadores.** `component`, `page` y `layout` resuelven su destino con `targetProject` y operan sobre la raíz de **ese** proyecto, no sobre `--cwd`. `FUD0782` con la lista de los que hay; `FUD0781` cuando no contesta ninguna de las dos vías —**y no se escribe nada**. Criterios 9, 10 | `cli` | `src/plans/component.ts` · `src/plans/page.ts` · `src/plans/layout.ts` · `src/args.ts` |
| [ ] | 9 | 8 | **Cada proyecto, su prefijo.** El `tagOf` de SDD-41 se alimenta del config del **proyecto destino**, no del `cwd`: `cd apps/admin && fudic g component card` da `ad-card`, y `--project ui` desde la raíz da `ui-card`. Es donde SDD-41 y este SDD se tocan, y el test lo fija con dos proyectos de prefijos distintos. Criterios 7, 8 | `cli` | `src/plans/component.ts` · `test/generate/prefix-por-proyecto.test.ts` |
| [ ] | 10 | 8 | **Una ruta no cabe en una librería.** `FUD0783` para `g page` con destino `kind: "lib"`; `g layout` sobre una librería es **legal** y escribe el fichero (§4.8, y SDD-40 es el motivo). Criterio 11 | `cli` | `src/plans/page.ts` · `src/plans/layout.ts` |

---

## Fase 5 — la evidencia y el cierre (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 11 | 7, 9, 10 | **El workspace que construye.** Un test que genera con estos comandos —una app, una librería con un componente, la app consumiéndolo con `--uses` y un `<link rel="component">` escrito por `g component --in`— y corre `pnpm install && pnpm build`. **Verde, y el componente de la librería en el HTML de la app.** Es el punto donde este SDD toca a SDD-43: si la resolución entre paquetes no está, este test lo dice con todas las letras en vez de dejarlo para el día del despliegue. Criterio 13 | `cli` | `test/workspace/e2e.test.ts` |
| [ ] | 12 | todas | **Cierre.** `pnpm typecheck`, `pnpm test`, `pnpm build`, y los 14 criterios de §6 verdes — con los dos de «rojo primero» (1 y 3) vistos fallar antes. El código nuevo de `@fudic/cli` al **100 %** en las cuatro métricas y el paquete no por debajo de donde empezó. SDD-44 a `Hecho` en [INDEX.md](./INDEX.md), con su fila y su línea de progreso | — | [INDEX.md](./INDEX.md) |
