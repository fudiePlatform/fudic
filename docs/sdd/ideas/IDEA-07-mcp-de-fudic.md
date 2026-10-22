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
            └──────────► builder: fudic check → emit → imagen ◄───┘
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

Por cada push: `fudic check` → emit al lenguaje del servidor → imagen → despliegue. Un check que
falla no despliega, y su error es **el mismo diagnóstico** que el MCP ya dio al LLM.

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
     "next": [
       "Ask the user what the app is for: its pages, the data each shows, the actions on it.",
       "Ask for the backend: an OpenAPI/proto/GraphQL contract, or 'none yet' (fake).",
       "Then call fudic_new with a name and the server language."
     ]
   }
   ```

Para cuando el MCP no está conectado: `fudic new` deja un `.mcp.json` y un `CLAUDE.md`/`AGENTS.md`
de tres líneas que remiten al MCP; en chat, un *prompt* MCP `new-app` aparece como comando; y la
web de fudic publica un `llms.txt` que dice «conecta el MCP».

### 4.1. Las fases que guía `fudic_status`

1. `.fudspec`: qué hace la app (el usuario confirma los criterios).
2. `.fudapi`: el contrato.
3. `.fud`: las vistas enlazadas.
4. Conectar o falsear cada función.
5. Criterios de la `.fudspec` en verde.

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
| Lenguaje | `fudic_guide { topic }` | Gramática de `overview`, `view`, `fudapi`, `fudspec`, `html-css`, `workflow` (§6) |
| | `fudic_explain { code }` | El `.md` del código de diagnóstico |
| Proyecto | `fudic_status` | Fase, lo pendiente, recuento de diagnósticos. Guía al LLM |
| | `fudic_new` | Crea la app (plan `new` de la CLI) |
| | `fudic_generate { kind }` | `component`, `page`, `layout`, `app`, `lib` (planes de la CLI) |
| | `fudic_add { module }` | `di`, `forms`, `http`, `i18n` (plan `add`) |
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

## 6. `fudic_guide`

Envoltura: `{ fudicVersion, topic, related, body }`, con `body` en markdown en inglés.

- **`overview`:** los tipos de fichero, la estructura de carpetas y las reglas de trabajo (llamar a
  `status` primero, no adivinar rutas ni nombres, cero diagnósticos antes de seguir).
- **`view`:** forma del fichero, valores, operadores, control, tipos portables, «los manejadores
  son libres», y una tabla **«Instead of… write…»** con los reflejos de JS que trae un LLM
  (`filter`, `toFixed`, `.length`, `new Date`, `||`).

Para que no mienta:

- Las secciones **generadas** salen de la lista blanca de los analizadores, los tipos portables y
  el catálogo de diagnósticos: si una SDD cambia la lista, la guía cambia sola.
- Las secciones **escritas** («Instead of…», «How to work») tienen **cada ejemplo como fixture**
  que pasa por `fudic_check` en los tests.
- Cada prohibido lleva su código: el LLM ve el mismo `FUD1145` en la guía y en el diagnóstico.

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

- **Contrato del backend en el repo** (§3, camino 1): propuesto, sin confirmar por Pedro.
- **Baseline de HTML/CSS:** el compilador no comprueba nada de baseline hoy. Sin un analizador
  (probablemente sobre `web-features`), el MCP solo puede contar la regla, no comprobarla.
- **Coste del pase tipado en remoto:** un programa TS en memoria por llamada; hay que medirlo.
- **Fake con estado o sin él:** si un `save` se ve después en un `search`.
- **Generadores que faltan en la CLI:** `.fudapi` y contrato del backend.
