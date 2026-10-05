# SDD-32 — El banco de trabajo: un componente, sus criterios, en verde o en rojo al guardar

> **Estado:** `En curso` — [tareas](./SDD-32-Task.md), 21 / 31. Redactado el 2026-10-05, con
> las decisiones de §8.2 cerradas.
> **Paquetes:** `@fudic/workbench` (**nuevo**) · `fudic-vscode` (un comando, un atajo, un panel)
> · `@fudic/dom` (bug B, §9.1) · `@fudic/diagnostics` (los códigos) · `examples/basic` (el
> ejemplo en verde)
> **Depende de:** 17 (hidratación) · 19 (plugin de Vite) · 25 (extensión) · 35 (el chequeo en
> vivo que manda el segundo `full-reload`) · 50 (catálogo de diagnósticos) · 52 (`.fudspec`,
> términos y fixtures) · 53 (fixtures rellenas por tipo)
> **Rango de diagnósticos:** `FUD0970`–`FUD0989` (nuevo). El rango `FUD0590`–`FUD0609` que
> reservaba la versión anterior de esta spec lo usan hoy los formularios (SDD-33/34).
> **Origen:** [prueba de arquitectura](../banco-de-trabajo/prueba-arquitectura.md)
> (2026-10-03), con el código de la prueba en [prueba/](../banco-de-trabajo/prueba/).
>
> **Sustituye por completo** a la versión anterior de SDD-32 («Abrir en el navegador», nivel 1,
> sin hidratación, servidor propio sin Vite). No llegó a implementarse ninguna tarea suya. La
> prueba de arquitectura la dejó atrás en cuatro puntos (§1.2).

---

## 1. Contexto y objetivo

Un componente tiene su `.fudspec` (SDD-52), su fixture (SDD-53) y sus términos en
`fudic/terms/`. Hoy no hay nada que **ejecute** esos criterios. Esta spec es lo que los
ejecuta, y lo que el usuario ve mientras lo hace.

### 1.1. Qué hace, visto por el usuario

1. Está en un `.fud` o en su `.fudspec` y pulsa **Ctrl+K V**.
2. Se abre una pestaña al lado, como la vista previa de markdown, con **una tarjeta por
   criterio**. Cada tarjeta tiene el componente **vivo**: montado con los datos de su fixture e
   hidratado, y se puede tocar.
3. Los criterios se ejecutan, y cada tarjeta se pone en verde o en rojo con su evidencia, paso a
   paso.
4. **Al guardar** el `.fud`, la `.fudspec`, la fixture o un término, se vuelven a ejecutar
   solos.
5. Un botón **«Abrir en el navegador»** abre la misma vista en Chrome.

### 1.2. Qué cambia respecto a la versión anterior

| Antes | Ahora | Por qué |
|---|---|---|
| Nivel 1: HTML con DSD, sin JS | **Hidratado** | Sin reactividad los criterios no sirven: unas pestañas no cambian de panel. Casi ningún componente, salvo un botón o una tarjeta, es nivel 1. |
| Servidor estático propio, emit a mano | **Vite y el plugin de fudic dentro del servidor, como middleware** | Vite ya compila, resuelve `@fudic/core` en el navegador, hidrata y recompila al guardar. |
| Playwright abría la ventana del humano | **Playwright mide sin ventana**; el humano mira la pestaña de VS Code | El webview de VS Code no se puede pilotar con Playwright, y los criterios necesitan eventos reales (`isTrusted`) y el árbol de accesibilidad. |
| «Un segundo click relanza» | **Al guardar se vuelve a ejecutar solo** | Escribir, guardar, ver el verde. |

### 1.3. Lo que la prueba ya demostró

Con el plugin real, Playwright real y una ventana real de VS Code 1.140 (Windows, local), sin
`portMapping`: la pestaña carga el shell desde `127.0.0.1`; el WebSocket va en los dos
sentidos; el shell lee el shadow DOM de los iframes (mismo origen); el componente hidrata dentro
de la pestaña; Vite y el WebSocket del banco comparten puerto; la fixture se ejecuta con
`vite.ssrLoadModule`; los términos de `examples/basic/fudic/terms` corren sin cambios; una prop
`Signal` llega viva; y al guardar se vuelve a ejecutar en ~0,4 s. **Esta spec no repite esas
pruebas**: las convierte en criterios de aceptación del paquete.

---

## 2. Dependencias

| Fuente | Aporta |
|---|---|
| SDD-17 | La hidratación por gesto: el capturador, la repetición del gesto y el evento `fud:hydrated` con `detail.id`, que es el `data-fud-id` de la instancia. El motor espera a ese evento (§4.6.3). |
| SDD-19 | `fudic({ routesDir })`. El plugin vuelve a descubrir las rutas **en cada petición** (`plugin.ts`, post-middleware), así que una página que el banco escribe después de arrancar se sirve sin reiniciar nada. |
| SDD-25 | Los puertos de la extensión, `COMMAND_IDS` y el test de manifiesto que comprueba la simetría contribuido↔registrado. |
| SDD-35 | El chequeo de tipos en vivo: una página con errores de tipos no se sirve, y al pasar de errores a limpio el plugin manda un `full-reload`. |
| SDD-50 | Un código, un fichero, una función tipada. |
| SDD-52 | `parseSpec`, `validateSpec`, `createTermCatalog` y el contrato del módulo de término (`meta`, `run`). |
| SDD-53 | La forma de la fixture: `export default { <nombre>: { …props } } satisfies Record<string, $Props>`. |

### 2.1. Dependencias del paquete nuevo

| Dependencia | Versión | Tipo | Por qué |
|---|---|---|---|
| `@fudic/spec` | `workspace:*` | dependencia | Leer y validar la `.fudspec` y resolver los términos. |
| `@fudic/diagnostics` | `workspace:*` | dependencia | Sus códigos. |
| `playwright-core` | `1.62.0` | dependencia | El motor. Sin navegadores descargados: usa el Chrome del sistema (`channel: 'chrome'`), igual que [`examples/basic/playwright.config.ts`](../../examples/basic/playwright.config.ts). Versión alineada con su `@playwright/test`. |
| `vite` | `8.0.16` | **peer** | El del proyecto, como hace `@fudic/vite`. Dos Vite en un proceso son dos grafos de módulos. |
| `@fudic/vite` | `workspace:*` | **peer** | El plugin del proyecto, con la versión que el proyecto compila. |

`devDependencies`: `@fudic/tsconfig`, `@types/node` (`22.20.0`), `vite` y `@fudic/vite`.

Ausencias deliberadas:

