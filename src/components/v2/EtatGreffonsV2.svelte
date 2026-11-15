<script lang="ts">
  // Panneau « État des greffons » (écran Extensions, administrateur) :
  // GET /audio-plugins/. Un refus (403), une panne ou une liste vide ne
  // montrent RIEN : pas d'erreur visible pour qui n'est pas administrateur.
  import { onMount } from 'svelte';
  import * as api from '../../lib/api';
  import { t } from '../../lib/i18n';
  import { notifications } from '../../lib/stores/notifications';
  import { lignesEtatGreffons, masquerLesCheminsLocaux, texteRapportGreffons } from '../../lib/etatGreffons';

  let etat = $state<api.EtatGreffonsAudioNatifs | null>(null);
  let copie = $state(false);
  const lignes = $derived(lignesEtatGreffons(etat?.plugins));

  onMount(async () => {
    try { etat = await api.getEtatGreffonsSansBandeau(); } catch { etat = null; }
  });

  async function copier() {
    try {
      await navigator.clipboard.writeText(texteRapportGreffons(etat?.plugins, etat ?? undefined));
      copie = true;
      setTimeout(() => { copie = false; }, 2000);
    } catch {
      notifications.error($t('common.error' as any));
    }
  }
</script>

{#if lignes.length}
  <section data-etat-greffons>
    <h3 class="sect">{$t('v2.plug.etatTitle' as any)}</h3>
    <div class="list">
      {#each lignes as g (g.id)}
        <article class="pl" class:err={!!g.error} data-etat-greffon={g.id}>
          <div class="pi">
            <div class="ph">
              <h2>{g.id}</h2>
              <span class="cat">{g.third_party ? $t('v2.plug.etatThirdParty' as any) : $t('v2.plug.etatBuiltin' as any)}</span>
              <span class="etat" class:ok={g.native_loaded && !g.error}>
                {g.native_loaded ? $t('v2.plug.etatLoaded' as any) : $t('v2.plug.etatNotLoaded' as any)}
              </span>
              {#if g.version}<span class="ver">{g.version}</span>{/if}
            </div>
            {#if g.error}<div class="why bad" data-etat-erreur>{masquerLesCheminsLocaux(g.error)}</div>{/if}
          </div>
        </article>
      {/each}
    </div>
    <p class="actions">
      <button class="lnk" data-etat-copier onclick={copier}>
        {copie ? $t('v2.plug.etatCopied' as any) : $t('v2.plug.etatCopy' as any)}
      </button>
    </p>
  </section>
{/if}

<style>
  .sect{margin:22px 0 10px; font:calc(10px * var(--v2-txt-echelle, 1)) var(--v2-mono); letter-spacing:.08em; text-transform:uppercase; color:var(--v2-txt3)}
  .list{display:flex; flex-direction:column; gap:10px}
  .pl{display:flex; align-items:flex-start; gap:20px; padding:12px 18px; border-radius:13px;
    border:1px solid var(--v2-line); background:var(--v2-surface2)}
  .pl.err{border-color:var(--v2-danger-bd)}
  .pi{flex:1; min-width:0}
  .ph{display:flex; align-items:baseline; gap:10px; flex-wrap:wrap}
  .ph h2{font-size:calc(14px * var(--v2-txt-echelle, 1)); font-weight:700}
  .ver{font:calc(10px * var(--v2-txt-echelle, 1)) var(--v2-mono); color:var(--v2-txt3)}
  .cat,.etat{font:calc(9.5px * var(--v2-txt-echelle, 1)) var(--v2-mono); letter-spacing:.08em; text-transform:uppercase; padding:2px 8px; border-radius:999px;
    color:var(--v2-txt3); border:1px solid var(--v2-line2)}
  .etat.ok{color:var(--v2-acc-tint); border-color:var(--v2-acc2)}
  .pl.err .etat{color:var(--v2-danger); border-color:var(--v2-danger-bd)}
  .why{margin-top:8px; font-size:calc(11.5px * var(--v2-txt-echelle, 1)); color:var(--v2-txt3); overflow-wrap:anywhere}
  .why.bad{color:var(--v2-danger)}
  .actions{margin-top:10px}
  .lnk{border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2); cursor:pointer;
    border-radius:var(--v2-r-pill); padding:7px 14px; font:600 calc(12px * var(--v2-txt-echelle, 1)) var(--v2-sans)}
</style>
