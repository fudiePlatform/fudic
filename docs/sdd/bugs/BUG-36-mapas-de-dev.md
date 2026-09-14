# BUG-36 · En dev ningún `.fud` tiene source map: no hay dónde poner un punto de interrupción

> **Estado:** `Hecho`
> **Corrige:** [SDD-19](../SDD-19-plugin-vite.md) §4.10 · [SDD-20](../SDD-20-render-sw.md) §4.11 ·
> [SDD-17](../SDD-17-hidratacion.md) §4.7.1
> **Paquetes:** `@fudic/vite`
> **Rango:** no reserva códigos nuevos

---

## 1. Contexto y síntoma

Depurar el `@client` de un `.fud` con `pnpm dev` es imposible: el fichero no aparece en el
árbol de *Sources* de DevTools, así que no hay línea sobre la que poner un punto de
interrupción. Lo que se ve es el módulo generado, con sus `$n0`, `$c1` y `$s()`.

Contado sobre el servidor de dev de `examples/basic`:

```
/@fudic/h/ruta-reloj.js     0 apariciones de sourceMappingURL
/@fudic/h/app-clock.js      0
un .ts cualquiera           2
```

**No es de las rutas: es de todo lo que emite fudic.** Un componente está tan a oscuras
como una ruta, y lo ha estado desde que existe el servidor de dev.

En un **build** no pasa: el chunk lleva su `.map`, con `sources: ["…/ruta-reloj.fud?client"]`
y el `sourcesContent` entero, el fichero se sirve con 200 y el punto de interrupción se
pone y salta. La asimetría es el síntoma: lo que se depura es lo que se está escribiendo, y
eso se escribe en dev.

---

## 2. Causa raíz

[`packages/vite/src/plugin.ts:296`](../../../packages/vite/src/plugin.ts), dentro del
middleware de `configureServer` — una línea:

```ts
server
  .transformRequest(id)
  .then((result) => {
    …
    res.end(result?.code ?? '');   // ← `result.map` se tira
  })
```

El `transform` del plugin devuelve las dos mitades y bien: en
[`plugin.ts:653`](../../../packages/vite/src/plugin.ts) el mapa del emit entra como `inMap`
y Oxc compone, de modo que lo que sale es un `.fud` → JS en un solo mapa (BUG-31 §T3). El
mapa existe, está bien construido, y se descarta al escribir la respuesta.

### 2.1. Por qué hay un middleware propio, y por qué eso basta para perderlo

Quien convierte un mapa en algo que un navegador lee es el *module middleware* de Vite:
añade el `//# sourceMappingURL=data:application/json;base64,…` al vuelo. Estas URL no pasan
por él.

Y no pueden: **ninguna tiene un fichero detrás**. `/@fudic/h/<tag>.js` es `<path>.fud?client`,
un id que el grafo de módulos conoce y que nadie publica; `fudic-main.js`, `fudic-boot.js` y
`fudic-sw.js` son módulos virtuales. El middleware existe justo para que esas URL no sean un
404 (SDD-17 §4.7.1), y al rodear a Vite se quedó también sin lo que Vite hacía de paso.

### 2.2. Alcance — a qué URL afecta

Las cinco que responde ese middleware, que son todas las suyas:

| URL | qué es | tenía mapa |
|---|---|---|
| `/@fudic/h/<tag>.js` | el chunk de cliente de un componente | no |
| `/@fudic/h/<nombre-de-ruta>.js` | el de una ruta (SDD-39 §4.12) | no |
| `/@fudic/h/<tag>.ioc.js` | el módulo IoC de un componente (SDD-38 §4.5) | no |
| `fudic-main.js` / `fudic-boot.js` | los dos bootstraps | no tiene ninguno que perder |
| `fudic-sw.js` | el Service Worker de render | idem |

**La causa raíz es una línea**, y el alcance es esa línea.

---

## 3. Interfaz pública

Una función nueva, exportada por `src/dev.ts` junto a los otros helpers de dev:

```ts
/** A dev module with its source map attached inline, ready to be written to the response. */
export function withInlineSourceMap(code: string, map: unknown): string;
```

Nada más cambia: ni las opciones del plugin, ni las URL, ni las cabeceras.

