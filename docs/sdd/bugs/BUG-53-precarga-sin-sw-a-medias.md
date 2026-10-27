# BUG-53 · La precarga no conoce el grafo de cada chunk

> **Estado:** `Listo` — [tareas](./BUG-53-Task.md).
> **Corrige:** [SDD-17](../SDD-17-hidratacion.md) §4.7 y §4.7.1 (los dos canales de warm) y lo
> que [SDD-45](../SDD-45-runtime-publicado.md) §4.3 fijó sobre las piezas que llegan con el warm.
> **Paquetes:** `@fudic/core` · `@fudic/transport` · `@fudic/vite` · `examples/basic`
> **No bloquea nada.** Se puede implementar en paralelo con las SDD de la rama.

---

## 1. Contexto y síntoma

Cuando la primera instancia de un componente entra en pantalla, fudic precarga su chunk de
hidratación para que el primer clic no espere a la red (SDD-17 §4.7). Hay dos canales, y ninguno
precarga bien lo que ese chunk importa.

**Sin Service Worker** (`modulepreload`), se precarga el chunk y nada más:

- El componente `A` importa los chunks compartidos `B` y `C`, y estos importan piezas del runtime
  publicado (`/_fudic/<versión>/core/…`).
- Cuando `A` entra en pantalla se inserta un `<link rel="modulepreload">` para `A`.
- Chromium descarga `A` y **ninguno de sus imports estáticos** hasta que algo lo evalúa. Está
  medido y escrito en `core/src/hydrate/warm/preload.ts:14-20`.
- En el primer clic se evalúa `A`, se descubren `B` y `C` y después las piezas: una cascada de
  idas y vueltas **dentro del gesto**, justo lo que la precarga existe para evitar.

**Con Service Worker** llega todo, pero en serie y leyendo bytes:

- El SW deposita el chunk y los compartidos de `hydrateDeps`. Las piezas del runtime no están en
  el manifiesto: las descubre **leyendo el código de cada fichero que acaba de depositar**
  (`runtimeImportsOf`, `transport/src/router.ts:492`).
- Cada fichero espera al anterior (`router.ts:537-547`): primero se deposita, después se lee y
  después se pide lo que nombra. Son las mismas idas y vueltas de arriba, ahora dentro del SW.

Reproducir sin SW: `pnpm --filter @fudic/example-basic build:nosw && preview:nosw`, abrir
`/usuarios` y mirar la pestaña de red: al entrar en pantalla se pide un `.js` y al primer clic el
resto. Con SW: el mismo build con `sw.json` y la pestaña de red del worker, una petición detrás de
otra.

## 2. Causa raíz

**El grafo completo no está en ningún sitio.** El build calcula en `vite/src/plugin.ts:2204-2243`
qué chunks compartidos importa cada chunk de hidratación y lo escribe en el campo `hydrate` de
`fudic-routes.json` (en el build de `examples/basic`, `"user-form": ["user-form", "fudic_http",
"fudic-root.browser", …]`). Dos huecos:

- **Le faltan las piezas del runtime.** Por eso el SW las lee de los bytes. El build ya sabe
  calcularlas: el `<head>` precarga las del coordinador con su cierre transitivo
  (`vite/src/runtime-link.ts:321-360`, `loadedPieces`).
- **Sin SW nadie lo lee.** El canal de precarga (`createPreloadWarmChannel`,
  `core/src/hydrate/warm/preload.ts:31-50`) solo recibe la URL que deriva `hydrateUrl(tag)`.

**El motivo escrito para dejarlo así ya no se cumple.** `preload.ts` dice que los chunks
compartidos «llevan un hash de contenido que solo conoce el manifiesto». Desde BUG-31 §T5 llevan
el id de build como todo lo demás (`transport/src/urls.ts:54-58`): con el manifiesto, la página
puede derivarlos igual que el SW.

**Lo que no se puede hacer: precargar con `<link>` lo que sirve un SW.** Chrome avisa de cada uno
(«a preload … is not used because it is a cross-world service worker resource mismatch»), lo
descarga dos veces y tira la precarga. Por eso el `<head>` no escribe precargas cuando hay SW
(`vite/src/plugin.ts:518-530`). El canal de precarga es solo para páginas sin SW, y el del SW nunca
inserta un `<link>`.

**Alcance.** Los dos canales, la ruta reactiva (su chunk se pide entero en el primer gesto y tiene
su propio grafo) y los chunks por idioma (`en/app-card`, SDD-58 §4.6), que son otros ficheros.

## 3. Interfaz pública

```ts
// @fudic/transport
/**
 * Every file a hydration chunk needs, in no particular order: the shared chunks and the
 * published runtime pieces it imports statically, transitively. The chunk itself is not in it.
 * Read off the manifest; empty for a name the manifest does not know.
 */
export type HydrateGraph = (name: string) => readonly string[];
export function hydrateGraphOf(file: ManifestFile): HydrateGraph;

// @fudic/core
export interface PreloadChannelConfig {
  readonly document?: Document;
  /**
   * The graph of each chunk the channel is asked to warm, by URL. A promise because, with no
   * worker, it comes from fetching the manifest. Absent in dev.
   */
  readonly graph?: (chunkUrl: string) => Promise<readonly string[]>;
}
```

