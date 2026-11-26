# Vienes de React, Angular, Vue o Web Components

Plan para una parte de la web dirigida a quien llega desde los tres frameworks dominantes o
desde los Web Components.
**Pendiente**: se aborda cuando Docs, MCP y Tutoriales estén cerrados.

## 1. Alcance

- **React, Angular y Vue**, por adopción. Svelte, Solid, Qwik y el resto se quedan fuera: con
  poca adopción no compensa, y la lista no tendría fin.
- **Web Components (nativos y Lit)**, no por adopción, sino porque es el público más cercano a
  Fudic: ya creen en el estándar. Es un gancho distinto al de los otros tres (§4.4).

## 2. Dónde va: en Docs

Un grupo dentro de la Documentación, junto a *Primeros pasos*. Ni cuarta sección ni Tutoriales.

- **No es una cuarta sección.** Docs explica cómo es Fudic, Tutoriales enseña a hacer cosas y
  MCP es la herramienta. «Vienes de React» no es un tipo de contenido nuevo, sino otra puerta de
  entrada al mismo manual. Un cuarto botón en la barra pesa más de lo que aporta.
- **No es un tutorial.** Un tutorial es una tarea paso a paso, ejecutada, con su solución en
  `tutorials/<slug>/`. Esto es una traducción de conceptos: se lee en cinco minutos y se vuelve a
  consultar («¿cómo era el Context aquí?»). Es consulta, y la consulta vive en Docs.
- **Todos sus enlaces van a capítulos de Docs.** En Tutoriales sería una página que manda todo el
  rato a otra sección.

### URLs y accesos

- `/docs/coming-from` (portada que reparte), `/docs/coming-from/react`,
  `/docs/coming-from/angular`, `/docs/coming-from/vue`, `/docs/coming-from/web-components`. Cada una tiene peso SEO propio: «React to
  X» es lo que busca quien está evaluando un framework.
- Una línea en la home: «¿Vienes de React, Angular o Vue?».
- Otra al final de *Primeros pasos*, que es justo cuando el lector se pregunta «¿y esto cómo se
  hace en lo mío?».

### Sin repetir el manual

Los capítulos ya comparan con React, Angular y Vue (reactividad, DI, formularios, i18n…). Estas
páginas **no vuelven a explicarlo**: son un mapa que enlaza al capítulo. Misma regla que en el MCP:
cada idea, en una sola página.

## 3. Qué lleva cada página

1. **Tabla de equivalencias** (lo central): concepto en tu framework → cómo se hace en Fudic →
   enlace al capítulo.
2. **Lo que hay que desaprender**: las dos o tres ideas sin equivalente. Por ejemplo, que el HTML
   llega pintado desde el servidor y no hace falta hidratar la página entera, o que el encapsulado
   de estilos lo da el estándar (shadow DOM) y no el framework.
3. **El mismo componente en los dos**, lado a lado y pequeño.
4. **Cuándo no elegir Fudic.** Da más confianza que cualquier tabla.

Versiones actuales citadas con fecha («a noviembre de 2026»), solo APIs estables y sin opinar
sobre los otros frameworks.

## 4. Qué se cita (borrador)

Mapa hecho de memoria: **cada fila se comprueba contra el capítulo real** al escribirlo.

### React (19)

| React | Fudic |
|---|---|
| JSX | Sintaxis `@` (*template-syntax*) |
| Componente función | `.fud` con su tag y DSD |
| `useState` / `useEffect` | *reactivity* |
| Context | *di/providers* |
| Suspense | `@await` |
| Server Components / Next.js | `@server` / `@client`, *server* |
| React Router / rutas de Next | *routing* |
| CSS Modules / CSS-in-JS | *styles* |
| react-hook-form | *forms* (validación nativa, form-associated) |
| react-intl | *i18n* |
| React Testing Library / Jest | `fudic test` (*testing*) |

### Angular (20+): el más parecido

| Angular | Fudic |
|---|---|
| Control flow `@if` / `@for` (17+) | `@if` / `@foreach`: el mejor gancho, casi la misma sintaxis |
| DI con providers | *di*: la equivalencia más directa de todas |
| `ViewEncapsulation.ShadowDom` | Lo de serie |
| Signals | *reactivity* |
| `ng generate` | `fudic generate` (*cli*) |
| Reactive forms | *forms* |
| `@angular/localize` | *i18n* |
| SSR + hydration | *reactivity/hydration* |

### Vue (3.5)

| Vue | Fudic |
|---|---|
| SFC `.vue` | `.fud`: la analogía más natural, componente de fichero único |
| `v-if` / `v-for` | `@if` / `@foreach` |
| `<style scoped>` | Shadow DOM real, no atributos generados (*styles*) |
| `ref` / `reactive` | *reactivity* |
| `provide` / `inject` | *di* |
| Nuxt | *server* + *routing* |
| Vite | El mismo Vite (*vite*): punto de partida común |

### Web Components: nativos y Lit

Una sola página con dos columnas, porque Lit es una capa fina sobre lo nativo. El gancho cambia:
con React, Angular y Vue se traducen conceptos; aquí **no hay nada que traducir, porque la salida
de Fudic es el mismo estándar que ya usas**. El mensaje es «lo que hoy escribes a mano, Fudic lo
escribe por ti». La sección «Lo que hay que desaprender» se convierte en «Lo que dejas de
escribir».

| Nativo | Lit | Fudic |
|---|---|---|
| `customElements.define` + clase | `LitElement` + `@customElement` | `.fud` con su tag (decisión 75) |
| `attachShadow` / `<template shadowrootmode>` a mano | `render()` en cliente | DSD generado, HTML pintado sin JS (nivel 1) |
| `innerHTML` / clonar `<template>` | `` html`…` `` (tagged templates) | Sintaxis `@` (*template-syntax*) |
| `observedAttributes` + `attributeChangedCallback` | `@property` / `@state` | *reactivity* |
| `adoptedStyleSheets` / `<style>` en el shadow root | `static styles` + `css` | *styles* (un `<style>` con scope) |
| Eventos del DOM | `@lit/context` | *di* |
| `ElementInternals` | Igual, a mano | *forms/form-associated* |
| Promesas a mano | `@lit/task` | `@await` |
| Sin SSR | `@lit-labs/ssr` | *server*, con DSD de serie |
| — | `@lit/localize` | *i18n* |

Por comprobar al escribirla: el estado actual de `@lit-labs/ssr` (sin opinar sobre él) y si los
componentes de Fudic conviven en la misma página con componentes Lit o nativos. Si conviven, es
un argumento fuerte: se adopta Fudic poco a poco, sin reescribir nada.

## 5. Orden

1. **Angular primero**: tiene las equivalencias más limpias (control flow y DI) y sirve de
   plantilla para el resto.
2. **Web Components**: es corta y es el gancho más alineado con la idea de Fudic.
3. React y Vue.

## 6. Complemento en Tutoriales (más adelante)

Un tutorial por framework del tipo «Rehaz este componente de React en Fudic»: un componente real
(un buscador con filtro, por ejemplo) portado paso a paso, con su solución ejecutable. Docs da el
mapa y el tutorial lo practica, y cada uno enlaza al otro. Solo si se pide: los tutoriales están
en pausa.
