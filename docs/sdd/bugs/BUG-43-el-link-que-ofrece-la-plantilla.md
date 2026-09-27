# BUG-43 · Un `<link>` se escribe a ciegas: su `href` ofrece los nombres de la plantilla, su `rel` no ofrece `component`/`layout`/`snippet`, y en un monorepo las rutas saltan a la app de al lado

> **Estado:** `Hecho` — redactado al cerrar, por indicación de Pedro: el BUG no existe hasta que
> está terminado. Implementado el 2026-09-27.
> **Corrige:** [SDD-24](../SDD-24-language-server.md) §4.2 (completado de `href`) ·
> [SDD-28](../SDD-28-snippets.md) (catálogo de snippets) · [SDD-43](../SDD-43-librerias.md) §4.3–§4.4
> (el editor no escribía el `href` que resuelve una librería)
> **Paquetes:** `@fudic/language-server` · `@fudic/resolve` · `fudic-vscode` (README)
> **Rango:** ninguno — no hay diagnóstico nuevo

---

## 1. Síntoma

Escribiendo `<link rel="stylesheet" href="..">` en `examples/basic/src/routes/delegacion.fud`, el
editor ofrecía **`@data`** y **`@()`**: los nombres de la plantilla, en el sitio donde va una ruta.

Tres caras del mismo hueco:

1. **`href` de un `<link>` que no es de fudic** —sin `rel`, o `rel="stylesheet"`— ofrecía el
   ámbito de la plantilla. Solo el `href` de un link ya clasificado (`component`, `layout`,
   `snippet`) estaba protegido.
2. **`rel=""`** no ofrecía ninguno de los tres valores que hacen de un `<link>` uno de fudic; otra
   vez, los nombres de la plantilla.
3. **En un monorepo** (`examples/workspace`), el `href` de `rel="component"` y la etiqueta de un
   componente ofrecían los `.fud` de **todas** las apps de la carpeta —`../../../admin/…` desde
   `tienda`— y los de una librería por su ruta en disco (`../../../../libs/ui/src/ui-card.fud`) en
   vez de por su nombre de paquete (`@fudic/example-ui/ui-card.fud`). La acción rápida de `FUD0191`
   escribía el mismo `href` equivocado.

Y una petición de Pedro que sale del mismo sitio: poder insertar cada `<link>` de fudic con un
snippet de la extensión.

## 2. Causa raíz

- **§2.1.** `hrefContextAt` reconoce un `<link>` por la **estructura**, y la estructura lo
  clasifica por su `rel`. Un link sin `rel`, o con uno ajeno, no es para ella un link, así que el
  plugin de etiquetas lo trataba como el valor de un atributo cualquiera y ofrecía el ámbito.
- **§2.2.** Nadie completaba `rel`: el servicio HTML no conoce sus valores y el de fudic no lo
  miraba.
- **§2.3.** El índice ve todos los `.fud` de la carpeta abierta, y el completado los ofrecía todos
  con `relativeHref`. Eso era correcto en un proyecto suelto; en un monorepo, «estar en la carpeta»
  no es «poder enlazarlo», y una librería no se enlaza por su ruta sino por lo que publica en
  `exports` (SDD-43).

## 3. Qué cambia

### 3.1. `rel` y `href` de cualquier `<link>`

- Dentro de **cualquier** valor de un `<link>` el editor ya no ofrece nombres de la plantilla.
  En `href` de un link de fudic responde la lista de ficheros de siempre; en el de cualquier otro
  (`stylesheet`, o sin `rel`), las rutas del servicio HTML.
- **`rel`** ofrece `component`, `layout` y `snippet`, marcados `fudic`, reemplazando lo ya escrito.
  `layout` solo donde cabe: en una ruta que no nombra otro, y en un fichero que aún no ha dicho qué
  es (se estructura como componente sin tag, `isUndecided`). Nunca en un componente, una página o
  un layout (decisión 81, `FUD0420`).

