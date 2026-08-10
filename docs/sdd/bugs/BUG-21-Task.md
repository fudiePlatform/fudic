# BUG-21 — Tareas · El nodo de texto que no pinta nada

> **BUG:** [BUG-21 — El árbol lleva un nodo de texto por cada salto de línea del autor](./BUG-21-nodos-de-whitespace.md)
> **Paquetes:** `@fudic/compiler` (`emit/display.ts` **nuevo**, `emit/runs.ts`, `emit/markup.ts`,
> `emit/markup-client.ts`, `emit/block.ts`, `emit/module.ts`, `emit/client.ts`, `emit/layout.ts`)
> **Rama:** `fix/bug-21-nodos-de-whitespace`
> **Progreso:** 0 / 13
> **Bloqueada** por el slice pendiente de [SDD-15](../SDD-15-emit.md): la hidratación vista correr
> en un navegador ([§2.8](./BUG-21-nodos-de-whitespace.md)). BUG-18 y BUG-19, las dos aristas
> anteriores, están en `Hecho`. **Las fases de abajo no se pueden arrancar tal cual: §4.2 y §4.3
> están reabiertas** —la deducción de la caja solo es cerrada dentro del shadow root, y hay una
> alternativa sintáctica que no deduce nada—, así que las tareas 1, 2, 6, 9 y sus criterios cambian
> según cuál se elija. La forma de la tanda —la decisión en `emitItems`, una sola vez, para las dos
> ramas— es lo único que las dos reglas comparten y lo único que ya está decidido.

La mitad del árbol de un componente típico es el sangrado del autor: cuatro de seis nodos en
`app-badge`, catorce en `app-card`. La corrección no es borrar nodos: es que descartar uno **exija
una prueba**, que la prueba la escriba un módulo que las dos ramas comparten, y que lo que no se
puede probar se conserve.

Cada tarea es un paso cerrado: se implementa, se verifica y se marca. Ninguna depende de tareas
posteriores.

---

## Los tres hitos

**Hito A — el emit sabe qué caja contiene un texto.** Hoy sabe si el texto se colapsa (`space.ts`)
y no sabe dónde cae. `display.ts` contesta lo segundo, y lo contesta leyendo el `<style>` del
componente y **el del hijo, por el grafo** — que es lo único que ninguna herramienta externa puede
saber y todo el argumento del BUG.

**Hito B — la decisión, una sola vez.** Vive en `emitItems`, que es por donde pasan las dos ramas.
Un nodo descartado en una y no en la otra no es medio arreglo: es una hidratación desalineada.

**Hito C — los goldens leídos.** Once ficheros que renumeran enteros. Es el coste real de la tanda
y el motivo de que vaya la última de las tres.

**Fuera de esta tanda:** mirar dentro de las ramas de un constructo, un árbol de reglas CSS, sembrar
`$w` para que un run interpolado nazca lleno, y cualquier poda de elementos.

---

## Fase 1 — Qué caja contiene el texto (3)

