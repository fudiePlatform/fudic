# BUG-35 · Una ruta reactiva reclama un id y la página no carga el runtime que lo lee

> **Estado:** `Hecho`
> **Corrige:** [SDD-39 — Rutas reactivas](../SDD-39-rutas-reactivas.md) §4.2, §4.5, §4.7 ·
> [BUG-31](./BUG-31-el-emit-no-pregunta.md) §T1
> **Paquetes:** `@fudic/compiler`
> **Rango:** reutiliza el de SDD-39; **no** reserva códigos nuevos

---

## 1. Contexto y síntoma

`examples/basic` tiene tres rutas escritas para SDD-39. Dos funcionan y una está muerta, y
la que está muerta es justo la que no lleva ningún componente dentro:

| ruta | qué declara | `fudic-main` | chunk pedido | funciona |
|---|---|---|---|---|
| `/ruta-evento` | un `@click` en el `@code` de la ruta | **no** | nunca | **no** |
| `/ruta-reactiva` | una `signal` + `<signal-control>` | sí | al gesto | sí |
| `/ruta-reloj` | un `effect` + `<app-clock>` | sí | al instalar | sí |

`/ruta-evento` se sirve con todo lo que SDD-39 le prometió:

```html
<body data-fud-id="0">
…
<script type="application/json" id="fud-state">[[0,0],[]]</script>
<script type="application/json" id="fud-route">"ruta-evento"</script>
```

El chunk existe —`dist/assets/h/ruta-evento-<build>.js`, con su mapa— y es correcto. Lo
que no existe en la página es la etiqueta que carga el runtime:

```html
<script type="module" src="/fudic-boot-<build>.js"></script>
```

Solo `boot`, que registra el Service Worker. Sin `fudic-main` no hay capturador, así que
nadie recorre el `composedPath()` del clic, nadie llega al `<body>`, y el chunk no se pide
jamás. Medido en Chrome con Playwright, en `vite preview` y en `pnpm dev`: **cero
peticiones tras el clic, y el `<output>` sigue en `0`**.

**Y las otras dos funcionan por accidente.** Llevan `fudic-main` porque `<signal-control>`
y `<app-clock>` son componentes hidratables, no por su mitad de cliente. Quítales el
componente y mueren igual.

---

## 2. Causa raíz

[`packages/compiler/src/emit/maps.ts:193`](../../../packages/compiler/src/emit/maps.ts) —
una línea:

```ts
export function needsRuntime(hydratable: ReadonlySet<string>, hasDi: boolean): boolean {
  return hydratable.size > 0 || hasDi;
}
```

`hydratable` es `hydratableTags(graph)`: **tags de componente**. Es la pregunta que BUG-31
§T1 escribió, y para lo que existía entonces era la pregunta entera — las dos cosas que
`fudic-main` busca eran un `data-fud-id` de componente y un contenedor de DI.

SDD-39 añadió una tercera y no se lo dijo a nadie: desde §4.2 **el `<body>` lleva un
`data-fud-id` propio**. Una ruta no tiene tag, así que no está en el conjunto, así que la
página que solo es reactiva por su ruta contesta `false` y se emite sin el lector de lo que
acaba de reclamar.

### 2.1. El alcance: los dos sitios que preguntan

| sitio | forma | estado |
|---|---|---|
| [`layout.ts:342`](../../../packages/compiler/src/emit/layout.ts) (`buildRouteModule`) | `needsRuntime(hydratable, hasDi)` | defectuoso |
| [`module.ts:482`](../../../packages/compiler/src/emit/module.ts) (`buildPageModule`) | idem | defectuoso |

Los dos, y no uno: una página autónoma es una ruta que se posee su propio shell, y publica
`fud-route` por el mismo camino.

En `layout.ts` el dato ya estaba a tres líneas —`blocks`, el resultado de `routeBlocksOf`—.
En `module.ts` no: se calculaba **después** de escribir la cabecera, y la cabecera es donde
se decide la etiqueta. Por eso el arreglo del segundo sitio incluye subir esa llamada.

### 2.2. Lo que NO es la causa

No es de los eventos. `isReactiveRoute` (SDD-39 §4.5) considera reactiva la ruta que
declara un reactivo, la que tiene cuerpo en `@client` **o** la que tiene un binding de
enganche —`@evento`, `bus:`, `control`—, y esa regla no se toca aquí. `/ruta-evento` es
donde se ve porque es la única de las tres sin un componente que la salve por casualidad;
una ruta con solo una `signal` y sin componentes estaba igual de muerta.

---

## 3. Interfaz pública

Una firma, interna al emit:

```ts
export function needsRuntime(
  hydratable: ReadonlySet<string>,
  hasDi: boolean,
  reactiveRoute: boolean,   // ← nuevo
): boolean;
```

