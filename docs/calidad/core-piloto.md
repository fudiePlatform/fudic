# Piloto de calidad de @fudic/core — lo que se destapó

Fecha: 2026-11-01. Rama `core-quality`, creada desde main (bfae2f4e).

## 1. Qué hace la rama

- Core sin referencias a SDD/BUG/§; `src` de 3.748 a 2.466 líneas.
- Una sola secuencia para levantar un componente (`cascade.raise`), antes copiada seis veces.
- Cuatro arreglos, cada uno con un test que falla sin el arreglo:
  1. una descarga fallida ya no queda cacheada para siempre (`chunks`, `deferredOnce`);
  2. `live` reintenta si la definición falla;
  3. `task` escribe dentro de `batch`;
  4. cadena padre → intermedio → formulario: al pulsar en el formulario, el padre también
     se activa y recibe lo que se envía (`cascade.ts`, `raiseOwner`).
- Tests de 282 a 279; cobertura 100/100/100/100.

## 2. Stryker: ¿los tests ven cuando se estropea el código?

Stryker estropea el código a propósito, un cambio cada vez, y pasa los tests. Si todos siguen
en verde, ningún test vigila eso. Se ejecutó fuera del repo (arrastra `@babel`, prohibido aquí),
sobre copias de main y de la rama.

| | Cambios probados | Detectados | Sin detectar |
|---|---|---|---|
| main | 1.287 | 92,2 % | 100 |
| rama | 1.259 | 92,4 % | 95 |

- Quitar los 7 tests no costó nada: las dos versiones detectan lo mismo.
- Con cobertura al 100 %, 95 cambios pasan sin que ningún test lo note. Ejemplo:
  `effect.ts:25` — borrar la línea que desconecta un efecto parado de sus señales deja todo en verde.
- Lista completa: [core-stryker-supervivientes.txt](core-stryker-supervivientes.txt)
  (fichero:línea, tipo de cambio, código original `=>` lo que puso Stryker). Sin repasar.

## 3. Revisión de diseño (sesión fudic-1c), verificada en el código

1. Cuatro ficheros apuntan a mano qué componente ya está activado (`bus.ts:32`, `capture.ts:75`,
   `cascade.ts:61`, `eager.ts:58`); la regla «una sola vez» debería vivir en un sitio.
2. Una variable de módulo (`turn`, `instances.ts:38`) cambia lo que responden `instancesOf` e
   `instanceById` sin que se vea en su firma.
3. `Cascade` expone `prepareTag` y `attachAll`, que solo usan la propia cascade y los tests.
4. `installHydration` (`install.ts:87-227`) monta las piezas y además dirige cada gesto.
5. Página y componente se activan con los mismos pasos, separados por un `if` (`install.ts:151`).
6. Valores usados dando por hecho que ya existen: `landed!`, `maps.route!`, `markDone!`.
7. El aviso `fud:hydrated` se lanza desde `bus`, `cascade` e `install`; `raise` devuelve el
   tiempo ya como texto.
8. Código para los tests: `typeof el.hasAttribute === 'function'` (`eager.ts:30`); `NOTHING`
   duplicada en `eager.ts` y `subscribe.ts`.
9. Un test del compilador (`compiler/test/emit/hydrate/cells.test.ts`) importa ficheros internos
   de core. El código del compilador no depende de core: solo lo usan 55 tests, que compilan un
   `.fud` y lo ejecutan con core.

## 4. Pendiente de decisión

- Orden propuesto: arreglar el diseño sin tocar tests → Stryker otra vez → repasar lo que quede.
  Un refactor no toca tests: si uno se rompe, es que estaba atado a la estructura (puntos 3 y 9).
- Idea: un paquete de fixtures (`.fud` + salida esperada) que compilador y core importan por
  separado, para que cada paquete pruebe solo lo suyo.
- Dónde vive Stryker: fuera del repo, o dentro como herramienta con excepción para `@babel`.
- Preexistente: `examples/pieces-bench/check.mjs` falla igual en main (`owner.ts` copiado en
  tres piezas).
- `workbench/test/rerun.test.ts` agotó 60 s en la suite completa; solo pasa. Sin investigar.
