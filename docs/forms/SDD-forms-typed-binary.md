# SDD — Schema tipado y salida binaria (`@fudic/forms`)

> **Estado:** `Documentado` — no implementar. Es una extensión medida y razonada del envío
> posicional, pendiente de decidir si entra.
> **Paquetes:** `@fudic/forms`, `@fudic/http` (una etapa del pipeline).
> **Depende de:** SDD — Envío posicional de formularios.
> **Naturaleza:** runtime puro. Cero implicación del compilador.
> **Medido:** `typed-binary.mjs` en `fudic-posicional/`. Los números de §2 salen de ahí.
>
> **Convención de idioma.** El código va en inglés (identificadores, tipos, ficheros); el
> texto en español (prosa, comentarios, mensajes de las evidencias).

---

## 1. Contexto y objetivo

El envío posicional eliminó las **claves** porque el receptor ya conoce el orden: los dos
extremos importan el mismo `schema`. Este documento lleva la misma idea un paso más:
si el `schema` declara además el **tipo** de cada control, el cable tampoco necesita
etiquetas ni longitudes para los campos de ancho fijo. El lector sabe cuántos bytes leer.

La palanca no es «binario en vez de JSON». Es **cuánta información conoce el receptor de
antemano**. Sin claves se ganaron 66 B en un formulario; con tipos se ganan otros 31 en una
línea de pedido. Las dos ganancias salen del mismo sitio: el `schema` como contrato único,
sin `.proto` ni un segundo lugar donde declarar la forma de los datos.

---

## 2. La medida, que es lo que decide

| | JSON posicional | protobuf | schema tipado |
|---|---|---|---|
| Formulario de blog (todo texto) | 158 B | 144 B | **138 B** |
| Línea de pedido (numérica) | 52 B | 27 B | **21 B** |
| Ticket de 50 líneas | 2 651 B | 1 450 B | **1 051 B** |

Ahorro del schema tipado frente a JSON posicional:

| | ahorro | |
|---|---|---|
| Formulario de blog | 20 B | −13 % |
| Línea de pedido | 31 B | −60 % |
| Ticket de 50 líneas | 1 600 B | −60 % |

**Por qué el formulario de blog no da más de sí:**

| | bytes |
|---|---|
| texto del formulario (irreducible) | 130 B |
| schema tipado | 138 B |
| **margen que queda** | **8 B** |

Con la carga útil dominada por strings, cualquier codificación está ya a unos pocos bytes
del suelo. El tipado solo cambia las cosas cuando hay números y booleanos.

**De dónde salen los 6 B que el tipado le gana a protobuf en cada línea de pedido:**

| | protobuf | tipado |
|---|---|---|
| tag por campo | 1 B × 10 | 0 |
| mesa (valor 7) | varint | `u16` fijo |
| 3 booleanos | 2 B cada uno = 6 B | bitfield = 1 B |

El tag sobra porque el orden ya está en el `schema`. Es exactamente el mismo argumento que
justificó quitar las claves del JSON.

---

## 3. Interfaz pública

Un espacio de nombres sobre la propia factoría, igual que `validator.server`.

```ts
import { form, control, group, required, min } from '@fudic/forms';

export const orderLine = form({
  itemId:   control.u32(0, [required]),
  qty:      control.u16(1, [min(1)]),
  priceCts: control.u32(0),
  vatPct:   control.u8(21),
  discount: control.u8(0),
  takeaway: control.bool(false),
  invited:  control.bool(false),
  printed:  control.bool(false),
  table:    control.u16(0),
  at:       control.date(),
  note:     control.str(''),          // longitud variable: paga su contador
});
```

### 3.1. Tipos y coste

| forma | bytes | para |
|---|---|---|
| `control.bool(v)` | bitfield, 1 B / 8 | flags |
| `control.u8` `.i8` | 1 | porcentajes, enums |
| `control.u16` `.i16` | 2 | cantidades, mesas |
| `control.u32` `.i32` | 4 | ids, céntimos |
| `control.f32` `.f64` | 4 / 8 | decimales |
| `control.date()` | 6 | ms desde epoch en 48 bits (llega al año 10 889) |
| `control.str(v)` | contador + UTF-8 | texto |
| `control.arr(...)` | contador + elementos | listas |

