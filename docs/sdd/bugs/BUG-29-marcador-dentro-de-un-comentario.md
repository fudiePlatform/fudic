# BUG-29 — Un `@client` escrito en un comentario es un error, y un `load` nombrado en uno también

**Estado:** `Listo` — causa raíz confirmada sobre el código, con fichero y línea ·
**Depende de** [SDD-08](../SDD-08-code-block.md) y [SDD-12](../SDD-12-semantica.md) en `Hecho` ·
**Rama:** por asignar · **Tareas:** [BUG-29-Task.md](./BUG-29-Task.md)

> **Paquetes:** `compiler`
> **Corrige:** SDD-12 §4 (el escaneo textual como técnica) · SDD-08 §3 · SDD-21 §4 ·
> gramática 33.a, 89
> **Rango de diagnósticos:** ninguno nuevo. Los dos códigos que fallan —`FUD0193` y
> `FUD0430`— existen y son correctos: lo que está mal es **cuándo se disparan**.

---

## 1. Contexto y síntoma

### Síntoma 1 — comentar por qué algo no va dentro de una región es un error

Escribiendo el ejemplo de una ruta, este comentario tira el fichero:

```razor
@code {
  // Escrito dentro de @client, el prerender de la ruta se cae con "count is not defined".
  const count = signal(1);
}
```

```
FUD0193  `@server`/`@client` regions cannot be nested
```

No hay ninguna región anidada. Hay un **comentario de JavaScript** que nombra una. El
error aparece en el editor con subrayado rojo, y el autor no tiene forma de adivinar la
regla: lo que ha escrito no es código, es prosa.

Y es prosa que se escribe sola. El sitio natural para explicar por qué una constante vive
en la zona neutra y no en la de cliente es justo encima de esa constante, y el nombre de la
región es exactamente la palabra que hay que decir. La única salida es **escribir mal el
nombre a propósito** —«la region de cliente»— para que el compilador no lo reconozca, que
es lo contrario de lo que un comentario tiene que poder hacer.

Un caso peor y del todo silencioso: `// TODO: mover esto a @client`. Ese comentario es lo
que un equipo escribe cien veces, y aquí para el build.

### Síntoma 2 — el mismo defecto, en el analizador de layouts

```razor
@code {
  @server {
    // Un layout no puede exportar load: recibe el `data` de la ruta.
    export const titulo = "Blog";
  }
}
```

```
FUD0430  a layout cannot export load: it receives the route data (v1)
```

Otra vez: la frase que documenta la regla la incumple. Y aquí la trampa es mayor, porque el
diagnóstico se ancla al `span` de **la región entera**, así que el subrayado no señala
siquiera la línea del comentario.

### Cómo se reproduce

Cualquiera de las dos formas, en cualquier `.fud`. Y el `@` dentro de una **cadena** vale
igual: `const aviso = "usa @client para esto";` es `FUD0193`, y
`const doc = "export function load";` en el `@server` de un layout es `FUD0430`.

---

## 2. Causa raíz

### 2.1 · Un `matchAll` sobre el texto crudo

[`semantic/analyzers/code-region-nesting.ts:26`](../../../packages/compiler/src/semantic/analyzers/code-region-nesting.ts):

```ts
const REGION_MARKER = /@(?:server|client)\b/g;          // línea 16
…
const text = input.source.slice(part.js.start, part.js.end);   // línea 25
for (const match of text.matchAll(REGION_MARKER)) { … }        // línea 26
```

El escaneo es sobre el **texto**, sin saber en qué contexto léxico cae cada acierto. Un
comentario de línea, uno de bloque, una cadena, una plantilla y un literal de expresión
regular son, para esta expresión regular, código.

La cabecera del fichero lo dice, y esa es la parte que hay que revisar:

> *«This is a deliberate text scan (SDD-12 §4): a marker inside a JS string/comment is a
> tolerated false positive, the price of not re-lexing the region body here.»*

La decisión está tomada de forma explícita, y el precio se calculó mal por dos motivos.
Primero, **un falso positivo no es una imprecisión: es un error rojo sobre código correcto**,
y un compilador que rechaza un fichero válido no está siendo conservador, está roto.
Segundo —y es lo que la convierte en un defecto y no en una discusión de diseño— **el precio
no hay que pagarlo**: nadie tiene que re-lexar nada.

### 2.2 · El trabajo ya estaba hecho, y se tira

El balanceador (SDD-02) **ya recorre** cadenas, plantillas, comentarios y regex mientras
equilibra las llaves, y publica el resultado precisamente para que nadie repita el trabajo:

```ts
// balancer/balancer.ts
/**
 * One opaque region found inside a balanced group. … The balancer already walked every
 * one of these while scanning; emitting them lets SDD-11 reuse the work instead of
 * re-lexing the substring for Oxc.
 */
export interface LexRegion { readonly kind: LexRegionKind; readonly span: Span; }
```

Y el parser de `@code` **las usa, y bien**:
[`code/code.ts:289`](../../../packages/compiler/src/code/code.ts) pasa `group.regions` al
`BodySplitter`, cuyo `RegionCursor` ([línea 94](../../../packages/compiler/src/code/code.ts))
salta cada región opaca con un solo puntero hacia delante. Por eso el `@client` de mi
comentario **no** partió el bloque en dos: el parser sabe perfectamente que eso es un
comentario.

El defecto es que ese conocimiento **muere en el parser**. `CodeBlockNode`
([`code/nodes.ts`](../../../packages/compiler/src/code/nodes.ts)) guarda las partes y sus
spans y **no guarda las regiones léxicas**, así que todo consumidor posterior que quiera
mirar dentro del JS se encuentra con una cadena de caracteres y ninguna otra opción que
escanearla. La cabecera del analizador dice «el precio de no re-lexar»; la verdad es que el
lexado ya está hecho una línea antes y se está tirando a la basura.

La prueba de que el diseño correcto ya existe está en el mismo fichero: `razorCommentErrors`
([`code.ts:299`](../../../packages/compiler/src/code/code.ts)) detecta el comentario Razor de
BUG-13 **leyendo `group.regions`**, no escaneando texto. Dos reglas hermanas, una hecha bien
y otra a mano.

### 2.3 · Alcance: son dos analizadores, no uno

La regla del índice de BUG —*todo defecto que aparece una vez aparece en los sitios que
comparten su causa*— da un segundo:

[`semantic/analyzers/layout-load.ts:31-32`](../../../packages/compiler/src/semantic/analyzers/layout-load.ts):

```ts
const js = input.source.slice(part.js.start, part.js.end);
if (EXPORTED_LOAD.test(js)) { … }
```

Idéntico: expresión regular sobre el texto crudo de la región. Su cabecera también declara
la decisión —*«deliberately shallow … this rule must hold even when the JS did not parse»*—
y **ese argumento sí es bueno**: la regla tiene que valer aunque Oxc no haya podido parsear
el fragmento. Lo que no se sigue de ahí es que haya que ignorar los comentarios y las
cadenas, porque las regiones léxicas las produce el **balanceador**, que corre siempre y no
depende de que el JS sea válido.

Es decir: los dos analizadores tienen razón en **no** pedirle la respuesta a Oxc, y los dos
se equivocan en el paso siguiente.

### 2.4 · Lo que NO es la causa

- **No es que el analizador mire la parte equivocada.** Un `@client` escrito en la zona
  neutra a profundidad de llaves mayor que cero —`function f() { @client { … } }`— es un
  error de verdad y el analizador tiene que seguir cogiéndolo. El escaneo mira donde debe;
  lo que le falta es el contexto léxico.
- **No es un problema del editor.** El diagnóstico sale del pase semántico del compilador,
  así que el build para igual que el subrayado aparece.

---

## 3. Interfaz pública

**`@fudic/compiler`**

- `CodeBlockNode` gana `regions: readonly LexRegion[]` — las regiones opacas que el
  balanceador ya calculó sobre el cuerpo del bloque, en orden de fuente. Es el campo cuya
  ausencia obliga a todo consumidor posterior a escanear texto.
- Un ayudante compartido en `semantic/` con **una** implementación para los dos llamantes.
  Dos formas posibles, y la elección es de quien implemente:
  - `outsideOpaque(regions, span)` → *«¿este offset es código?»*, que es el `RegionCursor`
    de `code.ts` extraído a un sitio donde lo pueda usar más de uno.
  - `maskOpaque(text, regions, base)` → el texto con cada región opaca sustituida por
    espacios, **carácter por carácter**, que es exactamente lo que hace
    `redactServerRegions` para los source maps: los offsets no se mueven, así que las
    expresiones regulares de hoy siguen valiendo tal cual y los spans que producen siguen
    apuntando al sitio correcto.

  La segunda deja los dos analizadores casi como están y no obliga a reescribir sus reglas;
  la primera es más barata cuando solo hay que responder por un acierto suelto.

Ninguna firma de analizador cambia: `Analyzer.run(input, report)` sigue igual.

---

## 4. Comportamiento corregido

**4.1 · Un marcador dentro de una región opaca no es un marcador.** `FUD0193` deja de
dispararse por un `@server`/`@client` escrito en un comentario de línea, uno de bloque, una
cadena, una plantilla o un literal de expresión regular.

