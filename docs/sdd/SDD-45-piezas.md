# SDD-45 — Catálogo de piezas

> Acompaña a [SDD-45](./SDD-45-runtime-publicado.md). Qué hace cada fichero publicado en
> `/_fudic/<version>/`, en tres líneas o menos. **41 piezas, 32 556 bytes** (15 491
> comprimidos).
>
> Cada una dice su tamaño y su clase: **arranque** si la pone en marcha el coordinador de la
> ruta (§3.4), **biblioteca** si la importa quien la necesita. Las medidas salen del build de
> hoy; el banco de `examples/pieces-bench` enseña cuáles descarga cada escenario y comprueba
> que el reparto sigue completo y sin solapes.
>
> **El reparto se deriva de lo que cada paquete exporta**, nunca de lo que un ejemplo gasta.
> Las catorce piezas que aparecieron al derivarlo —los siete enlazadores que faltaban, el
> modelo de formulario entero, el recorrido de hidratación— no son piezas nuevas: son valores
> que ya se exportaban y no tenían URL, y un import suyo no habría sabido a dónde ir.

---

## `@fudic/core` — 11 piezas, 11 230 B

### `core/hydrate` · 5 946 B · arranque
El runtime de hidratación entero: un escuchador de clic en la raíz del documento, el orden
bus → cascada → componente → repetición del gesto, la lectura de los mapas de la página y el
observador que mira qué entra en pantalla. Llega en toda página que tenga algo que hidratar.

### `core/registry` · 730 B · biblioteca
El registro de instancias hidratables: encontrar los elementos que llevan identificador,
cruzando shadow roots, y saber cuáles ya están vivos. Es pieza y no está dentro de la
hidratación porque el fabricado también la usa.

### `core/warm-sw` · 665 B · arranque
El canal de calentado cuando la aplicación tiene service worker: le manda un aviso de qué
componente va a hacer falta y el worker lo descarga y lo guarda, sin ejecutarlo. Lleva dentro
lo que comparte con su gemelo, porque los dos nunca coexisten.

### `core/effect` · 647 B · biblioteca
Ejecuta una función, apunta de qué signals ha leído y la vuelve a ejecutar cuando alguna
cambia. Se suscribe a las hojas del grafo, no a los valores derivados. Trece de cada diecisiete
rutas del ejemplo no la piden.

### `core/tracking` · 525 B · biblioteca
La pieza que hace que leer un signal dentro de un cálculo registre la dependencia: una
variable con el consumidor que está corriendo ahora mismo, y nada más. Sin ella el signal
sería una caja con un valor.

### `core/computed` · 513 B · biblioteca
El valor derivado: se recalcula solo cuando algo de lo que depende ha cambiado, usando un
contador de versión en vez de suscribirse. Quince de cada diecisiete rutas del ejemplo no la
piden.

### `core/signal` · 509 B · biblioteca
El valor que avisa cuando cambia: leerlo y escribirlo, y nada más. Publica también el
agrupado de escrituras, que vive en su mismo grafo de módulos: sacarlo a una pieza obligaría a
pedirla en toda página, porque cada escritura pasa por él.

### `core/element` · 506 B · biblioteca
La clase base de todo componente hidratable. Lleva lo que es idéntico en todos —los dos puntos
de entrada, el controlador privado y el desmontaje— para que el trozo de cada componente se
quede por debajo del kilobyte.

### `core/warm-preload` · 468 B · arranque
El canal de calentado sin service worker: un `<link rel="modulepreload">` por componente, que
lo descarga y lo deja en el mapa de módulos **sin evaluarlo**. Excluyente con `warm-sw`, y con
la misma copia dentro de lo que los dos comparten.

### `core/subscribe` · 370 B · biblioteca
El canal por el que un componente empuja un valor a un hijo, al engancharlo y en cada cambio.
Es una función suelta y no un método a propósito: quien la usa se queda a cargo de deshacer la
suscripción.

### `core/live` · 351 B · biblioteca
El puente para un componente que no pintó el servidor —uno que nace dentro de un bucle que
crece en el navegador—. Su padre lo fabrica y esta pieza le trae la definición. La importan la
hidratación y los trozos de componente.

---

## `@fudic/dom` — 3 piezas, 1 901 B

### `dom/browser` · 1 140 B · biblioteca
La capa fina sobre el DOM del navegador: crear elemento, texto o comentario, insertar, quitar,
poner un atributo. Publica también los tres espacios de nombres, que se deciden ahí dentro una
vez, al crear el elemento. La usa todo componente que pinte.

