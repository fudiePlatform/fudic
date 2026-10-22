# IDEA-07 — El MCP de fudic: crear una app entera desde una conversación

> **Estado:** `Idea` — no es un SDD. Sin interfaz pública cerrada, sin criterios de aceptación,
> sin rango de diagnósticos. Captura la conversación del **2026-10-22** con Pedro. Lo marcado como
> **decidido** (§1) no se reabre; lo demás es propuesta para seguir trabajándola.
> **Punto de partida:** [SDD-60](../SDD-60-fudapi.md) (`.fudapi`), [SDD-61](../SDD-61-vista-portable.md)
> (vista portable), [SDD-52](../SDD-52-fudspec.md) (`.fudspec`), [SDD-50](../SDD-50-diagnosticos.md)
> (diagnósticos que se explican solos), la CLI (`packages/cli`, plan → apply) e
> [IDEA-01](./IDEA-01-banco-de-trabajo-de-componentes.md) §3.2 (el MCP del banco).

---

## 0. La tesis

Un LLM es determinista cuando escribe en un mundo **cerrado** y tiene una comprobación barata que
le dice si lo ha hecho bien. fudic ya tiene las dos cosas: tres DSL cerrados (la vista de SDD-61,
`.fudapi`, `.fudspec`), HTML/CSS acotado por baseline, y diagnósticos con su porqué y su arreglo
(SDD-50). El MCP convierte eso en un bucle: **escribir → comprobar → arreglar hasta cero
diagnósticos**, guiado paso a paso por el propio servidor.

## 1. Lo decidido (Pedro, 2026-10-22)

1. **El MCP expone el compilador y el LSP**, y sirve tanto a agentes (Claude Code y similares)
   como a chats (claude.ai, ChatGPT…).
2. **El usuario objetivo del chat genera una app entera desde la conversación.**
3. **Hosting real:** una imagen Docker por lenguaje de servidor (Node, .NET, JVM, Go, Rust,
   Python) más git.
4. **El desarrollador controla la app** igual que hoy: el mismo flujo vale desde Claude Code.
5. **fudic es un BFF.** Nunca implementa el servidor. Un backend en desarrollo paralelo queda
   fuera. fudic termina en dos caminos: **conectar el BFF al backend** o **falsear el backend**.
6. **La CLI de fudic se expone en el MCP.**

## 2. Arquitectura

### 2.1. Git manda

```
            ┌────────────── git (el repo de la app) ──────────────┐
            │                                                     │
  Chat ──► MCP remoto ──► commit en rama          Claude Code ──► MCP local ──► push
            │                                                     │
            └──────────► builder: fudic build → emit → imagen ◄───┘
                                     │
                         preview por rama · producción por main
```

- El chat y Claude Code son **dos clientes del mismo repo**. El MCP remoto trabaja sobre una copia
  en el servidor y hace commits en una rama; el local trabaja sobre el disco y el desarrollador
  hace push.
- **Las mismas herramientas en los dos sitios**; solo cambia dónde está la copia de trabajo.
- **El agente nunca toca `main`.** Rama propia con preview propia; pasar a producción es un merge
  que hace una persona.
- El proyecto se exporta (o se clona) con la estructura de `fudic new`: no hay nada que convertir
  para seguir en local.

### 2.2. El builder

Por cada push: build → emit al lenguaje del servidor → imagen → despliegue. Un build que falla no
despliega, y su error es **el mismo diagnóstico** que el MCP ya dio al LLM (sin un `fudic check`
aparte, §5.13).

### 2.3. Una imagen por lenguaje

Cada imagen lleva el runtime del lenguaje, el **runtime de fudic de ese lenguaje** (pintar la vista
portable según el anexo de SDD-61, despacho `/_fudic/fn/`, cadena de middlewares, validación de
forms), lo generado desde el `.fudapi` y los handlers.

Hoy solo existe Node. Cada otra imagen sale cuando su runtime pase la **suite de conformidad** de
SDD-61 §4.6: esa suite es la puerta del hosting.

### 2.4. Lo que lo hace plataforma

- Aislamiento de código ajeno (gVisor o Firecracker, no Docker a pelo).
- Secretos por app y por entorno, que el agente usa pero no lee.
- Cuotas y apagado en reposo: las previews por rama se multiplican.
- OAuth del conector del chat, ligado a la cuenta y a sus repos.

## 3. fudic como BFF: conectar o falsear

Un handler **traduce** entre dos contratos: el `.fudapi` (lo que la vista necesita) y la API del
backend (lo que existe). Sin lógica de negocio. La persistencia es del backend, no de fudic.

**Camino 1 — conexión.** Propuesta (sin confirmar): el contrato del backend **entra en el repo**
(OpenAPI, `.proto` o GraphQL) y de él se genera un cliente tipado en el lenguaje del BFF. El
handler queda en un mapeo: llamar, convertir el DTO al tipo del `.fudapi`, traducir errores a
`fails`. El compilador de cada lenguaje comprueba los dos lados. URL y credenciales del backend
son secretos del entorno; un backend privado necesita túnel o red privada.

**Camino 2 — fake.** Sin backend no hay contrato que importar: el fake sale del `.fudapi`. Cada
función responde según su `-> T` y sus `fails` se pueden provocar. Con el fake activado por la
configuración del entorno, una función sin handler responde con datos falsos en lugar del 404 de
SDD-60 (decisión 6). Se mezclan los dos caminos función a función. Datos generados desde los tipos
con semilla fija, o de las fixtures del usuario (`*.fixture.ts`, SDD-53).

El políglota cobra sentido aquí: el BFF se escribe en el lenguaje del equipo porque comparte
clientes y librerías con su backend.

## 4. Cómo se entera un LLM de cómo se crea una app

Sin MCP, un LLM no sabe nada de fudic y escribe React disfrazado. Tres capas:

1. **`instructions` del servidor MCP**, que el cliente mete en el prompt de sistema:

   ```
   fudic is a framework you have no prior knowledge of. Never write fudic code
   from memory or by analogy with other frameworks.
   For any fudic task, the first call is `fudic_status`. Do what it says next.
   Before writing a file type for the first time, call `fudic_guide` for its topic.
   ```

2. **Nombres con prefijo `fudic_`** y descripciones que dicen «fudic» en la primera frase: con
   muchas herramientas, el cliente solo ve nombres y carga bajo demanda.
3. **`fudic_status` sin proyecto** no manda escribir código, manda **preguntar**:

   ```json
   {
     "phase": "none",
     "next": "Ask the user what the app is for (its pages, the data each shows, the actions on it) and for its backend: an OpenAPI/proto/GraphQL contract, or 'none yet' (fake). Then call fudic_new."
   }
   ```

Para cuando el MCP no está conectado: `fudic new` deja un `.mcp.json` y un `CLAUDE.md`/`AGENTS.md`
de tres líneas que remiten al MCP; en chat, un *prompt* MCP `new-app` aparece como comando; y la
web de fudic publica un `llms.txt` que dice «conecta el MCP».

### 4.1. Las fases que guía `fudic_status`

Por unidad (ruta o componente), no por app (§5.4). Cada una necesita la aprobación del usuario o
estar en verde antes de la siguiente (§10.2):

1. Props y criterios en la `.fudspec`, aprobados en el historial de la pieza (§5.8).
2. `.fudapi`: el contrato (solo rutas y componentes con servidor).
3. Tests unitarios escritos; tests y criterios en rojo (§5.10).
4. `.fud`: la vista, hasta tests y criterios en verde.
5. Conectar o falsear cada función (solo con servidor).
6. JSDoc del componente y de cada prop.
7. Su página en el escaparate (librerías, §10.1).

En cada paso, `next` dice una sola cosa.

## 5. Las herramientas

### 5.1. Reglas comunes

- `workspace` en cada llamada: en local, la raíz (implícita); en remoto, un id de copia de trabajo
  en una rama.
- Toda respuesta lleva `fudicVersion` y `commit`, ordenada y sin marcas de tiempo.
- Nunca un error suelto: lo que falla es un diagnóstico con código.
- Posiciones como `fichero:línea:columna` y el texto citado, nunca offsets.
- **No se expone el LSP tal cual:** está hecho para un cursor. El MCP llama a los mismos servicios
  en proceso, no hace de proxy del protocolo.