- **Una librería de WebSocket.** El banco habla un subconjunto mínimo de RFC 6455 (texto, sin
  fragmentar, servidor → shell), y lo que el shell manda al servidor es nada (§4.9). La prueba
  lo hizo en veinte líneas.
- **`@fudic/compiler` y `@fudic/ssr`.** El banco no compila: compila Vite con el plugin. Es la
  diferencia de fondo con la versión anterior.
- **La extensión no depende del paquete:** lo **lanza** como proceso hijo (§4.10). Playwright
  dentro de un `.vsix` no es viable; ya es específico de plataforma por el binario NAPI de Oxc
  (SDD-25).

---

## 3. Interfaz pública

### 3.1. El binario

```
fudic-workbench <fichero> [--port <n>] [--keep]
```

`<fichero>` es el `.fud` del componente o su `.fudspec`; los dos abren el mismo banco. Con el
proceso vivo, imprime **una línea JSON** en `stdout`:

```json
{"url":"http://127.0.0.1:53411/__bench/","tag":"app-card","component":"C:/…/app-card.fud","criteria":3}
```

Sigue vivo hasta que se cierre `stdin` (lo que pasa cuando quien lo lanzó muere) o llegue
`SIGINT`. Si no se puede abrir, imprime `{"error":{"code":"FUD0970","message":"…"}}` y sale con
código 1. Esa línea es todo el protocolo con la extensión, y es lo que permite usarlo desde una
terminal sin ninguna UI.

`--keep` no borra la carpeta de páginas generadas al salir (§4.2), para depurar. `--port`
fija el puerto; por defecto es efímero (`0`).

### 3.2. La API

```ts
// packages/workbench/src/index.ts

export interface WorkbenchOptions {
  /** Puerto del servidor. Por defecto 0: efímero. */
  readonly port?: number;
  /** No borrar la carpeta de páginas al cerrar. */
  readonly keep?: boolean;
}

export interface WorkbenchSession {
  /** El shell: lo que abren la pestaña de VS Code y el botón del navegador. */
  readonly url: string;
  readonly tag: string;
  /** Ruta absoluta del `.fud` del componente. */
  readonly component: string;
  /** Criterios de la primera carga de sesión: los de la línea JSON. */
  readonly criteria: number;
  /** Cierra navegador, Vite y servidor, y borra la carpeta salvo `keep`. Idempotente. */
  close(): Promise<void>;
}

export interface WorkbenchFailure {
  readonly diagnostic: Diagnostic;
}

export function openWorkbench(
  file: string,
  options?: WorkbenchOptions,
): Promise<WorkbenchSession | WorkbenchFailure>;
```

### 3.3. Las costuras internas

Cada una en su fichero. Las tres primeras son puras y se prueban sin disco, sin Vite y sin
navegador.

```ts
// src/target.ts — de un fichero a lo que el banco abre
export interface BenchTarget {
  readonly tag: string;
  readonly component: string;      // absoluto
  readonly spec: string | null;    // absoluto; null sin .fudspec
  readonly fixture: string | null; // absoluto; null sin .fixture.ts
  readonly projectRoot: string;    // la carpeta del fudic.json más cercano, o la del package.json
}
export function resolveTarget(file: string, fs: TargetFs): BenchTarget | WorkbenchFailure;

// src/pages.ts — las páginas generadas (§4.3), una por criterio
export interface PlannedCriterion {
  readonly id: string;             // el slug del criterio
  readonly route: string;          // '/<slug>'
  readonly fixture: string | null; // el nombre de `props <nombre>`
  readonly steps: readonly PlannedStep[];
  /** Presente si el criterio no puede ejecutarse (FUD0974, fixture sin la entrada): sale en error sin abrir página. */
  readonly error?: string;
}
export interface PlannedStep {
  readonly block: BlockKind;
  readonly term: string;
  readonly args: readonly string[]; // tal como se escribieron; `role:x/"n"` incluido
}
export interface BenchPlan {
  readonly criteria: readonly PlannedCriterion[];
  /** Nombre de fichero relativo a la carpeta del banco → contenido. */
  readonly files: ReadonlyMap<string, string>;
  readonly diagnostics: readonly Diagnostic[];
}
export function planBench(input: {
  readonly target: BenchTarget;
  readonly spec: SpecFile;
  /** La fixture ejecutada (opción A, §4.4); vacía sin fixture. */
  readonly fixtures: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}): BenchPlan;

// src/protocol.ts — los mensajes del WebSocket (§4.9)
export type BenchMessage = SessionMessage | RunningMessage | ResultMessage | ProblemMessage;

// src/context.ts — el `ctx` que reciben los términos (§4.6), sobre una página de Playwright
export function createTermContext(page: PageLike): TermContext;

// src/engine.ts — ejecutar un criterio
export function runCriterion(
  browser: BrowserLike,
  origin: string,
  criterion: PlannedCriterion,
  loadTerm: (block: BlockKind, name: string) => Promise<LoadedTerm>,
): Promise<CriterionResult>;

// src/bench-server.ts — el http.Server: shell, WebSocket y Vite detrás
export function startBenchServer(input: BenchServerInput): Promise<BenchServer>;
```

`PageLike` y `BrowserLike` son las partes de Playwright que el banco usa (unas diez llamadas).
El único fichero que importa `playwright-core` es `src/browser.ts`, que adapta el real a esas
dos interfaces.

### 3.4. El `ctx` de los términos

Es el contrato que **ya existe** en [examples/basic/fudic/terms/](../../examples/basic/fudic/terms/)
(decisión 2 de la prueba). El banco lo construye; no lo cambia.

```ts
export interface TermContext {
  /** Lo que `given route` pide. En el banco no navega (§4.6.4). */
  goto(path: string): Promise<void>;
  /** Una referencia `tag` o `role:<rol>[/"<nombre>"]` (SDD-52 §3.5). */
  locate(ref: string): TermLocator;
}

export interface TermLocator {
  box(): Promise<{ readonly width: number; readonly height: number }>;
  textContent(): Promise<string>;
  isVisible(): Promise<boolean>;
  click(): Promise<void>;
  setAttribute(name: string, value: string): Promise<void>;
}
```

Un término se llama como en los ficheros de hoy: `run(ctx, args)`, con `args` por nombre según
`meta.params`, y devuelve `{ pass, evidence }`.

---

## 4. Comportamiento

### 4.1. La arquitectura

