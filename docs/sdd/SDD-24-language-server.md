# SDD-24 — Servidor de lenguaje (`@fudic/language-server`)

> **Estado:** `Hecho` — los 15 criterios de §6 verdes; 343 tests, cobertura 100 %
> (líneas, funciones, ramas, sentencias). Tareas en [SDD-24-Task.md](./SDD-24-Task.md).
> **Paquete:** `@fudic/language-server` (ejecutable), sobre `@fudic/language-core` (SDD-23)
> **Naturaleza:** servidor. Editor-agnóstico: ningún símbolo de VS Code entra aquí.
> **Rango de diagnósticos:** `FUD0460`–`FUD0479` (`0460` `href` sin resolver, `0461` prefijo
> `$` reservado). La validación de "sección obligatoria ausente" de §4.4 **no** se implementa:
> contradice SDD-21 §4.2, que fija el silencio como comportamiento correcto.

---

## 1. Contexto y objetivo

Montar el proceso LSP que sirve `.fud` a cualquier editor. Es **fontanería**: la
inteligencia entera vive en el emisor virtual de SDD-23 y en los services que ya existen
(TypeScript, HTML, CSS). Este documento fija cómo se ensamblan, qué peticiones se
soportan, y cómo se invalida el estado.

La decisión estructural: **Volar.js como framework**, no un servidor a mano. Volar existe
exactamente para el problema de "un fichero, varios lenguajes embebidos, mapeo de por
medio"; reimplementar el enrutado de peticiones por mapeo es varios miles de líneas ya
escritas y probadas por otros.

El servidor es editor-agnóstico por diseño, no por elegancia: el mismo binario sirve a
VS Code (SDD-25), Zed y Neovim sin tocar una línea.

---

## 2. Dependencias

- **SDD-23** — `emitVirtualFiles(ast, registry)`, la tabla de `Mapping` con `caps`, y el
  texto de los ambientes globales (`GLOBALS_DTS`), que este servidor monta como **lib
  virtual** del programa de TS. Así el LSP funciona en un proyecto que nunca pasó por la
  CLI; cuando el fichero existe en disco declara lo mismo, así que no hay conflicto.
- **Parser + semántica** — el AST y los diagnósticos.
- **Índice de componentes del workspace** — lo mantiene **este** servidor, y es quien
  implementa el puerto `FileRegistry` que SDD-23 consume (§4.5). Ni el emisor virtual ni el
  parser leen disco.
- **Volar.js** — `@volar/language-server`, `@volar/language-service`.
- **Services embebidos** — `volar-service-typescript`, `volar-service-html`,
  `volar-service-css`.
- **`typescript`** — el propio del proyecto del usuario cuando exista; si no, el
  empaquetado. La versión del proyecto manda siempre: un servidor que typechequea con una
  versión distinta de la del build produce diagnósticos que el CI no reproduce.

---

## 3. Interfaz pública

### 3.1. Ejecutable

```
fudic-language-server --stdio | --node-ipc | --socket=<port>
```

### 3.2. Capacidades declaradas

```ts
{
  textDocumentSync: 'incremental',
  completionProvider: { triggerCharacters: ['@', '<', '.', ':', '"', '/', ' '] },
  hoverProvider: true,
  definitionProvider: true,
  typeDefinitionProvider: true,
  referencesProvider: true,
  renameProvider: { prepareProvider: true },
  documentSymbolProvider: true,
  semanticTokensProvider: { legend: /* ver §4.3 */ },
  documentFormattingProvider: true,      // delega en SDD-26
  documentRangeFormattingProvider: true, // delega en SDD-26
  documentLinkProvider: true,            // href de <link rel="component"|"layout">
  codeActionProvider: true,
  diagnosticProvider: { interFileDependencies: true, workspaceDiagnostics: false }
}
```

`interFileDependencies: true` es obligatorio: cambiar `app-badge.fud` debe repintar los
errores de toda página que lo use.

### 3.3. Opciones de inicialización

