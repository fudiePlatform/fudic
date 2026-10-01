# SDD-32 — Abrir en el navegador: el arnés del banco de trabajo (`@fudic/workbench`)

> **Estado:** `Listo`
> **Paquetes:** `@fudic/workbench` (**nuevo**) · `fudic-vscode` (un comando, un botón, tres
> ajustes)
> **Depende de:** 10 (estructura del documento) · 15 (emit: `resolveComponents` +
> `emitComponentModule` + `emitPageModule`) · 16 parte 1 (`@fudic/ssr`) · 25 (los puertos y el
> registro de comandos de la extensión)
> **Rango de diagnósticos:** `FUD0590`–`FUD0609`
> **Naturaleza:** herramienta de desarrollo. No toca el parser, ni el emit, ni el runtime.
>
> Es el paso 1 del troceado de
> [IDEA-01 §8](./ideas/IDEA-01-banco-de-trabajo-de-componentes.md) —*«playground sin IA»*—
> pero con **la topología del producto final ya puesta**: un documento anfitrión (el shell) que
> algún día tendrá el WebSocket, el panel y la checklist, y **el componente dentro de un
> iframe**, en su propia URL, limpio. Hoy el shell casi no hace nada. Da igual: es la frontera,
> y la frontera es lo único de este SDD que no se puede añadir después.

---

## 1. Contexto y objetivo

Hoy, para ver un componente hay que tener una app: un proyecto con `src/routes`, una ruta que lo
instancie, `pnpm dev` levantado y una pestaña abierta en la ruta correcta. Es el precio de
entrada para mirar **un fichero**. El editor ya sabe cuál es —está abierto, con el cursor
dentro— y el compilador ya sabe seguir sus `<link rel="component">`.

**El objetivo:** un botón en la barra del editor de cada `.fud` que abre ese componente,
renderizado, en un navegador. El compilador compila el fichero y sus dependencias, se monta una
página que las importa e instancia el componente, se renderiza a HTML y se sirve; Playwright
abre el navegador.

**Y el objetivo de verdad, el que decide la arquitectura:** que lo que se abra sirva
más adelante para **grabar la sesión de criterios de aceptación** (IDEA-01 §2 y §4) y para
**medir la calidad del componente** —CLS, INP, LCP, una auditoría Lighthouse— sin que la
herramienta se meta en medio de la medida. Eso no se implementa aquí. Lo que se decide aquí es
la topología que lo permite, porque es la que no se puede cambiar después: una métrica tomada
en un documento donde también vive el panel del banco de trabajo no es una métrica del
componente, es una métrica del banco de trabajo, y ningún número posterior arregla los
anteriores.

### 1.1. Tres documentos, no uno

```
   proceso Node  ──────────  un solo http.Server, un solo origen (127.0.0.1:P)
        │                     · GET  /                 → shell.html
        │                     · GET  /component.html   → lo que el compilador emitió
        │                     · upgrade ws://          ← RESERVADO (§4.7), no en este SDD
        ▼
   ┌───────────────────────────────────────────────┐
   │ shell.html          el ANFITRIÓN               │   aquí van, cuando lleguen:
   │  · tira de diagnósticos del compilador         │   el WS, la checklist, el chat,
   │  · <iframe src="/component.html">              │   el botón de aprobar, el panel
   │      ┌───────────────────────────────────┐     │
   │      │ component.html                    │     │   ← lo que Lighthouse audita
   │      │  DSD puro. Ni una línea del banco │     │     (en su propia URL, sin shell)
   │      └───────────────────────────────────┘     │
   └───────────────────────────────────────────────┘
```

Cuatro consecuencias, y ninguna es cosmética:

- **La medida es por documento.** CLS, INP y LCP son métricas *del documento que las produce*.
  Un panel de chat que crece, una checklist que se repinta o un WebSocket que entrega mensajes
  en el mismo documento que el componente ensucian las tres. El iframe le da al componente su
  propio documento, su propio viewport de layout y su propia atribución de interacción.
- **Lighthouse no audita el shell: audita `/component.html`.** Por eso el componente tiene URL
  propia y no es solo un hueco dentro del anfitrión. Una auditoría del shell mediría el banco de
  trabajo —su script, su WS, su panel— y daría un número que no significa nada.
- **Mismo origen, y por eso un servidor.** El shell tiene que poder leer el shadow DOM del
  iframe: **ese subárbol serializado es el artefacto** que IDEA-01 §4.3 quiere grabar junto al
  criterio. Con `file://` o con dos orígenes, no puede. El servidor no es un detalle de
  fontanería que sobre: es lo que hace posible tanto el WS de mañana como la lectura del DOM de
  hoy.
