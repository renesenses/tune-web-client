<script lang="ts">
  /**
   * Réglages › Bibliothèque — « Détecter les faux Hi-Res » (décision de
   * Bertrand du 13/11/2026, rc12 ; tune-server-rust#6285).
   *
   * Un interrupteur, éteint par défaut, sur `GET/POST /library/hires-check`.
   * Le serveur rc12 montre le verdict « douteux » quand la détection
   * s'allume. Un serveur sans la route ne montre rien : pas de ligne morte.
   */
  import { onMount } from 'svelte';
  import { t } from '../../lib/i18n';
  import { formatNombre } from '../../lib/formats';
  import * as api from '../../lib/api';
  import { avancementFauxHiRes } from '../../lib/filtreHiRes';

  let etat = $state<api.EtatFauxHiRes | null>(null);
  let enVol = $state(false);
  let erreur = $state('');
  let vivant = false;

  async function relire() {
    try {
      const e = await api.getEtatFauxHiRes();
      if (vivant && e && typeof e.active === 'boolean') etat = e;
    } catch { /* serveur antérieur : la ligne reste absente */ }
  }
  async function basculer(active: boolean) {
    enVol = true;
    erreur = '';
    try {
      await api.setDetectionFauxHiRes(active);
      await relire();
    } catch {
      erreur = 'settings.fauxHiResError';
      // L'interrupteur revient sur l'état du serveur.
      if (etat) etat = { ...etat };
    } finally { enVol = false; }
  }
  onMount(() => {
    vivant = true;
    void relire();
    // L'avancement bouge lentement (tâche de fond) : une relecture toutes les 15 s suffit.
    const minuterie = setInterval(() => { if (etat?.active && (etat.restantes ?? 0) > 0) void relire(); }, 15000);
    return () => { vivant = false; clearInterval(minuterie); };
  });
  const avancement = $derived(avancementFauxHiRes(etat));
</script>

{#if etat}
  <div class="row" data-faux-hires>
    <div class="lbl">
      <span>{$t('settings.fauxHiRes' as any)}</span>
      <span class="hint">{$t('settings.fauxHiResHint' as any)}</span>
      {#if avancement}
        <span class="hint" role="status" data-faux-hires-avancement>{avancement.cle === 'settings.fauxHiResProgress'
          ? $t(avancement.cle as any).replace('{d}', $formatNombre(avancement.rangees)).replace('{r}', $formatNombre(avancement.restantes))
          : $t(avancement.cle as any).replace('{d}', $formatNombre(avancement.rangees))}</span>
      {/if}
    </div>
    <label class="sw">
      <input type="checkbox" checked={etat.active} disabled={enVol} aria-label={$t('settings.fauxHiRes' as any)}
        onchange={(e) => basculer((e.currentTarget as HTMLInputElement).checked)} />
      <span class="slider"></span>
    </label>
  </div>
  {#if erreur}<p class="errline" role="alert">{$t(erreur as any)}</p>{/if}
{/if}

<style>
  /* Mêmes lignes que Réglages › Bibliothèque (SettingsV2) : styles scopés. */
  .row{display:flex; align-items:center; justify-content:space-between; gap:20px; margin-top:12px}
  .lbl{display:flex; flex-direction:column; gap:4px; min-width:0}
  @media (max-width:640px){
    .row{flex-wrap:wrap; row-gap:8px}
    .row > .lbl{flex:1 1 200px}
  }
  .lbl span:first-child{font-size:calc(13.5px * var(--v2-txt-echelle, 1)); font-weight:500}
  .hint{font-size:calc(11.5px * var(--v2-txt-echelle, 1)); line-height:1.45; color:var(--v2-txt3)}
  .sw{position:relative; flex:0 0 auto; width:44px; height:25px; cursor:pointer}
  .sw input{position:absolute; opacity:0; width:0; height:0}
  .slider{position:absolute; inset:0; border-radius:999px; background:var(--v2-line2); transition:.18s}
  .slider::before{content:""; position:absolute; left:3px; top:3px; width:19px; height:19px; border-radius:50%;
    background:var(--v2-knob); transition:.18s}
  .sw input:checked + .slider{background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .sw input:checked + .slider::before{transform:translateX(19px)}
  .sw input:focus-visible + .slider{box-shadow:0 0 0 3px var(--v2-focus)}
  .errline{margin-top:10px; font-size:calc(12px * var(--v2-txt-echelle, 1)); color:var(--v2-danger)}
</style>
