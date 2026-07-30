# SDD-24 — Tareas

> **SDD:** [SDD-24 — Servidor de lenguaje](./SDD-24-language-server.md)
> **Paquete:** `@fudic/language-server` · **Rama:** `feat/sdd-24-language-server`
> **Progreso:** 36 / 36 — todas las tareas hechas; falta el cierre.

Cada tarea es un paso cerrado: se implementa, se verifica y se marca. Ninguna depende de
tareas posteriores. Los ficheros son relativos a `packages/language-server/` salvo cuando
se diga otra cosa.

---

## Notas de revisión (leer antes de empezar)

Cinco puntos salieron de contrastar el SDD con el código ya escrito. Los tres primeros
piden decisión de Pedro; los dos últimos son elecciones que las tareas ya asumen.

1. **`FUD0460`–`FUD0479` para SDD-24.** El SDD exige diagnósticos propios (§4.4) pero no
   reserva rango. SDD-21 llega a `FUD0436` y la CLI ocupa `FUD0440`–`FUD0459`, así que el
   siguiente libre es `FUD0460`. Se anota en SDD-12 al cerrar.
2. **«Sección obligatoria ausente» contradice SDD-21 §4.2.** SDD-24 §4.4 pide diagnóstico
   cuando la página no rellena una sección del layout; SDD-21 dice literalmente que el
   silencio es el comportamiento correcto — «es el `required: false` de Razor por defecto»
   — y no existe `SectionDecl.required`. **Recomendación:** retirar esa validación de §4.4
   y quedarse con el completado de sección (criterio §6.6), que sí es implementable. Se cerró
   así: el completado está hecho, el diagnóstico **no se implementa** mientras la contradicción
   siga en pie, y `FUD0462`–`FUD0479` quedan libres por si Pedro decide lo contrario. Ningún
   criterio de §6 lo pide, así que no bloquea el cierre.
3. **Oxc se invocaría dos veces por fichero.** `emitVirtualFiles` monta su propio `JsBatch`
   para localizar `props<T>()`, y el servidor necesita otro para la semántica y para la
   regla del `$`. Dos batches por pulsación rompen la regla de oro. **Recomendación:**
   ampliar `EmitInput` con un `js?: JsBatchResult` opcional y construir **un** batch por
   versión de documento en la caché del servidor (tarea 15). Toca `@fudic/language-core`,
   que está `Hecho`, igual que la tarea 29 de SDD-23 tocó la CLI.
4. **Versiones fijadas** (exactas, sin `^`): `@volar/language-server`,
   `@volar/language-service`, `@volar/language-core` y `@volar/typescript` a `2.4.28`;
   `volar-service-typescript|html|css` a `0.0.71`; `vscode-languageserver` a `9.0.1` (es la
   que Volar 2.4 resuelve: la 10.x es LSP 3.18 y se saldría del rango de sus pares),
   `vscode-languageserver-textdocument` `1.0.12`, `vscode-uri` `3.1.0`.
5. **El `bin` no esconde código.** El lanzador `bin/fudic-language-server.js` es un shim de
   dos líneas sin ninguna rama (`import('../dist/cli.js').then(m => m.main(...))`): la
   elección de transporte, el manejo de argumentos y los errores viven en `src/cli.ts`, que
   los tests ejercitan en proceso. La cobertura de un proceso hijo no la recoge v8, así que
   toda la aceptación corre **en proceso** sobre una conexión LSP real montada sobre
   streams dúplex (tarea 31); el `spawn` del binario queda como humo, no como cobertura.

---

## Fase 0 — Andamiaje del paquete (4)

- [x] **1. Manifiesto del paquete.**
      Crear `package.json`: `@fudic/language-server`, `bin.fudic-language-server`, las deps de
      la nota 4 más `@fudic/language-core`, `@fudic/compiler` y `typescript` (5.9.3) como
      dependencia de **runtime**: es el TypeScript de reserva cuando el proyecto no da `tsdk`.
      `vscode-languageserver-protocol` entra como devDep: es el lado cliente del arnés (tarea
      32) y pnpm no tolera deps fantasma.
