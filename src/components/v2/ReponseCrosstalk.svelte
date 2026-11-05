<script lang="ts">
  /**
   * Crosstalk — la réponse en fréquence envoyée aux enceintes pour le réglage
   * choisi (son latéral et centre, 20 Hz → 20 kHz, échelle log), bande traitée
   * visible. Les chiffres viennent du greffon (`diagnostics.speaker_response`).
   */
  import { t } from '../../lib/i18n';
  import {
    TRACE_CROSSTALK as T,
    dbSigne,
    traceReponseCrosstalk,
    type ReponseCrosstalk,
  } from '../../lib/crosstalk';

  let { reponse }: { reponse: ReponseCrosstalk } = $props();

  const trace = $derived(traceReponseCrosstalk(reponse));
  const resume = $derived(
    $t('v2.xtc.responseSummary' as any)
      .replace('{side}', dbSigne(reponse.picSide))
      .replace('{hz}', String(Math.round(reponse.picSideHz)))
      .replace('{min}', dbSigne(reponse.centreMin))
      .replace('{max}', dbSigne(reponse.centreMax)),
  );
</script>

<div class="reponse" data-xtc="reponse">
  <div class="tete">
    <span class="titre">{$t('v2.xtc.response' as any)}</span>
    <span class="legende">
      <span class="cle side"><i></i>{$t('v2.xtc.curveSide' as any)}</span>
      <span class="cle centre"><i></i>{$t('v2.xtc.curveCentre' as any)}</span>
      <span class="cle bande"><i></i>{$t('v2.xtc.responseBand' as any)}</span>
    </span>
  </div>
  <svg viewBox="0 0 {T.largeur} {T.hauteur}" role="img" aria-label={`${$t('v2.xtc.response' as any)}. ${resume}`}>
    <rect class="bande" data-xtc="reponse-bande" x={trace.bande.x1} width={Math.max(0, trace.bande.x2 - trace.bande.x1)}
      y={T.haut} height={T.hauteur - T.haut - T.bas} />
    {#each trace.graduationsY as v (v)}
      <line class="grille" class:zero={v === 0} x1={T.gauche} x2={T.largeur - T.droite} y1={trace.y(v)} y2={trace.y(v)} />
      <text class="grad" x={T.gauche - 6} y={trace.y(v) + 3.5} text-anchor="end">{v > 0 ? `+${v}` : v}</text>
    {/each}
    {#each trace.graduationsX as g (g.hz)}
      <line class="grille" x1={trace.x(g.hz)} x2={trace.x(g.hz)} y1={T.haut} y2={T.hauteur - T.bas} />
      <text class="grad" x={trace.x(g.hz)} y={T.hauteur - T.bas + 15} text-anchor="middle">{g.texte}</text>
    {/each}
    <text class="axe" x={T.gauche + (T.largeur - T.gauche - T.droite) / 2} y={T.hauteur - 3} text-anchor="middle">
      {$t('v2.xtc.responseAxisX' as any)}
    </text>
    <polyline class="trait centre" points={trace.centre} />
    <polyline class="trait side" points={trace.side} />
  </svg>
  <div class="axey">{$t('v2.xtc.responseAxisY' as any)}</div>
  <div class="resume" data-xtc="reponse-resume">{resume}</div>
  <div class="note">{$t('v2.xtc.responseNote' as any)}</div>
</div>

<style>
  .reponse{padding:16px 0 4px; display:flex; flex-direction:column; gap:6px}
  .tete{display:flex; justify-content:space-between; align-items:baseline; gap:12px; flex-wrap:wrap}
  .titre{font-size:14px; font-weight:600}
  .legende{display:flex; gap:14px; flex-wrap:wrap; font-size:11.5px; color:var(--v2-txt2)}
  .cle{display:inline-flex; align-items:center; gap:6px}
  .cle i{display:inline-block; width:16px; height:3px; border-radius:2px}
  .cle.side i{background:var(--v2-acc1)}
  .cle.centre i{background:var(--v2-txt2)}
  .cle.bande i{height:10px; background:var(--v2-acc-soft); border:1px solid var(--v2-acc2)}
  svg{width:100%; height:auto; max-width:560px; display:block; overflow:visible}
  rect.bande{fill:var(--v2-acc-soft)}
  .grille{stroke:var(--v2-line); stroke-width:1}
  .grille.zero{stroke:var(--v2-line2)}
  .grad{font:10px var(--v2-mono); fill:var(--v2-txt3)}
  .axe{font:10.5px var(--v2-sans); fill:var(--v2-txt3)}
  .trait{fill:none; stroke-width:2.5; stroke-linejoin:round; stroke-linecap:round}
  .trait.side{stroke:var(--v2-acc1)}
  .trait.centre{stroke:var(--v2-txt2)}
  .axey{font-size:10.5px; color:var(--v2-txt3)}
  .resume{font:12px var(--v2-mono); color:var(--v2-txt2)}
  .note{font-size:11.5px; line-height:1.45; color:var(--v2-txt3); max-width:60ch}
</style>
