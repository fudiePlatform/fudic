# Lo que queda — tareas ordenadas

Sale de usar la extensión, ejecutar `fudic new` y abrir `examples/basic`, no de una spec.
Empezó siendo el resto de SDD-25 y ya no lo es: hay puntos de SDD-19, SDD-22, SDD-23 y SDD-24.

**Las tareas están en orden de implementación: se hacen de arriba abajo.** Cada una dice
**qué hacer**, **qué ficheros toca** y **cuándo está hecha**. Toda causa raíz está confirmada
leyendo el código, con fichero y línea, salvo donde se dice lo contrario.

Una tanda, un worktree. Dentro de una tanda, el orden importa.

---

## Tabla

| # | Tarea | Tanda | Paquete | Estado |
|---|---|---|---|---|
| T-01 | Corregir el remoto de los `package.json` | 0 · base | repo | **Hecho** |
| T-02 | Test frágil de reloj | 0 · base | `language-server` | **Hecho** |
| T-03 | `fudic new` debe fallar cuando un comando falla | 1 · scaffold | `cli` | **Hecho** |
| T-04 | El `git commit` del scaffold falla en Windows | 1 · scaffold | `cli` | **Hecho** |
| T-05 | `git init` crea la rama `master` | 1 · scaffold | `cli` | **Hecho** |
| T-06 | Registry local con Verdaccio | 1 · scaffold | repo | **Hecho** |
| T-07 | Plantilla de `fudic g component` con `@code` | 1 · scaffold | `cli` | **Hecho** |
| T-08 | `Show virtual files` abre los editores vacíos | 2 · extensión | `vscode` | **Hecho** |
| T-09 | Cada reinicio filtra tres watchers | 2 · extensión | `vscode` | **Hecho** |
| T-10 | Documentar el `[Error]` del reinicio | 2 · extensión | `vscode` | **Hecho** |
| T-11 | BUG: `slot=` se proyecta como prop | 3 · slots | `language-core` | **Hecho** |
| T-12 | Contrato de slots: `$Slots` | 3 · slots | `language-core` | **Hecho** |
| T-13 | Tags de componente: snippet + auto-link | 4 · edición | `language-server` | Pendiente |
| T-14 | Completado de directivas `@` | 4 · edición | `language-server` | Pendiente |
| T-15 | `@RenderSection(` y la query inversa del índice | 4 · edición | `language-server` | Pendiente |
| T-16 | Anotar el guion de verificación manual | 5 · cierre | `vscode` | Pendiente |
| T-17 | `<link rel="modulepreload">` | Aplazada · SDD-15/17 | `compiler` · `vite` | Aplazada |
| T-18 | El template acepta TypeScript que no debería | Aplazada · spec propia | `compiler` | Aplazada |

**Decisiones tomadas, no se rediscuten:** solo T-11 lleva documento propio (`bugs/BUG-11`),
el resto se implementa desde aquí · el `[Error]` del reinicio se documenta, no se filtra ·
«sin slots, sin hijos» queda fuera de T-12 · un comando que falla es exit code 1 · el `<link>`
auto-insertado va tras el último `rel="component"`, y si no hay, tras el `rel="layout"`.

---

# Tanda 0 — Base fiable

Ninguna de las dos es interesante y las dos contaminan lo que viene detrás: T-01 porque los
tarballs de T-06 llevan esos campos dentro, T-02 porque voy a ejecutar `pnpm test` en la raíz
constantemente y un rojo intermitente enseña a ignorar el rojo.

## T-01. Corregir el remoto de los `package.json`

Dicen `github.com/fudie/fudic`; el remoto real es `github.com/fudiePlatform/fudic.git`.
`fudie` es el producto de restaurantes, `fudic` el compilador, `fudiePlatform` la organización
del open source. Viene de specs redactadas en Claude Web.

**Qué:** reemplazar `fudie/fudic` por `fudiePlatform/fudic` en `homepage`, `repository.url` y
`bugs.url`.

**Ficheros:** `package.json` de la raíz y de los once paquetes, más
[`packages/cli/templates/README.md.tmpl`](../../packages/cli/templates/README.md.tmpl). 14 en total.

**Hecho cuando:** `grep -r "fudie/fudic"` no devuelve nada.

**HECHO.** 14 ficheros: los 13 `package.json` (raíz + doce paquetes — eran doce, no once) y
`README.md.tmpl`. Las dos únicas apariciones que quedan son las de este fichero y las de
`SDD-25-Task-Pedro.md`, que *describen* el error y no deben cambiar. Sin test: es metadata de
empaquetado y ningún test la afirmaba; verificado que los 13 JSON siguen parseando.

## T-02. Test frágil de reloj

`§6.14 — cancellation > a burst of edits leaves exactly one request completed` cae cuando
corren los once paquetes en paralelo y pasa en aislado: depende del reloj real.

**Qué:** reloj inyectado, el mismo patrón que ya usa `supervisor.ts` en la extensión.

**Ficheros:** `packages/language-server/test/` (el test), y el módulo que mida el tiempo en
`src/` si hay que abrirle la costura.

**Hecho cuando:** `pnpm test` en la raíz sale verde tres veces seguidas.