- [x] **2. Configuración de TS y tests.**
      Crear `tsconfig.json`, `tsconfig.build.json`, `README.md` y `vitest.config.ts` con
      `thresholds` al **100 %** en las cuatro métricas y `coverage.include: ['src/**/*.ts']`.
- [x] **3. Instalar y comprobar que el paquete vacío pasa.**
      `pnpm install` en la raíz; `pnpm --filter @fudic/language-server typecheck` en verde.
      `src/index.ts` nace con `VERSION` y `test/package.test.ts` lo cubre: un paquete que
      arranca al 100 % necesita algo que medir desde el primer commit.
- [x] **4. Workspace de fixtures.**
      Crear `fixtures/`: los cuatro `.fud` de §6 (`blog/[slug].fud`, `layouts/_layout.fud`,
      `components/site-nav.fud`, `components/app-badge.fud`), `data/posts.ts` y un
      `tsconfig.json` estricto con `**/*.fud` en el `include`. Es un proyecto real en disco, no
      un montaje en memoria: los criterios 1, 9 y 13 miran el disco.
      **`fudic-globals.d.ts` se deja fuera a propósito**: un proyecto que nunca pasó por
      `fudic new` es el caso que interesa — obliga a que la lib virtual de la tarea 28 exista
      de verdad. La variante con el fichero en disco tendrá su propio fixture al probar §2.

## Fase 1 — Contratos y catálogo (3)

- [x] **5. Tipos públicos del servidor.**
      Crear `src/types.ts`: `FudicInitializationOptions` (§3.3), sus opciones ya resueltas con
      los defaults aplicados, y los puertos inyectables — `FileSystemScanner` y `Logger` —
      para que ningún módulo de dominio importe `node:fs`. La resolución vive en
      `src/options.ts`: los `initializationOptions` llegan como `unknown`, y un `tsdk` que
      falta tiene que llegar como cadena vacía, no como `TypeError`, o la degradación de §6.1
      es inalcanzable.
- [x] **6. Catálogo de diagnósticos.**
      Crear `src/diagnostics.ts`: rango `FUD0460`–`FUD0479`. `FUD0460` = `href` que no
      resuelve; `FUD0461` = identificador de usuario con prefijo `$`. El resto, reservado.
- [x] **7. Capacidades y leyenda de tokens.**
      Crear `src/capabilities.ts` con el objeto exacto de §3.2 y la leyenda de §4.3
      (`fudDirective`, `fudInterpolation`, `fudBinding`, `fudComponentTag` sobre los tipos
      estándar). Formateo **se declara y se delega**: SDD-26 no existe aún, así que el
      handler responde vacío. Crear `test/capabilities.test.ts`.

## Fase 2 — Índice del workspace (4)

- [x] **8. Rol de un `.fud`.**
      Crear `src/mode.ts`: del `StructuredDocument` al rol (`component` / `page` / `route` /
      `layout`, decisión 51 y SDD-21) más `tagOf` y `layoutHrefOf`. Puro, sin I/O — el disco
      entra en la tarea 9. También `src/paths.ts`: aritmética POSIX (`resolveFrom`,
      `relativeHref`), sin `node:path`, porque el editor manda los dos separadores para el
      mismo fichero y un `href` siempre se escribe con `/`.
- [x] **9. Índice del workspace.**
      Crear `src/workspace-index.ts`: barrido `**/*.fud` al arrancar y mapa ruta → rol,
      mantenido por alta / baja / renombrado (§4.5). Nunca lee disco por pulsación. El único
      módulo que importa `node:fs` es `src/node-fs.ts`, tras el puerto `FileSystemScanner`.
- [x] **10. `FileRegistry` por fichero.**
      Crear `src/file-registry.ts`: resuelve los `<link>` de **un** fichero contra el índice y
      cumple el puerto que SDD-23 consume. La invalidación es por fichero, no global.
- [x] **11. Tests del índice.**
      Crear `test/workspace-index.test.ts` y `test/file-registry.test.ts`: barrido inicial,
      alta en caliente, `href` relativo resuelto, y que un alta invalide **solo** el fichero
      afectado.

## Fase 3 — Parseo, caché y un solo Oxc (4)

