# SDD-74 — Errores que se quedan en la página y una `task` que no miente

> **Estado:** `Listo` — [tareas](./SDD-74-Task.md).
> **Paquetes:** `@fudic/api` · `@fudic/http` · `@fudic/core` · `@fudic/compiler` · `@fudic/diagnostics` ·
> `@fudic/language-server` · `@fudic/cli` · `@fudic/vite` · `examples/basic` · `examples/fudapi-editor` ·
> `examples/i18n`
> **Depende de:** 56 (`error-pages`, `catches` de los formularios), 58 (traducciones), 60 (el
> `.fudapi`), 68 (`task`), 72 (los handlers reciben el dato) — las cinco en `Hecho`.
> **Rango de diagnósticos:** `FUD1360`–`FUD1379` (nuevo). Usa `FUD1360`.
> **Decisiones de gramática:** 174, 175.
> **Origen:** conversación con Pedro del 2026-11-01, tras la revisión de `usuarios.fud` que hizo
> Claude web.
> **Rama sugerida:** `sdd-74-errores-en-la-pagina`

---

## 1. Qué arregla

- **Un error de una función no se puede pintar en la página.** `errorPagesStep`
  (`http/src/error-pages.ts:49-58`) solo deja pasar un status que guarde el formulario enviado,
  un 422 o una cancelación. Todo lo demás navega a `_error.fud`. Un botón que llama a `save` no
  puede quedarse su 409: la `task` se queda en `pending` para siempre y su `error()` no llega a
  tener nada.
- **El texto de un `fails` de una función lo dice el servidor.** `fails reserved 409 "…"` hace que
  el handler lance un `HttpError` con ese texto ya escrito, en el idioma del `.fudapi`. Con dos
  idiomas, la página en inglés pinta el error en español; y un backend en otro lenguaje tendría
  que traducirlo por su cuenta.
- **`task` miente con varias llamadas en fila.** `error()` solo se escribe cuando termina la
  última llamada (`core/src/task.ts:118`). Si con tres clics rápidos falla el 2.º mientras el 3.º
  sigue en curso, `error()` vale `undefined` justo después del `await` del 2.º, y quien llama
  cree que fue bien. Además, `run()` devuelve `undefined` tanto si falla como si sale bien una
  función que no devuelve nada.
- **Una casilla no vuelve a lo que dice la señal.** `checked=@p.active` se escribe como
  **atributo** y solo cuando el valor cambia respecto al último escrito. Cuando el usuario ya ha
  tocado la casilla, el atributo no la mueve, y si la señal no cambió no se escribe nada. Por eso
  `usuarios.fud:51` hace `input.checked = !active` a mano.
- **Los textos del `.fudapi` no se traducen.** Ni los mensajes de los formularios
  (`required "Escribe el nombre."`), ni los de las reglas, ni el `detail` de un `fails` de
  middleware entran en `fudic translate`. En una app con dos idiomas, el formulario sale en el
  idioma en que se escribió el `.fudapi`, sea cual sea el de la página.
- **Ya resuelto, sin trabajo aquí:** una señal que nace de `data` (`signal(data.users)`) se
  vuelve a sembrar cuando llega el `data` nuevo tras un `invalidates`
  (BUG-55, `compiler/src/emit/route-client.ts:267`). Solo se añade un criterio que lo fija
  en `usuarios.fud` (§5, 14).

---

## 2. Decisiones

- **174. `catches` en las funciones.** Una función (`get`, `post`, `put`, `patch`, `delete`)
  admite `catches <status>+`, con la misma sintaxis que un formulario. Un `HttpError` de un
  status de esa lista no va a `error-pages`: llega a quien llamó. Sin `catches`, la función no se
  queda nada (opción B, la de los formularios). Una llamada que envía un formulario se queda la
  unión de los dos `catches`.
