<script lang="ts">
  /**
   * La bascule d'affichage — LE bouton, extrait de `LibraryV2.svelte`.
   *
   * web#1719 : FabienM demande « l'icone affichage grille » des Favoris
   * (Albums, Playlists) et du Gestionnaire de playlists. Elle n'existait que
   * dans la Bibliothèque, écrite en clair dans son gabarit (#929).
   *
   * 🔴 RECOPIER ce bouton dans trois écrans aurait donné quatre définitions du
   * même geste : l'icône, le libellé, la rotation des modes et les pastilles.
   * C'est le défaut que ce dépôt paie le plus souvent — deux définitions d'un
   * même geste finissent par diverger. Le bouton est donc DÉPLACÉ ici, et la
   * Bibliothèque l'emploie comme les autres. Son dessin, sa taille et ses
   * classes (`viewtog`, `vpts`) sont ceux de #929, au caractère près.
   *
   * ## Ce que le bouton dit
   *
   * - L'ICÔNE et le LIBELLÉ annoncent la DESTINATION — le mode où le clic
   *   mène. C'est la convention de ce bouton depuis qu'il existe.
   * - `data-vue` et les PASTILLES portent le mode COURANT : c'est ce qui rend
   *   un troisième cran atteignable sans inventer un second bouton, et c'est ce
   *   que lisent les témoins.
   *
   * ## Ce qu'il ne fait pas
   *
   * Il ne LIT ni n'ÉCRIT aucune préférence. L'écran qui le monte tient son
   * état et le confie à `lib/preferencesEcran` sous SA clé : un même bouton,
   * mais un choix par écran — la Bibliothèque en grille et les Favoris en
   * liste est une combinaison légitime.
   */
  import { t } from '../../lib/i18n';
  import { affichageSuivant, LIBELLE_AFFICHAGE, type Affichage } from '../../lib/affichage';

  interface Props {
    /** Les crans offerts, dans l'ordre de rotation. Deux au minimum. */
    modes: readonly Affichage[];
    /** Le mode COURANT. */
    valeur: Affichage;
    /** Appelé avec le mode SUIVANT. L'écran décide quoi en faire. */
    onChanger: (v: Affichage) => void;
  }
  let { modes, valeur, onChanger }: Props = $props();

  const suivant = $derived(affichageSuivant(modes, valeur));
</script>

<button class="viewtog" data-vue={valeur} onclick={() => onChanger(suivant)}
  aria-label={$t(LIBELLE_AFFICHAGE[suivant] as any)}
  title={$t(LIBELLE_AFFICHAGE[suivant] as any)}>
  <!-- L'icône est celle de la DESTINATION (`suivant`), comme le libellé.
       Elle se lisait sur `valeur`, en supposant la rotation de la
       Bibliothèque (grille → liste → carrousel) : sur un écran à deux crans,
       la liste montrait le carrousel pour mener à la grille. Pour la
       Bibliothèque, rien ne change. -->
  {#if suivant === 'list'}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
  {:else if suivant === 'bigGrid'}
    <!-- web#1801 — deux grandes vignettes, chacune avec sa ligne de titre. -->
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2.5" y="3" width="8.5" height="12"/><rect x="13" y="3" width="8.5" height="12"/><path d="M2.5 19.5h8.5M13 19.5h8.5"/></svg>
  {:else if suivant === 'carousel'}
    <!-- Trois pochettes de front, celle du milieu en avant : le geste du
         carrousel, sans promettre une troisième dimension qu'on ne rend pas. -->
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="4" height="10"/><rect x="8.5" y="4" width="7" height="16"/><rect x="18" y="7" width="4" height="10"/></svg>
  {:else}
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
  {/if}
  <!--
    #929 — LA BASCULE DIT OÙ L'ON EST.

    Sur sa capture, Bertrand ne voyait qu'une icône de grille isolée : rien
    n'indiquait le mode courant ni qu'il existât un troisième cran. Une
    pastille par cran, allumée sur le mode courant, ajoute le repère manquant
    sans toucher au contrôle.

    `aria-hidden` : le libellé du bouton dit déjà tout à un lecteur d'écran, et
    des puces vides n'y ajouteraient que du bruit.
  -->
  <span class="vpts" aria-hidden="true">
    {#each modes as m (m)}<i class:on={m === valeur}></i>{/each}
  </span>
</button>

<style>
  /* Le style de #929, déplacé avec le bouton. `LibraryV2` garde sa propre
     règle `.viewtog` : le bouton de re-tirage (#4558) la partage, et le style
     scopé de Svelte ne traverse pas le composant. */
  .viewtog{width:38px; height:38px; flex:0 0 auto; border-radius:10px; cursor:pointer;
    border:1px solid var(--v2-line2); background:transparent; color:var(--v2-txt2);
    display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px}
  .viewtog:hover{color:var(--v2-txt); border-color:var(--v2-acc2)}
  .viewtog svg{width:16px; height:16px}
  /* #929 — une pastille par cran, allumée sur le mode courant. Le bouton
     empile icone puis pastilles : 16 + 3 + 4 = 23 px dans une boite de 38. */
  .vpts{display:flex; gap:3px}
  .vpts i{width:4px; height:4px; border-radius:50%; background:var(--v2-line2)}
  .vpts i.on{background:var(--v2-acc1)}
</style>
