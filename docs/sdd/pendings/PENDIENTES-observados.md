# Pendientes observados — lo que aparece de pasada y no es de la tanda en curso

> **Para qué es este documento.** Implementando una cosa se ven otras: un test que falla y no
> es tuyo, una regla que funciona a medias, una suite que va y viene. Eso no cabe en el SDD
> que se está cerrando —invadiría su alcance— y perderlo cuesta caro: alguien lo vuelve a
> descubrir dentro de tres meses, o peor, se lo encuentra un usuario. Aquí se anota, con la
> **evidencia de que pasa** y con lo que ya se ha descartado, para que el que lo arregle
> empiece donde este lo dejó y no desde cero.
>
> Esto **no** es la lista de v1: eso es [PENDIENTES-v1.md](./PENDIENTES-v1.md), que recoge lo
> que está *especificado y no implementado*. Aquí va lo que está *implementado y no del todo
> bien*, más lo que hace ruido en el desarrollo.
>
> **Cómo se usa.** Se añade una ficha cuando se ve. Se quita cuando se arregla —o se
> promueve a BUG cuando alguien decida que merece spec propia—, y entonces se anota en qué
> BUG murió. Una ficha sin evidencia reproducible no vale: es una sospecha, y las sospechas
> se confirman antes de escribirlas.

| # | Qué | Dónde se vio | Estado |
|---|---|---|---|
| 1 | El host de un control-componente no se pone `:invalid` al validar | e2e de `examples/basic`, SDD-37 | Abierto |
| 2 | Un import map en el head de una **ruta** llega tarde y el navegador lo ignora | BUG-29 | Abierto |
| 3 | Dos specs de dev server de `@fudic/vite` fallan de forma intermitente en `pnpm test` | SDD-37 | Abierto |

---

## 1. `setValidity` no llega al host de un control-componente

**Visto:** 2026-09-10, cerrando la evidencia de SDD-37. No es de SDD-37.

**Síntoma.** `examples/basic/tests/forms.spec.ts:168` —«`setValidity` gives the host a
`:invalid` a stylesheet can rely on»— falla. Tras rellenar el alias con `ab` (dos caracteres,
que no pasan su `minLength`) y pulsar submit, el host `app-input` no casa `:invalid`:

```
expect.poll(matches).toEqual({ valid: false, invalid: true })
   recibido: { valid: true, invalid: false }
```

**Por qué aparece ahora.** Estaba **tapado**. El test anterior del mismo `describe` moría
antes en `nameField(page).fill('Ada')` esperando 120 s a un `app-form input#nom` que no
existía: BUG-25 reescribió ese input y le quitó el `id`, dejando además un `<label for="nom">`
apuntando a nada. Restaurado el `id` (commit de la evidencia de SDD-37), el test llega hasta
el final y descubre este otro.

**Lo que ya está descartado.** No es la delegación de eventos de SDD-37. Se comprobó
volviendo `on()` de [`forms/src/dom/wiring.ts`](../../../packages/forms/src/dom/wiring.ts) a
un `addEventListener` directo, reconstruyendo `@fudic/forms` y el ejemplo: **falla igual**. El
diff de SDD-37 sobre `packages/forms/src` no toca `setValidity`, `validate` ni `internals`.

**Por dónde seguir.** El valor SÍ llega al modelo —el test hermano lo prueba: rellena el alias
y el formulario está de acuerdo—, así que lo que no llega es la validez al `ElementInternals`
del host, o no llega el momento en que debería. Mirar quién llama a `setValidity` en el camino
de submit, y si el control-componente lo recibe cuando el error lo produce `$validate` del
padre y no un evento del propio campo.

---

## 2. Un import map en el head de una ruta llega detrás del módulo de arranque

**Visto:** 2026-09-10, implementando [BUG-29](../bugs/BUG-29-script-en-linea-sin-diagnostico.md).

**Síntoma.** Desde BUG-29 un `<script type="importmap">` se emite verbatim, como manda la
decisión 129. Pero el `@RenderHead()` de una ruta se compone **después** del head del layout,
así que un import map escrito en el head de una **ruta** sale detrás del
`<script type="module" src="/fudic-main.js">` del arranque — y un import map posterior a la
primera carga de módulo el navegador **lo ignora**, sin que nada lo diga.

**Medido** en `examples/basic`, con una ruta y un layout de prueba:

| dónde se escribe | offset del import map | offset del módulo | efecto |
|---|---|---|---|
| head del **layout**, delante del bootstrap | 73 | 175 | correcto |
| head de la **ruta** | 501 | 445 | ignorado |

**Estado.** Funciona desde el layout, que es donde le corresponde, y la 129 lo dice. Lo que
falta es que el compilador lo **diagnostique** cuando llega tarde: es exactamente el tipo de
fallo silencioso contra el que se escribió BUG-29 —el autor escribe algo, no pasa nada, y no
hay mensaje—.

**Por qué no se hizo ahí.** La pregunta no es de un fichero: hay que saber cómo quedan
compuestos layout y ruta, que es del ensamblado de página (SDD-21). Un analizador de SDD-12
solo ve un documento cada vez. Necesita decidirse dónde vive esa comprobación antes de
escribirla.

---

## 3. Dos specs de dev server de `@fudic/vite` fallan de forma intermitente

**Visto:** 2026-09-10, en cuatro pasadas de `pnpm test` seguidas.

**Síntoma.** Bajo `pnpm test` —que hace fan-out con `pnpm -r` y arranca los trece paquetes a
la vez— falla **un** spec de dev server, y **no siempre el mismo**:

| pasada | resultado de `@fudic/vite` |
|---|---|
| 1 | `build-layout.test.ts` › «serves the composed document on demand» |
| 2 | `dev.test.ts` › «renders a navigation on demand (§4.10)» |
| 3 | 347 ✅ |
| 4 | `dev.test.ts` › «renders a navigation on demand (§4.10)» |
| 5 | 347 ✅ |

**Lo que ya está descartado.** No es un cambio de código: los dos specs pasan **siempre**
aislados y **siempre** con la suite del paquete entera (`pnpm --filter @fudic/vite test`, 48
ficheros y 347 tests). Se confirmó además que ningún fixture de `packages/vite/test` escribe
un `<script>` con cuerpo, que era la causa determinista candidata en ese momento.

**Por qué importa.** Un rojo que aparece una de cada dos veces enseña a ignorar los rojos, que
es lo caro. Y como es el paquete que se prueba al final, es el que decide si `pnpm test`
termina en verde.

**Por dónde seguir.** Los dos specs arrancan un dev server real y esperan a que responda; el
sospechoso natural es un timeout de arranque que se queda corto cuando la máquina está
sirviendo otros doce paquetes, o un puerto que no se ha liberado del spec anterior. Vale la
pena mirar si comparten puerto fijo.
