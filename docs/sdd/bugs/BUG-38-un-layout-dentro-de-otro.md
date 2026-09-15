# BUG-38 · Un layout dentro de otro: dos páginas que nadie sabía componer

> **Estado:** `Hecho`
> **Corrige:** [SDD-21](../SDD-21-layout.md) decisión 87, y lo que de ella colgaba en
> [SDD-40](../SDD-40-props-de-layout.md) §4.8
> **Paquetes:** `@fudic/compiler`, `@fudic/cli`, `@fudic/vite`, `@fudic/language-server`
> **Rango:** reserva **`FUD0439`**, el último libre del tramo que SDD-12 da a SDD-21
> (`FUD0420`–`0439`). **Retira `FUD0422` y `FUD0703`**, que solo podían hablar de una cadena

---

## 1. Contexto y síntoma

No hubo síntoma. Ese es el punto de partida de este documento y la razón de que se escriba
como se escribe.

La decisión 87 de SDD-21 dice, entera:

> **Anidamiento sin caso especial:** un layout con `<link rel="layout">` se compila con la
> misma pieza — el layout externo recibe como `route` los slots del interno. La cadena se
> resuelve en `resolveDocument`.

Tres líneas que conceden una capacidad grande, y ningún sitio donde se diga qué significa.
Pedro la encontró al preguntar por un fallo de editor que SDD-40 había destapado, y la
pregunta que hizo es la que este BUG contesta:

> «No veo que una página tenga dos doctype, por tanto eso es algo que alguien se comió por
> el camino. Lo que no es sencillo es aplicar qué algoritmo utilizamos para colisiones del
> head, body y main. Eso es lo que no veo por ningún sitio.»

No se ve por ningún sitio porque no existe. **Un layout es una página entera** — SDD-21
§3.3 lo tipa así: `doctype`, `html`, `head` y `body` son campos **obligatorios** de
`LayoutDocument`, y el rol se reconoce por esa forma más un `@RenderBody()`, nunca por el
nombre del fichero. Encadenar dos layouts es, por tanto, encadenar dos páginas completas, y
eso plantea preguntas que nadie contestó:

| La pregunta | La respuesta que había |
|---|---|
| ¿Qué `<!DOCTYPE html>` sale? | El del externo. El del interno **no se emite**. |
| ¿Qué atributos de `<html>` ganan? | Los del externo. Los del interno **se tiran enteros**. |
| ¿Qué atributos de `<body>` ganan? | Igual: los del interno se pierden sin rastro. |
| ¿Y dos `<title>`, dos `<meta charset>`? | **Salen los dos.** El `<head>` se concatena, sin fusión de ninguna clase. |
| ¿Y dos `<main>`? | Uno dentro del otro. `<main>` no existe como concepto en el compilador. |

Las cuatro primeras filas no son decisiones de composición: son un descarte. El autor del
layout interno escribía una página y el compilador se quedaba con **dos fragmentos** — los
hijos de su `<body>` y el contenido de su `<head>` — tirando todo lo demás, en silencio y
sin diagnóstico.

El único aviso que el sistema daba era **falso y sobre otra cosa**: en el editor, una ruta
bajo un layout anidado que declarase `@section nav` recibía
`TS2345 · No se puede asignar un argumento de tipo "nav" al parámetro de tipo "never"`,
porque la proyección de SDD-23 resolvía `$Sections` mirando **un** eslabón mientras el build
miraba la cadena entera. El build era correcto y el editor mentía. Ese defecto **no se
arregla en este BUG: desaparece con él**, que es la diferencia entre quitar una
contradicción y taparla.

### 1.1. Por qué llevaba dos SDD sin dar la cara

