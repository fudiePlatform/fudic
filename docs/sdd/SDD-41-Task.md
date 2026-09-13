# SDD-41 — Tareas

> **SDD:** [SDD-41 — `fudic.json`: la aplicación se declara](./SDD-41-configuracion-de-aplicacion.md)
> **Paquetes:** `@fudic/config` (nuevo) · `@fudic/cli` · `@fudic/vite` · `@fudic/language-server`
> **Rama:** `sdd-41-config-de-aplicacion`
> **Progreso:** 0 / 13

Trece tareas. Cada una es un paso cerrado: se puede parar después de cualquiera con el
workspace verde, porque §4.1 del SDD garantiza que un proyecto sin `fudic.json` se comporta
como antes — y hasta la tarea 12 no hay ninguno que lo tenga.

**El orden manda en un punto y solo en uno:** las tareas **1–3 antes que todo**. Los tres
consumidores llaman a la misma función, y escribir cualquiera de ellos contra una firma que
todavía no existe es escribir tres lectores para después fundirlos. Después de la fase 1, las
fases 2, 3 y 4 **no dependen entre sí** y pueden ir en el orden que convenga.

---

## Mapa de dependencias

```
1 paquete ──→ 2 lector ──→ 3 tagOf/prefixOf
                              │
                              ├──→ 4 g component ──→ 5 fudic new ──→ 6 FUD0724     (CLI)
                              │
                              ├──→ 7 configResolved ──→ 8 FUD0721                  (plugin)
                              │
                              └──→ 9 por workspace ──→ 10 FUD0722 ──→ 11 snippet   (editor)
                                                                          │
                                             12 la evidencia ─────────────┤
                                                                          └→ 13 cierre
```

---

## Fase 1 — el paquete y su lector (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 1 | — | **El paquete.** `@fudic/config` bajo `packages/`, hoja, **sin dependencias de runtime**. `tsconfig.base.json` extendido, `vitest.config.ts` con `thresholds` al **100 en las cuatro** y `coverage.include: ['src/**/*.ts']` desde este commit. Entrada `src/index.ts`, y `CONFIG_FILE = 'fudic.json'` como único sitio donde se deletrea el nombre | `config` | `package.json` · `vitest.config.ts` · `src/index.ts` |
| [ ] | 2 | 1 | **El lector.** `readProjectConfig(root, io)` con la `ConfigIo` de dos métodos, calcada de `readSwConfig` (SDD-20). **Nunca lanza**: un `read` que tira produce `FUD0720` y `config: null`. Valida los tres campos por separado y emite **un diagnóstico por campo culpable**; un fichero con un campo malo devuelve `config: null` entero, sin rescatar los buenos (§4.2). Defectos: `kind` → `'app'`, `id` → `''`. **`prefix` no tiene defecto**: ausente es `FUD0720`, porque todo componente lleva prefijo y lo único que un proyecto puede declarar es cuál (§4.4). Criterios 1, 2, 3, 4, 6 | `config` | `src/read.ts` · `src/diagnostics.ts` · `test/read.test.ts` |
| [ ] | 3 | 2 | **La aritmética del prefijo.** `tagOf(prefix, name)` — pone el guión, y es el único sitio que lo pone, que es lo que impide un `shop--card` — y `prefixOf(tag)`, el primer segmento. El argumento de `tagOf` es un **nombre y nunca un tag**: `tagOf('shop', 'icon-button')` es `shop-icon-button`, **no** `icon-button`. Sin escotilla, y es el punto (§4.4). Criterio 5 | `config` | `src/tag.ts` · `test/tag.test.ts` |

---

