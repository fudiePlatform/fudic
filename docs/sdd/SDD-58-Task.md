# SDD-58 — Tareas

> **SDD:** [SDD-58 — Traducciones y pipes](./SDD-58-traducciones-y-pipes.md)
> **Paquetes:** `@fudic/i18n` (nuevo) · `@fudic/compiler` · `@fudic/config` · `@fudic/vite` ·
> `@fudic/language-core` · `@fudic/language-server` · `@fudic/diagnostics` · `examples/i18n` (nuevo)
> **Rama:** `sdd-58-i18n`
> **Progreso:** 0 / 46 — `Listo`.

El orden va de dentro afuera. Primero los diagnósticos y la config. Luego el paquete
`@fudic/i18n`, que no depende de nadie. Después el compilador, primero extraer y luego compilar
por idioma. Detrás vienen el plugin, que une las piezas, y el editor. La evidencia va al final y la
construye `examples/i18n` como lo haría un usuario. Cada fase se commitea al cerrarla, con sus
tests.

---

## Fase 1 — Diagnósticos y config

- [ ] 1. `FUD1020`–`FUD1026` en `@fudic/diagnostics`: un `.ts` y un `.md` por código, con la
  severidad de §3.6 y una línea por código en `index.ts`, en orden.
- [ ] 2. `FUD0725` gana `problem: 'locales'`: el valor en la unión y una línea en su `.md`.
- [ ] 3. `ProjectConfig.locales` en `@fudic/config`: `readLocales` con `Intl.getCanonicalLocales`
  rechaza el array vacío, las repetidas y las inválidas, y subraya la clave. Tests del criterio 1.

## Fase 2 — `@fudic/i18n`

- [ ] 4. Paquete nuevo:
  - `package.json` con versiones exactas, `sideEffects: false` y
    `"fudic": { "runtime": "./runtime" }`, siguiendo la plantilla de `@fudic/forms`;
  - `tsconfig` que extiende la base;
  - vitest con `thresholds` al 100 en las cuatro métricas y `coverage.include: ['src/**/*.ts']`.
- [ ] 5. Presets `date`, `number`, `currency`, `percent`, `relativeTime` y `list`, que devuelven
  `Pipe<T>` como dato. Tipos de §3.2, con `timeZone` requerido en `date` (criterio 23, test de
  tipos).
- [ ] 6. `$format`: un formatter por (locale, preset) en un `WeakMap` (criterio 24) y la salida de
  cada `kind`.
- [ ] 7. `compileMessage`, el subconjunto ICU de §4.3: texto, `{x}`, `plural` con `=N`, categorías
  y `#`, `select`, etiquetas `<n>…</n>` y `<n/>`, y escapado `'{'` / `''`. Un error es `FUD1025`
  con posición.
- [ ] 8. `$message`: plural con `Intl.PluralRules` y select (criterio 12).
- [ ] 9. `$href`: la regla de §4.8 en runtime, con sus cuatro excepciones.
- [ ] 10. `messageKey`, `parseCatalog` (`FUD1024`) y `printCatalog`, estable byte a byte
  (criterio 10).
- [ ] 11. `mergeCatalog`: mensaje nuevo (en el primer idioma con `translation = source`), mensaje
  que sigue, texto cambiado con `review` por (contexto, `at`), y borrado (criterio 11).
- [ ] 12. `t`, `format` y `locale` exportados para los tipos. En runtime lanzan
  `Error('compiled away')`, con su test: solo se alcanzan si un módulo escapa al compilador.
- [ ] 13. Build de `runtime/` con rolldown, una pieza por fichero: `format`, `message` y `href`.

## Fase 3 — Compilador: extraer

- [ ] 14. `extractMessages`, texto: tiras en línea de §4.2 (elementos de frase, cortes,
  etiquetas, lista de elementos, escapado ICU) y contexto de §4.9. Criterios 2, 3 y 7.
- [ ] 15. Nombres de huecos: ruta, signal sin argumentos, pipe, `argN` y sufijo por colisión.
  `holes` con la expresión de cada uno.
- [ ] 16. Atributos traducibles de §4.1 con sus condiciones de elemento y de `type` (criterio 5).
  `translate="no"` y lo que nunca se traduce (criterio 6).
- [ ] 17. Literales en posición de resultado sobre el `JsBatch` del fichero: entera, ramas de
  `? :`, derecha de `??`/`||`/`&&` y partes fijas de un template literal, en recursión (criterio 4).
- [ ] 18. `t()` en un `.fud` (vista y las tres zonas de `@code`) y `extractScriptMessages` para
  `.ts`/`.js`. `FUD1020` y `FUD1026` (criterio 8).
