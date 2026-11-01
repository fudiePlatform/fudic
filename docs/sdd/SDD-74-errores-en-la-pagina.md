# SDD-74 — Errores que se quedan en la página y una `task` que no miente

> **Estado:** `Listo` — [tareas](./SDD-74-Task.md).
> **Paquetes:** `@fudic/api` · `@fudic/http` · `@fudic/core` · `@fudic/compiler` · `@fudic/diagnostics` ·
> `@fudic/language-server` · `examples/basic` · `examples/fudapi-editor`
> **Depende de:** 56 (`error-pages`, `catches` de los formularios), 60 (el `.fudapi`), 68 (`task`),
> 72 (los handlers reciben el dato) — las cuatro en `Hecho`.
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
- **`fails` en una función es un invento que no aporta.** Solo hay uno en `examples/basic`
  (`fails reserved 409`). Lo mismo se escribe con los ayudantes de `@fudic/http`:
  `throw conflict("Ese nombre está reservado.")`.
- **`task` miente con varias llamadas en fila.** `error()` solo se escribe cuando termina la
  última llamada (`core/src/task.ts:118`). Si con tres clics rápidos falla el 2.º mientras el 3.º
  sigue en curso, `error()` vale `undefined` justo después del `await` del 2.º, y quien llama
  cree que fue bien. Además, `run()` devuelve `undefined` tanto si falla como si sale bien una
  función que no devuelve nada.
- **Una casilla no vuelve a lo que dice la señal.** `checked=@p.active` se escribe como
  **atributo** y solo cuando el valor cambia respecto al último escrito. Cuando el usuario ya ha
  tocado la casilla, el atributo no la mueve, y si la señal no cambió no se escribe nada. Por eso
  `usuarios.fud:51` hace `input.checked = !active` a mano.
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
- **175. `fails` sale de las funciones y de `load`.** Solo queda en las **reglas** (es lo que une
  una regla con su texto) y en los **middlewares** (`cross-site` de `csrf`, `denied` de `auth`).
  El handler de una función lanza un error de `@fudic/http`: `badRequest`, `unauthorized`,
  `forbidden`, `notFound`, `conflict` o `new HttpError({ status, title, detail })`.
- **`run()` devuelve el resultado de su propia llamada**, y nunca rechaza.
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
  id      i32
  active  bool
