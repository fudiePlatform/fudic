# SDD — Cascada de hidratación por composición (`fud-tree`)

> **Estado:** `Listo`
> **Naturaleza:** transversal. Toca **emit de página** (mapa `fud-tree`) y **runtime de
> hidratación** (camino 2 ampliado con recorrido post-orden del subárbol). No introduce
> sintaxis nueva: la composición ya existe (`<link rel="component">` + uso del tag).
> **Validado:** prototipo funcional servido por HTTP, medido en Chromium real. Cadena de
> cuatro niveles (padre→hijo→nieto→bisnieto) hidratada en post-orden, el padre el último,
> click reproducido. Log de aceptación en §7.

---

## 1. Contexto y objetivo

Especificar cómo el runtime hidrata el **árbol de composición** de un componente cuando
ese componente se hidrata por interacción. Al pulsar un elemento dentro de un padre no
hidratado, no basta con levantar el padre: su subárbol de descendientes hidratables (hijo,
nieto, bisnieto…) debe estar vivo **antes** de que el padre monte y su handler corra,
porque el código emitido del padre pasa estado/props a sus hijos en el momento de montarlos.

Es la misma maquinaria del SDD de bus (pre-hidratar dependencias antes del disparador),
con dos diferencias estructurales:

1. **La dependencia es de composición, no de bus.** No nace de una iteración ni de un
   evento: nace de que un componente compone a otro en su template. El compilador ya la
   conoce (resolvió toda la composición para asignar `data-id` en pre-orden).
2. **Es un árbol transitivo, no un mapa plano.** Padre → hijo → nieto → bisnieto. El orden
   correcto es **post-orden**: el descendiente más profundo primero, el padre (el que
   recibió el click) el último.

El paso de estado y props padre→hijo **ya lo resuelve el código emitido de cada
componente** (sistema de props, decisiones 67–85; inyección `el.prop = valor` antes de
`anchor.before(el)`). El runtime **solo garantiza el orden**: que todo el subárbol esté
vivo antes de soltar el click al padre. No interviene en el paso de datos.

---

## 2. Dependencias

| SDD | Aporta |
|---|---|
| SDD-runtime-hidratación | camino 2, `Set` de hidratados, replay del gesto. Este SDD lo amplía. |
| Emit de página | resolución de composición y asignación de `data-id` en pre-orden; serializa `fud-tree` y `fud-state`. |
| SDD de emit de componente | inyección de estado/props padre→hijo en el montaje (fuera del runtime). |
| Sistema de props (67–85) | nivel efectivo N3; solo instancias N3 efectivas llevan `data-id` y participan. |

---

## 3. Contrato de emit

### 3.1. Mapa de composición `fud-tree`

El emit de página serializa un único `<script type="application/json">` con el mapa de
composición **por tag**:

```html
<script type="application/json" id="fud-tree">
{
  "app-parent":     ["app-child"],
  "app-child":      ["app-grandchild"],
  "app-grandchild": ["app-greatgrandchild"]
}
</script>
```

- **Clave:** tag padre. **Valor:** tags de sus **hijos directos hidratables** (N3 efectivo).
- **Es tag→[tags], NO instancia→[instancias].** El mapa no crece con el número de
  instancias en la página: una página con 200 tarjetas tiene la misma entrada `app-card`
  que una con una. Crece solo con el **catálogo** de componentes (acotado, típicamente
  decenas), no con el uso. Por eso su peso es insignificante.
- Solo tags con hijos hidratables aparecen como clave. Una hoja (sin hijos N3) no tiene
  entrada.
- Solo hijos **N3 efectivos** se listan. Hijos N1/N2 puros no se hidratan, no llevan
  `data-id`, no entran en el mapa.

### 3.2. Estructura en el DOM

La composición está materializada en el DOM: cada hijo hidratable vive dentro del shadow
(`shadowrootmode="open"`) de su padre, con su `data-id`. El shadow es **open** porque el
DSD emitido lo es. El runtime usa `fud-tree` para saber **qué** tags buscar y desciende por
`shadowRoot` para localizar las **instancias** concretas.

```html
<app-parent data-id="p">
  <template shadowrootmode="open">
    …
    <app-child data-id="c">
      <template shadowrootmode="open">
        …
        <app-grandchild data-id="g">…</app-grandchild>
      </template>
    </app-child>
  </template>
</app-parent>
```

### 3.3. Estado por instancia

Cada instancia hidratable lleva su estado completo en `fud-state`, leído por `data-id`
(autoridad de estado, no el DOM):

```html
<script type="application/json" id="fud-state">
{ "p": { "count": 0 }, "c": { … }, "g": { … }, "gg": { … } }
</script>
```

---

## 4. Comportamiento

### 4.1. Disparo

