# SDD-18 — Estilos compartidos en DSD (`shadowrootadoptedstylesheets` + polyfill)

> **Estado:** `Pendiente` — **no bloquea v1**. El emit v1 sirve `<style>` inline en cada
> shadow (SDD-15 §4.8); esta spec es la evolución de esa única función del emit.
> **Paquete:** emit del compilador (`@fudic/compiler`) + polyfill de página.
> **Depende de:** SDD-15 (emit de página: comparte la pasada que resuelve la composición
> completa y asigna `data-id`).
> **Rango de diagnósticos:** `FUD0340`–`FUD0359` (reservado, vacío).
>
> **Refunde, sin pérdida, `docs/reviews/NOTA-estilos-compartidos-dsd.md`** (ya eliminada).
> **Verificado contra:** explainers de MSEdge y estado del origin trial a julio de 2026.

---

## 1. Contexto: qué estaba mal

El plan anterior del proyecto era `<style host="tag">`: una hoja por componente elevada al
`<head>`, más un polyfill propio que la adoptaba en cada shadow root por tag, más un plan de
llevar la idea a WICG como propuesta nueva. Se sostenía sobre esta afirmación, escrita en el
resumen técnico:

> «El puente declarativo obvio no existe y nadie lo ha propuesto.»

**Es falsa.** La propuesta existe, está activa, tiene explainers formales, review del TAG,
sesión dedicada en TPAC 2024 y **origin trial en Chrome/Edge 148**. La afirmación se dio por
buena sin verificar y sobre ella se construyó todo el diseño.

**Consecuencia:** `<style host>` era una invención paralela a un estándar en curso. Se
abandona — el mecanismo, el polyfill y el plan de estandarización. Lo que queda es esta spec:
alinearse con la propuesta real.

---

## 2. Qué es lo que sí existe

Dos features separables, del equipo de Edge (Kurt Catti-Schmidt, Daniel Clark, Alison Maher,
Tien Mai, Hoch Hochkeppel):

| # | Feature | Qué hace | Estado |
|---|---|---|---|
| 1 | `shadowrootadoptedstylesheets` | Atributo en `<template>`: lista de specifiers separados por espacio; adopta los `CSSStyleSheet` correspondientes en el `adoptedStyleSheets` del shadow root | **Origin trial activo**, venue esperado WHATWG |
| 2 | `<style type="module" specifier="...">` | Define un CSS module inline y lo mete en el module map | **En rediseño**, retirado del origin trial en Chrome/Edge 151 |

**Documentos de referencia:**

- Explainer del atributo (el que importa): `https://microsoftedge.github.io/MSEdgeExplainers/ShadowDOMAdoptedStyleSheets/explainer.html`
- Explainer padre (contexto + alternativas descartadas): `https://microsoftedge.github.io/MSEdgeExplainers/ShadowDOM/explainer.html`
- Issue de spec: `whatwg/html#10673`
- Foro de discusión: `WICG/webcomponents#939`
- Relacionados: `WICG/webcomponents#909` (open-stylable), `w3c/csswg-drafts#10176` (adoptStyles),
  `w3c/csswg-drafts#5629` (`@sheet`), `w3c/csswg-drafts#10013` (levantar el requisito de
  constructable en `adoptedStyleSheets`)

### 2.1. El cambio de junio de 2026 — crítico

`<style type="module">` **se retira del origin trial a partir de Chrome/Edge 151** por
feedback recibido; se va a rediseñar. El workaround recomendado por los propios autores es
**import map con data URI**:

```html
<script type="importmap">
{ "imports": { "foo": "data:text/css,span{color:blue;}" } }
</script>
```

Es decir: hoy solo se puede contar con la feature #1; la #2 hay que suplirla con import map.

---

## 3. Semántica adoptada

### 3.1. Forma canónica

```html
<head>
  <script type="importmap">
  { "imports": {
      "fud:app-card": "data:text/css,%3Ahost%7Bdisplay%3Ablock%7D..."
  } }
  </script>
</head>
<body>
  <app-card data-id="0" data-fud-css="fud:app-card">
    <template shadowrootmode="open" shadowrootadoptedstylesheets="fud:app-card">
      <!-- markup SSR -->
    </template>
  </app-card>
</body>
```

### 3.2. Reglas de evaluación (del explainer; son contrato duro)

1. **Se evalúa una sola vez, al parsear el `<template>`.** No es retroactivo.
2. **El specifier debe estar en el module map ANTES** de que se parsee el `<template>` que lo
   referencia. Si no, falla y queda una hoja placeholder vacía.
