# Fudic — Arquitectura de renderizado en tres hilos

> Resumen de la decisión de arquitectura para el transporte de render SSR entre
> Service Worker, Web Worker e hilo principal. Modelo: cero runtime de routing
> distribuido; el navegador gobierna la navegación, el compilador solo emite.

## Principio rector

Cada navegación —inicial o subsiguiente— es un `FetchEvent` con
`request.mode === 'navigate'` que el Service Worker intercepta. **No hay router en
el hilo principal**, no hay intercepción de clicks, no hay `history.pushState` manual,
no hay swap de regiones del DOM. Un único punto de entrada, un único camino de código.

## Reparto de responsabilidades

| Hilo | Rol | Qué NO hace |
|---|---|---|
| **Navegador** | Emite la petición de navegación y pinta el documento streameado que recibe. | — |
| **Service Worker** | Intercepta `FetchEvent(navigate)`. Cache offline-first. Enruta a WW si la ruta es dinámica. Reconstruye/reenvía el stream al `Response`. `tee()` para cachear. | No hace `import()` dinámico. No renderiza. |
| **Web Worker** | `import()` dinámico del chunk de vista. Ejecuta el emit SSR (`async function*`). Produce el stream de HTML. Es el "render server local". | No toca DOM. No intercepta red. |
| **Hilo principal** | Hidratación `@client` post-navegación por traversal posicional. | No origina peticiones. No enruta. No inserta HTML de la carga inicial. |

El DOM API aparece **solo** en el hilo principal, y solo para hidratar sobre HTML
que el navegador ya pintó. El WW nunca ve un nodo.

## Canales de comunicación

Dos canales, separados por naturaleza. Nunca se mezclan payload de render y control
en el mismo canal: una señal de invalidación no debe quedar encolada detrás de un
stream a medio emitir.

- **`fetch` (Navegador → SW → WW): canal de datos.** El SW está sentado sobre `fetch`.
  El WW no puede interceptar red, así que el SW recibe la navegación y delega al WW
  cuando la ruta necesita render dinámico.
- **`MessagePort` por petición (SW ↔ WW): canal 1:1 con aislamiento.** Un
  `MessageChannel` recién creado por cada `reqId`. Relación uno-a-uno, se cierra al
  terminar (`port.close()`). Renders concurrentes no se pisan.
- **`BroadcastChannel` (los tres, out-of-band): canal de control.** Solo señales:
  invalidación de cache, versionado, purga de ruta. Broadcast porque interesan a los
  tres a la vez y no siguen el ciclo petición-respuesta.

## Flujo de una navegación

```
Navegador                Service Worker              Web Worker
 │                            │                          │
 │ navega (inicial o link)    │                          │
 │──FetchEvent(navigate)─────>│                          │
 │                            │ ¿cache hit?              │
 │                            │  ├─ sí → Response(cache) │
 │                            │  └─ no ↓                 │
 │                            │──render(route,port)─────>│
 │                            │                          │ import(chunk)
 │                            │<════════stream═══════════│ async function*
 │<═══════Response(stream)════│   tee → caches.put       │
 │                            │                          │
 │ navegador pinta documento  │                          │
 │                            │                          │
 │ main: hidrata @client      │  (BroadcastChannel:      │
 │ (traversal posicional)     │   invalidación/versión)  │
```

Una sola rama de decisión en todo el sistema: **cache hit o miss en el SW.**
Todo lo demás es lineal.

## Resolución de rutas: fuente única

El `import('./home.chunk.js')` del WW resuelve contra la URL del script del Worker,
no contra la ruta navegada. Si SW y WW discrepan en qué chunk corresponde a qué ruta,
se sirve HTML equivocado — y como **toda** navegación pasa por aquí, un desajuste
rompe cualquier navegación, no un caso raro.

Regla: un único manifest `ruta → chunk` (del build) que **ambos** cargan desde la
misma URL absoluta al arrancar. El SW lo consulta para decidir "esta ruta es dinámica,
delego"; el WW lo consulta para saber qué importar. Fuente única, ninguna deriva,
versionado junto con el build.

