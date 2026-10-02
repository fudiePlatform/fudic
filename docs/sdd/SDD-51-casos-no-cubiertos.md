# SDD-51 — Casos no cubiertos

> Fecha: 2026-10-02
> Complemento a la vista de errores de SDD-51 (FUD0900–FUD0909): casos que pasan sin diagnóstico o que no tienen caso de prueba.

## Alcance y convenciones

Cada apartado sigue el mismo esquema: qué se cuela, por qué importa, ejemplo mínimo en `.fud`, cómo detectarlo y qué código se propone (uno existente o uno nuevo).

Decisiones vigentes que acotan el documento:

- `atributo=@prop` sin comillas es la forma correcta (decisión 8 superada).
- Razor dentro de `<style>` ha desaparecido.
- `@raw` no está implementado.
- Nada se emite a ámbito de módulo: un `let` de zona neutra vive dentro de la función de render.

Los códigos propuestos como nuevos van de FUD0910 en adelante; son solo una sugerencia de numeración.

---

## A. Bypass de FUD0907 vía `.constructor`

FUD0907 bloquea los nombres `eval` y `Function`, pero `Function` se alcanza desde cualquier valor sin nombrarlo. En servidor no hay CSP que lo frene: es ejecución arbitraria de código desde la vista.

Cadenas que llegan a `Function`:

```fud
@* Una flecha con cuerpo de expresión está permitida; su constructor es Function. *@
<p>@((() => 1).constructor("return process.env")())</p>
@* Cualquier primitiva: String → Function. *@
<p>@("".constructor.constructor("return process")())</p>
<p>@([].constructor.constructor("return globalThis")())</p>
@* Un global de la lista blanca: Math.constructor es Object, Object.constructor es Function. *@
<p>@(Math.constructor.constructor("return this")())</p>
@* Una función importada o de la zona neutra. *@
<p>@(ayuda.constructor("return require('fs')")())</p>
@* Por el prototipo. *@
<p>@(Object.getPrototypeOf(ayuda).constructor("…")())</p>
<p>@(ayuda.__proto__.constructor("…")())</p>
@* Forma computada: el nombre no aparece como identificador. *@
<p>@(ayuda["constructor"]("…")())</p>
<p>@(ayuda["const" + "ructor"]("…")())</p>
```

Detección propuesta:

| Forma | Regla | Código |
|---|---|---|
| `x.constructor`, `x.__proto__`, `x.prototype` | Acceso a miembro con ese nombre, en cualquier posición de la vista y de `@{ }` | FUD0910 (nuevo) |
| `x["constructor"]` | Clave literal: misma regla que el punto anterior | FUD0910 |
| `x[expr]` con `expr` no literal | Decisión aparte: o se prohíbe el acceso computado con clave no numérica, o se acepta el agujero | Pendiente |
| `Object.getPrototypeOf`, `Object.setPrototypeOf` | Nombre de método sobre `Object` | FUD0910 |

El acceso computado con clave de tipo string no literal (`o[k]`) es el único que no se cierra con una regla sintáctica. Si se mantiene, hay que asumirlo en la spec como límite conocido.

---

## B. Escrituras no sintácticas

FUD0900 ve asignaciones, `++`/`--` y `delete`. Una llamada a un método mutador escribe igual y no la ve. El efecto es el mismo que motiva FUD0900: se ejecuta en cada pasada y en los dos lados, y el estado diverge entre servidor y cliente.

```fud
@* Ordena xs en sitio; cada render cambia el orden que verá el siguiente. *@
<p>@(xs.sort((a, b) => a.n - b.n).length)</p>
@* Mutadores de Array. *@
<p>@(s.push(4)) @(s.pop()) @(s.shift()) @(s.unshift(0)) @(s.splice(0, 1).length)</p>
<p>@(s.reverse().length) @(s.fill(0).length) @(s.copyWithin(0, 1).length)</p>
@* Map y Set. *@
<p>@(String(mapa.set("k", 1))) @(String(mapa.delete("k"))) @(String(conjunto.add(1)))</p>
@* Date. *@
<p>@(fecha.setFullYear(2000))</p>
@* Object: Object.assign muta el primer argumento; sobre Object.prototype es pollution global. *@
<p>@(String(Object.assign(o, { k: 2 })))</p>
@{ Object.assign(Object.prototype, { pwn: 1 }); }
@{ Object.defineProperty(o, "k", { value: 2 }); }
@* Regex con flag g o y declarada en zona neutra: test() muta lastIndex y alterna el resultado. *@
<p>@(re.test(data.titulo))</p>
```