**HECHO.** El diagnóstico de partida era equivocado: el test **ya** evitaba el reloj con
`harness.pause()`/`resume()`. Lo que quedaba suelto es que `sendRequest` y `token.cancel()`
retornan **antes** de que sus bytes lleguen al pipe, así que `resume()` soltaba lo que hubiera
llegado — y cuánto es eso sí depende de lo cargada que esté la máquina. Ahora `resume(frames)`
espera a tener retenida la ráfaga entera (`BURST*3−1`: 5 ediciones, 5 peticiones, 4
cancelaciones) contando cabeceras `Content-Length`. Sigue sin haber reloj: se espera un
**evento**, no una duración.

Solo `test/`, `src/` intacto — cobertura de `language-server` sigue en 100/100/100/100.
`pnpm test` en la raíz, verde tres veces seguidas: 2254 tests.

---

# Tanda 1 — Que `fudic new` produzca algo instalable

T-03 va primero porque es el instrumento de medida: mientras la CLI salga con 0 pase lo que
pase, no se puede distinguir «el registry local funciona» de «falló y no me enteré».

## T-03. `fudic new` debe fallar cuando un comando falla

`nodeCommandRunner.run` descarta el resultado de `spawnSync`, así que un `pnpm install` que
muere no llega ni al código de salida ni al informe: la CLI dice `create …` y sale 0 sobre un
proyecto que no compila.

**Qué:** leer el `status` de `spawnSync`, propagarlo a `apply`, y que `run` salga con **1**
diciendo qué comando murió y con qué código. Los ficheros ya escritos **no** se revierten: se
escriben antes que los comandos y eso no cambia.