- [x] **12. Pipeline de parseo.** *(hecha en la fase 2)*
      Crear `src/parse.ts`: `parseDocument` + constructs (`parseControl`, `parseCodeBlock`,
      `parseDirective`) + `structureDocument`, devolviendo también sus diagnósticos. Se
      adelantó porque el índice tiene que parsear para saber el rol, y ninguna tarea puede
      depender de una posterior.
- [x] **13. Batch de Oxc del documento.**
      Crear `src/js-batch.ts`: registra los fragmentos del documento (interpolaciones,
      cabeceras, regiones de `@code`) en **un** `JsBatch` y expone el `fragmentId(node)` que
      `SemanticInput` pide.
- [x] **14. Caché por versión de documento.**
      Crear `src/document-cache.ts`: AST, batch y virtuals cacheados por `uri` + versión
      (§4.5). Un `.fud` no se parsea dos veces por pulsación.
- [x] **15. Un solo Oxc por fichero (toca `language-core`).**
      Modificar `packages/language-core/src/emit.ts`: `EmitInput.js?: JsBatchResult`
      opcional; con él, el emisor no abre batch propio. Ver nota 3. Actualizar los tests de
      `language-core` manteniendo su **100 %**. Crear `test/document-cache.test.ts`.
      La caché lleva **dos claves**: el AST por versión de documento, y los virtuals por
      versión **y** revisión del índice — lo que un tag resuelve no es propiedad del fichero,
      así que dar de alta `app-card.fud` cambia la proyección de toda página que lo enlace. Se
      recalcula en la siguiente petición de ese fichero, no en el alta: el AST y su batch, que
      son la mitad cara, sobreviven.

## Fase 4 — Puente con Volar (4)

- [x] **16. Traducción del mapeo.**
      Crear `src/mappings.ts`: `Mapping[]` de SDD-23 → `CodeMapping[]` de Volar, con las **dos
      longitudes** (`length` / `sourceLength`) y `MappingCaps` → `CodeInformation` uno a uno.
- [x] **17. Código virtual del documento.**
      Crear `src/virtual-code.ts`: el `VirtualCode` raíz del `.fud` y sus embebidos — cliente
      `.fud.ts`, servidor `.fud.server.ts` y un `.fud.<n>.css` por `<style>`. Cliente y servidor
      son **campos**, no búsquedas: SDD-23 emite los dos siempre, y hacerlos opcionales
      repartiría un «¿y si falta?» por cada consumidor. También `src/uri.ts`, la frontera
      URI ↔ ruta (Volar indexa por `URI`, el índice por ruta).
- [x] **18. Language plugin.**
      Crear `src/language-plugin.ts`: `LanguagePlugin<URI>` con `getLanguageId`,
      `createVirtualCode` / `updateVirtualCode` sobre la caché, `extraFileExtensions` para
      `.fud` y `getServiceScript` apuntando al virtual de cliente, más
      `getExtraServiceScripts` para el virtual de servidor: el cliente deriva `$Data` de
      `typeof import('./x.fud.server')`, así que ese nombre tiene que existir para TypeScript.
- [x] **19. Tests del puente.**
      Crear `test/mappings.test.ts` y `test/virtual-code.test.ts`: identidad de offsets en las
      copias literales, andamiaje con las seis capacidades a `false`, y un AST parcial que
      sigue produciendo virtuals.

## Fase 5 — Services propios (6)

- [x] **20. Completado y validación de `href`.**
      Crear `src/services/href.ts` (§4.2): lista los `.fud` del workspace en ruta relativa,
      filtrados por rol según `rel="component"` o `rel="layout"`; `href` que no resuelve →
      `FUD0460` sobre el valor del atributo, más code action de creación del fichero.
- [x] **21. Completado de tag y `documentLink`.**
      Crear `src/services/tags.ts`: tras `<`, los tags con `<link>` declarado en un grupo
      distinto de los nativos (criterio §6.4); `documentLink` sobre el `href` de cada `<link>`.
- [x] **22. Completado de sección.** *(el completado, hecho; el diagnóstico sigue suspendido — nota 2)*
      Crear `src/services/sections.ts`: tras `@section `, los nombres de `@RenderSection` del
      layout resuelto (criterio §6.6). El **diagnóstico** de sección ausente no se implementa
      mientras contradiga SDD-21 §4.2. `IndexEntry` gana `sections`: el layout ya se parseó para
      saber su rol, así que los nombres salen gratis y el completado no cuesta un parseo.