```
 Ctrl+K V
    │ la extensión lanza el proceso del banco (uno por componente) y lee una línea JSON
    ▼
 ┌─ Banco (Node) ──────────────────────────────────────────────────────────────┐
 │  http.Server en 127.0.0.1:P  — un solo puerto, un solo origen               │
 │   ├─ /__bench/        el shell: tarjetas, verde/rojo, evidencia             │
 │   ├─ /__bench/ws      el WebSocket del banco → resultados al shell         │
 │   └─ todo lo demás →  Vite (middlewareMode, hmr sobre este mismo server)    │
 │                        + fudic({ routesDir: <carpeta del banco>/routes })    │
 │                          · una página .fud generada por criterio            │
 │  @fudic/spec: parseSpec + validateSpec + createTermCatalog                   │
 │  vite.ssrLoadModule(fixture.ts) → los valores (opción A)                    │
 │  Playwright (Chrome del sistema, sin ventana) → ejecuta los términos        │
 │  vite.watcher + el full-reload de Vite → volver a ejecutar al guardar       │
 └──────────▲───────────────────────────────▲───────────────────────────────────┘
            │ WS                             │ WS
   Pestaña de VS Code (webview)       «Abrir en el navegador»
   <iframe src=http://127.0.0.1:P/__bench/>   la misma URL en Chrome
     └ un <iframe> por criterio → su página generada (viva, hidratada, con HMR)
```

Lo que ve el humano (los iframes, con HMR) y lo que mide Playwright son **dos instancias de la
misma página**. El humano puede tocar la suya sin estropear la medida, y la medida no mueve lo
que el humano está mirando.

### 4.2. El arranque

1. `resolveTarget(file)`. De un `.fud` sale su `.fudspec` y su `.fixture.ts` hermanos; de un
   `.fudspec`, su `.fud` hermano. El `.fud` tiene que ser un componente con tag (`FUD0970` si
   no). La raíz del proyecto es la carpeta del `fudic.json` más cercano subiendo desde el
   componente; sin `fudic.json`, la del `package.json` más cercano (`FUD0971` si no hay
   ninguno).
2. Se levanta Vite (§4.5) y el servidor (§4.8), y se lanza el navegador.
3. Se carga la sesión (§4.4): `.fudspec`, fixture, plan y páginas.
4. Se imprime la línea JSON de §3.1 y se ejecutan todos los criterios (§4.6).

**La carpeta del banco** es `<projectRoot>/node_modules/.fudic-bench/<tag>/`: dentro del
proyecto, para que Vite resuelva `@fudic/core` y los `<link rel="component">` como en la app;
bajo `node_modules`, para que quede fuera de git y del watcher de Vite; y con el tag, para que
dos bancos abiertos a la vez en el mismo proyecto no se pisen. Se vacía al arrancar y se borra
al cerrar, salvo `--keep`.

### 4.3. Las páginas generadas

Una página `.fud` por criterio, en `<carpeta del banco>/routes/<slug>.fud`, servida en
`/<slug>`. Lo que la prueba obligó a meter (§4.3 de la prueba) son reglas de esta spec:

```html
<!DOCTYPE html>
<html>
  <head>
    <link rel="component" href="C:/…/src/components/app-card.fud">
    @code {
      import fixtures from "C:/…/src/components/app-card.fixture";
      const { title, href } = fixtures["minima"];
    }
    <script type="module" src="fudic:runtime"></script>
    <title>app-card · altura-minima</title>
  </head>
  <body>
    <app-card .title=@title .href=@href></app-card>
  </body>
</html>
```

- **Documento completo** (`<!DOCTYPE html><html><head>…<body>`). Con solo `<head>` y el tag, el
  compilador la lee como un componente (`FUD0156`) y no como una ruta.
- **`<script type="module" src="fudic:runtime">`** en el `<head>`. Sin layout nadie lo pone, y
  sin él el componente no hidrata.
- **El import de la fixture va sin `.ts`** (`TS5097` en el chequeo de tipos del plugin).
- **Las props, con `.prop=@nombre`**, desestructuradas de la fixture en el `@code`. Las claves
  son las del objeto **ejecutado** (§4.4), no las que lee el validador estático.
- **Rutas absolutas con barras hacia delante**, como en la versión anterior: la carpeta del
  banco y el componente no tienen por qué compartir un `path.relative` limpio.
- **Un criterio sin `props`** monta el componente desnudo y su página no tiene `@code`.
- **Nada del banco dentro de la página.** Ni un script, ni un estilo, ni un atributo. Lo que el
  motor necesita observar entra por CDP en su propia instancia (§4.6.3).

#### 4.3.1. Una prop `Signal`: el componente anfitrión

Una página no puede ser dueña de un signal que pasa a un hijo (`FUD0200`). Cuando el valor de
una prop en la fixture ejecutada es un signal —una función con un método `set`—, el banco
genera un **componente anfitrión** en `<carpeta del banco>/components/bench-host-<slug>.fud`, y
la página monta el anfitrión en lugar del componente:

```html
<link rel="component" href="C:/…/src/components/signal-display.fud">

@code {
  @client {
    import { signal } from "@fudic/core";

    const value = signal(10);
  }
}

<bench-host-diez>
  <template shadowrootmode="open">
    <signal-display .value=@value></signal-display>
  </template>
</bench-host-diez>
```

- **Solo cuando hace falta** (decisión 8.2.c). Un criterio sin props `Signal` no tiene
  anfitrión: el componente es hijo directo del `<body>`, como lo escribiría un usuario.
- **El valor inicial se escribe literal**, sacado de ejecutar la fixture (`fixture.diez.value()`
  → `10`) y serializado con `JSON.stringify`. Inicializarlo desde una constante del `@code` falla
  en el servidor (`Cannot access 'initial' before initialization`). Un valor que no sobrevive a
  `JSON.stringify` sin cambiar (una función, una fecha, un `Map`, `undefined`) es `FUD0974` y el
  criterio sale en error sin ejecutarse.
- Las props que no son `Signal` del mismo criterio pasan por el anfitrión igual: el anfitrión
  importa la fixture en su `@code` y las reenvía con `.prop=@nombre`.
- **Un `computed` en la fixture** (función sin `set`) no tiene anfitrión en esta spec (§7).

### 4.4. La sesión: `.fudspec`, fixture y plan

Cargar la sesión es leer la `.fudspec` con `parseSpec`, validarla con `validateSpec` contra el
catálogo de términos, ejecutar la fixture y llamar a `planBench`. Se hace al arrancar y cada vez
que cambia uno de esos ficheros (§4.7).

- **El catálogo** usa las mismas raíces que el editor, en el mismo orden:
  `<projectRoot>/fudic/terms/` (capa `workspace`) y, si existe, la del framework. Hoy no hay
  capa del framework en ningún paquete; el banco la acepta por la misma costura que el language
  server (`frameworkTerms`) para no tener que cambiar cuando exista.
