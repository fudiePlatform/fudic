# SDD-85 — La prueba de Pedro

> **SDD:** [SDD-85](./SDD-85-crear-clonando-y-clases.md) §6 criterio 1 (y 6, 10, 11, 16, 17, 20–23)
> · **Tareas:** [SDD-85-Task](./SDD-85-Task.md) · **Rama / worktree:** `sdd-85-crear-clonando`.

Cada paso dice dónde ir, qué hacer y qué tiene que pasar. Las rutas son relativas a
`examples/basic` del worktree. Los e2e de estos pasos se escriben **después** de esta prueba, con
lo que salga de ella.

## Antes de empezar

1. Los paquetes y el ejemplo ya están construidos (`build` y `build:nosw`). Si tocas algo:
   `pnpm --filter @fudic/example-basic build` (y `build:nosw` para el paso 6).
2. `pnpm --filter @fudic/example-basic preview` → `http://localhost:4173`. Sirve con las
   cabeceras de `page.headers`, que exigen Trusted Types (`require-trusted-types-for 'script'`,
   `trusted-types fudic`).
3. Abre la consola de DevTools y **déjala abierta en todos los pasos**: cualquier línea roja de
   Trusted Types o de CSP es un fallo, aunque la página parezca funcionar.

## 1. Filas que nacen, se mueven y se quitan — `/vivo`

- **Qué hacer:** pulsa **Añadir** tres veces. Pulsa el botón de cada fila un número distinto de
  veces (1, 2, 3…). Después **Invertir**, otra vez **Invertir** y **Quitar el primero**.
- **Qué pasa:** cada fila nueva sale con su etiqueta, su borde y su botón vivo. Al invertir, las
  filas cambian de orden **con su cuenta**: la que decía «tocado 3 veces» lo sigue diciendo en su
  nuevo sitio. Al quitar, desaparece la primera y las demás conservan la suya.

## 2. Un componente en cada rama — `/vivo`

- **Qué hacer:** **Cambiar de rama** varias veces.
- **Qué pasa:** alterna `vivo-item` (borde gris) y `vivo-otro` (borde rojo discontinuo, fondo
  rosa). El que entra llega con su estilo y su botón responde.

## 3. El formulario que nace en el navegador — `/vivo`

- **Qué hacer:** **Mostrar / ocultar formulario**. Escribe en «Nombre» y sal del campo sin
  rellenar los demás; escribe un alias de 2 letras; un email sin `@`; dos contraseñas distintas.
- **Qué pasa:** cada campo enseña su error al salir de él, «Las contraseñas no coinciden» sale en
  el grupo de Acceso y **Guardar** sigue desactivado. Corrige todo (alias de 3 letras o más,
  distinto del nombre; contraseña de 8 o más, sin el nombre, repetida igual): **Guardar** se
  activa; púlsalo y sale «Enviado: <nombre>.» en verde.
- **De paso:** ocúltalo y vuelve a mostrarlo: nace otra vez vacío y vuelve a validar.
- **Comparar:** `/formularios` tiene el mismo formulario pintado por el servidor; tiene que
  comportarse igual.

## 4. Bloques dentro de `<svg>` y `<math>` — `/vivo`, al final

- **Qué hacer:** **Cambiar figura** (círculo azul → cuadrado rojo) y **Cambiar fórmula**
  (x² → √x). Pulsa **Comprobar**.
- **Qué pasa:** el cuadrado se dibuja y la raíz se ve como fórmula. El informe dice
  `figura: <rect> http://www.w3.org/2000/svg · fórmula: <msqrt> http://www.w3.org/1998/Math/MathML`.
  Vuelve a cambiar las dos y a comprobar: `<circle>` y `<msup>` con los mismos espacios de nombres.
  Un `http://www.w3.org/1999/xhtml` en cualquiera de las dos es un fallo.

## 5. Las clases que no se pisan — `/clases` (nuevo, en la barra: «Clases»)

Hay dos paneles iguales: el primero lo pinta el servidor; el segundo nace al pulsar
**Mostrar / ocultar el segundo panel**. En **cada uno**:

- **Al cargar:** **Leer clases** → `1: "caja card" · 2: "a b" · 3: "x y"`. La caja 1 **no**
  tiene `activo` aunque el autor lo escribió fijo: manda `class:activo`, que empieza en falso.
- **Qué hacer:** **Añadir «extra» a las tres** (salen con borde rojo discontinuo). Después pulsa
  varias veces **Alternar activo**, **a b ⇄ b c** y **x y ⇄ y z**, leyendo el informe tras cada uno.
- **Qué pasa:** `extra` sigue en las tres cajas tras cualquier cambio. La caja 1 pone y quita
  `activo` (fondo verde); la 2 pasa de `a b` a `b c` y vuelta (quita `a`, pone `c`); la 3, de
  `x y` a `y z`. El orden de los tokens puede variar tras los cambios: eso es lo esperado.

## 6. Trusted Types

- **Sin violaciones:** todo lo anterior, con la consola sin errores. Es el criterio 1 entero.
- **La policy solo si hace falta:** para el preview (Ctrl+C) y arranca
  `pnpm --filter @fudic/example-basic preview:nosw` (`http://localhost:4173`, sin Service Worker:
  con él, el registro del worker ya pide la policy). Abre `/about` y escribe en la consola
  `trustedTypes.getPolicyNames()` → **no** incluye `fudic`. Escribe `/vivo` en la barra de
  direcciones, pregunta otra vez (sigue sin `fudic`), pulsa **Añadir** y pregunta → ahora sí.
- **El build avisa:** en `page.headers` cambia `trusted-types fudic` por `trusted-types otra` y
  ejecuta `pnpm --filter @fudic/example-basic build` → falla con `FUD1545`, nombrando la policy
  `fudic`. Deshazlo.

## 7. Sin Trusted Types

- Abre `/vivo` en un navegador sin `trustedTypes` (Firefox anterior a la 135, o Safari) y repite
  los pasos 1 y 3: crean igual.

## Al terminar

Lo que falle, con la ruta, el paso y lo que dice la consola. Con eso se escriben los e2e
(tareas 28–31) y se cierra.
