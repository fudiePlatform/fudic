# IDEA-06 — Un lenguaje propio para el contrato (`.fudapi`)

> **Estado:** `Idea` — no es un SDD. Sin interfaz pública, sin criterios de aceptación, sin
> rango de diagnósticos. Captura la conversación del **2026-10-20**: en lugar del contrato TS de
> [IDEA-05](./IDEA-05-contrato-ts-y-backend-generado.md) §3, un lenguaje propio hermano de
> `.fudspec`. **No decide nada**: sirve para decidir si se implementa.
> **Punto de partida:** `experiments/contract-ast/sims/01-usuarios/` (`routes/usuarios.server.ts`,
> `components/user-form.server.ts`), `packages/http` (`FnBuilder`) y `packages/forms`
> (`FormOptions`, `GroupOptions`, `ControlOptions`, validadores).

---

> [!IMPORTANT]
> **Tres notas pendientes de pensar (Pedro).** Quedan abiertas a propósito; no se han hablado
> todavía y no se deben dar por resueltas en ninguna sección de este documento.
>
> 1. **Fricción fullstack / backend / frontend.** Cómo roza este modelo en cada perfil de
>    equipo y entre ellos.
> 2. **Renderización en servidor de partial views.**
> 3. **Integración con i18n.** Único dato fijado (Pedro, 2026-10-20): **i18n nunca viaja al
>    cliente**. Los textos se generan en el servidor o en el service worker; el cliente no sabe
>    nada de i18n. Cómo encajan con eso los mensajes de §4.2 sigue abierto.

---

## 1. La idea en una frase

El contrato no es TS recortado sino **un lenguaje cuyo vocabulario es exactamente lo que se puede
generar en todos los backends**. Solo declara (funciones, tipos, forms, reglas, middlewares); la
implementación vive siempre en otro fichero, en el lenguaje que toque, **TS incluido**.

## 2. Por qué un lenguaje propio

Mismo patrón que `.fudspec` (`examples/basic/src/components/app-card.fudspec`): por líneas, sin
puntuación, palabras clave del dominio, `#` como comentario y documentación.

| | Contrato TS (IDEA-05) | `.fudapi` |
|---|---|---|
| Verbo | Tipo marcador `Get<(…) => …>` | Palabra clave `get` |
| Middlewares | `[typeof auth, typeof audit]` + imports | `use auth audit`, por convención |
| Fuera del subconjunto | Se escribe y se diagnostica | No se puede escribir: el lenguaje *es* el subconjunto |
| `readonly`, `export`, `interface` | Obligatorios | No existen |
| Lector | Oxc + `scope.ts` | Parser propio, pequeño, como el de `.fudspec` |
| Para backend | Leer TS | Neutro para los dos perfiles |

Enlace con la vista por convención, como `.fud` ↔ `.fudspec`: `usuarios.fud` ↔ `usuarios.fudapi`.
El editor tipa el `.fud` con un `.d.ts` virtual generado del `.fudapi`.

## 3. Funciones: `FnBuilder` línea a línea

`FnBuilder` (`packages/http/src/builder.ts`) ya es un lenguaje por cláusulas en orden; pasa casi
uno a uno.

| `FnBuilder` | `.fudapi` |
|---|---|
| `get()` `post()` `put()` `patch()` `del()` | `get` `post` `put` `patch` `delete` |
| `.use(a, b)` | `use a b` (las líneas se acumulan en orden) |
| `.skip(x)` / `.skip('*')` | `skip x` / `skip *` |
| `.args<T>()` | Una línea `nombre tipo` por argumento (posicional por orden) |
| `.form(f)` | `form nombre` |
| `.invalidates(...)` | `invalidates /usuarios /blog/[slug]` |
| `.compress({ format, min })` / `false` | `compress gzip 200` / `compress off` |
| `.handle(fn)` | No existe; `-> Tipo` declara lo que `handle` inferiría |
| `C & AddsOf<M>` | Nada: el generador compone el `ctx` desde los `use` |

Cadena global → fichero → función con dos niveles de sangrado:

```
# src/http.fudapi
global
  use log
  compress gzip 200
```

```
route usuarios
  use auth                      # every function of this file

# Per request: the list changes with every new person.
load ssr
  users  Person[]

# Public: no auth.
get search
  skip auth
  q  string
  -> Person[]

put save
  invalidates /usuarios
  id      i32
  active  bool

delete remove
  use audit                     # after auth, which it inherits
  invalidates /usuarios
  id  i32

type Person
  id      i32
  name    string
  email   string
  age     u8
  active  bool
  notes   string
```