El caso de la regex es el más silencioso: `const re = /x/g` en zona neutra, `@(re.test(...))` en dos sitios de la vista, y el segundo devuelve `false` en servidor y `true` en cliente según el orden de evaluación.

Detección propuesta: lista cerrada de métodos mutadores conocidos, por nombre, sobre cualquier receptor. Sin tipos: un `.push(` sobre un objeto propio con un método `push` que no muta también cae; es el precio de no depender de TypeScript.

| Receptor | Métodos |
|---|---|
| Array | `push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse`, `fill`, `copyWithin` |
| Map / Set / WeakMap / WeakSet | `set`, `add`, `delete`, `clear` |
| Date | todo `set*` (`setFullYear`, `setMonth`, `setDate`, `setHours`, `setTime`…) |
| Object (estático) | `assign`, `defineProperty`, `defineProperties`, `setPrototypeOf`, `freeze`, `seal`, `preventExtensions` |
| RegExp | `test`, `exec` cuando la regex lleva flag `g` o `y` (detectable si el literal está en el fichero) |
| Reflect | ya bloqueado por FUD0907 |

Código propuesto: FUD0911 (nuevo), subrayado sobre el nombre del método. Alternativa: extender FUD0900 con el mismo mensaje.

---

## C. Lecturas de `@server` / `@client` y `load` desde la vista

La vista prueba la escritura de nombres de `@server` y `@client` (FUD0901 sobre `deServidor` y `deCliente`), pero no la lectura. Un nombre de `@server` leído en la vista no existe en el bundle de cliente; uno de `@client` no existe en SSR. La hidratación rompe en el lado donde falta.

```fud
@* Solo existe en SSR. *@
<p>@deServidor</p>
@* Solo existe en cliente. *@
<p>@deCliente</p>
@* load es de @server: ni llamarlo ni leerlo. *@
<p>@(String(load))</p>
<p>@(load({ url: new URL("http://x") }).titulo)</p>
```

La descripción de FUD0907 dice que la lista blanca incluye "lo que declaran el fichero y el template". Si "el fichero" abarca las regiones `@server` y `@client`, los cuatro casos pasan sin diagnóstico y son errores. Si solo abarca la zona neutra, los cuatro deberían dar FUD0907 y falta el caso de prueba.

Propuesta: la lista blanca de lectura es zona neutra + template + `data` + globales comunes. Las regiones `@server` y `@client` son opacas para la vista en los dos sentidos. Código: FUD0907, subrayado sobre el nombre.

Caso derivado: un manejador `@click` que captura una variable declarada en un `@{ }` de la vista.

```fud
@{ const doble = data.n * 2; }
<button @click="@(() => total = doble)">x</button>
```

El manejador corre en cliente; `doble` se calculó en SSR. Si el cliente no re-ejecuta los `@{ }` al hidratar, `doble` no existe en el closure. No es un hueco de SDD-51 si el emit lo resuelve; conviene que la spec diga cuál de las dos cosas pasa.

---

## D. No determinismo servidor↔cliente

Ningún código de SDD-51 cubre una expresión que, sin escribir nada y usando solo globales de la lista blanca, devuelve valores distintos en SSR y en cliente. Es el mismo problema que FUD0907 atribuye a `typeof document`: ramificar según el lado rompe la hidratación. Aquí la rama no es explícita, es el valor.

```fud
@* Aleatorio. *@
<p>@(Math.random())</p>
@* Reloj: distinto en cada evaluación. *@
<p>@(Date.now()) @(new Date().toISOString()) @(performance.now())</p>
@* Un Symbol nuevo cada vez; su descripción sí es estable, él no. *@
<p>@(String(Symbol()))</p>
@* Locale implícito: el del servidor no es el del navegador. *@
<p>@(data.n.toLocaleString()) @(fecha.toLocaleDateString()) @("a".localeCompare("b"))</p>
<p>@(new Intl.NumberFormat().format(data.n)) @(new Intl.DateTimeFormat().format(fecha))</p>
@* En una key es doblemente grave: la reconciliación no encuentra el nodo. *@
@foreach (const f of xs) key (Math.random()) { <span>@f.id</span> }
```

`Math`, `Date`, `Intl`, `Symbol` y `performance` son globales comunes a los dos lados, así que FUD0907 los deja pasar. `crypto.randomUUID()` sí cae porque `crypto` está bloqueado.

Detección propuesta, por nombre:

| Expresión | Regla |
|---|---|
| `Math.random` | Siempre |
| `Date.now`, `new Date()` sin argumentos, `Date()` | Siempre; `new Date(x)` con argumento es determinista y pasa |
| `performance.now`, `performance.*` | Siempre (o quitar `performance` de la lista blanca) |
| `Symbol()` como llamada | Siempre; `Symbol.for(...)` y `Symbol.iterator` pasan |
| `toLocaleString`, `toLocaleDateString`, `toLocaleTimeString`, `localeCompare`, `toLocaleUpperCase`, `toLocaleLowerCase` | Sin primer argumento de locale |
| `new Intl.*Format(...)`, `Intl.Collator` | Sin primer argumento de locale |

Código propuesto: FUD0912 (nuevo), subrayado sobre la llamada. El mensaje debe decir que el valor cambia entre servidor y cliente, no que esté prohibido: con locale explícito o con fecha de `data` la expresión es válida.

---

## E. Contextos sin caso de prueba

Reglas ya existentes que la vista no ejercita en un contexto concreto. El riesgo no es que la regla falte, sino que la implementación no recorra ese nodo del AST y el caso pase en silencio.

| Contexto | Caso que falta | Código esperado |
|---|---|---|
| `@while` | `@while (n-- > 0) { <p>x</p> }` — ningún `@while` en la vista | FUD0900 |
| Property binding | `<input .value=@(a = 1)>` | FUD0900 |
| `style:` condicional | `<p style:color=@(n++)>` | FUD0900 |
| Template literal | escritura dentro de `${ }`: `` @(`x${n++}`) `` | FUD0900 |
| Valor por defecto | `<p>@(((v = n++) => v)())</p>` — solo se prueba con `window` (FUD0907), no con escritura | FUD0900 |
| Clave computada | `<p>@(Object.keys({ [n++]: 1 }).length)</p>` | FUD0900 |
| Flecha con coma | `<p>@(s.map(x => (total = x, x)).length)</p>` | FUD0900 + FUD0906 |
| `new Function` como texto | `<p>@(new Function("return 1")())</p>` — cae por el nombre, pero no hay caso | FUD0907 |
| Nombre `$` en `@{ }` | `@{ const $n1 = 1; }` — colisiona con el emit; en `@client` ya es error | Mismo código que en `@client` |
| Shadowing de `data` | `@{ const data = 1; }`, `@foreach (const data of xs) key (data) { }` | Decidir: error o permitido |
| Shadowing de global | `@{ const Math = 1; }`, `@{ let JSON = null; }` | Decidir |
| Variable de `@for` escrita desde el cuerpo | `@for (let i = 0; i < n; i++) key (i) { @{ i = 10; } }` — la vista la declara, así que FUD0901 no salta; rompe iteración y keys | Decidir: extender FUD0900 a variables de cabecera de bucle |
| Generador | `@{ function* g() {} }`, `<p>@((function* () {}).name)</p>` — FUD0905 cubre `function`, sin caso | FUD0905 |
| `namespace` / `declare` en `@{ }` | `@{ namespace N { export const x = 1; } }` — `namespace` tiene runtime; `enum` sí está, esto no | FUD0908 |
| `do…while` y `switch` con fall-through en `@{ }` | `@{ do {} while (false); }`, `@{ switch (n) { case 1: case 2: break; } }` — decidir si están permitidos | Decidir |
| Snippet escribiendo fuera | `@{ total = 1; }` dentro del cuerpo de un snippet: cada `@render` muta el estado del padre; el resultado depende del orden de render | Decidir |

Sobre la variable de `@for`: la regla actual de FUD0901 ("solo se reasigna lo que declara el template") hace válido escribir `i` desde el cuerpo. Es coherente con la regla y a la vez un error funcional. Propuesta: las variables declaradas en cabecera de `@for`/`@foreach` se tratan como `const` dentro del cuerpo.

---

## F. DoS en servidor

La vista se ejecuta en SSR por cada petición. Un bucle que no termina o una recursión sin salida bloquean el worker. FUD0908 prohíbe `break` fuera de un bucle propio, pero no mira si el bucle propio puede terminar.

```fud
@* Condición constante o ausente. *@
@{ for (;;) {} }
@{ while (true) {} }
@{ while (1) {} }
@{ do {} while (true); }
@* En la sintaxis Razor. *@
@while (true) { <p>x</p> }
@* Bucle cuya condición solo depende de algo que el cuerpo no puede escribir. *@
@while (constante > 0) { <p>x</p> }
```

Snippets:

```fud
@* snippets.fud: fila se renderiza a sí misma sin condición de salida. *@
@snippet fila(f: Fila) {
  <li>@f.id @render fila(f)</li>
}
```

Detección propuesta:

| Caso | Regla | Código |
|---|---|---|
| `for (;;)`, `while (true)`, `while (1)`, `do…while (true)` en `@{ }` | Condición ausente o literal truthy | FUD0913 (nuevo) |
| `@while (literal truthy)` | Igual | FUD0913 |
| `@while (cond)` donde `cond` solo lee nombres que ningún `@{ }` del cuerpo escribe | Análisis de escrituras del cuerpo; si el cuerpo no escribe nada que la condición lea, el bucle es infinito o de cero vueltas | FUD0913 |
| `@render` que forma un ciclo en el grafo de snippets | Ciclo directo o indirecto entre snippets | FUD0914 (nuevo) |

El ciclo entre snippets puede ser legítimo (un árbol con `@if (f.next) { @render fila(f.next) }`). Si se admite, la regla debe exigir que la llamada recursiva esté bajo un `@if` o un `@foreach`; una llamada recursiva incondicional sigue siendo error.

Queda fuera: ReDoS. Una regex como `/(a+)+$/` sobre texto de `data` cuelga el servidor y no es detectable por sintaxis. Mención en la spec como límite conocido.

---

## G. XSS fuera de `on*`

FUD0909 cierra un vector (atributos `on*`) con el argumento de que la CSP los bloquea siempre. El mismo argumento vale para otros tres vectores que la vista no toca, y hay un cuarto que la CSP no bloquea.

### G.1 URLs `javascript:` y contenido HTML en atributos estáticos

La CSP con `script-src` sin `unsafe-inline` bloquea también las URLs `javascript:`. Un valor estático es detectable igual que `onclick="…"`.

```fud
<a href="javascript:alert(1)">x</a>
<form action="javascript:alert(1)"></form>
<button formaction="javascript:alert(1)">x</button>
<iframe src="javascript:alert(1)"></iframe>
<svg><a xlink:href="javascript:alert(1)"><text>x</text></a></svg>
@* srcdoc es HTML completo con su propio contexto. *@
<iframe srcdoc="<img src=x onerror=alert(1)>"></iframe>
@* meta refresh y base no son script: la CSP no los frena. Redirección y secuestro de rutas relativas. *@
<meta http-equiv="refresh" content="0;url=https://atacante">
<base href="https://atacante/">
```

Regla propuesta: valor estático que, tras recortar espacios y decodificar entidades, empieza por `javascript:` (sin distinguir mayúsculas) en `href`, `src`, `action`, `formaction`, `xlink:href`, `data` (de `<object>`), `codebase`; `srcdoc` en cualquier caso; `<meta http-equiv="refresh">` y `<base>` en componentes (en página, decisión aparte). Código: FUD0909 extendido o FUD0915 (nuevo), subrayado sobre el atributo.

Valor dinámico (`href=@data.url`) no es detectable. Complemento en runtime: el emit de atributos URL rechaza los esquemas `javascript:` y `data:` al serializar. No es un diagnóstico; es contrato del emit.

### G.2 Property bindings que inyectan HTML

La decisión 25 cita `.innerHTML` como ejemplo válido de property binding. Sin `@raw`, es la única vía por la que un string llega al DOM sin escapar, y no tiene marcador de tipo.

```fud
<div .innerHTML=@data.descripcion></div>
<div .outerHTML=@data.x></div>
<iframe .srcdoc=@data.x></iframe>
```

Propuesta: prohibir `.innerHTML`, `.outerHTML` y `.srcdoc` como property binding hasta que exista un marcador de tipo (`TrustedHTML`) que el compilador compruebe. Código: FUD0916 (nuevo).

### G.3 Propiedades `on*` sobre elementos nativos

La vista marca `.onSave=@ayuda` como correcto porque es una prop de componente. Sobre un elemento nativo la misma sintaxis asigna un manejador por propiedad, y la CSP **no** bloquea manejadores asignados por propiedad: solo los atributos.

```fud
<img src="/x.png" .onerror=@ayuda>
<button .onclick=@(() => total++)>x</button>
```

Funcionalmente equivale a `@click`, que ya existe. Dos opciones: prohibirlo sobre elementos nativos para que haya una sola forma (FUD0909 extendido, necesita saber si el tag es nativo o componente, cosa que ya resuelve la decisión 41), o documentarlo como sinónimo. En componentes (`.onSave`) sigue siendo una prop.

### G.4 `<script>` inline y la CSP