- **Una `.fudspec` con errores** (los `FUD0920`–`FUD0954` de SDD-52) no se ejecuta: el shell
  pinta los diagnósticos y ninguna tarjeta. Es lo mismo que haría el editor, y ejecutar medio
  fichero daría verdes que no significan nada.
- **Sin `.fudspec`** (`FUD0972`, aviso), el banco se abre igual: una sola tarjeta con el
  componente desnudo y sin criterios, para verlo vivo.
- **La fixture se ejecuta** (opción A) con `vite.ssrLoadModule`. Un `import { signal } from
  '@fudic/core'` dentro de ella funciona porque la ejecuta Vite. Si lanza, es `FUD0973`: los
  criterios con `props` salen en error con el mensaje, y los que no tienen `props` se ejecutan.
  Se vuelve a ejecutar en cada carga de sesión, invalidando antes su módulo en el grafo de Vite.
- **Los términos** también se cargan con `vite.ssrLoadModule`, por el mismo motivo: el grafo de
  Vite sabe cuándo un `.js` cambió, y un `import()` de Node con `?t=` deja un módulo vivo por
  ejecución.

### 4.5. Vite dentro del banco

```ts
createServer({
  root: target.projectRoot,
  configFile: false,
  appType: 'custom',
  logLevel: 'warn',
  plugins: [fudic({ routesDir: '<relativo a root>/node_modules/.fudic-bench/<tag>/routes' })],
  server: { middlewareMode: true, hmr: { server: http, overlay: false } },
});
```

- **`configFile: false`.** Lo que el usuario tenga en su `vite.config.ts` no se carga (decisión
  8.2.d, §7). `fudic.json` sí: lo lee el plugin, y con él la guía de estilos.
- **`hmr.overlay: false`.** El aviso de error de Vite se pintaba encima de la página de otro
  criterio y tapaba los clicks. Los errores van al shell (§4.8).
- **El `FUD0742`** («fudic.json declares stylesheets and this project defines no component»)
  sale porque `routesDir` apunta al banco y desde ahí el plugin no ve componentes. Es esperado:
  el banco no lo pasa al shell.
- **Una página con errores de tipos no se sirve** (SDD-35): el motor recibe un error en lugar de
  la página, y el criterio sale en error con ese mensaje.

### 4.6. El motor

Un navegador por proceso: `chromium.launch({ channel: 'chrome', headless: true })`. **Una
página nueva por criterio y por ejecución**, que se cierra al terminar: ningún criterio hereda
el estado de otro.

#### 4.6.1. Un criterio

1. `newPage()`, y antes de navegar:
   - `routeWebSocket(url => !url.pathname.startsWith('/__bench'), () => {})`: **la página que
     mide no escucha las recargas de Vite.** Al guardar, Vite manda un `full-reload` (y el
     chequeo en vivo otro); si esta página lo oye, se recarga a mitad del criterio.
   - El script de observación de §4.6.3, por `addInitScript`.
2. `goto(origin + route)` y `waitForLoadState('load')`.
3. Los pasos en orden: `given`, `when`, `then`. Cada uno resuelve su término en el catálogo,
   lo carga, convierte los argumentos según `meta.params` (`number` → `Number`, el resto tal
   cual) y llama a `run(ctx, args)`.
4. El veredicto:
   - **`error`** si un paso lanza, si la página no carga o si la página registra un error
     (`pageerror`). El primer error corta el criterio; los pasos que no se ejecutaron no salen.
   - **`fail`** si algún `then` devuelve `pass: false`. Un `then` en rojo no corta: se ejecutan
     todos los `then`, para ver de una vez todo lo que falla.
   - **`pass`** en otro caso.
5. Se cierra la página.

Cada paso deja en el resultado `{ block, term, layer, args, pass, evidence }` o
`{ block, term, layer, args, error }`. `layer` es de qué raíz salió el término
([dsl-criterios.md §9](../banco-de-trabajo/dsl-criterios.md)): sin ella, dos evidencias del
mismo término con distinta implementación no se distinguen.

Cada llamada del `ctx` tiene un tiempo máximo de **5 s**. Pasado, el paso sale en error con el
mensaje de Playwright.

#### 4.6.2. Las referencias

| Referencia | Locator | Notas |
|---|---|---|
| `app-card` | `page.locator('app-card')` | El CSS de Playwright atraviesa los shadow roots abiertos. |
| `role:tab` | `page.getByRole('tab')` | |
| `role:tab/"Tab B"` | `page.getByRole('tab', { name: 'Tab B', exact: true })` | |

**Una referencia que casa con más de un elemento es un error del paso**, con el número de
elementos en el mensaje (decisión 8.2.a). Es el modo estricto de Playwright, y es lo honesto: un
`min-height app-card 44` sobre tres tarjetas no dice cuál midió.

**`textContent()` devuelve el texto que se ve**, recorriendo el árbol aplanado: entra en el
shadow root de cada host, sustituye cada `<slot>` por sus nodos asignados (o su contenido por
defecto si no tiene), y salta `<style>`, `<script>` y `<template>` (decisión 8.2.b). El
`textContent` del DOM sobre un host da su light DOM, casi siempre vacío, y ningún autor de un
`text app-card "…"` quiere decir eso.

#### 4.6.3. Esperar a que el gesto se atienda (bug A)

Un componente sin hidratar recibe el primer gesto por el capturador de SDD-17: el capturador lo
retiene, descarga el chunk, define el tag y **repite** el gesto. El handler corre unos
milisegundos después del `click` de Playwright. Un `then` que lee justo después lee el estado
de antes (§9.2).

Por eso **las acciones del `ctx` (`click`, `setAttribute`) vuelven cuando la página ha atendido
el gesto**:

1. Antes de actuar, el motor busca el host hidratable más cercano del elemento (el primer
   ancestro con `data-fud-id`, cruzando shadow roots, igual que el capturador) y anota su id y
   si su tag ya está definido (`customElements.get`).
2. Actúa.
3. Si el tag **no** estaba definido, espera a que el script de observación haya visto un
   `fud:hydrated` con ese `detail.id`, y después **un fotograma** (`requestAnimationFrame`): el
   evento sale antes de la repetición, y la repetición dispara efectos que pintan después.
4. Si estaba definido, espera solo el fotograma.

El script de observación es una línea por `addInitScript` que guarda en un `Set` los ids de cada
`fud:hydrated` desde el primer momento de la página. Va solo en la instancia que mide, nunca en
el fichero de la página.

**`waitForLoadState('networkidle')` no sirve para esto**: si la página ya llegó a ese estado
antes del click, Playwright lo da por cumplido al instante. Es exactamente el fallo de la prueba.

