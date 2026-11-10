# SDD-80 — Cierre de formularios y eventos: reglas remotas, `$value`, handlers con nombre y eventos del formulario en el host

> **Estado:** `Hecho` (2026-11-09), con la prueba de Pedro (criterio 40) superada — [tareas](./SDD-80-Task.md).
> **Paquetes:** `@fudic/api` · `@fudic/forms` · `@fudic/http` · `@fudic/conventions` · `@fudic/vite` ·
> `@fudic/compiler` · `@fudic/language-core` · `@fudic/language-server` · `@fudic/vscode` ·
> `@fudic/diagnostics` · `@fudic/mcp` (guía) · `examples/basic`
> **Depende de:** 37 (delegación), 56 (`form:=`, `fudic:result`, `fudic:error`), 60 (reglas y stubs del
> `.fudapi`), 67 (binario por defecto, `use json`), 72 (marcador con eventos, fila sin `$`,
> handlers que reciben el dato), 75 (editor del `.fudapi`). Todas en `Hecho`.
> **Rango de diagnósticos:** `FUD1460`–`FUD1479` (usa `FUD1460`–`FUD1466`).
> **Decisiones de gramática:** 178 (enmienda la 97), 179 (enmienda la 176), 180 (`.fudapi`).
> **Origen:** conversación con Pedro del 2026-11-07, sobre las notas 2 y 6 de `docs/PENDIENTE.md` y
> la función `activar` de `examples/basic/src/routes/usuarios.fud`.
> **Rama:** la del worktree `pendiente` (`worktree-pendiente`), o `sdd-80-cierre-de-formularios-y-eventos`.
>
> **Qué añade en una frase.** Una regla del `.fudapi` puede ejecutarse en el servidor y el navegador
> preguntarla mientras se escribe (`runs remote`); un handler recibe el valor del control que disparó
> el evento ya tipado (`$value`); una fila puede tener varios botones con el mismo evento delegados al
> padre (`@click.borrar`, `@click.ver`); y `@fudic:result` y `@fudic:error` se escriben en el tag del
> componente que envuelve el formulario. **Es el cierre de formularios y de la delegación de
> eventos: no deja nada fuera de alcance.** Todo llega al editor: completado, hover, colores y
> snippets.

---

## 1. Contexto y objetivo

Cuatro huecos, los cuatro vistos con código de `examples/basic`.

**1. Una regla de servidor solo se comprueba al enviar.** `alias-taken` (`src/rules/people.fudapi`)
lee la tabla de alias, que no llega al navegador. Hoy se declara `runs server` + `async`, y en el
navegador el módulo generado la marca `never: true` (`packages/api/src/emit/module.ts:110-116`): se
salta. El usuario escribe un alias cogido, rellena el resto y solo al pulsar *Guardar* se entera. En
el ejemplo, ni eso: `app-form.fud` corta el envío, así que `alias-taken` no se comprueba nunca.

**2. El valor de un control se saca a mano.** En `usuarios.fud`:

```ts
async function activar(p: Person, e: Event) {
  const active = (e.target as HTMLInputElement).checked;   // cast a mano
  …
}
function buscar(e: Event) {
  texto.set((e.target as HTMLInputElement).value);         // y otra vez
}
```

Un `ref` no lo resuelve: no se admite en un bucle (decisión 31) y da el nodo, no el valor. El
compilador ya sabe qué elemento dispara cada evento (el que lleva `@change`, o el marcado con
`delegate:p="change"`) y qué tipo tiene; puede sacar el valor igual que lo hace `control=`.

**3. Dos botones con el mismo evento no se pueden delegar.** La decisión 176 separa por evento: la
casilla con `change`, el botón con `click`. Pero una fila con *Borrar* y *Ver*, los dos `click`,
llevaría los dos al mismo handler, y no se pueden escribir dos `@click` en el `<tbody>` (`FUD0190`).

**4. `fudic:result` y `fudic:error` no salen del componente.** `bind-form.ts:147,157` los lanza con
`bubbles: true` y sin `composed`: no cruzan el shadow root. `<app-user-form @fudic:result=@hecho>`
no recibe nada, y el editor tipa el dato como `unknown`.

**Objetivo.** Que lo de arriba se escriba así, con el editor ayudando en cada línea:

```
# rules/people.fudapi
rule alias-taken
  on field str
  runs remote
  fails alias-taken
```

```html
<input :=… control=@userForm.alias>
@if (userForm.alias.pending()) { <small>Comprobando…</small> }

<tbody @change=@activar(p, $value) @click.borrar=@borrar(p) @click.ver=@ver(p)>
  @foreach (const p of personas()) key (p.id) {
    <tr>
      <td><input type="checkbox" checked=@p.active delegate:p="change"></td>
      <td><button delegate:p="click.borrar">Borrar</button></td>
      <td><button delegate:p="click.ver">Ver</button></td>
    </tr>
  }
</tbody>

<user-form @fudic:result=@alta></user-form>
```

```ts
async function activar(p: Person, active: boolean) { … }
function alta(persona: Person) { … }
```

---

## 2. Dependencias

Lo que ya existe y se usa tal cual:

- **Reglas del `.fudapi`** (SDD-60). `ruleDecl` en `packages/api/src/extensions.ts:53-120` lee `on`,
  `runs` (`RUNS = ['both', 'server']`, :49), `async` y `fails`. El AST es `RuleDecl`
  (`ast.ts:514-524`). El módulo generado `fudic:<id>` exporta `rule({ id, name, fails, server?,
  async?, never? })` (`@fudic/forms/contract`, `contract/rule.ts`). El desarrollador implementa con
  `.check(fn)`; `Check<V, P, C> = (value, params) => Verdict` (:16).
- **Reglas async en el navegador.** `markAsync` (`async-flag.ts`), `verdicts.ts` (`watch`/`settled`
  por época), `run-rule.ts` (`holds()` da no válido mientras una async no contestó a este valor),
  `control.ts` (época por escritura; un resultado tardío solo se publica si es de la época actual).
- **Reglas de servidor en el envío.** `withForm` (`packages/http/src/server/dispatch.ts:52-70`) hace
  `$validate({ server: true })` y responde 422 con los errores.
