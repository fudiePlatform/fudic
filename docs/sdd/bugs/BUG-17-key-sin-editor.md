# BUG-17 — La `key` de un bucle es sintaxis nueva sin mitad de editor, y por el camino salen tres cabos sueltos

> **Estado:** `Bloqueado` — por [SDD-30](../SDD-30-renders-de-bloque.md), que es quien mete la
> `key` en el AST. Pasa a `Listo` en cuanto ese campo exista (§3.5)
> **Corrige:** [SDD-30 §3.5](../SDD-30-renders-de-bloque.md) (la mitad de editor que no declara),
> [SDD-23 §4.4](../SDD-23-emisor-ts-virtual.md) y [SDD-24 §4.2](../SDD-24-language-server.md)
> **Paquetes:** `@fudic/language-core` · `@fudic/language-server` · `@fudic/formatter` ·
> `fudic-vscode`
> **Rama sugerida:** la del backlog de uso
> **Depende de:** [SDD-30](../SDD-30-renders-de-bloque.md) para el campo del AST y para nada más.
> **No** depende de su emit de cliente: la proyección no lo mira
> **Reserva:** ningún código `FUD` nuevo (§3.1)

---

## 1. Contexto y síntoma

SDD-30 §3.5 hace obligatoria una sintaxis nueva:

```razor
@foreach (const item of collection) key (item.id) { … }
@for (let i = 0; i < n; i++)        key (i)       { … }
@while (cur !== null)               key (cur.id)  { … }
```

Y de su mitad de editor no dice nada. Ni SDD-30 —su §7 enumera seis cosas fuera de alcance y
ninguna es esta—, ni SDD-23, que no conoce la key en su tabla de proyección, ni SDD-24, que no
la tiene entre sus contextos. Nadie la posee, así que por defecto acabaría siendo **texto que el
editor no ve**: exactamente el defecto de BUG-16 §2.5 con el nombre del evento, en otro sitio y
un mes después.

**Lo que el desarrollador quiere hacer, y es lo único que importa de este BUG:**

```razor
@foreach (const item of collection) key (item.|)
```

Teclea `item.` y espera las propiedades del elemento. No las sabe de memoria —normalmente son de
un tipo que vive en otro fichero— y el editor las tiene delante: `collection` está tipada, la
cabecera ya declara `item`, y la lista es TypeScript puro. Escribir la key a ciegas y descubrir
en el build que `item.uid` no existe es la clase de fricción que el resto del proyecto lleva
quince documentos evitando.

### 1.1. Y no se le puede exigir una forma de cabecera

El ejemplo de SDD-30 §3.3 usa `const { id, name } of rows`. Eso es **un** estilo, no el contrato:
al desarrollador no se le puede obligar a destructurar para que la key funcione. Las tres formas
tienen que dar la misma lista, y por la misma vía:

| Cabecera | Lo que `key (` tiene que ofrecer |
|---|---|
| `const item of collection` | `item`, y tras el punto las propiedades del elemento |
| `const { id, name } of rows` | `id` y `name` |
| `let i = 0; i < n; i++` | `i` |
| `cur !== null` (`@while`) | `cur` y lo que haya en scope |

Si la solución necesita un caso por forma de cabecera, es la solución equivocada.

### 1.2. Tres cabos sueltos que salen al mirar, y dos ya están vivos hoy

No son ampliación de alcance: los tres viven en el mismo trozo de código que la corrección de
§4.1 tiene que tocar, y por la regla del índice —*un hallazgo colateral se documenta donde
aparece*— entran aquí.

- **(a) Una cabecera de control se cree markup, y eso pasa hoy sin key.** En `@if (us|)` el
  servidor ofrece `<ul>`, la abreviatura de Emmet y los componentes del workspace. Es una
  expresión de TypeScript y no un sitio donde quepa un tag.
- **(b) Formatear borraría la key.** El formateador reimprime el bucle desde el AST por campos
  conocidos —cabecera y cuerpo—, así que un campo nuevo se pierde sin que nada lo note. En cuanto
  SDD-30 aterrice, `Format Document` sobre un fichero correcto lo deja sin key y por tanto en
  `FUD0540`.
- **(c) El snippet de la extensión escribe un bucle inválido.** El `@foreach` que ofrece
  `fudic-vscode` no lleva key; con la key obligatoria, aceptar el snippet escribe un fichero que
  nace en rojo.

### 1.3. Una pregunta que este BUG no puede contestar solo