## Transporte del render: transferables

El stream de HTML viaja **WW → SW**. El transferable objetivo es el `ReadableStream`
entero (backpressure de plataforma gratis), pero **Safari estable no soporta
transferir `ReadableStream` vía `postMessage`**: lanza `DataCloneError`, la petición
tiene éxito pero no llega nada al receptor (fallo silencioso). Safari 27 (2026) lo
añade, pero hoy no se puede asumir en producción.

`ArrayBuffer` sí es transferable en Safari desde siempre; el problema era solo el
envoltorio `ReadableStream`.

### Decisión: adaptador con degradación aislado

Detección de **capacidad** (no de user-agent), una vez al arrancar el WW, en el
contexto real donde se transfiere (WW). Prioriza transferable nativo; cae a chunks
`ArrayBuffer` reensamblados si no existe. Bifurcación en **un único punto**: la
frontera WW→SW (`sendRender` / `receiveRender`). El resto del sistema no sabe que
hay dos caminos.

```js
// WW — una vez al arrancar
const CAN_TRANSFER = (() => {
  try {
    const s = new ReadableStream();
    structuredClone(s, { transfer: [s] });
    return true;
  } catch { return false; }
})();

function sendRender(port, stream) {
  if (CAN_TRANSFER) {
    port.postMessage({ type: 'stream', stream }, [stream]);
  } else {
    (async () => {
      const reader = stream.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        port.postMessage({ type: 'chunk', buffer: value.buffer }, [value.buffer]);
      }
      port.postMessage({ type: 'end' });
    })();
  }
}
```

```js
// SW — simétrico
function receiveRender(port, msg) {
  if (msg.type === 'stream') return msg.stream;
  let controller;
  const stream = new ReadableStream({ start: c => { controller = c; } });
  port.onmessage = ({ data }) => {
    if (data.type === 'chunk') controller.enqueue(new Uint8Array(data.buffer));
    else if (data.type === 'end') controller.close();
  };
  return stream;
}
```

**Salida limpia diseñada.** El día que Safari viejo deje de importar: se borra el
`else` de `sendRender` y `receiveRender` queda en su primera línea. Un `const`, un
`if`, borrado sin residuos.

### Nota sobre backpressure

El camino de chunks pierde el backpressure automático del `ReadableStream`
transferable: el WW emite tan rápido como itera. Para vistas hospitality acotadas,
irrelevante. Si se midiera que hace falta, se recupera con acks (`{type:'pull'}` desde
el receptor cuando `controller.desiredSize` baja). No entra en v1 salvo medición que
lo justifique.

## Consecuencias aceptadas

- **Cada navegación es un documento nuevo.** No sobrevive estado de UI en el hilo
  principal (scroll, foco, signals no persistidos) salvo persistencia explícita. Para
  vistas hospitality autónomas es correcto, pero queda como decisión consciente.
- **Estado entre navegaciones**: pendiente decidir si entra en v1. Opciones naturales:
  `sessionStorage` para lo trivial, o un estado que viva en WW/SW señalizado por
  `BroadcastChannel`.

## Encaje con la filosofía Fudic

- El WW ejecuta el **mismo** `async function*` que un Cloudflare Worker: mismo target
  de emit, cero targets nuevos de compilador. El WW es un render server local.
- El adaptador de transporte es progressive enhancement aplicado al canal: usa la
  capacidad nativa donde existe, degrada sin romper donde no.
- En el caso base (documento inicial), el hilo principal no necesita ejecutar JS para
  que la página exista. Progressive enhancement real en cada navegación.

## Hilos abiertos

- Contrato de mensajes tipado de los tres hilos (interfaces de cada `postMessage`,
  ciclo de vida de `reqId`/`port`).
- Decisión de estado-entre-navegaciones para v1.
- Estrategia de cache del SW: qué rutas son cacheables, política de invalidación por
  versión.
