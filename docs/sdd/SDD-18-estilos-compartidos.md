# SDD-18 — Estilos compartidos en DSD (`<style type="module">` + `shadowrootadoptedstylesheets`)

> **Estado:** `Listo` — **es la forma de estilos de v1**, con polyfill (vía (b) de §7). No
> hay vía inline y **el specifier es el tag**: SDD-15 §4.8 emite este mecanismo
> (`<style type="module" specifier="<tag>">` en `<head>` + `shadowrootadoptedstylesheets="<tag>"`
> en cada template) desde el primer día, sin marcadores inventados. El polyfill (§5) es
> condición de emisión mientras el soporte nativo no sea universal. Reverificar §2.2/§6
> (soporte y polyfill) antes de implementar.
> **Paquete:** emit del compilador (`@fudic/compiler`) + polyfill de página.
> **Depende de:** SDD-15 (emit de página: comparte la pasada que resuelve la composición
> completa y asigna `data-id`).
> **Rango de diagnósticos:** `FUD0340`–`FUD0359` (reservado, vacío).
>
> **Refunde, sin pérdida, `docs/reviews/NOTA-estilos-compartidos-dsd.md`** (ya eliminada).
>
> **Procedencia de cada afirmación.** Todo lo de §2 y §3 está contrastado contra el
> explainer dedicado de MSEdge y contra el Intent to Experiment de blink-dev, ambos
> leídos, no recordados. Lo de §4 son decisiones del proyecto, marcadas como tales.
> El estado de implementación (§2.2) caduca: reverificar antes de implementar (§6).

---

## 1. Contexto: qué estaba mal

El plan anterior del proyecto era `<style host="tag">`: una hoja por componente elevada al
`<head>`, más un polyfill propio que la adoptaba en cada shadow root por tag, más un plan de
llevar la idea a WICG como propuesta nueva. Se sostenía sobre esta afirmación, escrita en el
resumen técnico:

> «El puente declarativo obvio no existe y nadie lo ha propuesto.»

**Es falsa.** La propuesta existe, está activa, tiene explainer formal con venue esperado
WHATWG, issue de spec abierto y origin trial en Chromium. La afirmación se dio por buena sin
verificar y sobre ella se construyó todo el diseño.

**Consecuencia:** `<style host>` era una invención paralela a un estándar en curso. Se
abandona — el mecanismo, el polyfill y el plan de estandarización. Lo que queda es esta spec:
alinearse con la propuesta real.

**Lo que cambia respecto al plan anterior es solo el mecanismo.** El objetivo (una copia del
CSS por documento en vez de N) y el conocimiento que el compilador ya tiene (el mapa
`tag → hoja`, resuelto en compile time) son los mismos. Cambia la sintaxis emitida.

---

## 2. Qué es lo que sí existe

### 2.1. Las dos features

Del equipo de Edge (Kurt Catti-Schmidt, Hoch Hochkeppel, Daniel Clark, Alison Maher):

| # | Feature | Qué hace |
|---|---|---|
| 1 | `<style type="module" specifier="...">` | Define un CSS module script inline y lo mete en el module map |
| 2 | `shadowrootadoptedstylesheets` | Atributo en `<template>`: lista de specifiers separados por espacio; adopta los `CSSStyleSheet` correspondientes en el `adoptedStyleSheets` del shadow root |

Ambas están vivas. El explainer dedicado declara que funcionan mejor juntas pero que **pueden
lanzarse de forma independiente**. Un único CSS module script puede ser compartido por
cualquier número de shadow roots — que es exactamente el caso de Fudic.

**Documentos de referencia:**

- Explainer dedicado (el que gobierna esta spec):
  `https://github.com/MicrosoftEdge/MSEdgeExplainers/blob/main/ShadowDOMAdoptedStyleSheets/explainer.md`
  Estado del documento: **Active**. Venue esperado: WHATWG.
- Explainer padre (problema, casos de uso, alternativas descartadas, `<style type="module">`):
  `https://github.com/MicrosoftEdge/MSEdgeExplainers/blob/main/ShadowDOM/explainer.md`
- Issue de spec: `whatwg/html#10673`
- Foro de discusión: `WICG/webcomponents#939`
- Issue abierto relevante: `w3c/csswg-drafts#10013` (adopción de hojas no construibles)

