# IDEA-05 — El contrato es TS y el backend se genera

> **Estado:** `Idea` — no es un SDD. Sin interfaz pública, sin criterios de aceptación, sin
> rango de diagnósticos. Captura la conversación del **2026-10-19** que cierra el estudio de
> viabilidad de [IDEA-03](./IDEA-03-backend-poliglota.md). **Manda sobre IDEA-03** donde la
> contradiga (§2, §3.2, §6 y §8).
> **Paquetes implicados (previsión):** `@fudic/compiler` (contrato, plan de render, emisores) ·
> `@fudic/http` · `@fudic/forms` (tipos y binario) · `@fudic/language-server` · un runtime por
> lenguaje, fuera del monorepo TS.
> **Veredicto:** factible para Node/TS, C#, Java/Kotlin, Go y Rust (§9).

---

## 1. La idea en una frase

El `.fud` es vista + cliente. El servidor es un **contrato en TS** enlazado con
`<link rel="server">`. Al guardarlo, fudic genera la interfaz en el lenguaje del backend; si la
implementación no la cumple, **el compilador del backend falla**. La vista se traduce a código
nativo de ese lenguaje.

## 2. Por qué el contrato es TS

- **Los equipos se reparten así**, sobre todo al principio: gente fuerte en HTML, CSS y JS/TS que
  hace componentes y rutas, y perfiles de backend que escriben los controladores. El contrato
  queda al lado de quien hace la vista; el backend recibe su interfaz ya generada y la
  implementa. El contrato es el punto de encuentro.
- **Una sola pieza lo lee: Oxc**, que ya está en el compilador. Ni dependencias nuevas ni un
  extractor por lenguaje.
- **El editor tipa el `.fud` al guardar el contrato**, con cualquier backend: los dos son TS.
- **Sin reflexión.** La tendencia es compilar a nativo (NativeAOT en C#, GraalVM `native-image` y
  el AOT de Spring Boot 3 en Java); el código generado encaja ahí.

### Lo que se descartó por el camino

| Vía | Por qué no |
|---|---|
| `@server` inline (también en Node) | Handlers mezclados con markup: código espagueti |
| OpenAPI | Verboso, modela HTTP y no funciones, generadores desiguales |
| Protobuf como contrato | Mensajes envoltorio para cada llamada, números de campo; y no es el lenguaje de nadie del equipo |
| Interfaz nativa + extractor por lenguaje (IDEA-03 §8) | Siete herramientas distintas (Roslyn, annotation processors, `go/types`, `syn`, libclang…), una por lenguaje |
| Reflexión en runtime | Choca con AOT |
| Intérprete de la vista por lenguaje | Ver §5: se genera, por velocidad |

## 3. El contrato

```html
<link rel="server" href="../server/usuarios.ts">
```

```ts
import type { auth } from "../middlewares/auth";
import type { audit } from "../middlewares/audit";

interface Usuarios {
  load(): UsuariosData;
  search: Get<(q: string) => Person[]>;
  save:   Put<(id: i32, active: boolean) => void, [typeof auth]>;
  remove: Delete<(id: i32) => void, [typeof auth, typeof audit]>;
}
```

- **Interfaz con tipos marcadores.** TS no admite decoradores en una `interface` ni en sus
  miembros (Oxc sí los parsea; el límite es TS).
- **Nada de strings mágicos.** Un middleware se nombra por import (`typeof auth`): el compilador
  sigue el import hasta fichero + export, como con cualquier `<link>`.
- **Oxc parsea pero no resuelve tipos.** El generador sigue los imports y resuelve él los tipos;
  solo es viable con el subconjunto de §3.2. tsc sigue validando el contrato en el editor.

### 3.1. Lo que hoy declara `@fudic/http`, y dónde queda

Leído `@fudic/http` entero: **el builder sin `.handle` ya es el contrato**. Todo lo demás lo
necesita el cliente.

| Pieza | Qué hace hoy | Con otro backend |
|---|---|---|
| Verbo | GET manda `?a=JSON`, el resto body; un no-GET invalida la página en el SW; el servidor da 405 si no coincide | Contrato |
| `.args<T>()` y el resultado | Tipos de las dos mitades | Contrato |
| `.form(f)` | Cliente valida y manda posicional/binario; servidor decodifica por schema y valida una copia | Contrato; validadores declarativos portados por fudic |
| `.use` / `.skip` | Middlewares por identidad, con mitad cliente y mitad servidor; `Adds` tipa `ctx` | Contrato, por import |
| `.invalidates` · `.compress` | Solo cliente | Contrato |
| `.handle(ctx)` | Solo servidor | **Nativo: lo único** |
| Cadena global `src/http.ts` | Global → fichero → función | TS; el backend recibe en orden sus mitades de servidor |
| `HttpError` → `Problem` (RFC 9457) | Excepciones de ida y vuelta | Runtime por lenguaje |
| `ctx`, `inject` | Servidor | Tipo de fudic por lenguaje + el DI del anfitrión |

