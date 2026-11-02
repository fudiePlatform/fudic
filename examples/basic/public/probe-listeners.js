/**
 * La sonda de `/delegacion`: cuenta cada `addEventListener` y cada `removeEventListener`
 * que ocurre en la página, y los pinta en vivo.
 *
 * No es parte de fudic: es el instrumento con el que se le mide. Vive en `public/` y no en
 * línea por dos razones, y las dos mandan — la CSP de esta app solo admite scripts propios
 * con nonce, y un script CLÁSICO corre al parsearlo, o sea **antes** que el módulo del
 * layout y antes de que se hidrate nada. Así el contador ve el primer listener del día.
 */
(function () {
  var add = EventTarget.prototype.addEventListener;
  var remove = EventTarget.prototype.removeEventListener;
  var n = { add: 0, remove: 0 };
  var slots = null;

  function paint() {
    if (slots === null) {
      var a = document.getElementById('probe-add');
      var r = document.getElementById('probe-remove');
      if (a === null || r === null) return;
      slots = { add: a, remove: r };
    }
    slots.add.textContent = String(n.add);
    slots.remove.textContent = String(n.remove);
  }

  EventTarget.prototype.addEventListener = function () {
    n.add += 1;
    paint();
    return add.apply(this, arguments);
  };
  EventTarget.prototype.removeEventListener = function () {
    n.remove += 1;
    paint();
    return remove.apply(this, arguments);
  };

  // Con el ORIGINAL, para que el instrumento no se cuente a sí mismo.
  add.call(document, 'DOMContentLoaded', function () {
    paint();
    var reset = document.getElementById('probe-reset');
    if (reset !== null) {
      add.call(reset, 'click', function () {
        n.add = 0;
        n.remove = 0;
        paint();
      });
    }
  });
})();