```ts
interface FudicInitializationOptions {
  typescript: { tsdk: string };
  fudic?: {
    /** Diagnósticos de la plantilla contra los tipos. Default true. */
    templateDiagnostics?: boolean;
    /** Volcado de virtuals para depuración. Default false. */
    exposeVirtualFiles?: boolean;
  };
}
```

### 3.4. Peticiones propias

```
fudic/virtualFiles      params: { uri }  →  { fileName, languageId, text }[]
fudic/componentRegistry params: { uri }  →  { tag, href, resolved }[]
```

La primera existe para **depurar el LSP mientras se desarrolla**: sin poder ver qué se le
está enseñando a `tsserver`, todo diagnóstico raro se depura a ciegas. No es una
comodidad, es instrumental.

---

## 4. Comportamiento

### 4.1. Enrutado de peticiones

Toda petición sobre un `.fud` se resuelve así: offset del origen → `Mapping` → offset del
virtual → service correspondiente → respuesta → mapeo inverso al origen. Un tramo cuyo
`MappingCaps` no habilita la capacidad pedida **no enruta**: devuelve vacío. Es lo que
impide, por ejemplo, que un rename toque andamiaje.

Reparto por región del documento:

| Región | Service |
|---|---|
| `@code`, `@server`, `@client`, expresiones, cabeceras de control, plantilla | TypeScript, vía virtual de SDD-23 |
| `<style>` | CSS, vía virtual `.css` |
| markup HTML (tags nativos, atributos nativos) | HTML |
| `href` de `<link rel="component"\|"layout">` | propio (§4.2) |

Cuando dos services responden a la misma posición —típico en un atributo de un tag
nativo— se concatenan las respuestas de completado y se prefiere la de TypeScript para
hover y definición.

### 4.2. Completado de `href`

El único completado que no delega. Sobre `<link rel="component" href="…">` se listan los
`.fud` del workspace en ruta relativa, filtrados por modo: `rel="component"` ofrece solo
ficheros en **modo componente** (decisión 51), `rel="layout"` solo layouts. Un `href` que
no resuelve produce diagnóstico con span sobre el valor del atributo, más una code action
de creación del fichero.

#### 4.2.a. Los contextos exactos, y el que fusiona

Añadido por [BUG-15](./bugs/BUG-15-clases-sin-completado.md). El servidor contesta cinco
posiciones, y se reparten en dos grupos según lo que sabe de ellas.

**Contesta solo** —una respuesta ajena ahí es ruido sobre un conjunto cerrado y local— en un
`href`, tras `@section `, y tras **`class:`**, que es el quinto. Los nombres de clase salen del
`<style>` de este mismo fichero, ya parseado como `StyleNode` desde SDD-09: se leen del AST, se
ofrecen sin el punto y **no validan nada** — una clase que llega de una hoja externa se escribe
igual y no produce diagnóstico. La lista abierta es la decisión, no una limitación.

**Fusiona** tras un `<`: los componentes del workspace son una voz más junto a los tags nativos
del servicio HTML, ordenados delante por su `sortText`. Eso vive en un **plugin aparte**
(`createFudicTagService`, aditivo) porque en Volar la aditividad es una propiedad del plugin y
nunca de la posición: un solo plugin no puede tapar a los demás en un `href` y apartarse en un
`<`. Una palabra suelta fusiona con Emmet desde SDD-28 §5.3.

Y lo que **no** se disputa: una palabra dentro de un tag abierto es un nombre de atributo, y la
contesta quien sabe de HTML o la proyección. Por eso el espacio dejó de ser carácter de disparo
(§3.2) — declarar uno excluye a todo servicio que no lo declare, así que anunciarlo dejaba a
este servidor solo justo donde no tiene nada que decir.

**Lo que viene después:** `style:` y `bus:` comparten la forma de `class:` y no su respuesta —
los nombres de propiedad CSS son una tabla estática y los del bus son un `emit()` de otro
fichero (decisión 28.c)—, así que cada uno es su propio trabajo. Completar el **prefijo** en un
hueco del tag (`class:` / `style:` / `bus:` / `ref`) es la otra mitad, y toca el ancla de
completado de BUG-11.