- **175. El servidor manda el código; la página pone el texto.** El texto de un `fails` de una
  función se escribe una sola vez, en el `.fudapi`. El handler lanza `SaveFails.reserved()`, que
  viaja como el status y el **código** (`code: "reserved"` en el `Problem`). El módulo de la
  función en el navegador, compilado por idioma, lleva el texto de cada código ya traducido y lo
  pone en el error. Ningún backend — TypeScript, C#, Java, Go — sabe nada de idiomas: responde
  status y código. `fails` sale solo de `load`: lo que falla en un `load` va a `error-pages`.
  *Decidido al implementar (2026-11-02):* la primera versión quitaba `fails` de las funciones y
  traducía con `t()` en el handler, pero las llamadas las atiende un solo servidor (el del primer
  idioma, que comparte el estado con las páginas), y el texto salía siempre en ese idioma.
- **`run()` devuelve el resultado de su propia llamada**, y nunca rechaza.
- **Los textos del `.fudapi` se traducen como un `t()`.** El autor los sigue escribiendo en el
  `.fudapi`, en su idioma de origen; `fudic translate` los extrae y lo generado se compila una vez
  por idioma. La sintaxis del `.fudapi` no cambia.
- **La vista manda sobre las propiedades vivas.** En el navegador, `checked`, `value` y
  `selected` se escriben como propiedad del DOM y se comparan con lo que el DOM tiene en ese
  momento, no con lo último escrito. En cada pase, el DOM vuelve a lo que dice la señal.

---

## 3. Interfaz pública

### 3.1. `.fudapi`

```
post save
  use auth
  catches 409
  fails ana 409 "A Ana no se la puede desactivar."
  id      i32
  active  bool
```

- `catches` va en cualquier línea de la función, como `use` o `invalidates`.
- Errores, todos reutilizados de los formularios: sin status, `FUD1063`; un status fuera de
  `400`–`599`, `FUD1075`; `catches` dos veces, `FUD1071`.
- `catches` en `load`, `paths`, `layout`, un middleware o una regla: el diagnóstico de cláusula
  desconocida que ya existe para ese padre.
- **`FUD1360`** (error): `fails` dentro de `load`. Mensaje:
  ``"`fails` does not belong to `load`: a page whose data fails goes to error-pages. Throw an error of @fudic/http from its handler: notFound(), forbidden()."``
  El span es la línea entera del `fails`.

### 3.2. Lo generado

- El stub de navegador de una función lleva `catches: [409]` cuando la declara.
- `ClientContext` (`http/src/types.ts`) gana `readonly catches: readonly number[]`, vacío si la
  función no declara nada.
- El stub de navegador de una función con `fails` lleva `fails: { ana: "<texto en el idioma del módulo>" }`.
- `Problem` (`http/src/errors.ts`) gana `readonly code?: string`; `fails()` lo escribe. Al leer un
  problema, la función cambia su `detail` por el texto de su código, si lo tiene.
- El `.d.ts` deja de exportar `LoadFails`. `<Nombre>Fails` de funciones, reglas y middlewares no
  cambia.

### 3.3. `@fudic/core`

```ts
export type TaskResult<R> =
  | { readonly status: 'done'; readonly value: R }
  | { readonly status: 'failed'; readonly error: unknown }
  | { readonly status: 'cancelled' };

export interface Task<A, R, V = R | undefined> {
  // value, state, pending, cancel: sin cambios.
  /** What the last call that settled rejected with; `undefined` if it succeeded. Tracked. */
  readonly error: Readable<unknown>;
  /** Starts a call. Resolves with the outcome of THIS call. Never rejects. */
  run(...args: A extends void ? [args?: A] : [args: A]): Promise<TaskResult<R>>;
}
```

- `TaskResult` se exporta desde `@fudic/core`.

---

## 4. Comportamiento

### 4.1. `catches`

- `errorPagesStep`: un `HttpError` cuyo status está en `ctx.catches` **o** en el `catches` del
  formulario enviado se relanza tal cual. El resto, como hoy: un 422 se relanza, un `Redirect`
  navega, una ruta de `routes` navega, lo demás va a `_error.fud`.
- Con `task`, el error llega a `run()` como `{ status: 'failed', error }` y a `error()`. Con
  `await save(…)` a secas, llega como rechazo de la promesa.