El fichero de un middleware se queda en TS con su mitad de cliente y lo que añade a `ctx`
(`middleware<{ user: User }>()`). La mitad de servidor es nativa: se genera una interfaz
(`AuthServer`) y un `ctx` tipado por función (`SaveCtx` con `user`).

### 3.2. Tipos admitidos en el contrato

- **Entran:** primitivos, `?` (presencia), arrays, uniones de literales (→ enum), `Date`,
  `Record<string, T>` (→ map).
- **Fuera, con diagnóstico al guardar:** genéricos, intersecciones, condicionales, mapeados,
  utilidades (`Omit<…>`).
- **Números con ancho:** los tags de `@fudic/forms` (`u8 i8 u16 i16 u32 i32 f32 f64`), que ya
  existen. `number` solo no basta para Java, C#, Go o Rust.

### 3.3. Formato de cable

El binario de forms (`wire/io.ts` + `wire/binary.ts`, unas 300 líneas, un solo recorrido para
leer y escribir) se generaliza de «schema de un form» a «tipo del contrato» y se porta a cada
lenguaje.

## 4. `fudic.json` y la generación al guardar

```json
{
  "backend": {
    "language": "csharp",
    "contracts": "../Api/Fudic.Generated",
    "namespace": "Api.Fudic"
  }
}
```

- Al guardar cada `server.ts` de ruta o componente se generan la interfaz, los DTOs, los `ctx`
  tipados y el despacho (`/_fudic/fn/...` → implementación, con el binario) en `contracts`.
- **Lo generado es de fudic** («generado, no editar»); el código del usuario vive en otros
  ficheros y nunca se toca. **Sobrescribir rompe el build del backend, no su código**: ese es el
  aviso.

| Lenguaje | Se genera | Falla |
|---|---|---|
| C# | `interface` | Al compilar (CS0535, firma distinta) |
| Java / Kotlin | `interface` | Al compilar |
| TS (Node como backend aparte) | `interface` | Al compilar (`implements`) |
| Rust | `trait` | Al compilar |
| Go | `interface` + `Register(impl Usuarios)` | Al compilar, en la llamada a `Register`: las interfaces de Go son estructurales y sin ella nadie lo comprueba |

## 5. El render se genera

Generar código nativo, no interpretar: fácil **y rápido**.

- El compilador analiza el `.fud` una vez y produce un **plan de render** tipado (trozos
  estáticos en UTF-8, huecos con su tipo, `if`/`foreach`, slots, componentes). Un **emisor
  delgado por lenguaje** lo convierte en código. El plan no existe en runtime.
- **Por qué es rápido:** los trozos estáticos son constantes de bytes escritas al stream; solo se
  escapan los huecos; los tipos se conocen al compilar (acceso directo, sin mapas ni reflexión);
  un componente es una llamada a un método. Precedentes: jte, templ, Askama/Sailfish, Razor.

## 6. La vista rellena huecos

El contrato llega resuelto: la vista no programa. Si programa, es un React con otra sintaxis y
además no se puede traducir. **Se corta la stdlib de JS.**

| Lo que se pinta (subconjunto, se traduce) | Lo que reacciona (TS completo, nunca se traduce) |
|---|---|
| `data`, props, propiedades de los tipos, lectura de señales | `@client`: señales, `effect`, funciones |
| Literales, aritmética, comparación, ternario, plantillas | Valores de `@click`, `@input`… |
| `length`; presencia: `!== undefined`, `!= null`, `?.`, `??` | Mitad de cliente de los middlewares |
| Desestructurar (`@foreach`, alias en `@{ }`) | |
| Pipes | |
| Inicializadores de señales (el servidor pinta el valor inicial) | |

- **Fuera:** métodos de la stdlib (`filter`, `map`…), `Math`/`JSON`/`Date`/`Intl`/`RegExp`,
  llamar a funciones del `@code`, `new`, flechas, `typeof`/`instanceof`/`in`, regex.
- **Presencia:** en los otros lenguajes solo hay ausente o presente; `undefined` y `null` se
  traducen igual. Decide el tipo.