#### 4.6.4. `goto`

`given route …` es **solo un ejemplo** (decisión 1 de la prueba): el banco monta el componente
aislado, en su página. `ctx.goto(path)` no navega y no falla; el paso sale con
`evidence: "ignored: the workbench mounts the component on its own page"`. Un término que de
verdad necesite otra página es un término de app, no de componente (§7).

### 4.7. Volver a ejecutar al guardar

El watcher de Vite dice **qué** cambió. Qué hacer depende del fichero:

| Cambia | Qué hace el banco | Cuándo ejecuta |
|---|---|---|
| El `.fud` del componente o uno que enlaza | Nada que recargar: Vite recompila | En el primer `full-reload` que Vite mande después del cambio |
| La `.fudspec` | Vuelve a cargar la sesión (§4.4) y reescribe las páginas | En cuanto termina de cargar |
| La fixture | Igual que la `.fudspec` | Igual |
| Un término de `fudic/terms/` | Invalida su módulo en el grafo de Vite | En el momento |

- **Por qué esperar al `full-reload` con el `.fud`.** Volver a ejecutar en el evento del watcher
  es una carrera: Vite todavía no ha recompilado. El primer `full-reload` dice que está listo. El
  banco lo ve interceptando `vite.environments.client.hot.send`. Si no llega en **10 s** (el
  cambio no afectó a nada que el cliente cargue), ejecuta igualmente.
- **Una ejecución a la vez.** Un guardado durante una ejecución deja **una** ejecución
  pendiente, que empieza al terminar la actual. Diez guardados seguidos son una ejecución más,
  no diez.
- **Se ejecutan todos los criterios** del componente. Un proceso es un componente, y un cambio
  en cualquiera de esos ficheros puede cambiar cualquier criterio.

### 4.8. El servidor y el shell

Un `http.Server` en `127.0.0.1`:

- `GET /__bench/` → el shell, `text/html`.
- `upgrade /__bench/ws` → el WebSocket del banco. Cualquier otro `upgrade` es de Vite (su HMR,
  en el mismo puerto).
- Todo lo demás → `vite.middlewares`; si Vite no lo atiende, 404.

**El shell** es una página del banco, con su script. Pinta:

- **Una tira de diagnósticos** arriba: los de la `.fudspec`, los del arranque y los de la
  fixture. Sin diagnósticos no hay tira.
- **Una tarjeta por criterio**, en el orden de la `.fudspec`: el slug, la línea `describe` de
  cada paso (de `meta.describe`, que el banco ejecuta en Node con los argumentos del paso), el
  veredicto (`pass` verde, `fail` y `error` rojo, `running` neutro), la evidencia de cada paso y
  **un `<iframe>` con la página del criterio**, viva y con HMR, para el humano.
- Al recibir un resultado, la tarjeta cambia y **su iframe se recarga**, para que el humano vea
  la versión que se acaba de medir.

El shell es el **mismo** en la pestaña de VS Code y en Chrome: el botón «Abrir en el
navegador» no es del shell, es de la pestaña (§4.10).

### 4.9. El protocolo del WebSocket

Solo **servidor → shell**, JSON de texto, uno por frame. Lleva versión desde el primer
mensaje, para poder cambiarlo sin romper un shell abierto.

```ts
interface SessionMessage {
  readonly v: 1;
  readonly type: 'session';
  readonly tag: string;
  readonly diagnostics: readonly WireDiagnostic[];
  readonly criteria: readonly {
    readonly id: string;
    readonly route: string;
    readonly steps: readonly { readonly block: BlockKind; readonly text: string }[];
  }[];
}
interface RunningMessage { readonly v: 1; readonly type: 'running'; readonly ids: readonly string[] }
interface ResultMessage {
  readonly v: 1;
  readonly type: 'result';
  readonly id: string;
  readonly verdict: 'pass' | 'fail' | 'error';
  readonly ms: number;
  readonly steps: readonly StepResult[];
  readonly pageErrors: readonly string[];
  /** Por qué el criterio no llegó a ejecutarse: la página no cargó, la fixture falló. */
  readonly error?: string;
}
interface ProblemMessage { readonly v: 1; readonly type: 'problem'; readonly message: string }
```

- Al conectar, el shell recibe el último `session` y el último `result` de cada criterio: un
  shell que se abre tarde (el botón del navegador) ve lo mismo que el que estaba abierto.
- Cada carga de sesión manda un `session` nuevo; el shell rehace las tarjetas.
- `problem` es lo que no es de un criterio: Vite no arranca, Chrome no se encuentra.
- `WireDiagnostic` es `{ code, severity, message, file, line, column }`: línea y columna se
  calculan al serializar (SDD-50), no se guardan.

### 4.10. VS Code

**El comando** `fudic.openWorkbench` («Fudic: Open Workbench»):

- **Ctrl+K V** (`cmd+k v` en Mac) con `when: editorLangId == fudic || editorLangId == fudspec`.
  Es el mismo atajo que la vista previa de markdown, que solo lo reclama con
  `editorLangId == markdown`: no chocan.
- En `editor/title`, con el icono `$(open-preview)`, para los mismos dos lenguajes. Y en la
  paleta.

**Lo que hace:**

1. El fichero activo es un `.fud` o un `.fudspec`; si no, el aviso `NO_ACTIVE_FUD`.
2. Resuelve `node_modules/@fudic/workbench/dist/bin.js` desde la carpeta del workspace que
   contiene el fichero; si no está, el aviso de §4.11.
3. **Un proceso por componente**, en un `Map<componente, Sesión>`. Si ya hay uno para ese
   componente (desde su `.fud` o desde su `.fudspec`), **revela su pestaña** y no lanza nada: el
   banco ya vuelve a ejecutar al guardar.
4. Si no, `spawn(node, [bin, fichero], { cwd: carpeta del workspace })`, con `node` = el ajuste
   `fudic.workbench.node` o `'node'`, y lee la primera línea de `stdout`. Con `{error}`, muestra
   el mensaje y no abre nada.
5. Abre un **webview** en `ViewColumn.Beside`, titulado `Workbench · <tag>`, con
   `enableScripts` y la CSP
   `default-src 'none'; frame-src <origen>; script-src 'unsafe-inline'; style-src 'unsafe-inline'`.
   Como en la prueba: una barra con el botón «Abrir en el navegador» y la URL a la vista y,
   debajo, un `<iframe>` con el shell a toda la altura.
6. «Abrir en el navegador» → `vscode.env.openExternal(url)`.

