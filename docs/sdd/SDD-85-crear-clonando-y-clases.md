# SDD-85 — Crear clonando una plantilla, y las clases sin pisar

> **Estado:** `Listo` (2026-11-16) — [tareas](./SDD-85-Task.md).
> **Paquetes:** `@fudic/dom` · `@fudic/ssr` · `@fudic/compiler` · `@fudic/vite` · `@fudic/core` · `@fudic/di` ·
> `@fudic/testing` · `@fudic/mcp` · `examples/basic`
> **Depende de:** 14 (el contrato `Dom<N>`), 15 (los tres caminos `c` / `h` / `u` y el cursor de
> elementos), 30 (los bloques como funciones), 45 (las piezas del runtime), 61 (los spreads), 70
> (`@await`), 84 (la policy `fudic` y las necesidades de CSP). Todas en `main`.
> **Rango de diagnósticos:** ninguno. Lo que la CSP tiene que dejar pasar ya lo comprueba `FUD1545`.
> **Decisiones de gramática:** ninguna. La 22 no cambia: `class=` sigue siendo un string; lo que cambia
> es cómo se escribe en el DOM.
> **Origen:** [IDEA-08](./ideas/IDEA-08-adelgazar-el-cliente.md) §1, §2 y §3, con lo que se decidió con
> Pedro el 2026-11-16. §4 (props reflejadas) queda en la IDEA.
> **Rama sugerida:** `sdd-85-crear-clonando`, desde `main`.
>
> **Qué cambia en una frase.** Cuando el navegador tiene que crear un componente o el contenido de un
> bloque, ya no lo construye nodo a nodo: clona una plantilla HTML que escribió el compilador y la
> adopta con el mismo código que adopta lo que pintó el servidor. Y las clases se escriben token a
> token, así que una clase que añade otro código ya no se pierde.

---

## 1. Contexto y objetivo

### 1.1. Lo que hay hoy

- **Dos formas de crear lo mismo.** Cada componente compila a un controlador con `c` (crear desde
  cero, nodo a nodo) y `h` (adoptar lo que pintó el servidor). Los bloques (`@if`, `@switch`,
  `@foreach`, `@for`, `@while`, `@await`) tienen también su `c` y su `h`. Son dos cuerpos que se
  escriben a la vez para que no se separen ([markup-client.ts](../../packages/compiler/src/emit/markup-client.ts)),
  pero son dos.
- **El `c` pesa.** En `examples/basic` los `c` raíz son un tercio del JS de los componentes
  (49.024 de 147.780 B), y solo 4 de 56 componentes pueden llegar a usarlo. En un formulario
  (`app-form`, `user-form`, `app-wide-form`) el `c` es la mitad del fichero.
- **El servidor no usa el `c` del cliente.** Pinta con su propio emisor sobre `SsrDom`
  ([markup.ts](../../packages/compiler/src/emit/markup.ts)), y el Service Worker usa ese mismo. Lo
  que cambie aquí solo toca el código del navegador.
- **`h` ya sabe adoptar HTML parseado.** Su cursor cuenta elementos, no nodos, y un texto se busca
  desde el elemento de al lado y se crea con `textAt` si no está. Está hecho así porque el HTML del
  servidor no conserva los límites entre textos.
- **`h` no escribe valores.** `subscribe` no se ejecuta al suscribirse: da por buenos los valores que
  pintó el servidor.
- **La clase estática se calcula en ejecución.** `class="panel"` sale como
  `` [`panel`].filter(Boolean).join(` `) `` en el servidor y en el cliente
  ([attrs.ts:619-627](../../packages/compiler/src/emit/attrs.ts)).
- **`class:x=@cond` pisa el atributo entero.** Cada cambio recompone la cadena y la escribe con
  `setAttr`, así que se come cualquier clase que haya puesto otro código (un `ref`, una librería, una
  animación). Lo mismo pasa con `class=@expr` y con la `class` de un spread.
- **La policy `fudic` ya existe** ([dom/src/trusted.ts](../../packages/dom/src/trusted.ts)), con su
  necesidad de CSP (`TRUSTED_TYPES_NEEDS`) y el aviso `FUD1545` si `page.headers` no la deja pasar.

### 1.2. Objetivo

1. Un único camino para dar vida a un trozo de vista en el navegador: adoptar. Crear es clonar una
   plantilla y adoptarla.
2. El código del navegador pesa menos: una plantilla HTML en lugar de cien llamadas al DOM.
3. Lo que crea el navegador es exactamente lo que pintaría el servidor con los mismos datos.
4. Funciona con Trusted Types activo, sin que el usuario tenga que añadir nada a lo que ya escribe la
   plantilla de `page.headers`.
5. Una clase estática no cuesta código. Una clase dinámica solo toca sus tokens y nunca borra las
   ajenas.

---

## 2. Dependencias

| SDD | Qué aporta |
|---|---|
| 14 | `Dom<N>` y `DomClient<N>`, `browserDom`, `SsrDom` |
| 15 | `c` / `h` / `u` / `r`, `FudicElement.c()` y `h()`, el cursor de elementos, `textAt` |
| 30 | Cada bloque como `($parent, $anchor, …) => ({ key, c, h, m, s, u, move, r })` |
| 45 | Las piezas `/_fudic/<versión>/<paquete>/<pieza>.js` y su presupuesto |
| 61 | Los spreads de un elemento nativo (`setAttrs`) y lo que les gana |
| 70 | `@await` como bloque |
| 84 | `trustedHtmlOf`, `TRUSTED_TYPES_NEEDS`, `paintsHtml`, `FUD1545` / `FUD1556` |

