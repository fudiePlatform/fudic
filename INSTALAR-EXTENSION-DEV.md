# Instalar la extensión de VS Code en modo desarrollo

Cómo poner `fudic-vscode` (SDD-25) a funcionar sobre este repo, sin publicar nada.

Hay **dos modos**, y sirven para cosas distintas:

| Modo | Cuándo | Coste |
|---|---|---|
| **A — Extension Development Host** (`F5`) | Desarrollar la extensión o el servidor | Ninguno; se recarga con `Ctrl+R` |
| **B — Instalar el `.vsix`** | Usar Fudic de verdad mientras trabajas en otra cosa | Reinstalar tras cada cambio |

Si vas a tocar la extensión, quieres el **modo A**. Si lo que quieres es escribir `.fud`
con ayuda del editor, quieres el **modo B**.

---

## 1. Qué necesitas

| Pieza | Versión | Comprobar |
|---|---|---|
| Node.js | `>=22.12.0` (ver `.nvmrc`) | `node -v` |
| pnpm | `11.x` vía Corepack | `pnpm -v` |
| VS Code | `>=1.90` | `code --version` |

El `code` de la línea de comandos hace falta solo para el modo B. Si no lo tienes en el
`PATH`, en VS Code: **Ctrl+Shift+P → «Shell Command: Install 'code' command in PATH»**.

---

## 2. Antes de nada: construir

```sh
pnpm install
pnpm --filter "fudic-vscode..." build
```

Los tres puntos de `"fudic-vscode..."` no son una errata: significan **el paquete y sus
dependencias**, y construyen en orden `@fudic/compiler` → `@fudic/language-core` →
`@fudic/language-server` → `fudic-vscode`. Sin ellas no hay nada que empaquetar: el bundle
del servidor se arma desde el `dist` de sus hermanos, no desde sus fuentes.

Al terminar deberías ver dos líneas que importan:

```
packages/language-server build: fudic-language-server starts and answers initialize.
packages/vscode build: vendored oxc-parser and @oxc-parser/binding-win32-x64-msvc into dist/node_modules.
```

La primera es un arranque real del binario: el build no se da por bueno hasta que el
servidor contesta. La segunda copia el parser nativo, que **no se puede empaquetar dentro
del bundle** (ver §8).

Lo que queda en `packages/vscode/dist/`:

```
extension.cjs            el cliente (CommonJS: VS Code carga `main` con require)
server.mjs               el servidor entero (ESM: lo forkea el cliente como proceso Node)
node_modules/            oxc-parser + su binding nativo
```

> **Árbol recién clonado:** `pnpm typecheck` falla en `packages/vite` con
> `Cannot find module '@fudic/transport'` si no has construido antes. No es el código: los
> paquetes se typechequean contra el `dist` de sus hermanos. `pnpm build` primero.

---

## 3. Modo A — Extension Development Host (`F5`)

El modo normal de trabajo. Abre una segunda ventana de VS Code con **tu** extensión
cargada desde el código del repo, sin instalar nada en tu VS Code.

1. Abre **la raíz del repo** como carpeta en VS Code.
2. Pulsa **`F5`**, o ve a *Run and Debug* y elige **«Fudic: extensión (Extension
   Development Host)»**.

El repo ya trae la configuración (`.vscode/launch.json` y `.vscode/tasks.json`), así que
`F5` construye primero y arranca después. La ventana nueva abre
`packages/language-server/fixtures`, que es el proyecto real de los criterios de
aceptación: una ruta con `@code`/`@server`, un layout y dos componentes.

**Qué mirar para saber que va:**

- Abre `blog/[slug].fud`. Debe tener color **al instante** (eso es TextMate, no el
  servidor).
- Abajo a la derecha aparece **`Fudic ✓`**. Si pone `Fudic ⚠`, el servidor está vivo pero
  sin el TypeScript del proyecto (§9). Si pone `Fudic ✕`, no arrancó.
- Pulsa en ese indicador: se abre el canal de salida **Fudic**, donde está el registro con
  el servidor y el `tsdk` que resolvió.

### El bucle de trabajo

Para no reconstruir a mano en cada cambio:

```sh
pnpm --filter fudic-vscode dev      # rolldown en modo watch
```

Después de cada cambio, en la ventana de desarrollo: **`Ctrl+R`** (*Developer: Reload
Window*). Recarga la extensión con el bundle nuevo.

