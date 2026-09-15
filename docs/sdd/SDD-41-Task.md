# SDD-41 — Tareas

> **SDD:** [SDD-41 — `fudic.json`: la aplicación se declara](./SDD-41-configuracion-de-aplicacion.md)
> **Paquetes:** `@fudic/config` (nuevo) · `@fudic/cli` · `@fudic/vite` · `@fudic/language-server`
> **Rama:** `sdd-41-config-de-aplicacion`
> **Progreso:** 6 / 13

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
1 paquete ──→ 2 lector ──→ 3 tagOf
                              │
                              ├──→ 4 g component ──→ 5 fudic new ──→ 6 FUD0724     (CLI)
                              │
                              ├──→ 7 configResolved ──→ 8 FUD0721                  (plugin)
                              │
                              └──→ 9 por workspace ──→ 10 tabstop ──→ 11 sin diagnóstico (editor)
                                                                          │
                                             12 la evidencia ─────────────┤
                                                                          └→ 13 cierre
```

---

## Fase 1 — el paquete y su lector (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **El paquete.** `@fudic/config` bajo `packages/`, hoja, **sin dependencias de runtime**. `tsconfig.base.json` extendido, `vitest.config.ts` con `thresholds` al **100 en las cuatro** y `coverage.include: ['src/**/*.ts']` desde este commit. Entrada `src/index.ts`, y `CONFIG_FILE = 'fudic.json'` como único sitio donde se deletrea el nombre | `config` | `package.json` · `vitest.config.ts` · `src/index.ts` |
| [x] | 2 | 1 | **El lector.** `readProjectConfig(root, io)` con la `ConfigIo` de dos métodos, calcada de `readSwConfig` (SDD-20). **Nunca lanza**: un `read` que tira produce `FUD0720` y `config: null`. Valida los tres campos por separado y emite **un diagnóstico por campo culpable**; un fichero con un campo malo devuelve `config: null` entero, sin rescatar los buenos (§4.2). Defectos: `kind` → `'app'`, `prefix` → `''`, `id` → `''`. Criterios 1, 2, 3, 4, 6 | `config` | `src/read.ts` · `src/diagnostics.ts` · `test/read.test.ts` |
| [x] | 3 | 2 | **La aritmética del prefijo.** `tagOf(prefix, name)`: pone el guión —y es el único sitio que lo pone, que es lo que impide un `app--card`—, devuelve **intacto** un argumento que ya lleva guión, y devuelve intacto todo si el prefijo es `''`. `tagOf('app','signal-counter')` es `signal-counter`. Propone, no manda (§4.4). Criterio 5 | `config` | `src/tag.ts` · `test/tag.test.ts` |

---

## Fase 2 — la CLI (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 4 | 3 | **(rojo primero)** **`g component` acepta un nombre corto.** El plan lee el config del `cwd` y pasa por `tagOf` antes de `validateTag`; el tag resultante es el que se valida y el que va al wrapper. Un argumento con guión pasa entero, y sin `fudic.json` el comando es el de hoy, `FUD0440` incluido. Se ve fallar primero: hoy `fudic g component card` no escribe nada. Criterios 7, 8 | `cli` | `src/plans/component.ts` · `src/project.ts` · `test/component-prefix.test.ts` |
| [x] | 5 | 4 | **`fudic new` escribe el fichero.** Plantilla `fudic.json.tmpl` y los flags `--id` (defecto: el nombre del proyecto) y `--prefix` (opcional: sin él, el fichero no lo lleva y las herramientas se comportan como hoy). El README de la plantilla dice **por qué el `id` no se cambia nunca** (§4.3). Criterio 9 | `cli` | `templates/fudic.json.tmpl` · `src/plans/new.ts` · `src/args.ts` |
| [x] | 6 | 5 | **`FUD0724`: dos proyectos, un `id`.** Al barrer un workspace buscando `fudic.json`, dos que declaren el mismo `id` es error. Vive en la CLI y **no** en el plugin, por el motivo de §4.7: un build ve un `root` y no puede saberlo. Criterio 10 | `cli` | `src/project.ts` · `test/duplicate-id.test.ts` |

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
| [ ] | 10 | 9 | **El tabstop sale del proyecto.** `COMPONENT_SKELETON` tiene hoy `<${1:app-button}>` con el `app-` escrito a pelo ([`snippets.ts:165`](../../packages/language-server/src/services/snippets.ts#L165)); pasa a salir del `prefix`, y **sin** `fudic.json` sigue siendo `app-button`, el literal de hoy. Sigue siendo un tabstop: lo que el usuario escriba encima manda. Criterio 14 | `language-server` | `src/services/snippets.ts` |
| [ ] | 11 | 10 | **Ningún `.fud` gana un diagnóstico, y un test lo fija.** Un `<signal-counter>` en un proyecto con `prefix: "app"` no publica **nada**. Es el criterio que impide que `FUD0722` vuelva en un tercer borrador. Y `snippets-templates.test.ts` se extiende para comparar **byte a byte** el snippet contra lo que escribe `fudic g component` con el mismo config. Criterios 13, 14 | `language-server` | `test/no-prefix-diagnostic.test.ts` · `test/snippets-templates.test.ts` |

---

## Fase 5 — la evidencia y el cierre (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 12 | 6, 8, 11 | **`examples/basic` se declara.** `fudic.json` con `id: "basic"` y `prefix: "app"`, y **ni un componente renombrado**: `bus-log`, `signal-counter`, `product-list`, `shopping-cart` y `site-nav` se quedan exactamente como están y el build sigue verde. Eso **es** el criterio — el prefijo cambia lo que se propone al crear el siguiente y no toca a los diecinueve que ya hay. Criterio 16 | `example-basic` | `fudic.json` |
| [ ] | 13 | todas | **Cierre.** `pnpm typecheck`, `pnpm test`, `pnpm build`, y los 17 criterios de §6 verdes — con los tres de «rojo primero» (3, 7, 12) vistos fallar antes. `@fudic/config` al **100 %** en las cuatro métricas; `cli`, `vite` y `language-server` no por debajo de donde empezaron. SDD-41 a `Hecho` en [INDEX.md](./INDEX.md), con su fila en la tabla maestra y su línea en el registro de progreso | — | [INDEX.md](./INDEX.md) |