**Ciclo de vida:** cerrar la pestaña cierra el `stdin` del proceso, que se limpia solo
(§3.1). Si el proceso muere por su cuenta, la pestaña muestra «The workbench stopped» y el
último error de `stderr`. `deactivate` cierra todos. Un Chrome huérfano que sobrevive a la
ventana del editor es el peor defecto que esta función puede tener.

**Un ajuste:** `fudic.workbench.node` (string o `null`, por defecto `null`): el ejecutable de
Node. Vacío = el del `PATH`.

**Solo VS Code local** (§7): la URL es la de la línea JSON, `127.0.0.1`, sin traducir.

La extensión **no importa** `@fudic/workbench` ni Playwright: el límite es la línea JSON.

### 4.11. Qué se dice cuando no se puede

| Situación | Quién | Mensaje |
|---|---|---|
| No hay un `.fud` ni un `.fudspec` activo | extensión | `NO_ACTIVE_FUD`, el que ya existe. |
| El paquete no está en el workspace | extensión | «Fudic: `@fudic/workbench` is not installed in this workspace. Add it as a devDependency to open the workbench.» |
| `node` no se encuentra | extensión | «Fudic: could not run Node (`…`). Set "fudic.workbench.node" to your Node executable.» |
| El fichero no es un componente con tag | paquete | `FUD0970`, y el proceso sale. |
| No hay raíz de proyecto | paquete | `FUD0971`, y el proceso sale. |
| No hay `.fudspec` | paquete | `FUD0972` (aviso): se abre con el componente desnudo. |
| La fixture lanza al ejecutarse | paquete | `FUD0973`: en la tira, y los criterios con `props` en error. |
| Un valor inicial de `Signal` no es literal | paquete | `FUD0974`: ese criterio en error. |
| Chrome no se encuentra | paquete | `FUD0975`, y el proceso sale. |
| La `.fudspec` no valida | paquete | Sus propios códigos (SDD-52), en la tira; ningún criterio se ejecuta. |

### Catálogo de diagnósticos (`FUD0970`–`FUD0989`)

| Código | Severidad | Regla |
|---|---|---|
| `FUD0970` | error | El fichero abierto no es un componente con tag, ni la `.fudspec` de uno. Una página, una ruta o un layout no se abren en el banco (§7). |
| `FUD0971` | error | No hay `fudic.json` ni `package.json` por encima del componente: no hay proyecto donde levantar Vite. |
| `FUD0972` | warning | El componente no tiene `.fudspec`. Se abre sin criterios. |
| `FUD0973` | error | La fixture lanzó al ejecutarse. El mensaje lleva el error. |
| `FUD0974` | error | El valor inicial de una prop `Signal` de la fixture no sobrevive a `JSON.stringify`. |
| `FUD0975` | error | No se encuentra el Chrome del sistema (`channel: 'chrome'`). |
| `FUD0976`–`FUD0989` | — | Reservados. |

Los errores de un paso en ejecución (una referencia ambigua, un tiempo máximo, un término que
lanza) **no son diagnósticos**: son evidencia del criterio, y van en su tarjeta.

---

## 5. Invariantes

- **Un proceso por componente, un puerto, un origen.** Shell, WebSocket del banco, Vite y el
  HMR de Vite en el mismo `http.Server`.
- **La página de un criterio no lleva nada del banco.** Lo que el motor observa entra por CDP
  (`addInitScript`, `routeWebSocket`) y solo en su instancia.
- **La instancia que mide no escucha a Vite**, y la del humano sí.
- **Los términos corren sin cambios.** El `ctx` es el de [examples/basic/fudic/terms/](../../examples/basic/fudic/terms/).
- **Las acciones del `ctx` vuelven con el gesto atendido** (§4.6.3).
- **Una ejecución a la vez**, y como mucho una pendiente.
- **Nada lanza al usuario.** El proceso sale con código 1 y una línea `{error}`, nunca con un
  stack; un fallo de un criterio es su tarjeta en rojo.
- **Ninguna página generada queda en el proyecto** fuera de `node_modules/.fudic-bench/`.
- **Ningún proceso del banco sobrevive al editor.**
- **La API del paquete no conoce VS Code, y la extensión no conoce Playwright.**
- **Cobertura:** `@fudic/workbench` nace al **100 %** en las cuatro métricas, con
  `coverage.include: ['src/**/*.ts']` y sin un `v8 ignore`. `fudic-vscode` y
  `@fudic/diagnostics` no bajan de su 100 %.

---

## 6. Criterios de aceptación

Tests en `packages/workbench/test/` (1–22), `packages/vscode/test/` (23–27),
`packages/dom/test/` y `packages/vite/test/` (28–29). Los marcados **(navegador)** abren Chrome
de verdad, sin ventana, y entran en `pnpm test`: a partir de aquí `pnpm test` necesita Chrome
instalado.

**El objetivo y el plan (puros)**

1. **(rojo primero)** `resolveTarget` de un `.fud` y de su `.fudspec` da el mismo
   `BenchTarget`: tag, componente, `.fudspec`, fixture y raíz del proyecto (la del `fudic.json`).
2. `resolveTarget` de una página, de un layout o de un componente sin tag → `FUD0970`; sin
   `fudic.json` ni `package.json` por encima → `FUD0971`; sin `.fudspec` → el objetivo con
   `spec: null`.
3. **(rojo primero)** `planBench` sobre el `app-card.fudspec` del ejemplo: tres criterios, una
   página por criterio con exactamente la forma de §4.3 (documento completo, `fudic:runtime`,
   import sin `.ts`, `.prop=@nombre` con las claves de la fixture ejecutada). Se compara con un
   fichero esperado.
4. Un criterio sin `props` monta el componente desnudo y su página no tiene `@code`.
5. **Prop `Signal`.** Con una fixture cuyo valor es un signal, el plan genera el anfitrión de
   §4.3.1 con el valor inicial literal, y la página monta el anfitrión. Un criterio del mismo
   componente sin `Signal` no tiene anfitrión.
6. Un valor inicial de `Signal` que no sobrevive a `JSON.stringify` → `FUD0974` y el criterio
   planificado en error.
7. Los pasos conservan los argumentos como se escribieron, `role:tab/"Tab B"` incluido, y `props`
   no es un paso.

**El `ctx` y el motor (navegador)**

8. Cada término de `examples/basic/fudic/terms/` corre sin cambios contra una página servida
   por el banco.
9. **Referencias.** `app-card`, `role:link` y `role:link/"Featured"` encuentran su elemento; una
   referencia que casa con dos elementos es un error del paso que dice «2».
10. **`textContent` atraviesa el shadow root.** `text app-card "<título>"` pasa sobre el
    `app-card` del ejemplo; un texto dentro de un `<slot>` cuenta; el de un `<style>` no.
