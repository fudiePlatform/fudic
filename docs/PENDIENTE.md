# Pendiente de implementar

Orden propuesto a 2026-10-27. Todo está en `Listo` en `main`.

## Bugs

| # | Qué | Por qué en este orden |
|---|---|---|
| 1 | [BUG-52](sdd/bugs/BUG-52-tests-que-dependen-del-entorno.md) · [tareas](sdd/bugs/BUG-52-Task.md) | Los 3 tests de la CLI que fallan por los colores. Son 7 tareas y no toca nada más. |
| 2 | [BUG-53](sdd/bugs/BUG-53-precarga-sin-sw-a-medias.md) · [tareas](sdd/bugs/BUG-53-Task.md) | La precarga con el grafo completo. Toca el SW, igual que la 67 y la 70: mejor antes que en paralelo. |

## SDD

| # | SDD | Necesita | Nota |
|---|---|---|---|
| 3 | [67](sdd/SDD-67-binario-y-reglas-en-las-funciones.md) · binario y reglas en las funciones | — | La base de las llamadas. |
| 4 | [68](sdd/SDD-68-llamadas-sin-fontaneria.md) · `task` y repintar sin recargar | 67 | |
| 5 | [69](sdd/SDD-69-sesion-por-cookie.md) · sesión por cookie | 68 (solo el ejemplo) | No necesita la 67, solo cabeceras. Puede ir antes; entonces el ejemplo recarga al entrar y salir hasta la 68. |
| 6 | [70](sdd/SDD-70-await-en-la-vista.md) · `@await` en la vista | 67, 68 | La más grande (unas 45 tareas). |
| 7 | [71](sdd/SDD-71-pipes-del-usuario.md) · pipes del usuario | — | Tras la 70: las dos tocan la gramática del `.fudapi` y el emit. |
| 8 | [62](sdd/SDD-62-diagnosticos-que-dicen-la-verdad.md) · diagnósticos que dicen la verdad | — | Migra el `.md` de todos los códigos: mejor cuando ya existen los de 67–71. |
| 9 | [63](sdd/SDD-63-contrato-del-componente.md) · contrato del componente | — | En paralelo con la 64, o con la cadena 67–70 en otro worktree. |
| 9 | [64](sdd/SDD-64-resultados-legibles.md) · resultados legibles | — | Ídem. |
| 10 | [65](sdd/SDD-65-historial-de-cada-pieza.md) · historial de cada pieza | 63, 64 | |
| 11 | [66](sdd/SDD-66-generadores-que-faltan.md) · generadores que faltan | 67, 70 | La última: sus plantillas de `load` usan `later` y las reglas de los argumentos. Enmienda SDD-61 §3.9, como la 71. |

Después: las SDD del MCP ([IDEA-07](sdd/ideas/IDEA-07-mcp-de-fudic.md)).


## Notas de pedro

Deshabilitar diagnosticos
Async Validators
CSP configurable. Quitar todo lo de ligthouse
Baseline
Incluir FrontMater para definir props(componentes)
y estado inicial de la página(load) en fudapi y fudspec
Integrarlo con params y layout
propagar @fudic:result=@hecho y @fudic:error en formularios y que puedan
ser capturados desde la página en el host
Generar una hoja de estilos desde la cli->El user colabora
Exponer el fudic.json al igual que el sw.json en el mcp para que la IA sepa configurarlo.


## Analisis con sesión 

Las dos ideas encajan bien con lo que ya hay. Lo más importante que he encontrado:

Diagnósticos: de los 377 códigos, 344 son errores. Solo hay 31 warnings y 2 info, que son los que de verdad se pueden silenciar.
Validadores async: runs server + async ya existe, pero en el navegador la regla se emite con never: true (module.ts:114). O sea, alias-taken solo se comprueba al enviar el formulario, nunca mientras se escribe.
1. Silenciar o subir diagnósticos
Proyecto (fudic.json) — vale igual para lib y para app; cada uno manda solo sobre sus propios ficheros:


{
  "id": "basic",
  "kind": "app",
  "prefix": "app",
  "diagnostics": {
    "FUD1380": "off",
    "FUD1022": "error",
    "warnings": "error"
  }
}
FUD1380: off silencia "Event binding inside a loop" en todo el proyecto.
FUD1022: error hace que una traducción que falta rompa el build.
warnings: error sirve para CI: cualquier warning se trata como error.
Fichero .fud — el caso real ya existe en app-calendar-plain.fud:85-90, que pone un @click en un bucle a propósito, para compararlo con app-calendar:


@* fud-disable FUD1380: demo del coste de un listener por celda *@          ← todo el fichero

<div class="cell" @click=@pick($event, day)>
  @* fud-disable-next-line FUD1380: contraste con app-calendar *@         ← solo la línea siguiente
  <button @click=@pick($event, day)>✎</button>
En .fudapi es lo mismo con #: # fud-disable-next-line FUD0972.

Reglas que propongo:

Regla	Por qué
Un error no se puede bajar, solo subir	Si es error, la salida no es válida; silenciarlo esconde un build roto
El motivo detrás de : es obligatorio	Si no, en seis meses nadie sabe por qué está ahí
Una supresión que no silencia nada da un hint propio	Así no se queda basura cuando se arregla el código
Un código desconocido o retirado da un warning	Una errata como FUD1308 no puede silenciar en falso
La lib no impone nada a la app	La config de una lib solo cuenta al compilar sus ficheros
Esto no rompe la regla actual de que "la severidad pertenece al código" (types.ts:10-12). El código conserva su severidad por defecto, la política solo cambia cómo se informa, y explain muestra las dos.

Coste: una función applyPolicy(diags, policy, suppressions) en @fudic/diagnostics que usen compilador, vite y LSP por igual. Además, recoger los comentarios fud-disable con su span y 3 o 4 códigos nuevos. Y de propina para el LSP, un quick-fix: "Silenciar FUD1380 en esta línea".

2. Validadores async contra el servidor
Hoy:


rule alias-taken
  on field str
  runs server      ← en el navegador: never: true, se salta
  async
  fails alias-taken
Propuesta: un tercer valor de runs, que es lo único que cambia en el .fudapi:


rule alias-taken
  on field str
  runs remote          ← el servidor la ejecuta; el navegador la pregunta mientras escribes
  debounce 300         ← opcional, 300 por defecto
  fails alias-taken
El check no cambia (server/rules.ts):


aliasTaken.check(async (value) => !(await aliasInUse(value)));
El form tampoco cambia (forms/user.fudapi): alias-taken "Ese alias ya está cogido." sigue igual.

En la vista solo hace falta una señal nueva:


<input :=@form.alias>
@if (form.alias.pending()) { <small>Comprobando…</small> }
<button disabled=@(!form.valid())>Guardar</button>   @* pendiente = no válido *@
Qué genera el plugin:


POST /_fudic/rule/rules/people/alias-taken   { value: "pedro", root?: {...} }
  → 200 { ok: true }
  → 200 { ok: false, fails: "alias-taken" }
En el lado del navegador, el stub es un asyncValidator que llama a fetch. Hace esto:

debounce, para no mandar una petición por tecla;
AbortController: si se escribe otra tecla, la petición anterior se cancela y su respuesta no pisa a la nueva;
caché por valor: volver a "pedro" no repite la llamada;
su veredicto alimenta verdicts.ts, que ya trata un resultado pendiente como no válido.
Ya tenemos: declarar rule … async, asyncValidator, el veredicto pendiente en valid(), los endpoints de función /_fudic/fn/... con su stub, y que el check del servidor no llegue al bundle.

Falta:

runs remote y debounce en el parser de extensions.ts:49.
El emit del stub en navegador en lugar de never: true.
La ruta /_fudic/rule/... en el servidor.
La señal pending() en el control, que hoy no existe en la API pública.
Decisiones abiertas:

Si falla la red, propongo que no se marque como inválido sino como desconocido: no se muestra error y el submit lo vuelve a comprobar en el servidor. La validación remota es comodidad, nunca la autoridad; el submit sigue ejecutando todo en el servidor.
Seguridad. El endpoint es un oráculo: si responde "¿existe este email?", sirve para enumerar usuarios. Propongo que runs remote acepte use de middleware, igual que un fn, para poder poner use auth o un rate-limit:

rule email-taken
  on field str
  runs remote
  use rate-limit
  fails email-taken
  
root. ¿Se manda el form entero o solo el valor? Propongo solo el valor, salvo que la regla declare de qué campos depende.
Coste relativo: la 1 es pequeña y aislada, buena para un SDD corto. La 2 es mediana: casi todo es juntar piezas existentes, y lo que lleva trabajo de verdad es el endpoint y decidir lo del oráculo y el middleware.