3. Si el specifier resuelve a URL y no está en el module map → se lanza un fetch, con hoja
   placeholder vacía en su posición hasta que llegue. **Esto produce FOUC.**
4. Si es bare specifier sin entrada en import map → falla, placeholder vacío, sin forma de
   detectarlo ni de dar fallback.
5. El orden en el atributo es el orden en `adoptedStyleSheets`, y ese orden determina la
   cascada.
6. Solo la **primera** definición de un specifier cuenta (algoritmo de merge de import maps);
   las duplicadas se ignoran silenciosamente.

### 3.3. Reflection

El `<template>` de DSD lo consume el parser y no queda en el DOM. Se propone una propiedad
`shadowRootAdoptedStyleSheets` en `HTMLTemplateElement` para reflejar el valor de parse time.
**Es el punto de feature detection del polyfill:**

```js
document.createElement('template').shadowRootAdoptedStyleSheets !== undefined
```

---

## 4. Contrato de emit

El compilador ya conoce en compile time el mapa `tag → hoja CSS`. Eso no cambia; cambia la
forma de emisión.

- **D-1. Un specifier por hoja compartida, no por instancia.** Convención: `fud:<tag>`. El
  namespace `fud:` evita colisión con specifiers del usuario y con módulos JS (ver D-8).
- **D-2. El import map se emite en `<head>`, antes de cualquier `<template>`.** No es
  preferencia: la regla 2 de §3.2 lo exige. En streaming SSR implica que **el conjunto de
  hojas debe conocerse al emitir el `<head>`**, es decir, en la pasada única de página tras
  resolver la composición completa (SDD-15 §3.2). Si una hoja se descubriera tarde, su
  specifier no estaría en el module map y el componente saldría sin estilo.
- **D-3. Data URI, no Blob.** Los import maps son declarativos y el Blob URL requiere script.
  El CSS va URL-encoded — obligatorio: `#`, `%`, `&`, `,` tienen significado en URL, y el `#`
  de un selector de id rompe la URI si no se codifica.
- **D-4. El atributo se emite en cada instancia.** `shadowrootadoptedstylesheets="fud:app-card"`
  por cada `<template shadowrootmode>`. Deja de ser "una sola aparición": es una cadena corta
  repetida N veces. Con brotli es ruido, pero no es cero.
- **D-5. `:host` obligatorio en las hojas compartidas.** Limitación reconocida del modelo: no
  hay forma en HTML de declarar una hoja sin aplicarla al documento donde se declara. Con
  import map + data URI se evita (la data URI no aplica a nada hasta ser importada), pero la
  regla se mantiene por robustez y por compatibilidad con el futuro `<style type="module">`.
- **D-6. Nada de fetch externo desde el atributo.** Todo specifier emitido debe estar en el
  module map por import map. Un specifier que resuelva a URL externa mete FOUC y no tiene
  manejo de error. Si se quisiera CSS externo cacheable, la vía es
  `<link rel="modulepreload" as="style">` en `<head>` con `blocking="render"`, no el atributo
  a pelo.
- **D-7. Emitir el specifier también en el host, no solo en el `<template>`.** El host
  sobrevive al parser; el `<template>` no. Atributo espejo `data-fud-css="fud:<tag>"` en el
  host. Redundante con soporte nativo (~25 bytes por instancia), imprescindible sin él. Se
  elimina del emit el día que el soporte sea universal: es una línea, no un rediseño.
- **D-8. Colisión de specifiers (issue abierto en la propuesta).** Los import maps no conocen
  el tipo del módulo: un specifier usado para un módulo JS y otro para CSS crea dos entradas
  y solo la primera se mapea. **Por eso el prefijo `fud:` de D-1 no es cosmético:** separa el
  namespace de hojas del de chunks de componente, que ya se emiten como módulos JS
  (`fud-chunks`, SDD-15 §3.6).

### 4.1. Coste frente a v1

| | `<style>` inline por instancia (v1, SDD-15 §4.8) | `shadowrootadoptedstylesheets` |
|---|---|---|
| Bytes de CSS en HTML | N copias | 1 copia (en el import map) |
| Bytes por instancia | CSS completo | ~40 bytes de atributo |
| Parse de CSS | 1 vez (el navegador dedupe hojas idénticas) | 1 vez |
| Objetos `CSSStyleSheet` | 1 compartido | 1 compartido |
| FOUC | No | No (si está en module map) |
| Requiere JS | No | No (con polyfill sí, hasta que llegue soporte) |

