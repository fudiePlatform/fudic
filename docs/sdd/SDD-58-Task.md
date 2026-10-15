# SDD-58 — Tareas

> **SDD:** [SDD-58 — Traducciones y pipes](./SDD-58-traducciones-y-pipes.md)
> **Paquetes:** `@fudic/i18n` (nuevo) · `@fudic/compiler` · `@fudic/config` · `@fudic/vite` ·
> `@fudic/cli` · `@fudic/language-core` · `@fudic/language-server` · `@fudic/diagnostics` ·
> `examples/i18n` (nuevo)
> **Rama:** `sdd-58-i18n`
> **Progreso:** 47 / 48 — `En curso`.

El orden va de dentro afuera:
1. los diagnósticos y la config;
2. el paquete `@fudic/i18n`, que no depende de nadie;
3. el compilador: primero extraer y luego compilar por idioma;
4. el plugin, que solo lee catálogos y compila;
5. `fudic translate`, el único que los escribe;
6. el editor;
7. la evidencia, que construye `examples/i18n` como lo haría un usuario.

Cada fase se commitea al cerrarla, con sus tests.

---

## Fase 1 — Diagnósticos y config

- [x] 1. `FUD1020`–`FUD1025` en `@fudic/diagnostics`: un `.ts` y un `.md` por código, con la
  severidad de §3.7 y una línea por código en `index.ts`, en orden.
- [x] 2. `FUD0725` gana `problem: 'locales'`: el valor en la unión y una línea en su `.md`.
- [x] 3. `ProjectConfig.locales` en `@fudic/config`: `readLocales` con `Intl.getCanonicalLocales`
  rechaza el array vacío, las repetidas y las inválidas, y subraya la clave. Tests del criterio 1.

## Fase 2 — `@fudic/i18n`

- [x] 4. Paquete nuevo:
  - `package.json` con versiones exactas, `sideEffects: false` y
    `"fudic": { "runtime": "./runtime" }`, siguiendo la plantilla de `@fudic/forms`;
  - `tsconfig` que extiende la base;
  - vitest con `thresholds` al 100 en las cuatro métricas y `coverage.include: ['src/**/*.ts']`.
- [x] 5. Presets `date`, `number`, `currency`, `percent`, `relativeTime` y `list`, que devuelven
  `Pipe<T>` como dato. Tipos de §3.2, con `timeZone` requerido en `date` (criterio 23, test de
  tipos).
- [x] 6. `$format`: un formatter por (locale, preset) en un `WeakMap` (criterio 24) y la salida de
  cada `kind`.
- [x] 7. `compileMessage`, el subconjunto ICU de §4.3: texto, `{x}`, `plural` con `=N`, categorías
  y `#`, `select`, etiquetas `<n>…</n>` y `<n/>`, y escapado `'{'` / `''`. Un error es `FUD1024`
  con posición.
- [x] 8. `$message`: plural con `Intl.PluralRules` y select (criterio 12).
- [x] 9. `$href`: la regla de §4.8 en runtime, con sus cuatro excepciones.
- [x] 10. `messageKey`, `parseCatalog` (`FUD1023`) y `printCatalog`, estable byte a byte
  (criterio 10).
- [x] 11. `mergeCatalog`: mensaje nuevo (en el primer idioma con `translation = source`), mensaje
  que sigue, texto cambiado con `review` por (contexto, `at`), y borrado (criterio 11).
- [x] 12. `t`, `format` y `locale` exportados para los tipos. En runtime lanzan
  `Error('compiled away')`, con su test: solo se alcanzan si un módulo escapa al compilador.
- [x] 13. Build de `runtime/` con rolldown, una pieza por fichero: `format`, `message` y `href`.

## Fase 3 — Compilador: extraer

- [x] 14. `extractMessages`, texto: tiras en línea de §4.2 (elementos de frase, cortes,
  etiquetas, lista de elementos, escapado ICU) y contexto de §4.9. Criterios 2, 3 y 7.
- [x] 15. Nombres de huecos: ruta, signal sin argumentos, pipe, `argN` y sufijo por colisión.
  `holes` con la expresión de cada uno.