Este SDD cubre el disparo por **interacción** (camino 2 del SDD-runtime-hidratación): un
click dentro del subárbol de un padre no hidratado. El disparo **no interactivo**
(`viewport`, `eager`) de una cascada depende del SDD de estrategias no interactivas y queda
fuera (§9); la lógica de árbol de este SDD es reutilizable por él sin cambios.

### 4.2. Recorrido post-orden del subárbol

Al entrar el camino 2 sobre un host padre no definido, **antes** de hidratar el padre y
antes del replay, el runtime recorre su subárbol en **post-orden**:

```
hydrateSubtreePostorder(rootHost):
  visit(host, depth):
    para cada childTag en fud-tree[host.localName]:
      para cada instancia `kid` de childTag dentro de host.shadowRoot:   // [data-id]
        visit(kid, depth+1)              // PROFUNDIDAD PRIMERO
    si depth > 0:                        // la raíz (padre) NO aquí; la hidrata el camino 2
      ensureDefined(host.localName)      // descarga por tag (una vez, memoizado)
      customElements.upgrade(host)       // hidrata esta instancia
      hydrated.add(host.data-id)
  visit(rootHost, 0)
```

- **Descarga por tag, montaje por instancia** (ortogonalidad de siempre): `ensureDefined`
  memoiza por tag (`inflight`), así el chunk de un tag repetido se descarga una vez aunque
  aparezca en varias posiciones del subárbol; cada instancia se upgradea en su posición.
- La búsqueda de hijos se hace sobre `host.shadowRoot` (no `document`), porque
  `querySelectorAll` no cruza fronteras de shadow. Cada nivel entra explícitamente en el
  `shadowRoot` de su host y recursa.
- **Post-orden estricto:** el descendiente más profundo se hidrata primero; al volver de la
  recursión, el host ya tiene sus descendientes vivos.

### 4.3. El padre, el último; luego replay

Tras completar el subárbol, el runtime hidrata el **padre** (raíz del subárbol, el que
recibió el click) y solo entonces hace el **replay** único del click:

```
camino 2 (padre no definido):
  1. marcar instancia padre como hidratada (antes de await)
  2. preventDefault + stopImmediatePropagation
  3. hydrateSubtreePostorder(padre)     // subárbol vivo, hondo → fuera
  4. ensureDefined(padre) + upgrade     // el padre, el ÚLTIMO
  5. replay del click sobre el target real
```

Cuando el handler del padre corre (en el replay), **todo su subárbol ya está vivo**, así
que cualquier estado/prop que el padre pase a sus hijos encuentra clases hijas
materializadas.

### 4.4. El runtime no conoce estructura de dominio

`fud-tree` es tag→tags puro. El runtime no sabe qué es "padre" ni "carrito": solo sabe
"para montar A, monta antes su subárbol". Igual que en el bus, la meta-información se
resolvió en compilación a una relación entre tags; el runtime la consume.

---

## 5. Interfaz pública

### 5.1. `fud-tree` — contrato de emit de página

```ts
// <script type="application/json" id="fud-tree">
type FudTree = Record<string /* tag padre */, string[] /* tags hijos directos hidratables */>;
```

### 5.2. Runtime — sin exports nuevos

Amplía el runtime del SDD-hidratación (efecto de instalación al importarse). Reutiliza
`hydrated` (Set de `data-id`), `inflight` (Map tag→promesa), `ensureDefined`. Añade
`hydrateSubtreePostorder(host)` interno. Emite `fud:hydrated` por cada instancia del
subárbol.

---

## 6. Invariantes

- **Post-orden estricto.** Descendiente más profundo primero; el padre (disparador) el
  último. Verificado: bisnieto < nieto < hijo < padre.
- **El padre monta con su subárbol vivo.** El handler del padre no corre hasta que todos
  sus descendientes hidratables están definidos y upgradeados.
- **`fud-tree` es tag→[tags], no instancia→[instancias].** No escala con el número de
  instancias; escala con el catálogo de componentes (pequeño y acotado).
- **Descarga por tag, montaje por instancia.** Un chunk por tag (memoizado), N upgrades
  por N instancias del tag en el subárbol.
- **El recorrido desciende por `shadowRoot`, no por `document`.** `querySelectorAll` no
  cruza shadow; cada nivel entra en su shadow y recursa.
- **Shadow open en hidratables.** El DSD emitido es `shadowrootmode="open"`; el
  descubrimiento de instancias dentro del subárbol lo requiere.
- **Custom elements con guion obligatorio** (decisión 41). Verificado por la evidencia: un
  nombre sin guion (`parent`) no materializa el declarative shadow root
  (`This element does not support attachShadow`), rompiendo la cascada. Innegociable.
