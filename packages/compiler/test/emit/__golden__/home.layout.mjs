
export async function* layout(data, io, route, $ioc, $props) {
  const { createDom, serialize, escapeText, escapeAttr } = io;
  let head = '';
  head += "<meta charset=\"utf-8\">";
  head += "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">";
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
  yield* route.body($dom, $body);
  const $n1 = $dom.text(" "); $dom.append($body, $n1);
  yield* route.close($dom, $body);
  yield '</html>';
}