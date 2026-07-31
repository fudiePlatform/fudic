# SDD-25 — Tareas

> **SDD:** [SDD-25 — Extensión de VS Code](./SDD-25-extension-vscode.md)
> **Paquete:** `fudic-vscode` · **Rama:** `feat/sdd-25-extension-vscode`
> **Progreso:** 34 / 34 — todas las tareas hechas.

Cada tarea es un paso cerrado: se implementa, se verifica y se marca. Ninguna depende de
tareas posteriores. Los ficheros son relativos a `packages/vscode/` salvo cuando se diga
otra cosa.

---

## Notas de revisión (leer antes de empezar)

Siete puntos salieron de contrastar el SDD con el repo. Los tres primeros piden decisión
de Pedro; los cuatro últimos son elecciones que las tareas ya asumen.

1. **~~La rama nace de `main`, y SDD-24 no está ahí.~~ Resuelto.** SDD-24 aterrizó en
   `main` (`9a7dd14`) y la rama está al día: `packages/language-server` existe aquí, con
   sus 344 tests en verde. Queda una cautela de worktree: un árbol recién creado no tiene
   `dist/`, y `packages/vite` typechequea contra el `dist` de sus hermanos — **`pnpm build`
   antes del primer `pnpm typecheck`**, o el fallo parece del código y es del árbol.
2. **Cómo se prueban los criterios que exigen un editor vivo.** Los criterios 1, 3, 4, 7,
   11 y parte de 5, 6, 8 y 12 piden VS Code corriendo o un `.vsix` instalado; en Vitest no
   existen. Hay dos caminos: (a) `@vscode/test-electron` — descarga un VS Code por CI, y su
   cobertura no entra en el informe de v8, así que el 100 % del paquete pasaría a medirse
   en dos sitios; (b) automatizar lo que es datos o lógica pura y dejar el resto en un
   **guion de verificación manual** versionado. **Decidido por Pedro: (b)**, el guion —
   un cliente de veinte ramas no justifica un runner de Electron, y el guion es honesto
   sobre lo que ninguna suite comprueba. La tarea 34 lo materializa.
3. **`publisher` e identidad.** §3.1 fija `editor.defaultFormatter: "fudic.fudic-vscode"`,
   lo que obliga a `publisher: "fudic"` y `name: "fudic-vscode"`. Se da por bueno, pero es
   el nombre con el que se publicaría algún día: si Pedro quiere otro, cambiarlo ahora
   cuesta una línea y después cuesta una migración de ajustes de usuario.
4. **La extensión se compila a CommonJS.** VS Code carga `main` como CJS; el repo es ESM
   con `verbatimModuleSyntax`. El fuente sigue siendo TS/ESM y **Rolldown** emite
   `dist/extension.cjs`. Por eso este paquete **no** tiene `tsconfig.build.json`: `tsc`
   solo typechequea (`--noEmit`) y `build` es el bundle. Es el único paquete del workspace
   donde `build` no es `tsc`.
5. **Cobertura al 100 % importando `vscode`.** El módulo `vscode` solo existe dentro del
   host: no se puede importar en Vitest. Se resuelve con **puertos** (tarea 17): todo
   `src/**` recibe por parámetro la parte de la API que usa, y `src/extension.ts` es el
   único fichero que importa `vscode` — un adaptador **sin ramas**, igual que el `bin` de
   SDD-24. En Vitest, `vscode` se aliasa a un doble en `test/`, de modo que también el
   adaptador se carga y cuenta. Sin esta regla, o el paquete no llega al 100 % o el 100 %
   no significa nada.
6. **La gramática es datos, y aun así se prueba.** El `.tmLanguage.json` no entra en
   `coverage.include` (no es TS), pero es la mitad del valor de esta SDD. Se ejercita con
   `vscode-textmate` + `vscode-oniguruma` en Node (tarea 9). Las gramáticas de TS y CSS
   viven dentro de VS Code y no se pueden registrar: el arnés registra gramáticas **vacías**
   para los scopes embebidos y afirma sobre las **fronteras** — dónde empieza y acaba cada
   región — que es exactamente lo que esta extensión aporta, más la ausencia de arrastre.
