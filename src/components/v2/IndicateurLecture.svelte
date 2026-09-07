<script lang="ts">
  /**
   * « C'est CELLE-CI qui joue » — le repère posé sur une ligne de liste (#1845).
   *
   * Demandé sur le forum par Didier (fil 1451, 16/08/2026) : « un indicateur sur
   * le titre en cours de lecture sur la vue d'un album sans avoir à passer dans
   * la vue lecture en cours ». Le client ACTUEL le fait depuis la v0.9.93
   * (`LibraryView`), le nouveau ne le faisait qu'à moitié : une couleur d'accent
   * sur le titre, et rien d'autre.
   *
   * ## Pourquoi une couleur ne suffit pas
   *
   * Une couleur seule est invisible pour qui ne la distingue pas — un
   * daltonisme rouge-vert touche environ un homme sur douze — et elle disparaît
   * au survol, là où la ligne prend son propre fond. Elle ne dit rien non plus
   * à un lecteur d'écran.
   *
   * Ici : une ICÔNE, un LIBELLÉ porté par `aria-label` et par l'infobulle, et
   * la couleur en plus. Trois canaux, pas un.
   *
   * ## Trois états, pas deux
   *
   * Une piste en PAUSE reste la piste en cours — c'est même l'état dans lequel
   * on cherche le plus « où j'en étais ». Elle ne peut pas porter le même signe
   * qu'une piste qui joue : le repère mentirait. Et une zone à l'ARRÊT pointe
   * encore sur sa piste sans la jouer. D'où trois formes distinctes, et trois
   * libellés — voir `etatDeLaLigne`, qui tranche.
   *
   * ## L'animation
   *
   * Les trois barres montent et descendent pendant la lecture, et se figent en
   * pause : c'est le mouvement qui distingue les deux d'un coup d'œil, avant
   * même de lire la forme. `prefers-reduced-motion` l'arrête — un égaliseur qui
   * s'agite sur chaque écran est exactement ce que ce réglage demande de taire.
   */
  import { t } from '../../lib/i18n';
  import type { EtatLigne } from '../../lib/stores/nowPlaying';
  interface Props {
    /** `null` = cette ligne n'est pas la lecture en cours : rien n'est rendu. */
    etat?: EtatLigne;
  }
  let { etat = null }: Props = $props();
  /**
   * Les clés sont appelées LITTÉRALEMENT, une par branche, et non lues dans une
   * table. `check-i18n.mjs` ne voit que `$t('…')` écrit en clair : rangées dans
   * un objet, ces trois clés ne seraient vérifiées par personne, et une faute de
   * frappe s'afficherait telle quelle à l'écran.
   */
  const libelle = $derived(
    etat === 'lecture' ? $t('v2.piste.enLecture' as any)
      : etat === 'pause' ? $t('v2.piste.enPause' as any)
        : etat === 'arret' ? $t('v2.piste.arretee' as any)
          : '',
  );
</script>
{#if etat}
  <span class="il" class:joue={etat === 'lecture'} role="img"
    title={libelle} aria-label={libelle}>
    {#if etat === 'arret'}
      <!-- Un carré plein : l'arrêt, la même forme que sur tous les transports. -->
      <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
        <rect x="2.5" y="2.5" width="7" height="7" rx="1.2" />
      </svg>
    {:else}
      <!-- Trois barres d'égaliseur. Elles montent en lecture, restent basses et
           régulières en pause : deux images nettement différentes même à
           l'arrêt de l'animation. -->
      <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
        <rect class="b b1" x="1" y="3" width="2.6" height="6" rx="1.1" />
        <rect class="b b2" x="4.7" y="3" width="2.6" height="6" rx="1.1" />
        <rect class="b b3" x="8.4" y="3" width="2.6" height="6" rx="1.1" />
      </svg>
    {/if}
  </span>
{/if}
<style>
  .il{display:inline-flex; align-items:center; justify-content:center;
    flex:0 0 auto; width:14px; height:14px; color:var(--v2-acc1)}
  .il svg{width:12px; height:12px; display:block}
  /* En PAUSE, les barres sont courtes et égales — une forme stable, qui ne
     ressemble pas à un instantané de l'animation. */
  .b{transform-box:fill-box; transform-origin:center; transform:scaleY(.45)}
  .joue .b{animation:eq .9s ease-in-out infinite}
  .joue .b2{animation-delay:.3s}
  .joue .b3{animation-delay:.15s}
  @keyframes eq{
    0%,100%{transform:scaleY(.35)}
    50%{transform:scaleY(1)}
  }
  @media (prefers-reduced-motion: reduce){
    .joue .b{animation:none; transform:scaleY(1)}
  }
</style>
