# BUG-49 · El banco que no se ve trabajar: clic sin respuesta, página que salta y Run all al doble

> **Estado:** `En curso` (2026-10-15) — implementado y medido; faltan los tests de las fases 2–4
> y la prueba de Pedro. Se redacta al final, a partir de lo hecho, por decisión de Pedro.
> **Corrige:** [BUG-48](./BUG-48-el-banco-que-nadie-usaria.md) §3.2 (protocolo), §3.4 (contrato
> de los términos), §3.5 y §4.9 (VS Code), §4.6 (el motor) y §4.8 (el shell).
> **Paquetes:** `@fudic/workbench` · `fudic-vscode` (`packages/vscode`) · `examples/basic`
> **Rango:** el de SDD-32, `FUD0970`–`FUD0989`. No nace ni cambia ningún código.
> **Rama:** `worktree-workbench` (worktree `workbrench`), desde `main` en `4867866`.

---

## 1. Contexto y síntoma

Con BUG-48 el banco ya es rápido y estable, pero al usarlo desde VS Code se siente parado:

1. **El primer clic no hace nada visible.** «▶ Run» en una `.fudspec` sin banco abierto arranca
   el proceso (Vite y un navegador) y durante ~2 s no cambia nada en el editor: ni la lente, ni
   el margen, ni una pestaña. Parece que no ha funcionado.
2. **Lo que es de toda la spec está colgado del primer criterio.** «▶ Run failing» sale sobre el
   primer `criterion`; Run all, Pause y Cancel solo existen en la pestaña.
3. **La página salta (CLS) al ejecutar** uno o todos: cada resultado borra sus capturas y las
   vuelve a crear sin tamaño, la tarjeta se encoge y crece; una tarjeta verde se pliega sola; las
   rojas se reordenan a mitad de ejecución.
4. **Run all tarda el doble por criterio.** Medido sobre `app-card` de `examples/basic` (3
   criterios, Chrome real): uno a uno ~700 ms cada criterio; los tres a la vez ~1 300 ms cada uno.
5. **La página dice poco de lo que importa.** No sale el `props` con el que se monta, ni la línea
   de cada paso, ni el viewport; un `then` en verde repite su evidencia («visible → visible»); un
   `when` no dice qué había antes; la barra «Open in browser» con la URL ocupa una fila entera.

## 2. Causa raíz

### 2.1. La pestaña se abría cuando el proceso contestaba

`open()` lanzaba el proceso y esperaba su primera línea para llamar a `panels.open({ title, url })`.
Las lentes eran texto fijo (`criterionLenses`) y el margen solo cambiaba con el mensaje `running`
del proceso, que es lo último que llega. Entre el clic y eso no había nada que pintar.

### 2.2. Las capturas se rehacían sin tamaño

`paintShots` hacía `replaceChildren()` y creaba un `<img>` nuevo sin `width`/`height`: hasta que
el PNG llegaba, la figura medía cero. Además `paint` plegaba toda tarjeta en `pass` y ordenaba con
`style.order` a cada resultado.

### 2.3. Cada criterio abría su contexto en el momento

`browser.newPage()` crea un `BrowserContext` nuevo por criterio (aislamiento) y eso cuesta
250–350 ms; con tres a la vez, 450–875 ms cada uno. Medido por fases: `goto` 100–200 ms, capturas
60–230 ms, cerrar ~15 ms. El coste que se dobla es abrir el contexto.

### 2.4. El protocolo no llevaba lo que la página necesita

`DescribedStep` no tenía línea; `DescribedCriterion` no tenía el `props`; la sesión no decía el
viewport (era el que Playwright pone por defecto, sin escribir); una captura era solo una URL.

## 3. Interfaz pública

### 3.1. Protocolo (`v: 2`, compatible hacia delante)

- `DescribedStep.line` — 1-based, la línea del paso en la `.fudspec`.
- `DescribedCriterion.props: { name, line } | null` — la línea `props <name>`; `null` sin ella.
- `SessionMessage.viewport?: Viewport` — `{ width, height, scale }`, junto a `browser`.
- `ResultMessage.shots: { before?: ShotRef; after?: ShotRef }` con
  `ShotRef = { url, width, height }` (tamaño del elemento en px CSS). **Rompe** a quien leyera
  `shots.before` como cadena; el único lector es el shell.

### 3.2. Contrato de los términos

`ctx.locate(ref).setAttribute(name, value)` devuelve `Promise<string | null>`: el valor que tenía
el atributo (`null` sin él). El término `set-attribute` de `examples/basic` lo da como evidencia:
`before: "default"` o `before: none`.

