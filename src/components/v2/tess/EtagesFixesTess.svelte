<script lang="ts">
  /**
   * TESS W3 — les étages fixes de la colonne « Signal path » (maquette A1) :
   * Headroom, Upsampling, Volume, puis Dither (ou le modulateur DSD).
   *
   * L'ORDRE est celui que publie le serveur — l'ordre réel de Q9 —, pas celui
   * de la maquette, qui dessine le volume avant l'upsampling. `position` dit
   * quelle part afficher autour des greffons : `avant` (Headroom), `apres`
   * (Upsampling → Volume → Dither), ou `tous`.
   *
   * Une étape éteinte reste visible, atténuée, avec son motif : elle n'est
   * jamais présentée comme active.
   */
  import { t } from '../../../lib/i18n';
  import type { ZoneTess } from '../../../lib/tess/contrat';
  import { nomEtape, resumeEtape } from '../../../lib/tess/libelles';
  import { estEtageFixe, etiquettesEtape } from '../../../lib/tess/etagesFixes';

  let { zone, position = 'tous' }: { zone: ZoneTess; position?: 'avant' | 'apres' | 'tous' } = $props();

  const etages = $derived.by(() => {
    const chemin = zone.signal_path;
    const premierGreffon = chemin.findIndex((e) => e.code === 'plugin');
    // Sans greffon, le headroom précède quand même l'upsampling : on coupe
    // après lui.
    const coupe = premierGreffon >= 0 ? premierGreffon : chemin.findIndex((e) => e.code === 'upsampling');
    return chemin
      .map((e, i) => ({ e, i }))
      .filter(({ e, i }) => estEtageFixe(e)
        && (position === 'tous' || (position === 'avant' ? coupe < 0 || i < coupe : coupe >= 0 && i >= coupe)))
      .map(({ e }) => e);
  });
</script>

{#each etages as e (e.code)}
  <div class="etage" class:eteint={!e.effective} data-etage-fixe={e.code} data-effectif={e.effective}>
    <div class="txt">
      <span class="nom">{nomEtape(e, zone, $t)}</span>
      <span class="val">{resumeEtape(e, zone, $t)}</span>
    </div>
    <span class="tags">{etiquettesEtape(e, $t).join(' · ')}</span>
  </div>
{/each}

<style>
  .etage{display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 18px;
    border:1px dashed var(--v2-line2); border-radius:12px; margin:0 0 10px}
  .etage.eteint{opacity:.55}
  .txt{display:flex; flex-direction:column; gap:3px; min-width:0}
  .nom{font-size:calc(14px * var(--v2-txt-echelle, 1)); font-weight:600; color:var(--v2-txt)}
  .val{font-size:calc(12.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt2)}
  .tags{flex:0 0 auto; font:500 calc(10.5px * var(--v2-txt-echelle, 1)) var(--v2-mono); letter-spacing:.08em; color:var(--v2-txt3)}
</style>
