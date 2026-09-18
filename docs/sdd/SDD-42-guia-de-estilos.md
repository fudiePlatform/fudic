# SDD-42 — La guía de estilos de una aplicación: la hoja adoptada

> **Estado:** `Hecho`
> **Paquetes:** `@fudic/compiler` (el hoisteo, la lista de specifiers, el diagnóstico) ·
> `@fudic/config` (un campo más) · `@fudic/ssr` (la lista en el `<template>`) ·
> `@fudic/example-basic` (la evidencia)
> **Depende de:** 18, 15, 41, BUG-31
> **Rango de diagnósticos:** `FUD0740`–`FUD0759`
> **Naturaleza:** emit. No toca el parser, ni el runtime de hidratación, ni el build.
>
> El framework no contempla una guía de estilos por aplicación. El único CSS que existe es
> el `<style>` de cada `.fud`, y una hoja global en el `<head>` **no entra en ningún shadow
> root**. Este SDD añade la segunda mitad del sistema de estilos, y deja escrito cuál de las
> dos hace cada cosa.

---

## 1. Contexto y objetivo

### 1.1. Lo que hay hoy

Un componente lleva un `<style>` en su `<head>`, y [SDD-18](./SDD-18-estilos-compartidos.md)
lo eleva a una copia por documento: `<style type="module" specifier="<tag>">` en el
`<head>` de la página, `shadowrootadoptedstylesheets="<tag>"` en su `<template>`, y
`data-fud-adopt="<tag>"` en el host para que el polyfill lo alcance.

Eso resuelve *«N instancias, una hoja»*. No resuelve *«N componentes, una guía»*: hoy, si
doce componentes comparten un sistema de espaciado, ese CSS se escribe doce veces, viaja
doce veces y se mantiene en doce sitios.

### 1.2. Por qué un `<link rel="stylesheet">` no lo arregla

> **Corrección de este párrafo.** «Ya pasa por el `AssetLinker`» era cierto y no bastaba:
> pasaba, y el build moría. Lo destapó la evidencia de este SDD y lo arregla
> [BUG-40](./bugs/BUG-40-una-hoja-que-no-se-puede-enlazar.md), que es de quién nombra un
> asset y no solo del CSS. Lo que sigue describe el mecanismo ya corregido.

Funciona, y no sirve para esto. Un `<link rel="stylesheet" href="./theme.css">` escrito en
el layout ya pasa por `headElementExpr` y el `AssetLinker`
([`emit/parts.ts`](../../packages/compiler/src/emit/parts.ts)), así que Vite lo resuelve,
lo hashea y respeta `base`. Pero lo que produce es una hoja **del documento**, y una hoja
del documento no atraviesa un shadow boundary: los componentes no la ven, que es
precisamente el aislamiento por el que existen.

La confusión es real y tiene consecuencias —`:root { --color-text: … }` en esa hoja **sí**
llega a los componentes, porque las custom properties heredan, y `.card { padding: … }`
**no** llega nunca—, así que este SDD no puede limitarse a añadir un mecanismo: tiene que
dejar escrito cuál de los dos hace qué (§4.2).

### 1.3. Lo que ya está construido

Tres cosas, y son la razón de que esto sea pequeño:

- **`shadowrootadoptedstylesheets` es una lista separada por espacios.** Está en el
  explainer que gobierna SDD-18 (§2.1): *«lista de specifiers separados por espacios»*, y
  un único CSS module script puede ser adoptado por cualquier número de shadow roots.
- **El polyfill ya lee una lista.**
  [`emit/polyfill.ts`](../../packages/compiler/src/emit/polyfill.ts) parte
  `data-fud-adopt` por espacios, acumula las hojas registradas y hace
  `adoptedStyleSheets.concat(list)`. No hay que tocarlo: hoy recibe un specifier porque el
  emit escribe uno.
- **La emisión ya es condicional.** [BUG-31](./bugs/BUG-31-el-emit-no-pregunta.md) §T3/§T4
  hizo que el polyfill solo salga si algún componente del grafo trae CSS, y que un
  componente con `css === ''` no emita ni specifier, ni `shadowrootadoptedstylesheets`, ni
  `data-fud-adopt`, ni entrada en `COMPONENTS`. Eso es exactamente la maquinaria que hace
  falta, y §4.4 dice qué de ella cambia.

### 1.4. El objetivo

Que un proyecto —app o librería— declare **una o varias hojas** que se adoptan en todos
los shadow roots de los componentes que **él** define, con el mecanismo de SDD-18 y sin
inventar ninguno.

