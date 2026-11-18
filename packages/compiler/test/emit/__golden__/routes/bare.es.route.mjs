import { layout } from './_layout.mjs';

const COMPONENTS = [];

export async function* page(data, io, $ioc, $props) {
  const { serialize, escapeText, jsonBlock } = io;
  const $nonce = io.nonce ? ' nonce="' + io.nonce + '"' : '';
  yield* layout(data, io, {
    head() {
      let head = '';
      head += '<title>' + ("Inicio") + '</title>';
      return head;
    },
    runtime($inline) {
      let head = '';
      if ($inline) {
        if (io.runtime !== undefined) {
          if (io.runtime.boot !== '') {
            head += '<script type="module"' + $nonce + ' src="' + io.runtime.boot + '"></script>';
          }
        }
      } else {
        if (io.runtime !== undefined) {
          if (io.runtime.boot !== '') {
            head += '<script type="module"' + $nonce + ' src="' + io.runtime.boot + '"></script>';
          }
        }
      }
      return head;
    },
    *open($dom, $parent) {
    },
    *body($dom, $parent) {
      const $n0 = $dom.element("h1");
      const $n1 = $dom.text("Hola"); $dom.append($n0, $n1);
      $dom.append($parent, $n0);
    },
    *section(name, $dom, $parent) {
    },
    *close($dom, $parent) {
      const $state = $dom.hydrationState();
      if ($state.offsets.length > 1) {
        jsonBlock($dom, $parent, 'fud-state', [$state.offsets, $state.data]);
      }
      yield* serialize($parent);
    },
  }, $ioc, $props);
}