7. **Versiones exactas.** `vscode-languageclient` `9.0.1` — la pareja del
   `vscode-languageserver` `9.0.1` que SDD-24 fija; desparejarlas es negociar dos versiones
   de LSP en el mismo canal. `@types/vscode` a `1.90.0` exacto, no por encima de
   `engines.vscode`: tipar contra una API que el host mínimo no tiene es un fallo en
   ejecución que el typecheck aprueba. `rolldown`, `@vscode/vsce`, `vscode-textmate` y
   `vscode-oniguruma` se fijan a la estable que resuelva `pnpm install` en la tarea 1, sin
   `^`.

---

## Fase 0 — Andamiaje del paquete (4)

- [x] **1. Manifiesto del paquete.**
      Crear `package.json`: `name: "fudic-vscode"`, `publisher: "fudic"`, `private: true`
      (no se publica en npm, §4.5), `engines.vscode: "^1.90"`, `main: "./dist/extension.cjs"`.
      Dependencias de la nota 7 más `@fudic/language-server` (`workspace:*`), que es lo que
      se empaqueta dentro del `.vsix`. `contributes` y `activationEvents` llegan en la fase
      1: aquí solo la identidad.
- [x] **2. Configuración de TS y tests.**
      Crear `tsconfig.json`, `README.md` y `vitest.config.ts` con `thresholds` al **100 %** en
      las cuatro métricas, `coverage.include: ['src/**/*.ts']` y el alias de `vscode` al doble
      de `test/_vscode-stub.ts` (nota 5). **Sin `tsconfig.build.json`** (nota 4). `types` del
      `tsconfig` lleva **`["node", "vscode"]`**: con un array explícito, `@types/vscode` no
      se auto-incluye y todo `import 'vscode'` fallaría.
- [x] **3. Instalar y comprobar que el paquete vacío pasa.**
      `pnpm install` en la raíz; `pnpm --filter fudic-vscode typecheck` en verde.
      `src/extension.ts` nace con `activate`/`deactivate` mínimos y `test/extension.test.ts`
      los cubre: un paquete que arranca al 100 % necesita algo que medir desde el primer
      commit. Incluye un `rolldown.config.ts` **mínimo** (`src/extension.ts` →
      `dist/extension.cjs`, `vscode` external): el `build` del manifiesto es el bundle desde
      la tarea 1, así que sin él `pnpm build` de la raíz queda roto treinta tareas. La tarea
      30 es la que lo completa; aquí solo se le da un config que exista.
      Además, `pnpm-workspace.yaml` declara `allowBuilds` a `false` para `keytar` y
      `@vscode/vsce-sign`: llegan por `@vscode/vsce`, son nativas, y solo las usa
      `vsce publish` — que está fuera de alcance (§7).
- [x] **4. Corpus de color.**
      Copiar `blog/[slug].fud` y `components/app-badge.fud` de `packages/language-server/fixtures/`
      a `fixtures/`. Se copian, no se referencian: son un fixture **de color**, congelado, y no
      deben moverse cuando el emisor virtual cambie. Entre los dos cubren `@code`/`@server`,
      `<style>`, `@section`, `@(…)`, `@data.path`, `class:` y un tag de componente.

## Fase 1 — Contribuciones declarativas (4)

- [x] **5. Lenguaje e iconos.**
      Añadir a `package.json` el bloque `languages` de §3.1 (`id: "fudic"`, alias, `.fud`,
      `configuration`, `icon`) y crear `icons/fud-light.svg` / `icons/fud-dark.svg`. Es el
      criterio §6.1 en su parte declarativa.
