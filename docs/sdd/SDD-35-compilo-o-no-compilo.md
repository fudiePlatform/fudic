# SDD-35 — O compila o no compila: lo que el editor marca, el build lo rompe

> **Estado:** `Listo` — pendiente de la revisión de Pedro.
> **Paquetes:** `@fudic/typecheck` (**nuevo**: la máquina que hoy vive dentro del servidor de
> lenguaje, sacada a un sitio donde el build también la pueda usar) · `@fudic/language-server`
> (deja de tener su copia y la importa) · `@fudic/vite` (corre el chequeo en `build` y en `dev`,
> y deja de callarse errores) · `@fudic/compiler` (retira `FUD0197`–`FUD0199`)
> **Depende de:** 19 (el plugin), 23 (la proyección), 24 (el servidor), BUG-23 (el reparto
> compilador/TypeScript)
> **Rango de diagnósticos:** `FUD0870`–`FUD0889`
> **Decisiones de gramática:** ninguna. El autor no escribe nada nuevo.
> **Naturaleza:** build + editor. No toca el parser, la proyección ni el runtime.
>
> **Qué añade en una frase.** Si el editor marca un error en un `.fud`, `pnpm build` falla y
> `pnpm dev` enseña ese error en lugar de la página; no existe un comando aparte que haya que
> acordarse de correr.

---

## 1. Contexto y objetivo

### 1.1. Lo que hay hoy

fudic tiene dos compiladores que no se hablan. El **editor** proyecta cada `.fud` a TypeScript
(SDD-23) y le pasa un `Program` por encima: un valor fuera de una unión, una prop que no existe,
un payload de evento equivocado, una sección que el layout no declara, todo sale en rojo. El
**build** corre el parser, el pase semántico y el emit, y de los tipos no sabe nada:

```html
<app-badge .tone="@(42)"></app-badge>   <!-- tone?: 'neutral' | 'success' | 'info' -->
```

Rojo en el editor, `pnpm build` verde, y el error aparece en producción. Quien escribe con una
IA está peor: el agente escribe a disco sin editor, corre `pnpm build`, ve verde y da la tarea por
terminada.

Medido sobre el código, el build además **se calla errores que sí conoce**:

| Hueco | Dónde |
|---|---|
| Se para en el **primer** error (`this.error` lanza) y no enseña los demás | `vite/src/plugin.ts`, hook `transform` |
| El mensaje es `[FUD0123] texto (ruta)`: sin línea, sin columna, sin trozo de código | el mismo sitio |
| Las pasadas `?client` e `?ioc` descartan sus diagnósticos | `plugin.ts`, ramas `?client` / `?ioc` |
| Las pasadas `link` y `edge` llaman a `transformFud` y descartan `result.diagnostics` | `vite/src/link.ts`, `vite/src/edge.ts` |
| El descubrimiento de rutas parsea y tira los diagnósticos del parser | `vite/src/analyze.ts` |
| Un componente que ninguna ruta alcanza no se compila, así que su error no rompe nada | `vite/src/client.ts`, `discoverComponents` |
| En `dev`, el middleware de scripts de fudic se traga el error: `500` con `// fudic dev: failed…`, sin overlay y sin log | `plugin.ts`, middleware de `/fudic-*.js` y `/@fudic/h/*` |

### 1.2. La regla

**Un `.fud` con un error que el editor marca no compila.** Y «no compila» tiene un sentido
preciso:

- **`pnpm build`** no genera nada, imprime **todos** los errores con ruta, línea, columna,
  código, mensaje y el trozo de código, y sale con código distinto de cero.
- **`pnpm dev`** no sirve la página: en su lugar sale el overlay de Vite con el error, la misma
  posición y el mismo mensaje que en el editor. La terminal lista todos.

Un error que en el editor está en rojo y en el build sale como aviso en la consola **no vale**.
Un comando aparte (`fudic check`, al estilo de `vue-tsc`) **tampoco**: es una segunda verdad que
alguien tiene que acordarse de correr, y el día que no se corre el build vuelve a mentir.

### 1.3. Por qué una sola máquina y no dos

La paridad no se consigue escribiendo para el build algo que «haga lo mismo» que el editor. El
editor no usa solo la proyección de `@fudic/language-core`: encima de ella está Volar, que decide
cómo se resuelve `import … from './app-badge.fud'`, con qué nombre vive cada virtual en el
`Program`, qué diagnóstico cae en andamiaje y se descarta (su regla de inicio y fin sobre
`verification`), y cómo se deduplican. Y fudic añade lo suyo: el lote de JS que alimenta la
proyección (`batchDocumentJs`, que **no** es el `ownBatch` por defecto de `emitVirtualFiles`), el
`FileRegistry`, el montaje de los globals, y las reglas `FUD` que solo ve el servidor.

