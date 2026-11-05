# SDD-78 — El MCP de fudic: ver la pieza

> **Estado:** `Listo` — [tareas](./SDD-78-Task.md).
> **Paquetes:** `@fudic/mcp` · `@fudic/testing` · `@fudic/workbench` · `@fudic/history` ·
> `@fudic/vite` · `@fudic/diagnostics`
> **Depende de:** 77 (el MCP entero, `fudic_status` incluido), 57 (`@fudic/testing`: `mount`,
> `visit`), 64 (`outline`, el motor del banco y sus capturas), 65 (el historial y la línea `look`),
> 66 (`g showcase`), 69 (la sesión por cookie)
> **Rango de diagnósticos:** `FUD1420`–`FUD1439` (nuevo).
> **Decisiones de gramática:** ninguna.
> **Origen:** [IDEA-07](./ideas/IDEA-07-mcp-de-fudic.md) §5.12, §5.13, §10.1, §10.5 y §11.4 bis.
> **Rama sugerida:** `sdd-78-ver-la-pieza`
>
> **Qué añade en una frase.** Cuatro herramientas para que el chat y el usuario **vean** lo que se
> ha creado: pintar una pieza (y verla dentro del chat), llamar a una función, abrir la app entera
> en una URL que llega por el túnel y aprobar el aspecto de un componente con capturas de antes y
> después. Con la última, el MCP queda cerrado para trabajar sobre una carpeta.

---

## 1. Contexto y objetivo

SDD-77 deja el proyecto creado y en verde, pero **nadie lo ha visto**. El chat sabe que los tests y
los criterios pasan; el usuario no ha mirado nada. Lo que falta, y que SDD-77 §7 dejó para aquí:

| Lo que se quiere | Herramienta |
|---|---|
| Ver una pieza ya, sin arrancar nada: qué se lee y cómo queda | `fudic_render` |
| Saber qué responde una función con unos argumentos | `fudic_call` |
| Abrir la app entera y tocarla, desde el móvil o el portátil, con el chat en Claude Web | `fudic_preview` |
| Que el usuario apruebe **cómo se ve** un componente, y que un cambio posterior se note | `fudic_look` y `fudic_record { event: "look" }` |

Casi todo existe ya: `visit` y `mount` de `@fudic/testing` pintan una ruta o un componente;
`outline` (SDD-64) da el árbol de roles; el banco pinta en un navegador y hace capturas;
`renderRouteHtml` y el plugin de `@fudic/vite` sirven la app; el historial (SDD-65) ya conoce la
línea `look`. Esta spec los pone detrás del MCP, y añade **la vista previa dentro del chat** con
*MCP Apps*.

**El objetivo sigue siendo el de SDD-77** (vender fudic desde un chat): Pedro, en Claude Web, sobre
un proyecto creado a mano, ve el componente en la conversación, abre la app por la URL del túnel y
aprueba el aspecto, sin un solo fichero escrito a mano.

**Lo que no es:** el fake del `.fudapi`, el contrato del backend real y la plataforma (git por
ramas, previews por rama, builder). Ver §7.

## 2. Dependencias

| SDD | Qué aporta |
|---|---|
| 77 | `@fudic/mcp`: las dos entradas (stdio y HTTP con secreto y túnel), la forma común de las respuestas (§3.4 de SDD-77), `fudic_status` con sus fases y su regla de `next`, `fudic_record`, `runTests` y `runSpecs` del proyecto, y la regla de cargar el fudic **del proyecto** (SDD-77 §8.2.7, §8.2.24, §8.2.37). En un workspace, el MCP comprueba, ejecuta y lee las fases proyecto a proyecto, y lo del `.fudapi` pide arrancarlo en la carpeta de la app (SDD-77 §8.2.50); `fudic_status` responde `summary` y `expired` (§8.2.51). |
| 57 | `mount(component, { props })`, `visit(url)`, `renderToHtml`: el render del servidor más la hidratación sobre happy-dom, dentro del vitest del proyecto (`@fudic/testing/run`). |
| 64 | `outline(root)` en el formato de ARIA snapshot de Playwright, en happy-dom y en el navegador (`outlineOf`); el motor del banco (`startProject`, `runCriterion`) y sus capturas. |
| 65 | La línea `look` (`by <quién> hash <hash>`), `UnitState.look` (`none` / `valid` / `expired`) y `HistoryIo.lookHash(unit)`; `InputGraph.filesOf(unit)`. |
| 66 | Los casos de las fixtures leídos prop a prop (`caseShape`), la página del escaparate. |
| 69 | La sesión por cookie: una función tras un middleware de sesión responde su `Problem` sin ella. |

