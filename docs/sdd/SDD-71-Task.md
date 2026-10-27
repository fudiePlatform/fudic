# SDD-71 — Tareas

> **SDD:** [SDD-71 — Pipes sin i18n y pipes del usuario](./SDD-71-pipes-del-usuario.md)
> **Paquetes:** `@fudic/core` · `@fudic/i18n` · `@fudic/conventions` · `@fudic/config` ·
> `@fudic/api` · `@fudic/compiler` · `@fudic/language-core` · `@fudic/vite` · `@fudic/cli` ·
> `@fudic/diagnostics` · `examples/basic` · `examples/workspace`
> **Rama:** `sdd-71-pipes-del-usuario`. Nace de `main` **con SDD-61 en `Hecho`**: enmienda su
> §3.9 y su anexo, y migra el reloj que ella escribió.
> **Progreso:** 0 / 24 — `Listo`.

**Dos sesiones.** Una implementa y coordina. La otra escribe los tests de cada fase (las tareas
«Los tests de…») contra los criterios de SDD §6. Si un test destapa un defecto, se corrige el
código, no el test.

**El orden manda en dos puntos.**

- **La mudanza antes que los pipes del usuario.** El `Pipe<T>` con `format` (fase 1) es el tipo
  que devuelve `implement` (fase 2).
- **La prueba de bytes al final de la fase 3.** El criterio 10 solo dice algo con el emit nuevo y
  la carpeta de pipes fuera de las raíces.

---

## Mapa de dependencias

```
1 conventions ─→ 2 config: locales y pipes ─→ 3 FUD1340 y FUD1021 retirado
   │
4 Pipe y presets en core ─→ 5 locale y format en core ─→ 6 i18n sin pipes ─→ 7 tests
   │
8 pipe en el parser ─→ 9 validación ─→ 10 emit de fudic:pipes ─→ 11 índice y editor ─→ 12 tests
   │
13 emit p.format ─→ 14 la vista importa de pipes ─→ 15 carpeta fuera de las raíces ─→ 16 piezas publicadas ─→ 17 tests
   │
18 --locale ─→ 19 lang de layout y página ─→ 20 g pipe ─→ 21 lib exporta pipes ─→ 22 tests
   │
23 migración y ejemplos ─→ 24 anexo, README, entrega y cierre
```

---

## Fase 1 — el idioma y la mudanza (7)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 1 | — | **Las convenciones.** `DEFAULT_LOCALE = 'en'` y `PIPES_DIR = 'src/pipes'` (SDD §3.1) | `conventions` | `src/index.ts` |
| [ ] | 2 | 1 | **La configuración.** En una app, `locales` ausente es `[DEFAULT_LOCALE]` y deja de ser opcional en `ProjectConfig`; `"pipes"` con `readFolder`. En una librería, `locales` se ignora como hoy | `config` | `src/read.ts` |
| [ ] | 3 | — | **Los códigos.** `FUD1340` (`.ts`, `.md`, línea en `index.ts`); `FUD1021` retirado (`.ts` borrado, `.md` como `retired`). El rango en la fila de SDD-71 del `INDEX.md` | `diagnostics` | `src/codes/FUD1340.{ts,md}` · `src/codes/FUD1021.*` · `src/index.ts` |
| [ ] | 4 | — | **`Pipe` y los seis presets en `core`.** `Pipe<T>` con `kind`, `name?`, `options` y `format`; cada preset con solo su `Intl.*Format`, cacheado por idioma dentro del preset (SDD §3.4) | `core` | `src/pipe.ts` · `src/index.ts` |
| [ ] | 5 | 4 | **`locale` y `format` en `core`.** Los nombres que sustituye el compilador se mudan; lanzan `compiled away` fuera de él, como en SDD-58 | `core` | `src/compiled-away.ts` · `src/index.ts` |
| [ ] | 6 | 4, 5 | **`i18n` sin pipes.** Fuera `pipe.ts`, `runtime/format.ts`, `$format` y las exportaciones de §4.8; sin reexportación | `i18n` | `src/index.ts` · `src/pipe.ts` · `src/runtime/*` |
| [ ] | 7 | 2–6 | **Los tests de la fase.** Criterios 1 y 2 (lectura y formato) | `config` · `core` · `i18n` | `test/**` |

