<script lang="ts">
  /**
   * Crosstalk — la courbe séparation / coloration de la géométrie réglée.
   * Les chiffres viennent du greffon (`diagnostics.curve`) ; ce composant ne
   * fait que les dessiner : séparation en abscisse (1 → 12 dB), coloration
   * aux enceintes en ordonnée (latéral et centre), réglage en cours marqué,
   * pointillé au-delà de ce que le plafond de gain permet.
   */
  import { t } from '../../lib/i18n';
  import {
    TRACE_CROSSTALK as T,
    dbSigne,
    traceCourbeCrosstalk,
    type CourbeCrosstalk,
  } from '../../lib/crosstalk';

  let { courbe }: { courbe: CourbeCrosstalk } = $props();

  const trace = $derived(traceCourbeCrosstalk(courbe));
  const courant = $derived(courbe.courant);
  const resume = $derived(
    courant
      ? $t('v2.xtc.curveCurrent' as any)
          .replace('{sep}', courant.separation.toFixed(1))
          .replace('{side}', dbSigne(courant.side))
          .replace('{centre}', dbSigne(courant.centre))
      : '',
  );
</script>

<div class="courbe" data-xtc="courbe">
  <div class="tete">
    <span class="titre">{$t('v2.xtc.curve' as any)}</span>
    <span class="legende">
      <span class="cle side"><i></i>{$t('v2.xtc.curveSide' as any)}</span>
      <span class="cle centre"><i></i>{$t('v2.xtc.curveCentre' as any)}</span>
    </span>
  </div>
  <svg viewBox="0 0 {T.largeur} {T.hauteur}" role="img" aria-label={`${$t('v2.xtc.curve' as any)}. ${resume}`}>
    {#each trace.graduationsY as v (v)}
      <line class="grille" x1={T.gauche} x2={T.largeur - T.droite} y1={trace.y(v)} y2={trace.y(v)} />
      <text class="grad" x={T.gauche - 6} y={trace.y(v) + 3.5} text-anchor="end">{v}</text>
    {/each}
    {#each trace.graduationsX as v (v)}
      <text class="grad" x={trace.x(v)} y={T.hauteur - T.bas + 15} text-anchor="middle">{v}</text>
    {/each}
    <text class="axe" x={T.gauche + (T.largeur - T.gauche - T.droite) / 2} y={T.hauteur - 3} text-anchor="middle">
      {$t('v2.xtc.curveAxisX' as any)}
    </text>

    <polyline class="trait centre pointille" points={trace.centre.entiere} />
    <polyline class="trait side pointille" points={trace.side.entiere} />
    {#if trace.centre.atteignable}<polyline class="trait centre" points={trace.centre.atteignable} />{/if}
    {#if trace.side.atteignable}<polyline class="trait side" points={trace.side.atteignable} />{/if}

    {#if trace.courant}
      <g data-xtc="courbe-courant">
        <line class="repere" x1={trace.courant.x} x2={trace.courant.x} y1={T.haut} y2={T.hauteur - T.bas} />
        <circle class="point centre" cx={trace.courant.x} cy={trace.courant.yCentre} r="5" />
        <circle class="point side" cx={trace.courant.x} cy={trace.courant.ySide} r="5" />
      </g>
    {/if}
  </svg>
  <div class="axey">{$t('v2.xtc.curveAxisY' as any)}</div>
  {#if courant}
    <div class="resume" data-xtc="courbe-resume">
      {resume}{#if courant.plafonne}<span class="plafonne" data-xtc="courbe-plafonne"> — {$t('v2.xtc.curveCapped' as any)}</span>{/if}
    </div>
  {/if}
  <div class="note">{$t('v2.xtc.curveNote' as any)}</div>
</div>

<style>
  .courbe{padding:16px 0 4px; border-bottom:1px solid var(--v2-line); display:flex; flex-direction:column; gap:6px}
  .tete{display:flex; justify-content:space-between; align-items:baseline; gap:12px; flex-wrap:wrap}
  .titre{font-size:calc(14px * var(--v2-txt-echelle, 1)); font-weight:600}
  .legende{display:flex; gap:14px; font-size:calc(11.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt2)}
  .cle{display:inline-flex; align-items:center; gap:6px}
  .cle i{display:inline-block; width:16px; height:3px; border-radius:2px}
  .cle.side i{background:var(--v2-acc1)}
  .cle.centre i{background:var(--v2-txt2)}
  svg{width:100%; height:auto; max-width:560px; display:block; overflow:visible}
  .grille{stroke:var(--v2-line); stroke-width:1}
  .grad{font:calc(10px * var(--v2-txt-echelle, 1)) var(--v2-mono); fill:var(--v2-txt3)}
  .axe{font:calc(10.5px * var(--v2-txt-echelle, 1)) var(--v2-sans); fill:var(--v2-txt3)}
  .trait{fill:none; stroke-width:2.5; stroke-linejoin:round; stroke-linecap:round}
  .trait.side{stroke:var(--v2-acc1)}
  .trait.centre{stroke:var(--v2-txt2)}
  .trait.pointille{stroke-width:1.5; stroke-dasharray:4 4; opacity:.7}
  .repere{stroke:var(--v2-txt3); stroke-width:1; stroke-dasharray:2 3}
  .point{stroke:var(--v2-surface2); stroke-width:2}
  .point.side{fill:var(--v2-acc1)}
  .point.centre{fill:var(--v2-txt2)}
  .axey{font-size:calc(10.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt3)}
  .resume{font:calc(12px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt2)}
  .plafonne{color:var(--v2-acc-tint)}
  .note{font-size:calc(11.5px * var(--v2-txt-echelle, 1)); line-height:1.45; color:var(--v2-txt3); max-width:60ch}
</style>