- [x] **6. Configuración del lenguaje.**
      Crear `language-configuration.json` (§3.3): comentario de bloque `@* *@` y **ningún**
      `lineComment` — ofrecer `//` haría que `Ctrl+/` genere ficheros que no compilan;
      pares y autocierre `{} () [] "" '' `` ` ``; autocierre de tags y salto entre `>` y `</`;
      `folding` por indentación más marcadores para `@code`, `@server`, `@client`, `@if` y
      `@foreach`; `wordPattern` que no parte en `@` ni en `:`, para que doble clic seleccione
      `@foreach` y `class:foo` enteros. Dos elecciones que el SDD no fija: el marcador de
      cierre es `^\s*\}` y no `^\s*\}\s*$`, para que `} else {` **cierre** el `@if` — si
      abriera, el pliegue del `@if` se comería el resto del fichero; y el autocierre de tags
      es lo único de §3.3 que un `language-configuration.json` **no** puede expresar (VS Code
      lo implementa en la extensión de HTML, no de forma declarativa), así que se cubre con
      `onEnterRules` — el salto inteligente entre `>` y `</` — y se anota.
- [x] **7. Gramática, ajustes, defaults y comandos.**
      Añadir a `package.json` el bloque `grammars` de §3.1 (`text.html.fudic` con los tres
      `embeddedLanguages`), los cinco ajustes de §3.2 con sus defaults, el
      `configurationDefaults` de `[fudic]` y los cuatro `commands`. Cinco ajustes y no más:
      cada uno es una rama de comportamiento que hay que probar. Incluye el
      `syntaxes/fudic.tmLanguage.json` **esqueleto** por la misma razón que la tarea 3 creó
      el config de Rolldown: un manifiesto que declara una gramática inexistente es un
      manifiesto incoherente. La tarea 9 le pone contenido.
      La UI contribuida va en **español**, como los títulos que §3.1 fija literalmente; el
      código, los comentarios y los tests siguen en inglés.
- [x] **8. Test del manifiesto.**
      Crear `test/manifest.test.ts`: lee `package.json` y `language-configuration.json` y
      afirma id y extensión del lenguaje, `scopeName` y los tres `embeddedLanguages`, los
      cinco ajustes con sus defaults exactos, los cuatro comandos, que `defaultFormatter`
      coincide con `publisher.name`, que los `activationEvents` incluyen `workspaceContains`
      (§6.12), que **no** hay `lineComment` (§6.5) y que existen los marcadores de plegado
      (§6.6). Todo lo declarativo que se puede romper en silencio queda anclado aquí.

## Fase 2 — Gramática TextMate (8)

- [x] **9. Esqueleto y arnés de tokenización.**
      Crear `syntaxes/fudic.tmLanguage.json` con `scopeName: "text.html.fudic"` y patrón raíz
      vacío, y `test/_tokenize.ts`: registro de gramáticas con `vscode-textmate` +
      `vscode-oniguruma`, gramáticas **vacías** para `source.ts`, `source.css`, `source.js` y
      `text.html` (nota 6), y un helper que devuelve, por offset, la pila de scopes. Es la
      herramienta de la que viven las siete tareas siguientes.
      Lo que costó de verdad: **balancear llaves sin poder contar**. Una expresión regular no
      cierra bloques, así que `@code` no puede terminar en `\}` a secas — el primer `}` de un
      `if` dentro del TS cerraría la región y el resto del fichero pasaría a ser markup. Se
      resuelve con una regla recursiva (`#ts-braces`) que consume cada bloque anidado *antes*
      de que el patrón de cierre lo vea, más guardas de cadena y comentario para que un `}`
      dentro de `"…"` o de `//` no cuente. Es lo que hacen las gramáticas de Razor, y no hay
      atajo.
- [x] **10. Regiones de código.**
      `@code`, `@server` y `@client` → `source.ts` embebido, con el bloque delimitado por sus
      llaves. Prioridad 1 de §4.2: es donde más texto hay y donde peor se ve un fallo.