Dependencia externa nueva, en versión exacta y solo en `@fudic/mcp`:
`@modelcontextprotocol/ext-apps` `1.7.5`, la última que va con `@modelcontextprotocol/sdk` 1.x
(§8.1.2). Sus `react` y `react-dom` son opcionales y no se instalan.

## 3. Interfaz pública

### 3.1. Las herramientas nuevas

| Grupo | Herramienta | Entradas | Qué hace |
|---|---|---|---|
| Ver | `fudic_render` | `route` \| `component`, `fixture?`, `props?`, `as = "outline"`, `select?`, `engine = "happy-dom"` | Pinta una pieza y devuelve su árbol de roles o su HTML; en el chat, además, la vista previa (§4.1) |
| | `fudic_call` | `fn`, `args?`, `params?` | La respuesta de una función del `.fudapi`, o su `Problem` (§4.2) |
| | `fudic_preview` | `route?` | La app corriendo, con su URL local y, por el túnel, la pública (§4.3) |
| | `fudic_look` | `piece`, `cases?` | Las capturas de cada caso de la fixture, comparadas con las del último `look` aprobado (§4.4) |

`fudic_record` gana el evento `look` (§4.5). Las cuatro se registran **en las dos entradas**: con
stdio, `fudic-mcp` lista 18 herramientas; con `--http`, 21.

Las cuatro aceptan los nombres de SDD-77 §4.7: una ruta como URL concreta (`/productos/42`), un
componente por su tag (`acme-button`), una función por `<id>.<nombre>` (`routes/products.save`),
una pieza como en `fudic_record` (el `.fud`, relativo al proyecto).

### 3.2. La vista previa en el chat (MCP Apps)

El servidor declara **un recurso**, `ui://fudic/view.html` (tipo `text/html;profile=mcp-app`), y
`fudic_render` y `fudic_look` lo nombran en su `_meta.ui.resourceUri`. Un cliente que entiende MCP
Apps (Claude Web) pinta ese recurso en un iframe y le pasa el resultado de la herramienta; el
resto lee el JSON de siempre.

- **El recurso es un solo HTML**, construido con el paquete: el `App` de
  `@modelcontextprotocol/ext-apps/app-with-deps` y una vista mínima, sin dependencias en tiempo de
  ejecución ni peticiones de red.
- Para `render`, pinta el `preview` de la respuesta (§4.1) en un `<iframe srcdoc>` aislado: el DSD
  se ve, la interacción no (es estático; para tocar, `fudic_preview`).
- Para `look`, pone cada caso con su antes y su después lado a lado, con su veredicto (§4.4).
- Se registra con `registerAppTool` y `registerAppResource` de
  `@modelcontextprotocol/ext-apps/server`; nada del recurso depende del proyecto.

### 3.3. Las instrucciones del servidor

La línea de las aprobaciones de SDD-77 §3.3 pasa a nombrar las dos:

```
Never approve on the user's behalf: fudic_record "approved" or "look" only after the user said so
in this conversation.
```

Y se añade una:

```
When the user wants to see something, use fudic_render for one piece and fudic_preview for the
whole app. Seeing is not approving.
```

Como en SDD-77 §8.2.1, cada línea sale solo si sus herramientas están registradas.

### 3.4. La fase `look`

Las fases de un **componente** (SDD-77 §4.4) ganan una octava, después de `showcase`:

| # | `phase` | Hecha cuando |
|---|---|---|
| 8 | `look` | La última línea `look` desde el último `reopened` es `valid`: su hash es el de ahora (§4.5) |

**Una ruta no tiene fase `look`** (§8.1.6). `fudic_record { event: "done" }` exige la fase 8 como
las demás (`FUD1407` la nombra).

**El hash del aspecto** (`lookHash`) es el de los ficheros que pueden cambiar cómo se ve el
componente, **no el de los píxeles** (§8.1.4): `InputGraph.filesOf(unit)` sin el `.test.ts` ni la
`.fudspec`, más las hojas globales (`globalStyles` de `fudic.json`) del proyecto y de cada librería
que adopta, en ese orden. El MCP lo da a `@fudic/history` con `HistoryIo.lookHash`.

