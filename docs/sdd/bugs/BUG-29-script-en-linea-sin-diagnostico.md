# BUG-29 — el cuerpo de un `<script>` se tiraba en silencio, y con él el JSON-LD y el import map

**Estado:** `Hecho` · **Depende de** [SDD-12](../SDD-12-semantica.md) y
[SDD-15](../SDD-15-emit.md) en `Hecho` ·
**Rama:** `sdd-37-delegacion-de-eventos` · **Tareas:**
[BUG-29-Task.md](./BUG-29-Task.md)

> **Paquetes:** `compiler`
> **Corrige:** SDD-10 §3 · SDD-12 §4 · SDD-15 §4.1 · gramática **43**, y **añade la 129**
> **Rango de diagnósticos:** `FUD0161`, del rango de SDD-10 (`FUD0150`–`0169`), junto a su
> hermano `0159`. Uno solo: la regla tiene un caso.

---

## 1. Contexto y síntoma

Escribir esto en una página:

```html
<script>
  alert(1);
</script>
```

produce esto en el HTML:

```html
<script></script>
```

El tag puesto, el cuerpo evaporado, y **ni un diagnóstico** — ni en `pnpm build`, ni en el
editor. Escribir un `<script>` en línea y no escribirlo dan el mismo resultado, y la única
señal de que pasó algo es que la página no hace lo que dice.

Y lo mismo, exactamente el mismo mecanismo, con esto:

```html
<script type="application/ld+json">
  { "@context": "https://schema.org", "@type": "Product", "name": "fudic" }
</script>
```

que es la parte grave. Un JSON-LD que no llega al HTML no falla: **desaparece**. La página se
ve igual, y lo que se pierde es cómo se explica a un buscador y a una IA conversacional.

Lo encontró la evidencia de SDD-37. `/delegacion` necesita parchear `EventTarget` antes de que
se cargue nada para contar los listeners de la página —justo el caso que la decisión 43 llama
«feature detection temprano»—. La sonda se escribió en línea, no contó nada, y el fichero
acabó en `public/` con un comentario que culpaba a una CSP que esta app **no tiene**. Ese
comentario es el síntoma en su forma más pura: el defecto no dejaba rastro, así que quien se
lo topó se inventó una causa y siguió.

---

## 2. Causa raíz

### 2.1 · Otra fila de la misma tabla

El cuerpo de un `<script>` es un `RawTextNode`, y `raw-text` está en `SERVER_ROLE`
—[`emit/markup.ts`](../../../packages/compiler/src/emit/markup.ts)— como `'none'`, con este
motivo escrito al lado:

> el cuerpo de un `<style>` de componente es la hoja del componente (`module.ts`), y el cuerpo
> de un `<script>` es texto opaco de autor: ninguno de los dos es un nodo que este walk
> fabrique.

La primera mitad es cierta. La segunda dice que el emit **no lo pinta**, que es verdad, y de
ahí salta a que no lo emita **nadie**, que no lo era: no había ningún otro sitio al que el
cuerpo de un `<script>` fuese a parar. Es la tercera vez que esta tabla falla igual
—[BUG-19](./BUG-19-tres-constructos-sin-servidor.md) la creó justamente para que ningún tipo
de nodo se colara por un `default`, y [BUG-28](./BUG-28-bloque-en-linea-nunca-emitido.md)
encontró `'inline-code'` mal justificado por analogía con `@code`—: **la tabla hace su trabajo
y el nodo está nombrado; lo que falla es el razonamiento que le pone el valor.**

### 2.2 · Y ninguna regla que lo dijera

Con el emit callado, la única forma de que el autor se enterase era un diagnóstico, y
`<script>` no aparecía en ningún analizador de SDD-12. La gramática, mientras tanto, prometía
lo contrario desde v1 —la **43**: «válvula de escape explícita para integraciones de terceros,
JSON-LD, feature detection temprano»—. Nadie lo comprobó nunca porque ningún fixture del repo
escribió un `<script>` con cuerpo: los dos de `examples/` son `<script src>`.

---

## 3. La decisión: la línea es código contra datos

La primera versión de este arreglo trazó la línea en el sitio equivocado —cuerpo contra
ausencia de cuerpo— y con eso se llevaba por delante el JSON-LD. La línea correcta es **qué
hace el navegador con el cuerpo**:

- **lo ejecuta** → hay una forma alternativa que sobrevive (un fichero, traído con `src`), así
  que la de en línea se rechaza. fudic no soporta script en línea.
- **lo lee** → no hay forma alternativa, así que se emite **verbatim**.

Y los dos casos de lectura no son un adorno. **JSON-LD** es cómo una página se explica a un
buscador y a una IA conversacional, que hoy es parte de por qué la página se encuentra; un
`.json` aparte enlazado con `<link>` no es el mismo documento para un rastreador. Un **import
map** es la resolución de módulos de la propia página, y la especificación exige que sea en
línea y anterior al primer módulo: no existe versión de él en otro fichero.

| forma | antes | ahora |
|---|---|---|
| `<script src="/p.js"></script>` | se emite entera | igual, y es **la** forma del código |
| `<script></script>` | se emite, no pierde nada | igual, sin diagnóstico |
| `<script>` de solo espacios | íd. | íd. — sangría no es código de autor |
| `<script>alert(1)</script>` | `<script></script>`, en silencio | **`FUD0161`** |
| `<script type="application/ld+json">…` | `<script …></script>`, en silencio | **cuerpo verbatim** |
| `<script type="importmap">…` | íd. | **cuerpo verbatim** |