### 5.2. La lista

| Grupo | Tool | Qué hace |
|---|---|---|
| Lenguaje | `fudic_guide { topic }` | Gramática de `overview`, `components`, `view`, `fudapi`, `fudspec`, `testing`, `html-css`, `workflow` (§6); con un código (`FUD0540`) como tema, su explicación (§5.11) |
| Proyecto | `fudic_status` | Fase, lo pendiente, recuento de diagnósticos. Guía al LLM (§5.4) |
| | `fudic_new` | Crea la app (plan `new` de la CLI) |
| | `fudic_generate { kind }` | `component`, `page`, `layout`, `app`, `lib`, y los que la CLI ya tiene y faltaban aquí: `style`, `spec`, el control de form (planes de la CLI) |
| | `fudic_add { module }` | `di`, `forms`, `http`, `i18n`, o una librería del workspace por su nombre (plan `add`, que ya existe) |
| | `fudic_read { paths }` | Contenido con números de línea (solo remoto) |
| | `fudic_write { edits[] }` | Aplica y **devuelve ya los diagnósticos** de lo tocado (solo remoto) |
| Comprobar | `fudic_check` | Parser, validador y pase tipado; cada diagnóstico con su arreglo y `fixable` |
| | `fudic_fix` | Aplica los arreglos automáticos (los code actions): diff y lo que queda |
| | `fudic_format` | Diff |
| Lo que existe | `fudic_symbols { kind? }` | Rutas, componentes y props, tipos, forms, reglas, middlewares, funciones con estado `connected`/`fake`/`missing` |
| | `fudic_describe { name }` | Declaración, documentación, origen y usos (hover + definición + referencias) |
| BFF | `fudic_contract { id, language }` | La interfaz a implementar en ese lenguaje |
| | `fudic_backend_import { name, kind, source }` | Guarda el contrato del backend y genera su cliente (si se confirma §3) |
| | `fudic_backend_describe { name, operation? }` | Operaciones del backend con tipos y errores |
| Ver y probar | `fudic_render { route\|component, props, backend }` | HTML del SSR; en chat, vista previa (MCP Apps) |
| | `fudic_call { fn, args, backend }` | Respuesta o `Problem` de una función |
| | `fudic_spec_run { spec?, criteria? }` | Criterios de la `.fudspec` con evidencia y span del `.fud` |
| | `fudic_test` | Tests unitarios (SDD-57) |
| Git | `fudic_commit { message }` | Commit en la rama (solo remoto) |
| | `fudic_preview` | Estado del build, URL de la preview, diagnósticos si falla |
| | `fudic_propose { title, body }` | Abre el PR. Nunca hace merge |
| | `fudic_workspace_open { repo, branch? }` | Id del workspace (solo remoto) |

En local se quitan las que el agente ya tiene (`read`, `write`, `commit`, `workspace_open`): los
clientes empeoran con muchas herramientas.

**Descartadas:** completado por posición (es para un cursor; `guide` cubre «qué vale aquí»), hover
y definición por separado (van en `describe`), `merge` y deploy a producción (los decide una
persona).

### 5.3. La CLI dentro del MCP

La CLI ya es **plan → apply** (`packages/cli/src/types.ts`, `apply.ts`): un plan es datos
(ficheros, comandos) y `apply` el único que escribe. El MCP llama a las mismas funciones `plan*`,
**nunca al binario** (su salida es texto para personas):

- en local aplica con el `apply` de siempre; en remoto, sobre la copia de trabajo y con los
  comandos dentro del contenedor;
- devuelve siempre el plan ejecutado; `dryRun: true` lo devuelve sin aplicar;
- las opciones de cada comando son el esquema JSON de la herramienta; la ayuda de texto sobra;
- `dev` no se expone (no termina): lo cubren `fudic_preview` y `fudic_render`.

Consecuencias: lo que crea el agente es byte a byte lo que crea un desarrollador. La regla de
BUG-50 («lo recién generado pasa en verde sin tocar nada») se vuelve crítica: un agente entra en
bucle arreglando lo que no es suyo. **Hueco:** el `.fudapi` y el contrato del backend no tienen
generador en la CLI (`g api`, `add backend`).

### 5.4. `fudic_status` (propuesta, 2026-10-22)

La brújula del LLM: **dónde estamos** y **el siguiente paso, uno solo**. Sin estado propio: todo
sale de los ficheros, así que da lo mismo en local y en remoto, y dos llamadas sobre el mismo
commit devuelven lo mismo.

| Señal | De dónde sale |
|---|---|
| ¿Hay proyecto? ¿App o librería? | `fudic.json` |
| Diagnósticos | El pase de `fudic_check`, solo el recuento |
| Por unidad (ruta o componente): `.fudspec`, `.fudapi`, `<link rel="server">` | Los ficheros hermanos |
| Cada función: `connected` / `fake` / `missing` | El `.fudapi`, los `.handle` de `src/server` y `src/browser`, la configuración del fake del entorno |

```json
{
  "fudicVersion": "0.0.1",
  "commit": "b59fa7d",
  "phase": "view",
  "app": { "name": "tienda", "server": "node", "prefix": "app" },
  "diagnostics": { "errors": 0, "warnings": 0 },
  "units": [
    { "path": "src/routes/productos", "spec": "not run", "api": true, "view": true,
      "functions": { "connected": 0, "fake": 0, "missing": 2 } },
    { "path": "src/components/app-product-card", "spec": "not run", "api": false, "view": false }
  ],
  "next": "Write the view of src/components/app-product-card/app-product-card.fud. Call fudic_guide { topic: \"components\" } first."
}
```

Regla de `next`, en este orden:

1. Sin proyecto: preguntar al usuario solo lo que falta (§4, punto 3).
2. Hay errores: `fudic_check` y arreglarlos. Nunca se avanza con errores.
3. La primera unidad incompleta, en el orden de §4.1.
4. Todo completo: `fudic_propose`.

La primera vez que el LLM va a escribir un tipo de fichero, `next` le añade la guía que debe leer.

- **Las fases son por unidad, no por app.** Una página puede tener su vista y el carrito ni su
  `.fudspec`. `phase` es la de la unidad que marca `next`.
- **`status` no ejecuta criterios** (abre un navegador, segundos por llamada): dice `"not run"` y
  `next` manda a `fudic_spec_run`.
- **Una librería se salta las fases** `.fudapi` y «conectar o falsear»: no tiene servidor.

### 5.5. `fudic_check` (propuesta, 2026-10-22)

**Lo que diría el build, sin construir**: parser, validador, pase tipado y contratos de
componente. Un solo origen para el editor, el build y el MCP, así que no hay un `fudic check`
aparte que pueda decir otra cosa. Entrada: `{ paths?, limit = 20 }`; sin `paths`, el proyecto.

```json
{
  "fudicVersion": "0.0.1",
  "commit": "…",
  "summary": { "errors": 3, "warnings": 0, "fixable": 2, "files": 1 },
  "diagnostics": [
    {
      "code": "FUD0540", "severity": "error",
      "message": "a loop must declare 'key (…)'",
      "at": "libs/ui/src/components/acme-card/acme-card.fud:15:3",
      "quote": "@foreach (const item of items) {",
      "fixable": true
    }
  ],
  "codes": {
    "FUD0540": { "title": "Loop without `key (…)`", "why": "…", "fix": "add a key after the header: …" }
  },
  "next": "Run fudic_fix for the 2 fixable diagnostics, then fix FUD1145 by hand."
}
```

- **Porqué y arreglo, una vez por código** en `codes`, del mismo `.md` que da `fudic_guide { topic: "FUDnnnn" }`: 30
  errores del mismo código no repiten el texto 30 veces.
- **Posición y texto citado** (`quote`): el LLM edita con su propio `Edit` sin releer el fichero.
- **Orden fijo** (fichero, línea, columna). `summary` cuenta todo; `limit` corta la lista.
- **Los errores de TypeScript** del pase tipado salen con su código (`TS2322`) y la posición
  devuelta al `.fud`, sin entrada en `codes`: no hay `.md` propio.