- [x] **11. `<style>` y `<script>`.**
      `<style>` → `source.css`; `<script>` → `source.js` **raw**, sin transiciones `@`
      (decisión 43).
- [x] **12. Markup.**
      Tags, nombres y valores de atributo, y comentarios `<!-- -->`. Incluye `<link rel href>`,
      que es el markup que el usuario escribe primero en cada fichero.
- [x] **13. Directivas de control.**
      `@if`, `@else`, `@foreach`, `@for`, `@while`, `@switch`, `@section` y `@{ … }`: la palabra
      clave como directiva y la cabecera como `source.ts`.
- [x] **14. Bindings.**
      `class:`, `style:`, `.prop`, `@evento` y `ref` como un scope propio, distinguible de un
      atributo nativo.
- [x] **15. Interpolación, escape y comentario.**
      `@(…)` delimitada — la fiable — y `@ident.path` heurística; `@@` como escape y `@* *@`
      como comentario; heurística de email (decisión 7): un `@` precedido de carácter de
      identificador es literal, no directiva. La imprecisión de `@ident.path` es **aceptable
      por diseño** (§4.2): la corrigen los semantic tokens del servidor.
- [x] **16. Tests de la gramática.**
      Una precisión sobre el «sin arrastre» al escribir los tests: un `@if (a) {` sin cerrar
      **sí** tiñe el resto del fichero, y eso es correcto — es el bloque, no un fallo; todo
      lenguaje se comporta así. Arrastre es una construcción que **tenía** terminador y lo
      falló. Lo que se exige, y se prueba, es que valor de atributo, tag abierto y `@` suelto
      tengan salida (fin de línea, el siguiente `<`) y la tomen.
      Crear `test/grammar.test.ts` sobre los dos fixtures: las regiones embebidas empiezan y
      acaban donde deben, las directivas y bindings tienen scope propio, y —el criterio que
      de verdad importa, §6.2— **sin arrastre**: el último token de cada fichero conserva la
      pila base. Un test por cada construcción de §4.2, incluido el `@` de un email.

## Fase 3 — Arranque del cliente (6)

- [x] **17. Puertos del host.**
      Crear `src/ports.ts`: `WorkspaceApi`, `WindowApi`, `CommandsApi`, `ClientFactory` y
      `Logger` — solo los métodos que se usan. Es la frontera de la nota 5: a partir de aquí
      ningún módulo de dominio importa `vscode`.
- [x] **18. Lectura de ajustes.**
      Crear `src/settings.ts`: los cinco de §3.2 resueltos con sus defaults desde un
      `unknown`. Un ajuste ausente o a `null` tiene que llegar como su default, nunca como
      `TypeError`: el arranque no se aborta por una configuración mal escrita.
- [x] **19. Resolución del servidor.**
      Crear `src/server-path.ts`: `fudic.server.path` si apunta a algo, si no el empaquetado
      (`dist/server.cjs`). El orden es el contrato — el ajuste existe para desarrollar el
      servidor sin reinstalar la extensión.
- [x] **20. Resolución del `tsdk`.**
      **Ambigüedad del SDD resuelta aquí, y merece revisión.** §4.1 pone el TypeScript de la
      propia VS Code como último recurso, pero §6.9 espera que un workspace *sin* TypeScript
      muestre el estado degradado — cosa que nunca ocurriría si esa copia contara como éxito.
      Manda el invariante de §5, «la versión de TypeScript es la del proyecto»: se arranca con
      la de VS Code, y se marca **degradado** igual, porque typechequear contra una versión
      que el build no usa produce diagnósticos que el CI no reproduce. Dos mensajes distintos:
      *no hay ninguno* y *no es el tuyo*.
      Crear `src/tsdk.ts`: `typescript.tsdk` del workspace → `node_modules/typescript/lib` →
      el TypeScript de la propia VS Code. Si no hay ninguno, devuelve cadena vacía y marca
      **degradado**; nunca lanza y nunca aborta el arranque (§4.1, criterio §6.9).
