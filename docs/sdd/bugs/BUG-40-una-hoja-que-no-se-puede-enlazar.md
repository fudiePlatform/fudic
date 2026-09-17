# BUG-40 · Una hoja de estilos enlazada: el import que no compila, y el nombre que nadie escribe

> **Estado:** `Hecho`
> **Corrige:** [SDD-19](../SDD-19-plugin-vite.md) §4.5 (enlazado de assets) ·
> [SDD-42](../SDD-42-guia-de-estilos.md) §1.2, §4.2 ·
> [BUG-08](./BUG-08-css-verbatim.md) decisión 49 (comentarios)
> **Paquetes:** `@fudic/compiler` · `@fudic/vite`
> **Rango:** `FUD0366` (del rango de [SDD-19](../SDD-19-plugin-vite.md)) y `FUD0438` (del de
> [SDD-21](../SDD-21-layout.md)). `FUD0363` —el asset que no existe— ya decía lo único que
> hacía falta para el defecto original; los otros dos salieron de cerrarlo: un enlace de
> framework fuera del nivel superior, y el directorio público alcanzado por una ruta relativa
> (§4.2.0).
> **Descubierto por:** [SDD-42](../SDD-42-guia-de-estilos.md), al construir su evidencia. Es
> la hoja del documento —la otra mitad de §4.2— la que lo destapa.

---

## 1. Contexto y síntoma

Un layout escribe lo más ordinario que hay en la web:

```html
<link rel="stylesheet" href="../styles/tokens.css">
```

El build **muere**:

```
[MISSING_EXPORT] "default" is not exported by "src/styles/tokens.css".
  ╭─[ src/layouts/_layout.fud:2:8 ]
  2 │ import __fudic_asset_1 from "../styles/tokens.css";
```

Y si el autor esquiva el error escribiendo el sufijo con el que el bundler sí devuelve una
URL, el build pasa y la página sale **peor**: el enlace apunta a un fichero que no existe.

```
la página dice   →  /assets/tokens-BdxeT4yB.css
el disco lleva   →  /assets/tokens-BfbWXVX4.css
```

Un 404 en la única hoja del documento. La página pinta sin estilos, en producción, sin que
nada en el terminal lo mencione.

Dicho en una línea: **una aplicación no puede usar una hoja de estilos.** No es que le falte
una comodidad; es que el elemento más común del HTML no se puede escribir en un `.fud`.

### 1.1. Por qué no se había visto

Porque el enlazado de assets nunca se había ejercitado con un fichero que no se incrusta. El
único asset enlazado de `examples/basic` es un logo de trescientos bytes, y un fichero por
debajo del umbral viaja como `data:` — la misma cadena en todas las pasadas del build, así
que el defecto que sigue no tenía por dónde asomar. Y el CSS nunca se había enlazado porque
hasta [SDD-42](../SDD-42-guia-de-estilos.md) no existía una hoja de aplicación que enlazar.

Los tests del compilador afirmaban que el emit **emite el import**. Lo emite; nadie había
comprobado qué hace el bundler con él.

---

## 2. Causa raíz

Son dos defectos encadenados, y el segundo es el grave.

### 2.1. Un import pregunta qué SIGNIFICA un fichero, no dónde está

`AssetLinker` convierte una URL estática en un import y usa el binding en el `href`
([`packages/compiler/src/emit/assets.ts`](../../../packages/compiler/src/emit/assets.ts)).
La suposición es que `import x from "./cosa"` devuelve una URL. Solo es verdad para las
extensiones que el bundler **no** compila:

| lo que se enlaza | lo que devuelve el import |
|---|---|
| `./logo.svg` | la URL (o un `data:`) |
| `./theme.css` | una hoja de estilos — **sin export por defecto**, y el build cae |
| `./cosa.js` | los exports del módulo |

Tres respuestas distintas, indistinguibles en el sitio donde se decide, y solo una sirve
para un `href`.

### 2.2. El nombre de un asset es propiedad del BUILD, no de sus bytes

Este es el que no se arregla con un sufijo.