### 3.5. Los códigos

| Código | Título (`.md`) | Cuándo |
|---|---|---|
| `FUD1420` | The piece threw while rendering | `fudic_render` o `fudic_look`: el SSR, el `load` o la hidratación lanzan; con la posición en el fuente si la hay |
| `FUD1421` | No such fixture case | `fixture` o `cases` con un caso que la fixture no tiene; el arreglo lista los que hay |
| `FUD1422` | A route needs concrete values | `route` con un patrón (`/productos/:id`) o una URL que no casa con ninguna ruta; el arreglo da las de `paths()` si las hay |
| `FUD1423` | The function has no handler | `fudic_call` de una función `missing`; el arreglo manda a `fudic_contract` |
| `FUD1424` | The preview did not start | El dev server no arranca (puerto, configuración de Vite); con su mensaje |
| `FUD1425` | The server failed while previewing | Una excepción en el SSR o en un handler mientras la preview corre; con la posición en el fuente |
| `FUD1426` | Nothing to look at | `fudic_look` de una pieza sin fixture o sin casos, o de una ruta |
| `FUD1427` | The look was not shown | `fudic_record { event: "look" }` sin un `fudic_look` sobre los ficheros de ahora (§4.5) |
| `FUD1428` | Props that cannot be rendered | `props` o un caso con un valor que no es JSON (una función) en `engine: "browser"` o en la vista previa |

Lo que impide abrir un navegador (`engine: "browser"`, `fudic_look`) sale con los códigos de SDD-64,
como en `fudic_spec_run`. Lo que falta instalar en el proyecto, con `FUD1207` (SDD-77 §8.2.37).

## 4. Comportamiento

### 4.1. `fudic_render`

Pinta **una pieza** y devuelve lo que sale, al instante y sin servidor arrancado.

- **`{ route }`**: una URL concreta. Es el `visit(url)` de `@fudic/testing`: el SSR de la ruta con
  su layout y su `load`, como lo pinta `vite dev`.
- **`{ component, fixture? , props? }`**: el `mount` de `@fudic/testing`, en su página anfitriona.
  `fixture` es el nombre de un caso de la fixture de la pieza; `props` se mezcla encima. Pintar con
  un caso es pintar un estado que alguien aprobó: la descripción de la herramienta lo pide antes
  que `props`.
- **`engine`**: `happy-dom` (por defecto) corre dentro del vitest del proyecto, con su
  `vitest.config`, igual que `fudic_test`: es el mismo render que ven los tests. `browser` lo pinta
  en el navegador del banco y saca el árbol con `outlineOf`: exacto, en segundos, para cuando hay
  dudas (CSS que oculta, layout).
- **`as`**: `outline` (por defecto) es el árbol de roles, nombres y estados de SDD-64, el vocabulario
  con el que la `.fudspec` busca; `html` es el markup serializado con su DSD, sin los mapas de
  hidratación ni los scripts. `select` (un selector CSS que atraviesa shadow roots como en
  `@fudic/testing`) recorta los dos a un trozo.

```json
{
  "fudicVersion": "0.0.1", "commit": "b59fa7d",
  "component": "acme-button", "fixture": "disabled", "engine": "happy-dom",
  "as": "outline",
  "outline": "- button \"Save\" [disabled]",
  "calls": [],
  "diagnostics": [],
  "next": null
}
```

- **`calls`**: las funciones del `.fudapi` que la pieza llamó al pintarse (`load`, lo que llama un
  `effect`; una `task` no llama al crearse, SDD-68 §4.1 — ver §8.2.4), con `fn` y `status`. Una función sin handler da su `404` y, además, `FUD1423` en `diagnostics`.
- **La vista previa** va en `_meta` de la respuesta (no en `structuredContent`: el LLM no la
  necesita y son miles de tokens): el HTML con su DSD y **las hojas globales del proyecto en
  línea**, sin scripts. Lo pinta el recurso de §3.2.
- Un `load` o un SSR que lanza: `FUD1420` y `isError`. Un patrón en vez de una URL: `FUD1422`.
- Determinista como todo (SDD-77 §3.4) salvo lo que traiga un handler que llama a un servicio real.

