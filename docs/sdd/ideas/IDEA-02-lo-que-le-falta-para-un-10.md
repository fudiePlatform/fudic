# IDEA-02 — Lo que le falta al editor (y al build) para ser un 10

> **Estado:** `Idea` — no es un SDD. Sin interfaz pública, sin criterios de aceptación, sin
> rango de diagnósticos. Es la captura de una conversación del **2026-08-12**, al cerrar la
> especificación de [BUG-23](../bugs/BUG-23-arroba-valvula-de-escape.md), sobre qué queda
> **después** de arreglar los siete síntomas de aquel BUG.
> **Paquetes implicados (previsión):** `@fudic/cli` · `@fudic/language-core` ·
> `@fudic/language-server` · `@fudic/vscode`
> **No bloquea nada.** Ninguno de los cinco puntos es requisito de BUG-23; los cinco lo
> presuponen.

---

## Por qué existe este documento

BUG-23 arregla lo que se toca al **escribir** un `.fud`: el punto de una prop, el `@data.`,
el valor sin comillas, el `$event`, el `@` de un nodo de texto, el nombre de un slot y la prop
requerida que falta. Con eso el lenguaje deja de necesitar `@( … )` como válvula de escape.

Lo de aquí es otra cosa: lo que separa «un editor que contesta» de «un IDE». Está ordenado por
cuánto cambia la sensación de usar fudic, no por coste.

---

## 1. `fudic check` — que los tipos existan sin editor

**El hueco más grande que le queda al framework.** Hoy toda la comprobación de tipos del
template —props, valores, eventos, slots, secciones: la máquina entera de `$attrs`, `$on`,
`$intoSlot`, `$section`— vive **solo dentro de VS Code**. `pnpm build` corre el parser, el pase
semántico y el emit, pero **no pasa TypeScript por los ficheros virtuales**, así que
`.value="@(x)"` con `x: string` contra `value: number` es rojo en el editor y verde en CI.

La pieza es un comando que monte los virtuales de `@fudic/language-core` en un `Program` de
TypeScript —con `GLOBALS_DTS` mapeado como lib, que es lo que ya escribe `fudic new`— y mapee
los diagnósticos de vuelta al `.fud` con la misma tabla de mappings que usa el servidor. Es
exactamente lo que hacen `vue-tsc` y `svelte-check`, y aquí la infraestructura ya está entera:
falta el ensamblaje y el reporte.

Efecto colateral que importa: **quita duplicidad**. BUG-23 añade `FUD0197`/`FUD0198`/`FUD0199`
al compilador precisamente porque el build no ve los tipos; con `fudic check` en CI, esas tres
reglas pasan a ser un atajo (rápido, syntáctico, sin `tsc`) y no la única red.

---

## 2. Que cada diagnóstico traiga su bombilla

Un lenguaje se siente terminado cuando el error se arregla solo. El andamiaje existe —
`provideCodeActions` ya sirve el caso del `href` que no resuelve — y está sin rellenar:

| diagnóstico | acción |
|---|---|
| `FUD0197` prop requerida no pasada | insertar `.name="$1"` por cada una que falte |
| `FUD0191` componente sin declarar | añadir el `<link rel="component">` (el `href` ya lo sabe el índice) |
| `FUD0199` / `TS2345` sobre un `slot` | cambiar por un nombre que el padre sí declare |
| `TS2561` sobre un atributo mal escrito | aceptar la sugerencia de TypeScript |
| `FUD0056` valor sin comillas | entrecomillarlo |
| `FUD0540` bucle sin `key` | añadir `key ( … )` con el primer binding de la cabecera |

Barato, incremental —cada fila es independiente— y se nota todos los días.

---

## 3. Renombrar cruzando ficheros

Cambiar `name` en `props<{ name: string }>()` y que se reescriban los `.name=` de los seis
consumidores. Lo mismo con un `<slot name>` y con una `@section`.

**Primero medirlo, después decidir.** La proyección copia la clave 1:1 con `USER_CAPS`, y
`$Props`/`$Slots` son tipos reales importados entre ficheros virtuales: es posible que
TypeScript ya renombre casi todo y lo que falte sea el último tramo. Una tarde de medición
decide si esto es una tarea o un SDD.

---

## 4. Hover con el contrato del componente

Pasar el ratón por `<app-button>` y ver, en una tarjeta: props requeridas y opcionales con su
tipo, slots declarados, eventos que emite, y el JSDoc que el autor escribió en el `.fud`. Hoy
un componente fudic no tiene documentación en ninguna parte, y el consumidor tiene que abrir el
fichero.

Sale casi entero del `propsOf` que BUG-23 tarea 17 construye, más `collectSlots`, que ya existe.

---

## 5. El banco de trabajo

Ver el componente mientras se escribe, con las props editables. Es lo único de esta lista que
no es tooling sino producto, y tiene documento propio:
[IDEA-01](./IDEA-01-banco-de-trabajo-de-componentes.md).

---

## Si solo se hiciera una

La **1**. Las otras cuatro mejoran el editor; esa hace que el editor y el build dejen de ser
dos compiladores distintos.
