# IDEA-03 — Backend políglota: componentes fudic renderizados en C#, Java, Go…

> **Estado:** `Idea` — no es un SDD. Sin interfaz pública, sin criterios de aceptación, sin
> rango de diagnósticos. Es la captura de una conversación del **2026-10-13** para madurarla;
> **aparcada**: ni se especifica ni se implementa por ahora.
> **Paquetes implicados (previsión):** `@fudic/compiler` (traducción de la vista, DTOs,
> bloques `@server <lenguaje>`) · `@fudic/language-core` / `@fudic/language-server` · un
> runtime nuevo por lenguaje (fuera del monorepo TS) · posible relación con `@fudic/http`
> (SDD en curso) por el endpoint de datos y el formato de cable.
> **No bloquea nada.**
> **Cerrada por [IDEA-05](./IDEA-05-contrato-ts-y-backend-generado.md)** (2026-10-19): el contrato
> es TS y el backend se genera. IDEA-05 manda sobre este documento donde lo contradiga.

---

## 1. La idea

Escribir web components con serialización en el backend, como ya hace fudic, pero con ese
backend siendo **el que el equipo ya tiene**: Spring Boot, ASP.NET Core, Go, Python, Rust,
C++. Hoy el SSR de web components obliga a meter Node (Lit SSR, Next, Astro); un equipo de
.NET o Java no quiere un BFF en Node solo para pintar HTML.

Es un argumento de marketing fuerte y coherente con el de siempre: no aprendes nada que no
sea estándar (HTML, CSS, web components), y ahora **tampoco cambias de backend**. El público
existe: el de htmx/Hotwire, que quiere su backend de siempre y componentes de verdad.

Hay precedente: Enhance hace SSR de web components en WASM (Extism) para varios lenguajes.
Valida la idea; lo que diferenciaría a fudic es el compilador LSP-first, el contrato tipado
y la sintaxis `.fud`.

## 2. Lo decidido (no se reabre)

> **Revisado el 2026-10-19:** el `@server` inline y los bloques `@server <lenguaje>` se
> retiran; ver §8, que manda sobre esta sección.

**La vista es siempre TS y el `@server` se escribe en el lenguaje del backend.**

```
@code {
  @client ts {
  }
  @server c# {
  }
}
```

- La vista (`@()`, `@if`, `@foreach`, atributos, `@client`) es TS, con las reglas de SDD-51.
  El compilador la **traduce** al lenguaje del servidor.
- Un componente puede llevar varios `@server`, uno por lenguaje; el compilador elige el del
  backend de destino. Un componente sin `@server` (solo props y vista) es portable a todos sin
  hacer nada.
