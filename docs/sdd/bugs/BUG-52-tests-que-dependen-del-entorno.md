# BUG-52 · Tests que dependen de quién los ejecuta

> **Estado:** `Listo` — [tareas](./BUG-52-Task.md).
> **Corrige:** [BUG-50](./BUG-50-la-cli-que-nadie-entiende.md) (`fudic dev`/`preview` de
> workspace), [BUG-51](./BUG-51-forms-http-invasivos-y-una-cli-lenta.md) (`runner/vitest-projects.mjs`)
> y [SDD-59](../SDD-59-terminos-de-serie.md) (tests de `@fudic/terms`).
> **Paquetes:** `@fudic/cli` · `@fudic/terms`
> **No bloquea nada.** SDD-60 se puede implementar en paralelo.

---

## 1. Contexto y síntoma

Al cerrar el merge de IDEA-06/SDD-60 (2026-10-21), `pnpm test` en `main` falló en Windows, en un
shell sin TTY (el de Claude Code), con el código sin cambios:

- **`@fudic/cli`, 3 tests:**
  - `test/serve/node-deps.test.ts` › `starts the app's own Vite for dev…` y `…for preview…`:
    `expected true to be false` en la línea que comprueba que ninguna línea lleva `\u001b[`.
  - `test/workspace/vitest-projects.test.ts` › `runs every project and exits 0…`: la salida del
    hijo es `\u001b[2m Test Files \u001b[22m …` y no casa con `/Test Files\s+2 passed \(2\)/`.
  - Con `NO_COLOR=1` los 549 tests pasan.
- **`@fudic/terms`, 2 ficheros:** `test/locate.test.ts` y `test/stock.test.ts` fallan con
  `Hook timed out in 10000ms` cuando corren dentro de `pnpm test` (todos los paquetes a la vez). El
  paquete solo (`pnpm --filter @fudic/terms test`) pasa 110 / 110.

Reproducir: Windows, `pnpm test` desde un proceso cuya salida no es un terminal.

## 2. Causa raíz

**Color en Windows sin terminal.** `picocolors` (lo usa Vite) decide el color así
(`node_modules/.pnpm/picocolors@*/node_modules/picocolors/picocolors.js:4`):

```js
!!env.FORCE_COLOR || argv.includes("--color") || p.platform === "win32" || (stdout.isTTY && env.TERM !== "dumb") || !!env.CI
```

En `win32` pinta color **aunque no haya TTY**. `tinyrainbow` (lo usa vitest) tiene la misma regla.

- **`packages/cli/src/serve/workspace.ts:146-147`.** Al lanzar el Vite de cada app solo se decide
  forzar el color cuando hay TTY; cuando no lo hay, el hijo hereda `process.env` tal cual, y en
  Windows pinta. **Es un defecto de producto**: `fudic dev` con la salida redirigida a un fichero o
  a otro proceso escribe códigos ANSI en Windows. El test (`node-deps.test.ts:62`) acierta.
- **`packages/cli/test/workspace/vitest-projects.test.ts:83`.** El runner
  (`runner/vitest-projects.mjs`) deja a vitest decidir el color, y que pinte en un terminal es lo
  correcto. **El defecto es del test**: busca el texto del resumen sin quitar los códigos ANSI.

**Arranque del navegador bajo carga.** `packages/terms/test/browser.ts:10` lanza Chrome
(`chromium.launch({ channel: 'chrome' })`) en un `beforeAll` (`locate.test.ts:16`,
`stock.test.ts:18`) con el `hookTimeout` por defecto de vitest, 10 s
(`packages/terms/vitest.config.ts` no lo fija). Con todos los paquetes en paralelo, arrancar Chrome
pasa de 10 s.

**Alcance.** Buscar en el repo otros tests que lancen procesos y comparen su salida sin quitar los
códigos ANSI, y otros `beforeAll` que lancen un navegador (`packages/workbench`, `packages/testing`)
con el límite por defecto.

## 3. Interfaz pública

No cambia ninguna firma.

## 4. Comportamiento corregido

1. **`fudic dev` y `fudic preview` de workspace:** con la salida en un terminal (y sin
   `NO_COLOR`), el hijo recibe `FORCE_COLOR=1`, como hoy. Sin terminal, recibe `NO_COLOR=1` y sin
   `FORCE_COLOR`, en cualquier sistema.
2. **El test del runner** compara el resumen tras quitar los códigos ANSI de la salida. No cambia
   el runner.
3. **Los tests que lanzan un navegador** fijan su propio límite para el hook de arranque (60 s), en
   la configuración del paquete o en el `beforeAll`.

## 5. Invariantes

- `pnpm test` da el mismo resultado en Windows, macOS y Linux, con o sin terminal, y con o sin
  `TERM`, `NO_COLOR` y `FORCE_COLOR` en el entorno.
- Un test que compara la salida de un proceso hijo no depende del color.

## 6. Criterios de aceptación

1. **Sin terminal, sin color, en cualquier sistema.** Un test de `nodeServeDeps` que fija
   `process.platform` a `win32` (o simula `picocolors` en Windows) sin TTY ve que el hijo recibe
   `NO_COLOR=1` y ninguna línea con `\u001b[`. Falla antes del cambio.
2. **Con terminal, color.** Con `process.stdout.isTTY` verdadero y sin `NO_COLOR`, el hijo recibe
   `FORCE_COLOR=1` (el comportamiento de hoy, cubierto).
3. **Runner.** `vitest-projects.test.ts` pasa con `FORCE_COLOR=1` en el entorno del hijo. Falla
   antes del cambio.
4. **Navegador bajo carga.** `@fudic/terms` fija un `hookTimeout` de 60 s, y `pnpm test` desde la
   raíz pasa en Windows sin TTY.
5. **Entrega.** `pnpm test` en verde desde la raíz en Windows, en el shell de Claude Code (sin TTY,
   con `TERM=xterm-256color`), y en un terminal normal. `@fudic/cli` y `@fudic/terms` no bajan su
   umbral de cobertura.

## 7. Fuera de alcance

- Cambiar `picocolors`, `tinyrainbow` o su versión.
- Hacer más rápido el arranque de Chrome en los tests.
- Cualquier otro cambio en `fudic dev`/`preview` o en el runner de proyectos.
