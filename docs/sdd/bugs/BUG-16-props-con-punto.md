# BUG-16 — Pasar una prop tiene dos formas, y la que el editor valida no llega a la salida

> **Estado:** `Listo`
> **Corrige:** [gramática v1](../../gramar/gramatica-v1-decisiones.md) §10 (regla `attribute`),
> [SDD-23 — Proyección](../SDD-23-emisor-ts-virtual.md) §4.4 y
> [SDD-24 — Language server](../SDD-24-language-server.md) §4.2
> **Paquetes:** `@fudic/compiler` · `@fudic/language-core` · `@fudic/language-server`
> **Rama sugerida:** la del backlog de uso
> **Depende de:** [BUG-15](./BUG-15-clases-sin-completado.md) — mientras el espacio siga
> disparando, la zona de atributos devuelve cero ítems y ningún criterio de aquí es observable
> **Reserva:** ningún código `FUD` nuevo (§3.3)

---

## 1. Contexto y síntoma

Hoy un componente acepta las dos:

```html
<app-badge tone="info">          <!-- atributo plano  -->
<app-badge .tone="@(t)">         <!-- property binding -->
```

Las dos llegan al mismo literal de props de la proyección, así que TypeScript comprueba las dos
igual y el editor enseña que son intercambiables. **No lo son**, y la diferencia es la que
importa:

| | Se escribe en la salida | La comprueba la proyección |
|---|---|---|
| `tone="info"` | **sí**, `setAttr(v, 'tone', 'info')` | sí, como prop |
| `.tone="@(t)"` | **no** | sí, como prop |

