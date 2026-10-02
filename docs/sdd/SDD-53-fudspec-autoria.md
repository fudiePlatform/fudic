# SDD-53 — Escribir una `.fudspec` sin saberse el lenguaje: CLI, editor y formateador

> **Estado:** `En curso` — [tareas](./SDD-53-Task.md), 29 / 30.
> **Paquetes:** `@fudic/spec` (generadores y formateador) · `@fudic/typecheck` (la forma de las
> props) · `@fudic/cli` (`g spec`, `g term`, `fmt`) · `@fudic/language-server` (snippets, bombilla
> y formato) · `fudic-vscode` (formato al guardar) · `@fudic/diagnostics` (los códigos de la CLI)
> **Depende de:** 52 (el lenguaje `.fudspec`), 22 y 44 (la CLI), 26 (`fudic fmt`), 28 (snippets
> servidos por el server), 35 (`@fudic/typecheck`), 36 (la bombilla del `.fud`)
> **Rango de diagnósticos:** `FUD0960`–`FUD0969` (nuevo). Solo la CLI los usa. `FUD0960` queda libre:
> nació para «el componente no existe», y `g spec` ahora lo crea (§8, decisión 6).
>
> **Qué añade en una frase.** Todo lo que SDD-52 obliga a escribir de memoria (el fichero, el
> criterio, el término, la fixture, la forma de un módulo de término) lo escribe la herramienta:
> la CLI desde la terminal, y el editor con snippets, la bombilla y el formato al guardar.

---

## 1. Contexto y objetivo

SDD-52 hizo el lenguaje: el editor colorea, completa y valida una `.fudspec`. Pero quien la
escribe tiene que saberse de memoria todo lo demás. Hoy, para probar `app-card`, un desarrollador:

1. Crea a mano `app-card.fudspec` y escribe `component app-card`.
2. Escribe cada criterio sin ayuda, sabiéndose qué términos hay y qué argumentos lleva cada uno.
3. Si `app-card` necesita datos, crea a mano `app-card.fixture.ts` con su `import type`, su
   `export default` y su `satisfies`, y rellena cada prop sabiéndose su tipo.
4. Para un término nuevo, crea a mano `fudic/terms/then/xxx.js` con `meta`, `run` y `selfTest`.
5. Ve el rojo del validador, pero el editor no le ofrece arreglarlo.
6. Nadie le ordena el fichero.

Con esta spec:

| Paso | Quién lo hace |
|---|---|
| Crear la `.fudspec` (y la fixture, si el componente necesita datos) | `fudic g spec app-card`, o el snippet de un fichero vacío |
| Escribir un criterio | snippet `criterion` |
| Escribir un término con sus argumentos | el completado del término, con huecos por parámetro |
| Crear un término nuevo | `fudic g term then tiene-sombra`, o la bombilla sobre el término que no existe |
| Crear o completar la fixture | la bombilla sobre `props` |
| Arreglar lo que el validador marca | la bombilla |
| Ordenar el fichero | formato al guardar y `fudic fmt` |

Ningún paso nuevo añade semántica al lenguaje: la gramática, el árbol y el validador de SDD-52 no
cambian.

## 2. Dependencias

| SDD | Qué aporta |
|---|---|
| 52 | `@fudic/spec`: `parseSpec`, `validateSpec`, `readFixtures`, `normalizeTerm`, el `TermCatalog`, la regla de la fixture (`<carpeta del .fud>/<tag>.fixture.ts`) y la de las raíces de términos (`<proyecto>/fudic/terms/`). El servicio `.fudspec` del language server (`fudspec/service.ts`, `completion.ts`, `host.ts`). |
| 22, 44 | La CLI: `parseArgs` → `ParsedCommand` → `planX` → `Plan` → `apply`, `--dry-run`, `--json`, `--force`, `--project`, la resolución del proyecto por `fudic.json`, `FUD0443` (destino existente) y `FUD0448` (uso). La CLI **nunca pregunta**. |
| 26 | `fudic fmt`: un `Plan` por fichero, `--check`, y `FUD0450` para un fichero que no se puede formatear. |
| 28 | Los snippets los sirve el server, no `contributes.snippets`, porque dependen del contexto y del índice. |
| 35 | `@fudic/typecheck`: `createProjectChecker`, el programa TS de un proyecto, con los `.fud` resueltos de verdad y los `fileNames` del `tsconfig.json`. |
| 36 | La bombilla del `.fud` (`services/actions.ts`): cada acción cuelga de un diagnóstico y lleva su `WorkspaceEdit` entero, sin `command` ni `resolve`. |