Las opciones son literales: `compress gzip 200` no admite variables, así que el generador nunca
evalúa código.

## 4. Forms: todo lo que se declara

Inventario de `packages/forms/src` para que no se escape nada.

### 4.1. Inventario

- **`FormOptions`:** `summary` (regla del form, puede ser asíncrona), `messages`, `validateOn`
  (flags `Submit 0 · Blur 1 · Input 2`, defecto `Blur | Input`), `validity` (`Rules |
  Interacted`, defecto `Interacted`), `catches` (defecto `400 409 422`).
- **`GroupOptions`:** validators del grupo (su summary), `messages`, `validateOn`, `validity`.
- **`ControlOptions`:** `messages`, `validateOn`, `validity`.
- **Nodos:** `control()` sin tag; `str bool u8 i8 u16 i16 u32 i32 f32 f64 date arr(of)`; `group`.
  El orden de claves es el contrato posicional del cable; ningún campo empieza por `$`.
- **Reglas** `(value, root)`, se muestra la primera que falla, el rango del tag va primero:
  `required`, `minLength n`, `maxLength n`, `min n`, `max n`, `pattern re`, `validator(fn)` (dos
  lados), `asyncValidator(fn)` (dos lados, `$valid()` lee su veredicto), `serverValidator(fn)`
  (solo servidor). Con `root` cualquier regla de control puede mirar otro campo.
- **Textos:** control/grupo/form → `setMessages` → `BUILT_IN.server` → el código. Un mensaje es
  función del argumento del error; `server` (`SERVER_RULE`) recibe el `Problem`.
- **No se declara:** la API `$…` y la del control. Sale del form; un runtime de backend necesita
  `$fresh`, `$set` posicional, `$validate({ server: true })` y `$errors` para el 422.

### 4.2. En `.fudapi`

```
form usuario
  validate-on blur input
  validity interacted
  catches 400 409 422 403

  name  str = ""
    required            "Escribe tu nombre."

  alias  str = ""
    validate-on submit
    required            "Elige un alias."
    min-length 3        "El alias necesita al menos {n} caracteres."
    taken               "Ese alias ya está cogido."

  email  str = ""
    required            "Escribe tu email."
    pattern email       "Ese email no parece válido."

  edad  u8
    validity rules
    range               "Escribe un número entre 0 y 255."
    required            "Escribe la edad."
    min 18              "Tiene que tener al menos {n} años."

  etiquetas  str[] = []
    max-length 5        "Como mucho {n} etiquetas."

  acceso  group
    clave  str = ""
      required          "Elige una contraseña."
      min-length 8      "Mínimo {n} caracteres."
    repetir  str = ""
      required          "Repite la contraseña."
    same clave repetir  "Las contraseñas no coinciden."

  summary
    server reserved     "Ese nombre está reservado."
    server              "{detail}"
```

```
# src/messages.fudapi — what setMessages is today
messages
  required              "Este campo es obligatorio."
```

- Cada campo tiene tipo: `control()` sin tag no existe en el contrato.
- Mensajes como plantillas (`{n}`, `{at}`, `{detail}`), no funciones: nada que portar.
- `pattern` por nombre: del catálogo de fudic o declarado por el usuario; el emit lo traduce a
  cada lenguaje (§4.4).
- `required` garantiza presencia: el DTO del servidor lleva `u8`, no `u8?` (huecos en §8.7).
- `range` no añade una regla: el rango ya lo comprueba el tag (`u8`). La línea solo le da texto
  a esa comprobación implícita, que sigue yendo primero.
- `validate-on` y `validity` son de presentación: el generador de backend los ignora.
- `taken` es una `rule` con `runs server` (§7): se escribe bajo el campo y su error se pinta en
  el campo. `server reserved` en el `summary` no tiene campo. Ver §4.3.
- Los textos no forman parte de la validación: el servidor devuelve códigos. Dónde se resuelven
  a texto lo condiciona la nota 3 (nunca en el cliente).

### 4.3. Dónde aterriza cada error

| Se escribe | Lo comprueba | Se pinta |
|---|---|---|
| Regla bajo un campo | Según la regla | Slot del campo + summary con `href` |
| Regla de `summary` | Según la regla | Summary, sin `href` (o el campo con `on campo`) |
| `fails codigo` en la función | Servidor (`handle`) | Summary |

Con todo declarado, `catches` puede derivarse: **lo declarado se pinta, lo no declarado va a
`errorPages`**. Si se deriva, la línea `catches` del ejemplo de §4.2 sobra; abierto (§8.6).

Hay tres formas de que el servidor rechace, y no son lo mismo:

- **`rule` con `runs server` bajo un campo** (`taken`): comprobación declarada, ligada al campo.
- **`server nombre` en el `summary`** (`reserved`): comprobación declarada, sin campo.
- **`fails codigo` en la función**: el `handle` rechaza por su cuenta.

Abierto (§8.6): si `server reserved` en el `summary` declara una comprobación o solo dice cómo se
pinta un código que una función puede devolver con `fails reserved`. Ahora mismo las dos
lecturas caben.

### 4.4. Patrones

> **Principio (Pedro, 2026-10-20).** Un form se valida en el frontend por usabilidad y en el
> backend por seguridad. Si fudic es políglota, que los dos lados den **el mismo veredicto** es
> responsabilidad de fudic, no del usuario.

Para `pattern` eso se traduce así:

- **Patrones del usuario, no solo el catálogo.** Se declaran en `.fudapi` como `rule` y
  `middleware`; el catálogo (`email`, `url`…) es el `.fudapi` que publica `@fudic/forms` (§7).

  ```
  # patterns/postal-es.fudapi
  pattern postal-es  \d{5}
  pattern sku        [A-Z]{3}-\d{4}
  ```

- **Se admiten `\d \w \s \b .` y flags; el emit los traduce.** La semántica de referencia es la
  del navegador (JS sin flag `u`), porque el cliente siempre es JS. Cada backend recibe la regex
  reescrita para que signifique lo mismo:

  | Se escribe | Significa (JS) | Ejemplo de emit |
  |---|---|---|
  | `\d` | `[0-9]` | `[0-9]` en .NET (su `\d` es Unicode) |
  | `\w` | `[A-Za-z0-9_]` | Clase explícita en .NET / Python |
  | `\s` | Espacios de JS, Unicode incluidos | Clase completa donde `\s` es ASCII |
  | `.` | Todo salvo `\n \r \u2028 \u2029` | `[^\n\r\u2028\u2029]` |
  | `\b` | Frontera ASCII | Compuesta donde `\b` es Unicode |
  | `i` | Reglas de JS | `(?i)`, verificando equivalencia por motor |

- **Match completo implícito; el vacío pasa** (lo rechaza `required`). Hoy `pattern.ts` usa
  `test`, que busca en cualquier parte: el contrato lo fija y el emit ancla `^(?:…)$` en todos.
- **fudic parsea la regex**: parser propio, sin dependencias, a un AST que se emite por destino.
  Da diagnósticos con span en el `.fudapi` y hover/resaltado en el editor.
- **Lo intraducible.** Lookaround y backreferences no existen en RE2 (Go, crate `regex`).
  Propuesta, sin decidir: fuera del lenguaje siempre, para que el contrato no dependa de los
  backends de `fudic.json`; lo que no quepa es una `rule` de servidor.
- **Argumento del mensaje:** hoy el error lleva `{ pattern: source }`; con patrones con nombre
  debería llevar el nombre (§8.3).
- **`email` del catálogo** = la regex de `input type=email` de WHATWG, para que la validación
  nativa del navegador y la de fudic no se contradigan.

## 5. El summary tiene dos significados

1. **Regla de negocio que el cliente adelanta por usabilidad** y que el servidor tiene que volver
   a comprobar (el cliente no es de fiar).
2. **Regla que solo puede comprobar el servidor** (necesita datos: `reserved`, `taken`).

Para la primera, la propuesta es **declararla y que fudic la genere en los dos lados**, con un
subconjunto de expresiones cerrado. Caso inventado: inscribirse en el censo exige nombre válido y
edad > 18.

```
form persona
  name  str = ""
    required              "Escribe el nombre."
  age  u8
    required              "Escribe la edad."
  censo  bool = false

  summary
    when censo
      require censo-nombre  valid name          "Para el censo el nombre tiene que ser válido."
      require censo-edad    age > 18  on age    "Para inscribirse en el censo hay que ser mayor de 18."
```

Subconjunto: campos por ruta, literales, `== != < <= > >=`, `and or not`, `valid campo`,
`empty campo`, `length campo`, bloques `when`. Es la misma familia que la vista de IDEA-05 §6:
**un traductor de expresiones por lenguaje** podría servir a los dos.

| Declaración | Corre | La escribe |
|---|---|---|
| `require … expresión` | Cliente y servidor | **fudic**, generada en los dos |
| `server nombre` | Servidor | El backend (hueco) |
| `client nombre` | Solo cliente, sin respaldo | TS (hueco) |
| `both nombre` | Cliente y servidor | TS **y** backend (hueco doble, escape) |