`@foreach (item of collection)` —sin declarador— es JavaScript válido solo si `item` está
declarado antes. La proyección copia la cabecera tal cual, así que reportaría `TS2304` sobre
`item`, que es lo correcto para JS y puede no ser lo que fudic quiere para su `@foreach`.

**Decide SDD-06/SDD-30, no este documento.** Aquí solo se anota que la respuesta no cambia nada
de §4.1: la key pregunta al scope del cuerpo, y si la cabecera declara, ve; si no declara, no ve
— y el error ya lo está dando la cabecera, no la key.

---

## 2. Causa raíz

### 2.1. Un nombre que el emisor no copia no existe para el editor

Es la causa de BUG-16 §2.5, literal. `emitLoop`
([`template/control.ts:70-82`](../../../packages/language-core/src/template/control.ts#L70-L82))
proyecta **cabecera y cuerpo, y nada más**:

```ts
ctx.w.scaffold(`${keyword} (`, node.span);
emitHeader(ctx, node.header.inner, LOOP_FALLBACK[node.type]);
ctx.w.scaffold(') {\n');
ctx.emit(node.body);
ctx.w.scaffold('}\n');
```

No hay hueco para la key porque la key no existía cuando se escribió. Si se emite como
andamiaje, o no se emite, no queda **ninguna posición del fuente** desde la que preguntarle a
TypeScript — y la lista está a un tramo copiado de distancia, igual que estaba la de eventos.

### 2.2. `isMarkupOffset` decide por exclusión, y una cabecera no está en la lista

[`services/emmet.ts:58-76`](../../../packages/language-server/src/services/emmet.ts#L58-L76)
devuelve `true` para todo offset que no esté en un `@code`, en el cuerpo de un elemento `raw`
(`<style>`, `<script>`) o dentro de una interpolación. Una cabecera de control no es ninguna de
las tres, así que el interior de `@if (…)`, `@switch (…)`, `@for (…)`, `@foreach (…)` y
`@while (…)` cuenta como markup y recibe Emmet, tags y snippets.

**Alcance:** `scopeAt`
([`services/snippets.ts:47`](../../../packages/language-server/src/services/snippets.ts#L47)) se
apoya en la misma función, así que el defecto es uno y las voces que estorban son tres. Y el
`key ( … )` de §4.1, cuando exista, cae exactamente en la misma zona: se arregla una vez para
los seis sitios.

### 2.3. El formateador imprime por campos conocidos

`printLoop` / `printWhile`
([`print/control.ts:70-79`](../../../packages/formatter/src/print/control.ts#L70-L79)) concatenan
`@keyword (`, `header.inner`, `) ` y el bloque del cuerpo. Un campo del AST que no esté
enumerado ahí **no se imprime**, y reimprimir es total: lo que no se escribe, se borra.

Nada lo detecta hoy porque no se puede escribir un test contra un campo que aún no existe. Por
eso el criterio de §6 no es «imprime la key» sino **idempotencia**: formatear dos veces da lo
mismo, que es la afirmación que sobrevive a que mañana el AST crezca otra vez.

### 2.4. El snippet no sabe de la key

El `@foreach` de la extensión (`packages/vscode`) se escribió contra la gramática de antes de
SDD-30. No es un defecto suyo: es una fuente más que hay que mover cuando la sintaxis cambia, y
que este documento enumera para que no se quede fuera.

---

## 3. Interfaz pública

### 3.1. `GLOBALS_DTS` — un global nuevo

```ts
declare function $key(k: unknown): void;
```

**`unknown` a propósito.** Ofrecer no es validar, que es la regla con la que BUG-15 dejó abierta
la lista de clases. Un tipo más estrecho —`string | number`— rechazaría claves legítimas: la
reconciliación de SDD-30 §4.4 usa un `Map`, y en un `Map` la identidad de objeto es una clave
perfectamente válida. `$key` existe para **abrir un scope donde preguntar**, no para juzgar lo
que se escribe.

**Ningún código `FUD` nuevo.** `FUD0540` (falta la key), `FUD0541` (key vacía) y `FUD0542` (key
donde no itera) son de SDD-30 y los da el compilador. Esta mitad no añade diagnósticos propios:
los que aparezcan sobre la key son de TypeScript, sobre los caracteres del autor.

### 3.2. `@fudic/language-core`

Ninguna firma nueva. `emitControl` aprende a emitir la key (§4.1); la tabla de proyección de
SDD-23 §4.4 gana su fila.

### 3.3. `@fudic/language-server`

Ninguna firma nueva. `isMarkupOffset` pasa a excluir también el interior de los paréntesis de un
constructo de control y el de un `key (…)`. Al ser la función en la que `scopeAt` se apoya, el
arreglo llega a las tres voces —Emmet, tags y snippets— por un solo sitio.

### 3.4. `@fudic/formatter` y `fudic-vscode`

Sin superficie pública nueva: el formateador imprime un campo más y la extensión escribe un
snippet más completo.

### 3.5. Lo que este BUG **consume** y no escribe

El AST tiene que traer la key: `ForeachNode`, `ForNode` y `WhileNode` con un campo de la forma
que ya tienen las cabeceras (`span` del constructo entero e `inner` de la expresión, para poder
copiarla). **Lo pone SDD-30**, y hasta entonces este BUG está `Bloqueado`: no hay nada que
proyectar ni nada que imprimir.

---

## 4. Comportamiento corregido

### 4.1. La key se proyecta DENTRO del cuerpo

```ts
for (const item of collection) {
  $key(item.id);
  …cuerpo…
}
```

La expresión es un tramo **copiado** del fuente, con todas las capacidades: completado,
diagnóstico, hover, navegación y renombrado. Es la mitad de la corrección y cabe en una frase.

**Dentro y no fuera, porque es donde el scope ya es el correcto.** El control de flujo se
proyecta como control de flujo real (SDD-23 §4.4) precisamente para que lo que la cabecera
declara exista dentro del cuerpo; la key solo tiene que ponerse ahí y preguntar. De ahí sale
solo lo que §1.1 exige: `const item of xs` declara `item`, `const { id, name } of xs` declara los
dos, `let i = 0; …` declara `i`, y un `@while` no declara nada y ve lo de fuera. **Cero casos
especiales por forma de cabecera** — la cabecera ya está proyectada y hace ella el trabajo.

**Que en el fuente la key vaya antes del cuerpo y en el generado después de la cabecera no es
problema.** Los tramos no tienen por qué ir en orden; BUG-16 lo dejó demostrado con los dos
literales de un tag de componente, donde los atributos se reparten y se reordenan y cada uno
sigue volviendo a su sitio.

### 4.2. Lo que el desarrollador ve

- `key (` → lo que hay en scope, empezando por lo que la cabecera declara.
- `key (item.` → las propiedades del elemento, con el tipo real que tenga la colección, venga de
  donde venga.
- `key (item.nope)` → `TS2339` subrayando `nope`, los caracteres que escribió.
- F12 sobre `item` lleva a su declaración en la cabecera; renombrarlo renombra los dos sitios.

Nada de eso lo inventa el servidor. Como con los props y con los eventos, la lista es de quien
sabe: aquí el tipo de la colección, y quien lo sabe es TypeScript.

### 4.3. La cabecera de un constructo de control no es markup

Dentro de los paréntesis de `@if`, `@else if`, `@switch`, `@for`, `@foreach` y `@while` —y dentro
de `key ( … )`— no se ofrece Emmet, ni tags, ni snippets. Es una expresión, y la contesta la
proyección.

Es la misma regla que BUG-16 §4.3 fijó para el interior de un tag abierto, aplicada a la otra
zona del fichero donde el texto no es markup aunque lo parezca. Fuera de los paréntesis nada
cambia: un `@` en markup sigue siendo la transición de siempre y sigue ofreciendo `@foreach`.

### 4.4. Formatear no pierde la key

Y el enunciado que se verifica no es «se imprime», es **idempotencia**: formatear dos veces
produce el mismo texto, y formatear un bucle con key lo devuelve con su key intacta.

### 4.5. El snippet escribe la forma completa

`@foreach`, `@for` y `@while` se ofrecen con su `key (…)` y su tabstop, de modo que aceptar el
snippet deja un fichero que compila.

---

## 5. Invariantes

**Los que el bug violaba**

- *Un nombre que el usuario escribe nunca se emite como andamiaje.* Si viaja copiado se puede
  completar, navegar y diagnosticar; si no viaja, no existe para nadie (BUG-16 §5).
- *Lo que el editor ofrece es lo que la posición significa.* Un tag ofrecido dentro de un
  paréntesis de JavaScript es una respuesta a otra pregunta.

**Los que la corrección añade**

- **Reimprimir es total.** El formateador no puede perder nada del AST; un campo nuevo que no se
  imprime es código del autor que desaparece.
- **Una zona, un dueño.** Dentro de unos paréntesis de control contesta TypeScript; en markup,
  quien ya contestaba. Y el arreglo vive en **una** función, no en tres ramas paralelas.
- **Ofrecer no es validar.** `$key` no rechaza nada: abre el scope y se aparta.

---

## 6. Criterios de aceptación

**La key, en la proyección** (`@fudic/language-core`)

1. **(rojo primero)** `@foreach (const item of collection) key (item.id) { … }` proyecta
   `$key(item.id);` como primera sentencia del cuerpo, y el tramo de `item.id` está **copiado**
   del fuente —mapeado a su span— y no es andamiaje.
2. Las cuatro formas de §1.1 dan el mismo trato: `const item of xs`, `const { id, name } of xs`,
   `for (let i = 0; …)` y `@while`. Ninguna necesita una rama propia en el emisor.
3. Una key vacía o que no parsea no rompe el virtual: el fichero que se está editando sigue
   contestando (la regla de `emitHeader`, `control.ts:113-124`).
4. Un bucle **sin** key sigue proyectando exactamente lo de hoy, byte a byte: `FUD0540` es del
   compilador y la proyección no lo dobla.

**La key, contra el servicio de TypeScript de verdad**

5. **(rojo primero)** En `key (item.|)` la lista son las propiedades del elemento de la
   colección, con su tipo real; en `key (|)` la lista trae `item`.
6. En `key (item.i|)` el rango de reemplazo cubre `i` y **nada más** — la medida que BUG-16 §6.9
   dejó escrita, y por la misma razón: un rango que no vuelve exacto escribe basura al aceptar.
7. `key (item.nope)` reporta `TS2339` sobre `nope`, en coordenadas del `.fud`.
8. F12 sobre `item` dentro de la key salta a la cabecera; renombrar `item` en la cabecera lo
   renombra también dentro de la key.
9. Un `@foreach` **anidado** en otro: la key del interior ve las variables de los dos.

**La cabecera no es markup** (`@fudic/language-server`)

10. **(rojo primero)** En `@if (us|)` no se ofrecen ni tags, ni Emmet, ni snippets. Hoy se
    ofrecen los tres, y ese es el test del defecto (a).
11. Lo mismo dentro de los paréntesis de los cinco constructos y dentro de `key ( … )`.
12. Fuera de los paréntesis nada cambia: `@fore|` en markup sigue ofreciendo `@foreach`, y una
    palabra suelta sigue fusionando con Emmet (SDD-28 §5.3).
13. Los tres se piden **con el `context` que manda un editor** (BUG-15 §6): sin él, ninguno de
    estos criterios prueba lo que dice probar.

**El formateador** (`@fudic/formatter`)

14. **(rojo primero)** Formatear un bucle con key lo devuelve con su key, y con la key en su
    sitio: tras el paréntesis de la cabecera y antes del cuerpo.
15. **Idempotencia:** formatear dos veces da el mismo texto, para los tres bucles y con key de
    una y de varias palabras.
16. Un bucle sin key se formatea exactamente como hoy.

**La extensión** (`fudic-vscode`)

17. El snippet de `@foreach`, `@for` y `@while` escribe `key (…)` con su tabstop, y el fichero
    resultante compila sin `FUD0540`.

**Lo que no se puede romper**

18. Los criterios §6.3 y §6.4 de SDD-24, los de BUG-15 y los de BUG-16 siguen verdes.

**Cobertura.** `language-core`, `language-server` y `formatter` no bajan del 100 % en las cuatro
métricas.

---

## 7. Fuera de alcance

- **El emit de renders de bloque.** Es [SDD-30](../SDD-30-renders-de-bloque.md) entero: la
  función por bloque, la reconciliación, el teardown y `FUD0540`–`FUD0542`. Este BUG no emite ni
  una línea de cliente.
- **La sintaxis de la key en el parser** y el campo del AST: también SDD-30 (§3.5 de aquí).
- **Si `@foreach (item of xs)` sin declarador es legal en fudic** (§1.3). Es gramática, la decide
  SDD-06/SDD-30, y la corrección de §4.1 no cambia con la respuesta.
- **Diagnóstico de key duplicada.** Depende de los datos; SDD-30 §4.4 lo deja fijado y el aviso
  en dev es del runtime.
- **Validar el tipo de una key** (§3.1). `$key` toma `unknown` y no juzga.
- **Completar el prefijo en un hueco del tag** (`class:` / `style:` / `bus:` / `ref`): sigue
  donde BUG-15 §7 la dejó.