---

## 2. Dependencias

**SDD-18 — Estilos compartidos.** La forma canónica, las tres reglas de evaluación
(§3.2) —el atributo se evalúa una vez al parsear el `<template>`, y el módulo tiene que
estar en el module map **antes**—, y el polyfill. Este SDD no cambia ni una: **añade
specifiers a una lista que ya existe**.

**SDD-15 — Emit.** `emitPageModule` y la pasada que resuelve la composición completa;
`buildComponentModule`; el hoisteo del `<head>` en
[`emit/parts.ts`](../../packages/compiler/src/emit/parts.ts).

**SDD-41 — `fudic.json`.** El fichero y su lector. Este SDD **le añade un campo** (§3.1),
que SDD-41 §7 ya remite aquí.

**BUG-31 — El emit no pregunta.** §T3 y §T4, tal como quedaron: el polyfill condicionado a
que haya CSS de componente, y el componente sin CSS que no aparece en ninguna de las cuatro
salidas. §4.4 de este SDD es exactamente la corrección de esa condición.

**SDD-09 — CSS con Razor.** El AST de `<style>`: `StyleNode.parts`, `CssPart` y la
propiedad que BUG-08 §2.2 dejó escrita —*«tapizan el span sin huecos y sin solapes»*—, que
es lo que hace trivial el diagnóstico de §4.5.

---

## 3. Interfaz pública

### 3.1. `fudic.json` gana un campo

```json
{
  "id": "shop",
  "kind": "app",
  "prefix": "shop",
  "styles": ["src/styles/theme.css", "src/styles/layout.css"]
}
```

| Campo | Tipo | Obligatorio | Qué es |
|---|---|---|---|
| `styles` | `string[]` | no — defecto `[]` | Hojas que este proyecto **adopta en los shadow roots de sus propios componentes**. Rutas relativas a la raíz del proyecto, en el orden en que se adoptan |

`ProjectConfig` gana `readonly styles: readonly string[]`, y el lector de SDD-41 lo valida
con los demás: un `styles` que no es un array de strings es `FUD0720`.

### 3.2. `@fudic/compiler`

```ts
/** A stylesheet the project adopts into every shadow root it owns (§4.1). */
export interface ProjectStyle {
  /** The module-map specifier. `_<basename>` — impossible as a tag (§4.3). */
  readonly specifier: string;
  /** The CSS, already minified by the same pass a component's goes through (BUG-08). */
  readonly css: string;
}

export interface EmitOptions {
  // …linker, componentSpecifier, layoutSpecifier
  /**
   * Project stylesheets, in adoption order. They are hoisted ONCE per document and their
   * specifiers are prepended to every owned component's adopted list.
   */
  readonly projectStyles?: readonly ProjectStyle[];
}
```

El host —el plugin, y `fudic check`— lee el `fudic.json`, resuelve y lee cada fichero, y
pasa la lista. El compilador **sigue sin tocar el filesystem**.

### 3.3. `@fudic/ssr`

`serialize.ts` ya escribe `shadowrootadoptedstylesheets` desde lo que el emit le da. Lo
único que cambia es que ahora puede darle **más de un specifier**, unidos por un espacio.
No hay firma nueva.

---

## 4. Comportamiento

### 4.1. La forma emitida

```html
<head>
  <style type="module" specifier="_theme">:root{--gap:8px}</style>   ← una vez, la del proyecto
  <style type="module" specifier="app-card">.card{padding:var(--gap)}</style>
</head>
<body>
  <app-card data-fud-id="0" data-fud-adopt="_theme app-card">
    <template shadowrootmode="open" shadowrootadoptedstylesheets="_theme app-card">
      …
    </template>
  </app-card>
</body>
```

**Las del proyecto van primero**, y en el orden del array. Es la cascada: la guía define,
el componente ajusta. Al revés, un componente no podría sobreescribir la guía sin subir
especificidad, que es la forma exacta de que una guía de estilos se vuelva inmanejable.

**Una hoja se hoistea una vez por documento**, como la de un componente. El `<head>` lleva
tantos `<style type="module">` como hojas distintas tenga la página, ni uno más.

**Y antes que los de componente**, porque la regla 2 de SDD-18 §3.2 es contrato duro: el
módulo tiene que estar en el module map **antes** de que se parsee el `<template>` que lo
referencia. El orden del `<head>` es: polyfill → hojas de proyecto → hojas de componente.

### 4.2. Las dos hojas de una aplicación, y qué hace cada una