El arnés de tests de `language-core` (`test/typecheck.ts`) ya es esa «segunda máquina», y difiere
del editor en los nombres de fichero, las opciones, la regla de mapeo, el lote de JS y los
diagnósticos de sugerencia. Es exactamente el tipo de divergencia que este SDD existe para
impedir.

Así que se **mueve** la máquina del servidor a un paquete, `@fudic/typecheck`, y la usan los dos.
Para el lado de TypeScript se usa `@volar/typescript` —`proxyCreateProgram`, lo mismo que usa
`vue-tsc`—, que aplica a los diagnósticos de un `Program` normal el mismo filtro
`shouldReportDiagnostics` sobre `verification` que el servidor. El build no reimplementa nada de
Volar: lo usa.

### 1.4. Lo que este SDD NO es

- **No es un comando.** No hay `fudic check`. CI corre `pnpm build`, que es lo que ya corre.
- **No cambia la proyección.** Si un tipo se comprueba mal, es un defecto de SDD-23 y se arregla
  allí; aquí se ve en los dos sitios a la vez, que es justo lo que se quiere.
- **No es un linter.** Las sugerencias de TypeScript (variable sin usar, etc.) siguen siendo
  pistas del editor y no rompen nada.

---

## 2. Dependencias

| Fuente | Aporta |
|---|---|
| SDD-23 | `emitVirtualFiles`, `MappingCaps`, `GLOBALS_DTS`, `GLOBALS_FILE_NAME`, los nombres de los virtuales. Se consumen tal cual. |
| SDD-24 | El servidor: `language-plugin.ts` (el `LanguagePlugin` de Volar para `.fud`), `mappings.ts` (`MappingCaps` → `CodeInformation`), `document-cache.ts` (la receta parse → lote → emit), `parse.ts`, `js-batch.ts`, `file-registry.ts`, `globals.ts`, `project-files.ts` y `services/compiler-diagnostics.ts` con sus tres reglas (`href.ts`, `holes.ts`, `reserved-dollar.ts`). **Se mueven**, no se copian (§4.1). |
| SDD-19 | El plugin: `buildStart`, el hook `transform`, el middleware HTML de `dev` que ya manda los errores al overlay con `next(err)`. |
| BUG-23 | El reparto «una voz por hecho»: en el editor, las reglas de contrato las dice TypeScript y no `FUD0197`–`FUD0199`. Con TypeScript también en el build, el reparto se extiende al build (§4.7). |
| `@volar/typescript` 2.4.28 | `proxyCreateProgram`. La misma versión exacta que ya usa el servidor. |
| TypeScript 5.9.3 | Dependencia de runtime de `@fudic/typecheck`. |

---

## 3. Interfaz pública

### 3.1. `@fudic/typecheck`

Un paquete nuevo con dos clientes: el servidor de lenguaje y el plugin de Vite. Lo que exporta
son dos cosas, la máquina compartida y el chequeo de proyecto.

**La máquina compartida** —lo que hoy está en `language-server/src` y se mueve sin cambiar de
comportamiento—:

```ts
/** parse → JS batch → projection: the one recipe both clients use for a `.fud` (SDD-24 §4.1). */
export function projectFud(input: ProjectInput): ProjectedFud;

/** The Volar `LanguagePlugin` for `.fud`: service script, server extra script, extensions. */
export function fudLanguagePlugin(deps: LanguageDeps): LanguagePlugin<string>;

/** Every `FUD` diagnostic the editor shows for one document (today's `fudicDiagnostics`). */
export function fudicDiagnostics(document: ProjectedFud, index: LinkIndex): readonly Diagnostic[];

/** Serve `GLOBALS_DTS` under every `fudic-globals.d.ts` root, or add one (today's `mountGlobals`). */
export function mountGlobals<H extends GlobalsHost>(host: H, root: string): H;
```

Los nombres de los tipos de entrada (`ProjectInput`, `LanguageDeps`, `LinkIndex`,
`GlobalsHost`) los fija la implementación, con una condición: **ninguno nombra un tipo de
`@fudic/language-server` ni de `@volar/language-server`**. Lo que hoy recibe un `WorkspaceIndex`
pasa a recibir un puerto estrecho con lo que de verdad usa —para `createFileRegistry`,
`resolve(from, href)`; para las reglas de huecos, los huecos de un layout—, y el
`WorkspaceIndex` del servidor lo implementa.