- [x] **23. Namespace `$` reservado.**
      Crear `src/services/reserved-dollar.ts`: `FUD0461` sobre nodos `Identifier` de Oxc en las
      regiones `@client` / `@server` — declaración o referencia libre. Nunca sobre texto:
      `foo$` y `obj.$bar` son válidos.
- [x] **24. Reenvío de diagnósticos del compilador.**
      Crear `src/services/compiler-diagnostics.ts`: los de parseo y los de `analyze()` (SDD-12)
      tal cual, con su span, montando el `SemanticInput` desde la caché de la tarea 14.
- [x] **25. Tokens semánticos.**
      Crear `src/services/semantic-tokens.ts`: recorrido del AST que emite los cuatro tipos
      propios de §4.3; un tag resuelto a `.fud` es `fudComponentTag`, uno nativo no.
- [x] **26. Tests de los services propios.**
      Crear `test/services/*.test.ts`: uno por service, contra el AST y el índice, sin conexión
      LSP de por medio — la integración es la fase 7. Toda la lógica es **pura** y devuelve
      spans; el envoltorio `LanguageServicePlugin` de Volar y la conversión a posiciones LSP
      caen en la fase 6, donde vive la conexión. Añadido `src/services/position.ts`: qué hay
      bajo el cursor — `href` desde el AST, y `<`/`@section ` desde el texto, porque se teclean
      *antes* de que haya nada que parsear.

## Fase 6 — Ensamblado del servidor (5)

- [x] **27. Resolución del `tsdk`.**
      Crear `src/tsdk.ts`: carga el TypeScript del proyecto desde `initializationOptions`; si
      falla, degrada a HTML+CSS, lo escribe en el log y **no muere** (criterio §6.1). El orden es
      el contrato: el del proyecto, luego el empaquetado, luego nada.
- [x] **28. Ambientes globales como lib virtual.**
      Crear `src/globals.ts`: monta `GLOBALS_DTS` como `fudic-globals.d.ts` en memoria,
      envolviendo el `LanguageServiceHost` (`getScriptFileNames`, `getScriptSnapshot`,
      `getScriptVersion`). Si el fichero existe en disco declara lo mismo: no hay conflicto.
- [x] **29. Servidor.** *(las piezas de Volar se inyectan: el cableado se prueba en proceso, y los
      valores por defecto son los reales — un test que nunca los ejercita prueba otra cosa)*
      Crear `src/server.ts`: `createFudicServer(connection)` — `initialize` con las capacidades
      de la tarea 7, los tres services de Volar más los propios, watchers explícitos sobre
      `tsconfig*.json`, `package.json` y altas/bajas/renombrados de `.fud`, y `shutdown`/`exit`
      limpios. Aquí viven los dos invariantes de §5 que son fontanería: el envoltorio que
      **nunca lanza** (traza + respuesta vacía) y la comprobación del token de cancelación.
- [x] **30. Peticiones propias e instrumentación.**
      Crear `src/requests.ts` (`fudic/virtualFiles`, `fudic/componentRegistry`) y `src/stats.ts`
      con el contador de peticiones **completadas** frente a **canceladas** que el criterio
      §6.14 exige medir.
- [x] **31. Entrada ejecutable.**
      Crear `src/cli.ts` (`main(argv, deps)`: `--stdio | --node-ipc | --socket=<port>`),
      `src/index.ts` (API pública) y `bin/fudic-language-server.js`, el shim sin ramas de la
      nota 5.

## Fase 7 — Criterios de aceptación del SDD (5)