11. **(rojo primero) El primer click se atiende (bug A).** Un componente de pestañas con dos
    botones, un handler cada uno y el panel fuera de los botones: `click role:tab/"Tab B"` y
    después `text role:tabpanel "panel B"` pasa **a la primera**, sin espera previa y con 1 s y
    3 s de espera antes del click. Diez ejecuciones seguidas, diez verdes.
12. Un `then` en rojo no corta los siguientes `then`; un paso que lanza corta el criterio y lo
    deja en `error`; un `pageerror` deja el criterio en `error`.
13. `given route /blog` no navega y deja su evidencia «ignored».
14. **La página que mide no escucha a Vite.** Con la página de un criterio abierta en el motor,
    un `full-reload` de Vite no la recarga a mitad del criterio.
15. **Prop `Signal` viva.** Con `signal(10)` desde la fixture, `signal-display` del ejemplo
    pinta `10 — 20` (el caso de la prueba). Y un componente de prueba con una prop
    `Signal<number>` y un botón que hace `value.set(value() + 1)`: `click role:button` y después
    `text … "11"` pasa. El signal que el componente escribe es el del anfitrión, vivo.

**La sesión y el guardado (navegador)**

16. **Fixture ejecutada.** Los valores que llegan como props son los del objeto ejecutado; una
    fixture que lanza → `FUD0973`, criterios con `props` en error, los demás ejecutados.
17. **Una `.fudspec` que no valida** → sus diagnósticos en el `session` y ningún `result`.
18. **(rojo primero) Rojo → guardar el arreglo → verde.** El componente de pestañas con el bug
    (el handler de B pone el panel A): el criterio sale `fail`. Se escribe el arreglo en el
    `.fud`: llega un `running` y después un `result` con `pass`, sin tocar nada más.
19. Guardar la `.fudspec` con un criterio nuevo → un `session` con un criterio más y su página
    servida, sin reiniciar el banco. Guardar un término → se vuelve a ejecutar con el término
    nuevo.
20. **Una ejecución a la vez.** Cinco guardados durante una ejecución dan exactamente una
    ejecución más.

**El servidor y el binario**

21. `/__bench/` sirve el shell; `/__bench/ws` habla el protocolo de §4.9 (al conectar recibe el
    último `session` y los últimos `result`); el HMR de Vite conecta en el mismo puerto; una
    ruta que ni el banco ni Vite atienden es 404.
22. **El binario.** Con un componente: la línea JSON de §3.1 y el proceso vivo. Con una página:
    `{"error":{"code":"FUD0970",…}}` y código 1. Al cerrar `stdin`: termina, Chrome se cierra y
    `node_modules/.fudic-bench/<tag>` desaparece (salvo `--keep`).

**La extensión**

23. **Manifiesto y registro simétricos:** `fudic.openWorkbench` contribuido y registrado, el
    atajo `ctrl+k v` / `cmd+k v` con su `when` para `fudic` y `fudspec`, y la entrada de
    `editor/title`.
24. **(rojo primero)** Sin `.fud` ni `.fudspec` activo, avisa con `NO_ACTIVE_FUD` y no lanza
    nada. Con uno, lanza el binario con el fichero y el `node` del ajuste.
25. **Un proceso por componente.** Ctrl+K V en el `.fud` y luego en su `.fudspec` revela la
    misma pestaña y no lanza un segundo proceso; dos componentes distintos conviven; cerrar la
    pestaña cierra el `stdin` de su proceso; `deactivate` los cierra todos.
26. La pestaña enmarca la URL de la línea JSON y la muestra en su barra, su CSP permite
    exactamente ese origen en `frame-src`, y el botón llama a `openExternal` con esa URL.
27. **Sin el paquete instalado**, el aviso de §4.11 y ningún `spawn`; un `spawn` que falla con
    `ENOENT` da el aviso del ejecutable de Node; una línea `{error}` muestra su mensaje y no abre
    pestaña.

**Bug B**

28. `@fudic/dom`: `guardUrl` cargado por el **module runner de Vite** (`ssrLoadModule`) no lanza
    y avisa en desarrollo; cargado por Node sin Vite (el `dist`) no lanza y no avisa;
    `vi.stubEnv('DEV', false)` sigue apagando el aviso.
29. `@fudic/vite`: en `vite dev`, una ruta que pinta un atributo URL responde 200 (hoy, `/` y
    `/blog` de `examples/basic` dan 500).

**El ejemplo**

30. `examples/basic` tiene al menos un criterio en verde en `app-card.fudspec` y un componente
    de pestañas con su `.fudspec`, que es el de los criterios 11 y 18.

**Cobertura.** `@fudic/workbench` al **100 %** en las cuatro métricas desde su primer commit.
`fudic-vscode`, `@fudic/diagnostics` y `@fudic/dom` no bajan.

**Prueba de Pedro.** Con la extensión instalada desde el `.vsix`: Ctrl+K V sobre el componente
de pestañas del ejemplo; las tarjetas salen; se rompe y se arregla el handler guardando, y la
tarjeta pasa a rojo y a verde sola; «Abrir en el navegador» enseña lo mismo en Chrome; cerrar
VS Code no deja ningún Chrome ni ningún `node` vivo.

---

## 7. Fuera de alcance

- **VS Code remoto** (SSH, WSL, Codespaces). Ahí `127.0.0.1` no es la máquina del usuario y
  haría falta `vscode.env.asExternalUri`. Condición de reapertura: alguien lo usa en remoto.
- **La configuración de Vite del usuario.** El banco usa la suya (`configFile: false`). Un
  componente que solo compila con un plugin de Vite del usuario no se abre bien. Condición de
  reapertura: el primer componente que lo necesite.
- **Páginas, rutas y layouts.** El banco abre componentes. Un término que necesite navegar a
  otra página (`given route` de verdad) es un término de app y va con la app.
- **Props `computed`** en la fixture, y **slots** (contenido hijo) en el componente montado.
- **El MCP, la sesión grabada y el botón de aprobar** (IDEA-01 §4). El WebSocket de §4.9 es de
  un sentido; el vocabulario de vuelta se diseña con el MCP delante.
- **Métricas y Lighthouse.** La página del criterio tiene URL propia y nada del banco dentro, que
  es lo que las hará posibles.
- **Ejecutar `selfTest`** de los términos.
- **Ejecutar solo los criterios afectados** por un cambio. Se ejecutan todos (§4.7).
- **Varias ventanas de VS Code sobre el mismo componente.** Cada ventana lanza el suyo; los dos
  comparten `node_modules/.fudic-bench/<tag>` y el segundo vacía la carpeta del primero.

