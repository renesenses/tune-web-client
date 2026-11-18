<script lang="ts">
  /**
   * TESS W5 — « Signal path » ouvert depuis la pastille TESS de la barre de
   * lecture (maquette A4).
   *
   * Source → TESS (ses étapes, avec leurs paramètres) → Transport → Device.
   * Badge : « Processed by TESS · 64-bit », « Bit-perfect », ou hors TESS
   * avec son motif. Tout vient de la réponse du serveur (contrat § 4 et § 7,
   * route T16) : le panneau n'invente ni étape, ni ordre, ni badge.
   */
  import { t } from '../../../lib/i18n';
  import type { ZoneTess } from '../../../lib/tess/contrat';
  import { nomEtape, resumeEtape } from '../../../lib/tess/libelles';
  import { cleBadge, libelleBadge, libelleSource, libelleTransport, lignesTess, motifHorsTess } from '../../../lib/tess/cheminTess';

  let { zone, appareil = null, onOuvrir = null }: {
    zone: ZoneTess;
    appareil?: string | null;
    onOuvrir?: (() => void) | null;
  } = $props();

  const badge = $derived(cleBadge(zone));
  const lignes = $derived(lignesTess(zone));
  const source = $derived(libelleSource(zone, $t));
  const horsTess = $derived(motifHorsTess(zone, $t));
</script>

<section class="chemin" data-tess-chemin data-badge={zone.badge}>
  <header>
    <h2>{$t('tess.signalPath.title')}</h2>
    {#if badge}
      <span class="badge" class:traite={badge === 'processed'} class:pur={badge === 'bitPerfect'} data-tess="badge">{libelleBadge(zone, $t)}</span>
    {/if}
  </header>
  {#if horsTess}
    <p class="hors" data-tess="hors-tess">{horsTess}</p>
  {/if}

  <ol class="fil">
    <li class="pas source">
      <span class="point"></span>
      <div><span class="nom">{$t('tess.step.source')}</span>{#if source}<span class="val" data-tess="source">{source}</span>{/if}</div>
    </li>
    {#if lignes.length > 0}
      <li class="pas tess" data-tess="etapes">
        <span class="point"></span>
        <div class="corps">
          <span class="nom">{$t('tess.name')}</span>
          <div class="boite">
            {#each lignes as e, i (`${e.code}-${e.plugin_id ?? i}`)}
              <div class="ligne" class:eteinte={!e.effective} data-etape={e.code} data-greffon={e.plugin_id ?? undefined}>
                <span>{nomEtape(e, zone, $t)}</span>
                <span class="val">{resumeEtape(e, zone, $t, true)}</span>
              </div>
            {/each}
          </div>
        </div>
      </li>
    {/if}
    <li class="pas">
      <span class="point"></span>
      <div><span class="nom">{$t('tess.signalPath.transport')}</span><span class="val" data-tess="transport">{libelleTransport(zone, $t)}</span></div>
    </li>
    {#if appareil}
      <li class="pas">
        <span class="point"></span>
        <div><span class="nom">{$t('tess.signalPath.device')}</span><span class="val" data-tess="appareil">{appareil}</span></div>
      </li>
    {/if}
  </ol>

  <footer>
    <p class="hint">{$t('tess.signalPath.pureHint')}</p>
    {#if onOuvrir}
      <button type="button" class="ouvrir" data-tess="ouvrir" onclick={onOuvrir}>{$t('tess.signalPath.open')}</button>
    {/if}
  </footer>
</section>

<style>
  .chemin{display:flex; flex-direction:column; gap:14px; padding:22px 24px; border:1px solid var(--v2-line);
    border-radius:var(--v2-r-card); background:var(--v2-surface); color:var(--v2-txt); font-family:var(--v2-sans); max-width:520px}
  header{display:flex; align-items:center; justify-content:space-between; gap:12px}
  h2{margin:0; font-size:calc(22px * var(--v2-txt-echelle, 1)); font-weight:700}
  .badge{padding:5px 12px; border-radius:var(--v2-r-pill); font-weight:600; font-size:calc(12.5px * var(--v2-txt-echelle, 1));
    border:1px solid var(--v2-line2); color:var(--v2-txt2)}
  .badge.traite,.badge.pur{background:var(--v2-acc1); color:var(--v2-on-acc); border-color:transparent}
  .hors{margin:0; color:var(--v2-txt2)}
  .fil{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:14px}
  .pas{display:flex; gap:14px; align-items:flex-start}
  .pas div{display:flex; flex-direction:column; gap:3px; min-width:0; flex:1}
  .point{flex:0 0 12px; height:12px; margin-top:4px; border-radius:50%; background:var(--v2-acc1)}
  .source .point{background:var(--v2-txt3)}
  .nom{font-weight:600}
  .val{color:var(--v2-txt2); font-size:calc(13px * var(--v2-txt-echelle, 1))}
  .boite{display:flex; flex-direction:column; gap:8px; padding:12px 14px; border:1px solid var(--v2-line); border-radius:12px; background:var(--v2-bg2)}
  .ligne{display:flex; justify-content:space-between; gap:16px}
  .ligne .val{text-align:right}
  .ligne.eteinte{opacity:.55}
  footer{display:flex; align-items:center; justify-content:space-between; gap:16px; padding-top:12px; border-top:1px solid var(--v2-line)}
  .hint{margin:0; font-size:calc(12px * var(--v2-txt-echelle, 1)); color:var(--v2-txt3); line-height:1.5}
  .ouvrir{flex:0 0 auto; border:0; cursor:pointer; padding:10px 20px; border-radius:var(--v2-r-pill);
    background:var(--v2-acc1); color:var(--v2-on-acc); font:600 calc(14px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
</style>