**4.2 · Lo mismo para `FUD0430`.** Un `load` nombrado en un comentario o en una cadena del
`@server` de un layout deja de ser un error.

**4.3 · Y los verdaderos se siguen cogiendo, sin excepción.** Una región dentro de otra
región es `FUD0193`; una región en la zona neutra a profundidad mayor que cero, también; un
`export function load` de verdad en un layout es `FUD0430`. Ninguno de los dos analizadores
pierde un solo caso real — lo que cambia es qué cuenta como texto.

**4.4 · El lexado se hace una vez.** El balanceador ya recorrió el cuerpo; el parser ya
recibió las regiones. El AST las lleva, y quien las necesite las lee. Ningún consumidor
vuelve a lexar JavaScript.

**4.5 · Una implementación para los dos.** La pregunta «¿este offset es código o es texto?»
la contesta una función, no cada analizador a su manera. Es la misma regla que BUG-23 §5
fijó para las dos reglas de binding, y por el mismo motivo: dos copias divergen en cuanto
alguien toque una.

---

## 5. Invariantes

- **Un compilador no rechaza un fichero correcto.** Un falso positivo no es un análisis
  conservador: es un error donde no lo hay, y cuesta más que la regla que intentaba proteger.
- **Lo que ya se lexó no se vuelve a lexar, y tampoco se tira.** Si una fase calcula un
  hecho sobre el fuente, ese hecho viaja en el AST. Un consumidor que se encuentra con una
  cadena de caracteres donde debería haber estructura es una fase anterior que no publicó
  lo que sabía.
- **Un comentario no puede cambiar el significado de nada.** Es la misma regla que BUG-13
  cerró para el comentario Razor dentro de `@code`, y que el balanceador ya sostiene con
  `razorComments` para que un comentario no decida dónde acaba un bloque.
- **Una regla, una función.** Dos analizadores que hacen la misma pregunta la hacen con el
  mismo código.

---

## 6. Criterios de aceptación

Tests en `packages/compiler/test/semantic/`. Los cinco primeros se escriben contra el código
roto y **se ven fallar**.

**Falsos positivos que desaparecen**

1. **(rojo primero)** `// mueve esto a @client` en la zona neutra de `@code` no produce
   ningún diagnóstico.
2. **(rojo primero)** Lo mismo en un comentario de bloque, en una cadena
   (`const s = "@server"`), en una plantilla (`` `usa @client` ``) y dentro de un `@server`
   o un `@client` de verdad — el comentario que explica la región, escrito **dentro** de la
   región.
3. **(rojo primero)** `// un layout no puede exportar load` en el `@server` de un layout no
   produce `FUD0430`; tampoco `const doc = "export function load";`.

**Verdaderos positivos que se conservan**

4. Una región dentro de otra región sigue siendo `FUD0193`, con su span sobre el marcador.
5. Un `@client` en la zona neutra a profundidad de llaves mayor que cero sigue siendo
   `FUD0193`.
6. Un `export function load` y un `export const load` reales en un layout siguen siendo
   `FUD0430`, con el span de la región.
7. **Los spans no se mueven.** El diagnóstico de un caso real cae exactamente en el mismo
   offset que hoy — si la corrección enmascara, la máscara es carácter por carácter.

**Estructura**

8. `CodeBlockNode.regions` lleva las regiones opacas del cuerpo, en orden y sin solapes, y
   un `@code` sin comentarios ni cadenas la trae vacía.
9. **Una sola implementación:** los dos analizadores llaman a la misma función. Un test que
   cuente los llamantes no hace falta; lo que sí se comprueba es que el ayudante vive en un
   módulo propio y que ninguno de los dos analizadores tiene su propio salto de regiones.

**Cobertura**

10. El código nuevo, al **100 %** en las cuatro métricas. `@fudic/compiler` no baja de donde
    está.

---

## 7. Fuera de alcance

- **Reescribir los analizadores contra el AST de Oxc.** El argumento de `layout-load` es
  bueno: la regla tiene que valer aunque el JS no parsee. Se corrige el escaneo, no se
  cambia de fuente de verdad.
- **Los demás escaneos de texto del compilador** que no sean estos dos. Si aparece un
  tercero al implementar, entra aquí; buscarlos por todo el repo es otra tanda.
- **`FUD0114`** (comentario Razor en `@code`) ya lee las regiones del balanceador y no se
  toca.
- **La reactividad de una ruta**, que es lo que se estaba escribiendo cuando salió esto y
  vive en su propio SDD.