### 4.2. `fudic_call`

**Lo que respondería la función a esa llamada**, por el mismo camino que el navegador: la misma
petición a `/_fudic/fn/<id>/<nombre>…` que haría `$fn`, atendida por el dev server de §4.3 (lo
arranca si no lo está, sin abrir nada). Pasa por la cadena de middlewares, la validación del form
y los `fails`/`catches` (SDD-74) como en producción.

- `args`: los argumentos como JSON, con la forma de la firma del `.d.ts` (la que da
  `fudic_contract`). `params`: los valores de los parámetros de ruta cuando el `<id>` los tiene
  (`routes/products/[id]`).
- Respuesta: `status`, y `value` (el cuerpo decodificado) o `problem` (el `Problem` tal cual). Un
  `Problem` es **una respuesta**, no un error de la herramienta: va sin `isError`.
- `FUD1405` si la función no existe (con la más parecida, como `fudic_describe`); `FUD1423` si
  existe y no tiene handler, sin llamar.
- **Sin sesión**: la llamada va sin cookie. Una función tras un middleware de sesión responde su
  `Problem` (`401`), que es lo que hay que ver (§8.1.7).
- `next`: con un `problem` que la función no declara en `fails`, «Fix the handler of … in
  src/server/<id>.ts»; si no, `null`.

### 4.3. `fudic_preview`

**La app entera, corriendo, en una URL que una persona abre.** El MCP arranca el dev server la
primera vez (el `createServer` de Vite con el `vite.config` del proyecto y su plugin `fudic()`, en
proceso, nunca el binario) y lo reutiliza; vive lo que vive el MCP. Con HMR, lo que el chat escribe
se ve sin volver a llamar.

**Por stdio** escucha en `127.0.0.1:4318` (o el siguiente libre) y devuelve esa URL.

**Por HTTP**, la preview **va por el mismo puerto y el mismo túnel que el MCP** (§8.1.5): Vite en
modo middleware dentro del servidor de `fudic-mcp`, y una puerta delante.

- `/mcp/<secret>` sigue siendo el MCP. **Todo lo demás es la app**, pero solo con la cookie de la
  preview; sin ella, `404` sin cuerpo, como hoy.
- La cookie se obtiene abriendo **`/_fudic/preview/<secret>`**: pone `fudic-preview` (`HttpOnly`,
  `SameSite=Lax`, `Secure` si la petición llegó por https, sin caducidad) con un valor derivado del
  secreto, y redirige a `to` (por defecto `/`). Es la URL que devuelve la herramienta y la que se
  abre en el móvil.
- El websocket del HMR pasa por la misma puerta.
- `--new-secret` invalida a la vez la URL del MCP y las cookies de la preview.

```json
{
  "fudicVersion": "0.0.1", "commit": "9d8c7b6",
  "state": "ready",
  "local": "http://127.0.0.1:4317/_fudic/preview/7f3c…e91a?to=/productos",
  "public": "https://brave-otter-12.trycloudflare.com/_fudic/preview/7f3c…e91a?to=/productos",
  "routes": ["/", "/productos", "/productos/1", "/productos/2"],
  "diagnostics": [],
  "next": "Give the user the public URL. Opening it is how they see the app; it does not approve anything."
}
```

- **`state`**: `starting` (la primera llamada espera a que esté listo, hasta 30 s), `ready` o
  `failed` (`FUD1424` con el mensaje de Vite).
- **`routes`**: las URL concretas que se pueden abrir: las rutas sin parámetros y, de las que los
  tienen, las de su `paths()`. Una ruta con parámetros y sin `paths()` no sale; el `next` lo dice.
- **`route`** elige el `to` de la URL; una que no casa con ninguna ruta, `FUD1422`.
- **Los errores del servidor** mientras corre (una excepción en un handler o en el SSR) se guardan
  y la siguiente llamada a `fudic_preview` los devuelve una vez como `FUD1425`, con su posición en
  el fuente. Lo que pasa en el navegador de quien mira no llega al MCP: para eso está
  `fudic_spec_run`.
- **`public`** solo con `--tunnel` y el túnel arriba; si no, no está.
- **Sin `vite.config` ni `@fudic/vite`** en el proyecto: `FUD1207` diciendo qué instalar.

### 4.4. `fudic_look`