- [x] **32. Arnés LSP en proceso.**
      Crear `test/acceptance/_harness.ts`: conexión cliente ↔ servidor sobre `PassThrough`
      dúplex, `initialize` contra el workspace de fixtures y helpers de posición (`|` en el
      fuente → offset). Sin proceso hijo: la cobertura tiene que contar. Tres piezas que salieron
      de usarlo: **calentar** el programa de TypeScript en el arranque (la primera petición cuesta
      segundos y las demás milisegundos: pagarlo en el `beforeAll` es medir la función, no el
      arranque en frío), **pausar el transporte** (lo que hace cancelable una petición es llegar
      sin leer, y sostener la tubería lo vuelve seguro en vez de probable — es como se mide §6.14
      sin reloj) y **no cerrar el lado del servidor** (con `interFileDependencies` Volar también
      *empuja* diagnósticos 250 ms después de cada edición: escribir en una conexión que alguien
      cerró es un detalle del teardown disfrazado de defecto).
- [x] **33. Criterios 1–2 y 15: arranque, diagnósticos y virtuals.**
      Crear `test/acceptance/startup.test.ts` (capacidades declaradas, degradación sin `tsdk`,
      índice por rol y `fudic/virtualFiles`) y `test/acceptance/diagnostics.test.ts`: los nueve
      casos de SDD-23 §6 como diagnósticos LSP **en el span del `.fud`**, más §6.9 (inter-fichero),
      §6.11 (`$` mientras se escribe) y §6.12 (tolerancia con `<div>` sin cerrar).
- [x] **34. Criterios 3–6 y 10: completados y CSS.**
      Crear `test/acceptance/completion.test.ts`: atributo `tone`, valores de la unión dentro de
      `tone="@(|)"`, tags declarados tras `<`, `href` filtrado por rol, `@section nav`, y el CSS
      de §6.10 por sus dos mitades — se completan propiedades dentro de `<style>`, y `:host`,
      `:host()`, `:host-context()` y `::slotted()` **no** producen diagnóstico mientras un
      `colour: red` sí. La supresión de pseudos que la spec preveía no hizo falta:
      `vscode-css-languageservice` ya conoce los cuatro, y comprobarlo era más barato que
      escribir un filtro que no filtra nada.
- [x] **35. Criterios 7–8: navegación.**
      Crear `test/acceptance/navigation.test.ts`: definición sobre el tag, sobre `@data.title`,
      sobre `data` (typeDefinition) y sobre un prop desde la plantilla, propia y ajena; rename de
      un prop con sus tres ediciones y `prepareRename` **vacío** sobre un tramo que solo lleva
      diagnósticos. Hueco encontrado aquí: **F12 sobre `<app-badge>` no la contestaba nadie** — el
      tag se proyecta con el perfil diagnostics-only a propósito (un error tiene que aterrizar en
      él, una navegación no, o renombrar un tag renombraría un alias que el usuario no escribió),
      así que nada rutaba. Añadidos `tagNameAt` (`src/services/position.ts`), `tagDefinitionAt`
      (`src/services/tags.ts`) y `provideDefinition` en el service: la existencia de un tag y el
      fichero del que vino son conocimiento de este paquete, no de TypeScript.
- [x] **36. Criterios 13–14: invalidación y cancelación.**
      Crear `test/acceptance/robustness.test.ts`: un `.fud` escrito en disco más el aviso del
      watcher hace que el tag resuelva sin reiniciar —y borrarlo lo devuelve a `FUD0460` +
      `FUD0191` + `TS2304`—, y una ráfaga de N ediciones con el transporte en pausa deja
      **exactamente una** petición completada según el contador. Segundo hueco: el canal de trazas
      **lanzaba** si el cliente ya se había ido (un proyecto de TypeScript que acaba de cargar
      escribe en una conexión cerrada), lo que tiraba el proceso por un log; `loggerFor` se lo
      traga, que es lo que dice §5.

---

## Cierre de la SDD

- [x] `pnpm typecheck`, `pnpm test` y `pnpm build` en verde (incluida la vuelta a
      `@fudic/language-core` de la tarea 15).
- [x] Cobertura **100 %** en líneas, funciones, ramas y sentencias, con `coverage.include`
      sobre `src/**` — 343 tests en `@fudic/language-server`; `@fudic/language-core` vuelve a su
      100 % con el caso del `@()` vacío, que es lo que hace posible el criterio §6.3.
- [x] Anotar `FUD0460`–`FUD0479` en el catálogo de SDD-12.
- [x] Marcar SDD-24 como `Hecho` y anotarlo en [INDEX.md](./INDEX.md) (tabla + registro de
      progreso).
