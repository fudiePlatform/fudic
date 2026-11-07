# testing

Tests unitarios con `@fudic/testing` (vitest sobre happy-dom): montaje, queries, gestos, el servidor en memoria y la frontera con el `.fudspec`.

## Qué va dónde

Dos bucles. Fuera, los criterios de aceptación (`.fudspec`, un navegador real, topic `fudspec`), que aprueba el usuario. Dentro, los tests unitarios, que escribes tú sin preguntar.

| `.fudspec` (navegador) | Test unitario (happy-dom) |
|---|---|
| Lo que una persona comprobaría mirando y tocando | Lo que el usuario no ve y no aprobaría |
| Una frase del usuario = un criterio ("deshabilitado no hace nada") | Cada variante de prop; valores límite (vacío, muy largo, `0`, caracteres HTML) |
| Teclado, foco, accesibilidad, visibilidad, tamaño y layout | El `detail` de cada evento |
| | Las funciones de servidor y cada uno de sus fallos; cada regla de un formulario |
| | Las opciones del shadow root |
| Aprobado por el usuario | Escrito por ti, sin aprobación |

- **Lo que ya es un criterio no se repite como test unitario.** Si `app-tabs.fudspec` comprueba que un clic en "Tab B" muestra su panel, ningún test unitario vuelve a comprobarlo.
- happy-dom no hace layout, ni foco real, ni referencias ARIA a través de shadow roots: un test unitario de foco, tamaño o visibilidad pasa sin demostrar nada. Eso son criterios.

## El orden: rojo, después la vista

1. Props y criterios aprobados (topic `fudspec`).
2. Escribe los tests unitarios. Ejecuta `fudic_test` y `fudic_spec_run`: **ambos deben estar en rojo por la razón correcta**.
3. Escribe la vista hasta que ambos estén en verde. En esta fase **no cambies los tests**: cambia el `.fud`.

El rojo correcto es `fail`: una aserción se ejecutó y dijo que no. `broken` significa que el test nunca llegó a una aserción: el `.fud` no compila (sus códigos `FUD` vienen con el informe), falta un import, `mount` lanzó, una query lanzó, un timeout. Un test roto no demuestra nada; arréglalo antes de seguir.

`getByRole`, `getByLabelText` y `getByText` **lanzan** cuando no encuentran ningún elemento o encuentran varios: antes de que exista la vista, un test que empieza con `t.click(t.getByRole(…))` es `broken`, no `fail`. Empieza un test así con una aserción que pueda fallar: `expect(t.queryByRole('button', { name: '+1' })).toBeInTheDocument()`, o `expect(t.query('output')).toHaveTextContent('2')`.

## Configuración

`fudic new` escribe `vitest.config.ts` con `fudicTest()` (tu plugin `fudic()`, más el entorno `fudic`) e `include: ['src/**/*.test.ts']`. Un test vive junto a lo que prueba: `src/components/app-counter/app-counter.test.ts`. `fudic_generate` escribe un primer test en verde con cada componente, página, layout, snippet, formulario y pipe.

## Componentes: `mount`

```ts
const t = await mount(AppCounter, { props: { start: 2 } });
```

- `import * as AppCounter from './app-counter.fud'` es lo que recibe `mount`. Un `.fud` con errores falla en el import, con sus diagnósticos.
- `via: 'ssr'` (por defecto): el HTML del servidor, sus shadow roots declarativos y después la hidratación, como en el navegador. El primer clic sobre un host aún no hidratado sigue contando. Las props deben ser JSON, más `Date` a cualquier profundidad.
- `via: 'client'`: el elemento creado como lo crea un padre; cualquier valor como prop.
- Otras opciones: `url` (la página en la que vive, `/` por defecto), `providers: [{ provide, use }]` (sustituir un servicio, en ambos lados), `fetch` (responder tú mismo a las funciones de servidor), `sw: true` (un Service Worker simulado; `t.invalidated` lista lo que se le pidió invalidar).
- El resultado: `t.host` (el elemento), `t.root` (su shadow root), las queries y los gestos, `t.props({ … })` (cambiar props como lo haría un padre, y después esperar al repintado), `t.settled()`, `t.unmount()`.
- Una app con `"locales"` se monta en su primer locale: los pipes formatean y `t()` traduce.