---

## 4. Comportamiento corregido

El middleware escribe las dos mitades:

```ts
res.end(result === null ? '' : withInlineSourceMap(result.code, result.map));
```

Tres reglas:

1. **Inline, no una URL de mapa.** El módulo no es un fichero, así que no hay una segunda
   URL desde la que servir el `.map` ni un middleware que la contestara. Un `data:` URI es
   la única forma que no obliga a inventar una ruta más.
2. **Un mapa sin `mappings` no se adjunta.** Es lo que devuelve un transform que no produjo
   nada que mapear, y un comentario apuntando a un mapa vacío es un parse en el navegador
   para no decir nada.
3. **Un módulo sin mapa se escribe tal cual.** `fudic-main.js` lo escribe el emit y no
   procede de ningún fuente: no hay nada a lo que volver, y ahí la ausencia es correcta.

El código va delante y el comentario detrás, sin tocar una línea del módulo: lo que el
navegador ejecuta es byte a byte lo que ejecutaba antes.

---

## 5. Invariantes

**El que violaba.** *Lo que el compilador sabe del fuente llega hasta donde se lee.* Es el
invariante de BUG-31 §T3 —el `.fud` → JS compuesto en un solo mapa, para que el código
generado no sea invisible al depurador— y en dev se perdía en el último metro, al escribir
la respuesta.

**El que añade.** **Un middleware que sustituye al de Vite asume lo que el de Vite hacía.**
Rodear el pipeline para resolver un id que nadie publica es legítimo; heredar solo la mitad
del comportamiento, no. Toda respuesta que este plugin escribe por su cuenta lleva lo que
llevaría si la hubiera escrito Vite.

---

## 6. Criterios de aceptación

1. **El módulo servido lleva su mapa, y el mapa lleva el `.fud`.** Contra un servidor de
   dev real, `/@fudic/h/dev-widget.js` trae el comentario `data:application/json;base64,`;
   decodificado, sus `sources` nombran `dev-widget.fud` y su `sourcesContent` contiene el
   código que escribió el autor. `packages/vite/test/dev.test.ts`
2. **El helper codifica lo que le dan y no toca el código.** El mapa vuelve idéntico al
   decodificar, y el módulo sigue empezando por donde empezaba.
   `packages/vite/test/dev-unit.test.ts`
3. **Sin mapa, el código sale intacto** — `null` y `undefined`, que es lo que devuelve un
   módulo generado.
4. **Con `mappings` vacío, tampoco se adjunta.**

**Visto fallar.** Con la línea revertida a escribir solo el código, el criterio 1 cae.

**Medido en el navegador** (`pnpm dev` de `examples/basic`): `/@fudic/h/ruta-reloj.js` y
`/@fudic/h/app-clock.js` pasan de 0 a 1 `sourceMappingURL`; el mapa inline trae
`sources: ["ruta-reloj.fud"]` y 3 170 B de `sourcesContent`. `fudic-main.js` sigue sin
mapa, que es lo correcto.

**Cobertura.** El código nuevo nace al 100 % en las cuatro métricas: `withInlineSourceMap`
tiene tres caminos y los cuatro tests los recorren, sin un solo `ignore`. El suelo del
paquete sube —96,19 / 90,17 / 96,37 / 96,09 → **96,20 / 90,21 / 96,38 / 96,10**.

---

## 7. Fuera de alcance

- **`fudic-main.js` y los dos bootstraps no ganan un mapa.** Son código que el emit escribe
  y que no procede de ningún fuente del autor; darles uno exigiría que los emisores de
  `bootstrap.ts` llevaran spans, que es otro problema y de otro tamaño.
- **`loadWithSourceMap`** (`src/inputmaps.ts`), anotado en [BUG-34](./BUG-34-tabla-de-rutas-por-modulo.md)
  §7: relee y parsea los mismos `dist/*.js.map` en los cuatro builds sin caché, ~170 ms. Es
  de mapas y es del mismo paquete, pero es del **build** y no toca ni una línea de esta
  corrección.
- **El runtime de una ruta**, que es [BUG-35](./BUG-35-ruta-reactiva-sin-runtime.md): otro
  paquete, ni una línea en común.