- El completado del `.fudapi` ofrece `catches` y `fails` dentro de una función, y deja de ofrecer
  `fails` dentro de `load`. El hover de `catches` explica la cláusula.

### 4.2. `fails`: el código viaja, el texto lo pone la página

- Parser: `fails` bajo `load` da `FUD1360` y la línea se descarta. Bajo una función, como
  siempre.
- `emitModule` y `emitDeclarations` dejan de emitir `LoadFails`.
- Servidor: `<Nombre>Fails.<code>()` es un `HttpError` con su status, su `code` y el texto de
  origen como `detail` (para quien llame sin página: un `curl`, otro servicio).
- Navegador: si el problema trae un `code` que la función declara, el `detail` (y el `message`
  del error) pasa a ser su texto en el idioma de la página. Sin código, o con uno que no declara,
  el problema queda como llegó.
- Los textos de `fails` de una función entran en `fudic translate` (§4.5), con contexto
  `<función>.<código>`.
- Los ejemplos declaran `catches 409` junto a su `fails`, y sus handlers lanzan `<Nombre>Fails`.

### 4.3. `task`

- Cada llamada que termina escribe `error()`: su error si falló, `undefined` si salió bien. Lo
  hace aunque queden otras en la fila.
- `state()` sigue en `pending` mientras quede alguna. Cuando termina la última, pasa a `done` o
  `failed` según cómo terminó esa última.
- `run()` resuelve con:
  - `{ status: 'done', value }` si su llamada salió bien;
  - `{ status: 'failed', error }` si falló;
  - `{ status: 'cancelled' }` si se canceló, la reemplazó otra (`latest`) o el componente se
    desmontó.
- `lenta.run(…)` con `void` delante sigue igual. Quien leía `R | undefined` se migra (en el repo
  solo `examples/basic/src/routes/usuarios.fud`).

### 4.4. Propiedades vivas

- Afecta a `checked` en `<input>`, `value` en `<input>`, `<textarea>` y `<select>`, y `selected`
  en `<option>`, con valor `=@expr`.
- En el servidor, `checked` y `value` de `<input>` y `selected` de `<option>` se pintan como atributo,
  igual que hoy. `<textarea>` y `<select>` no tienen atributo `value` en HTML: el textarea lleva el
  valor como su texto (con un salto de línea más si empieza por uno, que el parser se come) y el
  select marca `selected` en el `<option>` cuyo valor coincide. Así salen bien sin script.
- Al hidratar no se escribe nada: el DOM ya dice lo que dice la señal, y lo que el usuario escribió
  antes de que llegara el script se respeta, como en un formulario.
- En el navegador, el pase escribe la **propiedad** (`el.checked = v`) cuando
  `el.checked !== v`, y lo compara con el DOM, no con la caché de lo último escrito.
- Un pase corre, como hoy, cuando cambia una señal que lee la vista o el estado de una `task`. Así,
  si la señal no cambió y la `task` terminó, la casilla vuelve sola a lo que dice la señal.
- Consecuencia que el ejemplo enseña: una casilla que guarda en el servidor se escribe **en
  optimista**. Primero se cambia la señal, luego se llama, y si `run()` no dice `done` se
  deshace:

  ```ts
  // La tabla ya está delegada (SDD-72): `@change=@activar(p, $event)` en el <tbody>.
  function marcar(id: number, active: boolean) {
    personas.set(personas().map((x) => (x.id === id ? { ...x, active } : x)));
  }

  async function activar(p: Person, e: Event) {
    const active = (e.target as HTMLInputElement).checked;
    marcar(p.id, active);
    const r = await guardar.run({ id: p.id, active });
    if (r.status !== "done") marcar(p.id, !active);
  }
  ```

### 4.5. Los textos del `.fudapi`, traducidos

- **Qué se traduce:** el texto de cada regla bajo un campo de formulario (`required "…"`,
  `min 18 "…"`), el de una regla de `summary` o un `require`, el `range "…"` de un campo, y el
  `detail` de un `fails` de una función o de un middleware. Los `fails` de una regla no tienen texto propio: lo pone
  quien la usa.