### 3.3. El navegador

`VIEWPORT = { width: 1280, height: 720, scale: 1 }` y `SPARE_PAGES = 4`, exportados de
`browser.ts`. `BrowserLike.viewport`.

### 3.4. VS Code

- Puertos: `WorkbenchPanelPort.open({ title })` (sin `url`); `WorkbenchPanel.load(url, title)`;
  `ProgressPort { begin(title): () => void }` en `WorkbenchDeps.progress`.
- `Workbenches`: `run(file, id)` pasa a `act(file, action: LensAction)`; nacen
  `lensState(file)` y `onLensesChanged(listener)`. `specLenses(text, state)` sustituye a
  `criterionLenses`. `LensAction` = run `{ all } | { failing } | { id }`, `pause { paused }`,
  `cancel`. El comando sigue siendo `fudic.runCriterion`, ahora `(file, action)`.
- Pestaña: `startingHtml()`; `panelRequest` acepta `{ type: 'hover', file, line | null }` y
  `PanelEditor.highlight(file, line | null)`.

## 4. Comportamiento corregido

### 4.1. El clic se ve en el acto

- La pestaña se abre al pulsar, con un spinner y «Starting workbench…», titulada con el nombre
  del fichero; cuando el proceso contesta carga el shell y toma el título del `tag`. Si falla, lo
  dice ahí mismo (además del aviso de siempre). Cerrarla antes de que conteste cierra el
  componente en cuanto contesta.
- Mientras arranca, la barra de estado muestra el progreso de VS Code y la lente de `component`
  dice `$(sync~spin) Starting workbench…`. Un segundo clic durante el arranque trae la misma
  pestaña al frente.
- Al pulsar Run / Run all / Run failing, las lentes de los criterios pedidos pasan a
  `$(sync~spin) Running…` y el margen los marca en marcha **antes** de que el proceso lo confirme.
  Solo se marca lo que seguro va a correr: un `id` que la sesión conoce, todos, o los que se sabe
  que están en rojo. Así ningún spinner se queda colgado.
- La barra de estado gira mientras corre algún criterio del componente.

### 4.2. Las lentes de la spec van sobre `component`

Sobre la línea `component` (sobre el primer criterio si no la hay): `▶ Run all` (`Running all…`
si corren todos), `▶ Run failing`, y con el banco abierto `⏸ Pause` / `▶ Resume (n)` y
`■ Cancel`. Cada criterio solo lleva `▶ Run`. La extensión lee el mensaje `state` para saber si
está en pausa.

### 4.3. La página

Según la maqueta de Pedro, con los textos en inglés:

- **Cabecera en dos filas:** tag, `n/m pass` en verde o rojo, `0.4 s · hora · navegador ·
  viewport 1280×720`, el estado del socket con su punto, y en VS Code el icono de abrir en el
  navegador (la barra con la URL desaparece). Debajo, Run all (primario), Run failing, Pause,
  Cancel y el modo de las capturas: *Side by side* · *Slider* · *Final only* (se recuerda).
- **Tarjeta:** punto (spinner mientras corre), nombre, `pass · ms`, `L5` a su línea, y
  `▶ Run`, `⊤ Pin`, `◉ Live` (marcado si su página viva está abierta). Abierta siempre; se pliega
  pulsando la cabecera o con Enter.
- **Pasos a la izquierda:** primero `given props <nombre>`; cada paso con ✓ / ✗ y la evidencia
  solo si el texto no la dice ya (`→ 20px`, `(before: "default")`); un paso que no aplica lleva
  «skipped here». Al pasar el ratón, el paso se ilumina, se iluminan sus cajas en la captura, sale
  su `L17` y en VS Code se ilumina esa línea de la `.fudspec`.
- **Capturas a la derecha:** «Before the when» y «At the end» con su tamaño y escala, y
  *Expand ⤢* para verlas al doble. *Slider* las superpone con un tirador.

### 4.4. Nada se mueve mientras llegan resultados

- Las capturas se construyen aparte, con `width`/`height` del `ShotRef`, y se cambian cuando sus
  imágenes están decodificadas.
- Una tarjeta no se pliega sola.
- Los rojos van delante, pero el orden solo se recalcula cuando no hay ejecución en marcha.
- Las cajas se colocan en el tamaño CSS de la captura (antes, en píxeles de la imagen: a una
  escala distinta de 1 salían desplazadas).

### 4.5. Run all ya no paga los contextos