## Fase 2 — `pipe` en el `.fudapi` (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 8 | — | **El parser.** `pipe <nombre>` con `on <tipo>+` y parámetros, como extensión; nodo `PipeDecl` con spans; sin lanzar (SDD §3.2, §5) | `api` | `src/ast.ts` · `src/extensions.ts` · `src/parse.ts` |
| [ ] | 9 | 3, 8 | **La validación.** `FUD1340` sin `on`; `FUD1078` mezclado con un contrato; `FUD1081` repetido; tipos de `on` y de los parámetros como los de SDD-60 | `api` | `src/validate.ts` · `src/types-check.ts` |
| [ ] | 10 | 4, 8 | **Lo generado.** `fudic:pipes/<id>` y su `.d.ts`: `<N>Args`, `<N>Format` y `implement`, con y sin parámetros (SDD §3.3). El módulo de un fichero con solo pipes importa `@fudic/core` y nada más | `api` · `vite` | `src/emit/declarations.ts` · `src/emit/module.ts` · `src/api-modules.ts` |
| [ ] | 11 | 8 | **El índice y el editor.** Hover con la documentación, definición y completado bajo `pipe` y tras `on`; tocar el `.fudapi` revalida las vistas que lo importan | `api` · `language-server` | `src/index-api.ts` · `src/*` |
| [ ] | 12 | 8–11 | **Los tests de la fase.** Criterios 5, 6, 7 y 15 | `api` · `language-server` · `vite` | `test/**` |

## Fase 3 — la vista y el navegador (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 13 | 4 | **El emit.** `a \| p` y `format(a, p)` se emiten como `p.format(a, "<idioma>")`; fuera `$format` de `localize.ts`, de `I18N_PIECES` y del import de `@fudic/i18n` que escribe la expansión. `$Pipe<T>` gana `format` en `GLOBALS_DTS` | `compiler` · `language-core` | `src/i18n/localize.ts` · `src/semantic/delegation.ts` · `src/emit/oxc-code.ts` · `src/globals.ts` |
| [ ] | 14 | 2 | **La vista importa de la carpeta de pipes** (decisión 171). El `export default` de un fichero de esa carpeta, o el `pipes/*` de una librería, vale en el corte; solo a la derecha de `\|` o llamado en una `const` con un literal de datos; lo demás, `FUD1150` | `compiler` · `typecheck` | `src/semantic/analyzers/*` |
| [ ] | 15 | 2, 10 | **Fuera de las raíces.** La carpeta de pipes no entra en ningún `import.meta.glob` de `api-root.ts`, aunque esté configurada dentro de `src/browser` o `src/server` | `vite` | `src/api-root.ts` · `src/plugin.ts` |
| [ ] | 16 | 4 | **Una pieza publicada por preset.** El linker publica solo los presets que algún módulo importa (SDD-45) | `core` · `vite` | `src/runtime-entry.ts` · `src/*` |
| [ ] | 17 | 13–16 | **Los tests de la fase.** Criterios 8–12, con el de bytes sobre un `dist` real | `compiler` · `vite` | `test/**` |

## Fase 4 — la CLI (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 18 | 2 | **`--locale`** en `new` y `g app`, normalizado; `FUD0725` con `problem: 'flag'`; sin él no se escribe la clave; `unknown-flag` en una librería; ayuda | `cli` | `src/args.ts` · `src/plans/new.ts` · `src/plans/app.ts` · `src/help/commands.ts` · `templates/fudic.json.tmpl` |
| [ ] | 19 | 18 | **El `lang` de layout y página.** El primer idioma del proyecto, o `DEFAULT_LOCALE`, en `new`, `g layout` y `g page` | `cli` | `src/templates.ts` · `src/plans/layout.ts` · `src/plans/page.ts` |
| [ ] | 20 | 10 | **`fudic g pipe <nombre>`** con `--on` y `--project`: el `.fudapi`, la implementación y el test de §4.1, en app y en librería; ayuda | `cli` | `src/plans/pipe.ts` · `templates/pipe/*` · `src/args.ts` · `src/help/commands.ts` |
| [ ] | 21 | 20 | **La librería publica sus pipes.** `"./pipes/*": "./src/pipes/*.ts"` en `exports` | `cli` | `templates/lib/package.json.tmpl` |
| [ ] | 22 | 18–21 | **Los tests de la fase.** Criterios 3, 4 y 14, con un proyecto recién creado que pasa `pnpm test` y `pnpm typecheck` sin tocarlo; `g pipe` en `pnpm verify:generated` si SDD-66 está `Hecho` | `cli` | `test/**` |

## Fase 5 — migración y cierre (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 23 | 6, 13 | **La migración.** Todo el repositorio importa los presets, `Pipe`, `format` y `locale` de `@fudic/core`; `examples/basic` sin `"locales"` si solo estaba por los pipes, con el reloj igual; `examples/workspace` con un pipe en `libs/ui` usado por una app. Criterios 13 y 16 | `examples/*` · fixtures | `examples/basic/**` · `examples/workspace/**` · `packages/*/fixtures/**` |
| [ ] | 24 | 23 | **Anexo, README, entrega y cierre.** Las filas de §4.7 en SDD-61 §A.2 y §A.4 (criterio 17); los README de `@fudic/core` e `@fudic/i18n` y la guía del `.fudapi` con `pipe`; criterio 18; `pnpm typecheck`, `pnpm test` y `pnpm build` en verde; SDD-71 y este fichero en `Hecho`, fila y registro del `INDEX.md` | varios | `docs/sdd/*` · `packages/*/README.md` |