> [!NOTE]
> El principio de §4.4 (mismo veredicto en los dos lados) pone en cuestión `client`: deja una
> regla sin respaldo en servidor. Pendiente: si sobrevive solo como aviso de UX que no bloquea.
> `both` se queda: es como crece el catálogo con funciones propias (§6.1); que las dos
> implementaciones coincidan es §6.4. Si ninguna regla corre en un solo lado, `valid campo`
> significa lo mismo en los dos.

## 6. Contrato generado, implementación intocable

Regla para todos los lenguajes, TS incluido: el generador escribe el contrato (tipos, interfaces,
traits), **nunca la implementación**. Si el contrato cambia, falla el compilador de la
implementación; no se pisa código.

### 6.1. Flujo: una regla propia en TS, Rust y Java

Ejemplo: `min-age`, una función que no cabe en un patrón, con un argumento y reutilizable en
cualquier form.

**Paso 1. Declararla** (una vez). Al guardar el fichero ya sale en el autocompletado bajo
cualquier campo `date`, aunque no haya implementación.

```
# rules/min-age.fudapi
rule min-age
  on field date
  runs both
  years  u8
  fails too-young  years
```

**Paso 2. fudic genera el contrato** en cada lenguaje. Se regenera siempre y no se toca. La
implementación solo responde sí o no: el error (`too-young` con `years`) lo monta el código
generado a partir de la declaración.

```ts
// generated (TS)
export type MinAge = (value: FudDate, args: { years: number }) => boolean;
```

```rust
// generated (Rust)
pub trait MinAge {
    fn check(&self, value: Date, years: u8) -> bool;
}
```

```java
// generated (Java)
public interface MinAge {
    boolean check(LocalDate value, int years);   // u8 -> int: Java has no unsigned
}
```

**Paso 3. El desarrollador la implementa.** Es su código y nunca se regenera.

```ts
// rules/min-age.ts
import type { MinAge } from 'fudic:rules/min-age';

export default ((value, { years }) => yearsSince(value) >= years) satisfies MinAge;
```

```rust
// src/rules/min_age.rs
pub struct MinAgeRule;

impl MinAge for MinAgeRule {
    fn check(&self, value: Date, years: u8) -> bool {
        years_since(value) >= years as i32
    }
}
```

```java
// app/rules/MinAgeRule.java
public final class MinAgeRule implements MinAge {
    public boolean check(LocalDate value, int years) {
        return Period.between(value, LocalDate.now()).getYears() >= years;
    }
}
```

En Java no hace falta un método estático: es una clase que implementa una interfaz. Al ser una
instancia puede recibir dependencias por constructor (una `taken` recibe el repositorio, como un
bean de Spring).

**Paso 4. El código generado la encuentra por convención** de nombre y ubicación. Si no existe,
falla la compilación de ese lenguaje.

| Lenguaje | El código generado espera | Si falta |
|---|---|---|
| TS | `rules/min-age.ts` con `export default` | Error de `tsc` |
| Rust | `crate::rules::min_age::MinAgeRule` | Error de `cargo build` |
| Java | `app.rules.MinAgeRule` | Error de `javac` |

`runs both` exige las dos implementaciones (TS y backend); `runs server`, solo la del backend.

**Paso 5. Usarla** en cualquier form:

```
form registro
  nacimiento  date
    required          "Escribe tu fecha de nacimiento."
    min-age 18        "Tienes que tener al menos {years} años."
```

### 6.2. Middlewares: el mismo flujo

```
# middlewares/auth.fudapi
middleware auth
  adds
    user  User
  fails unauthorized
```

```rust
// generated (Rust)
pub trait Auth {
    fn run(&self, req: &Request) -> Result<AuthAdds, Unauthorized>;
}
pub struct AuthAdds { pub user: User }
```

```java
// generated (Java)
public interface Auth {
    AuthAdds run(Request req) throws Unauthorized;
}
```

El desarrollador implementa `AuthMiddleware` en `middlewares/` y el código generado lo encuentra
por convención. Lo que declara `adds` llega tipado al `ctx` de toda función con `use auth`, en el
backend y en el `.fud`.

### 6.3. El catálogo no tiene techo

El catálogo de fudic (`required`, `min`, `email`, `csrf`…) sigue **este mismo camino**: un
`.fudapi` más una implementación por lenguaje. No tiene ningún privilegio, así que lo de la
aplicación o de un paquete de terceros tampoco tiene límite.

### 6.4. Abierto: que las dos implementaciones hagan lo mismo

Con `runs both` el desarrollador escribe la regla dos veces (TS y backend) y fudic no puede
garantizar que coincidan. Propuesta: ejemplos en la declaración que se emiten como el mismo test
en cada lenguaje.

