# BUG-59 · Los nombres del `.fudapi` no navegan, y `task(` ofrece todo el ámbito

> **Estado:** `Hecho` — documentado mientras se arreglaba, a petición de Pedro. [tareas](./BUG-59-Task.md).
> **Corrige:** [SDD-60](../SDD-60-fudapi.md) §4.7 (los nombres que un `.fud` toma de su
> `<link rel="server">`) y [SDD-56](../SDD-56-funciones-de-servidor.md) §3.5 (`form:=`).
> **Paquetes:** `@fudic/language-core` · `@fudic/language-server`

---

## 1. Síntoma

En `examples/basic`, Ctrl+Click sobre `save` o `personForm` —en la vista
(`<form control=@personForm form:=@save>`) o en `@code` (`task(save)`)— no iba a ninguna parte.
Sobre `personForm.name` o `data.users` sí, pero al `.d.ts` generado, no al `.fudapi` donde el
desarrollador lo escribió.

Y en el primer argumento de `task(`, el autocompletado ofrecía todo el ámbito: `salir`,
`satisfies`, `SharedArrayBuffer`, los tipos `SaveFails` de cada contrato… cuando lo que va ahí
es una función del contrato. Al teclear `task(` no salía nada (solo con Ctrl+Space). En
`form:=` pasaba lo mismo con el ámbito de la vista.

## 2. Causa

1. La proyección declara cada nombre del contrato como andamiaje
   (`declare const save: typeof import('fudic:<id>')['save'];`, y `data` desde el `load`).
   TypeScript da esa línea como definición; el andamiaje no se mapea al `.fud` y Volar descarta
   el destino. Un campo (`personForm.name`, `data.users`) TypeScript lo encuentra en el `.d.ts`
   generado, que sí es un fichero, y ahí se quedaba.
2. `form:=@save` no se proyectaba: TypeScript no veía ese `save`, ni para navegar ni para
   comprobar que existe.
3. `task` acepta cualquier callable, así que TypeScript ofrece todo lo que está en ámbito. Y `(`
   no es carácter de disparo de TypeScript: al teclearlo no se le pregunta, y nadie respondía.
   En `form:=` la lista la daban los servicios de la vista, con su ámbito entero.

## 3. Corrección

1. Un decorador sobre la definición de TypeScript sustituye dos clases de destino por la
   declaración del `.fudapi`:
   - **La línea de andamiaje:** la función en su contrato, el formulario en el fichero que lo
     declara (un `form` de una función solo lo nombra) y `data` en su `load`.
   - **El `.d.ts` generado** (`.fudic/api/<id>.d.ts`, cuyo `declare module "fudic:<id>"` dice de
     qué contrato es): un campo de formulario —dentro de sus grupos—, de `data`, de un tipo del
     proyecto, o un argumento de una función, en su línea.

   Lo que el contrato no nombra se queda donde lo puso TypeScript.
2. `form:=@x` se proyecta como `$formSend(x)`: el nombre es de TypeScript, navega y se subraya
   si no existe. Qué función encaja con el formulario lo sigue diciendo el build.
3. En el primer argumento de `task(` y en el valor de `form:=` (con o sin `@`, con o sin
   comillas), si el fichero enlaza contratos con funciones, la lista la da el servicio de fudic:
   esas funciones, con su `@` en la vista. TypeScript y el servicio de etiquetas callan ahí. Al
   ser del servicio de fudic, que sí declara `(`, sale también al teclear `task(`. Sin ninguna
   función enlazada, la posición sigue siendo de quien la respondía.

## 4. Criterios de aceptación

1. Ctrl+Click en una función, desde `@code` y desde `form:=`, abre su declaración en el `.fudapi`.
2. En un formulario abre el `form` del fichero que lo declara; en `data`, el `load`.
3. En un campo de formulario (también dentro de un grupo), de `data`, de un tipo del proyecto o
   en un argumento, abre su línea del `.fudapi`.
4. Un formulario que el proyecto no declara no lleva a ninguna parte, como antes.
5. `task(` ofrece solo las funciones del contrato, al teclear `(` y con Ctrl+Space; `form:=`,
   `form:=@` y `form:=@sa` ofrecen `@` + esas funciones; fuera de ahí, el ámbito de siempre.
6. `examples/basic` sigue sin problemas con la proyección nueva de `form:=`.