No cambia nada exportado por el paquete: `needsRuntime` no sale de `src/emit/`. El
marcador `fudic:runtime`, `writeRuntimeTags` y el contrato `io.runtime = { boot, main }`
quedan exactamente como BUG-31 §T1 los dejó.

---

## 4. Comportamiento corregido

```ts
return hydratable.size > 0 || hasDi || reactiveRoute;
```

Tres puertas y sigue bastando una. Lo que importa es **qué se le pasa** por la tercera:

1. **`reactiveRoute` es `blocks !== undefined`**, el resultado de `routeBlocksOf` — la
   misma expresión que hace al `<body>` reclamar su id. No es una segunda opinión sobre lo
   mismo: es el mismo valor leído por los dos sitios, de modo que **no pueden discrepar**.
   Una página que reclama un id y no carga el runtime es precisamente el defecto.
2. **Por eso una ruta reactiva cuyo nombre el build no conoce sigue sin runtime.** Sin
   nombre no hay `fud-route`, sin `fud-route` no hay id reclamado, y no hay nada que leer
   (§4.7). La etiqueta sigue a la reclamación, no a la región `@client`.
3. **BUG-31 §T1 intacto.** `/about` —sin mitad de cliente y sin componentes hidratables—
   sigue sin descargar `fudic-main`. Comprobado sobre el `dist` del ejemplo.

En `module.ts`, `routeBlocksOf` sube por encima de `writeHeadElements`. Es reordenar, no
recalcular: la llamada sigue siendo una, y sus diagnósticos (`FUD0621`) se recogen en el
mismo array.

---

## 5. Invariantes

**El que violaba.** *Lo que la página reclama, la página lo sabe leer.* Un `data-fud-id` es
una promesa al runtime; emitirlo sin emitir el runtime es escribir la promesa y no el
destinatario. Vale para el `<body>` igual que valía para un tag.

**El que añade.** **Una condición que gobierna dos salidas se evalúa una vez.** El id del
`<body>`, el bloque `fud-route` y la etiqueta del runtime son tres caras de una sola
pregunta — «¿tiene esta ruta mitad de cliente y nombre con el que pedirla?»— y el emit la
contesta una vez y reparte la respuesta. Dos lecturas equivalentes son dos cosas que se
pueden desincronizar, y esta ya lo hizo.

---

## 6. Criterios de aceptación

En `packages/compiler/test/emit/runtime-tag.test.ts`. La afirmación es sobre el módulo
emitido y no sobre el HTML porque `io.runtime` lo pone el wrapper de `@fudic/vite`: el
compilador decide **si**, y esa decisión es exactamente la línea `io.runtime.main`.

1. **Una `signal` en la ruta y ni un tag hidratable en la página** → el módulo publica
   `fud-route` **y** carga el runtime.
2. **Un manejador y nada más** —la forma de `/ruta-evento`, la ruta que tiene JavaScript
   antes de tener reactividad— → carga el runtime.
3. **Una página autónoma** con la misma forma y su propio `<head>` → igual.
4. **Una ruta sin mitad de cliente** → `io.runtime.boot` sí, `io.runtime.main` no.
5. **Una página autónoma sin mitad de cliente**, con el marcador escrito → tampoco.
6. **Una ruta reactiva cuyo nombre el build no conoce** → ni `fud-route` ni runtime.
7. **Un componente hidratable con la ruta estática** → sigue cargando el runtime.
8. **`needsRuntime` en sus tres puertas**: cerrada con las tres a `false`, abierta con
   cualquiera de ellas a `true`.

**Visto fallar.** Revirtiendo la tercera puerta, **4 de los 8 caen** (1, 2, 3 y 8).

**Medido en el navegador** (Chrome, Playwright, `vite preview` y `pnpm dev`):
`/ruta-evento` pasa de `boot` a `boot + main`, el clic pide el chunk y el `<output>` sube.
`/about` sigue con `boot` y nada más.

**Cobertura.** El código nuevo nace al 100 %: la rama añadida queda cubierta por sus dos
caras. El suelo del paquete sube —99,22 / 98,03 / 99,38 / 99,66 → **99,25 / 98,06 / 99,47 /
99,70**— sin un solo `ignore`.

---

## 7. Fuera de alcance

- **La regla de §4.5 de SDD-39**, que dice qué hace reactiva una ruta. Que un `@evento`
  cuente o no es una decisión de diseño, no un defecto; este BUG arregla el agujero que
  existe con cualquiera de las dos respuestas.
- **El source map de dev**, que es [BUG-36](./BUG-36-mapas-de-dev.md): otro paquete, otro
  fichero, ni una línea en común.
- **La mitad de cliente de un layout**, que SDD-39 §7 ya dejó anotada con su condición de
  reapertura.
- **El `<head>`**: en v1 no hay reactividad en la cabecera, y el recorrido de adopción
  sigue empezando en el `<body>`.
