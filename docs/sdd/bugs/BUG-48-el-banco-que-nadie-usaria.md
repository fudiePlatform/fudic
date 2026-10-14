# BUG-48 · El banco que nadie usaría: lento al guardar, frágil, solo en Chrome y solo con ventana

> **Estado:** `Listo` (2026-10-14) — causas confirmadas sobre el código el 2026-10-14, midiendo
> `app-card` de `examples/basic` con el binario, con Playwright sobre el shell y con un Vite
> aislado.
> **Corrige:** [SDD-32](../SDD-32-banco-de-trabajo.md) §3.1 (el binario), §4.2 (el arranque),
> §4.5 (Vite dentro del banco), §4.6 (el motor), §4.7 (volver a ejecutar), §4.8 (el shell), §4.9
> (el protocolo), §4.10 (VS Code), §4.11 y su catálogo, §5 y §7 (reabre «varias ventanas sobre
> el mismo componente», «el WebSocket de un sentido» y «ejecutar solo los afectados»).
> **Paquetes:** `@fudic/workbench` · `fudic-vscode` (`packages/vscode`) · `@fudic/diagnostics` ·
> `examples/basic`
> **Rango:** el de SDD-32, `FUD0970`–`FUD0989`. Cambia el texto de `FUD0975`; nacen `FUD0976`
> y `FUD0977` (añadido al implementar: `open` de un componente de otro proyecto, §4.4).
> **Rama sugerida:** `bug/48-banco-usable`, desde `main`.

---

## 1. Contexto y síntoma

El banco funciona —los tres criterios de `app-card` salen en verde—, pero nadie lo usaría. Su
valor está en las fases tempranas, escribir y guardar, y es justo ahí donde falla.

Medido el 2026-10-14 sobre `app-card` (tres criterios, todos con `props`):

1. **Guardar el `.fud` cuesta 10 s.** Del guardado al mensaje `running` pasan 10 011 ms, siempre.
   Ejecutar los tres criterios cuesta después unos 0,8 s. Mientras tanto, los iframes enseñan la
   versión vieja.
2. **Guardar la `.fudspec` o la fixture recarga cada iframe dos veces**: una al rehacer todas las
   tarjetas y otra al llegar cada resultado. Parpadeo, se pierde el scroll, y los iframes compiten
   con el Chrome que mide por el mismo Vite.
3. **Dos instancias del mismo componente se rompen entre sí.** Con la pestaña de VS Code abierta y
   el binario lanzado a mano sobre `app-card`, los iframes de la primera pasan a 404: la segunda
   vació la carpeta al arrancar y la borró al cerrar.
4. **Cada apertura tarda ~3,9 s** hasta la línea JSON, y cada componente abierto es otro Vite y
   otro Chrome. De esos 3,9 s, ~550 ms son el typecheck del proyecto que el plugin arranca y que
   el banco no usa (Vite aislado: 604 ms con él, 61 ms sin él). Ese typecheck sigue después
   corriendo en segundo plano mientras Chrome mide.
5. **Avisa de algo falso al arrancar**: `FUD0742`, «this project defines no component», en un
   proyecto que sí los tiene. Las hojas sí llegan (`data-fud-adopt="theme app-card"` en la
   página), así que el aviso es ruido.
6. **Sin Chrome no hay banco.** Solo prueba `channel: 'chrome'`. En un Windows sin Chrome, con
   Edge instalado de serie, el banco no arranca.
7. **No se puede ejecutar sin abrir una ventana.** No existe un `pnpm test` de las `.fudspec`, ni
   una forma de ejecutarlas en CI.
8. **La página dice poco y ocupa mucho.** Cada tarjeta lleva un iframe de 180 px para un componente
   de 20 px. El iframe enseña el estado **inicial**, no el medido: en
   `destacada-al-cambiar-variante` el `when` cambia `variant` y el iframe sigue enseñando la
   tarjeta de antes. No hay resumen, ni orden, ni forma de repetir un criterio, ni de ejecutar
   solo los rojos, ni de saltar de una tarjeta a su línea. `given route /blog` sale siempre como
   «ignored: …».
9. **El veredicto y la imagen salen de navegadores distintos.** Abierto el shell en Firefox, el
   verde lo dio el Chrome sin ventana y lo que se ve lo pinta Firefox; nada lo avisa.