- **Funciones del servidor** (SDD-60, 67). `contractsHandler` (`http/src/contract/server.ts:139-148`)
  sirve `FN_PREFIX` (`conventions/src/index.ts:128`); `serve()` (:56-91) comprueba método, firma
  `fud-sig` (412), argumentos, reglas de los argumentos, compone la cadena de middlewares
  (`compose`, `contract/middleware.ts:103-128`) y responde con su `Wire`. `binWire` por defecto,
  `jsonWire` con `use json` (`emit/shared.ts:135-143`, `effective()`). El stub del navegador
  (`contract/fn.ts:117-196`) hace `fetch` con `AbortSignal`. Los problemas viajan en el formato de
  la función (`server/problem.ts`, `client/codec.ts`).
- **`use`/`skip`** en el `.fudapi`: `useClause` (`api/src/clauses.ts:104-121`), con sus
  comprobaciones `FUD1080`, `FUD1086`, `FUD1087` (`validate.ts`).
- **Vite.** Dev monta `/_fudic/fn` en `plugin.ts:1029-1050`, preview en :1276-1288, la tabla del build
  en :2107-2111 (`api-modules.ts:151-160`, `functionTable()`).
- **Event bindings** (SDD-15, decisiones 96–98). `handlerShape()` (`compiler/src/binding/handler.ts`)
  clasifica referencia, llamada y lambda; una llamada se envuelve en `($event) => <texto>`
  (`emit/events.ts`). El servidor no emite nada para un evento.
- **Delegación** (SDD-37, SDD-72). `classifyDelegate` (`binding/classify.ts:270-299`) lee el valor
  del marcador como lista de palabras; `planDelegation` (`semantic/delegation.ts:454-624`) empareja
  marca y handler por nombre de la fila y por **texto exacto** del evento, y escribe una tabla
  `$tN = new WeakMap()` por elemento, nombre y evento. El listener recorre `composedPath()`.
  `eventsReadingRow` (:247-265) alimenta el completado del valor del marcador.
- **El tipo de un control.** `staticType(el)` y `controlTarget` en `compiler/src/binding/control.ts`
  (:114-197): checkbox, radio, number/range y texto. Los lectores del runtime: `bind-checkbox.ts:24`
  (`el.checked`), `bind-number.ts:27` (`el.value === '' ? null : Number(el.value)`).
- **La proyección** (SDD-23, SDD-72). `emitBehaviour` y `emitHandler`
  (`language-core/src/template/attrs.ts:666-975`); `$on`, `$onResult`, `$onError`, `$El<T>` en
  `globals.ts`. El registro global por proyección ya existe para el bus (`FudicBusReceivers`).
- **El editor.** Completado y snippets del `.fudapi` (`language-server/src/fudapi/completion.ts`,
  `snippets.ts`); del `.fud`, `services/plugin.ts`, `ts-completion.ts`, `position.ts`,
  `delegate.ts`; gramáticas TextMate en `packages/vscode/syntaxes/`.

---

## 3. Interfaz pública

### 3.1. `runs remote` (decisión 180)

Un tercer valor de `runs`:

| `runs` | Navegador | Servidor |
|---|---|---|
| `both` | la ejecuta | la ejecuta |
| `server` | no la ve | la ejecuta al enviar |
| **`remote`** | **la pregunta al servidor mientras se escribe** | **la ejecuta al enviar y cuando el navegador pregunta** |

Una regla `remote` admite dos líneas más, las dos opcionales:

```
rule alias-taken
  on field str
  runs remote
  debounce 300          # ms entre la última tecla y la pregunta; 300 si no se escribe
  use rate-limit        # middlewares, como en una función; también skip
  use json              # la pregunta viaja en JSON; sin él, en binario
  fails alias-taken
```

- **`async` sobra** en una regla `remote`: siempre lo es. Si se escribe, no pasa nada.
- **`debounce <n>`** es un entero de milisegundos, `0` incluido. Solo en una regla `remote`
  (`FUD1460`). Sin valor, `FUD1063`; repetido, `FUD1071`; un valor que no es un entero, `FUD1065`.
- **`use` y `skip`** valen en una regla `server` o `remote`, con la misma sintaxis y las mismas
  comprobaciones que en una función. En una regla `both`, `FUD1461`. Ningún middleware es
  obligatorio: `use rate-limit` es un ejemplo de lo que el desarrollador puede escribirse.
- **`on field`, `on group`, `on form`** valen igual: lo que se pregunta es el valor de lo que la regla
  vigila (un `str`, el objeto de un grupo).
- El formulario que usa la regla **no cambia**: `alias-taken "Ese alias ya está cogido."`.

### 3.2. El check en el servidor

```ts
// src/server/rules.ts — no cambia
aliasTaken.check(async (value) => !(await aliasInUse(value)));
```

El check de una regla `server` o `remote` recibe un tercer argumento, el contexto del servidor, con lo
que añadan sus middlewares:

```ts
emailTaken.check(async (value, _params, ctx) => !(await emailInUseByOther(value, ctx.user.id)));
```

`Check<V, P, C, X>` gana `X`, el contexto: en `both` no existe; en `server` y `remote`, el contexto
del servidor más los `adds` de los `use` de la regla. Los middlewares de la regla corren alrededor
de su check **siempre que el servidor la ejecuta**: al enviar y al preguntar.

### 3.3. La pregunta por HTTP

```
POST /_fudic/rule/<id>/<nombre>          RULE_PREFIX = '/_fudic/rule' en @fudic/conventions
```

| | Petición | Respuesta 200 |
|---|---|---|
| Por defecto (`fud-bin`) | el valor y los parámetros del uso, con su firma `fud-sig` | el veredicto: `null` si pasa, o el código que falló |
| Con `use json` | `{ "value": "pedro", "params": {} }` | `{ "ok": true }` o `{ "ok": false, "fails": "alias-taken" }` |

- **Solo una regla `remote` tiene ruta.** Una `server` responde 404, como una función que no existe:
  declarar `remote` es la decisión de exponerla.
- Delante del check corren, en orden: la firma (412), la forma del valor y de los parámetros (400),
  la cadena `$global` y los middlewares de la regla.
- Un error viaja como problem en el formato de la regla (`fud-bin` o `application/problem+json`).
- **Se manda el valor de lo que la regla vigila y los parámetros de ese uso**, nunca el formulario
  entero.

### 3.4. `pending()` en el formulario

```ts
interface Control<T> {
  …
  /** True while an async rule of this node has not answered for the current value. */
  readonly pending: Readable<boolean>;
}
interface FormApi<S> {
  …
  /** True while any node of the form is pending. */
  readonly $pending: Readable<boolean>;
}
```

