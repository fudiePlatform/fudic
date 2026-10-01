# SDD-50 — Tareas

> **SDD:** [SDD-50 — Los diagnósticos tienen casa](./SDD-50-diagnosticos.md)
> **Paquetes:** `@fudic/diagnostics` (nuevo) · `@fudic/compiler` · `@fudic/language-core` ·
> `@fudic/language-server` · `@fudic/formatter` · `@fudic/resolve` · `@fudic/config` ·
> `@fudic/cli` · `@fudic/vite` · `fudic-vscode`
> **Rama sugerida:** `sdd-50-diagnosticos`
> **Progreso:** 21 / 21 — `Hecho`.

**Por decisión de Pedro, esta sesión escribe el código y no los tests.** Los tests nuevos, el
suelo de cobertura y las guardas (fase 6) los hace otra sesión en este mismo worktree y rama.
Esta sesión entrega con `pnpm typecheck` y `pnpm build` en verde.

**El orden manda en dos puntos.**

- **El paquete (fase 1) va antes que la migración.** Cada migración llama a funciones que ya
  existen; no se escribe un constructor «provisional» en cada paquete.
- **Un `.ts` nunca nace sin su `.md`.** Quien migra un código escribe su explicación en la misma
  tarea. Dejar los `.md` para el final son 244 explicaciones escritas sin el código delante.

**La red de toda la migración:** los tests existentes de cada paquete pasan **sin cambiar una
expectativa** de código, mensaje, severidad ni span. Si una falla, el defecto está en la
migración, no en el test. La única excepción son `FUD0725`/`FUD0726` (tarea 13).

---

## Mapa de dependencias

```
1 inventario ──→ 2 paquete ──→ 3 span y LineMap ──→ 4 constructores, docs, render y format
                                                                 │
        ┌────────────────────────────────────────────────────────┤
        ▼                                                        ▼
5 lexer/parser ──→ 6 construcciones ──→ 7 semántica ──→ 8 emit ──→ 9 helpers fuera
                                                                     │
        10 language-core ──→ 11 language-server ──→ 12 bombilla ◄────┤
        13 resolve y config · 14 formatter · 15 cli · 16 vite ◄──────┘
                                                                     │
        17 retirados ──→ 18 index y docs del repo ──→ 19 entrega ◄───┘
        20 tests y guardas (otra sesión) ──→ 21 cierre
```

---

## Fase 1 — el paquete (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **El inventario.** Todos los códigos de `packages/*/src` y del catálogo: vivo / retirado / reservado sin usar, severidad, forma (fuente, fichero, proyecto) y dónde se emite. Los que salen **con dos severidades** se paran y se preguntan; los de **varios mensajes** se modelan con un parámetro (SDD §3.2). Apuntado aquí abajo | — | este Task |
| [x] | 2 | — | **El paquete.** `package.json` sin dependencias de runtime, `"sideEffects": false`, `"fudic": { "docs": "http://localhost:8080/diagnostic" }` y los `.md` en `files`; `tsconfig` que extiende la base con `resolveJsonModule`; `vitest.config.ts` con `include: ['src/**/*.ts']` y umbrales al 100 en las cuatro. Criterio 1 | `diagnostics` | `package.json` · `tsconfig*.json` · `vitest.config.ts` |
| [x] | 3 | 2 | **Span y `LineMap` se mudan.** `Span`, `span`, `emptySpan`, `RelatedLocation`, `Severity`, `LineMap`, `Position`, `Range` salen del compilador; el compilador los reexporta. `Diagnostic` del compilador pasa a alias de `SourceDiagnostic` | `diagnostics` · `compiler` | `src/span.ts` · `src/linemap.ts` · `compiler/src/types/**` · `compiler/src/sourcemap/**` |
| [x] | 4 | 3 | **Lo que construye y lo que pinta.** Las tres formas y las dos entradas; `source`, `file`, `project` sin exportar; `DOCS_BASE` leído del `package.json`; `render` y `format` con línea y columna 1-based, frame y enlace. Criterios 8, 9, 12 | `diagnostics` | `src/types.ts` · `src/make.ts` · `src/docs.ts` · `src/render.ts` |

