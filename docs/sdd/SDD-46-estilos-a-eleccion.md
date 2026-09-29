# SDD-46 — Estilos a elección: `globalStyles` para todos, `styles` para quien los pida

> **Estado:** `En curso` — implementado y verificado en navegador; faltan los tests y la
> cobertura (fase 7 del [Task](./SDD-46-Task.md)).
> **Paquetes:** `@fudic/config` (los dos mapas) · `@fudic/compiler` (el atributo del template,
> `FUD0745`) · `@fudic/vite` (la lista por componente, `FUD0744`) · `@fudic/language-server`
> (autocompletado y subrayado) · `@fudic/cli` (la forma nueva) · `@fudic/example-basic` y
> `examples/workspace` (la migración y la evidencia)
> **Depende de:** 18, 41, 42, 43
> **Rango de diagnósticos:** el reservado de SDD-42, `FUD0744`–`FUD0759`
> **Naturaleza:** configuración + emit + editor. No toca el parser, ni el runtime, ni el
> polyfill.
>
> Hoy todo lo que lista `styles` en `fudic.json` entra en **todos** los componentes, y el
> desarrollador no puede elegir. Este SDD separa lo que es de todos de lo que un componente
> pide, y le da nombre a cada hoja.

---

## 1. Contexto y objetivo

### 1.1. Lo que hay hoy

[SDD-42](./SDD-42-guia-de-estilos.md) añadió `styles: string[]` a `fudic.json`. Cada hoja se
sube una vez al `<head>` como `<style type="module" specifier="_<basename>">` y se antepone a la
lista adoptada de **cada** componente del proyecto. [SDD-43](./SDD-43-librerias.md) §4.6 lo
extendió por la cadena de dependencias del paquete que define el componente.

Dos problemas:

- **No se puede elegir.** Una hoja de paneles que usan 16 de 43 componentes viaja y se adopta en
  los 43.
- **Nombres mágicos.** El especificador `_theme` se deriva del nombre del fichero: el autor no lo
  escribe en ningún sitio y aparece en el HTML.

### 1.2. El objetivo

- `globalStyles`: hojas que adoptan **todos** los componentes del proyecto (lo que hoy es
  `styles`).
- `styles`: hojas que un componente **elige**, por nombre, en el
  `shadowrootadoptedstylesheets` de su `<template>` raíz.
- En los dos, el nombre lo pone el autor y es el especificador tal cual.

El atributo `shadowrootadoptedstylesheets` está abandonado como estándar (ver
[la investigación](../polyfill/declarative-css-modules.md)). Aquí es **sintaxis de autor de
fudic**: el compilador lo lee, lo reescribe con la lista completa y lo lleva a los dos canales
que ya existen (el atributo nativo del template emitido y `data-fud-adopt` para el polyfill).

---

## 2. Dependencias

**SDD-18.** La forma emitida y el polyfill. No cambian: siguen recibiendo una lista de
especificadores separada por espacios.

**SDD-41.** El lector de `fudic.json` y su `FUD0720`.

**SDD-42.** El hoisteo de las hojas de proyecto, `ProjectStyle`, `EmitOptions.projectStyles`,
los diagnósticos `FUD0740`–`FUD0743` y el rango reservado que este SDD usa.

**SDD-43 §4.6.** La cadena del paquete que define el componente y `EmitOptions.styleChains`
(lista por tag). Este SDD solo cambia **qué hay en esa lista**.

---

## 3. Interfaz pública

### 3.1. `fudic.json`

```json
{
  "id": "basic",
  "kind": "app",
  "prefix": "app",
  "globalStyles": { "theme": "src/styles/theme.css" },
  "styles": { "panel": "src/styles/panel.css" }
}
```

| Campo | Tipo | Defecto | Qué es |
|---|---|---|---|
| `globalStyles` | `{ [name]: path }` | `{}` | Hojas que adoptan todos los componentes del proyecto, en el orden escrito. |
| `styles` | `{ [name]: path }` | `{}` | Hojas que un componente puede elegir en su template. |

El nombre casa `^[A-Za-z][A-Za-z0-9_]*$`: **sin guion**, porque un custom element siempre lo
lleva, así que un nombre de hoja nunca coincide con el especificador de la hoja propia de un
componente. La ruta es relativa a la raíz del proyecto.

### 3.2. `@fudic/config`

```ts
export interface NamedStyle { readonly name: string; readonly path: string; }

export interface ProjectConfig {
  // …id, kind, prefix
  readonly globalStyles: readonly NamedStyle[];
  readonly styles: readonly NamedStyle[];
}

export const STYLE_NAME_PATTERN: RegExp;

export interface ProjectStylesResult {
  readonly global: readonly ProjectStyleFile[];
  readonly optional: readonly ProjectStyleFile[];
  readonly diagnostics: readonly ConfigDiagnostic[];
}
export function readProjectStyles(
  root: string,
  config: Pick<ProjectConfig, 'globalStyles' | 'styles'>,
  io: ConfigIo,
): ProjectStylesResult;
```