Un build de este framework no es un build: el principal empaqueta el grafo de cliente, la
pasada de enlace empaqueta lo que carga el Service Worker, y la pasada de borde empaqueta lo
que renderiza una página en Node. Las tres compilan **el mismo `.fud`**, así que las tres se
encuentran el mismo `<link>`. Si cada una le pide el nombre al bundler, cada una obtiene uno
distinto.

Comprobado dejando el fichero ya minificado a mano, byte a byte idéntico en las dos salidas:
**los nombres seguían siendo distintos**. El hash no es solo del contenido.

La URL que acaba en el HTML es la que calculó la pasada de borde —es la que pregenera la
página—; el fichero que se escribe es el del build principal. Nadie los presenta.

Es exactamente el problema que el framework ya tenía resuelto para sus propios ficheros:
`fudic-main-<id>.js` lleva un nombre **fijado**, y
[BUG-05](./BUG-05-sourcemaps-builds-anidados.md) §4.4 escribió por qué. Lo que faltaba era aplicar la misma doctrina a los ficheros que enlaza
el usuario.

### 2.3. Alcance

No es un defecto del CSS: es de **cualquier asset que no se incruste**. Una imagen de 50 KB
enlazada desde un componente tiene hoy el mismo destino — URL en la página, fichero con otro
nombre en el disco. Lo que hace que el CSS lo destape es que una hoja es siempre fichero y
nunca se incrusta.

---

## 3. Interfaz pública

### 3.1. `@fudic/compiler`

```ts
/**
 * Dónde se escribió la referencia. Un hecho sobre el FUENTE, que es lo único que el
 * compilador está en posición de afirmar: qué sea un shell lo decide el host (§4.5).
 */
export type AssetOrigin = 'head' | 'markup';

/** La URL publicada de un asset enlazado. Inyectada: el compilador no tiene filesystem. */
export type AssetUrl = (spec: string, origin: AssetOrigin) => string;

export interface EmitOptions {
  // …linkAssets, assetExists
  /** Cuando se da, el emit escribe la URL como literal y NO registra ningún import. */
  readonly assetUrl?: AssetUrl;
}
```

`AssetLinker` acepta el resolutor como tercer argumento y `AssetLinker.filePath(spec)`
—el fichero sin su `?query`— es lo que se comprueba contra el disco.

Ausente el resolutor, el emit sigue registrando el import: es lo que hace la emisión
autónoma a `.mjs`, y no cambia.

### 3.2. `@fudic/vite`

```ts
/** El registro de ficheros enlazados: sus nombres, sus bytes y de dónde salieron. */
export class LinkedAssets {
  constructor(base: string);
  /** La URL de un fichero — calculada una vez, idéntica desde cualquier pasada. */
  url(absPath: string): string;
  /** Lo que hay que publicar, con el nombre que los documentos ya llevan. */
  files(): ReadonlyMap<string, Uint8Array>;
  /** Lo que enlaza un `<head>`, como URLs, para el precacheo del worker (§4.5). */
  shell(): readonly string[];
  /** Lo que el servidor de desarrollo contesta: los mismos bytes que publicaría el build. */
  served(url: string): { readonly bytes: Uint8Array; readonly type: string } | undefined;
}
```

`transformFud` y `transformFudClient` reciben el registro como último argumento, y
`runEdgePass` y `runLinkPass` también. Opcional en las cuatro: sin él, el comportamiento es
el de antes de este BUG.

---

## 4. Comportamiento corregido

### 4.1. El nombre sale de los bytes, y lo calcula una sola función

`assets/<nombre>-<hash><ext>`, con el hash sobre el contenido **publicado**. Cualquier pasada
que resuelva el mismo fichero obtiene la misma cadena, porque la cadena no depende de quién
pregunta. Un fichero que no cambia conserva su nombre entre builds y sigue en las cachés que
lo tienen; uno que cambia estrena nombre.

### 4.2. Lo que un documento enlaza es un fichero. Siempre