- [x] 16. Atributos traducibles de §4.1 con sus condiciones de elemento y de `type` (criterio 5).
  `translate="no"` y lo que nunca se traduce (criterio 6).
- [x] 17. Literales en posición de resultado sobre el `JsBatch` del fichero: entera, ramas de
  `? :`, derecha de `??`/`||`/`&&` y partes fijas de un template literal, en recursión (criterio 4).
- [x] 18. `t()` en un `.fud` (vista y las tres zonas de `@code`) y `extractScriptMessages` para
  `.ts`/`.js`. `FUD1025` sale de la extracción (criterio 8).
- [x] 19. Analizador del compilador:
  - `FUD1020` sobre un `t()` sin literal o sin objeto de huecos;
  - `FUD1021` sobre un pipe, `t()`, `format()` o `locale` en una app sin `locales`.

  El analizador recibe por su entrada si hay idiomas; no lee la config.
- [x] 20. Nunca lanzar: un `.fud` roto da mensajes parciales y diagnósticos (criterio 9).

## Fase 4 — Compilador: compilar por idioma

> Cómo quedó: la traducción reescribe el texto fuente del `.fud` para el idioma antes de
> compilarlo (`localizeSource`, con un mapa de offsets al original), en vez de tocar cada emisor.
> Servidor, cliente e hidratación ven así el mismo árbol traducido por construcción: las tareas
> 22–24 se cumplen sin cambiar `textRun`, `markup-client.ts` ni `writeElementAttrs`.

- [x] 21. `EmitOptions.i18n` y `LocaleCompile`. Sin ella, la suite de goldens sale igual
  (criterio 19).
- [x] 22. Servidor: `textRun` y `#run` construyen cada tira en el orden de la traducción, con los
  huecos y los elementos originales (criterios 14 y 15).
- [x] 23. Cliente: lo mismo en `markup-client.ts`, en creación y en el `#applyValue` de una tira
  interpolada. La hidratación adopta los nodos en el orden traducido (criterio 15).
- [x] 24. Atributos traducibles estáticos y dinámicos en `writeElementAttrs`.
- [x] 25. Sustitución por span de los literales en posición de resultado, conservando el mapeo
  (criterio 16).
- [x] 26. `t()`, `format()` y `locale` en un `.fud` y en `translateScript`: literal, template
  literal o `$message`, e importación de la pieza solo cuando se usa (criterios 17 y 18).
- [x] 27. Pipes en la vista: `|` → `$format(preset, valor, "<locale>")` en servidor y cliente
  (criterio 20).
- [x] 28. `<html>`: `lang` y `dir` cuando el autor no los escribe; la página sin layout deja el
  `lang="es"` fijo (criterio 27).
- [x] 29. Enlaces: prefijo estático al compilar y `$href` en los dinámicos, antes de `setUrl`
  (criterio 29).
- [x] 30. Traducción que falta o inválida: con `translate` devolviendo `undefined`, el emit usa el
  texto original y no produce ningún diagnóstico (criterio 31).
- [x] 31. Decisiones 158–161 enlazadas desde el código que las implementa.

## Fase 5 — Plugin: leer y compilar

- [x] 32. `locales` llega del `fudic.json` a `configResolved`. Con un idioma no hay prefijos; sin
  `locales`, el `dist` de `examples/basic` sale igual (criterio 1).
- [x] 33. Expansión de rutas en `discoverRoutes`, con un patrón literal por idioma. El manifiesto,
  el matcher de dev y de preview, las entradas de edge, el endpoint de datos y el SW lo ven
  (criterio 25).
- [x] 34. Grafo por idioma: `?locale=` en el chunk de cada ruta, propagación en `resolveId`
  (§4.6), `load` y `transform` para `.fud` y `.ts` con sufijo, y mapa de hidratación por ruta e
  idioma (criterio 30).
- [x] 35. Prerender por idioma: `paths()` en el grafo de su idioma y prefijo en la ruta del
  fichero (criterio 25).
- [x] 36. `/`: `302` por `Accept-Language` en dev, preview y edge, y `index.html` con `meta refresh`
  en SSG (criterio 26).