`WarmChannel.warm(urls, tags)` y el observador no cambian.

## 4. Comportamiento

### 4.1. El manifiesto lleva el grafo completo

Para cada chunk de hidratación (componente o ruta reactiva, por idioma), el campo `hydrate` de
`fudic-routes.json` lleva:

- sus chunks compartidos, como hoy;
- **y** las piezas `/_fudic/…` que importan estáticamente el chunk y esos compartidos, con su
  cierre transitivo, con la misma función que usa el `<head>` (`loadedPieces`).

Se calcula después del renombrado y la poda, como hoy. Las piezas se escriben por su URL
publicada, porque no viven en el directorio de `assets`. El manifiesto sigue siendo el único sitio
del grafo: ni el HTML ni el coordinador lo repiten (`compiler/src/emit/maps.ts:10-16`).

### 4.2. Con SW: todo de una vez, sin leer bytes

- `warmHydration` pide en paralelo el chunk y todo su `hydrateGraphOf(manifest)(name)`.
- `runtimeImportsOf` desaparece del warm: el SW ya no lee el código de lo que deposita.
- La regla no cambia: un tag cuenta como precargado solo si han llegado todos sus ficheros.
- El canal del SW nunca inserta un `<link rel="modulepreload">`.

### 4.3. Sin SW: el canal lee el manifiesto

- El coordinador de un build sin SW pasa `graph` a `createPreloadWarmChannel`. `graph` pide
  `fudic-routes.json` **una vez por página**, con `priority: 'low'`, la primera vez que hay algo que
  precargar.
- **Si el `build` del manifiesto no es el de la página** (hubo un despliegue después de que se
  pintara), `graph` devuelve una lista vacía y el canal se queda en el chunk. Si el manifiesto no
  llega, igual. Nunca precarga ficheros de otro build.
- El nombre del chunk sale de su URL, con la misma aritmética que usa el SW (`hydrateNameOf`), que
  pasa a vivir junto a `hydrateGraphOf` para que los dos lados usen la misma.
- El canal inserta un `<link rel="modulepreload" fetchpriority="low">` por el chunk y por cada URL
  de su grafo.
- **No repite** una URL que ya tenga un `<link rel="modulepreload">` en el documento, sea del
  `<head>` o de un tag anterior. Se compara la URL absoluta (`link.href`).
- **`fud:warmed` sale cuando han cargado todas** las URL de ese tag, también las que ya estaban.
  Si una falla (`error`), ese tag no se anuncia, con la misma regla que el SW.
- En dev no hay `graph`: el canal hace lo de hoy.

### 4.4. El comentario

`preload.ts` deja de decir que la página no puede nombrar los imports. Explica de dónde sale el
grafo, por qué no se precarga nada con `<link>` cuando hay SW y por qué en dev no hay grafo.

## 5. Criterios de aceptación

1. **Sin SW, el grafo entero antes del clic.** En el proyecto `nosw` de Playwright, `/usuarios`:
   al entrar en pantalla `user-form` se piden su chunk, sus compartidos y sus piezas del runtime.
   Tras `fud:warmed`, el primer clic hidrata **sin ninguna petición de `.js` nueva**.
2. **Con SW, igual y en paralelo.** En el proyecto con SW, lo mismo: tras `fud:warmed` el clic no
   pide nada a la red. El SW pide los ficheros del grafo sin esperar uno a otro y no lee el código
   de ninguno.
3. **Ni un `<link>` con SW.** En el build con SW, tras precargar no hay ningún
   `<link rel="modulepreload">` en el documento y la consola no tiene ningún aviso de precarga.
4. **El manifiesto.** `hydrate` de `fudic-routes.json` lleva las piezas `/_fudic/…` de cada chunk,
   transitivas, además de los compartidos. Con dos idiomas, cada chunk `en/…` lleva el suyo.
5. **Sin duplicados.** Sin SW, dos componentes que comparten un chunk ponen un solo `<link>` para
   él, y una pieza que el `<head>` ya precargó no se vuelve a poner.
6. **`fud:warmed` honesto.** Con una URL del grafo que da 404, el tag no se anuncia, en los dos
   canales. Con todas cargadas, se anuncia una vez.
7. **Otro build.** Sin SW, con un manifiesto cuyo `build` no es el de la página, o que no llega, el
   canal precarga solo el chunk y no se rompe nada.
8. **Una petición.** Sin SW, el manifiesto se pide una vez por página, aunque se precarguen diez
   tags.
9. **Dev, igual que hoy.** Sin `graph`, un `<link>` por URL.
10. **Entrega.** `pnpm typecheck`, `pnpm test` y `pnpm build` en verde. `@fudic/core` sigue al
    100 % en las cuatro métricas; `@fudic/transport` y `@fudic/vite` no bajan de su suelo.

## 6. Fuera de alcance

- **`pnpm dev`.** Vite sirve los módulos sin empaquetar y el grafo son los ficheros fuente: no se
  puede nombrar antes de pedirlo.
- **Precargar al cargar la página** lo que no ha entrado en pantalla. La política (cuándo y qué
  tags) es la de SDD-17 §4.7 y no cambia: cambia solo lo que se descarga por cada tag.
