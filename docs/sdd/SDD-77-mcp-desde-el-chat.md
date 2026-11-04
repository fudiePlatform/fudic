# SDD-77 — El MCP de fudic: crear con fudic desde un chat

> **Estado:** `Listo` — [tareas](./SDD-77-Task.md).
> **Paquetes:** `@fudic/mcp` (nuevo) · `@fudic/typecheck` · `@fudic/spec` · `@fudic/vite` ·
> `@fudic/language-server` · `@fudic/cli` · `@fudic/workbench` · `@fudic/diagnostics`
> **Depende de:** 22 y 44 (la CLI y sus planes), 35 (el pase tipado del proyecto), 52 y 53
> (`.fudspec`), 57 (`@fudic/testing`), 60 (`.fudapi`), 62 (el catálogo como datos y las
> reparaciones sin editor), 63 (el contrato y los tokens), 64 (informes legibles), 65 (el
> historial), 66 (`g api`, `g showcase`), 75 (quién implementa cada función)
> **Rango de diagnósticos:** `FUD1400`–`FUD1419` (nuevo).
> **Decisiones de gramática:** ninguna.
> **Origen:** [IDEA-07](./ideas/IDEA-07-mcp-de-fudic.md), sobre todo §4, §5, §6, §10 y §11.4 bis.
> **Rama sugerida:** `sdd-77-mcp-desde-el-chat`
>
> **Qué añade en una frase.** Un servidor MCP que se arranca dentro de cualquier proyecto fudic y
> deja a un chat sin ningún contexto (Claude Web) o a un agente (Claude Code) enterarse de qué es
> fudic y crear con él: aprender la gramática, crear piezas con los planes de la CLI, leer y
> escribir ficheros, comprobar, arreglar, describir lo que existe, ejecutar tests y criterios, y
> saber en cada momento cuál es el siguiente paso.

---

## 1. Contexto y objetivo

**El objetivo es vender fudic (gratuito) desde un chat.** La prueba de que funciona es esta:
Pedro crea un proyecto a mano con `fudic new` en una carpeta cualquiera de su máquina, sin nada de
este repo; arranca el MCP; abre Claude Web y pide algo («quiero una librería de componentes: Button,
Card, Input»). El chat **no sabe nada de fudic**. Tiene que enterarse por el propio MCP y crear la
librería sin escribir React disfrazado.

Hoy no hay ningún MCP. Lo que el chat necesita ya existe repartido en paquetes que solo usan el
editor, el build y la CLI:

| Lo que el chat necesita | Dónde está hoy |
|---|---|
| Qué dice cada código, con su arreglo | `explain()` de `@fudic/diagnostics` (SDD-62) |
| Los errores del proyecto entero | `createProjectChecker().check()` de `@fudic/typecheck` (SDD-35) |
| Las bombillas sin editor | `repairsFor` del language server (SDD-62), sin exportar |
| El contrato de un componente y los tokens | `typedContract`, `projectTokens` de `@fudic/typecheck` (SDD-63) |
| Qué función tiene handler | `implementationsOf` de `@fudic/typecheck` (SDD-75) |
| Crear piezas | Los `plan*` y `apply` de `@fudic/cli` |
| Ejecutar tests y criterios con un resultado legible | `runTests` de `@fudic/testing` y `runSpecs` de `@fudic/workbench` (SDD-64) |
| En qué fase está cada pieza | `unitState` y `record` de `@fudic/history` (SDD-65) |

Esta spec los junta detrás de un servidor MCP, con **dos entradas**:

- **stdio**, para Claude Code: el agente ya tiene `Read`, `Edit` y git.
- **HTTP** (el transporte *Streamable HTTP* de MCP), para un chat. Claude Web se conecta desde los
  servidores de Anthropic, no desde el navegador de Pedro, así que necesita una URL pública: un
  túnel a la máquina. El chat no tiene ficheros, y por eso en esta entrada se encienden tres
  herramientas más: listar, leer y escribir.

**Destapa un hueco del framework, que se cierra aquí:** el editor marca una `.fudspec` rota, pero ni
`pnpm build` ni `vite dev` la comprueban. Con «o compilo o no compilo» y un solo origen para el
editor, el build y el MCP (IDEA-07 §5.5), una `.fudspec` rota tiene que romper el build. La
validación pasa al pase del proyecto, y de ahí la leen los tres.

**Lo que no es:** la plataforma de IDEA-07 §11.4 (copias de trabajo en un servidor, git por ramas,
builder, imágenes Docker, OAuth de varias cuentas). Aquí el workspace es una carpeta del disco de
quien arranca el MCP.

**Cada herramienta se prueba desde Claude Web** al cerrar su fase (§6.1), como lo haría un
usuario, sobre un proyecto creado a mano.

## 2. Dependencias

| SDD | Qué aporta |
|---|---|
| 22, 44, 66 | `Plan`, `FileChange`, `PlanCommand`, `apply`; `planNew`, `planWorkspace`, `planApp`, `planLib`, `planComponent`, `planPage`, `planLayout`, `planSnippet`, `planSpec`, `planTerm`, `planApi`, `planShowcase`, `planService`, `planForm`, `planPipe`, `planStyle`, `planAdd`, `planFmt`, `planApprove`, `planAccept`. |
| 35 | `createProjectChecker({ root })` con `check()` → `CheckReport` (`problems` ordenados, `project`), `invalidate(path)`. |
| 52, 53 | `parseSpec`, `validateSpec(file, ctx)`, `SpecContext`; el catálogo de términos (`createTermCatalog`). |
| 57, 64 | `runTests(options)` → `TestReport` (`fail` frente a `broken`, `expected`/`got`, posición); `runSpecs(paths, options)` → informe por criterio con el paso en rojo, `source` en el `.fud` y las capturas. |
| 60, 75 | El `.fudapi`, su `<id>`, el `.d.ts` en `.fudic/api`; `implementationsOf(ts, root)`: qué declaración tiene handler. |
| 62 | `explain(code)` → `{ title, severity, why, fix }`; `repairsFor(input, diagnostic)` → `Repair[]` (título en inglés, ediciones por fichero). |
| 63 | `typedContract`: props con tipo, defecto y JSDoc, slots, eventos con `detail`, CSS parts, tokens que lee, `usedIn`; `projectTokens(root)`. |
| 65 | `unitState(unit)` → `UnitState`; `record`, `snapshot`, `recordSpecRun`, `recordTestRun`; `NO_COMMIT`. |