## 3. Interfaz pública

### 3.1. La forma de una prop (`@fudic/spec`)

Para rellenar una fixture hace falta el tipo de cada prop. `@fudic/spec` no puede depender del
compilador ni de TypeScript, así que recibe el tipo **ya descrito como datos**:

```ts
type PropShape =
  | { readonly kind: 'string' | 'number' | 'boolean' | 'bigint' | 'null' }
  | { readonly kind: 'literal'; readonly value: string | number | boolean }
  | { readonly kind: 'array'; readonly element: PropShape }
  | { readonly kind: 'tuple'; readonly elements: readonly PropShape[] }
  | { readonly kind: 'object'; readonly props: readonly PropField[] }
  | { readonly kind: 'record' }                 // index signature: Record<string, T>
  | { readonly kind: 'union'; readonly members: readonly PropShape[] }
  | { readonly kind: 'any' }                    // any or unknown
  | { readonly kind: 'opaque' };                // function, class instance, Date, cycle…

interface PropField {
  readonly name: string;
  readonly required: boolean;
  readonly shape: PropShape;
}
```

### 3.2. Los generadores (`@fudic/spec`)

Funciones puras, sin disco. La CLI y el server las llaman igual, así que el fichero que escribe
`fudic g spec` y el que crea la bombilla son el mismo byte a byte.

```ts
/** The text of a new `.fudspec`: `component <tag>`, a blank line and the commented skeleton. */
/** `props` adds the `props base` line, for a component that needs a fixture. */
export function specSkeleton(tag: string, props: boolean): string;

/** A sample value for a shape, as TypeScript source; undefined when none can be written. */
export function sampleValue(shape: PropShape): string | undefined;

/** One fixture entry: `<key>: { … }`, with the required props that have a sample. */
export function fixtureEntry(key: string, props: readonly PropField[]): string;

/** The whole `<tag>.fixture.ts`, one entry per key, in the order given. */
export function fixtureModule(tag: string, keys: readonly string[], props: readonly PropField[]): string;

/** A term module that satisfies SDD-52 §3.4: `meta`, an empty `run` and an empty `selfTest`. */
export function termModule(block: BlockKind, name: string, params: readonly TermParam[]): string;

/** The candidate closest to `name`, when one is close enough to be a typo. */
export function closest(name: string, candidates: readonly string[]): string | undefined;

/** Format a `.fudspec`. `ok: false` when the text cannot be formatted safely (§4.6). */
export function formatSpec(source: string): { readonly ok: boolean; readonly text: string };
```

Y `Fixtures` (SDD-52 §3.7) gana un campo, para que la bombilla pueda añadir una clave:

```ts
interface Fixtures {
  readonly path: string;
  readonly names: readonly Name[];
  /** Offset of the closing `}` of the default-exported object; absent when there is none. */
  readonly end?: number;
}
```

### 3.3. La forma de las props, desde TypeScript (`@fudic/typecheck`)

Un solo traductor de `ts.Type` a `PropShape`, que usan la CLI y el server:

```ts
/** The props of the component in `file`, read from its `$Props` export; undefined when unreadable. */
export function propShapes(program: ts.Program, file: string): readonly PropField[] | undefined;
```