- Vale para cualquier regla async (`remote` o `both` + `async`), en campos y en grupos.
- Mientras `pending()` es `true`, `valid()` y `$valid()` son `false`, como hoy.

### 3.5. `$value` (decisión 178)

`$value` es, como `$event`, del compilador: solo existe en la lista de argumentos de un event
binding, y es el valor del control que disparó el evento, con su tipo.

**Qué control.** Sin delegación, el elemento que lleva el `@evento`. Con delegación, el elemento
marcado con `delegate:<fila>` que sirve a ese evento (no el `target`).

**Qué valor y qué tipo.** Los mismos lectores que usa `control=`:

| Elemento | Valor | Tipo |
|---|---|---|
| `<input type="checkbox">` | `checked` | `boolean` |
| `<input type="radio">` | `value` | `string` |
| `<input type="number">` | `value === '' ? null : Number(value)` | `number \| null` |
| `<input type="range">` | `Number(value)` | `number` |
| `<input type="file">` | `Array.from(files ?? [])` | `File[]` |
| `<select multiple>` | los `value` de `selectedOptions` | `string[]` |
| cualquier otro `<input>`, `<textarea>`, `<select>` | `value` | `string` |

- **Vale en cualquier evento** de ese control: `input`, `change`, `blur`, `keydown`… El valor es el del
  DOM en el momento del disparo (en `keydown`, todavía sin la tecla).
- En un elemento que no está en la tabla (un `<div>`, un `<button>`, un tag de componente), o en
  `bus:`, `@fudic:result`, `@fudic:error`: `FUD1462`.
- Un `<input>` con `type=@expr` no tiene tipo fijo: `FUD1463`.
- Con delegación, si las marcas que sirven a ese evento dan tipos distintos: `FUD1464`, que sugiere
  listar los eventos en el marcador.
- Fuera de los argumentos de un event binding, `$value` sigue siendo un `$` reservado (`FUD0666`).
  `userForm.$value()` no cambia: es un miembro, no un nombre suelto.

### 3.6. Handlers con nombre (decisión 179)

Un event binding puede llevar un nombre detrás del evento: `@<evento>.<nombre>`. El marcador lo
pide con el mismo texto en su lista: `delegate:p="click.borrar"`.

```html
<tbody @click.borrar=@borrar(p) @click.ver=@ver(p)>
  …<button delegate:p="click.borrar">Borrar</button>
  …<button delegate:p="click.ver">Ver</button>
```

- El evento es lo que va antes del primer `.`; el nombre, lo de después. El nombre es
  `[a-z][a-z0-9-]*`. `@click.` o `@click.a.b`: `FUD1465`.
- Un handler con nombre **solo existe delegado**: tiene que leer una fila. Si no lee ninguna,
  `FUD1466`.
- Una marca con nombre (`click.borrar`) solo la lee `@click.borrar`. Una marca sin nombre (`click`) o
  sin lista solo la leen los handlers sin nombre. Así el `click` de *Ver* nunca llega a *Borrar*.
- Una marca que pide un nombre que ningún ancestro tiene: `FUD1381`, como un evento que nadie lee.
- `@click` y `@click.borrar` pueden convivir en el mismo elemento.
- Un evento cuyo nombre lleva un `.` ya no se puede escuchar con `@` (`@my.event` es el evento `my`
  con nombre `event`). Ningún evento del navegador lleva `.`; un componente que lance uno lo
  escucha con `addEventListener`.

### 3.7. `@fudic:result` y `@fudic:error` en el host

```html
<user-form @fudic:result=@alta @fudic:error=@fallo></user-form>
```

- `bind-form` lanza los dos eventos con `bubbles: true, composed: true`: cruzan los shadow roots y
  llegan al host del componente, y a los de fuera si hay varios niveles. Cada nivel los recibe; quien
  quiera cortarlo, `$event.stopPropagation()` con la forma de llamada.
- **El editor tipa el dato en el host.** Cada componente declara en un registro global lo que
  devuelven sus formularios: la unión de los `-> T` de cada `<form form:=@fn>` de su plantilla y de
  lo que declaran los componentes que usa dentro. `<user-form @fudic:result=@alta>` da a `alta` un
  `Person`. Un componente sin formularios da `never`, y el handler es un error de TS en el sitio.
- `@fudic:error` en el host recibe un `Error`, como en el `<form>`.

### 3.8. Diagnósticos nuevos

| Código | Severidad | Cuándo |
|---|---|---|
| `FUD1460` | error | `debounce` en una regla que no es `runs remote` |
| `FUD1461` | error | `use` o `skip` en una regla `runs both` |
| `FUD1462` | error | `$value` donde no hay control: elemento sin valor, `bus:`, `@fudic:*` |
| `FUD1463` | error | `$value` en un `<input>` con `type` dinámico |
| `FUD1464` | error | `$value` en un handler delegado cuyas marcas dan tipos distintos |
| `FUD1465` | error | nombre de handler vacío o mal formado (`@click.`, `@click.a.b`, `@click.Borrar`) |
| `FUD1466` | error | handler con nombre que no lee ninguna fila |

Cambia: `FUD1383` deja de saltar con `$value` (sí con cualquier otro `$x`).

---

## 4. Comportamiento

### 4.1. El `.fudapi`

- `RUNS = ['both', 'server', 'remote']`; `RULE_LINES` gana `debounce` y `use`/`skip` (reutiliza
  `useClause`). `RuleDecl` gana `debounce?: { keyword, value, span }`, `uses?` y `skips?` con la forma
  de `FnDecl`.
- `validate.ts` comprueba `FUD1460`, `FUD1461` y los middlewares como en una función. En
  `validate-form.ts:155`, una regla `remote` ofrece `{detail}` igual que una `server`.
- `format.ts` conoce `debounce`.

### 4.2. El módulo generado

- **Servidor:** `rule({ …, server: true, remote: true, async: true, chain, wire, sig })`. El módulo de
  servidor raíz registra la ruta de cada regla `remote` (`api-modules.ts`, como `functionTable()`).
- **Navegador:** `rule({ …, remote: true, async: true, debounce, wire, sig, base })`, sin `never`.
  `.check()` en el navegador sigue lanzando, como hoy en `never`.
- `RuleSpec` gana `remote?`, `debounce?`, `chain?`, `wire?`, `sig?`. `Rule.use(params)` devuelve en
  el navegador el validador remoto (§4.3); en el servidor, el de siempre envuelto en la cadena.