Es la parte de este SDD que hay que leer antes de escribir CSS, y la razón por la que
existe `FUD0743`:

| | dónde se declara | dónde aplica | para qué |
|---|---|---|---|
| **Hoja del documento** | `<link rel="stylesheet">` en el layout | la luz del documento; **no** entra en ningún shadow | `:root { --token }`, `body`, reset, tipografía del documento |
| **Hoja del proyecto** | `styles` en `fudic.json` | dentro de **cada** shadow root del proyecto | `:host`, las clases que los componentes usan, el sistema de espaciado |

**Y las dos se necesitan.** Los tokens viven en la del documento porque las custom
properties heredan y son la única cascada que atraviesa el shadow boundary; las reglas que
casan elementos viven en la del proyecto porque ninguna otra cosa las mete dentro. Un
`:root { --gap: 8px }` en la hoja del **documento** y un `.card { padding: var(--gap) }` en
la del **proyecto** funcionan juntos, y es la forma canónica.

Lo que no funciona es `:root` dentro de la hoja del proyecto: en un shadow root, `:root`
no casa nada — el equivalente es `:host`, y no es lo mismo. Eso es `FUD0743` (§4.5).

### 4.3. El specifier: `_<basename>`

`src/styles/theme.css` → `_theme`.

El guion bajo inicial es lo que lo hace **imposible de colisionar con un tag**: un nombre
de custom element empieza por `[a-z]` en la especificación y en `validateTag`, así que
ningún componente podrá jamás pedir `_theme`. No hace falta un registro, ni un prefijo
configurable, ni una comprobación cruzada: la colisión es inconstruible.

Dos hojas con el mismo basename en directorios distintos sí colisionan entre ellas, y eso
es **`FUD0741`**, error. Renombrar una es la reparación, y es preferible a inventar un
nombre derivado de la ruta que sería ilegible en el HTML y distinto en Windows.

### 4.4. Lo que cambia de BUG-31 §T3 y §T4

Las dos condiciones de aquel BUG están escritas sobre una premisa que este SDD rompe: *el
único CSS es el de los componentes*. Las dos siguen siendo correctas, con la premisa
ampliada.

**El polyfill (§T3).** Hoy sale si **algún componente del grafo trae CSS**. Pasa a salir si
hay CSS que adoptar, **de componente o de proyecto**. Sin la ampliación, una app cuyos
componentes no traen ni una regla propia y que se apoya entera en la guía emitiría la hoja
y ningún navegador sin soporte nativo la adoptaría.

**El componente sin CSS (§T4).** Hoy, con `css === ''`, un componente no emite specifier,
ni `shadowrootadoptedstylesheets`, ni `data-fud-adopt`, ni entrada en `COMPONENTS`. Pasa a
emitir **la lista del proyecto y solo esa**:

```html
<app-plain data-fud-adopt="_theme">
  <template shadowrootmode="open" shadowrootadoptedstylesheets="_theme">…</template>
</app-plain>
```

Lo que §T4 quería evitar sigue evitándose: **una hoja construible vacía**. Lo que ahora no
se puede evitar es la adopción, porque hay algo real que adoptar. La condición correcta no
es *«este componente tiene CSS»* sino *«la lista de adopción de este componente está
vacía»*, y con un proyecto sin `styles` las dos dicen lo mismo — que es por qué BUG-31
sigue en verde sin tocar un test.

### 4.5. Lo que la hoja del proyecto no puede contener

**`FUD0743`, warning**, sobre una regla cuyo selector solo tiene sentido en el documento y
no dentro de un shadow: `:root`, `html`, `body`. Dentro de un shadow root no casan nada, y
el autor que las escribe ahí está escribiendo código muerto convencido de lo contrario.

Se detecta sobre el AST de SDD-09 —los `parts` tapizan el span sin huecos, así que recorrer
los `css-text` y leer los selectores no necesita parser nuevo— y el mensaje dice a dónde
mover la regla: a la hoja del documento, el `<link rel="stylesheet">` del layout.

Warning y no error, por una razón concreta: una hoja puede compartirse entre el documento y
los shadows —el mismo fichero servido de las dos formas es un caso legítimo— y ahí las
reglas de `:root` son correctas en la copia del documento. Prohibirlo obligaría a partir un
fichero que el autor tiene motivos para no partir.

### 4.6. La hoja de un proyecto es de **sus** componentes

Un componente adopta la hoja del proyecto **que lo define**, no la del proyecto que lo
renderiza.