## Fase 2 — el compilador (5)

Cada tarea: por cada código de su zona, `codes/FUDnnnn.ts` + `codes/FUDnnnn.md`, y las llamadas
cambiadas a la función. Mensaje movido tal cual.

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 5 | 4 | **Lexer y parser.** Balanceador, lexer, parser HTML, regiones, modos | `compiler` · `diagnostics` | `src/balancer/**` · `src/lexer/**` · `src/html/**` · `src/region/**` · `src/types/mode.ts` · `src/constructs.ts` |
| [x] | 6 | 5 | **Las construcciones.** Control de flujo, bindings, `@code`, CSS, documento, Oxc | `compiler` · `diagnostics` | `src/control/**` · `src/binding/**` · `src/code/**` · `src/css/**` · `src/document/**` · `src/oxc/**` |
| [x] | 7 | 6 | **La semántica.** Todos los analizadores y `semantic/` | `compiler` · `diagnostics` | `src/semantic/**` |
| [x] | 8 | 7 | **El emit.** `emit/`, `layout/`, `snippet/`, `expand/` | `compiler` · `diagnostics` | `src/emit/**` · `src/layout/**` · `src/snippet/**` · `src/expand/**` |
| [x] | 9 | 8 | **Los helpers fuera.** `errorDiag`, `relatedError`, `warningDiag`, `infoDiag`, `hintDiag` borrados; el compilador no contiene ningún literal `'FUDnnnn'`. Criterio 6 | `compiler` | `src/types/diagnostic.ts` |

## Fase 3 — el editor (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 10 | 9 | **`language-core`**: sus códigos de proyección, plantilla y CSS | `language-core` · `diagnostics` | `src/**` |
| [x] | 11 | 10 | **`language-server`**: sus códigos, y `docs` publicado como `codeDescription.href`. Criterio 10 | `language-server` · `diagnostics` | `src/**` |
| [x] | 12 | 11 | **La bombilla.** «Explain FUDnnnn» sobre todo diagnóstico `FUD`, que abre su `.md` en la vista previa de markdown (comando interno `fudic.explain` de la extensión). El build de la extensión copia los `.md` a `dist/codes/`, junto al servidor empaquetado, que es donde `@fudic/diagnostics/explain` los busca cuando corre en el bundle. Criterio 11 | `language-server` · `vscode` | `src/services/**` · `vscode/src/**` · `vscode/scripts/**` |

## Fase 4 — el build y la CLI (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 13 | 9 | **`resolve` y `config`**, con la **renumeración**: los `FUD0720`/`0721` de config pasan a `FUD0725`/`0726`. `ConfigDiagnostic` y su copia de `Span` fuera; los de SDD-42 que viven en config (`FUD0740`/`0741`) también migran | `resolve` · `config` · `diagnostics` | `src/**` |
| [x] | 14 | 9 | **`formatter`**: `FUD0480`–`0482`, constantes `FUD_*` fuera | `formatter` · `diagnostics` | `src/**` |
| [x] | 15 | 9 | **`cli`**: constantes `FUD_*` fuera; `CliError` contiene el diagnóstico; texto de terminal con `format`. `FUD0761` es el mismo fichero que usa el build | `cli` · `diagnostics` | `src/**` |
| [x] | 16 | 9 | **`vite`**: `FudicDiagnostic` y constantes `FUD_*` fuera; mensajes con `format`. Pasar `loc`/`frame` a Vite **no** es de aquí (SDD-35) | `vite` · `diagnostics` | `src/**` |