**Lo que el usuario aprueba cuando aprueba el aspecto.** Para un componente, pinta **cada caso de
su fixture** en el navegador del banco (el mismo montaje que los criterios), hace una captura del
host y la compara con las del último `look` aprobado.

- Las capturas se guardan en `.fudic/looks/<tag>/<lookHash>/<caso>.png` (ignorado por git, como
  `.fudic/runs`). Las de un `lookHash` que ya no es el de ninguna línea `look` ni el de ahora se
  borran al escribir otras.
- **Cada caso** sale con un veredicto: `new` (no había `look` o el caso no existía), `same` (los
  píxeles son iguales a los del último `look`), `changed`, o `gone` (estaba y ya no). Las capturas
  del último `look` se leen de su carpeta; si no están en el disco (otra máquina, `.fudic` borrado),
  todo sale `new` y el `next` lo dice.
- **El LLM las ve**: la respuesta lleva, además del JSON, bloques `image` (`after` de cada caso
  `new` o `changed`, y su `before`), como mucho 8; el resto se nombra con su ruta. En el chat, el
  recurso de §3.2 las pone lado a lado.
- `cases` limita la comparación a esos casos; el hash y la carpeta son siempre los de todos.

```json
{
  "fudicVersion": "0.0.1", "commit": "4d5e6f7",
  "piece": "libs/ui/src/components/acme-button/acme-button.fud",
  "look": "expired", "hash": "91c2…",
  "cases": [
    { "case": "primary", "verdict": "changed",
      "before": ".fudic/looks/acme-button/2b8f…/primary.png",
      "after": ".fudic/looks/acme-button/91c2…/primary.png" },
    { "case": "disabled", "verdict": "same" }
  ],
  "diagnostics": [],
  "next": "Show the user the before and after of acme-button and ask whether they approve its look. Only if they do, call fudic_record { event: \"look\" }."
}
```

- Una ruta, una pieza sin fixture o sin casos: `FUD1426`. Un caso que lanza al pintarse: `FUD1420`
  en ese caso, y los demás siguen. `cases` con uno que no existe: `FUD1421`.
- **Una ejecución a la vez** con `fudic_test` y `fudic_spec_run` (la cola de SDD-77 §4.8).

### 4.5. `fudic_record { event: "look" }` y `fudic_status`

- **`look`** escribe `look by <usuario> hash <lookHash>`, con el usuario del sistema como
  `approved`. Solo si en `.fudic/looks/<tag>/<lookHash de ahora>/` hay capturas, es decir, si
  `fudic_look` corrió sobre los ficheros de ahora; si no, `FUD1427` y nada escrito: no se aprueba
  lo que nadie ha visto.
- **`status`** calcula la fase 8 con `UnitState.look`, dándole a `@fudic/history` el `lookHash` de
  §3.4. Sin navegador: el hash sale de los ficheros.
- **La regla de `next`** de SDD-77 §4.4 no cambia de orden; la fase 8 es una más del paso 4:
  - `look: "none"`: «Run fudic_look { piece: "…" } and show the user how acme-button looks in each
    case. fudic_record look only after they approve it.»
  - `look: "expired"`: lo mismo, empezando por «The look of acme-button changed since it was
    approved.»
- **Un cambio de implementación** en una pieza `done` (otro radio, otra estructura) cambia el
  `lookHash`: la pieza deja de estar completa, `status` manda volver a pasar tests y criterios (sus
  ejecuciones ya no valen) y después a `fudic_look`. Al aprobarlo, la pieza vuelve a estar
  completa; la línea `done` de antes sigue valiendo (`done` mira todo el historial, SDD-65) y no se
  escribe otra.
- **Un cambio de contrato** sigue siendo `reopened` (SDD-77 §4.6): el `look` anterior deja de
  contar, como la aprobación.

## 5. Invariantes

- **Mirar no es aprobar.** `render` y `preview` no escriben en el historial. Solo `fudic_record`
  escribe, y `look` solo tras un `fudic_look` sobre los ficheros de ahora.
- **Un solo origen.** `render` con `happy-dom` es el render de los tests; con `browser`, el del
  banco; `preview` y `call` son el dev server del proyecto con su plugin. Nada se pinta de otra
  forma que no use ya el framework.