- **Un solo servidor.** Cuando llegue el WS será un `upgrade` sobre este mismo `http.Server`,
  en este mismo puerto. Ni un segundo proceso, ni un segundo origen, ni CORS.

### 1.2. Lo que este SDD no trae

No hay hidratación —SDD-17 está `Listo`, no `Hecho`—, no hay Service Worker, no hay dev server
y no hay JS de componente. Lo que llega al iframe es **nivel 1**: HTML con Declarative Shadow
DOM. No hay WebSocket, no hay checklist, no hay Lighthouse y no hay guía de estilos (§4.8, la
carencia que este SDD **no** puede cerrar). El shell de hoy es un iframe y una tira de
diagnósticos.

### 1.3. Por qué un paquete nuevo y no `@fudic/vite`

- **El plugin arrastra el proyecto entero:** resuelve rutas por sistema de ficheros desde
  `src/routes`, y lo que hay que abrir es **un fichero suelto**, que puede vivir fuera de
  cualquier proyecto.
- **Arrastra el modo:** SW, bootstraps, hidratación, precache. Todo lo de §1.2.
- **Y no valida nada.** El valor declarado de este paso en IDEA-01 §3.1 es *forzar a que el
  compilador exponga AST y emit por una API limpia*. Delegar en el plugin es no ejercitar esa
  API. Este paquete es el **segundo consumidor** de `resolveComponents` + `emit*`, y un segundo
  consumidor es lo único que demuestra que una API es una API y no el interior de otro paquete.

`@fudic/workbench` no depende de `@fudic/vite`, ni de `vite`.

---

## 2. Dependencias

| Fuente | Aporta |
|---|---|
| SDD-10 | `structureDocument` y `ComponentDocument.name`: si el fichero abierto es un componente, y cuál es su tag. |
| SDD-15 | `ResolveIo`, `resolveComponents(entryPath, io) → ComponentGraph`, `emitComponentModuleMapped`, `emitPageModuleMapped`. |
| SDD-16 (parte 1) | `SsrDom`, `serializeChunks`, `escapeText`, `jsonBlock` — el `io` que `page(data, io)` pide. |
| SDD-25 | `CommandDeps`, los puertos, `COMMAND_IDS` y el test de manifiesto que comprueba la simetría contribuido↔registrado. |

### 2.1. Dependencias del paquete nuevo, y las que deliberadamente no están

| Dependencia | Versión | Por qué |
|---|---|---|
| `@fudic/compiler` | `workspace:*` | Resolución del grafo y emit. Es el motivo del paquete. |
| `@fudic/ssr` | `workspace:*` | Ejecutar el módulo de página emitido. |
| `playwright` | `1.62.0` | El navegador. Versión exacta, alineada con el `@playwright/test` de `examples/basic`. |

`devDependencies`: `@fudic/tsconfig` (`workspace:*`) y `@types/node` (`22.20.0`).

Las ausencias son decisiones:

- **`@fudic/vite` y `vite`** — §1.3.
- **`@fudic/transport`** — no hay Service Worker.
- **`@fudic/core` y `@fudic/dom`** — no hay JS de cliente en el iframe. Entran cuando SDD-17
  esté `Hecho`.
- **Una librería de WebSocket** (`ws` o equivalente) — el canal es §4.7, y §7 dice por qué no
  se adelanta.
- **`lighthouse`** — la auditoría es §7. Cuando entre, se apoya en el CDP que Playwright ya
  expone, contra `componentUrl`.
- **`@fudic/conventions`** — el banco trabaja sobre **una ruta de fichero**, no sobre un
  proyecto. Esto cambia el día que haya guía de estilos (§4.8).
- **La extensión no depende del paquete:** lo **lanza** como proceso hijo (§4.6). Playwright
  dentro de un `.vsix` no es viable — ya es específico de plataforma por el binario NAPI de Oxc
  (SDD-25).

---

## 3. Interfaz pública

```ts
// packages/workbench/src/index.ts

export interface WorkbenchOptions {
  /** Raíz temporal donde el emit trabaja. Por defecto, la de §4.2. */
  readonly outDir?: string;
  /** No borrar esa carpeta al cerrar. Para depurar el emit. */
  readonly keepOutput?: boolean;
  /** Navegador sin ventana. Por defecto `false`: el gesto es "ábremelo". */
  readonly headless?: boolean;
  /** Canal de Chrome que Playwright usa. Por defecto `'chrome'`, el del sistema (§4.5). */
  readonly channel?: string;
  /** Puerto del servidor de sesión. Por defecto `0`: efímero. */
  readonly port?: number;
  /**
   * Markup extra para el `<head>` de la página sintética (§4.8). Es la costura por la que
   * entrará la guía de estilos cuando exista quien sepa decir cuál es. Vacío por defecto:
   * el banco de trabajo no inventa ninguna.
   */
  readonly pageHead?: string;
}

/** Una sesión viva: la página servida, el navegador abierto en el shell. */
export interface WorkbenchSession {
  /** El shell. Lo que el navegador abre. */
  readonly url: string;
  /** El componente, solo. Lo que se audita y lo que el iframe carga (§1.1). */
  readonly componentUrl: string;
  /** La ruta temporal donde quedó el emit (§4.2). */
  readonly dir: string;
  readonly tag: string;
  readonly diagnostics: readonly Diagnostic[];
  /** Cierra navegador y servidor, y borra `dir` salvo `keepOutput`. Idempotente. */
  close(): Promise<void>;
}

/** Falla ANTES de abrir nada: un fichero que no es componente, o que no se puede leer. */
export interface WorkbenchFailure {
  readonly diagnostic: Diagnostic;
}

export function openComponent(
  fudPath: string,
  options?: WorkbenchOptions,
): Promise<WorkbenchSession | WorkbenchFailure>;
```

