# BUG-05 — El Service Worker y los chunks enlazables se emiten sin source map

> **Estado:** `Listo`
> **Corrige:** [SDD-19 — Plugin de Vite](../SDD-19-plugin-vite.md) §4.6, y los dos builds
> anidados de [SDD-20](../SDD-20-render-sw.md) §4.1 y §4.3
> **Paquete:** `@fudic/vite`
> **Rama sugerida:** worktree compartido `fix-build-output` (BUG-05 → BUG-06 → BUG-07/08)
> **Depende de:** nada. Va **primero**: BUG-06 activa la minificación sobre estos mismos
> dos builds, y un mapa que no existe no se puede validar contra código minificado.

---

## 1. Contexto y síntoma

Con `build.sourcemap` activado, el build emite mapas para todo el grafo de cliente y
**ninguno** para las dos salidas que produce el propio plugin:

```sh
pnpm build && pnpm --filter @fudic/example-basic exec vite build --sourcemap
```

| salida | `.map` |
|---|---|
| `dist/fudic-main.js` | ✅ 2,84 kB |
| `dist/assets/*.js`, `dist/assets/c/*.js` | ✅ |
| `dist/fudic-sw.js` (31,73 kB) | ❌ ninguno |
| `dist/sw/c/*.js` (7 ficheros) | ❌ ninguno |

El efecto práctico: `fudic-sw.js` es el fichero donde vive el router, la política de caché
y el `install` —lo que más se depura de este framework— y es el único al que no se puede
poner un breakpoint con sentido. En DevTools → Application → Service Workers, el paso a
paso ocurre sobre 31,7 kB de bundle sin nombres.

