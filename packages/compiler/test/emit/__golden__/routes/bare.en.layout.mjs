
export async function* layout(data, io, route, $ioc, $props) {
  const { createDom, serialize, escapeText, escapeAttr } = io;
  let head = '';
  head += "<meta charset=\"utf-8\">";
  head += route.head();
  let $open;
  {
    const $dom = io.createDom();
    const $el = $dom.element("html");
    $dom.setAttr($el, "lang", "en");
    $open = [...io.serialize($el)][0].slice(0, -1);
  }
  $open += '>';
  yield '<!DOCTYPE html>' + $open + '<head>' + head + '</head>';
  const $dom = createDom();
  const $body = $dom.element('body');
  yield* route.open($dom, $body);
  const $n0 = $dom.element("main");
  $dom.append($body, $n0);
  yield* route.body($dom, $n0);
  yield* route.close($dom, $body);
  yield '</html>';
}