Las costuras internas, cada una en su fichero y cada una probable sin navegador:

```ts
// packages/workbench/src/plan.ts — TODO el compilador, cero fs, cero red
export interface HarnessPlan {
  readonly tag: string;
  /** Nombre de fichero → contenido: `page.fud`, `page.mjs` y un `<tag>.mjs` por componente. */
  readonly files: ReadonlyMap<string, string>;
  readonly diagnostics: readonly Diagnostic[];
}
export function planHarness(
  fudPath: string,
  io: RecordingIo,
  pageHead?: string,
): HarnessPlan | WorkbenchFailure;

// packages/workbench/src/io.ts — el `ResolveIo` que no lanza (§4.3)
export interface RecordingIo extends ResolveIo {
  readonly diagnostics: readonly Diagnostic[];
}
export function nodeRecordingIo(): RecordingIo;

// packages/workbench/src/dir.ts
export function harnessDir(fudPath: string, outDir?: string): string;

// packages/workbench/src/render.ts
/** Importa `page.mjs` y lo renderiza con `@fudic/ssr`. Devuelve el documento, sin tocarlo. */
export function renderHarness(dir: string): Promise<string>;

// packages/workbench/src/shell.ts
/** El documento anfitrión: la tira de diagnósticos y el iframe. Puro, sin fs (§4.4). */
export function renderShell(input: {
  readonly tag: string;
  readonly componentPath: string;
  readonly diagnostics: readonly Diagnostic[];
}): string;

// packages/workbench/src/server.ts
export interface SessionServer {
  readonly origin: string;
  close(): Promise<void>;
}
/** Un `http.Server` sobre `roots`, en orden. El `upgrade` queda libre para §4.7. */
export function serveSession(roots: readonly string[], port: number): Promise<SessionServer>;

// packages/workbench/src/browser.ts — el ÚNICO fichero que importa `playwright`
export interface BrowserPort {
  open(url: string, options: { headless: boolean; channel: string }): Promise<BrowserHandle>;
}
export interface BrowserHandle {
  /** Se resuelve cuando el usuario cierra la ventana. */
  readonly closed: Promise<void>;
  close(): Promise<void>;
}
export function playwrightBrowser(): BrowserPort;
```

`openComponent` acepta un `BrowserPort` inyectado por un segundo parámetro interno (fuera de la
API pública): la orquestación se prueba entera con un doble de tres líneas, y el adaptador real
se prueba una vez con un navegador de verdad (§6.14).

### 3.1. El binario

```
fudic-workbench <file.fud> [--headless] [--keep] [--port <n>] [--out <dir>] [--channel <name>]
```

Imprime **una línea JSON** en `stdout` cuando la sesión está viva:

```json
{"url":"http://127.0.0.1:53411/","componentUrl":"http://127.0.0.1:53411/component.html",
 "dir":"…","tag":"app-card","diagnostics":[]}
```

…y sigue vivo hasta que el navegador se cierre, llegue `SIGINT`, o `stdin` se cierre —lo que
pasa cuando quien lo lanzó muere—. Ante un fallo de §3 imprime `{"error":{…}}` y sale con código
1. Una línea, JSON, y el proceso vivo: ese es todo el protocolo con la extensión, y es lo que lo
hace pilotable desde una terminal sin ninguna UI, que es lo que IDEA-01 §3.2 pide del paso
siguiente. `componentUrl` va en la línea desde el primer día porque es lo que un auditor
externo necesita, y añadir un campo después obliga a versionar el protocolo.

---

## 4. Comportamiento

### 4.1. La página sintética: por qué el arnés se escribe en `.fud`

`emitPageModule` toma un `ComponentGraph` cuya **entrada es una página** —hace
`graph.entry as PageDocument` sin preguntar—, así que no se le puede dar un componente. Y no
debería poder: una página tiene doctype, `<head>` y `<body>`, y un componente no tiene ninguna
de las tres cosas.

