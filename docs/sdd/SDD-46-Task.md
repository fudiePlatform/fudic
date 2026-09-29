# SDD-46 — Tareas

> **SDD:** [SDD-46 — Estilos a elección](./SDD-46-estilos-a-eleccion.md)
> **Paquetes:** `@fudic/config` · `@fudic/compiler` · `@fudic/vite` · `@fudic/language-server` ·
> `@fudic/cli` · `@fudic/example-basic` · `examples/workspace`
> **Rama:** `worktree-SDD-46-estilos-a-eleccion`
> **Progreso:** 11 / 17

Se implementó al revés de lo habitual, por decisión expresa: primero el código y la migración de
los ejemplos, para que Pedro lo probara en el navegador y en el editor; después este documento; y
los tests y la cobertura en otra sesión. Las fases 1–6 están cerradas; la 7 es esa sesión.

Lo único escrito como test hasta ahora: los tests de config y de Vite que tocaban la forma vieja
se adaptaron **para que compilen** (sin ejecutar la batería), y tres casos del editor en
`template-attrs.test.ts`, que se escribieron para demostrar el fallo de la tarea 7 y pasan.

---

## Fase 1 — la configuración (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **Los dos mapas.** `globalStyles` y `styles` como `{ nombre: ruta }`, `NamedStyle`, `STYLE_NAME_PATTERN` sin guion; el array viejo es `FUD0720` con el mensaje que dice dónde va cada cosa | `config` | `src/read.ts` · `src/constants.ts` |
| [x] | 2 | 1 | **Leer las hojas.** `readProjectStyles` devuelve `global` y `optional` con el nombre como especificador; `FUD0741` para un nombre en los dos mapas; `specifierOf` desaparece | `config` | `src/styles.ts` · `src/index.ts` |

## Fase 2 — el compilador (1)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 3 | — | **El atributo del template.** `adoptedStylesOf` lee los nombres con su span, sin repetidos; `FUD0745` si no es literal, reportado en el analizador del template raíz | `compiler` | `src/binding/adopt.ts` · `src/semantic/analyzers/form-associated-placement.ts` |

## Fase 3 — el build (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 4 | 2 | **La cadena con dos listas.** `StylesResult` con `global`/`optional`; `ProjectStyleChains.choosableFor`; `FUD0741` compartido entre las dos listas y entre paquetes | `vite` | `src/styles.ts` · `src/plugin.ts` |
| [x] | 5 | 3, 4 | **La lista por componente.** Globales + elegidas en orden + propia; se sube solo lo que la página usa; `FUD0744` sobre la palabra, en el transform del propio componente | `vite` | `src/transform.ts` |

## Fase 4 — el editor (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 6 | 3 | **Ofrecer y comprobar.** El atributo en el template raíz con su ficha; dentro del valor, los `styles` del `fudic.json` más cercano que faltan; `FUD0744` al escribir; la búsqueda del más cercano se invalida con cualquier `fudic.json` | `language-server` | `src/project-config.ts` · `src/services/template-attrs.ts` · `src/services/plugin.ts` |
| [x] | 7 | 6 | **Arreglo tras la prueba de Pedro.** El servicio que responde dentro de los valores se creaba sin la configuración y la lista salía vacía; ahora la recibe y cada ítem reemplaza solo la palabra | `language-server` | `src/server.ts` · `src/services/plugin.ts` |

## Fase 5 — la migración (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 8 | 1 | **La CLI.** El proyecto que genera `g app` lleva los dos mapas vacíos | `cli` | `src/plans/app.ts` |
| [x] | 9 | 5 | **Los ejemplos.** `examples/basic` (y `nosw`) parte su guía en `theme` global y `panel` a elección en 16 componentes; las cuatro `fudic.json` de `examples/workspace` pasan a `globalStyles` | ejemplos | `fudic.json` · `src/styles/*.css` · `src/components/*.fud` |

## Fase 6 — la evidencia (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 10 | 9 | **Build y typecheck verdes**, y el HTML emitido comprobado: `theme panel <tag>` donde se elige, `panel` en 10 de 18 páginas. Criterio 15 | — | — |
| [x] | 11 | 7, 10 | **Pedro en navegador y editor.** Criterio 15 | — | — |

## Fase 7 — tests y cobertura (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 12 | 2 | **Config.** Criterios 1–3; completar `styles.test.ts` (ya adaptado) y el test del lector | `config` | `test/styles.test.ts` · `test/read.test.ts` |
| [ ] | 13 | 3 | **Compilador.** Criterios 4–5 | `compiler` | `test/binding/adopt.test.ts` · test del analizador |
| [ ] | 14 | 5 | **Build.** Criterios 6–10, en servidor y en cliente; poner al día los tests de emit que esperan `_theme` y los de `style-chains` con cadenas de librería | `vite` · `compiler` | `test/styles.test.ts` · `test/style-chains.test.ts` · `compiler/test/emit/*` |
| [ ] | 15 | 7 | **Editor.** Criterios 11–14 (12 y 13 ya tienen caso en `template-attrs.test.ts`); el recuento de atributos del template y `project-config.test.ts` | `language-server` | `test/services/template-attrs.test.ts` · `test/project-config.test.ts` |
| [ ] | 16 | 12–15 | **`pnpm test` verde y cobertura.** Criterio 16: ficheros nuevos al 100 %, ninguno existente por debajo de su suelo en `main` | todos | — |

## Cierre (1)

| ✓ | # | dep | tarea |
|---|---|---|---|
| [ ] | 17 | 16 | `pnpm typecheck`, `pnpm test` y `pnpm build` verdes; SDD-46 a `Hecho` en la tabla y el registro del `INDEX.md` |
