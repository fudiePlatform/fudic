---
name: tutorial-web
description: Escribe un tutorial de la web pública de Fudic (web/apps/tutorials, /tutorials) con su solución en tutorials/<slug>/, cada comando y cada salida sacados de una ejecución real. Úsalo cuando Pedro pida hacer, revisar o rehacer un tutorial o una categoría de tutoriales.
---

# Escribir un tutorial de la web pública

Argumento: el tutorial (`events`, `/tutorials/signals`, «Un bus entre componentes») o la
categoría (`Eventos`). Si no viene, pregunta cuál.

**El plan manda**: `docs/web/tutorial/README.md`. Léelo entero antes de empezar. §3 es el índice
con el estado de cada tutorial; §4, la app; §5, las soluciones; §6.1, la pausa. **Los tutoriales
están en pausa** hasta decidir cómo se prueba su código para que no se desfase: si Pedro no lo pide
expresamente para este tutorial, recuérdaselo antes de escribir nada.

## Cómo se habla con Pedro

En español, corto y en lenguaje llano. Primera línea, el estado. Sin muros de tablas ni
explicaciones de dos folios: si una idea no cabe en tres líneas, está mal contada.

## 1. Qué es un tutorial

- **Un concepto, de 3 a 5 pasos, cinco minutos como mucho.** Si no cabe, se parte en dos. El tiempo
  es una regla de escritura: **nunca se muestra**.
- **Se hace, no se lee.** Cada paso es un comando de la CLI o un fichero que se copia, y lo que se
  ve al hacerlo. La explicación a fondo se enlaza a `/docs`, no se repite.
- **Independiente.** Empieza con `npx @fudic/cli new my-app` y no necesita el anterior.
- **Nada que no haya salido antes.** Si un paso usa un concepto de un tutorial posterior, se cambia
  el ejemplo (ej.: en `first-component` no hay props ni slots, que tienen tutorial propio).
- **Fudic con mayúscula**, «estándar» siempre, encabezados nunca dentro de un componente, el código
  de los ejemplos en inglés y la prosa en español: las reglas de redacción de `capitulo-web` §2
  valen igual (cada frase con su verbo, pronombres con su sustantivo cerca, sin dos puntos
  encadenados, enlaces dentro de la frase).

## 2. Nada inventado: ejecútalo de verdad

Cada comando, cada fichero y cada salida del tutorial salen de una ejecución real. Los paquetes no
están en npm, así que se instalan desde tarballs, **todo fuera del repo** (en el scratchpad). El
repo no se toca: ni una copia en el workspace ni un cambio en `pnpm-lock.yaml`.

1. **Una vez por sesión**, empaqueta todos los paquetes en el scratchpad. Los paquetes no cambian
   mientras se escriben los tutoriales (los hallazgos se arreglan después), así que basta con
   hacerlo al empezar la sesión:
   `pnpm -r --filter "./packages/**" pack --pack-destination <scratchpad>/fudic-tgz`.
2. **Por tutorial**, crea el proyecto con la CLI del repo, en el scratchpad:
   `node <repo>/packages/cli/dist/bin.js new my-app --no-install --no-git`.
3. Escribe en el proyecto un `pnpm-workspace.yaml` con un override por tarball, para que cada
   `@fudic/*` (también los que piden otros paquetes) salga de él, y ejecuta `pnpm install`:
   ```sh
   cd my-app
   { echo "overrides:"; for f in <scratchpad>/fudic-tgz/fudic-*.tgz; do
       b=$(basename "$f" -0.0.1.tgz); echo "  '@fudic/${b#fudic-}': 'file:$f'"; done; } > pnpm-workspace.yaml
   pnpm install
   rm pnpm-workspace.yaml
   ```
   **Bórralo nada más instalar.** Con él, la CLI cree que está en un workspace y cambia sus
   salidas (`pnpm --filter my-app test` en vez de `pnpm test`). El `pnpm-lock.yaml` que salga es
   del montaje: no va a la solución, y tampoco `.fudic/edge`, que deja el build.
4. Trabaja en ese proyecto: `npx fudic dev`, `npx fudic g …`, `pnpm build`, `npx fudic preview`.
   Fuera del repo, `fudic dev` levanta solo tu app, que es lo que ve el usuario (dentro levanta las
   21, hallazgo 8 de la CLI).
5. Para lo que enseña el editor (subrayado, bombilla), pregúntaselo al language server:
   `node .claude/skills/tutorial-web/scripts/lsp.mjs <repo>/packages/language-server/bin/fudic-language-server.js <proyecto> <fichero>`.
   Imprime los diagnósticos y las acciones de la bombilla con sus títulos reales. Lo que no puedas
   ver (la pantalla de VS Code), descríbelo sin inventar su formato.
6. Al acabar, **para todo servidor que hayas arrancado**: al parar la tarea, `npx` deja el proceso
   huérfano escuchando en su puerto, así que mira el puerto y para el proceso. Uno que no
   arrancaste tú no se toca: díselo a Pedro. Antes de entregar, `git status` debe mostrar solo lo
   del tutorial, y tras el commit, nada.

En una salida se puede quitar una línea que solo sale por el montaje (ej.: «Re-optimizing
dependencies because lockfile has changed»), nunca cambiar lo que dice.

## 3. La solución

El proyecto terminado, sin `node_modules`, `dist`, `.git`, `.fudic/edge` ni el `pnpm-lock.yaml`
del montaje, en **`tutorials/<slug>/`** en la raíz
del repo, fuera del workspace. Es lo que tendría el usuario al acabar: con `@fudic/*` a la versión
que escribe la CLI, no a `workspace:*`. Nunca en un repo aparte.