### 3.2. Qué se puede enlazar — `WorkspaceIndex.linker`

`linker(fromFile)` es la inversa de `resolve`: para cada fichero, cómo lo escribe `fromFile`, o
nada si no puede enlazarlo.

| El destino | Se escribe |
|---|---|
| del **mismo paquete** que `fromFile` | ruta relativa (`./`, `../`), como siempre |
| de una **librería** de su cadena de dependencias (`fudic.json` con `kind: "lib"`) | el nombre que le da su `exports`: `@fudic/example-ui/ui-card.fud` |
| de una librería que **no lo exporta** | no se ofrece (sería `FUD0760`) |
| de **otro proyecto** de la carpeta, o de una librería de la que no depende | no se ofrece |

Un fichero sin `package.json` por encima comparte «paquete» con los demás que tampoco lo tienen:
un proyecto suelto se comporta exactamente como antes.

Lo usan el `href`, la etiqueta de un componente sin enlazar (que arrastra su `<link>`) y la
acción rápida de `FUD0191`. La acción, entre dos componentes con el mismo tag, elige el que se
puede enlazar.

`@fudic/resolve` gana `specifierOf(pkg, file, io)`: el especificador que exporta ese fichero —
sin `exports`, todo el paquete; con él, subrutas exactas y patrones de un `*`, con destino
cadena o mapa de condiciones—.

### 3.3. Los snippets del `<link>`

| Snippet | Escribe | Se ofrece |
|---|---|---|
| `link-component` | `<link rel="component" href="">` | nivel superior en componente y ruta; `<head>` en página y layout |
| `link-snippet` | `<link rel="snippet" href="">` | los mismos sitios |
| `link-layout` | `<link rel="layout" href="">` | nivel superior de un fichero que aún puede ser ruta |

Los tres dejan el cursor dentro del `href` y **abren la lista** al aceptarse
(`editor.action.triggerSuggest`).

Van en el catálogo del servidor y no en un JSON de snippets de la extensión, por la razón que
SDD-28 ya da: lo que vale de un snippet es dónde se ofrece, y un fichero estático lo ofrecería en
todas partes y solo en VS Code. Al usuario le llegan por la extensión igual.

## 4. Fuera de alcance

- Completar el `href` de un `rel="stylesheet"` con rutas propias: se queda con las del servicio
  HTML, que ya son rutas.
- Diagnosticar un `href` que apunta a otro proyecto de la carpeta: eso lo dice el build
  (`FUD0460` / `FUD0760`).

## 5. Criterios de aceptación

1. `<link href="|">` y `<link rel="stylesheet" href="|">` no ofrecen ningún `@…` — por LSP, con
   el carácter disparador (`completion.test.ts`).
2. `rel="|"` ofrece `component`, `layout`, `snippet` en un fichero por empezar, y
   `component`, `snippet` en una ruta con layout (`completion.test.ts`, `href.test.ts`).
3. Desde una ruta de `tienda` en un monorepo, el `href` de `rel="component"` ofrece
   `../components/tienda-card.fud` y `@acme/ui/ui-card.fud`, y nada de `admin` ni lo que la
   librería no exporta (`href.test.ts`, `workspace-index.test.ts`, `tags.test.ts`).
4. La acción de `FUD0191` enlaza el componente alcanzable y no ofrece el de otro proyecto
   (`plugin.test.ts`).
5. `link-component`, `link-snippet` y `link-layout` se ofrecen donde §3.3 dice, y no en otro
   sitio; al aceptarse abren la lista (`snippets.test.ts`, `plugin.test.ts`).
6. Contra `examples/workspace`, con el servidor real: `tienda` ve `tienda-card` y
   `@fudic/example-ui/ui-card.fud`; `admin` ve `admin-panel` y la misma librería.
7. `@fudic/language-server` y `@fudic/resolve` al 100 % en las cuatro métricas.