## Fase 5 — la entrega (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 17 | 1 | **Los retirados.** Un `.md` de retirado por cada código retirado o quemado del inventario, con su sustituto. Sin `.ts` | `diagnostics` | `src/codes/*.md` |
| [x] | 18 | 5–17 | **`index.ts` y los docs del repo.** `index.ts` completo y en orden; SDD-12 §5 apunta a `codes/` como catálogo; SDD-41 y SDD-12 anotan la renumeración; `CLAUDE.md`: un código nuevo es un fichero nuevo en `@fudic/diagnostics`. Criterio 16 | `diagnostics` · — | `src/index.ts` · `docs/sdd/**` · `.claude/CLAUDE.md` |
| [x] | 19 | 18 | **Entrega a Pedro.** `pnpm typecheck` y `pnpm build` verdes; un `.fud` roto en `examples/basic` enseña el formato nuevo en la terminal de `dev`/`build` y la bombilla en el editor | — | — |

## Fase 6 — tests y cierre (otra sesión) (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 20 | 19 | **Tests y guardas.** Suelo de cobertura medido en `main` de cada paquete tocado; los tests existentes sin cambiar una expectativa (salvo `FUD0725`/`0726`); tests de `render`, `format`, `DOCS_BASE` y la bombilla; barrido de `codes/` contra `index.ts`; forma de cada `.md`; ningún literal `'FUDnnnn'` fuera de `diagnostics`; parámetros que faltan o sobran no compilan; bundle de rolldown con solo `FUD0050`. Criterios 2–5, 7–13 | todos | `test/**` |
| [x] | 21 | 20 | **Cierre.** `pnpm typecheck`, `pnpm test`, `pnpm build`; `@fudic/diagnostics` al 100 % en las cuatro y ningún paquete bajo su suelo. SDD-50 a `Hecho` en [INDEX.md](./INDEX.md). Criterios 14, 15 | — | [INDEX.md](./INDEX.md) |

---

## Para la sesión de tests (tarea 20)

Estado al entregar: `pnpm build` verde (ejemplos incluidos) y **todo `src` sin errores de
tipos**. `pnpm -r --no-bail typecheck` da 75 errores, **todos en 38 ficheros de `test/`** que
importan lo que la migración quitó:

- **Constantes y tipos borrados:** los `FUD_*` de vite, cli, config, formatter, el compilador
  (`css/flatten`, `css/rules`, `emit/prune`, `emit/styles-lint`, `binding/adopt`) y el servidor;
  `FudicDiagnostic` (vite), `ConfigDiagnostic` (config), `ProjectResult.warnings` (vite), los
  helpers `errorDiag`/`warningDiag`/`infoDiag`/`hintDiag`/`relatedError` del compilador; los
  ficheros `language-server/src/diagnostics.ts`, `formatter/src/diagnostics.ts` y
  `config/src/diagnostics.ts`; `cliError` y `FUD_DUPLICATE_TAG` de la CLI. Un test que los
  importa pasa a llamar a la función del código en `@fudic/diagnostics`, o a comparar el string.
- **Cambios de forma pedidos por la spec:** los diagnósticos de `vite`, `cli` y `config` ganan
  `severity`; `CliError` es ahora `FileDiagnostic | ProjectDiagnostic`; el `--json` de la CLI
  lleva `severity`. El LSP lleva `codeDescription.href`. La bombilla añade «Explain FUDnnnn» a
  todo diagnóstico `FUD`, así que los tests que cuentan acciones ven una más por código.
- **Texto de terminal:** vite y la CLI imprimen con `format` (`ruta:línea:col - error FUDnnnn:
  mensaje`, la línea subrayada y el enlace), no `[FUDnnnn] mensaje (fichero)`.
- **Renumerados:** `0720`/`0721` de config → `0725`/`0726`; `0440`–`0445` de layouts/snippets →
  `0890`–`0895`; `FUD0725` es `error` en el build.
- **Spans que se mueven a `@fudic/diagnostics`:** los tests de `Span` y `LineMap` del compilador
  (`test/types/span.test.ts`, `test/sourcemap/*`) siguen pasando por la reexportación, pero son
  de ese paquete y se mueven con él.