`ProjectChecker` (SDD-35) gana `propShapes(file)`, que llama a la de arriba sobre su programa.
`@fudic/typecheck` pasa a depender de `@fudic/spec` (solo por el tipo `PropField`).

### 3.4. La CLI

```
fudic g spec <component>       (alias: s)
  --project <name>   como en el resto de generadores
fudic g term <block> <name>    (alias: t)
  --param <name>:<type>   un parámetro; repetible, en orden. <type>: element|number|string|token
  --project <name>
fudic g component <name> --spec
                     escribe además <tag>.fudspec
fudic fmt [path…]    ahora formatea también los .fudspec
```

`--dry-run`, `--json`, `--force` y `--cwd` funcionan como en el resto de comandos.

## 4. Comportamiento

### 4.1. `fudic g spec <component>`

1. Resuelve el proyecto como `g component` y busca el componente por tag en él. Acepta el tag
   (`app-card`) o el nombre sin prefijo (`card`), con la misma regla que `g component`. Si no
   está, lo crea con su `.fudspec`, igual que `fudic g component <nombre> --spec`, y termina
   ahí: un componente recién creado no tiene props.
2. Escribe `<carpeta del .fud>/<tag>.fudspec` con `specSkeleton(tag, <tiene props obligatorias>)`. Si existe y no hay
   `--force`: `FUD0443`.
3. Si el componente tiene **props obligatorias**, escribe también `<tag>.fixture.ts` con
   `fixtureModule(tag, ['base'], props)`. Si el fichero ya existe, no lo toca (no es error: la
   fixture puede tener ya sus claves). Las props salen de `ProjectChecker.propShapes`.
4. Si escribe una fixture y el proyecto no declara `declare module '*.fud'` en ningún `.d.ts`
   de `src/`, crea `src/fudic-env.d.ts` con la declaración de SDD-52 §8 decisión 1. Sin ella el
   `import type` sale en rojo en el editor nada más crearse.

El esqueleto de la `.fudspec` no trae criterios: un criterio escrito por la herramienta
necesitaría un término, y si ese término no existe en el proyecto el fichero nacería en rojo. Lo
que trae es la forma, comentada:

```
component app-card

# criterion <slug>
#   given
#     props base
#   when
#     <term> <args>
#   then
#     <term> <args>
```

La línea `props base` solo aparece si el componente tiene props obligatorias; si no, el `given`
comentado lleva `<term> <args>` como los demás bloques.

### 4.2. `fudic g term <block> <name>`

1. `<block>` es `given`, `when` o `then`; otra cosa es `FUD0448`.
2. `<name>` va en kebab-case (`[a-z][a-z0-9]*(-[a-z0-9]+)*`); si no: `FUD0961`.
3. Cada `--param` es `<nombre>:<tipo>`, con el tipo en la lista cerrada de SDD-52 §3.5; si no:
   `FUD0962`. Dos con el mismo nombre: `FUD0963`.
4. Escribe `<proyecto>/fudic/terms/<block>/<name>.js` con `termModule(...)`. Si existe y no hay
   `--force`: `FUD0443`.

El módulo generado pasa el validador de SDD-52 sin diagnósticos: `meta` coherente con su ruta,
`run` exportada y `selfTest` exportado (vacío). `run` devuelve `{ pass: false, evidence: 'not
implemented' }`, para que un término recién creado nunca pase por accidente.

### 4.3. Valores de muestra

`sampleValue` rellena por tipo:

| Forma | Valor |
|---|---|
| `string` | `''` |
| `number` | `0` |
| `bigint` | `0n` |
| `boolean` | `false` |
| `null` | `null` |
| `literal` | el literal (`'default'`, `1`, `true`) |
| `array` | `[]` |
| `tuple` | `[` un valor por elemento `]`; sin valor si alguno no lo tiene |
| `record` | `{}` |
| `object` | `{` las props **obligatorias**, cada una con su valor `}`; las que no tienen valor se omiten |
| `union` | el valor del primer miembro que no es `null` ni `undefined` y que tiene valor; si no hay, `null` si está entre los miembros |
| `any` | **ninguno** |
| `opaque` | **ninguno** |