- `fixable` es que hay bombilla (code action) **y es correcta** (§5.6). Hoy la tabla
  (`language-server/src/services/actions.ts`) tiene 5: `FUD0056`, `FUD0191`, `FUD0540`, `FUD0890`,
  `FUD0894`; aparte, crear el fichero de un `href` que no existe. Cada arreglo mecánico que falta
  es una vuelta más del bucle. Un arreglo que cambia la estructura (`FUD1145` → `@empty`) no debe
  ser `fixable`.

Lo que destapa:

- **Los `.md` del catálogo contradicen la guía.** `FUD0191` dice «declare it in the `<head>`» y las
  fixtures ponen el `<link>` arriba del todo; `FUD0907` manda a `@code { @client }`, que SDD-60
  quita. El LLM ve las dos fuentes: cada ejemplo de un `.md` tiene que ser una fixture que compila,
  con la misma regla que la guía (§6).
- Las normas del usuario (§9, «solo tokens») saldrían aquí, con su código, si se activan.

### 5.6. `fudic_fix` (propuesta, 2026-10-22)

Aplica las bombillas del editor. Entrada: `{ paths?, codes?, dryRun = false }`.

1. Toma los diagnósticos `fixable` de `paths`.
2. **Solo reparaciones de una única acción.** Con varias opciones no elige el MCP: van a
   `remaining` con sus `options` y decide el LLM.
3. Aplica las ediciones que no se solapan, vuelve a comprobar y repite hasta que no queda nada
   `fixable` (un arreglo puede destapar otro), con un número máximo de vueltas.
4. **Un arreglo es un plan de la CLI** (`FileChange`): en local lo escribe el `apply` de siempre,
   en remoto la copia de trabajo; `dryRun` devuelve el plan. Sin mecanismo nuevo.

```json
{
  "applied": [
    { "code": "FUD0191", "at": "libs/ui/src/components/acme-card/acme-card.fud:16:5",
      "title": "Add <link rel=\"component\"> for <acme-badge>" }
  ],
  "diff": "--- a/…/acme-card.fud\n+++ b/…/acme-card.fud\n@@ … @@\n+<link rel=\"component\" href=\"../acme-badge/acme-badge.fud\">\n",
  "remaining": { "summary": { "errors": 2, "fixable": 0 }, "diagnostics": [], "codes": {} },
  "next": "Fix FUD0540 and FUD1145 by hand: key the loop by a string or number field of Item."
}
```

`remaining` tiene la forma de `fudic_check`.

Lo que destapa (en el código de hoy):

- **`fixable` exige que el arreglo sea correcto, no solo que exista.** La reparación de `FUD0540`
  pone la primera variable del bucle como clave: `const item of items` → `key (item)`, el objeto
  entero. Con SDD-61 la clave es `string` o `number`, así que cambia un error por otro (`FUD1153`),
  justo lo que su propio comentario dice evitar. Propuesta: la bombilla solo cuando la variable es
  primitiva o su tipo tiene un único campo `id`.
- **Los títulos de las bombillas están en español** («Añadir key (…)»): rompe la regla de código en
  inglés, y el MCP se los pasaría al LLM tal cual.

### 5.7. `fudic_spec_run` (propuesta, 2026-10-22)

Ejecuta los criterios de la `.fudspec` en un navegador y dice **cuál falla, en qué paso y qué vio**.
Entrada: `{ spec?, criteria?, failing? }`; `spec` es el tag o la ruta, sin él todas las unidades.

Lo dispara `next` de `status` («Run fudic_spec_run for acme-button») o el usuario («¿ya pasa el
botón?»). El motor es el del banco (`packages/workbench`, el mismo de `fudic-workbench run --json`),
llamado en proceso, como los planes de la CLI (§5.3).

```json
{
  "fudicVersion": "0.0.1",
  "commit": "…",
  "summary": { "pass": 3, "fail": 1, "error": 0 },
  "criteria": [
    { "spec": "libs/ui/src/components/acme-button/acme-button.fudspec", "id": "disabled-no-press",
      "verdict": "fail", "at": "acme-button.fudspec:9:1",
      "failed": {
        "step": "then  emitted press 0", "at": "acme-button.fudspec:13:5",
        "expected": "0 events 'press'", "got": "1 event 'press'"
      },
      "source": "libs/ui/src/components/acme-button/acme-button.fud:22:3",
      "quote": "<button @click=@onClick>",
      "shot": ".fudic/runs/acme-button/disabled-no-press.after.png",
      "pageErrors": [] }
  ],
  "next": "Fix acme-button.fud:22:3 so a disabled button does not emit 'press', then run fudic_spec_run { spec: \"acme-button\", failing: true }."
}
```

- **Solo se detallan los que no pasan**; los verdes van en `summary`. Un paso que falla lleva su
  línea en la `.fudspec`, lo esperado y lo obtenido.
- **`source` y `quote`**: el elemento donde falló, devuelto a su sitio en el `.fud`. Es lo que
  convierte un rojo en una edición.
- **`shot`** es la captura de después, como fichero: un agente la puede mirar; en chat, MCP Apps.
- **`failing: true`** repite solo lo que estaba en rojo: la vuelta corta del bucle.
- Lo que impide ejecutar (no hay navegador, la página no carga, la fixture falla) es un diagnóstico
  con código, como todo (§5.1).

Lo que destapa:

- **`status` no puede saber si los criterios están en verde** sin ejecutarlos (§5.4), y sin eso no
  sabe si la fase 4 está hecha. `spec_run` guarda cada ejecución con el hash de lo que entró
  (`.fud`, `.fudspec`, fixtures, lo que importan); `status` lee la última si el hash coincide y si
  no dice `"stale"`. Es la etapa 2 del banco (guardar ejecuciones). **Decidido (Pedro,
  2026-10-22): se guarda en git**, en el historial de la pieza (§5.8). Un equipo es grande y tiene
  que ver qué pasó de verdad. Las capturas no entran (binarios): siguen en una carpeta ignorada.
- **Hoy el motor no devuelve `source`.** Las `marks` dan la caja del elemento en la captura, no su
  span en el `.fud`. Hace falta la identidad de nodo del compilador (la de hidratación) para
  volver del DOM al fuente.
- **Lo esperado y lo obtenido no tienen forma común**: cada término devuelve su `evidence` a su
  manera. Para el LLM hace falta que cada término dé `expected`/`got` en texto.
- Los problemas del banco (`ProblemMessage`, `error` de un resultado) son texto suelto, sin código.

### 5.8. El historial de cada pieza (idea de Pedro, 2026-10-22)

El MCP escribe, junto a cada ruta o componente, un fichero con su historia: **cuándo empezó, cuándo
terminó y qué pasó entre medias**. Sale de guardar las ejecuciones en git (§5.7) y va más allá:
es el diario de desarrollo de esa pieza.

Propuesta (nombre y forma sin decidir):

```
acme-button.fudlog
2026-10-22T10:02 a1b2c3d started        by agent  "Button for the current page's actions"
2026-10-22T10:20 d4e5f6a approved       by pedro  spec 4 criteria  hash 2b8f…
2026-10-22T10:31 0a9b8c7 tests          red 6/6
2026-10-22T10:48 7f6e5d4 spec_run       fail 3/4  disabled-no-press  hash 91c2…
2026-10-22T10:52 3c2b1a0 spec_run       pass 4/4  hash 5e7a…
2026-10-22T11:05 9d8c7b6 documented     4/4 props
2026-10-22T11:06 9d8c7b6 done
```

- **Una línea por suceso y solo se añade**, nunca se reescribe. Con `merge=union` en
  `.gitattributes`, dos ramas que añaden a la vez no chocan.
- **`status` lee de aquí** la fase de la unidad y si su última ejecución sigue valiendo (hash).
- **Lo que entra:** el cambio de fase (§10.2), las aprobaciones, las ejecuciones (`spec_run`,
  `test`) con su resultado, lo que aceptó el cliente (`accepted`) y cada función que pasa de
  `fake` a `connected` (§10.6). Lo que no entra: cada `check` o `fix`,
  que son las vueltas del bucle y no historia.
- **Quién:** el agente o la persona.
- **Decidido (Pedro, 2026-10-22): la aprobación vive solo aquí**, como una línea `approved` con
  quién, cuándo y el hash de la `.fudspec` y sus fixtures. Hay un único sitio donde mirar, y la
  caducidad (§10.2) es directa: si el hash de ahora es otro, la aprobación ya no vale.

