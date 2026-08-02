# SDD-25 — Lo que queda

Salió de instalar la extensión y usarla, no de la spec. Todo lo hecho está en `main`.
Nada de aquí bloquea nada: la extensión funciona instalada.

Cada punto dice **qué pasa**, **dónde se toca** y **qué hay que decidir**. Nada más.

---

## 1. Cada reinicio filtra tres watchers

`Fudic: Restart Language Server` crea tres `FileSystemWatcher` nuevos y no suelta los
viejos. El cliente LSP solo dispone los *listeners* que engancha, nunca los watchers.

**Dónde:** [`packages/vscode/src/extension.ts:61`](../../packages/vscode/src/extension.ts#L61)
los crea dentro de `createClient`, y no entran en `context.subscriptions`. Hay que
devolverlos junto al cliente y disponerlos al parar, en
[`activate.ts`](../../packages/vscode/src/activate.ts) (`stopQuietly` / `boot`).

**Decidido.** Es un fallo, se arregla.

## 2. Un `[Error]` rojo en cada reinicio

En el canal **Fudic** sale `[Error] Server process exited with code 0.` cada vez que se
reinicia. **No es un fallo**: es el servidor viejo apagándose limpiamente. `vscode-languageclient`
loguea la muerte del proceso como error sin mirar si la parada la pedimos nosotros
(`node_modules/vscode-languageclient/lib/node/main.js:468-477`). Código 0 = salida limpia.

**Dónde:** si se filtra, en el `OutputChannel` que crea
[`packages/vscode/src/extension.ts:77`](../../packages/vscode/src/extension.ts#L77) —
envolverlo y descartar esa línea exacta mientras haya una parada nuestra en vuelo.

**Por decidir:** filtrarlo, o dejarlo y explicarlo en `EXTENSION-DEV.md`.

## 3. El remoto de los `package.json` está mal

Dicen `github.com/fudie/fudic`. El remoto real es `github.com/fudiePlatform/fudic.git`.
`fudie` es el producto de gestión de restaurantes; `fudic` es el compilador (la `e` por
`c`); `fudiePlatform` es la organización con la que se publica el open source. El error
viene de specs redactadas en Claude Web, que conocía la plataforma y no el repo.

**Dónde:** 14 ficheros — `package.json` de la raíz y de los once paquetes, más
`packages/cli/templates/README.md.tmpl`. Tres campos cada uno: `homepage`, `repository.url`,
`bugs.url`. Es un reemplazo de `fudie/fudic` por `fudiePlatform/fudic`, sin más.

**Decidido.** Se corrige.

## 4. El template acepta TypeScript que no debería

Hoy una expresión del template admite cualquier cosa que Oxc parsee: un `@import` en un
atributo, una expresión que devuelve una promesa, lo que sea. El template debería aceptar
solo lo que la gramática dice que es, y nada más. Dentro de `@code` no hay restricción:
ahí cada uno escribe lo que quiera, bajo su responsabilidad.

**Dónde:** es una regla semántica, no de parseo — vive con los analizadores de SDD-12,
en [`packages/compiler/src/semantic/`](../../packages/compiler/src/semantic/), sobre las
expresiones que ya se recorren con `walk`. La mitad de tipos ya existe: `$text` exige
`$Scalar` (decisión 19), así que interpolar un objeto ya falla. Lo que falta es la parte
sintáctica: qué construcciones de JS/TS se prohíben dentro del template.

**Por decidir, y es lo grande:** la lista de lo prohibido. Sale una spec propia — qué se
rechaza, con qué código `FUD`, y sobre qué span. No es trabajo de SDD-25.

## 5. Test frágil de reloj

`§6.14 — cancellation > a burst of edits leaves exactly one request completed` cae cuando
corren los once paquetes en paralelo, y pasa en aislado. Depende del reloj real.

**Dónde:** `packages/language-server/test/` — el mismo patrón de reloj inyectado que ya usa
`supervisor.ts` en la extensión.

**Decidido.** Se arregla cuando toque; no corre prisa.

## 6. Guion de verificación manual

Los ocho pasos de
[`packages/vscode/docs/verificacion-manual.md`](../../packages/vscode/docs/verificacion-manual.md)
siguen sin anotar. Es la última casilla de [SDD-25-Task.md](./SDD-25-Task.md).
Solo se puede hacer delante del editor.

---

## Ya cerrado — no rehacer

- **Reinicio del servidor.** Funciona: mantiene el IntelliSense sin recargar la ventana.
- **Emmet**, solo en el markup, desde el servidor
  ([`services/emmet.ts`](../../packages/language-server/src/services/emmet.ts)), más los
  caracteres que continúan una abreviatura en `capabilities.ts`.
- **IntelliSense en atributos** (`editor.quickSuggestions.strings` en el manifiesto) y **en
  una expresión a medio escribir** (`copyExpression` en `language-core`).
- **Workspace en verde**: 2176 tests, cobertura 100 % en `language-core`, `language-server`
  y `vscode`. `verify:vsix` y `verify-server-bundle` pasan sobre el `.vsix` instalado.

## Aplazado — no hay publicación a la vista

La página de la extensión: icono PNG 128×128, `CHANGELOG.md` y que el `LICENSE` viaje en el
`.vsix`. Ninguno afecta al funcionamiento. Se retoman si se publica.

Descartados: el tercer texto del estado degradado, y vendorizar TypeScript en el `.vsix`
para sostener el fallback que promete SDD-24 §6.1.
