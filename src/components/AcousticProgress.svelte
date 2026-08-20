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
    acousticPausedReason,
    acousticModelError,
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
  <!--
    ...et POURQUOI il n'est pas là. « Modèle absent » confondait « jamais
    tenté », « en cours de téléchargement » et « en échec » : les trois
    donnaient le même écran, et l'utilisateur allait chercher la panne du côté
    de sa connexion (#1658) ou concluait à une jauge bloquée (#1512).

    Le serveur répond `model_fetch` depuis le 15/08 (#1765). Personne ne le
    lisait — la correction serveur avait été écrite pour tuer ce symptôme, et
    le symptôme était intact.
  -->
  {#if $acousticModelError}
    <p class="acx-model-error">
      {$t('acoustic.modelFetchFailed')
        .replace('{attempts}', String($acousticModelError.tentatives))}
      <span class="acx-model-cause">{$acousticModelError.message}</span>
    </p>
  {/if}
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

    <!--
      POURQUOI la jauge ne bouge pas.

      C'est le même défaut que la ligne au-dessus, un cran plus haut : une passe
      EN PAUSE et une passe CASSÉE donnaient exactement le même écran — barre
      immobile, rien qui bouge. Bilou a ouvert un fil sur une analyse « qui ne
      démarre pas » (#1457) alors qu'elle cédait simplement le passage à sa
      musique, ce qui est le comportement voulu.

      Le serveur nomme la raison depuis le 18/08 (#1866/#1915) et aucun client
      ne la lisait. Deux jours plus tard, le fil #1939 — « Enrichissement et
      CLAP Bloqués ? » — repose la question à laquelle le serveur répondait
      déjà.

      Teinte d'information et non d'avertissement : céder le passage à la
      lecture n'est pas un incident, c'est ce qu'on lui demande de faire.
    -->
    {#if $acousticPausedReason}
      <div class="acx-paused">
        {$acousticPausedReason.cle
          ? $t($acousticPausedReason.cle as any)
          : $t('acoustic.pausedUnknown').replace('{reason}', $acousticPausedReason.raison)}
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
  /* Information, pas avertissement : céder le passage à la lecture est ce qu'on
     demande à cette passe de faire. La colorer en orange ferait passer un
     fonctionnement normal pour un incident — l'erreur exactement inverse de
     celle qu'on corrige. */
  .acx-paused { font-size: 11px; color: var(--tune-text-secondary); }
  .compact .acx-paused { font-size: 10.5px; }
  /* Là en revanche c'est un échec, et il porte sa cause. La cause vient du
     réseau ou du disque : elle est technique, donc en retrait et en petit,
     mais présente — c'est elle qu'un testeur recopie dans un fil. */
  .acx-model-error { margin: 4px 0 0; font-size: 12px; color: var(--tune-danger, #d1242f); line-height: 1.45; }
  .acx-model-cause { display: block; font-size: 11px; color: var(--tune-text-muted); word-break: break-word; }
  .acx-stalled { margin: 0; font-size: 12.5px; color: var(--tune-text-secondary); line-height: 1.5; }
  .compact .acx-sub { font-size: 10.5px; }
</style>