- [x] 37. Alternativas `hreflang` en la cabecera de cada ruta (criterio 28).
- [x] 38. Lectura de catálogos para `LocaleCompile.translate`. Lo ilegible, lo que falta y lo
  inválido caen al texto original sin diagnóstico, y el plugin nunca escribe en `src/locales/`
  (criterio 31).
- [x] 39. En dev, el catálogo de un idioma es una entrada del grafo: guardarlo recompila y recarga
  esos módulos (criterio 34).

> Notas de la fase 5:
> - La tarea 43 se adelantó a esta fase: sin la proyección `$pipe`, el chequeo de tipos del build
>   (SDD-35) rechaza todo pipe, y los criterios 20 y 30 no se pueden construir.
> - `_error.fud` sale una vez por idioma (§4.5), bajo `/<idioma>/_fudic/error/:status`. Un fallo en
>   una página pinta la de su idioma; `/_fudic/error/N`, sin prefijo, la del idioma de la página de
>   la que viene (`Referer`), o la del primero.
> - El edge de producción es hoy `vite preview`: no existe otro adaptador. La `302` de `/` está en
>   dev y en preview.
> - El `.gitignore` ignoraba `packages/i18n/src/runtime/` (la regla `runtime/` sin anclar) y el
>   paquete no compilaba desde git. La regla queda anclada a `/packages/*/runtime/`.

## Fase 6 — `fudic translate`

- [x] 40. `planTranslate` en `@fudic/cli`:
  - recorre los `.fud` y los `.ts`/`.js` de `src` y los `.fud` de las librerías fudic de la app;
  - extrae con `extractMessages` y `extractScriptMessages`;
  - fusiona con `mergeCatalog` y devuelve como `FileChange` los catálogos que cambian (criterios 10
    y 11).
- [x] 41. Diagnósticos del plan: `FUD1022` por mensaje e idioma sin traducir, `FUD1023`, `FUD1024`
  y `FUD1025`, con los spans de §5 (criterio 13).
- [x] 42. Comando `translate` en el binario: aplica el plan, imprime el resumen por idioma (total,
  nuevos, a revisar, sin traducir) y sale con distinto de 0 solo si hay un error.

> Notas de la fase 6:
> - Un catálogo ilegible (`FUD1023`) para el plan entero: fusionarlo desde vacío borraría sus
>   traducciones, así que no se reescribe ningún catálogo y el comando sale con 1.
> - `fudic translate` en una app sin `locales` es `FUD1026` (nuevo, del rango de esta spec), y un
>   argumento de más es `FUD0448` con el problema `unexpected-argument`.
> - `src/locales` pasa a ser `LOCALES_DIR` de `@fudic/conventions`, el mismo nombre para el plugin,
>   el comando y el editor.

## Fase 7 — Editor

- [x] 43. Proyección de `a | b` → `$pipe(a, b)` en `copyRazor`/`copyExpression`, con operandos
  1:1 y `$pipe` en `GLOBALS_DTS` (criterio 32). Hecha en la fase 5.
- [x] 44. Language server: lee los catálogos, los relee al cambiar en disco y muestra el hover de
  traducciones sobre un mensaje. No publica `FUD1022`–`FUD1025` (criterio 33).

## Fase 8 — Evidencia y cierre

- [x] 45. `examples/i18n` con todo lo que pide el criterio 35, construido como lo haría un usuario:
  script `translate`, `pnpm translate` y los catálogos `es` y `en` rellenos a mano.
- [x] 46. `pnpm typecheck`, `pnpm test` y `pnpm build` en verde; `@fudic/i18n` al 100 % en las
  cuatro métricas, y los paquetes tocados sin bajar de donde estaban (criterio 36).
- [x] 47. README de `@fudic/i18n` en inglés, corto y sin citas a SDD; incluye `pnpm translate`.
- [ ] 48. INDEX: estado `Hecho` y fila en el registro de progreso. Después, OK de Pedro en el
  navegador.

> Notas de las fases 7 y 8:
> - El hover lee los catálogos del `fudic.json` con `locales` más cercano al fichero, igual que
>   los `styles` de un template. El cliente de VS Code vigila además `**/src/locales/*.json`.
> - En `examples/i18n` lo único en español dentro de `/en/` es el selector de idioma, bajo
>   `translate="no"`: cada idioma se nombra en el suyo.