**El chequeo de proyecto:**

```ts
/** One problem, already in `.fud` coordinates. */
export interface CheckProblem {
  /** Absolute POSIX path of the file. */
  readonly file: string;
  readonly span: Span;
  readonly severity: 'error' | 'warning';
  /** `FUD0123` for fudic, `TS2322` for TypeScript. */
  readonly code: string;
  readonly message: string;
}

export interface CheckReport {
  /** Sorted: path, then offset, then code (§4.6). */
  readonly problems: readonly CheckProblem[];
  /** Problems without a file: `FUD0870`, `FUD0871`. */
  readonly project: readonly ProjectProblem[];
  /** Every file the program read, `.fud` and not: what `dev` must watch. */
  readonly inputs: readonly string[];
}

export interface ProjectChecker {
  /** Check the whole project. Reuses the previous program when there is one. */
  check(): CheckReport;
  /** A file changed, appeared or went away: the next `check()` re-reads it. */
  invalidate(path: string): void;
}

export function createProjectChecker(options: { readonly root: string }, fs?: CheckFs): ProjectChecker;

/** `path:line:col - error TS2322: message` plus the code frame, for a terminal. */
export function formatProblem(problem: CheckProblem, root: string, source: string): string;
```

`CheckProblem` lleva `span` y no línea/columna. La conversión la hace `formatProblem` con el
`LineMap` del compilador, que es el único sitio donde un humano lo lee. `CheckFs` es el puerto de
disco (leer, existir, barrer `.fud`, resolver `href`); por omisión, el de Node.

### 3.2. `@fudic/vite`

Sin opción nueva. El chequeo está siempre encendido: un interruptor para apagarlo sería la puerta
por la que el build vuelve a mentir.

### 3.3. `@fudic/language-server`

Sin cambio visible. Importa de `@fudic/typecheck` lo que antes tenía dentro, y sus tests de
aceptación siguen pasando sin tocar una expectativa.

---

## 4. Comportamiento

### 4.1. La mudanza

Los ficheros de SDD-24 listados en §2 pasan a `@fudic/typecheck`. Las reglas:

- **Se mueven, no se copian.** Al terminar, `language-server/src` no tiene ninguna de esas
  funciones; las importa. Dos copias son dos verdades que divergen en el primer arreglo.
- **El comportamiento no cambia.** Los tests de aceptación del servidor son la red: pasan antes
  y después sin tocar una expectativa. Los tests unitarios de las piezas movidas se mueven con
  ellas.
- **Lo que dependa de `mode.ts`** (el índice calcula con él el tag de un fichero y los huecos de
  un layout) se mueve en la medida en que el chequeo lo necesite: lo que necesitan las reglas de
  §2, nada más. Lo que es solo del editor (completado, hover, contrato para la bombilla) se
  queda en el servidor.
- **`@fudic/vite` no depende de `@fudic/language-server`**, ni `@fudic/typecheck` de
  `@volar/language-server` / `@volar/language-service`. Solo de `@volar/language-core` y
  `@volar/typescript`.

### 4.2. El `Program` del build

Uno, con el proyecto entero. Un `.fud` usa el tipo de otro: `<app-badge .tone>` se comprueba
contra el `$Props` del virtual de `app-badge.fud`, que solo existe si está en el mismo `Program`.

**Ficheros.** Los mismos que el editor monta (`project-files.ts`, BUG-23): **todo** `.fud` bajo
la raíz del proyecto —barrido que salta `node_modules`, `dist` y `.git`, el mismo de
`node-fs.ts`— y los `.fud` de las librerías que el proyecto usa (`findLibraries`). **No** solo
los que alcanza una ruta: un componente que nadie usa todavía también está en rojo en el editor,
y por tanto rompe el build.

**Las librerías no rompen.** Sus `.fud` entran en el `Program` porque sus tipos hacen falta, pero
sus diagnósticos se callan, igual que en el editor (`silenceLibraryFiles`). Un error dentro de un
paquete instalado no es algo que el autor pueda arreglar en su proyecto.

**Los globals**, con la regla de `mountGlobals`: si el `tsconfig` ya incluye un
`fudic-globals.d.ts` (lo que escribe `fudic new`), su contenido se sustituye por `GLOBALS_DTS`;
si no, se añade uno. Nunca hay dos, y la versión del disco no vota.