`ProjectStyleFile.specifier` es el nombre escrito. `specifierOf` desaparece.

### 3.3. `@fudic/compiler`

```ts
export const ADOPTED_STYLESHEETS_ATTR = 'shadowrootadoptedstylesheets';
export const FUD_ADOPTED_STYLE_UNKNOWN = 'FUD0744';
export const FUD_ADOPTED_STYLE_DYNAMIC = 'FUD0745';

export interface AdoptedName { readonly name: string; readonly span: Span; }
export interface AdoptedStylesResult {
  readonly names: readonly AdoptedName[];   // orden escrito, sin repetidos
  readonly problems: readonly { code: 'FUD0745'; message: string; span: Span }[];
}
export function adoptedStylesOf(template: ElementNode | undefined): AdoptedStylesResult;
```

El compilador **no** conoce `fudic.json`: lee las palabras y dónde están. Comprobarlas contra el
proyecto es del host.

### 3.4. `@fudic/vite`

```ts
export interface ProjectStyles {
  chainFor(file: string): readonly ProjectStyle[];                 // globales de la cadena
  choosableFor(file: string): ReadonlyMap<string, ProjectStyle>;   // styles de la cadena
}
```

`StylesResult` pasa de `styles` a `global` + `optional`. `ProjectStyleChains` gana
`choosableFor`.

### 3.5. `@fudic/language-server`

`ProjectConfigs.choosableStylesFor(path): readonly string[] | null` — los nombres de `styles`
del `fudic.json` **más cercano** al fichero; `null` si no hay ninguno.

---

## 4. Comportamiento

### 4.1. La lista adoptada de un componente

En este orden, que es la cascada:

1. las `globalStyles` de la cadena del paquete que lo define, de la raíz a la hoja (SDD-43
   §4.6, sin cambios);
2. las que su template elige, en el orden en que las escribe;
3. su `<style>` propio, si lo tiene.

```html
<!-- fuente -->
<app-counter>
  <template shadowrootmode="open" shadowrootadoptedstylesheets="panel">…</template>
</app-counter>

<!-- emitido -->
<app-counter data-fud-adopt="theme panel app-counter">
  <template shadowrootmode="open" shadowrootadoptedstylesheets="theme panel app-counter">…</template>
</app-counter>
```

Un componente que no escribe el atributo adopta las globales y la suya: es lo que hacía todo
componente antes de este SDD.

### 4.2. Qué puede elegir

Un componente elige entre los `styles` de **cualquier paquete de su cadena**, igual que hereda
sus `globalStyles`. Nunca los de la app que lo consume: la regla de SDD-43 §4.6 no cambia.

Un nombre repetido en el atributo cuenta una vez. Un nombre que no existe se omite de la lista
y es `FUD0744`.

### 4.3. El hoisteo

El documento sube la unión de lo que adoptan sus componentes, en orden de aparición, una vez
cada hoja. Una hoja de `styles` que ningún componente de la página elige **no** se sube a esa
página. En `examples/basic`, `panel` aparece en 10 de 18 páginas.

### 4.4. La forma vieja

`styles` como array es `FUD0720` y deja el proyecto sin configuración, con un mensaje que dice
dónde va cada cosa. Aceptarlo con el significado nuevo cambiaría el aspecto de un proyecto sin
avisar: sus hojas dejarían de adoptarse.

### 4.5. El editor

- En un hueco del template raíz se ofrece `shadowrootadoptedstylesheets` con su ficha.
- Dentro de su valor se ofrecen los nombres de `styles` del `fudic.json` más cercano que aún no
  están escritos. Aceptar uno reemplaza solo la palabra bajo el cursor.
- Un nombre que no existe se subraya como `FUD0744` mientras se escribe.
- Se busca el `fudic.json` **más cercano**, no el de la carpeta abierta: un workspace abierto en
  su raíz tiene varios proyectos y cada componente elige de los suyos. Cambiar cualquier
  `fudic.json` invalida la búsqueda.

---

## 5. Invariantes

- **Un mecanismo.** Todo sigue siendo SDD-18: `<style type="module" specifier>` más la lista.
  El polyfill no se toca.
- **Sin nombres derivados.** El especificador es el nombre que escribe el autor.
- **Sin colisión con un tag.** Un nombre no lleva guion, así que no puede coincidir con la hoja
  propia de un componente.
- **Un nombre, una hoja.** En `globalStyles` y `styles` de un proyecto, y en toda la cadena, un
  nombre aparece una vez (`FUD0741`).