### 2.2. Estado de implementación (caduca — reverificar, §6)

- **Chromium:** origin trial. Milestones estimados en el Intent to Experiment: desktop,
  Android y WebView de **148 a 153**. Finch feature name `DeclarativeCSSModules`. Tracking
  bug `issues.chromium.org/issues/448174611`. Entrada de chromestatus
  `feature/4790543041298432`. Con anterioridad al trial, testeable activando *Experimental
  Web Platform Features* tras la versión 144.
- **Gecko:** bug abierto `bugzilla.mozilla.org/show_bug.cgi?id=2037650`. Sin implementar.
- **WebKit:** bug abierto `bugs.webkit.org/show_bug.cgi?id=314242`. Sin implementar.

**Consecuencia operativa:** hoy esto no se puede emitir como única vía. Un motor sin soporte
deja el shadow sin estilos (regla 3 de §3.2: placeholder vacío). El polyfill (§5) no es un
adorno: es condición de emisión.

---

## 3. Semántica adoptada

### 3.1. Forma canónica

```html
<head>
  <style type="module" specifier="app-card">
    :host { display: block }
    .card { border: 1px solid #ddd; border-radius: 8px }
  </style>
</head>
<body>
  <app-card data-id="0">
    <template shadowrootmode="open" shadowrootadoptedstylesheets="app-card">
      <!-- markup SSR -->
    </template>
  </app-card>
</body>
```

Sin import map. Sin data URI. Sin URL-encoding. El `<style type="module">` puebla el module
map directamente.

### 3.2. Reglas de evaluación (del explainer; son contrato duro)

1. **El atributo se evalúa una sola vez, al parsear el `<template>`.** No es retroactivo: un
   módulo declarativo añadido al module map después no se recoge.
2. **El módulo declarativo debe estar en el module map ANTES** de que se parsee el
   `<template>` que lo referencia. El explainer lo demuestra con dos contraejemplos
   explícitos: `<style type="module">` *después* del template → sin estilos;
   `<style type="module">` *dentro* del propio template que lo adopta → sin estilos (el
   template se parsea primero).
3. **Specifier que no resuelve a URL** (bare specifier sin entrada en import map) → el fetch
   falla, queda una entrada de hoja placeholder vacía en `adoptedStyleSheets` y no se aplica
   estilo alguno para ese specifier. Devtools debería avisar.
4. **Specifier que resuelve a URL y no está en el module map** → se lanza un fetch, con hoja
   placeholder vacía en su posición hasta que llegue. **Esto produce FOUC.** La recomendación
   del explainer para ese caso es `<link rel="modulepreload" as="style">` en `<head>`,
   combinable con `blocking="render"` y con manejo de error vía `onerror`.
5. **El orden en el atributo es el orden en `adoptedStyleSheets`**, y ese orden determina la
   cascada. Si hay fetches, el orden de finalización puede no coincidir con el especificado y
   cada uno puede provocar un FOUC separado.
6. **Sin detección de fallo de fetch.** Limitación reconocida en el explainer: si el fetch
   falla (404, error de red), la entrada placeholder queda vacía y **no hay mecanismo para
   que el desarrollador lo detecte** ni para dar un fallback declarativo.

### 3.3. Reflection

El `<template>` de DSD lo consume el parser y no queda en el DOM, así que el atributo no es
legible por DOM después del parseo. El explainer **propone** (no existe aún) una propiedad
`shadowRootAdoptedStyleSheets` en `HTMLTemplateElement` que refleje el valor de parse time.
Es el punto de feature detection del polyfill, en la forma que el propio explainer da:

```js
document.createElement('template').shadowRootAdoptedStyleSheets !== undefined
```

### 3.4. Variante sin script (registrada, no adoptada)

El explainer recoge una sugerencia de `whatwg/html#10673` para caer a un `<link>` normal sin
JavaScript, mediante un atributo nuevo `noadoptedstylesheets` que evitaría la doble
aplicación:

```html
<template shadowrootmode="open" shadowrootadoptedstylesheets="foo">
  <link rel="stylesheet" href="/foo.css" noadoptedstylesheets>
</template>
```

No está especificado ni implementado, y no soporta módulos declarativos. Se registra porque,
si prosperara, elimina el polyfill de §5 — que es la pieza más cara de esta spec. Vigilar.

