# Piloto de calidad de @fudic/core — lo que se destapó

Fecha: 2026-11-01. Rama `core-quality`, creada desde main (bfae2f4e).

Conclusión: **core no cumple SOLID**, y eso es más grave que cualquier cifra de tests. Los tests
se escribieron contra este diseño: pueden estar para que pase el código tal como está, o sobrar
la mitad. Hasta que el diseño esté bien, ni la cobertura al 100 % ni Stryker dicen que core esté bien.

## 1. Revisión de diseño (sesión fudic-1c)

Hecha por orden de Pedro sobre el código de esta rama. Su tesis: lo que falla es el código y
SOLID, no los tests de mutación. Los nueve puntos se verificaron en el código, con fichero y línea
(rutas relativas a `packages/`).

**Los puntos 1, 2 y 4 son los que impiden dar core por bueno.**

1. **Nadie es dueño de `state.hydrated`.** Es un `Set` que cuatro módulos consultan y modifican,
   cada uno con su propia pareja `has` + `add`: `core/src/hydrate/bus.ts:32`, `capture.ts:75`,
   `cascade.ts:61` y `eager.ts:58`. La regla «un componente se activa una sola vez» está repartida
   en cuatro sitios en vez de vivir en un objeto con una operación del tipo `claim(id)`.
2. **El índice de cada gesto es una variable global escondida.** `openTurn` deja el índice en una
   variable del módulo, y `instancesOf` e `instanceById` responden distinto según lo que haya en ella
   (`core/src/hydrate/instances.ts:38`). Esa dependencia no se ve en ninguna firma. Al crear el
   fichero nuevo era el momento de pasar el índice como parámetro, y se mantuvo tal cual.
3. **`Cascade` ofrece métodos que nadie del código usa.** `prepareTag` y `attachAll` siguen en la
   interfaz (`core/src/hydrate/cascade.ts:34-38`), pero desde que existe `raise` solo los llaman la
   propia `cascade` y los tests. Es una interfaz más ancha de lo necesario, mantenida para los tests.
4. **`installHydration` sigue haciendo dos trabajos.** Monta todas las piezas y además dirige cada
   gesto (`raiseRoute`, `raiseInTurn`, `raise`, las partes, el precalentamiento), todo en una función
   de 140 líneas (`core/src/hydrate/install.ts:87-227`). Partir el fichero sacó `arrivals` y `eager`,
   pero no separó esos dos trabajos.
5. **La ruta y el componente van por un `if`.** `raiseInTurn` pregunta si el elemento es el `<body>`
   de la ruta y desvía a otro camino (`install.ts:151`). Son dos maneras de activar algo con los
   mismos pasos (esperar, descargar, preparar, activar, repetir el gesto). Una tercera obligaría a
   volver a tocar esta función.
6. **Dependencias que dependen del orden, tapadas con `!`.** `landed` se asigna en dos sitios y se
   lee con `landed!` dentro de `createCells` (`install.ts:102-109`); `maps.route!` (`install.ts:132`)
   y `markDone!` en `arrivals.ts:21` funcionan igual. Que no falle depende de que alguien haya
   esperado antes a lo correcto; el tipo no lo garantiza.
7. **La medición está mezclada con la lógica.** `cascade.raise` devuelve el tiempo ya formateado
   como texto, y el aviso `fud:hydrated` se emite desde `cascade` (`subtree`), desde `bus` (`bus`) y
   desde `install` (`downloaded`, `shared-chunk`). Una sola responsabilidad, medir y avisar, repartida
   en tres módulos.
8. **Código hecho a la medida de los tests.** `typeof el.hasAttribute === 'function'` está ahí «so
   document doubles work» (`core/src/hydrate/eager.ts:19-30`). Además, `NOTHING` está copiada en
   `eager.ts:17` y `core/src/subscribe.ts:41`.
9. **Otro paquete importa los ficheros internos de core.** Un test de `compiler` importa
   `core/src/hydrate/...` con ruta relativa (`compiler/test/emit/hydrate/cells.test.ts:15-21`); por
   eso partir `registry.ts` obligó a tocar otro paquete. El código del compilador no depende de core:
   core es solo dependencia de desarrollo, para 55 tests que compilan un `.fud` y lo ejecutan con core.