Ninguna dependencia nueva.

---

## 3. Interfaz pública

### 3.1. La plantilla: `template` en `@fudic/dom`

Un módulo nuevo, `dom/src/template.ts`, publicado como la pieza `dom/template`:

```ts
/** A literal of HTML the compiler wrote, parsed on its first clone and cloned on every other. */
export type Template = () => DocumentFragment;

export function template(strings: TemplateStringsArray): Template;
export function templateIn(strings: TemplateStringsArray): Template;
```

- **Solo acepta un literal sin huecos.** `strings.length === 1` y `Object.isFrozen(strings)`; si no,
  `TypeError`. Un `TemplateStringsArray` solo sale de un literal escrito en el código, nunca de un dato
  que llegue por la red o de un formulario. Así nadie puede usar `template` como puerta para HTML
  ajeno.
- **Perezoso.** Nada se parsea al cargar el módulo. La primera llamada a la función devuelta crea un
  `<template>`, le asigna el HTML a través de `trustedHtmlOf` y guarda el elemento; esa llamada y
  todas las siguientes devuelven `document.importNode(content, true)` (§8.2, decisión 23). Una
  página en la que no se abre ningún bloque no crea la policy.
- **`templateIn`** es para un trozo que vive dentro de `<svg>` o de `<math>`. El compilador escribe el
  envoltorio en el literal (`<svg>…</svg>`) para que el navegador cree los nodos con el espacio de
  nombres correcto, y `templateIn` devuelve los hijos del envoltorio, sin él.
- `@fudic/dom` exporta `template`, `templateIn` y el tipo `Template`. Ningún otro paquete crea un
  `<template>` con HTML del compilador.

### 3.2. Las clases en `Dom<N>`

Dos métodos nuevos en el contrato, implementados por `browserDom` y por `SsrDom`:

```ts
/** Puts `token` in the element's class list when `on`, takes it out otherwise. */
toggleClass(el: N, token: string, on: boolean): void;
/** Takes out the tokens of `prev` that are not in `next`, and puts in the ones of `next`. */
swapClass(el: N, next: unknown, prev: unknown): void;
```

`swapClass` recibe el valor tal cual y lo lee con `classText` (exportada por `@fudic/dom`): un
string, un número o un bigint es su texto; cualquier otra cosa (`true`, `false`, `null`,
`undefined`, un objeto) no pone ningún token. Es la regla de la `class` de un spread (§8.2, 8).

| | Navegador | Servidor y SW |
|---|---|---|
| `toggleClass` | `el.classList.toggle(token, on)` | Un conjunto ordenado de tokens, que se escribe como `class="…"`; sin tokens, no hay atributo |
| `swapClass` | `classList.remove(…)` de los que sobran, `classList.add(…)` de los nuevos | Lo mismo sobre el conjunto |

- No se emula `DOMTokenList`. El compilador emite las mismas llamadas para los tres destinos, igual
  que con `setAttr` y `setLive`.
- Los tokens se separan por espacio en blanco ASCII, como hace el navegador.
- `setAttrs` (los spreads, SDD-61) escribe la `class` de un spread con `swapClass`, y el resto de
  atributos como hoy.

### 3.3. Escape de HTML en `@fudic/dom`

`escapeText` y `escapeAttr` pasan de `@fudic/ssr` a `@fudic/dom`. `@fudic/ssr` los sigue exportando
(reexportados), así que su API no cambia. El compilador los usa para escribir las plantillas: el
servidor y la plantilla escapan con la misma función.

### 3.4. Lo que ve el autor

Nada nuevo que escribir. La única diferencia visible es que una clase añadida por otro código
sobrevive a los cambios de `class:`, de `class=@expr` y de un spread.

---

## 4. Comportamiento

### 4.1. La plantilla de un trozo de vista

Hay una plantilla para la raíz de cada componente con controlador de cliente y otra para cada rama o
cuerpo de cada bloque (`@if` / `else`, cada `case` de `@switch`, el cuerpo de `@foreach`, `@for` y
`@while`, cada rama de `@await`). Las rutas no tienen `c` raíz y siguen sin él; sus bloques sí llevan
plantilla.

**La plantilla es lo que pintaría el servidor en «estado vacío»:**

| En la vista | En la plantilla |
|---|---|
| Un elemento nativo | El elemento, con sus atributos **estáticos** |
| Un atributo dinámico, un `.prop`, un `@evento`, un `ref` | Nada |
| `class="a b"` | `class="a b"`, menos los tokens que tienen su propio `class:` (§4.5) |
| Texto estático | El texto, escapado |
| Un tramo de texto con partes dinámicas | El tramo con cada parte dinámica vacía; si queda vacío, nada |
| Un comentario que separa dos textos (§8.2, decisión 34) | El comentario |
| Un bloque | Nada: todos cerrados, todas las listas vacías |
| Un componente hijo | Su host vacío, con sus atributos estáticos, sin `<template shadowrootmode>` |
| `@raw(…)` | El elemento que lo contiene, vacío |
| Comentarios del autor y espacios de formato | Lo mismo que escribe el servidor |

