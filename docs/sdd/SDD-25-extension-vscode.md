# SDD-25 — Extensión de VS Code (`fudic-vscode`)

> **Estado:** `Hecho`
> **Paquete:** `fudic-vscode` (extensión; no se publica en npm)
> **Naturaleza:** cliente. **Fina por diseño**: cero lógica de lenguaje.

---

## 1. Contexto y objetivo

Registrar la extensión `.fud` en VS Code, arrancar el servidor de SDD-24, y aportar lo que
solo puede vivir en el cliente: la gramática TextMate que colorea en el **primer frame**,
la configuración del lenguaje (comentarios, pares, plegado), y los comandos.

La regla que gobierna el documento: **si algo puede vivir en el servidor, vive en el
servidor**. Cada línea de inteligencia que se cuele aquí es una línea que Zed y Neovim no
tendrán. El cliente arranca un proceso y contribuye metadatos declarativos; nada más.

---

## 2. Dependencias

- **SDD-24** — el ejecutable `fudic-language-server`.
- `vscode-languageclient` v9+.
- VS Code `^1.90`.

---

## 3. Interfaz pública

### 3.1. Contribuciones de `package.json`

```jsonc
{
  "contributes": {
    "languages": [{
      "id": "fudic",
      "aliases": ["Fudic", "fud"],
      "extensions": [".fud"],
      "configuration": "./language-configuration.json",
      "icon": { "light": "./icons/fud-light.svg", "dark": "./icons/fud-dark.svg" }
    }],
    "grammars": [{
      "language": "fudic",
      "scopeName": "text.html.fudic",
      "path": "./syntaxes/fudic.tmLanguage.json",
      "embeddedLanguages": {
        "source.ts": "typescript",
        "source.css": "css",
        "text.html": "html"
      }
    }],
    "commands": [
      { "command": "fudic.restartServer",  "title": "Fudic: Reiniciar el servidor de lenguaje" },
      { "command": "fudic.showVirtualFiles","title": "Fudic: Ver ficheros virtuales" },
      { "command": "fudic.showRegistry",    "title": "Fudic: Ver registro de componentes" },
      { "command": "fudic.formatDocument",  "title": "Fudic: Formatear documento" }
    ],
    "configuration": { /* §3.2 */ },
    "configurationDefaults": {
      "[fudic]": {
        "editor.insertSpaces": true,
        "editor.tabSize": 2,
        "editor.defaultFormatter": "fudic.fudic-vscode",
        "editor.suggest.insertMode": "replace"
      }
    }
  },
  "activationEvents": ["workspaceContains:**/*.fud"]
}
```

`workspaceContains` importa: activa la extensión al abrir un proyecto Fudic aunque el
primer fichero abierto sea un `.ts`, de modo que los diagnósticos inter-fichero funcionan
desde el principio.

`onLanguage:fudic` **no** se declara: VS Code ≥ 1.74 lo genera a partir de la entrada de
`contributes.languages`, y escribirlo a mano lo marca el linter del manifiesto como
redundante.

### 3.2. Ajustes

```jsonc
{
  "fudic.server.path":              // string | null — servidor propio, para desarrollar
  "fudic.trace.server":             // 'off' | 'messages' | 'verbose'
  "fudic.templateDiagnostics":      // boolean, default true
  "fudic.format.enable":            // boolean, default true
  "fudic.exposeVirtualFiles":       // boolean, default false
}
```

Deliberadamente corto. Cada ajuste es una rama de comportamiento que hay que probar; el
zoo de opciones de otras extensiones es deuda.

### 3.3. `language-configuration.json`

- Comentarios: bloque `@* *@`. **No hay comentario de línea**: la gramática no lo tiene, y
  ofrecer `//` haría que `Ctrl+/` genere ficheros que no compilan.
- Pares y autocierre: `{}`, `()`, `[]`, `""`, `''`, `` `` ``.
- Autocierre de tags y salto inteligente entre `>` y `</`.
- Plegado por indentación, más marcadores para `@code`, `@server`, `@client` y bloques
  `@if` / `@foreach`.
- `wordPattern` que **no** parte en `@` ni en `:`, para que doble clic seleccione
  `@foreach` y `class:foo` como unidades.

---

## 4. Comportamiento

### 4.1. Arranque

Al activarse: resuelve el servidor (`fudic.server.path` si existe; si no, el empaquetado),
resuelve el `tsdk` (`typescript.tsdk` del workspace, o el `typescript` de
`node_modules`, o el de la propia VS Code), y lanza el cliente con
`documentSelector: [{ scheme: 'file', language: 'fudic' }]` y `synchronize.fileEvents`
sobre `**/*.fud`, `**/tsconfig*.json`, `**/package.json`.

Sin `typescript` en el workspace se arranca igual, en modo degradado (HTML+CSS, sin
tipos), con un aviso una sola vez. Nunca se aborta el arranque.

### 4.2. Gramática TextMate

Colorea en el primer frame, antes de que el servidor responda. **Va a ser imperfecta en
las transiciones `@`** —la desambiguación real necesita el balanceador de delimitadores
(SDD-02), que no se puede expresar en expresiones regulares— y eso es **aceptable por
diseño**: los semantic tokens del servidor (SDD-24 §4.3) la corrigen unos cien
milisegundos después. No se persigue la perfección aquí; el criterio de aceptación es que
no haya **arrastre** (color roto que se propaga hasta el final del fichero), no que cada
token sea exacto.

Cobertura mínima, por prioridad:

