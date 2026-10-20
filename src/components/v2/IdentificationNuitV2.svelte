<script lang="ts">
  /**
   * Réglages ▸ Enrichissement : la passe de nuit de l'identification
   * (tune-server-rust#4805, décision de Bertrand du 13/10/2026). Éteinte par
   * défaut ; absente face à un serveur qui n'a pas la route.
   */
  import { untrack } from 'svelte';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { formatNombre } from '../../lib/formats';
  import { lireReglageNuit, lignesDeNuit, type ReglageNuit } from '../../lib/identificationNuit';

  let reglage = $state<ReglageNuit | null>(null);
  let occupe = $state(false);
  let erreur = $state('');

  const tr = (k: string) => $t(k as any);
  const fmt = (x: number) => $formatNombre(x);

  async function relire() {
    try {
      reglage = lireReglageNuit(await api.getIdentificationNuit());
    } catch {
      reglage = null;
    }
  }

  $effect(() => {
    untrack(() => void relire());
  });

  async function basculer(ev: Event) {
    const case_ = ev.currentTarget as HTMLInputElement;
    if (!reglage) return;
    occupe = true;
    erreur = '';
    try {
      const r = lireReglageNuit(await api.setIdentificationNuit(!reglage.active));
      if (r) reglage = r;
      else await relire();
    } catch {
      erreur = tr('v2.nuit.saveFailed');
      await relire();
    } finally {
      occupe = false;
      // La case suit l'état RELU du serveur, même quand l'écriture a échoué :
      // la valeur liée n'ayant pas changé, Svelte ne la réécrirait pas.
      if (reglage) case_.checked = reglage.active;
    }
  }
</script>

{#if reglage}
  <div class="row nuit" data-identification-nuit>
    <div class="lbl">
      <span>{$t('v2.nuit.title' as any)}</span>
      {#each lignesDeNuit(reglage, tr, fmt) as ligne}
        <span class="hint">{ligne}</span>
      {/each}
    </div>
    <label class="sw">
      <input type="checkbox" checked={reglage.active} disabled={occupe} onchange={basculer}
        aria-label={$t('v2.nuit.title' as any)} />
      <span class="slider"></span>
    </label>
  </div>
  {#if erreur}<div class="errline" data-identification-nuit-erreur>{erreur}</div>{/if}
{/if}

<style>
  .nuit{display:flex; align-items:center; justify-content:space-between; gap:24px}
  .sw{position:relative; flex:0 0 auto; width:44px; height:25px; cursor:pointer}
  .sw input{position:absolute; opacity:0; width:0; height:0}
  .slider{position:absolute; inset:0; border-radius:999px; background:var(--v2-line2); transition:.18s}
  .slider::before{content:""; position:absolute; left:3px; top:3px; width:19px; height:19px; border-radius:50%;
    background:var(--v2-knob); transition:.18s}
  .sw input:checked + .slider{background:linear-gradient(135deg,var(--v2-acc1),var(--v2-acc2))}
  .sw input:checked + .slider::before{transform:translateX(19px)}
  .sw input:focus-visible + .slider{box-shadow:0 0 0 3px var(--v2-focus)}
</style>