- `.d.ts`: `<Name>Check` lleva el tercer argumento en `server` y `remote` (§3.2).

### 4.3. El validador remoto, en el navegador

Uno por uso (un campo, una regla). Guarda un temporizador, un `AbortController` y una caché
`valor+parámetros → errores`.

1. Si la caché tiene el valor, contesta con lo guardado, sin red.
2. Si no, espera `debounce` ms. Una llamada nueva antes de que venza reinicia la espera.
3. Pregunta por `fetch` con su `AbortSignal`, a través de las mitades de cliente de su cadena (§8.2.28). Una llamada nueva aborta la pregunta en vuelo; la época
   de `control.ts` ya descarta lo que llegue tarde.
4. Respuesta 200: el veredicto se convierte en errores igual que hoy (`errorFor`) y se guarda.
5. **Cualquier otra cosa** (red caída, 401, 429, 500): pasa como válido, no se guarda y no pinta nada.
   La regla remota es comodidad; la autoridad es el envío.

**Al enviar.** El navegador no pregunta: la regla la ejecuta el servidor en `withForm`. Si la caché
tiene un fallo para el valor actual, el formulario ya es no válido y no se envía, como con cualquier
regla. Una pregunta en vuelo se aborta.

`pending()` sale de la misma época: `true` desde que el control tiene un valor que una async aún no
contestó hasta que contesta (o se aborta y pasa como válido).

### 4.4. El servidor

- `contractsHandler` sirve también `RULE_PREFIX`. Encuentra la regla por `<id>/<nombre>`; si no
  existe o no es `remote`, 404.
- Comprueba firma, decodifica con el `Wire` de la regla, comprueba la forma (`conform`) del valor y de
  los parámetros, compone `$global` + los `use` de la regla, y llama al check con
  `(value, params, ctx)`.
- `withForm` pasa el contexto de la función a `$validate({ server: true, ctx })`, y cada regla
  `server`/`remote` corre sus propios middlewares alrededor de su check con ese contexto.
- Vite: dev, preview y el build montan `RULE_PREFIX` junto a `FN_PREFIX` (`functions.ts`,
  `plugin.ts`). El check y lo que importa siguen sin llegar al bundle del navegador.

### 4.5. `$value` en el compilador

- `semantic/delegation.ts`: `$value` deja de ser un `$` extraño en los argumentos de un handler.
- Un analizador nuevo decide el control de cada handler que menciona `$value` (§3.5) y da
  `FUD1462`–`FUD1464`. Reutiliza `staticType`/`controlTarget` de `binding/control.ts`, que pasan a
  exportar también el tipo del valor.
- **Emit sin delegación:** `($event) => { const $value = <lector>($event.currentTarget); return <texto>; }`
  con el lector en línea (`$event.currentTarget.checked`, etc.). No se añade nada al runtime.
- **Emit con delegación:** el listener guarda el elemento marcado que encontró
  (`for (const $y of $event.composedPath()) { if ($z0 === undefined && $t0.has($y)) { $z0 = $t0.get($y); $x0 = $y; } }`)
  y lee el valor de `$x0`.
- El servidor no emite nada, como para cualquier evento.

### 4.6. Handlers con nombre en el compilador

- `classifyEvent` separa `@click.borrar` en evento `click` y nombre `borrar`; `FUD1465`.
- `planDelegation` empareja por fila, evento **y nombre**. Las tablas llevan el nombre en la clave.
- Cada handler con nombre emite su propio listener del evento base: `$dom.event(v, "click", …)`. Son
  tantos listeners como handlers en el padre, nunca uno por fila.
- `NON_BUBBLING`, `FUD0665` y `FUD1380` miran el evento base.

### 4.7. La proyección

- **`$value`:** el handler se proyecta con `const $value: <tipo> = …` antes de la llamada, con el tipo
  de §3.5. El hover sobre `$value` dice su tipo.
- **Handler con nombre:** `emitEventName` proyecta solo el evento base (`$on('click', …)`), y el
  nombre queda como texto sin mapear a TS.
- **Eventos del formulario en el host:** cada proyección de componente escribe en
  `declare global { interface FudicFormResults { '<tag>': <unión> } }` la unión de sus `form:=` y de
  los `FudicFormResults['<tag>']` de los componentes que usa (§3.7). `@fudic:result` sobre un tag de
  componente proyecta `$onResultOf<'<tag>'>(h)`. El lote de `@fudic/typecheck` ve el registro, como el
  del bus.

### 4.8. El editor

**`.fudapi`:**

- Detrás de `runs`: `both`, `server` y `remote`, cada uno con su explicación.
- `debounce` se ofrece solo en una regla `remote`; `use` y `skip`, en una `server` o `remote` (§3.1);
  en una `both`, ninguna (§8.2.23).
  Detrás de `use`/`skip`, los middlewares, como en una función.
- El snippet `rule` ofrece `remote` en su lista de `runs`. Snippet nuevo `rule remote`:
  `rule ${1:name}\n  on field ${2:str}\n  runs remote\n  debounce ${3:300}\n  fails ${4:code}`.
- Hover sobre `remote` y sobre `debounce`, con lo que hacen.
- La gramática TextMate colorea `remote` y `debounce`.

**`.fud`:**

- En los argumentos de un handler se ofrecen `$event` y, **solo donde vale**, `$value` con su tipo en
  el detalle (`boolean — checked of the checkbox`). Hoy `$event` no se ofrece porque el filtro de
  `$` lo quita.
- Hover sobre `$value`: su tipo y de qué elemento sale.
- En el valor de `delegate:p="…"` se ofrecen también los eventos con nombre (`click.borrar`); el
  `.` forma parte de la palabra.
- Detrás de `@click.borrar=@` se ofrecen solo funciones, como detrás de `@click=@` (el contexto del
  handler acepta `.` y `:` en el nombre del evento, lo que arregla también `@fudic:result=@`).
- Hover sobre `@click.borrar`: «`click`, handler `borrar`; lo leen N marcas».
- La gramática TextMate colorea entero `@click.borrar` y `@fudic:result` como evento.
- `@fudic:result=@` sobre un tag de componente ofrece las funciones; el hover del dato dice su tipo.

### 4.9. El ejemplo

- `rules/people.fudapi`: `alias-taken` pasa a `runs remote` (`email-taken` se queda `server`, para
  que se vean las dos).