Dependencias externas nuevas, en versión exacta y solo en `@fudic/mcp`:
`@modelcontextprotocol/sdk` `1.32.2` y su par `zod` `4.6.7`.

## 3. Interfaz pública

### 3.1. Arrancar el MCP

`@fudic/mcp` publica un binario, `fudic-mcp`, como `fudic-workbench`. Se arranca **dentro del
proyecto**: esa carpeta es lo único que el MCP lee y escribe.

```
pnpm exec fudic-mcp                      # stdio, for Claude Code (.mcp.json launches it)
pnpm exec fudic-mcp --http               # HTTP on 127.0.0.1:4317
pnpm exec fudic-mcp --http --tunnel      # and a public URL through cloudflared
pnpm exec fudic-mcp --http --port 5000
```

Con `--http` escribe en la terminal una sola cosa útil, la URL que hay que pegar en el chat:

```
fudic MCP · project acme · http
  local   http://127.0.0.1:4317/mcp/7f3c…e91a
  public  https://brave-otter-12.trycloudflare.com/mcp/7f3c…e91a
Add the public URL in Claude: Settings → Connectors → Add custom connector.
Anyone with this URL can read and write this project. Stop with Ctrl+C.
```

- **El secreto** es el último tramo de la ruta: 32 bytes aleatorios en hexadecimal, guardados en
  `.fudic/mcp/secret` (ya ignorado por git) y reutilizados entre arranques. Una petición a otra ruta
  responde `404` sin cuerpo. `--new-secret` lo cambia.
- **`--tunnel`** lanza `cloudflared tunnel --url http://127.0.0.1:<port>` (el túnel rápido, sin
  cuenta) y lee de su salida la URL pública. Sin `cloudflared` en el `PATH`, `FUD1406` con cómo
  instalarlo, y el servidor sigue en local. La URL del túnel rápido cambia en cada arranque: para
  una fija, el usuario monta su propio túnel hacia el puerto local.
- **Escucha solo en `127.0.0.1`**: lo único que llega de fuera es lo que trae el túnel.
- `fudic-mcp` fuera de un proyecto (sin `fudic.json` hacia arriba) arranca igual: `fudic_status`
  responde `phase: "none"` y `fudic_new` crea el proyecto en esa carpeta.

### 3.2. Las herramientas

| Grupo | Herramienta | Entradas | Qué hace |
|---|---|---|---|
| Lenguaje | `fudic_guide` | `topic` | Un tema de la gramática o un código (`FUD0540`) explicado (§4.3) |
| Proyecto | `fudic_status` | — | Dónde estamos y el siguiente paso, uno solo (§4.4) |
| | `fudic_new` | `name`, `workspace?`, `app?`, `lib?`, `locale?`, `dryRun?` | El plan de `fudic new` / `fudic workspace` en la carpeta del MCP |
| | `fudic_generate` | `kind`, `name`, `purpose?`, opciones del tipo, `dryRun?` | El plan de `fudic g <kind>`: `component`, `page`, `layout`, `snippet`, `app`, `lib`, `spec`, `term`, `api`, `showcase`, `service`, `form`, `pipe`, `style` |
| | `fudic_add` | `module`, `project?`, `dryRun?` | El plan de `fudic add` |
| | `fudic_record` | `piece`, `event`, `text?` | Escribe en el historial lo que decide una persona o cierra una pieza (§4.6) |
| Ficheros (solo HTTP) | `fudic_files` | `under?` | Los ficheros del proyecto, sin `node_modules`, `dist`, `.git` ni lo que ignora git |
| | `fudic_read` | `path`, `offset?`, `limit?` | El contenido con números de línea |
| | `fudic_write` | `path`, `content` \| `edits[]` | Escribe y **devuelve ya los diagnósticos** de lo tocado (§4.2) |
| Comprobar | `fudic_check` | `paths?`, `limit = 20` | Lo que diría el build, sin construir (§4.1) |
| | `fudic_fix` | `paths?`, `codes?`, `dryRun?` | Aplica las reparaciones de una sola opción y repite (§4.5) |
| | `fudic_format` | `paths?`, `dryRun?` | El plan de `fudic fmt`: el diff |
| Lo que existe | `fudic_symbols` | `kind?` | Rutas, componentes, tipos, funciones (con `connected` / `missing`), middlewares, pipes y tokens (§4.7) |
| | `fudic_describe` | `name` | El contrato de un componente, ruta, tipo, función o token, con un ejemplo de uso (§4.7) |
| | `fudic_contract` | `id` | Lo que hay que implementar para un `.fudapi`: sus handlers en TypeScript y dónde van (§4.7) |
| Ejecutar | `fudic_test` | `paths?`, `names?`, `failing?` | Los tests unitarios, en proceso (§4.8) |
| | `fudic_spec_run` | `spec?`, `criteria?`, `failing?` | Los criterios de la `.fudspec` en el navegador (§4.8) |