10. **El shell no puede pedir nada.** El WebSocket solo habla servidor → shell
    ([bench-server.ts:68](../../../packages/workbench/src/bench-server.ts#L68) descarta lo que
    llega), así que no puede haber botones.

## 2. Causa raíz

### 2.1. Se espera un `full-reload` que un componente sin JS de cliente no produce

[rerun.ts:53](../../../packages/workbench/src/rerun.ts#L53) arma un temporizador de
[10 s](../../../packages/workbench/src/rerun.ts#L47) al cambiar un `.fud`, y solo lo adelanta el
primer `full-reload` que Vite mande. `app-card` no se hidrata: no está en el grafo del cliente y
Vite no tiene nada que recargar. El temporizador, que SDD-32 §4.7 pensó como red, es el camino
normal de todo componente N1/N2.

Comprobado con un plugin de prueba: Vite llama a `hotUpdate` en los entornos `client` y `ssr`
**34 ms** después de escribir `app-card.fud`, los dos con `modules: 0`. Esa es la señal de que
Vite ya procesó el cambio, llegue o no un `full-reload`.

**Alcance.** El mismo temporizador deja sin refrescar los iframes del shell: escuchan el HMR de
Vite y no les llega nada.

### 2.2. Las tarjetas se rehacen enteras y cada resultado recarga su iframe

[shell.ts:62](../../../packages/workbench/src/shell.ts#L62) vacía la lista en cada `session` y
crea iframes nuevos ([shell.ts:80](../../../packages/workbench/src/shell.ts#L80)), y
[shell.ts:117](../../../packages/workbench/src/shell.ts#L117) vuelve a asignar `src` con cada
`result`. Un iframe por criterio es además una página completa, con su propio WebSocket de HMR.

### 2.3. La carpeta de un banco es del tag, no del proceso

[pages.ts:60](../../../packages/workbench/src/pages.ts#L60) la llama
`node_modules/.fudic-bench/<tag>`. [open.ts:33](../../../packages/workbench/src/open.ts#L33) la
vacía al arrancar y [open.ts:42](../../../packages/workbench/src/open.ts#L42) la borra al cerrar.
SDD-32 §7 lo dejó escrito como fuera de alcance; la evidencia de hoy es que basta el binario a
mano junto a la pestaña para romperlo.

**Alcance.** Un proceso que muere sin cerrar (matado, o con el editor colgado) deja su carpeta
para siempre.

### 2.4. Un proceso por componente, y el plugin con su typecheck

[workbench.ts:113](../../../packages/vscode/src/workbench.ts#L113) lanza un proceso por
componente, y cada proceso arranca su Vite y su Chrome
([open.ts:34](../../../packages/workbench/src/open.ts#L34),
[browser.ts:59](../../../packages/workbench/src/browser.ts#L59)).
[vite.ts:24](../../../packages/workbench/src/vite.ts#L24) llama a `fudic({ routesDir })` sin
`liveCheck: false`, así que el plugin importa `@fudic/typecheck`, comprueba el proyecto entero al
arrancar y vuelve a comprobar en cada guardado. El banco tiene el overlay apagado: nadie lee ese
resultado. Y cuando el typecheck se limpia manda un `full-reload`, que el banco toma como «el
`.fud` está listo».

### 2.5. Vite arranca antes de que existan las páginas

[open.ts:33-34](../../../packages/workbench/src/open.ts#L33-L34) vacía la carpeta y arranca Vite;
las páginas se escriben después, en `load()`
([open.ts:49](../../../packages/workbench/src/open.ts#L49)). El plugin decide `FUD0742` al
arrancar, con `routesDir` vacío: no encuentra componentes porque todavía no hay rutas que los
enlacen.

### 2.6. Un solo navegador, escrito a fuego

[browser.ts:59](../../../packages/workbench/src/browser.ts#L59): `channel: 'chrome'`. `Launcher`
admite cualquier `channel`, pero nadie le pasa otro.

### 2.7. El motor va en fila, y solo existe detrás de un servidor con shell

[open.ts:63](../../../packages/workbench/src/open.ts#L63) ejecuta los criterios uno tras otro.
`openWorkbench` es la única entrada al motor y siempre levanta el shell y el WebSocket; no hay una
entrada «ejecuta y sal».

### 2.8. El WebSocket no lee

[ws.ts](../../../packages/workbench/src/ws.ts) solo escribe tramas, y el servidor descarta lo que
llega ([bench-server.ts:68](../../../packages/workbench/src/bench-server.ts#L68)). Tampoco contesta
al cierre del navegador, que es parte del protocolo (RFC 6455 §5.5.1).

## 3. Interfaz pública

### 3.1. El binario

```
fudic-workbench <file> [--port <n>] [--keep] [--browser <b>] [--workers <n>]
fudic-workbench run [<path>…] [--browser <b>] [--workers <n>] [--json]
```

- `<b>`: `auto` (por defecto), `chrome`, `msedge`, `chromium`, `firefox`, `webkit`.
- `--workers`: criterios a la vez; por defecto 4.
- **Modo banco** (sin `run`): como hoy, la primera línea es
  `{"url","tag","component","criteria"}` o `{"error":…}`. Después, el proceso **lee órdenes** por
  `stdin`, una por línea JSON, y **escribe eventos** por `stdout`, uno por línea JSON (§3.3).
  Cerrar `stdin` sigue cerrándolo todo.
- **Modo `run`**: ejecuta y sale (§4.7). Sin `<path>`, todas las `.fudspec` del proyecto. Un
  `<path>` puede ser un `.fud`, una `.fudspec` o una carpeta.

La API: `openWorkbench(file, { port, keep, browser, workers })` como hoy, y nace
`runSpecs(paths, { browser, workers, root })` → `Promise<RunSummary>`, con
`RunSummary = { pass, fail, error, results: readonly ResultMessage[] }`.

### 3.2. El protocolo, `v: 2`

Los mensajes de hoy pasan a `v: 2`, y todo mensaje de un componente lleva su `tag`: un proceso
sirve ya varios componentes (§4.4).

```ts
interface SessionMessage {
  readonly v: 2; readonly type: 'session'; readonly tag: string;
  readonly spec: string | null;                     // ruta de la .fudspec
  readonly browser?: BrowserName;                   // lo pone el banco al publicar (§4.5)
  readonly diagnostics: readonly WireDiagnostic[];
  readonly criteria: readonly {
    readonly id: string; readonly route: string;
    readonly line: number;                          // 1-based, la línea `criterion`
    readonly steps: readonly {
      readonly block: BlockKind; readonly text: string;
      readonly file: string | null;                 // el módulo del término
    }[];
  }[];
}
interface RunningMessage {
  readonly v: 2; readonly type: 'running'; readonly tag: string;
  readonly ids: readonly string[];
  readonly trigger: { readonly file: string | null; readonly at: number };  // null: a mano
}
interface ResultMessage {
  readonly v: 2; readonly type: 'result'; readonly tag: string; readonly id: string;
  readonly verdict: Verdict; readonly ms: number;
  readonly was?: Verdict;                           // el veredicto anterior, si lo había
  readonly steps: readonly StepResult[];            // StepPassed gana `ignored?: true`
  readonly shots: { readonly before?: string; readonly after?: string };  // URLs
  readonly marks: readonly { readonly step: number; readonly ref: string; readonly box: Box }[];
  readonly pageErrors: readonly string[];
  readonly error?: string;
}
interface StateMessage {
  readonly v: 2; readonly type: 'state'; readonly tag: string;
  readonly paused: boolean; readonly pinned: string | null; readonly pending: number;
}
interface CancelledMessage { readonly v: 2; readonly type: 'cancelled'; readonly tag: string; readonly ids: readonly string[] }
interface ProblemMessage { readonly v: 2; readonly type: 'problem'; readonly message: string }
```

`Box` es `{ x, y, width, height }` en píxeles de la captura `after`.

### 3.3. Las órdenes, por el WebSocket y por `stdin`

```ts
type Command =
  | { readonly v: 2; readonly type: 'open'; readonly file: string }      // solo stdin
  | { readonly v: 2; readonly type: 'close'; readonly tag: string }      // solo stdin
  | { readonly v: 2; readonly type: 'run'; readonly tag: string; readonly ids?: readonly string[]; readonly failing?: true }
  | { readonly v: 2; readonly type: 'pin'; readonly tag: string; readonly id: string | null }
  | { readonly v: 2; readonly type: 'pause'; readonly tag: string; readonly paused: boolean }
  | { readonly v: 2; readonly type: 'cancel'; readonly tag: string };
```

`open` contesta por `stdout` con `{"v":2,"type":"opened","url","tag","component","criteria"}` o
`{"v":2,"type":"error","file","error":{code,message}}`. Una orden que no se entiende se ignora.

### 3.4. El contrato de los términos

Un término puede devolver `evidence: { expected, actual }`. El shell y `run` lo pintan como
esperado frente a obtenido. Cualquier otra evidencia se pinta como hoy.

### 3.5. VS Code

Dos ajustes nuevos: `fudic.workbench.browser` (`"auto"` por defecto) y
`fudic.workbench.workers` (`4`). El comando `fudic.runCriterion` lo lanza el CodeLens (§4.9).

## 4. Comportamiento corregido

### 4.1. Guardar el `.fud` ejecuta en cuanto Vite lo procesó

El banco añade a Vite un plugin propio con `hotUpdate`. Al cambiar un `.fud`, la ejecución
empieza cuando Vite ha llamado a `hotUpdate` para ese fichero en **todos** sus entornos. Ya no hay
temporizador ni se intercepta `hot.send`. Un `full-reload` que no viene de un guardado (el de un
typecheck) no ejecuta nada.

### 4.2. Vite arranca sin typecheck y con las páginas ya escritas

- `fudic({ routesDir, liveCheck: false })`. Los errores de tipos los marcan el editor y
  `pnpm build`, como siempre; el banco no los repite.
- La carpeta del proceso se crea y recibe, antes de arrancar Vite, la página desnuda de cada
  componente abierto: `routes/<tag>.fud`, servida en `/<tag>`. Los criterios viven en
  `routes/<tag>/<slug>.fud` (`/<tag>/<slug>`), así que la desnuda no puede chocar con ningún slug
  (un slug es una palabra cualquiera, `_` incluido; corregido al implementar). Con eso el plugin
  ve el componente desde el primer momento y `FUD0742` solo sale cuando es verdad.
- Vite avisa de cada fichero procesado por `hotUpdate` (§4.1), y es esa misma señal —no el
  watcher— la que clasifica el cambio: `.fud`, `.fudspec`, fixture o término.

### 4.3. Una carpeta por proceso, y la basura de otros se barre

La carpeta pasa a `node_modules/.fudic-bench/<pid>/`, con `routes/<tag>.fud`,
`routes/<tag>/<slug>.fud` y `components/` dentro. Al arrancar, el proceso borra las carpetas
hermanas cuyo `pid` ya no vive, y las que no son un `pid` (la forma por tag de antes).
Dos procesos sobre el mismo componente no se tocan. `--keep` deja la suya como hoy.

### 4.4. Un proceso por proyecto, varios componentes

Un proceso es un proyecto: un Vite, un navegador, un servidor. Cada componente abierto tiene su
shell en `/__bench/<tag>/`, sus páginas en `/<tag>/<slug>` y su sesión. `open` añade un
componente (si ya está, contesta lo mismo sin recargar nada); `close` lo quita, borra sus páginas
y deja de vigilar sus ficheros. Un componente cuya raíz de proyecto no es la del proceso se
rechaza con `FUD0977`. Las páginas anfitrionas de props `Signal` pasan a
`components/<tag>/bench-host-<tag>-<slug>.fud`, porque un mismo Vite compila las de todos. El modo banco del binario abre el `<file>` de la línea de órdenes
como primer componente. Con eso, abrir el segundo componente de un proyecto no arranca nada.

Un guardado solo afecta a los componentes cuya sesión lo lee (su `.fud`, lo que enlaza, su
`.fudspec`, su fixture, un término que usan).

### 4.5. El navegador se elige

Con `auto` se prueba, en orden, `chrome`, `msedge` y el `chromium` de Playwright. Con un nombre
se prueba solo ese. Si ninguno arranca, `FUD0975` dice cuáles se probaron y la orden que instala
el de Playwright (`npx playwright-core install chromium`, o el que se pidió). El navegador elegido
se dice en la línea JSON y en la cabecera del shell.

### 4.6. El motor

- **En paralelo**, hasta `workers` criterios a la vez, cada uno en su contexto. Los resultados se
  publican según terminan.
- **Cargar la página no es una llamada de un término** (añadido al implementar): tiene su propio
  límite, 30 s, y no los 5 s de `ctx`. En frío, con varios criterios a la vez y la máquina
  ocupada, la primera carga superaba los 5 s y el criterio salía en `error` sin decir nada del
  componente.
- **Primero los que fallaban.** Una ejecución por guardado empieza por los criterios cuyo último
  veredicto no fue `pass`.
- **Capturas.** Al terminar un criterio, el navegador que mide fotografía el elemento montado
  (`after`). Si el criterio tiene `when`, también justo antes del primero (`before`). Las sirve el
  servidor en `/__bench/<tag>/shot/<id>/<n>-<before|after>.png` (corregido al implementar: dentro
  de la ruta del componente), con `n` un contador del proceso. Solo se guarda en memoria la última
  de cada criterio y tipo. Un elemento sin caja, o una captura que falla, no da captura y no
  cambia el veredicto.
- **Marcas.** Cada `locate` que resuelve a un elemento deja su caja, relativa a la captura
  `after`, asociada al paso.
- **`goto` ignorado** deja el paso con `ignored: true` y sin evidencia, en vez del texto de hoy.
- **`was`**: el veredicto anterior del criterio en este proceso.
- **Fijar, pausar, cancelar.** Con un criterio fijado, un guardado ejecuta solo ese. En pausa, un
  guardado no ejecuta y suma a `pending`; al reanudar, si hay pendientes, ejecuta una vez.
  `cancel` cierra las páginas en curso, no lanza las que faltan y manda `cancelled` con sus ids;
  esas tarjetas vuelven a su último resultado.
- `run` con `failing` ejecuta los que no están en `pass`; con `ids`, esos.

### 4.7. `fudic-workbench run`

Levanta el mismo servidor y el mismo motor, sin shell ni WebSocket, ejecuta todas las
`.fudspec` encontradas y sale.

- Salida legible, un bloque por componente:

  ```
  app-card
    ✓ altura-minima                    252 ms
    ✗ titulo-largo-visible             268 ms
        then app-card says "A title"
          expected  A title
          actual    A tilte long enough…
    ! destacada-al-cambiar-variante    error: role:link/"Featured" matches 2 elements
  3 criteria · 1 pass · 1 fail · 1 error · 1.2 s · chrome
  ```

- Con `--json`, en cambio, cada mensaje del protocolo (§3.2) en una línea, y al final
  `{"v":2,"type":"summary",pass,fail,error,ms}`.
- Una `.fudspec` con errores imprime sus diagnósticos y cuenta como `error`. Un `.fud` sin
  `.fudspec` se salta con `FUD0972`.
- Código de salida `0` solo si todo está en `pass`; `1` en cualquier otro caso, incluido no
  encontrar nada que ejecutar (`FUD0976`).
- `examples/basic` gana el script `"test:spec": "fudic-workbench run"`.

### 4.8. El shell

- **Cabecera**: el tag, el resumen («2/3 pass · 0,8 s · after saving app-card.fud 16:12:05 ·
  chrome»), los botones *Run all* (`r`), *Run failing* (`f`), *Pause* (`p`) y *Cancel* (`Esc`), y
  el estado de la conexión.
- **Tarjetas**: rojas arriba, en el orden de la `.fudspec` dentro de cada grupo. Una verde se
  pliega a una línea y se despliega al pulsarla. Cada tarjeta lleva veredicto, ms, la marca
  «was pass» cuando empeora, sus pasos (el que falló desplegado, con esperado frente a obtenido
  si la evidencia lo trae; un paso `ignored` atenuado y sin evidencia), las capturas `before` y
  `after` con las cajas de las marcas encima, y los botones *Run* (▶), *Pin* y *Live*.
- **Sin un iframe por tarjeta.** *Live* abre **un** panel con el iframe del criterio elegido,
  vivo, que se recarga solo cuando llega un resultado de ese criterio. Cerrado por defecto.
- **Las capturas a su tamaño real**, con scroll horizontal si el componente es ancho: encogidas
  a la tarjeta no se leían (corregido al implementar).
- **Un shell que se abre tarde** recibe también el último `running`, para decir cuándo y por qué
  se ejecutó (añadido al implementar).
- **Al recibir `session`** las tarjetas se actualizan en su sitio: se conserva el scroll y lo
  desplegado, se añaden las nuevas y se quitan las que ya no están.
- **Teclado**: `j`/`k` mueven el foco entre tarjetas, `Enter` despliega, `l` abre *Live*.
- **Tema**: claro u oscuro según el sistema, o el que diga `?theme=`; sin cajas blancas fijas.
- **Ir al fichero**: el título de una tarjeta abre la `.fudspec` en su línea; un paso, el módulo
  de su término; un diagnóstico, su fichero y línea. Dentro de VS Code se pide al editor (§4.9);
  en un navegador es un enlace `vscode://file/<ruta>:<línea>`.

### 4.9. VS Code

- **Un proceso por proyecto** (la carpeta donde se encontró el binario). Ctrl+K V sobre otro
  componente del mismo proyecto manda `open` y abre su pestaña. Cerrar una pestaña manda `close`;
  cerrar la última cierra `stdin`.
- **La pestaña** pasa `?theme=` según el tema de VS Code y avisa al shell cuando cambia. Reenvía
  al editor las peticiones de abrir fichero del shell.
- **En la `.fudspec`**, con el banco abierto:
  - un icono en el margen de cada línea `criterion`: verde, rojo o en curso;
  - un CodeLens «▶ Run» encima de cada criterio, y «▶ Run failing» encima del primero. Sin banco
    abierto, el CodeLens lo abre y después ejecuta;
  - cada criterio en `fail` o `error`, en el panel *Problems*, en su línea, con el primer paso que
    falló y su evidencia. Se quita al pasar a `pass` y al cerrar el banco.
- **Barra de estado**: `app-card 2/3` del componente del editor activo; al pulsarla, revela su
  pestaña.
- Los ajustes `fudic.workbench.browser` y `fudic.workbench.workers` llegan al proceso como
  `--browser` y `--workers`.

### 4.10. El WebSocket lee

`ws.ts` gana un lector de tramas del cliente: enmascaradas, de texto y sin fragmentar; `close`
(se contesta con `close` y se cierra el socket); `ping` (se contesta `pong`). Cualquier otra cosa
cierra con `1003`. El servidor pasa cada orden válida al mismo controlador que atiende `stdin`.
Sigue sin depender de Vite ni de ninguna librería.

## 5. Invariantes

- Guardar un fichero que una sesión lee ejecuta sus criterios sin esperar a ningún temporizador.
- Dos procesos del banco, sobre el mismo proyecto o el mismo componente, no se pisan ficheros.
- El veredicto y la imagen de una tarjeta salen del mismo navegador y de la misma ejecución.
- La página de un criterio sigue sin llevar nada del banco (SDD-32 §5).
- `run` y el modo banco ejecutan con el mismo motor: un criterio no puede pasar en uno y fallar
  en el otro por el camino.
- El transporte del banco es suyo: ni el shell ni las órdenes dependen del HMR de Vite.

## 6. Criterios de aceptación

Cada uno con un test que falle antes del cambio.

1. **Guardar el `.fud`.** Con un componente sin JS de cliente, escribir su `.fud` produce
   `running` sin ningún temporizador por medio: el test usa un Vite real y comprueba que el plugin
   del banco dispara la ejecución desde `hotUpdate`. Un `full-reload` sin cambio de fichero no
   ejecuta.
2. **Sin typecheck.** El Vite del banco se crea con `liveCheck: false`.
3. **Sin `FUD0742` falso.** Abrir `app-card` de `examples/basic` no escribe `FUD0742`.
4. **Dos procesos.** Con dos bancos sobre el mismo componente, cerrar uno deja las páginas del
   otro en 200. Una carpeta de un `pid` muerto se borra al arrancar otro proceso.
5. **Un proceso, dos componentes.** `open` de un segundo componente contesta `opened` sin
   arrancar otro Vite ni otro navegador; sus páginas viven en `/<tag>/<slug>`, y un guardado de su
   `.fud` no ejecuta los criterios del primero. `close` quita sus páginas.
6. **Navegador.** Con un `Launcher` que falla en `chrome`, `auto` arranca `msedge`; si fallan
   todos, `FUD0975` nombra los tres probados y la orden de instalación. `--browser firefox` prueba
   solo `firefox`.
7. **Paralelo y orden.** Con `workers: 2` y cuatro criterios, hay dos páginas abiertas a la vez
   como máximo. Un criterio que fallaba se lanza antes que los que pasaban.
8. **Capturas y marcas.** Un criterio con `when` publica `before` y `after`, y las dos URLs sirven
   un PNG. La caja de `locate('app-card')` cae dentro de la captura `after`.
9. **`ignored` y `was`.** Un `given route` sale con `ignored: true` y sin evidencia. La segunda
   ejecución de un criterio lleva `was` con el primer veredicto.
10. **Órdenes.** Por el WebSocket y por `stdin`: `run` con `ids` ejecuta solo esos; con `failing`,
    los que no están en `pass`; `pin` hace que un guardado ejecute solo el fijado; `pause` acumula
    `pending` y no ejecuta; `cancel` publica `cancelled`.
11. **WebSocket.** Una trama de texto enmascarada del navegador llega como orden; un `close` se
    contesta con `close`; un `ping` con `pong`; una trama binaria cierra con `1003`.
12. **`run`.** Sobre `examples/basic`, `fudic-workbench run` sale con `0` e imprime los tres
    criterios de `app-card`. Con un criterio roto a propósito en un fixture de test, sale con `1`
    y muestra esperado frente a obtenido. Con `--json`, cada línea es un mensaje `v: 2` y la
    última es `summary`. Sin nada que ejecutar, `FUD0976` y `1`.
13. **Shell.** Con un `session` nuevo, las tarjetas que siguen conservan su nodo y no se crea
    ningún iframe. *Live* crea uno solo. Una tarjeta en `fail` va por delante de una en `pass`.
    (Tests del script del shell con un DOM de test y mensajes simulados.)
14. **VS Code.** Sobre los puertos de hoy: un segundo componente del mismo proyecto manda `open`
    al proceso existente; cerrar la última pestaña cierra `stdin`; un `result` en `fail` pone el
    criterio en *Problems* en su línea y el icono rojo en el margen; el CodeLens ejecuta ese id.
15. **De punta a punta.** Pedro, en VS Code y en el navegador, con `app-card`: guardar el `.fud`
    se ve en menos de un segundo; *Run failing*, *Pin*, *Pause* y *Live* hacen lo que dicen; el
    margen y *Problems* de la `.fudspec` siguen a las tarjetas; `pnpm test:spec` en
    `examples/basic` sale en verde; y con `--browser msedge` también.
16. `pnpm typecheck`, `pnpm test` y `pnpm build` en verde. `@fudic/workbench` y `fudic-vscode`
    sin bajar de su suelo de `main`; lo nuevo al 100 % en las cuatro métricas.

## 7. Fuera de alcance

- **Guardar las ejecuciones en disco, el MCP y el LLM que escribe e2e** a partir de ellas. Es la
  segunda etapa: este BUG deja el protocolo `v: 2` y `run --json`, que son la base, pero no
  persiste nada.
- **VS Code remoto** (SDD-32 §7), igual que hoy.
- **La configuración de Vite del usuario** (SDD-32 §7), igual que hoy.
- **Ejecutar solo los criterios afectados** por un cambio dentro de un componente. Se ejecutan
  todos los del componente, con los que fallaban primero.
- **Crear un término desde la `.fudspec`**: ya existe, es la acción de `FUD0940`.

## 8. Decisiones de la redacción

Tomadas al redactar para no dar más vueltas; cualquiera se cambia antes de pasar a `En curso`.

| # | Decisión | Por qué |
|---|---|---|
| a | **Capturas en vez de un iframe por tarjeta**, y un solo iframe vivo bajo demanda. Sustituye la «tarjeta viva» de SDD-32 §4.8. | El iframe enseñaba el estado inicial, no el medido, y lo pintaba otro navegador. Es además lo que más pesa en la página. |
| b | **El protocolo pasa a `v: 2`** en vez de añadir campos a `v: 1`. | Cambia de forma (`tag` en todo, órdenes de vuelta). El shell y el servidor salen del mismo paquete. |
| c | **`liveCheck: false` en el banco.** | El editor y el build ya marcan los tipos; en el banco costaba ~550 ms al abrir y competía con Chrome. |
| d | **El navegador por `--browser` y un ajuste de VS Code**, no en `fudic.json`. | No hace falta tocar `@fudic/config`, y en CI se elige en la línea de órdenes. |
| e | **`workers` = 4 por defecto.** | Cuatro páginas de un componente aislado no saturan una máquina de desarrollo, y en CI se baja con `--workers`. |
| f | **VS Code habla con el proceso por `stdin`/`stdout`**, no por el WebSocket. | Es el canal que ya tiene, y no depende del `WebSocket` del Node del editor. |
| g | **`run` sin nada que ejecutar sale con `1`.** | Un CI que no encuentra pruebas tiene que fallar, no pasar en verde. |