**Las queries** llegan a todos los shadow roots de debajo: `getByRole(role, { name })`, `getByLabelText(text)`, `getByText(text)` (lanzan salvo que haya exactamente uno), `queryByRole(role, { name })` (`null` si no hay ninguno), `query(selector)` (CSS, la primera coincidencia o `null`), `errorOf(label)` (el texto del slot de error de un control de formulario, o `null`).

**Los gestos** se resuelven cuando todo lo que iniciaron ha terminado (peticiones al servidor en memoria, chunks, signals): `click(el)`, `type(el, text)`, `clear(el)`, `blur(el)`, `submit(form?)` (el único formulario bajo el root si no se indica ninguno). No hay gesto de teclado ni de foco: eso es un criterio.

Las aserciones son el `expect` de vitest más los matchers de jest-dom (`toBeInTheDocument`, `toHaveTextContent`, `toHaveAttribute`, `toHaveClass`…).

```fud path=src/components/app-counter/app-counter.fud
@code {
  /** A counter that starts at `start` and adds one per click. */
  import { signal } from "@fudic/core";

  const { start = 0 } = props<{
    /** The first number shown. */
    start?: number;
  }>();

  const n = signal(start);

  function inc() {
    n.set(n() + 1);
  }
}

<app-counter>
  <template shadowrootmode="open">
    <button type="button" @click=@inc>+1</button>
    <output>@n()</output>
  </template>
</app-counter>
```

```ts path=src/components/app-counter/app-counter.test.ts
import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as AppCounter from './app-counter.fud';

test('without start, it starts at 0', async () => {
  const t = await mount(AppCounter);
  expect(t.query('output')).toHaveTextContent('0');
});

test('the first click wakes it up, and counts from start', async () => {
  const t = await mount(AppCounter, { props: { start: 2 } });
  expect(t.query('output')).toHaveTextContent('2');
  await t.click(t.getByRole('button', { name: '+1' }));
  expect(t.query('output')).toHaveTextContent('3');
});

test('a new start, from the parent, repaints', async () => {
  const t = await mount(AppCounter, { via: 'client', props: { start: 5 } });
  expect(t.query('output')).toHaveTextContent('5');
  await t.click(t.getByRole('button', { name: '+1' }));
  expect(t.query('output')).toHaveTextContent('6');
});
```

**Variantes de props desde el fixture.** El fixture del `.fudspec` es un módulo: importa sus casos en lugar de escribir las props dos veces, y prueba lo que los criterios dejan fuera. Para `app-post` (topic `fudspec`), los criterios cubren el enlace y el resaltado; la variante por defecto y un título inseguro son tests unitarios:

```ts path=src/components/app-post/app-post.test.ts
import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import fixtures from './app-post.fixture';
import * as AppPost from './app-post.fud';

test('without a variant, the default one', async () => {
  const t = await mount(AppPost, { props: fixtures.base });
  expect(t.query('article')).toHaveClass('card');
  expect(t.query('article')).not.toHaveClass('highlight');
});

test('a title is text, never markup', async () => {
  const t = await mount(AppPost, { props: { title: '<b>bold</b>', href: '/' } });
  expect(t.query('b')).toBeNull();
  expect(t.query('h2')).toHaveTextContent('<b>bold</b>');
});
```

**Eventos.** Para comprobar el `detail` de un evento, añade un listener antes del gesto y lee `(e as CustomEvent).detail`; un `emit(name, detail)` de `@fudic/dom` se escucha en `document`. Quita el listener en un `finally`.

## Opciones del shadow root y el árbol de accesibilidad

`shadowOf(host)` devuelve aquello con lo que realmente se creó el shadow root: `mode`, `delegatesFocus`, `clonable`, `serializable`, `referenceTarget` y `adoptedStyleSheets` (`'base'`, el reset de la guía de estilos que adopta todo componente de una app nueva, y `'self'` para el `<style>` propio del componente). Compruébalo una vez por `via`: el camino del servidor y el del cliente deben coincidir. `outline(root)` escribe lo que encuentra un lector de pantalla, en el formato de ARIA snapshot de Playwright: una línea por elemento con rol, su nombre y sus estados.