Con stdio no se registran `fudic_files`, `fudic_read` ni `fudic_write`: el agente ya los tiene, y
los clientes empeoran con herramientas de sobra.

**Un *prompt* MCP, `new-app`**, que el chat enseña como comando: «Create a fudic app or library
from this conversation», con el texto que manda llamar a `fudic_status` y preguntar.

### 3.3. Las instrucciones del servidor

El campo `instructions` de MCP, que el cliente mete en su prompt de sistema:

```
fudic is a UI framework you have no prior knowledge of. Never write fudic code from memory
or by analogy with React, Vue or any other framework.
For any fudic task, the first call is fudic_status. Do what its "next" says, one step at a time.
Before writing a kind of file for the first time, call fudic_guide for its topic.
Create files with fudic_generate, never from scratch. After every write, fix every diagnostic
before moving on. Never approve on the user's behalf: fudic_record "approved" only after the
user said so in this conversation.
```

Cada herramienta lleva una descripción cuya primera frase dice «fudic»: con muchas herramientas, el
cliente ve los nombres y carga las descripciones bajo demanda.

### 3.4. La forma común de las respuestas

Cada herramienta devuelve un objeto JSON, como `structuredContent` y, el mismo texto, como bloque
`text` para los clientes que no leen lo estructurado:

```json
{
  "fudicVersion": "0.0.1",
  "commit": "b59fa7d",
  "...": "lo de cada herramienta",
  "diagnostics": [],
  "next": "Una sola frase, o null"
}
```

- **`commit`**: el `HEAD` corto del repo del proyecto; sin git, `"none"` (`NO_COMMIT`).
- **Sin marcas de tiempo y en orden fijo**: dos llamadas sobre los mismos ficheros devuelven lo
  mismo byte a byte.
- **Nunca un error suelto.** Lo que la herramienta no pudo hacer es un diagnóstico con código, y la
  respuesta lleva `isError: true`. Una entrada que no cumple el esquema la rechaza el SDK antes de
  llegar a la herramienta.
- **Un diagnóstico** siempre tiene esta forma:

  ```json
  { "code": "FUD0540", "severity": "error", "message": "a loop must declare 'key (…)'",
    "at": "src/components/acme-card/acme-card.fud:15:3",
    "quote": "@foreach (const item of items) {", "fixable": true }
  ```

  `at` es `fichero:línea:columna`, relativo al proyecto y con base 1; `quote` es la línea entera
  donde empieza, sin el sangrado. Nunca se exponen offsets. Un diagnóstico de proyecto (sin
  fichero) no lleva `at` ni `quote`.
- **`codes`**: cuando la respuesta trae diagnósticos FUD, el porqué y el arreglo van una vez por
  código: `"codes": { "FUD0540": { "title": "…", "why": "…", "fix": "…" } }`. Un `TS2322` va en
  la lista sin entrada en `codes`.

### 3.5. El servicio de proyecto del language server

El MCP no hace de proxy del protocolo LSP, que está hecho para un cursor: llama a los mismos
servicios en proceso. Para eso el language server exporta una entrada sin editor:

```ts
// @fudic/language-server/project
export interface ProjectService {
  /** The repairs of one diagnostic, as the editor's light bulb offers them. */
  repairs(file: string, diagnostic: SourceDiagnostic): readonly Repair[];
  /** Every symbol of the project and its libraries, in a stable order. */
  symbols(kind?: SymbolKind): readonly ProjectSymbol[];
  /** What the hover, the definition and the references say about one name. */
  describe(name: string): Description | undefined;
  /** A file changed on disk: the next call re-reads it. */
  invalidate(path: string): void;
}
export function openProject(root: string): ProjectService;
```

Usa el mismo `WorkspaceIndex` y los mismos `repairsFor` y contrato que el servidor del editor: lo
que ve el chat es lo que ve quien abre el fichero en VS Code. La forma exacta de `ProjectSymbol` y
`Description` es la de las respuestas de §4.7.

### 3.6. `.fudspec` en el pase del proyecto

- **`@fudic/spec` gana `specContextOf(root, specPath, io)`**: lo que hoy construyen por su cuenta el
  language server (`fudspec/host.ts`) y el banco (`session.ts`). Los dos pasan a usarla.
- **`createProjectChecker().check()` incluye los problemas de cada `.fudspec` del proyecto**
  (parse y `validateSpec`) en el mismo `CheckReport` y en el mismo orden (§4.6 de SDD-35).
- **`@fudic/vite`** ya falla el build y saca el overlay con el `CheckReport`: una `.fudspec` rota
  rompe `pnpm build` y para `vite dev` igual que un `.fud` roto.
- Un problema aparece **una vez**: si `.fudapi` y `.fudspec` ya los informa otro camino del plugin,
  el informe final no los repite.

### 3.7. Lo que deja `fudic new`

`fudic new` (y `fudic workspace`) añade:

- `@fudic/mcp` a las `devDependencies`, con la misma versión que el resto de `@fudic/*`;
- `.mcp.json` para Claude Code:

  ```json
  { "mcpServers": { "fudic": { "command": "pnpm", "args": ["exec", "fudic-mcp"] } } }
  ```

- `AGENTS.md` y un `CLAUDE.md` que lo importa (`@AGENTS.md`), de tres líneas:

  ```
  This is a fudic project. fudic is a framework you have no prior knowledge of.
  Use the fudic MCP server (it is configured in .mcp.json): call fudic_status first.
  To use it from a chat, run `pnpm exec fudic-mcp --http --tunnel` and add the URL as a connector.
  ```

Lo generado pasa en verde sin tocarlo, como todo `new` (BUG-50): `verify:generated` arranca el MCP
recién instalado y llama a `fudic_status`.

### 3.8. Los códigos