El banco de trabajo **escribe una página**, en `.fud`, en la carpeta temporal:

```html
<!DOCTYPE html>
<html>
  <head>
    <link rel="component" href="C:/…/src/components/app-card.fud">
    <title>app-card — fudic workbench</title>
    <meta charset="utf-8">
    <!-- aquí, y solo aquí, entra `pageHead` (§4.8) -->
  </head>
  <body>
    <app-card></app-card>
  </body>
</html>
```

- **Enlaza solo el componente objetivo.** Las dependencias transitivas las trae
  `resolveComponents` siguiendo los `<link>` del propio componente: «y sus dependencias» no es
  una función que haya que escribir aquí.
- **El `href` es absoluto y con barras hacia delante.** La carpeta temporal y el fichero pueden
  estar en unidades distintas; `resolve(dirname(from), href)` con un `href` absoluto acierta en
  los dos casos, y un `path.relative` entre `C:` y `D:` no existe.
- **Se escribe a disco.** Cuesta un fichero y compra que `--keep` deje un arnés recompilable a
  mano y que `io.read(entryPath)` no necesite un caso especial.
- **El componente se instancia desnudo.** Sin props y sin hijos: nadie ha dicho cuáles serían.
  El panel de props es IDEA-01 §3.1 y está en §7.

El emit se invoca con las opciones **por defecto** —`importExt: '.mjs'`, `linkAssets: false`,
`componentSpecifier` por defecto—, así que los módulos emitidos solo importan hermanos relativos
y **no tienen ni un especificador bare**: Node los importa tal cual, sin resolución, sin alias y
sin bundler.

### 4.2. La ruta temporal donde el emit trabaja

```
<outDir ?? os.tmpdir()>/fudic-workbench/<tag>-<sha256(realpath(fudPath)).slice(0, 8)>/
```

| Fichero | Qué es |
|---|---|
| `page.fud` | La página sintética de §4.1. |
| `page.mjs` | `emitPageModule(graph)`: importa los `<tag>.mjs` y expone `page(data, io)`. |
| `<tag>.mjs` | `emitComponentModule(graph, c)`, uno por componente del grafo. |
| `component.html` | El render de `page.mjs`. **Lo que el compilador emitió, sin una sola línea añadida.** |
| `shell.html` | El anfitrión: la tira de diagnósticos y el iframe (§4.4). |

- **Derivada del path, no aleatoria.** Dos clicks sobre el mismo fichero usan la misma carpeta:
  ni se acumula un directorio por pulsación ni hay que adivinar dónde mirar.
- **Vaciada al entrar** (`rm -rf` + `mkdir`), no sobrescrita: si el componente deja de enlazar
  `app-badge`, su `.mjs` de la corrida anterior sigue en disco y engaña a quien mire.
- **Borrada al cerrar**, salvo `keepOutput`.
- **Fuera del proyecto.** Dentro habría que ignorarla en git y —peor— el routing por sistema de
  ficheros de SDD-19 la publicaría como una ruta más.

### 4.3. Un `ResolveIo` que no lanza

`resolveComponents` llama a `io.read(path)` **sin guarda**: un `<link rel="component">` que
apunte a un fichero inexistente sube el `ENOENT` de `readFileSync` hasta el llamante. Que el
plugin de Vite no lo note es una casualidad de su contexto —compila proyectos que ya
construyen—; el banco de trabajo abre el fichero que hay en el editor **ahora**, con el `<link>`
recién tecleado y el destino todavía sin crear. Es el caso normal.

`nodeRecordingIo()` devuelve `''` ante una lectura fallida y apunta un **`FUD0592`** con la
ruta. `parse('')` produce un documento degradado cuyo `type` no es `component-document`, así que
`visitComponents` lo salta por su propia rama y el resto del grafo se resuelve entero.

### 4.4. El shell, y el invariante que lo justifica

**Invariante:** `component.html` es **exactamente** lo que `page.mjs` produce. El banco de
trabajo no le inyecta un script, ni un estilo, ni un atributo. Todo lo que observe, mida o
pilote vive en el shell o se inyecta en runtime por CDP (`addInitScript`, `Runtime.evaluate`),
nunca en el fichero.

Por eso el shell existe hoy, cuando todavía no tiene panel: sin él, lo primero que hiciera falta
—una tira de diagnósticos, un observador de métricas, un canal— se habría metido dentro del
documento del componente, y a partir de ese momento ninguna medida vale.

`renderShell` es una función pura de `(tag, componentPath, diagnostics)` a HTML, y hace dos
cosas:

