/* VIRTUAL de app-badge.fud (@code neutra + @client + plantilla) */
type Tone = 'neutral' | 'success' | 'info';

const $p0 = props<{ tone?: Tone }>();
export type $Props = typeof $p0;

const { tone = 'neutral' } = $p0;

function $tpl(): void {
  $cls(tone === 'success');
  $cls(tone === 'info');
  $slot();
}
$tpl;
