# SDD-61 — Anexo: cómo se traduce la vista a cada lenguaje

> **Normativo.** Parte de [SDD-61](./SDD-61-vista-portable.md). Fija la bajada de cada fila de la
> lista blanca (SDD-61 §3) a TS, C#, Java, Go, Rust y Python, y las funciones del runtime de fudic
> que cada lenguaje implementa una vez.
>
> **TS** es el emit de hoy, con los cambios de SDD-61 §4.4. **Los demás** son el contrato del
> emisor de cada lenguaje: el mismo plan de render (las doce operaciones sobre `$dom`, IDEA-06
> §10.8) con otra sintaxis. La [suite de conformidad](./SDD-61-vista-portable.md#46-la-suite-de-conformidad)
> fija los bytes que todos tienen que dar.

---

## A.1. Principios

1. **Mismo resultado, no misma sintaxis.** Una fila se baja como haga falta en cada lenguaje
   (temporales, `if` en lugar de ternario, `while` en lugar de `for`) mientras el HTML sea el mismo.
2. **Orden de evaluación de JS:** de izquierda a derecha, cada expresión **una sola vez**. Si la
   bajada necesita un operando dos veces (`a ?? b` en Java), se guarda en un temporal.
   Cortocircuito en `&&`, `||`, `??`, `?.` y `? :`.
3. **Números.** Todo `number` de la vista es `f64` (IEEE 754 doble), también los literales
   enteros y los campos con ancho del `.fudapi` al leerse en la vista. Ninguna operación lanza:
   `1/0` es `Infinity` y `0/0` es `NaN`, como en JS.
4. **Presencia.** `null` y `undefined` son el mismo «ausente». Cada lenguaje usa su forma de
   ausencia: `null` (C#, Java), `nil` (Go), `Option` (Rust), `None` (Python).
5. **Nombres.** Cada nombre que declara el template (`@{ }`, cabecera de bucle, desestructuración)
   se renombra a uno único por función de render (`titulo_1`, `titulo_2`). El sombreado se resuelve
   al compilar, así que da igual que Python no tenga scope de bloque. Los nombres del `@code`, las
   props y `data` conservan el suyo.
6. **Campos.** `post.title` se escribe con la convención del código que genere ese backend para
   los tipos del `.fudapi`: `post.Title` (C#, Go), `post.title()` (Java, records), `post.title`
   (Rust, Python).
7. **Valores reactivos.** En el servidor no hay reactividad. Una señal es una variable con su valor
   inicial, un `computed` es una variable calculada una vez en su sitio del `@code`, y `effect` no
   existe. Leer `x()` es leer `x`.
8. **Sin reflexión.** Los tipos se conocen al compilar: acceso directo a campos, ningún mapa
   genérico ni introspección.

## A.2. Tabla de bajada

### Tipos

| Vista (TS) | C# | Java | Go | Rust | Python |
|---|---|---|---|---|---|
| `string` | `string` | `String` | `string` | `String` / `&str` | `str` |
| `number` | `double` | `double` | `float64` | `f64` | `float` |
| `boolean` | `bool` | `boolean` | `bool` | `bool` | `bool` |
| `Date` | `DateTimeOffset` | `Instant` | `time.Time` | `fudic::Date` (ms UTC) | `datetime` (UTC) |
| `T \| null`, `x?: T` | `T?` | `T` (con `null`; `Double` en caja) | `*T` (o `nil` en slice/map) | `Option<T>` | `Optional[T]` |
| `readonly T[]` | `IReadOnlyList<T>` | `List<T>` | `[]T` | `Vec<T>` / `&[T]` | `list[T]` |
| `Record<K, V>` | `IReadOnlyDictionary<K, V>` | `Map<K, V>` | `map[K]V` | `HashMap<K, V>` | `dict[K, V]` |
| Unión de literales / `enum` | el `enum` generado | el `enum` generado | el tipo generado (`string` con constantes) | el `enum` generado | el `Enum` generado |
| `type` del `.fudapi`, `$Props` | `record` generado | `record` generado | `struct` generado | `struct` generado | `@dataclass` generado |

### Valores y operadores

| Vista | TS | C# | Java | Go | Rust | Python |
|---|---|---|---|---|---|---|
| `"txt"` | igual | `"txt"` | `"txt"` | `"txt"` | `"txt"` | `"txt"` |
| `3.5`, `0x10`, `1_000` | igual | `3.5`, `16.0`, `1000.0` | `3.5`, `16.0`, `1000.0` | `3.5`, `16.0`, `1000.0` | `3.5_f64`, `16.0`, `1000.0` | `3.5`, `16.0`, `1000.0` |
| `true` / `false` | igual | `true` / `false` | `true` / `false` | `true` / `false` | `true` / `false` | `True` / `False` |
| `x === null`, `x === undefined` | `x == null` | `x is null` | `x == null` | `x == nil` | `x.is_none()` | `x is None` |
| `x !== null` | `x != null` | `x is not null` | `x != null` | `x != nil` | `x.is_some()` | `x is not None` |
| `a === b` (primitivos) | `a === b` | `a == b` | `a == b` (`double`, `boolean`), `a.equals(b)` (`String`) | `a == b` | `a == b` | `a == b` |
| `a !== b` | `a !== b` | `a != b` | `a != b`, `!a.equals(b)` | `a != b` | `a != b` | `a != b` |
| `a + b` (números) | igual | `a + b` | `a + b` | `a + b` | `a + b` | `a + b` |
| `a + b` (texto) | igual | `a + Js.Str(b)` | `a + Js.str(b)` | `a + fudic.Str(b)` | `format!("{}{}", a, fudic::str(b))` | `a + fudic.str(b)` |
| `a - b`, `a * b`, `-a` | igual | igual | igual | igual | igual | igual |
| `a / b` | igual | `a / b` | `a / b` | `a / b` (nunca entre constantes: el emisor no pliega) | `a / b` | `fudic.div(a, b)` |
| `a % b` | igual | `a % b` | `a % b` | `math.Mod(a, b)` | `a % b` | `fudic.mod(a, b)` |
| `a < b` … `>=` | igual | igual | igual | igual | igual | igual |
| `a && b`, `a \|\| b`, `!a` | igual | igual | igual | igual | igual | `a and b`, `a or b`, `not a` |
| `a ?? b` | igual | `a ?? b` | `(t = a) != null ? t : b` | `if a != nil { … } else { … }` en un temporal | `a.unwrap_or_else(\|\| b)` | `t if (t := a) is not None else b` |
| `c ? a : b` | igual | `c ? a : b` | `c ? a : b` | `if c { t = a } else { t = b }` | `if c { a } else { b }` | `a if c else b` |
| `` `a${x}b` `` | igual | `"a" + Js.Str(x) + "b"` | `"a" + Js.str(x) + "b"` | `"a" + fudic.Str(x) + "b"` | `format!("a{}b", fudic::str(x))` | `"a" + fudic.str(x) + "b"` |

`Str(x)` es `x` si es texto y `Num(x)` si es número (A.3). El pase tipado garantiza que no llega
otra cosa.

### Acceso

| Vista | TS | C# | Java | Go | Rust | Python |
|---|---|---|---|---|---|---|
| `a.b` | igual | `a.B` | `a.b()` | `a.B` | `a.b` | `a.b` |
| `a?.b` | igual | `a?.B` | `a == null ? null : a.b()` | `if a != nil { t = &a.B }` | `a.as_ref().map(\|a\| &a.b)` | `a.b if a is not None else None` |
| `xs[i]` | igual | `Js.At(xs, i)` | `Js.at(xs, i)` | `fudic.At(xs, i)` | `fudic::at(&xs, i)` | `fudic.at(xs, i)` |
| `m[k]` | igual | `Js.Get(m, k)` | `m.get(k)` | `fudic.Get(m, k)` | `m.get(&k)` | `m.get(k)` |

### Lo que se pinta

| Vista | Todos los lenguajes |
|---|---|
| `@(x)` en texto | `w.Text(Str(x))` si es texto o número; `"true"`/`"false"` si es booleano; nada si falta. Escapado como `escapeText` |
| Valor de atributo | `w.Attr(nombre, …)` con la misma conversión, escapado como `escapeAttr`; los atributos URL pasan por la guarda (`setUrl`) |
| `x()` (señal, `computed`, `Readable`) | La variable `x` |
| `form.$valid()`, `form.$issues()`, `campo.errors()`, `campo()` | El runtime de forms portado: `form.Valid`, `form.Issues`, `campo.Errors`, `campo.Value` |
| `x \| preset` | `fudic.Format(preset, x, locale)` |
| `t("…")` | El literal del idioma, resuelto al compilar; con huecos, `fudic.Message(partes, args, locale)` |

### Control

| Vista | TS | C# / Java | Go | Rust | Python |
|---|---|---|---|---|---|
| `@if … else if … else` | igual | `if / else if / else` | `if / else if / else` | `if / else if / else` | `if / elif / else` |
| `@switch` sobre texto o enum | igual | `switch` | `switch` | `match` | `if / elif / else` |
| `@switch` sobre número | igual | `if / else if` | `switch` | `if / else if` | `if / elif / else` |
| `@foreach (const x of xs) { } @empty { }` | igual (§4.4) | `var any = false; foreach (var x in xs) { any = true; … } if (!any) { … }` (`for (var x : xs)` en Java) | `any := false; for _, x := range xs { any = true; … }; if !any { … }` | `let mut any = false; for x in xs.iter() { any = true; … } if !any { … }` | `any_1 = False` · `for x_1 in xs:` · `if not any_1:` |
| `@for (let i = 0; c; i++) { }` | igual | `for (double i = 0; c; i++) { }` | `for i := 0.0; c; i++ { }` | `let mut i = 0.0; while c { …; i += 1.0; }` | `i_1 = 0.0` · `while c:` · `…` · `i_1 += 1` |
| `@while (c) { }` | igual | `while (c) { }` | `for c { }` | `while c { }` | `while c:` |
| `@empty` en `@for` / `@while` | igual | el mismo indicador `any` | igual | igual | igual |

- El paso del `@for` va al final del cuerpo: la vista no tiene `continue` que lo salte.
- `@empty` siempre con indicador. En `@foreach` no se pregunta el tamaño de `xs`: así los tres
  bucles se bajan igual.

### Declaraciones y desestructuración

| Vista | TS | C# | Java | Go | Rust | Python |
|---|---|---|---|---|---|---|
| `@{ const x = e; }` | igual | `var x_1 = e;` | `final var x_1 = e;` | `x_1 := e` | `let x_1 = e;` | `x_1 = e` |
| `@{ let x = e; x = f; }` | igual | `var x_1 = e; x_1 = f;` | `var x_1 = e; x_1 = f;` | `x_1 := e; x_1 = f` | `let mut x_1 = e; x_1 = f;` | `x_1 = e` · `x_1 = f` |
| `const { a, b: c = d } = x` | `const a = x.a, c = x.b ?? d` | `var t = x; var a = t.A; var c = t.B ?? d;` | `var t = x; var a = t.a(); var c = t.b() != null ? t.b() : d;` | `t := x; a := t.A; c := …` | `let t = &x; let a = &t.a; let c = t.b.clone().unwrap_or(d);` | `t = x` · `a = t.a` · `c = t.b if t.b is not None else d` |
| `const { a, ...r } = x` · `r.b` | igual | `t.B` | `t.b()` | `t.B` | `t.b` | `t.b` |
| `<app-x ...r>` | igual | una asignación por prop: los campos del tipo de `x` salvo `a` | igual | igual | igual | igual |
| `<input ...r>` | igual | un `w.Attr(nombre, valor)` por campo, generado | igual | igual | igual | igual |

### El `@code` que el servidor evalúa

| `@code` | Todos los lenguajes |
|---|---|
| `const { a, b = d } = props<T>()` | Parámetros de la función de render: el `record` de props generado, con `b ?? d` |
| `signal(v)` | `var x = v` |
| `computed(() => e)` | `var x = e`, en el orden del `@code` |
| `effect(…)` | Nada |
| `now()` | `fudic.Now()` |
| `inject(Token)` | La resolución del token en el contenedor de fudic de ese runtime (pieza 7 de IDEA-03 §5), conectado al DI del anfitrión |
| `provide(Token, factoría)` | Nada al pintar. El anfitrión registra su implementación del token por nombre. En Node, la factoría TS, como hoy |
| `trustedUrl(s)`, `trustedHtml(s)` | `fudic.TrustedUrl(s)`, `fudic.TrustedHtml(s)` |
| `date({ … })` y los demás presets | Un preset de datos del runtime con las mismas opciones (`kind` + `options`) |
| Store importado | Una variable del módulo generado del store, con su valor inicial |
| Módulo de datos | El literal, generado como constante del tipo con nombre |
| Literal de datos con tipo | Un constructor del tipo generado (`new Nodo(…)`, `Nodo{…}`, `Nodo(…)`) |

## A.3. El runtime de fudic en cada lenguaje

Lo que se escribe a mano, una vez por lenguaje. La suite de conformidad lo prueba.

| Función | Contrato |
|---|---|
| `Num(n)` | **`Number::toString` de ECMA-262** (§6.1.6.1.20): `NaN` → `NaN`; `0` y `-0` → `0`; `Infinity`, `-Infinity`; los dígitos más cortos que vuelven al mismo `f64`; notación decimal si el exponente está entre −7 y 21, si no `1e+21` / `1e-7`. Los dígitos más cortos salen de `double.ToString("R")` (C#, .NET Core 3.0+), `Double.toString` (Java 19+), `strconv.FormatFloat(x, 'e', -1, 64)` (Go), `format!("{:e}", x)` (Rust) y `repr(x)` (Python), y se reformatean a la forma de JS |
| `Str(x)` | `x` si es texto; `Num(x)` si es número |
| `Text(s)`, `Attr(s)` | Los escapes de `escapeText` y `escapeAttr` de `@fudic/ssr`, byte a byte |
| `At(xs, i)` | El elemento si `i` es entero y `0 <= i < len`; si no, ausente |
| `Get(m, k)` | El valor si la clave está; si no, ausente |
| `div(a, b)`, `mod(a, b)` | IEEE 754 sin excepciones (solo Python los necesita: sus `/` y `fmod` lanzan con `0`). `mod` lleva el signo del dividendo |
| `Now()` | El instante actual, en UTC |
| `Format(preset, v, locale)` | El catálogo de pipes (SDD-58 §4.4) sobre el ICU de la plataforma |
| `Message(partes, args, locale)` | El subconjunto ICU de SDD-58, con plural y select |
| Guarda de URL | `safeUrl` de `@fudic/dom` portado (SDD-51 §3.7) |
| `$dom`, stream, `fud-state` | Las doce operaciones, el escritor de DSD y el payload de hidratación (IDEA-06 §10.8) |

**Texto formateado.** Un pipe puede dar bytes distintos en .NET y en el navegador: un espacio de
CLDR, otra versión de ICU. No rompe nada, porque la hidratación no compara texto (IDEA-03 §4). En la
suite de conformidad, las filas de pipes comparan todo el HTML salvo el texto que formatea el pipe.

## A.4. Lo particular de cada lenguaje

- **C#.** Los campos opcionales de valor son `double?` y `bool?`. `?.` y `??` existen. Un `record`
  de props por componente.
- **Java.** Records con accesores `x()`. Un número que puede faltar es `Double` en caja, y la
  igualdad de primitivos se escribe con `==` sobre el valor desempaquetado, nunca con `equals`
  entre cajas. `switch` no admite `double`: sobre números, `if` encadenados.
- **Go.**
  - Una variable declarada y no leída es error de compilación: el emisor solo declara lo que se
    lee. Por la misma razón, el `for` de `@foreach` usa `_` como índice.
  - Una división entre constantes por cero no compila: el emisor nunca pliega constantes.
  - Sin ternario ni `??`: un temporal y un `if`.
  - Las ausencias son punteros, y `nil` en slices y maps.
- **Rust.**
  - El render toma los datos por referencia (`&T`) y solo clona al escribir texto.
  - `Option` para la presencia, y `if` como expresión para el ternario.
  - Sin `for` de C: `while` con el paso al final.
  - `match` no admite `f64` como patrón: sobre números, `if` encadenados.
- **Python.**
  - Sin scope de bloque: lo resuelve el renombrado (A.1.5). Sin `for` de C: `while`.
  - `/` y `fmod` lanzan con `0`: `fudic.div` y `fudic.mod`.
  - `switch` se baja a `if/elif`, que vale en cualquier Python 3.
  - Las closures de un bucle capturan la última vuelta, pero la vista no tiene closures.

## A.5. Un ejemplo entero

`src/routes/blog/index.fud` (vista):

```
<h1>@data.title</h1>
@foreach (const { slug, title, featured = false } of data.posts) key (slug) {
  <app-card .title=@title .href=@(`/blog/${slug}`) .variant=@(featured ? "highlight" : "default")></app-card>
} @empty {
  <p class="empty">Todavía no hay artículos.</p>
}
```

C#:

```csharp
w.Raw("<h1>"); w.Text(data.Title); w.Raw("</h1>");
var any_1 = false;
foreach (var t_1 in data.Posts)
{
    any_1 = true;
    var slug_1 = t_1.Slug; var title_1 = t_1.Title; var featured_1 = t_1.Featured ?? false;
    AppCard.Render(w, new AppCardProps(Title: title_1, Href: "/blog/" + slug_1,
                                       Variant: featured_1 ? "highlight" : "default"));
}
if (!any_1) { w.Raw("<p class=\"empty\">Todavía no hay artículos.</p>"); }
```

Python:

```python
w.raw("<h1>"); w.text(data.title); w.raw("</h1>")
any_1 = False
for t_1 in data.posts:
    any_1 = True
    slug_1 = t_1.slug
    title_1 = t_1.title
    featured_1 = t_1.featured if t_1.featured is not None else False
    app_card.render(w, AppCardProps(title=title_1, href="/blog/" + slug_1,
                                    variant="highlight" if featured_1 else "default"))
if not any_1:
    w.raw('<p class="empty">Todavía no hay artículos.</p>')
```

Las marcas de hidratación del bucle y de `@empty` son las mismas operaciones de `$dom` que escribe
el emit de TS. El ejemplo las omite.