---

## 4. Contrato de emit

El compilador ya conoce en compile time el mapa `tag → hoja CSS`. Eso no cambia; cambia la
forma de emisión. Las decisiones D-1 a D-6 son **del proyecto**, derivadas de las reglas de
§3.2 pero no dictadas por el explainer.

- **D-1. El specifier es el tag, uno por hoja compartida.** Sin prefijo ni namespace
  inventado: el estándar acepta cualquier specifier y el tag ya identifica la hoja de forma
  única. `<style type="module" specifier="app-card">` ↔ `shadowrootadoptedstylesheets="app-card"`.
- **D-2. El `<style type="module">` se emite en `<head>`, antes de cualquier `<template>`.**
  No es preferencia: la regla 2 de §3.2 lo exige. En streaming SSR implica que **el conjunto
  de hojas debe conocerse al emitir el `<head>`**, es decir, en la pasada única de página tras
  resolver la composición completa (SDD-15 §3.2). Si una hoja se descubriera tarde, su
  specifier no estaría en el module map y el componente saldría sin estilo, sin error
  detectable (regla 3).
- **D-3. Nada de specifiers que resuelvan a URL externa.** Todo specifier emitido se define
  con `<style type="module">` en el mismo documento. Un specifier externo mete FOUC (regla 4)
  y no tiene manejo de error (regla 6). Si algún día se quiere CSS externo cacheable, la vía
  es `<link rel="modulepreload" as="style">` con `blocking="render"`, nunca el atributo a
  pelo.
- **D-4. El atributo se emite en cada instancia, desde el día uno.** `shadowrootadoptedstylesheets="<tag>"`
  en cada `<template shadowrootmode>`, forma estándar siempre presente, de modo que el día que
  haya soporte nativo no se toca nada. Es una cadena corta repetida N veces; con brotli es
  ruido, pero no es cero.
- **D-5. `:host` en las hojas compartidas.** El `<style type="module">` no aplica al documento
  donde se declara (es un módulo, no una hoja activa), pero las reglas deben escribirse
  relativas al shadow porque ahí es donde se adoptan.
- **D-6. El polyfill obtiene el specifier del tag del host, sin atributo espejo.** El
  `<template>` no sobrevive al parser y la reflection de §3.3 aún no existe, pero el specifier
  **es el tag** (D-1), y el `tagName` del host sí es legible del DOM. El polyfill recorre los
  shadow hosts y adopta la hoja nombrada por su tag. No se emite ningún `data-fud-css` ni
  marcador inventado: cero bytes extra y cero rediseño el día que haya soporte nativo.

### 4.1. Coste frente a la alternativa inline (vía (a), descartada)

| | `<style>` inline por instancia (vía (a), descartada) | `<style type="module">` + atributo (vía (b), adoptada) |
|---|---|---|
| Bytes de CSS en HTML | N copias | 1 copia |
| Bytes por instancia | CSS completo | ~40 bytes del atributo (sin espejo) |
| Parse de CSS | 1 vez (el navegador dedupe hojas idénticas) | 1 vez |
| Objetos `CSSStyleSheet` | 1 compartido | 1 compartido |
| FOUC | No | No (módulo declarativo en `<head>`) |
| Requiere JS | No | Sí mientras el polyfill sea necesario (§2.2) |

El ahorro real es de **bytes de HTML**, que es exactamente el dolor que motivó todo esto. El
parse y la memoria ya estaban resueltos por la deduplicación interna del navegador. La única
contrapartida de (b) es la dependencia de JS mientras el polyfill sea necesario (§2.2), coste
aceptado en §7.

---

## 5. El polyfill

Deja de ser una invención y pasa a ser un polyfill de verdad. Cambia de forma por completo:
antes observaba custom elements por selector CSS y adoptaba hojas por tag; ahora:

1. **Feature detection:** la de §3.3. Si hay soporte nativo, el polyfill no hace nada.
2. **Sin soporte:** el atributo `shadowrootadoptedstylesheets` vive en un `<template>` que el
   parser ya consumió, así que **no es legible del DOM**. Se resuelve por convención (D-1/D-6):
   el specifier **es el tag**, y el `tagName` del host sí es legible.