- `components/app-form.fud`: «Comprobando…» con `userForm.alias.pending()`.
- `routes/usuarios.fud`: `activar(p: Person, active: boolean)` con `$value`; `buscar(q: string)` con
  `@input=@buscar($value)`; un botón *Ver* por fila con `@click.ver=@ver(p)`, que pinta la ficha de la
  persona debajo de la tabla; `<user-form @fudic:result=@alta>` en lugar del bus, y `user-form.fud`
  deja de emitir `alta` si nadie más la escucha.
- `routes/delegacion.fud`: un párrafo con los handlers con nombre.

### 4.10. Documentación

- `packages/mcp/guide/fudapi.md`, `view.md`, `components.md` y sus gemelos `es/`: `runs remote`,
  `pending()`, `$value`, los handlers con nombre y los eventos del formulario en el host, con un
  aviso: un endpoint que contesta «¿existe este email?» sirve para averiguar quién está registrado;
  si importa, un middleware (`use`).
- README de `@fudic/forms` (reglas remotas, `pending`, eventos en el host), de `@fudic/compiler`
  (`$value`, handlers con nombre) y de `@fudic/http` (la ruta de las reglas).
- `docs/gramar/gramatica-v1-decisiones.md`: decisiones 178–180 y sus filas; la 97 y la 176 con su
  «enmendada por».

---

## 5. Invariantes

- **El check del servidor nunca llega al navegador**, ni lo que importa (`tests/server-free.spec.ts`).
- **Una regla `server` no tiene ruta.** Solo `remote` se pregunta por HTTP.
- **La regla remota no es la autoridad.** Un fallo de red o un error HTTP nunca marca un campo
  inválido; el envío vuelve a ejecutar todas las reglas en el servidor.
- **Binario por defecto, JSON solo con `use json`**, como en las funciones.
- **El runtime del navegador solo crece donde se usa:** el validador remoto vive en el módulo de
  reglas remotas y lo importa solo una regla `remote`; `$value` se emite en línea.
- **Un listener por handler del padre, nunca uno por fila.**
- **Ningún `$` nuevo fuera de los argumentos de un handler.**
- **Cobertura:** lo nuevo al 100 % en las cuatro métricas; ningún umbral baja.

---

## 6. Criterios de aceptación

**El `.fudapi`**

1. `rule x / on field str / runs remote / fails x` no da diagnósticos; con `debounce 0` y con
   `debounce 500`, tampoco.
2. `debounce 300` en una regla `server` da `FUD1460` sobre `debounce`; en una `remote` sin valor,
   `FUD1063`; con `debounce rápido`, `FUD1065`; dos veces, `FUD1071`.
3. `use auth` en una regla `both` da `FUD1461`; en una `server` o `remote`, nada. `use nadie` da
   `FUD1080`, como en una función.
4. El formateador deja `debounce` y `use` en su sitio y con su sangrado.

**El módulo y el servidor**

5. El módulo de navegador de una regla `remote` no lleva `never` ni el texto del check, y
   `.check()` en el navegador lanza.
6. `POST /_fudic/rule/rules/people/alias-taken` con `"admin"` en binario responde 200 con el código
   `alias-taken`; con `"pedro"`, con `null`. Con `use json`, `{ "ok": false, "fails": "alias-taken" }`
   y `{ "ok": true }`.
7. La misma ruta para `email-taken` (`runs server`) responde 404. Con un valor `i32` donde se
   espera `str`, 400. Con la firma de otra versión, 412.
8. Con `use auth` en la regla y sin sesión, 401 como problem en el formato de la regla, y el check
   no se llama.
9. Un check `(value, _p, ctx) => …` tras `use auth` lee `ctx.user`; sin `use auth`, `ctx.user` es un
   error de TS en el editor y en el build.
10. Al enviar un formulario con una regla `remote` que tiene `use auth`, el servidor corre `auth`
    alrededor del check, y su fallo da 422 en el campo, como una regla `server`.

**El validador remoto**

11. Escribir `a`, `ad`, `adm`, `admin` en menos de 300 ms hace **una** pregunta, con `admin`.
12. Escribir `admin` y, mientras la pregunta está en vuelo, `admina`: la primera se aborta (en
    Network, *canceled*) y lo pintado es el veredicto de `admina`.
13. Volver de `pedro` a `admin` no pregunta otra vez: contesta la caché.
14. Con la red caída o un 500, el campo no pinta error, `pending()` vuelve a `false` y `valid()` no
    lo cuenta como fallo; el envío lo comprueba el servidor (422 si estaba cogido).
15. `pending()` es `true` desde la tecla hasta la respuesta; `$pending()` del formulario, también;
    `$valid()` es `false` mientras tanto.
16. Al enviar, el navegador no pregunta (una sola petición, la de la función).

**`$value`**

17. `<input type="checkbox" @change=@f($value)>` emite el lector `checked` en línea y `f` recibe un
    `boolean`; en el editor, `f(x: string)` es un error de TS sobre `@f($value)`.
18. Cada fila de la tabla de §3.5 da su valor y su tipo, en el DOM (happy-dom) y en el editor.
19. En la tabla delegada de §1, `activar` recibe el `checked` de la casilla de la fila pulsada.
20. `<div @click=@f($value)>`, `bus:x=@f($value)` y `<form @fudic:result=@f($value)>` dan `FUD1462`.
21. `<input type=@t @input=@f($value)>` da `FUD1463`.
22. Un `<tbody @change=@f(p, $value)>` con una casilla marcada `delegate:p` y un `<input type="number">`
    marcado `delegate:p` da `FUD1464`; con `delegate:p="click"` en el segundo, nada.
23. `@f($foo)` sigue dando `FUD1383`; `$value` fuera de un handler, `FUD0666`.

**Handlers con nombre**

24. En la tabla de §1, pulsar *Ver* llama solo a `ver`, pulsar *Borrar* solo a `borrar`, y marcar la
    casilla solo a `activar`.
25. El `<tbody>` tiene tres listeners (`change`, `click`, `click`) con 1 fila y con 50.
26. `@click.` y `@click.a.b` dan `FUD1465`; `<button @click.x=@f()>` sin fila, `FUD1466`.
27. `delegate:p="click.editar"` sin `@click.editar` arriba da `FUD1381`.
28. Una marca `delegate:p="click"` no la lee `@click.borrar`, y una marca `delegate:p` sin lista
    tampoco.