### 5.9. `fudic_test` (propuesta, 2026-10-22)

Ejecuta los tests unitarios de SDD-57 (`@fudic/testing`, vitest sobre happy-dom). Entrada:
`{ paths?, names?, failing? }`; sin `paths`, los de todas las unidades. Vitest se llama en proceso
(su API de Node, con el `vitest.config` del proyecto), nunca el binario.

Lo dispara `next` en la fase 3 («Write the unit tests of acme-button, then run fudic_test: they
must fail») y en la 4, junto a `spec_run`.

```json
{
  "fudicVersion": "0.0.1",
  "commit": "…",
  "summary": { "pass": 4, "fail": 2, "broken": 0 },
  "tests": [
    { "file": "libs/ui/src/components/acme-button/acme-button.test.ts",
      "name": "disabled: a click does not emit press",
      "verdict": "fail", "at": "acme-button.test.ts:18:5",
      "quote": "expect(pressed).toBe(0);",
      "expected": "0", "got": "1" }
  ],
  "next": "Make acme-button.fud pass these 2 tests. Do not change the tests."
}
```

- **Dos clases de rojo.** `fail` es una aserción que no se cumple: el rojo que se busca. `broken`
  es un test que ni llega a comprobar (el `.fud` no compila, `mount` lanza por una prop que no es
  JSON, un import que no existe). En la fase 3 solo vale el primero: un test que falla porque el
  componente no existe no prueba nada. `broken` sale como diagnóstico, en la forma de
  `fudic_check`.
- **El `.fud` que no compila** sale con sus FUD y su posición en el `.fud`, no como la excepción
  del import (SDD-57 ya los pinta así).
- **Al historial (§5.8)** va cada ejecución con su hash, como `spec_run`: `tests red 6/6` cierra
  la fase 3 y `tests pass 6/6` es la mitad de la fase 4.
- **«Do not change the tests»** en `next` de la fase 4: un LLM que no consigue el verde tiende a
  tocar el test. Si el test cambia después de su línea `red`, el hash lo delata en `status`.

Lo que destapa:

- **Falta el tema `testing` en `fudic_guide`**: la API de `mount`, `visit`, los gestos y, sobre
  todo, **la frontera con `.fudspec`** (SDD-57 §1.1): lo que va a vitest y lo que va al navegador.
  Sin ella, el LLM escribe en happy-dom un test de foco o de layout que pasa sin probar nada.
- **Criterios y tests pueden repetirse.** `app-tabs.fudspec` comprueba un clic y su panel; un
  test unitario puede comprobar lo mismo. Repetir sirve de poco (Pedro): ver §5.10.

### 5.10. Qué va a la `.fudspec` y qué a los tests (propuesta, 2026-10-22)

TDD de doble bucle: **por fuera, la aceptación** (lo que aprueba el usuario); **por dentro, lo
unitario** (lo que escribe el LLM). La frontera la marca **quién aprueba**:

| `.fudspec` (navegador) | Tests unitarios (happy-dom) |
|---|---|
| Lo que una persona comprobaría mirando y tocando | Lo que el usuario no ve ni aprobaría |
| Una frase del usuario = un criterio («deshabilitado no hace nada») | Cada variante de props, valores límite (vacío, largo, 0) |
| Teclado, foco, accesibilidad, visible, layout | El `detail` de cada evento |
| | Funciones de servidor y sus `fails`, cada regla de un form |
| | Las opciones del shadow root |
| La aprueba el usuario (`approved`) | La escribe el LLM, sin aprobación |

**Regla: lo que ya es un criterio no se repite como test unitario.** Va en el tema `testing` de
`fudic_guide`.

El flujo de un componente pedido en lenguaje natural:

1. El usuario describe el componente.
2. El LLM propone props y criterios; el usuario aprueba (`approved` en el historial, §5.8).
3. El LLM escribe los tests unitarios. **Criterios y tests quedan en rojo** por la razón buena
   (`fail`, no `broken`): `spec_run` y `test`, los dos al historial.
4. El `.fud`: el bucle corto es `fudic_test` (milisegundos); `spec_run` (segundos) confirma.

**Decidido (Pedro, 2026-10-22).** La fase 3 de §4.1 y §10.2 pasa a «tests y criterios en rojo».

### 5.11. Explicar un código: un tema de `fudic_guide` (2026-10-22)

Devuelve la explicación de un código: el `FUDnnnn.md` del catálogo (332 hoy, todos con la misma
forma: título, severidad, porqué y arreglo), que ya localiza `explanationFile` de
`@fudic/diagnostics/explain`.

```json
{
  "fudicVersion": "0.0.1",
  "code": "FUD0540", "title": "Loop without `key (…)`", "severity": "error",
  "why": "Every `@foreach`, `@for` and `@while` declares the identity of its rows, so an update can keep, move or drop each one instead of rebuilding the list.",
  "fix": "Add a key after the header: `@foreach (const item of items) key (item.id) { … }`.",
  "related": ["view"]
}
```

**¿Cuándo se usa, si `check` ya trae el porqué y el arreglo en `codes` (§5.5)?** Cuando el código
llega por otro camino: el log de un build que falla en `fudic_preview`, un test `broken`, un error
que el usuario pega en el chat, un código que cita la guía.

**Decidido (Pedro, 2026-10-22): no es una herramienta propia (`fudic_explain` desaparece), es un
tema de la guía**: `fudic_guide { topic:
"FUD0540" }`. Una herramienta menos (los clientes empeoran con muchas, §5.2), y el LLM ya sabe
que las dudas se resuelven en `guide`. `related` enlaza con el tema donde se explica la
construcción.

Lo que destapa:

- **Los `.md` citan la SDD** (`**error** · SDD-30`): no le dice nada al LLM ni al usuario. Sale de la
  respuesta o se quita del `.md`.
- **La forma del `.md` es un contrato**: el MCP la parte en `title`, `why` y `fix`. Un test del
  catálogo tiene que comprobar que los 332 la cumplen, y que cada ejemplo del `fix` compila
  (§5.5).
- **Un código de TypeScript** (`TS2322`) no tiene `.md`: la respuesta lo dice y no inventa nada.
- **Un código que no existe** (el LLM se lo inventa) es un diagnóstico propio, no un texto vacío.

### 5.12. `fudic_render` (propuesta, 2026-10-22)

Pinta **una pieza** en el servidor y devuelve lo que sale, sin navegador ni app arrancada.
Entrada: `{ route }` (una URL concreta, `/productos/42`) o `{ component, fixture?, props? }`,
`backend: "fake" | "connected"` para las funciones que la pieza llame, y `engine: "happy-dom" |
"browser"` (por defecto `happy-dom`).

Las piezas ya existen: una ruta se pinta con `renderRouteHtml`, como en `vite dev`; un componente
suelto, con la **página anfitriona virtual** de `@fudic/testing` (SDD-57 §4.2), que lo instancia
con sus props como lo haría un padre. Nada nuevo que mantener.

```json
{
  "fudicVersion": "0.0.1",
  "commit": "…",
  "component": "acme-button", "fixture": "disabled",
  "as": "outline",
  "outline": "button \"Save\" [disabled]",
  "html": null,
  "functions": [],
  "diagnostics": [],
  "next": null
}
```

- **`fixture` antes que `props`.** Pintar con un caso de la `.fudspec` es pintar un estado que
  alguien aprobó; las props a mano quedan para probar algo que aún no es caso.
- **`as: "outline" | "html"`.** El HTML de una página con DSD, estilos y mapas de hidratación son
  miles de tokens. `outline` (por defecto) es el árbol de roles, nombres y estados, el mismo
  vocabulario con el que la `.fudspec` busca (`role:tab/"Tab B"`): el LLM ve lo que vería un
  lector de pantalla. `html` cuando hay que mirar el markup, con `select` para un trozo.
- **`functions`**: qué funciones llamó la pieza y si respondió el fake o el backend.
- **En chat**, además, la vista previa con MCP Apps: el HTML con su DSD pintado en el cliente.
  Es estático: el DSD se ve, la interacción no (para eso `spec_run` o `fudic_preview`).

**`render` frente a `preview`**: `render` es una pieza, al instante y sin servidor; `preview` es
la app entera corriendo en una URL.

Lo que destapa:

- **`outline` no existe.** happy-dom no calcula el árbol de accesibilidad; Testing Library
  aproxima roles y nombres, y no baja por shadow roots sin la ayuda de `@fudic/testing`.
  **Decidido (Pedro, 2026-10-22): los dos, con un parámetro.** `engine: "happy-dom" | "browser"`,
  por defecto `happy-dom` (sobre `@fudic/testing`, al instante); `browser` lo pinta en el
  navegador del banco, exacto y en segundos, para cuando hay dudas.
- **La página anfitriona vive en `node_modules/.fudic-test/`**: el MCP la comparte con los tests
  o tiene la suya. En remoto, en la copia de trabajo.
- **Las props de un `via: 'ssr'` tienen que ser JSON** (SDD-57 §3.2): una prop función no se puede
  pintar así, y la respuesta tiene que decirlo como diagnóstico, no lanzar.

### 5.13. `fudic_preview` (propuesta, 2026-10-22)

La **app entera corriendo en una URL**, para que la vea y la toque una persona. Entrada: `{ route?,
backend? }`. Lo pide el usuario («quiero verlo») o `next` al cerrar una unidad.

**En local** arranca el dev server la primera vez (el `createServer` de Vite con el plugin
`fudic()`, en proceso, no el binario: `dev` no se expone porque no termina, §5.3) y lo reutiliza
después; vive lo que vive el MCP. Con HMR, lo que el agente escribe se ve sin volver a llamar.

**En remoto** es la preview de la rama (§2.1): dice en qué punto está el builder y para qué
commit.

```json
{
  "fudicVersion": "0.0.1",
  "commit": "9d8c7b6",
  "where": "remote",
  "state": "ready",
  "builtFrom": "9d8c7b6",
  "url": "https://acme--idea-showcase.preview.fudic.dev/button",
  "backend": "fake",
  "routes": ["/", "/button", "/card", "/input"],
  "diagnostics": [],
  "next": null
}
```

- **`state`:** `starting`, `building`, `ready` o `failed`. Con `failed`, `diagnostics` trae los
  del build en la forma de `fudic_check`: el mismo FUD que el LLM ya conoce (§2.2).
- **`builtFrom` distinto de `commit`**: la preview va por detrás de lo último que se escribió. El
  LLM no le dice al usuario «ya está» con una preview vieja.
- **`backend`**: si las funciones responden con el fake o con el backend real, para que nadie
  confunda datos falsos con los de verdad.
- **`routes`**: las URL concretas que se pueden abrir; una ruta con params necesita sus
  `paths()` o un ejemplo.
- **Errores del servidor** mientras corre (una excepción en un handler, en el SSR de una ruta):
  la siguiente llamada los devuelve como diagnósticos con posición en el fuente.

Lo que destapa:

- **Lo que pasa en el navegador del usuario no llega al MCP**: un error de hidratación en la
  consola solo lo ve quien la abre. Para eso está `spec_run`; `preview` es para mirar, no para
  comprobar.
- **Decidido (Pedro, 2026-10-22): una preview remota es privada por defecto y compartible con un
  enlace.** Va con la cuenta (OAuth, §2.4), y enseñársela a un cliente es para lo que existe.
- **El builder no ejecuta un `fudic check` aparte (§9):** ejecuta el build, y el build falla con
  los mismos diagnósticos, de tipos incluidos. Un único origen (§5.5).

## 6. `fudic_guide`

Envoltura: `{ fudicVersion, topic, related, body }`, con `body` en markdown en inglés.

Los temas se organizan por **lo que el LLM va a escribir** (`components`, y después `pages`,
`layouts`), con la gramática de expresiones aparte en `view`. Los nombres van en inglés. La guía
describe el lenguaje de después de SDD-60 y SDD-61 (un único `@code`, `<link rel="server">`, vista
portable): el MCP llega detrás de las dos.

- **`overview`:** los tipos de fichero y la estructura de carpetas. Las reglas de trabajo no:
  repetían las `instructions` del servidor y van en `workflow`.
- **`components`:** cómo se crea (`fudic_generate`, nunca desde cero), la forma del fichero en
  orden (`<link>`, `@code`, `<head><style>`, el tag con su `<template shadowrootmode>`,
  `@snippet`), un ejemplo canónico entero, props, cómo se usa otro componente (`.prop`, atributo,
  `class:`, `@evento`, slots, spread), eventos con `emit`, estilos con `:host`/`::slotted()`, una
  tabla «Instead of…» con los reflejos de React (`className`, `onClick`, `{cond && …}`, `.map`,
  `useState`, `children`, `props.x`) y cómo comprobarlo.
- **`view`:** forma del fichero, valores, operadores, control, tipos portables, «los manejadores
  son libres», y una tabla **«Instead of… write…»** con los reflejos de JS que trae un LLM
  (`filter`, `toFixed`, `.length`, `new Date`, `||`).
- **`testing`:** la API de `@fudic/testing` (`mount`, `visit`, consultas, gestos, `shadowOf`), la
  tabla de §5.10 (qué va a la `.fudspec` y qué a vitest) con su regla «lo que ya es un criterio
  no se repite como test», el rojo bueno (`fail`) frente al que no vale (`broken`), y «en la
  fase 4 no se tocan los tests».

Para que no mienta:

- Las secciones **generadas** salen de la lista blanca de los analizadores, los tipos portables y
  el catálogo de diagnósticos: si una SDD cambia la lista, la guía cambia sola.
- Las secciones **escritas** («Instead of…», «How to work») tienen **cada ejemplo como fixture**
  que pasa por `fudic_check` en los tests.
- Cada prohibido lleva su código: el LLM ve el mismo `FUD1145` en la guía y en el diagnóstico.
  Los reflejos de React (`className`, `onClick`, `{cond && …}`) no tienen código hoy: o el parser
  ya los rechaza con uno que hay que localizar, o faltan diagnósticos.
- El ejemplo canónico de cada tema es una fixture: si cambia la sintaxis, falla el test de la guía.

## 7. Orden propuesto

1. **MCP local** con las herramientas de lenguaje y de la CLI. Útil desde el primer día en Claude
   Code; fija el vocabulario.
2. **Git, builder e imagen de Node**, con previews por rama.
3. **MCP remoto** para chats: el mismo núcleo con copia de trabajo en el servidor.
4. **El resto de imágenes**, según cada runtime pase la conformidad.

Cada paso funciona sin el siguiente.

## 8. Relación con el MCP del banco

IDEA-01 §3.2 describe otro MCP que **actúa** sobre una página viva (Playwright, `set_prop`,
`dispatch`): de ejecución, local y con estado. Este es de lenguaje, sin estado propio y también
remoto. Se mantienen como dos superficies; `fudic_spec_run` es el punto donde se tocan.

## 9. Abierto

- ~~**Contrato del backend en el repo** (§3, camino 1)~~: claro para Pedro (2026-10-22), como las
  herramientas que quedaban de §5.2 (`symbols`, `contract`, `backend_import`, `backend_describe`,
  `call`, `workspace_open`, `commit`, `propose`, `new`, `generate`, `format`): no piden decisión,
  se diseñan al escribir la SDD. Lo que sigue en esta lista es trabajo, no decisiones.
- **Baseline de HTML/CSS:** el compilador no comprueba nada de baseline hoy. Sin un analizador
  (probablemente sobre `web-features`), el MCP solo puede contar la regla, no comprobarla.
- **Coste del pase tipado en remoto:** un programa TS en memoria por llamada; hay que medirlo.
- **Fake con estado o sin él:** si un `save` se ve después en un `search`.
- **Generadores que faltan en la CLI:** `.fudapi` y contrato del backend.
- **El fake, pendiente de su propia SDD** (§10.7): estáticos compartidos, backend en el navegador
  sobre IndexedDB, dónde se engancha, volver a la semilla. Pedro lo abordará al afrontar el fake;
  no bloquea el MCP.
- ~~**`fudic check` en el builder (§2.2)**~~ Resuelto en §5.13: el builder ejecuta el build, que
  falla con los mismos diagnósticos.
- **El fake (§3, camino 2) enmienda la decisión 6 de SDD-60** (sin handler, 404). Hay que anotarlo
  en SDD-60 cuando esto sea SDD.
