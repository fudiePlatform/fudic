# IDEA-08 — Adelgazar el cliente: create perezoso, clases y props reflejadas

> **Estado:** `Idea` — no es un SDD. Sin interfaz pública cerrada, sin criterios de aceptación,
> sin rango de diagnósticos. Captura la conversación del **2026-11-11** con Pedro. Lo marcado como
> **decidido** no se reabre; lo demás es propuesta.

Cuatro mejoras del código que el compilador emite para el navegador. Son independientes entre
sí; el orden propuesto está en §5.

Añadidos el **2026-11-12**, tras investigar qué se puede compartir desde una librería: un bug de
`errorPages` con `base` (§6) y cómo tener una página de error compartida entre apps (§7). No son
de adelgazar el cliente; se apuntan aquí a petición de Pedro.

---

## 1. El `c` raíz, perezoso

### 1.1. El problema

Cada componente compila a un controlador `{ c, h, u, r }`:

- **`h`** adopta el HTML que pintó el servidor. Es el camino normal.
- **`c` raíz** fabrica el shadow tree entero desde cero. Solo se ejecuta vía
  `FudicElement.c()`, es decir, cuando un padre crea el componente en el navegador desde un
  bloque `@if` / `@foreach` (`live()` en `@fudic/core`).

Los `c` de los bloques `@if` / `@foreach` sí hacen falta siempre. Las rutas ya salen sin `c`
raíz (solo `{ h, u, r }`); los componentes, no.

### 1.2. Lo medido en `examples/basic`

Build de `dist/assets/h/*.js`; ahorro = quitar el `c` raíz, re-minificar con oxc-minify (caen
también sus helpers muertos) y comprimir fichero a fichero.

| | crudo | gzip | brotli |
|---|---:|---:|---:|
| JS de los 56 componentes | 147.780 B | ~52,4 kB | — |
| Suma de los `c` raíz | 49.024 B (33 %) | ~13,3 kB (~25 %) | ~11,6 kB |
| De los 52 que **nunca** se crean en cliente | ~47,4 kB | **~12,7 kB** | ~11,1 kB |

Solo 4 componentes pueden llegar a ejecutar su `c`: `spread-card`, `vivo-item`, `vivo-otro` y
`bus-option`. Los peores casos son los formularios: `app-form` (5.117 B de `c` en un fichero de
9.362, un 55 %), `user-form` (48 %) y `app-wide-form` (53 %). Además arrastran los `live(…)` de
sus hijos, que tampoco se ejecutan. Todo esto incumple el presupuesto de ~1 kB por chunk que cita
`element.ts`.

### 1.3. Propuesta

1. **Separar el `c` raíz en su propio chunk** (`<tag>.c-<hash>.js`). El módulo principal se
   queda con `h` / `u` / `r`; `live()` espera al chunk antes de `raise` (ya es asíncrono, porque
   espera al `define`). El `document.createElement` escrito a mano sigue funcionando.
2. **Precargar donde hace falta.** El compilador sabe qué tags fabrica cada bloque `@if` /
   `@foreach`; al hidratar el padre se emite un `modulepreload` del `c` de esos hijos, para que
   el INP no empeore cuando se cumple la condición.

**Descartado:** podar el `c` con un análisis global de la app en el plugin de Vite. Rompe la
creación dinámica y obliga a mirar la app entera; con la precarga el beneficio es casi el mismo.

### 1.4. Alcance

~25–30 tareas (compiler, core, vite, workbench/e2e). ~1 día.

## 2. La clase estática, como literal

Hoy una clase estática sale como `` [`panel`].filter(Boolean).join(` `) ``
(`packages/compiler/src/emit/attrs.ts`). Debe salir `setAttr(el, 'class', 'panel')`, sin
runtime. Con `classList.add` no se ganaría nada.

**Alcance:** ~3 tareas. Es un BUG.

## 3. `class:` con `toggleClass`

### 3.1. El problema

Con `class:x=@cond`, cada cambio recompone la cadena entera y pisa el atributo `class`. Eso se
come cualquier clase añadida por otro código (un `ref`, una librería, una animación).

### 3.2. Propuesta

Un método nuevo en el contrato `Dom<N>` de `@fudic/dom`, `toggleClass(el, token, on)`:

- **navegador:** `el.classList.toggle(token, on)`;
- **servidor / SW:** un conjunto ordenado de tokens que se serializa como `class="…"`.

No se emula `DOMTokenList`: el compilador emite lo mismo para los tres destinos, igual que con
`setAttr` / `setLive`. Ventajas: cada `class:` toca solo su token, no pisa clases ajenas, y en la
hidratación es idempotente.

### 3.3. Lo que la spec tendría que cerrar

1. **El mismo token estático y dinámico** (`class="activo" class:activo=@x`): el `toggle(false)`
   borraría el estático. Diagnóstico, o regla de que gana el dinámico.
2. **Orden de los tokens:** primero los estáticos y luego los dinámicos activos, en orden de
   fuente, igual en servidor y en el primer `c`. Tras varios toggles el orden diverge; en CSS da
   igual, pero afecta a los snapshots.
3. **`class=""` residual** en el navegador al quitar el último token; en el servidor no hay
   atributo. Inocuo, pero hay que dejarlo escrito.
4. **Spreads** (`...resto` con `class` junto a `class:`): precedencia por definir.

### 3.4. Alcance

~10–12 tareas. Unas horas.

## 4. Reflejar props en atributos del host

### 4.1. El problema

Una card con cuatro variantes obliga a un `class:` por variante. Si la prop `variant` se refleja
en el host, el CSS lo resuelve con un selector y la vista no lleva ninguna expresión:

```css
:host([variant="primary"]) .card { … }
```

Además el componente se puede estilizar desde fuera (`app-card[variant="primary"]`), y con SSR el
atributo sale en el HTML sin JS.

### 4.2. Lo decidido (Pedro, 2026-11-11)

1. **El atributo lo escribe solo el framework, nunca el usuario.** No existe el conflicto entre
   un atributo escrito a mano y la prop.
2. **Una sola dirección: de la prop al atributo.** Sin `observedAttributes`.
3. **Solo primitivos.** `string` y `number` como valor; `boolean` como presencia o ausencia;
   `null` / `undefined` quitan el atributo.

### 4.3. Lo que queda abierto

- **Sintaxis:** cómo marca el autor qué props se reflejan (por ejemplo, una marca en
  `props<…>()`).
- **Diagnóstico** para una prop reflejada de tipo no primitivo.

### 4.4. Cómo encaja

SSR y SW escriben el atributo en el tag del host; el cliente lo actualiza en `u` y lo escribe en
`c` cuando el componente se fabrica en el navegador.

### 4.5. Alcance

~10–12 tareas. Unas horas.

## 5. Orden propuesto

| # | Mejora | Tareas | Forma |
|---|---|---:|---|
| 1 | Clase estática como literal (§2) | ~3 | BUG |
| 2 | `c` raíz perezoso + precarga (§1) | ~25–30 | SDD |
| 3 | `class:` con `toggleClass` (§3) | ~10–12 | SDD |
| 4 | Props reflejadas en el host (§4) | ~10–12 | SDD (puede ir con la 3) |
| — | `errorPages` sin `base` (§6) | ~3 | BUG, independiente; puede ir primero |
| — | Página de error compartida (§7) | ~5–8 | Tarea de CLI + docs, sin cambio de gramática |

## 6. BUG: `errorPages` navega sin el `base` de la app

### 6.1. Lo que se ve leyendo el código

- `errorUrl` (`packages/http/src/error-pages.ts:44`) devuelve `` `${ERROR_PREFIX}/${status}` ``,
  es decir `/_fudic/error/500`, sin el `base`. `errorPagesStep` ni siquiera lo recibe.
- Las llamadas a funciones sí lo aplican: `join(base, …)` en `packages/http/src/contract/fn.ts:170`,
  con el `base` que trae el spec de la función.
- El servidor quita el `base` antes de mirar la ruta (`pathOf`, `packages/server/src/server.ts:120`):
  espera `/admin/_fudic/error/500`.

### 6.2. Consecuencia

Una app publicada con `base` (en `examples/workspace`, `admin` en `/admin/`) manda un 500 de una
llamada a `/_fudic/error/500`. En un origen compartido esa URL la sirve **otra** app (`tienda`),
con su diseño y su `_error.fud`. Detrás de un proxy que solo enruta `/admin/*`, es un 404.