- **Una tira de diagnósticos.** Los `Diagnostic` de la compilación —código `FUD`, mensaje, y el
  fichero— pintados arriba. Hoy solo se ven en `stdout` y en el aviso del editor; en el shell se
  ven **junto al componente que produjeron**, que es donde sirven. Si no hay ninguno, no hay
  tira.
- **El iframe**, `src="/component.html"`, ocupando el resto del viewport, sin `sandbox` — mismo
  origen a propósito (§1.1), porque leer su shadow DOM es el artefacto de IDEA-01 §4.3.

Y nada más. Sin JS propio en esta rebanada: el shell de hoy es HTML y CSS. El día que llegue el
WS, el `<script>` del shell es lo primero que se añade, y se añade **aquí**, no ahí dentro.

### 4.5. El servidor y el navegador

Un `node:http` sobre `127.0.0.1`, con **dos raíces en orden**: la carpeta temporal, y el
directorio del componente —para que un `<img src="./logo.svg">` escrito junto al `.fud` se vea—.
Cada petición se resuelve contra la raíz y se comprueba que sigue **dentro** de ella; un `..`
que se escape es un 404. Sin listados. `/` sirve `shell.html`. El tipo de contenido sale de un
mapa corto por extensión. Puerto `0` por defecto.

Assets fuera del directorio del componente —un `public/`, una ruta que suba dos niveles— **no se
sirven** (§7): 404 legible, no fallo silencioso.

`playwrightBrowser()` es el único fichero que importa `playwright`: `chromium.launch({ headless,
channel })`, `newPage()`, `goto(shellUrl)`, y `closed` como promesa del evento `close`.
**`channel: 'chrome'` por defecto** —el Chrome del sistema, no el navegador que Playwright
descarga—: la misma decisión, por la misma razón, que ya tomó
[`examples/basic/playwright.config.ts`](../../examples/basic/playwright.config.ts).

**Y una consecuencia que hay que decir en voz alta:** el test de §6.14 abre un navegador de
verdad y entra en `pnpm test`. Es el único camino honesto a la cobertura de ese fichero —la
alternativa sería un `/* v8 ignore */` sobre la línea que da nombre al paquete— y significa que
a partir de aquí `pnpm test` necesita Chrome instalado.

### 4.6. El botón, y cómo la extensión llega al paquete

Un comando, `fudic.openInBrowser` («Fudic: Open in Browser»), icono `$(preview)`, contribuido en
`editor/title` con `when: resourceExtname == .fud` y grupo `navigation`; también en la paleta. El
manifiesto y `COMMAND_IDS` siguen simétricos: el test de manifiesto pasa a comprobar seis
comandos.

La extensión no importa `@fudic/workbench`: lo **lanza**. Un puerto nuevo, `WorkbenchPort`, con
una operación —`open(fudPath)`— y un adaptador que resuelve
`node_modules/@fudic/workbench/dist/bin.js` desde la carpeta del workspace, hace
`spawn(nodeBin, [bin, fudPath, ...flags])` con `nodeBin` = el ajuste `fudic.workbench.node` o
`'node'`, y lee la primera línea de `stdout`.

**Un hijo por fichero**, en un `Map<path, ChildProcess>`. Un segundo click sobre el mismo `.fud`
mata el anterior y lanza uno nuevo: es lo que hace que el botón signifique «recompílamelo y
enséñamelo» sin inventar un protocolo de recarga. `deactivate` los mata todos — un Chrome
huérfano que sobreviva a la ventana del editor es el peor defecto que esta función puede tener.

**Tres ajustes**, resueltos con el mismo `asBoolean`/`asPath` de SDD-25 §3.2:

| Ajuste | Tipo | Defecto | Qué hace |
|---|---|---|---|
| `fudic.workbench.headless` | boolean | `false` | Pasa `--headless`. |
| `fudic.workbench.keepOutput` | boolean | `false` | Pasa `--keep`. |
| `fudic.workbench.node` | string/null | `null` | El ejecutable de Node. Vacío = el del `PATH`. |

### 4.7. El canal que todavía no está, y el hueco que se le deja

El banco de trabajo terminado necesita que **el cliente le cuente al servidor** lo que pasa: el
criterio aprobado, el shadow DOM serializado en ese instante, los eventos, las métricas
(IDEA-01 §4). Eso es un WebSocket, y **no está en este SDD**. Lo que sí está es que no haya que
mover nada para ponerlo:

- **Un `http.Server`, no un handler estático.** El `upgrade` está libre; el canal vive en el
  mismo puerto y el mismo origen. Ni segundo proceso, ni CORS, ni negociación.
- **El extremo cliente será el shell**, no el componente. El componente no habla con nadie; el
  shell lee su iframe y reporta. Es lo que mantiene el documento medido limpio.
- **El extremo servidor será el proceso que ya está vivo**, el mismo que sostiene el navegador
  y la carpeta temporal, y el mismo que —por §3.1— ya tiene una sesión identificada.