**Ficheros:**
- [`packages/cli/src/io.ts:48-57`](../../packages/cli/src/io.ts#L48-L57) — `CommandRunner.run`
  pasa a devolver el resultado; la interfaz cambia.
- [`packages/cli/src/apply.ts:12-24`](../../packages/cli/src/apply.ts#L12-L24) — recoge el fallo.
- [`packages/cli/src/run.ts:105-107`](../../packages/cli/src/run.ts#L105-L107) — código de salida.
- [`packages/cli/src/types.ts`](../../packages/cli/src/types.ts) — el tipo del resultado.
- `packages/cli/test/` — los dobles de `CommandRunner` en `helpers.ts` y `new.test.ts`.

**Hecho cuando:** un test con un runner que devuelve `status: 1` hace que `run` salga 1.

**HECHO.** `CommandRunner.run` devuelve `number | null` —`null` es «el proceso no llegó a
arrancar», que no es lo mismo que salir distinto de cero y no merece el mismo mensaje—. `apply`
devuelve `ApplyResult { changes, failed? }` y **para en el primer fallo**: si el install muere,
los tres `git` que venían detrás son ruido encima de un árbol que no compila. Los ficheros ya
escritos **no** se revierten: se escriben antes de cualquier comando y borrarlos le quitaría al
usuario el árbol que va a mirar. `FUD0451` nuevo, y `run` sale 1 **después** de listar lo
creado, así que los dos hechos llegan.

`apply.ts` y `diagnostics.ts` pasan a 100 % en las cuatro métricas; `run.ts` 80,4 → 85,7 stmts.
`io.ts` sigue en su deuda heredada (los `node*Io` no los ejercita nadie). Paquete: 91,66 → 92,70
stmts, 84,29 → 85,95 ramas. 75 tests.

## T-04. El `git commit` del scaffold falla en Windows

`error: pathspec 'scaffold' did not match any file(s) known to git`, y el commit inicial no se
hace. El runner usa `shell: true` en Windows (necesario: `pnpm` es un `.cmd`), y con
`shell:true` Node une el argv en una línea **sin citar nada**, así que
`['commit','-m','chore: scaffold fudic app']` llega a `cmd.exe` como
`git commit -m chore: scaffold fudic app`. `git add -A` se salva por no llevar espacios.

**Qué:** el shell solo para el gestor de paquetes. `git` es un `.exe` y no lo necesita, así que
la decisión pasa a ser por comando en vez de por plataforma.

**Ficheros:** [`packages/cli/src/io.ts:48-57`](../../packages/cli/src/io.ts#L48-L57)
(mismo bloque que T-03: van juntas o se pisan).

**Hecho cuando:** un test afirma que el comando `git` se lanza sin shell y que el mensaje llega
como **un** argumento; y `fudic new` deja un commit real en Windows.

**HECHO.** La decisión pasa a ser **por comando**, no por plataforma: `needsShell` da shell a
`pnpm`/`npm`/`yarn` en Windows —son shims `.cmd` que `spawnSync` no puede arrancar de otra
forma— y a nada más. El test **commitea de verdad** en un repo temporal con el mensaje del
scaffold: es la única forma de que el defecto sea observable, y falla contra el código anterior.
`io.ts` 77,8 → 89,7 stmts y 62,5 → 77,8 ramas.

## T-05. `git init` crea la rama `master`

El plan emite `git init` a secas, así que manda `init.defaultBranch`, que sin configurar es
`master`. La CLI no opina y debería.

**Qué:** `git init -b main` (git ≥ 2.28).

**Ficheros:** [`packages/cli/src/plans/new.ts:108-114`](../../packages/cli/src/plans/new.ts#L108-L114),
y la aserción de comandos en `packages/cli/test/new.test.ts`.

**Hecho cuando:** el plan contiene `['init','-b','main']` y el proyecto generado está en `main`.

**HECHO.** Afirmado en los dos niveles: el plan lo contiene (`new.test.ts`) y el repo temporal
de `io.test.ts` sale en `main` tras pasar por el runner real.

## T-06. Registry local con Verdaccio

`fudic new` genera un `package.json` que pide `@fudic/core`, `@fudic/ssr`, `@fudic/transport`
y `@fudic/vite` en `0.0.1`, y ninguno está en npm: `pnpm install` muere con
`ERR_PNPM_FETCH_404`. No es un defecto del código, es que estamos antes de publicar — pero
deja el scaffold sin probar de punta a punta.

**Qué:** un script de repo que levante Verdaccio en `localhost:4873`, publique el workspace
(`pnpm -r publish --registry … --no-git-checks`) e instale el proyecto generado apuntando ahí.
Se elige sobre `pnpm pack` + `file:` y sobre `link:` porque **no hay que tocar ni la CLI ni la
plantilla** —solo cambia dónde se resuelve— y porque publica el tarball de verdad, así que
prueba también `files`, `exports` y `publishConfig`. `link:` queda descartado: se salta el
empaquetado entero y con `oxc-parser` (NAPI) arriesga duplicar la instancia nativa.

Verdaccio rechaza republicar la misma `0.0.1`: el script limpia su storage en cada ciclo.

**Ficheros:** `scripts/` en la raíz (nuevo), `package.json` de la raíz (el script), y
`.gitignore` (el storage del registry). La plantilla
[`packages/cli/templates/package.json.tmpl`](../../packages/cli/templates/package.json.tmpl)
**no se toca**.

**Hecho cuando:** `fudic new demo` → install desde el registry local → `pnpm build` →
`vite build`, todo en verde, con rama `main` y commit inicial hecho. Eso cierra de rebote el
aviso de TypeScript degradado de la extensión, sin tocar `vscode`.

**HECHO.** `pnpm registry` → [`scripts/local-registry.mjs`](../../scripts/local-registry.mjs) +
[`scripts/verdaccio.yaml`](../../scripts/verdaccio.yaml). Construye, borra el storage —Verdaccio
rechaza republicar `0.0.1` sobre `0.0.1`, y un registry sirviendo el tarball de un build
anterior es peor que ninguno—, levanta Verdaccio 6.9.1 en `localhost:4873`, publica los **once**
paquetes publicables y se queda arriba. `@fudic/*` sin uplink a propósito: caer a npm sería
probar en silencio una versión que nadie construyó.

**Verificado de punta a punta**, y de paso cierra T-04 y T-05 sobre el terreno:

```
npm_config_registry=http://localhost:4873 fudic new demo
  → [main (root-commit) 429c250] chore: scaffold fudic app     ← un solo mensaje, rama main
  → node_modules/{typescript,@fudic/{core,ssr,transport,vite}}  ← install real, sin 404
vite build → dist/index.html + fudic-sw.js + fudic-main.js + chunks    ✓ 166 ms
```

Que exista `node_modules/typescript/lib` es lo que cierra el aviso degradado de la extensión.
Sin test unitario: es un script de andamiaje que arranca un servidor y publica: lo que lo
verifica es el ciclo completo de arriba, no un doble.

## T-07. Plantilla de `fudic g component` con `@code`

Hoy genera markup + `<style>` con un `<div class="app-button">` y comentarios de relleno.
Debe generar:

```
@code {
  @client {}
}
<head>
  <style></style>
</head>

<app-button>
  <template shadowrootmode="open">
  </template>
</app-button>
```

**Por qué cambia la decisión de SDD-22 §4.3.** La cabecera de `plans/component.ts` justificaba
el N1 puro diciendo que el nivel lo infiere el compilador. Pero **un componente no tiene nivel
propio**: [`packages/vite/src/client.ts:5-11`](../../packages/vite/src/client.ts#L5-L11) lo dice
literal —«Every component gets one, with no level filter»— y emite el chunk de cliente haya o
no `@client`, así que un `@client {}` vacío no reclasifica nada. Y lo que de verdad cuesta
escribir a mano son las props: `props<T>()` se busca en la **zona neutral** de `@code`
([`language-core/src/emit.ts:88-96`](../../packages/language-core/src/emit.ts#L88-L96)), que es
justo el hueco que abre la plantilla nueva. Un componente que es solo HTML y estilo es el caso
raro, no el común.

**Ficheros:**
- [`packages/cli/templates/component.fud`](../../packages/cli/templates/component.fud) — la plantilla.
- [`packages/cli/src/templates.ts:90-102`](../../packages/cli/src/templates.ts#L90-L102) —
  `styleBlock` pasa a emitir `<style></style>` vacío; y su `sample` en `TEMPLATES` (§6.7).
- [`packages/cli/src/plans/component.ts:1-6`](../../packages/cli/src/plans/component.ts#L1-L6) —
  la cabecera argumenta hoy lo contrario: se reescribe.
- `packages/cli/test/component.test.ts` y `templates.test.ts`.
- [`docs/sdd/SDD-22-fudic-cli.md`](./SDD-22-fudic-cli.md) §4.3.

**Hecho cuando:** el fichero generado parsea como `component-document`, y un test afirma que un
`@client {}` **vacío** no dispara diagnóstico ni rompe el emit del chunk de cliente. Eso último
es lo único de la tarea que no está verificado por lectura.

**HECHO, con las props que pidió Pedro.** La plantilla emite además el tipo y la llamada:

```
@code {
  type Props = {
  };

  const {} = props<Props>();

  @client {}
}
```

`props<T>()` vive en la zona neutral, fuera de `@client`, que es donde el emisor lo busca — así
que la plantilla abre justo ese hueco. Fuera el `<div class="<tag>">`, la regla CSS de ejemplo y
el comentario de relleno: un placeholder es texto que hay que borrar antes de escribir nada.
`<style></style>` vacío y `<template shadowrootmode="open">` vacío salvo `--slot`.

**El `@client {}` vacío está verificado, y no por inspección:** `new-build.test.ts` genera un
componente, lo cablea en la ruta generada y pasa el árbol por un `vite build` real; el chunk
`assets/h/app-button-<hash>.js` sale. De paso destapó un hueco del propio arnés — faltaba el
alias de `@fudic/core`, que solo hace falta cuando hay un componente en el árbol.

SDD-22 §4.3 reescrito. `plans/component.ts` pasa a 100 % en las cuatro métricas; paquete 93,25 →
93,78 stmts y 86,57 → 87,39 ramas. 80 tests.

---

# Tanda 2 — Extensión

Va después de la 1 porque hasta entonces no existe un proyecto generado con su propio
TypeScript donde verificar nada: hacerlo sobre un workspace degradado es verificar otra cosa.

## T-08. `Show virtual files` abre los editores vacíos

Se abren `<nombre>.fud.ts` y `<nombre>.fud.server.ts` con el nombre correcto en la pestaña y
sin una línea de contenido.

**Causa (confirmada por lectura, no ejecutada).** La clave de la URI no hace round-trip. `put()`
guarda bajo `` `fudic-virtual:${encodeURIComponent(name)}` ``, donde `name` es la **ruta
absoluta** del virtual, y `encodeURIComponent` codifica `/` como `%2F`. El provider consulta por
`uri.toString()`, y `Uri.parse` + `toString()` de VS Code decodifica y re-codifica con *su*
tabla, que codifica `:`, `[` y `]` pero **deja `/` intacto**. Clave guardada ≠ clave consultada
→ `get()` devuelve `''`.

**Qué:** una sola decisión — qué forma canónica de URI es la clave — aplicada en los dos lados.
**Antes de tocar nada, medir dos cosas:** (a) deberían abrirse **tres** ficheros, no dos, porque
`emitVirtualFiles` emite cliente + servidor + un CSS por `<style>`
([`language-core/src/emit.ts:61-70`](../../packages/language-core/src/emit.ts#L61-L70)) y el
componente generado tiene uno; (b) el virtual de servidor de un componente sin `@code` es
legítimamente `export {};`
([`emit-server.ts:47`](../../packages/language-core/src/emit-server.ts#L47)), **así que el
discriminante es el de cliente**: si `.fud.ts` sale vacío es la URI; si sale con contenido, la
causa es otra y este diagnóstico no vale.

**Ficheros:**
- [`packages/vscode/src/virtual-doc-provider.ts:25-39`](../../packages/vscode/src/virtual-doc-provider.ts#L25-L39) — el `put`.
- [`packages/vscode/src/extension.ts:89-91`](../../packages/vscode/src/extension.ts#L89-L91) — el `get`.
- [`packages/vscode/src/commands/virtual-files.ts`](../../packages/vscode/src/commands/virtual-files.ts) — el comando, si el fallo es el conteo.
- `packages/vscode/test/` — un test de round-trip `put` → `Uri.parse` → `toString` → `get`.

**Hecho cuando:** los tres virtuales se abren con su contenido y su lenguaje.

**HECHO.** Las dos mediciones primero, y las dos zanjan el diagnóstico:

```
encodeURIComponent : fudic-virtual:c%3A%2FUsers%2F…%2Fapp-button.fud.ts
Uri.parse+toString : fudic-virtual:c%3A/Users/…/app-button.fud.ts        ← nunca coinciden
emitVirtualFiles   : componente con <style> → 3 virtuales; el de cliente, 91 chars
```

El de cliente **no** salía vacío, así que era la URI, tal y como decía el discriminante. Y el
recuento es correcto: 3 con `<style>` no vacío, 2 con el `<style></style>` de la plantilla nueva
—un estilo vacío no produce nodo, así que no hay CSS que proyectar—. El emisor nunca tuvo culpa.

**La clave pasa a ser el NOMBRE, no el texto de la URI**, y el provider consulta con `uri.path`,
que es lo que `Uri.parse` devuelve decodificado. Simétrico por construcción, sin depender de que
dos codificadores distintos se pongan de acuerdo.

**Por qué el 100 % no lo vio:** el doble de `vscode` tenía
`Uri.parse: (v) => ({ toString: () => v })` —la identidad— y el test del store hacía
`get(put(...))` con su propia cadena. Los dos round-trippeaban su propia codificación. Ahora el
doble usa `vscode-uri`, que es la implementación que VS Code embarca, y los tests preguntan al
provider con el objeto `Uri` que tiene el editor. `vscode-uri@3.1.0` entra como devDependency.

Cobertura de `vscode`: sigue en 100/100/100/100. 157 tests.

## T-09. Cada reinicio filtra tres watchers

`Fudic: Restart Language Server` crea tres `FileSystemWatcher` nuevos y no suelta los viejos:
el cliente LSP solo dispone los *listeners* que engancha, nunca los watchers.

**Qué:** devolverlos junto al cliente y disponerlos al parar.

**Ficheros:**
- [`packages/vscode/src/extension.ts:61`](../../packages/vscode/src/extension.ts#L61) — se crean
  dentro de `createClient` y no entran en `context.subscriptions`.
- [`packages/vscode/src/ports.ts`](../../packages/vscode/src/ports.ts) — `LanguageClientPort`
  gana los disposables.
- [`packages/vscode/src/activate.ts`](../../packages/vscode/src/activate.ts) — `stopQuietly` / `boot`.
- `packages/vscode/test/activate.test.ts`.

**Hecho cuando:** un test afirma que N reinicios dejan N·3 disposiciones, no N·3 watchers vivos.

**HECHO.** `LanguageClientPort` gana `dispose()`, los watchers se retienen por nombre en
`createClient` y `stopQuietly` los suelta en un **`finally`**, no tras el `await`: el cliente que
no se pudo parar es justamente aquel cuyos watchers no va a soltar nadie más, y saltárselo ahí es
como un bucle de reinicios acaba reteniendo un juego por intento. El doble del watcher ahora
**cuenta** sus `dispose`, que es lo que hacía falta para que el defecto fuese observable.
Cobertura de `vscode`: 100/100/100/100. 158 tests.

## T-10. Documentar el `[Error]` del reinicio

En el canal **Fudic** sale `[Error] Server process exited with code 0.` en cada reinicio. **No
es un fallo:** es el servidor viejo apagándose limpiamente. `vscode-languageclient` loguea la
muerte del proceso como error sin mirar si la parada la pedimos nosotros
(`node_modules/vscode-languageclient/lib/node/main.js:468-477`). Código 0 = salida limpia.

**Qué:** se documenta, **no se filtra**. Envolver el `OutputChannel` para descartar una línea
por coincidencia de texto es acoplarse a la cadena literal de una dependencia, y el día que
cambie el filtro se queda mudo sin avisar.

**Ficheros:** [`EXTENSION-DEV.md`](../../EXTENSION-DEV.md) §«When it doesn't» — está en la raíz
del repo, no dentro de `packages/vscode`.

**Hecho cuando:** está escrito.

**HECHO.** Anotado junto a los otros dos síntomas de arranque, diciendo además **por qué no se
filtra**: envolver el canal para descartar una línea por coincidencia literal con la cadena de
una dependencia deja el filtro mudo el día que esa cadena cambie —y precisamente en el canal
cuyo trabajo es ser el único sitio donde asoma un fallo de verdad—.

---

# Tanda 3 — Slots

T-11 no va antes que T-12 aunque sea el bug con test que falla hoy: arreglarlo solo significa
una lista negra de atributos globales que hay que mantener a mano y que se queda corta el día
que alguien use `inert`. T-12 lo arregla por tipos. Al revés se paga dos veces.

Empieza por el documento, no por el código: cruza paquetes, cambia la interfaz pública del
emisor y añade globals.

## T-11. BUG: `slot=` se proyecta como prop

`<app-badge slot="meta">` produce *«El literal de objeto solo puede especificar propiedades
conocidas y 'slot' no existe en el tipo `{ tone?: Tone }`»*.

**Causa.** `emitProps` mete en el literal de objeto **todo binding de tipo `attr` o `property`**
y lo comprueba contra el contrato del componente:

```ts
$attrs<$C0>({ slot: "meta", tone: (…) });   // $C0 = { tone?: Tone }
```

`slot` es un atributo **global de HTML**, no una prop. El filtro solo excluye los bindings de
*comportamiento* (event/bus/class/style/ref); no existe la noción de «atributo global que no es
prop».

**Alcance — no es solo `slot`:** caen igual `id`, `part`, `exportparts`, `hidden`, `lang`,
`dir`, `title`, `tabindex`, `role`, `aria-*`, `data-*`, y un `class="x"` o `style="x"`
**estáticos** (los dinámicos escapan por ser binding `class`/`style`).

**Qué:** escribir `docs/sdd/bugs/BUG-11-slot-como-prop.md` + `BUG-11-Task.md` con el formato de
esa carpeta. Es el **único** punto de este fichero que lleva documento propio, porque es el
único cuyo alcance va más allá del síntoma y cambia interfaz pública. Su §4 «comportamiento
corregido» es T-12: se arregla por tipos, no con una lista negra.

**Ficheros a citar en el BUG:**
- [`packages/language-core/src/template/attrs.ts:69-97`](../../packages/language-core/src/template/attrs.ts#L69-L97),
  el filtro en la [línea 74](../../packages/language-core/src/template/attrs.ts#L74).
- Reproducción: [`examples/basic/routes/blog/index.fud:48`](../../examples/basic/routes/blog/index.fud#L48)
  contra [`examples/basic/components/app-badge.fud`](../../examples/basic/components/app-badge.fud).
  Ahí está el test que falla primero.

**Sin explicar, y va en el BUG como tal:** el error sale **dos veces**. La hipótesis obvia queda
descartada — el mapping del área de atributos usa `COMPLETION_ONLY_CAPS`, con
`verification: false` ([`caps.ts:55-62`](../../packages/language-core/src/caps.ts#L55-L62)), así
que por ahí no rutan diagnósticos. Hay que mirar el virtual real.

**Hecho cuando:** el BUG está en `Listo` y su §6 tiene un test escrito contra el código roto.

**HECHO.** [`bugs/BUG-11-slot-como-prop.md`](./bugs/BUG-11-slot-como-prop.md) +
[`BUG-11-Task.md`](./bugs/BUG-11-Task.md), en `Listo`, en el índice y en el registro de
progreso. El contrato de §4 **se midió con `tsc` antes de escribir emisor**, que es lo que
cambia el diseño: `$attrs<T>(a: T & $GlobalAttrs)` acepta los globales **sin una sola rama
nueva** —el emisor no aprende que `id` existe; el vocabulario de HTML vive en el `.d.ts`— y
conserva el `TS2561` *con la sugerencia* del nombre mal escrito, que era el riesgo real de la
intersección. Y §2.4 responde la pregunta incómoda: la cobertura al 100 % no lo vio porque los
tests afirman el **texto** emitido, no lo que TypeScript dice de él.

## T-12. Contrato de slots: `$Slots`

Hoy el nombre del slot **se tira**: `<slot name="meta">` proyecta `$slot();` y ya, con el propio
código diciéndolo —«a marker with no type of its own, for now (SDD-23 §7)»—.

**El patrón ya existe, construido y funcionando, para secciones:** `@RenderSection(nav)` →
`export type $Sections = 'nav'`, y el consumidor lo comprueba con `$section<$L0>('nav')`, lo que
da `TS2345` con sugerencia de los nombres válidos **y** completado, porque TypeScript está
completando una unión de literales →
[`template/sections.ts:18-73`](../../packages/language-core/src/template/sections.ts#L18-L73).

**Qué, y solo esto:**
1. El virtual del componente emite `export type $Slots = 'meta' | 'footer'`, copiando cada
   `name` **desde su span** — eso da F12 del consumidor al `<slot>` gratis, igual que con
   secciones. Sin `<slot name>`, `never`.
2. `slot=` en el consumidor se proyecta contra el `$Slots` del componente en vez de entrar en el
   literal de props. **Esto cierra T-11.**

**«Sin slots, sin hijos» queda FUERA.** Es lo único de la idea sin precedente en el código y
pide un `$children<T>()` que no existe; se anota al final del BUG-11 como trabajo futuro y no
se implementa aquí.

**Ficheros:**
- [`packages/language-core/src/template/sections.ts:39-42`](../../packages/language-core/src/template/sections.ts#L39-L42) —
  `emitSlot` deja de ser mudo; y `emitSectionsContract` (líneas 55-73) es el molde a copiar.
- [`packages/language-core/src/emit-client.ts:152`](../../packages/language-core/src/emit-client.ts#L152) —
  donde se detecta `<slot>`, y donde se emite el contrato del componente.
- [`packages/language-core/src/template/attrs.ts:69-97`](../../packages/language-core/src/template/attrs.ts#L69-L97) —
  `slot` sale del literal de props.
- [`packages/language-core/src/globals.ts`](../../packages/language-core/src/globals.ts) —
  `$slot` gana firma. **Ojo:** `GLOBALS_DTS` lo escriben dos consumidores —el servidor en
  memoria y la CLI en `fudic-globals.d.ts`— así que un global nuevo cruza a `cli` y a sus tests.
- `packages/language-core/test/` y `packages/cli/test/` (el `fudic-globals.d.ts` generado).
- [`docs/sdd/SDD-23-emisor-ts-virtual.md`](./SDD-23-emisor-ts-virtual.md) §7.

**Hecho cuando:** `examples/basic/routes/blog/index.fud:48` deja de dar `TS2353` **por tipos**;
un `slot="noexiste"` da `TS2345` sugiriendo los válidos; F12 sobre el nombre abre el `<slot>`
del componente; y `language-core` sigue al 100 % en las cuatro métricas.

**HECHO.** BUG-11 cerrado: 8/8 tareas, `Hecho` en el índice y en el registro. Rojo primero —7
tests cayendo con `TS2353`— y verde después. 138 tests, 100/100/100/100.

**Dos cosas que la implementación desmintió del documento**, corregidas en él:

- El `TS2345` nombra el **alias** (`$S0`), no expande la unión: el tipo llega por `import type`.
  Es lo que `$Sections` lleva haciendo desde SDD-23. Los nombres válidos los da el completado y
  el hover, no el texto del error.
- `$Slots` se exporta **siempre**, `never` incluido. Un consumidor importa el símbolo de lo que
  enlaza, y un export ausente sería `TS2305` sobre andamiaje en vez del `TS2345` accionable.

**Hallazgo colateral, arreglado aquí porque este cambio lo destapó.** Rompió el criterio §6.3
de SDD-24 —el completado de una unión dentro de `tone="@(|)"`— y la causa no era el tipo: el
ancla de completado se emitía como **un** tramo sobre toda el área de atributos, así que cubría
también los **valores**. Esa posición mapeaba al ancla *y* a la interpolación, y Volar contesta
con la primera posición mapeada que devuelve algo; mientras el literal no ofrecía claves ahí el
ancla volvía vacía y ganaba la interpolación, pero en cuanto `$GlobalAttrs` le dio once nombres
que ofrecer, la unión dejó de ser alcanzable. Ahora se emite **un ancla por hueco** del tag
—antes del primer atributo, entre dos, y tras el último—, que es lo que el ancla decía ser.

**Abierto, y no es de esta tarea:** `pnpm test` en la raíz **no** es fiable bajo carga. En seis
pasadas completas cayeron dos tests distintos, una vez cada uno, y ninguno de los dos vuelve a
caer en aislado: `§6.14 — cancellation` otra vez, y
`vite/test/build-client-chunks.test.ts > carries the factory and the define`. O sea que **T-02
no cerró la fragilidad**, solo una de sus causas. Queda anotado aquí en vez de en T-02 para no
tocar una tarea ya cerrada; merece tarea propia.

---

# Tanda 4 — Experiencia de edición

Va después de la 3 porque esa toca `language-core`, que `language-server` consume vía
`document-cache`. Dentro de la tanda, T-13 y T-14 extienden **la misma cadena** de
`completions()`: en paralelo conflictan seguro.

## T-13. Tags de componente: snippet + auto-link

Tres cosas, dos causas y una petición.

**a) `app-button` a pelo no ofrece nada.** `tagContextAt` exige un `<` literal antes del cursor,
así que sin él la lista de componentes no se alcanza nunca y la petición cae a Emmet. Por eso
solo aparece desde `<a`.

**b) Tab no cierra el tag.** Dos caminos distintos: `div` + Tab viene de la **expansión de
Emmet**, que devuelve un snippet `<div>|</div>`; `app-button` viene de `declaredTags`, y ese
ítem es `label` + `textEdit.newText` y nada más — sin `insertTextFormat: Snippet`, sin tag de
cierre, sin `command` para re-preguntar.

**c) Auto-link.** `declaredTags` recorre solo `document.document.links`, o sea solo lo ya
linkado. No hace falta nada nuevo: `index.byRole('component')` ya lista todos los componentes
del workspace, `relativeHref(from, to)` ya calcula el href, y `additionalTextEdits` del
`CompletionItem` es exactamente este caso de uso.

**Qué:** contexto de tag también sin `<`; ítems como snippet con su tag de cierre; ofrecer los
componentes **no linkados** con `sortText` detrás de los linkados y etiqueta distinta; y al
aceptar uno no linkado, `additionalTextEdits` inserta su `<link rel="component">` **tras el
último `rel="component"`, y si no hay ninguno, tras el `rel="layout"`**.

**Ficheros:**
- [`packages/language-server/src/services/position.ts:92-98`](../../packages/language-server/src/services/position.ts#L92-L98) — `tagContextAt`.
- [`packages/language-server/src/services/tags.ts:39-55`](../../packages/language-server/src/services/tags.ts#L39-L55) — `declaredTags` gana los no linkados.
- [`packages/language-server/src/services/plugin.ts:351-365`](../../packages/language-server/src/services/plugin.ts#L351-L365) — el `CompletionItem`.
- [`packages/language-server/src/services/href.ts:49-64`](../../packages/language-server/src/services/href.ts#L49-L64) — `byRole` / `relativeHref`, ya existen.
- [`packages/language-server/src/services/position.ts:34-43`](../../packages/language-server/src/services/position.ts#L34-L43) — `linksOf`, para saber dónde insertar.
- `packages/language-server/test/`.

**Hecho cuando:** escribir `app-button`, aceptar, y que aparezca el tag cerrado **y** su `<link>`
si faltaba.

## T-14. Completado de directivas `@`

No existe ningún proveedor de completado de directivas: `completions()` tiene exactamente tres
contextos —href, nombre tras `@section `, tag tras `<`— y luego cae a Emmet. Ninguna palabra con
`@` se ofrece jamás. Lo llamativo es que **`@` sí está declarado como trigger character**: el
editor pregunta al teclearlo y el servidor contesta vacío. La fontanería está; el proveedor no.

**Qué:** un contexto nuevo para `@` seguido de identificador parcial, con la lista filtrada por
**rol de documento** —`@RenderBody` y `@RenderHead` solo en un layout, `@section` solo en una
ruta, `@code`/`@if`/`@foreach` en todos—. El rol ya lo da `roleOf`. Solo en markup: dentro de
`@code` el lenguaje es TypeScript y ahí manda `isMarkupOffset`.

**Ficheros:**
- [`packages/language-server/src/services/position.ts`](../../packages/language-server/src/services/position.ts) — el contexto nuevo.
- [`packages/language-server/src/services/plugin.ts:316-370`](../../packages/language-server/src/services/plugin.ts#L316-L370) — la cadena; va **antes** de Emmet.
- [`packages/language-server/src/mode.ts:17-28`](../../packages/language-server/src/mode.ts#L17-L28) — `roleOf`.
- [`packages/language-server/src/services/emmet.ts:58-72`](../../packages/language-server/src/services/emmet.ts#L58-L72) — `isMarkupOffset`, ya existe.
- `packages/language-server/test/`.

**Hecho cuando:** teclear `@` en un layout ofrece `@RenderBody` y `@RenderHead`, y en una ruta
no; y dentro de `@code` no ofrece ninguna.

## T-15. `@RenderSection(` y la query inversa del índice

`sectionContextAt` casa `/@section[ \t]+…$/`, que no matchea `@RenderSection(`. Pero el problema
de fondo es otro: **el índice solo conoce la dirección contraria.** `IndexEntry.sections` guarda
lo que *declara un layout*, y `sectionCompletions` lo lee resolviendo el layout **desde la
página**. Dentro del layout no hay fuente de nombres.

**Qué:** se hace, con la query inversa —qué páginas apuntan a este layout y qué `@section`
declaran—, mantenida **incrementalmente en `upsert`/`invalidate`**, nunca con un barrido: el
índice ya tiene `revision` justo para no repintar el workspace en cada `fudic generate`.
`sectionContextAt` se generaliza para reconocer también `@RenderSection(`.

**Ficheros:**
- [`packages/language-server/src/workspace-index.ts:17-70`](../../packages/language-server/src/workspace-index.ts#L17-L70) — `IndexEntry` y la query inversa.
- [`packages/language-server/src/services/sections.ts:24-32`](../../packages/language-server/src/services/sections.ts#L24-L32) — la otra dirección.
- [`packages/language-server/src/services/position.ts:124-131`](../../packages/language-server/src/services/position.ts#L124-L131) — `sectionContextAt`.
- [`packages/language-server/src/services/plugin.ts:339-349`](../../packages/language-server/src/services/plugin.ts#L339-L349) — la rama de completado.
- `packages/language-server/test/`.

**Hecho cuando:** dentro de un layout, `@RenderSection(` ofrece las secciones que sus páginas
declaran, y crear un `@section` nuevo en una página lo hace aparecer sin reiniciar el servidor.

---

# Tanda 5 — Cierre

## T-16. Anotar el guion de verificación manual

Los ocho pasos de
[`packages/vscode/docs/verificacion-manual.md`](../../packages/vscode/docs/verificacion-manual.md)
siguen sin anotar; es la última casilla de [SDD-25-Task.md](./SDD-25-Task.md). Va al final
porque solo tiene sentido sobre todo lo anterior ya dentro, y solo se puede hacer delante del
editor.

**Hecho cuando:** los ocho pasos están anotados.

---

# Aplazadas — no se tocan sin una spec antes

## T-17. `<link rel="modulepreload">`

Cero coincidencias de `modulepreload` en el repo. Dos huecos encadenados: el
`<script type="module" src="/fudic-main.js">` es texto **del usuario** —literal en
[`layout.fud:9`](../../packages/cli/templates/layout.fud#L9) y
[`page.fud:6`](../../packages/cli/templates/page.fud#L6), y el emit copia verbatim todo elemento
del `<head>` salvo `<title>` y los `<link>` del framework
([`compiler/src/emit/parts.ts:125-153`](../../packages/compiler/src/emit/parts.ts#L125-L153))—;
y los chunks de cliente `h/<tag>` se emiten pero **no los referencia ningún HTML todavía**
([`vite/src/client.ts:13-16`](../../packages/vite/src/client.ts#L13-L16),
[`vite/src/plugin.ts:395-406`](../../packages/vite/src/plugin.ts#L395-L406)).

**Matiz que decide el alcance:** un `<script type="module" src>` ya lo descubre el preload
scanner. Lo que falta precargar es **su grafo de imports** y los chunks `h/*` — justo lo que
Vite inyecta desde su manifest y fudic no hereda, porque genera su HTML por su cuenta.

**Aplazada:** es la etapa de linking de SDD-15/SDD-17. Se resuelve con la hidratación.

## T-18. El template acepta TypeScript que no debería

Hoy una expresión del template admite cualquier cosa que Oxc parsee: un `@import` en un
atributo, una expresión que devuelve una promesa, lo que sea. Dentro de `@code` no hay
restricción y así debe seguir.

**Dónde vivirá:** es una regla semántica, no de parseo — con los analizadores de SDD-12 en
[`packages/compiler/src/semantic/`](../../packages/compiler/src/semantic/), sobre las
expresiones que ya se recorren con `walk`. La mitad de tipos ya existe: `$text` exige `$Scalar`
(decisión 19), así que interpolar un objeto ya falla. Falta la parte sintáctica.

**Aplazada:** spec propia, y es lo grande — la lista de lo prohibido, con qué código `FUD` y
sobre qué span.

---

# Ya cerrado — no rehacer

- **El aviso de TypeScript degradado en VS Code no es un fallo.**
  *«this workspace has no TypeScript of its own»* es el mensaje de diseño de SDD-25 §4.1:
  degradado significa «no es el TypeScript del proyecto», no «no hay TypeScript»
  ([`tsdk.ts:60`](../../packages/vscode/src/tsdk.ts#L60),
  [`:76-79`](../../packages/vscode/src/tsdk.ts#L76-L79)). Sale porque el install fallaba;
  **T-06 lo cierra sin tocar `vscode`**.
- **Reinicio del servidor.** Funciona: mantiene el IntelliSense sin recargar la ventana.
- **Emmet**, solo en el markup, desde el servidor
  ([`services/emmet.ts`](../../packages/language-server/src/services/emmet.ts)), más los
  caracteres que continúan una abreviatura en `capabilities.ts`.
- **IntelliSense en atributos** (`editor.quickSuggestions.strings` en el manifiesto) y **en una
  expresión a medio escribir** (`copyExpression` en `language-core`).
- **Workspace en verde**: 2176 tests, cobertura 100 % en `language-core`, `language-server` y
  `vscode`. `verify:vsix` y `verify-server-bundle` pasan sobre el `.vsix` instalado.

# Aplazado — no hay publicación a la vista

La página de la extensión: icono PNG 128×128, `CHANGELOG.md` y que el `LICENSE` viaje en el
`.vsix`. Ninguno afecta al funcionamiento. Se retoman si se publica.

Descartados: el tercer texto del estado degradado, y vendorizar TypeScript en el `.vsix` para
sostener el fallback que promete SDD-24 §6.1.

---

**Recordatorio de coste.** `language-core`, `language-server` y `vscode` están al 100 % en las
cuatro métricas. Todo lo de las tandas 2, 3 y 4 nace con esa exigencia, no la alcanza al final.
