# IDEA-08 — Reflejar props en atributos del host

> **Estado:** `Idea` — no es un SDD. Sin interfaz pública cerrada, sin criterios de aceptación,
> sin rango de diagnósticos. Captura la conversación del **2026-11-11** con Pedro. Lo marcado como
> **decidido** (§2) no se reabre; lo demás es propuesta.

---

## 1. El problema

Una card con cuatro variantes obliga hoy a escribir un `class:` por variante:

```html
<div class="card" class:primary=@(variant === 'primary') class:danger=@(variant === 'danger') …>
```

Si la prop `variant` se refleja como atributo del host, el CSS lo resuelve con un selector y la
vista no lleva ninguna expresión:

```css
:host([variant="primary"]) .card { … }
:host([variant="danger"]) .card { … }
```

Además el componente se puede estilizar desde fuera (`app-card[variant="primary"]`) y, con SSR,
el atributo sale en el HTML sin JS (el nivel 1 queda intacto).

## 2. Lo decidido (Pedro, 2026-11-11)

1. **El atributo lo escribe solo el framework, nunca el usuario.** No hay conflicto entre un
   atributo escrito a mano y la prop: ese caso no existe.
2. **Una sola dirección: de la prop al atributo.** Sin `observedAttributes` ni sincronización de
   vuelta.
3. **Solo primitivos.** `string` y `number` se reflejan como valor; `boolean`, como presencia o
   ausencia del atributo.

## 3. Lo que queda abierto

- **Sintaxis:** cómo marca el autor qué props se reflejan (por ejemplo, una marca en
  `props<…>()`).
- **Diagnóstico** para una prop reflejada de tipo no primitivo.
- **`null` / `undefined`:** quitan el atributo, como un `false`.

## 4. Cómo encaja

- **SSR y SW:** escriben el atributo en el tag del host al serializar.
- **Cliente:** el controlador lo actualiza en `u` cuando la prop cambia, y en `c` cuando el
  componente se fabrica en el navegador.

## 5. Alcance estimado

~10–12 tareas: sintaxis, emit en cliente y en SSR/SW, diagnóstico de tipo, tests.