Porque nadie había escrito una ruta bajo un layout anidado. La capacidad estaba desde
SDD-21, el ejemplo no la usaba, y SDD-40 —props de layout— fue lo primero que necesitó un
segundo eslabón, para enseñar la diferencia entre una prop con default y una requerida. En
cuanto se escribió, salieron **dos** defectos el mismo día: este y el de BUG-31 §T1, que
tiene la misma raíz — un layout anidado no reenviaba `route.runtime()` a su padre, así que
**toda** ruta bajo uno moría al prerenderizar con `route.runtime is not a function`.

Dos defectos en el primer uso real de una capacidad de dos specs de antigüedad es el dato
que decide el arreglo. No son dos casos que se escaparon: son lo que aparece al estrenar una
composición que nunca se diseñó.

---

## 2. Causa raíz

La rama `nested` de `buildLayoutModule` ([`layout.ts`](../../../packages/compiler/src/emit/layout.ts)),
que era el descarte entero escrito en código. El layout externo iba por el `else` y emitía
`<!DOCTYPE html>`, el open tag de `<html>`, los atributos del `<body>` y el `</html>`; el
interno no emitía nada de eso y mandaba sus dos fragmentos hacia arriba.

Lo que hace que esto sea un defecto de **diseño** y no un olvido de implementación es que no
hay forma de arreglarlo escribiendo el algoritmo que falta. Las preguntas de la tabla de §1
no tienen respuesta buena:

- **El doctype** no admite fusión: o sale uno, o sale el otro. Elegir es arbitrario.
- **`<html lang>`** escrito en los dos es una contradicción del autor, no un solape que
  resolver: la página está en un idioma.
- **El `<head>`** tendría que fusionarse por reglas por elemento — un `<title>` sustituye,
  un `<meta charset>` no se repite, un `<link rel="icon">` sustituye, un `<script>` se
  acumula — y eso es una especificación entera, con su tabla, sus casos y sus diagnósticos,
  para una capacidad que nadie pidió.

Así que la corrección no es componer mejor: es **no permitirlo**. Lo que se pierde es la
herencia de shell entre layouts; lo que se gana es que un layout signifique una cosa.

### 2.1. Dónde va la regla, y por qué esa es la única voz

En `buildLayout` ([`structure.ts`](../../../packages/compiler/src/document/structure.ts)),
la pasada de estructuración. La decisión es **puramente local** — «este documento es un
layout y trae un `<link rel="layout">`» se contesta sin leer el disco —, y de ahí se sigue
lo que pedía Pedro: que el diagnóstico salga **en el build y en el editor** sin escribirlo
dos veces. El build ya recoge los diagnósticos de `structure`, y
[`fudicDiagnostics`](../../../packages/language-server/src/services/compiler-diagnostics.ts)
reenvía `document.diagnostics` tal cual al editor, con el comentario que explica por qué:

> *«an error the CLI reports and the editor does not — or the other way round — is the
> failure mode this function exists to prevent.»*

Una regla, un sitio, las dos superficies.

### 2.2. La degradación, que es la mitad del arreglo

El parser no lanza: emite el diagnóstico y sigue. Aquí «seguir» significa una cosa concreta
y elegida — **el fichero degrada al layout raíz que ya aparenta ser**:

- Se emite `FUD0439` sobre el `<link>`.
- **No se le pone `layoutHref`.** Sin href no hay padre, así que nada aguas abajo compone
  dos shells: el fichero se emite con su propio doctype, su `<html>` y su `<body>`, que es
  exactamente lo que el autor escribió.
- **Sí se conserva `layoutLink`** en el nodo, y solo para que el emit lo siga saltando al
  escribir el `<head>`. Sin eso, el `<link rel="layout">` acabaría en el HTML servido.
- **No se valida el `href`.** `FUD0436` sobre un link que hay que borrar de todos modos
  sería una segunda voz sobre un único error.

### 2.3. Lo que la regla se lleva por delante

Retirar la cadena deja **inalcanzable** todo lo que existía para recorrerla. No se marca con
`ignore`: se quita, que es lo que dice la regla de cobertura del repo — si una rama no se
puede provocar, o sobra código o falta un test.