- **Un gesto = una ejecución.** Un solo replay del click. Sin doble disparo (Set de
  hidratados por `data-id`).
- **El runtime no conoce estructura de dominio.** `fud-tree` es tag→tags; el runtime monta
  subárboles, no razona sobre composición semántica.

---

## 7. Criterios de aceptación

Servido por HTTP. Página con una cadena de composición de cuatro niveles anidados en shadow
DOM declarativo: `app-parent#p` → `app-child#c` → `app-grandchild#g` →
`app-greatgrandchild#gg`. El padre tiene un botón. `fud-tree`:
`{ "app-parent":["app-child"], "app-child":["app-grandchild"], "app-grandchild":["app-greatgrandchild"] }`.

1. **Carga inicial.** Solo `runtime.js` en Network. `app-parent` aparece en
   `:not(:defined)` a nivel documento (los descendientes están dentro de shadow roots, no
   visibles a `document.querySelectorAll`).

2. **Click en el botón del padre (camino 2 + cascada).** El runtime:
   - Recorre el subárbol en post-orden.
   - Hidrata `app-greatgrandchild#gg` (prof 3), luego `app-grandchild#g` (prof 2), luego
     `app-child#c` (prof 1).
   - Hidrata `app-parent#p` (prof 0) **el último**.
   - Hace replay del click; el handler del padre corre con todo el subárbol vivo;
     `count` pasa a `1` en ese mismo primer click.

3. **Orden post-orden verificable.** En la traza, `hidrata <app-greatgrandchild>` precede a
   `<app-grandchild>`, que precede a `<app-child>`, que precede a `<app-parent> (padre, prof 0)`.

4. **Padre antes del replay; handler tras el replay.** `hidrata <app-parent> (padre)` precede
   a `replay`, y `handler del padre` sigue a `replay`.

5. **Estado desde el payload.** Cada instancia lee su estado de `fud-state[data-id]`.

6. **Todo definido al final.** Tras interactuar, no queda tag sin definir en el subárbol.

**Log de referencia (validación real, Chromium sobre HTTP):**

```
runtime cargado. cero JS de componente aún.
camino 2: click en <app-parent> #p (padre), tag no definido
cascada: hidratar subárbol de <app-parent> en post-orden
  · connectedCallback bisnieto #gg (estado: bisnieto)
    hidrata <app-greatgrandchild> #gg (prof 3) [25.9ms]
  · connectedCallback nieto #g (estado: nieto)
    hidrata <app-grandchild> #g (prof 2) [15.6ms]
  · connectedCallback hijo #c (estado: hijo)
    hidrata <app-child> #c (prof 1) [15.4ms]
  · connectedCallback padre #p (estado: count=0)
hidrata <app-parent> #p (padre, prof 0) [12.8ms]  ← el último
replay del click sobre el padre
handler del padre corre → count=1 (todo el subárbol ya vivo)
```

Invariantes verdes: `solo runtime en carga` · `post-orden bisnieto<nieto<hijo<padre` ·
`padre el último antes del replay` · `handler tras el replay` · `count incrementó en el
primer click` · `todo definido al final`.

---

## 8. Reparto por SDD

| Pieza | SDD que la implementa |
|---|---|
| Resolución de composición y asignación de `data-id` en pre-orden | Emit de página |
| Serialización `<script id="fud-tree">` (tag→[tags hijos hidratables]) | Emit de página |
| Inyección de estado/props padre→hijo en el montaje | Emit de componente (fuera del runtime) |
| `hydrateSubtreePostorder` (recorrido post-orden, descarga por tag) | Ampliación del SDD-runtime-hidratación |

---

## 9. Fuera de alcance

- **Disparo no interactivo de la cascada** (`viewport`, `eager`, `idle`): la lógica de árbol
  es reutilizable, pero el disparo depende del SDD de estrategias no interactivas.
- **Componentes con shadow `closed`.** El descubrimiento por DOM del subárbol requiere
  `open`. Con `fud-tree` emitido (este SDD) el mapa funciona igual con `closed`, pero la
  localización de instancias dentro de un shadow `closed` no es posible desde el runtime;
  si se necesita `closed`, es un caso a especificar aparte.
- **Descubrimiento por DOM sin mapa.** Evaluado y descartado: el ahorro de bytes es
  insignificante (mapa por tag, no por instancia) y forzaría `open`. Se mantiene `fud-tree`
  emitido.
- **Materialización del grafo raíz con identidad de referencias** (objetos compartidos entre
  componentes): decisión pendiente de `@server load() → data`, fuera de este SDD. Aquí el
  estado es por instancia.
- **Reglas de paso de props padre→hijo:** ya cubiertas por el sistema de props (67–85). Este
  SDD solo garantiza el orden de hidratación que las hace posibles.
