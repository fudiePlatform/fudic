# BUG-06 — Tareas

> **BUG:** [BUG-06 — Los builds anidados ignoran el `build.minify` del host](./BUG-06-minify-no-heredado.md)
> **Paquete:** `@fudic/vite` · **Rama:** worktree `fix-build-output`
> **Depende de:** [BUG-05](./BUG-05-Task.md) en `Hecho`
> **Progreso:** 7 / 7 — `Hecho`

Cada tarea es un paso cerrado: se implementa, se verifica y se marca. Las rutas son
relativas a la raíz del repo.

Este BUG es pequeño de código y grande de verificación: el cambio son tres líneas, y lo que
cuesta es demostrar que un chunk minificado **se sigue pudiendo enlazar y ejecutar**. La
tarea 3 es el BUG entero; el resto es plomería.

---

## Fase 1 — Rojo primero (2)

- [x] **1. Las dos salidas no están minificadas.**
      En `packages/vite/test/build-sw-selfcontained.test.ts` y `link.test.ts`: con el
      `minify` por defecto, `fudic-sw.js` no contiene `//#region` ni indentación de bloque;
      un `sw/c/*.js` no contiene `var tag = ` con espacios. **Verlo fallar** (§6.1).
- [x] **2. Un chunk minificado se enlaza y renderiza.**
      En `link.test.ts`: pasar el chunk emitido por el linker de `@fudic/transport`
      (`new Function('exports','require','module', code)`, como
      `packages/transport/src/linker.ts:81-92`) e invocar `render`; el HTML resultante es el
      mismo que sin minificar. **Escribirlo contra el código de hoy y verlo pasar en
      verde** — es la línea base contra la que se compara después de minificar (§6.2).

## Fase 2 — El cambio (2)

- [x] **3. `minify` en `NestedOutputOptions`.**
      Añadir el campo (§3.1) a la interfaz que creó BUG-05, y capturar
      `config.build.minify` en `configResolved` (`packages/vite/src/plugin.ts:116-134`),
      junto a `sourcemap` y `resolveAlias`.
- [x] **4. Fuera los dos `minify: false`.**
      `packages/vite/src/swbuild.ts:83` y `packages/vite/src/link.ts:155`: usar el valor
      heredado. Verde en 1, y la tarea 2 **debe seguir en verde** — si se pone roja, el
      minificador ha tocado la forma CJS y hay que mirar `preserveEntrySignatures`
      (`link.ts:160`) antes de tocar nada más.

## Fase 3 — Lo que no se puede romper (3)

- [x] **5. La opción se respeta en los dos sentidos.**
      Test con `build.minify: false` explícito: las dos salidas salen sin minificar (§6.3).
      Es el que convierte esto en «heredar configuración» y no en «minificar siempre».
- [x] **6. `BUILD_TOKEN` sobrevive.**
      Con minificación activa: ningún artefacto contiene `__FUDIC_BUILD__` y el id sigue
      siendo `/^[0-9a-f]{8}$/` (§6.4). Regresión de BUG-03 §6.4 bajo condiciones nuevas.
- [x] **7. Minify + sourcemap a la vez.**
      El test posicional de BUG-05 §6.7, repetido con minificación activada: la posición
      conocida del `fudic-sw.js` emitido sigue resolviendo a la línea correcta del fuente
      (§6.5). Y las regresiones de BUG-03: cero `import` en `fudic-sw.js`, siete chunks en
      `sw/c/`, manifest apuntándolos (§6.6, §6.7).

---

## Cierre del BUG

- [x] `pnpm typecheck`, `pnpm test` y `pnpm build` en verde.
- [x] `swbuild.ts` al **100 %**; `link.ts` y `plugin.ts` no bajan de ramas respecto a `main`.
- [x] Anotar en el registro de progreso el tamaño **antes y después** de `dist/fudic-sw.js` y
      de los siete `sw/c/*.js`. La medición es la mitad del argumento de §2.5 y hay que
      dejarla escrita, no deducirla.
- [x] Extremo a extremo: `pnpm --filter @fudic/example-basic exec playwright test` en verde
      — el SW minificado tiene que seguir sirviendo y renderizando igual.
- [x] Marcar BUG-06 como `Hecho` en [INDEX.md](./INDEX.md) (tabla + registro de progreso).
- [x] Anotar en [BUG-03](./BUG-03-chunks-compartidos-sw.md) §7 una línea: la minificación del
      SW deja de estar fuera de alcance por la razón de §2.5 —configuración ignorada, no
      tamaño—, con enlace a este BUG. Un *Fuera de alcance* que deja de serlo se anota; no se
      borra.