Decidido al implementar: el código `FUD0761` (dos componentes con el mismo tag) es una función
con dos formas tipadas, `kind: 'link'` (fuente, en el build) y `kind: 'library'` (proyecto, en la
CLI). Las tres tablas de lectura por código (`REPAIRS`, `KEY_RULES`, `BROKEN_SOURCE`) quedan como
literales `FudCode` (SDD §5, invariante 1). El plugin ya no busca `FUD0806` por valor: decide error
o aviso por `severity`.

## Lo que hizo la sesión de tests (tareas 20 y 21)

**Suelo de cobertura**, medido en `main` (`5af24c9`) y al cerrar (stmts / branches / funcs / lines):

| paquete | `main` | al cerrar |
|---|---|---|
| `diagnostics` (nuevo) | — | 100 / 100 / 100 / 100 |
| `compiler` | 99,51 / 98,84 / 99,67 / 99,83 | 99,51 / 98,85 / 99,67 / 99,84 |
| `vite` | 97,05 / 92,66 / 97,65 / 96,96 | 97,07 / 92,87 / 97,92 / 96,98 |
| `cli` | 95,96 / 93,11 / 95,37 / 97,33 | 95,96 / 93,34 / 95,88 / 97,39 |
| `config`, `resolve`, `formatter`, `language-core`, `language-server`, `vscode` | 100 | 100 |

En `compiler`, `vite` y `cli` la migración no dejó una línea nueva sin cubrir salvo tres en
`vite`. Pero los ficheros encogieron al irse las constantes, y las mismas líneas sin cubrir
pesaban más. Se recuperó con tests de líneas que ya estaban sin cubrir en `main`:
`<link rel="snippet">` en el `<head>` de una página, `resolveHref`, `devClientUrl`,
`strategy()` sin argumento y `prerenderEnumerated` sin `paths()`.

**Los tests existentes** pasan con estos cambios, todos previstos por la spec: las
renumeraciones (`0440`–`0445` → `0890`–`0895`, `0720`/`0721` de config → `0725`/`0726`), `FUD0725`
como error en el build, las constantes `FUD_*` cambiadas por el string, «Explain» en las
bombillas, el texto de terminal de `format` y `@fudic/diagnostics` como dependencia del
compilador. Los tests de `Span` y `LineMap` se movieron a `diagnostics`, y el de los helpers
borrados (`errorDiag`…) se borró con ellos.

**Un defecto arreglado.** Las hojas de `fudic.json` (`FUD0743`, `FUD0854`) metían
`ruta:línea:col:` en el mensaje, y con `format` la terminal decía la posición dos veces. Ahora
el diagnóstico lleva su span, y `reportText` lee el fichero relativo a la raíz para pintar
línea, columna y frame (`vite/src/styles.ts`, `vite/src/report.ts`).

**Criterio 13** con `FUD0051`: `FUD0050` está retirado y no tiene función que importar.
**`explanationsDir(from?)`** recibe la URL del módulo para que un test cubra el caso
`dist/src` y el del bundle.

## Inventario (tarea 1)

Completo en [SDD-50-inventario.md](./SDD-50-inventario.md): 213 códigos con sitio de emisión,
cada sitio con `fichero:línea`, mensajes literales, retirados y búsquedas por código.

Decisiones de Pedro sobre lo que salió:

- **Colisión `FUD0440`–`0445`** (CLI contra SDD-48): los de SDD-48 pasan a `FUD0890`–`0895`
  (SDD §4.6.b).
- **`FUD0725`** (el `fudic.json` roto, antes `FUD0720` de config) es `error` también en el build,
  que lo rebajaba a aviso.

Encontrado y fuera de alcance (no se toca aquí): `FUD0365` y `FUD0390` se construyen y el
plugin los descarta sin reportarlos (`plugin.ts`, lectura de opciones y de `swconfig`).

**Los tests que cambian por decisión, no por defecto** (para la sesión de tests): las
renumeraciones (`0720`/`0721` de config, `0440`–`0445` de SDD-48) y la severidad de `FUD0725` en
el build; y los diagnósticos de `vite`, `cli` y `config`, que **ganan `severity`** al pasar a
`FileDiagnostic`/`ProjectDiagnostic` (hoy no la llevan y el plugin la decide aparte).
