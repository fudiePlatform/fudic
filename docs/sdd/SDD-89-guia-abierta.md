# SDD-89 — La guía abierta: la marca en el proyecto, piezas que se extraen y la guía en línea

> **Estado:** `Borrador`.
> **Paquetes:** `@fudic/guide` · `@fudic/config` · `@fudic/compiler` · `@fudic/vite` ·
> `@fudic/cli` · `@fudic/language-server` · `@fudic/diagnostics` · documentación y tutoriales
> **Depende de:** 42 (la hoja del proyecto adoptada), 43 (librerías y la cadena de dependencias),
> 49 (la poda por página y el aplanado de `@import`), 73 (`css: "link"`), 79 (la guía generada),
> 84 (las cabeceras y el nonce), 88 (toda página tiene layout) — todas en `Hecho`. Y el cambio de
> la CLI del 2026-11-27 (`aa016d77`): las apps dependen de `@fudic/guide` en vez de copiar una guía.
> **Enmienda:** SDD-79 §4.7 (el favicon sale de la guía), §4.11 (la fuente sale de la guía) y
> §4.12 (`g guide`).
> **Rango de diagnósticos:** `FUD1590`–`FUD1599` (nuevo).
> **Decisiones de gramática:** ninguna nueva. Cierra la parte de `href` del hallazgo 3: un `href`
> con nombre de paquete en un `<link>` del `<head>`.
> **Origen:** conversación con Pedro del 2026-11-27.
> **Cierra:** hallazgos 3 (`href` de paquete en un `<link>`), 4 (precargar la fuente de la guía) y
> 108 (la guía en línea y el favicon), de `docs/web/hallazgos-fudic.md`.
>
> **Qué añade en una frase.** La fuente y el favicon dejan de vivir dentro de `@fudic/guide` y
> pasan a una carpeta del proyecto que el layout enlaza; una pieza de la guía (`input.css`,
> `tokens.css`, `guide.css`…) se puede extraer al proyecto con la CLI y la extraída gana a la del
> paquete con el mismo nombre; y el layout decide con un marcador si la guía va enlazada o en línea.

## 1. Contexto y objetivo

### 1.1. Lo que hay hoy

- **`@fudic/guide` es una caja negra.** Desde el 2026-11-27, toda app que crea la CLI depende de
  `@fudic/guide`, la guía de fudic.dev. La fuente (Inter Tight, 23 KB) y el favicon (`logo.svg`)
  viven en `node_modules`. El HTML pide `/assets/inter-tight-wght-400-600-<hash>.woff2` y un
  favicon que no aparecen en ningún sitio del proyecto.
- **El favicon solo puede venir de la guía.** Es `guide.icon` (SDD-79 §4.7). Una app que use
  `@fudic/guide` lleva el logo de Fudic. Hoy la única salida es un `<link rel="icon">` escrito en el
  `<head>` (que manda, §4.7), sin que la CLI lo diga.
- **Cambiar una pieza obliga a copiar la guía entera.** `fudic g guide` copia las 46 hojas, la
  fuente y el favicon, y el proyecto deja de recibir las mejoras de `@fudic/guide`. Quien solo
  quiere otro `input.css` u otros colores se queda con todo.
- **Dos guías en la misma cadena chocan.** Sus piezas tienen los mismos nombres y la segunda se
  descarta con `FUD0741` (`packages/vite/src/styles.ts`). Por eso `g guide` y `fudic add <guía>`
  quitan la dependencia de `@fudic/guide`.
- **Un `href` con nombre de paquete no se puede escribir en un `<link>`.** `@fudic/…` se lee como
  expresión (`FUD0620` en el prerender) y `@@fudic/…` sale literal (hallazgo 3). La web precarga su
  fuente con `../../../../../packages/guide/fonts/…`, cruzando paquetes por disco. Y un `href`
  relativo que no existe sale tal cual, sin aviso.
- **La guía siempre va enlazada.** Con `css: "inline"` (el valor por defecto), los componentes van
  en `<style type="module">`, pero la guía y las hojas del layout van en `<link>`. La guía se poda
  por página: el build de fudic.dev tiene 19 `guide-*.css` distintos, así que enlazarla no aporta
  caché compartida, solo una petición más en el camino crítico y riesgo de FOUC.

### 1.2. Lo que decidió la conversación

- La fuente y el favicon son la **marca** del proyecto, no de la guía. Se ven y se cambian en una
  carpeta del proyecto.
- En un workspace, la marca es de todo el workspace, y una app puede tener la suya.
- La guía se puede abrir **por piezas**: listar las piezas y extraer las que se quieran cambiar,
  incluidas `guide.css` y `tokens.css`. El resto sigue viniendo de `@fudic/guide`.