- **La preview no abre más que el MCP**: mismo puerto, mismo túnel, mismo secreto. Sin la cookie,
  nada responde salvo `404`.
- **Nada lanza fuera de una herramienta**; lo que falla es un diagnóstico (SDD-77 §5).
- **Respuestas cortas**: el HTML de la vista previa va en `_meta`, no al LLM; `html` solo si se pide.
- **Determinista** salvo lo que dependa de un servicio externo que llame un handler, y las imágenes
  de `look`, que dependen del navegador de la máquina (por eso el hash es de ficheros).
- **Cobertura:** `@fudic/mcp` sigue al 100 % en las cuatro métricas, el recurso de §3.2 incluido;
  lo nuevo de los demás paquetes también.

## 6. Criterios de aceptación

Como en SDD-77: cliente del SDK sobre transporte en memoria y un proyecto temporal creado con
`planNew`; la prueba de Pedro (§6.1) es aparte.

**El servidor**

1. Por stdio se listan 18 herramientas; con `--http`, 21. Las instrucciones tienen las líneas de
   §3.3. `fudic_render` y `fudic_look` declaran `_meta.ui.resourceUri` = `ui://fudic/view.html`, y
   el recurso se lee con el tipo `text/html;profile=mcp-app` y no hace peticiones de red.

**Render**

2. `render { component, fixture }` da el `outline` del caso; con `props` encima, cambia lo que
   cambian; `as: "html"` da el markup con su `<template shadowrootmode>`; `select` lo recorta.
3. `render { route: "/productos/1" }` pinta la ruta con su `load`; `calls` nombra la función; una
   función sin handler da su `404` y `FUD1423`.
4. `engine: "browser"` da el mismo `outline` que `happy-dom` para un componente sin CSS que oculte,
   y uno distinto para uno con `display: none` en un caso.
5. `render { route: "/productos/:id" }` da `FUD1422` con las URL de `paths()`; un `load` que lanza,
   `FUD1420` con su posición; un caso que no existe, `FUD1421` con los que hay; una prop función
   con `engine: "browser"`, `FUD1428`.
6. La vista previa de `_meta` lleva el DSD y las hojas globales en línea y ningún `<script>`.

**Call**

7. `call` de una función con handler da su `value`; con argumentos que la regla del form rechaza,
   su `problem` sin `isError`; de una `missing`, `FUD1423` sin llamar; de una que no existe,
   `FUD1405` con la más parecida; de una tras un middleware de sesión, su `401`.

**Preview**

8. Por stdio, `preview` arranca el dev server una vez y una segunda llamada lo reutiliza; `routes`
   lista las estáticas y las de `paths()`.
9. Por HTTP, la app responde solo con la cookie: `/productos` sin ella da `404`;
   `/_fudic/preview/<secret>?to=/productos` pone la cookie y redirige; con ella, `/productos` da la
   página y el HMR conecta. Con otro secreto, `404`. `/mcp/<secret>` sigue funcionando a la vez.
10. Un handler que lanza mientras la preview corre sale una vez, en la siguiente llamada, como
    `FUD1425` con su posición. Un `vite.config` roto da `state: "failed"` y `FUD1424`.

**Look**

11. `look` de un componente sin `look` previo: cada caso `new`, capturas en su carpeta, bloques
    `image` en la respuesta (como mucho 8). Tras `record look`, `status` da la fase 8 hecha.
12. Cambiar el CSS del componente: `status` da `look: "expired"` sin abrir un navegador; `look` da
    `changed` en los casos afectados y `same` en el resto, con `before` y `after`.
13. `record look` sin un `fudic_look` sobre los ficheros de ahora da `FUD1427` y no escribe; `done`
    sobre una pieza sin `look` válido da `FUD1407` nombrando `look`; `look` de una ruta, `FUD1426`.
14. Cambiar el `.test.ts` o la `.fudspec` no cambia el `lookHash`; cambiar una hoja global, sí.

**Entrega**

15. Los códigos de §3.5 con `.ts`, `.md` y línea en `index.ts`. La guía `workflow` cuenta la fase
    `look`, y sus ejemplos siguen compilando (criterio 8 de SDD-77). `pnpm typecheck`, `pnpm test`
    y `pnpm build` en verde; `@fudic/mcp` al 100 %.

### 6.1. La prueba de Pedro en Claude Web