- [x] **21. Opciones del cliente.**
      Crear `src/client-options.ts`: `documentSelector: [{ scheme: 'file', language: 'fudic' }]`,
      `synchronize.fileEvents` sobre `**/*.fud`, `**/tsconfig*.json` y `**/package.json`,
      `initializationOptions` con el `tsdk` y `fudic.{templateDiagnostics, exposeVirtualFiles}`,
      canal de salida y `trace`. Más `test/client-options.test.ts`: los tres watchers y el
      `tsdk` vacío en degradado.
- [x] **22. Activación.**
      Crear `src/activate.ts` — la función de activación sobre los puertos, que resuelve
      servidor y `tsdk`, arranca el cliente y avisa **una sola vez** en degradado — y dejar
      `src/extension.ts` como el adaptador sin ramas que construye los puertos desde `vscode`.
      Nada pesado aquí: el trabajo vive en el proceso del servidor (§5).

## Fase 4 — Estado visible y resiliencia (3)

- [x] **23. Barra de estado.**
      Crear `src/status.ts`: los cuatro estados de §4.4 (`Fudic ✓ ⟳ ⚠ ✕`), visible **solo**
      con un `.fud` activo, y click → canal de salida. Un fallo silencioso es indistinguible
      de un LSP lento; esto convierte «no me funciona» en un dato.
- [x] **24. Supervisión del servidor.**
      Crear `src/supervisor.ts`: tres reintentos con retroceso exponencial y, después,
      `Fudic ✕` más oferta de reinicio manual. **No se reintenta en bucle.** El reloj se
      inyecta: un test que espera de verdad no es un test.
- [x] **25. Tests de estado y supervisión.**
      Crear `test/status.test.ts` y `test/supervisor.test.ts`: transición entre los cuatro
      estados, ocultarse al cambiar a un fichero que no es `.fud`, exactamente tres
      reintentos con sus esperas, y que tras el tercero el reinicio manual sigue disponible
      (§5).

## Fase 5 — Comandos (4)

- [x] **26. `fudic.restartServer`.**
      Reiniciar **re-resuelve todo** (ajustes, servidor, `tsdk`), no solo vuelve a llamar a
      `start()`. Es lo que §4.3 pide de verdad: las causas —dependencia recién instalada,
      cambio de rama, `tsdk` distinto— cambian *las respuestas*, así que relanzar el mismo
      `launch` no arreglaría ninguna. El `warnOnce` sobrevive al reinicio, para que un
      servidor que cae tres veces no avise tres veces de lo mismo.
      Crear `src/commands/restart.ts`: para y relanza. Disponible **también** con el servidor
      caído — es la válvula de escape de §4.3, y una extensión sin ella se queda colgada sin
      salida cuando la invalidación falla.
- [x] **27. `fudic.showVirtualFiles`.**
      Crear `src/commands/virtual-files.ts` y `src/virtual-doc-provider.ts`: petición
      `fudic/virtualFiles` sobre el fichero activo y un documento de **solo lectura** por
      virtual, con su `languageId`, tras un esquema propio (`fudic-virtual:`). Criterio §6.8.
- [x] **28. `fudic.showRegistry`.**
      Crear `src/commands/registry.ts`: `fudic/componentRegistry` volcado como tabla
      `tag → href → resuelto`. Diagnostica en un segundo el «por qué mi componente no
      completa».
- [x] **29. `fudic.formatDocument` y registro.**
      Crear `src/commands/format.ts` —delega en el servidor (SDD-26) y respeta
      `fudic.format.enable`— y `src/commands/index.ts`, que registra los cuatro. Más
      `test/commands/*.test.ts` contra un cliente doble: cada comando con el servidor vivo y
      con el servidor caído.

## Fase 6 — Empaquetado (3)