- La guía va en línea si el layout lo pide: cada página tiene su hoja, y con el `304` de las páginas
  estáticas (hallazgo 107) una página que no cambió tampoco vuelve a bajar su CSS.
- El favicon sigue siendo un fichero: es el mismo en todas las páginas y se aprovecha de la caché.

### 1.3. El objetivo

Que `@fudic/guide` sea un punto de partida que se ve y se abre por partes, no una caja negra: la
marca está en el proyecto, cualquier pieza se puede hacer propia sin perder las demás, y el layout
decide cómo llega la guía a la página.

## 2. Dependencias

- **SDD-79.** Qué es una guía (`guide.sheet`), qué es una pieza (§4.3: un import directo y relativo
  de `guide.sheet`), la cadena de guías (§4.2) y las comprobaciones de choque (`FUD0741`).
- **SDD-43.** `dependencyChain`: la cadena de paquetes de una entrada, raíz primero.
- **SDD-49.** El aplanado de `@import`, la poda por página y la entrega como `<link>` o `<style>`.
- **SDD-84.** El nonce de los `<style>` y `<script>` que escribe el emit.
- **SDD-88.** Toda página tiene layout: el marcador de la guía siempre tiene dónde estar.
- **`fudic:runtime`** (BUG-31): el marcador del runtime en el layout, con su variante `?inline`.
  Es el modelo del marcador de la guía.

## 3. Interfaz pública

### 3.1. `@fudic/guide` sin marca

- Fuera `fonts/` y `logo.svg`. `tokens.css` deja de declarar los `@font-face`.
- `--guide-font-sans` sigue nombrando `"Inter Tight", "Inter Tight Fallback"` y termina en la fuente
  del sistema. Sin la marca, la página se ve con la fuente del sistema.
- Su `fudic.json` deja de tener `guide.icon`.

### 3.2. La marca del proyecto

`fudic new` escribe, en una app suelta:

```
src/brand/
  favicon.svg
  fonts.css                          los dos @font-face: Inter Tight y su fallback métrico
  fonts/inter-tight-wght-400-600.woff2
  fonts/OFL-InterTight.txt
```

y el layout los enlaza con rutas relativas, que el build ya reescribe al asset con hash:

```html
<head>
  <link rel="icon" href="../brand/favicon.svg">
  <link rel="preload" href="../brand/fonts/inter-tight-wght-400-600.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="../brand/fonts.css">
  <link rel="stylesheet" href="fudic:guide?inline">
  @RenderHead()
</head>
```

- Quitar la fuente es borrar `src/brand/fonts/`, `fonts.css` y sus dos líneas. Cambiar el favicon es
  cambiar el fichero.
- En un workspace (`fudic new --workspace`), la marca es la librería `libs/brand` (`@<scope>/brand`),
  y los layouts que crea la CLI la enlazan por nombre de paquete
  (`href="@<scope>/brand/favicon.svg"`, §3.3). Una app que quiera otra marca enlaza la suya en su
  layout: el layout decide.

### 3.3. Un `href` con nombre de paquete en un `<link>`

En cualquier `<link>` del `<head>` de un layout, una ruta o un componente, un `href` que empieza por
`@scope/paquete/` o por un nombre de paquete sin scope que la cadena declara se resuelve por los
`exports` de ese paquete, igual que ya se hace con `rel="layout"`, `"snippet"` y `"component"`.

- En un atributo, `@` seguido de un nombre de paquete de la cadena **no** abre una expresión.
- `@@` en un atributo produce `@` (la otra mitad del hallazgo 3).
- Un `href` relativo o de paquete que no lleva a ningún fichero es `FUD1590` (error), en vez de
  salir tal cual.

### 3.4. Piezas extraídas

```jsonc
// fudic.json de una app o una librería
{
  "guide": { "pieces": "src/guide" }
}
```

```ts
// @fudic/config
export interface GuideConfig {
  /** The guide's entry sheet: a whole guide of its own. */
  readonly sheet?: string;
  /** A folder of pieces that replace, by file name, those of the guide of the chain. */
  readonly pieces?: string;
  /** The favicon. Kept for guides that still declare one; @fudic/guide does not. */
  readonly icon?: string;
}
```

- `sheet` y `pieces` se excluyen: uno de los dos (`FUD0725` si están los dos o ninguno).
- Un fichero `<nombre>.css` de la carpeta `pieces` sustituye, entero, al fichero con el mismo
  nombre de la guía de la cadena: una pieza (`input.css`), `tokens.css`, `document.css`, `base.css`
  o el propio `guide.css`.