> **Corrección.** Este párrafo decía que por debajo de 4096 bytes el fichero viaja como
> `data:`, copiando el umbral del bundler, con el `.css` como única excepción. Duró lo que
> tardó Pedro en mirar la salida: **el favicon del ejemplo iba en base64 dentro de cada
> página**. Las tres razones que se habían escrito para excluir el `.css` no hablaban de
> hojas de estilo en ningún momento.

Un `data:` no se revalida, no se precachea, se repite entero en cada página que lo enlaza y
muere bajo una política que no lo nombre. Eso es verdad de una hoja, de un icono y de una
imagen por igual — y basta una de las cuatro. Además base64 es un tercio más grande que los
bytes que transporta, y aterriza dentro de un documento que no se puede cachear como sí se
cachearía el fichero.

El umbral tenía sentido donde el bundler lo aplica: un asset que importa un **módulo**, donde
la alternativa es una petición por icono en una página que ya ha parseado el código que los
nombra. No lo tiene para un fichero que enlaza un **documento**. Así que no hay incrustación,
a ningún tamaño.

### 4.2.0. Las dos formas de nombrar un fichero propio, y la única diferencia entre ellas

Esta es la regla que hay que leer antes que ninguna otra, porque es la que se puede explicar
a alguien en una frase: **la diferencia es quién elige la URL.**

| se escribe | quién elige la URL | qué le pasa al fichero |
|---|---|---|
| `./logo.svg` — relativa | **el framework** | se hashea, se publica en `/assets/`, se comprueba que existe, y entra en el shell si lo enlaza un `<head>` |
| `/logo.svg` — absoluta de raíz | **quien lo escribe** | es el fichero público de ese nombre: ni se hashea ni se publica, ya está en su URL; se comprueba que existe, se le añade el `base`, y entra en el shell si lo enlaza un `<head>` |

Lo que un desarrollador sabe de un fichero es exactamente eso: si el nombre le da igual —un
icono, una imagen, una hoja— o si **tiene** que ser ese nombre porque lo pide algo que no es
su código. No se le puede pedir que sepa de antemano qué hash va a salir, y con esta regla no
hace falta: no escribe un nombre calculado en ningún sitio.

> **Lo que estaba roto.** Una URL absoluta de raíz se dejaba pasar como *«ya es una URL
> final»*, y esa frase escondía tres cosas: no se comprobaba que el fichero existiera —una
> errata era un 404 que nadie reportaba—, el build no sabía de él, así que **había que
> repetirlo a mano en el `shell` de `sw.json`** junto a nombres hasheados que nadie puede
> predecir, y no se le aplicaba el `base`, así que el mismo enlace estaba roto bajo
> `base: '/admin/'` — la forma exacta de [BUG-39](./BUG-39-el-router-no-conoce-su-base.md).

Y hay una tercera forma que **no existe**: alcanzar el directorio público por una ruta
relativa, `../../public/logo.svg`. Pide los dos esquemas a la vez y se lleva la peor mitad de
cada uno —una segunda copia, hasheada, de un fichero que ya se sirve con su nombre—. Es
`FUD0366`, error, y el mensaje dice la URL que se quería escribir.

### 4.2.1. Y lo que se enlaza es un asset, no código

Un asset es un fichero que el navegador descarga tal cual. Un `.fud` es el grafo de
componentes y un `.js` es un módulo: los compila alguien. Publicar uno como asset copia el
**fuente** a la salida y le da a la página una URL que apunta a él — que es exactamente lo que
hacía un `<link rel="component">` mal colocado (`FUD0438`, SDD-21). El enlazador los rechaza
por extensión y los deja como literales, que es la postura permisiva que ya aplica a todo lo
que no puede avalar.

### 4.3. Publica una sola pasada

Las pasadas anidadas **registran** lo que ven; el build principal escribe cada fichero una
vez, con el nombre que a todo el mundo se le dijo. Ocurre después de las pasadas de enlace y
de borde, porque un fichero que solo una de ellas alcanzó sigue siendo un fichero que los
documentos referencian.

### 4.4. Desarrollo sirve la misma URL y los mismos bytes