### `dom/cursor` · 644 B · biblioteca
El recorrido con el que un componente se engancha al markup que pintó el servidor: avanzar
entre hermanos, bajar a los hijos, buscar la marca de un bloque. Lo importa el código emitido
de un componente, que es la razón por la que no tenía pieza: no lo alcanza nada del runtime.

### `dom/emit` · 117 B · biblioteca
El único punto por el que un componente emite un evento de bus: nombre y detalle opcional. El
host lo inyecta el compilador y no aparece en lo que el autor escribe. Solo la descarga quien
emite; quien recibe no descarga nada.

---

## `@fudic/di` — 6 piezas, 2 531 B

### `di/resolve` · 1 114 B · biblioteca
El contenedor ambiental, que existe dentro de una fábrica y en ningún otro sitio: entra al
contenedor dueño antes de llamarla y sale en un `finally`. Es lo que hace legal pedir una
dependencia como campo de una clase de servicio.

### `di/container` · 419 B · biblioteca
El contenedor en sí: qué fábricas tiene registradas, quién es su padre y cómo se crea uno hijo.
Es datos con funciones sueltas, no un objeto con métodos, para que quien nunca destruye un
contenedor no descargue el destructor.

### `di/registry` · 388 B · biblioteca
El registro raíz de servicios, y el único estado de módulo del paquete. **Tiene que ser pieza
aunque pesara diez bytes**: dos copias serían dos registros, y un servicio dado de alta en uno
no existiría para una resolución que fuera por el otro.

### `di/page` · 386 B · arranque
Monta el árbol de contenedores de la ruta a partir del mapa que la página imprime, en memoria
y sin mirar el DOM. Llega solo en las rutas que publican ese mapa.

### `di/seed` · 176 B · biblioteca
La tabla que una página publica para que el otro lado reconstruya sus servicios. Cuelga del
contenedor raíz y no del módulo, porque un servidor que atiende a dos visitantes a la vez
pintaría a uno con los valores del otro.

### `di/token` · 48 B · biblioteca
Un identificador para inyectar algo que no es una clase. La identidad es el objeto, nunca el
nombre: dos tokens con el mismo texto son distintos, y el texto existe para que un error pueda
decir qué faltaba.

---

## `@fudic/forms` — 19 piezas, 11 634 B

El paquete que más cambió al derivar el reparto: tenía cinco piezas y catorce de sus valores
exportados no tenían URL ninguna.

### `forms/form` · 2 398 B · biblioteca
Construye el formulario a partir del esquema: los campos por su nombre, el recorrido que
valida, y el clonado que permite declarar un esquema una vez e instanciarlo por petición.
Lleva dentro el grupo, que es el mismo constructor con las reglas del grupo.

### `forms/typed` · 1 501 B · biblioteca
Las doce conversiones tipadas —enteros, decimales, booleano, texto, fecha, lista— en una sola
pieza. Cada una pesa cien bytes y una frontera cuesta ciento cincuenta: sueltas, quien usa una
pagaría el peaje ocho veces y no se llevaría nada.

### `forms/control` · 1 153 B · biblioteca
Un campo: cuatro signals —valor, errores, tocado y sucio— y la época que hace que una
validación asíncrona que llega tarde no pise a la que la adelantó. Es la hoja del modelo.

### `forms/element` · 952 B · biblioteca
La clase base de un componente que **es** un campo: el elemento asociado al formulario del
estándar, con su `ElementInternals` y el foco delegado. Solo la descarga la página que tiene
un componente así.

### `forms/wiring` · 920 B · biblioteca
Lo que los nueve enlazadores hacen igual: escuchar, poder deshacer el escuchador, y pintar el
error como `aria-invalid` más un texto en el hueco que el emit ya dejó. Es pieza porque la usan
seis de ellos.

### `forms/validators` · 643 B · biblioteca
Los ocho validadores —obligatorio, longitudes, rangos, patrón, y los dos genéricos que un autor
usa para escribir el suyo— en una pieza. Es la corrección del reparto original, donde
`minLength` tenía pieza y `required` no tenía ninguna.

### `forms/bind-by-type` · 542 B · biblioteca
El único enlace que decide en tiempo de ejecución, para el `<input type="@t">` que el
compilador no puede resolver. Importa cuatro de los otros, así que es el que no es gratis, y
solo lo pide el trozo del componente que escribió un tipo dinámico.

### `forms/bind-form` · 505 B · biblioteca
El `<form>` en sí, y solo su estado: hacer visibles los errores ocultos, mover el foco al
primer campo que falló y anunciarlo. No envía nada a ningún sitio; eso es del autor o del
`<form>` nativo.

