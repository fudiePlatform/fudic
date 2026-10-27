# SDD-61 — Anexo: cómo se traduce la vista a cada lenguaje

> **Normativo.** Parte de [SDD-61](./SDD-61-vista-portable.md). Fija la bajada de cada fila de la
> lista blanca (SDD-61 §3) a TS, C#, Java, Go, Rust y Python. Fija también las propuestas para la
> desestructuración y el resto, que es donde los lenguajes más se separan, y las funciones del
> runtime de fudic que cada lenguaje implementa una vez.
>
> **TS** es el emit de hoy (`examples/basic/.fudic/edge/`) con los cambios de SDD-61 §4.4. **Los
> demás** son el contrato del emisor de cada lenguaje: las mismas llamadas sobre `$dom` (IDEA-06
> §10.8) con otra sintaxis. La [suite de conformidad](./SDD-61-vista-portable.md#46-la-suite-de-conformidad)
> fija los bytes que todos tienen que dar.

---

## A.1. Principios

1. **Mismo resultado, no misma sintaxis.** Una fila se baja como haga falta en cada lenguaje
   (temporales, `if` en lugar de ternario, `while` en lugar de `for`) mientras el HTML sea el mismo.
2. **Orden de evaluación de JS:** de izquierda a derecha y cada expresión **una sola vez**. Si la
   bajada necesita un operando dos veces (`a ?? b` en Java), lo guarda en un temporal. Hay
   cortocircuito en `&&`, `||`, `??`, `?.` y `? :`.
3. **Números.** Todo `number` de la vista es `f64` (IEEE 754 doble), también los literales
   enteros y los campos con ancho del `.fudapi` al leerse en la vista. Ninguna operación lanza:
   `1/0` es `Infinity` y `0/0` es `NaN`, como en JS.
4. **Presencia.** `null` y `undefined` son el mismo «ausente». Cada lenguaje usa su forma de
   ausencia: `null` (C#, Java), puntero `nil` (Go), `Option` (Rust), `None` (Python).
5. **Nombres.**
   - Cada nombre que declara el template (`@{ }`, cabecera de bucle, desestructuración) se
     renombra a uno único por función de render: `slug_1`, `slug_2`. El sombreado se resuelve al
     compilar, así que da igual que Python no tenga scope de bloque.
   - Los temporales del compilador se llaman `t0`, `t1`… y los nodos `n0`, `n1`…
   - En TS los nombres no se tocan: JS tiene scope de bloque.
6. **Campos.** `post.title` se escribe con la convención de los tipos que genera ese backend
   desde el `.fudapi`:
   - `post.Title` en C# y Go;
   - `post.title()` en Java, con records;
   - `post.title` en Rust y Python.
7. **Valores reactivos.** En el servidor no hay reactividad:
   - una señal es una variable con su valor inicial;
   - un `computed` es una variable calculada una vez, en su sitio del `@code`;
   - `effect` no existe;
   - leer `x()` es leer `x`.
8. **Sin reflexión.** Los tipos se conocen al compilar: acceso directo a campos, sin mapas
   genéricos ni introspección.
9. **El runtime se llama `fud`** en todos: clase estática `Fud` (C#, Java), paquete `fud` (Go),
   crate `fud` (Rust) y módulo `fud` (Python).

## A.2. Tabla de bajada

### Tipos

| Vista (TS) | C# | Java | Go | Rust | Python |
|---|---|---|---|---|---|
| `string` | `string` | `String` | `string` | `String` (`&str` al leer) | `str` |
| `number` | `double` | `double` | `float64` | `f64` | `float` |
| `boolean` | `bool` | `boolean` | `bool` | `bool` | `bool` |
| `Date` | `DateTimeOffset` | `Instant` | `time.Time` | `fud::Date` (ms UTC) | `datetime` (UTC) |
| `T \| null`, `x?: T` | `T?` | `T` con `null` (`Double`, `Boolean` en caja) | `*T` | `Option<T>` | `Optional[T]` |
| `readonly T[]` | `IReadOnlyList<T>` | `List<T>` | `[]T` | `Vec<T>` (`&[T]` al leer) | `list[T]` |
| `Record<K, V>` | `IReadOnlyDictionary<K, V>` | `Map<K, V>` | `map[K]V` | `HashMap<K, V>` | `dict[K, V]` |
| Unión de literales / `enum` | `enum` generado | `enum` generado | tipo `string` generado con constantes | `enum` generado | `Enum` generado |
| `type` del `.fudapi`, `$Props` | `record` generado | `record` generado | `struct` generado | `struct` generado | `@dataclass` generado |

### Valores y operadores

| Vista | TS | C# | Java | Go | Rust | Python |
|---|---|---|---|---|---|---|
| `"txt"` | igual | `"txt"` | `"txt"` | `"txt"` | `"txt"` | `"txt"` |
| `3.5`, `0x10`, `1_000` | igual | `3.5`, `16.0`, `1000.0` | `3.5`, `16.0`, `1000.0` | `3.5`, `16.0`, `1000.0` | `3.5_f64`, `16.0`, `1000.0` | `3.5`, `16.0`, `1000.0` |
| `true` / `false` | igual | `true` / `false` | `true` / `false` | `true` / `false` | `true` / `false` | `True` / `False` |
| `x === null`, `x === undefined` | `x == null` | `x is null` | `x == null` | `x == nil` | `x.is_none()` | `x is None` |
| `x !== null` | `x != null` | `x is not null` | `x != null` | `x != nil` | `x.is_some()` | `x is not None` |
| `a === b` (primitivos) | `a === b` | `a == b` | `a == b` (`double`, `boolean`); `a.equals(b)` (`String`) | `a == b` | `a == b` | `a == b` |
| `a !== b` | `a !== b` | `a != b` | `a != b`; `!a.equals(b)` | `a != b` | `a != b` | `a != b` |
| `a + b` (números) | igual | `a + b` | `a + b` | `a + b` | `a + b` | `a + b` |
| `a + b` (texto) | igual | `a + Fud.Str(b)` | `a + Fud.str(b)` | `a + fud.Str(b)` | `format!("{}{}", a, fud::str(b))` | `a + fud.str(b)` |
| `a - b`, `a * b`, `-a` | igual | igual | igual | igual | igual | igual |
| `a / b` | igual | `a / b` | `a / b` | `a / b` (el emisor nunca pliega constantes) | `a / b` | `fud.div(a, b)` |
| `a % b` | igual | `a % b` | `a % b` | `math.Mod(a, b)` | `a % b` | `fud.mod(a, b)` |
| `a < b` … `>=` (números) | igual | igual | igual | igual | igual | igual |
| `a < b` (textos) | igual | `string.CompareOrdinal(a, b) < 0` | `a.compareTo(b) < 0` | `fud.Compare16(a, b) < 0` | `fud::compare16(&a, &b) < 0` | `fud.compare16(a, b) < 0` |
| `a < b` (fechas) | igual | `a < b` | `a.isBefore(b)` | `a.Before(b)` | `a < b` | `a < b` |
| `a && b`, `a \|\| b`, `!a` | igual | igual | igual | igual | igual | `a and b`, `a or b`, `not a` |
| `a ?? b` | igual | `a ?? b` | `(t0 = a) != null ? t0 : b` | `t0 := b; if a != nil { t0 = *a }` | `a.unwrap_or_else(\|\| b)` | `t0 if (t0 := a) is not None else b` |
| `c ? a : b` | igual | `c ? a : b` | `c ? a : b` | `t0 := b; if c { t0 = a }` | `if c { a } else { b }` | `a if c else b` |
| `` `a${x}b` `` | igual | `"a" + Fud.Str(x) + "b"` | `"a" + Fud.str(x) + "b"` | `"a" + fud.Str(x) + "b"` | `format!("a{}b", fud::str(x))` | `"a" + fud.str(x) + "b"` |

- En Go, el `??` y el ternario evalúan `b` antes que `a`. Solo vale si `b` es un literal o un
  nombre; si no, se escribe con `if … else` completo.
- `Str(x)` es `x` si es texto y `Num(x)` si es número (A.4). El pase tipado garantiza que no le
  llega otra cosa.
- **Texto con `<`, `<=`, `>`, `>=`.** C# (`CompareOrdinal`) y Java (`compareTo`) ya comparan por
  unidades UTF-16, como JS. Go, Rust y Python comparan por bytes UTF-8 o por puntos de código, que
  ordenan distinto un carácter fuera del plano básico frente a uno entre `U+E000` y `U+FFFF`
  (`"😀" < "～"` es `true` en JS y `false` en Go). Por eso usan `Compare16` del runtime (A.4).
  `<=` es `<= 0`, y así los demás.
- **Fechas.** En Java, `a <= b` es `!a.isAfter(b)` y `a >= b` es `!a.isBefore(b)`.

### Acceso

| Vista | TS | C# | Java | Go | Rust | Python |
|---|---|---|---|---|---|---|
| `a.b` | igual | `a.B` | `a.b()` | `a.B` | `a.b` | `a.b` |
| `a?.b` | igual | `a?.B` | `a == null ? null : a.b()` | `if a != nil { t0 = &a.B }` | `a.as_ref().map(\|a\| &a.b)` | `a.b if a is not None else None` |
| `xs[i]` | igual | `Fud.At(xs, i)` | `Fud.at(xs, i)` | `fud.At(xs, i)` | `fud::at(&xs, i)` | `fud.at(xs, i)` |
| `m[k]` | igual | `Fud.Get(m, k)` | `m.get(k)` | `fud.Get(m, k)` | `m.get(&k)` | `m.get(k)` |

### Colecciones (SDD-61 §3.5 bis)

| Vista | TS | C# | Java | Go | Rust | Python |
|---|---|---|---|---|---|---|
| `xs.length` | igual | `(double) xs.Count` | `(double) xs.size()` | `float64(len(xs))` | `xs.len() as f64` | `float(len(xs))` |
| `s.length` (texto) | igual | `(double) s.Length` | `(double) s.length()` | `fud.Len16(s)` | `fud::len16(&s)` | `fud.len16(s)` |
| `xs.filter(x => c)` | igual | `xs.Where(x => c).ToList()` | `xs.stream().filter(x -> c).toList()` | `fud.Filter(xs, func(x T) bool { return c })` | `xs.iter().filter(\|x\| c).cloned().collect::<Vec<_>>()` | `[x for x in xs if c]` |
| `xs.map(x => e)` | igual | `xs.Select(x => e).ToList()` | `xs.stream().map(x -> e).toList()` | `fud.Map(xs, func(x T) U { return e })` | `xs.iter().map(\|x\| e).collect::<Vec<_>>()` | `[e for x in xs]` |
| `xs.reduce((acc, x) => e, v)` | igual | `xs.Aggregate(v, (acc, x) => e)` | `Fud.reduce(xs, v, (acc, x) -> e)` | `fud.Reduce(xs, v, func(acc U, x T) U { return e })` | `xs.iter().fold(v, \|acc, x\| e)` | `functools.reduce(lambda acc, x: e, xs, v)` |
| `xs.toSorted((a, b) => e)` | igual | `xs.OrderBy(x => x, Comparer<T>.Create((a, b) => Fud.Cmp(e))).ToList()` | `xs.stream().sorted((a, b) -> Fud.cmp(e)).toList()` | `fud.Sorted(xs, func(a, b T) float64 { return e })` | `fud::sorted(&xs, \|a, b\| e)` | `sorted(xs, key=functools.cmp_to_key(lambda a, b: fud.cmp(e)))` |
| Con índice: `xs.filter((x, i) => c)`, `map((x, i) => e)`, `reduce((acc, x, i) => e, v)` | igual | `Fud.FilterI`, `Fud.MapI`, `Fud.ReduceI` | `Fud.filterI`, `Fud.mapI`, `Fud.reduceI` | `fud.FilterI`, `fud.MapI`, `fud.ReduceI` | `fud::filter_i`, `fud::map_i`, `fud::reduce_i` | `fud.filter_i`, `fud.map_i`, `fud.reduce_i` |

- **Mismo resultado, por construcción.**
  - Las flechas de la vista no escriben nada (SDD-61 §3.5 bis), así que da igual que una bajada sea
    perezosa (`Where` de C#, `stream` de Java) o inmediata: el resultado es el mismo.
  - Todas devuelven una lista nueva y no tocan la original.
  - `OrderBy` (C#), `sorted` de `stream` (Java), `slices.SortStableFunc` (Go, dentro de
    `fud.Sorted`), `sort_by` (Rust, dentro de `fud::sorted`) y `sorted` (Python) son **estables**,
    como `toSorted` de JS. `List.Sort` de C# no lo es: nunca se usa.
  - El comparador de la vista da un `number`; `Cmp` lo convierte al signo que pide cada lenguaje
    (`NaN` y `0` → `0`).
- **El índice es `f64`**, como cualquier número de la vista. Las variantes con índice del runtime
  lo pasan ya convertido; por eso no se usa el `Where((x, i) => …)` de C#, que lo da como `int`.
- **El cuerpo de la flecha** se baja con las mismas filas de este anexo. Donde el lenguaje no tiene
  ternario dentro de una lambda (Go), el cuerpo se escribe con `if` y `return`; en Rust, con `if`
  como expresión.
- **Java captura solo variables efectivamente finales.** Si la flecha lee una variable `let` de un
  `@{ }` que se reasigna, el emisor la copia a un `final` temporal justo antes de la llamada.
- **`filter(…).length`** se puede bajar a un recuento sin lista intermedia (`Count(c)` en C#,
  `count()` en Java y Rust, `sum(1 for …)` en Python). Es una optimización del emisor, y da el mismo
  número.

### Lo que se pinta

| Vista | TS | Los demás |
|---|---|---|
| `@(x)` en texto | `$dom.text(String(x ?? ""))` | `dom.Text(Fud.Text(x))`: texto tal cual, número con `Num`, booleano `"true"`/`"false"`, ausente `""` |
| `attr=@x` | `$dom.setAttr(n, "attr", …)` | `dom.SetAttr(n, "attr", …)`, con la misma conversión; un booleano `true` es `""` y `false` o ausente no escribe nada |
| Atributo URL sin origen fijo | `$dom.setUrl(n, "href", x)` | `dom.SetUrl(n, "href", x)` |
| `x()` (señal, `computed`, `Readable`) | igual | La variable `x` |
| `form.$valid()`, `form.$issues()`, `campo.errors()`, `campo()` | igual | El runtime de forms portado: `form.Valid`, `form.Issues`, `campo.Errors`, `campo.Value` |
| `x \| preset` | `$format(preset, x, "es")` | `Fud.Format(preset, x, "es")` |
| `t("…")` | El literal del idioma | El literal del idioma; con huecos, `Fud.Message(partes, args, "es")` |
| `<app-x .a=@e>` | `render$N($dom, $dom.attachShadow(n), { "a": e }, $ioc)` | `AppX.Render(dom, dom.AttachShadow(n), new AppXProps(A: e), ioc)` |

### Control

| Vista | TS | C# / Java | Go | Rust | Python |
|---|---|---|---|---|---|
| `@if … else if … else` | igual | `if / else if / else` | `if / else if / else` | `if / else if / else` | `if / elif / else` |
| `@switch` sobre texto o enum | igual | `switch` | `switch` | `match` | `if / elif / else` |
| `@switch` sobre número | igual | `if / else if` | `switch` | `if / else if` | `if / elif / else` |
| `@foreach (const x of xs) { } @empty { }` | `let any0 = false; for (const x of xs) { any0 = true; … } if (!any0) { … }` | `var any0 = false; foreach (var x in xs) { any0 = true; … } if (!any0) { … }` (`for (var x : xs)` en Java) | `any0 := false; for _, x := range xs { any0 = true; … }; if !any0 { … }` | `let mut any0 = false; for x in xs.iter() { any0 = true; … } if !any0 { … }` | `any0 = False` · `for x in xs:` · `if not any0:` |
| `@for (let i = 0; c; i++) { }` | igual | `for (double i = 0; c; i++) { }` | `for i := 0.0; c; i++ { }` | `let mut i = 0.0; while c { …; i += 1.0; }` | `i = 0.0` · `while c:` · `…` · `i += 1` |
| `@while (c) { }` | igual | `while (c) { }` | `for c { }` | `while c { }` | `while c:` |
| `@empty` en `@for` / `@while` | el mismo indicador `any0` | igual | igual | igual | igual |

- El paso del `@for` va al final del cuerpo: la vista no tiene `continue` que lo salte.
- `@empty` lleva siempre indicador. En `@foreach` no se pregunta el tamaño de `xs`: así los tres
  bucles se bajan igual.

### `@{ }`

| Vista | TS | C# | Java | Go | Rust | Python |
|---|---|---|---|---|---|---|
| `@{ const x = e; }` | igual | `var x_1 = e;` | `final var x_1 = e;` | `x_1 := e` | `let x_1 = e;` | `x_1 = e` |
| `@{ let x = e; x = f; }` | igual | `var x_1 = e; x_1 = f;` | `var x_1 = e; x_1 = f;` | `x_1 := e; x_1 = f` | `let mut x_1 = e; x_1 = f;` | `x_1 = e` · `x_1 = f` |

La desestructuración tiene su propia sección (A.3).

### El `@code` que el servidor evalúa

| `@code` | Todos los lenguajes salvo TS (TS: como hoy, salvo el defecto de una prop: `b ??= (d)`, SDD-61 §4.4) |
|---|---|
| `const { a, b = d } = props<T>()` | El parámetro `p` de la función de render (el `record` de props generado); `a` es `p.A`, y `b` es `p.B ?? d`, también en TS |
| `signal(v)` | `var x = v` |
| `computed(() => e)` | `var x = e`, en el orden del `@code` |
| `effect(…)` | Nada |
| `now()` | `Fud.Now()` |
| `inject(Token)` | La resolución del token en el contenedor de fudic de ese runtime (pieza 7 de IDEA-03 §5), conectado al DI del anfitrión |
| `provide(Token, factoría)` | Nada al pintar: el anfitrión registra su implementación del token por nombre |
| `trustedUrl(s)`, `trustedHtml(s)` | `Fud.TrustedUrl(s)`, `Fud.TrustedHtml(s)` |
| `date({ … })` y los demás presets | Un preset de datos del runtime con las mismas opciones (`kind` + `options`) |
| Store importado | Una variable del módulo generado para el store, con su valor inicial |
| Módulo de datos | El literal, generado como constante del tipo con nombre |
| Literal de datos con tipo | El constructor del tipo generado: `new Nodo(…)`, `Nodo{…}`, `Nodo(…)` |

## A.3. Desestructuración y resto

### A.3.1. Por qué duele

Desestructurar **sin resto** es azúcar en todos los lenguajes: `const { a, b } = x` son dos
lecturas de campo. El resto no: `const { slug, ...resto } = post` crea **un objeto nuevo** cuyo
tipo es «`Post` sin `slug`».

- **TS** lo tiene gratis, porque sus tipos son estructurales.
- **C#, Java, Go y Rust** no tienen tipos anónimos estructurales: ese tipo no existe y alguien
  tendría que declararlo.
- **Python** no tendría problema con el objeto, pero tampoco puede tiparlo.

Y ese objeto se usa para lo que más importa en un componente: **reenviar props**
(`<app-ficha ...resto>`) y **pasar atributos** a un nativo (`<input ...resto>`, SDD-55).

### A.3.2. Tres propuestas

| | A. Alias del origen (**elegida**) | B. Tipo generado | C. Diccionario en runtime |
|---|---|---|---|
| Qué es `resto` | Nada en runtime: el compilador recuerda «`post` menos `slug`» | Un tipo `PostSinSlug` generado y una copia de los campos | `Dictionary<string, object>`, `Map<String, Object>`, `map[string]any`… |
| `resto.title` | `post.title` | `resto.title` | `(string) resto["title"]` |
| `<app-x ...resto>` | Una asignación por prop de `app-x` que esté en el resto | Igual, desde la copia | Recorrido de claves en runtime |
| `<input ...resto>` | Un `SetAttr` por campo del resto, generado según su tipo | Igual, desde la copia | Recorrido y conversión por tipo en runtime |
| Coste | Cero: ni objeto, ni tipo, ni copia | Un tipo por cada sitio con resto y una asignación por render | Cajas, *casts* y conversión dinámica |
| Tipado | Completo | Completo | Se pierde |
| AOT y sin reflexión | Sí | Sí | No (`object`, `any`) |
| Lo que impide | Usar `resto` entero como valor (`FUD1147`) | Nada | Nada |

**Por qué A.**
- Cubre los dos usos reales (reenviar props y atributos) sin coste.
- No genera tipos que el desarrollador del backend vería aparecer y desaparecer al tocar una vista.
- Lo único que pierde es pasar `resto` entero como valor (`.datos=@resto`). Eso se escribe mejor
  con un `type` del `.fudapi`: el dato ya tiene nombre, y el componente hijo lo declara.

**B queda como la salida** si un día se levanta `FUD1147`: los usos de A no cambian, y solo
`resto` como valor necesitaría su tipo generado.

**C se descarta:** choca con AOT y pierde los tipos que el contrato garantiza.

### A.3.3. Las reglas de la propuesta A

1. **El origen se evalúa una vez.** Si no es un nombre (`data.posts[0]`, un campo anidado), va
   a un temporal `t0`, y todo lo demás lee de él.
2. **El resto es un conjunto estático de claves:** los campos del tipo del origen menos los que el
   patrón nombra. Se resuelve al compilar con el tipo, que es portable (SDD-61 §3.10): un `type`
   del `.fudapi` o unas props.
3. **Usos que valen** (SDD-61 §3.6):
   - `resto.k`, que se baja a `t0.k`;
   - `<app-x ...resto>` y `<input ...resto>`;
   - desestructurar el resto (`const { b, ...r2 } = resto`): `r2` es el origen menos `slug` y `b`.
4. **Defectos.** `{ k = d }` vale `t0.k` si está presente y `d` si falta (`null` o `undefined`), en
   todos los lenguajes, TS incluido (SDD-61 §4.4).
5. **Spread en un componente** (props-spec 146–149):
   - una prop por cada clave del `T` del hijo que esté en el resto;
   - un `.prop` explícito gana su clave, esté donde esté;
   - con dos spreads, gana el posterior en las claves que **tiene** (no ausente);
   - lo que no llega toma el defecto del hijo.
6. **Spread en un nativo** (props-spec 157), por campo del resto y según su tipo:

   | Tipo del campo | Escribe |
   |---|---|
   | `string` | su texto; con presencia (`string?`), solo si está |
   | `number` | `Num(v)`; con presencia, solo si está |
   | `boolean` | `""` si es `true`; nada si es `false` o falta |
   | `TrustedURL` en un atributo URL | su texto |
   | `string` en un atributo URL | por la guarda (`SetUrl`) |
   | objeto, lista, `map`, `Date`, función | nada: no se genera código |
   | nombre `on…` | nada (decisión 139) |
   | nombre que el elemento escribe a mano | nada: gana el explícito |

   - **Orden: alfabético por nombre** (orden de unidades UTF-16), en el sitio del primer spread
     del elemento. Los atributos explícitos van en su sitio. El TS de hoy ordena igual
     (SDD-61 §4.4).
   - **Con dos spreads**, para una clave que tienen los dos gana el posterior si **escribe**: un
     `false` o una ausencia del posterior deja pasar el anterior.
7. **No se desestructura** un `map`, una lista ni nada sin tipo con nombre (`FUD1153`), y un patrón
   no lleva claves calculadas (`{ [k]: v }`) ni forma de array (`FUD1146`).

### A.3.4. Los casos, en los seis lenguajes

Datos de todos los casos:

```
# src/routes/blog/index.fudapi (extracto)
type Post
  slug      str
  title     str
  summary   str
  tag       str
  featured  bool?
  author    Author

type Author
  name  str
  web   str?
```

#### D1 · Campos, renombre y defecto

```
@foreach (const { slug, title: titulo, featured = false } of data.posts) key (slug) { … }
```

```js
// TS
for (const t0 of data.posts) {
  const slug = t0.slug, titulo = t0.title, featured = t0.featured ?? false;
```

```csharp
// C#
foreach (var t0 in data.Posts) {
    var slug_1 = t0.Slug; var titulo_1 = t0.Title; var featured_1 = t0.Featured ?? false;
```

```java
// Java
for (var t0 : data.posts()) {
    var slug_1 = t0.slug(); var titulo_1 = t0.title();
    var featured_1 = t0.featured() != null ? t0.featured() : false;
```

```go
// Go
for _, t0 := range data.Posts {
    slug_1 := t0.Slug
    titulo_1 := t0.Title
    featured_1 := false
    if t0.Featured != nil { featured_1 = *t0.Featured }
```

```rust
// Rust
for t0 in data.posts.iter() {
    let slug_1 = &t0.slug;
    let titulo_1 = &t0.title;
    let featured_1 = t0.featured.unwrap_or(false);
```

```python
# Python
for t0 in data.posts:
    slug_1 = t0.slug
    titulo_1 = t0.title
    featured_1 = t0.featured if t0.featured is not None else False
```

#### D2 · Anidado

```
@foreach (const { author: { name, web = "" } } of data.posts) key (name) { … }
```

```js
// TS
for (const t0 of data.posts) {
  const t1 = t0.author, name = t1.name, web = t1.web ?? "";
```

```csharp
// C#
foreach (var t0 in data.Posts) {
    var t1 = t0.Author; var name_1 = t1.Name; var web_1 = t1.Web ?? "";
```

```java
// Java
for (var t0 : data.posts()) {
    var t1 = t0.author(); var name_1 = t1.name();
    var web_1 = t1.web() != null ? t1.web() : "";
```

```go
// Go
for _, t0 := range data.Posts {
    t1 := t0.Author
    name_1 := t1.Name
    web_1 := ""
    if t1.Web != nil { web_1 = *t1.Web }
```

```rust
// Rust
for t0 in data.posts.iter() {
    let t1 = &t0.author;
    let name_1 = &t1.name;
    let web_1 = t1.web.as_deref().unwrap_or("");
```

```python
# Python
for t0 in data.posts:
    t1 = t0.author
    name_1 = t1.name
    web_1 = t1.web if t1.web is not None else ""
```

#### D3 · Resto leído por campo, y resto de un resto

```
@{ const { slug, ...resto } = data.posts[0]; }
<h2>@resto.title</h2>
@{ const { title, ...sinTitulo } = resto; }
<p>@sinTitulo.tag</p>
```

`resto` es «`Post` menos `slug`» y `sinTitulo` es «`Post` menos `slug` y `title`». Ninguno existe
en runtime fuera de TS: los dos son `t0`.

```js
// TS: the rest is a real object, as today
const { slug, ...resto } = data.posts[0];
$dom.append(n0, $dom.text(String(resto.title ?? "")));
const { title, ...sinTitulo } = resto;
$dom.append(n1, $dom.text(String(sinTitulo.tag ?? "")));
```

```csharp
// C#
var t0 = Fud.At(data.Posts, 0);
var slug_1 = t0.Slug;
dom.Append(n0, dom.Text(t0.Title));
var title_1 = t0.Title;
dom.Append(n1, dom.Text(t0.Tag));
```

```java
// Java
var t0 = Fud.at(data.posts(), 0);
var slug_1 = t0.slug();
dom.append(n0, dom.text(t0.title()));
var title_1 = t0.title();
dom.append(n1, dom.text(t0.tag()));
```

```go
// Go
t0 := fud.At(data.Posts, 0)
slug_1 := t0.Slug
dom.Append(n0, dom.Text(t0.Title))
title_1 := t0.Title
dom.Append(n1, dom.Text(t0.Tag))
```

```rust
// Rust
let t0 = fud::at(&data.posts, 0);
let slug_1 = &t0.slug;
dom.append(n0, dom.text(&t0.title));
let title_1 = &t0.title;
dom.append(n1, dom.text(&t0.tag));
```

```python
# Python
t0 = fud.at(data.posts, 0)
slug_1 = t0.slug
dom.append(n0, dom.text(t0.title))
title_1 = t0.title
dom.append(n1, dom.text(t0.tag))
```

- `fud.At` devuelve ausente si la lista está vacía. Entonces `t0.Slug` sería leer de un ausente,
  y por eso TS ya obliga a comprobarlo antes (no se puede desestructurar algo que puede faltar).
  El ejemplo supone `data.posts[0]` presente, por brevedad.
- En Go, `slug_1` y `title_1` solo se declaran si algo los lee (A.5).

#### D4 · El resto, reenviado a un componente

```
@{ const { slug, ...resto } = post; }
<app-card ...resto .href=@(`/blog/${slug}`)></app-card>
```

`app-card` declara `{ title: string; href: string; variant?: Variant }`. Las claves del hijo que
están en el resto: solo `title`.

- `summary`, `tag`, `featured` y `author` no son props del hijo y no se pasan (props-spec 147).
- `href` la escribe el `.prop` explícito.
- `variant` no llega y el hijo toma su defecto.

```js
// TS: expanded at compile time against the child's T (decision 146)
render$3($dom, $dom.attachShadow(n0), { "title": resto.title, "href": `/blog/${slug}` }, $ioc);
```

```csharp
// C#
AppCard.Render(dom, dom.AttachShadow(n0), new AppCardProps(Title: post.Title, Href: "/blog/" + post.Slug), ioc);
```

```java
// Java: an absent optional prop is null, and the child applies its default
AppCard.render(dom, dom.attachShadow(n0), new AppCardProps(post.title(), "/blog/" + post.slug(), null), ioc);
```

```go
// Go
appcard.Render(dom, dom.AttachShadow(n0), appcard.Props{Title: post.Title, Href: "/blog/" + post.Slug}, ioc)
```

```rust
// Rust
app_card::render(dom, dom.attach_shadow(n0),
    &AppCardProps { title: post.title.clone(), href: format!("/blog/{}", post.slug), variant: None }, ioc);
```

```python
# Python
app_card.render(dom, dom.attach_shadow(n0), AppCardProps(title=post.title, href="/blog/" + post.slug), ioc)
```

#### D5 · El resto de las props, a un nativo

Es el caso de `campo-texto` (SDD-55), entero en A.7. Aquí solo el spread:

```
const { label, ...resto } = props<{ label: string; placeholder?: string; required?: boolean; maxlength?: number }>();
<input ...resto>
```

En el resto quedan `placeholder`, `required` y `maxlength`. Por orden alfabético: `maxlength`,
`placeholder`, `required`.

```js
// TS: the runtime function, which sorts by name
$dom.setAttrs(n0, [resto], void 0, []);
```

```csharp
// C#
if (p.Maxlength is double v0) dom.SetAttr(n0, "maxlength", Fud.Num(v0));
if (p.Placeholder is string v1) dom.SetAttr(n0, "placeholder", v1);
if (p.Required == true) dom.SetAttr(n0, "required", "");
```

```java
// Java
if (p.maxlength() != null) dom.setAttr(n0, "maxlength", Fud.num(p.maxlength()));
if (p.placeholder() != null) dom.setAttr(n0, "placeholder", p.placeholder());
if (Boolean.TRUE.equals(p.required())) dom.setAttr(n0, "required", "");
```

```go
// Go
if p.Maxlength != nil { dom.SetAttr(n0, "maxlength", fud.Num(*p.Maxlength)) }
if p.Placeholder != nil { dom.SetAttr(n0, "placeholder", *p.Placeholder) }
if p.Required != nil && *p.Required { dom.SetAttr(n0, "required", "") }
```

```rust
// Rust
if let Some(v) = p.maxlength { dom.set_attr(n0, "maxlength", &fud::num(v)); }
if let Some(v) = &p.placeholder { dom.set_attr(n0, "placeholder", v); }
if p.required == Some(true) { dom.set_attr(n0, "required", ""); }
```

```python
# Python
if p.maxlength is not None: dom.set_attr(n0, "maxlength", fud.num(p.maxlength))
if p.placeholder is not None: dom.set_attr(n0, "placeholder", p.placeholder)
if p.required is True: dom.set_attr(n0, "required", "")
```

#### D6 · Dos spreads y un atributo explícito en un nativo

```
<a ...enlace ...extra class="boton">Leer</a>
```

```
type Enlace
  href   str
  title  str?
  rel    str?

type Extra
  title   str?
  hidden  bool?
```

Por orden alfabético:

- `hidden` solo lo da `extra`.
- `href` solo lo da `enlace`, por la guarda.
- `rel` solo lo da `enlace`.
- `title` lo dan los dos: gana `extra` si escribe y, si no, `enlace`.
- `class` es explícito y va en su sitio, después.

```js
// TS
$dom.setAttrs(n0, [enlace, extra], void 0, ["class"]);
$dom.setAttr(n0, "class", "boton");
```

```csharp
// C#
if (extra.Hidden == true) dom.SetAttr(n0, "hidden", "");
dom.SetUrl(n0, "href", enlace.Href);
if (enlace.Rel is string v0) dom.SetAttr(n0, "rel", v0);
if (extra.Title is string v1) dom.SetAttr(n0, "title", v1);
else if (enlace.Title is string v2) dom.SetAttr(n0, "title", v2);
dom.SetAttr(n0, "class", "boton");
```

```java
// Java
if (Boolean.TRUE.equals(extra.hidden())) dom.setAttr(n0, "hidden", "");
dom.setUrl(n0, "href", enlace.href());
if (enlace.rel() != null) dom.setAttr(n0, "rel", enlace.rel());
if (extra.title() != null) dom.setAttr(n0, "title", extra.title());
else if (enlace.title() != null) dom.setAttr(n0, "title", enlace.title());
dom.setAttr(n0, "class", "boton");
```

```go
// Go
if extra.Hidden != nil && *extra.Hidden { dom.SetAttr(n0, "hidden", "") }
dom.SetUrl(n0, "href", enlace.Href)
if enlace.Rel != nil { dom.SetAttr(n0, "rel", *enlace.Rel) }
if extra.Title != nil {
    dom.SetAttr(n0, "title", *extra.Title)
} else if enlace.Title != nil {
    dom.SetAttr(n0, "title", *enlace.Title)
}
dom.SetAttr(n0, "class", "boton")
```

```rust
// Rust
if extra.hidden == Some(true) { dom.set_attr(n0, "hidden", ""); }
dom.set_url(n0, "href", &enlace.href);
if let Some(v) = &enlace.rel { dom.set_attr(n0, "rel", v); }
if let Some(v) = extra.title.as_ref().or(enlace.title.as_ref()) { dom.set_attr(n0, "title", v); }
dom.set_attr(n0, "class", "boton");
```

```python
# Python
if extra.hidden is True: dom.set_attr(n0, "hidden", "")
dom.set_url(n0, "href", enlace.href)
if enlace.rel is not None: dom.set_attr(n0, "rel", enlace.rel)
if extra.title is not None: dom.set_attr(n0, "title", extra.title)
elif enlace.title is not None: dom.set_attr(n0, "title", enlace.title)
dom.set_attr(n0, "class", "boton")
```

Con un `bool` en los dos spreads, «escribe» es `true`: un `false` del posterior deja pasar un
`true` del anterior, como hace `attrsOf` hoy.

### A.3.5. Lo que no se baja, y por qué

| Se escribe | Por qué no | Código |
|---|---|---|
| `.datos=@resto`, `@(resto)`, `resto === x` | Exige el tipo «`Post` sin `slug`» (propuesta B) | `FUD1147` |
| `const [a, b] = par` | El contrato no tiene tuplas | `FUD1146` |
| `const { [clave]: v } = x` | La clave no se conoce al compilar | `FUD1146` |
| `const { a, ...r } = mapa`, `<input ...mapa>` | Las claves de un `map` son de runtime, y su orden no es portable (Go las recorre al azar) | `FUD1153` |
| Desestructurar algo que puede faltar | En JS lanza; TS ya lo prohíbe | TS |

## A.4. El runtime de fudic en cada lenguaje

Lo que se escribe a mano, una vez por lenguaje. La suite de conformidad lo prueba.

| Función | Contrato |
|---|---|
| `Num(n)` | **`Number::toString` de ECMA-262** (§6.1.6.1.20): `NaN` → `NaN`; `0` y `-0` → `0`; `Infinity` y `-Infinity`; los dígitos más cortos que vuelven al mismo `f64`; notación decimal si el exponente decimal está entre −7 y 21, y si no `1e+21` / `1e-7`. Los dígitos salen de `double.ToString("R")` (C#, .NET Core 3.0+), `Double.toString` (Java 19+), `strconv.FormatFloat(x, 'e', -1, 64)` (Go), `format!("{:e}", x)` (Rust) y `repr(x)` (Python), y se reformatean a la forma de JS |
| `Str(x)` | `x` si es texto; `Num(x)` si es número |
| `Text(x)` | `Str(x)` para texto y número; `"true"` o `"false"`; `""` si falta |
| `At(xs, i)` | El elemento si `i` es entero y `0 <= i < len`; si no, ausente |
| `Get(m, k)` | El valor si la clave está; si no, ausente |
| `div(a, b)`, `mod(a, b)` | IEEE 754 sin excepciones; solo Python los necesita (`/` y `fmod` lanzan con `0`). `mod` lleva el signo del dividendo |
| `Cmp(n)` | El signo de un comparador: `-1` si `n < 0`, `1` si `n > 0`, `0` si es `0`, `-0` o `NaN` |
| `Compare16(a, b)` | `-1`, `0` o `1` comparando los dos textos **unidad a unidad UTF-16**, como `<` de JS. Lo necesitan Go, Rust y Python; C# usa `string.CompareOrdinal` y Java `compareTo` |
| `Len16(s)` | Cuántas unidades UTF-16 tiene el texto, como `.length` de JS (`"😀"` → `2`). Lo necesitan Go, Rust y Python |
| `Filter`, `Map`, `Reduce`, `Sorted` | Lo que el lenguaje no da en una expresión: en Go las cuatro; en Java `reduce` (el de `stream` exige combinador); en Rust `sorted`, que clona y ordena con `sort_by` y `Cmp`. `Sorted` es siempre **estable** y nunca toca la lista de entrada |
| `FilterI`, `MapI`, `ReduceI` | Las variantes con índice, en todos los lenguajes, con el índice como `f64` |
| `Now()` | El instante actual, en UTC |
| `Format(preset, v, locale)` | El catálogo de pipes (SDD-58 §4.4) sobre el ICU de la plataforma |
| `Message(partes, args, locale)` | El subconjunto ICU de SDD-58, con plural y select |
| `dom.SetUrl` | La guarda de URL (`safeUrl` de `@fudic/dom`, SDD-51 §3.7), portada |
| `dom` entero, stream, `fud-state` | Las doce operaciones (`element`, `text`, `append`, `setAttr`, `setUrl`, `attachShadow`…), el escritor de DSD con los escapes de `escapeText` y `escapeAttr` byte a byte, y el payload de hidratación (IDEA-06 §10.8) |

**Texto formateado.** Un pipe puede dar bytes distintos en .NET y en el navegador: un espacio de
CLDR, otra versión de ICU. No rompe nada, porque la hidratación no compara texto (IDEA-03 §4). En la
suite de conformidad, las filas de pipes comparan todo el HTML salvo el texto que formatea el pipe.

## A.5. Lo particular de cada lenguaje

- **C#.** Los opcionales de valor son `double?` y `bool?`; `?.` y `??` existen. Un `record` de
  props por componente, con parámetros opcionales para las props opcionales.
- **Java.**
  - Records con accesores `x()`; una prop opcional ausente se pasa como `null`.
  - Un número o booleano que puede faltar va en caja (`Double`, `Boolean`). Se compara con
    `Boolean.TRUE.equals(x)`, o desempaquetado con `==`; nunca con `==` entre dos cajas.
  - `switch` no admite `double`: sobre números, `if` encadenados.
- **Go.**
  - Una variable declarada y no leída es error de compilación: el emisor solo declara lo que se
    lee. El índice de `range` es siempre `_`.
  - Una división entre constantes por cero no compila: el emisor nunca pliega constantes.
  - No hay ternario ni `??`: se escribe un temporal y un `if`.
  - Los opcionales son punteros, y una lista o un `map` ausentes son `nil`.
- **Rust.**
  - El render toma los datos por referencia (`&T`) y solo clona al construir las props de un hijo.
  - La presencia es `Option`; el ternario es un `if` usado como expresión.
  - No hay `for` de C: se escribe `while` con el paso al final.
  - `match` no admite `f64` como patrón: sobre números, `if` encadenados.
- **Python.**
  - No hay scope de bloque: lo resuelve el renombrado (A.1.5).
  - No hay `for` de C: se escribe `while`.
  - `/` y `fmod` lanzan con `0`: se usan `fud.div` y `fud.mod`.
  - `@switch` se baja a `if/elif`, que vale en cualquier Python 3.
  - Una closure dentro de un bucle captura la última vuelta, pero la vista no tiene closures.

## A.6. Ejemplo guía 1: la portada del blog

`src/routes/blog/index.fud`, la vista tras SDD-61:

```
<h1>@data.title</h1>
<section class="grid">
  @foreach (const { slug, title, summary, tag, featured = false } of data.posts) key (slug) {
    <app-card .title=@title .href=@(`/blog/${slug}`) .variant=@(featured ? "highlight" : "default")>
      <app-badge slot="meta" .tone=@(featured ? "success" : "neutral")>@tag</app-badge>
      @summary
    </app-card>
  } @empty {
    <p class="empty">Todavía no hay artículos.</p>
  }
</section>
```

Cuerpo de la función de render. Para que se lea, se omiten tres cosas que son idénticas en todos
los lenguajes: los nodos de texto de espacios, las marcas de hidratación y `data-fud-adopt`.

**TS** (el emit de hoy, con `@empty` y el defecto de §4.4)

```js
const n0 = $dom.element("h1");
$dom.append(n0, $dom.text(String(data.title ?? "")));
$dom.append($parent, n0);
const n1 = $dom.element("section");
$dom.setAttr(n1, "class", "grid");
let any0 = false;
for (const t0 of data.posts) {
  any0 = true;
  const slug = t0.slug, title = t0.title, summary = t0.summary, tag = t0.tag,
        featured = t0.featured ?? false;
  const n2 = $dom.element("app-card");
  render$3($dom, $dom.attachShadow(n2),
    { "title": title, "href": `/blog/${slug}`, "variant": featured ? "highlight" : "default" }, $ioc);
  const n3 = $dom.element("app-badge");
  $dom.setAttr(n3, "slot", "meta");
  render$2($dom, $dom.attachShadow(n3), { "tone": featured ? "success" : "neutral" }, $ioc);
  $dom.append(n3, $dom.text(String(tag ?? "")));
  $dom.append(n2, n3);
  $dom.append(n2, $dom.text(String(summary ?? "")));
  $dom.append(n1, n2);
}
if (!any0) {
  const n4 = $dom.element("p");
  $dom.setAttr(n4, "class", "empty");
  $dom.append(n4, $dom.text("Todavía no hay artículos."));
  $dom.append(n1, n4);
}
$dom.append($parent, n1);
```

**C#**

```csharp
var n0 = dom.Element("h1");
dom.Append(n0, dom.Text(data.Title));
dom.Append(parent, n0);
var n1 = dom.Element("section");
dom.SetAttr(n1, "class", "grid");
var any0 = false;
foreach (var t0 in data.Posts)
{
    any0 = true;
    var slug_1 = t0.Slug; var title_1 = t0.Title; var summary_1 = t0.Summary; var tag_1 = t0.Tag;
    var featured_1 = t0.Featured ?? false;
    var n2 = dom.Element("app-card");
    AppCard.Render(dom, dom.AttachShadow(n2), new AppCardProps(
        Title: title_1, Href: "/blog/" + slug_1,
        Variant: featured_1 ? Variant.Highlight : Variant.Default), ioc);
    var n3 = dom.Element("app-badge");
    dom.SetAttr(n3, "slot", "meta");
    AppBadge.Render(dom, dom.AttachShadow(n3), new AppBadgeProps(
        Tone: featured_1 ? Tone.Success : Tone.Neutral), ioc);
    dom.Append(n3, dom.Text(tag_1));
    dom.Append(n2, n3);
    dom.Append(n2, dom.Text(summary_1));
    dom.Append(n1, n2);
}
if (!any0)
{
    var n4 = dom.Element("p");
    dom.SetAttr(n4, "class", "empty");
    dom.Append(n4, dom.Text("Todavía no hay artículos."));
    dom.Append(n1, n4);
}
dom.Append(parent, n1);
```

**Java**

```java
var n0 = dom.element("h1");
dom.append(n0, dom.text(data.title()));
dom.append(parent, n0);
var n1 = dom.element("section");
dom.setAttr(n1, "class", "grid");
var any0 = false;
for (var t0 : data.posts()) {
    any0 = true;
    var slug_1 = t0.slug(); var title_1 = t0.title(); var summary_1 = t0.summary(); var tag_1 = t0.tag();
    var featured_1 = t0.featured() != null ? t0.featured() : false;
    var n2 = dom.element("app-card");
    AppCard.render(dom, dom.attachShadow(n2), new AppCardProps(
        title_1, "/blog/" + slug_1, featured_1 ? Variant.HIGHLIGHT : Variant.DEFAULT), ioc);
    var n3 = dom.element("app-badge");
    dom.setAttr(n3, "slot", "meta");
    AppBadge.render(dom, dom.attachShadow(n3), new AppBadgeProps(
        featured_1 ? Tone.SUCCESS : Tone.NEUTRAL), ioc);
    dom.append(n3, dom.text(tag_1));
    dom.append(n2, n3);
    dom.append(n2, dom.text(summary_1));
    dom.append(n1, n2);
}
if (!any0) {
    var n4 = dom.element("p");
    dom.setAttr(n4, "class", "empty");
    dom.append(n4, dom.text("Todavía no hay artículos."));
    dom.append(n1, n4);
}
dom.append(parent, n1);
```

**Go**

```go
n0 := dom.Element("h1")
dom.Append(n0, dom.Text(data.Title))
dom.Append(parent, n0)
n1 := dom.Element("section")
dom.SetAttr(n1, "class", "grid")
any0 := false
for _, t0 := range data.Posts {
    any0 = true
    slug_1 := t0.Slug
    title_1 := t0.Title
    summary_1 := t0.Summary
    tag_1 := t0.Tag
    featured_1 := false
    if t0.Featured != nil { featured_1 = *t0.Featured }
    variant_1 := appcard.VariantDefault
    if featured_1 { variant_1 = appcard.VariantHighlight }
    n2 := dom.Element("app-card")
    appcard.Render(dom, dom.AttachShadow(n2), appcard.Props{
        Title: title_1, Href: "/blog/" + slug_1, Variant: &variant_1}, ioc)
    tone_1 := appbadge.ToneNeutral
    if featured_1 { tone_1 = appbadge.ToneSuccess }
    n3 := dom.Element("app-badge")
    dom.SetAttr(n3, "slot", "meta")
    appbadge.Render(dom, dom.AttachShadow(n3), appbadge.Props{Tone: &tone_1}, ioc)
    dom.Append(n3, dom.Text(tag_1))
    dom.Append(n2, n3)
    dom.Append(n2, dom.Text(summary_1))
    dom.Append(n1, n2)
}
if !any0 {
    n4 := dom.Element("p")
    dom.SetAttr(n4, "class", "empty")
    dom.Append(n4, dom.Text("Todavía no hay artículos."))
    dom.Append(n1, n4)
}
dom.Append(parent, n1)
```

**Rust**

```rust
let n0 = dom.element("h1");
let t = dom.text(&data.title);
dom.append(n0, t);
dom.append(parent, n0);
let n1 = dom.element("section");
dom.set_attr(n1, "class", "grid");
let mut any0 = false;
for t0 in data.posts.iter() {
    any0 = true;
    let slug_1 = &t0.slug;
    let title_1 = &t0.title;
    let summary_1 = &t0.summary;
    let tag_1 = &t0.tag;
    let featured_1 = t0.featured.unwrap_or(false);
    let n2 = dom.element("app-card");
    let s2 = dom.attach_shadow(n2);
    app_card::render(dom, s2, &AppCardProps {
        title: title_1.clone(),
        href: format!("/blog/{}", slug_1),
        variant: Some(if featured_1 { Variant::Highlight } else { Variant::Default }),
    }, ioc);
    let n3 = dom.element("app-badge");
    dom.set_attr(n3, "slot", "meta");
    let s3 = dom.attach_shadow(n3);
    app_badge::render(dom, s3, &AppBadgeProps {
        tone: Some(if featured_1 { Tone::Success } else { Tone::Neutral }),
    }, ioc);
    let t = dom.text(tag_1);
    dom.append(n3, t);
    dom.append(n2, n3);
    let t = dom.text(summary_1);
    dom.append(n2, t);
    dom.append(n1, n2);
}
if !any0 {
    let n4 = dom.element("p");
    dom.set_attr(n4, "class", "empty");
    let t = dom.text("Todavía no hay artículos.");
    dom.append(n4, t);
    dom.append(n1, n4);
}
dom.append(parent, n1);
```

Los nodos son identificadores (`NodeId: Copy`), y por eso `dom` se puede tomar prestado en cada
llamada sin conflictos de préstamo.

**Python**

```python
n0 = dom.element("h1")
dom.append(n0, dom.text(data.title))
dom.append(parent, n0)
n1 = dom.element("section")
dom.set_attr(n1, "class", "grid")
any0 = False
for t0 in data.posts:
    any0 = True
    slug_1 = t0.slug
    title_1 = t0.title
    summary_1 = t0.summary
    tag_1 = t0.tag
    featured_1 = t0.featured if t0.featured is not None else False
    n2 = dom.element("app-card")
    app_card.render(dom, dom.attach_shadow(n2), AppCardProps(
        title=title_1, href="/blog/" + slug_1,
        variant=Variant.HIGHLIGHT if featured_1 else Variant.DEFAULT), ioc)
    n3 = dom.element("app-badge")
    dom.set_attr(n3, "slot", "meta")
    app_badge.render(dom, dom.attach_shadow(n3), AppBadgeProps(
        tone=Tone.SUCCESS if featured_1 else Tone.NEUTRAL), ioc)
    dom.append(n3, dom.text(tag_1))
    dom.append(n2, n3)
    dom.append(n2, dom.text(summary_1))
    dom.append(n1, n2)
if not any0:
    n4 = dom.element("p")
    dom.set_attr(n4, "class", "empty")
    dom.append(n4, dom.text("Todavía no hay artículos."))
    dom.append(n1, n4)
dom.append(parent, n1)
```

## A.7. Ejemplo guía 2: un campo con el resto de sus props

`src/components/campo-texto.fud`, tras SDD-61:

```
@code {
  const { label, ...resto } = props<{
    label: string;
    placeholder?: string;
    required?: boolean;
    maxlength?: number;
  }>();
}

<campo-texto>
  <template shadowrootmode="open">
    <label class="campo">
      <span>@label</span>
      <input ...resto>
    </label>
    <p class="eco">placeholder: @resto.placeholder · required: @resto.required · maxlength: @resto.maxlength</p>
  </template>
</campo-texto>
```

Muestra en un solo componente la desestructuración de props, el resto como atributos, el resto
leído por campo y la interpolación de un texto, un booleano y un número que pueden faltar.
Función de render del componente, sin el `<style>` ni las marcas de hidratación:

**TS**

```js
function render$1($dom, $parent, $props, $ioc) {
  const { label, ...resto } = $props;
  const n0 = $dom.element("label");
  $dom.setAttr(n0, "class", "campo");
  const n1 = $dom.element("span");
  $dom.append(n1, $dom.text(String(label ?? "")));
  $dom.append(n0, n1);
  const n2 = $dom.element("input");
  $dom.setAttrs(n2, [resto], void 0, []);
  $dom.append(n0, n2);
  $dom.append($parent, n0);
  const n3 = $dom.element("p");
  $dom.setAttr(n3, "class", "eco");
  $dom.append(n3, $dom.text(
    `placeholder: ${resto.placeholder ?? ""} · required: ${resto.required ?? ""} · maxlength: ${resto.maxlength ?? ""}`));
  $dom.append($parent, n3);
}
```

**C#**

```csharp
public static void Render(Dom dom, Node parent, CampoTextoProps p, Ioc ioc)
{
    var n0 = dom.Element("label");
    dom.SetAttr(n0, "class", "campo");
    var n1 = dom.Element("span");
    dom.Append(n1, dom.Text(p.Label));
    dom.Append(n0, n1);
    var n2 = dom.Element("input");
    if (p.Maxlength is double v0) dom.SetAttr(n2, "maxlength", Fud.Num(v0));
    if (p.Placeholder is string v1) dom.SetAttr(n2, "placeholder", v1);
    if (p.Required == true) dom.SetAttr(n2, "required", "");
    dom.Append(n0, n2);
    dom.Append(parent, n0);
    var n3 = dom.Element("p");
    dom.SetAttr(n3, "class", "eco");
    dom.Append(n3, dom.Text("placeholder: " + Fud.Text(p.Placeholder) + " · required: "
        + Fud.Text(p.Required) + " · maxlength: " + Fud.Text(p.Maxlength)));
    dom.Append(parent, n3);
}

public sealed record CampoTextoProps(string Label, string? Placeholder = null,
                                     bool? Required = null, double? Maxlength = null);
```

**Java**

```java
public static void render(Dom dom, Node parent, CampoTextoProps p, Ioc ioc) {
    var n0 = dom.element("label");
    dom.setAttr(n0, "class", "campo");
    var n1 = dom.element("span");
    dom.append(n1, dom.text(p.label()));
    dom.append(n0, n1);
    var n2 = dom.element("input");
    if (p.maxlength() != null) dom.setAttr(n2, "maxlength", Fud.num(p.maxlength()));
    if (p.placeholder() != null) dom.setAttr(n2, "placeholder", p.placeholder());
    if (Boolean.TRUE.equals(p.required())) dom.setAttr(n2, "required", "");
    dom.append(n0, n2);
    dom.append(parent, n0);
    var n3 = dom.element("p");
    dom.setAttr(n3, "class", "eco");
    dom.append(n3, dom.text("placeholder: " + Fud.text(p.placeholder()) + " · required: "
        + Fud.text(p.required()) + " · maxlength: " + Fud.text(p.maxlength())));
    dom.append(parent, n3);
}

public record CampoTextoProps(String label, String placeholder, Boolean required, Double maxlength) {}
```

**Go**

```go
type Props struct {
    Label       string
    Placeholder *string
    Required    *bool
    Maxlength   *float64
}

func Render(dom *fud.Dom, parent fud.Node, p Props, ioc *fud.Ioc) {
    n0 := dom.Element("label")
    dom.SetAttr(n0, "class", "campo")
    n1 := dom.Element("span")
    dom.Append(n1, dom.Text(p.Label))
    dom.Append(n0, n1)
    n2 := dom.Element("input")
    if p.Maxlength != nil { dom.SetAttr(n2, "maxlength", fud.Num(*p.Maxlength)) }
    if p.Placeholder != nil { dom.SetAttr(n2, "placeholder", *p.Placeholder) }
    if p.Required != nil && *p.Required { dom.SetAttr(n2, "required", "") }
    dom.Append(n0, n2)
    dom.Append(parent, n0)
    n3 := dom.Element("p")
    dom.SetAttr(n3, "class", "eco")
    dom.Append(n3, dom.Text("placeholder: " + fud.TextStr(p.Placeholder) + " · required: " +
        fud.TextBool(p.Required) + " · maxlength: " + fud.TextNum(p.Maxlength)))
    dom.Append(parent, n3)
}
```

Go no tiene sobrecarga: `Text` se escribe en tres variantes por tipo (`TextStr`, `TextBool`,
`TextNum`), y el emisor elige la que toca con el tipo.

**Rust**

```rust
pub struct CampoTextoProps {
    pub label: String,
    pub placeholder: Option<String>,
    pub required: Option<bool>,
    pub maxlength: Option<f64>,
}

pub fn render(dom: &mut fud::Dom, parent: fud::NodeId, p: &CampoTextoProps, ioc: &fud::Ioc) {
    let n0 = dom.element("label");
    dom.set_attr(n0, "class", "campo");
    let n1 = dom.element("span");
    let t = dom.text(&p.label);
    dom.append(n1, t);
    dom.append(n0, n1);
    let n2 = dom.element("input");
    if let Some(v) = p.maxlength { dom.set_attr(n2, "maxlength", &fud::num(v)); }
    if let Some(v) = &p.placeholder { dom.set_attr(n2, "placeholder", v); }
    if p.required == Some(true) { dom.set_attr(n2, "required", ""); }
    dom.append(n0, n2);
    dom.append(parent, n0);
    let n3 = dom.element("p");
    dom.set_attr(n3, "class", "eco");
    let t = dom.text(&format!("placeholder: {} · required: {} · maxlength: {}",
        fud::text(&p.placeholder), fud::text(&p.required), fud::text(&p.maxlength)));
    dom.append(n3, t);
    dom.append(parent, n3);
}
```

`fud::text` es genérica sobre un rasgo `fud::Text` que implementan `String`, `bool`, `f64` y
`Option<T>`.

**Python**

```python
@dataclass(frozen=True)
class CampoTextoProps:
    label: str
    placeholder: str | None = None
    required: bool | None = None
    maxlength: float | None = None

def render(dom: fud.Dom, parent: fud.Node, p: CampoTextoProps, ioc: fud.Ioc) -> None:
    n0 = dom.element("label")
    dom.set_attr(n0, "class", "campo")
    n1 = dom.element("span")
    dom.append(n1, dom.text(p.label))
    dom.append(n0, n1)
    n2 = dom.element("input")
    if p.maxlength is not None: dom.set_attr(n2, "maxlength", fud.num(p.maxlength))
    if p.placeholder is not None: dom.set_attr(n2, "placeholder", p.placeholder)
    if p.required is True: dom.set_attr(n2, "required", "")
    dom.append(n0, n2)
    dom.append(parent, n0)
    n3 = dom.element("p")
    dom.set_attr(n3, "class", "eco")
    dom.append(n3, dom.text("placeholder: " + fud.text(p.placeholder) + " · required: "
                            + fud.text(p.required) + " · maxlength: " + fud.text(p.maxlength)))
    dom.append(parent, n3)
```

`fud.text(True)` es `"true"` y no `"True"`: por eso existe `fud.text` y no se usa `str()`.

**Lo mismo en los seis.** Con `{ label: "Nombre", required: true, maxlength: 20 }`:

- el `<input>` sale con `maxlength="20" required=""`, en ese orden;
- `<p>` dice `placeholder:  · required: true · maxlength: 20`.

Es una fila de la suite de conformidad.

## A.8. Ejemplo guía 3: contar, ordenar y unir

El ejemplo de las tareas de SDD-61 §3.5 bis, más una lista de autores ordenada y unida en un texto.
Es lo que el desarrollador escribe:

```
@code {
  import type { Tarea, Autor } from 'fudic:tareas';

  const tareas     = signal<readonly Tarea[]>(data.tareas);
  const autores    = signal<readonly Autor[]>(data.autores);
  const hechas     = computed(() => tareas().filter(t => t.hecha).length);
  const pendientes = computed(() => tareas().filter(t => !t.hecha).length);
  const firmantes  = computed(() => autores()
    .toSorted((a, b) => a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0)
    .reduce((s, a, i) => i === 0 ? a.nombre : `${s}, ${a.nombre}`, ''));
}

<p>Hechas: @hechas() · Pendientes: @pendientes()</p>
<p>Firman: @firmantes()</p>
```

Con cinco tareas (dos hechas) y los autores `Marta`, `Ana` y `Luis`, los seis lenguajes pintan:

```html
<p>Hechas: 2 · Pendientes: 3</p>
<p>Firman: Ana, Luis, Marta</p>
```

Lo que sigue es lo que el servidor evalúa del `@code` en cada lenguaje (A.2, «El `@code` que el
servidor evalúa»: las señales son variables y los `computed` se calculan una vez, en su orden). El
pintado de los dos `<p>` es el de A.2, «Lo que se pinta». En el navegador no se baja nada: el
`@code` es el TS de arriba, y al marcar una tarea los `computed` se recalculan solos.

**TS** (servidor Node: el `@code` tal cual)

```js
const tareas = signal(data.tareas);
const autores = signal(data.autores);
const hechas = computed(() => tareas().filter(t => t.hecha).length);
const pendientes = computed(() => tareas().filter(t => !t.hecha).length);
const firmantes = computed(() => autores()
  .toSorted((a, b) => a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0)
  .reduce((s, a, i) => i === 0 ? a.nombre : `${s}, ${a.nombre}`, ''));
```

**C#**

```csharp
var tareas = data.Tareas;
var autores = data.Autores;
var hechas = (double) tareas.Where(t => t.Hecha).ToList().Count;
var pendientes = (double) tareas.Where(t => !t.Hecha).ToList().Count;
var firmantes = Fud.ReduceI(
    autores.OrderBy(x => x, Comparer<Autor>.Create((a, b) => Fud.Cmp(
        string.CompareOrdinal(a.Nombre, b.Nombre) < 0 ? -1
        : string.CompareOrdinal(a.Nombre, b.Nombre) > 0 ? 1 : 0))).ToList(),
    "", (s, a, i) => i == 0 ? a.Nombre : s + ", " + a.Nombre);
```

**Java**

```java
var tareas = data.tareas();
var autores = data.autores();
var hechas = (double) tareas.stream().filter(t -> t.hecha()).toList().size();
var pendientes = (double) tareas.stream().filter(t -> !t.hecha()).toList().size();
var firmantes = Fud.reduceI(
    autores.stream().sorted((a, b) -> Fud.cmp(
        a.nombre().compareTo(b.nombre()) < 0 ? -1
        : a.nombre().compareTo(b.nombre()) > 0 ? 1 : 0)).toList(),
    "", (s, a, i) -> i == 0 ? a.nombre() : s + ", " + a.nombre());
```

**Go**

```go
tareas := data.Tareas
autores := data.Autores
hechas := float64(len(fud.Filter(tareas, func(t Tarea) bool { return t.Hecha })))
pendientes := float64(len(fud.Filter(tareas, func(t Tarea) bool { return !t.Hecha })))
firmantes := fud.ReduceI(
    fud.Sorted(autores, func(a, b Autor) float64 {
        if fud.Compare16(a.Nombre, b.Nombre) < 0 { return -1 }
        if fud.Compare16(a.Nombre, b.Nombre) > 0 { return 1 }
        return 0
    }),
    "", func(s string, a Autor, i float64) string {
        if i == 0 { return a.Nombre }
        return s + ", " + a.Nombre
    })
```

**Rust**

```rust
let tareas = &data.tareas;
let autores = &data.autores;
let hechas = tareas.iter().filter(|t| t.hecha).cloned().collect::<Vec<_>>().len() as f64;
let pendientes = tareas.iter().filter(|t| !t.hecha).cloned().collect::<Vec<_>>().len() as f64;
let firmantes = fud::reduce_i(
    &fud::sorted(autores, |a, b|
        if fud::compare16(&a.nombre, &b.nombre) < 0 { -1.0 }
        else if fud::compare16(&a.nombre, &b.nombre) > 0 { 1.0 }
        else { 0.0 }),
    String::new(),
    |s, a, i| if i == 0.0 { a.nombre.clone() } else { format!("{}, {}", s, a.nombre) });
```

**Python**

```python
tareas = data.tareas
autores = data.autores
hechas = float(len([t for t in tareas if t.hecha]))
pendientes = float(len([t for t in tareas if not t.hecha]))
firmantes = fud.reduce_i(
    sorted(autores, key=functools.cmp_to_key(lambda a, b: fud.cmp(
        -1 if fud.compare16(a.nombre, b.nombre) < 0
        else 1 if fud.compare16(a.nombre, b.nombre) > 0 else 0))),
    "", lambda s, a, i: a.nombre if i == 0 else s + ", " + a.nombre)
```

- Las bajadas son literales, fila a fila; la optimización de `filter(…).length` (A.2,
  «Colecciones») no se aplica aquí para que se vea la correspondencia.
- `hechas` es `2.0` en todos, y `Num` lo pinta `2`, como JS.
- Es una fila de la suite de conformidad.
