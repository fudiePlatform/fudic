# BUG-26 — Al hidratar, un bloque reclama el ancla del nivel, y con ella la prosa del autor

**Estado:** `Hecho` · **Depende de** [SDD-30](../SDD-30-renders-de-bloque.md) y
[SDD-17](../SDD-17-hidratacion.md) en `Hecho` ·
**Rama:** `worktree-reactividad-evidencias` · **Tareas:**
[BUG-26-Task.md](./BUG-26-Task.md)

> **Paquetes:** `compiler`
> **Corrige:** SDD-30 §3.4 · SDD-17 §4.4 · BUG-21 §4.2
> **Rango de diagnósticos:** ninguno. La corrección no añade una regla que el autor pueda
> violar: cambia de dueño un nodo que el emit ya escribía.

---

## 1. Contexto y síntoma

En una página **servida** —no en una creada por el cliente—, el primer cambio de rama de un
`@if` deja el hueco vacío. La rama vieja se va, la nueva no llega, y **la consola no dice
nada**.

```razor
<div class="caso">
  <p class="que">@@if</p>
  @if (count() > 1) {
    <p class="salida">Hay más de uno.</p>
  } else {
    <p class="salida">Hay uno o ninguno.</p>
  }
</div>
```

Pulsa `+1`: el contador sube, el `@switch` de al lado cambia, y este panel se queda en
blanco para siempre. Recarga y el HTML del servidor vuelve a estar bien: el defecto no está
en lo que se pinta, está en la **primera repintada después de hidratar**.

Alcanza a las tres familias, y de forma distinta:

- **`@if` y `@switch`** — cada cambio de rama retira el bloque vivo, así que **el primero**
  ya rompe.
- **`@foreach` y `@for`** — sobreviven mientras quede una fila que sujete el ancla, y mueren
  en el instante en que la lista **llega a cero**: a partir de ahí la lista no puede volver.
  Es el síntoma que un usuario cuenta como «funcionaba hasta que filtré todo».

Y una segunda mitad, en la frontera de delante:

```razor
<span class="caso">a @if (n > 1) { <b>muchos</b> } else { <b>uno</b> } b</span>
```

Al cambiar de rama desaparece la `a`. No es una hipótesis: la encontró el propio test
escrito para la mitad de atrás, en cuanto se le puso un nivel en línea.

### Por qué no lo vio ninguna suite

Las dos suites que tocan esto se cruzan sin tocarse:

- `reconcile.test.ts` conduce `u` **después de `c`**, y lo dice en su cabecera: «`c`
  primero, no `h`: la equivalencia de hidratación es su propia suite».
- Las suites de equivalencia comparan el **primer pintado** y ahí paran.

Entre las dos quedaba el caso que nadie ejecutaba —**hidratar y volver a renderizar**—, que
es exactamente el estado en el que vive una página real.

---

## 2. Causa raíz

### 2.1 · Dos nodos al crear, uno al hidratar

[`markup-client.ts`](../../../packages/compiler/src/emit/markup-client.ts), `#run`: un run
de texto del cuerpo de un bloque se localiza en la pasada de adopción caminando desde el
cursor del nivel. Un run **final** no tiene elemento detrás, así que se alcanza como
`$dom.lastChild($parent)` — y se metía en el `$r` del bloque, que es la lista de nodos que
`r()` retira.

El nivel alcanza el run que va **detrás del constructo** por el mismo camino y se lo entrega
al emisor de bloques como **ancla de inserción** ([SDD-30 §3.4](../SDD-30-renders-de-bloque.md)).

En el camino de creación son **dos nodos**: cada lado fabrica el suyo con `$dom.text(...)`.
En el de hidratación son **uno**: texto adyacente a texto sobrevive al viaje por HTML como
un solo nodo, y el parser devuelve uno. Es la misma propiedad que la cabecera de este módulo
ya enuncia para explicar por qué el cursor cuenta **elementos** y no nodos — estaba escrita,
y no se había aplicado a la propiedad de los runs.

### 2.2 · `before()` sobre un huérfano no hace nada y no lanza

Retirar el bloque sacaba del árbol el nodo sobre el que el nivel ancla. La siguiente
inserción llama a `ChildNode.before()` sobre un nodo **sin padre**, y la especificación dice
que eso es un no-op silencioso: no inserta y no lanza. De ahí las dos mitades del síntoma —
nada aparece, y la consola está limpia—. Un `throw` habría convertido esto en un bug de una
tarde.

### 2.3 · La frontera de delante no es un ancla: es texto del autor

El run que **abre** el cuerpo se funde con el run que el nivel tiene delante del constructo,
y ese nodo no ancla nada. Que el bloque se lo llevara no rompía ninguna inserción: **borraba
una frase escrita fuera del constructo**. Mismo mecanismo, consecuencia distinta, y por eso
son una sola corrección y no dos.

### 2.4 · Alcance: por qué el fixture necesita `display: grid`

La colisión exige que los dos runs **lleguen a ser nodos**. Dentro de un contenedor de
bloque, [BUG-21 §4.2](./BUG-21-nodos-de-whitespace.md) prueba que el blanco de formato entre
dos hijos de bloque no pinta nada y lo poda: sin nodos no hay colisión, el nivel ancla en
`null`, hace `append`, y **el defecto no es alcanzable**. En un `grid` —que es lo que usa el
panel donde apareció— y en un nivel en línea, los dos runs se conservan.

Esto no es una curiosidad del test: es la razón de que el defecto llevara meses ahí sin que
ningún ejemplo lo destapara. Y un primer borrador del test, escrito con un `<div>` normal,
**pasaba contra el emit roto**.