Un middleware sirve el registro en la misma ruta que publica el build, con los bytes ya
compactados — no una relectura del fichero de origen. Una página que funciona construida y
da 404 en desarrollo, o al revés, es la clase de diferencia que se encuentra la última.

### 4.5. Lo que enlaza un `<head>` entra en el precacheo del worker

Su nombre lo elige el build, así que `sw.json` no puede listarlo: es el mismo argumento por
el que el shell ya incluye el grafo de los dos entries.

> **Corrección.** Esto decía *«solo las hojas»*, y la razón era el tipo de fichero: la hoja
> porque su ausencia impide pintar, una imagen nunca porque *«una imagen grande o un vídeo en
> la instalación es otra decisión»*. La segunda mitad es cierta de una fotografía dentro de
> un componente y falsa de un favicon — y lo dijo el navegador: `install` precacheaba la hoja
> y no el icono, así que la página necesitaba **tres cargas** para funcionar sin red. La
> primera instala. En la segunda el icono se pide por fin a través del worker, que lo trae de
> la red y lo cachea. Solo la tercera no le debe nada a la red. Y eso es exactamente lo que
> hace una regla `cache-first`: cachea en la primera petición **que llega al worker**.

La línea no es hojas contra imágenes, es **el documento contra su contenido**. Lo que se
escribe en un `<head>` es lo que cada página necesita para renderizarse a sí misma —su hoja,
su icono—, y eso es la definición de un shell. Un `<img>` dentro de un componente o un
`url(…)` dentro de una hoja es contenido, y ahí sí la caché en tiempo de uso es la que debe
encontrarlo primero: meter cada byte enlazado en la instalación es cómo una primera visita
paga por una página que nadie ha abierto.

El compilador no sabe qué es un shell y no debe saberlo. Dice **dónde** se escribió la
referencia —`AssetOrigin`, `'head'` o `'markup'`, un hecho sobre el fuente— y el host decide
lo que eso vale.

**Un preload no.** Una hoja enlazada en la cabecera ya bloquea el render y se pide con la
prioridad más alta; un `rel="preload"` delante no adelanta nada. Lo que le faltaba era el
precacheo.

### 4.6. Un solo camino para el CSS, y los comentarios fuera

La hoja enlazada pasa por **la misma compactación** que el `<style>` de un componente. El día
que hubiera dos caminos, una de las dos salidas dejaría de minificarse en silencio, que es
literalmente el defecto que arregló [BUG-08](./BUG-08-css-verbatim.md).

Y esa compactación pasa a **tirar los comentarios**, salvo los marcados `/*!`. BUG-08 §4.3
dejó escrito que quitarlos era una segunda decisión —porque se llevaría por delante una
licencia—; se toma aquí, y la marca es lo que la hace segura: la prosa se escribe para quien
abre el fichero, la licencia tiene que llegar a quien lo descarga, y las distingue el
carácter que ya usa todo el ecosistema.

El espacio **alrededor** de un comentario se conserva: un comentario no es un separador, así
que `.a /* c */ .b` es un descendiente solo por los dos espacios, y `.a.b` es otra regla.

---

## 5. Invariantes

- **Un nombre, una función.** Ninguna pasada inventa el nombre de un fichero del usuario.
- **Publica el principal, registran las demás.** Un fichero se escribe una vez.
- **El hash es de los bytes publicados.** Lo que se sirve y lo que nombra la URL son lo mismo.
- **Desarrollo y build dicen la misma URL** y entregan los mismos bytes.
- **Un solo camino para el CSS**, compartido con el `<style>` de componente (§4.6).
- **El compilador sigue sin tocar el filesystem**: la URL llega inyectada.
- **Nada que enlace un documento se incrusta** (§4.2), y **nada que sea código se enlaza**
  (§4.2.1).
- **Cobertura.** El código nuevo nace al 100 % en las cuatro métricas.

---

## 6. Criterios de aceptación

**El nombre y la publicación** — `packages/vite/test/`

