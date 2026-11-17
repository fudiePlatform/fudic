
export async function* layout(data, io, route, $ioc, $props) {
  const { createDom, serialize, escapeText, escapeAttr } = io;
  let { site } = $props ?? {}; site ??= ('fudic');
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
  const $n1 = $dom.element("header");
  const $n2 = $dom.text(String((site) ?? '')); $dom.append($n1, $n2);
  $dom.append($body, $n1);
  const $n3 = $dom.text(" "); $dom.append($body, $n3);
  const $n4 = $dom.element("main");
  $dom.append($body, $n4);
  yield* route.body($dom, $n4);
  const $n5 = $dom.text(" "); $dom.append($body, $n5);
  yield* route.close($dom, $body);
  yield '</html>';
}