Los booleanos de un mismo nivel se empaquetan en un bitfield común, en orden de declaración:
1 byte por cada 8. No ocupan posición propia en el búfer.

Un `group()` no lleva marca ni longitud: su aridad es fija y conocida, así que sus campos se
escriben en línea, seguidos, en su posición.

### 3.2. Tipado en TypeScript

Cada `control.uN` / `control.iN` / `control.fN` devuelve `Control<number>`; `control.bool`,
`Control<boolean>`; `control.str`, `Control<string>`. Los validadores existentes componen sin
cambios y el `NoInfer<V>` ya aplicado sigue vigente.

---

## 4. Comportamiento

### 4.1. `control()` sin tipo sigue existiendo y no cambia nada

`control(v)` infiere del valor por defecto el tipo portable —string, f64, bool— que es el
comportamiento JSON actual. **El tipado es opt-in por control, no por formulario.** En
`blog.form.js` no se toca una línea.

### 4.2. El tipo declarado es también un validador

`control.u8(21)` no admite 300 ni −1: es un rango declarado, no un `min`/`max` que haya que
escribir aparte. La violación se diagnostica como error de validación normal, en el mismo
sitio que los demás.

### 4.3. Un solo contrato

El tipo vive en el mismo `schema` que los dos extremos importan, junto al orden. No aparece
un fichero de esquema aparte ni una dependencia de runtime en ninguno de los dos lados.

### 4.4. Es una etapa que sustituye a `json`, no que se añade

```
[positional, json,   compress]      // hoy
[positional, binary, compress]      // con schema tipado
```

Con la misma regla de degradación del pipeline: si **algún** control del schema no lleva tipo
declarado, `binary.applies()` devuelve `false`, la etapa se salta y la carga continúa a `json`.
Un formulario mixto sale como hasta ahora; ninguno falla.

`Content-Type: application/fud+bin`, para que el receptor no lo confunda con el posicional
en texto.

---

## 5. Invariantes

- **El schema es el contrato: orden y tipo.** Nada viaja describiéndose a sí mismo.
- **Opt-in por control.** Un `schema` sin tipos se comporta exactamente como hoy.
- **Simetría estricta.** El escritor y el lector son el mismo recorrido en dos sentidos.
  Tocar uno sin el otro es un bug, no una variante.
- **Aridad fija, también aquí.** Ningún campo se omite; el vacío ocupa su ancho.
- **Sin tipos completos no hay binario.** Degrada a `json`, nunca falla la petición.
- **La ganancia depende del contenido, no del formato.** Con strings, ~13 %; con números,
  ~60 %. Decidir por medida, no por preferencia.

---

## 6. Criterios de aceptación

Pendientes de escribir cuando se decida implementar. Como mínimo:

1. Roundtrip por tipo: cada tipo de §3.1 sobrevive escritura y lectura.
2. Rango: un valor fuera del ancho declarado es error de validación, no truncamiento.
3. Bitfield: 9 booleanos ocupan 2 bytes, y el noveno se lee correctamente.
4. Aridad: `group()` anidado se escribe en línea y se lee en su posición.
5. Degradación: un schema con un solo control sin tipo sale por `json`.
6. Los números de §2 se reproducen sobre los mismos dos fixtures.

---

## 7. Fuera de alcance

- **Implementación.** Este SDD documenta la forma y la medida; no autoriza a construirlo.
- **Cambio de decisión.** Que se adopte o no depende del perfil de datos: para el blog no
  compensa (8 B de margen); para el KDS de Fudie, con tickets viajando todo el día, la
  aritmética es otra. Decisión abierta.
- **Compatibilidad hacia atrás del schema.** Cambiar el tipo de un control es un cambio de
  protocolo, más duro que reordenar campos. Sin resolver.
- **Protobuf, FlatBuffers, CBOR y demás.** Medidos como contraste (§2), descartados: exigen
  esquema aparte y dependencia de runtime, y el tipado propio los supera precisamente porque
  no necesita tags.