- **Extracción.** `@fudic/api` gana
  `extractApiMessages(source: string, file: string): ParseResult<readonly Message[]>`, con el mismo
  `Message` de SDD-58 y `origin: 'fudapi'`. Los `{n}` del texto son sus huecos, con el nombre del
  parámetro de la regla. La clave es `messageKey(context, source)`, como en un `.fud`; el contexto
  es la ruta de la declaración (`personForm.age.min`), para que dos textos iguales en sitios
  distintos se puedan traducir distinto.
- **`fudic translate`** lee también los `.fudapi` de `src` y de las librerías, y escribe su
  catálogo en `src/locales/<idioma>/<ruta>.json`, como el de un `.fud` (`forms/person.json`).
  Mensajes, conflictos y `FUD1024`–`FUD1026`, igual que para un `.fud`.
- **Lo generado.** `emitModule` recibe el `LocaleCompile` del idioma y escribe cada texto ya
  traducido; un texto sin traducción se queda en el de origen (SDD-58 §4.10). Sin `i18n`, la
  salida es byte a byte la de hoy. El plugin de Vite ya compila los `fudic:<id>` una vez por
  idioma: solo les pasa el `LocaleCompile`.
- **El editor.** Un texto del `.fudapi` sin traducción en algún idioma tiene el mismo aviso que uno
  de un `.fud` (el de `language-server/src/translations.ts`).
- **`examples/i18n`.** `routes/index.fudapi` gana un formulario de una línea con `required "…"` y
  una función `post reserve` con `catches 409` y `fails full 409 "Ya no quedan plazas."`, cuyo
  handler lanza `ReserveFails.full()`. Los dos textos, traducidos en `locales/en` y `locales/es`.
- **El plugin, por idioma.** Con dos idiomas y una librería con mitades de navegador
  (`@fudic/forms`), cada idioma tiene su raíz del navegador: un chunk de un idioma lleva el idioma
  delante (`en-fudic-root.browser-…`) salvo que su nombre ya lo diga (`h/en/…`,
  `index_locale_en`). Sin eso, las dos raíces eran un fichero tras poner el id del build
  (`FUD0501`).

### 4.6. `examples/basic`

- `usuarios.fudapi`: `save` gana `catches 409` y `fails ana 409 "A Ana no se la puede desactivar."`.
- `src/server/usuarios.ts`: `save` rechaza desactivar a la persona `1` con `SaveFails.ana()`.
- `usuarios.fud`:
  - `activar` como en §4.4; ni `input.checked` ni `.error() === undefined` en el `@code`;
  - `borrar(p: Person)` usa `run()`: `if ((await quitar.run({ id: p.id })).status === "done") …`;
  - la tabla sigue delegada como la deja SDD-72;
  - bajo la tabla, `@if (motivo() !== "") { <p role="alert">@motivo()</p> }`: `activar` guarda en la
    señal `motivo` el mensaje de `run()` cuando dice `failed` (la vista no admite `@if (guardar.error())`,
    que no es un `boolean`, ni leer `.message` de un `unknown`);
  - el texto de la página explica en una frase la regla: lo que la función pone en `catches` se
    queda en la página; lo demás va a `error-pages`.
- `borrarNadie` se queda como está: su 404 no está en `catches` y enseña `error-pages`.

---

## 5. Criterios de aceptación

1. **Parser.** `catches 409` en una función da `catches: { statuses: [409] }` en su nodo. Sin
   status, `FUD1063`; `catches 302`, `FUD1075`; dos veces, `FUD1071`.
2. **`catches` donde no va.** En `load` y en un middleware, el diagnóstico de cláusula
   desconocida de ese padre.
3. **`FUD1360`.** `fails reserved 409 "x"` bajo `load` da `FUD1360` con el span de la línea. Bajo
   una función, una regla o un middleware, nada.
4. **Emit.** El stub de navegador de una función con `catches 409 422` lleva
   `catches: [409, 422]`. Sin `catches`, no lleva el campo y `ctx.catches` es `[]`. Con
   `fails full 409 "x"`, el stub lleva `fails: { full: "x" }` y el `.d.ts` exporta `SaveFails`; el
   de `load` ya no exporta `LoadFails`.
