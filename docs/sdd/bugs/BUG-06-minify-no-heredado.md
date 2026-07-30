# BUG-06 — Los builds anidados ignoran el `build.minify` del host

> **Estado:** `Listo`
> **Corrige:** [SDD-20 — Render en el Service Worker](../SDD-20-render-sw.md) §4.1 y §4.3,
> y matiza el *Fuera de alcance* de [BUG-03](./BUG-03-chunks-compartidos-sw.md) §7
> **Paquete:** `@fudic/vite`
> **Rama sugerida:** worktree compartido `fix-build-output`
> **Depende de:** [BUG-05](./BUG-05-Task.md) en `Hecho` — introduce la costura `NestedOutputOptions`
> que este BUG solo amplía, y deja los mapas hechos para poder comprobar que siguen siendo
> correctos con el código minificado.

---

## 1. Contexto y síntoma

Ocho ficheros del `dist` salen sin minificar, con la configuración por defecto de Vite
(`build.minify: 'oxc'`) y sin que nadie haya pedido lo contrario:

```sh
pnpm build && head -c 120 examples/basic/dist/fudic-sw.js
#=> //#region \0rolldown/runtime.js
#=> var __defProp = Object.defineProperty;
```

| salida | primeras bytes | ¿minificado? |
|---|---|---|
| `dist/assets/app-badge-*.js` | `var e=\`app-badge\`,t=…` | ✅ |
| `dist/fudic-sw.js` (31,73 kB) | `//#region \0rolldown/runtime.js` | ❌ |
| `dist/sw/c/app-badge-*.js` | `var tag = "app-badge";` | ❌ |

**Un aviso sobre el síntoma que despista.** En el log de `vite build` estos ocho ficheros
aparecen **sin columna `gzip`**, y eso *no* es la señal: rolldown solo calcula el tamaño
comprimido de los chunks y de los assets `.html`/`.json`, así que un `.js` emitido como
**asset** nunca la lleva, esté minificado o no. La prueba es el contenido, no el log.

---

## 2. Causa raíz

### 2.1. Está desactivado a mano, en los dos sitios