**Eventos del formulario en el host**

29. Con `<user-form @fudic:result=@alta>`, dar de alta una persona llama a `alta` con la `Person`
    que devolvió el servidor; con un status que el formulario no guarda, `@fudic:error=@fallo` recibe
    el `HttpError` (un 409 que guarda su `catches` se pinta en el formulario, §8.2.30).
30. Con dos niveles (un componente que envuelve `user-form`, con `@fudic:result` en los dos hosts),
    los dos handlers reciben el dato.
31. En el editor, `alta(persona: Person)` no da error y el hover dice `Person`;
    `alta(n: number)` da un error de TS sobre `@alta`. En un componente sin formularios, el handler
    da error.

**El editor** (por el plugin del language server, cada uno)

32. `.fudapi`: detrás de `runs ` se ofrecen `both`, `server`, `remote`; en una regla `remote` se
    ofrecen `debounce`, `use` y `skip`, y en una `both`, no; el snippet `rule remote` deja la regla
    del criterio 1; hover sobre `remote` y `debounce`.
33. `.fud`: en `@change=@activar(p, |)` sobre la tabla, se ofrecen `$event` y `$value` (`boolean`);
    en `<div @click=@f(|)>`, `$event` y no `$value`.
34. En `delegate:p="|"` bajo un `<tbody @click.borrar=… @click.ver=…>` se ofrecen `click.borrar` y
    `click.ver`; en `delegate:p="click.b|"` se reemplaza la palabra entera.
35. Detrás de `@click.borrar=@` y de `@fudic:result=@` se ofrecen solo funciones.
36. Hover sobre `$value` y sobre `@click.borrar` con el texto de §4.8.
37. La gramática TextMate da el mismo ámbito a `@click`, `@click.borrar` y `@fudic:result`.

**El ejemplo y la prueba**

38. En `/formularios`, un alias cogido (`admin`) pinta «Ese alias ya está cogido.» mientras se
    escribe, tras «Comprobando…», sin enviar; en `dev`, `preview` y `nosw`.
39. En `/usuarios`, la casilla, *Borrar*, *Ver*, la búsqueda y el alta funcionan como en los
    criterios 19, 24 y 29, en `dev`, `preview` y `nosw`.
40. **Prueba de Pedro** en el navegador y en VS Code con la extensión instalada desde el `.vsix`
    construido en la rama: escribe a mano en el ejemplo una regla `remote`, un `$value`, un handler
    con nombre y un `@fudic:result` en un host, con completado, hover y colores en cada paso.
41. `pnpm typecheck`, `pnpm test` y `pnpm build` en verde; lo nuevo al 100 %.

---

## 7. Fuera de alcance

Nada. Esta SDD cierra formularios y delegación de eventos.

---

## 8. Decisiones

### 8.1. Tomadas al redactar

1. **`remote` es un tercer valor de `runs`, no una línea aparte.** Dice dónde corre la regla, que es
   lo que ya dice `runs`. `async` sobra y no se diagnostica: no rompe nada.
2. **La pregunta viaja como una función: binario por defecto, JSON con `use json`** (decisión de
   SDD-67). Se manda el valor y los parámetros del uso; el resto del formulario, nunca. Una regla
   que dependa de otro campo se declara `on group`, y entonces su valor es el grupo.
3. **Un fallo de la pregunta pasa como válido.** Ni la red ni un 401/429/500 deben bloquear al
   usuario con un error que no es suyo. El envío vuelve a ejecutar la regla.
4. **Al enviar, el navegador no pregunta.** El servidor la ejecuta igualmente; preguntar antes sería
   la misma petición dos veces.
5. **Los middlewares de la regla corren siempre que el servidor la ejecuta**, también al enviar. Así
   el tipo del contexto del check es uno solo, y `ctx.user` tras `use auth` es verdad en los dos
   caminos.
6. **Solo `remote` tiene ruta.** Exponer una regla es una decisión del desarrollador, no un efecto
   de declararla en el servidor.
7. **fudic no trae middlewares de limitación.** `use rate-limit` es un ejemplo; la guía avisa del
   riesgo de enumeración (Pedro, 2026-11-07: «si tú quieres ponerlo como desarrollador»).
8. **`$value`, no `as:nombre`.** Pedro prefirió la forma de `$event`: se explica igual y se lee igual
   (2026-11-07).
9. **`$value` lee el elemento marcado, no el `target`.** El marcado es el que el autor señaló y su
   tipo es estático; el `target` podría ser un hijo.
10. **Los lectores son los de `control=`**, para que un `number` vacío sea `null` en los dos sitios.
    `range` nunca está vacío y es `number`. `file` y `select multiple` se añaden para que ningún
    control nativo quede sin valor.
11. **Un handler con nombre solo existe delegado.** Sin fila no hay a quién servir: `@click.x` sobre
    un botón suelto sería un `@click` con otro nombre.
12. **Una marca sin nombre no sirve a un handler con nombre.** Si lo hiciera, volvería el fallo del
    principio: el `click` de *Ver* llegaría a *Borrar*.
13. **Un listener por handler con nombre.** Al hablarlo se dijo «un solo listener de `click`»; con uno
    por handler el código es el mismo de hoy por tabla y el número sigue sin depender de las filas,
    que es lo que importa.
14. **El `.` del nombre de evento pasa a ser separador.** La decisión 27 (sin modificadores) lo dejaba
    libre; ningún evento del navegador lleva `.`.
15. **El dato de `fudic:result` en el host se tipa por un registro global**, como el bus de SDD-72.
    SDD-72 §8.1.5 lo dejaba `unknown` en un ancestro; en el host de un componente sí se sabe qué
    formularios hay dentro.
16. **El botón nuevo de `usuarios.fud` es *Ver*, no *Modificar*.** Modificar exige una función de
    servidor más; *Ver* enseña lo mismo (dos `click` en la fila) sin inventar backend.

### 8.2. Tomadas al implementar

1. **El módulo lleva el tipo de lo que se pregunta.** `rule({ …, value, params })` con los
   descriptores del valor y de los parámetros, en los dos lados: el navegador los necesita para
   escribir la pregunta en `fud-bin` y el servidor para `conform` (§4.4). El valor es el único tipo
   de `on field`; una unión, `*`, `on group` y `on form` viajan como `any`.
