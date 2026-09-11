# BUG-32 · El host no acepta bindings, y lo que sobra no se dice

El tag de identidad se traga el atributo, el `class:` y el `@event` que se le escriben: no
emite nada, no avisa y el editor no ofrece nada ahí. Y a la vez, un `.prop` que nadie pidió
reflejar se serializa como atributo del host del hijo y se reescribe en cada update.

Lo que el host acepta son **atributos y eventos**, y nada más. Un `class:` ahí no tiene
sentido: las clases que el editor ofrece salen del `<style>` del componente, que se resuelve
**dentro** del shadow, mientras que una clase escrita en el host se resuelve **fuera**, contra
la hoja de la página donde ese host aterrice — una página que este fichero no conoce. Sería
ofrecer nombres que no aplican nunca.

- [ ] **T1** · Un `.prop` deja de escribirse como atributo. `attributeOf` colapsa a `if (b.type !== 'attr') return null;` ([attrs.ts:184-193](packages/compiler/src/emit/attrs.ts#L184-L193)), con lo que la excepción `channel === 'fn'` de BUG-24 sobra. El reflect explícito —`data-x=@value` en el host del hijo— ya funciona y es el que se queda. Goldens de SSR y de nivel 1; BUG-16 §4.1 y BUG-24 §4.7 dicen hoy lo contrario y se corrigen.
- [ ] **T2** · El tag de identidad emite sus bindings: **atributo plano y `@event`, y solo eso**. Hoy `structureDocument` solo le busca atributos por nombre (`findAttr`, [structure.ts:115](packages/compiler/src/document/structure.ts#L115)) y el resto se descarta; el emit arranca dentro del `<template>`, así que ni el servidor ni el cliente escriben una línea del host.
- [ ] **T3** · **Ctrl+Space dentro del tag de identidad, antes del `>`, no ofrece absolutamente nada** — ni el vocabulario HTML que un `<div>` sí da, ni los eventos con `@`. No es el servidor: `templateContent` devuelve `doc.template?.children` ([imports.ts:176](packages/language-core/src/imports.ts#L176)), así que sobre ese tag no se proyecta `$gap`, ni `$attrs`, ni `$props`, y no hay nada a lo que preguntar. La lista que toca ahí es la de T2 —atributos y eventos—, sin props (el host no se pasa props a sí mismo) y **sin clases**, por lo que dice la cabecera. Sobre el host de un **hijo** la proyección sí está completa y el editor responde: el defecto es exclusivo del tag de identidad.
- [ ] **T4** · `class:` lee la signal. Hoy compone la expresión con el texto crudo —`classExprs.push(\`(${slice(...)}) && ...\`)`, [attrs.ts:314](packages/compiler/src/emit/attrs.ts#L314)— sin pasar por `crossingExpr`, así que `class:red=@rojo` emite `(rojo) && "red"`: el objeto, siempre truthy, y `rojo.set(false)` no quita la clase. En las dos ramas, y en un tag nativo: no es un defecto del host.
- [ ] **T5** · Un `class:` en el tag de identidad es un **error**, con un `FUD` nuevo y el mensaje de la cabecera: la clase se resolvería fuera del shadow y las que el editor conoce están dentro. Va en el pase semántico, que es donde vive la regla gemela: `delegate:` en ese mismo tag ya avisa con `FUD0663` ([delegation.ts:384](packages/compiler/src/semantic/delegation.ts#L384)). Hoy los tres —atributo, `class:` y `@event`— devuelven cero diagnósticos; T2 cierra dos soportándolos y esta cierra el tercero prohibiéndolo.
- [ ] **T6** · El otro silencio, y el mismo sitio: un `<link rel="component">` cuyo tag ya no aparece en la plantilla no lo señala nadie. Analizador nuevo, `component-unused.ts`, junto al que mira la dirección contraria ([component-declared.ts:35](packages/compiler/src/semantic/analyzers/component-declared.ts#L35)), con su `FUD` sobre el span del `<link>`, su entrada en `ANALYZERS` ([analyze.ts:32](packages/compiler/src/semantic/analyze.ts#L32)) y su fila en el catálogo de SDD-12.
- [ ] **T7** · El alcance de T6 no es solo la plantilla de un componente: un layout y una ruta también enlazan, y `documentRoots` los trata aparte ([walk.ts:68-82](packages/compiler/src/semantic/walk.ts#L68-L82)). Una ruta usa el tag en su markup **o dentro de una `@section`**, y un layout en su `<body>`: contar solo el markup da un falso positivo en cuanto el tag viva en una sección.
- [ ] **T8** · La severidad de T6, y no es trámite: un import sin usar es aviso en cualquier lenguaje y aquí además es transitorio —se está reescribiendo la plantilla—, pero el pase solo emite `errorDiag`. O se abre un canal de warning, o esto es error. Y con ello, medir si además cuesta bytes: el módulo de la página no lo importa (`em.used` recoge solo lo que el walk renderiza, [markup.ts:367](packages/compiler/src/emit/markup.ts#L367)), pero `resolveComponents` sí mete el fichero en el grafo y `hydratableTags` recorre `allComponents`. Si de ahí sale chunk de hidratación, entrada en `COMPONENTS` o precache, esto deja de ser higiene.

**Hecho cuando**: `<app-child .count=@count>` no escribe `count=` en el host ni en SSR ni en `$a()`; un atributo y un `@click` escritos en el tag de identidad producen las mismas llamadas que en un tag de dentro; un `class:` ahí es un error con su código; `class:red=@rojo` en un tag normal quita la clase al hacer `rojo.set(false)`; Ctrl+Space en `<app-x |>` ofrece el vocabulario HTML y los eventos; un `<link rel="component">` cuyo tag no aparece se señala, y uno usado solo dentro de una `@section` no; `pnpm typecheck` + `pnpm test` verdes.

**Fuera**: el reflect explícito (`data-x=@value` en el host de un hijo), que ya funciona y no se toca. `delegate:` fuera de un bucle, que ya es `FUD0663` y está bien como está. Y el `<link rel="layout">` y el `<link rel="stylesheet">`, que son otra pregunta: una ruta tiene como mucho un layout, y usarlo no es escribir un tag.

---

## Medido así

Seis medidas, con tests de usar y tirar borrados después. Para reproducirlas:

**1 · Qué emite el tag de identidad.** Un test en `packages/compiler/test/emit/` que compila esta
fuente con `resolveComponents` + `entryComponent` + `emitComponentModule` /
`emitComponentClientModule` sobre un `memoryIo`, y vuelca las dos salidas:

```html
<app-x data-xxx=@n class:red=@rojo @click=@pick>
  <template shadowrootmode="open">
    <p class="v">@n()</p>
    <b data-yyy=@n class:red=@rojo @click=@pick>nativo</b>
  </template>
</app-x>
```

El `<b>` recibe su `setAttr`, su `class` y su `$dom.event`; el host, nada en ninguna de las dos
ramas. De aquí sale también T4, visible en las dos: `setAttr($n4,'class',[(rojo) && "red"]…)`.

**2 · Si alguien avisa — parse y estructura.** El mismo fuente por `parseDocument` +
`structureDocument`, volcando `diagnostics`: `parse: []`, `structure: []`.

**3 · Si alguien avisa — pase semántico.** Un test en `packages/compiler/test/semantic/` que
arma el `SemanticInput` como hace `analyze.test.ts` (`buildInput`) y llama a `analyze`. Con
`data-xxx`, `class:red` y `@click` en el tag de identidad: **ninguno**. Con `delegate:z` en el
mismo sitio, y con un `delegate:w` en un `<b>` fuera de todo bucle: **dos `FUD0663`**, uno por
cada uno. Esa es la asimetría que T5 nombra.

**4 · Qué proyecta el editor.** Un test en `packages/language-core/test/` con `emitClient` y
`registryOf` que vuelca `vf.text` de un padre con varios hosts. Confirma lo contrario de lo que
parecía: sobre el host de un **hijo** la proyección está completa —`'data-xxx': (count)` copiado
1:1 bajo `USER_CAPS`, y el hueco `( )` para `data-x="@"`—, y sobre el tag de identidad no hay
nada. Por eso `data-x="@|"` sí ofrece nombres ahí: esa lista la da `expressionValueContextAt`
desde el parseo, no la proyección.

**5 · En el navegador.** `examples/basic/dist/hidratacion/index.html` sale con
`<app-child … count="0">` y el payload `fud-state` ya lleva el mismo valor; el chunk
`assets/h/app-parent-*.js` muestra el `setAttr(o,'count',…)` dentro de `$a()`, suscrito con
`$sub`. Dos canales para el mismo número, y el hijo no lee el atributo: no hay
`observedAttributes` y `h()` no lo consulta.

**6 · El link sin usar (T6).** `ANALYZERS` es la lista completa del pase semántico, 19 entradas.
El único analizador que lee los `<link rel="component">` es `componentDeclared`, y su mensaje
dice la dirección que cubre: *«custom element `<x-y>` used without a `<link rel="component">`
declaration»*. No hay ninguno para la contraria, y `unused` no aparece en
`packages/compiler/src`.
