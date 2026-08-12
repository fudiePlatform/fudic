# IDEA-01 — Banco de trabajo de componentes (playground + sesión dirigida por criterios)

> **Estado:** `Idea` — no es un SDD. No tiene interfaz pública, ni criterios de aceptación,
> ni rango de diagnósticos. Es la captura de una dirección de producto acordada el
> **2026-08-12** para que no se pierda; cuando se aborde se troceará en SDDs reales.
> **Paquetes implicados (previsión):** `@fudic/vscode` · `@fudic/compiler` (superficie de
> AST/emit) · paquetes nuevos para el MCP y el bridge.
> **Depende de:** SDD-15 (mapas de página, `data-fud-id`) · SDD-23/24 (emisor TS virtual,
> language server) · SDD-19 (dev server).
> **No bloquea nada.** Se aborda cuando el framework esté cerrado.

---

## 1. Contexto y objetivo

fudic llega tarde a un mercado con frameworks establecidos. Lo que aporta el compilador
—DSD puro, cero JS en nivel 1, SSR— es sólido pero no es, por sí solo, una razón de
migración. Esta idea busca la **herramienta diferenciadora**: el sitio donde escribir un
componente fudic es mejor que escribirlo en otro sitio.

La pieza es un **banco de trabajo**: la extensión abre cada componente en el navegador,
vivo, y una sesión dirigida por los criterios de aceptación de su SDD deja grabada la
evidencia de que el componente hace lo que dice hacer. De esa grabación —después, no
antes— salen las pruebas.

---

## 2. El bucle invertido

Es el corazón de la idea y conviene enunciarlo antes que la arquitectura, porque la
arquitectura solo se justifica por él.

**El proceso está invertido: los tests no se escriben antes ni durante, se derivan después
de una sesión grabada.**

1. Los criterios de aceptación se escriben **simples y automatizables**. El MCP de fudic
   define la forma de escribirlos.
2. Se extraen de la SDD y aparecen como **checklist** en el panel de chat del navegador.
3. El developer hace click en un criterio → el agente devuelve el código Playwright que lo
   ejercita.
4. El código se ejecuta sobre la página viva y el developer **ve** lo que pasa.
5. Marca el criterio como realizado.
6. Se guarda el criterio junto al código ejecutado y al estado observado. **Esto es lo que
   se quiere capturar.**

Con la sesión completa grabada, una **sesión aparte** de Claude escribe las pruebas y las
corre. Componente terminado.

No es un chat abierto: va **dirigido** por la checklist, de forma secuencial.

### Por qué la inversión importa

Casi todos los productos de "la IA te escribe los tests" fracasan en el mismo punto: el
modelo tiene que **inventar la expectativa**, y ahí es donde falla o donde escribe un test
que pasa siempre. Este bucle se la quita y se la da al humano, reducida a un click.

El reparto queda donde debe:

| Quién | Qué |
|---|---|
| El agente | Pilotar el componente, serializar el estado, transcribir la sesión a specs |
| El developer | Juzgar si lo que ve está bien — lo único que no se puede delegar |

Además, el vínculo criterio ↔ código ejecutable sale como **subproducto de una sesión que
el developer iba a hacer igual** (abrir el componente y trastearlo). Coste marginal casi
cero: eso es lo que hace que una herramienta se use en lugar de admirarse.

---

## 3. Arquitectura — tres piezas

Ordenadas **por riesgo**, no por dependencia. Cada una vale por separado.

### 3.1 Playground en el navegador (riesgo bajo, trabajo conocido)

La extensión abre cada componente en el navegador:

- **Panel izquierdo** — el fuente del componente en **Monaco**, con pestañas para todas sus
  dependencias.
- **Panel derecho** — `view` · `AST` · `JS cliente` · `JS servidor`.

Valor independiente del resto: es útil el día uno, y obliga a que el compilador exponga
AST y emit por una API limpia — trabajo que hace falta igualmente.

### 3.2 MCP de fudic + Playwright (riesgo alto — la pieza difícil)

Playwright abre la página y **la deja viva**; el agente la pilota a través del MCP.

El MCP debe exponer **herramientas que actúan**, no documentación. Si solo documenta "cómo
se hace cada cosa", el agente escribe a ciegas y comprueba por captura de pantalla. Si
actúa, cada llamada devuelve **estado estructurado** y el agente itera solo:

- `open_component(path)` · `set_prop` · `dispatch` · `query(selector)` → subárbol del
  shadow serializado
- `get_ast(span)` · `get_emit(target)` → los mismos artefactos que pintan los paneles
- `run_script(code)` como escape hatch para la cola larga

Playwright ya atraviesa shadow roots abiertos en sus selectores, así que la parte DOM es
barata. Lo difícil **no es Playwright: es decidir el vocabulario de herramientas.**
Demasiado finas → diez llamadas por criterio; demasiado gruesas → no cubren el caso raro.

Es pilotable desde CLI, headless, **sin ninguna UI**. Por eso conviene atacarla antes que
el chat.

### 3.3 Panel dirigido en el navegador (riesgo bajo si 3.1 y 3.2 funcionan)

La checklist de criterios, el código generado, el resultado y el botón de aprobar. Cablear
esto cuando las otras dos piezas existan es casi trivial.

---

## 4. El artefacto que se captura

Es la salida real del sistema y merece diseño propio: todo lo demás es andamiaje para
producirlo.

### 4.1 Guardar (criterio, código) no basta