No se escribe hoy porque un canal sin nada que transportar es un formato de mensajes inventado a
ciegas, y IDEA-01 §3.2 dice exactamente por qué eso sale mal: *lo difícil no es el transporte,
es decidir el vocabulario*.

### 4.8. La guía de estilos: la carencia, dicha entera

Un componente abierto en el banco de trabajo se ve **sin la guía de estilos del proyecto**: sus
tokens, su tipografía, su reset. Y eso no es un detalle estético — es un problema de validez.
El gesto entero de IDEA-01 §4.1 es el developer diciendo *«esto que veo es lo correcto»*, y un
componente pintado fuera de su sistema de diseño no es lo que va a producción: aprobarlo no
significa nada.

**Este SDD no la implementa, porque no existe.** No hay SDD, no hay decisión de gramática y no
hay convención: no se puede especificar el consumo de algo cuya forma nadie ha fijado. Lo que
este SDD sí hace es **dejar la costura en el sitio correcto y no inventar el mecanismo**:
`WorkbenchOptions.pageHead` es markup que entra en el `<head>` de la página sintética (§4.1), y
la página sintética es un `.fud` compilado por el emit de verdad. Sea lo que sea la guía de
estilos —un `<link rel="stylesheet">`, un `<style>` de tokens, una construcción nueva—, si se
declara en el `<head>` de una página, entra por ahí sin tocar una línea de este paquete.

Y las preguntas que el SDD que la especifique tendrá que contestar, porque de la primera cuelgan
todas las demás:

1. **¿Tokens o reglas?** Las custom properties **atraviesan la frontera del shadow root por
   herencia**: si la guía son tokens, un `<style>` sobre `:root` en la página basta y no hace
   falta nada por componente. Si son reglas (`.btn { … }`), **cada shadow root tiene que
   adoptarla**, y entonces es maquinaria de emit —la de SDD-18, `<style type="module"
   specifier>` + `data-fud-adopt`, que ya existe y ya sabe hacerlo—. Son dos SDD distintos con
   el mismo nombre.
2. **¿Dónde se declara?** Convención de directorio, entrada de configuración, o un `<link
   rel="…">` en el layout. De esto depende que el banco de trabajo pueda encontrarla partiendo
   de **una ruta de fichero suelta**, que es todo lo que tiene.
3. **¿Y cuando no hay proyecto?** Un `.fud` abierto fuera de todo proyecto no tiene guía. El
   banco de trabajo tiene que seguir abriéndolo.
4. **Orden de cascada** frente al `<style>` propio del componente, y si hay capas.

Mientras eso no exista, `pageHead` va vacío y el componente se ve desnudo. Está anotado en §7
con la condición de reapertura.

---

## 5. Invariantes

- **`component.html` es byte a byte lo que el compilador emite.** Ni un script, ni un estilo, ni
  un atributo del banco de trabajo. Es lo que hace que lo que se ve, y lo que se mida, sea el
  componente y no la herramienta.
- **Tres documentos y un origen.** Shell → iframe → componente, servidos por un único
  `http.Server` en un único puerto, con el `upgrade` reservado para el canal.
- **El componente tiene URL propia y no depende del shell.** `componentUrl` se abre sola, y es
  lo que un auditor externo audita.
- **El navegador recibe nivel 1** dentro del iframe: DSD y CSS adoptado. Ni un `<script src>`,
  ni un `type="module"`, ni un Service Worker.
- **El compilador se usa por su API pública.** `@fudic/workbench` importa de `@fudic/compiler` y
  `@fudic/ssr`, y de nada más del repo. No reimplementa emit ni copia una línea del plugin.
- **Nada lanza al usuario.** Los fallos de §4.9 son un `Diagnostic` o un aviso; el proceso sale
  con código 1 y un JSON, nunca con un stack.
- **El emit trabaja siempre fuera del proyecto**, en la ruta de §4.2, vaciada al entrar y
  borrada al salir.
- **Un hijo por fichero, y ninguno sobrevive al editor.**
- **La API del paquete no conoce VS Code, y la extensión no conoce Playwright.** El límite es la
  línea JSON de §3.1.
- **Cobertura: `@fudic/workbench` nace al 100 %** en las cuatro métricas,
  `coverage.include: ['src/**/*.ts']`, sin un solo `v8 ignore`. `fudic-vscode` no baja de su
  100 %.

### 4.9 · Qué se dice cuando no se puede