- Un `guide.css` extraído es la lista de piezas: quitar un `@import` quita la pieza, y añadir un
  `@import "./mi-pieza.css"` añade una nueva, que vive en la misma carpeta.
- Un fichero de la carpeta que no sustituye nada (ni lo importa un `guide.css` extraído) es
  `FUD1591` (aviso).

### 3.5. El marcador de la guía

`<link rel="stylesheet" href="fudic:guide">` en el `<head>` de un layout marca dónde va la guía:

- `fudic:guide`: enlazada, como hoy.
- `fudic:guide?inline`: en un `<style>` con el nonce de la página.
- Sin marcador: como hoy, enlazada y antes de las hojas del layout.
- Dos marcadores en un mismo documento son `FUD1592` (error).

### 3.6. La CLI

| Comando | Qué hace |
|---|---|
| `fudic new` | Escribe `src/brand/` y un layout con la marca y `fudic:guide?inline` |
| `fudic new --workspace` | Escribe `libs/brand`; cada app y librería depende de `@fudic/guide` |
| `fudic guide list` | Lista las piezas de la guía del proyecto: nombre, elementos que pinta y de dónde sale (`@fudic/guide`, una librería o el propio proyecto) |
| `fudic guide eject <pieza…>` | Copia esas piezas a la carpeta `pieces` del proyecto y añade `guide.pieces` a su `fudic.json` si falta. Acepta `guide`, `tokens`, `document` y `base` |
| `fudic guide eject --all` | Todas: el proyecto ya no necesita `@fudic/guide`, y la CLI lo dice |
| `fudic g guide` | Se queda como alias de `fudic guide eject --all` |

- En un workspace, `eject` va por defecto a la librería que tiene `guide.pieces`, y la crea
  (`libs/guide`, de la que dependen todos los proyectos) si no hay ninguna. Con `--project <app>`,
  va a esa app.
- `eject` no toca nunca el `package.json`.

### 3.7. Los códigos

| Código | Severidad | Cuándo |
|---|---|---|
| `FUD1590` | error | Un `href` de un `<link>` (relativo o de paquete) no lleva a ningún fichero |
| `FUD1591` | aviso | Un fichero de `guide.pieces` no sustituye nada |
| `FUD1592` | error | Dos marcadores `fudic:guide` en un documento |

## 4. Comportamiento

### 4.1. Qué guía recibe una página

1. La **guía base** es la de `guide.sheet` del paquete más cercano de la cadena que la declare
   (hoy, `@fudic/guide`).
2. Cada paquete de la cadena con `guide.pieces`, del más lejano al más cercano, sustituye ficheros
   de la guía base por nombre. Gana el más cercano: la app sobre la librería, la librería sobre
   `@fudic/guide`.
3. El aplanado (SDD-49) resuelve cada `@import "./x.css"` de la guía al fichero que ganó.
4. La poda y la entrega siguen igual: una hoja por página, con los trozos adoptables que SDD-79
   §4.3 define.

Dos paquetes con `guide.sheet` en la misma cadena siguen siendo un choque (`FUD0741`). Las piezas
extraídas no chocan: sustituyen.

### 4.2. La fuente no se poda por estar en otra hoja

`fonts.css` declara la familia y la guía la nombra. La poda de `@font-face` (SDD-79 §4.11) tiene que
mirar las familias que nombra **cualquier** hoja de documento de la página, no solo la suya. Si no,
`fonts.css` se quedaría vacío.

### 4.3. El editor

- Las piezas extraídas se ven como cualquier hoja: completado de tokens, ir a la definición.
- `shadowrootadoptedstylesheets="input"` va a la pieza que ganó, y «ir a la definición» lleva a la
  extraída si la hay.
- `FUD1590`, `FUD1591` y `FUD1592` salen en el editor, no solo en el build.

### 4.4. La documentación y los tutoriales

- La documentación cuenta la marca, `fudic guide list` y `eject`, el orden «gana lo más cercano» y
  el marcador. Hay que cambiar las páginas de la guía de estilos y las de la CLI (`new`,
  `generate guide`, y una nueva para `guide`).
- Un tutorial nuevo, o el actual `style-guide` rehecho: cambiar el favicon, quitar la fuente,
  extraer `tokens.css` para cambiar los colores y `input.css` para cambiar los campos.
- Los tutoriales que nombran `src/guide/` o las fuentes (first-app, first-component, baseline,
  observatory, lighthouse, workspace) se rehacen después de esto, una sola vez.

## 5. Invariantes