### 4.3. Semantic tokens

El servidor emite tokens semánticos desde el AST real. Corrigen la gramática TextMate de
SDD-25, que es necesariamente aproximada en las transiciones `@`. Tipos propios además de
los estándar de TS: `fudDirective` (`@if`, `@foreach`, `@code`, `@server`, `@client`,
`@section`), `fudInterpolation`, `fudBinding` (`class:`, `style:`, `.prop`, `@evento`,
`ref`), `fudComponentTag` (tag resuelto a un `.fud`, distinguible visualmente de un tag
nativo).

### 4.4. Validaciones propias (las que no son de tipos)

La mayoría de reglas se cubren por tipos (SDD-23 §4.4). Quedan estas, que el servidor
reporta con span:

- **Namespace `$` reservado.** Identificador de usuario con prefijo `$` dentro de
  `@client` o `@server`. Se valida sobre nodos `Identifier` del AST de Oxc (declaración o
  referencia libre), nunca sobre texto: `foo$` y `obj.$bar` son válidos, solo el prefijo
  está reservado. Ya decidido; aquí solo se exige que corra **también en el LSP, mientras
  se escribe**, no solo en batch.
- **Sección obligatoria ausente:** el layout declara una sección que la página no rellena.
- **`href` no resuelto** (§4.2).
- Los diagnósticos de parseo y de semántica que el compilador ya produce, reenviados tal
  cual con su span.

### 4.5. Cache e invalidación

Estado cacheado y su clave:

| Cache | Clave | Se invalida con |
|---|---|---|
| AST | `uri` + versión del documento | cada edición |
| Virtuals | igual que el AST | igual que el AST |
| Registro de componentes | `uri` | edición del fichero, o alta/baja/renombrado de cualquier `.fud` |
| Índice del workspace (`.fud` → modo) | ruta | alta / baja / renombrado de `.fud` |
| Program de TS | lo gestiona el service | `tsconfig`, `package.json`, altas y bajas de fichero |

El **índice del workspace** es el estado que hace implementable el `FileRegistry` de
SDD-23 sin I/O síncrona por pulsación: un barrido de `**/*.fud` al arrancar, mantenido
después por los watchers, que guarda de cada fichero su ruta y su **modo** (componente /
página / ruta / layout, decisión 51 y SDD-21). El registro por fichero es entonces resolver
los `href` de sus propios `<link>` contra ese índice: una operación de mapa, en memoria.
Alimenta también el completado de `href` (§4.2) y el filtrado por modo.

**Watchers explícitos** sobre `tsconfig*.json`, `package.json` y creación / borrado /
renombrado de `.fud`. La invalidación del registro de componentes es **por fichero, no
global**: tirar el registro entero en cada `fudic generate` de la CLI convierte cada
scaffolding en un repintado completo del workspace.

**El AST se cachea por versión de documento.** Un `.fud` no se parsea dos veces por
pulsación: los tres virtuals, los diagnósticos y los semantic tokens salen del mismo AST.

Compartirlo con el plugin de Vite **no entra aquí**: son dos procesos distintos y no hay
canal entre ellos; hacerlo exigiría IPC y serializar el AST, que costaría más que
reparsear. El plugin mantiene su propia caché.

### 4.6. Reinicio

El servidor implementa `shutdown`/`exit` limpios y reconstruye todo estado desde cero al
arrancar. No hay estado en disco. La causa de reinicio siempre es externa (instalación de
dependencias, cambio de `tsdk`, algo que el watcher no vio); por eso el comando de
reinicio vive en el cliente (SDD-25) y aquí solo se garantiza que reiniciar sea barato y
completo.

---

## 5. Invariantes LSP

- **Nunca lanza.** Toda excepción se registra en el canal de trazas y la petición devuelve
  vacío. Un servidor que muere deja el fichero sin color y sin errores; es el peor fallo
  posible.
- **Sin estado global entre workspaces.** Un proceso puede servir varias carpetas.
- **El mapeo es la única vía.** Ninguna respuesta se construye con offsets del virtual sin
  pasar por el mapeo inverso.