- ~~**`fudic_test` depende de SDD-57**, que no está en main.~~ SDD-57 está `Hecho` y en main
  (`packages/testing`).
- ~~**¿Dónde queda escrito que el usuario aprobó los criterios?**~~ Resuelto en §10.2: una línea
  `approved`, que vive en el historial de la pieza (§5.8).
- **Accesibilidad comprobada** (caso §10). La `.fudspec` busca por rol y nombre accesible, pero no
  audita. La puntuación de accesibilidad de Lighthouse es axe-core: hace falta un paso que lo pase,
  en `fudic_spec_run` o en una herramienta propia.
- **Normas del usuario** (caso §10: «solo tokens, ningún literal»). fudic no diagnostica normas de
  estilo por su cuenta. Opción: una regla opcional en `fudic.json` (`"styles": { "tokensOnly":
  true }`) que `fudic_check` haga cumplir si el usuario la activa.

## 10. Caso de estudio: una librería de componentes (2026-10-22)

El método de la sesión: cada herramienta se evoluciona viendo su definición, el prompt que la
dispara, la llamada y la respuesta. Este es el caso que la pone a prueba.

> Quiero crear una librería de componentes: Button, Link Button, Card, Input (text, date…).
> Accesibilidad 100 % en Lighthouse, diseño moderno con una guía de estilos basada en tokens que
> se reutiliza en todos. Ningún valor literal: todo sale de los tokens.

1. `fudic_status` → `none`. El LLM pregunta **solo lo que falta**: nombre y prefijo, si Input es
   uno con `type` o uno por tipo, y si hay marca o paleta de partida.
2. Estructura, con planes que la CLI ya tiene (es la forma de `examples/workspace/libs/guia` +
   `ui`):
   ```
   fudic_new      { name: "acme", workspace: true }
   fudic_generate { kind: "lib", name: "tokens", stylesOnly: true }
   fudic_generate { kind: "lib", name: "ui", uses: ["tokens"] }
   ```
3. `fudic_guide { topic: "html-css" }` y `tokens.css` como custom properties (color, tipografía,
   espaciado, radios, sombras, foco, movimiento). El usuario la ve antes de seguir.
4. Por componente, las fases de §4.1 (corregidas en §10.2). Input es un control form-associated,
   no un componente plano.
5. `fudic_propose`.

Lo que destapa: los dos últimos puntos de §9 (accesibilidad y normas del usuario), que `status`
tiene que distinguir librería de app (§5.4) y que `fudic_generate` se quedaba corto (§5.2).

### 10.1. «Quiero una página para ver lo que has creado»

La evidencia se construye como lo haría un usuario: una app del workspace que **consume** la
librería, no algo pegado dentro de ella.

1. `fudic_status` manda a `fudic_propose`; la petición del usuario tiene prioridad y se vuelve a
   `status` al terminar.
2. `fudic_generate { kind: "app", name: "showcase", uses: ["ui"] }` (`g app --uses` ya existe).
3. Una página por componente, con sus casos sacados de las **fixtures**: enseña exactamente los
   estados que comprueban los criterios, sin inventar ninguno.
   ```html
   @code {
     import cases from '@acme/ui/components/acme-button/acme-button.fixture';
   }
   <h2>Primary</h2>   <acme-button ...cases.primary>Save</acme-button>
   <h2>Disabled</h2>  <acme-button ...cases.disabled>Save</acme-button>
   ```
4. Verla: en chat, `fudic_render` (MCP Apps); en remoto, la URL de `fudic_preview`.
5. Es también la evidencia de accesibilidad: Lighthouse audita páginas, y estas son las páginas.

Propuestas que salen:

- **`fudic_preview` en local** arranca `dev` en segundo plano la primera vez y devuelve la URL; el
  servidor vive lo que vive el MCP. Sin esto, en local no hay forma de ver nada (`dev` no se expone
  porque no termina).
- **`fudic_generate { kind: "showcase" }`** escribe la página desde las fixtures, un bloque por
  caso, y se regenera. Las fixtures son un `Record` y la vista no puede recorrer un map
  (`FUD1153`): escrita a mano, el escaparate se queda atrás en cuanto se añade una fixture.

### 10.2. El error a propósito: construir sin bases

Pedro pidió los componentes **a propósito** sin haber dado props, criterios, tests ni
documentación: la ansiedad humana de ver algo ya. El MCP obedeció. Preguntó la forma (nombre,
prefijo, paleta) y no el fondo, escribió él los criterios desde su idea de un botón, y el
resultado es un **wireframe que parece producto**. Vale para que un cliente acepte algo; llevarlo a
producto sin bases cuesta meses.

Propuesta:

1. **Cada componente pasa por fases fijas; cada una necesita la aprobación del usuario antes de
   la siguiente.**

   | # | Fase | Quién | Queda en |
   |---|---|---|---|
   | 1 | Props: nombre, tipo, defecto, significado | El usuario las describe; el LLM propone; el usuario aprueba | El tipo de `props<T>()` y las fixtures |
   | 2 | Criterios | El usuario aprueba | `.fudspec` |
   | 3 | Tests unitarios; tests y criterios en rojo (§5.10) | El LLM | `.test.ts`, historial |
   | 4 | La vista, hasta tests y criterios en verde | El LLM | `.fud` |
   | 5 | Documentación | El LLM, desde props y criterios | JSDoc del `@code` y de cada prop |
   | 6 | Su página en el escaparate | El LLM | `showcase` (§10.1) |

   La guía de estilos es una unidad más: los tokens se aprueban antes de ningún componente.
2. **`status` ante una petición ansiosa manda preguntar, no construir**: `next` = «Before any
   view: for acme-button, ask the user for its props and its behaviour. Propose, wait for
   approval, write them. Then the next component.»
3. ~~**El wireframe existe, pero solo si se pide.**~~ Retirado en §10.6: lo sustituye el producto
   sobre el fake. Lo que sigue es la propuesta original. fudic no quita la opción: si el usuario dice
   «wireframe», el LLM se salta las fases, y la unidad queda marcada `wireframe` en `status` con lo
   que le falta. La deuda se ve siempre y no se confunde con producto.
4. **Las aprobaciones se escriben en el repo**: sin esa marca, `status` no sabe si una fase está
   hecha (§9). Deja de ser un detalle y pasa a ser el centro.

Decidido (Pedro, 2026-10-22):

- **Documentar es JSDoc.** Los componentes ya lo soportan: el `/** … */` de cada prop del tipo de
  `props<T>()` sale en la tarjeta del hover del tag (`language-server`, `tag-card.ts`), y lo mismo
  devuelve `fudic_describe` al LLM. La fase 5 queda en «JSDoc en cada prop».
- ~~**La aprobación es una línea `approved` en la `.fudspec`.**~~ Cambiado en §5.8: la aprobación
  es una línea `approved` en el **historial de la pieza**, no en la `.fudspec`.

Consecuencias:

- Una sola marca cubre las fases 1 y 2: las fixtures de la spec ya fijan las props, así que props
  y criterios se aprueban juntos.
- **La aprobación caduca si los criterios cambian después.** La línea `approved` lleva el hash de
  la `.fudspec` y sus fixtures; si el de ahora es otro, `status` la da por caducada. Si no, un LLM
  tocaría criterios aprobados sin que nadie lo vea.
- La gramática de `.fudspec` (SDD-52) no cambia.

### 10.3. Usar un componente ya hecho: su contrato

Un componente documentado le dice al LLM cómo usarlo **sin abrir su fichero**. El índice del
language server ya junta casi todo (`Contract`, `language-server/src/mode.ts`): la doc del
componente (el primer JSDoc del `@code`, decisión 107), las props con tipo y JSDoc, los slots con
nombre y los eventos de cada `emit('…')`. Es lo que pinta el hover del tag.

1. **Qué hay:** `fudic_symbols { kind: "components" }` lista cada tag con su librería y la primera
   línea de su doc.
