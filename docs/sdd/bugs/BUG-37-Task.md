# BUG-37 — Tareas

> **BUG:** [BUG-37 — El `submit` del formulario se delega, y un `stopPropagation()` del autor se lleva la validación](./BUG-37-submit-delegado.md)
> **Paquetes:** `@fudic/forms`
> **Rama:** `worktree-worktree-sdd-39-rutas-reactivas` (el defecto se encontró midiendo
> `/delegacion` en este worktree y se arregla donde se vio)
> **Progreso:** 4 / 4

El orden es el de este repositorio para un defecto que se ve en el navegador: **primero la
corrección**, Pedro la prueba, y los tests después, escritos contra el código ya arreglado
y vistos fallar revirtiendo la línea.

---

## Mapa de dependencias

```
1 onSelf  ──→  2 probado en el navegador  ──→  3 los dos criterios  ──→  4 la página no miente
  (hecho)          (hecho, Pedro)                   (hecho)                    (hecho)
```

---

## Fase 1 — la corrección (1, 2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **`onSelf`, y el `submit` la usa.** `wiring.ts` gana la hermana de `on`: misma firma, sin raíz. `bindForm` pasa a llamarla. Las seis bindings de campo no se tocan — siguen delegadas, que ahí el ahorro crece con el marcado. §3, §4 | `forms` | `src/dom/wiring.ts` · `src/dom/bind-form.ts` |
| [x] | 2 | 1 | **Probado donde se ve.** Sonda de `/delegacion` con `console.log(this)`: el quinto listener del formulario pasa de `#shadow-root` a `<form class="fudic">`. Reparto 1/4 → 2/3, total igual a 5. Chrome, `vite preview`. §4, §6 | — | `examples/basic/public/probe-listeners.js` |

---

## Fase 2 — los tests (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 3 | 1 | **(visto fallar revirtiendo la 1)** **Los dos criterios.** El receptor —`addEventListener` parcheado, `this` igual al `<form>` y nunca la raíz— y lo que cuesta el receptor —un `@submit` con `stopPropagation()` registrado antes de la binding, y el submit igualmente prevenido—. Devolviendo `on` caen 2 de los 9 del fichero. Criterios 1–2 | `forms` | `test/dom/bind-form.test.ts` |

---

## Fase 3 — la página (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 4 | 2 | **`/delegacion` deja de mentir.** Prometía «el contador sube una vez» donde sube 4, y «la raíz tiene uno por tipo» sin contar los dos del `<form>`. Ahora dice los tres números reales —la base de 3 y de dónde sale cada uno, el +4 del calendario delegado, y los 5 del formulario con su reparto— y explica por qué el `submit` es el único que no se delega | — | `examples/basic/src/routes/delegacion.fud` |

---

## Notas

- **El total no baja: 5 antes y 5 después.** Es la prueba, no una decepción. Delegar el
  `submit` no ahorraba un listener porque hay un formulario por raíz; lo único que hacía era
  ponerlo donde el autor podía cortarlo. Un test que contara no vería nada — por eso el
  criterio 1 mira el **receptor**.
- **El testigo del test sube por la cadena de prototipos** en vez de nombrar `EventTarget`:
  el `EventTarget` del ámbito de un módulo de test es el de Node, ajeno al del emulador de
  DOM, y parchear el global vigila un prototipo del que ningún elemento hereda. Costó un
  rojo que no era el rojo que se buscaba.
- **La sonda se commitea con su `console.log(this)`**, a petición de Pedro: es el
  instrumento con el que se mide esta página, no código del framework.
- **El suelo del paquete no se mueve:** `@fudic/forms` sigue en 100 / 100 / 100 / 100 en las
  cuatro métricas, sin un solo `ignore`.
- **Lo que este BUG no toca** está en §7. Lo primero, la delegación de los campos, que está
  bien; lo segundo, que `delegate()` guarde un handler por `(raíz, tipo, elemento)` y una
  segunda suscripción pise a la primera en silencio — hoy no se dispara, no comparte ni una
  línea con esta corrección, y queda anotado en el registro de progreso del índice.
