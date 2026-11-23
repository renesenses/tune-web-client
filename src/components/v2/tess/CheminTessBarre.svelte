<script lang="ts">
  /**
   * TESS W5 — le chemin du signal depuis la barre de lecture (maquette A4).
   *
   * Monté dans le panneau « Chemin du signal » de la barre de lecture, au-dessus
   * des étapes historiques (source, décodeur, transport, appareil), qui restent
   * telles quelles. On y ajoute :
   *   - le badge du serveur : « Processed by TESS · 64-bit », « Bit-perfect »…
   *   - l'encadré TESS : chaque étape avec ses paramètres, DANS L'ORDRE renvoyé
   *     par le serveur (Q9 ; exception DSD) ;
   *   - « Open TESS ».
   * En mode Pure, l'encadré disparaît ; le badge reste celui du serveur
   * (« Bit-perfect » quand plus rien ne touche les échantillons).
   *
   * Rien ne s'affiche tant que le serveur n'annonce pas TESS (`capaciteTess`,
   * route en 404 ⇒ `non`) ou ne publie pas le bloc `tess` (T16) : le panneau
   * reste alors exactement celui d'avant.
   */
  import { t, tn } from '../../../lib/i18n';
  import { capaciteTess } from '../../../lib/stores/tess';
  import { activeView } from '../../../lib/stores/navigation';
  import {
    lireCheminTessBarre, estPure, vueTessBarre, nomEtapeBarre, resumeEtapeBarre,
  } from '../../../lib/tessBarre';
  import IconeTess from './IconeTess.svelte';

  let { signalPath, onouvrir }: { signalPath: unknown; onouvrir?: () => void } = $props();

  const tr = (k: string) => $t(k as any);
  const trn = (k: string, n: number) => $tn(k as any, n);
  const chemin = $derived($capaciteTess === 'oui' ? lireCheminTessBarre(signalPath) : null);
  const vue = $derived(chemin ? vueTessBarre(chemin, estPure(signalPath, chemin)) : null);

  function ouvrir() {
    onouvrir?.();
    activeView.set('tess');
  }
</script>

{#if chemin && vue}
  <section class="tess-barre" data-tess-barre>
    <div class="tete">
      <IconeTess taille={16} />
      {#if vue.badge}
        <span class="badge" class:bp={vue.badge === 'bit_perfect'} data-tess-badge={vue.badge}>{tr(`tess.badge.${vue.badge}`)}</span>
      {/if}
    </div>

    {#if vue.encadre.length > 0}
      <ol class="encadre" data-tess-encadre aria-label={tr('v2.nav.tess')}>
        {#each vue.encadre as e, i (`${i}:${e.code}:${e.plugin_id ?? ''}`)}
          <li class="etape" class:eteinte={e.effective !== true} data-tess-etape={e.code === 'plugin' ? e.plugin_id : e.code}>
            <span class="nom">{nomEtapeBarre(e, tr)}</span>
            {#if resumeEtapeBarre(e, chemin, tr, trn)}
              <span class="param">{resumeEtapeBarre(e, chemin, tr, trn)}</span>
            {/if}
          </li>
        {/each}
      </ol>
    {/if}

    {#if vue.horsEncadre.length > 0}
      <ul class="hors" data-tess-hors-encadre>
        {#each vue.horsEncadre as e, i (`${i}:${e.code}`)}
          <li class="etape" data-tess-etape={e.code}>
            <span class="nom">{nomEtapeBarre(e, tr)}</span>
            {#if resumeEtapeBarre(e, chemin, tr, trn)}
              <span class="param">{resumeEtapeBarre(e, chemin, tr, trn)}</span>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    <button class="ouvrir" data-tess-ouvrir onclick={ouvrir}>{tr('tess.open')}</button>
  </section>
{/if}

<style>
  .tess-barre{margin:12px 20px 0; padding:12px; border-radius:var(--v2-r-md, 10px);
    border:1px solid var(--v2-line2, rgba(255,255,255,.12)); background:var(--v2-surface2, transparent);
    display:flex; flex-direction:column; gap:8px; color:var(--v2-acc1, currentColor)}
  .tete{display:flex; align-items:center; gap:8px}
  .badge{font:700 12px var(--v2-sans, inherit); letter-spacing:.03em; padding:2px 10px; border-radius:999px;
    border:1px solid var(--v2-line2, rgba(255,255,255,.12)); color:var(--v2-txt, currentColor)}
  .badge.bp{border-color:var(--v2-ok, #3fb950); color:var(--v2-ok, #3fb950)}
  .encadre, .hors{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:4px}
  .encadre{padding:8px 10px; border-radius:8px; border:1px dashed var(--v2-acc2, currentColor)}
  .etape{display:flex; justify-content:space-between; gap:12px; font-size:13px; color:var(--v2-txt, currentColor)}
  .etape.eteinte{opacity:.55}
  .nom{font-weight:600}
  .param{color:var(--v2-txt2, inherit); text-align:right}
  .ouvrir{align-self:flex-start; height:28px; padding:0 12px; border-radius:999px; cursor:pointer;
    border:1px solid var(--v2-acc2, currentColor); background:transparent; color:var(--v2-acc1, currentColor);
    font:600 12px var(--v2-sans, inherit)}
</style>