- **Se genera en el mismo recorrido** que hoy escribe a la vez fabricar, adoptar y enganchar
  ([markup-client.ts](../../packages/compiler/src/emit/markup-client.ts)). La plantilla sustituye al
  cuerpo de fabricar. Generarla en otro recorrido sería abrir la puerta a que se separen.
- **El escape es el del servidor** (§3.3). Dentro de `<textarea>` y `<title>` (RCDATA) se escapa como
  texto; dentro de un `<script>` de datos (`ld+json`, `importmap`: decisión 129), tal cual, como lo
  escribe el servidor. Un `<template>` del autor va con su contenido.
- **El literal** se escribe como `` template`…` `` a nivel de módulo, una constante por plantilla. Se
  escapan `\`, `` ` `` y `${`. Una plantilla cuya raíz está dentro de `<svg>` o `<math>` va con
  `templateIn` y su envoltorio (§3.1).
- **Los hijos no van dentro.** `cloneNode` no copia un shadow root salvo que sea `clonable`, y cada
  hijo tiene su propia plantilla. El padre crea el host vacío y lo levanta con `live(host, props)`,
  como hoy.

### 4.2. Crear: clonar, adoptar, escribir

El `c` de la raíz de un componente pasa a ser:

1. `$shadow.append(T())`: clonar la plantilla en el shadow root que ya abrió `FudicElement.c()`.
2. **Adoptar** con el código de `h`, con una diferencia: los bloques no se adoptan (§4.3).
3. **Escribir una vez cada valor dinámico**: textos, atributos, `class:`, `class=@expr`, props de
   control (`setLive`), spreads, `@raw`. Son los mismos escritores que usa `u`; se llaman una vez con
   el valor actual.
4. **Abrir los bloques** que tocan, con su `c` y su `m`, como hace hoy el `c`.
5. **Levantar los hijos** con `live(host, props)`.
6. **Enganchar** (`$s()`): eventos, `bus:`, `ref`, formularios. Este cuerpo ya era común a los dos
   caminos y no cambia.

El `c` de un bloque es lo mismo dentro de un fragmento: clona su plantilla, adopta **dentro del
fragmento** (el `$parent` de la adopción es el fragmento), escribe, abre sus bloques internos y
levanta sus hijos. Los nodos quedan en su lista, y `m` los coloca en su sitio como hoy. Una fila de
`@foreach` con clave se crea así y se mueve con `move` como hoy.

`FudicElement.c()` no cambia: abre el shadow root, llama al `c` del controlador y adopta las hojas de
estilo. `live()` tampoco. `mount` de `@fudic/testing` sigue llamando a `host.c(payload)`.

### 4.3. `h` con todo cerrado

Hoy, el `h` de un bloque da por hecho que el servidor ya pintó la rama que toca. En una plantilla no
hay ninguna rama, así que **el camino de crear no llama al `h` de los bloques**: llama a su `c` y a su
`m` (paso 4 de §4.2). El `h` que adopta lo del servidor no cambia.

En el emisor esto es un parámetro del recorrido de adopción: «el servidor pintó los bloques» (para
`h`) o «los bloques están cerrados» (para `c`). El resto del código de adopción es el mismo.

### 4.4. Los textos

- Un tramo con partes dinámicas va en la plantilla con esas partes vacías. Si queda vacío no hay nodo,
  y `textAt` lo crea en su sitio al adoptar, como hace hoy con un valor `''` del servidor.
- Dos textos que el HTML juntaría van separados por un comentario, también en la plantilla (§8.2,
  decisión 34).
- El paso 3 de §4.2 escribe el texto entero del tramo con `setText`.

### 4.5. Las clases

**Clase estática.** Va escrita en la plantilla. En el servidor, `setAttr(el, 'class', 'a b')` con el
literal: sin `filter` ni `join`.

**`class:x=@cond`** se escribe con `toggleClass(el, 'x', cond)`: en el servidor al pintar, en el
cliente al crear (paso 3) y en cada cambio. Al hidratar no se escribe, como cualquier otro valor.

**`class=@expr`** se escribe con `swapClass(el, nuevo, anterior)`. La primera vez, `anterior` es `''`.

**Las reglas:**

1. **El mismo token estático y con `class:`** (`class="activo" class:activo=@x`): manda `class:`. El
   token se quita del literal estático al compilar, así que el estado inicial es el de `@x` y un
   `toggle(false)` no borra nada que el autor quisiera fijo. Sin diagnóstico: no rompe nada.
2. **El orden** en el servidor y en el primer `c`: primero los tokens estáticos, después los de
   `class=@expr` y después los de `class:` activos, en el orden del fuente. Tras varios cambios el
   orden puede variar. En CSS no importa; en una comparación del HTML, sí, y queda dicho aquí.
3. **`class=""` residual.** En el navegador, quitar el último token deja el atributo vacío. En el
   servidor, sin tokens no hay atributo. Es inocuo y no se corrige.
4. **Spreads.** Lo de SDD-61 sigue igual: si el elemento tiene `class`, `class=@expr` o algún
   `class:`, la `class` del spread no se escribe. Si no los tiene, la `class` del spread se escribe
   con `swapClass`. Lo explícito gana, y nadie pisa clases ajenas.
5. **`class=@expr` con `class:` en el mismo elemento**: los dos escriben por tokens. Si un token está
   en los dos, el último que escribe es `class:`, y gana.