| Retirado | Por qué ya no puede ocurrir |
|---|---|
| La rama `nested` de `buildLayoutModule` | Ningún layout delega en otro |
| `layoutParent`, `inheritedProps` | No hay ancestros que buscar |
| El bucle de cadena de `resolveDocument` | Un paso, no un recorrido |
| **`FUD0422`** (ciclo de layouts) | Un ciclo necesita dos ficheros que apunten; solo apunta la ruta |
| **`FUD0703`** (SDD-40 §4.8) | Comparaba el mismo nombre en dos eslabones de un namespace compartido. Un layout no tiene con quién discrepar |
| `ResolvedLayout.parentHref`, `LayoutDocument.layoutHref` | Nada los puebla |
| `collectSections` de la CLI, como recorrido | Las secciones son las del layout elegido |

`FUD0422` y `FUD0703` quedan **retirados y no reutilizados**, documentados en su sitio igual
que `FUD0437` lo está desde SDD-40 §3.1.

---

## 3. Interfaz pública

```ts
// @fudic/compiler — document/nodes.ts
export interface LayoutDocument extends Node {
  // …
  /**
   * Un `<link rel="layout">` que este layout no debía declarar (FUD0439). Se reporta y se
   * conserva aquí y en ningún sitio más: el emit lo lee solo para saltárselo. NO hay
   * `layoutHref` a su lado, y esa ausencia es la degradación entera.
   */
  readonly layoutLink?: ElementNode;
}

// @fudic/compiler — emit/resolve.ts
export interface ResolvedLayout {
  readonly path: string;
  readonly source: string;
  readonly doc: LayoutDocument;
  readonly deps: readonly string[];
  // `parentHref` retirado
}

export interface DocumentGraph extends ComponentGraph {
  /** El layout de la entrada: COMO MUCHO UNO. Vacío para todo lo que no sea una ruta. */
  readonly layouts: readonly ResolvedLayout[];
}

// @fudic/compiler — emit/layout-code.ts
export function layoutCodeOf(source: string, doc: LayoutDocument): LayoutCode;
//  el tercer parámetro (`inherited`) se retira con FUD0703

// @fudic/language-server — mode.ts
/** El href del `<link rel="layout">` de esta RUTA, o '' cuando no hay ninguno que tener. */
export function layoutHrefOf(document: StructuredDocument): string;
```

`DocumentGraph.layouts` **sigue siendo una lista** de como mucho un elemento. Sus tres
lectores —el orden de componentes, las secciones huérfanas y el emit— ya la leen como lista,
y un campo singular les costaría una reescritura a cambio de nada.

---

## 4. Comportamiento corregido

| Entrada | Antes | Ahora |
|---|---|---|
| Layout con `<link rel="layout">` | Se compila como delegación; su shell se descarta en silencio | **`FUD0439`** sobre el `<link>`, en build y en editor |
| Ese mismo fichero, emitido | Sin doctype, sin `<html>`, sin `<body>` propios | Su shell entero, como cualquier layout |
| Ruta bajo un layout anidado con `@section` | `TS2345 … "never"` falso en el editor | Sin falso positivo: el layout directo es la respuesta completa |
| Ruta bajo un layout anidado, al prerenderizar | `route.runtime is not a function` (BUG-31 §T1) | No existe el caso |
| Dos layouts apuntándose entre sí | `FUD0422`, cadena cortada | Dos `FUD0439`, cada uno en su fichero |
| Ruta apuntándose a sí misma | `FUD0422` | `FUD0435`: no apunta a un layout |
| `fudic g page --layout <uno anidado>` | Declaraba también las secciones heredadas | Solo las del layout elegido, y `FUD0439` en los diagnósticos del plan |

---

## 5. Invariantes

1. **Un layout es una página completa y no se compone con otra.** Solo una ruta nombra un
   layout, y nombra exactamente uno.
