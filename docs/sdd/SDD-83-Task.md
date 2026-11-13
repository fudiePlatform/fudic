# SDD-83 — Tareas

> **SDD:** [SDD-83 — Diagnósticos a medida y Baseline](./SDD-83-diagnosticos-a-medida-y-baseline.md)
> **Paquetes:** `@fudic/diagnostics` · `@fudic/baseline` (nuevo) · `@fudic/config` · `@fudic/compiler` ·
> `@fudic/api` · `@fudic/spec` · `@fudic/typecheck` · `@fudic/vite` · `@fudic/core` · `@fudic/forms` ·
> `@fudic/language-server` · `@fudic/vscode` · `@fudic/cli` · `@fudic/mcp` · `examples/basic`
> **Rama:** `sdd-83-diagnosticos-y-baseline`, desde `main`.
> **Progreso:** 28 / 30 — implementada; queda la prueba de Pedro ([SDD-83-Prueba](./SDD-83-Prueba.md)) y el merge.

**Una sesión, por tandas** (Pedro, 2026-11-12). Se implementan varias fases seguidas, con un commit
por fase; después se escriben los tests de cada una, en orden, y la tanda se cierra con typecheck,
tests y cobertura en verde. Primera tanda: fases 1–3. Si un test destapa un defecto, se corrige el
código, no el test.

**El orden manda en tres puntos.**

- **La política antes que Baseline.** `FUD1524` solo se puede subir, bajar o silenciar si
  `applyPolicy` ya existe.
- **El remedio de `delegatesFocus` antes que los detectores.** Sin él, toda app con formularios daría
  un aviso en cuanto el detector HTML funcione.
- **El manifiesto antes que el test que lo ata**, y los tres detectores antes que ese test.

---

## Fase 1 — diagnósticos

- [x] **1. Diagnósticos.**
  - `FUD1520`–`FUD1528`, cada uno con su función, su `.md` y su línea en `index.ts` (SDD §3.12).
  - `FUD0725` gana los problemas `diagnostics` y `baseline`.
  - *Depende de:* —.
  - *Paquete:* `diagnostics`.
  - *Ficheros:* `src/codes/FUD152*.{ts,md}`, `src/codes/FUD0725.{ts,md}`, `src/index.ts`.

## Fase 2 — la política

- [x] **2. `readSuppressions` y `applyPolicy`.**
  - Los tipos `PolicyLevel`, `Policy`, `Suppression` de §3.10.
  - La lectura de la directiva: códigos, alcance, motivo; `FUD1520`, `FUD1521`, `FUD1522`.
  - El orden de §4.1, el código sobre `warnings`, los errores intocables, `unused`.
  - El sufijo del mensaje cuando la política cambia la severidad.
  - *Depende de:* 1.
  - *Paquete:* `diagnostics`.
  - *Ficheros:* `src/policy.ts`, `src/suppressions.ts`, `src/index.ts`.
- [x] **3. `diagnostics` en `fudic.json`.**
  - `ProjectConfig.diagnostics`, su lectura y su validación (`FUD0725`, `FUD1520`, `FUD1521` con el
    span de la clave).
  - La política del proyecto dueño de un fichero: el `fudic.json` más cercano hacia arriba.
  - *Depende de:* 2.
  - *Paquete:* `config`.
  - *Ficheros:* `src/read.ts`, `src/policy.ts`, `src/index.ts`.
- [x] **4. Los tests de la política.** Criterios 1–6 y 10–11 sobre las funciones, sin build.
  - *Depende de:* 3.
  - *Paquetes:* `diagnostics`, `config`.

## Fase 3 — los comentarios y dónde se aplica

- [x] **5. Cada lector da sus comentarios.**
  - `.fud`: los comentarios Razor del marcado, los CSS del `<style>`, los de JS del `@code`.
  - `.fudapi` y `.fudspec`: los `#` que ya cortan sus lectores de líneas.
  - `.css`: los de `rules.ts`.
  - `.ts`: los que devuelve Oxc.
  - *Depende de:* 2.
  - *Paquetes:* `compiler`, `api`, `spec`, `typecheck`.
  - *Ficheros:* `compiler/src/lexer/*`, `compiler/src/css/rules.ts`, `api/src/line.ts`,
    `spec/src/line.ts`, `typecheck/src/parse.ts`.
- [x] **6. `applyPolicy` en los tres sitios.**
  - El informe de `@fudic/typecheck` (build, dev, CLI, MCP), con `FUD1523`.
  - El compilador dentro del plugin de Vite.
  - La publicación del language server; se vuelve a publicar al cambiar `fudic.json`.
  - Los warnings, info y hints de un fichero de una lib no salen al compilar la app (§3.3).
  - *Depende de:* 3, 5.
  - *Paquetes:* `typecheck`, `vite`, `language-server`.
  - *Ficheros:* `typecheck/src/report.ts`, `typecheck/src/project.ts`, `vite/src/compile.ts`,
    `vite/src/report.ts`, `language-server/src/services/one-voice.ts`, `language-server/src/project-config.ts`.