Una prop sin valor **no se escribe**. Si es obligatoria, el chequeo del proyecto (SDD-35, que
resuelve el `.fud` de verdad y no la declaración ambiental) avisa de que falta, y el desarrollador
decide qué valor lleva. Escribir un valor inventado compilaría en silencio.

Las props opcionales nunca se escriben. Una fixture de partida es la mínima que compila.

El traductor de §3.3 corta en ciclo (un tipo que se contiene) y a profundidad 4: lo que queda
debajo es `opaque`.

### 4.4. Snippets en la `.fudspec`

Los sirve el completado del servicio `.fudspec` (como en SDD-28, nunca `contributes.snippets`):

| Dónde | Qué ofrece |
|---|---|
| Fichero vacío, o columna 0 sin `component` en el fichero | `component ${1|<tag hermano>,<resto de tags>|}`. El tag hermano (`app-card.fudspec` → `app-card`) va primero y preseleccionado; si no hay componente con ese tag, la lista empieza por el primero en orden alfabético. |
| Columna 0 | El snippet `criterion`: `criterion ${1:slug}` + `given` + un hueco + `then` + un hueco final. Si el componente tiene props obligatorias, el hueco de `given` es `props ${2|<claves de la fixture>|}` |
| Columna 4 | Cada término del bloque, ahora con un hueco por parámetro: `min-height ${1|<tags>|} ${2:px}`. Un parámetro `element` es una lista de tags del workspace; el resto, un hueco con el nombre del parámetro |
| Columna 4 bajo `given` | `props ${1|<claves de la fixture>|}`, o `props ${1:base}` si no hay fichero de fixture |

Las palabras clave sueltas de SDD-52 (`component`, `criterion`, `given`, `when`, `then`) se siguen
ofreciendo: el snippet se añade, no sustituye.

### 4.5. La bombilla

`provideCodeActions` del servicio `.fudspec`. Como en SDD-36: cada acción cuelga de un diagnóstico
que está en la petición y lleva su `WorkspaceEdit` entero.

| Diagnóstico | Acciones |
|---|---|
| `FUD0940` el término no existe | «Cambiar a `<x>`» con `closest` sobre los términos del bloque, si hay uno. «Crear `<bloque>/<término>.js`»: crea el módulo con `termModule`, con tantos parámetros `string` como argumentos lleve la línea (`arg1`, `arg2`…) |
| `FUD0949` el componente no existe | «Cambiar a `<tag>`» con `closest` sobre los tags del workspace |
| `FUD0922` sin `component` | «Añadir `component <tag hermano>`», si existe ese componente |
| `FUD0953` no hay fichero de fixture | «Crear `<tag>.fixture.ts`»: `fixtureModule` con **todas** las claves que nombran los `props` del fichero, en orden de aparición |
| `FUD0950` la fixture no existe | «Cambiar a `<x>`» con `closest` sobre las claves. «Añadir `<x>` a `<tag>.fixture.ts`»: inserta `fixtureEntry` antes de `Fixtures.end` |
| `FUD0951` faltan las props | «Añadir `props <primera clave>`» al `given` del criterio, o un `given` nuevo con esa línea si no lo hay. Sin fichero de fixture, `props base` |
| `FUD0947` número de argumentos | Si faltan: «Completar argumentos», que añade un marcador por parámetro que falta (`<nombre>`). Si sobran: «Quitar argumentos de más» |
| `FUD0921` indentación | «Formatear el documento», con la edición de §4.6 |

`closest` acepta un candidato a distancia de edición como mucho 2, y nunca mayor que un tercio
del nombre; con empate, el primero en orden alfabético.

Los valores de la fixture salen de `propShapes` sobre el programa TS del server. Si no hay
programa (TS sin cargar, componente fuera del programa), la fixture se crea igual con las claves
y **sin props** dentro: el chequeo del proyecto dirá cuáles faltan.