- [x] **30. Bundle de la extensión.**
      Completar `rolldown.config.ts` (el mínimo lo creó la tarea 3): `dependencies` reales
      dentro del bundle, y comprobar que `dist/extension.cjs` carga bajo `require` con
      `vscode` doblado.
- [x] **31. Bundle del servidor.**
      **Aquí estaba el fallo que solo aparece al ejecutar el bundle**, y ninguna suite lo
      veía: (a) `oxc-parser` es un addon NAPI y su `.node` **no se puede bundlear** — el
      loader hace `require('./parser.<target>.node')` y el bundler lo reescribe a nada, así
      que se marca externo y `scripts/vendor-native.mjs` lo copia a `dist/node_modules/`,
      donde Node lo encuentra sin instalar nada; **consecuencia: el `.vsix` es específico de
      plataforma** y una release va por target, que es el mecanismo que VS Code tiene para
      esto; (b) `vscode-html-languageservice` y `vscode-css-languageservice` resolvían por
      `main`, que es su build **UMD**, cuya factoría hace `require('./parser/htmlScanner')`
      —relativo, no seguible— y moría al cargar: `resolve.mainFields: ['module','main']` toma
      el ESM. Verificado ejecutando el bundle de verdad: contesta `initialize` y devuelve los
      tres virtuales de `[slug].fud`.
      Añadir la segunda entrada: `@fudic/language-server` → `dist/server.cjs`, un único
      fichero (§4.5). Instalar la extensión no debe requerir instalar nada más — es el
      criterio §6.11 en su parte de construcción.
- [x] **32. Empaquetado del `.vsix` y su verificación.**
      Crear `.vscodeignore`, el script `package` (`vsce package`) y `scripts/verify-vsix.ts`,
      que abre el `.vsix` producido y comprueba que dentro están la extensión, el servidor, la
      gramática, la configuración del lenguaje y los iconos. No es un test de Vitest: no debe
      correr en cada `pnpm test`, sino antes de cerrar la SDD.

## Fase 7 — Criterios de aceptación del SDD (2)

- [x] **33. Los criterios automatizables.**
      Crear `test/acceptance/*.test.ts`: §6.2 completo (color sin arrastre en los dos
      fixtures), §6.5 y §6.6 en su parte declarativa, §6.8 (los tres virtuals contra un
      servidor doble), §6.9 (arranque degradado: avisa una vez, estado `⚠`, cliente arrancado
      igual), §6.10 (caída → `✕`, tres reintentos, reinicio ofrecido) y §6.12 (activación por
      `workspaceContains`). Con los puertos de la tarea 17 no hace falta VS Code para ninguno.
- [x] **34. Guion de verificación manual.**
      Crear `docs/verificacion-manual.md` en el paquete: los criterios que exigen un editor
      vivo o un `.vsix` instalado —§6.1, §6.3, §6.4, §6.7, §6.11 y las partes de §6.5, §6.6 y
      §6.12 que solo se ven en el host— como pasos numerados con casilla y resultado
      esperado. Se ejecuta una vez antes de cerrar la SDD y se anota el resultado. Es la
      alternativa (b) de la nota 2: si Pedro elige (a), esta tarea la sustituye una fase de
      `@vscode/test-electron`.

---

## Cierre de la SDD

- [x] `pnpm typecheck`, `pnpm test` y `pnpm build` en verde.
- [x] Cobertura **100 %** en líneas, funciones, ramas y sentencias, con `coverage.include`
      sobre `src/**`.
- [x] `pnpm --filter fudic-vscode package` y `verify-vsix` en verde (tarea 32).
- [ ] Guion de verificación manual ejecutado y anotado (tarea 34) — **pendiente de Pedro**:
      son los ocho pasos que exigen un VS Code vivo o el `.vsix` instalado.
- [x] Marcar SDD-25 como `Hecho` y anotarlo en [INDEX.md](./INDEX.md) (tabla + registro de
      progreso).