- [x] **7. Los tests de los comentarios.** Criterios 7–9, 12 y 13, y que los tres sitios dan lo mismo.
  - *Depende de:* 6.
  - *Paquetes:* `compiler`, `api`, `spec`, `typecheck`, `vite`, `language-server`.

## Fase 4 — `@fudic/baseline`

- [x] **8. El paquete.**
  - `packages/baseline`, sin dependencias de runtime, con `web-features` exacto como dependencia de
    desarrollo y umbrales al 100 % desde el primer commit.
  - *Depende de:* —.
  - *Paquete:* `baseline`.
  - *Ficheros:* `package.json`, `tsconfig*.json`, `vitest.config.ts`, `rolldown.config.ts`, `README.md`.
- [x] **9. El generador y la tabla.**
  - `scripts/generate.ts` y `pnpm --filter @fudic/baseline generate`.
  - `src/data.generated.ts` y `src/table.generated.ts`: claves, features, redirecciones, `AS_OF`, el índice de funciones CSS, la
    tabla de unidades, la tabla etiqueta → interfaz DOM (§4.2).
  - *Depende de:* 8.
  - *Paquete:* `baseline`.
  - *Ficheros:* `scripts/generate.ts`, `scripts/units.ts`, `src/data.generated.ts`, `src/table.generated.ts`.
- [x] **10. El juez.**
  - `cutoff`, `status`, `passes`, `feature`, `browsersFor`, `firstKnown`, `cssFunctionKeys`,
    `cssUnitKey` (§3.10). `AS_OF` inyectable.
  - *Depende de:* 9.
  - *Paquete:* `baseline`.
  - *Ficheros:* `src/level.ts`, `src/features.ts`, `src/judge.ts`, `src/browsers.ts`, `src/config.ts`, `src/index.ts`.
- [x] **11. `baseline` en `fudic.json`.**
  - `ProjectConfig.baseline` (`target`, `allow`), por defecto `widely`; `FUD0725` con `baseline`;
    `FUD1527` para un id desconocido, movido o partido.
  - *Depende de:* 10.
  - *Paquete:* `config`.
  - *Ficheros:* `src/read.ts`, `src/baseline.ts`.
- [x] **12. Los tests del juez.** Criterios 14–17, con `AS_OF` fijado.
  - *Depende de:* 11.
  - *Paquetes:* `baseline`, `config`.

## Fase 5 — lo que pone fudic

- [x] **13. El remedio de `delegatesFocus`.**
  - Al hidratar, si la clase lo pide y el shadow root no lo tiene: host enfocable y el foco al primer
    elemento enfocable de dentro, también desde `focus()` (§4.6).
  - *Depende de:* —.
  - *Paquetes:* `core`, `forms`.
  - *Ficheros:* `core/src/element.ts`, `core/src/focus-delegate.ts`, `forms/src/element.ts`.
- [x] **14. El manifiesto y el suelo.**
  - `EMITTED` y `FLOOR` en `@fudic/baseline` (§3.7).
  - `FUD1525` sobre `baseline` de `fudic.json` cuando el corte es anterior al suelo.
  - *Depende de:* 10, 13.
  - *Paquetes:* `baseline`, `config`.
  - *Ficheros:* `baseline/src/emitted.ts`, `config/src/baseline.ts`.
- [x] **15. Los tests de lo que pone fudic.** Criterios 27 y 29.
  - *Depende de:* 14.
  - *Paquetes:* `core`, `forms`, `config`.

## Fase 6 — los detectores

- [x] **16. El detector HTML.**
  - Un analizador del compilador: elementos, atributos, valores literales, eventos (§3.6, §4.3).
  - Salta lo del manifiesto y lo que `allow` permite; crea `FUD1524`.
  - *Depende de:* 11, 14.
  - *Paquete:* `compiler`.
  - *Ficheros:* `src/semantic/analyzers/baseline-html.ts`, `src/semantic/analyze.ts`.
- [x] **17. El detector CSS.**
  - `rules.ts` gana las declaraciones con su span.
  - Propiedades, valores, funciones, selectores, `&`, at-rules, unidades; la pila de `@supports`
    (§3.6, §4.4).
  - En el `<style>` de un `.fud`, y desde el plugin para la guía y las hojas de `styles`.
  - *Depende de:* 11, 14.
  - *Paquetes:* `compiler`, `vite`.
  - *Ficheros:* `compiler/src/css/rules.ts`, `compiler/src/css/baseline.ts`, `vite/src/guide.ts`,
    `vite/src/styles.ts`.
- [x] **18. El detector TS.**
  - Lo que corre en el navegador (§3.6); las candidatas por el tipo del receptor; la protección
    (§4.5).
  - *Depende de:* 11, 14.
  - *Paquete:* `typecheck`.
  - *Ficheros:* `src/baseline.ts`, `src/checker.ts`, `src/report.ts`.