Con un solo proyecto no hay diferencia. Con una librería sí, y es la regla que hace que la
composición tenga sentido: `ui-card`, definido en `libs/ui`, adopta la guía de `libs/ui`
—la que su autor probó contra él— y no la de la app que lo usa. Una app no puede reestilar
por accidente los componentes de una librería, que es lo que pasaría si la hoja se aplicara
por documento.

**En v1 esto se observa, no se compone.** Que la app pueda además adoptar su propia hoja
dentro de un componente ajeno, o que una librería herede la guía de otra de la que depende,
es composición entre paquetes y vive en SDD-43 (§7).

### 4.7. El CSS del proyecto pasa por lo mismo que el de un componente

Se minifica con la pasada de [BUG-08](./bugs/BUG-08-css-verbatim.md) y sus `url(…)` se
enlazan con el `AssetLinker`, igual que los de un `<style>` de `.fud`. No hay un segundo
camino para el CSS, y no puede haberlo: el día que lo hubiera, una de las dos salidas
dejaría de minificarse en silencio, que es literalmente el defecto que BUG-08 arregló.

Lo que **no** admite es Razor: la hoja del proyecto es un `.css`, no un `.fud`. No hay
`@if`, ni interpolación, ni `@code` — es un fichero que también tiene que poder abrir un
diseñador y que cualquier herramienta de CSS tiene que poder leer.

---

## 5. Invariantes

- **Un mecanismo, no dos.** Todo lo de este SDD es `<style type="module" specifier>` más
  `shadowrootadoptedstylesheets`, que son SDD-18. No se inventa marcador, ni atributo, ni
  convención de nombres más allá del `_` de §4.3.
- **El compilador no toca el filesystem.** Las hojas llegan leídas, por `EmitOptions`.
- **Una copia por documento.** Una hoja se hoistea una vez, la usen uno o cien componentes.
  Es la propiedad que motivaba SDD-18 y este SDD no puede romperla.
- **El orden es contrato.** Polyfill, después hojas de proyecto, después hojas de
  componente, y los `<template>` detrás de todas. Es la regla 2 de SDD-18 §3.2, y sin ella
  el atributo se evalúa contra un module map incompleto y el shadow sale sin estilos.
- **Lo vacío no se emite.** Sin `styles`, la salida es **byte a byte** la de BUG-31. Sin
  componentes propios, la hoja no se hoistea (y eso es `FUD0742`).
- **Un solo camino para el CSS.** Minificación y enlazado de assets compartidos con el CSS
  de componente (§4.7).
- **Cobertura.** El código nuevo de `@fudic/compiler` nace al 100 % en las cuatro métricas.

### Catálogo de diagnósticos (`FUD0740`–`FUD0759`)

| Código | Severidad | Qué dice |
|---|---|---|
| `FUD0740` | `error` | `styles` nombra un fichero que no existe. Con la ruta tal como se escribió. |
| `FUD0741` | `error` | Dos hojas del proyecto producen el mismo specifier: mismo basename en directorios distintos (§4.3). |
| `FUD0742` | `warning` | El proyecto declara `styles` y no define ningún componente: la hoja no se adopta en ninguna parte. |
| `FUD0743` | `warning` | La hoja del proyecto contiene una regla `:root`, `html` o `body`. Dentro de un shadow no casa nada; su sitio es la hoja del documento (§4.2). |
| `0744`–`0759` | | Reservados. |

---

## 6. Criterios de aceptación

Tests en `packages/compiler/test/emit/` (1–9), `packages/config/test/` (10),
`packages/vite/test/` (11–12) y la evidencia en `examples/basic` (13–14).

**La emisión**

1. **(rojo primero)** Un proyecto con `styles: ["src/styles/theme.css"]` y un componente
   `app-card` con CSS propio emite, en el `<head>`, `<style type="module" specifier="_theme">`
   **antes** de `<style type="module" specifier="app-card">`, y el `<template>` de la
   tarjeta lleva `shadowrootadoptedstylesheets="_theme app-card"`. Hoy lleva `"app-card"`.
2. `data-fud-adopt` del host lleva los **mismos dos** specifiers, en el mismo orden: el
   polyfill y el camino nativo no pueden discrepar.
3. **Una copia por documento.** Una página con seis instancias de tres componentes distintos
   emite **un** `<style type="module" specifier="_theme">`, no tres ni seis.
4. **El orden del array manda.** Con `["a.css", "b.css"]`, la lista adoptada es
   `_a _b <tag>`; invertir el array invierte la lista.
