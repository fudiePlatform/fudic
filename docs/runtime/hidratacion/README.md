# Fudic — hidratación real por interacción

Prueba de concepto **con ficheros reales**: los chunks de componentes se descargan
por red en la primera interacción; el Service Worker los cachea; el estado sale del
payload SSR por `data-id`; el primer clic se reproduce (replay) tras hidratar.

## Servir

Necesita HTTP (el SW no arranca en `file://`):

    serve .
    # o
    python3 -m http.server 8000

Abre `http://localhost:8000` (o el puerto de `serve`).

## Qué verificar (DevTools)

1. **Network (filtro JS), recarga:** al cargar solo baja `runtime.js`. Ningún
   `components/*.js`.
2. **Console:** `document.querySelectorAll(':not(:defined)')` → los tres tags
   (`app-counter`, `app-toggle`) aparecen sin definir. Los ves porque el DSD los
   pinta sin JS.
3. **Primer clic** en un contador: en Network baja `components/app-counter.js`
   (network-first). En consola ese tag desaparece de `:not(:defined)`.
4. **Segundo componente del mismo tag** (el otro contador): NO vuelve a bajar el
   chunk — ya está definido; su estado sale de su propio `data-id`.
5. **Recarga y clic de nuevo:** el chunk sale de **(ServiceWorker)** / disk cache,
   no de red. Cabecera `x-fud-source: cache` (visible en la respuesta).
6. **Replay:** el primer clic ya incrementa/togglea; no se pierde el gesto.

## Ficheros

- `index.html` — SSR con Declarative Shadow DOM (cero JS de componente), payload,
  registro del SW, polyfill `<style host>`, carga de `runtime.js`.
- `runtime.js` — único JS de app al inicio: capturador global delegado, resolución
  `data-id → chunk`, `import()` real, hidratación, replay.
- `components/app-counter.js`, `components/app-toggle.js` — chunks N3 reales; cada
  uno hace `customElements.define`. Leen su estado de `window.__fudState[data-id]`,
  nunca del DOM.
- `sw.js` — Service Worker: network-first la 1ª vez (cachea), cache-first después.

## Límites conocidos de esta PoC

- El manifest `tag → chunk` es una convención hardcodeada en `runtime.js`
  (`./components/${tag}.js`); en el compilador real vendría del emit.
- No hay rutas ni descarga incremental por navegación: es una sola página, el foco
  es demostrar descarga real + caché + hidratación por interacción.
- El estado es escalar por `data-id`. La materialización del grafo raíz con
  identidad (payload único, objetos compartidos) es la decisión 67, no cubierta aquí.