La decisión 43 permite `<script>` raw en componentes y páginas. Si la CSP bloquea `on*` "siempre", bloquea igual un `<script>` inline sin `nonce` o hash. O el emit añade `nonce` a cada `<script>` que encuentra (y la CSP lo lleva), o la decisión 43 produce scripts que nunca se ejecutan. No es un código de SDD-51; es una incoherencia entre dos decisiones que conviene cerrar.

---

## H. Fuga de información

Dos formas de volcar al HTML cosas del servidor que no son `data`.

```fud
@* stack contiene rutas absolutas del servidor y nombres de ficheros del bundle. *@
<p>@(new Error("x").stack)</p>
@* Coerción de función a string: el código fuente de la función, en el HTML. *@
<p>@(String(ayuda))</p>
<p>@(ayuda + "")</p>
<p>@(ayuda.toString())</p>
```

El segundo caso además rompe la hidratación: el fuente de `ayuda` en el bundle SSR y en el de cliente no es el mismo texto. La decisión 19 solo frena `@ayuda` (interpolación directa de una no-primitiva); cualquier coerción explícita pasa.

La propia vista de errores usa `String(fetch)`, `String(console)`, etc. como vehículo para probar FUD0907. Funciona porque el nombre está bloqueado, pero muestra que `String(fn)` es una construcción que el compilador acepta.

Detección propuesta:

| Caso | Regla | Código |
|---|---|---|
| `.stack` | Acceso al miembro `stack` | FUD0917 (nuevo) |
| `String(x)`, `x.toString()`, `x + ""`, `` `${x}` `` donde `x` es función | Requiere tipo. Sin tipos: solo cuando `x` es un identificador declarado como función (`function f`, `const f = () =>`, import de función) en el fichero | FUD0917 |

Sin TypeScript en la regla, el segundo caso queda parcial. Es asumible: lo que se protege es el código del propio fichero y sus imports, que el compilador sí conoce.

---

## I. Escapes de tipo TS

Solo aplica si alguna regla de SDD-51 se apoya en tipos de TypeScript (por ejemplo, para saber que `.push` muta un array o que `x` es una función). En ese caso, estas construcciones la anulan:

```fud
<p>@((data as any).constructor.constructor("…")())</p>
<p>@((xs as unknown as { sort(): number }).sort())</p>
@{
  // @ts-ignore
  total = noExiste;
}
@{
  // @ts-expect-error
  deCliente = 2;
}
```

Si todas las reglas son sintácticas sobre el AST de Oxc, esta sección no aplica y puede borrarse. Si alguna usa tipos, hay que prohibir `as any`, `as unknown as`, `satisfies any`, `<any>x`, `!` sobre `any`, y los comentarios `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` dentro de `@( )` y `@{ }`. Código: FUD0918 (nuevo).

---

## J. Pregunta abierta: `@{ }` y `@click` sobre un `let` neutro

El caso marcado como válido en la vista es `@{ total = a + b; }`, y en el cierre `@click="@(() => total++)"`. Como todo se emite dentro de una función, `total` es local a cada render: no hay estado compartido entre peticiones ni entre instancias. Queda una pregunta de semántica, no de seguridad.

`@{ total = a + b; }` muta el `total` del render SSR. `@click` muta el `total` del cliente. Si el cliente no re-ejecuta los `@{ }` de la vista al hidratar, el manejador parte de `let total = 0`, no del valor que dejó el servidor. Si sí los re-ejecuta, los dos lados coinciden y no hay nada que señalar.

La spec de SDD-51 debería decir cuál de las dos cosas pasa, porque decide si escribir un `let` neutro desde `@{ }` es un patrón recomendable o una trampa.

---

## Índice de códigos propuestos

| Código | Sección | Resumen |
|---|---|---|
| FUD0910 | A | Acceso a `constructor`, `__proto__`, `prototype`, `Object.getPrototypeOf/setPrototypeOf` |
| FUD0911 | B | Llamada a método mutador conocido |
| FUD0912 | D | Expresión no determinista entre servidor y cliente |
| FUD0913 | F | Bucle sin condición de salida |
| FUD0914 | F | Ciclo incondicional entre snippets |
| FUD0915 | G.1 | URL `javascript:`, `srcdoc`, `<meta refresh>`, `<base>` estáticos |
| FUD0916 | G.2 | Property binding `.innerHTML` / `.outerHTML` / `.srcdoc` |
| FUD0917 | H | `.stack` y coerción de función a string |
| FUD0918 | I | Escapes de tipo TS (solo si alguna regla usa tipos) |