5. **`errorPagesStep`.** Con `ctx.catches = [409]`, un `HttpError` 409 se relanza y no navega. Un
   404 navega a `_error.fud/404`. Un 409 con `ctx.catches = []` pero enviado por un form con
   `catches 409` se relanza.
6. **`run()` por llamada.** Bien → `{ status: 'done', value }`; falla → `{ status: 'failed', error }`;
   `cancel()` → `{ status: 'cancelled' }`; reemplazada en `latest` → `{ status: 'cancelled' }`.
   `run()` nunca rechaza.
7. **La fila.** Tres llamadas en `queue`; la 2.ª falla y la 3.ª sigue en curso. El `run()` de la
   2.ª resuelve `failed`; en ese momento `error()` es su error y `state()` es `pending`. Al
   terminar la 3.ª bien, `error()` es `undefined` y `state()` es `done`.
8. **Propiedad viva.** Un `<input type="checkbox" checked=@x()>` con `x` a `false`: el usuario lo
   marca, se ejecuta un pase y la casilla vuelve a desmarcada. Igual con `value` en `<input>` y
   `<textarea>`, y `selected` en `<option>`.
9. **SSR.** El HTML del servidor de `checked` y `value` en `<input>` y `selected` en `<option>` es el
   mismo byte a byte que antes. `<textarea value=@x()>` sale con el valor como texto y `<select value=@x()>`
   con `selected` en su option, sin atributo `value`; sin script, los dos muestran el valor.
10. **El código viaja.** `SaveFails.full()` responde un problema con `code: "full"` (en JSON y en
    `fud-bin`). En el navegador, una función con `fails: { full: "y" }` que recibe ese problema
    rechaza con un `HttpError` cuyo `detail` y `message` son `"y"`; con un código que no declara,
    el problema queda como llegó. `pnpm typecheck` y `pnpm build` en verde.
11. **Completado.** Dentro de una función se ofrecen `catches` y `fails`; dentro de `load`, `fails`
    no. Dentro de una regla se sigue ofreciendo `fails`.
12. **Ejemplo, el error se pinta.** En `/usuarios`, desmarcar a Ana: la página no navega, sale
    «A Ana no se la puede desactivar.» y la casilla vuelve a marcada.
13. **Ejemplo, tres clics rápidos.** Sobre una persona que no es Ana, con el `save` del servidor
    haciendo fallar la 2.ª llamada: al terminar, la casilla y la señal coinciden con lo que guardó
    el servidor.
14. **Ejemplo, señal desde `data`.** Tras «Entrar como Ana», `personas` vuelve a valer lo que
    trae el `data` nuevo (lo que ya hace BUG-55, fijado con un test).
15. **Cobertura.** Ningún paquete tocado baja de su umbral. El código nuevo de `task`,
    `errorPagesStep` y `extractApiMessages` queda cubierto en las cuatro métricas.
16. **Extracción del `.fudapi`.** `extractApiMessages` sobre `forms/person.fudapi` da un mensaje
    por texto, con `origin: 'fudapi'`; el de `min 18 "Tiene que tener al menos {n} años."` tiene el
    hueco `n`. Dos textos iguales en dos campos dan dos claves.
17. **`fudic translate`.** En `examples/i18n`, escribe `src/locales/en/routes/index.json` con los
    textos del `.fudapi`, y una segunda pasada no cambia nada.
18. **Lo generado por idioma.** El `fudic:routes/index` de `en` lleva el texto en inglés y el de
    `es` en español. Sin `i18n`, `emitModule` da los mismos bytes que antes.
19. **El error traducido.** En `examples/i18n`, `reserve` (`catches 409`, `fails full`): en `/en`
    el error que se pinta está en inglés; en `/es`, en español. El servidor es uno, y el mismo para
    los dos idiomas.
20. **El formulario traducido.** En `/en`, enviar el formulario vacío pinta el `required` en
    inglés.
21. **Texto sin traducir.** Quitar la traducción inglesa de un texto del `.fudapi`: la página en
    inglés pinta el de origen y el editor avisa en el texto.