| Situación | Quién | Mensaje |
|---|---|---|
| No hay un `.fud` activo | extensión | `NO_ACTIVE_FUD`, el que ya existe. |
| El paquete no está en el workspace | extensión | «Fudic: `@fudic/workbench` is not installed in this workspace. Add it as a devDependency to open components in the browser.» |
| `node` no se encuentra | extensión | «Fudic: could not run Node (`…`). Set "fudic.workbench.node" to your Node executable.» |
| El fichero no es un componente | paquete | `FUD0590`, con el span del documento. |
| El fichero no se puede leer | paquete | `FUD0591`. |
| Un `<link rel="component">` roto | paquete | `FUD0592`, y el arnés se abre igual, sin ese tag. |

Los diagnósticos del compilador (`EmitOutput.diagnostics`) viajan en la línea JSON, se pintan en
la tira del shell y **no impiden abrir**: una página degradada que se ve es más informativa que
un aviso que dice que algo falló.

### Catálogo de diagnósticos (`FUD0590`–`FUD0609`)

| Código | Regla |
|---|---|
| `FUD0590` | El `.fud` abierto no es un componente. Una página, una ruta o un layout necesitan `load()` y una cadena de layouts que este SDD no ejecuta (§7); un componente degradado sin host (`FUD0156`) no tiene tag que instanciar. |
| `FUD0591` | El `.fud` objetivo no se puede leer. |
| `FUD0592` | Un `<link rel="component" href>` alcanzado desde el objetivo apunta a un fichero ilegible. El arnés se monta sin ese componente. |
| `FUD0593`–`FUD0609` | Reservados. |

---

## 6. Criterios de aceptación

Tests en `packages/workbench/test/` (1–16) y `packages/vscode/test/` (17–20).

**El plan (`planHarness`, sin fs ni navegador — `RecordingIo` en memoria)**

1. **(rojo primero)** Un componente hoja: `files` trae `page.fud`, `page.mjs` y `<tag>.mjs`;
   `page.fud` enlaza el objetivo por ruta absoluta e instancia `<tag></tag>`; `tag` es el `name`
   del `ComponentDocument`.
2. **Dependencias transitivas.** A enlaza B, B enlaza C → tres `.mjs` y un `page.mjs` que
   importa los tres. Es «compila ese fichero y sus dependencias», verificado.
3. **Diamante.** B y C enlazan D → un solo `d.mjs`.
4. **Un `<link>` roto no rompe nada:** `FUD0592` en `diagnostics`, el resto emitido, el arnés
   completo.
5. **El objetivo no es un componente** (página, ruta, layout, y un componente sin host):
   `WorkbenchFailure` con `FUD0590`; ningún fichero, ningún navegador.
6. **El objetivo no se lee:** `FUD0591`.
7. **Los diagnósticos del emit se propagan.** Un componente con `@code` que no parsea sale en
   `plan.diagnostics` y **aun así** produce su `.mjs`.
8. **`pageHead` entra donde dice §4.8 y en ningún otro sitio.** Un `<style>` pasado por ahí
   aparece en el `<head>` de `page.fud` y llega al documento renderizado; sin `pageHead`, el
   `<head>` es el de §4.1 exactamente.

**La ruta temporal, el render y el shell**

9. `harnessDir` es estable para la misma ruta, distinta para dos ficheros con el mismo tag en
   carpetas distintas, y honra `outDir`. Escribir el plan **vacía** la carpeta: un `.mjs`
   sobrante de una corrida anterior ya no está.
10. **(rojo primero)** `renderHarness` devuelve un documento con `<!DOCTYPE html>`, el
    `<template shadowrootmode="open">` del componente, su texto renderizado y su
    `<style type="module" specifier="<tag>">` en el `<head>`.
11. **El documento del componente está limpio.** `component.html` es **idéntico** a lo que
    `renderHarness` devolvió: no contiene `iframe`, ni `ws://`, ni ninguna marca del banco de
    trabajo, ni un `<script src>`, ni un `type="module"` de script. Es el invariante de §4.4, y
    es el test que impide que mañana alguien resuelva un problema inyectando ahí dentro.
12. **El shell.** `renderShell` produce un documento con `<iframe src="/component.html">`; con
    diagnósticos, los pinta con su código `FUD` y su mensaje; sin ellos, no hay tira. Es una
    función pura: se prueba comparando strings, sin servidor.

**El servidor**

13. `/` sirve el shell y `/component.html` el componente, ambos como `text/html`; un fichero
    junto al `.fud` (`logo.svg`) se sirve desde la segunda raíz con su tipo; cualquier ruta que
    escape de las raíces da 404, y una inexistente también. `port: 0` levanta en un puerto
    efímero y `origin` lo refleja.

**La sesión completa**

14. **(navegador de verdad, headless, `channel: 'chrome'`)** `openComponent(fixture)` abre el
    **shell**, y desde el documento padre se alcanza el `contentDocument` del iframe y se lee el
    contenido del shadow root del componente — que es, además, la prueba de que el mismo origen
    de §1.1 funciona y de que el artefacto de IDEA-01 §4.3 será alcanzable. `close()` cierra
    navegador y servidor y borra la carpeta; con `keepOutput: true` la deja; llamarlo dos veces
    no lanza.