El paso 4 —*el developer ve lo que ha pasado*— ocurre en su cabeza y **no sobrevive a la
grabación**. La sesión que después escribe los tests recibiría la *acción* sin la
*expectativa*: sabría qué se hizo, no qué debía salir.

Hay que capturar también el **estado observado en el instante del click del paso 5**:
shadow DOM serializado, props, eventos emitidos, y opcionalmente una captura de pantalla.

El click no marca "hecho": marca **"esto que ves es lo correcto"**. Esa firma es lo que
convierte una observación en aserción. Con ella, el test posterior se escribe casi solo —
la aserción **es** el snapshot aprobado.

### 4.2 Consecuencias de diseño

- **El código generado termina en volcado, no en `expect`.** Llevar el componente a un
  estado y dumpear su superficie observable. Es un problema mucho más fácil de generar y no
  deja margen para que el modelo invente la expectativa.
- **Cada criterio necesita un flag de aislamiento.** Si se marcan en secuencia sobre la
  misma página viva, el criterio 5 puede depender del estado que dejó el 4 — legítimo, y a
  veces deseable porque refleja un recorrido de usuario. Pero la grabación debe decirlo, o
  la sesión posterior no sabrá si escribir N tests independientes o uno con N pasos.
- **Un criterio que falla no es un test: es un bug.** Si el developer ve un comportamiento
  incorrecto, eso no se marca como realizado — se convierte en un `BUG-NN`. Conviene decidir
  si esos intentos rechazados también se graban (probablemente sí: son el historial de por
  qué el componente acabó como acabó).

### 4.3 Forma tentativa del registro

```jsonc
{
  "component": "src/components/date-picker.fud",
  "criterion": { "id": "SDD-42-§6.3", "text": "…" },
  "isolation": "fresh" ,        // o "continues" — ¿parte de página limpia?
  "code": "…",                   // el Playwright que se ejecutó, tal cual
  "observed": {                  // el estado en el instante de la aprobación
    "shadow": "…",               // subárbol serializado
    "props": { },
    "events": [ ],
    "screenshot": "…"            // opcional
  },
  "approvedAt": "…"
}
```

---

## 5. Decisiones ya tomadas

Tres correcciones acordadas en la conversación del 2026-08-12:

1. **El canal agente ↔ navegador no es stdout.** Claude Code no lee stdin arbitrario a
   mitad de sesión. El canal real es el **Agent SDK en modo streaming JSON**
   (`--input-format stream-json --output-format stream-json`, o el SDK de TS): bidireccional,
   sesión persistente. El bridge WS habla con eso, no con una consola. Efecto lateral bueno:
   el agente vive en el proceso del bridge, no en la terminal, y el panel del navegador es
   su UI natural.
2. **El MCP expone herramientas que actúan, no documentación** (§3.2).
3. **El código generado captura, no asevera** (§4.2).

Menor pero real: mantener el navegador vivo con `browserType.launchServer` + `connect`, no
con una sesión pegada al runner — así se puede reiniciar el proceso sin perder la página.

---

## 6. Por qué es diferenciador

- **El playground, por sí solo, no lo es.** Svelte REPL, el SFC playground de Vue y
  astexplorer ya existen. Montar uno es trabajo de un fin de semana.
- **Lo que no es copiable es la trazabilidad.** `data-fud-id` y los mapas de página de
  SDD-15 atan el **span del `.fud`** al **nodo del DOM**: una aserción que falla señala la
  línea del fuente, no un selector CSS. Eso exige que **el compilador lo emita**, y no se le
  retrofitea al tooling de React o Vue sin rehacer su compilador.
- **Ataca un problema real:** los criterios de aceptación de una spec se pudren porque nada
  los ata a código ejecutable. Aquí el vínculo se produce solo.

Llegar el último con algo que los demás no pueden añadir sin rehacer su compilador es buena
posición. **La narrativa de producto va aquí, no en "tiene chat".**

---

## 7. Riesgos y reservas

- **No paga en componentes tontos.** Para un botón, el bucle es más lento que escribir el
  test a mano. Rinde en estado real, async, slots y eventos. Cuidado con demostrarlo con un
  contador: se vería como un juguete caro.
- **Presupone equipos que escriben SDDs con criterios automatizables.** No es un defecto,
  pero define a quién se le vende: encanta a quien ya compra la disciplina y resulta
  invisible al resto. No es *la* razón para adoptar fudic; es la razón para quedarse.
- **Latencia y coste por vuelta.** Segundos y tokens por iteración: sirve para *redactar* la
  evidencia, no para un watch loop. El watch loop lo corre Playwright sobre los specs ya
  materializados, sin IA de por medio.
- **Superficie de ejecución.** `run_script` evalúa código del modelo en la máquina del
  developer: confinarlo al proceso worker de Playwright, sin fs ni red.
- **Es un desvío grande.** Son tres productos y el tercero depende de los otros dos. Se
  aborda con el framework cerrado, no antes.

---

## 8. Troceado propuesto

1. **Playground sin IA** — Monaco + los cuatro paneles. Valida que el compilador expone
   AST/emit por API limpia.
2. **MCP + Playwright headless** — pilotable desde CLI, sin UI. Aquí se descubre si el
   vocabulario de herramientas es el correcto, que es la decisión difícil.
3. **Formato de la sesión grabada** — el esquema de §4.3 y el generador de specs a partir de
   él. Se puede probar con sesiones escritas a mano, sin navegador.
4. **El panel dirigido** — la checklist y el bucle completo.

Empezar por el 4 es la forma segura de fallar. El orden 2 → 1 también es defendible: el MCP
es el riesgo técnico, el playground es trabajo conocido.