**Las opciones** salen del `tsconfig.json` más cercano a la raíz, parseado con la extensión
`.fud` registrada (para que `include: ["**/*.fud"]` funcione), con `outDir` anulado y `noEmit`
forzado, como hace Volar. Sin `tsconfig`, las opciones inferidas que usa Volar en el editor —las
mismas, escritas como constante y comprobadas contra las de Volar en un test— y `FUD0870`
(`warning`): el chequeo corre con opciones que el proyecto no eligió, y callarlo sería mentir
sobre lo que se ha comprobado.

**El montaje** es `proxyCreateProgram(ts, ts.createProgram, …)` con `fudLanguagePlugin`, la misma
instancia de lógica que el servidor. Los nombres de los virtuales, la resolución de
`'./app-badge.fud'` y de `typeof import('./x.fud.server')`, y el filtro de andamiaje salen de ahí
y no se reescriben.

### 4.3. Qué es un error

Por cada `.fud` que no es de librería se recogen:

1. **De TypeScript:** los sintácticos y los semánticos del `Program`, y los de declaración si el
   `tsconfig` pide `declaration` o `composite`, que es lo que pide el editor. Ya llegan mapeados al
   `.fud` por `proxyCreateProgram`. Un diagnóstico que cae entero o en parte en andamiaje se
   descarta con la misma regla que en el editor.
2. **De fudic:** `fudicDiagnostics`, lo mismo que publica el servidor: parser, estructura, Oxc,
   pase semántico, `FUD0460`, huecos de layout, `FUD0461`.

Severidad: categoría `Error` de TypeScript o `error` de fudic **rompe**; `Warning` / `warning` se
imprime y no rompe. Las sugerencias de TypeScript y los `info` / `hint` de fudic no se imprimen:
en el editor son pistas grises, no errores.

**Un fichero que no parsea también se proyecta**, como en el editor (la proyección acepta un AST
parcial). Así sus consumidores no se llenan de `Cannot find module` en cascada, y el reporte es
el mismo que ve quien tiene el fichero abierto.

### 4.4. `pnpm build`

El chequeo corre en `buildStart`, **antes** de compilar nada, sobre el proyecto entero. Si hay
algún error:

1. Se imprimen **todos**, uno por bloque, con `formatProblem`:

   ```
   src/routes/index.fud:12:15 - error TS2322: Type 'number' is not assignable to type '"neutral" | "success" | "info"'.

     12   <app-badge .tone="@(42)"></app-badge>
                     ~~~~
   ```

2. El build falla **una vez**, con `this.error` y un resumen: `N errores en M ficheros`. No se
   escribe ningún fichero.

Los diagnósticos que solo existen en el emit (Oxc del emit, inyección, estilos adoptados, enlaces,
prerender…) siguen saliendo del hook `transform` y de `generateBundle`, pero con dos cambios:

- **Llevan posición.** `this.error` / `this.warn` reciben `loc` (fichero, línea, columna) y
  `frame`, no solo el texto.
- **No se para en el primero.** Los diagnósticos de un fichero se reportan todos y el fichero
  falla una vez.

Y se cierran los huecos de §1.1: `?client`, `?ioc`, `link`, `edge` y el descubrimiento de rutas
dejan de descartar diagnósticos. Si un diagnóstico ya lo dijo el chequeo (mismo fichero, mismo
span, mismo código), no se repite.

### 4.5. `pnpm dev`

El dev server tiene un `ProjectChecker` vivo:

- **Al arrancar** comprueba el proyecto entero e imprime lo que haya.
- **Al cambiar un fichero** de `CheckReport.inputs` —un `.fud` o un `.ts` que el `Program` leyó—,
  o al aparecer o desaparecer un `.fud`, llama a `invalidate` y vuelve a comprobar. El `Program`
  anterior se pasa como `oldProgram`, así que TypeScript solo rehace lo que cambió.
- **Si hay errores**, los imprime en la terminal y empuja el primero al overlay
  (`server.ws.send({ type: 'error', err })` con `message`, `id`, `loc` y `frame`). El overlay
  aparece sin recargar, aunque el error esté en un componente que la página abierta usa y no en
  la página.
- **Al pedir una página**, si alguno de los ficheros de su grafo (ruta, cadena de layouts,
  componentes, snippets: lo que `resolveDocument` ya devuelve) tiene un error, **no se sirve**: se
  llama a `next(err)` con ese error y Vite pinta el overlay, como ya hace hoy con un error de
  transform. Si hay una comprobación en curso, la petición la espera.
