# IDEA-04 — Llamadas de cliente sin fontanería

> **Cerrada el 2026-10-27.** §2 y §3 pasan a [SDD-68](../SDD-68-llamadas-sin-fontaneria.md);
> §4 ya estaba resuelto (`auth.client`) y la sesión pasa a cookie en
> [SDD-69](../SDD-69-sesion-por-cookie.md). Lo que salió al revisarla está en
> [SDD-67](../SDD-67-binario-y-reglas-en-las-funciones.md) y
> [SDD-70](../SDD-70-await-en-la-vista.md).

> **Estado:** `Idea` — no es un SDD. Sin interfaz pública, sin criterios de aceptación, sin
> rango de diagnósticos. Es la captura de una conversación del **2026-10-19**, surgida al
> revisar `examples/basic/src/routes/usuarios.fud` mientras se hablaba de
> [IDEA-03](./IDEA-03-backend-poliglota.md); **aparcada** para estudiarla con calma.
> **Paquetes implicados (previsión):** `@fudic/core` · `@fudic/http` · `@fudic/compiler` (si la
> vista necesita algo nuevo).
> **No bloquea nada.** Es independiente del lenguaje del backend: todo ocurre en el cliente.

---

## 1. El problema

Quitado el `@server` (IDEA-03 §8), `usuarios.fud` sigue con unas 70 líneas de `@client`. Parte
es culpa del ejemplo, que enseña cinco cosas a la vez. Pero tres trozos son fontanería que
cualquier app escribirá igual, y que el framework conoce mejor que el usuario:

1. Cancelar la llamada anterior (`lanzar`).
2. Recargar la página tras una mutación (`location.reload()`).
3. El token de sesión en `localStorage` con su `effect`.

## 2. «Cada llamada cancela la anterior»

`lanzar` hace a mano cuatro cosas:

1. **Aborta la llamada anterior** (`busqueda?.abort()`): si se escribe «ana», la respuesta de
   «an» puede llegar después y pisar a la buena. Sin esto hay un bug real.
2. **Guarda el `AbortController` en curso** en una variable suelta.
3. **Lleva el estado a mano**: «Buscando…», vacío al terminar, «cancelada» si se aborta.
4. **Distingue abort de error** (`err.name === "AbortError"`).

Todo autocompletado lo necesita y todos lo escriben igual. Hoy fudic no ofrece nada parecido.

### Una forma posible: una señal asíncrona

```ts
const texto = signal("");
const found = query(() => search({ q: texto() }));

found.value()    // readonly Person[] | undefined
found.pending()  // true mientras hay una llamada en vuelo
found.error()    // el error real; un abort nunca llega aquí
found.cancel()   // el botón «Cancelar»
```

- Cambia `texto` → aborta la anterior y lanza otra. Gana siempre la última.
- El `AbortSignal` lo pone fudic: la llamada ya pasa por `@fudic/http`.
- La vista lee el estado: `@if (found.pending()) { <span>Buscando…</span> }`.

`lanzar`, `buscar` y `busqueda` desaparecen; queda `texto.set(...)` en el `@input`.

Precedentes: `resource()` de Angular, `createResource` de Solid, `switchMap` de RxJS.

## 3. Mutación que invalida el `load`

`save` y `remove` terminan en `location.reload()`, que en realidad significa «vuelve a pedir
`data`». Lo correcto: que una mutación invalide el `load` de la ruta y la vista se repinte con el
`data` nuevo, sin recargar el documento. Encaja con el endpoint de datos que ya pide el SW en las
navegaciones.

## 4. La mitad de cliente de un middleware

El token en `localStorage`, su `signal` y su `effect` son la mitad de cliente del middleware
`auth`. Hoy se repiten en cada página que llama a funciones protegidas. Deberían vivir junto a
`auth`, declarados una vez.

## 5. Abierto

1. `query` en SSR: ¿se ejecuta en el servidor con el valor inicial de sus señales, o arranca
   vacía y solo vive en el cliente?
2. Nombre y sitio: ¿`@fudic/core` (señal genérica sobre cualquier promesa con `AbortSignal`) o
   `@fudic/http` (solo funciones de servidor)? Tree-shaking: no debe pesar a quien no la use.
3. Debounce: ¿opción de `query` o asunto del usuario?
4. Invalidación: ¿explícita (`invalidate(load)`) o declarada en la función de servidor?
5. Cómo se declara la mitad de cliente de un middleware y cómo la encuentra el compilador.