15. **La orquestación, con un `BrowserPort` doble:** plan → escritura → render → shell →
    servidor → navegador, en ese orden, y un fallo de §6.5 corta antes de escribir un byte. El
    navegador se abre en `url` (el shell), nunca en `componentUrl`.
16. **El binario.** Con un componente: una línea JSON con `url`, `componentUrl`, `dir`, `tag` y
    `diagnostics`, y el proceso sigue vivo. Con un no-componente: `{"error":…}` y código 1. Al
    cerrarse `stdin`, el proceso termina y la carpeta desaparece.

**La extensión**

17. **Manifiesto y registro simétricos:** `fudic.openInBrowser` contribuido y registrado, y el
    `editor/title` con `when: resourceExtname == .fud` y su icono.
18. **(rojo primero)** Sin `.fud` activo, avisa con `NO_ACTIVE_FUD` y **no lanza ningún
    proceso**. Con uno, lanza el binario con la ruta y los flags que dictan los tres ajustes.
19. **Ciclo de vida:** un segundo click sobre el mismo fichero mata el hijo anterior; dos
    ficheros distintos conviven; `deactivate` los mata todos.
20. **Sin el paquete instalado**, el aviso accionable de §4.9 y ningún `spawn`; un `spawn` que
    falla con `ENOENT` da el aviso del ejecutable de Node.

**Cobertura.** `@fudic/workbench` al **100 %** en las cuatro métricas desde su primer commit.
`fudic-vscode` sigue al 100 %.

---

## 7. Fuera de alcance

- **El canal WebSocket y la sesión grabada.** §4.7 deja el `upgrade`, el extremo cliente y el
  extremo servidor decididos; el vocabulario de mensajes es IDEA-01 §3.2/§4.3 y se diseña con el
  MCP delante, no antes.
- **Métricas y Lighthouse.** CLS, INP, LCP y la auditoría. La topología de §1.1 es lo que las
  hace posibles —documento propio, URL propia, cero JS del banco dentro— y `componentUrl` está
  en el protocolo desde hoy para que la auditoría no tenga que cambiarlo. Se implementan cuando
  haya algo que comparar contra algo.
- **La guía de estilos.** §4.8, entera, con las cuatro preguntas que su SDD tiene que contestar.
  **Condición de reapertura:** existe SDD con la forma decidida. Hasta entonces, `pageHead` va
  vacío y el componente se ve desnudo — y hay que saberlo al mirarlo.
- **Hidratación y JS de cliente.** SDD-17 está `Listo`, no `Hecho`. Cuando lo esté, el arnés
  gana `@fudic/core`, los `.client.mjs` (`emitComponentClientModule` ya existe) y un
  `resolveChunk` que los sirva desde la misma carpeta. Es aditivo.
- **Service Worker, dev server, HMR y recarga al guardar.** Volver a pulsar el botón recompila.
- **Props y slots.** El componente se instancia desnudo (§4.1). El panel que los edita necesita
  antes que el compilador exponga la forma de `props<{…}>()`, que hoy solo conoce el emisor TS
  virtual de SDD-23.
- **Páginas, rutas y layouts.** Una página necesita el `data` de su `@server { load }` —el
  módulo `?server` que SDD-19 posee— y una ruta además su cadena de layouts (SDD-21). Abrirlas
  sin eso sería renderizar contra `{}` y reventar en la primera interpolación. El dev server ya
  las sirve; el banco es para lo que el dev server **no** puede abrir solo.
- **Assets fuera del directorio del componente**, `public/`, y el pipeline de assets de SDD-19
  §4.5 (`linkAssets` desactivado).
- **Monaco y los cuatro paneles** (`view`/`AST`/`JS cliente`/`JS servidor`). El shell es su sitio
  natural y por eso existe; el contenido es IDEA-01 §3.1.
- **El polyfill de adopción de estilos.** Lo emite `emitPageModule` (SDD-18 §5) inline y
  bloqueante en `<head>`, y el banco de trabajo **no lo toca** — el invariante de §4.4 se lo
  prohíbe. Pero es un `<script>` que corre antes del body y que en el navegador de la sesión
  probablemente no hace nada: el día que se midan métricas de verdad, es ruido en el documento
  medido. La palanca correcta es **una opción de emit en SDD-15/SDD-18**, no que el banco monte
  su propia página. Anotado aquí para que se decida allí.
- **Mover el test de navegador a un carril e2e propio.** Hoy entra en `pnpm test` (§4.5); si esa
  dependencia de Chrome molesta en CI, la separación es un `test:e2e` y una línea de workflow.