### `forms/bind-radio` · 463 B · biblioteca
El único enlace que recibe una lista: un grupo de radios son N elementos que expresan un valor.
El emit los junta al compilar y escribe una sola llamada; no hay barrido del DOM buscando un
`name` compartido.

### `forms/bind-select-multiple` · 445 B · biblioteca
El `<select multiple>`, cuyo valor es una lista de cadenas. No tiene un `value` que leer: el
estado vive en cada `<option>`, así que las dos direcciones pasan por las opciones.

### `forms/bind-number` · 376 B · biblioteca
El `<input type="number">` y el deslizador. El campo vacío es nulo, ni cero ni `NaN`: cero
haría que un precio sin rellenar pareciera gratis, y `NaN` haría falsa cualquier comparación de
un validador.

### `forms/bind-checkbox` · 334 B · biblioteca
La casilla. Lo que el modelo guarda es si está marcada, nunca su `value` —que es lo que la
casilla aporta a un envío nativo cuando lo está, y vale `"on"` si el autor no escribió otra
cosa.

### `forms/bind-select` · 326 B · biblioteca
El `<select>` de una sola opción. Separado del múltiple aunque los dos sean un `<select>`,
porque guardan tipos distintos y unirlos metería una rama sobre `multiple` en el bundle de toda
página que tenga un desplegable.

### `forms/bind-text` · 324 B · biblioteca
El enlace de la forma de texto: `<input>` con un tipo textual y `<textarea>`. Hay nueve
enlazadores y no una función con un `switch` justamente para que la página que tiene un campo
de texto descargue este y ninguno más.

### `forms/bind-group` · 254 B · biblioteca
Un grupo de campos, sobre el elemento que el autor eligiera: un `<fieldset>`, un `<div>` o una
`<section>` le dan igual. Lo que añade es la semántica de que esta región del formulario es la
que está mal; dónde cae eso es maquetación.

### `forms/internals` · 192 B · biblioteca
La vista privilegiada de un nodo del modelo, escondida tras un símbolo. **Tiene que ser pieza**:
dos copias serían dos símbolos, y un campo construido a través de uno parecería vacío desde el
otro.

### `forms/messages` · 158 B · biblioteca
Convierte lo que devuelve un validador —la regla y contra qué se midió— en el texto que se
enseña. De dónde salen esas palabras es de la aplicación: es la costura por donde entrará la
internacionalización.

### `forms/server-flag` · 103 B · biblioteca
La marca que dice que una regla solo corre en el servidor, y la pregunta que la validación le
hace. Es un símbolo y nada más: dos copias y una regla marcada por una correría en el cliente,
porque la otra no reconocería la marca.

### `forms/run-rule` · 45 B · biblioteca
La única línea del paquete donde se llama a un validador. Cuarenta y cinco bytes que son pieza
porque los alcanzan el campo y el formulario, y copiarlos en los dos sería poner los mismos
bytes dos veces en el origen.

---

## `@fudic/transport` — 1 pieza, 520 B

### `transport/urls` · 520 B · biblioteca
Deriva la URL del trozo de cada componente a partir de la carpeta de la aplicación y del
identificador de construcción. La usa el coordinador. El service worker lleva su propia copia
dentro, porque `@fudic/transport` entero sigue empaquetado en él.

---

## `@fudic/ssr` — 1 pieza, 4 740 B

### `ssr/index` · 4 740 B · biblioteca
El renderizador: convierte un componente en el HTML con shadow DOM declarativo que el
navegador pinta. **Solo lo pide el service worker**, que es quien renderiza una navegación; un
documento no renderiza nunca.

---

## Lo que no es pieza, y por qué

Las excepciones se escriben en `examples/pieces-bench/check.mjs`, donde además se comprueban.
Añadir una es editar ese fichero, que es exactamente el acto deliberado que se pedía.

| qué | por qué no tiene URL |
|---|---|
| Todo `@fudic/transport` salvo `urls` | Vive dentro del service worker a propósito (§4.10): es quien abre la caché y quien enlaza, y no puede traerse a sí mismo por el camino que él implementa |
| Los seis identificadores de bloque y el predicado de las celdas | La excepción que §4.3 nombra: constantes que solo consume el emit. Están dentro de `core/hydrate`, pero nombrarlas como exports las saca de las manos del minificador y cuesta 167 bytes en la única pieza que descarga toda página que hidrata |
| `strategy` | La estrategia de una ruta es una declaración que el compilador lee del fuente. No llega a un navegador |
| `VERSION` | La versión del paquete. No la lee nadie en un navegador |
| Los nombres que exporta `@fudic/ssr` | Entran en `builtins` del worker, resueltos por el enlazador que el worker ya tiene y nunca por una URL que escriba un navegador |