**Lo que NO es el bug.** El grafo de cliente está bien: [`transform.ts:60-71`](../../../packages/vite/src/transform.ts#L60-L71)
construye el Source Map v3 desde los anchors del emit y
[`plugin.ts:423`](../../../packages/vite/src/plugin.ts#L423) lo devuelve a Vite, que lo
encadena. No se veían mapas porque **`build.sourcemap` es `false` por defecto en Vite** y
[`examples/basic/vite.config.ts`](../../../examples/basic/vite.config.ts) no lo activa. Eso
es un default, no un defecto, y este BUG no lo cambia (§7).

El defecto es que en los dos builds anidados el mapa **no se puede obtener aunque se pida**.

---

## 2. Causa raíz

### 2.1. Los builds anidados no piden mapas, y su tipo de retorno no tiene dónde ponerlos

Los dos corren con `configFile: false` —correcto, evita la recursión— y por tanto **no
heredan nada** del host. Ninguno de los dos pasa `sourcemap`:

- [`swbuild.ts:73-97`](../../../packages/vite/src/swbuild.ts#L73-L97) — las opciones de
  `build` son `write`, `emptyOutDir`, `minify` y `rollupOptions`. No hay `sourcemap`.
- [`link.ts:146-171`](../../../packages/vite/src/link.ts#L146-L171) — idéntico.

Y aunque lo pidieran, el mapa no tendría por dónde salir: los tipos de retorno no lo
contemplan.

- [`swbuild.ts:23-28`](../../../packages/vite/src/swbuild.ts#L23-L28) — `SwBuildResult` es
  `{ fileName, code }`.
- [`swbuild.ts:110-113`](../../../packages/vite/src/swbuild.ts#L110-L113) — `swChunkOf`
  devuelve `entry?.code ?? ''` y descarta el resto del chunk, `map` incluido.
- [`link.ts:23-26`](../../../packages/vite/src/link.ts#L23-L26) — `LinkChunk` es
  `{ fileName, code }`.
- [`link.ts:181`](../../../packages/vite/src/link.ts#L181) — `chunks.push({ fileName, code })`.

### 2.2. El link pass tira a la basura el mapa del `.fud`

Este es el que hace que la corrección no sea solo «activar una opción». El plugin del link
pass compila `.fud` y **descarta el mapa que el compilador acaba de construir**:

- [`link.ts:89-96`](../../../packages/vite/src/link.ts#L89-L96) —
  `return result === null ? null : { code: result.code };`
- [`transform.ts:100-105`](../../../packages/vite/src/transform.ts#L100-L105) — pero
  `transformFud` devuelve `{ code, map, missingAssets, diagnostics }`, con el mapa ya hecho.

Contrasta con el build principal, que sí lo propaga
([`plugin.ts:423`](../../../packages/vite/src/plugin.ts#L423)).

Consecuencia exacta: activar `sourcemap` en el build anidado del link pass produciría un
mapa **válido y aun así inútil** — llevaría del chunk CJS al JavaScript que el emit
generó, no al `.fud` que lo originó. La cadena se corta en `link.ts:95`, no en el bundler.

### 2.3. Emitidos como asset, Vite no escribe su `.map`

Las dos salidas entran en el bundle como **assets**, no como chunks:

- [`plugin.ts:436`](../../../packages/vite/src/plugin.ts#L436) — los chunks del link pass.
- [`plugin.ts:473-477`](../../../packages/vite/src/plugin.ts#L473-L477) — el SW.

Vite escribe el `.map` y añade el `//# sourceMappingURL=` de **sus** chunks. Un asset es una
tira de bytes con nombre: nadie le va a escribir un fichero hermano. Hay que emitir el
`.map` como un segundo asset y añadir el comentario a mano.

### 2.4. La sustitución de `BUILD_TOKEN` desplaza el código bajo el mapa

La trampa de este BUG, y la razón de que el orden importe:

- [`constants.ts:26`](../../../packages/vite/src/constants.ts#L26) —
  `BUILD_TOKEN = '__FUDIC_BUILD__'`, **15 caracteres**.
- [`plugin.ts:464-468`](../../../packages/vite/src/plugin.ts#L464-L468) — `buildId` es un
  sha256 recortado a **8 caracteres**.
- [`plugin.ts:476`](../../../packages/vite/src/plugin.ts#L476) —
  `sw.code.split(BUILD_TOKEN).join(buildId)` corre **sobre el código ya generado**.

Cada ocurrencia acorta el fichero en 7 caracteres. Un mapa producido por el build anidado
describe el código *anterior* a esa sustitución: a partir de la primera ocurrencia, todas
las columnas generadas quedan corridas. El mapa existiría, validaría y **apuntaría mal**,
que es peor que no tenerlo.

Es la misma clase de defecto que BUG-03 §4.3 vigila con su criterio §6.4, y por la misma
línea de código.

### 2.5. Alcance

- **El prerender se queda igual de ciego.**
  [`prerender.ts:51-58`](../../../packages/vite/src/prerender.ts#L51-L58) materializa el
  bundle a un directorio temporal escribiendo solo `code`/`source`, sin `.map`. Cuando una
  página revienta al prerenderizar, el `catch` de
  [`plugin.ts:535`](../../../packages/vite/src/plugin.ts#L535) reporta un stack sobre JS
  generado sin mapa. Node además exige `--enable-source-maps` para consumirlo.
- **El SW mapea al `dist` de `@fudic/transport`.** Su bundle se construye desde ese `dist`,
  así que el mapa lleva a `packages/transport/dist/router.js`, `store.js`, `linker.js` —
  salida de `tsc` sin minificar, con sus nombres y sus comentarios. Es donde vive la lógica
  que se quiere depurar y es lo que resuelve el síntoma.
  Lo que **no** ocurre solo: llegar hasta el `.ts`. El `dist` emite sus `.js.map`, pero el
  bundler no consume los mapas de sus entradas por su cuenta; haría falta que el build
  anidado los cargara fichero a fichero. Medido, no supuesto: los 12 `sources` del mapa del
  SW son todos `.js`. Queda fuera de alcance (§7).
- **Dev no está afectado.** En `serve` el grafo de módulos de Vite sirve los bootstraps y
  el mapa fluye por el camino normal ([`plugin.ts:331-334`](../../../packages/vite/src/plugin.ts#L331-L334)).

---

## 3. Interfaz pública

Cambia la superficie interna de `@fudic/vite`. Nada de `@fudic/transport`.

### 3.1. Las dos funciones de build anidado reciben la configuración de salida del host

Se introduce **una sola** costura, compartida, porque BUG-06 va a añadirle un campo:

```ts
/** Lo que un build anidado hereda del host (§4.1). BUG-06 añade `minify`. */
export interface NestedOutputOptions {
  readonly sourcemap: boolean | 'inline' | 'hidden';
}

export function buildServiceWorker(
  root: string, base: string, options: SwBootstrapOptions,
  alias: unknown, output: NestedOutputOptions,
): Promise<SwBuildResult>;

export function runLinkPass(
  root: string, base: string, builds: readonly RouteBuild[],
  io: ResolveIo, output: NestedOutputOptions,
): Promise<LinkResult>;
```

### 3.2. Los dos resultados llevan su mapa

```ts
export interface SwBuildResult {
  readonly fileName: string;
  readonly code: string;
  /** Ausente cuando `sourcemap` es `false` o `'inline'` — no `undefined` (exactOptionalPropertyTypes). */
  readonly map?: string;
}

export interface LinkChunk {
  readonly fileName: string;
  readonly code: string;
  readonly map?: string;
}
```

`exactOptionalPropertyTypes` obliga: cuando no hay mapa el campo **se omite**, no se pone a
`undefined`.

### 3.3. `swChunkOf` deja de devolver un string

Pasa a devolver `{ code, map? }` para no descartar la mitad del chunk
([`swbuild.ts:110`](../../../packages/vite/src/swbuild.ts#L110)). Su razón de existir —que
el caso «no hay tal chunk» sea una rama probada— se conserva.

### 3.4. Sin cambios

- `transformFud` y `TransformResult` ya devuelven el mapa. No se tocan.
- El `transform` del plugin ([`plugin.ts:423`](../../../packages/vite/src/plugin.ts#L423))
  ya es correcto.
- `sw.json`, el manifest y el runtime del SW no participan.

---

## 4. Comportamiento corregido

### 4.1. Los builds anidados heredan `build.sourcemap`

`configResolved` ([`plugin.ts:116-134`](../../../packages/vite/src/plugin.ts#L116-L134))
captura `config.build.sourcemap` junto a `resolveAlias`, y lo pasa a las dos llamadas. La
regla: **un build anidado hereda la configuración de salida del host; lo que no herede es
una decisión que hay que justificar por escrito, no un olvido.**

### 4.2. El link pass propaga el mapa del `.fud`

[`link.ts:95`](../../../packages/vite/src/link.ts#L95) devuelve `{ code, map }` con el mapa
de `transformFud`. El bundler lo encadena con el suyo, y el mapa final del chunk `sw/c/*.js`
lleva al `.fud`, no al JS intermedio. Sin esto, §4.1 produce mapas que no sirven para nada.

### 4.3. El `.map` se emite como asset hermano

Para cada salida con mapa, dos `emitFile`: el código con `//# sourceMappingURL=<nombre>.map`
al final, y el `.map`. Los nombres siguen la convención de Vite: `fudic-sw.js.map`,
`sw/c/<name>-<hash>.js.map`.

Con `sourcemap: 'hidden'` se emite el `.map` **sin** el comentario. Con `'inline'`, el mapa
va como data URI dentro del código y no hay segundo asset.

### 4.4. El mapa del SW describe el código que se emite, no el anterior

**Resuelto: la sustitución preserva longitudes.** `BUILD_TOKEN` pasa de `__FUDIC_BUILD__`
(15 caracteres) a un token de **8**, la misma longitud que el `buildId`. El mapa deja de
poder desalinearse *por construcción*, en vez de por un paso de corrección que alguien
tendría que recordar, y el criterio §6.4 de BUG-03 —«8 hexadecimales»— no cambia de
significado: solo se actualiza el literal en dos asserts.

Las otras dos vías y por qué no:

- **Rellenar el id a 15** (`buildId.padEnd(15, '0')`) rompe el test `/^[0-9a-f]{8}$/u` de
  [`build-sw-selfcontained.test.ts:132`](../../../packages/vite/test/build-sw-selfcontained.test.ts#L132),
  que está anclado: tocaría un criterio de un BUG cerrado.
- **Corregir el mapa tras sustituir** obliga a decodificar y re-emitir VLQ de las columnas
  generadas. No toca nada ajeno, y es el más caro y el más frágil.

Y la vía obvia no existe: el `buildId` **hashea `sw.code`**
([`plugin.ts:466`](../../../packages/vite/src/plugin.ts#L466)), así que no se puede sustituir
dentro del build anidado — el id no existe hasta que el código está hecho.

### 4.5. El prerender materializa también los mapas

`materializeBundle` ([`prerender.ts:51-58`](../../../packages/vite/src/prerender.ts#L51-L58))
escribe el `.map` de cada chunk que lo tenga, para que el stack de un fallo de prerender
([`plugin.ts:535`](../../../packages/vite/src/plugin.ts#L535)) sea legible. El temp dir es
efímero y solo se usa en build: no hay coste en el artefacto final.

---

## 5. Invariantes

**Los que el bug violaba**

- *SDD-19 §4.6* — «`transform` devuelve `{ code, map }` […] Vite encadena el map por el resto
  de su pipeline». Se cumple en el build principal y se incumple en el link pass, que es el
  otro consumidor del mismo `transformFud`.
- *Un artefacto emitido se puede depurar.* Vale para `fudic-main.js`; no valía para el
  fichero que más se depura.
- *Toda salida del build honra la configuración del usuario.* `build.sourcemap` era una
  opción que el plugin ignoraba en silencio: ni la aplicaba ni avisaba.

**Los que la corrección añade**

- **Un build anidado hereda la configuración de salida del host.** Enunciado en §4.1 y
  reutilizado tal cual por BUG-06.
- **Un mapa emitido describe los bytes emitidos.** Ninguna transformación posterior a la
  generación del mapa puede cambiar longitudes (§4.4).
- **Toda cadena de mapas termina en un fichero fuente**, `.fud` o `.ts`, nunca en un
  artefacto intermedio.

---

## 6. Criterios de aceptación

Tests en `packages/vite/test/swbuild.test.ts`, `link.test.ts` y
`build-sw-selfcontained.test.ts`, más una comprobación sobre el artefacto de
`examples/basic`.

1. **(rojo primero)** Con `build.sourcemap: true`, el bundle contiene `fudic-sw.js.map`, y
   `fudic-sw.js` termina con `//# sourceMappingURL=fudic-sw.js.map`.
2. **(rojo primero)** Con `build.sourcemap: true`, cada `sw/c/*.js` tiene su `.map` hermano
   y su comentario.
3. **(rojo primero)** El `sources` del mapa de un chunk del link pass contiene la ruta de un
   `.fud`. Es el criterio que cubre §2.2 y el único que distingue un mapa útil de uno
   meramente presente.
4. El mapa del SW alcanza el runtime que bundlea: `sources` incluye al menos una ruta bajo
   `packages/transport`.
5. **(rojo primero)** Con `build.sourcemap: false` (el default) no se emite ningún `.map` ni
   ningún `sourceMappingURL`. La corrección no cambia el default de Vite.
6. `sourcemap: 'hidden'` emite el `.map` y **no** el comentario. `'inline'` emite el data URI
   y **ningún** fichero `.map`.
7. **(rojo primero, el de §4.4)** Con `sourcemap: true`, tomar una posición conocida del
   `fudic-sw.js` **emitido** (p. ej. el inicio de `addEventListener('activate'`) y resolverla
   por el mapa cae en la línea correspondiente del fuente. Con la sustitución de
   `BUILD_TOKEN` cambiando longitudes, este test falla; con §4.4 aplicado, pasa.
8. Ningún artefacto contiene `__FUDIC_BUILD__` y el id sigue siendo 8 hexadecimales
   (regresión de BUG-03 §6.4, intacta si se elige la vía (a)).
9. `swChunkOf` sobre una salida sin el chunk esperado sigue devolviendo código vacío y sin
   mapa, sin lanzar (la rama probada de [`swbuild.ts:110-113`](../../../packages/vite/src/swbuild.ts#L110-L113)).
10. **Extremo a extremo:** `vite build --sourcemap` sobre `examples/basic` produce
    `dist/fudic-sw.js.map` y siete `dist/sw/c/*.js.map`.

**Cobertura.** `swbuild.ts` está al 100 % y **no baja**. `link.ts` y `plugin.ts` no bajan de
su cifra actual de ramas.

---

## 7. Fuera de alcance

- **Activar `build.sourcemap` por defecto**, en el plugin o en el ejemplo. Es el default de
  Vite y es del usuario, no nuestro. Este BUG hace que la opción funcione, no que se active.
- **La minificación de esas mismas salidas:** [BUG-06](./BUG-06-minify-no-heredado.md). Toca
  las mismas líneas, pero el contrato que introduce §3.1 está pensado para que solo añada un
  campo.
- **Mapas para el HTML prerenderizado.** Un `.html` no tiene mapa; lo que se arregla en §4.5
  es el stack de un fallo *durante* el prerender.
- **Reescribir `SourceMapBuilder`** (SDD-13). Aquí no se construye ningún mapa nuevo: se
  propagan los que ya existen.
- **Encadenar el mapa del SW hasta el `.ts` de `@fudic/transport`** (§2.5). Exigiría que el
  build anidado cargara el `.js.map` hermano de cada entrada. El salto de «31,7 kB sin
  nombres» a «`dist/store.js` con sus nombres» ya resuelve el síntoma; el salto siguiente es
  otra conversación, con su propia medición.
- **`--enable-source-maps` en el proceso de build.** Es una bandera de quien ejecuta.