## Fase 2 — la CLI (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 4 | 3 | **(rojo primero)** **`g component` toma un nombre, no un tag.** El plan lee el config del `cwd` y expande con `tagOf` antes de `validateTag`; el tag expandido es el que se valida y el que va al wrapper. Sin `fudic.json` el comando es el de hoy, `FUD0440` incluido. Se ve fallar primero: hoy `fudic g component card` no escribe nada. Criterios 7, 8 | `cli` | `src/plans/component.ts` · `src/project.ts` · `test/component-prefix.test.ts` |
| [ ] | 5 | 4 | **`fudic new` escribe el fichero.** Plantilla `fudic.json.tmpl` y los flags `--id` (defecto: el nombre del proyecto) y **`--prefix`, obligatorio** — sin él el comando falla, porque escribiría un fichero que no valida. El README de la plantilla dice **por qué el `id` no se cambia nunca** (§4.3). Criterio 9 | `cli` | `templates/fudic.json.tmpl` · `src/plans/new.ts` · `src/args.ts` |
| [ ] | 6 | 5 | **`FUD0724`: dos proyectos, un `id`.** Al barrer un workspace buscando `fudic.json`, dos que declaren el mismo `id` es error. Vive en la CLI y **no** en el plugin, por el motivo de §4.7: un build ve un `root` y no puede saberlo. Criterio 10 | `cli` | `src/project.ts` · `test/duplicate-id.test.ts` |

---

## Fase 3 — el plugin (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 7 | 3 | **La lectura en `configResolved`.** Junto a `readSwConfig`, con la misma `ConfigIo` de `node:fs`. El `id` queda disponible para quien lo necesite — hoy nadie, BUG-33 mañana. Los diagnósticos salen por `this.warn` / `this.error` como los de `resolveOptions`. **`FudicOptions` no se toca** | `vite` | `src/plugin.ts` · `src/config.ts` |
| [ ] | 8 | 7 | **`FUD0721`: `sw.json` sin `id`.** Error que rompe el build. Y su contrario en verde: sin `sw.json` y sin `id`, build limpio y cero diagnósticos de este rango — que es el caso de todo proyecto existente. Criterios 11, 12 | `vite` | `src/plugin.ts` · `test/config-id.test.ts` |

---

## Fase 4 — el editor (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 9 | 3 | **Un config por workspace folder**, leído en `initialize` y revalidado por `didChangeWatchedFiles` — el canal que ya mantiene al `WorkspaceIndex`, no uno nuevo. `fudic.json` entra en el patrón vigilado. Criterio 15 | `language-server` | `src/workspace-index.ts` · `src/server.ts` · `src/project-config.ts` |
| [ ] | 10 | 9 | **`FUD0722` y su bombilla.** **Error** sobre el span del wrapper host cuando el primer segmento del tag no es el `prefix` declarado. Error y no warning porque el hecho es totalmente decidible —el tag está en el fichero y el proyecto ha dicho cuál tiene que ser— y un aviso ignorable sobre algo sin excepciones es un aviso que nadie lee. Lo emite el servidor y **nadie más** (§4.8). La acción de código es la de renombrar, hermana de las de SDD-36. Criterio 13 | `language-server` | `src/services/compiler-diagnostics.ts` · `src/services/actions.ts` |
| [ ] | 11 | 10 | **El snippet, prefijado.** El snippet `component` propone el tag ya con prefijo, y `snippets-templates.test.ts` se extiende para comparar **byte a byte** contra lo que escribe `fudic g component` con el mismo config. Es la nota de `snippets.ts` puesta a prueba con una variable más. Criterio 14 | `language-server` | `src/services/snippets.ts` · `test/snippets-templates.test.ts` |

---

## Fase 5 — la evidencia y el cierre (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 12 | 6, 8, 11 | **`examples/basic` se declara.** `fudic.json` con `id: "basic"` y `prefix: "app"`. Los componentes que no empiezan por `app-` —`bus-*`, `signal-*`, `product-list`, `shopping-cart`, `site-nav`— **rompen el build** con `FUD0722`: primero se ve romper, y después se renombran a `app-*` con sus `<link rel="component">`. Es la evidencia de que la regla muerde, y de que la bombilla repara. Criterio 16 | `example-basic` | `fudic.json` · `src/components/*.fud` · los `<link rel="component">` que los enlazan |
| [ ] | 13 | todas | **Cierre.** `pnpm typecheck`, `pnpm test`, `pnpm build`, y los 17 criterios de §6 verdes — con los tres de «rojo primero» (3, 7, 12) vistos fallar antes. `@fudic/config` al **100 %** en las cuatro métricas; `cli`, `vite` y `language-server` no por debajo de donde empezaron. SDD-41 a `Hecho` en [INDEX.md](./INDEX.md), con su fila en la tabla maestra y su línea en el registro de progreso | — | [INDEX.md](./INDEX.md) |