### 4.6. El formateador

`formatSpec(source)`, en `@fudic/spec`. Lee las líneas con el mismo lector que el parser e imprime todo token leído: imprimir desde el árbol perdería las líneas que el parser no coloca.
Los comentarios y las líneas en blanco salen del mismo lector.

Reglas, en orden:

1. Una indentación inválida (1, 3, 5 o más espacios, o un tabulador) pasa al nivel que le da el
   parser por su primera palabra: `component` y `criterion` a 0, bloques a 2, términos a 4. Una
   línea que ya está a 0, 2 o 4 se queda donde está aunque no sea su sitio (`  component x`): el
   parser la lee ahí, y moverla cambiaría el árbol.
2. Entre tokens de una línea, un solo espacio. El interior de una cadena no se toca.
3. Un comentario al final de una línea queda a un espacio del último token. Un comentario solo en
   su línea toma la indentación de la línea que le sigue; al final del fichero, la de la anterior.
4. Sin espacios al final de línea.
5. Una línea en blanco tras `component`, una entre criterios y ninguna dentro de un criterio. Un
   comentario entre criterios va pegado al criterio que le sigue.
6. El salto de línea es el primero que aparece en el fichero (`\n` si no hay ninguno), y el
   fichero acaba en exactamente uno.
7. Nada más cambia: ni los nombres (`minHeight` sigue siendo `minHeight`), ni el orden, ni las
   comillas.

No formatea (`ok: false`, el texto tal cual) si el parser da `FUD0920` (una comilla sin cerrar):
no se sabe dónde acaba el token. Cualquier otro diagnóstico del parser no lo impide; `FUD0921`
(indentación) es justo lo que arregla.

Es **idempotente**: formatear lo formateado no cambia nada.

Lo usan tres sitios:

- **Language server.** `provideDocumentFormattingEdits` del servicio `.fudspec`: una edición del
  documento entero, o `[]` si no hay cambios o no se puede formatear.
- **VS Code.** `configurationDefaults["[fudspec]"]` gana `editor.defaultFormatter` (la extensión)
  y `editor.formatOnSave: true`, como el `.fud`.
- **CLI.** `fudic fmt` recorre `.fud` y `.fudspec`. Un `.fudspec` que no se puede formatear es
  `FUD0450`, como un `.fud` que no parsea. `--check` cuenta los dos.

## 5. Invariantes

- **Ni el lenguaje ni el validador cambian.** Todo lo que se genera pasa el validador de SDD-52 o
  da exactamente los diagnósticos que ya existen.
- **Un generador, dos clientes.** La CLI y el server escriben con las mismas funciones de
  `@fudic/spec`; un test compara byte a byte la salida de la CLI con la del server.
- **Una sola traducción de tipos.** `ts.Type` → `PropShape` vive solo en `@fudic/typecheck`.
- **Nunca se inventa un valor.** Lo que no se sabe rellenar se omite.
- **La CLI no pregunta.** Todo dato que falta es un error con la ayuda de uso.
- **La bombilla solo aparece con un diagnóstico.** Ninguna acción sobre código sano.
- **`@fudic/spec` sigue sin depender de `@fudic/compiler` ni de TypeScript.**
- **Cobertura.** `@fudic/spec`, `@fudic/diagnostics`, `@fudic/language-server` y `fudic-vscode` siguen
  al 100 % en las cuatro métricas. El código nuevo de `@fudic/cli` y de `@fudic/typecheck` nace al
  100 %, con su umbral por fichero.

### Catálogo de diagnósticos

Todos son `error` y solo los emite la CLI.

| Código | Cuándo |
|---|---|
| `FUD0961` | `g term`: el nombre no está en kebab-case. |
| `FUD0962` | `g term`: un `--param` no es `<nombre>:<tipo>` o su tipo no está en la lista cerrada. |
| `FUD0963` | `g term`: dos `--param` con el mismo nombre. |