---

## 8. Decisiones

### 8.1. Las de la prueba, con Pedro (2026-10-03)

| # | Decisión | Por qué |
|---|---|---|
| 1 | `given route …` es solo un ejemplo: el componente se monta **aislado**, en una página generada. | El banco abre un componente, no una app. |
| 2 | Los términos son los de `fudic/terms/`: `run(ctx, args)` → `{ pass, evidence }`, con `ctx.locate` y `ctx.goto`. | Es el contrato que ya existe; el banco construye ese `ctx`. |
| 3 | **La fixture se ejecuta** (opción A). | Una prop puede ser `Signal<number>`, y su valor inicial sale de ejecutar `signal(10)`. |
| 4 | **Se hidrata.** | Sin reactividad las pruebas no sirven. |
| 5 | **Los criterios los ejecuta Playwright**, sin ventana. | Árbol de accesibilidad y eventos `isTrusted`. El webview no se puede pilotar. |
| 6 | **Vite va dentro del servidor del banco, como middleware.** | Ya compila, resuelve, hidrata y recompila. |
| 7 | **Se ven las dos cosas:** la pestaña de VS Code por defecto, y un botón al navegador. | Las dos son el mismo shell y el mismo WebSocket. |
| 8 | **Al guardar se vuelve a ejecutar solo.** | Escribir, guardar, ver el verde. |

### 8.2. Las que la prueba dejó abiertas (2026-10-05)

Pedro decidió **c**, **e**, **g** y **h**, y dejó el resto a la redacción, sin más vueltas.

- **a. Una referencia que casa con varios elementos es un error del paso** (§4.6.2). Tomar el
  primero deja criterios verdes que no dicen qué midieron.
- **b. `textContent` atraviesa el shadow root** y da el texto del árbol aplanado (§4.6.2). Es lo
  que un autor quiere decir con `text app-card "…"`.
- **c. (Pedro) El anfitrión de props `Signal` solo cuando hace falta** (§4.3.1).
- **d. La configuración de Vite del usuario no se carga** (§4.5, §7). Fusionarla obliga a
  sustituir el `fudic()` del usuario por el del banco dentro de su lista de plugins, y no hay
  componente que lo pida.
- **e. (Pedro) Sin VS Code remoto por ahora.** Ni `asExternalUri` ni pruebas: la pestaña usa la
  URL de la línea JSON tal cual (§4.10, §7).
- **f. El protocolo del WebSocket** es el de §4.9: un sentido, versionado, con el último estado
  al conectar.
- **g. (Pedro) La pestaña es la de la prueba**: el shell en un iframe, con una barra que lleva
  el botón «Abrir en el navegador» y la URL a la vista (§4.10). Ctrl+K V con el banco ya
  abierto revela esa pestaña: el guardado ya vuelve a ejecutar.
- **h. (Pedro) Un paquete propio, `@fudic/workbench`**, y no un subcomando de `@fudic/cli`.

---

## 9. Los dos bugs de la prueba

La prueba anotó dos bugs «de `main`, independientes del banco». Al reproducirlos para esta spec
(2026-10-05), uno era de `main` y el otro no.

### 9.1. Bug B — `pnpm dev` de `examples/basic` daba 500 en `/` y `/blog` (de `main`, arreglado)

`dev()` en [packages/dom/src/url.ts](../../packages/dom/src/url.ts) leía
`const meta = import.meta; meta.env?.DEV`. El module runner de Vite 8 hace de
`import.meta.env` un proxy que lanza en cualquier lectura que no sea la expresión estática
`import.meta.env.X`, que es la única que Vite reescribe. Saltaba en toda página que pinta un
atributo URL (`setUrl` → `guardUrl`).

**El arreglo** escribe `import.meta.env.DEV` entero, sin alias de `import.meta` y sin cast
alrededor (el tipo va en `src/env.d.ts`, que no se publica), con una guarda
`typeof import.meta.env !== 'object'` para cuando no hay Vite. Las tres variantes que no sirven,
medidas:

| Forma | `vite dev` | Node sin Vite | `vi.stubEnv` |
|---|---|---|---|
| `const meta = import.meta; meta.env?.DEV` (la de `main`) | 500 | ✅ | ✅ |
| `const env = import.meta.env; env?.DEV` (la de la prueba) | ✅ | ✅ | ❌ ve una copia |
| `(import.meta as X).env.DEV` | ✅ | ✅ | ❌ el cast deja de ser la expresión estática |
| `typeof import.meta.env` + `import.meta.env.DEV` (la elegida) | ✅ | ✅ | ✅ |

Verificado: `/`, `/blog` y `/about` dan 200 con `vite dev`; `guardUrl` importado del `dist` con
Node no lanza; los tests de `@fudic/dom` pasan; y Pedro lo probó en el navegador (2026-10-05).
Los criterios 28 y 29 son su regresión, y el de Vite sale en rojo con el código de `main`.

### 9.2. Bug A — «el primer click se pierde» (del banco, no de `main`)

**No se pierde.** Con la traza de los eventos en la página:

```
[2366] pointerdown / mousedown / focusin / mouseup / click   trusted=true   (el de Playwright)
[2371] fud:hydrated app-bench-tabs (3,8 ms)
[2372] focusin / click                                       trusted=false  (la repetición)
```

El capturador retiene el gesto, hidrata y lo repite, y el handler corre ~6 ms después del click.
La prueba leía el panel con `click()` → `waitForLoadState('networkidle')` → `textContent()`, y
ese `waitForLoadState` vuelve en 0–1 ms porque la página ya había llegado a `networkidle` antes
del click. Lee el estado de antes. Con la misma secuencia, el resultado cambia de una ejecución
a otra:

| Espera antes del click | `networkidle` tras el click | 1.ª lectura | 2.ª lectura |
|---|---|---|---|
| 0 ms | 0 ms | `valor 0` | `valor 1` |
| 1000 ms | 1 ms | `valor 1` | `valor 1` |
| 3000 ms | 1 ms | `valor 0` | `valor 1` |

La «2.ª lectura» que daba `valor 1` es el efecto del **primer** click, no del segundo. Leyendo
800 ms después del primer click, sale `valor 1` siempre (seis de seis, en frío y en caliente,
con el componente de la prueba y con su variante del banco). Y en el banco, después de guardar,
el chunk servido ya traía el arreglo: la tarjeta seguía roja por la misma carrera.

**El arreglo es del motor**, y es §4.6.3: las acciones del `ctx` vuelven cuando el gesto se ha
atendido. Su criterio es el 11.
