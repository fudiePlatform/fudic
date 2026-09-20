# SDD-45 — Catálogo de piezas

> Acompaña a [SDD-45](./SDD-45-runtime-publicado.md). Qué hace cada fichero publicado en
> `/_fudic/<version>/`, en tres líneas o menos. **27 piezas, 22 124 bytes.**
>
> Cada una dice su tamaño y su clase: **arranque** si la pone en marcha el coordinador de la
> ruta (§3.4), **biblioteca** si la importa quien la necesita. Las medidas salen del build de
> hoy; el banco de `examples/pieces-bench` enseña cuáles descarga cada escenario.

---

## `@fudic/core` — 12 piezas, 11 045 B

### `core/hydrate` · 5 946 B · arranque
El runtime de hidratación entero: un escuchador de clic en la raíz del documento, el orden
bus → cascada → componente → repetición del gesto, la lectura de los mapas de la página y el
observador que mira qué entra en pantalla. Llega en toda página que tenga algo que hidratar.

### `core/registry` · 730 B · biblioteca
El registro de instancias hidratables: encontrar los elementos que llevan identificador,
cruzando shadow roots, y saber cuáles ya están vivos. Es pieza y no está dentro de la
hidratación porque el fabricado también la usa.

### `core/effect` · 647 B · biblioteca
Ejecuta una función, apunta de qué signals ha leído y la vuelve a ejecutar cuando alguna
cambia. Se suscribe a las hojas del grafo, no a los valores derivados. Trece de cada diecisiete
rutas del ejemplo no la piden.

### `core/warm-sw` · 578 B · arranque
El canal de calentado cuando la aplicación tiene service worker: le manda un aviso de qué
componente va a hacer falta y el worker lo descarga y lo guarda, sin ejecutarlo. Excluyente
con el siguiente.

### `core/tracking` · 525 B · biblioteca
La pieza que hace que leer un signal dentro de un cálculo registre la dependencia: una
variable con el consumidor que está corriendo ahora mismo, y nada más. Sin ella el signal
sería una caja con un valor.

### `core/computed` · 513 B · biblioteca
El valor derivado: se recalcula solo cuando algo de lo que depende ha cambiado, usando un
contador de versión en vez de suscribirse. Quince de cada diecisiete rutas del ejemplo no la
piden.

### `core/element` · 506 B · biblioteca
La clase base de todo componente hidratable. Lleva lo que es idéntico en todos —los dos puntos
de entrada, el controlador privado y el desmontaje— para que el trozo de cada componente se
quede por debajo del kilobyte.

### `core/warm-preload` · 375 B · arranque
El canal de calentado sin service worker: un `<link rel="modulepreload">` por componente, que
lo descarga y lo deja en el mapa de módulos **sin evaluarlo**. Excluyente con `warm-sw`.

### `core/subscribe` · 370 B · biblioteca
El canal por el que un componente empuja un valor a un hijo, al engancharlo y en cada cambio.
Es una función suelta y no un método a propósito: quien la usa se queda a cargo de deshacer la
suscripción.

### `core/live` · 351 B · biblioteca
El puente para un componente que no pintó el servidor —uno que nace dentro de un bucle que
crece en el navegador—. Su padre lo fabrica y esta pieza le trae la definición. La importan la
hidratación y los trozos de componente.

### `core/signal` · 320 B · biblioteca
El valor que avisa cuando cambia: leerlo y escribirlo, y nada más. Se reconstruye desde el
markup pintado, no desde un blob de estado paralelo.

### `core/channel` · 184 B · biblioteca
Lo único que comparten los dos canales de calentado: avisar de que un componente ya está
traído, para no pedirlo dos veces. **Pendiente de meterse dentro de los dos** — hacer pieza de
184 bytes cuesta más de lo que ahorra y los dos canales nunca coexisten.

---

## `@fudic/dom` — 2 piezas, 1 249 B

### `dom/browser` · 1 132 B · biblioteca
La capa fina sobre el DOM del navegador: crear elemento, texto o comentario, insertar, quitar,
poner un atributo. Una línea por método y ninguna decisión. La usa todo componente que pinte.

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

## `@fudic/forms` — 5 piezas, 2 039 B

### `forms/wiring` · 920 B · biblioteca
Lo que los seis enlazadores hacen igual: escuchar, poder deshacer el escuchador, y pintar el
error como `aria-invalid` más un texto en el hueco que el emit ya dejó. Es pieza porque la usan
dos enlazadores.

### `forms/bind-form` · 505 B · biblioteca
El `<form>` en sí, y solo su estado: hacer visibles los errores ocultos, mover el foco al
primer campo que falló y anunciarlo. No envía nada a ningún sitio; eso es del autor o del
`<form>` nativo.

### `forms/bind-text` · 324 B · biblioteca
El enlace de la forma de texto: `<input>` con un tipo textual y `<textarea>`. Hay seis
enlazadores y no una función con un `switch` justamente para que la página que tiene un campo
de texto descargue este y ninguno más.

### `forms/messages` · 158 B · biblioteca
Convierte lo que devuelve un validador —la regla y contra qué se midió— en el texto que se
enseña. De dónde salen esas palabras es de la aplicación: es la costura por donde entrará la
internacionalización.

### `forms/min-length` · 132 B · biblioteca
Un validador: al menos tantos caracteres, o tantos elementos. El campo vacío no es asunto
suyo, sino del validador de obligatorio. Es el ejemplo de frontera que vale la pena aunque
pese poco: casi ninguna página lo pide.

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