El navegador deja abiertas `SPARE_PAGES` páginas, cada una en su contexto, al arrancar y cada vez
que no corre ningún criterio. Una ejecución toma las que ya hay; si no queda ninguna, abre una.
Cerrar una página cierra su contexto, una sola vez. El aislamiento entre criterios no cambia.

Medido sobre `app-card` (3 criterios, Chrome, tres rondas tras calentar):

| | antes | después |
|---|---|---|
| abrir página | 250–875 ms | 0 ms |
| un criterio solo | ~560–1 010 ms | ~320–600 ms |
| un criterio dentro de Run all | ~940–1 850 ms | ~410–580 ms |
| Run all, total | 1,3–1,8 s | 0,56–0,59 s |

## 5. Invariantes

- Cada criterio corre en un contexto propio: nada de un criterio llega a otro.
- Una lente o el margen solo marcan «en marcha» lo que el proceso va a ejecutar.
- Ningún texto de la página entra como HTML: todo va por `textContent`.
- La pestaña de VS Code solo acepta mensajes del origen del shell.

## 6. Criterios de aceptación

1. Con el banco cerrado, pulsar «▶ Run» abre la pestaña al instante con «Starting workbench…» y
   la lente de `component` dice «Starting workbench…»; al contestar el proceso, la pestaña carga
   el shell titulada `Workbench · <tag>`.
2. Un fallo al arrancar (sin Node, sin binario válido, el proceso muere) se ve en la pestaña y en
   el aviso. Cerrar la pestaña mientras arranca cierra el componente al contestar.
3. Sobre `component` salen Run all · Run failing, y con el banco abierto Pause/Resume (n) ·
   Cancel; cada criterio solo lleva Run. Cada lente manda su orden.
4. Al pulsar, el criterio pedido muestra el spinner en su lente y el margen «running» antes del
   mensaje del proceso, y lo quita su resultado o un `cancelled`.
5. La sesión lleva la línea de cada paso, el `props` y el viewport; un resultado lleva sus
   capturas con tamaño; `set-attribute` devuelve el valor anterior.
6. La página pinta la cabecera, las tarjetas y los pasos de §4.3; los tres modos de captura y
   *Expand* funcionan; el hover ilumina la línea en el editor.
7. Durante una ejecución ninguna tarjeta cambia de altura por sus capturas, ni se pliega, ni se
   mueve de sitio.
8. Run all sobre `app-card` no tarda por criterio más que uno solo de forma apreciable (tabla de
   §4.5).
9. `pnpm typecheck`, `pnpm test` y `pnpm build` en verde; `@fudic/workbench` y `fudic-vscode` al
   100 / 100 / 100 / 100.
10. Pedro lo prueba en VS Code y en el navegador.

## 7. Fuera de alcance

- Guardar las ejecuciones para un MCP (etapa 2 del banco).
- Fuentes externas (IBM Plex de la maqueta): la página no carga nada de fuera.
- Cambiar qué hace *Live* (en la maqueta su tooltip decía «re-ejecuta al guardar»; sigue
  abriendo la página viva del criterio).

## 8. Decisiones de la implementación

1. El viewport se fija y se dice: 1280×720 a escala 1, el que Playwright ya usaba sin escribirlo.
   El 1280×800 de la maqueta era inventado.
2. Pause y Cancel solo salen en las lentes con el banco abierto: cerrado no hay nada que pausar.
3. «Run failing» marca como en marcha solo los criterios con último veredicto `fail`/`error`
   conocido por la extensión, nunca los «sin resultado»: el proceso podría no ejecutarlos.
4. Una lente sin acción (spinner) lleva comando vacío: VS Code la pinta como texto.
5. Los botones globales siguen también en la cabecera de la página, como en la maqueta.
6. Las tarjetas salen abiertas siempre: plegar las verdes las hacía saltar al cambiar de veredicto.
7. Los rojos siguen delante, pero solo se reordena al acabar la ejecución.
8. La evidencia de un `when`/`given` va entre paréntesis y la de un `then` tras `→`, y en los dos
   casos solo si el texto del paso no la contiene ya.
9. La evidencia de `set-attribute` es `before: "<valor>"`, para que se lea junto al texto
   (`app-card gets variant="highlight" (before: "default")`).
10. Las páginas de repuesto se rellenan solo cuando no corre ningún criterio: abrirlas durante la
    ejecución volvía a ralentizarla. Cuatro, como `DEFAULT_WORKERS`.
11. *Expand* abre un `<dialog>` con la captura al doble; *Slider* recorta la de antes con
    `clip-path` sobre la del final.
12. Se implementó con dos sesiones: esta el código y `workbrench-tests` los tests.