## 6. Criterios de aceptación

**Generadores**

1. **Esqueleto.** `specSkeleton('app-card', true)` y `specSkeleton('app-card', false)` parsean y validan sin diagnósticos contra un contexto
   donde `app-card` existe.
2. **Valores.** Cada fila de §4.3 da su valor, con un caso por forma. `object` omite las opcionales
   y las que no tienen valor; `union` salta `null` y `undefined`; `any` y `opaque` no dan valor.
3. **Fixture.** `fixtureModule('app-card', ['a', 'b'], props)` es TS válido, con el `import type`,
   el `satisfies Record<string, $Props>` y dos claves; `readFixtures` lo lee y da `a` y `b` y su
   `end`.
4. **Término.** Para cada bloque y cada tipo de parámetro, `termModule` da un módulo que
   `readTermModule` lee sin diagnósticos en la capa `workspace`.
5. **`closest`.** `minheigt` → `min-height`; `xyz` frente a `min-height` → nada; empate → el primero
   alfabético.

**Tipos**

6. **`propShapes`.** Sobre el `app-card` del ejemplo: `title` y `href` obligatorias de forma
   `string`, `variant` opcional de forma `union` de dos `literal`. Un alias, una interfaz, un array
   de objetos, una tupla, un `Record`, una función, un `any` y un tipo recursivo dan su forma.

**CLI**

7. **`g spec`.** En un proyecto con `app-card`: escribe `app-card.fudspec`, `app-card.fixture.ts`
   con `base: { title: '', href: '' }` y `src/fudic-env.d.ts`. `--dry-run` y `--json` enseñan los
   tres ficheros sin escribir.
8. **Sin props.** Un componente sin props obligatorias recibe solo la `.fudspec`, sin `props base`.
9. **Lo que ya existe.** Con la fixture ya escrita, no se toca. Con la `.fudspec`, `FUD0443` salvo
   `--force`. Con la declaración `*.fud` ya en un `.d.ts`, no se crea `fudic-env.d.ts`.
10. **Spec primero.** `g spec` de un componente que no existe escribe lo mismo que
    `g component <nombre> --spec`: el `.fud` y su `.fudspec`.
11. **`g term`.** `fudic g term then tiene-sombra --param target:element --param px:number` escribe
    un módulo que la `.fudspec` puede usar sin diagnósticos. Cada código (`FUD0448`, `FUD0961`–
    `FUD0963`, `FUD0443`) con una entrada mínima.
12. **`g component --spec`.** Escribe el `.fud` y su `.fudspec`.
13. **Mismo fichero.** La fixture que escribe la CLI es, byte a byte, la que crea la bombilla para el
    mismo componente y la misma clave, y la `.fudspec` de la CLI es `specSkeleton`. El editor no
    escribe una `.fudspec` entera: su snippet `component` y la bombilla de `FUD0922` añaden la línea.

**Editor**

14. **Snippet `component`.** En `app-card.fudspec` vacío, el primer ítem es el snippet con
    `app-card` preseleccionado.
15. **Snippet `criterion`.** Insertado, el fichero solo da `FUD0934` (bloques vacíos) hasta que se
    rellenan los huecos. Con props obligatorias, el `given` trae `props` con las claves.
16. **Términos con huecos.** Bajo `then`, `min-height` se inserta como snippet con dos huecos y el
    primero ofrece los tags. Las palabras clave de SDD-52 se siguen ofreciendo.
17. **Bombilla.** Cada fila de §4.5 con una entrada mínima: la acción aparece sobre su diagnóstico,
    su edición deja el fichero sin ese diagnóstico, y no aparece ninguna acción donde no hay
    diagnóstico.
18. **Fixture sin TS.** Sin programa TS, «Crear `<tag>.fixture.ts`» crea el fichero con las claves
    y sin props.

**Formateador**

