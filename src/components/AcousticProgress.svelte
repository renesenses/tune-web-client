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

    <!--
      Les pistes traitées SANS empreinte : un fichier que le décodeur refuse.
      Elles comptent dans le numérateur, donc la jauge atteint bien 100 % — mais
      sans cette ligne, l'utilisateur qui compare le compte de sa bibliothèque à
      celui de l'analyse trouve un écart que rien n'explique, et en conclut que
      l'analyse est bloquée. C'est exactement ce qui s'est passé : trois fils
      forum, et un testeur qui a redémarré son serveur plusieurs fois pour un
      état parfaitement normal.

      Le magasin calcule `failed` depuis #1819 et le commentaire qui l'accompagne
      demandait déjà cet affichage — « l'écran doit pouvoir les NOMMER ». Il n'a
      jamais été écrit : c'est la moitié restée sur le quai.

      Affiché seulement s'il y en a, et en teinte d'avertissement plutôt que
      d'erreur : ce n'est pas une panne, c'est un reste normal sur une grande
      bibliothèque.
    -->
    {#if $acousticProgress.failed > 0}
      <div class="acx-failed">
        {$t('acoustic.failedTracks').replace('{count}', nf.format($acousticProgress.failed))}
      </div>
    {/if}
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
  /* Teinte d'avertissement, pas d'erreur : sur une grande bibliothèque, quelques
     fichiers que le décodeur refuse sont un reste normal. Ce qui n'était pas
     normal, c'est de ne pas le dire. */
  .acx-failed { font-size: 11px; color: var(--tune-warning, #d29922); font-variant-numeric: tabular-nums; }
  .compact .acx-failed { font-size: 10.5px; }
  .acx-stalled { margin: 0; font-size: 12.5px; color: var(--tune-text-secondary); line-height: 1.5; }
  .compact .acx-sub { font-size: 10.5px; }
</style>