- **El compilador no abre `fudic.json`.** Lee el atributo; comprobarlo es del host.
- **Los dos canales coinciden.** El atributo del template emitido y `data-fud-adopt` llevan la
  misma lista, en servidor y en cliente.
- **Cobertura.** Código nuevo al 100 % en las cuatro métricas; ningún fichero existente por
  debajo de su suelo.

### Diagnósticos

| Código | Severidad | Qué dice |
|---|---|---|
| `FUD0720` | error | `globalStyles` o `styles` no son un objeto de `"nombre": "ruta"` (incluido el array viejo), o un nombre no casa el patrón. |
| `FUD0740` | error | Una entrada nombra un fichero que no existe o no se puede leer. |
| `FUD0741` | error | Un nombre está en los dos mapas de un proyecto, o en dos paquetes de una cadena. |
| `FUD0742` | warning | El proyecto declara hojas y no define ningún componente. |
| `FUD0743` | warning | Una hoja contiene `:root`, `html` o `body` (sin cambios; vale para las dos). |
| `FUD0744` | error | El template elige un nombre que los `styles` de su cadena no declaran. En el build y en el editor, sobre la palabra. |
| `FUD0745` | error | El valor de `shadowrootadoptedstylesheets` no es literal (lleva `@`). |
| `0746`–`0759` | | Reservados. |

---

## 6. Criterios de aceptación

**Configuración** (`packages/config/test/`)

1. Ausentes, los dos mapas son `[]`; presentes, conservan el orden escrito.
2. `styles` como array es `FUD0720`, deja `config: null` y el mensaje nombra `globalStyles`. Un
   nombre con guion y una ruta que no es string, también.
3. `readProjectStyles` devuelve `global` y `optional` con el nombre como especificador; un
   nombre en los dos mapas es `FUD0741` y gana el global; un fichero ausente es `FUD0740`.

**Compilador** (`packages/compiler/test/`)

4. `adoptedStylesOf` devuelve los nombres en orden, sin repetidos, con el span de cada palabra;
   nada si no hay atributo o no hay template.
5. `shadowrootadoptedstylesheets="@x"` en el template raíz es `FUD0745`.

**Build** (`packages/vite/test/`)

6. Un componente con `shadowrootadoptedstylesheets="panel"` en un proyecto con
   `globalStyles: {theme}` y `styles: {panel}` emite `theme panel <tag>` en el template **y** en
   `data-fud-adopt`, en servidor y en el chunk de cliente.
7. Un componente sin el atributo emite `theme <tag>`.
8. `panel` se sube **una vez** a un documento donde algún componente la elige, y **ninguna** a
   uno donde nadie la elige.
9. Un nombre que no existe es `FUD0744` sobre la palabra, y el componente se emite sin él.
10. Un componente de librería puede elegir un `styles` de un paquete de su cadena y **no** uno de
    la app que lo consume. Dos paquetes de la cadena con el mismo nombre son `FUD0741`.

**Editor** (`packages/language-server/test/`)

11. El template raíz ofrece `shadowrootadoptedstylesheets`, con su ficha.
12. Dentro del valor se ofrecen los `styles` (no los `globalStyles`) que aún no están escritos,
    y cada uno reemplaza solo la palabra bajo el cursor.
13. Un nombre desconocido se subraya como `FUD0744`.
14. Con el workspace abierto en su raíz, un componente de `examples/basic` ve los `styles` de
    `examples/basic/fudic.json`; cambiar ese fichero cambia la lista sin reiniciar.

**Evidencia**

15. `examples/basic` parte su guía en `theme` (global) y `panel` (a elección, en los 16
    componentes que usan `.panel`, `.row` o `.pie`), y se ve igual que antes en Chrome.
    `examples/workspace` migra a `globalStyles` sin cambio de aspecto. **Verificado por Pedro en
    navegador.**
16. **Cobertura.** Los ficheros nuevos al 100 % en las cuatro métricas; ninguno existente por
    debajo de su suelo en `main`.

---

## 7. Fuera de alcance

- **Elegir con Razor.** La lista se decide al compilar (`FUD0745`).
- **Quitar una global a un componente.** Un componente no puede renunciar a una `globalStyles`;
  si alguno la necesita fuera, es una `styles`.
- **Una hoja elegida por un componente creado solo en el cliente, en una página donde nadie más
  la elige.** Su hoja no se ha subido a ese documento. Es el mismo caso que ya existe con las
  cadenas de librerías y queda para cuando se replantee la entrega de hojas.
- **`@sheet` y el `<link>` del estándar.** Es la dirección a medio plazo, recogida en
  [la investigación](../polyfill/declarative-css-modules.md), y es otra spec.