2. **Cómo se usa:** `fudic_describe { name }` devuelve el contrato y un `example` **generado desde
   él**, que no se queda atrás:

   ```json
   {
     "kind": "component",
     "tag": "acme-button",
     "link": "<link rel=\"component\" href=\"@acme/ui/components/acme-button/acme-button.fud\">",
     "doc": "A button for an action on the current page. To navigate, use acme-link-button.",
     "props": [
       { "name": "variant", "type": "'primary' | 'secondary' | 'ghost'", "required": false,
         "default": "'primary'", "doc": "Visual weight. One primary per view, for its main action." }
     ],
     "slots": [{ "name": null, "doc": null }],
     "events": [{ "name": "press", "detail": null, "doc": null }],
     "parts": [],
     "example": "<acme-button .variant=\"primary\" @press=@onPress>Save</acme-button>",
     "usedIn": ["apps/showcase/src/routes/button.fud:4:3"]
   }
   ```
3. **Regla de la guía `components`:** «Before using a component, call `fudic_describe`. Never open
   its file.»

Lo que el contrato aún no tiene:

- **CSS parts** (Pedro lo tenía pensado; hoy nadie las extrae).
- **Tipo y doc del `detail` de un evento**: sale el nombre de `emit('press')`, no qué recibe el
  manejador.
- **El slot por defecto**: el contrato solo lista los slots con nombre.
- **El `default` de cada prop**: está en la desestructuración y no se extrae.

### 10.4. Los tokens como símbolos (Pedro, 2026-10-22)

Por el mismo motivo, los tokens de la guía de estilos se exportan como símbolos: al montar un
componente o una ruta, el LLM sabe cuáles hay sin abrir hojas. Hoy nada los extrae: el índice
conoce las `globalStyles` de cada `fudic.json` por nombre, no lo que declaran.

Propuesta:

- **Se documentan como las props**, con `/** … */` encima de cada declaración:
  ```css
  :host {
    /** Main action background. Contrast with --acme-color-on-primary ≥ 4.5:1. */
    --acme-color-primary: oklch(55% 0.2 260);
    /** Base spacing step. Multiply, never invent: calc(var(--acme-space) * 2). */
    --acme-space: 0.25rem;
  }
  ```
- **`fudic_symbols { kind: "tokens" }`** devuelve los del proyecto y los de sus librerías, en el
  orden en que se adoptan:
  ```json
  { "tokens": [
    { "name": "--acme-color-primary", "value": "oklch(55% 0.2 260)", "group": "color",
      "doc": "Main action background. …", "from": "@acme/tokens",
      "file": "libs/tokens/tokens.css:4:3" }
  ]}
  ```
  `group` sale del nombre (`--<prefijo>-<grupo>-…`), sin configurar nada.
- **Un solo índice para el editor y para el LLM**: autocompletado de `var(--` y hover con la doc.
- **Regla de la guía `components`:** «Before writing styles, call `fudic_symbols { kind:
  "tokens" }`. Use only those names.»

Lo que permite después:

- La regla opcional «solo tokens» (§9) se puede **comprobar**: sabiendo qué tokens hay, un literal
  con token equivalente sale en `fudic_check` si el usuario la activa.
- El contrato del componente (§10.3) puede listar **los tokens que lee**: qué afecta a su aspecto,
  igual que las CSS parts.

### 10.5. Cambiar un componente aprobado (propuesta, 2026-10-22)

`acme-button` está terminado: aprobado, en verde, documentado y en el escaparate. El usuario:

> Quiero que el botón tenga un estado de carga.

**Dos clases de cambio**, y `status` las trata distinto:

| Cambio | Ejemplo | ¿Aprobación? |
|---|---|---|
| **De contrato**: props, eventos, slots o criterios | Añadir `loading`, quitar `ghost`, renombrar `press` | Sí: los criterios cambian y el hash caduca (§5.8) |
| **De implementación**: la vista, los estilos, sin tocar el contrato | Otro radio, otra estructura interna | No: tests y criterios tienen que seguir en verde |

El recorrido del cambio de contrato:

1. `fudic_status` → la unidad está `done`. El LLM escribe una línea `reopened` en el historial,
   con lo que pidió el usuario, y la unidad vuelve a la fase 1.
2. Propone **solo lo que cambia**: la prop `loading: boolean` y dos criterios («mientras carga,
   pulsar no emite `press`», «mientras carga, el botón se anuncia ocupado»). El usuario aprueba y
   sale una línea `approved` nueva con su hash.
3. Tests nuevos, y **solo los nuevos en rojo**: `tests red 2/8`. Si un test viejo sale en rojo
   antes de tocar la vista, algo está mal desde el principio.
4. La vista, hasta 8/8 y los criterios en verde. Los viejos que pasaban son la red contra la
   regresión.
5. JSDoc de `loading`, una fixture `loading` y su bloque en el escaparate (`showcase` se regenera,
   §10.1).

```
2026-10-23T09:00 1a2b3c4 reopened    by agent  "Add a loading state"
2026-10-23T09:12 2b3c4d5 approved    by pedro  spec 6 criteria  hash 7c1d…
2026-10-23T09:20 3c4d5e6 tests       red 2/8
2026-10-23T09:41 4d5e6f7 tests       pass 8/8
2026-10-23T09:43 4d5e6f7 spec_run    pass 6/6
2026-10-23T09:50 5e6f7a8 done
```

Lo que asegura:

- **Un LLM que toca criterios aprobados sin preguntar se ve**: el hash no coincide, `status`
  pone `"approval": "expired"` y `next` = «Show the user the diff of acme-button.fudspec since its
  approval and ask them to approve it». El diff sale de git, desde el commit del `approved`.
- **Quitar o renombrar rompe a quien lo usa.** El pase tipado lo ve en cada consumidor del
  workspace (`fudic_describe` → `usedIn`), y como nunca se avanza con errores (§5.4), los arregla
  en la misma rama: el PR llega en verde o no llega.

**El aspecto (decidido, Pedro, 2026-10-22).** Los criterios no miran cómo se ve, así que un
cambio de implementación tiene **las dos cosas**:

- **Capturas de antes y después**, del banco, por cada caso de la fixture: son la **evidencia**.
  El usuario las aprueba y queda una línea `look` en el historial (quién, cuándo, hash de las
  capturas).
- **La preview** (§5.13) para verlo y tocarlo, que no deja rastro: mirar no es aprobar.

Decidido también: las capturas son binarios y no entran en git (§5.7); van **adjuntas al PR** que abre
`fudic_propose`, y el historial guarda su hash. El PR es donde el equipo revisa, y el hash dice si
lo aprobado es lo que se está mergeando.

### 10.6. Sin wireframe: producto sobre el fake (Pedro, 2026-10-22)

**Decidido: el modo wireframe desaparece.** Se diseñó (entrar saltándose las fases, salir
descartando la vista) y destapó el problema: si se descarta la vista, veinte días después nadie
sabe qué aceptó el cliente. Pedro lo resuelve de raíz con lo que fudic ya es.

**El flujo normal** es una gateway que recibe la cookie y resuelve el JWT, y detrás fudic como BFF
(§1.5), que conecta con un micro que es backend puro o sirve un fake. fudic no prohíbe que alguien
lo use como backend, pero no es lo normal.

**Con el fake generado desde el `.fudapi`** (§3, camino 2) no hay wireframe: hay **producto sin
conectar al backend real**. Lo que pedía el wireframe, ver algo ya sin esperar al backend, lo da el
fake; y la pieza pasa por todas sus fases como cualquier otra.

> Quiero enseñarle la tienda al cliente el lunes.

1. Cada unidad, sus fases (§4.1): props y criterios aprobados, `.fudapi`, tests y criterios en
   rojo, la vista hasta el verde.
2. La fase 5, «conectar o falsear», queda en **falsear**: cada función responde desde su `-> T` y
   sus `fails` se pueden provocar. `status` cuenta la función como `fake` (§5.4).
3. El cliente lo ve en la preview con `backend: "fake"` (§5.13). Lo que acepta **es el producto**:
   no hay nada que descartar.
4. Cuando el backend exista, cada función pasa de `fake` a `connected` sin tocar la vista ni el
   contrato. Si el backend no encaja con el `.fudapi`, el handler traduce (§3).

**Lo aceptado sigue quedando escrito**, aunque ya no haya vista que descartar: una línea `accepted`
en el historial (quién, cuándo, lo que dijo el cliente, el commit) y una etiqueta de git sobre ese
commit. `fudic_preview { at: "accepted" }` vuelve a servir esa versión.