El enlace «la solución de <título>, en GitHub» apunta a
`https://github.com/fudiePlatform/fudic/tree/main/tutorials/<slug>` (da 404 hasta que la rama se
fusione con `main`).

## 4. La página

Se crea con la CLI desde `web/apps/tutorials`. Con el `href` de la librería revienta (hallazgo 6 de
la CLI), así que:

```sh
node ../../../packages/cli/dist/bin.js g page <slug> --layout ../../libs/ui/src/layouts/docs.fud
```

y se corrige a mano el `href` del layout a `@web/ui/layouts/docs.fud` y el título. Si ese hallazgo
vuelve a salir, se apunta como «Y otra vez» en `docs/web/hallazgos-cli.md`.

El modelo es `web/apps/tutorials/src/routes/first-component.fud`: cópialo y cambia lo que toque.

```
<link rel="layout" href="@web/ui/layouts/docs.fud">
<link rel="snippet" href="@web/ui/snippets/site.fud">
<link rel="snippet" href="../snippets/tutorials.fud">
<link rel="component" href="@web/ui/ui-code.fud">
<link rel="component" href="@web/ui/ui-note.fud">   (solo si usa <ui-note>)
<link rel="component" href="@web/ui/ui-toc.fud">

<head> título «<Título> · Tutoriales de Fudic», description, canonical y og:url en
       https://fudic.dev/tutorials/<slug> </head>

@section nav { @render <categoría>Nav("<slug>") }      ← a la izquierda, los tutoriales
@section toc { <ui-toc>… Objetivos, 1. …, Solución </ui-toc> }   ← a la derecha, los pasos

<p class="tutorial-meta"><span class="level" data-level="beginner|intermediate|advanced">Principiante|Intermedio|Avanzado</span> <span class="category">…</span></p>
<h1>…</h1>                     ← el mismo texto que en el menú
<p class="lede">…</p>          ← qué haces, en una frase
<section class="objectives" aria-labelledby="objectives"><h2 id="objectives">Objetivos</h2> … </section>
<h2 id="…">1. …</h2> …         ← los pasos, ids en inglés
<h2 id="solution">Solución</h2>
@render pager(prev: …, prevTitle: …, next: …, nextTitle: …)
```

- **Lo que el usuario escribe**: `<ui-code>` con su `<pre><code>`; con `.path="src/…"` si es un
  fichero, sin `.path` si es un comando. Lleva botón de copiar.
- **Lo que el usuario ve** (terminal, código fuente, la bombilla): `<pre class="output"><code>`, sin
  ruta ni copiar.
- **Escapes**: `@` del texto se escribe `@@`; en el `<head>`, `&#64;`; las llaves dentro de `<pre>`,
  `&#123;` y `&#125;`; `<` y `>`, `&lt;` y `&gt;`.
- **Enlaces a `/docs`** con el texto del título de la página enlazada. Externos con
  `target="_blank" rel="noopener"`.

## 5. Lo que se toca a mano al añadir un tutorial

La vista es políglota: un `@code` de página no admite literales de objeto ni de array, así que el
menú y la portada no salen de un módulo de datos. Se escriben a mano, como `docsNav`:

1. **El menú de su categoría**, en `web/apps/tutorials/src/snippets/tutorials.fud`: un snippet
   `<categoría>Nav(current)` con un `@render tutorial(slug, título, nivel, @current)` por tutorial
   de la categoría, en el orden de §3. Uno aún sin escribir lleva `, false` al final y sale sin
   enlace, con «pronto». Si la categoría no tiene snippet todavía, se crea copiando
   `firstStepsNav`.
2. **La tarjeta de la portada** (`src/routes/index.fud`):
   `category(título, resumen, número, principiante, intermedio, avanzado, href)`. El `href` es el
   del primer tutorial escrito; sin él, la tarjeta dice «En preparación». Todo posicional: con
   argumentos con nombre falla el typecheck (hallazgo 56 del framework).
3. **Anterior y siguiente**: el `pager` de este tutorial y el de sus vecinos, en el orden de §3.
   El primero de la web vuelve a la portada; el último escrito lleva a ella como «siguiente».
4. **Su test**, en `src/routes/<slug>.test.ts`, como `first-component.test.ts`: responde 200, el
   `<h1>`, los Objetivos y que el menú lo marca como actual.

## 6. Antes de entregar

1. `npx vitest run` y `npx vite build` en `web/apps/tutorials`: todo en verde, sin avisos.
2. `node .claude/skills/capitulo-web/scripts/anchors.cjs web` desde la raíz: `broken: 0`.
3. Lighthouse sobre `node node_modules/vite/bin/vite.js preview --port 4310` (no `npx`), móvil y
   escritorio, claro y oscuro (lighthouse 12 instalado en el scratchpad). Lo esperado: 100 en
   accesibilidad, buenas prácticas y SEO; en rendimiento, 100 en escritorio y 99 en móvil, que es lo
   que da cualquier página en `vite preview`, sin compresión.
4. En `docs/web/tutorial/README.md`: el estado de su fila en §3 y una línea en el registro (§7).
5. Lo que la CLI o el framework hagan mal, a `docs/web/hallazgos-cli.md` o
   `docs/web/hallazgos-fudic.md`, leyendo antes el fichero entero para no duplicar.
6. Commit y push en `web-publica`, mensaje en inglés, solo asunto y cuerpo, sin trailers.

Al entregar, di a Pedro en pocas líneas qué hace el tutorial, qué has comprobado de verdad y qué no.