Como en SDD-77 §6.1: proyecto creado a mano fuera del repo, MCP con `--http --tunnel`, una
conversación nueva por prueba.

| Fase | Lo que Pedro escribe | Lo que tiene que pasar |
|---|---|---|
| Render | «Enséñame cómo queda el botón deshabilitado» | `fudic_render` con `fixture`; el botón se ve **dentro del chat** y el chat describe lo que se lee |
| Call | «¿Qué devuelve la búsqueda de productos con "mesa"?» | `fudic_call`; el chat enseña la respuesta, o el `Problem` y por qué |
| Preview | «Quiero verlo en el móvil» | `fudic_preview`; Pedro abre la URL pública en el móvil, navega, y un cambio que pide al chat se ve sin recargar |
| Look | «Cambia el radio del botón a algo más redondo» | El chat cambia el estilo, pasa tests y criterios, y `status` lo lleva a `fudic_look`; el antes y el después se ven en el chat; el chat **pregunta** y solo escribe `look` cuando Pedro dice que sí |
| De punta a punta | El guion de SDD-77 §6.1, entero | Cada componente acaba con su `look` aprobado, y la última respuesta del chat incluye la URL de la preview del escaparate |

## 7. Fuera de alcance

- **El fake del `.fudapi`** (IDEA-07 §3 camino 2, §10.6, §10.7): su propia SDD. Aquí una función es
  `connected` o `missing`, y no hay parámetro `backend` en `render`, `call` ni `preview`: entra con
  el fake.
- **El contrato del backend real** (`backend_import`, `backend_describe`) y la interfaz en otros
  lenguajes.
- **La plataforma** (IDEA-07 §11.4): previews por rama, builder, `fudic_commit`, `fudic_propose`,
  `fudic_preview { at: "accepted" }` sobre una etiqueta, capturas adjuntas a un PR.
- **El aspecto de una ruta** (`look` de páginas): necesita decidir qué URL y qué datos son «el
  caso» de una ruta; va con el fake, que es quien da datos fijos.
- **Llamar con sesión** (`fudic_call` con una cookie o un usuario): con la sesión de SDD-69 y el
  fake.
- **Accesibilidad auditada, baseline y «solo tokens»** (IDEA-07 §11.3).

## 8. Decisiones

### 8.1. Tomadas al redactar

1. **`look` entra aquí** (Pedro, 2026-11-04). Sin él, un cambio de implementación en una pieza
   `done` no lo ve nadie: los criterios no miran cómo se ve (IDEA-07 §10.5).
2. **MCP Apps con `@modelcontextprotocol/ext-apps` `1.7.5`** (Pedro, 2026-11-04). La serie 2.x
   exige el SDK 2 (`@modelcontextprotocol/server`…), y el MCP está en `@modelcontextprotocol/sdk`
   `1.32.2`; la 1.7.5 pide `^1.29.0`. Pasar al SDK 2 es su propio cambio. React no se instala: es
   opcional y solo lo usa la entrada `./react`.
3. **El render de `happy-dom` corre en el vitest del proyecto**, como `fudic_test`: `@fudic/testing`
   solo funciona dentro de vitest (`inject`), y así lo que ve el chat es lo que ven los tests.
4. **El hash del aspecto es de ficheros, no de píxeles.** Una captura cambia con el navegador, las
   fuentes y la escala de cada máquina: un hash de píxeles en git caducaría en cuanto otra persona
   lo mirase, y `status` tendría que abrir un navegador. Las capturas son la evidencia que ve el
   usuario; el hash, lo que caduca. SDD-65 lo permite (`HistoryIo.lookHash` lo da quien escribe la
   línea, su decisión 11).
5. **La preview va por el puerto del MCP**, con Vite en modo middleware y una puerta por cookie,
   no por un segundo túnel. Un túnel rápido es una URL más, que cambia en cada arranque y que nada
   protege; así hay una sola URL pública, un solo secreto y la app sigue en `/` (sus enlaces
   absolutos funcionan, cosa que un prefijo `/preview/<secret>/` rompería).
6. **Sin `look` en las rutas**: una ruta no tiene fixture de casos como un componente, y sus datos
   salen de su `load`. Va con el fake (§7).
7. **`fudic_call` sin sesión**: el `401` de un middleware es justo lo que el chat tiene que ver para
   explicarlo; llamar «como alguien» necesita decidir quién, y eso es del fake.
