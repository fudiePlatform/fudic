
export async function* layout(data, io, route, $ioc, $props) {
  const { createDom, serialize, escapeText, escapeAttr } = io;
  let head = '';
  head += route.head();
  let $open;
  {
    const $dom = io.createDom();
    const $el = $dom.element("html");
    $open = [...io.serialize($el)][0].slice(0, -1);
  }
  $open += '>';
  yield '<!DOCTYPE html>' + $open + '<head>' + head + '</head>';
  const $dom = createDom();
  const $body = $dom.element('body');
  yield* route.open($dom, $body);
  const $n0 = $dom.text(" "); $dom.append($body, $n0);
  const $n1 = $dom.text(" "); $dom.append($body, $n1);
  const $n2 = $dom.element("header");
  const $n3 = $dom.text(String((site) ?? '')); $dom.append($n2, $n3);
  $dom.append($body, $n2);
  const $n4 = $dom.text(" "); $dom.append($body, $n4);
  const $n5 = $dom.element("main");
  $dom.append($body, $n5);
  yield* route.body($dom, $n5);
  const $n6 = $dom.text(" "); $dom.append($body, $n6);
  yield* route.close($dom, $body);
  yield '</html>';
}