El ahorro real es de **bytes de HTML**, que es exactamente el dolor que motivó todo esto. El
parse y la memoria ya estaban resueltos por la deduplicación interna del navegador. Por eso
v1 puede salir con inline sin pagar nada más que bytes.

---

## 5. El polyfill

Deja de ser una invención y pasa a ser un polyfill de verdad. Cambia de forma por completo:
antes observaba custom elements por selector CSS y adoptaba hojas por tag; ahora:

1. **Feature detection:** `document.createElement('template').shadowRootAdoptedStyleSheets !== undefined`.
   Si hay soporte, el polyfill no hace nada.
2. **Sin soporte:** el atributo `shadowrootadoptedstylesheets` vive en un `<template>` que el
   parser ya consumió, así que **no es legible del DOM**. Esa es la dificultad central, y se
   resuelve en el emit (D-7), no en el cliente.
3. **Rutina:** recorrer `[data-fud-css]`, resolver cada specifier contra un registro (poblado
   leyendo las entradas del import map o un mapa emitido por el compilador), construir el
   `CSSStyleSheet` **una vez por specifier** (cacheado en un `Map`), y asignar
   `shadowRoot.adoptedStyleSheets`. Debe correr también sobre instancias creadas después: el
   controlador padre crea instancias en runtime al mutar un array (el punto `c()` de
   SDD-15 §4.3).
4. **Restricción heredada:** `adoptedStyleSheets` solo acepta hojas construidas
   (`new CSSStyleSheet()`); asignar `styleEl.sheet` lanza `NotAllowedError`. Puede cambiar si
   prospera `csswg-drafts#10013`, que levantaría la restricción — vigilar.

---

## 6. Qué verificar antes de implementar

1. **Estado del origin trial** en ese momento (`chromestatus.com/feature/4790543041298432`).
   Si el atributo ya está shipped en algún motor, el polyfill pasa de «siempre» a «fallback».
2. **Si `<style type="module">` volvió del rediseño.** Si volvió con otra forma, D-3 (import
   map + data URI) puede quedar obsoleto y convenir migrar. Mientras tanto, import map es lo
   recomendado por los propios autores.
3. **Nombre del atributo y de la propiedad de reflection.** Verificados a julio de 2026 como
   `shadowrootadoptedstylesheets` y `shadowRootAdoptedStyleSheets`, pero están en flujo.
4. **`csswg-drafts#10013`.** Si prospera, simplifica el polyfill.

---

## 7. Participación en el estándar

**Se cancela** el plan de presentar `<style host>` en WICG. Llegaría como duplicado de
`whatwg/html#10673` / `WICG/webcomponents#939` y se cerraría apuntando a ellos.

**Sustituto viable, y probablemente mejor:** participar en los hilos existentes aportando lo
que casi nadie en esa discusión tiene — **un SSR real con DSD, en producción, con métricas**.
El explainer padre dedica una sección entera a «Streaming SSR» y reconoce que es el caso más
castigado. Hay issues abiertos donde una implementación real tiene algo que decir:

- Detección de fallo de fetch desde `shadowrootadoptedstylesheets` (sin mecanismo hoy).
- Comportamiento con `Document.parseHTMLUnsafe` y cruce de documentos.
- El rediseño en curso de `<style type="module">` — es *el* momento de opinar, está abierto.
- Reflection en `HTMLTemplateElement` (nos afecta directamente por D-7).

Aportar un caso de uso documentado con números en un hilo activo pesa más en el proceso que
un explainer nuevo, y sigue sirviendo al objetivo de exposición pública.

---

## 8. Fuera de alcance

- **Qué CSS entra en la hoja por tag y cómo se particiona** si un componente tiene CSS
  condicional. Se decide al redactar la implementación de esta spec.
- **Interacción con el `<head>` cascade y la deduplicación** ya especificada (decisión 62).
- **CSS externo cacheable vía `modulepreload`.** Descartado por D-6; reconsiderable con datos.
- **`@sheet`, open-stylable shadow roots, `adoptStyles`:** propuestas hermanas que compiten
  por el mismo espacio. No se adoptan. Se vigilan.
- **`<style host>` y su polyfill.** Retirados del proyecto: el mecanismo, el código
  (`styles`/`StyleRegistry` de `@fudic/core`, ya borrado) y el plan de estandarización.