- **Editor-agnóstico.** Cero dependencias de `vscode-*` fuera de los paquetes de protocolo
  (`vscode-languageserver` es protocolo, no editor).
- **La versión de TypeScript es la del proyecto.**
- **Cancelación honrada.** Toda petición larga comprueba el token; teclear rápido no
  encola trabajo muerto.

---

## 6. Criterios de aceptación

Workspace de prueba: el proyecto real con `blog/[slug].fud`, `_layout.fud`,
`site-nav.fud`, `app-badge.fud`.

1. **Arranque.** El servidor inicializa contra el workspace y declara las capacidades de
   §3.2. Sin `tsdk` válido, degrada a HTML+CSS y lo reporta en el log, sin morir.
2. **Diagnósticos.** Los nueve casos de SDD-23 §6 aparecen como diagnósticos LSP **en el
   span del `.fud`**, no del virtual. Es el test que valida el mapeo inverso completo.
3. **Completado de atributo.** Dentro de `<app-badge |>` se ofrece `tone`; dentro de
   `tone="@(|)"` se ofrecen `'neutral' | 'success' | 'info'`.
4. **Completado de tag.** Tras `<` se ofrecen los tags con `<link>` declarado, separados de
   los nativos.
5. **Completado de `href`.** Dentro de `href="|"` de un `rel="component"` se listan los
   `.fud` en modo componente y ninguno en modo página.
6. **Completado de sección.** Tras `@section ` se ofrece `nav` y solo `nav`.
7. **Definición.** F12 sobre `<app-badge>` abre `app-badge.fud`; sobre `@data.title` abre
   el tipo de retorno de `load()`; sobre `tone` en la plantilla abre su declaración en
   `@code`.
8. **Rename.** Renombrar `tone` desde la plantilla actualiza declaración y todas las
   referencias del `.fud`; renombrar sobre andamiaje no se ofrece (`prepareRename` vacío).
9. **Inter-fichero.** Cambiar `Tone` en `app-badge.fud` repinta el error de `tone` en
   `[slug].fud` sin tocar ese fichero.
10. **CSS.** Completado de propiedades dentro de `<style>`; `:host` y `::slotted()` no
    producen diagnóstico.
11. **Namespace `$`.** Declarar `const $x = 1;` en `@client` produce diagnóstico con span
    exacto **mientras se escribe**; `foo$` y `obj.$bar` no producen ninguno.
12. **Tolerancia.** Con un `<div>` sin cerrar, el completado sigue funcionando en las
    regiones sanas y el servidor no muere.
13. **Invalidación.** Crear un `.fud` con la CLI y añadir su `<link>` hace que el tag pase
    a resolver **sin reiniciar**.
14. **Cancelación.** Con un contador instrumentado de peticiones *completadas* frente a
    *canceladas*: una ráfaga de N ediciones seguidas de una pausa deja exactamente una
    petición completada por región de reposo, y las N−1 anteriores canceladas antes de
    typechequear. Se mide con el contador, no con tiempos: un criterio a reloj no es
    determinista en CI.
15. **`fudic/virtualFiles`.** Devuelve los tres virtuals de `[slug].fud` con su texto.

---

## 7. Fuera de alcance

- **Cliente de VS Code, TextMate, comandos, empaquetado** — SDD-25.
- **Algoritmo de formateo** — SDD-26. Aquí solo se declara la capacidad y se delega.
- **Generación de los virtuals** — SDD-23.
- **Reparseo incremental real.** Aquí se reparsea el documento completo por versión; la
  forma del AST ya lo permite, la implementación es un SDD posterior.
- **Workspace diagnostics** (typecheck del proyecto entero en segundo plano). Diagnósticos
  solo de ficheros abiertos; el chequeo total es tarea de `fudic check` en CI.
- **Refactors** (extraer componente, mover fichero actualizando `href`).
- **Integración con Zed y Neovim.** El servidor es agnóstico por construcción, pero las
  configuraciones concretas no se documentan aquí.