2. **La firma de una regla** es FNV-1a sobre `rule(<valor>)|params(<p>:<tipo>,…)|->str?`, con los
   tipos desplegados como en una función. Solo en `fud-bin`; con `use json`, sin firma.
3. **`base` no se emite**, igual que en las funciones, cuyo stub toma `/` por defecto: la ruta de
   la pregunta se arma igual que la de una función.
4. **La cadena de una regla es `[$global, la suya]`**, sin la del fichero: un fichero de reglas no
   tiene `chain`. Un `skip` de una regla se comprueba contra lo que hereda de `$global`. Una regla
   `server` lleva `chain` solo si escribe `use` o `skip`; una `remote`, siempre.
5. **El contexto del check en el `.d.ts`** es `<Nombre>Ctx = ServerContext & <los adds>`, y
   `Check`/`Rule` ganan un cuarto parámetro: sin él (regla `both`), el check tiene dos argumentos.
6. **`debounce` con algo que no es un entero** da `FUD1065` («`rápido` is not valid under
   `debounce`»), como un valor de `runs` que no existe; un número negativo, también.
7. **El servidor pasa su cadena a `@fudic/forms` por inyección.** `@fudic/http` depende de
   `@fudic/forms`, no al revés: `@fudic/forms/contract` declara `Around` y `runRulesWith(fn)`, y
   `@fudic/http` instala su `compose` + `run` la primera vez que valida un envío o contesta una
   pregunta (`ruleChains()`), sin efectos al importar. Una regla con niveles y sin ese runner
   lanza: un `auth` declarado nunca se salta.
8. **Al enviar, la regla corre solo su propio nivel; al preguntar, `[$global, el suyo]`.** En el
   envío la función ya corrió `$global` alrededor de sí misma; repetirlo contaría dos veces un
   `rate-limit` global. La pregunta no tiene a nadie delante y corre la cadena entera.
9. **El contexto llega a los validadores como tercer argumento.** `$validate({ server, ctx })` y
   `validate({ server, ctx })` lo llevan hasta cada regla; `Validator` público no cambia (dos
   argumentos) y solo la regla de un `.fudapi` que corre en el servidor lo lee.
10. **El registro de reglas remotas vive en `@fudic/forms/contract`** (`remoteRule(id, nombre)`),
    junto a los slots: la variante de servidor de una regla `remote` se registra al evaluarse su
    módulo, y la ruta la busca ahí. Una `server` no se registra, y por eso responde 404.
11. **La respuesta.** En `fud-bin`, `str?` (el código o `null`), 200 siempre que el check conteste;
    en JSON, `{ ok, fails? }`. Lleva las cabeceras que escribieron los middlewares, y
    `cache-control: private, no-store` si se leyó la sesión, como una función. Un 404 de una regla
    que no existe dice `no such remote rule`.
12. **`pending()` es «preguntada y sin contestar» para el valor actual**, no «sin veredicto»: un
    campo que nadie validó todavía no está pendiente, y no pinta «Comprobando…» al cargar.
13. **El validador remoto entra por el módulo generado.** La variante de navegador de una regla
    `remote` lleva `ask: askRemote`, importado de `@fudic/forms/contract`; `rule()` no lo importa.
    `askRemote` es su propia pieza del runtime (`forms/remote`), así que solo la descarga una página
    con una regla `remote` (§5). Una regla `remote` sin `ask` se salta como una `server`.
14. **El envío se reconoce por la pasada, no por la regla.** `$validate()` en el navegador entrega
    a sus validadores una marca (`whole-pass.ts`, en la pieza `flags`) como tercer argumento; el
    validador remoto, al verla, contesta de la caché o pasa, y aborta la espera y la pregunta en
    vuelo. `control.validate()` —lo que corre al escribir— no la lleva, y pregunta.
15. **La caché es por valor** (`JSON.stringify`), porque los parámetros de un uso son fijos; una
    respuesta cacheada contesta en el acto, sin promesa, y por eso un fallo conocido para el valor
    actual para el envío como cualquier regla síncrona.
16. **`$value` se decide dentro del plan de la delegación**, no en un analizador aparte: las marcas
    que sirven a un handler son las de su emparejamiento. `semantic/value-argument.ts` decide el
    lector y da `FUD1462`–`FUD1464`; el analizador `delegation` los informa y el emit escribe el
    lector que el plan guarda por atributo (`plan.values`), con la misma respuesta para los dos.
17. **`$value` fuera de los argumentos de la llamada**, aunque esté en un handler (el callee, el
    cuerpo de una lambda), es `FUD0666`, no `FUD1383`: no es una fila con el `$` de antes.
18. **Con varias filas en un handler**, `$value` lee el primer elemento marcado que encuentra el
    recorrido de `composedPath()`, el más interior; el tipo se comprueba sobre todas las marcas que
    sirven al handler.
19. **El emparejamiento compara el texto entero del evento** (`click.borrar`) y el listener escucha
    el evento base. `@click.` y compañía dan `FUD1465` y el binding se queda con su evento sin
    nombre, para que el editor lo siga viendo.
20. **`$value` se proyecta con una aserción, no con una anotación**:
    `const $value = $event as unknown as boolean`. Con `const $value: boolean = $event as never`
    TypeScript estrecha la variable a `never`, que cabe en cualquier parámetro y esconde el error
    del criterio 17. Donde el compilador no encuentra control (`FUD1462`–`FUD1464`) es `any`.
21. **El registro `FudicFormResults` solo lleva entrada si hay algo que unir**: un componente sin
    `form:=` ni componentes dentro no escribe bloque, y `$FormResult<'tag'>` de un tag sin entrada ya
    da `never`. Solo registra un `form:=` que sea una ruta (`save`, `api.save`) cuya raíz nombra el
    `@code`, porque `typeof` se escribe al final del módulo.
22. **Sin formularios el handler falla en el sitio** porque `$onResultOf` pide, cuando el dato es
    `never`, un tipo que ninguna función cumple (`$NoFormHere`): con `(value: never) => unknown`
    cualquier función encajaría. `@fudic/typecheck` no necesitó cambios: cada proyección escribe su
    entrada y el lote ya tiene todos los `.fud` en un programa.
23. **`use` y `skip` se ofrecen también en una regla `server`.** §3.1 las admite ahí y el
    validador no protesta; ofrecerlas solo en `remote` habría escondido algo válido. `debounce`
    sigue siendo solo de `remote`, y una `both` no ofrece ninguna de las tres (criterio 32).