---

## 3. Interfaz pública

Ninguna firma pública cambia. La corrección es interna a `ClientMarkupEmitter`: un método
privado nuevo, `#shared(run, via, level, first)`, y un parámetro `first` en `#run` que dice
si el run es el primer ítem de su nivel.

Lo que sí cambia es el **texto emitido**, y de forma acotada: desaparecen las líneas
`$r.push($nN);` de los runs estáticos de frontera en la pasada `h`. En los tres goldens son
**nueve líneas borradas y ningún otro cambio**.

---

## 4. Comportamiento corregido

**4.1 · Un run estático de frontera se adopta como referencia, no como propiedad.** El
bloque lo localiza igual que antes —lo necesita para colocarse—, pero no lo mete en `$r`, así
que `r()` no lo retira.

**4.2 · La propiedad es asimétrica entre `c` y `h`, y tiene que serlo.** Al fabricar, el
nodo lo crea el bloque y es suyo: dos nodos, dos dueños. Al adoptar, el nodo es uno y el
dueño es el nivel. La asimetría no es una excepción a la equivalencia de hidratación: es lo
que la mantiene, porque el árbol resultante es el mismo en los dos caminos.

**4.3 · Solo un run ESTÁTICO.** Un run interpolado es estado que el bloque reescribe, así
que es del bloque haga lo que haga el serializador — y además siempre tiene un marcador o un
elemento al lado por el que localizarse.

**4.4 · Las dos fronteras, con dos condiciones distintas.** La de atrás es
`$dom.lastChild($parent)`: nada del bloque va detrás, así que con lo que se fundió es el
siguiente run del nivel, el ancla. La de delante es `$dom.previousSibling($cN)` **siendo el
primer ítem del nivel**: un run interior tiene elementos del bloque a los dos lados y es
seguro.

**4.5 · Lo que cuesta.** Un nodo de texto en blanco que se queda atrás cuando un bloque se
retira **después de hidratar**. Un run estático no lleva estado, y el blanco de formato no
lo ve nadie. Lo que se compra es que el ancla del nivel no se pueda arrancar de debajo de la
siguiente inserción.

---

## 5. Invariantes

- **Un nodo tiene un dueño.** Donde dos caminos resuelven al mismo nodo, uno lo posee y el
  otro lo referencia. La regla vieja tenía dos dueños en el camino en que el nodo era uno.
- **Lo que el bloque no fabricó, el bloque no lo retira.** Es la versión operativa de la
  anterior, y la que se puede leer en el emit.
- **La equivalencia de hidratación se mide sobre el árbol, no sobre el texto emitido.** `c` y
  `h` pueden escribir cosas distintas mientras el árbol que dejan sea el mismo — y aquí lo
  distinto es precisamente lo que hace que lo sea.
- **Un no-op silencioso del DOM se compensa en el emit, no se detecta en runtime.** No hay
  guarda defensiva que añadir: el bloque no debía tener ese nodo.

---

## 6. Criterios de aceptación

`packages/compiler/test/emit/hydrate/reconcile-after-hydrate.test.ts` — el eje es
**hidratar y luego actualizar**, que es lo que no ejecutaba nadie. Cada uno se vio fallar
contra el emit anterior.

1. **(rojo primero)** Un `@if` hidratado que cambia de rama deja **una** salida, no cero, y
   vuelve a la primera al deshacer el cambio.
2. Sobrevive a muchos cambios seguidos: cada retirada es otra oportunidad de perder el ancla.
3. La rama nueva entra **donde estaba la vieja**, no al final del nivel: los hijos del
   contenedor quedan en el orden del fuente.
4. **(rojo primero)** En un nivel **en línea**, sin hoja de estilos y por tanto sin poda de
   blancos, cambiar de rama no toca la prosa de alrededor: el texto sigue siendo `a muchos b`.
5. **(rojo primero)** Un `@switch` hidratado cambia de `case` y deja un solo brazo vivo.
6. **(rojo primero)** Un `@foreach` hidratado crece y mengua mientras quede una fila.
7. **(rojo primero)** Y **vuelve a poblarse tras vaciarse**, que es el caso que la última
   fila se llevaba consigo.
8. Las filas repuestas van **dentro** del `<ul>`, no al lado.
9. **Los goldens se mueven, y solo donde deben.** El diff de los tres `*.client.mjs` es
   exactamente nueve `$r.push(...)` borradas de las pasadas `h`, y ningún cambio más. Una
   segunda clase de cambio es la señal de que algo se ha colado.
10. **Validación por mutación, y las dos mitades por separado.** Se deshace la rama de atrás
    y caen 1–3 y 5–8; se deshace la de delante y cae 4.
11. **En Chrome de verdad** (`examples/basic/tests/reactividad.spec.ts`): en `/reactividad`,
    bajar a cero y volver a subir repuebla las dos listas, y el array de `pageerror` queda
    vacío — que es lo que separa «lanzó» de «no hizo nada».

---

## 7. Fuera de alcance

- **La deuda de cobertura de `@fudic/compiler`.** Se salda en su propia tanda.
- **El marcador de la excepción de SDD-30 §3.4** —dos runs interpolados separados solo por un
  bloque— sigue como está: esa forma sí se detecta estáticamente y sí emite comentario.
- **Los dos fallos preexistentes de `forms.spec.ts`** (§6.18 de SDD-34): fallan en `main`
  desde antes de esta tanda y no se tocan aquí.