- Los tipos del `@code` (`type PageData = …`) generan los DTOs del lenguaje destino (records
  de C#, clases de Java, structs de Go). Se declaran una vez y las dos partes quedan tipadas.

**Por qué así.** La navegación la renderiza el Service Worker **en JS**: la vista tiene que
existir en JS de todos modos, así que escribirla en otro lenguaje no es opción. El lenguaje
nativo solo entra donde de verdad aporta, el servidor.

### Lo que se descartó, y por qué

| Vía | Por qué no |
|---|---|
| Renderer en WASM (QuickJS) embebido | Motor dentro del backend, intérprete sin JIT, depuración opaca |
| IR neutral + intérprete por lenguaje | Superado por generar código nativo directamente |
| Vista escrita en el lenguaje del backend | El SW y la hidratación necesitan la vista en JS |
| Portabilidad de un componente entre backends como requisito | Nadie cambia de backend y quiere llevarse los componentes; se cubre igual con varios `@server` |

## 3. Ejemplos en C#

Los nombres de la API C# (`HtmlWriter`, `Url.Guard`, `AddFudic`, `MapFudic`) son
ilustrativos, no están decididos.

### 3.1. Componente sin `@server` (`app-card`, N1)

El `.fud` no cambia. Sus props en TS:

```ts
const { title, href, variant = "default" } =
  props<{ title: string; href: string; variant?: Variant }>();
```

Lo que generaría el compilador (`AppCard.fud.g.cs`):

```csharp
public sealed record AppCardProps(string Title, string Href, string Variant = "default");

public static class AppCard
{
    public const string Tag = "app-card";

    public static void Render(HtmlWriter w, AppCardProps p, Action<HtmlWriter>? children = null)
    {
        w.Raw("<app-card><template shadowrootmode=\"open\" shadowrootadoptedstylesheets=\"app-card\">");
        w.Raw("<article class=\"card");
        if (p.Variant == "highlight") w.Raw(" highlight");            // variant === 'highlight'
        w.Raw("\"><header><h2><a href=\"");
        w.Attr(Url.Guard("a", "href", p.Href));                       // same bytes as safeUrl
        w.Raw("\">");
        w.Text(p.Title);                                              // escapeText
        w.Raw("</a></h2><slot name=\"meta\"></slot></header><div class=\"body\"><slot></slot></div></article></template>");
        children?.Invoke(w);                                          // light DOM → slots
        w.Raw("</app-card>");
    }
}
```

Usable suelto en una app .NET existente, como isla:

```csharp
app.MapGet("/card", () => Fudic.Html(w => AppCard.Render(w, new("Hola", "/blog/hola"))));
```

### 3.2. Ruta con `@server c#` (`blog/index`)

```
@code {
  type Post = { slug: string; title: string; summary: string; tag: string; featured: boolean };
  type PageData = { title: string; posts: Post[] };

  @server c# {
    using Blog.Data;

    [Strategy(Mode.Sw, Ttl = "5m", Policy = CachePolicy.CacheFirst)]
    public async Task<PageData> Load(IPostRepository posts)      // DI de ASP.NET por parámetro
    {
        var list = await posts.ListAsync();
        return new PageData("Blog", list);
    }
  }
}

<h1>@data.title</h1>
@if (data.posts.length === 0) { <p class="empty">Todavía no hay artículos.</p> }
else {
  @foreach (const post of data.posts) key (post.slug) {
    <app-card .title=@post.title .href=@('/blog/' + post.slug)></app-card>
  }
}
```

- Si `Load` devuelve otra forma que `PageData`, el error lo da `dotnet build`.
- El bloque C# va a un `.g.cs` con `#line "index.fud" 6`: el error sale en la línea del `.fud`.
- La vista se traduce: `data.posts.length === 0` → `data.Posts.Count == 0`.

```csharp
builder.Services.AddFudic();                                   // runtime + rutas generadas
builder.Services.AddScoped<IPostRepository, PostRepository>();
var app = builder.Build();
app.UseStaticFiles();                                          // dist del cliente: chunks, SW, manifest
app.MapFudic();                                                // páginas + endpoint de datos del SW
```

`MapFudic` registra por ruta la página (`GET /blog` → HTML) y el endpoint de datos que el SW
pide en las navegaciones, que llama al mismo `Load`.

### 3.3. N3 con estado inicial (`shopping-cart`)

```
@code {
  const { initial } = props<{ initial: number }>();
  const euros = currency('EUR');
  @client ts {
    import { signal } from "@fudic/core";
    const total = signal(initial);
  }
}
<span class="total">@(total() | euros)</span>
```

```csharp
var total = p.Initial;                          // the @client signal's initial value, translated
w.Text(Format.Currency(total, locale, "EUR"));  // the pipe catalog, ported
state.Slice(id, p.Initial);                     // fud-state, wire format
```

```html
<shopping-cart data-fud-id="0"><template shadowrootmode="open">…<span class="total">3,50 €</span>…</template></shopping-cart>
<script type="application/json" id="fud-state">{"offsets":[0,1],"data":[3.5]}</script>
```

## 4. Formateo: pipes como datos

> **Especificado en [SDD-58](../SDD-58-traducciones-y-pipes.md) §4.4** (2026-10-15), junto con las
> traducciones. El plural no es un pipe: va en el mensaje ICU del catálogo.

- **En la vista no se llama a nada.** Formatear se hace con pipes: `@(fecha | fechaLarga)`.
- **Un pipe no es código, es una declaración** sobre un catálogo cerrado que trae fudic y que
  cubre la superficie de `Intl`: fecha, número, moneda, porcentaje, tiempo relativo, plural,
  lista. Un pipe propio es un preset de opciones: `const fechaLarga = date({ dateStyle: 'long' })`.
- **El catálogo lo implementa fudic una vez por lenguaje** (C# sobre ICU/`CultureInfo`, Java
  sobre CLDR…). El usuario no escribe nada dos veces: un componente con un signal de fecha y
  `Intl` es portable.
- **No hace falta paridad al byte en el texto formateado.** La hidratación no compara textos
  (recorre por elementos; el único `textContent` que lee es el de los bloques JSON,
  `packages/core/src/hydrate/maps.ts`). Si .NET y el navegador difieren en un espacio de CLDR,
  no se rompe nada; al cambiar el signal, el cliente reformatea con su `Intl`.
- **Lo que el catálogo no expresa no es un pipe.** Por decidir: o lo calcula el servidor y el
  `@client` lo recalcula (duplicación explícita), o el compilador no lo admite.

## 5. Lo que hay que portar a cada lenguaje

Exigencia común: los mismos bytes que Node donde la hidratación los lee.

| # | Pieza | Origen hoy | Riesgo |
|---|---|---|---|
| 1 | Escritor HTML + DSD (escapes, void, rawtext, `<template shadowrootmode>` y sus atributos) | `ssr/serialize.ts`, `ssr/tree.ts` | Bajo |
| 2 | Guarda de URL (`safeUrl`, `trustedUrl`) | `dom/url.ts` | Medio: lista blanca exacta |
| 3 | `@raw` (`htmlOf`, `trustedHtml`) | `dom/html.ts` | Bajo |
| 4 | Spread de atributos (`attrsOf`) | `dom/attrs.ts` | Bajo |
| 5 | Valor → texto con semántica JS (`String(n)`, null/undefined → `''`) | implícito | **Alto**: los double se formatean distinto |
| 6 | Payload de hidratación (`data-fud-id`, slices, celdas `$`/`$f`, `fud-state`/`fud-tree`/`fud-bus`, `escapeJson`) | `ssr/ssr-dom.ts`, `ssr/json-block.ts` | **Alto**: formato de cable; aquí entran las props binarias |
| 7 | IoC (mapa de contenedores, `fud-di`) conectado al DI del anfitrión | `ssr/ioc.ts`, `ssr/seed.ts` | Medio |
| 8 | Streaming a la respuesta del anfitrión + nonce de CSP | `ssr/stream.ts`, `transport/csp.ts` | Bajo |
| 9 | Endpoint de datos de navegación del SW | transport / vite (¿`@fudic/http`?) | Medio |
| 10 | Forms (`summaryEntriesOf`, veredictos) | `@fudic/forms` | Medio |
| 11 | Catálogo de pipes | no existe | Medio |

Además, por lenguaje: integración con su build (MSBuild, Maven/Gradle, `go generate`) que
llama al compilador de fudic, y el arnés de conformidad (fixtures con su HTML esperado contra
cada runtime).

## 6. Editor

- Errores del bloque nativo mapeados al `.fud`: C# con `#line`, Go con `//line`; Java no tiene
  equivalente y necesita tabla propia.
- Por fases: primero coloreado (TextMate embebido) y errores de build sobre el `.fud`; después,
  si hace falta, reenviar completado/hover al language server nativo sobre el fichero
  generado. Esta segunda fase es la parte cara y la que más miedo da.

## 7. Abierto

1. Los inicializadores de `@client` que el servidor tiene que evaluar (`signal(initial)`):
   misma lista blanca que la vista, traducida.
2. Valor → texto: cómo garantizar que C#/Java escriben un número como JS.
3. Formato de cable: JSON con semántica JS o las props binarias que se abrieron con forms.
4. Qué hace el compilador con un formato que el catálogo de pipes no expresa.
5. La forma del contrato `@server` por lenguaje: `load`, `strategy`, `provide`/`inject`,
   `publish` frente al DI de ASP.NET o Spring.
6. Relación con `@fudic/http` (en curso): endpoint de datos y formato de cable pueden caer ahí.

## 8. Revisión del 2026-10-19: el servidor es una interfaz en su lenguaje

Dirección aceptada, a falta de perfeccionar. Manda sobre §2, §3.2 y §6.

- **El `@server` inline desaparece**, también en Node: mezclar handlers con el markup es
  código espagueti. El `.fud` queda como vista + `@client`.
- **El lenguaje del backend se declara una vez, en `fudic.json`** (al crear la app con la CLI).
  Nada de varios `@server`, uno por lenguaje.
- **Se diseña para cualquier lenguaje, no para C#.** fudic no conoce ningún lenguaje de backend.
- **Sin OpenAPI** (moda, y poco ágil) **y sin JSON escrito a mano.**
- **El contrato es una interfaz en el lenguaje del backend**, que el desarrollador define e
  implementa. El `.fud` no declara nada: `data`, `search`, `remove` quedan tipados desde ella.

```csharp
[Fudic.Route("usuarios")]
public interface IUsuarios
{
    [Load]                         Task<UsuariosData> Load();
    [Get]                          Task<Person[]> Search(string q);
    [Put, Use("auth")]             Task Save(int id, bool active);
    [Delete, Use("auth", "audit")] Task Remove(int id);
}
```

```go
//fudic:route usuarios
type Usuarios interface {
    Load(c fudic.Ctx) (UsuariosData, error)
    Search(c fudic.Ctx, q string) ([]Person, error)   //fudic:get
    Save(c fudic.Ctx, id int, active bool) error       //fudic:put use=auth
}
```

- **Paquete de lenguaje.** Cada lenguaje trae un *extractor* hecho con sus propias herramientas
  (source generator de Roslyn, `go/types`, annotation processor, compilador de TS) que deja una
  descripción interna —el desarrollador no la ve— que el LSP de fudic lee para tipar el `.fud`.
  Más el render.
- **Middlewares por nombre** (`Use("auth")`): el backend los implementa en nativo; su mitad de
  cliente (la cabecera `authorization`) sigue en TS.

### Abierto tras la revisión

1. Nombres: `Search` → `search`, `Person.Name` → `p.name` (camelCase siempre en TS).
2. Ida y vuelta en el editor: el `.fud` se entera del cambio de interfaz sin build manual (C# al
   guardar; Go necesita que el dev server vigile).
3. Forms: `personForm` es TS; ¿se deriva del tipo nativo con sus atributos de validación o sigue
   en TS y solo viaja su forma?
4. Cómo enlaza el `.fud` con su interfaz: por el nombre de ruta/componente del atributo, por
   convención o con `<link rel="server">`.
5. El render: traducir la vista a código nativo exige un generador por lenguaje. Con «cualquier
   lenguaje» pesa más la vía vista compilada a formato neutro + intérprete mínimo + suite de
   conformidad común (descartada en §2; pendiente de reabrir).

### Posible bug encontrado al revisar `@fudic/http` (2026-10-19)

Sin comprobar en el navegador; se pasa a BUG cuando se confirme.

- `decode` (`packages/http/src/client/codec.ts`) lee el resultado con `response.json()` y no lo
  revive por tipo. Una función de servidor que devuelve un `Date` llega al cliente como string,
  aunque TS lo tipe como `Date`. Los argumentos de un `.form` sí se reviven en el servidor
  (`reviveJson`); los resultados, en ningún lado.