- **`effect` no corre en el servidor.** Lo único que el backend necesita saber es que el
  componente hidrata al cargar (hoy `clientEffects` en `emit/level.ts`): llega como dato en el
  plan.
- **Enmienda SDD-51 para todos los backends, Node incluido**, también los `@{ }` (§3.3 de
  SDD-51 admite hoy bucles y asignaciones).
- Ejemplo que cabe entero: `examples/basic/src/components/form-errores.fud`.

## 7. Lo que trae fudic en cada lenguaje

- **Tipos** (`Issue`, `$issues()`…): fudic los escribe una vez y pasan por el mismo camino que el
  contrato del usuario. El camino queda probado con los tipos propios.
- **Lógica** (pipes, escapes, guarda de URL, número → texto, payload de hidratación, validadores
  declarativos, `Problem`, `csrf`): escrita a mano en cada runtime, con una **suite de
  conformidad común** (mismos fixtures, mismo HTML esperado).

## 8. El fake y el preview

El contrato TS basta para tener un backend falso sin escribir backend.

- **Datos, tres niveles** (cada uno sustituye al anterior): generados desde el tipo con semilla
  fija; un JSON por función cargado bajo demanda con `import(url, { with: { type: "json" } })`;
  una clase TS que implementa el contrato (mutaciones, validadores de servidor). Los errores
  también se simulan (un `Problem`).
- **Sin Service Worker:** una capa ligera sustituye el final de la cadena del stub y responde
  desde el fake. **El estado se acumula en IndexedDB**, con un botón para volver a los datos
  iniciales.
- **El build genera un preview SSG.** Los `load` corren en el build con el fake; la CSP va en
  `<meta>` con hashes (no nonce: en un HTML estático sería siempre el mismo).
- **Para qué:** que el cliente **acepte el trabajo viendo pantallas reales que responden, no un
  Figma**; y Playwright sobre esas mismas pantallas. No es un despliegue ni lleva backend detrás.

## 9. Viabilidad

**Factible.** Los dos bloqueos de antes (traducir TS arbitrario en la vista, siete extractores)
desaparecen. Lo difícil ya existe: binario, tipos con ancho, middlewares de dos mitades.

Dónde está el coste:

1. **Cinco runtimes sincronizados.** Cada función nueva de fudic se multiplica por cinco; la
   suite de conformidad es lo único que lo controla.
2. **El payload de hidratación byte a byte y número → texto** con la semántica de JS. Poco código;
   un fallo rompe la hidratación sin que se vea.
3. **La enmienda de SDD-51** rompe los `.fud` que hoy usan la stdlib en la vista.

**Prueba propuesta:** la ruta `usuarios` entera en un lenguaje (C# o Java): contrato TS, interfaz
generada, render nativo, binario, `auth` y fake. Si sale, el resto es repetir; si se atasca, se
sabe en qué pieza.

## 10. Alcance

**Dentro:** Node/TS, C#, Java/Kotlin, Go, Rust.

**Aparcado:**

- **Python.** `typing.Protocol` es estructural y solo lo comprueba un type checker. Candidato:
  `abc.ABC` + `@abstractmethod` con herencia explícita (falta un método → `TypeError` al
  arrancar) y type hints para pyright/mypy (firmas).
- **C++.** Clase abstracta + `override` + registro generado; el más caro de todos (sin servidor
  web dominante, memoria, CMake).
- **Publicar el preview en los artifacts de Anthropic.**

## 11. Abierto

1. Cómo se escribe en los tipos marcadores una función con `.form`, y dónde van `invalidates` y
   `compress`.
2. `serverValidator` es código de servidor dentro del form (`person.form.ts` lee la tabla de
   personas): tiene que ser un hueco con nombre que implementa el backend.
3. `pattern(/regex/)` se valida en el servidor y el dialecto de regex de Java/Go/Rust no es el de
   JS: acotarlo.
4. Enteros de 64 bits: forms no los tiene y los ids `long` son habituales.
5. `SharedMiddleware` (una función para los dos lados, `log`) no puede existir con otro backend:
   tiene que ser un middleware de dos mitades.
6. Nombre de la interfaz a partir de la ruta o el componente (`blog/[slug]` → `BlogSlug`), y
   separar rutas de componentes con el mismo nombre (hoy `r/` y `c/` en la URL).
7. El `load` del preview tiene que leer de IndexedDB en el cliente: si no, tras un `remove` y
   una recarga el HTML estático vuelve a mostrar lo borrado.