```

- `catches` va en cualquier línea de la función, como `use` o `invalidates`.
- Errores, todos reutilizados de los formularios: sin status, `FUD1063`; un status fuera de
  `400`–`599`, `FUD1075`; `catches` dos veces, `FUD1071`.
- `catches` en `load`, `paths`, `layout`, un middleware o una regla: el diagnóstico de cláusula
  desconocida que ya existe para ese padre.
- **`FUD1360`** (error): `fails` dentro de una función o de `load`. Mensaje:
  ``"`fails` belongs to rules and middlewares. In a function, throw an error of @fudic/http from its handler: conflict('…'), notFound('…')."``
  El span es la línea entera del `fails`.

### 3.2. Lo generado

- El stub de navegador de una función lleva `catches: [409]` cuando la declara.
- `ClientContext` (`http/src/types.ts`) gana `readonly catches: readonly number[]`, vacío si la
  función no declara nada.
- El `.d.ts` deja de exportar `<Nombre>Fails` de funciones y de `load`. El de reglas y
  middlewares no cambia.

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
- El completado del `.fudapi` ofrece `catches` dentro de una función y deja de ofrecer `fails`
  dentro de una función y de `load`. El hover de `catches` explica la cláusula.

### 4.2. Fuera `fails` de funciones y `load`

- Parser: `fails` bajo una función o `load` da `FUD1360` y la línea se descarta. El resto del
  fichero se sigue validando.
- `emitModule` y `emitDeclarations` dejan de emitir `<Nombre>Fails` y `LoadFails`.
- Migración, en el mismo cambio:
  - `examples/basic/src/components/user-form.fudapi` y `src/server/user-form.ts`:
    `throw conflict("Ese nombre está reservado.")`, y `catches 409` en la función.
  - `examples/fudapi-editor`: `user-form.fudapi`, `usuarios.fudapi`, `src/server/user-form.ts` y
    `src/server/usuarios.ts`, igual.
  - `experiments/fudapi-form/fudapi/user-form.fudapi`: se quita la línea.
  - Los tests que usan `SaveFails` (`packages/api/test/emit/tsc.test.ts`,
    `packages/compiler/test/emit/hydrate/refresh.test.ts`) pasan a usar los ayudantes.

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
- En el servidor no cambia nada: se pintan como atributo.
- En el navegador, el pase escribe la **propiedad** (`el.checked = v`) cuando
  `el.checked !== v`, y lo compara con el DOM, no con la caché de lo último escrito.
- Un pase corre, como hoy, cuando cambia una señal que lee la vista o el estado de una `task`. Así,
  si la señal no cambió y la `task` terminó, la casilla vuelve sola a lo que dice la señal.
- Consecuencia que el ejemplo enseña: una casilla que guarda en el servidor se escribe **en
  optimista**. Primero se cambia la señal, luego se llama, y si `run()` no dice `done` se
  deshace:

  ```ts
  function marcar(id: number, active: boolean) {
    personas.set(personas().map((p) => (p.id === id ? { ...p, active } : p)));
  }

  async function activar(id: number, e: Event) {
    const active = (e.target as HTMLInputElement).checked;
    marcar(id, active);
    const r = await guardar.run({ id, active });
    if (r.status !== "done") marcar(id, !active);
  }
  ```

### 4.5. `examples/basic`

- `usuarios.fudapi`: `save` gana `catches 409`.
- `src/server/usuarios.ts`: `save` rechaza desactivar a la persona `1` con
  `conflict("A Ana no se la puede desactivar.")`.
- `usuarios.fud`:
  - `activar` como en §4.4; ni `input.checked` ni `.error() === undefined` en el `@code`;
  - `borrar` usa `run()`: `if ((await quitar.run({ id })).status === "done") …`;
  - bajo la tabla, `@if (guardar.error()) { <p role="alert">@(guardar.error().message)</p> }`;
  - el texto de la página explica en una frase la regla: lo que la función pone en `catches` se
    queda en la página; lo demás va a `error-pages`.
- `borrarNadie` se queda como está: su 404 no está en `catches` y enseña `error-pages`.

---

## 5. Criterios de aceptación

1. **Parser.** `catches 409` en una función da `catches: { statuses: [409] }` en su nodo. Sin
   status, `FUD1063`; `catches 302`, `FUD1075`; dos veces, `FUD1071`.
2. **`catches` donde no va.** En `load` y en un middleware, el diagnóstico de cláusula
   desconocida de ese padre.
3. **`FUD1360`.** `fails reserved 409 "x"` bajo una función y bajo `load` dan `FUD1360` con el
   span de la línea. Bajo una regla y bajo un middleware, nada.
4. **Emit.** El stub de navegador de una función con `catches 409 422` lleva
   `catches: [409, 422]`. Sin `catches`, no lleva el campo y `ctx.catches` es `[]`. El `.d.ts` de
   una función ya no tiene `SaveFails`.
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
9. **SSR intacto.** El HTML del servidor de esos cuatro casos es el mismo byte a byte que antes.
10. **Migración.** `pnpm typecheck` y `pnpm build` en verde con los ejemplos migrados. No queda
    ningún `Fails.` de función ni de `load` en el repo.
11. **Completado.** Dentro de una función se ofrece `catches` y no `fails`. Dentro de una regla
    se sigue ofreciendo `fails`.
12. **Ejemplo, el error se pinta.** En `/usuarios`, desmarcar a Ana: la página no navega, sale
    «A Ana no se la puede desactivar.» y la casilla vuelve a marcada.
13. **Ejemplo, tres clics rápidos.** Sobre una persona que no es Ana, con el `save` del servidor
    haciendo fallar la 2.ª llamada: al terminar, la casilla y la señal coinciden con lo que guardó
    el servidor.
14. **Ejemplo, señal desde `data`.** Tras «Entrar como Ana», `personas` vuelve a valer lo que
    trae el `data` nuevo (lo que ya hace BUG-55, fijado con un test).
15. **Cobertura.** Ningún paquete tocado baja de su umbral. El código nuevo de `task` y
    `errorPagesStep` queda cubierto en las cuatro métricas.
