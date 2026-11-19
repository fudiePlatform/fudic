# `ref` y `@raw`

Casi todo en una plantilla es declarativo: escribes qué se pinta y Fudic lo mantiene al día. Para
los pocos casos en que hace falta salir de ese modelo hay dos vías, y las dos son explícitas.

## `ref`: el elemento, en una variable

Algunas cosas solo se hacen con el elemento en la mano: darle el foco, medirlo, abrir un
`<dialog>`, pasárselo a una librería. Para eso, declara una variable en `@code` y apúntala con
`ref`:

```fud path=src/components/miapp-search/miapp-search.fud
@code {
  import { signal } from "@fudic/core";

  let field: HTMLInputElement | null = null;
  const text = signal("");

  function typed(value: string) {
    text.set(value);
  }

  function clear() {
    text.set("");
    field?.focus();
  }
}

<miapp-search>
  <template shadowrootmode="open">
    <input type="search" aria-label="Buscar" ref="@field" value=@text() @input=@typed($value)>
    <button type="button" @click=@clear>Borrar</button>
  </template>
</miapp-search>
```

- **La variable es tuya**: la declaras tú, con su tipo, y Fudic solo le asigna el elemento.
- **Vale `null`** hasta que el elemento existe, y vuelve a `null` cuando desaparece. Dentro de un
  `@if` que está oculto, es `null`.
- **Se usa desde handlers y efectos**, nunca en la plantilla: el servidor no tiene elementos que
  darle.
- **Un solo nombre**, y nunca dentro de un bucle: serían varios elementos para una sola variable.
  Para actuar sobre una fila, usa la delegación ([Eventos](07-eventos.md#eventos-en-una-lista-delegación)).

```fud path=src/components/miapp-confirm/miapp-confirm.fud
@code {
  let dialog: HTMLDialogElement | null = null;
}

<miapp-confirm>
  <template shadowrootmode="open">
    <button type="button" @click=@(() => dialog?.showModal())>Borrar cuenta</button>
    <dialog ref="@dialog">
      <slot></slot>
      <form method="dialog">
        <button value="cancel">Cancelar</button>
        <button value="ok">Borrar</button>
      </form>
    </dialog>
  </template>
</miapp-confirm>
```

## `@raw`: escribir HTML

Todo lo que escribe una expresión se escapa: si el texto trae `<em>`, el usuario ve `<em>`. Para
escribir un valor **como HTML** (el cuerpo de un artículo que viene de un CMS, por ejemplo) está
`@raw`, con dos condiciones:

```fud path=src/components/miapp-article/miapp-article.fud
@code {
  import { trustedHtml, type TrustedHTML } from "@fudic/dom";

  const { body } = props<{ body: TrustedHTML }>();
  const notice = trustedHtml("<p>Artículo <strong>actualizado</strong>.</p>");
}

<miapp-article>
  <template shadowrootmode="open">
    <aside>@raw(notice)</aside>
    <div class="body">@raw(body)</div>
  </template>
</miapp-article>
```

1. **El valor tiene que venir de `trustedHtml(…)`.** Con esa marca dices «este HTML lo avalo yo».
   Un string sin marcar se escribe escapado, como cualquier `@expr`, y el editor avisa con un error
   de tipos.
2. **`@raw` es el único contenido de su elemento.** El elemento es dueño de todo lo que hay dentro,
   y cuando el valor cambia se reescribe ese contenido y nada más.

> [!IMPORTANT]
> **`trustedHtml` no limpia nada.** Marca un valor como seguro; no lo hace seguro. Si el HTML viene
> de lo que escribe un usuario, límpialo antes en el servidor. Con la política de seguridad que
> trae una app nueva, `@raw` es una de las dos únicas puertas por las que entra HTML en la página.

Esa política es estándar: la app nace con
[Trusted Types](https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API) activado en su
CSP, así que el navegador rechaza cualquier asignación de HTML que no pase por la política `fudic`.
Un `innerHTML` escrito a mano en un handler falla; `@raw` funciona, porque pasa por ella. La
seguridad tiene su capítulo (capítulo 10).

## El estándar, en MDN

- [`HTMLDialogElement.showModal()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal):
  un caso típico de `ref`.
- [`Element.innerHTML`](https://developer.mozilla.org/en-US/docs/Web/API/Element/innerHTML): lo que
  hace `@raw` en el navegador, y por qué es peligroso con texto que no controlas.
- [Trusted Types API](https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API): cómo
  el navegador bloquea el HTML que no pasa por una política.