```fud path=src/components/app-button/app-button.fud
@code {
  /** A button that hands its focus to the inner button. */
  const { label, disabled = false } = props<{
    /** The text of the button. */
    label: string;
    /** A disabled button cannot be pressed. */
    disabled?: boolean;
  }>();
}

<head>
  <style>
    button { font: inherit; }
  </style>
</head>

<app-button>
  <template shadowrootmode="open" shadowrootdelegatesfocus>
    <button disabled=@disabled>@label</button>
  </template>
</app-button>
```

```ts path=src/components/app-button/app-button.test.ts
import { describe, expect, test } from 'vitest';
import { mount, outline, shadowOf } from '@fudic/testing';
import * as AppButton from './app-button.fud';

describe.each(['ssr', 'client'] as const)('via %s', (via) => {
  test('the shadow root delegates the focus and adopts its own sheet', async () => {
    const t = await mount(AppButton, { via, props: { label: 'Save' } });
    expect(shadowOf(t.host)).toEqual({
      mode: 'open',
      delegatesFocus: true,
      clonable: false,
      serializable: false,
      referenceTarget: null,
      adoptedStyleSheets: ['base', 'self'],
    });
  });
});

test('disabled, a screen reader meets a disabled button named Save', async () => {
  const t = await mount(AppButton, { props: { label: 'Save', disabled: true } });
  expect(outline(t.root)).toBe('- button "Save" [disabled]');
});

test('enabled, the same button without the state', async () => {
  const t = await mount(AppButton, { props: { label: 'Save' } });
  expect(outline(t.root)).toBe('- button "Save"');
});
```

`outline` no sabe lo que oculta el CSS: lo que es visible es un criterio. `renderToHtml(X)` devuelve el HTML del servidor, y `toContainTemplate({ … })` comprueba sus atributos `shadowroot*`.

## Funciones de servidor: el servidor en memoria

No se mockea nada salvo que lo mockees tú. Una llamada desde un componente pasa por la cadena del cliente, el formato de transporte y el dispatcher hasta el handler real en `src/server`, y vuelta. El componente, su `.fudapi` y su handler (topic `fudapi`; `fudic_generate { kind: "api" }` escribe los dos últimos y añade `@fudic/http`):

```fudapi path=src/components/app-hello/app-hello.fudapi
# The server functions of the component: their handlers are in src/server/components/app-hello/app-hello.ts.
post greet
  name  str
  -> str
```

```ts path=src/server/components/app-hello/app-hello.ts
import { greet } from 'fudic:components/app-hello/app-hello';

greet.handle((ctx) => `Hello, ${ctx.args.name}`);
```

```fud path=src/components/app-hello/app-hello.fud
<link rel="server" href="./app-hello.fudapi">

@code {
  /** A button that asks the server for a greeting, and says why when it cannot. */
  import { signal } from "@fudic/core";

  const said = signal("");
  const failed = signal("");

  async function go() {
    try {
      said.set(await greet({ name: "Ana" }));
    } catch (e) {
      const status = (e as { status?: number }).status;
      failed.set(status === undefined ? (e as Error).name : String(status));
    }
  }
}

<app-hello>
  <template shadowrootmode="open">
    <button type="button" @click=@go>Greet</button>
    <output role="status">@said()</output>
    <p role="alert">@failed()</p>
  </template>
</app-hello>
```

```ts path=src/components/app-hello/app-hello.test.ts
import { expect, test } from 'vitest';
import { mount, respond, respondProblem } from '@fudic/testing';
import { greet } from 'fudic:components/app-hello/app-hello';
import * as AppHello from './app-hello.fud';

test('the real handler answers, through the whole chain', async () => {
  const t = await mount(AppHello);
  await t.click(t.getByRole('button', { name: 'Greet' }));
  expect(t.getByRole('status')).toHaveTextContent('Hello, Ana');
});

test('an answer written by the test, in the format of the function', async () => {
  const t = await mount(AppHello, { fetch: () => respond(greet, 'Hello, Eva') });
  await t.click(t.getByRole('button', { name: 'Greet' }));
  expect(t.getByRole('status')).toHaveTextContent('Hello, Eva');
});

test('a 409 reaches the view with its status', async () => {
  const t = await mount(AppHello, { fetch: () => respondProblem(greet, { status: 409, title: 'Conflict' }) });
  await t.click(t.getByRole('button', { name: 'Greet' }));
  expect(t.getByRole('alert')).toHaveTextContent('409');
});

test('a network failure reaches the view as in a browser', async () => {
  const t = await mount(AppHello, {
    fetch: () => {
      throw new TypeError('Failed to fetch');
    },
  });
  await t.click(t.getByRole('button', { name: 'Greet' }));
  expect(t.getByRole('alert')).toHaveTextContent('TypeError');
});
```