- Una página recibe **una** guía: la base con sus sustituciones. Nunca dos.
- Un fichero extraído sustituye entero; nunca se mezclan reglas de dos ficheros.
- Las piezas que no se extrajeron se siguen actualizando con `@fudic/guide`.
- La CLI nunca escribe un `href` que cruce paquetes por disco: o relativo dentro del paquete, o por
  nombre de paquete.
- Una app sin marcador ni piezas emite lo mismo que antes de este SDD, salvo la marca, que ahora
  enlaza su layout.

## 6. Criterios de aceptación

1. `@fudic/guide` no tiene `fonts/`, `logo.svg` ni `@font-face`, y su `fudic.json` no tiene `icon`.
2. `fudic new my-app` deja `src/brand/` con el favicon, `fonts.css`, la fuente y su licencia, y el
   layout los enlaza con rutas relativas.
3. El build de esa app publica el favicon y la fuente con hash; la precarga y el `url()` de
   `fonts.css` apuntan al mismo fichero.
4. Borrando `src/brand/fonts/`, `fonts.css` y sus dos líneas, la app construye sin avisos y se ve
   con la fuente del sistema.
5. `fudic new shop --workspace --app web` deja `libs/brand`, y el layout de `web` la enlaza por
   nombre de paquete.
6. Una app de ese workspace que enlaza su propio favicon en su layout lo publica en vez del de
   `libs/brand`.
7. `<link rel="preload" href="@fudic/guide/…">` (o cualquier paquete de la cadena) se resuelve; un
   `href` que no lleva a ningún fichero da `FUD1590`; `@@` en un atributo sale como `@`.
8. `fudic guide list` en una app nueva lista las piezas de `@fudic/guide` con su origen.
9. `fudic guide eject input tokens` copia `input.css` y `tokens.css` a `src/guide/` y añade
   `"guide": { "pieces": "src/guide" }`. Cambiando un color de `tokens.css` y el `border` de
   `input.css`, la página y un componente que adopta `input` cambian; `button` sigue saliendo de
   `@fudic/guide`.
10. `fudic guide eject guide` y un `@import "./tag.css"` nuevo en ese `guide.css` dan una pieza
    `tag` que un componente puede adoptar.
11. Un fichero de `src/guide/` que no sustituye nada da `FUD1591`.
12. En un workspace, `fudic guide eject input` va a `libs/guide`; con `--project web`, a la app; la
    pieza de la app gana a la de la librería.
13. `fudic guide eject --all` deja una guía completa en el proyecto, y la página es idéntica a la
    de antes del `eject`.
14. `fudic:guide?inline` en el layout pone la guía en un `<style>` con el nonce; `fudic:guide` la
    enlaza; sin marcador, sale como hoy. Dos marcadores dan `FUD1592`.
15. fudic.dev se construye con `@fudic/guide`, su marca en `web/libs/ui` (o `libs/brand`) y la guía
    en línea, sin enlaces que crucen paquetes por disco.
16. `pnpm typecheck`, `pnpm test` y la cobertura de cada paquete tocado, en sus umbrales.

## 7. Fuera de alcance

- El `304` de las páginas estáticas (hallazgo 107) y la compresión (hallazgo 1): la guía en línea
  funciona sin ellos, y los dos van aparte.
- Mezclar reglas de una pieza extraída con la del paquete.
- Avisar de que una pieza extraída se ha quedado atrás respecto a una versión nueva de
  `@fudic/guide`.
- `fudic new --lib`, una librería sin workspace (CLI-34).
- Recortar la fuente desde la CLI (CLI-23): `@fudic/guide` ya trae la fuente recortada.

## 8. Decisiones

### 8.1. Abiertas, para Pedro

1. **Los comandos.** `fudic guide list` / `fudic guide eject` como sustantivo nuevo, o todo bajo
   `fudic g guide [pieza…]` con `--list`. Propuesta: el sustantivo, con `g guide` como alias.
2. **El nombre de la carpeta de marca.** `src/brand/` y `libs/brand`, o `src/assets/`. Propuesta:
   `brand`, porque dice qué hay dentro.
3. **El valor por defecto del layout nuevo.** `fudic:guide?inline` o `fudic:guide`. Propuesta: en
   línea.
4. **`guide.icon`.** Mantenerlo para guías que lo declaren, o quitarlo. Propuesta: mantenerlo,
   porque no estorba.
5. **El intercambio de dependencias de `aa016d77`.** Con piezas que sustituyen, `g guide` y
   `fudic add <guía>` ya no necesitan quitar `@fudic/guide`. Propuesta: quitar ese intercambio, y
   que `eject --all` solo diga que la dependencia sobra.
