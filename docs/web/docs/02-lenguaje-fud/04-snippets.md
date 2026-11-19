# Snippets

Un snippet es un trozo de markup con nombre y parámetros, que se escribe una vez y se usa donde
haga falta. No es un componente: no tiene tag propio, ni shadow DOM, ni una línea de JavaScript.
El compilador lo expande donde se llama y desaparece. El HTML que llega al navegador es el mismo
que si lo hubieras escrito a mano en cada sitio.

## Declarar y usar

```fud
@snippet row(label: string, value: string) {
  <div class="row">
    <dt>@label</dt>
    <dd>@value</dd>
  </div>
}
```

Se declara con `@snippet`, su nombre y sus parámetros tipados, y se usa con `@render`:

```fud
<dl>
  @render row("Plan", "Básico")
  @render row("Precio", @plan.price)
  @render row("Renueva", @(plan.renews | longDate))
</dl>
```

Los argumentos se escriben igual que el valor de una prop:

- **Un literal** va tal cual: `"Básico"`, `3`, `true`.
- **Lo que lee el scope** va con `@`: `@plan.price`, o `@( … )` para una expresión.

### Parámetros con valor por defecto

Un parámetro puede tener valor por defecto. Al llamar, se le puede dar valor por su nombre:

```fud
@snippet note(text: string, tone: "info" | "warning" = "info") {
  <p class=@tone>@text</p>
}

@render note("Los cambios se guardan solos.")
@render note("Esta acción no se puede deshacer.", tone: "warning")
```

## Dónde se declara

**En el mismo fichero**, para lo que solo usa esa pieza. En un componente, los snippets van al
final, después del tag. En una ruta, en cualquier sitio.

**En un fichero de snippets**, para compartirlos entre piezas. Es un `.fud` en `src/snippets/` que
solo contiene declaraciones `@snippet`:

```sh
npx fudic g snippet ui priceTag
```

```fud path=src/snippets/ui.fud
<link rel="component" href="../components/miapp-badge/miapp-badge.fud">

@snippet priceTag(price: number, onSale: boolean = false) {
  <span class="price">@price €</span>
  @if (onSale) {
    <miapp-badge .tone="new">Oferta</miapp-badge>
  }
}
```

Quien lo usa lo enlaza con `<link rel="snippet">`:

```fud path=src/routes/pricing.fud
<link rel="layout" href="../layouts/_layout.fud">
<link rel="snippet" href="../snippets/ui.fud">

<h1>Precios</h1>
@render priceTag(9)
@render priceTag(19, onSale: true)
```

Un fichero de snippets enlaza los componentes que usan sus cuerpos, y quien llama a un snippet se
los lleva sin enlazarlos él. Si un snippet no se llama, sus componentes no se cargan.

### Dos ficheros con el mismo nombre: `as`

Si dos ficheros declaran un snippet con el mismo nombre, uno de los dos se enlaza con un espacio de
nombres:

```fud
<link rel="snippet" href="../snippets/ui.fud">
<link rel="snippet" href="../snippets/fields.fud" as="fields">

@render priceTag(9)
@render fields.priceTag("price", "Precio")
```

## ¿Snippet o componente?

| Necesitas… | Usa |
|---|---|
| No repetir un trozo de markup | un snippet |
| Estado, eventos o comportamiento | un componente |
| Estilos encapsulados, que la página no pise | un componente |
| Recibir contenido con `<slot>` | un componente |
| Cero coste: ni JavaScript, ni shadow DOM, ni un elemento de más | un snippet |

Un snippet no tiene estilos propios: su markup se pinta donde se llama y toma los estilos de ese
sitio. Llamado desde una ruta, los de la página; llamado dentro de la plantilla de un componente,
los de ese componente.

> [!IMPORTANT]
> Por la misma razón, un snippet que pinta un encabezado (`h1` a `h6`) solo se llama desde una ruta
> o un layout. Llamado dentro de la plantilla de un componente, el encabezado acabaría en su shadow
> DOM, y los encabezados nunca van ahí ([Componentes](02-componentes.md#slots-contenido-de-quien-usa-el-componente)).
