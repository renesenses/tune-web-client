<script lang="ts">
  /**
   * web#2706 — la réponse dans le grave (simulée ou mesurée), la cible et la
   * réponse corrigée attendue, telles que le greffon `calibration` les rend.
   * Ce composant ne calcule rien : il dessine, en abscisse logarithmique.
   */
  import { t } from '../../lib/i18n';
  import { TRACE as T, tracerCourbes, libelleFrequence, type Serie } from '../../lib/correctionPiece';

  let { series, titre, modes = [] }: { series: Serie[]; titre: string; modes?: number[] } = $props();

  const trace = $derived(tracerCourbes(series));
  const LEGENDES: Record<Serie['cle'], string> = {
    mesure: 'v2.room.curveResponse',
    cible: 'v2.room.curveTarget',
    corrigee: 'v2.room.curveCorrected',
  };
</script>

<div class="courbe" data-room="courbe">
  <div class="tete">
    <span class="titre">{titre}</span>
    <span class="legende">
      {#each series as s (s.cle)}
        <span class="cle {s.cle}"><i></i>{$t(LEGENDES[s.cle] as any)}</span>
      {/each}
    </span>
  </div>
  <svg viewBox="0 0 {T.largeur} {T.hauteur}" role="img" aria-label={titre}>
    {#each trace.graduationsY as v (v)}
      <line class="grille" x1={T.gauche} x2={T.largeur - T.droite} y1={trace.y(v)} y2={trace.y(v)} />
      <text class="grad" x={T.gauche - 6} y={trace.y(v) + 3.5} text-anchor="end">{v}</text>
    {/each}
    {#each trace.graduationsX as f (f)}
      <line class="grille v" x1={trace.x(f)} x2={trace.x(f)} y1={T.haut} y2={T.hauteur - T.bas} />
      <text class="grad" x={trace.x(f)} y={T.hauteur - T.bas + 15} text-anchor="middle">{libelleFrequence(f)}</text>
    {/each}
    {#each modes as f (f)}
      <line class="mode" x1={trace.x(f)} x2={trace.x(f)} y1={T.hauteur - T.bas - 8} y2={T.hauteur - T.bas} />
    {/each}
    {#each trace.traits as tr (tr.cle)}
      {#if tr.points}<polyline class="trait {tr.cle}" points={tr.points} />{/if}
    {/each}
  </svg>
  <div class="axey">{$t('v2.room.curveAxis' as any)}</div>
</div>

<style>
  .courbe{padding:14px 0 4px; display:flex; flex-direction:column; gap:6px}
  .tete{display:flex; justify-content:space-between; align-items:baseline; gap:12px; flex-wrap:wrap}
  .titre{font-size:calc(14px * var(--v2-txt-echelle, 1)); font-weight:600}
  .legende{display:flex; gap:14px; font-size:calc(11.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt2); flex-wrap:wrap}
  .cle{display:inline-flex; align-items:center; gap:6px}
  .cle i{display:inline-block; width:16px; height:3px; border-radius:2px}
  .cle.mesure i{background:var(--v2-txt2)}
  .cle.cible i{background:var(--v2-txt3)}
  .cle.corrigee i{background:var(--v2-acc1)}
  svg{width:100%; height:auto; max-width:620px; display:block; overflow:visible}
  .grille{stroke:var(--v2-line); stroke-width:1}
  .grille.v{stroke-dasharray:2 4}
  .grad{font:calc(10px * var(--v2-txt-echelle, 1)) var(--v2-mono); fill:var(--v2-txt3)}
  .mode{stroke:var(--v2-acc2); stroke-width:1.5}
  .trait{fill:none; stroke-width:2; stroke-linejoin:round; stroke-linecap:round}
  .trait.mesure{stroke:var(--v2-txt2)}
  .trait.cible{stroke:var(--v2-txt3); stroke-dasharray:5 4}
  .trait.corrigee{stroke:var(--v2-acc1); stroke-width:2.5}
  .axey{font-size:calc(10.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt3)}
</style>