Lo que la revisión da por bueno: `chunks`, `deferredOnce`, `task` con `batch`, `tracking`
(`untrack` es `runTracked(null)`) y el paso por `raise` que sustituye a las seis copias.

### Qué dice esto de los tests

- Los puntos 3, 8 y 9 son código o interfaz que existen **por los tests**: los tests mandan sobre
  el diseño, cuando debería ser al revés.
- Un refactor de estos puntos no debe tocar tests. Si al arreglar el diseño se rompe un test, ese
  test estaba atado a la estructura interna, no a lo que hace core.

## 2. Qué hace la rama

- Core sin referencias a SDD/BUG/§; `src` de 3.748 a 2.466 líneas.
- Una sola secuencia para levantar un componente (`cascade.raise`), antes copiada seis veces.
- Cuatro arreglos, cada uno con un test que falla sin el arreglo:
  1. una descarga fallida ya no queda cacheada para siempre (`chunks`, `deferredOnce`);
  2. `live` reintenta si la definición falla;
  3. `task` escribe dentro de `batch`;
  4. cadena padre → intermedio → formulario: al pulsar en el formulario, el padre también se
     activa y recibe lo que se envía (`cascade.ts`, `raiseOwner`).
- Tests de 282 a 279; cobertura 100/100/100/100.

## 3. Stryker: ¿los tests ven cuando se estropea el código?

Stryker estropea el código a propósito, un cambio cada vez, y pasa los tests. Si todos siguen en
verde, ningún test vigila eso. Se ejecutó fuera del repo (arrastra `@babel`, prohibido aquí), sobre
copias de main y de la rama.

| | Cambios probados | Detectados | Sin detectar |
|---|---|---|---|
| main | 1.287 | 92,2 % | 100 |
| rama | 1.259 | 92,4 % | 95 |

- Quitar los 7 tests no costó nada: las dos versiones detectan lo mismo.
- Con cobertura al 100 %, 95 cambios pasan sin que ningún test lo note. Ejemplo: `effect.ts:25`,
  borrar la línea que desconecta un efecto parado de sus señales deja todo en verde.
- Límite: Stryker mide si los tests vigilan **este** código. Con el diseño de la sección 1 mal,
  un buen porcentaje no dice que core esté bien.
- Lista completa: [core-stryker-supervivientes.txt](core-stryker-supervivientes.txt)
  (fichero:línea, tipo de cambio, código original `=>` lo que puso Stryker). Sin repasar.

## 4. Método decidido por Pedro

Con un 100 % de cobertura, lo destapado no tiene explicación. Se sigue este orden, sin saltar pasos:

1. **Clean code:** quitar los comentarios y todo lo que no cumpla clean code.
2. **Ejecutar los tests.**
3. **SOLID:** dejar la librería con el diseño correcto (los nueve puntos de la sección 1).
4. **Preguntar** qué tests se ven afectados, y aceptar solo esos cambios.
5. **Tests otra vez**, y justificar cada cambio.

Además del método, al acabar:

- **Stryker otra vez**, para comparar antes y después.
- **Probar en el navegador** sobre `examples/basic`.
- **Revisar los tests mismos** tras el paso 3: los que solo vigilaban la estructura interna.

## 5. Lo que se descarga el navegador

Preocupación de Pedro, más allá de core: código copiado entre trozos y peso del service worker.

- Una página debe descargar solo lo que usa, y nada dos veces. Caso conocido:
  `examples/pieces-bench/check.mjs` falla también en main porque `owner.ts` va copiado dentro de
  los trozos `effect`, `owner` y `task`.
- Lo mismo hay que revisarlo en todo lo que va al navegador: **core, forms, di, dom, http** y la
  coordinación con el **service worker**.
- El service worker pesaba unos **13 kB** y ahora va por el **doble** (observación de Pedro). Hay
  que saber qué lo ha hecho crecer y qué sobra.

## 6. Pendiente de decisión

- Idea: un paquete de fixtures (`.fud` + salida esperada) que compilador y core importan por
  separado, para que cada paquete pruebe solo lo suyo.
- Dónde vive Stryker: fuera del repo, o dentro como herramienta con excepción para `@babel`.
- Preexistente: `examples/pieces-bench/check.mjs` falla igual en main (`owner.ts` copiado en
  tres piezas).
- `workbench/test/rerun.test.ts` agotó 60 s en la suite completa; solo pasa. Sin investigar.