### 4.6. Los atributos de un spread al crear

Un spread de un elemento nativo se escribe en el paso 3 con `setAttrs`, después de que la plantilla
haya traído los atributos estáticos. En un elemento creado en el navegador, los atributos del spread
quedan detrás de los estáticos, mientras que el servidor los escribe donde está el spread (SDD-61
§3.8). Es el mismo caso que el orden de las clases (§4.5, regla 2): el DOM y el CSS no lo ven, y queda
dicho.

### 4.7. Trusted Types y CSP

- `template` pasa el HTML por `trustedHtmlOf`, la puerta de la policy `fudic` que ya existe. No hay
  una policy nueva ni una segunda llamada a `createPolicy`.
- `createHTML` sigue devolviendo el texto tal cual. Aquí es seguro: lo que llega es HTML que escribió
  el compilador en un literal, y los valores entran después por `setText`, `setAttr` y `classList`,
  que no son puntos vigilados.
- Cada chunk que lleva al menos una plantilla registra `TRUSTED_TYPES_NEEDS` (`paintsHtml`), como ya
  hacen los que pintan `@raw`. Con eso, `FUD1545` avisa si `page.headers` exige Trusted Types y no
  incluye `fudic`, y `FUD1556` deja de saltar mientras haya plantillas. La plantilla de `page.headers`
  de SDD-84 ya lleva `trusted-types fudic`.

### 4.8. Las piezas

`dom/template` es una pieza nueva del runtime (SDD-45). Importa `dom/trusted`, que es frontera porque
tiene estado. Entra en el presupuesto del manifiesto como las demás.

### 4.9. Lo que se va

- El cuerpo «fabricar» del emisor del cliente y los helpers que solo usaba él.
- La composición de clases con `filter(Boolean).join(' ')`, en el servidor y en el cliente.
- El comentario «Never `cloneNode`» de la adopción, que deja de ser verdad para crear: adoptar sigue
  sin usar `cloneNode`, `querySelector` ni índices.

---

## 5. Invariantes

- **Crear es clonar y adoptar.** Ningún `c` del navegador construye un elemento con
  `$dom.element(…)`. El único sitio que crea elementos a mano es `live()` con el host de un hijo,
  como hoy.
- **Lo que crea el navegador es lo que pinta el servidor.** Para los mismos datos, el árbol de un `c`
  y el del HTML del servidor, parseado, son iguales nodo a nodo, salvo el orden de las clases y de los
  atributos (§4.5, §4.6, §8.2 decisión 22) y el `class=""` residual.
- **La plantilla no lleva datos.** Ningún valor dinámico se escribe en un literal.
- **`template` solo acepta literales.** Un string que no viene de un literal es `TypeError`.
- **Una sola policy**: la `fudic` de SDD-84.
- **Una clase dinámica solo toca sus tokens.** Ningún camino escribe el atributo `class` entero
  después de crear el elemento.
- **Un recorrido**: plantilla, adopción y enganche salen del mismo paseo por el AST.
- **Cobertura.** Todo fichero nuevo al 100 % en las cuatro métricas, con umbral por fichero en
  `compiler` y `vite`. `dom`, `ssr`, `core` y `testing` siguen al 100 %.

---

## 6. Criterios de aceptación

**La prueba de Pedro**

1. `examples/basic` en `vite preview`, con la plantilla de `page.headers` (Trusted Types activo):
   abrir y cerrar los bloques de `/vivo`, añadir y reordenar filas, abrir el formulario que aparece
   desde un `@if` y enviarlo, y la consola sin ningún error de Trusted Types ni de CSP.

**La plantilla**

2. Un componente con elementos, atributos estáticos y dinámicos, un tramo `Hola @(nombre)`, dos
   tramos interpolados seguidos, un `@if` y un hijo: la plantilla tiene los estáticos, el tramo
   `Hola `, el comentario separador, nada del `@if` y el host del hijo vacío.
3. Ningún valor de un atributo dinámico, de un texto interpolado ni de un `.prop` aparece en ninguna
   plantilla de `examples/basic`.
4. `<textarea>`, `<title>`, un `<script type="application/json">` y un `<template>` del autor salen
   en la plantilla como los escribe el servidor.