La lista de tipos de datos es **cerrada** —la misma forma que la lista blanca de at-rules de la
42.b—: un tipo nuevo es una línea en `DATA_SCRIPT_TYPES`, no una heurística sobre lo que parece
inofensivo. `application/json`, sin ir más lejos, **no** está: se parece, y no es ninguna de
las dos cosas que la 129 nombra. El `type` se compara recortado y sin distinguir mayúsculas,
como se compara un MIME, y un `type` interpolado —`type="@(t)"`— no se puede leer al compilar,
así que cuenta como código y un cuerpo debajo sigue siendo `FUD0161`.

### 3.1 · El `@` de JSON-LD

`@context` y `@type` son las dos claves sobre las que JSON-LD está construido, y en un fichero
`.fud` el `@` es sintaxis. Aquí no lo es: la decisión 43 hace que el cuerpo de un `<script>`
sea **raw para el lexer**, así que esas cuatro letras llegan al emit tal y como se teclearon.
Si eso se rompiera, JSON-LD sería inescribible por mucho que el emit lo copie, y por eso está
asertado al lado del emit y no solo en el parser.

Tampoco se **escapa**: un `&quot;` dentro de un `<script>` no es una comilla para un parser de
JSON, son seis caracteres de basura.

### 3.2 · Dónde va un import map

Consecuencia de colocación, y conviene saberla: el `@RenderHead()` de una ruta se compone
**después** del head del layout, así que un import map escrito en el head de una **ruta** sale
detrás del `<script type="module">` del arranque, y un import map posterior a la primera carga
de módulo el navegador **lo ignora**. Su sitio es el **layout**, delante de esa línea — que es
del autor también. Comprobado en `examples/basic`: desde el layout sale en el offset 73 contra
el 175 del módulo; desde la ruta, al revés.

---

## 4. Interfaz pública

```ts
// packages/compiler/src/html/nodes.ts
export const DATA_SCRIPT_TYPES: ReadonlySet<string>;   // 'application/ld+json' | 'importmap'
export function dataScriptType(el: ElementNode): string | undefined;

// packages/compiler/src/semantic/analyzers/script-body.ts
export function checkScriptBody(input: MarkupInput, report: Report): void;
export const scriptBody: Analyzer;
```

`dataScriptType` vive en `html/` y no en `semantic/` ni en `emit/` porque es un hecho sobre
HTML, y porque lo consultan **tres**: el emit de servidor, el de cliente y el analizador. Una
respuesta calculada en tres sitios es una respuesta que diverge, y la forma en que diverge
aquí sería un JSON-LD que el servidor pinta, el cliente no fabrica y la hidratación no
reconoce.

`checkScriptBody` es la regla sobre markup solo, y la llaman **los dos**: `analyze()` para el
editor y `contractDiagnostics()` —[`emit/registry.ts`](../../../packages/compiler/src/emit/registry.ts)—
para el build. Es el patrón de `checkSlotName`, y está aquí por la razón contraria a la de
ella: esta regla no necesita registro ninguno, y `registry.ts` es sencillamente la única puerta
que el build tiene a los analizadores.

---

## 5. Invariantes

1. **Una regla se sirve por las dos puertas.** Servida por una sola es una regla que la mitad
   de los usuarios no ve: en el editor, un fichero que compila y se rompe al desplegar; en el
   build, un rojo que el editor no anticipó. Es la grieta de `FUD0291` y `FUD0667`.
2. **Servidor y cliente escriben el mismo cuerpo.** `c()` fabrica el mismo texto que el
   servidor pinta; `h()` no fabrica nada, porque el nodo vuelve dentro de su elemento y el
   cursor del nivel recorre **elementos**. Las dos ramas terminan con el mismo árbol, que es
   lo único que la hidratación les pide.
3. **La lista de tipos de datos es cerrada.** Sin heurística y sin «parece JSON».
4. **El cuerpo de datos no se escapa ni se interpola.**

---

## 6. Criterios de aceptación

1. `<script>alert(1)</script>` produce `FUD0161`, con el span sobre `alert(1)` y no sobre el
   elemento. ✅
2. `<script src>` y `<script></script>` no producen nada; un `src` **con** cuerpo sí. ✅
3. Un cuerpo de solo espacios no produce nada. ✅
4. Se encuentra en el `<head>` de un componente y dentro de un `@if`, no solo en la raíz. ✅
5. El mensaje nombra la salida (`src`) **y** los dos tipos que sí van en línea. ✅
6. `application/ld+json` e `importmap` no producen diagnóstico, y su cuerpo **llega al HTML**
   verbatim: comprobado renderizando el módulo emitido y leyendo la salida. ✅
7. `@context` y `@type` sobreviven como se escribieron, y el cuerpo no se HTML-escapa. ✅
8. El chunk de cliente fabrica el mismo cuerpo que el servidor pinta. ✅
9. El `type` se lee recortado y sin distinguir mayúsculas; `application/json` y un `type`
   interpolado son código. ✅
10. **`pnpm build` falla** con el código, el mensaje y el fichero para el caso de código, y
    **construye** con JSON-LD e import map. Comprobado sobre `examples/basic` con una ruta y un
    layout de prueba, retirados después. ✅
11. `analyze()` lo reporta también, con `ANALYZERS` en 19. ✅
12. Cobertura de `script-body.ts` al **100 %** en las cuatro métricas. ✅