19. **El ejemplo.** `examples/basic/src/components/app-card.fudspec` (espacios al final, líneas en
    blanco irregulares) sale con las reglas de §4.6, y el árbol de antes y el de después son
    iguales salvo spans.
20. **Cada regla** de §4.6 con una entrada mínima, incluido un fichero con `\r\n`.
21. **Idempotencia.** Sobre cada fixture de los tests de `@fudic/spec`, `formatSpec(formatSpec(x))
    === formatSpec(x)`.
22. **No formatea lo roto.** Con `FUD0920`, `ok: false` y el texto intacto; con `FUD0921`, formatea.
23. **Tres sitios.** El server devuelve la misma edición que `formatSpec`; `fudic fmt` formatea un
    `.fudspec` y da `FUD0450` con uno roto; la extensión declara formato al guardar en `[fudspec]`.

**Entrega**

24. **Cobertura.** La de §5.
25. **El ejemplo.** `examples/basic` sigue construyendo y su `app-card.fudspec` queda formateada.

## 7. Fuera de alcance

- **Rellenar una fixture desde un `.ts` vacío.** El server no sirve `.ts`; la fixture se crea desde
  la `.fudspec` (bombilla) o la terminal.
- **Preguntar en la CLI.** Ni menús ni confirmaciones.
- **Cambiar el lenguaje**: palabras nuevas, criterios por defecto o fixtures por defecto.
- **Normalizar nombres** al formatear (`minHeight` → `min-height`). Decisión de Pedro.
- **Ejecutar criterios**, el runner y `selfTest`: SDD-32 y siguientes.
- **La capa de términos del framework:** sigue vacía mientras el framework no publique su carpeta.

## 8. Decisiones

1. **Una sola spec**, no tres: CLI, editor y formateador comparten los generadores.
2. **Las props se rellenan por tipo, leyendo `$Props` con TypeScript.** Un componente con props
   tiene sus props tipadas; si no, pierde el IntelliSense en su propio `.fud`.
3. **`any` y lo que no se puede describir no se rellenan.** El chequeo del proyecto avisa de lo que
   falta, y un valor inventado compilaría en silencio.
4. **El formateador no cambia lo que el autor escribió**, solo los blancos.
5. **El esqueleto no trae criterios**, solo su forma comentada: un término que no existiera haría
   nacer el fichero en rojo.
6. **El orden es del autor.** Fudic no impone escribir el componente antes que su spec ni al revés:
   `g spec` de un componente que no existe lo crea, y `g component --spec` crea la spec con él. Quien no
   quiera criterios no pone `--spec`. Decisión de Pedro.

### 8.1. Medido al empezar la fase del editor

- **El programa TS desde el servicio `.fudspec`.** El servicio del `.fud` lo obtiene con
  `context.inject('typescript/languageService')`. Hay que medir que la misma llamada da, desde una
  `.fudspec`, el programa del proyecto que contiene el `.fud` del componente. Si no lo da, la
  bombilla crea la fixture sin props (criterio 18) y la decisión queda anotada aquí.

  **Resultado (2026-10-02): sí lo da.** El servidor añade todos los `.fud` del workspace al programa
  de cada proyecto (`mountWorkspaceFuds`), así que desde una `.fudspec` el programa contiene el
  componente. Medido con el servidor vivo: la bombilla de `FUD0953` crea
  `primera: { label: '', tone: 'info', items: [] }` para `props<{ label: string; tone: Tone;
  items: { id: number }[]; extra?: string }>`.
- **El formato necesita `format: true` en el mapeo.** El virtual code de la `.fudspec` lo tenía a
  `false` (SDD-52 no formateaba), y con él Volar no llama a `provideDocumentFormattingEdits`.
- **`fudic.format.enable` no entra en el servidor.** En el `.fud` solo apaga el comando
  `fudic.formatDocument`; el formato al guardar lo decide `editor.formatOnSave`. La `.fudspec` hace
  lo mismo.
