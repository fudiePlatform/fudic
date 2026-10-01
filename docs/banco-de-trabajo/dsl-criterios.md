# Criterios de aceptación: DSL y resolución del script

---

## 1. El fichero de criterios

Fichero hermano del componente, mismo nombre, extensión `.fudspec`:

```
fud-button.fud
fud-button.fudspec
```

Estructura basada en indentación de 2 espacios:

```
component fud-button

criterion tamano-tactil-minimo
  given
    route /playground/button
  then
    min-height fud-button 44

criterion sigue-siendo-tactil-con-icono
  given
    route /playground/button
  when
    set-attribute fud-button icon "search"
  then
    min-height fud-button 44
```

Reglas:

- Una declaración `component` al principio del fichero.
- Uno o más bloques `criterion <slug>`. El slug es único dentro del fichero.
- Dentro de cada criterio, los bloques `given`, `when`, `then` en ese orden. `given` y `when` son opcionales; `then` es obligatorio y no puede estar vacío.
- Cada bloque contiene una o más líneas de término.
- Comentarios con `#` hasta fin de línea. Líneas en blanco ignoradas.

---

## 2. La línea de término

Una única forma, sin excepciones:

```
<term> <arg>*
```

Argumentos posicionales separados por espacios. Las cadenas con espacios van entre comillas dobles.

```
route /playground/button
set-attribute fud-button icon "search"
min-height fud-button 44
```

El bloque en el que aparece la línea (`given` / `when` / `then`) no se escribe en la línea: ya lo da el bloque que la contiene.

Tipos de literal admitidos: número, cadena entre comillas, y token sin comillas (identificador, tag, ruta). El tipo se valida contra `meta.params`, no se infiere de la escritura.

### Referencia a elemento

Un argumento de tipo `element` acepta dos notaciones:

```
min-height fud-button 44            # por tag
click role:button/"Detalles"        # por rol y nombre accesible
```

El motor las resuelve a un locator. El término nunca ve ninguna de las dos.

---

## 3. Layout en disco de los términos

```
<raíz>/
  given/
    route.js
    served-by.js
  when/
    click.js
    set-attribute.js
  then/
    visible.js
    min-height.js
```

Un fichero por término. El nombre del fichero (sin extensión) **es** el nombre del término en el DSL. La carpeta **es** el bloque.

No hay índice, ni registro, ni manifiesto que enumere los términos. El listado del directorio es el vocabulario.

---

## 4. Capas y precedencia

Dos raíces, en este orden:

| Orden | Raíz | Origen |
|---|---|---|
| 1 | `<workspace>/fudic/terms/` | Del proyecto |
| 2 | `<paquete MCP>/terms/` | Del framework |

La resolución recorre las raíces en orden y toma **la primera coincidencia**. Un fichero del workspace con el mismo nombre que uno del núcleo lo sustituye por completo; no se fusionan.

---

## 5. Algoritmo de resolución

Dado el bloque que contiene la línea y el nombre del término:

1. Normalizar el término a kebab-case.
2. Para cada raíz en orden de precedencia: comprobar si existe `<raíz>/<block>/<term>.js`.
3. Primera que existe, gana. Se importa el módulo.
4. Ninguna existe → error de compilación `TERM_NOT_FOUND`, con el bloque, el término y el listado de términos disponibles en ese bloque.

El mismo nombre en bloques distintos son términos distintos y no colisionan: `then/visible.js` y `given/visible.js` son dos módulos independientes.

---

## 6. Contrato del módulo

```js
export const meta = {
  name: 'min-height',
  block: 'then',
  params: [
    { name: 'target', type: 'element' },
    { name: 'px',     type: 'number' }
  ],
  describe: ({ target, px }) => `${target} mide al menos ${px}px de alto`
};

export async function run(ctx) { /* … */ }

export const selfTest = [ /* … */ ];
```

- `meta.name` debe coincidir con el nombre del fichero. Si no coincide, error de carga.
- `meta.block` debe coincidir con la carpeta. Si no coincide, error de carga.
- `meta.params` declara los argumentos en orden posicional. De aquí sale el esquema de la tool MCP y la validación de aridad y tipos en compilación.
- `run` es obligatoria. `selfTest` es obligatoria para los términos de la capa de workspace; opcional en el núcleo.

---

## 7. Argumentos

El compilador empareja los argumentos de la línea con `meta.params` por posición. Aridad incorrecta o tipo incompatible → error de compilación, sin llegar a ejecutar.

Los valores resueltos llegan a `run` por nombre:

```js
run({ locator, px })
```

`type: 'element'` lo resuelve el motor antes de llamar: el término recibe un locator ya construido y nunca ve un selector. Es lo que permite sustituir el motor sin tocar ningún término.

---

## 8. Salida de `run`

```js
{ pass: boolean, evidence: object }
```

`evidence` es la medición, no el veredicto. Va íntegra al registro de trabajo.

---

## 9. Procedencia en el registro

Cada entrada del registro anota, por término, de qué raíz se resolvió:

```json
{ "term": "min-height", "layer": "workspace" }
```

Sin esto, dos evidencias con el mismo nombre de término y distinta implementación son indistinguibles al releer el registro.