5. Un texto estático con `` ` ``, `${` y `\` sale bien en el DOM creado.
6. Un `@if` dentro de un `<svg>` crea sus nodos con el espacio de nombres SVG
   (`namespaceURI === 'http://www.w3.org/2000/svg'`).
7. El código de navegador de los componentes y rutas de `examples/basic` no contiene
   `$dom.element(` salvo la creación de hosts para `live`, ni `filter(Boolean)`.

**Crear igual que el servidor**

8. **Equivalencia.** Para cada fixture de `packages/compiler/fixtures` con controlador de cliente y
   para cada componente de `examples/basic`, con sus props de ejemplo: el árbol que crea `c` y el del
   HTML del servidor parseado son iguales nodo a nodo (tipo, nombre, espacio de nombres, atributos y
   texto), con las excepciones de §5. Con todos los bloques abiertos y con todos cerrados.
9. Un tramo dinámico que vale `''` al crear y luego `'x'` se ve `x`, en su sitio.
10. Una fila de `@foreach` con clave creada en el navegador se mueve al reordenar y conserva sus
    listeners y su estado.
11. Un formulario creado desde un `@if` valida, muestra sus errores y envía, igual que uno pintado
    por el servidor.
12. Un `@await` creado en el navegador pasa por sus ramas como uno pintado por el servidor.
13. `mount` de `@fudic/testing` sigue montando todos los componentes de `examples/basic` y sus tests
    pasan sin cambios.
14. Un hijo dentro de una plantilla se levanta con sus props y con su propia plantilla.

**Trusted Types**

15. `template` con un string que no es un literal, o con un literal con huecos, lanza `TypeError`.
16. Con `require-trusted-types-for 'script'` y `trusted-types fudic`, crear cualquier bloque no da
    ninguna violación. Sin `fudic` en `trusted-types`, el build da `FUD1545` nombrando la policy de
    fudic.
17. Una página sin bloques que se abran no crea la policy (`trustedTypes.getPolicyNames()` no incluye
    `fudic` si nada más la pidió).
18. Un navegador sin `trustedTypes` crea igual.

**Las clases**

19. `class="panel"` sale como `setAttr(…, 'class', 'panel')` en el servidor y dentro de la plantilla en
    el cliente.
20. Con `class="card" class:activo=@x`, una clase `extra` añadida con `classList.add` desde un `ref`
    sigue ahí después de cambiar `@x` varias veces.
21. Lo mismo con `class=@expr`: al cambiar de `'a b'` a `'b c'` se quita `a`, se pone `c`, y `extra`
    sigue.
22. Lo mismo con la `class` de un spread en un elemento sin `class` propia.
23. `class="activo" class:activo=@x` con `@x` falso: el elemento no tiene `activo`, ni en el servidor
    ni al crear.
24. El orden en el servidor y al crear es: estáticos, `class=@expr`, `class:` activos en orden de
    fuente.
25. En el servidor, un elemento con todos sus `class:` falsos y sin clase estática no tiene atributo
    `class`.
26. Hidratar un elemento con `class:` no escribe nada hasta el primer cambio.

**Cierre**

27. `pnpm typecheck`, `pnpm build`, la cobertura de los paquetes tocados al 100 % en lo nuevo, y los
    e2e de `examples/basic` y del banco en verde.

---

## 7. Fuera de alcance

Nada.

---

## 8. Decisiones

### 8.1. Tomadas al redactar

1. **Crear es clonar una plantilla y adoptarla** (Pedro). Sustituye a la idea de mandar el `c` raíz a
   un chunk perezoso (IDEA-08 §1.3): con la plantilla el `c` pesa poco, y se va un camino entero en
   lugar de esconderlo.
2. **Sin chunk perezoso** (Pedro). El `c` solo se ejecuta cuando un bloque fabrica algo, y la
   plantilla viaja con el componente.
3. **La misma policy `fudic`** de SDD-84, no una nueva. Dos `createPolicy('fudic')` lanzan con la
   directiva activa, y una segunda policy sería una segunda puerta para HTML.
4. **Un literal etiquetado y no un string.** Es lo que impide que `template` se use con datos. La misma
   defensa que usa Lit.
5. **Ningún diagnóstico nuevo para la CSP.** La necesidad la declara el chunk (`paintsHtml`) y
   `FUD1545` ya avisa. Lo que la IDEA llamaba «directiva propia» ya estaba hecho.
6. **La plantilla es el estado vacío del servidor**, con los bloques cerrados, y se abren con su `c`.
   No se intenta adivinar en el compilador qué ramas estarán abiertas.
7. **Los hijos, como hosts vacíos.** Un shadow root no se clona sin `clonable`, y cada hijo ya tiene
   su plantilla.
8. **`escapeText` y `escapeAttr` a `@fudic/dom`.** El compilador no puede depender de `@fudic/ssr` en
   ejecución, y copiarlos sería abrir la puerta a que el servidor y la plantilla escapen distinto.
9. **`class:` gana al estático del mismo token, sin diagnóstico.** No rompe nada; es la lectura más
   natural («este token depende de `@x`»).
10. **`class=@expr` también por tokens**, no solo `class:`. La decisión 22 dice que es un string, y lo
    sigue siendo; lo que cambia es que escribirlo no borra lo ajeno. Una sola regla para las tres
    formas: nadie pisa el atributo entero.
11. **El orden de clases y atributos de spread puede diferir** entre servidor y navegador. No se paga
    código por algo que ni el DOM ni el CSS ven.
12. **`class=""` residual, aceptado.** Quitarlo costaría un `removeAttribute` condicional en cada
    cambio, para nada.
13. **Las props reflejadas (IDEA-08 §4) se quedan fuera** (Pedro).
14. **La plantilla viaja en el JS, no en la página** (Pedro, 2026-11-16). Se estudió emitir en el
    documento un `<template>` solo para los componentes que pueden crearse en el navegador. Sin
    `innerHTML` y con menos plantillas, pero sale peor por cuatro motivos:
    - el HTML de la página viaja en cada navegación, mientras que el chunk se cachea una vez;
    - las plantillas de los bloques las necesita casi todo componente que hidrata;
    - la policy `fudic` sigue haciendo falta por `@raw`, los formularios y el registro del SW;
    - obliga a saber qué crea cada página, con un plan B si falla, y a que `mount`, el servidor y el
      SW inyecten las plantillas.

    Si el peso de las plantillas raíz que no se usan llega a importar, se recorta en el build (emitir
    solo las de los componentes que algún bloque de la app crea), sin tocar la página.

### 8.2. Tomadas al implementar

1. **Una función pura para las clases, como `attrsDiff`.** `classDiff(next, prev)` y `classTokens`
   viven en `@fudic/dom` y los aplican los dos adaptadores. `attrsDiff` devuelve la `class` del
   spread aparte (`class: { remove, add }`) y ya no la mete en `set` / `remove`.
2. **En `SsrDom` la lista es el propio atributo `class`**, no un conjunto aparte en el nodo: se
   parte, se cambia y se reescribe, y sin tokens se borra. Así `setAttr(el, 'class', …)` estático y
   los `class:` comparten un solo sitio y el orden sale solo (§4.5, regla 2).
3. **La `class` de un spread en el servidor va en su sitio por nombre**, como el resto de atributos
   del spread (SDD-61 §3.8): un backend que pinta el spread desde el tipo escribe el mismo HTML.
4. **El navegador no llama a `classList.add()` / `remove()` sin tokens.** En un elemento con clase,
   `add()` vacío reescribe el atributo y es una mutación que todo observador ve para nada. De paso,
   happy-dom (que crea `class=""` con cualquier llamada) da el mismo árbol que un navegador.
5. **`template` comprueba también `Array.isArray(strings.raw)` y que el texto se pueda cocinar.**
   `Object.freeze(['…'])` es un array congelado de longitud 1 sin ser un literal, y un string de un
   carácter también pasa `length === 1` y `isFrozen`.
6. **El espacio de nombres MathML se prueba en el navegador.** happy-dom parsea `<math>` como HTML;
   en los tests unitarios se prueba que `templateIn` quita el envoltorio, y el espacio de nombres SVG.
7. **Deuda saldada de paso:** `@fudic/ssr` tenía umbrales 95/95/90 y sin `coverage.include`; ahora
   100 en las cuatro métricas con el denominador anclado al paquete. `@fudic/testing` tenía su copia
   del escape y ahora usa la de `@fudic/dom`.
8. **`swapClass` toma el valor sin convertir** (fase 2). `class=@expr` pasa su valor como lo hace
   un `attr=@valor` solo, y `classText` decide en `@fudic/dom` qué texto escribe: la misma regla
   que la `class` de un spread, en un solo sitio. Si no, el compilador tendría que emitir la
   conversión en cada elemento, y `false` acabaría como la clase `"false"`.
9. **`toggleClass` del navegador solo escribe si cambia algo** (fase 2). Por lo mismo que la
   decisión 4: el primer pase de un elemento creado apaga todos los `class:` que están en falso, y
   happy-dom creaba `class=""` donde un navegador no toca la lista.
10. **Cada forma de `class` se escribe en su sitio** (fase 2). La clase estática va donde la
    escribió el autor, como en la plantilla; `class=@expr` también, con sus `class:` justo detrás;
    sin `class=@expr`, los `class:` van al final. Antes la composición ponía `class` siempre la
    última: la fila `c-corte` de la suite de conformidad cambia (`<a class="catalogo" href>`).
11. **La regla 5 se cumple también en los cambios** (fase 2). Cuando el swap se ejecuta, olvida lo
    que escribieron los `class:` de su elemento, que van justo detrás y se vuelven a aplicar en el
    mismo pase: si `class=@expr` quita un token que un `class:` activo pide, vuelve a ponerse.
12. **La etiqueta de apertura de `<html>` y de un elemento del `<head>` interpolado se escribe con
    el `SsrDom` de verdad** (fase 2): `io.createDom()`, los atributos con el mismo código y el
    primer trozo de `io.serialize`. Antes era un `$dom` falso de un método, que no tenía
    `toggleClass` / `swapClass` ni `setAttrs`, y repetía a mano las reglas de clases.
13. **Deuda saldada de paso** (fase 2): `hasValueAttrs` no lo usaba nadie y se borra; el script de
    goldens del compilador no regeneraba `app-calendar`.
14. **La plantilla es un cuarto cuerpo del mismo emisor** (fase 3). Cada recorrido del cliente (la
    raíz de un componente, cada rama o cuerpo de bloque) lleva su `TemplateHtml`, que recibe un
    hecho por llamada —abrir, atributo literal, texto, comentario, cerrar— y serializa con las
    reglas del servidor (escape de `@fudic/dom`, elementos vacíos, texto crudo de `<script>` y
    `<style>`). Los atributos literales llegan desde `writeElementAttrs` por un `LiteralSink`: en
    fase 3 escribe además el `setAttr` del cuerpo de fabricar; en fase 4 solo la plantilla.
15. **Una URL de asset estática no va en la plantilla** (fase 3). Con el enlazador activo,
    `src="./logo.png"` es una referencia al import que resuelve Vite, un valor del módulo y no un
    texto: se escribe en el paso 3 como cualquier valor.
16. **El host de un hijo lleva su DOM ligero** (fase 3). «Vacío» en §4.1 es sin
    `<template shadowrootmode>`: lo que el autor escribe dentro del host son nodos de este
    componente, el servidor los pinta y la adopción entra en ellos.
17. **«Script de datos» es el de la decisión 129: `application/ld+json` e `importmap`** (fase 3).
    `application/json` no lo es para fudic: el servidor lo deja vacío y la plantilla también, así
    que el criterio 4 se cumple igual. §4.1 decía `application/json` por error.
18. **Plantillas iguales, una constante; plantilla vacía, ninguna** (fase 3). Dos trozos con el
    mismo HTML en el mismo espacio de nombres comparten `$TN`, y un cuerpo sin nodos propios (solo
    bloques, o solo un texto dinámico que crea `textAt`) no declara ninguna.
19. **Importadas como `$template` y `$templateIn`** (fase 3). Las constantes viven en el ámbito del
    módulo, donde también están los imports del autor: un `template` suyo chocaría. La reserva `$`
    del emisor lo evita.
20. **El espacio de nombres sigue los puntos de integración del parser** (fase 3): los hijos de
    `foreignObject`, `desc` y `title` de SVG, y de `mi`, `mo`, `mn`, `ms` y `mtext` de MathML, son
    HTML, y un bloque ahí va con `template` sin envoltorio.
21. **Deuda saldada de paso** (fase 3). Los goldens del compilador se fijan con
    `toMatchFileSnapshot` y se regeneran con `vitest run test/emit/golden.test.ts -u`: el script
    `scripts/goldens.ts` pedía `tsx`, que no es dependencia de nadie, y repetía la lista de
    componentes. Dos claves de `di-diagnostics.ts` y `expand.ts` llevaban un NUL literal (ahora
    `\u0000`); la regla de `CLAUDE.md` sobre LS/PS llevaba los dos caracteres literales en vez de su
    escape; y `owned.test.ts` tenía un `…` en Windows-1252, que no es UTF-8.
22. **El orden de los atributos no se compara** (Pedro, 2026-11-16, al cerrar la fase 3). La
    plantilla trae los atributos estáticos y el paso 3 escribe los dinámicos después, así que en un
    elemento creado en el navegador todo atributo dinámico queda detrás de los estáticos, no solo
    los de un spread (§4.6). Es lo mismo que las clases: ni el DOM ni el CSS lo ven. La prueba de
    equivalencia (criterio 8) compara los atributos como conjunto de nombre y valor.
23. **El clon se importa, no se clona** (fase 4). `template` devuelve
    `document.importNode(content, true)` y no `content.cloneNode(true)` (§3.1): un clon de
    `content` pertenece al documento inerte del `<template>`, donde ningún elemento personalizado
    se mejora, y un hijo creado ahí no se podría levantar con `live` hasta que algo lo moviera a la
    página. Importado, nace en el documento de la página.
24. **La adopción se escribe dos veces en el mismo recorrido** (fase 4). El cuerpo de fabricar se
    sustituye por `create`, que recibe línea a línea la misma adopción que `h` salvo en tres
    sitios: los bloques se crean (`c` + `s`) en su sitio del recorrido —así un `@{ }` sigue
    evaluándose donde está (SDD-51 §3.8)— y se montan con su ancla cuando el nivel ya está
    adoptado (al final del nivel, o en el `m` del bloque si están en su raíz); el `$w` que `h`
    siembra para un spread, `class=@expr` y `@raw` no se siembra; y el texto que se funde se crea
    (decisión 25). Es el «parámetro del recorrido» de §4.3, hecho cuerpo. El componente ya no
    tiene `$r` ni `$m`: el clon entra entero en el shadow root.
25. **El texto que comparte trozo con otro texto lo crea el `c`, no la plantilla** (fase 4;
    **sustituida por la decisión 34**: ningún texto comparte ya trozo con otro). En un
    trozo de un nivel (lo que hay entre dos elementos, o entre un elemento y el marcador) con dos
    o más tramos, lo único que los separa es un bloque o un `@{ }`, y ninguno es nodo de la
    plantilla: cerrados, los dos textos serían un solo nodo y el bloque, al abrirse, caería al
    lado y no entre ellos. Esos tramos no van en la plantilla y el `c` los crea en su sitio. Un
    tramo solo en su trozo va en la plantilla y se encuentra como siempre. Matiza la fila «tramo
    de texto» de la tabla de §4.1.
26. **Un comentario del autor no corta un tramo de texto** (fase 4, deuda saldada). `<!-- -->` y
    `@* *@` no pintan nada en ninguna rama, así que el texto de sus dos lados es un solo trozo del
    HTML; tratarlos como frontera hacía dos tramos que escribían el mismo nodo, y el segundo
    perdía su texto (`vista-tareas`: `" Una  "` acababa `" Una "`). Arreglado en `runs.ts`, que
    usan las dos ramas.
27. **El cuerpo de un bloque sin nada que clonar no tiene fragmento** (fase 4). Sin plantilla
    (decisión 18), sus textos se crean sueltos en `$r` y `m` los coloca; se decide antes del
    recorrido, con los mismos items que escriben la plantilla.
28. **Un control creado lleva su valor por defecto como lo pinta el servidor** (fase 4).
    `DomClient` gana `setDefault(el, name, value)`: `checked`/`selected` presentes o ausentes, el
    atributo `value` de un `<input>`, el texto de un `<textarea>` y el `selected` de la `<option>`
    que elige el valor de un `<select>`. El `c` lo llama una vez, tras los hijos del control (las
    opciones pueden venir de un bloque); `setLive` sigue escribiendo solo el estado (SDD-74). Es
    el caso del `<option selected>` que anunciaba el relevo de la fase 3.
29. **`live` guarda lo que el padre entrega mientras se descarga la definición** (fase 4, fallo
    previo). Un hijo creado cuya etiqueta aún no está definida no tiene `u`, y el `$s` del padre
    lo llamaba: `TypeError`. Ahora `live` le pone un `u` provisional que acumula los valores y lo
    levanta con ellos.
30. **`@fudic/testing` crea como un navegador** (fase 4). En `mount(…, { via: 'client' })` se
    instala el runtime de la página (si no, ningún hijo creado se levantaba), y
    `customElements.upgrade` —que en happy-dom no hace nada— mejora en sitio, como ya hacía
    `define`.
31. **La equivalencia de `examples/basic` vive en el ejemplo** (fase 4). El criterio 8 sobre los
    fixtures está en `compiler/test/emit/create-equivalence.test.ts`, con formas sintéticas de
    texto, marcador, SVG, `<select>`, clases, spreads, hijos, `@raw` y scripts de datos; sobre los
    componentes del ejemplo, en `examples/basic/src/create-equivalence.test.ts`, donde sus módulos
    resuelven, montando cada uno por los dos caminos y comparando también los shadow roots de sus
    hijos. Los componentes que solo viven dentro de otro (un control de su formulario, una señal
    suya) se comparan dentro de él. `di-owner` y lo que inyecta quedan fuera: un dueño de servicio
    creado en el navegador no tiene contenedor (SDD-38 §4.5), con el `c` viejo igual.
32. **Source maps** (fase 4). La constante de cada plantilla apunta a su trozo de vista y cada
    línea del `c` al elemento, texto o bloque que la genera (`here(at)` de `writer.ts`).
33. **Deuda saldada de paso** (fase 4): el `setAttrs` «en su sitio» del cliente sobraba (el orden
    no se compara) y se va; el compilador queda sin imports ni parámetros muertos
    (`--noUnusedLocals --noUnusedParameters` limpio, `src` y `test`).
34. **Ningún texto del HTML toca a otro** (Pedro, 2026-11-16, antes de la fase 5; arregla un fallo
    previo de la hidratación). El HTML no guarda dónde acaba un texto y empieza otro: con un bloque
    cerrado entre `Hola ` y ` adiós`, el navegador recibe un solo nodo, y al abrirse el bloque la
    página quedaba `<b>…</b>Hola adiós` o perdía texto. El servidor, la plantilla y el cliente
    escriben un comentario vacío, con una regla única en `marker.ts`: tras un tramo al que siguen
    bloques o `@{ }` si detrás viene otro tramo o uno de esos bloques puede empezar con texto; y al
    final del cuerpo de un bloque que acaba en texto si detrás de él puede venir texto (su fila
    siguiente, otro bloque, un tramo, o lo que sigue al nivel: un hueco de layout cuenta como que
    sí). Con eso el cliente busca los textos **hacia atrás**, cuando el nivel ya está adoptado:
    cada uno es el nodo de delante del siguiente, desde el final del padre; cada bloque tiene un
    `t($e)` que encuentra los suyos y dice dónde empieza. `m` coloca las raíces en el orden del
    fuente. Sustituye a la decisión 25 y a la regla de «un solo marcador, entre dos tramos
    interpolados» de SDD-30 §3.4. Prueba: `hydrate/text-between-blocks.test.ts`, 18 formas,
    hidratando y creando, contra el HTML del servidor en cada cambio de estado.
35. **Lo que declara un `@{ }` lo ve todo lo que viene detrás, también en el cliente** (Pedro,
    2026-11-16, antes de la fase 5; fallo previo). El servidor escribe la vista en una función; el
    cliente, en `c`, `h` y `u`, y un bloque es una función de al lado: `@{ let x = … }` seguido de
    `@if (on) { @x }` lanzaba `x is not defined` al crear. Ahora la declaración sube al cierre
    (`let x;`, junto a los bloques) y cada cuerpo la deja en su sitio como asignación
    (`hoist.ts`); un patrón va entre paréntesis y sin su tipo. Solo las declaraciones de primer
    nivel del `@{ }`: un bloque `{ }` del autor dentro sigue siendo suyo. Prueba:
    `hydrate/inline-scope.test.ts`.
36. **Un dueño de servicio creado en el navegador da su contenedor a su vista** (Pedro, 2026-11-16,
    antes de la fase 5; fallo previo, y matiza SDD-38 §4.5, que daba la raíz a todo lo creado en
    el navegador). El navegador sigue la cadena del servidor: la VISTA que pinta un host, no el
    DOM donde está, hasta el primer dueño (`core/hydrate/scope.ts`). `live(host, props, $shadow)`
    apunta quién creó cada host (el clon de un bloque es un fragmento, fuera de todo árbol); un
    host pintado está en la vista del host de su shadow root; el servidor escribe en el host de
    cada dueño su nodo del árbol de la página (`data-fud-ioc`). Un componente que inyecta y no
    trae nodo en su payload resuelve con `scopeOf`; un dueño cuyos proveedores corren en el
    navegador, creado aquí, abre con `ownScope` un contenedor hijo del de su vista y lo llena con
    el `register` de su módulo IoC (importado de `./<fichero>.fud?ioc`). `containerOf` acepta ya
    un contenedor. `di-owner`, `di-panel` y `di-badge` entran en la prueba de equivalencia del
    ejemplo, más una que comprueba que el panel y la insignia ven el mismo `Cart`.