- `fetch: (request) => Response` ocupa el lugar del servidor durante un test: para fallos de red, 500 y cada fallo declarado de una función.
- `respond(fn, value, init?)` y `respondProblem(fn, problem)` escriben la `Response` en el formato propio de la función (binario salvo que su cadena diga JSON). Un `Response.json(…)` no es algo que una llamada entienda.
- Una petición fuera de `/_fudic/fn/` lanza y nombra la URL.
- Para cambiar lo que ve el handler, mockea el módulo que lee, no la llamada: `vi.mock('../../data/people', () => ({ emailTaken: async (e: string) => e === 'ana@example.com' }))`.
- Un único grafo de módulos sirve al test, al cliente y al servidor: el estado de módulo (un objeto de formulario, una signal de un store) se comparte entre ambos lados y entre los tests de un fichero. Reinícialo en un `beforeEach` (`form.$reset()`).
- `clientGraphOf(X)` recorre lo que descargaría el navegador; `expect(await clientGraphOf(AppHello)).not.toReach('src/data/people.ts')` comprueba que el código de servidor se queda fuera.

## Formularios: cada regla

`fudic_generate { kind: "form", name: "person" }` escribe el formulario y su test. Prueba cada regla de cada campo y, en un componente montado, que `t.errorOf('Name')` muestra su texto tras `t.submit()`.

```fudapi path=src/forms/person.fudapi
# Every field says its type, its rules and their texts; both ends take it from here.
form personForm
  name  str = ""
    required  "Name is required."
```

```ts path=src/forms/person.test.ts
import { expect, test } from 'vitest';
import { personForm } from 'fudic:forms/person';

test('asks for the name', async () => {
  expect(await personForm.$validate()).toBe(false);
  personForm.name.set('Ada');
  expect(await personForm.$validate()).toBe(true);
});
```

## Pipes

Un pipe se prueba llamando a su `format(value, locale)`:

```ts path=src/pipes/initials.test.ts
import { expect, test } from 'vitest';
import initials from './initials';

test('initials gives the upper-case initials of a name', () => {
  expect(initials.format('ada lovelace', 'en')).toBe('AL');
  expect(initials.format('  grace   brewster hopper ', 'en')).toBe('GBH');
  expect(initials.format('', 'en')).toBe('');
});
```

## Páginas, layouts y snippets

```ts path=src/routes/index.test.ts
import { expect, test } from 'vitest';
import { visit } from '@fudic/testing';

test('answers /', async () => {
  const page = await visit('/');
  expect(page.status).toBe(200);
});
```

- `visit(url)` ejecuta el `load` de la página a través del grafo de módulos del test; `visit(url, { data: { … } })` se salta el `load`. Da `page.status`, `page.document` y las mismas queries y gestos. Un `load` que lanza renderiza `_error.fud` con su status; una redirección hace que `visit` lance y nombre el destino.
- `renderLayout(Layout, { body: '<p>body</p>', sections: { nav: '<a href="/">Home</a>' } })` renderiza un layout alrededor de ese HTML; léelo en `page.document`.
- `renderSnippet('./ui.fud', 'card("Hi", tone: "info")')` expande un snippet, escrito como tras `@render`, desde un fichero relativo al test; `{ scope: { item: { id: 1 } } }` da nombres que sus argumentos pueden leer (`'row(@item)'`).

## Ejecutarlos

`fudic_test` ejecuta los tests del proyecto en proceso; `paths: ["src/components/app-counter"]` limita los ficheros, `names: ["…"]` los tests, `failing: true` repite solo lo que no pasó la última vez. Solo se lista lo que no pasó: `fail` con su fichero, el nombre del test, la línea del `expect` y lo que se esperaba frente a lo que llegó; `broken` con sus diagnósticos (un `.fud` que no compila viene con sus códigos y su posición en el `.fud`; cualquier otra cosa es `FUD1207` con el mensaje original).

Ejecuta `fudic_test` tras cada edición de la vista: tarda milisegundos. `fudic_spec_run` lo confirma en el navegador.
