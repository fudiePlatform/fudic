/* VIRTUAL client de blog/[slug].fud — zona neutra + @client + plantilla */
import type { $Sections as $L0 } from '../layouts/_layout.fud';
import type { $Props as $C0 } from '../components/site-nav.fud';
import type { $Props as $C1 } from '../components/app-badge.fud';

type PageData = { title: string; tag: string; body: string; found: boolean };
type $Data = Awaited<ReturnType<typeof import('./slug.fud.server')['load']>>;
declare const data: $Data;

function $tpl(): void {
  $text(data.title);                       // <title>@data.title — fudic</title>
  $section<$L0>('nav');
  $attrs<$C0>({ current: 'blog' });
  $attrs<$C1>({ tone: (data.found ? 'info' : 'neutral') });
  $text(data.tag);
  $text(data.title);
  $text(data.body);
  if (data.found) {
    // hijos del then
  } else {
    // hijos del else
  }
}
$tpl;
export type { PageData };