| Código | Título (`.md`) | Cuándo |
|---|---|---|
| `FUD1400` | Outside the project | Una ruta de `read`, `write`, `files` o `paths` sale de la carpeta del MCP (`..`, absoluta, un enlace simbólico que sale) o entra en `.git` o `node_modules` |
| `FUD1401` | File not found | `fudic_read` de un fichero que no existe |
| `FUD1402` | Edit does not match | Una edición de `fudic_write` cuyo `old` no aparece, o aparece más de una vez |
| `FUD1403` | Unknown guide topic | `fudic_guide` con un tema que no existe, o con un `FUDnnnn` que no está en el catálogo |
| `FUD1404` | Not a fudic project | Una herramienta que necesita proyecto, sin `fudic.json` |
| `FUD1405` | Nothing by that name | `fudic_describe` o `fudic_contract` con un nombre que no existe; el arreglo sugiere el más parecido |
| `FUD1406` | cloudflared is not installed | `--tunnel` sin `cloudflared` en el `PATH` |
| `FUD1407` | Not done yet | `fudic_record { event: "done" }` sobre una pieza a la que le falta una fase: dice cuál |

## 4. Comportamiento

### 4.1. `fudic_check`

**Lo que diría el build, sin construir.** Es el `CheckReport` de `createProjectChecker` sobre la
raíz: `.fud`, TypeScript, `.fudapi` y `.fudspec`. El checker vive lo que vive el MCP y se invalida
por fichero en cada `fudic_write`, `fudic_fix`, `fudic_format` o plan aplicado; en stdio, donde
escribe el agente, `check` relee los ficheros cuya fecha cambió.

```json
{
  "fudicVersion": "0.0.1", "commit": "…",
  "summary": { "errors": 3, "warnings": 0, "fixable": 2, "files": 1 },
  "diagnostics": [ { "code": "FUD0540", "...": "…" } ],
  "codes": { "FUD0540": { "title": "Loop without `key (…)`", "why": "…", "fix": "…" } },
  "next": "Run fudic_fix for the 2 fixable diagnostics, then fix FUD1140 by hand."
}
```

- `paths` limita la lista, no el pase: el pase es siempre el proyecto entero, porque un cambio en un
  componente rompe a quien lo usa. `summary` cuenta todo; `limit` corta la lista.
- `fixable` es que `repairs` da **exactamente una** reparación.
- `next`: sin errores, `null`; con `fixable`, `fudic_fix`; si no, el primer diagnóstico, por su
  posición.

### 4.2. `fudic_files`, `fudic_read`, `fudic_write`

- **`fudic_read`** devuelve las líneas con su número (`  12→<button …>`), desde `offset` (base 1) y
  hasta `limit` (por defecto 400). Un binario no se lee: `FUD1401` con «not a text file».
- **`fudic_write`** con `content` crea o reescribe el fichero entero; con `edits: [{ old, new }]`
  reemplaza cada `old`, que tiene que aparecer **una sola vez** (`FUD1402` si no, y no se escribe
  nada: todas o ninguna). Crea las carpetas que falten.
- La respuesta de `write` es la de `fudic_check` con `paths` = lo escrito: el LLM ve en la misma
  vuelta si lo que escribió compila.
- **Lo que no se escribe**: fuera de la carpeta, en `.git`, en `node_modules` ni lo generado por
  fudic (`.fudic/`), siempre con `FUD1400`.
- **Ningún comando**: `write` no ejecuta nada. Lo único que se ejecuta en la máquina son los
  `PlanCommand` de un plan de la CLI (`pnpm install`), y nunca uno que traiga el chat.

### 4.3. `fudic_guide`

Envoltura: `{ fudicVersion, topic, related, body }`, con `body` en markdown, en inglés.

**Los temas**, por lo que el LLM va a escribir:

| Tema | Qué cuenta |
|---|---|
| `overview` | Qué es fudic (DSD, BFF, sin JS por defecto), los tipos de fichero, la estructura de carpetas de una app, una librería y un workspace |
| `workflow` | Las fases de cada pieza (§4.4), quién aprueba qué, el bucle escribir → comprobar → arreglar, «create with fudic_generate», «never open a component's file: fudic_describe» |
| `components` | La forma del fichero en orden, un ejemplo canónico entero, props con JSDoc, usar otro componente (`.prop`, atributo, `class:`, `@evento`, slots, spread), `emit`, estilos con `:host` y `::slotted()`, controles de form, y la tabla «Instead of…» con los reflejos de React |
| `pages` | Rutas, params, layouts, `load` (y `later` con `@await`), `paths()`, páginas de error, `task` para llamar al servidor, la sesión por cookie |
| `view` | La vista portable: valores, operadores, control, `@empty`, tipos portables, las cinco operaciones de colección con su recetario, pipes, y la tabla «Instead of… write…» con los reflejos de JS |
| `fudapi` | Funciones, `load`, tipos, enums, forms y reglas, `fails` y `catches`, middlewares, pipes propios; dónde va el handler |
| `fudspec` | Criterios, casos y fixtures, términos de serie |
| `testing` | `mount`, `visit`, consultas, gestos, `shadowOf`; la frontera con la `.fudspec` (IDEA-07 §5.10) y «lo que ya es un criterio no se repite como test»; el rojo bueno (`fail`) frente a `broken`; «en la fase de la vista no se tocan los tests» |
| `html-css` | El HTML y el CSS que fudic acepta, los tokens como custom properties documentadas con `/** … */`, «before writing styles, call fudic_symbols { kind: "tokens" }» |

**Un código como tema** (`FUD0540`): el `explain()` del catálogo, partido en `title`, `severity`,
`why` y `fix`, más `related` con el tema donde se explica la construcción. Un `TS2322` responde que
es de TypeScript y no tiene explicación propia, sin inventar nada. Un `FUDnnnn` que no existe,
`FUD1403`.