8. **`fudic_call` por HTTP contra el dev server, no importando el handler**: así pasa por la cadena
   de middlewares, la validación del form y `fails`/`catches`, y responde lo que respondería en
   producción.
9. **La vista previa va en `_meta`, no en `structuredContent`**: son miles de tokens que el LLM no
   necesita (tiene el `outline`), y el recurso de MCP Apps la lee de ahí.

### 8.2. Tomadas al implementar

1. **`fudic_call` la hace la propia llamada de la página.** La petición de `$fn` depende del
   codec del `.fudapi`, de su cabecera de firma y de las reglas del navegador; reconstruirla en el
   MCP sería un segundo cliente. `callJob` (`@fudic/testing`) llama a la función desde el vitest del
   proyecto y reenvía por HTTP al dev server la petición que hace el stub. Sigue siendo §8.1.8: la
   atiende el dev server, con su cadena de middlewares, las reglas del form y `fails`/`catches`.
2. **El `next` de un `Problem` solo para un 5xx.** §4.2 pedía «Fix the handler» con un `Problem`
   que la función no declara en `fails`, pero un `401` de un middleware de sesión o un `422` de la
   validación tampoco están en `fails` y son respuestas legítimas. El `next` sale solo cuando la
   respuesta es un 5xx: lo que el handler lanzó sin querer.
3. **El render en happy-dom es un fichero de test generado.** `renderPiece` escribe
   `.fudic/render/<uuid>.test.ts`, lo corre solo con el `vitest.config` del proyecto (con `include`
   apuntando a él) y lee lo que escribe en un `.json`. La pieza y su fixture se importan **relativas**
   a ese fichero, como lo haría un test: importado por ruta absoluta, un `.fud` que enlaza su
   `.fudapi` se compilaba sin encontrarlo (`FUD1111`). Las URL concretas de `fudic_preview` y de
   `FUD1422` (rutas sin parámetros y las de `paths()`) salen igual, con `listRoutes`.
4. **El `load` de una ruta es una de sus `calls`.** Corre en el SSR, no por `fetch`: se nombra con
   el status de la página, y con `FUD1423` si no tiene handler. Las llamadas del cliente se recogen
   del `fetch` del arnés después de un `settled()` más: las de un `effect` salen; una `task` no,
   porque no llama al crearse (SDD-68 §4.1), solo cuando cambia su fuente o se le hace `run()`, y
   pintar una pieza no cambia nada. §4.1 nombraba «una `task`»: queda matizado ahí.
5. **El CSS del componente, entero.** happy-dom devuelve vacía una regla anidada al releer una hoja
   adoptada; el texto de cada hoja se guarda al crearla (`sourceOf`) y es el que va en el HTML.
6. **`engine: "browser"` es de componentes.** Una ruta en el navegador ya es `fudic_preview`;
   pedirla da `FUD1207` diciéndolo.
7. **`FUD1425` solo para lo que se lanzó.** El overlay de Vite recibe también el chequeo de tipos
   en vivo; se guardan solo los errores con traza, y los diagnósticos siguen siendo de
   `fudic_check`.
8. **La puerta deja pasar al propio MCP.** Por HTTP, `fudic_call` entra por el mismo puerto con la
   cookie de la preview; la puerta la quita de la petición antes de dársela a Vite, así que la app
   nunca la ve y la llamada sigue yendo «sin sesión».
9. **Un caso de `look` que falla no tiene veredicto.** Su `FUD1420` (o `FUD1428` si sus valores no
   son JSON) va en `diagnostics` y el caso no sale en `cases`; los demás siguen. `same` y `changed`
   se deciden por igualdad de bytes del PNG, que es lo que da un mismo navegador.
10. **Una pieza `done` que cambia vuelve a su fase.** La fase es la primera sin hacer aunque el
    historial diga `done` (§4.5); antes `done` la tapaba. Cuando nada queda abierto, el `done` de
    antes vuelve a valer.
11. **Fronteras.** `@fudic/http/contract` exporta también `contractIds` (para nombrar una llamada
    por su URL) y `@fudic/history` exporta `InputGraph` y `hashFiles` (para el `lookHash`). Las
    herramientas nuevas viven en `src/` como las de SDD-77, no en `src/tools/`.