2. **Una voz por hecho.** `FUD0439` se emite en `structure` y llega al build y al editor por
   el mismo camino que el resto. No hay una segunda comprobación en el servidor.
3. **El parser nunca lanza.** Un layout con link degrada a layout raíz: el error se dice y
   el fichero sigue compilando como lo que parece.
4. **Sin código inalcanzable.** Lo que solo servía a la cadena se retira; no se silencia.
5. **Un código retirado no se reutiliza.** `FUD0422` y `FUD0703` quedan documentados como
   tales en el sitio donde estaban.

---

## 6. Criterios de aceptación

1. **La regla.** Un layout con `<link rel="layout">` ⇒ `FUD0439`, anclado sobre el `<link>`
   entero. — `compiler/test/document/route.test.ts`
2. **La degradación.** Ese documento sigue siendo `layout-document`, conserva `layoutLink` y
   **no** tiene `layoutHref`. — `compiler/test/document/route.test.ts`
3. **Una sola voz.** Un `href` interpolado en ese link da `FUD0439` y **no** `FUD0436`. —
   `compiler/test/document/route.test.ts`
4. **Un paso, no un recorrido.** `resolveDocument` sobre una ruta cuyo layout declara otro
   devuelve **un** layout, no lee el tercer fichero y no reporta aquí el `FUD0439` ajeno. —
   `compiler/test/emit/layout.test.ts`
5. **No hay ciclo posible.** Dos shells apuntándose devuelven un layout y ningún
   diagnóstico de cadena; una ruta que se apunta a sí misma da `FUD0435`. —
   `compiler/test/emit/layout.test.ts`
6. **El emit degradado.** El módulo de ese layout contiene `<!DOCTYPE html>`, no contiene
   `parentLayout` y no filtra el `rel="layout"` al HTML. — `compiler/test/emit/layout.test.ts`
7. **Sin herencia de props.** Dos layouts que declaran el mismo nombre con distinto tipo no
   producen diagnóstico; el layout toma solo sus nombres. — `compiler/test/emit/layout-props.test.ts`
8. **La profundidad del walk.** Un layout que anida su `@RenderBody()` dos niveles produce
   los mismos `$lc0/$lc1/$lc2` que producía la cadena de dos ficheros. —
   `compiler/test/emit/route-client.test.ts`
9. **La CLI.** `g page --layout` declara las secciones del layout elegido y no las de nadie
   más, y sube `FUD0439` como diagnóstico del plan. — `cli/test/page.test.ts`
10. **El editor.** `layoutHrefOf` es `''` para un layout que declara el link: la proyección
    no tiene de dónde importar `$Sections`. — `language-server/test/mode.test.ts`
11. **El ejemplo compila.** `examples/basic` construye sin `FUD0439`, con
    `_layout-articulo.fud` convertido en layout autónomo.
12. **Cobertura.** Ningún paquete baja de su umbral y no se añade un solo `ignore`.

---

## 7. Fuera de alcance

- **La fusión de `<head>` por elemento** — la tabla de §2 con `<title>`, `<meta charset>`,
  `<link rel="icon">` — no se especifica aquí. Si algún día se quiere compartir shell entre
  layouts, ese es el documento que hay que escribir **antes**, y no se escribe ahora porque
  nadie ha pedido la capacidad.
- **El `<main>`** sigue sin ser un concepto del compilador. Es markup del autor.
- **`FUD0721`** (`<link rel="component">` sin usar) sigue avisando en
  `examples/basic/src/components/app-card.fud`. Es anterior, ajeno a este BUG y no se toca.
- **La duplicación de shell entre `_layout.fud` y `_layout-articulo.fud`** en el ejemplo es
  ahora visible y es **el precio correcto**: dos formas de página se escriben dos veces. Si
  molesta, lo que falta es un mecanismo de reutilización que no sea encadenar páginas.