24. **El editor pregunta al plan del compilador** (`handlerAt`): qué leería `$value` en un
    handler que todavía no lo escribe y cuántas marcas lo sirven. Se ofrece `$value` exactamente
    donde compila, y el hover de `@click.borrar` cuenta las mismas marcas que lee el listener.
25. **`$event` y `$value` se añaden a la lista de TypeScript**, no la sustituyen: en los argumentos
    sigue valiendo cualquier nombre del ámbito. Los dos llevan `$`, y el filtro de nombres del
    andamiaje los quitaba; se devuelven solo en ese sitio.
26. **El hover de `$value` se suma al de TypeScript.** TypeScript ya dice `const $value: boolean`;
    el servidor añade qué lee y de qué elemento sale (el que lleva el evento, o el marcado
    `delegate:<fila>`). Volar junta los dos.
27. **La gramática pinta los tres valores de `runs`** con el mismo ámbito
    (`constant.language.runs.fudapi`), no solo `remote`: es una palabra cerrada, como las
    estrategias de `load`.
28. **La pregunta recorre las mitades de cliente de su cadena** (`[$global, la suya]`), como la
    llamada de una función. Sin ellas el servidor la rechaza antes del check: en el ejemplo,
    `csrf` daba 403 y la regla pasaba siempre como válida. `@fudic/http/contract` exporta
    `ruleSend(nombre, () => cadena)`, que el módulo de navegador de una regla `remote` le pasa a
    `askRemote` como `send`; está en la pieza `http/contract`, para que la cadena y el registro de
    las mitades sean los de la página. La cadena se lee en la primera pregunta, no al cargar el
    módulo: un build puede evaluar el de las reglas antes que el de `$global`. La respuesta vuelve
    tal cual, sin `HttpError`, así que `error-pages` nunca saca de la página por una pregunta.
29. **La primera pregunta sale al dejar el campo** cuando el formulario dice `validity interacted`
    (el del ejemplo): `input` valida en cada cambio solo después de haber dejado el campo una vez
    (SDD-34). A partir de ahí se pregunta mientras se escribe, que es el criterio 38.
30. **Un status que el formulario se queda (`catches`) no llega al host.** El 409 del criterio 29
    lo pinta el formulario y no se anuncia, como siempre (SDD-72). Lo que llega al host es
    `fudic:error` para un status que el formulario no guarda; en el ejemplo `error-pages` se
    queda con todos ellos, así que esa mitad se prueba en `@fudic/forms` (dos niveles de shadow
    root), y el ejemplo prueba `fudic:result` en el host.
31. **El registro `FudicFormResults` cuenta las funciones del contrato.** Un `form:=@save` cuyo
    `save` llega por `<link rel="server">` (como en `user-form.fud`) también registra: esos
    nombres se declaran arriba del módulo de la proyección, igual que los del `@code`.
32. **Una pregunta repetida para el mismo valor se une a la que está en marcha** (prueba de
    Pedro, 2026-11-09: «Comprobando…» no se veía nunca al salir del campo). Al dejar un campo
    saltan `change` y `blur`, y un control envuelto (`app-input`) está enlazado en el host y en
    su `<input>`: el mismo valor se validaba varias veces seguidas. Cada validación cancelaba la
    pregunta anterior, que se daba por contestada para ese valor, y `pending()` se apagaba con la
    última aún en vuelo. Ahora el validador remoto devuelve la misma promesa si ya espera o
    pregunta por ese valor (una sola petición), y `verdicts` guarda un ticket por pregunta:
    solo deja de estar pendiente cuando contesta la última, también para una regla async del
    autor.
33. **La búsqueda del ejemplo tarda 400 ms a propósito**, como `slowSearch` tarda 3 s. El
    servidor local contestaba en un par de milisegundos: «Buscando…» solo parpadeaba y nunca se
    veía la búsqueda anterior *canceled*, que es lo que la página explica. `task` no cambia:
    su `pending` ya duraba lo que la petición.
34. **Lo que decide una construcción se vigila como un valor.** La segunda mitad de la 32: con
    `pending()` ya bien, «Comprobando…» seguía sin salir al dejar el campo. El `@if
    (userForm.alias.pending())` solo se volvía a evaluar cuando cambiaba un valor del formulario
    (`$subIf(userForm, $u)`) o la expresión de un valor que lee un miembro de un import
    (`watchImports`, BUG-42 §4.3); su condición no estaba entre esas expresiones. Al escribir
    funcionaba de rebote, porque el valor cambia; al salir, no cambia nada más que `pending`.
    Ahora cada construcción del nivel raíz aporta lo que la decide: las condiciones de un `@if`,
    el sujeto y los casos de un `@switch`, y la cabecera de un `@foreach`/`@for` recorrida con
    el cuerpo vacío. Un `@while` no (con el cuerpo vacío no acabaría), y un `@await` vigila ya su
    campo.
35. **Dentro de un bloque, cada instancia vigila lo que lee de un import.** Un valor o una
    construcción dentro de una fila que lee un miembro de un formulario importado
    (`@foreach … { @if (userForm.x.pending()) … }`) tampoco se enteraba: el padre solo repinta un
    bloque cuando cambia un valor suyo. La raíz no puede vigilarlo, porque la expresión puede
    nombrar la fila. Ahora la vigila la instancia, en su propio `$s`, con su repintado (`$rp`,
    la misma pasada que `u`) y con la fila que tiene en ese momento; se suelta con la
    instancia. Un nombre que declara la fila o un ancestro es local, no el import.
36. **Dos construcciones seguidas guardan el orden de la fuente.** Salió al probar la 35, y ya
    pasaba con props normales: una construcción era transparente como ancla, los bloques
    seguidos compartían el nodo de detrás, y el orden entre ellos era el de inserción. Un `@if`
    que se encendía después de que el `@switch` de detrás hubiera pintado quedaba detrás de él,
    un árbol que el servidor nunca pinta. Ahora una actualización (`$uN` de un `@if`/`@switch`,
    la reconciliación de un bucle) coloca lo que crea antes de donde empieza la siguiente
    construcción que pinta algo (`$nNa()`, que recorre sus instancias con `move` sin mover
    nada). Las instancias se siguen creando contra el ancla estática, porque su `$anchor` es el
    final de su propio nivel y tiene que ser un nodo que no se va. La creación no cambia: ya
    inserta en orden de fuente.
