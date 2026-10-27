# BUG-52 · Tests que dependen de quién los ejecuta

> **Estado:** `Listo` — [tareas](./BUG-52-Task.md).
> **Corrige:** [BUG-50](./BUG-50-la-cli-que-nadie-entiende.md) (`fudic dev`/`preview` de
> workspace), [BUG-51](./BUG-51-forms-http-invasivos-y-una-cli-lenta.md) (`runner/vitest-projects.mjs`)
> y [SDD-59](../SDD-59-terminos-de-serie.md) (tests de `@fudic/terms`).
> **Paquetes:** `@fudic/cli` · `@fudic/terms` · `@fudic/typecheck` · `@fudic/language-server`
> **No bloquea nada.** SDD-60 se puede implementar en paralelo.
>
> **Ampliado (2026-10-27).** Pedro añade dos fallos vistos en el editor, del mismo tipo —algo
> que depende de con qué se ejecuta—: el paso tipado de la vista (SDD-61) leía marcas de
> TypeScript que la versión 6 renumeró, y no había snippet para `<link rel="server">` (SDD-60).
> Van en este mismo BUG (§1.1, §2.1, §4.4–4.5, criterios 6–7). Al verificarlos salió un tercero
> del mismo tipo, un error intermitente al cerrar los tests del servidor (§4.6, criterio 8).

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

### 1.1 Lo que se ve en el editor

- **`examples/basic/src/routes/vista.fud`**, abierto con `examples/basic` como carpeta de VS Code:
  dos `FUD1153` («this type does not port») en `@(texto.length)` (134:36) y en
  `@(140 - texto.length)` (192:38). `texto` es `const texto = "hola, vista"`, la longitud de un
  texto, que el catálogo positivo dice «sin diagnóstico». `pnpm build` no los da.
- **Sin snippet para `<link rel="server">`.** Se ofrecen `link-component`, `link-snippet` y
  `link-layout`, pero no el que enlaza el `.fudapi`, aunque el `href` ya sabe completarlo.
- **Encontrado al verificar lo anterior:** `pnpm --filter @fudic/language-server coverage` falla
  de vez en cuando, con todos los tests en verde, por `EnvironmentTeardownError: Closing rpc
  while "onUserConsoleLog" was pending` en `test/acceptance/bug23-symptoms.test.ts`.

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

### 2.1 Las causas de §1.1

- **TypeScript 6 renumeró `TypeFlags`.** El paso tipado (`packages/typecheck/src/portable-types.ts`)
  escribe a mano tres máscaras de `ts.TypeFlags` —`Enum | EnumLiteral`, `BigInt | BigIntLiteral`,
  `Intersection`— con los valores de 5.x, porque el programa puede venir de otra copia de
  TypeScript. Con `examples/basic` como carpeta, el servidor no encuentra un TypeScript del
  proyecto y usa el de VS Code, 6.0.3. Ahí `StringLiteral` vale `1024`, justo el bit que en 5.x
  era `EnumLiteral`: un literal de texto pasa por enum, el enum por número, y `.length` de un
  número no existe → `FUD1153`. El build usa el 5.9 del repo y no lo ve. `SymbolFlags` no cambió
  (`Class`, `Interface`, `Optional`, `Enum`, `EnumMember`).
- **El catálogo de snippets** (`packages/language-server/src/services/snippets.ts`) tiene los
  `<link>` de `component`, `snippet` y `layout`; el de `server` nunca se añadió cuando SDD-60
  trajo el `.fudapi`.
- **La consola del servidor dentro del test.** Los tests de aceptación arrancan el servidor en
  el mismo proceso, y Volar escribe en la consola por su cuenta: un `console.warn` por cada
  capacidad que el cliente de prueba no declara (`insertReplaceSupport`, `linkSupport`…). Vitest
  intercepta la consola y la manda al proceso principal; una escritura que llega mientras cierra
  el fichero es ese error. Además, `bug23-editor.test.ts` tenía dos `console.log` de depuración.

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
4. **El paso tipado no lee ningún `TypeFlags`.** Lo que preguntaba con una máscara lo pregunta con
   la API pública del tipo y del símbolo —`isIntersection()`, `isLiteral()` y su valor, las
   `SymbolFlags` del enum—, que significan lo mismo en 5.x y en 6.x. Mismo resultado con
   cualquier TypeScript que haya construido el programa.
5. **`link-server`**, un snippet más de la familia `link-*`: `<link rel="server" href="$0">`, con
   la lista de `.fudapi` abierta al aceptarlo. Donde un fichero puede enlazar uno: arriba del todo
   en un componente, una ruta o un fichero que se empieza; en el `<head>` de una página. Nunca en
   un layout ni en un fichero de snippets (`FUD1112`).
6. **`@fudic/language-server` no intercepta la consola en sus tests** (`disableConsoleIntercept`):
   lo que escribe un servidor en proceso va directo a Node y no puede llegar tarde a nadie. Los
   dos `console.log` de depuración, fuera.

## 5. Invariantes

- `pnpm test` da el mismo resultado en Windows, macOS y Linux, con o sin terminal, y con o sin
  `TERM`, `NO_COLOR` y `FORCE_COLOR` en el entorno.
- Un test que compara la salida de un proceso hijo no depende del color.
- El editor y el build dan los mismos `FUD` sobre el mismo fichero, sea cual sea el TypeScript
  que cada uno cargó.

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
6. **El paso tipado con TypeScript 6.** Los casos del paso tipado de `@fudic/typecheck` dan los
   mismos diagnósticos con TypeScript 5.9 y con 6.0, y entre ellos `.length` de un `const` de
   texto no da nada. Con 6.0, falla antes del cambio. `examples/basic/src/routes/vista.fud` no
   da ningún `FUD` en el editor con el TypeScript de VS Code.
7. **`link-server`.** Se ofrece arriba en un componente, una ruta y un fichero que se empieza, y
   en el `<head>` de una página; no en un layout, ni en el cuerpo de una página. Su cuerpo es
   `<link rel="server" href="$0">` y abre la lista al aceptarlo.
8. **Sin error al cerrar.** `pnpm --filter @fudic/language-server coverage` termina con código 0
   y sin `EnvironmentTeardownError`.

## 7. Fuera de alcance

- Cambiar `picocolors`, `tinyrainbow` o su versión.
- Hacer más rápido el arranque de Chrome en los tests.
- Cualquier otro cambio en `fudic dev`/`preview` o en el runner de proyectos.
- Qué TypeScript elige el servidor de lenguaje cuando el proyecto no trae uno.
