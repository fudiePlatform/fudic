# IDEA-08 — Adelgazar el cliente: create perezoso, clases y props reflejadas

> **Estado:** `Idea` — no es un SDD. Sin interfaz pública cerrada, sin criterios de aceptación,
> sin rango de diagnósticos. Captura la conversación del **2026-11-11** con Pedro. Lo marcado como
> **decidido** no se reabre; lo demás es propuesta.

Cuatro mejoras del código que el compilador emite para el navegador. Son independientes entre
sí; el orden propuesto está en §5.

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