- [`swbuild.ts:83`](../../../packages/vite/src/swbuild.ts#L83) — `minify: false`.
- [`link.ts:155`](../../../packages/vite/src/link.ts#L155) — `minify: false`.

Ninguno de los dos lleva comentario que lo justifique, en un fichero donde cada opción no
obvia lo lleva. Es un default de andamiaje que se quedó.

### 2.2. Y aunque no lo estuviera, no habría de dónde heredarlo

Los dos builds corren con `configFile: false`
([`swbuild.ts:74`](../../../packages/vite/src/swbuild.ts#L74),
[`link.ts:147`](../../../packages/vite/src/link.ts#L147)) y `configResolved`
([`plugin.ts:116-134`](../../../packages/vite/src/plugin.ts#L116-L134)) **no captura
`config.build.minify`**. Es exactamente el mismo hueco que BUG-05 §2.1 documenta para
`sourcemap`: la lista de lo que se reenvía tiene `resolve.alias` y nada más.

### 2.3. El minificador del host no puede alcanzarlos

Aunque se borrasen las dos líneas de §2.1, el host seguiría sin poder minificarlos: las dos
salidas entran en el bundle como **assets**
([`plugin.ts:436`](../../../packages/vite/src/plugin.ts#L436),
[`plugin.ts:473-477`](../../../packages/vite/src/plugin.ts#L473-L477)), y la minificación
corre en `renderChunk`, que **un asset no atraviesa**. La única minificación posible es la
del propio build anidado. Por eso este BUG es de configuración heredada y no «añadir un
minificador».

### 2.4. Alcance

- **Los ocho ficheros de §1**, y cualquier salida futura que use la misma vía.
- **`fudic-sw.js` cuenta doble**: se descarga en cada actualización del worker y, por
  `updateViaCache: 'none'` ([`main.ts:14`](../../../packages/transport/src/main.ts#L14)),
  nunca desde la caché HTTP.
- **El CSS no se arregla con esto.** Va dentro de un template literal y ningún minificador
  de JS entra ahí: [BUG-08](./BUG-08-css-verbatim.md).

### 2.5. Por qué esto es un bug y no la optimización que BUG-03 aplazó

[BUG-03 §7](./BUG-03-chunks-compartidos-sw.md) dice, y sigue siendo verdad:

> **Minificar o dividir el SW por tamaño.** Un SW autocontenido es más grande; se descarga
> una vez por build […] Si algún día molesta, es una decisión de rendimiento con medición,
> no un bug.

Este BUG **no es esa decisión**, y no la reabre. Lo que se corrige aquí no es «el SW pesa
mucho», es que **una opción que el usuario configura se ignora en silencio**: quien escribe
`build.minify` en su `vite.config.ts` lo escribe para toda su salida, y el plugin le emite
ocho ficheros que no la respetan sin decírselo. El tamaño es la consecuencia, no el
argumento. Si mañana alguien pone `minify: false` a propósito, esa configuración también se
va a respetar, que hoy tampoco pasa: se acierta por accidente.

---

## 3. Interfaz pública

### 3.1. `NestedOutputOptions` gana un campo

Sobre lo que introduce [BUG-05 §3.1](./BUG-05-sourcemaps-builds-anidados.md):

```ts
export interface NestedOutputOptions {
  readonly sourcemap: boolean | 'inline' | 'hidden';
  readonly minify: boolean | 'oxc' | 'esbuild' | 'terser';   // ← este BUG
}
```

Las firmas de `buildServiceWorker` y `runLinkPass` **no cambian**: ya reciben el objeto.

### 3.2. Sin cambios

- El contrato de salida del build (nombres, número de ficheros, ausencia de imports en
  `fudic-sw.js`) es idéntico. Solo cambian los bytes de dentro.
- `@fudic/transport`, `sw.json` y el manifest no participan.

---

## 4. Comportamiento corregido

### 4.1. Los dos builds anidados minifican lo que diga el host

`minify: false` desaparece de los dos sitios y se sustituye por el valor heredado. La regla
es la de BUG-05 §4.1, ya enunciada: **un build anidado hereda la configuración de salida del
host.** Este BUG es la segunda aplicación de la misma regla, no una regla nueva.

### 4.2. `BUILD_TOKEN` tiene que sobrevivir a la minificación

`__FUDIC_BUILD__` vive dentro de un string literal, y ningún minificador toca el contenido
de un literal — pero el orden sí importa: la sustitución
([`plugin.ts:476`](../../../packages/vite/src/plugin.ts#L476)) corre **después** del build
anidado, así que opera sobre el código ya minificado. Sigue funcionando, y §6.4 lo fija como
criterio en vez de dejarlo a la buena fe. Un `__FUDIC_BUILD__` superviviente produce cachés
`shell-__FUDIC_BUILD__` que `isStaleCache` no purga nunca (BUG-03 §4.3).

### 4.3. Los chunks del link pass siguen siendo enlazables

Es el riesgo real de este BUG. El linker evalúa cada chunk con
`new Function('exports', 'require', 'module', code)`
([`linker.ts:81-92`](../../../packages/transport/src/linker.ts#L81-L92)) y busca `render`
como propiedad del objeto `exports`. Un minificador renombra **locales**, no propiedades
asignadas a `exports`, y `preserveEntrySignatures: 'strict'`
([`link.ts:160`](../../../packages/vite/src/link.ts#L160)) ya impide que el entry pierda sus
exports. La corrección no relaja ninguna de las dos cosas, y §6.2 lo comprueba de verdad:
enlazando y renderizando, no leyendo el código.

### 4.4. Los mapas siguen siendo correctos

Con BUG-05 en `Hecho`, el mapa se genera dentro del build anidado y describe el código
minificado. La combinación `minify + sourcemap` es la que de verdad se va a usar en
producción, y §6.5 la prueba junta.

---

## 5. Invariantes

**Los que el bug violaba**

- *Toda salida del build honra la configuración del usuario.* El mismo invariante que
  BUG-05, incumplido por la misma vía y en las mismas dos funciones.
- *Cada opción no obvia lleva su porqué.* Dos `minify: false` sin comentario en ficheros
  donde hasta `codeSplitting: false` tiene tres líneas de explicación.

**Los que la corrección añade**

- **Un build anidado hereda la configuración de salida del host**, y lo que no herede se
  justifica por escrito.
- **`BUILD_TOKEN` sobrevive a cualquier transformación del código anterior a su
  sustitución.** Fijado por test, no por inspección.
- **Un chunk enlazable sigue siendo enlazable tras minificar.** Comprobado ejecutándolo.

---

## 6. Criterios de aceptación

Tests en `packages/vite/test/swbuild.test.ts`, `link.test.ts` y
`build-sw-selfcontained.test.ts`.

1. **(rojo primero)** Con el `minify` por defecto, `dist/fudic-sw.js` no contiene
   `//#region` ni saltos de línea con indentación de bloque, y su tamaño baja respecto al
   build anterior. Igual para `sw/c/*.js`.
2. **(rojo primero)** Un chunk del link pass **minificado** se enlaza y renderiza: pasarlo
   por el linker de `@fudic/transport` y obtener el mismo HTML que sin minificar. Es §4.3 y
   es el criterio que justifica el BUG entero.
3. Con `build.minify: false` explícito, las dos salidas salen **sin** minificar. La opción
   se respeta en los dos sentidos, no solo en el que reduce bytes.
4. Ningún artefacto contiene `__FUDIC_BUILD__` y el id sigue siendo 8 hexadecimales, con
   minificación activada (regresión de BUG-03 §6.4 bajo condiciones nuevas).
5. Con `minify` **y** `sourcemap` a la vez: los `.map` de BUG-05 §6.7 siguen resolviendo a
   la línea correcta del fuente.
6. `dist/fudic-sw.js` sigue sin ningún `import` (regresión de BUG-03 §6.1) y sigue
   llamándose así, sin hash.
7. Los siete chunks de `sw/c/` siguen existiendo con los mismos nombres lógicos y el
   manifest los sigue apuntando.

**Cobertura.** `swbuild.ts` sigue al 100 %. `link.ts` y `plugin.ts` no bajan de ramas.

---

## 7. Fuera de alcance

- **Reabrir si el SW debe ser un bundle autocontenido.** BUG-03 §4.1 lo decidió; aquí solo
  se minifica lo que ya se emite.
- **Elegir minificador o afinar sus opciones** (`terser` vs `oxc`, `mangle`, `drop_console`).
  Se hereda lo que diga el host, punto.
- **El HTML y su script inline:** [BUG-07](./BUG-07-html-sin-minificar.md).
- **El CSS dentro de los template literals:** [BUG-08](./BUG-08-css-verbatim.md). No lo
  arregla ningún minificador de JS, por diseño del lenguaje.
- **Los mapas:** [BUG-05](./BUG-05-sourcemaps-builds-anidados.md), que va antes.