**Para que la guía no mienta:**

- Viven en `packages/mcp/guide/<topic>.md` y se publican con el paquete.
- **Cada bloque ` ```fud ` es un ejemplo que compila**: un test los extrae todos y los pasa por el
  checker en un proyecto temporal, con cero diagnósticos. Un bloque ` ```fud broken FUD1140 ` es un
  ejemplo de lo que no se escribe, y el test comprueba que da exactamente ese código.
- **Cada fila «Instead of…» cita el código** que el compilador da a lo prohibido. El LLM ve el mismo
  `FUD1140` en la guía y en `fudic_check`.
- **Cubre lo que vino después de IDEA-07**: `task` (SDD-68), la sesión por cookie (69), `@await`
  (70), pipes propios (71), handlers que reciben el `detail` y `delegate:` (72), `catches` y
  `message()` (74), `effect(fn, deps)` (76).

### 4.4. `fudic_status`

La brújula del LLM: dónde estamos y **el siguiente paso, uno solo**. No guarda estado: sale de los
ficheros, del historial y del pase del proyecto.

```json
{
  "fudicVersion": "0.0.1", "commit": "b59fa7d",
  "phase": "view",
  "project": { "name": "acme", "kind": "workspace", "prefix": "acme" },
  "diagnostics": { "errors": 0, "warnings": 0 },
  "units": [
    { "piece": "libs/ui/src/components/acme-button/acme-button.fud", "kind": "component",
      "phase": "view", "approval": "valid", "server": false,
      "tests": "red 0/6", "spec": "red 0/4", "documented": "0/3",
      "functions": { "connected": 0, "missing": 0 } }
  ],
  "next": "Write the view of libs/ui/src/components/acme-button/acme-button.fud until fudic_test and fudic_spec_run pass. Do not change the tests. Call fudic_guide { topic: \"components\" } first."
}
```

**Las fases de cada pieza** (componente o ruta), en orden:

| # | `phase` | Hecha cuando |
|---|---|---|
| 1 | `criteria` | Hay `.fudspec` con fixture y una línea `approved` válida (props y criterios se aprueban juntos) |
| 2 | `api` | Solo con servidor: el `.fudapi` existe y está enlazado (`<link rel="server">`) |
| 3 | `red` | Hay tests unitarios, y la última ejecución de tests y de criterios está en rojo **por la razón buena** (`fail`/`red`, no `broken`) y vale (su hash es el de ahora) |
| 4 | `view` | Tests y criterios en `pass`, y vigentes |
| 5 | `connect` | Solo con servidor: cada función del `.fudapi` tiene handler (`connected`) |
| 6 | `document` | JSDoc en el componente y en cada prop |
| 7 | `showcase` | Solo en una librería con escaparate: su página está al día (`g showcase` no cambiaría nada) |
| — | `done` | La línea `done` del historial |

**La regla de `next`**, en este orden:

1. Sin proyecto: preguntar al usuario **solo lo que falta** para `fudic_new` (para qué es, sus
   páginas o componentes, el nombre y el prefijo) y llamar a `fudic_new`.
2. Hay errores: arreglarlos (`fudic_fix` si hay `fixable`, si no el primero). Nunca se avanza con
   errores.
3. Una aprobación `expired`: enseñarle al usuario el diff de la `.fudspec` desde el commit de su
   `approved` y pedirle que la apruebe.
4. La primera pieza incompleta, en el orden de `units` (el de los ficheros), con su fase. En la 1,
   **preguntar, no construir**: «Ask the user for the props and the behaviour of acme-button.
   Propose them, wait for their approval, then write the .fudspec and its fixture». En la 4, «Do
   not change the tests».
5. Una pieza completa sin `done`: `fudic_record { event: "done" }`.
6. Todo hecho: `null`.

**«La primera vez»**: el servidor recuerda, por sesión MCP, qué temas de la guía ha servido. Si la
fase manda escribir un tipo de fichero cuyo tema no se ha leído en esta sesión, `next` añade
«Call fudic_guide { topic: "…" } first». Es el único estado del servidor y muere con la sesión.

**Una librería** no tiene fases `api` ni `connect`. **Una pieza `stale`** (lo ejecutado ya no es lo
de ahora) cuenta como no ejecutada. **`status` no ejecuta tests ni criterios**: lee la última
ejecución del historial.

### 4.5. `fudic_fix` y `fudic_format`

- **`fix`**: toma los diagnósticos con una sola reparación; aplica las que no se solapan, vuelve a
  comprobar y repite, como mucho 5 vueltas, hasta que no queda nada con una sola reparación. Lo que
  tiene varias va a `remaining` con sus `options` (los títulos), y decide el LLM.
- La respuesta: `applied` (código, `at`, título), `diff` (unificado, por fichero) y `remaining` con
  la forma de `fudic_check`.
- **`format`**: el plan de `fudic fmt` sobre `paths` (sin ellos, el proyecto); devuelve el diff y lo
  aplica salvo `dryRun`.
- Una reparación es un `FileChange`: se aplica con el `apply` de la CLI. Sin mecanismo nuevo.

### 4.6. Los planes de la CLI y el historial

- **`new`, `generate` y `add` llaman a las mismas funciones `plan*` que la CLI**, nunca al binario.
  Lo que crea el agente es byte a byte lo que crea un desarrollador. Devuelven el plan (ficheros
  creados y modificados, comandos ejecutados y su resultado) y los diagnósticos del plan; `dryRun`
  lo devuelve sin aplicar.
- **Las opciones de cada `kind` son su esquema JSON**: las mismas que acepta `fudic g <kind>`, con
  sus nombres en camelCase (`--uses` → `uses`). La ayuda de texto no se expone.
