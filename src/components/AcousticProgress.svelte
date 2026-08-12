<script lang="ts">
  // Avancement de l'analyse acoustique.
  //
  // Une seule grandeur — une part d'un tout — donc une jauge et un nombre, pas
  // un graphique : il n'y a ni série à comparer ni évolution à lire. Le nombre
  // porte l'information, la barre porte l'ordre de grandeur (« au tiers » se
  // voit avant de se lire).
  //
  // Le dénominateur vient du serveur et vaut les pistes ANALYSABLES, pas la
  // bibliothèque : sur une discothèque contenant du DSD, une jauge calculée sur
  // le total ne serait jamais pleine.
  import { onMount, onDestroy } from 'svelte';
  import { t } from '../lib/i18n';
  import {
    acousticStatus,
    acousticProgress,
    acousticStalled,
    startAcousticPolling,
    stopAcousticPolling,
  } from '../lib/stores/acoustic';

  interface Props {
    /** Compact : une ligne, pour se glisser sous un interrupteur de réglages. */
    compact?: boolean;
  }
  let { compact = false }: Props = $props();

  // Le suivi ne tourne que tant que ce composant est à l'écran.
  onMount(() => startAcousticPolling());
  onDestroy(() => stopAcousticPolling());

  const nf = new Intl.NumberFormat('fr');
</script>

{#if $acousticStalled}
  <!-- Activée mais hors d'état de tourner. Une barre à 0 % ferait croire à une
       analyse qui piétine ; ici rien ne démarrera tant que le modèle n'est pas
       là, et le dire vaut mieux que de l'afficher. -->
  <p class="acx-stalled">{$t('acoustic.noModel')}</p>
{:else if $acousticStatus?.enabled && $acousticProgress}
  <div class="acx" class:compact>
    <div class="acx-head">
      <span class="acx-label">
        {#if $acousticProgress.complete}
          {$t('acoustic.done')}
        {:else}
          {$t('acoustic.inProgress')}
        {/if}
      </span>
      <!-- Le pourcentage porte le chiffre ; il reste en encre de texte, jamais
           en couleur de série. -->
      <span class="acx-pct">{$acousticProgress.percent}&nbsp;%</span>
    </div>

    <div
      class="acx-track"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={$acousticProgress.total}
      aria-valuenow={$acousticProgress.done}
      aria-label={$t('acoustic.inProgress')}
    >
      <div class="acx-fill" class:complete={$acousticProgress.complete} style="width: {$acousticProgress.percent}%"></div>
    </div>

    <div class="acx-sub">
      {nf.format($acousticProgress.done)} / {nf.format($acousticProgress.total)} {$t('acoustic.tracks')}
      {#if !$acousticProgress.complete}
        · {nf.format($acousticProgress.remaining)} {$t('acoustic.remaining')}
      {/if}
    </div>
  </div>
{/if}

<style>
  .acx { display: flex; flex-direction: column; gap: 6px; }
  .acx-head { display: flex; align-items: baseline; gap: 8px; }
  .acx-label { font-size: 12px; color: var(--tune-text-secondary); }
  /* Chiffres tabulaires : sans ça, la valeur danse à chaque rafraîchissement. */
  .acx-pct { margin-left: auto; font-size: 12px; font-weight: 600; color: var(--tune-text); font-variant-numeric: tabular-nums; }
  .acx-track {
    height: 6px;
    border-radius: 3px;
    background: var(--tune-surface-hover);
    overflow: hidden;
  }
  .acx-fill {
    height: 100%;
    /* Extrémité arrondie côté valeur, ancrée à l'origine : la barre se lit
       comme une progression, pas comme un bloc. */
    border-radius: 0 3px 3px 0;
    background: var(--tune-accent);
    transition: width 0.4s ease;
  }
  /* Terminé = un état, pas une série : il change de couleur ET de libellé. */
  .acx-fill.complete { background: var(--tune-success); border-radius: 3px; }
  .acx-sub { font-size: 11px; color: var(--tune-text-muted); font-variant-numeric: tabular-nums; }
  .acx-stalled { margin: 0; font-size: 12.5px; color: var(--tune-text-secondary); line-height: 1.5; }
  .compact .acx-sub { font-size: 10.5px; }
</style>