5. **BUG-31 §T4, ampliado.** Un componente **sin** CSS en un proyecto **con** `styles`
   emite `data-fud-adopt="_theme"` y `shadowrootadoptedstylesheets="_theme"` — y **ningún**
   `<style type="module" specifier="<tag>">` para él (§4.4).
6. **BUG-31, intacto.** Un proyecto **sin** `styles` produce una salida **byte a byte**
   idéntica a la de antes de este SDD: el golden de BUG-31 no se toca.
7. **El polyfill, ampliado.** Un proyecto con `styles` y con **cero** componentes con CSS
   emite el polyfill. Hoy no lo emitiría (BUG-31 §T3).
8. **La minificación.** El CSS del proyecto sale minificado por la misma pasada que el de
   un componente, y un `url(./logo.svg)` dentro de él se enlaza por el `AssetLinker`
   (§4.7). Un `url` inexistente produce `FUD0363`, el que ya existe.
9. **`FUD0743`.** Una hoja de proyecto con `:root { --gap: 8px }` emite el warning con el
   span de la regla, y **se emite igual**: es un aviso, no una poda.

**La configuración**

10. `styles` ausente es `[]`; `styles: "theme.css"` (no array) es `FUD0720` de SDD-41 y deja
    `config: null`; dos hojas con el mismo basename son `FUD0741`; una que no existe es
    `FUD0740`.

**El build**

11. El plugin lee las hojas del `fudic.json` del proyecto, las pasa por `EmitOptions` y el
    compilador no abre ni un fichero. Se mide inyectando una `ResolveIo` que lanza si se le
    pide un `.css`.
12. `FUD0742`: un proyecto con `styles` y sin ningún componente propio construye, y avisa.

**La evidencia**

13. `examples/basic` gana `src/styles/theme.css` con el sistema de espaciado y color que
    hoy está repetido en los `<style>` de sus componentes, y esos `<style>` adelgazan.
    Verificado en Chrome real en las tres formas —`pnpm dev`, build sin SW y build con SW—
    y **también con el polyfill forzado**, que es el camino que la mayoría de navegadores
    toma hoy (SDD-18 §2.2).
14. **Cobertura.** El código nuevo de `@fudic/compiler` al 100 % en las cuatro métricas;
    `@fudic/config` no baja del 100 con el campo nuevo.

---

## 7. Fuera de alcance

- **Componer guías entre paquetes.** Que una app adopte además su hoja dentro de un
  componente de una librería, o que una librería herede la guía de otra de la que depende,
  es [SDD-43](./SDD-43-librerias.md). Aquí rige §4.6: la hoja es de quien define el
  componente. **Condición de reapertura:** cuando SDD-43 resuelva el grafo de paquetes,
  hay que decidir si la composición es unión de listas o sustitución — y decidirlo **antes**
  de implementarla, porque una lista que crece por cada paquete de la cadena es una cascada
  que nadie puede leer.
  **Contestada** en [SDD-43 §4.6](./SDD-43-librerias.md): **unión**, en orden de dependencia y
  solo por la cadena del paquete que **define** el componente, con lo que la lista crece con la
  profundidad de ese paquete y no con lo que el documento componga. La hoja del consumidor no
  entra, y dos paquetes que adoptan con el mismo especificador son el `FUD0741` de aquí.
- **Razor en la hoja del proyecto.** §4.7. Es un `.css`.
- **La purga.** Quitar de la guía lo que una página no usa es otra spec, y necesita
  medición antes que diseño: con Service Worker, una hoja distinta por página pierde el
  compartido entre navegaciones y puede salir **peor** que una global cacheada para
  siempre. Lo que este SDD deja listo es el sitio donde esa purga tendría que actuar, y la
  línea por la que se parte: la hoja del documento y la del proyecto se purgan con
  información distinta (§4.2).
- **`@import` dentro de la hoja.** Un CSS module script no resuelve `@import`. No se
  diagnostica en v1; el día que alguien lo escriba, es un `FUD` de este rango.
- **Cambiar de guía en caliente.** La regla 1 de SDD-18 §3.2 es contrato duro: el atributo
  se evalúa **una vez**, al parsear el `<template>`. Un tema que cambia sin recargar se
  hace con custom properties en la hoja del documento, que es para lo que están.
- **Un `<link rel="adopt">` en el layout.** Se consideró y se descartó: la guía es una
  propiedad del **proyecto** —una librería la publica, un layout no—, y declararla en un
  fichero por documento la haría imposible de compartir.