**Ojo con el servidor.** El watch reconstruye los dos bundles, pero el servidor vive en
otro proceso: recargar la ventana lo relanza, así que también entra el cambio. Lo que el
watch **no** hace es reconstruir `@fudic/language-server` ni el compilador — si tocas
`packages/language-server/src` o `packages/compiler/src`, necesitas:

```sh
pnpm --filter "fudic-vscode..." build
```

y luego `Ctrl+R`. Para un bucle más corto sobre el servidor, mira §5.

### Depurar

- **La extensión (cliente):** pon un breakpoint en `packages/vscode/src/*.ts` y lanza `F5`.
- **El servidor:** lanza el *compound* **«Fudic: extensión + servidor»**. La segunda
  configuración se adjunta al puerto `6009`, que es donde el cliente forkea el servidor
  cuando el host está en depuración (`--inspect=6009`, en `src/extension.ts`).

---

## 4. Modo B — Instalar el `.vsix`

Para usar Fudic mientras trabajas en otro proyecto.

```sh
pnpm --filter fudic-vscode install:vsix
```

Eso es todo: el script construye, verifica, empaqueta e instala. Antes de nada comprueba
que tienes `code` en el `PATH`, porque es lo que más veces falta y lo que más caro sale
descubrir al final, cuando el build ya se ha llevado su minuto.

Los cuatro pasos, si los quieres sueltos:

```sh
pnpm --filter "fudic-vscode..." build
pnpm --filter fudic-vscode verify:vsix     # comprueba qué entraría en el paquete
pnpm --filter fudic-vscode package         # produce packages/vscode/fudic-vscode.vsix
code --install-extension packages/vscode/fudic-vscode.vsix --force
```

El script **no** se llama `install`: ese nombre es un *hook* de ciclo de vida de
npm/pnpm y se ejecutaría en cada `pnpm install` del workspace, reempaquetando y
reinstalando la extensión cuando lo único que pediste fue instalar dependencias.

`verify:vsix` no es opcional por costumbre: pregunta a `vsce ls` qué ficheros entrarían y
exige que estén el bundle, el servidor, la gramática, la configuración del lenguaje, los
iconos **y el binding nativo del parser**. El fallo que evita es silencioso — un patrón de
`.vscodeignore` que se lleva por delante algo necesario produce un paquete que instala,
activa y luego no hace nada, sin mencionar nunca el fichero que le falta.

Comprobar que quedó instalada:

```sh
code --list-extensions --show-versions | grep fudic
# fudic.fudic-vscode@0.0.1
```

Recarga la ventana (`Ctrl+R`) y abre cualquier `.fud`.

**Reinstalar tras un cambio:** vuelve a lanzar `install:vsix`. El `--force` sobrescribe la
versión anterior sin desinstalar.

---

## 5. Desarrollar el servidor sin reinstalar la extensión

Es para lo que existe el ajuste **`fudic.server.path`**. Apunta a un servidor tuyo, y la
extensión lo lanza en vez del que lleva empaquetado.

En tu `settings.json`:

```jsonc
{
  "fudic.server.path": "C:/ruta/al/repo/packages/language-server/bin/fudic-language-server.js"
}
```

Con eso, el bucle pasa a ser:

```sh
pnpm --filter @fudic/language-server build
```

y después **«Fudic: Reiniciar el servidor de lenguaje»** desde la paleta. Sin recargar la
ventana y sin reempaquetar nada.

El reinicio **vuelve a resolverlo todo** —ajustes, ruta del servidor, `tsdk`—, no solo
relanza el proceso: por eso sirve para el caso real, que es una dependencia recién
instalada o un cambio de rama.

Si la ruta no existe, la extensión avisa y arranca con el servidor empaquetado. No se queda
sin servidor por un ajuste caducado.

---

## 6. Comprobar que funciona

Sobre `packages/language-server/fixtures/blog/[slug].fud`:

| Qué | Cómo se ve |
|---|---|
| Color | TS dentro de `@code`, CSS dentro de `<style>`, `@section` y `@if` distinguibles |
| Completado | Dentro de `<app-badge \|>` se ofrece `tone` |
| Tipos | Dentro de `tone="@(\|)"` se ofrecen `'neutral' \| 'success' \| 'info'` |
| Hover | Sobre `tone`, el tipo `Tone` |
| Navegación | `F12` sobre `<app-badge>` abre `components/app-badge.fud` |
| Diagnósticos | Rompe el retorno de `load()`: el error sale **sobre `@data.body`**, en el `.fud` |
| Comentario | `Ctrl+/` sobre markup produce `@* … *@` |