- **Al pasar de errores a limpio**, se manda `{ type: 'full-reload' }`, y la página vuelve sola.

El middleware de scripts de fudic (`/fudic-main.js`, `/fudic-boot.js`, `/fudic-sw.js`,
`/@fudic/h/*`) deja de contestar `500` con un comentario: su error va a `next(err)` y al
overlay, como el del HTML.

### 4.6. El reporte es estable

Ordenado por ruta POSIX relativa a la raíz, después por offset, después por código. Dos
ejecuciones sobre el mismo árbol dan el mismo texto byte a byte. Sin el desempate por código, dos
diagnósticos en el mismo offset salen en el orden en que TypeScript los devolvió, que no es
estable entre versiones.

### 4.7. `FUD0197`–`FUD0199` se retiran

BUG-23 los metió en el compilador porque el build no veía los tipos: la prop requerida que nadie
pasa, la prop que no existe, el slot que el padre no declara. El servidor ya no los reporta,
porque TypeScript dice lo mismo con más información (`TS2561` sabe que `currnt` quería ser
`current`; `FUD0198` no). Con TypeScript también en el build, reportarlos sería decir el mismo
error dos veces.

Así que se retiran: el build deja de emitirlos (`contractDiagnostics`) y los analizadores que solo
existían para ellos se borran. Sus casos de test pasan a ser casos del corpus de paridad (§6.3),
con el código `TS` que los sustituye. El rango queda anotado como retirado en SDD-12, igual que
`FUD0437` en SDD-40.

### 4.8. Rendimiento

Se promete **un** `Program` por build y, en `dev`, reutilización del anterior en cada cambio. No
se promete un tiempo. En un proyecto de mil componentes el build cuesta lo que cuesta TypeScript
sobre mil ficheros, porque es eso. No hay un interruptor para saltárselo (§3.2).

---

## 5. Invariantes

1. **Una sola máquina.** Proyección, lote de JS, registry, globals, `LanguagePlugin` y reglas
   `FUD` del editor existen una vez, en `@fudic/typecheck`. El servidor y el plugin los importan.
2. **Paridad.** Para todo `.fud` que no es de librería, los diagnósticos de severidad `error` y
   `warning` que el editor publica y los que el build reporta son el mismo conjunto: mismo
   fichero, mismo span, mismo código, misma severidad.
3. **Error ⇒ no compila.** Un `error` en ese conjunto hace fallar `pnpm build` y bloquea la página
   en `pnpm dev`. Nunca degrada a aviso.
4. **El andamiaje es invisible**, con la regla de Volar y no con una copia.
5. **El chequeo nunca deja pasar en silencio.** Si TypeScript lanza o el `Program` no se puede
   montar, es `FUD0871` (`error`) y el build falla: un chequeo que no pudo correr no es un chequeo
   verde.
6. **Spans, no líneas**, hasta `formatProblem`.
7. **Determinismo**, byte a byte (§4.6).
8. **Fronteras.** `@fudic/vite` no depende de `@fudic/language-server`. `@fudic/typecheck` no
   depende de `@volar/language-server` ni de `@volar/language-service`.

### Catálogo de diagnósticos (`FUD0870`–`FUD0889`)

| Código | Severidad | Qué dice |
|---|---|---|
| `FUD0870` | `warning` | No hay `tsconfig.json`; el chequeo usa las opciones por defecto del editor y puede no coincidir con lo que el proyecto quiere. |
| `FUD0871` | `error` | El chequeo de tipos no pudo correr (y por qué). El build falla. |
| `0872`–`0889` | | Reservados. |

Ninguno de los dos lleva span: son del proyecto, no de un fichero. Van en `CheckReport.project`.

Retirados por este SDD: `FUD0197`, `FUD0198`, `FUD0199` (§4.7).

---

## 6. Criterios de aceptación

**El hueco.**

1. **Se ve fallar primero.** Antes de tocar nada, un test con `.tone="@(42)"` contra
   `tone?: 'neutral' | 'success' | 'info'` afirma que `pnpm build` falla. Hoy está en rojo, y ese
   rojo queda registrado en el commit.
2. Con el SDD implementado, ese build falla con **un** problema `TS2322` cuyo span cubre `tone`
   —lo mismo que el editor (`language-server/test/acceptance/diagnostics.test.ts`, caso A)—, con
   ruta relativa, línea y columna 1-based y el trozo de código. No se escribe ningún fichero.

**La paridad.**