3. **Rutina:** recorrer los shadow hosts (descendiendo por `shadowRoot`, que `querySelectorAll`
   no cruza), tomar el specifier del `tagName`, construir el `CSSStyleSheet` **una vez por tag**
   (cacheado en un `Map`) a partir del `<style type="module" specifier="<tag>">` del `<head>`, y
   asignar `shadowRoot.adoptedStyleSheets`. Debe correr también sobre instancias creadas
   después: el controlador padre crea instancias en runtime al mutar un array (el punto `c()`
   de SDD-15 §4.3).
4. **Restricción heredada:** `adoptedStyleSheets` solo acepta hojas construidas
   (`new CSSStyleSheet()`); asignar `styleEl.sheet` lanza. Puede cambiar si prospera
   `csswg-drafts#10013` — es uno de los issues abiertos que el propio explainer lista.

**Coste que hay que aceptar:** con el polyfill activo, el CSS de un componente depende de
JavaScript. Eso choca de frente con el invariante de que un N1 se ve sin JS. Mientras el
soporte nativo no sea universal, esta spec **solo es aplicable si se acepta esa regresión**, o
bien se restringe a los tags que ya descargan JS. Es la decisión de §7.

---

## 6. Qué verificar antes de implementar

Nada de §2.2 se da por vigente en el momento de implementar. Contrastar:

1. **Estado del origin trial y del shipping** en `chromestatus.com/feature/4790543041298432`.
   Si el atributo está shipped en algún motor, el polyfill pasa de «siempre» a «fallback».
2. **Estado en Gecko y WebKit** (bugs de §2.2). Es lo que decide si el polyfill desaparece.
3. **Nombre del atributo y de la propiedad de reflection.** Contrastados como
   `shadowrootadoptedstylesheets` y `shadowRootAdoptedStyleSheets`, pero la reflection es una
   propuesta, no una API existente.
4. **`csswg-drafts#10013`.** Si prospera, simplifica el polyfill.
5. **`noadoptedstylesheets` (§3.4).** Si prosperara, elimina el polyfill.

---

## 7. Decisión (resuelta): vía (b) — adoptada ya, con polyfill

**Se adopta (b): es la forma de emisión de estilos de v1, con polyfill.** No hay vía inline;
SDD-15 §4.8 emite este mecanismo desde el primer día.

- **(b) — elegida.** El emit produce `<style type="module" specifier="<tag>">` + el atributo
  `shadowrootadoptedstylesheets="<tag>"` (el specifier es el tag, sin marcadores inventados), y
  el **polyfill** (§5) adopta las hojas donde el soporte nativo aún no llega (§2.2). Coste
  asumido y aceptado: el CSS de un componente depende de JS mientras el polyfill sea necesario
  (§5) —regresión consciente sobre "un N1 se ve sin JS"—, a cambio de una sola forma de
  emisión, sin migración posterior.
- **(a) — descartada.** Servir `<style>` inline por instancia paga bytes de HTML en cada una
  y obligaría a mantener una segunda forma de emisión que después habría que migrar. No se
  quiere.

Hay una tercera vía que no es esta spec y conviene no confundir con ella: para instancias N3,
que descargan JS por diseño, `adoptedStyleSheets` imperativo en `connectedCallback` está
disponible en todos los motores desde 2023 y resuelve el peso de HTML sin depender de la
propuesta. No sirve para N1/N2, que no descargan JS. Si se explora, va en SDD aparte.

---

## 8. Fuera de alcance

- **Qué CSS entra en la hoja por tag y cómo se particiona** si un componente tiene CSS
  condicional. Se decide al redactar la implementación de esta spec.
- **Interacción con el `<head>` cascade y la deduplicación** ya especificada (decisión 62).
- **CSS externo cacheable vía `modulepreload`.** Descartado por D-3; reconsiderable con datos.
- **`adoptedStyleSheets` imperativo en `connectedCallback` para N3** (§7). SDD aparte si se
  aborda.
- **Alternativas hermanas** que el explainer padre lista como descartadas (`@sheet`,
  `adoptStyles`, `<link rel="adoptedstylesheet">`, variante basada en `id`). No se adoptan.
  Se vigilan.
- **`<style host>` y su polyfill.** Retirados del proyecto: el mecanismo, el código
  (`styles`/`StyleRegistry` de `@fudic/core`, ya borrado) y el plan de estandarización.