- **`started`**: `generate` de un `component` o una `page` escribe en el historial de la pieza nueva
  `started by agent "<purpose>"`. `purpose` es obligatorio en esos dos tipos: es lo que pidió el
  usuario, en una frase.
- **`fudic_record`** escribe lo que decide una persona o cierra una pieza:

  | `event` | Qué escribe | Cuándo lo llama el LLM |
  |---|---|---|
  | `approved` | El plan de `fudic approve` (con el hash de la `.fudspec` y su fixture) | Cuando el usuario aprobó props y criterios **en la conversación** |
  | `accepted` | El plan de `fudic accept` con `text` | Cuando el usuario dice que el cliente lo aceptó |
  | `reopened` | `reopened by agent "<text>"` | Cuando el usuario pide un cambio de contrato en una pieza `done` (IDEA-07 §10.5) |
  | `done` | `documented <n>/<m>`, `connected <funciones>` (las que tienen handler y no estaban en un `connected` anterior) y `done` | Cuando `status` lo dice; `FUD1407` si le falta una fase |

  `by` es el usuario del sistema, como en la CLI. La regla de las instrucciones («never approve on
  the user's behalf») es la única barrera contra un LLM que se aprueba solo; el hash hace que
  cualquier cambio posterior se vea.

### 4.7. `fudic_symbols`, `fudic_describe`, `fudic_contract`

- **`symbols { kind? }`**, `kind` ∈ `routes`, `components`, `types`, `functions`, `middlewares`,
  `pipes`, `tokens`. Cada entrada con su nombre, de dónde viene (el proyecto o la librería), su
  fichero con `at` y la primera línea de su doc. Las funciones llevan `connected` o `missing`
  (el mismo cálculo que el CodeLens del `.fudapi`). Los tokens, en el orden en que se adoptan, con
  `value`, `group` (del nombre, `--<prefijo>-<grupo>-…`) y `doc`.
- **`describe { name }`**: un tag, una ruta (`/productos/:id`), un tipo, una función
  (`productos.save`) o un token (`--acme-color-primary`). Para un componente, el contrato de
  SDD-63 entero (`link`, `doc`, `props` con tipo, defecto y doc, `slots` con el sin nombre,
  `events` con su `detail`, `parts`, `tokens` que lee, `usedIn`) y un `example` **generado desde
  el contrato**, que no se queda atrás. Un nombre que no existe, `FUD1405` con el más parecido.
- **`contract { id }`**: para el `.fudapi` de `<id>`, cada declaración que necesita handler, con su
  firma en TypeScript (la del `.d.ts` de `.fudic/api`), el fichero donde va el handler
  (`src/server/<id>.ts`) y un esqueleto del `.handle(…)` que compila.

### 4.8. `fudic_test` y `fudic_spec_run`

- **`test`** llama a `runTests` en proceso con el `vitest.config` del proyecto. Respuesta:
  `summary` (`pass`, `fail`, `broken`) y solo lo que no pasa, con `file`, `name`, `verdict`, `at`,
  `quote`, `expected`, `got`. Un `broken` lleva sus diagnósticos en la forma de §3.4. `next` en la
  fase `red`: «Every test must fail for the right reason: …»; en la `view`: «Make the view pass these
  tests. Do not change the tests.»
- **`spec_run`** llama a `runSpecs` en proceso. `spec` es un tag o una ruta; sin él, todas las
  piezas. Solo se detalla lo que no pasa: el criterio, su `at` en la `.fudspec`, el paso en rojo con
  `expected` y `got`, el `source` y la `quote` del elemento en el `.fud`, la captura (`shot`, ruta
  en `.fudic/runs`) y los errores de la página.
- **`failing: true`** repite solo lo que estaba en rojo en la última ejecución.
- **Los dos graban en el historial** (`snapshot` antes, `recordTestRun` / `recordSpecRun` después):
  es lo que `status` lee para las fases 3 y 4.
- Lo que impide ejecutar (no hay navegador, la página no carga) sale con los códigos de SDD-64.
- **Una sola ejecución a la vez** por MCP: una segunda llamada espera a la primera.

## 5. Invariantes

- **Un solo origen.** `fudic_check` es el `CheckReport` que usa el build; `fixable` es la bombilla
  del editor; `describe` es el hover. Si el editor, el build y el MCP dicen cosas distintas, es bug.
- **El MCP no escribe fuera de su carpeta ni ejecuta lo que no sale de un plan de la CLI.**
- **Lo que crea el MCP es lo que crea la CLI**, byte a byte.
- **Determinista**: mismas entradas y mismos ficheros, misma respuesta. Ni fechas ni rutas
  absolutas en las respuestas (salvo `shot`, que es relativa al proyecto).
- **Nada lanza fuera de una herramienta**: lo que falla es un diagnóstico.
- **Las respuestas son cortas**: lo que pasa se cuenta, lo que falla se detalla. Un proyecto con 200
  diagnósticos no devuelve 200 por defecto.
- **Cobertura:** `@fudic/mcp` al 100 % en las cuatro métricas desde su primer commit, con `guide/`
  incluida (cada `.md` lo prueba su test); lo nuevo de los demás paquetes también.

## 6. Criterios de aceptación

Los tests de cada herramienta usan el cliente del SDK sobre un transporte en memoria y un proyecto
temporal creado con `planNew`. La prueba de Pedro (§6.1) es aparte y no se sustituye por los tests.

**El servidor**

1. `fudic-mcp` en stdio lista las 14 herramientas; con `--http`, las 17. Las dos entradas devuelven
   lo mismo a la misma llamada.
2. `--http` sirve en `127.0.0.1` y solo en `/mcp/<secret>`; otra ruta da `404`. El secreto se
   reutiliza entre arranques y `--new-secret` lo cambia.
3. `--tunnel` sin `cloudflared` da `FUD1406` y el servidor sigue en local; con un `cloudflared`
   falso que imprime una URL, la terminal la enseña.
4. `instructions` es el texto de §3.3; el prompt `new-app` existe; cada descripción empieza
   nombrando fudic.

**`.fudspec` en el build**

5. Una `.fudspec` con un término que no existe: el editor, `check()`, `pnpm build` (sale con error)
   y `vite dev` (overlay) dan el mismo código en la misma posición, una sola vez.
6. El language server y el banco construyen el `SpecContext` con `specContextOf`; sus tests siguen
   en verde sin tocarlos.

**Lenguaje**

7. `fudic_guide` responde cada tema de §4.3; `FUD0540` da su `title`, `why`, `fix` y `related`;
   `TS2322` dice que no tiene explicación; `FUD9999` y `"react"` dan `FUD1403`.
8. Cada bloque ` ```fud ` de la guía compila sin diagnósticos; cada ` ```fud broken FUDnnnn ` da ese
   código; cada fila «Instead of…» cita un código que existe.

**Ficheros**

9. `read` numera las líneas y respeta `offset`/`limit`; `read` de `../x`, de `.git/config` o de un
   enlace que sale del proyecto da `FUD1400`; de un fichero que no existe, `FUD1401`.
10. `write` con dos ediciones, una que no casa: `FUD1402` y el fichero intacto. Una escritura válida
    que rompe un `.fud` devuelve su diagnóstico con `at` y `quote` en la misma respuesta.
11. `files` no lista `node_modules`, `dist`, `.git` ni lo ignorado.

**Comprobar**

12. `check` de un proyecto con un `FUD0540` y un `TS2322` da los dos, ordenados, con `codes` solo
    para el FUD; `limit: 1` corta la lista y no `summary`.
13. `fix` arregla un `FUD0191` y deja un `FUD0540` sobre un objeto sin `id` en `remaining` con sus
    opciones; el diff es el de lo aplicado; `dryRun` no escribe.
14. `format` de un `.fud` mal sangrado devuelve el diff de `fudic fmt` y lo aplica.

**Lo que existe**

15. `symbols { kind: "components" }` en `examples/workspace` lista los de `libs/ui` con su doc;
    `{ kind: "functions" }` marca `missing` una función sin handler y `connected` otra con él;
    `{ kind: "tokens" }` da los tokens de la librería de estilos con `group` y `doc`.
16. `describe { name: "acme-button" }` da el contrato de SDD-63 y un `example` que, pegado en una
    ruta, compila; `describe { name: "acme-buton" }` da `FUD1405` sugiriendo `acme-button`.
17. `contract { id }` da un esqueleto de handler que, escrito en su sitio, deja la función
    `connected` y el proyecto sin diagnósticos.

**Proyecto**

18. `new`, `generate` (cada `kind`) y `add` escriben exactamente lo que escribe la CLI con las
    mismas opciones (se compara con el plan de la CLI); `dryRun` no escribe.
19. `generate { kind: "component", purpose }` escribe `started` en el historial.
20. `record` escribe cada evento de §4.6; `done` sobre una pieza sin tests da `FUD1407` diciendo la
    fase que falta.
21. `status` sin proyecto da `phase: "none"` y manda preguntar; con un error, manda arreglarlo; con
    una aprobación caducada, manda enseñar el diff; recorre las siete fases sobre una pieza que se
    va completando, con un único `next` en cada paso.
22. `status` añade «Call fudic_guide…» solo la primera vez en la sesión.
23. `fudic new` deja `@fudic/mcp`, `.mcp.json`, `AGENTS.md` y `CLAUDE.md`; `verify:generated`
    arranca el MCP del proyecto nuevo y su `fudic_status` responde.

**Ejecutar**

24. `test` en la fase `red` distingue `fail` de `broken`; `spec_run` da el paso en rojo con
    `expected`, `got`, `source` y `quote`; los dos graban su línea y `status` pasa de fase.
25. `failing: true` ejecuta solo lo que estaba en rojo.

**Entrega**

26. Los ocho códigos con `.ts`, `.md` y línea en `index.ts`. `pnpm typecheck`, `pnpm test` y
    `pnpm build` en verde; `@fudic/mcp` al 100 % en las cuatro métricas y lo nuevo de los demás
    paquetes también.

### 6.1. La prueba de Pedro en Claude Web

Cada fase termina con una prueba en Claude Web sobre un proyecto **creado a mano** con `fudic new`
en una carpeta fuera del repo, con el MCP arrancado con `--http --tunnel` y el conector dado de
alta. **Una conversación nueva en cada prueba**, sin nada de este repo. Lo que no salga como dice la
prueba es bug y se arregla en la fase (el guion no se retoca hasta que pase).

| Fase | Lo que Pedro escribe | Lo que tiene que pasar |
|---|---|---|
| Servidor y guía | «¿Qué es fudic y cómo es un componente?» | El chat llama a `fudic_guide` (`overview`, `components`) y lo explica sin inventar ni compararlo con React |
| Comprobar | (Pedro rompe a mano un `.fud`) «¿Mi proyecto tiene errores?» | `fudic_check` da el error con su fichero y línea, y el chat lo explica con el porqué del catálogo |
| Ficheros | «Arréglalo» | `fudic_read`, `fudic_write` y/o `fudic_fix` hasta cero diagnósticos; el fichero queda bien en el disco |
| Lo que existe | «¿Qué componentes tengo y cómo se usa el botón?» | `fudic_symbols` y `fudic_describe`; el ejemplo que da compila |
| Crear | «Crea un componente para mostrar una tarjeta de producto» | `fudic_generate` con `purpose`; el chat **pregunta** props y comportamiento antes de escribir la vista |
| Ejecutar | «¿Pasan los tests y los criterios?» | `fudic_test` y `fudic_spec_run` con lo que falla y dónde |
| De punta a punta | El caso de IDEA-07 §10: «Quiero una librería de componentes: Button, Link Button, Card, Input…» | Guiado por `fudic_status`, el chat pregunta lo que falta, crea el workspace y la librería, y por cada componente hace aprobar props y criterios, deja tests y criterios en rojo, escribe la vista hasta el verde, documenta y cierra con `done`. Sin un solo fichero escrito a mano por Pedro |

La última fila es también el banco de pruebas del MCP: el mismo guion se repite cuando cambie el
framework.

## 7. Fuera de alcance

- **Ver la pieza**: `fudic_render` (con la vista previa en el chat), `fudic_call` y
  `fudic_preview` por el túnel. Es SDD-78, la siguiente; esta deja el proyecto creado y en verde.
- **Las capturas de aspecto** (`look`): van con `render`, en SDD-78.
- **El fake** del `.fudapi` (IDEA-07 §10.7): pendiente de su propia SDD. Aquí una función es
  `connected` o `missing`.
- **La guía de estilos como pieza con aprobación**: el historial (SDD-65) solo conoce rutas y
  componentes. Aquí `html-css` manda enseñar los tokens al usuario antes de ningún componente, sin
  línea `approved`.
- **La plataforma** (IDEA-07 §11.4): git por ramas, `fudic_commit`, `fudic_propose`,
  `fudic_workspace_open`, builder, imágenes, OAuth de varias cuentas.
- **El contrato del backend real** (`backend_import`, `backend_describe`) y la interfaz en otros
  lenguajes: no existe todavía ningún emisor que no sea TypeScript.
- **Accesibilidad auditada, baseline y la regla «solo tokens»** (IDEA-07 §11.3).

## 8. Decisiones

### 8.1. Tomadas al redactar

1. **Un paquete, dos entradas.** stdio y HTTP son el mismo `McpServer`; solo cambia el transporte y
   si se registran las tres herramientas de ficheros. Así lo que Pedro prueba en el chat es lo que
   usa Claude Code.
2. **El binario es `fudic-mcp`, no `fudic mcp`.** `@fudic/mcp` depende de `@fudic/cli` (sus planes);
   un `fudic mcp` haría depender la CLI del MCP, un ciclo.
3. **Un secreto en la URL, no OAuth.** Claude Web admite conectores sin autenticación; el secreto
   en la ruta es lo mínimo para que una URL que acaba en un buscador no abra la máquina. El OAuth de
   cuentas es de la plataforma.
4. **`cloudflared` y su túnel rápido**: sin cuenta, un comando, y la URL sale en su salida. El MCP no
   lo instala ni lo empaqueta; quien quiera otro túnel lo apunta al puerto local.
5. **`fudic_test` y `fudic_spec_run` están aquí** y no en la mitad de «ver y probar», como proponía
   IDEA-07 §11.2: sin ellos `status` mandaría a una herramienta que no existe, y el chat no podría
   terminar una sola pieza. En SDD-78 queda ver: `render`, `call` y `preview`.
6. **`fudic_approve` y `fudic_accept` se juntan en `fudic_record`**, con `reopened` y `done`, que
   SDD-65 dejó para el MCP: una herramienta para todo lo que va al historial por decisión de alguien.
7. **`documented` y `connected` se escriben al cerrar la pieza** (`done`), no en cada `check`: el
   historial no guarda las vueltas del bucle (IDEA-07 §5.8).
8. **`fudic_contract` sin `language`**: hoy solo hay TypeScript. El parámetro entra cuando exista el
   primer emisor de otro lenguaje.
9. **Un tema `pages`**, que IDEA-07 §6 dejaba para después: sin él, el chat puede hacer una librería
   pero no una app.
10. **El pase es siempre el proyecto entero**, aunque se pidan `paths`: un cambio en un componente
    rompe a quien lo usa, y eso también es «lo que diría el build».
11. **La guía son `.md` con ejemplos que se compilan en los tests**, no texto generado: lo que
    importa es que cada ejemplo sea verdad, y eso lo da el test.

### 8.2. Tomadas al implementar

1. **Las instrucciones solo nombran las herramientas que hay.** Cada línea de §3.3 que manda llamar
   a una herramienta sale solo si está registrada: mientras se implementa por fases, una instrucción
   que manda a `fudic_status` antes de que exista manda al chat a buscar lo que no hay. Lo mismo el
   prompt `new-app`.
2. **`FUD1406` es un aviso**, no un error: el servidor sigue en su URL local.
3. **Una app y una librería nuevas declaran `@fudic/dom`.** `emit` vive ahí, la plantilla no lo
   declaraba y `fudic add` no sabe añadirlo: un chat que escribe un evento se quedaba sin salida.
   La app lo pone en `dependencies`; la librería, en `peerDependencies` y `devDependencies`, como
   `examples/workspace/libs/ui`. Cambia la instantánea de `new-compat` de la CLI.
4. **`FUD0057` decía mentira**: mandaba a `&nbsp;`, que el parser rechaza (solo lee las cinco
   referencias de XML y las numéricas). Su `.md` dice ahora lo que el parser hace.
5. **Las reglas de serie (`required`, `max-length`…) son de `@fudic/forms`**: un `.fudapi` sin ese
   paquete en el proyecto da `FUD1080`. La guía `fudapi` lo dice y manda a `fudic_add`.
6. **`related` de un código** son los temas de la guía que lo nombran; el de un tema, los temas que
   nombra entre comillas invertidas.