```
2026-10-23T10:00 1a2b3c4 started     by agent  "Shop for Monday's demo"
2026-10-23T10:20 2b3c4d5 approved    by pedro  spec 5 criteria  hash 4e2a…
…
2026-10-24T17:00 6f7a8b9 done        fake 3/3
2026-10-27T09:00 7a8b9c0 accepted    by pedro  "Client accepted it at Monday's demo"  tag accepted/shop/2026-10-27
2026-11-12T11:00 8b9c0d1 connected   save search load
```

Lo que destapa:

- **El fake no está en SDD-60**: su §7 lo deja fuera de alcance (IDEA-05 §8). Sin él este flujo no
  existe: necesita su propia SDD (o entrar en la de este MCP), y la enmienda de la decisión 6 de
  SDD-60 (sin handler, 404) ya anotada en §9.
- ~~**El fake necesita identidad.**~~ No en este caso (Pedro): no hay gateway ni usuario, ver
  §10.7.
- **Los datos del fake** (§9, «fake con estado o sin él») pasan a importar: lo que ve el cliente
  sale de ahí. Resuelto en §10.7.

### 10.7. Compartir el producto como estáticos, con el backend en el navegador (Pedro, 2026-10-22)

**Dónde se queda.** El producto sobre el fake se comparte como **estáticos**, en un sitio donde
se queda de por vida; Pedro piensa en los artifacts de Claude, que publican una página con sus
ficheros. Es SSR/SSG: el build ya da HTML con su DSD, y eso es lo que se publica. **Sin gateway
ni usuario**: nadie inicia sesión en una demo.

**El backend es un módulo en el navegador sobre IndexedDB.**

- Arranca con los **JSON de semilla** (las fixtures o los datos fijos del fake) y los guarda en
  IndexedDB.
- Cada función del `.fudapi` responde desde ahí: un `get` lee, un `put` o un `post` actualiza el
  objeto, un `delete` lo quita. El estado se mantiene entre visitas **sin backend**.
- Cierra la pregunta de §9: **el fake tiene estado**. Lo que se guarda se ve después en la
  búsqueda.

**Pendiente (Pedro, 2026-10-22):** todo lo que sigue se decide al escribir la SDD del fake, no
aquí. No afecta al MCP: para él el fake es `backend: "fake"` y el estado `fake` de cada función.

Ideas apuntadas para entonces, sin decidir:

- **Se engancha en el transporte de `$fn`, no en el Service Worker.** El SW de fudic podría
  atender `/_fudic/fn/` y ya pinta las rutas `sw`, pero en un host ajeno (el iframe de un artifact)
  puede que no haya SW. El transporte funciona en cualquier sitio.
- **Un solo fake, sobre una interfaz de almacén**: IndexedDB en el navegador, memoria en Node
  (para `fudic_call` y `fudic_render` con `backend: "fake"`). La misma lógica generada desde el
  `.fudapi`, dos almacenes.
- **Las rutas `ssr` no se pueden exportar tal cual**: no hay servidor. El export las exige `ssg`
  o `sw`, o lo dice con un diagnóstico.

Lo que destapa:

- **El estado es de cada visitante.** IndexedDB vive en su navegador: lo que el cliente cambia no
  lo ve nadie más, y en una ventana privada empieza vacío. Para una demo hace falta **volver a la
  semilla** (un botón o una URL).
- **Las capacidades del host** (SW, almacenamiento, rutas relativas, la base de la app) hay que
  comprobarlas contra el artifact real antes de dar el export por bueno.
- **Es la SDD del fake**: generado desde el `.fudapi`, en el navegador, con estado en IndexedDB y
  export estático. Sustituye al fake de servidor que proponía §3 (camino 2).

## 11. Impacto: cuántas SDD salen y qué se toca (2026-10-22)

Para medir el coste antes de escribir ninguna SDD. Sale de lo que destapó cada sección (§5–§10),
contrastado con el código de hoy. El tamaño se compara siempre con una SDD ya hecha.

### 11.1. Antes de empezar

- **SDD-60 (`.fudapi`) tiene que estar terminada.** Va por 54 de 64 tareas en su worktree. Casi
  todo el MCP habla de ella: `status`, `check`, las funciones conectadas o falsas, la guía.
- **SDD-61 (vista portable) está escrita y sin implementar.** Solo bloquea la parte de la guía que
  explica la vista; lo demás puede empezar sin ella.

### 11.2. Siete trabajos para tener el MCP en Claude Code

1. **Que los mensajes de error digan la verdad.** Hoy algunas explicaciones contradicen la guía
   (`FUD0191`, `FUD0907`), otras citan SDD internas, y algunas bombillas arreglan mal (`FUD0540`)
   o están en español. Además, cada ejemplo de arreglo tiene que compilar, y los reflejos de React
   (`className`, `onClick`…) necesitan su código. *Tamaño: como SDD-31 (`computed`/`effect`).*

2. **Que un componente cuente todo sobre sí mismo.** El hover ya enseña props, slots con nombre,
   eventos y documentación. Le faltan el valor por defecto de cada prop, el slot sin nombre, qué
   recibe cada evento y las CSS parts. Y los tokens de estilo como símbolos, con su
   documentación, su autocompletado y su hover (§10.3, §10.4). *Tamaño: como el anterior.*

3. **Que ejecutar criterios y tests devuelva algo que una máquina entienda.** Qué falló, qué se
   esperaba, qué salió, si el test falló de verdad o ni llegó a ejecutarse, y **en qué línea del
   `.fud`** está el elemento que falló. Esto último es lo difícil: la única parte que toca de
   verdad el compilador. También el esquema de roles de `render` (§5.7, §5.9, §5.12). *Tamaño:
   como SDD-57 (tests unitarios).*

4. **El historial de cada pieza.** El fichero que solo crece, con aprobaciones, ejecuciones y lo
   que aceptó el cliente, y los hashes que dicen si algo ha caducado (§5.8, §10.5). Va después del
   3. *Tamaño: como el 1.*

5. **Que la CLI genere lo que falta.** El `.fudapi`, la página del escaparate desde las fixtures,
   y que `fudic new` deje configurado el MCP (§5.3, §10.1). *Tamaño: el más pequeño, como SDD-55
   (resto de props).*

6. **El MCP, primera mitad: lenguaje y proyecto.** El servidor, la guía con sus temas, `status`,
   comprobar errores, arreglarlos, describir componentes y crear cosas con la CLI. **Con esto ya se
   trabaja en Claude Code.** Necesita el 1, el 2 y el 5. *Tamaño: como SDD-57.*

7. **El MCP, segunda mitad: ver y probar.** Ejecutar criterios y tests, pintar una pieza, llamar a
   una función y la preview local. Necesita el 3, el 4 y el 6. *Tamaño: como el 1.*

El 1, el 2 y el 5 pueden ir a la vez. El MCP en una sola SDD sería del tamaño de SDD-60; partido
en dos, la primera mitad ya sirve sola.

**En conjunto: como hacer tres veces SDD-60.**

### 11.3. Aparte, sin prisa

Ninguna bloquea el MCP en Claude Code:

- **Auditar la accesibilidad** (axe-core al ejecutar los criterios) y **las normas del usuario**
  («solo tokens»). Como SDD-31.
- **Comprobar que el HTML y el CSS funcionan en todos los navegadores** (baseline). Entre SDD-31 y
  SDD-57.
- **Conectar con un backend real**: importar su contrato y generar el cliente. Como SDD-57, primero
  solo en TypeScript.
- **El fake**: pendiente de Pedro (§10.7).

### 11.4. Lo que se hace desde el chat es otro producto

Servidores con copias de trabajo, git remoto, el builder, las imágenes por lenguaje, las previews
por rama y la plataforma (aislamiento, secretos, cuotas, OAuth). Lleva su propia tanda de SDD y
no toca el framework.

### 11.5. Lo que se toca del compilador

Poco:

- **Volver de un elemento del DOM a su línea en el `.fud`** (trabajo 3). La hidratación ya
  identifica cada nodo; falta que esa identidad lleve de vuelta al fuente.
- **Algunos diagnósticos nuevos** (trabajo 1).
- **Las CSS parts** (trabajo 2).

Lo demás vive en el language server, el banco, `@fudic/testing`, la CLI, el catálogo de
diagnósticos y el paquete nuevo del MCP.