Pasa lo mismo con las rutas de `routes 403 /entrar`: se navega a la ruta tal cual, sin `base`.
Hay que decidir si esa ruta se escribe relativa a la app (y se le pone el `base`) o absoluta.

### 6.3. Por confirmar

Sacado de leer el código, sin ejecutarlo. Primero un test que lo reproduzca: `errorPagesStep` con
una app de `base: '/admin/'` y una llamada que recibe 500 debe navegar a
`/admin/_fudic/error/500`. Arreglo previsible: que `errorPagesStep` reciba el `base` (como lo
recibe `fn`) y use `join(base, …)`.

## 7. Una página de error compartida entre apps

### 7.1. Lo que hay hoy

- **Un layout sí puede vivir en una librería.** Medido en SDD-43 (`SDD-43-medicion.md`,
  `packages/vite/test/lib-extras-probe.test.ts`): `<link rel="layout" href="@acme/ui/_layout.fud">`
  se compone como uno propio, `fudic:runtime` incluido.
- **Una página no.** `FUD0783`: una librería no tiene `routesDir`, ni `base`, ni build propio, así
  que ninguna URL llega a ella.
- **`_error.fud` tiene que estar en la raíz de `src/routes/` de cada app.** El descubrimiento busca
  ese nombre exacto (`packages/vite/src/discover.ts:84`).

Así que lo único que se repite por app es el fichero `_error.fud`. La misma fricción la tendría
cualquier otra página que se quiera compartir (login, mantenimiento…).

### 7.2. Por qué no vale «una app que solo tiene la página de error»

Se llega a la página de error por dos caminos, y una app aparte solo cubre uno:

| Origen del error | A dónde va | ¿Lo cubre otra app? |
|---|---|---|
| Llamada de cliente que falla (500, 409 sin `catches`…) | `errorPages` navega a `/_fudic/error/<status>` | Sí, en el mismo origen, o con `routes` |
| `load` que lanza `notFound()`, URL inexistente | El servidor de **esa** app pinta su `_error.fud` en la misma respuesta | **No**: no hay redirección |

Cada app seguiría necesitando su `_error.fud`. Hoy, por el bug de §6, las apps con `base` ya caen
en la de la raíz para las llamadas, pero por accidente y solo en ese camino.

### 7.3. Propuesta: la página es un componente de la librería

El `_error.fud` de cada app se queda en unas pocas líneas que lo cogen todo de la librería:

```html
<link rel="layout" href="@acme/ui/_layout.fud">
<link rel="component" href="@acme/ui/error-view.fud">

<error-view .status=@data.status .title=@data.title .detail=@data.detail></error-view>
```

El diseño, los textos, los tests, la `.fudspec` y la fixture de `error-view` viven en la
librería, como cualquier componente. No hace falta tocar la gramática ni el plugin.

### 7.4. Lo que la spec tendría que cerrar

1. **Generarlo con el CLI.** Algo como `fudic g error-page --from @acme/ui` en una app, que escribe
   ese `_error.fud` mínimo. Y en la librería, un generador del componente `error-view` con el
   contrato de `data` (`{ status: number; title: string; detail?: string }`) ya tipado.
2. **El tipo de `data` desde la librería.** Que el componente pueda declarar sus props con el tipo
   que exporta `@fudic/http` (o el que corresponda), para que el editor marque un `_error.fud` que
   le pase algo mal.
3. **Idiomas.** Con `locales`, `_error.fud` se compila una vez por idioma (SDD-58 §4.5); comprobar
   que los textos de `error-view` en la librería entran en `fudic translate` igual que los de la
   app.
4. **Un ejemplo.** Añadirlo a `examples/workspace`: `libs/ui` con `_layout.fud` y `error-view`, y
   las dos apps con su `_error.fud` de tres líneas. Hoy no hay ningún ejemplo de layout en una
   librería; solo el test de la medición.
5. **Descartado de momento:** que una app declare en `fudic.json` un `_error.fud` de otro paquete.
   Ahorra tres líneas a costa de una excepción a `FUD0783` y de una ruta que no está en `routes/`.