- [x] **19. Los tests de los detectores.** Criterios 18–26.
  - *Depende de:* 16, 17, 18.
  - *Paquetes:* `compiler`, `vite`, `typecheck`.
- [x] **20. El test que ata el manifiesto.** Criterio 28 (§4.7).
  - *Depende de:* 19.
  - *Paquetes:* `typecheck` (el runtime), `examples/basic` (el HTML que sale; §8.2, decisión 20).
  - *Ficheros:* `typecheck/test/emitted.test.ts`, `examples/basic/src/baseline-emitted.test.ts`.

## Fase 7 — librerías y Vite

- [x] **21. Librerías y avisos del proyecto.**
  - `FUD1526`: los detectores sobre los ficheros de cada lib con el nivel de la app, un aviso por lib.
  - `FUD1528`: un `allow` sin uso.
  - *Depende de:* 20.
  - *Paquetes:* `typecheck`, `language-server`.
  - *Ficheros:* `typecheck/src/checker.ts`, `typecheck/src/baseline-project.ts`,
    `language-server/src/services/config-file.ts`, `config/src/baseline.ts` (SDD §8.2.24–26).
- [x] **22. `build.target` desde el nivel.**
  - En el `config` del plugin, solo si el usuario no lo ha puesto; lo heredan el SW y el borde.
  - *Depende de:* 10.
  - *Paquete:* `vite`.
  - *Ficheros:* `src/plugin.ts`, `src/config.ts`, `src/nested.ts`, `src/swbuild.ts`, `src/edge.ts`, `src/link.ts`.
- [x] **23. Los tests de librerías y Vite.** Criterios 30 y 31.
  - *Depende de:* 21, 22.
  - *Paquetes:* `typecheck`, `vite`.

## Fase 8 — editor, CLI y MCP

- [x] **24. Bombillas, completado y hover.**
  - Las bombillas de §3.11, con «Mover a `@supports`» como regla aparte.
  - El completado de códigos en un `fud-disable` y el hover de un código.
  - *Depende de:* 7, 21.
  - *Paquete:* `language-server`.
  - *Ficheros:* `src/services/suppressions.ts`, `src/services/baseline-actions.ts`, `src/services/config-edits.ts`,
    `src/json-edit.ts`, `src/services/plugin.ts`, `src/services/config-file.ts`, `src/fudapi/service.ts`,
    `src/fudspec/service.ts` (SDD §8.2.29–30).
- [x] **25. El esquema de `fudic.json`.**
  - Todas las claves, con los códigos del catálogo y los ids de feature; generado al construir la
    extensión y registrado con `jsonValidation`.
  - *Depende de:* 11.
  - *Paquete:* `vscode`.
  - *Ficheros:* `package.json`, `scripts/fudic-schema.mjs`, `config/src/schema.ts` (SDD §8.2.31).
- [x] **26. CLI y MCP.**
  - `fudic new` escribe `"baseline": "widely"`.
  - La guía del MCP: «Diagnostics» y «Baseline» en `overview.md` y su copia en español.
  - *Depende de:* 11.
  - *Paquetes:* `cli`, `mcp`.
  - *Ficheros:* `cli/src/templates.ts`, `mcp/guide/overview.md`, `mcp/guide/es/overview.md`.
- [x] **27. Los tests del editor, la CLI y el MCP.** Criterios 32–36.
  - *Depende de:* 24, 25, 26.
  - *Paquetes:* `language-server`, `vscode`, `cli`, `mcp`.

## Fase 9 — ejemplo y cierre

- [x] **28. El ejemplo.**
  - `app-calendar-plain` con su `fud-disable`; la nota con `field-sizing` en `@supports`; el menú con
    `popover` y `:state()`; `fudic.json` con `baseline` y `"warnings": "error"` (§4.8).
  - Criterio 37: compila sin warnings.
  - *Depende de:* 23, 26.
  - *Paquete:* `examples/basic`.
  - *Ficheros:* `src/components/app-calendar-plain.fud`, `src/components/app-note.fud`,
    `src/components/app-menu.fud`, `fudic.json`.
- [ ] **29. Docs, `.vsix` y prueba de Pedro.**
  - [x] README de `@fudic/baseline` y `@fudic/diagnostics`; `docs/PENDIENTE.md` (notas 1 y 4
    cerradas) e INDEX (estado y registro).
  - [x] El `.vsix` de la rama, instalado; la CLI nueva en global y verdaccio arrancado.
  - [ ] **Pedro:** SDD §6.1 con ese `.vsix`, paso a paso en [SDD-83-Prueba](./SDD-83-Prueba.md).
  - *Depende de:* 27, 28.
  - *Paquetes:* `baseline`, `diagnostics`, `vscode`, docs.
- [ ] **30. Cierre.**
  - [x] `pnpm typecheck`, `pnpm test`, `pnpm build` en verde (criterio 38).
  - [x] Cobertura de §5.
  - [ ] Tras la prueba de Pedro: estado `Hecho` y merge `--no-ff` a `main`.
  - *Depende de:* 29.