- [ ] 19. `FUD1021` en el analizador cuando la app no tiene `locales`, sobre un pipe, un `t()`, un
  `format()` o un `locale`. El analizador recibe si hay idiomas por su entrada; no lee la config.
- [ ] 20. Nunca lanzar: un `.fud` roto da mensajes parciales y diagnósticos (criterio 9).

## Fase 4 — Compilador: compilar por idioma

- [ ] 21. `EmitOptions.i18n` y `LocaleCompile`. Sin ella, la suite de goldens sale igual
  (criterio 19).
- [ ] 22. Servidor: `textRun` y `#run` construyen cada tira en el orden de la traducción, con los
  huecos y los elementos originales (criterios 14 y 15).
- [ ] 23. Cliente: lo mismo en `markup-client.ts`, en creación y en el `#applyValue` de una tira
  interpolada. La hidratación adopta los nodos en el orden traducido (criterio 15).
- [ ] 24. Atributos traducibles estáticos y dinámicos en `writeElementAttrs`.
- [ ] 25. Sustitución por span de los literales en posición de resultado, conservando el mapeo
  (criterio 16).
- [ ] 26. `t()`, `format()` y `locale` en un `.fud` y en `translateScript`: literal, template
  literal o `$message`, e importación de la pieza solo cuando se usa (criterios 17 y 18).
- [ ] 27. Pipes en la vista: `|` → `$format(preset, valor, "<locale>")` en servidor y cliente
  (criterio 20).
- [ ] 28. `<html>`: `lang` y `dir` cuando el autor no los escribe; la página sin layout deja el
  `lang="es"` fijo (criterio 27).
- [ ] 29. Enlaces: prefijo estático al compilar y `$href` en los dinámicos, antes de `setUrl`
  (criterio 29).
- [ ] 30. Traducción que falta: con `translate` devolviendo `undefined`, el emit usa el original y
  devuelve el mensaje para que el llamador decida la severidad.
- [ ] 31. Decisiones 158–161 enlazadas desde el código que las implementa.

## Fase 5 — Plugin

- [ ] 32. `locales` llega del `fudic.json` a `configResolved`. Con un idioma no hay prefijos ni
  catálogos; sin `locales`, el `dist` de `examples/basic` sale igual (criterio 1).
- [ ] 33. Expansión de rutas en `discoverRoutes`, con un patrón literal por idioma. El manifiesto,
  el matcher de dev y de preview, las entradas de edge, el endpoint de datos y el SW lo ven
  (criterio 25).
- [ ] 34. Grafo por idioma: `?locale=` en el chunk de cada ruta, propagación en `resolveId`
  (§4.6), `load` y `transform` para `.fud` y `.ts` con sufijo, y mapa de hidratación por ruta e
  idioma (criterio 30).
- [ ] 35. Prerender por idioma: `paths()` en el grafo de su idioma y prefijo en la ruta del
  fichero (criterio 25).
- [ ] 36. `/`: `302` por `Accept-Language` en dev, preview y edge, y `index.html` con `meta refresh`
  en SSG (criterio 26).
- [ ] 37. Alternativas `hreflang` en la cabecera de cada ruta (criterio 28).
- [ ] 38. Catálogos: extracción y fusión en `buildStart` tras `discoverRoutes`, y en dev al
  arrancar y con cada cambio de `.fud` o `.ts`. Se escriben con `fs` en `src/locales/`. El
  watcher de dev también relee los catálogos.
- [ ] 39. `FUD1022` en dev, sin bloquear la página, y `FUD1023` en build. `FUD1024` y `FUD1025`
  con sus spans (criterios 13 y 31).

## Fase 6 — Editor

- [ ] 40. Proyección de `a | b` → `$pipe(a, b)` en `copyRazor`/`copyExpression`, con operandos
  1:1 y `$pipe` en `GLOBALS_DTS` (criterio 32).
- [ ] 41. Language server: lee los catálogos, publica `FUD1022` y relee al cambiar en disco
  (criterio 33).
- [ ] 42. Hover de traducciones sobre un mensaje (criterio 34).

## Fase 7 — Evidencia y cierre

- [ ] 43. `examples/i18n` con todo lo que pide el criterio 35, construido como lo haría un usuario,
  con catálogos completos en `es` y `en`.
- [ ] 44. `pnpm typecheck`, `pnpm test` y `pnpm build` en verde; `@fudic/i18n` al 100 % en las
  cuatro métricas, y los paquetes tocados sin bajar de donde estaban (criterio 36).
- [ ] 45. README de `@fudic/i18n` en inglés, corto y sin citas a SDD.
- [ ] 46. INDEX: estado `Hecho` y fila en el registro de progreso. Después, OK de Pedro en el
  navegador.