1. `@code` / `@server` / `@client` → `source.ts` embebido.
2. `<style>` → `source.css`. `<script>` → `source.js` (raw, decisión 43).
3. Markup: tags, atributos, valores, comentarios `<!-- -->`.
4. Directivas de control: `@if`, `@else`, `@foreach`, `@for`, `@while`, `@switch`,
   `@section`, `@{ … }`.
5. Bindings: `class:`, `style:`, `.prop`, `@evento`, `ref`.
6. Interpolación `@(…)` (delimitada, fiable) y `@ident.path` (heurística, aproximada).
7. `@@` como escape y `@* *@` como comentario.
8. Heurística de email (decisión 7): `@` precedido de carácter de identificador es
   literal, no directiva.

### 4.3. Comandos

- **`fudic.restartServer`** — para y relanza. Es la válvula de escape frente a estado
  rancio que ningún watcher vio: instalación de dependencias, cambio de rama, `tsdk`
  distinto. Cuesta veinte líneas y no se puede no tener; pretender que la invalidación es
  perfecta es lo que hace que las extensiones se queden colgadas sin salida.
- **`fudic.showVirtualFiles`** — `fudic/virtualFiles` sobre el fichero activo, resultado
  en editores de solo lectura, uno por virtual, con resaltado del lenguaje
  correspondiente. Es la herramienta de depuración diaria de quien desarrolla el emisor.
- **`fudic.showRegistry`** — vuelca el mapa `tag → href → resuelto`. Diagnostica en un
  segundo el "por qué mi componente no completa".
- **`fudic.formatDocument`** — formatea vía servidor (SDD-26).

### 4.4. Estado visible

Elemento en la barra de estado, solo con `.fud` activo: `Fudic ✓` (servidor listo),
`Fudic ⟳` (inicializando), `Fudic ⚠` (degradado, sin TS), `Fudic ✕` (caído). Al pulsarlo,
el canal de salida. Un fallo silencioso es indistinguible de un LSP lento; el estado
visible convierte "no me funciona" en un dato.

Si el servidor cae, se reintenta hasta tres veces con retroceso exponencial y después se
ofrece el reinicio manual. No se reintenta en bucle.

### 4.5. Empaquetado

`.vsix` con el servidor **empaquetado dentro**: instalar la extensión no debe requerir
instalar nada más. El servidor se compila con Rolldown a un único fichero. La extensión
no publica en npm; `@fudic/language-server` sí, para quien lo quiera en otro editor.

---

## 5. Invariantes LSP

- **Cero lógica de lenguaje en el cliente.** Ni parseo, ni resolución de componentes, ni
  validación. Solo TextMate (que es datos, no código) y arranque de proceso.
- **El fallo del servidor no rompe el editor.** Sin servidor quedan color TextMate y
  configuración del lenguaje; el fichero sigue siendo editable.
- **Activación barata.** Nada pesado en `activate()`; el servidor arranca en su proceso.
- **Reinicio siempre disponible**, incluso con el servidor caído.
- **Sin telemetría.**

---

## 6. Criterios de aceptación

1. **Registro.** Abrir un `.fud` lo identifica como lenguaje `fudic` con su icono.
2. **Color en el primer frame.** Con el servidor deshabilitado, `[slug].fud` y
   `app-badge.fud` se colorean: TS dentro de `@code`, CSS dentro de `<style>`, markup, y
   directivas distinguibles. **Sin arrastre** hasta el final del fichero en ninguno de los
   dos.
3. **Corrección semántica.** Con el servidor vivo, los semantic tokens corrigen la
   aproximación de TextMate: un tag de componente se distingue de uno nativo.
4. **Ciclo completo.** Sobre el workspace real: completado de `tone`, hover con el tipo,
   F12 a `app-badge.fud`, y el error de `@data.body` tras romper `load()` — todo desde el
   editor.
5. **Comentario.** `Ctrl+/` sobre una selección de markup produce `@* … *@` y lo revierte.
   No se ofrece comentario de línea en ningún contexto.
6. **Plegado.** `@code`, `@server`, `@client`, `@if` y `@foreach` pliegan por sus llaves.
7. **Restart.** Instalar una dependencia y ejecutar el reinicio deja el servidor operativo
   en menos de tres segundos, sin recargar la ventana.
8. **Virtual files.** El comando abre los tres virtuals de `[slug].fud` con su lenguaje.
9. **Degradado.** En un workspace sin `typescript`, la extensión arranca, avisa una vez,
   muestra `Fudic ⚠`, y HTML+CSS siguen funcionando.
10. **Caída.** Matar el proceso del servidor muestra `Fudic ✕`, reintenta tres veces y
    ofrece reinicio manual. VS Code no se degrada ni se congela.
11. **Empaquetado.** El `.vsix` instalado en una máquina limpia funciona sin instalar
    nada más.
12. **Activación por workspace.** Abrir el proyecto por un `.ts` activa la extensión y los
    diagnósticos inter-fichero de los `.fud` ya funcionan.

---

## 7. Fuera de alcance

- **Toda inteligencia de lenguaje** — SDD-23 y SDD-24.
- **Algoritmo de formateo** — SDD-26.
- **Clientes de Zed y Neovim.** El servidor es agnóstico; sus configuraciones se
  documentan aparte.
- **Depurador, task provider, integración con el dev server de Vite.**
- **Snippets.** Se añaden cuando el lenguaje esté estable; hoy multiplicarían el
  mantenimiento sin aportar.
- **Vista previa del componente en el editor.**
- **Publicación en el Marketplace** (cuenta, firma, CI de release): SDD de distribución.