```
rule min-age
  ...
  ok  "2000-01-01"  18
  ko  "2020-01-01"  18
```

## 7. Extensiones: el `.fudapi` es el registro

**Lo que hoy tiene parado llevar estas ideas a SDD:** cómo descubre el editor los middlewares y
los validadores propios para el autocomplete, en los dos mundos. Hoy algo existe porque hay un
`export` de JS, y eso solo lo sabe quien ejecuta TS; en políglota no hay TS que leer.

Propuesta: **toda extensión se declara en `.fudapi`**; el editor solo indexa `.fudapi`.

```
# rules/same.fudapi
rule same
  on group                     # field | group | summary
  a  field
  b  field
  fails mismatch

# rules/taken.fudapi
rule taken
  on field str
  runs server                  # client | server | both
  fails taken

# rules/min-age.fudapi
rule min-age
  on field date
  runs both
  years  u8
  fails too-young  years       # {years} reaches the message
```

```
# middlewares/auth.fudapi
middleware auth
  client                       # TS half    → AuthClient
  server                       # native half → AuthServer
  adds
    user  User
  fails unauthorized
```

- `runs` decide qué contratos se generan (TS, backend o los dos). En el form basta `taken`: la
  declaración sabe dónde corre.
- `adds` tipa `ctx` en el backend y en el `.fud` (hoy `middleware<{ user: User }>()`).
- **Índice del language server:** todos los `.fudapi` del proyecto y de los paquetes. Lenguaje
  cerrado → resolver un nombre es mirar una tabla; sin type checker.

| Cursor | Ofrece |
|---|---|
| `use ▌` | Middlewares, con su `adds` en el hover |
| `skip ▌` | Solo los que esa función hereda |
| Regla bajo un `str` | Las `rule` con `on field str` |
| `same ▌` en un `group` | Los campos del grupo (parámetro `field`) |
| `min-age ▌` | Un `u8` |
| `pattern ▌` | El catálogo de patrones |
| Texto de una regla | Sus argumentos (`{years}`); uno desconocido es error |
| `form ▌` | Los `form` del índice |

- **Los built-ins no son especiales:** `@fudic/forms` publica `rules.fudapi` (`required`, `min`…)
  y `@fudic/http` el de `csrf`. Mismo camino que lo del usuario (IDEA-05 §7).
- **Paquetes de terceros:** declaran sus `.fudapi` en `package.json`
  (`"fudic": { "api": [...] }`) y la app los activa en `fudic.json`. Sin imports en los
  contratos: `middlewares/`, `rules/` y los paquetes activados son visibles por convención.
- La implementación nativa del paquete (NuGet, crate…) no la necesita el editor, solo el
  compilador del backend.

## 8. Abierto

1. ~~`validator(fn)` de dos lados~~: resuelto en §6.1 (Pedro, 2026-10-20). Una función propia
   se declara como `rule … runs both` y se implementa en cada lenguaje. Queda §6.4 y la nota de
   §5 sobre `client`.
2. `asyncValidator`: ¿su uso real es solo preguntar al servidor antes del submit (`server … early`
   con stub generado)? Mirar `examples/`.
3. Argumentos de los códigos propios: qué campos trae un `fails` para su plantilla. En §6.1 son
   argumentos de la regla (`years`); falta ver si un `fails` puede llevar datos calculados.
4. Vocabulario de tipos neutro: `bool`/`boolean`, `string?`, `map string T`, uniones → enum.
   Incluye el mapeo a lenguajes sin unsigned (`u8` → `int` en Java).
5. Una sola forma en bloque, o también la compacta de una línea para funciones cortas.
6. Rechazos de servidor (§4.3): qué es `server reserved` en el `summary`, y si `catches` se
   deriva siempre o se puede escribir.
7. Presencia: un campo sin valor por defecto y sin `required` (`u8?` en el DTO), y un
   `required` dentro de un `when`, que solo obliga a veces.
8. Sintaxis bajo un campo: un campo hijo (`clave str`) y una regla con argumentos
   (`same clave repetir`) solo se distinguen por el segundo token. Una palabra clave delante o
   `campo: tipo` quitaría la ambigüedad.
9. Patrones: lookaround y backreferences (§4.4), aparcado.

## 9. Siguiente paso, si se sigue

En `experiments/contract-ast/`: un parser mínimo de `.fudapi`; declarar `auth`, `audit`, `same`
y `taken`; construir el índice y comprobar que resuelve todos los nombres de `usuarios` y
`user-form`, y que el `model.json` coincide con el que hoy sale de Oxc.