3. **El criterio que define el SDD.** Un corpus pasa a la vez por el servidor de lenguaje y por
   `createProjectChecker`, y los dos conjuntos de diagnósticos `error`/`warning` son iguales
   (fichero, span, código, severidad). El corpus contiene como mínimo: el limpio; los mutantes
   A–I de SDD-23 §6.2; los tres de BUG-16 §6.14; el cambio de tipo inter-fichero de SDD-24 §6.9;
   `FUD0461` de §6.11; un error de sintaxis; una sección requerida sin rellenar (SDD-48); un `href`
   que no resuelve (`FUD0460`); y los casos de test de `FUD0197`–`FUD0199`.
4. Las opciones inferidas sin `tsconfig` son las de Volar: un test las compara con las que exporta
   `@volar/language-server`, que solo es `devDependency` de `@fudic/typecheck` para eso.
5. Los tests de aceptación de `@fudic/language-server` pasan sin cambiar una expectativa, y
   `language-server/src` ya no contiene las funciones movidas (§4.1).

**El build.**

6. Dos ficheros con un error cada uno: el build imprime **los dos** y falla una vez, con el
   resumen `2 errores en 2 ficheros`.
7. Un componente al que no llega ninguna ruta, con un error de tipos, hace fallar el build.
8. Cambiar `type Tone` en `app-badge.fud` hace fallar el build con un error en **cada**
   consumidor.
9. Un componente mínimo sin `@code`, y uno con `@code` vacío, no producen ningún problema.
10. Con un `fudic-globals.d.ts` en disco incluido por el `tsconfig` y con contenido viejo: ningún
    `TS2300`, y lo que vale es `GLOBALS_DTS`.
11. Sin `tsconfig.json`: `FUD0870` como aviso, y el build termina si no hay errores.
12. Un `.fud` de una librería instalada con un error de tipos no rompe el build del proyecto que
    la usa.
13. Un `warning` se imprime y no rompe; un `error` rompe.
14. `<site-nav .currnt=…>` da solo `TS2561`, sin `FUD0198`, en el build y en el editor.
15. Un diagnóstico en cada uno de los caminos que hoy se descartan —`?client`, `?ioc`, `link`,
    `edge`, descubrimiento de rutas— hace fallar el build, y sale con `loc` y `frame`.
16. Con un `ts` que lanza al montar el `Program`, el build falla con `FUD0871` y sin un stack
    trace de Node.
17. Dos builds del mismo árbol con errores imprimen el mismo texto byte a byte, en el orden de
    §4.6.

**El dev server.**

18. Pedir una página cuyo grafo tiene un error de tipos no la sirve: la respuesta es el overlay
    de Vite con `loc` y `frame` del error.
19. Con la página abierta, guardar un componente que rompe a la página empuja el overlay sin
    recargar; arreglarlo manda `full-reload` y la página vuelve.
20. Un error en `/fudic-main.js` o `/@fudic/h/<tag>.js` llega al overlay, no a un `500` con
    comentario.

**La evidencia.**

21. `pnpm build` y `pnpm dev` de `examples/basic` salen limpios: el ejemplo compila bajo la regla
    nueva sin un solo error, y si no, se arregla el ejemplo o la proyección, nunca el chequeo.
22. **Pedro lo prueba en Chrome**: mete `.tone="@(42)"` en una página de `examples/basic`, ve el
    overlay en `pnpm dev`, ve fallar `pnpm build`, lo quita y ve volver la página.

**El cierre.**

23. `@fudic/typecheck` nace al **100 %** en las cuatro métricas. Los ficheros nuevos de
    `@fudic/vite` entran en sus umbrales por fichero al 100. `@fudic/language-server` sigue al
    100. Ningún `v8 ignore` sin un comentario que explique por qué su rama es inalcanzable.
24. `pnpm typecheck`, `pnpm test` y `pnpm build` verdes.

---

## 7. Fuera de alcance

- **Un comando `fudic check`.** Ver §1.2.
- **Incremental entre builds** (`tsBuildInfo`). Sin medir primero, es complejidad especulativa.
  En `dev` hay reutilización del `Program` (§4.5), que es donde importa.
- **Comprobar el CSS.** El servicio CSS del editor lo hace; qué es un error de CSS en un proyecto
  real es otra discusión.
- **Otra versión de TypeScript.** El chequeo usa la 5.9.3 de `@fudic/typecheck`, que es la que el
  servidor trae por defecto. Un usuario que elija otra versión en VS Code puede ver diferencias, y
  eso no se persigue aquí.
