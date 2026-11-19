# Atributos y propiedades

Un elemento recibe valores de dos formas, y el estándar las distingue: el **atributo**, que está
en el HTML (`<input value="hola">`), y la **propiedad**, que vive en el objeto del DOM
(`input.value`). En Fudic la diferencia se escribe con un punto:

| Escribes | Qué es | Sale del servidor |
|---|---|---|
| `title=@x` | un atributo HTML | sí, en el HTML |
| `.value=@x` en un elemento nativo | una propiedad del DOM | no: se asigna en el navegador |
| `.title=@x` en un componente | una prop del componente | sí: el componente se pinta con ella |

## Atributos

Un atributo con `@` toma su valor de una expresión. Si el valor es una sola expresión, puede ir sin
comillas; si mezcla texto y expresiones, va entre comillas:

```fud
<img src=@photo.url alt=@photo.caption>
<a href="/blog/@post.slug" title="Leer «@post.title»">@post.title</a>
```

El valor decide qué se escribe:

| Valor | Resultado |
|---|---|
| un string o un número | el atributo con ese texto |
| `true` | el atributo vacío: `<button disabled>` |
| `false`, `null` o `undefined` | ningún atributo |

Es lo que necesitan los
[atributos booleanos](https://developer.mozilla.org/en-US/docs/Glossary/Boolean/HTML) del estándar,
que significan «sí» por estar presentes, tengan el valor que tengan:

```fud
<button type="submit" disabled=@saving()>Guardar</button>
<details open=@expanded()>…</details>
```

El servidor escribe el atributo en el HTML, y en el navegador se actualiza cada vez que cambia lo
que lee.

### URLs seguras

Un `href` o un `src` cuyo valor empieza por una expresión pasa por una guarda: si la URL usa un
esquema peligroso, como `javascript:`, se escribe una URL inerte en su lugar. Es la misma función
en el servidor y en el navegador.

```fud
<a href=@link.url>@link.text</a>          @* guarded: the value decides the scheme *@
<a href="/users/@user.id">Perfil</a>     @* not guarded: it starts with "/" *@
```

Si una URL viene de una fuente de confianza y la guarda la rechazaría, márcala en `@code` con
`trustedUrl(…)`, de `@fudic/dom`.

## Clases

`class` admite texto y expresiones, como cualquier atributo:

```fud
<li class="item @status">…</li>
```

Para encender o apagar **una** clase, `class:nombre=@condición`. La condición es un booleano:

```fud
<li class="item" class:done=@task.done class:urgent=@(task.priority === 1)>@task.title</li>
```

Las dos formas conviven en el mismo elemento, y ninguna borra las clases que haya puesto otro
código (una librería, una animación): Fudic solo toca las que escribe él.

> [!NOTE]
> `class:` activa clases del `<style>` del propio componente, y por eso no se escribe en el tag del
> componente, sino en un elemento de dentro de su template. Para dar estilo al host según una prop,
> usa un atributo y [`:host()`](02-componentes.md#el-propio-tag-host).

## Estilos en línea

Un `style` escrito tal cual funciona como en cualquier HTML. Lo que no se admite es un `style` con
una expresión: el CSS puede cargar recursos (`url(…)`), y la guarda de seguridad no puede avalar
lo que traiga el valor (`FUD0915`).

```fud
<p style="margin: 0">Fijo: funciona.</p>
<p style="color: @color()">Dinámico: FUD0915.</p>
```

Para lo que cambia con el estado, define las variantes en el `<style>` del componente y elige una
con `class:`. El CSS se queda en la hoja de estilos, y la plantilla solo decide cuál se aplica.

## Propiedades del DOM: `.prop` en un elemento nativo

En un elemento nativo (`<input>`, `<video>`, `<dialog>`…), un punto delante asigna una **propiedad**
del objeto del DOM, no un atributo:

```fud
<input type="checkbox" .indeterminate=@partial()>
<video .muted=@muted() .playbackRate=@speed()></video>
```

Una propiedad solo existe en el navegador, así que **no sale en el HTML del servidor**: se asigna
cuando el componente se hidrata. Úsala para lo que no tiene atributo, como `indeterminate`, o para
lo que el atributo no controla. Para que algo se vea ya en la primera pintura, usa el atributo:

```fud
<input value=@name()>       @* in the server's HTML: the first value the user sees *@
<input .value=@name()>      @* only in the browser, after hydrating *@
```

> [!TIP]
> En un formulario no hace falta ninguna de las dos: `control=@form.campo` enlaza el campo con su
> modelo en los dos sentidos, con validación (capítulo 6).

## Props de un componente

En un componente, el punto pasa una **prop**, la que el componente declara en `props<T>()`
([Componentes](02-componentes.md#props)). El valor puede escribirse de tres formas:

```fud
<miapp-alert .text="Guardado"></miapp-alert>          @* a string, in quotes *@
<miapp-pager .page=3 .loop=true .label=null></miapp-pager>   @* a number, true, false or null, bare *@
<miapp-alert .text=@message></miapp-alert>            @* an expression *@
```

Las comillas siempre significan texto: `.page="3"` es el string `"3"`, y en una prop numérica es un
error de tipos.

A diferencia de un elemento nativo, una prop **sí** sale del servidor: el componente se pinta con
ella.

## Pasar un objeto entero: spread

Cuando un objeto trae justo lo que un componente necesita, se pasa entero con `...`:

```fud
@foreach (const product of products()) key (product.id) {
  <miapp-product ...product .badge="Oferta"></miapp-product>
}
```

- **Solo cruza lo que el componente declara.** Si `product` trae además `stock` o `sku` y el
  componente no los pide, se quedan fuera.
- **Una prop opcional que falta** en el objeto toma su valor por defecto.
- **Una prop escrita en el tag gana** al spread: aquí, `.badge`.
- Tras los puntos va un nombre o un camino (`...row.data`), nunca una expresión.

En un elemento nativo, el spread escribe un atributo por cada clave del objeto:

```fud
<input ...attrs>
```

### Recoger el resto de las props

Un componente que envuelve un elemento nativo suele usar una o dos props por su nombre y pasar el
resto tal cual. La desestructuración las reúne con `...`:

```fud path=src/components/miapp-field/miapp-field.fud
@code {
  /** A labelled text field. Every other prop goes to the input as an attribute. */
  const { label, ...rest } = props<{
    /** The text of the label. */
    label: string;
    placeholder?: string;
    required?: boolean;
    maxlength?: number;
  }>();
}

<miapp-field>
  <template shadowrootmode="open">
    <label>
      <span>@label</span>
      <input ...rest>
    </label>
  </template>
</miapp-field>
```

```fud
<miapp-field .label="Nombre" .placeholder="Ana" .required=true .maxlength=40></miapp-field>
```

`rest` lleva `placeholder`, `required` y `maxlength`, y `<input ...rest>` los escribe como
atributos, en el servidor y en el navegador. También se puede leer por campo: `@rest.placeholder`.

## El estándar, en MDN

- [Atributos de contenido frente a atributos IDL](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes#content_versus_idl_attributes):
  la diferencia entre atributo y propiedad.
- [Atributos booleanos](https://developer.mozilla.org/en-US/docs/Glossary/Boolean/HTML): por qué
  basta con que estén presentes.
- [`Element.classList`](https://developer.mozilla.org/en-US/docs/Web/API/Element/classList): la API
  que enciende y apaga clases sin tocar las demás.