1. **(rojo primero)** Un proyecto cuyo layout enlaza `<link rel="stylesheet" href="…css">`
   construye, y la URL que lleva la página pregenerada **existe en la salida**. Antes de este
   BUG el build ni siquiera terminaba.
2. **Dos pasadas, un nombre.** La URL que la pasada de borde escribe en el HTML es la misma
   que el build principal publica. Es el criterio 1 mirado por su causa: se comprueba que el
   fichero emitido y el `href` coinciden carácter a carácter.
3. **Una imagen grande tampoco se parte.** Un asset por encima del umbral, enlazado desde un
   componente, produce una URL que existe en la salida — el defecto no era del CSS (§2.3).
4. **Lo pequeño también es un fichero.** Un `.svg` de trescientos bytes enlazado desde el
   `<head>` —un favicon— se publica con su URL y **no** aparece un solo `data:` en el
   documento (§4.2). Y lo mismo desde el `<head>` de una ruta y desde dentro de un
   componente: el mismo fichero desde tres sitios, un nombre y un fichero publicado.
5. **Una hoja tampoco**, por pequeña que sea (§4.2).
5.b. **Un `<script src>` se queda como estaba.** Un `.js` no es un asset: no se publica, no
   se incrusta y no se toca (§4.2.1). Lo mismo un `.fud`.
6. **Un fichero, una vez.** Dos rutas que enlazan la misma hoja publican **un** fichero.
7. **El hash es de los bytes.** Cambiar el contenido cambia el nombre; no cambiarlo lo
   conserva entre dos builds.

**Desarrollo**

8. El servidor de desarrollo sirve esa URL con su tipo de contenido y con **los mismos
   bytes** que publica el build (§4.4).

**El worker**

9. Lo que enlaza un `<head>` —la hoja y el favicon— aparece en el shell precacheado, de
   modo que la **segunda** carga ya funciona sin red; una imagen que solo referencia un
   componente **no** entra, y la coge la regla de tiempo de uso (§4.5).

**El CSS** — `packages/compiler/test/emit/`

10. La hoja enlazada sale minificada por la misma pasada que el `<style>` de un componente.
11. Un comentario de prosa desaparece de la salida; uno marcado `/*!` sobrevive.
12. `.a /* c */ .b` sigue siendo un selector descendiente después de compactar (§4.6).
13. **La red de SDD-42 sigue verde.** El golden de «un proyecto sin `styles`» pasa sin
    haberse editado, salvo por los comentarios que ahora no viajan.

**La evidencia**

14. `examples/basic` enlaza su hoja del documento desde los dos layouts y se ve en Chrome en
    las tres formas —desarrollo, build sin worker y build con worker— y con el polyfill
    forzado. La hoja se descarga una vez, no da 404 y sus tokens llegan tanto al markup de
    las rutas como al interior de los componentes.

**Cobertura**

15. El código nuevo de `@fudic/vite` y de `@fudic/compiler` al 100 % en las cuatro métricas;
    ninguno de los dos paquetes baja de su suelo.

---

## 7. Fuera de alcance

- **`rel="preload"`.** §4.5: para una hoja de la cabecera no adelanta nada. Cuando exista una
  hoja que se descubra tarde —una que cargue un componente en tiempo de ejecución— la
  pregunta vuelve, y entonces es otra spec.
- **Minificar lo que no es CSS.** Un `.svg` o un `.json` enlazados se copian tal cual. Tienen
  minificadores propios y ninguno es del framework.
- **Caché en tiempo de uso de imágenes y vídeo.** §4.5 precachea hojas y nada más; qué hace el
  worker con lo demás es de [SDD-20](../SDD-20-render-sw.md) y no se toca aquí.
- **`srcset`.** Sigue siendo el seguimiento documentado de SDD-19 §4.5: una lista de URLs con
  descriptores no es una URL, y este BUG no la convierte en una.
- **`@import` dentro de la hoja.** [SDD-42](../SDD-42-guia-de-estilos.md) §7 ya lo dejó
  fuera, y un fichero copiado tampoco lo resuelve.