- [ ] **1. `emit/display.ts`, con su tabla y su lectura del `<style>`.**
      Módulo nuevo: `Display = 'block' | 'inline' | 'contents' | 'unknown'`, `hostDisplay(style)`,
      `tagDisplay(tag)` y `hasForeignDisplay(style)`
      ([§3.2](./BUG-21-nodos-de-whitespace.md)). El CSS se lee por regex sobre las tiradas
      literales, exactamente como `PRESERVING_DECL`
      ([`space.ts:52-73`](../../../packages/compiler/src/emit/space.ts#L52-L73)), porque SDD-09 §7
      deja el árbol de reglas fuera de v1 y `StyleNode` es plano. Todo lo que no se pueda leer
      —incluida una declaración interpolada por Razor— vale `unknown`. Va en su propio módulo y no
      en `space.ts` por el motivo de [`marker.ts:18-22`](../../../packages/compiler/src/emit/marker.ts#L18-L22):
      las dos ramas tienen que decidir idénticamente. Criterios §6.1, §6.2, §6.3.
- [ ] **2. `displayOf(tag)` baja desde el grafo a los dos emisores.**
      Resolverlo en `module.ts` y `client.ts`, junto a donde ya se resuelve
      `spaceModeOf(comp.tag, componentStyleNode(comp.doc))`
      ([`module.ts:138`](../../../packages/compiler/src/emit/module.ts#L138),
      [`client.ts:75`](../../../packages/compiler/src/emit/client.ts#L75)): para un tag del grafo,
      el `hostDisplay` de **su** `<style>`; para cualquier otro, `unknown`. Entra en
      `MarkupEmitter` junto a `isComponent` y en `ClientScope` junto a `childProps`. Es la tarea
      que hace que `<app-badge>` deje de ser un tag desconocido (§2.3).
- [ ] **3. El elemento padre llega al cuerpo de un bloque.**
      `BlockSite.level` lleva nombres de variable, no el nodo
      ([`markup-client.ts:57-71`](../../../packages/compiler/src/emit/markup-client.ts#L57-L71)), así
      que un `@if` dentro de un `<article>` no sabe hoy quién lo contiene. Añadir el `ElementNode`
      del contenedor (o `null` en la raíz) a `Level` y hacer que `block.ts` lo propague
      ([`block.ts:198-209`](../../../packages/compiler/src/emit/block.ts#L198-L209)). Es el único
      cambio estructural de la tanda; sin él, el cuerpo de todo bloque decide con `unknown` y
      conserva de más — que es correcto, pero deja fuera la mitad de las fixtures.

## Fase 2 — La decisión, en el sitio compartido (3)

- [ ] **4. `emitItems` toma un `RunContext`.**
      Sustituir el parámetro `space: SpaceMode` por el contexto de
      [§3.1](./BUG-21-nodos-de-whitespace.md) — modo, elemento padre, `display` del contenedor,
      `displayOf`, y si estos hijos son light DOM de un host. Solo la firma y sus dos llamadas
      ([`markup.ts:94`](../../../packages/compiler/src/emit/markup.ts#L94),
      [`markup-client.ts:359`](../../../packages/compiler/src/emit/markup-client.ts#L359)): esta
      tarea **no cambia ni un byte de salida** y los goldens son el testigo.
- [ ] **5. Las tres guardas, antes que cualquier prueba.**
      En `emitItems`: light DOM de un host (y el fallback de un `<slot>`), run que es el único
      contenido del elemento **comprobado sobre el resultado** —si todos los hermanos son
      descartables, el último no lo es—, y modo `preserve`. Son los tres riesgos que
      [BUG-07 §4.5](./BUG-07-html-sin-minificar.md) nombró, y siguen siendo ciertos: se escriben
      primero para que ninguna prueba posterior pueda saltárselos. Criterios §6.7, §6.8, §6.9.
- [ ] **6. Las tres pruebas.**
      Contenedor `flex`/`grid` (no genera caja), borde de un contenedor de bloque, y entre dos
      cajas de bloque ([§4.2](./BUG-21-nodos-de-whitespace.md)). El `display` sale de las tres
      fuentes de §4.3 **en ese orden**, y una declaración `display` fuera de `:host` envenena la
      tabla de tags para todo el fichero. `unknown` conserva, sin excepción. Criterios §6.4, §6.5,
      §6.6.

## Fase 3 — Los consumidores del item list (2)

- [ ] **7. El marcador, con la lista nueva.**
      `markerSite` busca dos runs interpolados separados **solo** por constructos
      ([`marker.ts:62-75`](../../../packages/compiler/src/emit/marker.ts#L62-L75)). Un run de
      whitespace en medio hoy evita el comentario; descartado, la forma aparece y el marcador se
      emite donde antes no. Es correcto y lo hacen las dos ramas —la regla vive en un módulo
      compartido—, pero hay que verlo pasar con un test antes de mirar ningún golden.
      Criterio §6.16.
- [ ] **8. El anclaje de un constructo.**
      Un run estático recibe variable cuando un constructo delante lo necesita como ancla
      ([`markup-client.ts:418-437`](../../../packages/compiler/src/emit/markup-client.ts#L418-L437)).
      Si ese run desaparece, el bloque pasa al ancla siguiente o a `null`. La guarda de §4.4 evita
      el caso frecuente, pero la interacción se prueba, no se razona: `@if` con whitespace
      descartable delante y detrás, y el hermano de detrás donde estaba. Criterio §6.15.

## Fase 4 — Verificación (3)

- [ ] **9. Los criterios de forma y de unidad (§6.1–§6.10).**
      `display.test.ts` nuevo y ampliación de
      [`space.test.ts`](../../../packages/compiler/test/emit/space.test.ts), con nodos del **parser
      real** y nunca forjados, que es la regla de aquel fichero. El criterio que da sentido a la
      tanda es §6.6: dos componentes en memoria que solo se diferencian en `:host { display }`
      producen distinto número de nodos. Y §6.10: el AST **no se poda** —los `TextNode` siguen con
      su span, porque el formateador y el LSP los leen—.
- [ ] **10. Los source maps (§6.11–§6.13).**
      [`sourcemap.test.ts`](../../../packages/compiler/test/emit/sourcemap.test.ts) verde **sin
      tocarlo**: localiza el offset generado con `code.indexOf` sobre el texto final, así que pasa
      si y solo si los pares se recalcularon sobre el layout nuevo — y es lo que detectaría que
      alguien lo implementó como pasada sobre el texto emitido, que es la única forma de romper esto
      ([§2.6](./BUG-21-nodos-de-whitespace.md)). Añadir los dos criterios propios: el conjunto de
      `sourceOffset` de `app-card` no pierde ninguno, y un run interpolado pegado a uno descartado
      conserva su ancla.
- [ ] **11. Equivalencia SSR ↔ cliente (§6.14).**
      En el arnés de [`hydrate/`](../../../packages/compiler/test/emit/hydrate/), con `adoptOnly`:
      para cada fixture, el árbol que `render` serializa y el que `c()` fabrica tienen el **mismo
      número de nodos**, y `h()` no fabrica ninguno. Es el test que hace imposible que la regla
      entre por una rama sola, y el que hay que ver fallar si se implementa solo en `markup.ts`.

## Fase 5 — Cierre (2)

- [ ] **12. Los once goldens, regenerados y leídos a mano (§6.17, §6.18).**
      Las únicas diferencias admisibles son nodos de whitespace que desaparecen y la renumeración
      de `$nN` que eso arrastra. Un `$dom.element`, un `setAttr` o una sentencia de valor que se
      mueva **no** es renumeración. Anotar en el cuerpo del commit cuántos nodos cayeron por
      fichero: es el número que mide la tanda. Y `pnpm build` de `examples/basic` con una
      comparación visual de la página: es el único sitio donde un espacio perdido se ve.
- [ ] **13. Verde, cobertura e índices.**
      `pnpm typecheck`, `pnpm test` y `pnpm build` en la raíz. `display.ts` al **100 %** en las
      cuatro métricas; `runs.ts`, `marker.ts` y `space.ts` están al 100 % y no bajan. Nada de
      `/* v8 ignore */`. Actualizar el comentario de
      [`space.ts:19-20`](../../../packages/compiler/src/emit/space.ts#L19-L20) y el de
      [`markup.ts:113-115`](../../../packages/compiler/src/emit/markup.ts#L113-L115), que hoy
      afirman que un nodo de whitespace nunca se descarta. Anotar el avance en
      [bugs/INDEX.md](./INDEX.md) y en [../INDEX.md](../INDEX.md), y pasar BUG-21 a `Hecho` si los
      18 criterios de §6 están verdes.

---

## Lo que esta tanda deja listo para la siguiente

**Un sitio donde cabe una prueba más.** La decisión vive en `emitItems`, las tres guardas se
comprueban antes que cualquier prueba, y `unknown` conserva. Una regla nueva solo tiene que añadir
una prueba a §4.2: no tiene que buscar dónde ponerla, ni convencer a las dos ramas por separado.

**Y lo que NO deja listo, para no prometerlo.** Mirar dentro de las ramas de un constructo necesita
`display.ts` —hay que juzgar la primera y la última caja de cada rama— pero no es `display.ts` lo
que le falta: lo difícil es que **una rama puede no renderizar nada**, y entonces los vecinos del
constructo quedan pegados y la respuesta depende de una condición que se evalúa en runtime. Eso es
adyacencia condicional, no cajas, y es un BUG propio con sus criterios (§7).

## Enlaces

- Criterios de aceptación: los 18 de
  [BUG-21 §6](./BUG-21-nodos-de-whitespace.md#6-criterios-de-aceptación).
- Corrige la parte de [BUG-07 §4.5](./BUG-07-html-sin-minificar.md) que midió **bytes** cuando la
  pregunta era de **nodos**. El resto de aquel BUG —colapsar, los modos, `data-fud-space`— se queda
  intacto.
- Toca los mismos ficheros que [BUG-18](./BUG-18-update-denso.md) y
  [BUG-19](./BUG-19-tres-constructos-sin-servidor.md), y va **detrás de las dos**.