`property` es enganche de cliente y no se emite:
[`emit/attrs.ts:63`](../../../packages/compiler/src/emit/attrs.ts#L63) lo dice —*«they are hookup…
and they are absent from SSR entirely»*— y [`:100`](../../../packages/compiler/src/emit/attrs.ts#L100)
lo hace; en `@fudic/ssr` no hay una sola referencia a ese tipo de binding. De modo que hoy
**escribir `.tone` en un componente compila, no da error y no produce nada**: un fallo silencioso
que el editor bendice.

Los ejemplos del propio repositorio usan la forma plana en todas partes —
[`routes/index.fud:22-23`](../../../examples/basic/routes/index.fud#L22-L23),
[`:28-29`](../../../examples/basic/routes/index.fud#L28-L29),
[`blog/[slug].fud:39`](../../../examples/basic/routes/blog/%5Bslug%5D.fud#L39) — que es la que
funciona.

Y al escribir cualquiera de las dos el editor no ofrece nada: el ancla de BUG-11 cubre los
**huecos vacíos** del tag, y en cuanto se teclea un punto o una letra la posición ya no es un
hueco, es un nombre de atributo a medias.

### 1.1. La decisión que este BUG implementa

Una sola forma, y es el punto:

> **Para pasar una propiedad a un componente fudic se escribe un `.` y aparece la lista de props
> del componente** — dé igual que el valor sea una constante, una expresión o un binding.
>
> **Para escribir un evento se escribe `@` y aparecen los eventos de HTML, sin el `on`.**

El `slot` ya lo hace desde BUG-11: ofrece las ranuras nombradas del componente a la derecha del
`=`. Este BUG cierra las otras dos, y con ellas la regla entera del interior de un tag.

Lo que eso obliga, y es la mitad del trabajo: **si el punto es la única forma, el punto tiene que
llegar a la salida**. Nivel 1 es HTML puro sin JS, y una prop que solo existe en la proyección no
es una prop.

---

## 2. Causa raíz

### 2.1. La gramática admite las dos vías

La regla `attribute` de la §10 lista `dynamic_attribute`, `property_binding` y
`static_attribute` como alternativas hermanas, sin decir nada del tag sobre el que aparecen.
`classifyAttribute` ([`classify.ts:73-84`](../../../packages/compiler/src/binding/classify.ts#L73-L84))
reparte por prefijo: `.` → `property`, nada → `attr`. Correcto para un tag nativo, donde son dos
cosas distintas de verdad; ambiguo para un componente, donde son dos maneras de decir lo mismo.

### 2.2. La proyección las funde

`emitProps` mete en el literal de props todo binding `attr` o `property`
([`attrs.ts:104-106`](../../../packages/language-core/src/template/attrs.ts#L104-L106)), menos
`slot` desde BUG-11. Por eso las dos formas dan el mismo error cuando el nombre está mal y
ninguna da error por ser la que es.

### 2.3. El emit las separa, y al revés

El emisor escribe los `attr` y descarta los `property` (§1). Proyección y emisor discrepan sobre
qué es una prop: uno valida lo que el otro tira.

### 2.4. Nadie ofrece el nombre mientras se escribe

Las anclas de BUG-11 son **una por hueco** del tag
([`attrs.ts:117`](../../../packages/language-core/src/template/attrs.ts#L117)), y un hueco es un
tramo de longitud no nula entre dos atributos. Un `.` recién tecleado ya es un atributo, así que
el hueco desaparece justo cuando hace falta.

### 2.5. Y el nombre del evento no viaja

`emitBehaviour` escribe el nombre del evento como **scaffold**
([`attrs.ts:204-207`](../../../packages/language-core/src/template/attrs.ts#L204-L207)):

```ts
ctx.w.scaffold('$on(', attr.span);
ctx.w.scaffold(`'${binding.name}'${…}, `);   // ← inventado, no copiado
```

Andamiaje no rutea nada: ni completado, ni diagnóstico, ni hover. `$on` está declarado sobre
`keyof HTMLElementEventMap` —la lista exacta que el usuario quiere, y sin `on` porque así está
tecleado el mapa— y no hay una sola posición del fuente desde la que preguntársela.

---

## 3. Interfaz pública

### 3.1. Gramática

La regla `attribute` deja de ser plana: **sobre un tag de componente** (nombre con guion,
decisión 41), `property_binding` es la única vía de prop, y `static_attribute` /
`dynamic_attribute` son atributos de HTML. Sobre un tag nativo no cambia nada.

### 3.2. `GLOBALS_DTS`

**Sin globals nuevas.** Los atributos planos de un componente se comprueban con el `$attrs` que
ya existe, instanciado con el tipo vacío: `$attrs<{}>({ … })` es `{} & $GlobalAttrs`, o sea, la
vocabulario global de HTML y nada más.

### 3.3. Ningún código `FUD` nuevo

El error lo da TypeScript, y da uno mejor del que daríamos nosotros: `TS2353`/`TS2561` sobre el
nombre, **con sugerencia** cuando se parece a un global (`titel` → `title`). Es el mismo
mecanismo con el que BUG-11 aceptó los globales sin una sola rama en el emisor, usado ahora para
rechazar lo que no lo es. Un código propio exigiría la lista de atributos globales dentro del
compilador, que es justo lo que BUG-11 §4.2 decidió no tener.

> **Se mide con `tsc` antes de escribir emisor** (precedente de BUG-11): que `tone: 'info'` contra
> `{} & $GlobalAttrs` reporte sobre el nombre y conserve la sugerencia. Si el mensaje no aterriza
> ahí, se replantea el mecanismo, no el criterio.

### 3.4. `@fudic/language-server`

```ts
// src/services/position.ts
export function propertyContextAt(source: string, offset: number): PartialName | undefined;
export function eventContextAt(source: string, offset: number): PartialName | undefined;
```

Los dos devuelven el `PartialName` de los otros contextos: span de lo escrito **sin** el prefijo
—el `.` y el `@` se quedan, son lo que abre el contexto— y el texto hasta el cursor.

---

## 4. Comportamiento corregido

### 4.1. El punto se escribe en la salida

En un tag de **componente**, un binding `property` se serializa como atributo con su nombre sin
el punto, por las dos ramas que `attr` ya tiene en
[`emit/attrs.ts:80-99`](../../../packages/compiler/src/emit/attrs.ts#L80-L99):

- valor estático (`.tone="info"`) → `setAttr(v, 'tone', 'info')`;
- valor interpolado (`.tone="@(t)"`) → la rama de omitir-si-falsy de la decisión 21, idéntica a
  la de un atributo dinámico.

Con eso el nivel 1 sigue siendo lo que dice ser: HTML puro, sin JS, con las props del componente
donde el componente las lee.

**En un tag nativo `.prop` no cambia**: sigue siendo enganche de cliente —una propiedad del DOM,
no un atributo— y sigue ausente de SSR. Lo que este BUG unifica es cómo se le habla a un
componente, no qué significa un punto en un `<input>`.

### 4.2. Un atributo plano en un componente es un atributo de HTML

`emitProps` deja en el literal de `$attrs<$C0>` **solo** los bindings `property`. Los `attr`
planos van a un segundo literal, `$attrs<{}>({ … })`, comprobado contra `$GlobalAttrs`: `id`,
`class`, `role`, `data-*`, `aria-*` y los demás pasan; `tone="info"` es error, con el nombre
subrayado y la sugerencia de TypeScript. Es exactamente el reparto que BUG-11 dejó preparado,
usado ahora en los dos sentidos.

### 4.3. El punto ofrece los props

El nombre ya viaja: `emitKey` copia el span del nombre —sin el punto— como clave del literal
([`attrs.ts:246-255`](../../../packages/language-core/src/template/attrs.ts#L246-L255)), así que
un `.ton|` a medio escribir mapea dentro del objeto y TypeScript contesta con las claves que
faltan. Lo que falta es el caso **vacío**: `.|` no tiene nombre que copiar, y ahí se emite un
ancla `COMPLETION_ONLY_CAPS` sobre el punto, apuntando a la posición de clave — el mismo recurso
que BUG-11 usó para el hueco del tag, aplicado un carácter más allá.

El servidor no inventa la lista: la lista es el contrato del componente y quien lo sabe es
TypeScript. `propertyContextAt` existe para lo contrario — para **no** estorbar: es la señal de
que ahí no entran ni Emmet, ni los tags, ni los snippets.

### 4.4. La arroba ofrece los eventos, sin `on`

El nombre del evento pasa de andamiaje a **tramo proyectado con las comillas incluidas**, que es
el recurso que SDD-24 ya usó para el literal de `@section`: un rango cuyos extremos caen en
tramos distintos no vuelve a ninguna parte, así que el literal entero es un solo tramo mapeado al
nombre del fuente. Con eso, `@cli|` pregunta dentro de `$on('cli')`, cuyo parámetro es
`keyof HTMLElementEventMap`, y la lista que vuelve es `click`, `change`, `input`… — sin `on`,
porque así está tecleado el mapa del DOM.

Para `@|` sin nombre, ancla, igual que en §4.3.

Y una regla que hay que escribir porque el `@` es la transición de Razor en todas partes menos
aquí: **dentro de un tag abierto, un `@` es un evento y nunca una directiva.** `directiveContextAt`
no entra en esa zona; su guarda es la misma `insideOpenTag` que `wordContextAt` ya usa.

Los eventos personalizados (nombre con guion) siguen como están: `as never` y el manejador
comprobado como función, decisión 28. No se ofrecen — no hay lista de dónde sacarlos — y eso no
es una carencia de este BUG, es que no existe tal lista.

### 4.5. Migración

Los `.fud` del repositorio pasan a la forma con punto: `examples/basic` y las fixtures del
compilador y del language server. No es limpieza opcional — con §4.2 en su sitio, `tone="info"`
es un error de TypeScript, y un ejemplo en rojo es un ejemplo que enseña lo contrario de lo que
dice el documento.

---

## 5. Invariantes

**Los que el bug violaba**

- *Una cosa, una forma.* Dos maneras de pasar la misma prop es una regla de más que enseñar,
  documentar y mantener — y ninguna señal de cuál es la buena.
- *Lo que el editor valida es lo que la salida escribe.* La proyección bendecía `.tone` y el emit
  lo tiraba: el peor de los dos mundos, un fallo que no falla.

**Los que la corrección añade**

- **Un nombre que el usuario escribe nunca se emite como andamiaje.** Si viaja copiado, se puede
  completar, navegar y diagnosticar; si se inventa, no existe para nadie.
- **El prefijo dice quién contesta.** `.` → el contrato del componente. `@` → el DOM. `class:` →
  el `<style>` de este fichero. Nada → HTML. Cuatro reglas, cero ambigüedad.

---

## 6. Criterios de aceptación

Tests en los tres paquetes.

**La forma única (compilador)**

1. **(rojo primero)** `<app-badge .tone="info">` emite `setAttr(v, 'tone', 'info')` en las tres
   salidas. Contra el código anterior no emite **nada**, que es lo que hace de este el test del
   BUG.
2. `<app-badge .tone="@(t)">` emite la rama de omitir-si-falsy de la decisión 21, byte a byte la
   misma que hoy produce `tone="@(t)"`.
3. Un `.prop` sobre un tag **nativo** sigue sin emitirse: `<input .value="@(x)">` no escribe
   atributo, exactamente como hoy.
4. La salida de nivel 1 de `examples/basic` reescrito con puntos es **idéntica** a la de hoy con
   atributos planos, documento a documento.

**El reparto (proyección)**

5. `<app-badge .tone="@(t)">` proyecta `tone` dentro de `$attrs<$C0>({…})`; `<app-badge id="x">`
   proyecta `id` dentro de `$attrs<{}>({…})`, y los dos literales conviven en el mismo tag.
6. **(medido con `tsc`, §3.3)** `tone: 'info'` contra `{} & $GlobalAttrs` reporta sobre el
   **nombre** y conserva la sugerencia para un global mal escrito.
7. `slot` sigue fuera de los dos literales y comprobado con `$intoSlot` (BUG-11): esto no lo
   toca.

**Lo que el editor ofrece**

8. **(rojo primero)** En `<app-badge .|>` la lista son los props del componente (`tone`), y el
   `textEdit` **no** se come el punto.
9. En `<app-badge .ton|>` la lista sigue siendo la de props y reemplaza `ton`, sin duplicar.
10. **(rojo primero)** En `<app-badge @cli|>` la lista contiene `click`, `change` e `input`, y
    **ninguno** empieza por `on`.
11. En `<app-badge @|>` la lista es la de eventos, no la de directivas Razor: no aparecen `@if`
    ni `@foreach`.
12. Fuera del tag, un `@` sigue siendo la transición de siempre: `@fore|` en markup ofrece
    `@foreach` como hasta ahora.
13. Los tres contextos se piden **con el `context` que manda un editor** (BUG-15 §6): sin él,
    ninguno de estos criterios prueba lo que dice probar.

**Lo que no se puede romper**

14. Los criterios §6.3 y §6.4 de SDD-24 siguen verdes con la sintaxis nueva, y §6.9 de BUG-11
    —los globales aceptados sobre un componente— también.
15. `pnpm build` construye `examples/basic` migrado, y las páginas prerenderizadas siguen
    pasando los E2E.

**Cobertura.** `language-core` y `language-server` no bajan del 100 % en las cuatro métricas;
`@fudic/compiler` no baja de donde esté.

---

## 7. Fuera de alcance

- **El spread.** Es la segunda forma prometida —`<app-card ...props>`— y necesita gramática
  nueva, no una restricción de la que hay. Va en su propio documento.
- **`.prop` sobre tags nativos.** Sigue significando lo que significa: propiedad del DOM, cliente,
  SDD-15. Este BUG no lo redefine.
- **La hidratación.** Que la prop viaje ahora como atributo no adelanta ni retrasa SDD-15: cuando
  el nivel de cliente vuelva, leerá lo mismo que lee el nivel 1.
- **El quick fix «añade el punto».** Ofrecer convertir `tone="x"` en `.tone="x"` exige saber que
  `tone` es una prop, y eso lo sabe TypeScript, no el servidor. Es una acción de código sobre un
  diagnóstico ajeno: su propio trabajo.
- **Los eventos personalizados.** No hay lista de la que ofrecerlos (decisión 28), y este BUG no
  la inventa.
- **`class:`, `style:`, `bus:` y `ref` en un hueco del tag.** Completar el **prefijo** es la otra
  mitad del interior del tag, y sigue donde BUG-15 §7 la dejó.