Los cuatro comandos, desde la paleta (`Ctrl+Shift+P`, escribe «Fudic»):

- **Reiniciar el servidor de lenguaje**
- **Ver ficheros virtuales** — abre lo que el servidor le está enseñando a TypeScript. Es
  la herramienta de depuración diaria si tocas el emisor.
- **Ver registro de componentes** — `tag → href → resuelto`. Contesta en un segundo el «por
  qué mi componente no completa».
- **Formatear documento** — ver §7.

---

## 7. Qué no funciona todavía

**El formateo.** SDD-26 (`@fudic/formatter`) no está implementado. El servidor declara la
capacidad y delega, así que:

- «Fudic: Formatear documento» no hace nada.
- *Format on save* sobre un `.fud` no hace nada.

No es un fallo de instalación: es la única pieza del pipeline que falta.

---

## 8. El `.vsix` es específico de plataforma

`oxc-parser` es un addon nativo (NAPI) y su `.node` **no se puede meter dentro del bundle**:
su cargador hace `require('./parser.<target>.node')` y cualquier bundler reescribe eso a algo
que no resuelve a nada. Por eso `scripts/vendor-native.mjs` lo copia a `dist/node_modules/`,
donde Node lo encuentra sin instalar nada.

La consecuencia: **el paquete lleva el binding de la máquina que lo empaquetó**. Un `.vsix`
hecho en Windows no sirve en Linux — el servidor arranca y muere en el primer parseo. Una
distribución real se publica por target, que es el mecanismo que VS Code tiene justo para
esto:

```sh
pnpm --filter fudic-vscode exec vsce package --no-dependencies --target win32-x64
```

Para desarrollar en local da igual: empaquetas y usas en la misma máquina.

---

## 9. Problemas frecuentes

### `Fudic ⚠` en la barra de estado

El servidor arrancó, pero **no con el TypeScript del proyecto**. El orden que sigue el
cliente es: `typescript.tsdk` del workspace → `node_modules/typescript/lib` → el TypeScript
que trae VS Code. Los dos últimos casos se marcan degradados a propósito: typechequear con
una versión distinta de la del build produce diagnósticos que el CI no reproduce.

**Solución:** instala `typescript` en el proyecto que estás abriendo. Después, «Fudic:
Reiniciar el servidor de lenguaje».

### `Fudic ✕` en la barra de estado

El servidor no arrancó tras tres intentos. Abre el canal de salida **Fudic** (pulsando el
propio indicador): el motivo está ahí. Lo más habitual es un `fudic.server.path` que apunta
a un `dist` que no has construido.

### La extensión no aparece / no colorea nada

- Comprueba que el fichero se reconoce como lenguaje **Fudic** (abajo a la derecha).
- Comprueba que `packages/vscode/dist/extension.cjs` existe. Si no, faltó el `build`.
- En el modo A, mira la consola de la ventana de desarrollo:
  **Help → Toggle Developer Tools**.

### Quiero ver qué se dicen cliente y servidor

```jsonc
{ "fudic.trace.server": "verbose" }
```

Sale por el canal **Fudic**. Y con `"fudic.exposeVirtualFiles": true` el servidor expone los
ficheros virtuales para el comando de depuración.

### El completado va bien pero los tipos no

Mira en el canal de salida la línea `tsdk:`. Si está vacía o apunta al TypeScript de VS
Code, estás en modo degradado (§9, primer punto).

---

## 10. Desinstalar

```sh
code --uninstall-extension fudic.fudic-vscode
```

En el modo A no hay nada que desinstalar: basta con cerrar la ventana de desarrollo.

---

## Dónde está cada cosa

| Ruta | Qué es |
|---|---|
| `packages/vscode/src/` | El cliente. Todo pasa por puertos; `extension.ts` es el único que importa `vscode` |
| `packages/vscode/syntaxes/` | La gramática TextMate: el color del primer frame |
| `packages/vscode/language-configuration.json` | Comentarios, pares, plegado |
| `packages/vscode/docs/verificacion-manual.md` | Los criterios que solo se comprueban a mano |
| `packages/language-server/` | El servidor LSP (SDD-24), editor-agnóstico |
| `docs/sdd/SDD-25-extension-vscode.md` | La especificación |
| `docs/sdd/SDD-25-Task.md` | El desglose en tareas, con las decisiones que se tomaron |
